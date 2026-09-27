import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_MONOPOLY_ADAPTER } from '../../../../website/modules-src/hbut_monopoly/project/src/utils/game_sdk_adapter.js'
import {
  computeRankScore,
  createInitialState,
  resolveStageProgress
} from '../../../../website/modules-src/hbut_monopoly/project/src/game/monopoly.js'
import type { MonopolyGameState } from '../../../../website/modules-src/hbut_monopoly/project/src/game/monopoly.js'
import {
  canUseGameRank,
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hbut_monopoly/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchCall, FetchRoute } from './_sdk_test_harness'

/**
 * #907c 接入守卫：湖工大富翁（hbut_monopoly）必须真实使用 SDK，且提交数值与迁移前逐字等价。
 *
 * 与只读契约测试（`hbut_monopoly_rank_contract.spec.ts`，继续守护旧 `game_rank.js` = 回滚路径）互补：
 * 本文件守护「接入形态 + payload 等价性 + adapter 取值与 game-registry.md §3/§4.5/§5 一致」。
 */

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
/** 老 URL：宿主注入的完整上下文（参数名不得变，宿主注入链依赖） */
const LEGACY_QUERY = [
  'student_id=20240111',
  'player_name=大富翁',
  'class_name=机械2401',
  'major=机械工程',
  'runtime=module-web',
  'app_version=1.4.11',
  'rank_api=https://rank.example/api/game-rank'
].join('&')

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')
const MAIN = 'website/modules-src/hbut_monopoly/project/src/main.js'
const ADAPTER = 'website/modules-src/hbut_monopoly/project/src/utils/game_sdk_adapter.js'
const ADAPTER_DTS = 'website/modules-src/hbut_monopoly/project/src/utils/game_sdk_adapter.d.ts'
const LEGACY_RANK = 'website/modules-src/hbut_monopoly/project/src/utils/game_rank.js'

/** 真实终局态：三阶段达标（game/monopoly.js 的 won 分支，不手写 status） */
const wonState = (): MonopolyGameState =>
  resolveStageProgress(createInitialState({ stageIndex: 2, credits: 999, influence: 999, coins: 180, turn: 24 }))
/** 真实终局态：资源失衡（game/monopoly.js 的 lost 分支） */
const lostState = (): MonopolyGameState => resolveStageProgress(createInitialState({ coins: -1, turn: 12 }))

/** 与 main.js:submitTerminalScore 的 finish 输入逐字一致（迁移后代码，字段名/数值语义均不改） */
const finishInputFor = (state: MonopolyGameState, endedReason: 'won' | 'lost', durationMs: number) => ({
  score: computeRankScore(state),
  maxLevel: (state.stageIndex || 0) + 1,
  durationMs,
  moveCount: Number(state.turn || 0),
  endedReason,
  extra: {
    credits: state.credits,
    influence: state.influence,
    coins: state.coins,
    energy: state.energy,
    stress: state.stress,
    stage: state.stageName,
    stageIndex: state.stageIndex
  }
})

const metaRoute = (payload: Record<string, unknown> = {}): FetchRoute => ({
  match: '/meta',
  method: 'GET',
  respond: () =>
    okJson({
      protocol_version: { min: 1, max: 1 },
      features: { run_v2: true, settlement: true, economy: false },
      limits: {},
      registry: { games: 12 },
      ...payload
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

const finishRoute = (responder: (call: FetchCall) => Response | Promise<Response>): FetchRoute => ({
  match: /\/runs\/.+\/finish/,
  method: 'POST',
  respond: responder
})

const finishOk = (): FetchRoute =>
  finishRoute(() => okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied' }, idempotent_replay: false }))

/** verified 模式句柄（宿主握手 + ticket 兑换 + /meta 全部走通） */
const createVerifiedGame = async (router: ReturnType<typeof createFetchRouter>) => {
  const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('fetch', router.fetch)
  const pending = MiniHBUTGame.init({
    gameId: 'hbut_monopoly',
    adapter: HBUT_MONOPOLY_ADAPTER,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 20, ticket: 20 },
    requestTimeoutMs: 60
  })
  const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
  if (hello) {
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_monopoly',
      request_id: hello.request_id
    })
  }
  const game = await pending
  return { game, host }
}

/** compatibility 模式句柄（老 URL：student_id + rank_api） */
const createLegacyGame = async (router: ReturnType<typeof createFetchRouter>) => {
  vi.stubGlobal('fetch', router.fetch)
  return MiniHBUTGame.init({
    gameId: 'hbut_monopoly',
    adapter: HBUT_MONOPOLY_ADAPTER,
    params: new URLSearchParams(LEGACY_QUERY),
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
}

/** 让「老实现」可运行：既有 game_rank.js 直接读 window.location / localStorage / navigator */
const stubLegacyRuntime = () => {
  const host = createFakeHostWindow({ search: `?${LEGACY_QUERY}` })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('localStorage', host.win.localStorage)
  Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32', userAgent: 'test' }, configurable: true })
  return host
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('hbut_monopoly 接入形态（源码级守卫）', () => {
  it('main.js 通过相对路径 import SDK，并已停止使用旧 game_rank 工具', () => {
    const source = read(MAIN)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain('MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_MONOPOLY_ADAPTER })')
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).toContain('readLegacyModuleContext({ gameId: MODULE_ID })')
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).not.toContain('createRunId(')
    expect(source).not.toContain('submitPending')
  })

  it('旧 game_rank.js 仍保留（回滚路径 + 只读契约测试依赖），未被删除', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'hbut_monopoly'")
    expect(source).toContain("const MODULE_CONTEXT_STORAGE_KEY = 'hbut_monopoly_rank_context_v1'")
    expect(source).toContain('export const submitGameRank')
    expect(source).toContain('export const fetchGameLeaderboard')
  })

  it('终局触发点未搬家：won/lost 去重后提交，仍由 afterStateChange 驱动', () => {
    const source = read(MAIN)
    expect(source).toContain("if ((state.status === 'won' || state.status === 'lost') && state.status !== lastTerminalStatus)")
    expect(source).toContain("void submitTerminalScore(state.status === 'won' ? 'won' : 'lost')")
    expect(source).toContain('function afterStateChange()')
    expect(source).toContain('maybeSubmitTerminal()')
  })

  it('重开一局 = 新 run（run_id 由 SDK 生成，不再手写）', () => {
    const source = read(MAIN)
    expect(source).toContain('let run = sdkGame.startRun()')
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
    expect(source).toContain('run.startedAt')
  })

  it('提交数值语义与迁移前逐字一致（分数公式 / maxLevel+1 / moveCount / durationMs / extra）', () => {
    const source = read(MAIN)
    expect(source).toContain('score: computeRankScore(state)')
    expect(source).toContain('maxLevel: (state.stageIndex || 0) + 1')
    expect(source).toContain('moveCount: Number(state.turn || 0)')
    expect(source).toContain('durationMs: Math.max(0, Date.now() - run.startedAt)')
    expect(source).toContain('const outcome = await run.finish({')
    for (const key of ['credits', 'influence', 'coins', 'energy', 'stress', 'stage', 'stageIndex']) {
      expect(source).toContain(`${key}: state.`)
    }
  })

  it('保留宿主高度上报 / 动态视口 / 安全渲染异常文本（冻结契约）', () => {
    const source = read(MAIN)
    expect(source).toContain('mini-hbut:module-size')
    expect(source).toContain('module_id: MODULE_ID')
    expect(source).toContain('--module-vh')
    expect(source).toContain('orientationchange')
    expect(source).toContain("content.innerHTML = '<div class=\"leaderboard-error\"></div>'")
    expect(source).toContain('errorBox.textContent')
    expect(source).toContain('applyRankAvailability()')
  })

  it('main.js 不把学号等身份字段写进任何请求体（actor 只来自服务端 / Legacy 通道）', () => {
    const source = read(MAIN)
    expect(source).not.toMatch(/student_id\s*:|\.student_id|studentId\s*:/)
    expect(source).not.toMatch(/xp_amount|coin_amount|reward_amount/)
  })

  it('adapter 类型声明相对深度为 4 层（否则 GameAdapter 退化为 any，类型保护整体失效）', () => {
    const dts = read(ADAPTER_DTS)
    expect(dts).toContain("import type { GameAdapter } from '../../../../_sdk/src/index.js'")
    expect(dts).toContain('export const HBUT_MONOPOLY_ADAPTER: GameAdapter')
  })
})

describe('hbut_monopoly adapter 取值与 registry §3/§4.5/§5 一致', () => {
  it('adapter 源码只声明语义：不引入游戏实现、不含任何计分运算', () => {
    const source = read(ADAPTER)
    expect(source).toContain("gameId: 'hbut_monopoly'")
    expect(source).toContain("name: 'stage_index'")
    expect(source).toContain('max: 2')
    expect(source).toContain('legacyCompatible: true')
    expect(source).not.toMatch(/from ['"][^'"]*game\/monopoly/)
    expect(source).not.toMatch(/credits\s*[*+\-/]/)
    expect(source).not.toMatch(/Math\.(max|min|round)\b/)
  })

  it('metric / capabilities / leaderboard / extraKeys / endedReasonMap 逐项对齐 registry', () => {
    expect(HBUT_MONOPOLY_ADAPTER.gameId).toBe('hbut_monopoly')
    expect(HBUT_MONOPOLY_ADAPTER.metric).toEqual({ name: 'stage_index', semantics: 'progress_index', max: 2, label: '阶段' })
    expect(HBUT_MONOPOLY_ADAPTER.capabilities).toEqual({
      ranked: true,
      multiplayer: false,
      economyEligible: true,
      classicMirror: true,
      seasonEligible: true,
      legacyCompatible: true
    })
    expect(HBUT_MONOPOLY_ADAPTER.leaderboard).toEqual({ board: 'classic', order: 'score_desc' })
    expect(HBUT_MONOPOLY_ADAPTER.endedReasonMap).toEqual({ won: 'won', lost: 'lost' })
    expect(HBUT_MONOPOLY_ADAPTER.extraKeys).toEqual(['credits', 'influence', 'coins', 'energy', 'stress', 'stage', 'stageIndex'])
    expect(HBUT_MONOPOLY_ADAPTER.legacy.maxLevelRule).toBe('max_level = value + 1')
  })

  it('V2 envelope：metric.value = stageIndex（0 基），extra 全键命中白名单且零丢弃', () => {
    const state = wonState()
    expect(state.status).toBe('won')
    const { result, diagnostics } = HBUT_MONOPOLY_ADAPTER.buildResult(finishInputFor(state, 'won', 90000))
    expect(result.metric).toEqual({ name: 'stage_index', value: 2 })
    expect(result.score).toBe(computeRankScore(state))
    expect(result.ended_reason).toBe('won')
    expect(result.moves).toBe(24)
    expect(result.extra).toEqual({
      credits: state.credits,
      influence: state.influence,
      coins: state.coins,
      energy: state.energy,
      stress: state.stress,
      stage: state.stageName,
      stageIndex: state.stageIndex
    })
    // 白名单缺键会被静默丢弃：这里必须是空数组（迁移高风险项）
    expect(diagnostics.droppedExtraKeys).toEqual([])
  })

  it('Legacy max_level ↔ metric.value 双向换算：maxLevel 1..3 ↔ stage_index 0..2', () => {
    for (const [maxLevel, metricValue] of [
      [1, 0],
      [2, 1],
      [3, 2]
    ] as const) {
      const { result } = HBUT_MONOPOLY_ADAPTER.buildResult({ score: 100, maxLevel, moveCount: 1, endedReason: 'lost' })
      expect(result.metric).toEqual({ name: 'stage_index', value: metricValue })
      const legacy = HBUT_MONOPOLY_ADAPTER.toLegacyPayload({ result, durationMs: 0 })
      expect(legacy.max_level).toBe(maxLevel)
    }
  })

  it('metric.max=2 越界本地即拒（不会把 maxLevel 直接当 metric 上传）', () => {
    const overflow = () => HBUT_MONOPOLY_ADAPTER.buildResult({ score: 100, maxLevel: 4, moveCount: 1, endedReason: 'lost' })
    try {
      overflow()
      throw new Error('maxLevel=4（metric=3 > max=2）应当被本地拒绝')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('SCHEMA_INVALID')
    }
    expect(() => HBUT_MONOPOLY_ADAPTER.buildResult({ score: 100, maxLevel: 3, moveCount: 1, endedReason: 'lost' })).not.toThrow()
  })
})

describe('hbut_monopoly payload 等价性（迁移前后逐字对照）', () => {
  it.each([
    ['won', 2, 90000],
    ['lost', 0, 30000]
  ] as const)('compatibility 模式 %s：/submit body 与旧 game_rank.js 完全一致', async (endedReason, expectedStageIndex, durationMs) => {
    const state = endedReason === 'won' ? wonState() : lostState()
    expect(state.status).toBe(endedReason)
    expect(state.stageIndex).toBe(expectedStageIndex)
    const input = finishInputFor(state, endedReason, durationMs)
    const runId = `run_monopoly_equiv_${endedReason}`

    const router = createFetchRouter([{ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }])
    stubLegacyRuntime()
    vi.stubGlobal('fetch', router.fetch)
    const game = await createLegacyGame(router)
    expect(game.mode).toBe('compatibility')
    expect(game.capabilities.canSubmit).toBe(true)

    const outcome = await game.startRun({ runId, startedAt: 1700000000000 }).finish(input)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })
    // 老 URL 通道不发新资产（compatibility.md §2）
    expect(outcome.settled).toBe(false)
    expect(outcome.rewardsEnabled).toBe(false)
    expect(outcome.rewardStatus).toBeNull()
    expect(outcome.message).toContain('经典榜')
    expect(router.callsFor('/submit')).toHaveLength(1)
    const sdkBody = router.callsFor('/submit')[0].body
    game.dispose()

    // 同一局成绩喂给未迁移的旧实现，逐字对照请求体
    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    const context = readGameModuleContext()
    expect(canUseGameRank(context)).toBe(true)
    await submitGameRank(context, { runId, ...input })
    expect(legacyFetch).toHaveBeenCalledTimes(1)
    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))

    expect(sdkBody).toEqual(legacyBody)
    expect(sdkBody).toMatchObject({
      game_id: 'hbut_monopoly',
      run_id: runId,
      student_id: '20240111',
      player_name: '大富翁',
      class_name: '机械2401',
      school_name: '湖北工业大学',
      major: '机械工程',
      score: input.score,
      max_level: expectedStageIndex + 1,
      duration_ms: durationMs,
      move_count: input.moveCount,
      ended_reason: endedReason,
      client_version: '1.4.11',
      runtime: 'module-web',
      payload: input.extra
    })
  })

  it('compatibility 模式：榜单元数据与旧实现一致（module 私有 storage key，不串味）', async () => {
    const router = createFetchRouter([{ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }])
    const host = stubLegacyRuntime()
    vi.stubGlobal('fetch', router.fetch)
    const game = await createLegacyGame(router)
    const outcome = await game.startRun({ runId: 'run_monopoly_storage_1' }).finish(finishInputFor(lostState(), 'lost', 1000))
    expect(outcome.success).toBe(true)
    const writes = host.storageWrites.filter((item) => item.key === 'hbut_monopoly_rank_context_v1')
    expect(writes.length).toBeGreaterThan(0)
    expect(JSON.parse(writes[writes.length - 1].value)).toMatchObject({
      gameId: 'hbut_monopoly',
      studentId: '20240111',
      className: '机械2401',
      rankApiBase: 'https://rank.example/api/game-rank'
    })
    // 绝不写全局共享 key（跨模块串味）
    expect(host.storageWrites.some((item) => item.key === 'hbut_game_rank_context_v1')).toBe(false)
    game.dispose()
  })

  it('verified 模式：V2 请求体用 stage_index（不是 max_level），且不含任何身份字段', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    expect(game.mode).toBe('verified')

    const state = wonState()
    const run = game.startRun({ runId: 'run_monopoly_verified_1', startedAt: 1700000000000 })
    const outcome = await run.finish(finishInputFor(state, 'won', 90000))
    expect(outcome).toMatchObject({ success: true, mode: 'verified', trustLevel: 'verified_session', uploaded: true })

    const finishCalls = router.callsFor(/\/finish/)
    expect(finishCalls).toHaveLength(1)
    const body = finishCalls[0].body as Record<string, unknown>
    expect(body.game_id).toBe('hbut_monopoly')
    expect(body.run_id).toBe('run_monopoly_verified_1')
    expect(body.duration_ms).toBe(90000)
    expect(body.result).toEqual({
      schema_version: 1,
      score: computeRankScore(state),
      metric: { name: 'stage_index', value: 2 },
      moves: 24,
      ended_reason: 'won',
      extra: {
        credits: state.credits,
        influence: state.influence,
        coins: state.coins,
        energy: state.energy,
        stress: state.stress,
        stage: state.stageName,
        stageIndex: 2
      }
    })
    expect(JSON.stringify(body)).not.toMatch(/student_id|player_name|class_name|xp_amount|coin_amount/)
    game.dispose()
  })

  it('同一 run 重复 finish 只提交一次（一局一份 payload）', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const state = wonState()
    const input = finishInputFor(state, 'won', 90000)
    const run = game.startRun()
    const first = await run.finish(input)
    const second = await run.finish(input)
    expect(first.success).toBe(true)
    expect(second.duplicate).toBe(true)
    expect(router.callsFor(/\/finish/)).toHaveLength(1)

    // 换成绩（同 run）→ 本地拒绝，不发请求
    const conflict = await run.finish({ ...input, score: input.score + 1 })
    expect(conflict.error?.code).toBe('RUN_ALREADY_FINISHED')
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    game.dispose()
  })

  it('越界阶段值不上传：本地 SCHEMA_INVALID、零请求', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish({ score: 100, maxLevel: 4, moveCount: 1, endedReason: 'won' })
    expect(outcome.success).toBe(false)
    expect(outcome.error?.code).toBe('SCHEMA_INVALID')
    expect(router.callsFor(/\/finish/)).toHaveLength(0)
    game.dispose()
  })

  it('重开一局 = 新 run_id（两次终局各自独立提交）', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const input = finishInputFor(wonState(), 'won', 90000)
    const first = game.startRun()
    await first.finish(input)
    const second = game.startRun({ replaceActive: true })
    expect(second.id).not.toBe(first.id)
    await second.finish(finishInputFor(lostState(), 'lost', 30000))
    const runIds = router.callsFor(/\/finish/).map((call) => (call.body as { run_id: string }).run_id)
    expect(new Set(runIds).size).toBe(2)
    game.dispose()
  })

  it('网络失败不崩：可重试失败 + 手动重试复用同一 payload（字节级一致）', async () => {
    let finishAttempt = 0
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => {
        finishAttempt += 1
        // 首次 finish 的 4 次尝试全部网络失败（退避 1ms），手动 retry 才成功
        if (finishAttempt <= 4) throw new Error('fetch failed')
        return okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied' } })
      })
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun({ runId: 'run_monopoly_offline_1', startedAt: 1700000000000 })
    const input = finishInputFor(wonState(), 'won', 90000)

    const failed = await run.finish(input)
    expect(failed.success).toBe(false)
    expect(failed.retryable).toBe(true)
    expect(failed.message).toContain('网络')
    expect(run.status).toBe('failed')

    const retried = await run.retry()
    expect(retried.success).toBe(true)
    expect(retried.uploaded).toBe(true)
    const bodies = router.callsFor(/\/finish/).map((call) => JSON.stringify(call.body))
    expect(bodies.length).toBe(5)
    // 服务端 content_hash 稳定：每次重试字节级同 payload
    expect(new Set(bodies).size).toBe(1)
    game.dispose()
  })

  it('确定性失败（409）不重试、不写第二次请求', async () => {
    let submitAttempt = 0
    const router = createFetchRouter([
      {
        match: '/submit',
        method: 'POST',
        respond: () => {
          submitAttempt += 1
          return new Response(JSON.stringify({ success: false, error: { code: 'IDEMPOTENCY_CONFLICT', message: '已结算' } }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      }
    ])
    stubLegacyRuntime()
    vi.stubGlobal('fetch', router.fetch)
    const game = await createLegacyGame(router)
    const run = game.startRun({ runId: 'run_monopoly_conflict_1' })
    const failed = await run.finish(finishInputFor(lostState(), 'lost', 1000))
    expect(failed.success).toBe(false)
    expect(failed.retryable).toBe(false)
    expect(submitAttempt).toBe(1)
    // 终态后重试不再发请求
    const again = await run.retry()
    expect(again.duplicate).toBe(true)
    expect(submitAttempt).toBe(1)
    game.dispose()
  })

  it('standalone（无 ticket、无老上下文）：本地成功、零请求、canSubmit=false（榜入口隐藏）', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_monopoly',
      adapter: HBUT_MONOPOLY_ADAPTER,
      params: new URLSearchParams(''),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.capabilities.canSubmit).toBe(false)
    const outcome = await game.startRun().finish(finishInputFor(lostState(), 'lost', 5000))
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    expect(outcome.message).toContain('本地')
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})
