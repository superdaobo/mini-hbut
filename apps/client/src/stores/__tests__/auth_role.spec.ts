import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../auth'

const createStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    snapshot: () => Object.fromEntries(store)
  }
}

let storage: ReturnType<typeof createStorage>

beforeEach(() => {
  storage = createStorage()
  vi.stubGlobal('localStorage', storage)
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth store：登录身份（学生 / 教师）', () => {
  it('默认学生身份', () => {
    const store = useAuthStore()
    expect(store.role).toBe('student')
    expect(store.isTeacher).toBe(false)
  })

  it('setRole 写入身份并落盘（供下次冷启动先按正确身份渲染）', () => {
    const store = useAuthStore()

    store.setRole('teacher')
    expect(store.role).toBe('teacher')
    expect(store.isTeacher).toBe(true)
    expect(storage.snapshot()['hbu_login_role']).toBe('teacher')

    // 非教师值一律回落学生，避免脏值长期滞留
    store.setRole('js')
    expect(store.role).toBe('student')
    expect(store.isTeacher).toBe(false)
  })

  it('establishSession 可携带身份；缺省时不影响既有调用方', () => {
    const store = useAuthStore()

    store.establishSession({ studentId: '2510231106', userUuid: 'u1', role: 'teacher' })
    expect(store.studentId).toBe('2510231106')
    expect(store.role).toBe('teacher')

    // 旧调用方不传 role：不得把已识别的教师身份重置掉
    store.establishSession({ studentId: '2024000000' })
    expect(store.role).toBe('teacher')

    // 显式传空串同样视为「未提供」
    store.hydrate({ studentId: '2024000000', role: '' })
    expect(store.role).toBe('teacher')
  })

  it('hydrate 无身份时保持当前值（旧缓存 / 旧后端兼容）', () => {
    const store = useAuthStore()
    store.setRole('teacher')
    store.hydrate({ studentId: '2024000000' })
    expect(store.role).toBe('teacher')
  })

  it('登出回到学生端默认形态并清除本地角色', () => {
    const store = useAuthStore()
    store.setRole('teacher')
    store.establishSession({ studentId: '2024000000' })

    store.clearSession()
    expect(store.role).toBe('student')
    expect(store.isTeacher).toBe(false)
    expect(storage.snapshot()['hbu_login_role']).toBeUndefined()
  })

  it('冷启动从本地缓存恢复教师身份', () => {
    storage.setItem('hbu_login_role', 'teacher')
    setActivePinia(createPinia())

    const store = useAuthStore()
    expect(store.role).toBe('teacher')
    expect(store.isTeacher).toBe(true)
  })
})
