import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOGIN_FORM_ACCOUNT_KEY,
  LOGIN_ROLE_KEY,
  clearLoginRole,
  isTeacherRoleValue,
  loginFormAccountKey,
  normalizeLoginRole,
  readLoginFormAccount,
  readLoginRole,
  writeLoginFormAccount,
  writeLoginRole
} from './login_role.js'

const createStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    snapshot: () => Object.fromEntries(store)
  }
}

describe('login_role（登录身份本地事实源）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('只有 teacher 视为教师，其余一律学生', () => {
    expect(normalizeLoginRole('teacher')).toBe('teacher')
    expect(normalizeLoginRole('  TEACHER  ')).toBe('teacher')
    expect(normalizeLoginRole('student')).toBe('student')
    expect(normalizeLoginRole('')).toBe('student')
    expect(normalizeLoginRole(null)).toBe('student')
    expect(normalizeLoginRole(undefined)).toBe('student')
    // 历史/异常值不得被当作教师
    expect(normalizeLoginRole('js')).toBe('student')
    expect(normalizeLoginRole('教师')).toBe('student')
    expect(isTeacherRoleValue('teacher')).toBe(true)
    expect(isTeacherRoleValue('js')).toBe(false)
  })

  it('写入后可读回，且落盘到 hbu_login_role', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    expect(readLoginRole()).toBe('student')
    expect(writeLoginRole('teacher')).toBe('teacher')
    expect(storage.snapshot()[LOGIN_ROLE_KEY]).toBe('teacher')
    expect(readLoginRole()).toBe('teacher')

    // 非教师值写回学生，避免脏值长期滞留
    expect(writeLoginRole('weird')).toBe('student')
    expect(readLoginRole()).toBe('student')
  })

  it('清除后回到学生端默认形态', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    writeLoginRole('teacher')
    clearLoginRole()
    expect(storage.snapshot()[LOGIN_ROLE_KEY]).toBeUndefined()
    expect(readLoginRole()).toBe('student')
  })

  it('localStorage 不可用或抛异常时安全降级为学生', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readLoginRole()).toBe('student')
    expect(writeLoginRole('teacher')).toBe('teacher')
    expect(() => clearLoginRole()).not.toThrow()

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
    expect(readLoginRole()).toBe('student')
    expect(writeLoginRole('teacher')).toBe('teacher')
    expect(() => clearLoginRole()).not.toThrow()
  })
})

/**
 * 回归护栏：学生端与教师端的登录表单**不得共用**「上次使用的账号」。
 *
 * 线上现象：学生保存的账号密码，退出后切到教师端入口仍出现在输入框里。
 * 根因是表单预填读的是全局键 `hbu_username`，与身份无关。
 */
describe('login_role（登录表单账号按身份隔离）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('两个身份写入各自独立的键', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    writeLoginFormAccount('student', '2510231106')
    writeLoginFormAccount('teacher', '2024000000')

    expect(storage.snapshot()[LOGIN_FORM_ACCOUNT_KEY]).toBe('2510231106')
    expect(storage.snapshot()[`${LOGIN_FORM_ACCOUNT_KEY}_teacher`]).toBe('2024000000')
    expect(loginFormAccountKey('student')).toBe(LOGIN_FORM_ACCOUNT_KEY)
    expect(loginFormAccountKey('teacher')).toBe(`${LOGIN_FORM_ACCOUNT_KEY}_teacher`)
  })

  it('教师端绝不回落到 hbu_username —— 这正是串号的根因', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)
    // 学生上次登录留下的全局键
    storage.setItem('hbu_username', '2510231106')

    expect(readLoginFormAccount('teacher')).toBe('')
    // 学生端则按既有行为回落（老用户升级后表单不变空）
    expect(readLoginFormAccount('student')).toBe('2510231106')
  })

  it('两个身份各自读回自己的账号，互不串味', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    writeLoginFormAccount('student', '2510231106')
    writeLoginFormAccount('teacher', '2024000000')

    expect(readLoginFormAccount('student')).toBe('2510231106')
    expect(readLoginFormAccount('teacher')).toBe('2024000000')
  })

  it('学生端新键优先于旧键 hbu_username', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('hbu_username', 'old-student')
    writeLoginFormAccount('student', '2510231106')

    expect(readLoginFormAccount('student')).toBe('2510231106')
  })

  it('空账号不写入，避免把有效记忆清成空串', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    writeLoginFormAccount('teacher', '2024000000')
    writeLoginFormAccount('teacher', '   ')
    writeLoginFormAccount('teacher', null)

    expect(readLoginFormAccount('teacher')).toBe('2024000000')
  })

  it('localStorage 不可用时安全降级', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readLoginFormAccount('teacher')).toBe('')
    expect(readLoginFormAccount('student')).toBe('')
    expect(() => writeLoginFormAccount('teacher', '2024000000')).not.toThrow()
  })
})
