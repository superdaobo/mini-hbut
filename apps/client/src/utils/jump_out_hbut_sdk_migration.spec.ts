import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { JUMP_OUT_HBUT_ADAPTER } from '../../../../website/modules-src/jump_out_hbut/project/src/utils/game_sdk_adapter.js'
import { submitGameRank } from '../../../../website/modules-src/jump_out_hbut/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchRoute } from './_sdk_test_harness'

/**
 * #907a 迁移守卫：跳出湖工大（jump_out_hbut）接入 Game SDK（**旧协议独立通道**）。
 *
 * 该游戏是异构旧协议（snake_case / 失败不 throw / 无默认 API base），因此必须：
 * - `legacyProtocol: 'jump_out'` → 路由到 `_sdk/src/legacy/legacy-jump-out.js`；
 * - payload 字段名改 camelCase（数值不变）；无 `rank_api` → standalone 是预期行为。
 *
 * 本文件同时把「与迁移前请求体的差异」显式钉住（差异只有三处，见提交测试）。
 */

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const APP = 'website/modules-src/jump_out_hbut/project/src/App.vue'
const PANEL = 'website/modules-src/jump_out_hbut/project/src/components/LeaderboardPanel.vue'
const SDK_MODULE = 'website/modules-src/jump_out_hbut/project/src/utils/game_sdk.js'
const ADAPTER = 'website/modules-src/jump_out_hbut/project/src/utils/game_sdk_adapter.js'
const LEGACY_RANK = 'website/modules-src/jump_out_hbut/project/src/utils/game_rank.js'

const RANK_QUERY =
  'student_id=20240077&player_name=跳跃玩家&class_name=电气2402&rank_api=https://rank.example/api/game-rank'

/** 迁移前 App.vue:164-184 的 snake_case payload */
const LEGACY_PAYLOAD = {
  score: 3200,
  max_level: 64,
  duration_ms: 47000,
  move_count: 64,
  run_id: 'run_jumpout_equivalence_1',
  ended_reason: 'fall'
}

const setupEnv = (search: string) => {
  const host = createFakeHostWindow({ search })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('localStorage', host.win.localStorage)
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'test-platform', userAgent: 'test' },
    configurable: true
  })
  return host
}

const initJumpOut = async (router: ReturnType<typeof createFetchRouter>, search = `?${RANK_QUERY}`) => {
  const host = setupEnv(search)
  vi.stubGlobal('fetch', router.fetch)
  const game = await MiniHBUTGame.init({
    gameId: 'jump_out_hbut',
    adapter: JUMP_OUT_HBUT_ADAPTER,
    legacyProtocol: 'jump_out',
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
  return { game, host }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('jump_out_hbut 接入形态（静态守卫）', () => {
  it('App.vue 走共享 SDK 句柄，不再直连旧 game_rank 工具', () => {
    const source = read(APP)
    expect(source).toContain("from './utils/game_sdk.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('createRunId(')
    expect(source).not.toContain('currentRunId')
    expect(source).toContain('let run = sdkGame.startRun()')
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
  })

  it('排行榜面板改走 SDK，保留既有 DOM 与 player_count 展示列', () => {
    const source = read(PANEL)
    expect(source).toContain("from '../utils/game_sdk.js'")
    expect(source).not.toMatch(/from '\.\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).toContain('await sdkGame.leaderboard({ scope: activeScope.value, limit: 30 })')
    expect(source).toContain('player_count')
  })

  it('SDK 句柄是模块作用域单例，且路由到旧协议独立适配层', () => {
    const source = read(SDK_MODULE)
    expect(source).toContain("import { MiniHBUTGame } from '../../../../_sdk/src/index.js'")
    expect(source).toContain('export const sdkGame = MiniHBUTGame.create({')
    expect(source).toContain("legacyProtocol: 'jump_out'")
    expect(source).toContain("export const MODULE_ID = 'jump_out_hbut'")
  })

  it('旧 game_rank.js 仍保留（回滚路径 + 只读契约测试依赖）', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const GAME_ID = 'jump_out_hbut'")
    expect(source).toContain('export async function submitGameRank')
    expect(source).toContain('export async function fetchGameLeaderboard')
    // adapter 文件真实存在且用 createGameAdapter 声明
    expect(read(ADAPTER)).toContain('createGameAdapter({')
  })

  it('提交/重试调用点替换为 run.finish / run.retry，播放数值语义逐字保留', () => {
    const source = read(APP)
    expect(source).toContain('await run.finish({')
    expect(source).toContain('const outcome = await run.retry()')
    expect(source).toContain('maxLevel: jumpCount')
    expect(source).toContain('durationMs: duration')
    expect(source).toContain('moveCount: jumpCount')
    expect(source).toContain("endedReason: 'fall'")
    expect(source).toContain('gameData.uploadFailed')
  })
})

describe('jump_out_hbut adapter 语义（game-registry §3/§4.2）', () => {
  it('metric / capabilities / ended_reason 映射与 registry 一致', () => {
    expect(JUMP_OUT_HBUT_ADAPTER.gameId).toBe('jump_out_hbut')
    expect(JUMP_OUT_HBUT_ADAPTER.metric).toMatchObject({ name: 'jump_count', semantics: 'count', max: 100000 })
    expect(JUMP_OUT_HBUT_ADAPTER.capabilities.legacyCompatible).toBe(true)
    expect(JUMP_OUT_HBUT_ADAPTER.endedReasonMap).toEqual({ fall: 'lost' })
    expect(JUMP_OUT_HBUT_ADAPTER.extraKeys).toEqual([])
  })

  it('metric 1:1 双向换算：jumpCount → Legacy max_level 原值', () => {
    const built = JUMP_OUT_HBUT_ADAPTER.buildResult({ score: 3200, maxLevel: 64, moveCount: 64 })
    expect(built.result.metric).toEqual({ name: 'jump_count', value: 64 })
    expect(JUMP_OUT_HBUT_ADAPTER.toLegacyPayload(built)).toMatchObject({ max_level: 64 })
  })

  it('ended_reason：fall → lost（V2 合法枚举），无 extra', () => {
    const built = JUMP_OUT_HBUT_ADAPTER.buildResult({ score: 1, maxLevel: 1, endedReason: 'fall' })
    expect(built.result.ended_reason).toBe('lost')
    expect(built.diagnostics.endedReasonMapped).toBe(true)
    expect(built.result.extra).toEqual({})
  })

  it('无 rank_api → standalone（旧协议无默认 API base，预期行为）', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'jump_out_hbut',
      adapter: JUMP_OUT_HBUT_ADAPTER,
      legacyProtocol: 'jump_out',
      params: new URLSearchParams('student_id=20240077&player_name=跳跃玩家'),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.capabilities.canSubmit).toBe(false)
    const run = game.startRun()
    const outcome = await run.finish({ score: 100, maxLevel: 3, durationMs: 1000, moveCount: 3, endedReason: 'fall' })
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone' })
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})

describe('jump_out_hbut 提交（旧协议通道，camelCase → snake_case）', () => {
  it('经典榜 body：数值逐字段等价，差异仅为 run_id 未透传 / 追加空 payload / ended_reason 归一化', async () => {
    const router = createFetchRouter([{ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }])
    const { game } = await initJumpOut(router)
    expect(game.mode).toBe('compatibility')

    const run = game.startRun({ runId: 'run_jumpout_equivalence_1', startedAt: 1700000000000 })
    const outcome = await run.finish({
      score: LEGACY_PAYLOAD.score,
      maxLevel: LEGACY_PAYLOAD.max_level,
      durationMs: LEGACY_PAYLOAD.duration_ms,
      moveCount: LEGACY_PAYLOAD.move_count,
      endedReason: LEGACY_PAYLOAD.ended_reason
    })
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    // 迁移前实现（未改动的 game_rank.js，单参数 snake_case）构造同一局请求
    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    await submitGameRank({ ...LEGACY_PAYLOAD })

    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body)) as Record<string, unknown>
    const sdkBody = router.callsFor('/submit')[0].body as Record<string, unknown>
    const legacyKeys = Object.keys(legacyBody).sort()
    const sdkKeys = Object.keys(sdkBody).sort()

    // 差异一：SDK 的旧协议适配层未透传 run_id；差异二：固定附带 extra 容器 payload
    expect(legacyKeys.filter((key) => !sdkKeys.includes(key))).toEqual(['run_id'])
    expect(sdkKeys.filter((key) => !legacyKeys.includes(key))).toEqual(['payload'])
    expect(sdkBody.payload).toEqual({})
    // 差异三：ended_reason 被归一化为 V2 枚举（fall → lost）
    expect(legacyBody.ended_reason).toBe('fall')
    expect(sdkBody.ended_reason).toBe('lost')
    // 其余字段（含身份与数值）逐字段等价
    for (const key of legacyKeys.filter((item) => item !== 'run_id' && item !== 'ended_reason')) {
      expect(sdkBody[key], `字段 ${key} 应保持等价`).toEqual(legacyBody[key])
    }
    expect(sdkBody).toMatchObject({
      game_id: 'jump_out_hbut',
      student_id: '20240077',
      player_name: '跳跃玩家',
      class_name: '电气2402',
      score: 3200,
      max_level: 64,
      move_count: 64,
      duration_ms: 47000
    })
    game.dispose()
  })

  it('同一 run 重复 finish → 只发一次请求；重开一局才生成新 run_id', async () => {
    const router = createFetchRouter([{ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }])
    const { game } = await initJumpOut(router)
    const run = game.startRun()
    const input = { score: 10, maxLevel: 2, durationMs: 1000, moveCount: 2, endedReason: 'fall' }
    const first = await run.finish(input)
    const second = await run.finish(input)
    expect(first.success).toBe(true)
    expect(second.duplicate).toBe(true)
    expect(router.callsFor('/submit')).toHaveLength(1)

    const next = game.startRun({ replaceActive: true })
    expect(next.id).not.toBe(run.id)
    expect(next.id).toMatch(/^run_/)
    await next.finish(input)
    expect(router.callsFor('/submit')).toHaveLength(2)
    game.dispose()
  })

  it('可重试失败 → 保留 pending，run.retry() 复用字节级一致的 body', async () => {
    let attempt = 0
    const route: FetchRoute = {
      match: '/submit',
      method: 'POST',
      respond: () => {
        attempt += 1
        // 第一次 429（retryable）→ 传输层退避重试；第二次 200
        return attempt === 1
          ? new Response(JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁', retryable: true } }), {
              status: 429
            })
          : okJson({ success: true })
      }
    }
    const router = createFetchRouter([route])
    // 注意：初始化必须在真实定时器下完成（Host 握手有 10ms 有界超时），退避重试才用假定时器
    const { game } = await initJumpOut(router)
    const run = game.startRun()
    vi.useFakeTimers()
    const pending = run.finish({ score: 900, maxLevel: 12, durationMs: 9000, moveCount: 12, endedReason: 'fall' })
    await vi.advanceTimersByTimeAsync(2000)
    const outcome = await pending
    expect(outcome.success).toBe(true)
    const bodies = router.callsFor('/submit').map((call) => JSON.stringify(call.body))
    expect(bodies.length).toBe(2)
    expect(new Set(bodies).size).toBe(1)
    game.dispose()
  })

  it('不可重试失败（400）→ 终态且 retry() 不会再发请求', async () => {
    const router = createFetchRouter([
      {
        match: '/submit',
        method: 'POST',
        respond: () => new Response(JSON.stringify({ success: false, error: { code: 'SCHEMA_INVALID', message: '数据不合法' } }), { status: 400 })
      }
    ])
    const { game } = await initJumpOut(router)
    const run = game.startRun()
    const outcome = await run.finish({ score: 1, maxLevel: 1, durationMs: 1000, moveCount: 1, endedReason: 'fall' })
    expect(outcome.success).toBe(false)
    expect(outcome.retryable).toBe(false)
    const retried = await run.retry()
    expect(retried.success).toBe(false)
    expect(router.callsFor('/submit')).toHaveLength(1)
    game.dispose()
  })

  it('榜单走 SDK：旧协议排行榜通过 /leaderboard 读取且条目归一（含 player_count 回落）', async () => {
    const router = createFetchRouter([
      {
        match: '/leaderboard',
        method: 'GET',
        respond: () =>
          okJson({
            leaderboard: [
              { rank: 1, player_name: '张三', score: 5000, class_name: '电气2402', is_self: false },
              { rank: 2, class_name: '电气2402', total_score: 12345, player_count: 28 }
            ],
            player: { score: 3200, class_rank: 4 }
          })
      }
    ])
    const { game } = await initJumpOut(router)
    const result = await game.leaderboard({ scope: 'class_total', limit: 30 })
    expect(result.success).toBe(true)
    expect(result.source).toBe('legacy')
    expect(result.entries[1]).toMatchObject({ rank: 2, display_name: '电气2402', score: 12345, total_score: 12345 })
    expect((result.raw as Record<string, unknown>).player).toMatchObject({ class_rank: 4 })
    expect(router.callsFor('/leaderboard')[0].url).toContain('scope=class_total')
    game.dispose()
  })
})
