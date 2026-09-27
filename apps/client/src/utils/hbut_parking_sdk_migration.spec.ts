import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_PARKING_ADAPTER } from '../../../../website/modules-src/hbut_parking/project/src/utils/game_sdk_adapter.js'
import { computeParkingScore } from '../../../../website/modules-src/hbut_parking/project/src/game/parking.js'
import {
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hbut_parking/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchCall, FetchRoute } from './_sdk_test_harness'

/**
 * #907d 迁移守卫：hbut_parking（湖工挪车）。
 *
 * 覆盖三件事：
 * 1. 接入形态（main.js 只经 SDK 提交/查榜；旧 game_rank.js 保留做回滚与只读契约）；
 * 2. adapter 语义（registry §3/§4.9 冻结值：cleared_levels / max 6 / won→cleared / extra 白名单）；
 * 3. payload 等价性（compatibility 老 URL 场景下，Legacy body 与迁移前逐字段对照）。
 */

// 类型探针（迁移指南 §3 步骤 1 自查）：若 game_sdk_adapter.d.ts 的相对深度写错，
// GameAdapter 会退化为 any —— 下面这条 @ts-expect-error 会因「未被使用」报 TS2578，vue-tsc 直接红。
// @ts-expect-error adapter 必须是已类型化的 GameAdapter，而不是 any
export const __parkingAdapterTypeProbe: number = HBUT_PARKING_ADAPTER

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const MAIN = 'website/modules-src/hbut_parking/project/src/main.js'
const ADAPTER = 'website/modules-src/hbut_parking/project/src/utils/game_sdk_adapter.js'
const GAME = 'website/modules-src/hbut_parking/project/src/game/parking.js'
const LEGACY_RANK = 'website/modules-src/hbut_parking/project/src/utils/game_rank.js'

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const LEGACY_QUERY =
  'student_id=20240111&player_name=挪车&class_name=机械2401&major=机械&school_name=湖北工业大学&runtime=module-web&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'

/** 通关（won）时的唯一提交场景：6 关全清，levelIndex 5 */
const WIN_INPUT = {
  score: computeParkingScore({ clearedLevels: 6, totalSteps: 42, durationMs: 98000 }),
  maxLevel: 6,
  durationMs: 98000,
  moveCount: 42,
  endedReason: 'won',
  extra: { clearedLevels: 6, totalSteps: 42, levelIndex: 5 }
}

const metaRoute = (): FetchRoute => ({
  match: '/meta',
  method: 'GET',
  respond: () =>
    okJson({
      protocol_version: { min: 1, max: 1 },
      features: { run_v2: true, settlement: true, economy: false },
      limits: {},
      registry: { games: 12 }
    })
})
const sessionRoute = (): FetchRoute => ({
  match: '/sessions',
  method: 'POST',
  respond: () => okJson({ session_id: 'sid_abcdefghijklmnop', session_token: 'gs_test_token', replayed_session: false })
})
const createRunRoute = (): FetchRoute => ({
  match: '/runs',
  method: 'POST',
  respond: (call: FetchCall) =>
    call.url.endsWith('/runs') ? okJson({ run: { run_id: 'server', status: 'CREATED' }, idempotent_replay: false }) : undefined
})
const finishRoute = (): FetchRoute => ({
  match: /\/runs\/.+\/finish/,
  method: 'POST',
  respond: () => okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied', reward_status: 'disabled' } })
})
const legacySubmitRoute = (): FetchRoute => ({ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) })

/** 老 URL（student_id + rank_api）→ compatibility 经典榜通道 */
const createCompatibilityGame = async (router: ReturnType<typeof createFetchRouter>) => {
  const host = createFakeHostWindow({ search: `?${LEGACY_QUERY}` })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('localStorage', host.win.localStorage)
  Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32', userAgent: 'test' }, configurable: true })
  vi.stubGlobal('fetch', router.fetch)
  return MiniHBUTGame.init({
    gameId: 'hbut_parking',
    adapter: HBUT_PARKING_ADAPTER,
    params: new URLSearchParams(LEGACY_QUERY),
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
}

const createVerifiedGame = async (router: ReturnType<typeof createFetchRouter>) => {
  const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('fetch', router.fetch)
  const pending = MiniHBUTGame.init({
    gameId: 'hbut_parking',
    adapter: HBUT_PARKING_ADAPTER,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 20, ticket: 20 },
    requestTimeoutMs: 60
  })
  const hello = host.lastPosted('mini-hbut:game-sdk:hello')
  expect(hello).toBeTruthy()
  host.deliver({
    type: 'mini-hbut:game-sdk:welcome',
    protocol_version: 1,
    game_id: 'hbut_parking',
    request_id: (hello as Record<string, unknown>).request_id
  })
  return pending
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('hbut_parking adapter 语义（registry §3 / §4.9 冻结值）', () => {
  it('gameId / metric / capabilities / ended_reason / extraKeys 与 registry 一致', () => {
    expect(HBUT_PARKING_ADAPTER.gameId).toBe('hbut_parking')
    expect(HBUT_PARKING_ADAPTER.displayName).toBe('湖工挪车')
    expect(HBUT_PARKING_ADAPTER.metric).toMatchObject({ name: 'cleared_levels', semantics: 'count', max: 6 })
    expect(HBUT_PARKING_ADAPTER.capabilities).toMatchObject({
      ranked: true,
      multiplayer: false,
      economyEligible: true,
      classicMirror: true,
      seasonEligible: true,
      legacyCompatible: true
    })
    expect(HBUT_PARKING_ADAPTER.leaderboard).toEqual({ board: 'classic', order: 'score_desc' })
    // 1:1 换算（不写 fromLegacyMaxLevel/toLegacyMaxLevel 即 SDK 默认恒等）
    expect(HBUT_PARKING_ADAPTER.legacy.maxLevelRule).toBe('1:1')
    expect(HBUT_PARKING_ADAPTER.endedReasonMap).toEqual({ won: 'cleared' })
    expect(HBUT_PARKING_ADAPTER.extraKeys).toEqual(['clearedLevels', 'totalSteps', 'levelIndex'])
  })

  it('maxLevel 1:1 → metric.value；超过 6 本地即拒（风控上限）', () => {
    const { result } = HBUT_PARKING_ADAPTER.buildResult(WIN_INPUT)
    expect(result).toEqual({
      schema_version: 1,
      score: 59482,
      metric: { name: 'cleared_levels', value: 6 },
      moves: 42,
      ended_reason: 'cleared',
      extra: { clearedLevels: 6, totalSteps: 42, levelIndex: 5 }
    })
    // metric.max = 6：7 关不存在，异常路径也必须本地拦截（避免服务端 QUARANTINED）
    expect(() => HBUT_PARKING_ADAPTER.buildResult({ ...WIN_INPUT, maxLevel: 7, extra: {} })).toThrowError()
  })

  it('extra 是白名单：未声明键被静默丢弃且记录在 diagnostics.droppedExtraKeys', () => {
    const { result, diagnostics } = HBUT_PARKING_ADAPTER.buildResult({
      ...WIN_INPUT,
      extra: { clearedLevels: 6, totalSteps: 42, levelIndex: 5, student_id: '20240111', internalFlag: 1 }
    })
    expect(result.extra).toEqual({ clearedLevels: 6, totalSteps: 42, levelIndex: 5 })
    expect(diagnostics.droppedExtraKeys).toEqual(['student_id', 'internalFlag'])
  })

  it('toLegacyPayload 反算：max_level 1:1、payload 保留三个 extra 键', () => {
    const legacy = HBUT_PARKING_ADAPTER.toLegacyPayload({
      result: HBUT_PARKING_ADAPTER.buildResult(WIN_INPUT).result,
      durationMs: 98000
    })
    expect(legacy).toEqual({
      score: 59482,
      max_level: 6,
      move_count: 42,
      ended_reason: 'cleared',
      duration_ms: 98000,
      payload: { clearedLevels: 6, totalSteps: 42, levelIndex: 5 }
    })
  })
})

describe('hbut_parking 接入形态守卫（main.js 已替换 3 处调用）', () => {
  it('import 走 SDK 相对路径，且不再使用旧 game_rank 工具', () => {
    const source = read(MAIN)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain('MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_PARKING_ADAPTER })')
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).not.toContain('createRunId(')
  })

  it('旧 game_rank.js 仍保留（回滚安全 + 只读契约测试依赖）', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'hbut_parking'")
    expect(source).toContain('export const submitGameRank')
    expect(source).toContain('export const fetchGameLeaderboard')
  })

  it('adapter 声明文件保留 registry 冻结取值（防止被再次改写/抹平）', () => {
    const source = read(ADAPTER)
    expect(source).toContain("gameId: 'hbut_parking'")
    expect(source).toContain("name: 'cleared_levels'")
    expect(source).toContain('max: 6')
    expect(source).toContain("endedReasonMap: { won: 'cleared' }")
    expect(source).toContain("extraKeys: ['clearedLevels', 'totalSteps', 'levelIndex']")
  })

  it('「只有通关（won）才提交」保持：唯一 finish 调用点由 status === won 守卫', () => {
    const source = read(MAIN)
    // 唯一触发点：maybeSubmitTerminal 内 won 判定（失败/进行中一律不提交）
    expect(source).toContain("if (state.status === 'won' && state.status !== lastTerminalStatus)")
    expect(source).toContain("void submitTerminalScore('won')")
    expect(source).not.toContain("submitTerminalScore('lost')")
    expect(source.match(/run\.finish\(/g)).toHaveLength(1)
    // 状态机层：挪车只有 playing / won，不存在 lost 分支
    const gameSource = read(GAME)
    expect(gameSource).toContain("status: 'playing'")
    expect(gameSource).toContain("status: 'won'")
    expect(gameSource).not.toMatch(/status:\s*'lost'/)
  })

  it('提交数值语义逐字保留（score 公式 / maxLevel / moveCount / durationMs 只取一次）', () => {
    const source = read(MAIN)
    expect(source).toContain('score: computeParkingScore({')
    expect(source).toContain('clearedLevels: state.clearedLevels,')
    expect(source).toContain('totalSteps: state.totalSteps,')
    expect(source).toContain('maxLevel: state.clearedLevels || state.levelNumber || 1,')
    expect(source).toContain('moveCount: state.totalSteps,')
    expect(source).toContain('durationMs: duration')
    expect(source).toContain('clearedLevels: state.clearedLevels,')
    expect(source).toContain('levelIndex: state.levelIndex')
    // 旧代码在提交路径调用两次 durationMs()；迁移后只取一次并复用同一时刻（指南 §8 特别要求）
    expect(source.match(/const duration = durationMs\(\)/g)).toHaveLength(1)
    expect(source.match(/durationMs: duration\b/g)).toHaveLength(2)
  })

  it('重开一局 = 新 run（SDK 生成 run_id，replaceActive 替换旧 run）', () => {
    const source = read(MAIN)
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
    expect(source).toContain('let run = sdkGame.startRun()')
  })

  it('排行榜入口跟随最终模式：ready 后刷新 + standalone 隐藏，且不用顶层 await', () => {
    const source = read(MAIN)
    expect(source).toContain('applyRankAvailability')
    expect(source).toContain('void sdkGame.ready.then(')
    expect(source).not.toMatch(/^\s*await\s+sdkGame\.ready/m)
  })

  it('保留宿主高度上报 / 动态视口 / 安全渲染异常文本（冻结契约）', () => {
    const source = read(MAIN)
    expect(source).toContain('mini-hbut:module-size')
    expect(source).toContain('module_id: MODULE_ID')
    expect(source).toContain('--module-vh')
    expect(source).toContain('orientationchange')
    expect(source).toContain("content.innerHTML = '<div class=\"leaderboard-error\"></div>'")
    expect(source).toContain('errorBox.textContent')
  })

  it('main.js 不把学号等身份字段写进任何请求体（actor 只来自服务端）', () => {
    const source = read(MAIN)
    expect(source).not.toMatch(/student_id\s*:|\.student_id|studentId\s*:/)
    expect(source).not.toMatch(/xp_amount|coin_amount|reward_amount/)
  })
})

describe('hbut_parking 提交链路：payload 等价与幂等', () => {
  it('compatibility 老 URL：Legacy body 与迁移前逐字段等价（唯一差异 = ended_reason 归一为 cleared）', async () => {
    const router = createFetchRouter([legacySubmitRoute()])
    const game = await createCompatibilityGame(router)
    expect(game.mode).toBe('compatibility')

    const run = game.startRun({ runId: 'run_equivalence_parking_1', startedAt: 1700000000000 })
    const outcome = await run.finish(WIN_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    // 迁移前的实现（只读契约仍在用的 game_rank.js）构造同一局请求
    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    const context = readGameModuleContext()
    await submitGameRank(context, { runId: 'run_equivalence_parking_1', ...WIN_INPUT, extra: { ...WIN_INPUT.extra } })

    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))
    const sdkBody = router.callsFor('/submit')[0].body as Record<string, unknown>
    // 除 ended_reason 外逐字段相等（数值零改动）
    expect({ ...sdkBody, ended_reason: legacyBody.ended_reason }).toEqual(legacyBody)
    // 唯一差异：guide §5.1 / registry §5 / protocol §4.2 规定 won → cleared
    expect(legacyBody.ended_reason).toBe('won')
    expect(sdkBody.ended_reason).toBe('cleared')
    expect(sdkBody.game_id).toBe('hbut_parking')
    expect(sdkBody.score).toBe(59482)
    expect(sdkBody.max_level).toBe(6)
    expect(sdkBody.move_count).toBe(42)
    expect(sdkBody.duration_ms).toBe(98000)
    expect(sdkBody.payload).toEqual({ clearedLevels: 6, totalSteps: 42, levelIndex: 5 })
    game.dispose()
  })

  it('verified 模式：V2 envelope 的 metric.value=cleared_levels=6，且不含任何身份字段', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishRoute()])
    const game = await createVerifiedGame(router)
    expect(game.mode).toBe('verified')

    const run = game.startRun({ runId: 'run_verified_parking_1' })
    const outcome = await run.finish(WIN_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'verified', uploaded: true })

    const call = router.callsFor(/\/finish/)[0]
    expect(call.body).toMatchObject({
      game_id: 'hbut_parking',
      run_id: 'run_verified_parking_1',
      duration_ms: 98000,
      result: {
        schema_version: 1,
        score: 59482,
        metric: { name: 'cleared_levels', value: 6 },
        moves: 42,
        ended_reason: 'cleared',
        extra: { clearedLevels: 6, totalSteps: 42, levelIndex: 5 }
      },
      require_rewards: false
    })
    expect(JSON.stringify(call.body)).not.toMatch(/student_id|player_id|user_id|xp_amount|coin_amount/)
    game.dispose()
  })

  it('同一 run 重复 finish 不发第二次请求；重开一局（replaceActive）才允许再次提交', async () => {
    const router = createFetchRouter([legacySubmitRoute()])
    const game = await createCompatibilityGame(router)

    const first = game.startRun({ runId: 'run_parking_first' })
    await first.finish(WIN_INPUT)
    const duplicate = await first.finish(WIN_INPUT)
    expect(duplicate.duplicate).toBe(true)
    expect(router.callsFor('/submit')).toHaveLength(1)

    // 对应「重新开始」按钮：新一局 = 新 run_id
    const second = game.startRun({ replaceActive: true })
    expect(second.id).not.toBe(first.id)
    await second.finish(WIN_INPUT)
    const runIds = router.callsFor('/submit').map((call) => (call.body as { run_id: string }).run_id)
    expect(runIds).toEqual(['run_parking_first', second.id])
    game.dispose()
  })

  it('standalone（无任何凭据）：本地成功、零请求（不上传、不查榜）', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_parking',
      adapter: HBUT_PARKING_ADAPTER,
      params: new URLSearchParams(''),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.capabilities.canSubmit).toBe(false)
    const run = game.startRun()
    const outcome = await run.finish(WIN_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    expect(outcome.message).toContain('本地')
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})
