// #629：identity_access_token 单元测试（内存缓存 / 单次 refresh / provider 注入）
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearIdentityAccessToken,
  getIdentityAccessToken,
  hasIdentityAccessTokenProvider,
  setIdentityAccessTokenProvider,
  type IdentityAccessTokenProvider
} from './identity_access_token'

const makeProvider = (overrides: Partial<IdentityAccessTokenProvider> = {}): IdentityAccessTokenProvider => ({
  getAccessToken: vi.fn(async () => null),
  refreshAccessToken: vi.fn(async () => null),
  ...overrides
})

afterEach(() => {
  setIdentityAccessTokenProvider(null)
})

describe('identity access token provider', () => {
  it('returns null when no provider is configured', async () => {
    expect(hasIdentityAccessTokenProvider()).toBe(false)
    expect(await getIdentityAccessToken()).toBeNull()
    expect(await getIdentityAccessToken(true)).toBeNull()
  })

  it('returns token from provider and caches in memory', async () => {
    const provider = makeProvider({ getAccessToken: vi.fn(async () => 'jwt-token') })
    setIdentityAccessTokenProvider(provider)
    expect(hasIdentityAccessTokenProvider()).toBe(true)
    expect(await getIdentityAccessToken()).toBe('jwt-token')
    // 第二次不重复调用 provider（内存缓存）
    expect(await getIdentityAccessToken()).toBe('jwt-token')
    expect(provider.getAccessToken).toHaveBeenCalledTimes(1)
  })

  it('never falls back to legacy after provider returns null', async () => {
    const provider = makeProvider({ getAccessToken: vi.fn(async () => null) })
    setIdentityAccessTokenProvider(provider)
    expect(await getIdentityAccessToken()).toBeNull()
  })

  it('refresh on forceRefresh calls provider refresh exactly once for concurrent callers', async () => {
    const provider = makeProvider({
      getAccessToken: vi.fn(async () => 'first-token'),
      refreshAccessToken: vi.fn(async () => 'second-token')
    })
    setIdentityAccessTokenProvider(provider)
    expect(await getIdentityAccessToken()).toBe('first-token')
    // 并发 401：共享同一轮 refresh，只触发一次 refreshAccessToken
    const [a, b] = await Promise.all([getIdentityAccessToken(true), getIdentityAccessToken(true)])
    expect(a).toBe('second-token')
    expect(b).toBe('second-token')
    expect(provider.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('clears memory token when provider is swapped', async () => {
    const first = makeProvider({ getAccessToken: vi.fn(async () => 'token-a') })
    setIdentityAccessTokenProvider(first)
    expect(await getIdentityAccessToken()).toBe('token-a')
    const second = makeProvider({ getAccessToken: vi.fn(async () => 'token-b') })
    setIdentityAccessTokenProvider(second)
    // 换 provider 后不再复用旧 token
    expect(await getIdentityAccessToken()).toBe('token-b')
    expect(second.getAccessToken).toHaveBeenCalledTimes(1)
  })

  it('does not cache empty strings', async () => {
    const provider = makeProvider({
      getAccessToken: vi.fn(async () => '   '),
      refreshAccessToken: vi.fn(async () => '')
    })
    setIdentityAccessTokenProvider(provider)
    expect(await getIdentityAccessToken()).toBeNull()
  })

  it('clearIdentityAccessToken drops in-flight refresh guard', async () => {
    // 对象 holder：避免 TS 对闭包赋值变量的 never 推断
    const holder: { resolve: ((value: string | null) => void) | null } = { resolve: null }
    const pendingPromise = new Promise<string | null>((resolve) => {
      holder.resolve = resolve
    })
    const provider = makeProvider({
      refreshAccessToken: vi.fn(() => pendingPromise)
    })
    setIdentityAccessTokenProvider(provider)
    const pending = getIdentityAccessToken(true)
    clearIdentityAccessToken()
    holder.resolve?.('late-token')
    expect(await pending).toBe('late-token')
    // 清空后下一次重新走 provider
    expect(await getIdentityAccessToken()).toBeNull()
  })
})
