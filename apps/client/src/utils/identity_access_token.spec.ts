// #629 / #1171 T13：identity_access_token 单元测试（内存缓存 / 单次 refresh / provider 注入 /
// 原子替换 / 单飞 / 刷新失败无半状态）
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearIdentityAccessToken,
  getIdentityAccessToken,
  hasIdentityAccessTokenProvider,
  peekIdentityAccessToken,
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

  // ── #1171 T13：单飞 + 原子替换 + 刷新失败无半状态 ─────────────────────────────

  it('并发 5 个刷新请求只触发 1 次 provider 刷新（single-flight）', async () => {
    const provider = makeProvider({
      // 延迟 resolve：确保 5 个调用都落在同一在途窗口内
      refreshAccessToken: vi.fn(
        () => new Promise<string | null>((resolve) => setTimeout(() => resolve('refreshed'), 20))
      )
    })
    setIdentityAccessTokenProvider(provider)
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => getIdentityAccessToken(true))
    )
    expect(results).toEqual(['refreshed', 'refreshed', 'refreshed', 'refreshed', 'refreshed'])
    expect(provider.refreshAccessToken).toHaveBeenCalledTimes(1)
    // 刷新成功后新令牌原子入缓存
    expect(peekIdentityAccessToken()).toBe('refreshed')
  })

  it('刷新成功后原子替换：所有并发读取方拿到新令牌，无旧/新混合中间态', async () => {
    const provider = makeProvider({
      getAccessToken: vi.fn(async () => 'old-token'),
      refreshAccessToken: vi.fn(async () => 'new-token')
    })
    setIdentityAccessTokenProvider(provider)
    expect(await getIdentityAccessToken()).toBe('old-token')
    // 并发：刷新 + 普通 get + 第二个刷新 —— 普通 get 等待刷新结果（不返回刷新中的旧令牌）
    const results = await Promise.all([
      getIdentityAccessToken(true),
      getIdentityAccessToken(),
      getIdentityAccessToken(true)
    ])
    expect(results).toEqual(['new-token', 'new-token', 'new-token'])
    // 只刷新一次；替换后缓存为且仅为新令牌
    expect(provider.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(peekIdentityAccessToken()).toBe('new-token')
  })

  it('刷新失败 → 令牌状态保持原样（无半更新）：旧令牌原样保留，本次返回 null', async () => {
    const provider = makeProvider({
      getAccessToken: vi.fn(async () => 'old-token'),
      refreshAccessToken: vi.fn(async () => null)
    })
    setIdentityAccessTokenProvider(provider)
    expect(await getIdentityAccessToken()).toBe('old-token')
    // 并发 401 触发刷新 → 失败（null）
    const [a, b] = await Promise.all([getIdentityAccessToken(true), getIdentityAccessToken(true)])
    expect(a).toBeNull()
    expect(b).toBeNull()
    // 状态保持原样：旧令牌未被清掉、也未被半更新（仍是完整旧令牌）
    expect(peekIdentityAccessToken()).toBe('old-token')
    expect(await getIdentityAccessToken()).toBe('old-token')
    // 回退读取走缓存，不额外调用 provider.get
    expect(provider.getAccessToken).toHaveBeenCalledTimes(1)
  })

  it('刷新失败（空串返回）同样不写状态：无半更新', async () => {
    const provider = makeProvider({
      getAccessToken: vi.fn(async () => 'old-token'),
      refreshAccessToken: vi.fn(async () => '   ')
    })
    setIdentityAccessTokenProvider(provider)
    expect(await getIdentityAccessToken()).toBe('old-token')
    expect(await getIdentityAccessToken(true)).toBeNull()
    expect(peekIdentityAccessToken()).toBe('old-token')
  })

  it('登出清空（clearIdentityAccessToken）后，迟到的刷新结果不污染新会话', async () => {
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
    // 迟到结果未被写回：缓存仍为空
    expect(peekIdentityAccessToken()).toBe('')
  })
})

describe('DEV 专用 Access Token 打桩缝（#1198 真机验证依赖）', () => {
  const STUB_KEY = '__HBUT_IDENTITY_AT_STUB__'

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>)[STUB_KEY]
    vi.unstubAllEnvs()
  })

  it('DEV 构建下打桩值优先于 provider（且不写内存状态）', async () => {
    clearIdentityAccessToken() // 与同文件其它用例隔离（模块级状态）
    vi.stubEnv('DEV', true)
    ;(globalThis as unknown as Record<string, unknown>)[STUB_KEY] = '  stub-token  '
    const provider = makeProvider({ getAccessToken: vi.fn(async () => 'from-provider') })
    setIdentityAccessTokenProvider(provider)
    expect(await getIdentityAccessToken()).toBe('stub-token')
    expect(provider.getAccessToken).not.toHaveBeenCalled()
    // 打桩不得污染内存状态（peek 仍为空）
    expect(peekIdentityAccessToken()).toBe('')
  })

  it('生产构建下忽略打桩值，仍走 provider', async () => {
    vi.stubEnv('DEV', false)
    ;(globalThis as unknown as Record<string, unknown>)[STUB_KEY] = 'stub-token'
    setIdentityAccessTokenProvider(makeProvider({ getAccessToken: vi.fn(async () => 'from-provider') }))
    expect(await getIdentityAccessToken()).toBe('from-provider')
  })

  it('非字符串或空白打桩值一律忽略（fail safe）', async () => {
    vi.stubEnv('DEV', true)
    setIdentityAccessTokenProvider(makeProvider({ getAccessToken: vi.fn(async () => 'from-provider') }))
    for (const bad of [123, {}, [], '   ', null] as unknown[]) {
      ;(globalThis as unknown as Record<string, unknown>)[STUB_KEY] = bad
      expect(await getIdentityAccessToken()).toBe('from-provider')
    }
  })
})
