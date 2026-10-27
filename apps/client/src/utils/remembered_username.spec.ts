import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearRememberedUsername,
  getRememberedUsername,
  isLikelyStudentId,
  saveRememberedUsername
} from './remembered_username.js'

const createStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    snapshot: () => Object.fromEntries(store)
  }
}

describe('remembered_username（hbu_username 收拢读写）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('保存/读取 9 位研究生与 10 位本科生学号，空值等价于清除', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    expect(getRememberedUsername()).toBe('')
    saveRememberedUsername('251023106')
    expect(getRememberedUsername()).toBe('251023106')
    expect(storage.snapshot()['hbu_username']).toBe('251023106')

    saveRememberedUsername('2510231106')
    expect(getRememberedUsername()).toBe('2510231106')
    expect(storage.snapshot()['hbu_username']).toBe('2510231106')

    saveRememberedUsername('   ')
    expect(getRememberedUsername()).toBe('')
    expect(storage.snapshot()['hbu_username']).toBeUndefined()
  })

  it('8 位教师工号以确认的 teacher 角色保存并可冷启读取；学生验证不放宽', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)
    expect(saveRememberedUsername(' 20000000 ', 'teacher')).toBe('20000000')
    expect(getRememberedUsername()).toBe('20000000')
    expect(storage.snapshot()['hbu_username_role']).toBe('teacher')
    expect(isLikelyStudentId('20000000')).toBe(false)
    // 用户在登录页切换入口不会覆盖认证账号角色。
    storage.setItem('hbu_login_role', 'student')
    expect(getRememberedUsername()).toBe('20000000')
  })

  it('八位工号没有认证角色时不得作为学生账号恢复；跨角色切换隔离', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)
    expect(saveRememberedUsername('20000000')).toBe('')
    expect(storage.snapshot()['hbu_username']).toBeUndefined()
    storage.setItem('hbu_username', '20000000')
    expect(getRememberedUsername()).toBe('')
    saveRememberedUsername('20000000', 'teacher')
    saveRememberedUsername('2510231106', 'student')
    expect(getRememberedUsername()).toBe('2510231106')
    expect(storage.snapshot()['hbu_username_role']).toBe('student')
  })

  it('清除函数移除存储键', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    saveRememberedUsername('2510231106')
    clearRememberedUsername()
    expect(storage.snapshot()['hbu_username']).toBeUndefined()
    expect(getRememberedUsername()).toBe('')
  })

  it('拒绝把非学号自由文本写入 hbu_username', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    saveRememberedUsername('  some-legacy-value  ')
    expect(getRememberedUsername()).toBe('')
    expect(storage.snapshot()['hbu_username']).toBeUndefined()
    expect(isLikelyStudentId('some-legacy-value')).toBe(false)
  })

  it('读取旧的非学号缓存时主动清理', () => {
    const storage = createStorage()
    storage.setItem('hbu_username', 'legacy-password-shaped-value')
    vi.stubGlobal('localStorage', storage)

    expect(getRememberedUsername()).toBe('')
    expect(storage.snapshot()['hbu_username']).toBeUndefined()
  })

  it('isLikelyStudentId 只识别 9 或 10 位纯数字学号', () => {
    expect(isLikelyStudentId('251023106')).toBe(true)
    expect(isLikelyStudentId('2510231106')).toBe(true)
    expect(isLikelyStudentId(' 2510231106 ')).toBe(true)
    expect(isLikelyStudentId('25102310')).toBe(false)
    expect(isLikelyStudentId('25102311061')).toBe(false)
    expect(isLikelyStudentId('abc')).toBe(false)
    expect(isLikelyStudentId('')).toBe(false)
    expect(isLikelyStudentId(null)).toBe(false)
  })

  it('localStorage 不可用时安全降级（不抛异常）', () => {
    vi.stubGlobal('localStorage', undefined)

    expect(getRememberedUsername()).toBe('')
    expect(saveRememberedUsername('2510231106')).toBe('2510231106')
    expect(() => clearRememberedUsername()).not.toThrow()
  })

  it('localStorage 抛异常时安全降级', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      }
    })

    expect(getRememberedUsername()).toBe('')
    expect(saveRememberedUsername('2510231106')).toBe('2510231106')
    expect(() => clearRememberedUsername()).not.toThrow()
  })
})
