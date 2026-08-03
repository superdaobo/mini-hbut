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

  it('保存/读取 10 位学号，空值等价于清除', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    expect(getRememberedUsername()).toBe('')
    saveRememberedUsername('2510231106')
    expect(getRememberedUsername()).toBe('2510231106')
    expect(storage.snapshot()['hbu_username']).toBe('2510231106')

    saveRememberedUsername('   ')
    expect(getRememberedUsername()).toBe('')
    expect(storage.snapshot()['hbu_username']).toBeUndefined()
  })

  it('清除函数移除存储键', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    saveRememberedUsername('2510231106')
    clearRememberedUsername()
    expect(storage.snapshot()['hbu_username']).toBeUndefined()
    expect(getRememberedUsername()).toBe('')
  })

  it('保留任意文本值，不做截断（避免破坏登录兼容语义）', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    saveRememberedUsername('  some-legacy-value  ')
    expect(getRememberedUsername()).toBe('some-legacy-value')
    expect(isLikelyStudentId('some-legacy-value')).toBe(false)
  })

  it('isLikelyStudentId 只识别 10 位纯数字学号', () => {
    expect(isLikelyStudentId('2510231106')).toBe(true)
    expect(isLikelyStudentId(' 2510231106 ')).toBe(true)
    expect(isLikelyStudentId('251023110')).toBe(false)
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
