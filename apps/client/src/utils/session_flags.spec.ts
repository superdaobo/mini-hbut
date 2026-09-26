import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isTemporaryLoginSession } from './session_flags'

/** 与 forum_cache.spec 一致：node 环境下手动安装 localStorage */
const installStorage = () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size
    }
  })
  return storage
}

describe('isTemporaryLoginSession (#898)', () => {
  beforeEach(() => {
    installStorage()
  })

  it('识别扫码临时登录方式后缀', () => {
    localStorage.setItem('hbu_login_method', 'portal_qr_temp')
    expect(isTemporaryLoginSession()).toBe(true)

    localStorage.setItem('hbu_login_method', 'chaoxing_qr_temp')
    expect(isTemporaryLoginSession()).toBe(true)
  })

  it('识别显式临时会话标记', () => {
    localStorage.setItem('hbu_login_temporary', '1')
    expect(isTemporaryLoginSession()).toBe(true)
  })

  it('正式登录方式判定为非临时会话', () => {
    localStorage.setItem('hbu_login_method', 'portal')
    localStorage.setItem('hbu_login_temporary', '0')
    expect(isTemporaryLoginSession()).toBe(false)

    localStorage.setItem('hbu_login_method', 'chaoxing')
    expect(isTemporaryLoginSession()).toBe(false)
  })

  it('空登录方式判定为非临时会话', () => {
    expect(isTemporaryLoginSession()).toBe(false)
  })

  it('存储不可用时按正式会话处理（不误退回登录页）', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      }
    })
    expect(isTemporaryLoginSession()).toBe(false)
  })
})
