import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_MEMORY_MATCH_ADAPTER } from '../../../../website/modules-src/hbut_memory_match/project/src/utils/game_sdk_adapter.js'
import {
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hbut_memory_match/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchCall, FetchRoute } from './_sdk_test_harness'

/**
 * #907b 迁移守卫：湖工记忆牌（hbut_memory_match）。
 *
 * 覆盖：接入形态（adapter + 3 处调用）、Legacy body 逐字节等价、metric 换算（max_level = level_index + 1）、
 * standalone 降级、老 URL 入口、tick + 副作用触发的终局判定（lastTerminalStatus 去重）保持不变。
 */

// 类型探针：.d.ts 相对深度写错 → GameAdapter 退化为 any → 这条 @ts-expect-error 会报 TS2578。
// 必须带 export：noUnusedLocals 会掩盖未使用的局部变量错误，导致探针失效。
// @ts-expect-error adapter 绝不是 number（用于探测类型是否退化为 any）
export const __memoryMatchAdapterTypeProbe: number = HBUT_MEMORY_MATCH_ADAPTER

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const MAIN = 'website/modules-src/hbut_memory_match/project/src/main.js'
const ADAPTER = 'website/modules-src/hbut_memory_match/project/src/utils/game_sdk_adapter.js'
const LEGACY_RANK = 'website/modules-src/hbut_memory_match/project/src/utils/game_rank.js'

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const RUN_ID = 'run_equivalence_memory_1'
const LEGACY_QUERY =
  'student_id=20240111&player_name=记牌&class_name=机械2401&major=机械工程&school_name=湖北工业大学&runtime=module-web&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'

/** 与迁移前 submitTerminalScore 的 payload 同形状（四关全通：levelNumber 4 = levelIndex 3） */
const TERMINAL_STATE = { score: 1280, levelNumber: 4, moves: 23, mistakes: 5, levelIndex: 3, combo: 4 }
const FINISH_INPUT = {
  score: TERMINAL_STATE.score,
  maxLevel: TERMINAL_STATE.levelNumber || 1,
  durationMs: 61000,
  moveCount: Number(TERMINAL_STATE.moves || 0),
  endedReason: 'won',
  extra: {
    mistakes: TERMINAL_STATE.mistakes || 0,
    levelIndex: TERMINAL_STATE.levelIndex || 0,
    combo: TERMINAL_STATE.combo || 0
  }
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
    gameId: 'hbut_memory_match',
    adapter: HBUT_MEMORY_MATCH_ADAPTER,
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
    gameId: 'hbut_memory_match',
    adapter: HBUT_MEMORY_MATCH_ADAPTER,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 20, ticket: 20 },
    requestTimeoutMs: 60
  })
  const hello = host.lastPosted('mini-hbut:game-sdk:hello')
  if (hello) {
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_memory_match',
      request_id: hello.request_id
    })
  }
  return { game: await pending, host }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('hbut_memory_match 迁移：adapter 语义', () => {
  it('取值与 game-registry §3/§4.7 一致：level_index / progress_index / max 3，extra 白名单逐字一致', () => {
    expect(HBUT_MEMORY_MATCH_ADAPTER.gameId).toBe('hbut_memory_match')
    expect(HBUT_MEMORY_MATCH_ADAPTER.displayName).toBe('湖工记忆牌')
    expect(HBUT_MEMORY_MATCH_ADAPTER.metric).toMatchObject({ name: 'level_index', semantics: 'progress_index', max: 3 })
    expect(HBUT_MEMORY_MATCH_ADAPTER.capabilities).toMatchObject({
      ranked: true,
      multiplayer: false,
      classicMirror: true,
      seasonEligible: true,
      legacyCompatible: true
    })
    expect(HBUT_MEMORY_MATCH_ADAPTER.leaderboard).toMatchObject({ board: 'classic' })
    expect(HBUT_MEMORY_MATCH_ADAPTER.endedReasonMap).toMatchObject({ won: 'won', lost: 'lost' })
    expect(HBUT_MEMORY_MATCH_ADAPTER.extraKeys).toEqual(['mistakes', 'levelIndex', 'combo'])
  })

  it('换算：metric.value = max_level - 1（两个方向都写），两向互逆', () => {
    const built = HBUT_MEMORY_MATCH_ADAPTER.buildResult(FINISH_INPUT)
    expect(built.result).toMatchObject({
      schema_version: 1,
      score: 1280,
      metric: { name: 'level_index', value: 3 },
      moves: 23,
      ended_reason: 'won',
      extra: { mistakes: 5, levelIndex: 3, combo: 4 }
    })
    expect(HBUT_MEMORY_MATCH_ADAPTER.toLegacyPayload({ result: built.result, durationMs: FINISH_INPUT.durationMs })).toEqual({
      score: 1280,
      max_level: 4,
      move_count: 23,
      ended_reason: 'won',
      duration_ms: 61000,
      payload: { mistakes: 5, levelIndex: 3, combo: 4 }
    })
  })

  it('extra 白名单外键被丢弃（不静默改变 payload 语义）', () => {
    const built = HBUT_MEMORY_MATCH_ADAPTER.buildResult({ ...FINISH_INPUT, extra: { ...FINISH_INPUT.extra, seed: 9 } })
    expect(built.result.extra).toEqual({ mistakes: 5, levelIndex: 3, combo: 4 })
    expect(built.diagnostics.droppedExtraKeys).toEqual(['seed'])
  })
})

describe('hbut_memory_match 迁移：提交数值等价（老 URL / compatibility）', () => {
  it('Legacy body 与迁移前 game_rank.js 逐字节等价', async () => {
    const router = createFetchRouter([submitRoute()])
    const host = useLegacyUrlEnvironment()
    const game = await initLegacyGame(router)
    expect(game.mode).toBe('compatibility')

    const run = game.startRun({ runId: RUN_ID })
    const outcome = await run.finish(FINISH_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    await submitGameRank(readGameModuleContext(), { runId: RUN_ID, ...FINISH_INPUT })

    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))
    const sdkBody = router.callsFor('/submit')[0].body
    expect(sdkBody).toEqual(legacyBody)
    // 只写模块私有 storage key（不串味到全局共享 key）
    const writtenKeys = host.storageWrites.map((item) => item.key)
    expect(writtenKeys).toContain('hbut_memory_match_rank_context_v1')
    expect(writtenKeys).not.toContain('hbut_game_rank_context_v1')
    expect(sdkBody).toMatchObject({
      game_id: 'hbut_memory_match',
      run_id: RUN_ID,
      score: 1280,
      max_level: 4,
      move_count: 23,
      duration_ms: 61000,
      ended_reason: 'won',
      payload: { mistakes: 5, levelIndex: 3, combo: 4 }
    })
    game.dispose()
  })

  it('verified 模式：V2 finish envelope 的 metric/moves/extra 与 payload 一一对应', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishRoute()])
    const { game } = await initVerifiedGame(router)
    expect(game.mode).toBe('verified')

    const run = game.startRun({ runId: RUN_ID })
    expect((await run.finish(FINISH_INPUT)).success).toBe(true)

    const finishCalls = router.callsFor(/\/finish/)
    expect(finishCalls).toHaveLength(1)
    const body = finishCalls[0].body as Record<string, unknown>
    expect(body).toMatchObject({
      protocol_version: 1,
      game_id: 'hbut_memory_match',
      run_id: RUN_ID,
      duration_ms: 61000,
      result: {
        schema_version: 1,
        score: 1280,
        metric: { name: 'level_index', value: 3 },
        moves: 23,
        ended_reason: 'won',
        extra: { mistakes: 5, levelIndex: 3, combo: 4 }
      }
    })
    expect(JSON.stringify(body)).not.toMatch(/student_id|player_id|user_id|xp_amount|coin_amount/)
    game.dispose()
  })

  it('standalone：本地记录、零请求、重复 finish 不重复提交', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_memory_match',
      adapter: HBUT_MEMORY_MATCH_ADAPTER,
      params: new URLSearchParams(''),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')

    const run = game.startRun()
    const outcome = await run.finish(FINISH_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    expect((await run.finish(FINISH_INPUT)).duplicate).toBe(true)
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})

describe('hbut_memory_match 迁移：接入形态与玩法零改动', () => {
  it('main.js 已改走 SDK（import / startRun / finish / leaderboard），不再 import 旧 game_rank', () => {
    const source = read(MAIN)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain('MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_MEMORY_MATCH_ADAPTER })')
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).not.toContain('createRunId(')
    expect(source).toContain('await sdkGame.leaderboard({ scope, limit: 20 })')
  })

  it('旧 game_rank.js 保留（回滚路径 + 只读契约测试依赖）', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'hbut_memory_match'")
    expect(source).toContain('export const submitGameRank')
    expect(read(ADAPTER)).toContain("gameId: 'hbut_memory_match'")
  })

  it('提交数值语义逐字保留：maxLevel=levelNumber、moveCount=moves、extra{mistakes,levelIndex,combo}', () => {
    const source = read(MAIN)
    expect(source).toContain('score: state.score')
    expect(source).toContain('maxLevel: state.levelNumber || 1')
    expect(source).toContain('moveCount: Number(state.moves || 0)')
    expect(source).toContain('durationMs: Math.max(0, Date.now() - run.startedAt)')
    expect(source).toContain('mistakes: state.mistakes || 0')
    expect(source).toContain('levelIndex: state.levelIndex || 0')
    expect(source).toContain('combo: state.combo || 0')
  })

  it('终局判定仍在 tick + 副作用触发，且保留 lastTerminalStatus 去重', () => {
    const source = read(MAIN)
    expect(source).toContain('state = tickMemoryGame(state, delta)')
    expect(source).toContain('maybeSubmitTerminal()')
    expect(source).toMatch(/if \(\(state\.status === 'won' \|\| state\.status === 'lost'\) && state\.status !== lastTerminalStatus\)/)
    // 重开 = 新 run（旧 run 未结算成绩随旧 run 丢弃）
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
    expect(source).toContain('let run = sdkGame.startRun()')
  })

  it('冻结契约不变：宿主高度上报 / 动态视口 / 安全区变量 / 错误文本经 textContent 写入', () => {
    const source = read(MAIN)
    expect(source).toContain('mini-hbut:module-size')
    expect(source).toContain('module_id: MODULE_ID')
    expect(source).toContain('--module-vh')
    expect(source).toContain('orientationchange')
    expect(source).toContain("content.innerHTML = '<div class=\"leaderboard-error\"></div>'")
    expect(source).toContain('errorBox.textContent')
    expect(source).not.toMatch(/student_id\s*:|studentId\s*:/)
    expect(source).not.toMatch(/xp_amount|coin_amount|reward_amount/)
  })
})
