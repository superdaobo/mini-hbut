/**
 * T5 游戏后端候选解析 + 故障转移单测（契约 §4 / §6 / I1 票据同源）。
 *
 * 覆盖：
 * - 候选解析：远程 groups / 云同步同源合成 / 显式覆盖（镜像与非镜像）/ 环境隔离
 * - **I1 同源**：每个候选的 apiBase 与 rankApi 必须同 origin
 * - 显式 base 路径不重复拼接（回归护栏）
 * - 故障转移：ticket 签发 5xx/网络错误切兜底；4xx 不切；冷却后直连兜底
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BACKEND_CHANNEL_PATHS,
  deriveChannelUrl,
  normalizeBackendConfig
} from '../utils/backend_endpoints'
import { resolveGameBackendCandidates } from '../utils/game_center/base'

vi.mock('../utils/identity_access_token.js', () => ({
  getIdentityAccessToken: vi.fn(async () => 'test-access-token')
}))

// 动态 import + resetModules 隔离模块级状态；全量并行跑时首次加载依赖图较慢，放宽超时。
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
const originOf = (url: string): string => new URL(url).origin

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

describe('resolveGameBackendCandidates（契约 §4）', () => {
  it('远程 groups → 按序产出候选，且每个候选 apiBase 与 rankApi 同源（I1）', () => {
    const candidates = resolveGameBackendCandidates({
      backend: {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site' },
          { id: 'hf', base: 'https://mirror.example.com' }
        ]
      }
    })
    expect(candidates.map((item) => item.groupId)).toEqual(['mini', 'hf'])
    expect(candidates[0].apiBase).toBe('https://mini.hbut.site/api/game-platform/v1')
    expect(candidates[0].rankApi).toBe('https://mini.hbut.site/api/game-rank')
    for (const candidate of candidates) {
      expect(originOf(candidate.apiBase)).toBe(originOf(candidate.rankApi))
    }
  })

  it('组内路径覆盖同时作用于两个通道（保持同源）', () => {
    const candidates = resolveGameBackendCandidates({
      backend: {
        groups: [{ id: 'mini', base: 'https://mini.hbut.site', paths: { game_platform: '/gp/v1' } }]
      }
    })
    expect(candidates[0].apiBase).toBe('https://mini.hbut.site/gp/v1')
    expect(candidates[0].rankApi).toBe('https://mini.hbut.site/api/game-rank')
    expect(originOf(candidates[0].apiBase)).toBe(originOf(candidates[0].rankApi))
  })

  it('无组模型但有云同步端点 → 同源合成单候选（与云同步切到同一后端）', () => {
    const candidates = resolveGameBackendCandidates({
      cloudSyncEndpoint: 'https://sync.example.com/api/cloud-sync'
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].apiBase).toBe('https://sync.example.com/api/game-platform/v1')
    expect(candidates[0].rankApi).toBe('https://sync.example.com/api/game-rank')
  })

  it('云同步端点带部署子路径时保留子路径', () => {
    const candidates = resolveGameBackendCandidates({
      cloudSyncEndpoint: 'https://sync.example.com/sub/api/cloud-sync'
    })
    expect(candidates[0].apiBase).toBe('https://sync.example.com/sub/api/game-platform/v1')
  })

  it('兼容镜像：显式 api_base == 组首项 → 走组模型保留兜底', () => {
    const candidates = resolveGameBackendCandidates({
      gamePlatformApiBase: 'https://mini.hbut.site/api/game-platform/v1',
      backend: {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site' },
          { id: 'hf', base: 'https://mirror.example.com' }
        ]
      }
    })
    expect(candidates.map((item) => item.groupId)).toEqual(['mini', 'hf'])
  })

  it('非镜像显式 api_base → 锁定单候选，且 rankApi 与其同源', () => {
    const candidates = resolveGameBackendCandidates({
      gamePlatformApiBase: 'https://override.example.com/api/game-platform/v1',
      backend: { groups: [{ id: 'mini', base: 'https://mini.hbut.site' }] }
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].groupId).toBe('override')
    expect(candidates[0].apiBase).toBe('https://override.example.com/api/game-platform/v1')
    expect(candidates[0].rankApi).toBe('https://override.example.com/api/game-rank')
  })

  it('回归护栏：显式 base 的路径不得被重复拼接', () => {
    const explicit = 'https://override.example.com/api/game-platform/v1'
    const candidates = resolveGameBackendCandidates({ gamePlatformApiBase: explicit })
    expect(candidates[0].apiBase).toBe(explicit)
    expect(candidates[0].apiBase).not.toContain('/api/game-platform/v1/api/game-platform/v1')
  })

  it('非 release 构建 + 无远程配置 → 环境隔离域单候选（不打生产）', () => {
    const candidates = resolveGameBackendCandidates({})
    expect(candidates).toHaveLength(1)
    expect(candidates[0].groupId).toBe('environment')
    expect(candidates[0].apiBase).toContain('mini-hbut-testocr1.hf.space')
  })

  it('includeGroups=false → 忽略远程组，用环境隔离域', () => {
    const candidates = resolveGameBackendCandidates({
      includeGroups: false,
      backend: { groups: [{ id: 'mini', base: 'https://mini.hbut.site' }] },
      gamePlatformApiBase: 'https://override.example.com/api/game-platform/v1'
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].groupId).toBe('environment')
  })

  it('默认通道路径与契约一致（game_platform / game_rank）', () => {
    expect(DEFAULT_BACKEND_CHANNEL_PATHS.game_platform).toBe('/api/game-platform/v1')
    expect(DEFAULT_BACKEND_CHANNEL_PATHS.game_rank).toBe('/api/game-rank')
    const config = normalizeBackendConfig({})
    expect(deriveChannelUrl({ base: 'https://x.example.com', paths: {} }, 'game_rank', config.paths)).toBe(
      'https://x.example.com/api/game-rank'
    )
  })
})

describe('fetchGameLaunchTicket 故障转移（契约 §6）', () => {
  let originalWindow: unknown

  type Modules = {
    api: typeof import('../utils/game_center/api')
  }

  const loadModules = async (): Promise<Modules> => {
    vi.resetModules()
    const api = await import('../utils/game_center/api')
    return { api }
  }

  beforeEach(() => {
    originalWindow = globalRef.window
    const storage = createMemoryStorage()
    globalRef.localStorage = storage
    globalRef.window = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      localStorage: storage
    }
    // 远程配置：两候选组（主 → 兜底）
    storage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        backend: {
          groups: [
            { id: 'mini', base: 'https://primary.example.com' },
            { id: 'hf', base: 'https://fallback.example.com' }
          ],
          failover: { enabled: true, failure_ttl_seconds: 300, max_attempts_per_request: 2 }
        }
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalWindow === undefined) delete globalRef.window
    else globalRef.window = originalWindow
  })

  it('主候选 5xx → 切换兜底并签发成功', async () => {
    const { api } = await loadModules()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('primary.example.com')) return jsonResponse({ error: 'boom' }, 503)
      return jsonResponse({ ticket: 'tk-fallback', expires_at: '2026-10-02T00:00:00Z' })
    })
    globalRef.fetch = fetchMock

    const result = await api.fetchGameLaunchTicket({ gameId: 'hbut_2048' })
    expect(result.ticket).toBe('tk-fallback')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('primary.example.com')
    expect(String(fetchMock.mock.calls[1][0])).toContain('fallback.example.com')
  })

  it('主候选网络错误 → 切换兜底', async () => {
    const { api } = await loadModules()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('primary.example.com')) throw new TypeError('Failed to fetch')
      return jsonResponse({ ticket: 'tk-fallback', expires_at: '2026-10-02T00:00:00Z' })
    })
    globalRef.fetch = fetchMock

    const result = await api.fetchGameLaunchTicket({ gameId: 'hbut_2048' })
    expect(result.ticket).toBe('tk-fallback')
  })

  it('主候选 4xx → 不切换，返回错误对象', async () => {
    const { api } = await loadModules()
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'forbidden' }, 403))
    globalRef.fetch = fetchMock

    const result = await api.fetchGameLaunchTicket({ gameId: 'hbut_2048' })
    expect(result.ticket).toBe('')
    expect(result.error?.httpStatus).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('主候选冷却后下一次请求直接走兜底（只发一次请求）', async () => {
    const { api } = await loadModules()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('primary.example.com')) return jsonResponse({ error: 'boom' }, 500)
      return jsonResponse({ ticket: 'tk-fallback', expires_at: '2026-10-02T00:00:00Z' })
    })
    globalRef.fetch = fetchMock

    await api.fetchGameLaunchTicket({ gameId: 'hbut_2048' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockClear()
    await api.fetchGameLaunchTicket({ gameId: 'hbut_2048' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('fallback.example.com')
  })

  it('镜像 override（等于主候选 base）仍保留兜底能力', async () => {
    const { api } = await loadModules()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('primary.example.com')) return jsonResponse({ error: 'boom' }, 500)
      return jsonResponse({ ticket: 'tk-fallback', expires_at: '2026-10-02T00:00:00Z' })
    })
    globalRef.fetch = fetchMock

    const result = await api.fetchGameLaunchTicket({
      gameId: 'hbut_2048',
      apiBase: 'https://primary.example.com/api/game-platform/v1'
    })
    expect(result.ticket).toBe('tk-fallback')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
