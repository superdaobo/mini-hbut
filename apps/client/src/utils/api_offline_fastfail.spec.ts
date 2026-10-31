/**
 * P0-1（issue #1158）：fetchWithCache 离线快速路径。
 *
 * 覆盖：
 * - 离线 + fresh JS 缓存命中 → 立即返回 fresh，不发起请求
 * - 离线 + stale（含 forceRemote）→ 立即返回 stale + offline 元数据，fetcher 不被调用
 * - 离线 + 无缓存 + fetcher 抛错/超时 → 返回标准「离线且无缓存」空态（noCache），不 throw
 * - 在线 → 现有行为逐字节不变（回归红线）
 *
 * 说明：项目为 node 环境（无 DOM/navigator 默认 onLine），通过 vi.stubGlobal 精确控制
 * navigator.onLine，验证 isBrowserOffline 的分支。在线回归用例确保 navigator.onLine=true
 * 时进入原有逻辑。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

// —— 测试基础设施（与 api_reliability.spec.ts 同口径）——

const installStorage = () => {
  const storage = new Map<string, string>()
  const api = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: vi.fn((key: string, value: string) => storage.set(key, String(value))),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size
    }
  }
  vi.stubGlobal('localStorage', api)
  return { storage, api }
}

const installWindow = () => {
  const handlers = new Map<string, Array<(event: unknown) => void>>()
  const win = {
    addEventListener: vi.fn((type: string, cb: (event: unknown) => void) => {
      const list = handlers.get(type) || []
      list.push(cb)
      handlers.set(type, list)
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn((_event: CustomEvent) => true)
  }
  vi.stubGlobal('window', win)
  return { win }
}

/** 精确控制 navigator.onLine（true=在线，false=离线）。 */
const setOnline = (online: boolean) => {
  vi.stubGlobal('navigator', { onLine: online })
}

// 每个用例独立加载 api.js 模块，避免 memoryCache 单例跨用例污染。
const importApi = async () => {
  vi.resetModules()
  return await import('./api.js')
}

const seedStale = (storage: Map<string, string>, key: string, data: unknown) => {
  storage.set(`cache:${key}`, JSON.stringify({ data, timestamp: 0 }))
}

type TestCachePayload = { success?: boolean; offline?: boolean; noCache?: boolean; [key: string]: unknown }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('P0-1 fetchWithCache 离线快速路径（#1158）', () => {
  it('离线 + fresh 缓存命中 → 立即返回 fresh，不发起请求', async () => {
    installStorage()
    installWindow()
    setOnline(false)
    const api = await importApi()
    // 写入 fresh 缓存（timestamp=now，在 TTL 内）
    api.setCachedData('grades:1:2024', { success: true, data: { items: ['fresh'] } })
    const fetcher = vi.fn().mockResolvedValue({ success: true, data: { items: ['remote'] } })

    const result = await api.fetchWithCache<TestCachePayload>('grades:1:2024', fetcher)
    expect(result.fromCache).toBe(true)
    expect(result.data.data).toEqual({ items: ['fresh'] })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('离线 + stale（forceRemote 场景）→ 立即返回 stale + offline 元数据，fetcher 不被调用', async () => {
    const { storage } = installStorage()
    installWindow()
    setOnline(false)
    const api = await importApi()
    // 排名页使用 forceRemote；离线时仍需能读到 stale 缓存
    seedStale(storage, 'ranking:1:2024', { success: true, data: { gpa: 3.5 } })
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await api.fetchWithCache<TestCachePayload>('ranking:1:2024', fetcher, undefined, {
      forceRemote: true
    })
    expect(result.fromCache).toBe(true)
    expect(result.stale).toBe(true)
    expect(result.data.offline).toBe(true)
    expect(result.data.data).toEqual({ gpa: 3.5 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('离线 + 无缓存 + fetcher 抛网络错误 → 返回 noCache 标准空态，不 throw', async () => {
    installStorage()
    installWindow()
    setOnline(false)
    const api = await importApi()
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await api.fetchWithCache<TestCachePayload>('studentinfo:1', fetcher)
    // P0-1 标准离线空态：success/offline/noCache 均为真，结果级 offlineNoCache 标记
    expect(result.data.success).toBe(true)
    expect(result.data.offline).toBe(true)
    expect(result.data.noCache).toBe(true)
    expect(result.offlineNoCache).toBe(true)
    expect(result.fromCache).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('离线 + 无缓存 + fetcher 挂起 → 10s 超时后返回 noCache 空态，不 throw', async () => {
    vi.useFakeTimers()
    installStorage()
    installWindow()
    setOnline(false)
    const api = await importApi()
    // 挂起请求，由离线快速路径的 10s 超时接管
    const fetcher = vi.fn(() => new Promise<Record<string, unknown>>(() => {}))

    const pending = api.fetchWithCache<TestCachePayload>('exams:1:2024', fetcher)
    const assertion = expect(pending).resolves.toMatchObject({
      offlineNoCache: true,
      data: { success: true, offline: true, noCache: true }
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('离线 + 无缓存 + fetcher 返回 Rust 离线快照 → 按现有成功分支返回（带 offline）', async () => {
    installStorage()
    installWindow()
    setOnline(false)
    const api = await importApi()
    // 真断网时 Rust 上游失败快，返回 grades.db 快照（offline payload）
    const fetcher = vi.fn().mockResolvedValue({
      success: true,
      offline: true,
      sync_time: '2026-10-01T00:00:00.000Z',
      data: { items: ['snapshot'] }
    })

    const result = await api.fetchWithCache<TestCachePayload>('grades:1:2024', fetcher)
    expect(result.fromCache).toBe(false)
    expect(result.data.offline).toBe(true)
    expect(result.data.noCache).toBeUndefined()
    expect(result.data.data).toEqual({ items: ['snapshot'] })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('在线 + 无缓存 + fetcher 成功 → 现有行为不变（写缓存并返回新鲜数据）', async () => {
    const { api: storageApi } = installStorage()
    installWindow()
    setOnline(true)
    const api = await importApi()
    const fetcher = vi.fn().mockResolvedValue({ success: true, data: { items: ['remote'] } })

    const result = await api.fetchWithCache<TestCachePayload>('grades:1:2024', fetcher)
    expect(result.fromCache).toBe(false)
    expect(result.data.data).toEqual({ items: ['remote'] })
    expect(result.data.offline).toBeUndefined()
    // 在线成功 → 写入缓存（无 offline 元数据）
    expect(storageApi.getItem('cache:grades:1:2024')).not.toBeNull()
  })

  it('在线 + 无缓存 + fetcher 抛网络错误 → 维持原有 throw 行为（回归红线）', async () => {
    installStorage()
    installWindow()
    setOnline(true)
    const api = await importApi()
    const networkError = new TypeError('Failed to fetch')
    const fetcher = vi.fn().mockRejectedValue(networkError)

    await expect(api.fetchWithCache('grades:1:2024', fetcher)).rejects.toBe(networkError)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
