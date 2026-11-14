import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wisdomPost } from './wisdom_client'

/**
 * #1299：桥接/网络无响应时请求必须超时收敛，不能永久挂住 bootstrap。
 */
const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const abortableFetch = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const fail = () =>
      reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
    // 已经是 aborted 的 signal 不会再派发 abort 事件，先判一次
    if (init?.signal?.aborted) {
      fail()
      return
    }
    init?.signal?.addEventListener('abort', fail)
  })

const fakeResponse = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  }) as unknown as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('campus guide request timeout (#1299)', () => {
  it('上游一直不响应时按 timeoutMs 抛超时错误', async () => {
    vi.stubGlobal('fetch', vi.fn(abortableFetch))

    await expect(wisdomPost('/campus-guide/spot/search', {}, { timeoutMs: 40 })).rejects.toThrow(
      '校园导览请求超时，请稍后重试'
    )
  })

  it('正常响应不受超时影响', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ code: 0, data: { ok: true } })))

    await expect(wisdomPost('/campus-guide/spot/search', {}, { timeoutMs: 200 })).resolves.toEqual({
      ok: true
    })
  })

  it('调用方主动取消时立即失败（不等到超时）', async () => {
    vi.stubGlobal('fetch', vi.fn(abortableFetch))
    const controller = new AbortController()
    const task = wisdomPost('/campus-guide/spot/search', {}, { signal: controller.signal, timeoutMs: 5000 })
    controller.abort()

    await expect(task).rejects.toThrow()
  })
})

describe('campus guide loading guards contract (#1299)', () => {
  it('定位有硬看门狗（浏览器不回调时兜底）', () => {
    const geo = readSource('src/composables/useGeolocation.ts')
    expect(geo).toContain('watchdog')
    expect(geo).toContain('定位看门狗触发')
    expect(geo).toContain('timeout + 2000')
  })

  it('bootstrap 的定位步骤有期限并回落校区中心', () => {
    const store = readSource('src/features/campus-guide/store/campus-guide-store.ts')
    expect(store).toContain('LOCATION_DEADLINE_MS')
    expect(store).toContain('withDeadline(')
    expect(store).toContain("state.userLocation = { ...HBUT_LOCATION")
  })

  it('导览地图加载器复用共享加载器（超时/失败清理），不再自建 script', () => {
    const loader = readSource('src/features/campus-guide/map/tencent-map-loader.ts')
    expect(loader).toContain("from '../../../utils/tencent_map_loader'")
    expect(loader).toContain('resetCampusGuideMapLoader')
    expect(loader).not.toContain('document.createElement')
  })

  it('导览页在地图失败时给出重试入口，而不是永久「正在加载…」', () => {
    const vue = readSource('src/features/campus-guide/views/CampusGuideHome.vue')
    expect(vue).toContain('mapInitError')
    expect(vue).toContain('retryMap')
    expect(vue).toContain('重试加载地图')
    expect(vue).toContain('v-else-if="mapInitError"')
  })
})
