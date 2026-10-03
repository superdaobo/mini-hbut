/**
 * T4 云同步端点解析 + 故障转移单测（契约 §4/§6）。
 *
 * 覆盖：
 * - 解析优先级：通道级覆盖 > backend.groups > 本地设置 > 内置默认；远程覆盖本地
 * - 「兼容镜像」判定：远程显式端点 == 组首项时走组模型（保留兜底）
 * - 环境隔离：非 release 强制环境端点
 * - 传输层：5xx/网络错误触发切换；4xx 与业务错误不切换；失败组冷却后跳过
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./identity_access_token.js', () => ({
  getIdentityAccessToken: vi.fn(async () => null)
}))

// 本文件用 resetModules + 动态 import 隔离模块级状态；全量并行跑时首次加载依赖图较慢，
// 放宽单测超时（默认 5s 在 274 个测试文件并行时会抖动）。
vi.setConfig({ testTimeout: 20_000 })

const SNAPSHOT_KEY = 'hbu_remote_config_snapshot'

const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    }
  } as Storage
}

const globalRef = globalThis as Record<string, unknown>

type Modules = {
  config: typeof import('./cloud_sync_config')
  transport: typeof import('./cloud_sync_transport')
  failover: typeof import('./backend_failover')
  settings: typeof import('./app_settings')
}

const loadModules = async (profile: 'release' | 'standard' = 'release'): Promise<Modules> => {
  vi.resetModules()
  vi.stubEnv('VITE_BUILD_PROFILE', profile)
  const config = await import('./cloud_sync_config')
  const transport = await import('./cloud_sync_transport')
  const failover = await import('./backend_failover')
  const settings = await import('./app_settings')
  return { config, transport, failover, settings }
}

const writeSnapshot = (payload: unknown): void => {
  ;(globalRef.localStorage as Storage).setItem(SNAPSHOT_KEY, JSON.stringify(payload))
}

const setLocalSettings = (settings: Modules['settings'], backend: Record<string, unknown>): void => {
  settings.applyAppSettingsSnapshot({ backend: { useRemoteConfig: true, ...backend } })
}

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

let originalWindow: unknown

beforeEach(() => {
  originalWindow = globalRef.window
  const storage = createMemoryStorage()
  globalRef.localStorage = storage
  // node 环境下提供最小 window：requestOnEndpoint 用 window.setTimeout，
  // 且 cloud_sync_storage 的依赖链（api.ts）在模块加载时会注册 storage 监听。
  globalRef.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: storage
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (originalWindow === undefined) delete globalRef.window
  else globalRef.window = originalWindow
})

describe('getCloudSyncRuntimeConfig（契约 §4 优先级）', () => {
  it('release + 无远程快照 → 内置默认两域（mini 主 + hf 兜底）', async () => {
    const { config, settings } = await loadModules()
    setLocalSettings(settings, { cloudSyncEndpoint: '' })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.endpoints.map((item) => item.url)).toEqual([
      'https://mini.hbut.site/api/cloud-sync',
      'https://mini-hbut-ocr-service.hf.space/api/cloud-sync'
    ])
    expect(runtime.proxyEndpoint).toBe('https://mini.hbut.site/api/cloud-sync')
    expect(runtime.failover.enabled).toBe(true)
  })

  it('release + 远程 backend.groups → 按组顺序产出主 + 兜底', async () => {
    const { config, settings } = await loadModules()
    setLocalSettings(settings, { cloudSyncEndpoint: '' })
    writeSnapshot({
      backend: {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site' },
          { id: 'hf-prod', base: 'https://mini-hbut-ocr-service.hf.space' }
        ]
      }
    })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.endpoints.map((item) => item.url)).toEqual([
      'https://mini.hbut.site/api/cloud-sync',
      'https://mini-hbut-ocr-service.hf.space/api/cloud-sync'
    ])
    expect(runtime.endpoints.map((item) => item.groupId)).toEqual(['mini', 'hf-prod'])
  })

  it('配置仓镜像写入（显式端点 == 组首项）→ 走组模型，兜底不丢', async () => {
    const { config, settings } = await loadModules()
    setLocalSettings(settings, { cloudSyncEndpoint: '' })
    writeSnapshot({
      cloud_sync: { enabled: true, proxy_endpoint: 'https://mini.hbut.site/api/cloud-sync' },
      backend: {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site' },
          { id: 'hf-prod', base: 'https://mini-hbut-ocr-service.hf.space' }
        ]
      }
    })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.endpoints).toHaveLength(2)
    expect(runtime.endpoints[1].url).toBe('https://mini-hbut-ocr-service.hf.space/api/cloud-sync')
  })

  it('显式端点与组首项不同（人工救火）→ 通道级覆盖优先', async () => {
    const { config, settings } = await loadModules()
    setLocalSettings(settings, { cloudSyncEndpoint: '' })
    writeSnapshot({
      cloud_sync: {
        enabled: true,
        proxy_endpoint: 'https://override.example.com/api/cloud-sync',
        fallback_endpoints: ['https://override-backup.example.com/api/cloud-sync']
      },
      backend: { groups: [{ id: 'mini', base: 'https://mini.hbut.site' }] }
    })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.endpoints.map((item) => item.url)).toEqual([
      'https://override.example.com/api/cloud-sync',
      'https://override-backup.example.com/api/cloud-sync'
    ])
  })

  it('远程有效时覆盖本地设置（D3：远程优先）', async () => {
    const { config, settings } = await loadModules()
    setLocalSettings(settings, { cloudSyncEndpoint: 'https://local.example.com' })
    writeSnapshot({
      cloud_sync: { enabled: true, proxy_endpoint: 'https://remote.example.com/api/cloud-sync' }
    })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.proxyEndpoint).toBe('https://remote.example.com/api/cloud-sync')
    expect(runtime.endpoints.map((item) => item.url)).toEqual([
      'https://remote.example.com/api/cloud-sync'
    ])
  })

  it('远程不可达（无快照）时回退本地设置', async () => {
    const { config, settings } = await loadModules()
    setLocalSettings(settings, { cloudSyncEndpoint: 'https://local.example.com' })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.proxyEndpoint).toBe('https://local.example.com/api/cloud-sync')
  })

  it('useRemoteConfig=false → 忽略远程，本地优先', async () => {
    const { config, settings } = await loadModules()
    settings.applyAppSettingsSnapshot({
      backend: { useRemoteConfig: false, cloudSyncEndpoint: 'https://local.example.com' }
    })
    writeSnapshot({
      cloud_sync: { enabled: true, proxy_endpoint: 'https://remote.example.com/api/cloud-sync' }
    })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.useRemoteConfig).toBe(false)
    expect(runtime.proxyEndpoint).toBe('https://local.example.com/api/cloud-sync')
  })

  it('非 release 构建强制环境端点（单候选，不启用组模型）', async () => {
    const { config, settings } = await loadModules('standard')
    setLocalSettings(settings, { cloudSyncEndpoint: '' })
    writeSnapshot({
      backend: { groups: [{ id: 'mini', base: 'https://mini.hbut.site' }] }
    })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.endpoints).toHaveLength(1)
    expect(runtime.proxyEndpoint).toContain('mini-hbut-testocr1.hf.space')
  })

  it('远程 fallback_endpoints 生效（无 groups 时）', async () => {
    const { config, settings } = await loadModules()
    setLocalSettings(settings, { cloudSyncEndpoint: '' })
    writeSnapshot({
      cloud_sync: {
        enabled: true,
        proxy_endpoint: 'https://primary.example.com/api/cloud-sync',
        fallback_endpoints: ['https://backup.example.com/api/cloud-sync']
      }
    })
    const runtime = config.getCloudSyncRuntimeConfig()
    expect(runtime.endpoints.map((item) => item.url)).toEqual([
      'https://primary.example.com/api/cloud-sync',
      'https://backup.example.com/api/cloud-sync'
    ])
  })
})

describe('requestCloudSync（契约 §6 故障转移）', () => {
  const buildRuntimeConfig = (): import('./cloud_sync_config').CloudSyncRuntimeConfig => ({
    enabled: true,
    mode: 'proxy',
    endpoint: 'https://primary.example.com/api/cloud-sync',
    proxyEndpoint: 'https://primary.example.com/api/cloud-sync',
    endpoints: [
      {
        groupId: 'mini',
        failoverKey: 'mini',
        url: 'https://primary.example.com/api/cloud-sync'
      },
      {
        groupId: 'hf-prod',
        failoverKey: 'hf-prod',
        url: 'https://fallback.example.com/api/cloud-sync'
      }
    ],
    failover: {
      enabled: true,
      failureTtlSeconds: 300,
      maxAttemptsPerRequest: 2,
      probeTimeoutMs: 3000
    },
    secretRef: 'kv1-main',
    cooldownSec: 180,
    uploadCooldownSec: 120,
    downloadCooldownSec: 10,
    timeoutMs: 12000,
    useRemoteConfig: true
  })

  it('主端点 5xx → 切换兜底并成功', async () => {
    const { transport, failover } = await loadModules()
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://primary.example.com')) return jsonResponse({ error: 'boom' }, 500)
      return jsonResponse({ success: true, from: 'fallback' })
    })
    globalRef.fetch = fetchMock

    const result = await transport.requestCloudSync('/ping', { config: buildRuntimeConfig() })
    expect(result.from).toBe('fallback')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(failover.isGroupCooling('mini')).toBe(true)
    expect(failover.isGroupCooling('hf-prod')).toBe(false)
  })

  it('主端点网络错误 → 切换兜底', async () => {
    const { transport } = await loadModules()
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://primary.example.com')) throw new TypeError('Failed to fetch')
      return jsonResponse({ success: true, from: 'fallback' })
    })
    globalRef.fetch = fetchMock

    const result = await transport.requestCloudSync('/ping', { config: buildRuntimeConfig() })
    expect(result.from).toBe('fallback')
  })

  it('主端点 4xx → 不切换，直接抛错', async () => {
    const { transport, failover } = await loadModules()
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'not found' }, 404))
    globalRef.fetch = fetchMock

    await expect(
      transport.requestCloudSync('/ping', { config: buildRuntimeConfig() })
    ).rejects.toThrow(/not found/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(failover.isGroupCooling('mini')).toBe(false)
  })

  it('业务错误（success:false）→ 不切换', async () => {
    const { transport } = await loadModules()
    const fetchMock = vi.fn(async () => jsonResponse({ success: false, error: '业务失败' }))
    globalRef.fetch = fetchMock

    await expect(
      transport.requestCloudSync('/ping', { config: buildRuntimeConfig() })
    ).rejects.toThrow(/业务失败/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('主端点冷却后，下一次请求直接走兜底（不再撞主）', async () => {
    const { transport, failover } = await loadModules()
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://primary.example.com')) return jsonResponse({ error: 'boom' }, 503)
      return jsonResponse({ success: true, from: 'fallback' })
    })
    globalRef.fetch = fetchMock

    await transport.requestCloudSync('/ping', { config: buildRuntimeConfig() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(failover.isGroupCooling('mini')).toBe(true)

    fetchMock.mockClear()
    const second = await transport.requestCloudSync('/ping', { config: buildRuntimeConfig() })
    expect(second.from).toBe('fallback')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('fallback.example.com')
  })

  it('全部端点失败 → 抛出最后一次错误', async () => {
    const { transport } = await loadModules()
    globalRef.fetch = vi.fn(async () => jsonResponse({ error: 'all down' }, 502))
    await expect(
      transport.requestCloudSync('/ping', { config: buildRuntimeConfig() })
    ).rejects.toThrow(/all down/)
  })

  it('无候选端点 → 明确报错', async () => {
    const { transport } = await loadModules()
    const config = { ...buildRuntimeConfig(), endpoints: [] as never, endpoint: '', proxyEndpoint: '' }
    await expect(transport.requestCloudSync('/ping', { config })).rejects.toThrow(
      /云同步中转地址未配置/
    )
  })

  it('failover.enabled=false → 只尝试主端点（等价旧单端点行为）', async () => {
    const { transport } = await loadModules()
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'primary down' }, 500))
    globalRef.fetch = fetchMock
    const config = buildRuntimeConfig()
    config.failover = { ...config.failover, enabled: false }
    await expect(transport.requestCloudSync('/ping', { config })).rejects.toThrow(/primary down/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
