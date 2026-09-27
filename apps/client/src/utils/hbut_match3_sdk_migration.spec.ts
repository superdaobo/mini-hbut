import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame, createGameAdapter } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_MATCH3_ADAPTER } from '../../../../website/modules-src/hbut_match3/project/src/utils/game_sdk_adapter.js'
import {
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hbut_match3/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchCall, FetchRoute } from './_sdk_test_harness'

/**
 * #907d 迁移守卫：hbut_match3（湖工消消乐）。
 *
 * 高风险点（最重灾区）：Legacy `max_level` 硬编码 1 与 `metric.max = 0` 冲突，
 * 必须同时声明 `fromLegacyMaxLevel: () => 0` 与 `toLegacyMaxLevel: () => 1`：
 * - 漏 from → maxLevel 1 被折算为 metric.value 1 > 0 → 本地 SCHEMA_INVALID（静默丢分）；
 * - 漏 to   → dual-write 反算 max_level = 0 → 经典榜数值错位。
 * 下面「陷阱对照」用例用真实 SDK 复现这两种失败，再断言本 adapter 两个方向都正确。
 */

// 类型探针（迁移指南 §3 步骤 1 自查）：若 game_sdk_adapter.d.ts 的相对深度写错，
// GameAdapter 会退化为 any —— 下面这条 @ts-expect-error 会因「未被使用」报 TS2578，vue-tsc 直接红。
// @ts-expect-error adapter 必须是已类型化的 GameAdapter，而不是 any
export const __match3AdapterTypeProbe: number = HBUT_MATCH3_ADAPTER

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const MAIN = 'website/modules-src/hbut_match3/project/src/main.js'
const ADAPTER = 'website/modules-src/hbut_match3/project/src/utils/game_sdk_adapter.js'
const GAME = 'website/modules-src/hbut_match3/project/src/game/match3.js'
const LEGACY_RANK = 'website/modules-src/hbut_match3/project/src/utils/game_rank.js'

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const LEGACY_QUERY =
  'student_id=20240111&player_name=消消乐&class_name=机械2401&major=机械&school_name=湖北工业大学&runtime=module-web&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'

/** 步数耗尽（lost）时的唯一提交场景：30 步用完，最终 1280 分 */
const LOST_INPUT = {
  score: 1280,
  maxLevel: 1,
  durationMs: 60000,
  moveCount: 30,
  endedReason: 'lost',
  extra: { movesLeft: 0, chainPeak: 4, moveLimit: 30 }
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
    gameId: 'hbut_match3',
    adapter: HBUT_MATCH3_ADAPTER,
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
    gameId: 'hbut_match3',
    adapter: HBUT_MATCH3_ADAPTER,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 20, ticket: 20 },
    requestTimeoutMs: 60
  })
  const hello = host.lastPosted('mini-hbut:game-sdk:hello')
  expect(hello).toBeTruthy()
  host.deliver({
    type: 'mini-hbut:game-sdk:welcome',
    protocol_version: 1,
    game_id: 'hbut_match3',
    request_id: (hello as Record<string, unknown>).request_id
  })
  return pending
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('hbut_match3 adapter 语义（registry §3 / §4.10 冻结值）', () => {
  it('gameId / metric / capabilities / ended_reason / extraKeys 与 registry 一致', () => {
    expect(HBUT_MATCH3_ADAPTER.gameId).toBe('hbut_match3')
    expect(HBUT_MATCH3_ADAPTER.displayName).toBe('湖工消消乐')
    // 无等级语义：metric.value 恒 0，排序只看 score
    expect(HBUT_MATCH3_ADAPTER.metric).toMatchObject({ name: 'score_only', semantics: 'none', max: 0 })
    expect(HBUT_MATCH3_ADAPTER.capabilities).toMatchObject({
      ranked: true,
      multiplayer: false,
      economyEligible: true,
      classicMirror: true,
      seasonEligible: true,
      legacyCompatible: true
    })
    expect(HBUT_MATCH3_ADAPTER.leaderboard).toEqual({ board: 'classic', order: 'score_desc' })
    expect(HBUT_MATCH3_ADAPTER.endedReasonMap).toEqual({ lost: 'lost' })
    expect(HBUT_MATCH3_ADAPTER.extraKeys).toEqual(['movesLeft', 'chainPeak', 'moveLimit'])
  })

  it('双向换算：Legacy maxLevel=1 → metric.value=0；反算 metric.value=0 → max_level=1', () => {
    const { result } = HBUT_MATCH3_ADAPTER.buildResult(LOST_INPUT)
    expect(result).toEqual({
      schema_version: 1,
      score: 1280,
      metric: { name: 'score_only', value: 0 },
      moves: 30,
      ended_reason: 'lost',
      extra: { movesLeft: 0, chainPeak: 4, moveLimit: 30 }
    })
    // dual-write 反算必须写回 1（经典榜历史数值语义）
    const legacy = HBUT_MATCH3_ADAPTER.toLegacyPayload({ result, durationMs: 60000 })
    expect(legacy).toEqual({
      score: 1280,
      max_level: 1,
      move_count: 30,
      ended_reason: 'lost',
      duration_ms: 60000,
      payload: { movesLeft: 0, chainPeak: 4, moveLimit: 30 }
    })
  })

  it('陷阱对照（指南 §9.10）：漏写任一方向都会造成丢分 / 数值错位，本 adapter 两个方向都已声明', () => {
    // 漏 fromLegacyMaxLevel / toLegacyMaxLevel 的"裸 adapter"
    const naive = createGameAdapter({
      gameId: 'hbut_match3',
      metric: { name: 'score_only', semantics: 'none', max: 0 },
      result: { extraKeys: ['movesLeft', 'chainPeak', 'moveLimit'] }
    })
    // 漏 from：maxLevel=1 → metric.value=1 > metric.max=0 → 本地 SCHEMA_INVALID（不发请求、静默丢分）
    expect(() => naive.buildResult(LOST_INPUT)).toThrowError()
    // 漏 to：反算 max_level=0 → 经典榜数值错位
    const naiveLegacy = naive.toLegacyPayload({
      result: { score: 1280, metric: { name: 'score_only', value: 0 }, moves: 30, ended_reason: 'lost', extra: {} },
      durationMs: 60000
    })
    expect(naiveLegacy.max_level).toBe(0)
    // 本 adapter：入向 1→0、出向 0→1，两端都正确
    expect(HBUT_MATCH3_ADAPTER.buildResult(LOST_INPUT).result.metric).toEqual({ name: 'score_only', value: 0 })
    expect(HBUT_MATCH3_ADAPTER.toLegacyPayload({ result: HBUT_MATCH3_ADAPTER.buildResult(LOST_INPUT).result }).max_level).toBe(1)
  })

  it('extra 是白名单：未声明键被丢弃且记录在 diagnostics.droppedExtraKeys', () => {
    const { result, diagnostics } = HBUT_MATCH3_ADAPTER.buildResult({
      ...LOST_INPUT,
      extra: { movesLeft: 0, chainPeak: 4, moveLimit: 30, seed: 42 }
    })
    expect(result.extra).toEqual({ movesLeft: 0, chainPeak: 4, moveLimit: 30 })
    expect(diagnostics.droppedExtraKeys).toEqual(['seed'])
  })
})

describe('hbut_match3 接入形态守卫（main.js 已替换 3 处调用）', () => {
  it('import 走 SDK 相对路径，且不再使用旧 game_rank 工具', () => {
    const source = read(MAIN)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain('MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_MATCH3_ADAPTER })')
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).not.toContain('createRunId(')
  })

  it('旧 game_rank.js 仍保留（回滚安全 + 只读契约测试依赖）', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'hbut_match3'")
    expect(source).toContain('export const submitGameRank')
    expect(source).toContain('export const fetchGameLeaderboard')
  })

  it('adapter 声明文件保留 registry 冻结取值（防止被再次改写/抹平）', () => {
    const source = read(ADAPTER)
    expect(source).toContain("gameId: 'hbut_match3'")
    expect(source).toContain("name: 'score_only'")
    expect(source).toContain('max: 0')
    expect(source).toContain('fromLegacyMaxLevel: () => 0')
    expect(source).toContain('toLegacyMaxLevel: () => 1')
    expect(source).toContain("endedReasonMap: { lost: 'lost' }")
    expect(source).toContain("extraKeys: ['movesLeft', 'chainPeak', 'moveLimit']")
  })

  it('「步数耗尽（lost）才提交」保持：唯一 finish 调用点由 status === lost 守卫', () => {
    const source = read(MAIN)
    expect(source).toContain("if (state.status === 'lost' && state.status !== lastTerminalStatus)")
    expect(source).toContain("void submitTerminalScore('lost')")
    expect(source).not.toContain("submitTerminalScore('won')")
    expect(source.match(/run\.finish\(/g)).toHaveLength(1)
    // 状态机层：只有步数耗尽才置 lost（selectCell 内 movesLeft <= 0）
    expect(read(GAME)).toContain("next = { ...next, status: 'lost' }")
  })

  it('提交数值语义逐字保留（maxLevel 硬编码 1 / moveCount / durationMs / extra 三键）', () => {
    const source = read(MAIN)
    expect(source).toContain('score: state.score,')
    expect(source).toContain('maxLevel: 1,')
    expect(source).toContain('moveCount: state.moveLimit - state.movesLeft,')
    expect(source).toContain('durationMs: Math.max(0, Date.now() - run.startedAt),')
    expect(source).toContain('movesLeft: state.movesLeft,')
    expect(source).toContain('chainPeak: state.chainPeak,')
    expect(source).toContain('moveLimit: state.moveLimit')
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

describe('hbut_match3 提交链路：payload 等价与幂等', () => {
  it('compatibility 老 URL：Legacy body 与迁移前逐字段完全一致（含 max_level=1）', async () => {
    const router = createFetchRouter([legacySubmitRoute()])
    const game = await createCompatibilityGame(router)
    expect(game.mode).toBe('compatibility')

    const run = game.startRun({ runId: 'run_equivalence_match3_1', startedAt: 1700000000000 })
    const outcome = await run.finish(LOST_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    // 迁移前的实现（只读契约仍在用的 game_rank.js）构造同一局请求
    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    const context = readGameModuleContext()
    await submitGameRank(context, { runId: 'run_equivalence_match3_1', ...LOST_INPUT, extra: { ...LOST_INPUT.extra } })

    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))
    const sdkBody = router.callsFor('/submit')[0].body as Record<string, unknown>
    // lost → lost 无映射差异：Legacy body 必须整体逐字段相等
    expect(sdkBody).toEqual(legacyBody)
    expect(sdkBody.game_id).toBe('hbut_match3')
    expect(sdkBody.max_level).toBe(1)
    expect(sdkBody.score).toBe(1280)
    expect(sdkBody.move_count).toBe(30)
    expect(sdkBody.duration_ms).toBe(60000)
    expect(sdkBody.ended_reason).toBe('lost')
    expect(sdkBody.payload).toEqual({ movesLeft: 0, chainPeak: 4, moveLimit: 30 })
    game.dispose()
  })

  it('verified 模式：V2 envelope metric.value 恒 0（排序只看 score），且不含任何身份字段', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishRoute()])
    const game = await createVerifiedGame(router)
    expect(game.mode).toBe('verified')

    const run = game.startRun({ runId: 'run_verified_match3_1' })
    const outcome = await run.finish(LOST_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'verified', uploaded: true })

    const call = router.callsFor(/\/finish/)[0]
    expect(call.body).toMatchObject({
      game_id: 'hbut_match3',
      run_id: 'run_verified_match3_1',
      duration_ms: 60000,
      result: {
        schema_version: 1,
        score: 1280,
        metric: { name: 'score_only', value: 0 },
        moves: 30,
        ended_reason: 'lost',
        extra: { movesLeft: 0, chainPeak: 4, moveLimit: 30 }
      },
      require_rewards: false
    })
    expect(JSON.stringify(call.body)).not.toMatch(/student_id|player_id|user_id|xp_amount|coin_amount/)
    game.dispose()
  })

  it('同一 run 重复 finish 不发第二次请求；重开一局（replaceActive）才允许再次提交', async () => {
    const router = createFetchRouter([legacySubmitRoute()])
    const game = await createCompatibilityGame(router)

    const first = game.startRun({ runId: 'run_match3_first' })
    await first.finish(LOST_INPUT)
    const duplicate = await first.finish(LOST_INPUT)
    expect(duplicate.duplicate).toBe(true)
    expect(router.callsFor('/submit')).toHaveLength(1)

    // 对应「重新开始」按钮：新一局 = 新 run_id
    const second = game.startRun({ replaceActive: true })
    expect(second.id).not.toBe(first.id)
    await second.finish(LOST_INPUT)
    const runIds = router.callsFor('/submit').map((call) => (call.body as { run_id: string }).run_id)
    expect(runIds).toEqual(['run_match3_first', second.id])
    game.dispose()
  })

  it('standalone（无任何凭据）：本地成功、零请求（不上传、不查榜）', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_match3',
      adapter: HBUT_MATCH3_ADAPTER,
      params: new URLSearchParams(''),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.capabilities.canSubmit).toBe(false)
    const run = game.startRun()
    const outcome = await run.finish(LOST_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    expect(outcome.message).toContain('本地')
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})
