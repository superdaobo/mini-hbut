/**
 * P1-1 capability-driven 契约测试：宿主 UI 的服务端能力读取。
 *
 * 语义（与 feature flag 严格区分）：
 * - `features.*`（flag）＝「产品想不想要」；
 * - `capabilities.*`＝「**端点是否真的实现**」。
 *
 * 本文件看守三条不可回退的约束：
 * 1. **保守默认**：拿不到 /meta、字段缺失、类型非法 → 一律 false（UI 据此前置隐藏）；
 * 2. **不接受 features 作用域**：features 是 flag（想不想），不能当成「端点已实现」，
 *    否则 flag=true + 端点缺失时又会渲染出必然 404 的入口（P1-1 复发）；
 * 3. **fetchGamePlatformMeta 必须透出能力表**，且 /meta 失败时抛错（由调用方保持保守值）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_GAME_PLATFORM_CAPABILITIES,
  GAME_PLATFORM_CAPABILITY_KEYS,
  fetchGamePlatformMeta,
  readGamePlatformCapabilities
} from './game_center/api'

const API_BASE = 'https://games.example/api/game-platform/v1'

/** 任务书给出的服务端 /meta 样本（P1 收口后的最终形状） */
const SERVER_META_SAMPLE = {
  protocol_version: { min: 1, max: 1 },
  server_version: '2026.09.1',
  features: {
    run_v2: true,
    settlement: true,
    economy: false,
    daily_tasks: false,
    gomoku_competitive: false,
    verified_reward: false,
    legacy_dual_write: true
  },
  capabilities: {
    tickets: true,
    sessions: true,
    runs: true,
    settlement: true,
    leaderboards: false,
    wallet: false,
    daily_tasks: false,
    gomoku_match: true,
    drift_bottle: false
  },
  metrics: { games: 11 }
}

const jsonResponse = (payload: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  }) as unknown as Response

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('服务端能力读取（P1-1 保守 fail closed）', () => {
  it('canonical key 固定为宿主 UI 实际消费的六项', () => {
    expect([...GAME_PLATFORM_CAPABILITY_KEYS]).toEqual([
      'leaderboards',
      'wallet',
      'daily_tasks',
      'gomoku_match',
      'drift_bottle',
      'verified_reward'
    ])
    expect(Object.keys(EMPTY_GAME_PLATFORM_CAPABILITIES).sort()).toEqual(
      [...GAME_PLATFORM_CAPABILITY_KEYS].sort()
    )
  })

  it('拿不到 /meta 或 capabilities 块缺失 → 全部 false，且不伪造 declared', () => {
    for (const raw of [undefined, null, {}, { features: { leaderboards: true } }, { capabilities: null }]) {
      const parsed = readGamePlatformCapabilities(raw)
      expect(parsed.values).toEqual(EMPTY_GAME_PLATFORM_CAPABILITIES)
      expect(parsed.declared).toEqual([])
    }
  })

  it('服务端样本逐项生效：false 明确表达「端点未实现」', () => {
    const parsed = readGamePlatformCapabilities(SERVER_META_SAMPLE)
    expect(parsed.values).toEqual({
      leaderboards: false,
      wallet: false,
      daily_tasks: false,
      gomoku_match: true,
      drift_bottle: false,
      verified_reward: false // 样本未声明该 key → 保守 false
    })
    expect(parsed.declared).toEqual(['leaderboards', 'wallet', 'daily_tasks', 'gomoku_match', 'drift_bottle'])
  })

  it('字段缺失 / 类型非法 → 未知即 false（不得乐观放行）', () => {
    const partial = readGamePlatformCapabilities({
      capabilities: { leaderboards: { enabled: true }, wallet: 2, daily_tasks: 'maybe', gomoku_match: [] }
    })
    expect(partial.values).toEqual(EMPTY_GAME_PLATFORM_CAPABILITIES)
    expect(partial.declared).toEqual([])
  })

  it('别名兼容：leaderboard / *_enabled / gomoku_competitive 都收敛到 canonical key', () => {
    const parsed = readGamePlatformCapabilities({
      capabilities: {
        leaderboard: true,
        leaderboards_enabled: false, // 先命中的别名优先（leaderboard 在前）
        wallet_enabled: true,
        dailyTasks: 'enabled',
        gomoku_competitive: true,
        driftBottle: 'on',
        verified_rewards: 'available'
      }
    })
    expect(parsed.values).toEqual({
      leaderboards: true,
      wallet: true,
      daily_tasks: true,
      gomoku_match: true,
      drift_bottle: true,
      verified_reward: true
    })
    expect(parsed.declared).toEqual([...GAME_PLATFORM_CAPABILITY_KEYS])
  })

  it('字符串字面量的负向写法识别为 false（显式禁用）', () => {
    const parsed = readGamePlatformCapabilities({
      capabilities: { leaderboards: 'off', wallet: 'not_implemented', daily_tasks: '0', gomoku_match: 'no' }
    })
    expect(parsed.values.leaderboards).toBe(false)
    expect(parsed.values.wallet).toBe(false)
    expect(parsed.values.daily_tasks).toBe(false)
    expect(parsed.values.gomoku_match).toBe(false)
    expect(parsed.declared).toEqual(['leaderboards', 'wallet', 'daily_tasks', 'gomoku_match'])
  })

  it('**不读 features 作用域**：flag=true 不等于端点已实现（P1-1 复发护栏）', () => {
    const parsed = readGamePlatformCapabilities({
      features: { leaderboards: true, daily_tasks: true, gomoku_competitive: true, economy: true }
    })
    expect(parsed.values).toEqual(EMPTY_GAME_PLATFORM_CAPABILITIES)
    expect(parsed.declared).toEqual([])
  })
})

describe('fetchGamePlatformMeta 透出能力表（/meta → api.ts → UI）', () => {
  it('把 /meta.capabilities 归一化后透出给 UI，并保留既有字段', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(SERVER_META_SAMPLE)
    )
    vi.stubGlobal('fetch', fetchMock)

    const meta = await fetchGamePlatformMeta(API_BASE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${API_BASE}/meta`)
    expect(meta.serverVersion).toBe('2026.09.1')
    expect(meta.protocolVersion).toEqual({ min: 1, max: 1 })
    expect(meta.features.daily_tasks).toBe(false)
    expect(meta.capabilities).toEqual({
      leaderboards: false,
      wallet: false,
      daily_tasks: false,
      gomoku_match: true,
      drift_bottle: false,
      verified_reward: false
    })
    expect(meta.capabilitiesDeclared).toEqual(['leaderboards', 'wallet', 'daily_tasks', 'gomoku_match', 'drift_bottle'])
  })

  it('服务端未上线 capabilities 字段 → 全 false（UI 前置隐藏，不误报可用）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ server_version: 'legacy', features: {} })))
    const meta = await fetchGamePlatformMeta(API_BASE)
    expect(meta.capabilities).toEqual(EMPTY_GAME_PLATFORM_CAPABILITIES)
    expect(meta.capabilitiesDeclared).toEqual([])
  })

  it('/meta 请求失败时抛错（由调用方保持保守值，不得静默当作可用）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'UPSTREAM_DOWN', message: '服务不可用' } }, 503)))
    await expect(fetchGamePlatformMeta(API_BASE)).rejects.toThrow('服务不可用')
  })
})
