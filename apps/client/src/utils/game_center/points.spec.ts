/**
 * #909 积分中心访问层单测（Worker C）。
 *
 * 覆盖四类不可回退的约束：
 * 1. **传输安全**：明文非 loopback 地址必须被拒（fail closed），HTTPS / loopback 放行；
 * 2. **认证与错误归一化**：必须带 Identity AT；未登录是可读的 authMissing（不可重试）；
 *    ErrorEnvelope / 网络 / 超时统一映射为 GamePlatformError；
 * 3. **PII 白名单**：归一化结果里不得出现 student_id / sub / user_id / ref_id 等字段
 *    （用 leaderboard.ts 的 FORBIDDEN_LEADERBOARD_KEYS 负向断言）；
 * 4. **分页与文案映射**：limit 夹紧、cursor 键去重、reason_code / entry_type /
 *    task_id / reward_status 全覆盖（新增枚举码时本测试会先失败，避免 UI 静默漏文案）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../identity_access_token', () => ({
  getIdentityAccessToken: vi.fn()
}))

import { getIdentityAccessToken } from '../identity_access_token'
import { FORBIDDEN_LEADERBOARD_KEYS, UNKNOWN_PLAYER_NAME, containsForbiddenLeaderboardKey } from './leaderboard'
import { GamePlatformError } from './api'
import {
  DAILY_TASK_TITLE_I18N_KEYS,
  FEATURE_DISABLED_CODE,
  LEDGER_DEFAULT_LIMIT,
  LEDGER_ENTRY_TYPE_I18N_KEYS,
  LEDGER_REASON_I18N_KEYS,
  REWARD_STATUS_I18N_KEYS,
  clampPageLimit,
  dailyTaskTitleI18nKey,
  fetchPointsDailyTasks,
  fetchPointsLedger,
  fetchPointsWallet,
  formatDelta,
  formatPointsTimestamp,
  isPointsAuthError,
  isPointsFeatureDisabled,
  ledgerEntryTypeI18nKey,
  ledgerReasonI18nKey,
  levelProgressPercent,
  mergeLedgerEntries,
  normalizePointsDailyTasks,
  normalizePointsLedger,
  normalizePointsWallet,
  requirePointsBase,
  rewardStatusI18nKey,
  taskProgressPercent
} from './points'

const tokenMock = vi.mocked(getIdentityAccessToken)
const fetchMock = vi.fn()

const jsonResponse = (payload: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  }) as unknown as Response

const HTTPS_BASE = 'https://game-platform.spec.invalid/api/game-platform/v1'

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  tokenMock.mockReset()
  tokenMock.mockResolvedValue('test-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// 传输安全（HTTPS / loopback 校验）
// ---------------------------------------------------------------------------

describe('points 传输安全（base 校验）', () => {
  it('明文非 loopback 地址被丢弃（绝不采用），回落环境默认 HTTPS 源', () => {
    const resolved = requirePointsBase('http://evil.example.com/api/game-platform/v1')
    expect(resolved).not.toContain('evil.example.com')
    expect(resolved).not.toMatch(/^http:\/\//)
    expect(resolved).toMatch(/^https:\/\//)
  })

  it('loopback http（本地联调）与 HTTPS 自定义域放行', () => {
    expect(requirePointsBase('http://127.0.0.1:8899/api/game-platform/v1')).toBe(
      'http://127.0.0.1:8899/api/game-platform/v1'
    )
    expect(requirePointsBase('http://localhost:8899/api/game-platform/v1')).toBe(
      'http://localhost:8899/api/game-platform/v1'
    )
    expect(requirePointsBase(HTTPS_BASE)).toBe(HTTPS_BASE)
  })

  it('缺省回落环境默认源（非空且 HTTPS）', () => {
    expect(requirePointsBase('')).toMatch(/^https:\/\//)
  })
})

// ---------------------------------------------------------------------------
// 认证与请求形状
// ---------------------------------------------------------------------------

describe('points 认证与请求形状', () => {
  it('未登录：抛 authMissing（不可重试），且**不发起**任何请求', async () => {
    tokenMock.mockResolvedValue(null)
    await expect(fetchPointsWallet({ apiBase: HTTPS_BASE })).rejects.toMatchObject({
      code: 'LOCAL_AUTH_MISSING',
      retryable: false
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('token provider 抛错按未登录降级（不泄漏底层异常）', async () => {
    tokenMock.mockRejectedValue(new Error('keyring unavailable'))
    await expect(fetchPointsDailyTasks({ apiBase: HTTPS_BASE })).rejects.toMatchObject({
      code: 'LOCAL_AUTH_MISSING'
    })
  })

  it('带凭据请求：Authorization 头 + 协议头，且凭据不进 URL', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, xp_total: 120, level: 3, coin_balance: 40 })
    )
    await fetchPointsWallet({ apiBase: HTTPS_BASE })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${HTTPS_BASE}/me/wallet`)
    expect(url).not.toContain('test-token')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-token')
    expect(headers['X-Game-Platform-Protocol']).toBe('1')
    expect(init.cache).toBe('no-store')
  })

  it('账本分页：limit 夹紧到 [1,100] 并透传 cursor（URLSearchParams 编码）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, items: [], next_cursor: null }))
    await fetchPointsLedger({ apiBase: HTTPS_BASE, limit: 500, cursor: 'opaque/cursor+1' })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/me/wallet/ledger?')
    expect(url).toContain('limit=100')
    expect(url).toContain(`cursor=${encodeURIComponent('opaque/cursor+1')}`)
  })

  it('账本缺省分页为契约默认 20', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, items: [] }))
    await fetchPointsLedger({ apiBase: HTTPS_BASE })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain(`limit=${LEDGER_DEFAULT_LIMIT}`)
  })
})

// ---------------------------------------------------------------------------
// 错误归一化
// ---------------------------------------------------------------------------

describe('points 错误归一化', () => {
  it('ErrorEnvelope 细粒度码优先，retryable / httpStatus 透传', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: '请求过于频繁，请稍后再试',
            retryable: true,
            request_id: 'req-1'
          }
        },
        429
      )
    )
    await expect(fetchPointsWallet({ apiBase: HTTPS_BASE })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后再试',
      retryable: true,
      httpStatus: 429,
      requestId: 'req-1'
    })
  })

  it('网络失败 → LOCAL_TRANSPORT_FAILED（可重试）', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(fetchPointsWallet({ apiBase: HTTPS_BASE })).rejects.toMatchObject({
      code: 'LOCAL_TRANSPORT_FAILED',
      retryable: true
    })
  })

  it('超时（AbortError）→ LOCAL_TRANSPORT_FAILED，文案可读', async () => {
    fetchMock.mockRejectedValue({ name: 'AbortError' })
    try {
      await fetchPointsWallet({ apiBase: HTTPS_BASE })
      throw new Error('unreachable')
    } catch (error) {
      const shaped = error as GamePlatformError
      expect(shaped.code).toBe('LOCAL_TRANSPORT_FAILED')
      expect(shaped.message).toContain('超时')
    }
  })

  it('FEATURE_DISABLED 可被识别（占位语义，不是错误重试）', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: { code: FEATURE_DISABLED_CODE, message: '每日任务未开放' } }, 404)
    )
    try {
      await fetchPointsDailyTasks({ apiBase: HTTPS_BASE })
      throw new Error('unreachable')
    } catch (error) {
      expect(isPointsFeatureDisabled(error)).toBe(true)
      expect(isPointsAuthError(error)).toBe(false)
    }
  })

  it('认证类码识别（客户端本地 + 服务端 401）', () => {
    expect(isPointsAuthError({ code: 'LOCAL_AUTH_MISSING' })).toBe(true)
    expect(isPointsAuthError({ code: 'AUTH_REQUIRED' })).toBe(true)
    expect(isPointsAuthError({ code: 'GAME_SESSION_EXPIRED' })).toBe(true)
    expect(isPointsAuthError({ code: 'RATE_LIMITED' })).toBe(false)
    expect(isPointsAuthError(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 归一化：白名单与 PII
// ---------------------------------------------------------------------------

/** 模拟服务端多返回 PII（真实响应不会返回，这里验证客户端白名单的纵深防御） */
const walletPayloadWithPii = {
  ok: true,
  player_ref: 'a1b2c3d4e5f6a7b8',
  student_id: '2023001234',
  sub: 'identity-sub-1',
  user_id: 'u-1',
  xp_total: 320,
  level: 4,
  level_curve: { level: 4, xp_into_level: 90, xp_for_next: 110, xp_span: 200 },
  coin_balance: 88,
  today: { date: '2026-09-30', xp_gained: 25, coin_gained: 6, run_count: 2 },
  daily_caps: { xp_cap: 100, coin_cap: null, run_cap: 20 },
  rule_version: 'economy-v1',
  economy_enabled: true
}

describe('points 归一化白名单（PII 纵深防御）', () => {
  it('钱包归一化保留契约字段并丢弃任何 PII', () => {
    const wallet = normalizePointsWallet(walletPayloadWithPii)
    expect(wallet).toEqual({
      playerRef: 'a1b2c3d4e5f6a7b8',
      xpTotal: 320,
      level: 4,
      levelCurve: { xpIntoLevel: 90, xpForNext: 110, xpSpan: 200 },
      coinBalance: 88,
      today: { date: '2026-09-30', xpGained: 25, coinGained: 6, runCount: 2 },
      dailyCaps: { xpCap: 100, coinCap: null, runCap: 20 },
      ruleVersion: 'economy-v1',
      economyEnabled: true
    })
    expect(containsForbiddenLeaderboardKey(wallet)).toBe(false)
    const serialized = JSON.stringify(wallet)
    for (const forbidden of FORBIDDEN_LEADERBOARD_KEYS) {
      expect(serialized, `不得出现 ${forbidden}`).not.toContain(`"${forbidden}"`)
    }
    expect(serialized).not.toContain('2023001234')
    expect(serialized).not.toContain('identity-sub-1')
  })

  it('钱包空值 / 非法值回落安全模型（不抛错）', () => {
    expect(normalizePointsWallet(null).xpTotal).toBe(0)
    expect(normalizePointsWallet({ xp_total: 'abc', level: -5, coin_balance: null })).toMatchObject({
      xpTotal: 0,
      level: 0,
      coinBalance: 0
    })
    expect(normalizePointsWallet({ wallet: { xp_total: 7 } })).toMatchObject({ xpTotal: 7 })
    expect(normalizePointsWallet({ data: { xp_total: 9 } })).toMatchObject({ xpTotal: 9 })
  })

  it('账本归一化：丢弃 ref_id / 幂等键，保留正负金额与游标', () => {
    const page = normalizePointsLedger({
      ok: true,
      items: [
        {
          entry_id: 'entry-1',
          entry_type: 'reward',
          reason_code: 'run_settled',
          xp_delta: 15,
          coin_delta: 3,
          ref_id: 'run-abc',
          idempotency_key: 'settle:player:run',
          rule_version: 'economy-v1',
          created_at: '2026-09-30T08:00:00Z'
        },
        {
          entry_type: 'escrow_hold',
          reason_code: 'bottle_create',
          xp_delta: 0,
          coin_delta: -50,
          ref_id: 'bottle-1',
          created_at: '2026-09-30T09:00:00Z'
        }
      ],
      next_cursor: 'cursor-2',
      rule_version: 'economy-v1'
    })
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toMatchObject({
      key: 'entry-1',
      entryType: 'reward',
      reasonCode: 'run_settled',
      xpDelta: 15,
      coinDelta: 3
    })
    expect(page.items[1]).toMatchObject({ entryType: 'escrow_hold', coinDelta: -50 })
    // 缺 entry_id 的条目用占位 key（绝不含 player_id / run_id）
    expect(page.items[1].key).toContain('seq:bottle_create')
    expect(page.nextCursor).toBe('cursor-2')
    const serialized = JSON.stringify(page)
    expect(serialized).not.toContain('ref_id')
    expect(serialized).not.toContain('idempotency_key')
    expect(serialized).not.toContain('run-abc')
  })

  it('账本非数组 / 非法项不抛错', () => {
    expect(normalizePointsLedger(null).items).toEqual([])
    expect(normalizePointsLedger({ items: [null, 'x', 3] }).items).toEqual([])
  })

  it('每日任务归一化：字段映射 + 非法项丢弃', () => {
    const snapshot = normalizePointsDailyTasks({
      ok: true,
      date: '2026-09-30',
      tasks: [
        {
          task_id: 'daily_play_1',
          title: '完成 1 局游戏',
          target: 1,
          progress: 1,
          completed: true,
          reward_xp: 5,
          reward_coin: 2,
          reward_status: 'granted'
        },
        { title: '缺 task_id' },
        null
      ],
      rule_version: 'economy-v1',
      everyday_reset_at: '2026-10-01T00:00:00+08:00'
    })
    expect(snapshot.date).toBe('2026-09-30')
    expect(snapshot.tasks).toHaveLength(1)
    expect(snapshot.tasks[0]).toMatchObject({
      taskId: 'daily_play_1',
      target: 1,
      progress: 1,
      completed: true,
      rewardXp: 5,
      rewardCoin: 2,
      rewardStatus: 'granted'
    })
    expect(snapshot.everydayResetAt).toBe('2026-10-01T00:00:00+08:00')
    expect(containsForbiddenLeaderboardKey(snapshot)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 分页 / 去重 / 计算
// ---------------------------------------------------------------------------

describe('points 分页与计算', () => {
  it('clampPageLimit：越界夹紧、非法回落默认值', () => {
    expect(clampPageLimit(undefined, 20)).toBe(20)
    expect(clampPageLimit(0, 20)).toBe(20)
    expect(clampPageLimit(-3, 20)).toBe(20)
    expect(clampPageLimit('abc', 50)).toBe(50)
    expect(clampPageLimit(1, 50)).toBe(1)
    expect(clampPageLimit(100, 50)).toBe(100)
    expect(clampPageLimit(101, 50)).toBe(100)
    expect(clampPageLimit(2.7, 50)).toBe(2)
  })

  it('账本追加页按键去重（重复游标不产生重复行）', () => {
    const first = normalizePointsLedger({
      items: [
        { entry_id: 'a', reason_code: 'run_settled', xp_delta: 1, coin_delta: 0 },
        { entry_id: 'b', reason_code: 'run_settled', xp_delta: 2, coin_delta: 0 }
      ]
    })
    const second = normalizePointsLedger({
      items: [
        { entry_id: 'b', reason_code: 'run_settled', xp_delta: 2, coin_delta: 0 },
        { entry_id: 'c', reason_code: 'admin_manual', xp_delta: 0, coin_delta: 5 }
      ]
    })
    const merged = mergeLedgerEntries(first.items, second.items)
    expect(merged.map((item) => item.key)).toEqual(['a', 'b', 'c'])
  })

  it('升级进度百分比：边界钳制，跨度非法时为 0', () => {
    expect(levelProgressPercent({ xpIntoLevel: 90, xpForNext: 110, xpSpan: 200 })).toBe(45)
    expect(levelProgressPercent({ xpIntoLevel: 0, xpForNext: 0, xpSpan: 0 })).toBe(0)
    expect(levelProgressPercent({ xpIntoLevel: 999, xpForNext: 0, xpSpan: 100 })).toBe(100)
    expect(levelProgressPercent({ xpIntoLevel: -5, xpForNext: 0, xpSpan: 100 })).toBe(0)
  })

  it('任务进度百分比：target 非法时为 0，超过目标钳制 100', () => {
    expect(taskProgressPercent(1, 3)).toBe(33)
    expect(taskProgressPercent(3, 3)).toBe(100)
    expect(taskProgressPercent(5, 3)).toBe(100)
    expect(taskProgressPercent(1, 0)).toBe(0)
    expect(taskProgressPercent('x', 'y')).toBe(0)
  })

  it('金额差值：正数带 +，0 与负数原样', () => {
    expect(formatDelta(12)).toBe('+12')
    expect(formatDelta(0)).toBe('0')
    expect(formatDelta(-5)).toBe('-5')
    expect(formatDelta('+7')).toBe('+7')
    expect(formatDelta('abc')).toBe('0')
  })

  it('时间戳格式化：空 → 空；非法 → 原样；合法 → YYYY-MM-DD HH:mm', () => {
    expect(formatPointsTimestamp('')).toBe('')
    expect(formatPointsTimestamp(null)).toBe('')
    expect(formatPointsTimestamp('not-a-date')).toBe('not-a-date')
    // 无时区 ISO 字符串按本地时间解析，输出与运行机器时区无关
    expect(formatPointsTimestamp('2026-09-30T08:05:00')).toBe('2026-09-30 08:05')
  })
})

// ---------------------------------------------------------------------------
// 文案映射（服务端冻结枚举全覆盖）
// ---------------------------------------------------------------------------

describe('points 文案映射（枚举全覆盖）', () => {
  it('reason_code 九个冻结枚举全部有中文映射 key', () => {
    const codes = [
      'run_settled',
      'daily_cap_applied',
      'reward_disabled',
      'bottle_create',
      'bottle_claim',
      'bottle_expired',
      'bottle_self_claim_rejected',
      'season_finalized',
      'admin_manual'
    ]
    for (const code of codes) {
      const key = ledgerReasonI18nKey(code)
      expect(key, `${code} 缺少映射`).toContain('gameCenter.points.reason.')
      expect(Object.values(LEDGER_REASON_I18N_KEYS)).toContain(key)
    }
    // 映射值唯一（避免两个码指向同一文案导致误读）
    expect(new Set(Object.values(LEDGER_REASON_I18N_KEYS)).size).toBe(codes.length)
    expect(ledgerReasonI18nKey('unknown_code')).toBe('')
  })

  it('entry_type 八个冻结枚举全部有映射', () => {
    for (const code of [
      'reward',
      'quest_reward',
      'season_reward',
      'escrow_hold',
      'escrow_release',
      'escrow_refund',
      'penalty',
      'admin_adjust'
    ]) {
      const key = ledgerEntryTypeI18nKey(code)
      expect(key, `${code} 缺少映射`).toContain('gameCenter.points.entryType.')
      expect(Object.values(LEDGER_ENTRY_TYPE_I18N_KEYS)).toContain(key)
    }
    expect(new Set(Object.values(LEDGER_ENTRY_TYPE_I18N_KEYS)).size).toBe(8)
    expect(ledgerEntryTypeI18nKey('nope')).toBe('')
  })

  it('V1 三个任务的 task_id 有本地标题（不依赖服务端 title）', () => {
    for (const taskId of ['daily_play_1', 'daily_play_3', 'daily_play_distinct_3']) {
      expect(dailyTaskTitleI18nKey(taskId), `${taskId} 缺少映射`).toContain('gameCenter.points.task.')
    }
    expect(dailyTaskTitleI18nKey('daily_future_task')).toBe('')
    expect(Object.keys(DAILY_TASK_TITLE_I18N_KEYS)).toHaveLength(3)
  })

  it('reward_status 五个枚举值全部有映射', () => {
    for (const status of ['granted', 'capped', 'disabled', 'none', 'zero']) {
      expect(rewardStatusI18nKey(status), `${status} 缺少映射`).toContain('gameCenter.points.reward')
    }
    expect(Object.keys(REWARD_STATUS_I18N_KEYS)).toHaveLength(5)
    expect(rewardStatusI18nKey('weird')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// 默认玩家名（昵称缺失不得回落学号）
// ---------------------------------------------------------------------------

describe('昵称脱敏占位', () => {
  it('UNKNOWN_PLAYER_NAME 仍为「湖工学子」契约值', () => {
    expect(UNKNOWN_PLAYER_NAME).toBe('湖工学子')
  })
})
