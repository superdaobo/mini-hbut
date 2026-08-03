/**
 * 阶段3 前端可靠性测试（#550）
 *
 * 覆盖：
 * - fetchWithTimeout 统一超时 helper（默认 10s、可配置、外部 signal 合并、TimeoutError 语义）
 * - fetchWithCache 维护模式分类：断网/超时回退缓存、连续失败阈值、401/403/会话失效不判维护、
 *   500 不误判、恢复成功清除维护状态、维护退避窗口
 * - 跨实例缓存失效广播（storage/CustomEvent 双通道、幂等去重、无事件循环）
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, isTimeoutError, withTimeout } from './fetch_timeout'

const CACHE_INVALIDATION_STORAGE_KEY = 'hbu_cache_invalidation_broadcast'
const MAINTENANCE_KEY = 'hbu_jwxt_maintenance'
const MAINTENANCE_FAIL_COUNT_KEY = 'hbu_jwxt_maintenance_fail_count'
const MAINTENANCE_FAIL_TIME_KEY = 'hbu_jwxt_maintenance_fail_time'

// —— 测试基础设施 ——

const installStorage = () => {
  const storage = new Map()
  const api = {
    getItem: (key) => storage.get(key) || null,
    setItem: vi.fn((key, value) => storage.set(key, String(value))),
    removeItem: vi.fn((key) => storage.delete(key)),
    key: (index) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size
    }
  }
  vi.stubGlobal('localStorage', api)
  return { storage, api }
}

const installWindow = () => {
  const handlers = new Map()
  const win = {
    addEventListener: vi.fn((type, cb) => {
      const list = handlers.get(type) || []
      list.push(cb)
      handlers.set(type, list)
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn((event) => true)
  }
  vi.stubGlobal('window', win)
  return {
    win,
    fire: (type, event) => {
      for (const cb of handlers.get(type) || []) cb(event)
    }
  }
}

// 每个用例独立加载 api.js 模块，避免 memoryCache 单例跨用例污染。
const importApi = async () => {
  vi.resetModules()
  return await import('./api.js')
}

const seedStale = (storage, key, data = { success: true, data: { items: ['stale'] } }) => {
  storage.set(`cache:${key}`, JSON.stringify({ data, timestamp: 0 }))
}

const readStorage = (storageApi, key) => storageApi.getItem(key)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// —— fetchWithTimeout ——

describe('fetchWithTimeout', () => {
  const installFetch = () => {
    const state = { aborted: false }
    const fetchMock = vi.fn(
      (url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (signal?.aborted) {
            state.aborted = true
            reject(makeAbortError())
            return
          }
          signal?.addEventListener('abort', () => {
            state.aborted = true
            reject(makeAbortError())
          })
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    return { fetchMock, state }
  }

  const makeAbortError = () =>
    Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })

  it('正常请求直接返回响应，不触发超时', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await fetchWithTimeout('https://example.com/api', {}, 1000)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0][1]
    expect(init.signal).toBeDefined()
  })

  it('超过可配置超时时间抛 TimeoutError 并中止 fetch', async () => {
    vi.useFakeTimers()
    const { fetchMock, state } = installFetch()

    const pending = fetchWithTimeout('https://example.com/api', {}, 1000)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(state.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(999)
    expect(state.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await assertion
    expect(state.aborted).toBe(true)
    expect(isTimeoutError({ name: 'TimeoutError' })).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('默认超时为 10s', async () => {
    vi.useFakeTimers()
    const { state } = installFetch()

    const pending = fetchWithTimeout('https://example.com/api', {})
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(state.aborted).toBe(true)
  })

  it('外部 signal 中止时原样抛 AbortError，不误报为超时', async () => {
    vi.useFakeTimers()
    const { state } = installFetch()
    const controller = new AbortController()

    const pending = fetchWithTimeout(
      'https://example.com/api',
      { signal: controller.signal },
      10_000
    )
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
    expect(state.aborted).toBe(true)
  })

  it('withTimeout 包装任意任务：正常完成返回结果，超时抛 TimeoutError', async () => {
    vi.useFakeTimers()
    const task = vi.fn((x) => Promise.resolve(x * 2))
    const wrapped = withTimeout(task, 1000, 'demo-task')
    await expect(wrapped(21)).resolves.toBe(42)
    expect(task).toHaveBeenCalledWith(21)

    const slow = withTimeout(() => new Promise(() => {}), 500, 'slow-task')
    const assertion = expect(slow()).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })
})

// —— fetchWithCache 维护模式分类 ——

describe('fetchWithCache 维护模式分类', () => {
  it('断网（TypeError: Failed to fetch）回退 stale 缓存，连续失败达到阈值才置位维护', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'grades:1:2024')
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const first = await api.fetchWithCache('grades:1:2024', fetcher)
    expect(first.fromCache).toBe(true)
    expect(first.stale).toBe(true)
    expect(first.data.offline).toBe(true)
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull() // 第一次失败仅计数，不置位
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBe('1')

    const second = await api.fetchWithCache('grades:1:2024', fetcher)
    expect(second.fromCache).toBe(true)
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBe('1') // 第二次失败达到阈值，置位维护
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBe('2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('超时错误回退 stale 缓存并累计失败计数', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'schedule:1:2024')
    const timeoutError = Object.assign(
      new Error('fetch timeout after 10000ms: https://jwxt.example'),
      { name: 'TimeoutError' }
    )
    const fetcher = vi.fn().mockRejectedValue(timeoutError)

    const result = await api.fetchWithCache('schedule:1:2024', fetcher)
    expect(result.stale).toBe(true)
    expect(result.data.offline).toBe(true)
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBe('1')
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
  })

  it('requestOptions.timeoutMs 包装 fetcher：挂起请求超时后回退 stale 缓存', async () => {
    vi.useFakeTimers()
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'grades:1:2024')
    // 模拟永不返回的挂起请求，由 timeoutMs 统一超时接管。
    const fetcher = vi.fn(() => new Promise(() => {}))

    const pending = api.fetchWithCache('grades:1:2024', fetcher, undefined, { timeoutMs: 100 })
    const assertion = expect(pending).resolves.toMatchObject({ stale: true, fromCache: true })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
    // 超时计入维护失败计数，但未达阈值不置位维护。
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBe('1')
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
  })

  it('未配置 timeoutMs 时 fetcher 不被包装，行为与结果原样透传', async () => {
    const { storage } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'semesters2:2024', { success: true, data: { items: ['old'] } })
    const fetcher = vi.fn(async (extra) => ({ success: true, data: extra }))

    const result = await api.fetchWithCache('semesters2:2024', () => fetcher('payload'))
    expect(result.fromCache).toBe(false)
    expect(result.data.data).toBe('payload')
    expect(fetcher).toHaveBeenCalledWith('payload')
    expect(result.data.offline).toBeUndefined()
  })

  it('401 不判维护、不回退缓存，直接抛出交给上层', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'grades:1:2024')
    const unauthorized = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401 }
    })
    const fetcher = vi.fn().mockRejectedValue(unauthorized)

    await expect(api.fetchWithCache('grades:1:2024', fetcher)).rejects.toBe(unauthorized)
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBeNull()
    expect(readStorage(storageApi, 'cache:grades:1:2024')).not.toBeNull() // stale 未被消费
  })

  it('403 同样不判维护', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'grades:1:2024')
    const forbidden = Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403 }
    })
    const fetcher = vi.fn().mockRejectedValue(forbidden)

    await expect(api.fetchWithCache('grades:1:2024', fetcher)).rejects.toBe(forbidden)
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBeNull()
  })

  it('会话失效消息（含会话/登录超时）不判维护，直接抛出', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'exams:1:2024')
    const messages = [
      '登录已过期，请重新登录',
      '会话超时，请重新登录',
      '登录超时',
      'session timed out, please login again'
    ]
    for (const message of messages) {
      const fetcher = vi.fn().mockRejectedValue(new Error(message))
      await expect(api.fetchWithCache('exams:1:2024', fetcher)).rejects.toThrow(message)
      expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
      expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBeNull()
    }
  })

  it('500 不误判为维护，返回原始失败响应', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    seedStale(storage, 'grades:1:2024')
    const fetcher = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'Request failed with status code 500' })

    const result = await api.fetchWithCache('grades:1:2024', fetcher)
    expect(result.fromCache).toBe(false)
    expect(result.data.error).toContain('500')
    expect(result.data.offline).toBeUndefined() // 未走 stale 回退
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBeNull()
  })

  it('恢复成功：维护置位后任意教务请求成功即清除维护状态与失败计数', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    storage.set(MAINTENANCE_KEY, '1')
    storage.set(MAINTENANCE_FAIL_COUNT_KEY, '2')
    storage.set(MAINTENANCE_FAIL_TIME_KEY, String(Date.now()))
    const fetcher = vi.fn().mockResolvedValue({ success: true, data: { items: ['fresh'] } })

    const result = await api.fetchWithCache('grades:1:2024', fetcher)
    expect(result.fromCache).toBe(false)
    expect(result.data.data).toEqual({ items: ['fresh'] })
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
    expect(readStorage(storageApi, MAINTENANCE_FAIL_COUNT_KEY)).toBeNull()
    expect(readStorage(storageApi, MAINTENANCE_FAIL_TIME_KEY)).toBeNull()
  })

  it('维护退避：置位后窗口内不发起后台刷新，窗口外允许重试一次', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()
    // 写入 fresh 缓存并置位维护，使“缓存命中 + 维护模式粘滞修复”路径生效。
    api.setCachedData('schedule:1:2024', { success: true, data: { items: ['fresh'] } })
    storage.set(MAINTENANCE_KEY, '1')
    storage.set(MAINTENANCE_FAIL_TIME_KEY, String(Date.now()))
    const fetcher = vi.fn().mockResolvedValue({ success: true, data: { items: ['fresh-2'] } })

    // 退避窗口内：命中缓存并返回离线标记，但不触发后台刷新。
    const inWindow = await api.fetchWithCache('schedule:1:2024', fetcher)
    expect(inWindow.fromCache).toBe(true)
    expect(inWindow.data.offline).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()

    // 越过退避窗口：允许一次后台刷新，成功后清除维护状态。
    vi.setSystemTime(Date.now() + 60_001)
    const afterWindow = await api.fetchWithCache('schedule:1:2024', fetcher)
    expect(afterWindow.fromCache).toBe(true)
    await vi.advanceTimersByTimeAsync(1) // flush 后台刷新微任务
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(readStorage(storageApi, MAINTENANCE_KEY)).toBeNull()
  })
})

// —— 跨实例缓存失效广播 ——

describe('缓存失效跨实例广播', () => {
  it('clearCacheByPrefix 本地清理并广播（storage 哨兵 + CustomEvent）', async () => {
    const { storage, api: storageApi } = installStorage()
    const { win } = installWindow()
    const api = await importApi()

    api.setCachedData('grades:1:2024', { success: true, data: { items: [1] } })
    expect(api.getCachedData('grades:1:2024')).not.toBeNull()

    api.clearCacheByPrefix('grades:1')

    expect(api.getCachedData('grades:1:2024')).toBeNull()
    // storage 哨兵已写入（跨标签页广播通道）
    const raw = readStorage(storageApi, CACHE_INVALIDATION_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const payload = JSON.parse(raw)
    expect(payload.prefixes).toEqual(['grades:1'])
    expect(payload.id).toBeTruthy()
    // CustomEvent 已派发（同实例广播通道）
    expect(win.dispatchEvent).toHaveBeenCalled()
    const event = win.dispatchEvent.mock.calls[0][0]
    expect(event.type).toBe('hbu-cache-invalidation')
    expect(event.detail.prefixes).toEqual(['grades:1'])
  })

  it('收到跨实例 storage 事件后清理内存缓存，且不再回写存储（无事件循环）', async () => {
    const { storage, api: storageApi } = installStorage()
    const { win, fire } = installWindow()
    const api = await importApi()

    api.setCachedData('schedule:123:2024', { success: true, data: { items: [1] } })
    expect(api.getCachedData('schedule:123:2024')).not.toBeNull()

    const writesBefore = storageApi.setItem.mock.calls.length
    const dispatchesBefore = win.dispatchEvent.mock.calls.length

    // 模拟另一标签页发来的 storage 失效广播。
    fire('storage', {
      key: CACHE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ id: 'remote-instance-1', prefixes: ['schedule:123'], at: 1 })
    })

    expect(api.getCachedData('schedule:123:2024')).toBeNull()
    // 处理事件只清理、绝不回写：不写哨兵、不派发事件。
    expect(storageApi.setItem.mock.calls.length).toBe(writesBefore)
    expect(win.dispatchEvent.mock.calls.length).toBe(dispatchesBefore)
  })

  it('同一广播 id 幂等去重：重复事件不重复清理', async () => {
    const { storage, api: storageApi } = installStorage()
    const { fire } = installWindow()
    const api = await importApi()

    fire('storage', {
      key: CACHE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ id: 'remote-instance-2', prefixes: ['grades:1'], at: 1 })
    })
    // 第一次广播清理后，重新写入并再次收到同一 id，应被去重忽略。
    api.setCachedData('grades:1:2024', { success: true, data: { items: [9] } })
    fire('storage', {
      key: CACHE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify({ id: 'remote-instance-2', prefixes: ['grades:1'], at: 1 })
    })
    expect(api.getCachedData('grades:1:2024')).not.toBeNull()
    expect(readStorage(storageApi, 'cache:grades:1:2024')).not.toBeNull()
  })

  it('同实例 CustomEvent 与 storage 通道共用幂等去重，同一广播只处理一次', async () => {
    const { storage, api: storageApi } = installStorage()
    const { fire } = installWindow()
    const api = await importApi()
    const payload = { id: 'same-instance-1', prefixes: ['grades:1'], at: 1 }

    // 同实例 CustomEvent 通道先收到广播并完成清理。
    fire('hbu-cache-invalidation', { detail: payload })
    api.setCachedData('grades:1:2024', { success: true, data: { items: [1] } })
    // 另一标签页转发同一 id 的 storage 事件，应被去重忽略。
    fire('storage', {
      key: CACHE_INVALIDATION_STORAGE_KEY,
      newValue: JSON.stringify(payload)
    })
    expect(api.getCachedData('grades:1:2024')).not.toBeNull()
    expect(readStorage(storageApi, 'cache:grades:1:2024')).not.toBeNull()
  })

  it('clearUserScopedCaches 批量清理用户缓存并一次性广播全部前缀', async () => {
    const { storage, api: storageApi } = installStorage()
    installWindow()
    const api = await importApi()

    api.setCachedData('schedule:100:2024', { success: true, data: {} })
    api.setCachedData('grades:100:2024', { success: true, data: {} })
    api.setCachedData('training:options:100', { success: true, data: {} })

    api.clearUserScopedCaches('100')

    expect(api.getCachedData('schedule:100:2024')).toBeNull()
    expect(api.getCachedData('grades:100:2024')).toBeNull()
    expect(api.getCachedData('training:options:100')).toBeNull()
    // 全局 semesters 缓存不受用户级清理影响。
    api.setCachedData('semesters', { success: true, data: {} })
    expect(api.getCachedData('semesters')).not.toBeNull()

    // 哨兵只写入一次，且携带全部用户级前缀。
    const broadcastWrites = storageApi.setItem.mock.calls.filter(
      ([key]) => key === CACHE_INVALIDATION_STORAGE_KEY
    )
    expect(broadcastWrites.length).toBe(1)
    const payload = JSON.parse(broadcastWrites[0][1])
    expect(payload.prefixes).toContain('schedule:100')
    expect(payload.prefixes).toContain('grades:100')
    expect(payload.prefixes).toContain('training:options:100')
  })
})
