import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { CLUMSY_BIRD_ADAPTER } from '../../../../website/modules-src/clumsy_bird_hbut/project/src/utils/game_sdk_adapter.js'
import {
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/clumsy_bird_hbut/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchCall, FetchRoute } from './_sdk_test_harness'

/**
 * #907b 迁移守卫：笨鸟先飞（clumsy_bird_hbut）。
 *
 * 覆盖：接入形态（adapter + 3 处调用）、Legacy body 与迁移前逐字节等价、
 * metric 语义（best_score_legacy = **历史最高分**，historical_best）、standalone 降级、老 URL 入口。
 */

// 类型探针：若 adapter 的 .d.ts 相对深度写错（模块解析失败 → GameAdapter 退化为 any），
// 下面这条 @ts-expect-error 会因「未被使用」而报 TS2578，直接被 vue-tsc 拦下。
// 必须带 export：noUnusedLocals 会把「未使用变量」错误落在同一行，反而让探针失效。
// @ts-expect-error adapter 绝不是 number（用于探测类型是否退化为 any）
export const __clumsyBirdAdapterTypeProbe: number = CLUMSY_BIRD_ADAPTER

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const MAIN = 'website/modules-src/clumsy_bird_hbut/project/src/main.js'
const ADAPTER = 'website/modules-src/clumsy_bird_hbut/project/src/utils/game_sdk_adapter.js'
const LEGACY_RANK = 'website/modules-src/clumsy_bird_hbut/project/src/utils/game_rank.js'

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const RUN_ID = 'run_equivalence_clumsy_1'
const LEGACY_QUERY =
  'student_id=20240111&player_name=飞手&class_name=机械2401&major=机械工程&school_name=湖北工业大学&runtime=module-web&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'

/** 与 FlappyGame._gameOver 回调同形状：score 是本局分，bestScore 是历史最高分（≥ score） */
const GAME_OVER = { score: 37, bestScore: 88, flapCount: 45, durationMs: 41300 }
const FINISH_INPUT = {
  score: GAME_OVER.score,
  maxLevel: GAME_OVER.bestScore,
  durationMs: GAME_OVER.durationMs,
  moveCount: GAME_OVER.flapCount,
  endedReason: 'collision'
}

const submitRoute = (): FetchRoute => ({ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) })
const metaRoute = (): FetchRoute => ({
  match: '/meta',
  method: 'GET',
  respond: () =>
    okJson({ protocol_version: { min: 1, max: 1 }, features: { run_v2: true, settlement: true }, limits: {}, registry: { games: 12 } })
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

/** 老 URL 入口环境：window.location.search + localStorage + navigator.platform 与迁移前一致 */
const useLegacyUrlEnvironment = (search = LEGACY_QUERY) => {
  const host = createFakeHostWindow({ search: `?${search}` })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('localStorage', host.win.localStorage)
  Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32', userAgent: 'test' }, configurable: true })
  return host
}

const initLegacyGame = async (router: ReturnType<typeof createFetchRouter>) => {
  vi.stubGlobal('fetch', router.fetch)
  return MiniHBUTGame.init({
    gameId: 'clumsy_bird_hbut',
    adapter: CLUMSY_BIRD_ADAPTER,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
}

const initVerifiedGame = async (router: ReturnType<typeof createFetchRouter>) => {
  const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('fetch', router.fetch)
  const pending = MiniHBUTGame.init({
    gameId: 'clumsy_bird_hbut',
    adapter: CLUMSY_BIRD_ADAPTER,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 20, ticket: 20 },
    requestTimeoutMs: 60
  })
  const hello = host.lastPosted('mini-hbut:game-sdk:hello')
  if (hello) {
    host.deliver({ type: 'mini-hbut:game-sdk:welcome', protocol_version: 1, game_id: 'clumsy_bird_hbut', request_id: hello.request_id })
  }
  return { game: await pending, host }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('clumsy_bird_hbut 迁移：adapter 语义', () => {
  it('取值与 game-registry §3/§4.4 一致：历史最高分（historical_best），1:1 换算', () => {
    expect(CLUMSY_BIRD_ADAPTER.gameId).toBe('clumsy_bird_hbut')
    expect(CLUMSY_BIRD_ADAPTER.displayName).toBe('笨鸟先飞')
    expect(CLUMSY_BIRD_ADAPTER.metric).toMatchObject({ name: 'best_score_legacy', semantics: 'historical_best', max: 100000 })
    expect(CLUMSY_BIRD_ADAPTER.capabilities).toMatchObject({
      ranked: true,
      multiplayer: false,
      classicMirror: true,
      seasonEligible: true,
      legacyCompatible: true
    })
    expect(CLUMSY_BIRD_ADAPTER.leaderboard).toMatchObject({ board: 'classic' })
    expect(CLUMSY_BIRD_ADAPTER.endedReasonMap.collision).toBe('collision')
    // 迁移前 payload 没有 extra → 空白名单
    expect(CLUMSY_BIRD_ADAPTER.extraKeys).toEqual([])
  })

  it('V2 envelope：metric 取 bestScore（历史最高分），score 仍是本局分（U-R4）', () => {
    const built = CLUMSY_BIRD_ADAPTER.buildResult(FINISH_INPUT)
    expect(built.result).toMatchObject({
      schema_version: 1,
      score: 37,
      metric: { name: 'best_score_legacy', value: 88 },
      moves: 45,
      ended_reason: 'collision',
      extra: {}
    })
    // 反算回 Legacy 榜：max_level 仍是历史最高分（榜上数值不错位）
    expect(CLUMSY_BIRD_ADAPTER.toLegacyPayload({ result: built.result, durationMs: FINISH_INPUT.durationMs })).toEqual({
      score: 37,
      max_level: 88,
      move_count: 45,
      ended_reason: 'collision',
      duration_ms: 41300,
      payload: {}
    })
  })
})

describe('clumsy_bird_hbut 迁移：提交数值等价（老 URL / compatibility）', () => {
  it('Legacy body 与迁移前 game_rank.js 逐字节等价，且 run_id 由 SDK 生成', async () => {
    const router = createFetchRouter([submitRoute()])
    const host = useLegacyUrlEnvironment()
    const game = await initLegacyGame(router)
    expect(game.mode).toBe('compatibility')

    const run = game.startRun({ runId: RUN_ID })
    const outcome = await run.finish(FINISH_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    // 迁移前的同一局：直接调用旧实现（未改动，作为对照基准）
    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    const context = readGameModuleContext()
    await submitGameRank(context, { runId: RUN_ID, ...FINISH_INPUT })

    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))
    const sdkBody = router.callsFor('/submit')[0].body
    expect(sdkBody).toEqual(legacyBody)
    // 只写模块私有 storage key（不串味到全局共享 key）
    const writtenKeys = host.storageWrites.map((item) => item.key)
    expect(writtenKeys).toContain('clumsy_bird_hbut_rank_context_v1')
    expect(writtenKeys).not.toContain('hbut_game_rank_context_v1')
    expect(sdkBody).toMatchObject({
      game_id: 'clumsy_bird_hbut',
      run_id: RUN_ID,
      score: 37,
      max_level: 88,
      move_count: 45,
      duration_ms: 41300,
      ended_reason: 'collision',
      payload: {}
    })
    game.dispose()
  })

  it('verified 模式：V2 finish 请求体含 protocol/game_id，绝无 actor 字段', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishRoute()])
    const { game } = await initVerifiedGame(router)
    expect(game.mode).toBe('verified')

    const run = game.startRun({ runId: RUN_ID })
    const outcome = await run.finish(FINISH_INPUT)
    expect(outcome.success).toBe(true)

    const finishCalls = router.callsFor(/\/finish/)
    expect(finishCalls).toHaveLength(1)
    const body = finishCalls[0].body as Record<string, unknown>
    expect(body).toMatchObject({
      protocol_version: 1,
      game_id: 'clumsy_bird_hbut',
      run_id: RUN_ID,
      duration_ms: 41300,
      result: {
        schema_version: 1,
        score: 37,
        metric: { name: 'best_score_legacy', value: 88 },
        moves: 45,
        ended_reason: 'collision',
        extra: {}
      },
      require_rewards: false
    })
    expect(JSON.stringify(body)).not.toMatch(/student_id|player_id|user_id|xp_amount|coin_amount/)
    game.dispose()
  })

  it('standalone（无 ticket 无旧上下文）：本地记录、零请求、重复 finish 不重复提交', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'clumsy_bird_hbut',
      adapter: CLUMSY_BIRD_ADAPTER,
      params: new URLSearchParams(''),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')

    const run = game.startRun()
    const outcome = await run.finish(FINISH_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    const again = await run.finish(FINISH_INPUT)
    expect(again.duplicate).toBe(true)
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})

describe('clumsy_bird_hbut 迁移：排行榜走 SDK', () => {
  it('老 URL 排行榜：条目经 SDK 归一（display_name 展示、绝不含学号）', async () => {
    const router = createFetchRouter([
      {
        match: '/leaderboard',
        method: 'GET',
        respond: () =>
          okJson({
            leaderboard: [{ rank: 1, player_name: '飞手', class_name: '机械2401', score: 88, student_id: '20240111' }],
            player: { score: 88, class_rank: 2 }
          })
      }
    ])
    useLegacyUrlEnvironment()
    const game = await initLegacyGame(router)

    const result = await game.leaderboard({ scope: 'class', limit: 20 })
    expect(result.success).toBe(true)
    expect(result.entries[0]).toMatchObject({ rank: 1, display_name: '飞手', class_name: '机械2401', score: 88 })
    expect(JSON.stringify(result.entries)).not.toContain('20240111')
    const call = router.callsFor('/leaderboard')[0]
    expect(call.url).toContain('game_id=clumsy_bird_hbut')
    expect(call.url).toContain('scope=class')
    expect(call.url).toContain('limit=20')
    game.dispose()
  })
})

describe('clumsy_bird_hbut 迁移：接入形态与玩法零改动', () => {
  it('main.js 已改走 SDK，且不再 import 旧 game_rank', () => {
    const source = read(MAIN)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain('MiniHBUTGame.create({ gameId: MODULE_ID, adapter: CLUMSY_BIRD_ADAPTER })')
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).not.toContain('createRunId(')
  })

  it('旧 game_rank.js 保留（回滚路径 + 只读契约测试依赖）', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'clumsy_bird_hbut'")
    expect(source).toContain('export const submitGameRank')
    expect(read(ADAPTER)).toContain("gameId: 'clumsy_bird_hbut'")
  })

  it('提交数值语义逐字保留：score=本局分、maxLevel=bestScore、moveCount=flapCount、collision', () => {
    const source = read(MAIN)
    expect(source).toContain('score: data.score')
    expect(source).toContain('maxLevel: data.bestScore')
    expect(source).toContain('durationMs: data.durationMs')
    expect(source).toContain('moveCount: data.flapCount')
    expect(source).toContain("endedReason: 'collision'")
    // 显式开始事件（首次 flap）→ 新一局；模块加载即开局
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
    expect(source).toContain('let run = sdkGame.startRun()')
  })

  it('冻结契约不变：宿主高度上报 / 动态视口 / 错误文本经 textContent 写入', () => {
    const source = read(MAIN)
    expect(source).toContain('mini-hbut:module-size')
    expect(source).toContain('module_id: MODULE_ID')
    expect(source).toContain('--module-vh')
    expect(source).toContain('orientationchange')
    expect(source).toContain('排行榜不可用（缺少用户信息）')
    expect(source).not.toMatch(/student_id\s*:|studentId\s*:/)
    expect(source).not.toMatch(/xp_amount|coin_amount|reward_amount/)
  })
})
