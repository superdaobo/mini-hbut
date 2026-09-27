import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { readGameModuleContext, submitGameRank } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, errJson, okJson, waitFor } from './_sdk_test_harness'
import type { FetchCall, FetchRoute } from './_sdk_test_harness'

/**
 * SDK 提交链路（#904 任务 1/5）：
 * finish 幂等、重试、超时、降级、Legacy 等价、排行榜。
 */

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const TICKET2 = 'gpt_zyxwvutsrqponmlkjihgfedc'
const LEGACY_QUERY = 'student_id=20240111&player_name=叠塔&class_name=机械2401&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'

const RESULT_INPUT = {
  score: 650,
  maxLevel: 5,
  moveCount: 5,
  durationMs: 20000,
  endedReason: 'lost',
  extra: { perfectCount: 3, perfectCombo: 2 }
}

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

const finishRoute = (responder: (call: FetchCall) => Response): FetchRoute => ({
  match: /\/runs\/.+\/finish/,
  method: 'POST',
  respond: responder
})

const finishOk = () =>
  finishRoute(() =>
    okJson({
      run: { status: 'SETTLED' },
      settlement: { state: 'applied', reward_status: 'granted' },
      idempotent_replay: false
    })
  )

/** 建一个 verified 模式的句柄（宿主握手 + ticket 兑换 + /meta 全部走通） */
const createVerifiedGame = async (
  router: ReturnType<typeof createFetchRouter>,
  options: { host?: ReturnType<typeof createFakeHostWindow>; clientVersion?: string } = {}
) => {
  const host = options.host || createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('fetch', router.fetch)
  const pending = MiniHBUTGame.init({
    gameId: 'hbut_stack',
    adapter: HBUT_STACK_ADAPTER,
    clientVersion: options.clientVersion,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 20, ticket: 20 },
    requestTimeoutMs: 60
  })
  const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
  if (hello) {
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id
    })
  }
  const game = await pending
  return { game, host }
}

const createLegacyGame = async (router: ReturnType<typeof createFetchRouter>) => {
  vi.stubGlobal('fetch', router.fetch)
  const game = await MiniHBUTGame.init({
    gameId: 'hbut_stack',
    adapter: HBUT_STACK_ADAPTER,
    params: new URLSearchParams(LEGACY_QUERY),
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
  return game
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SDK 提交：verified 模式 finish', () => {
  it('请求体字段/请求头完全符合协议（无 actor 字段、带协议头与 Bearer 会话）', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    expect(game.mode).toBe('verified')

    const run = game.startRun({ runId: 'run_1758931200000_ab12cd34' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({
      success: true,
      mode: 'verified',
      trustLevel: 'verified_session',
      uploaded: true,
      settled: true,
      rewardStatus: 'granted',
      duplicate: false
    })

    const finishCalls = router.callsFor(/\/finish/)
    expect(finishCalls).toHaveLength(1)
    const call = finishCalls[0]
    expect(call.headers.authorization).toBe('Bearer gs_test_token')
    expect(call.headers['x-game-platform-protocol']).toBe('1')
    expect(call.headers['x-game-client-correlation']).toBeTruthy()
    expect(call.body).toEqual({
      protocol_version: 1,
      game_id: 'hbut_stack',
      run_id: 'run_1758931200000_ab12cd34',
      session_id: 'sid_abcdefghijklmnop',
      client_version: 'unknown',
      platform: 'web',
      runtime: 'module-web',
      started_at: expect.any(String),
      finished_at: expect.any(String),
      duration_ms: 20000,
      result: {
        schema_version: 1,
        score: 650,
        metric: { name: 'layers', value: 5 },
        moves: 5,
        ended_reason: 'lost',
        extra: { perfectCount: 3, perfectCombo: 2 }
      },
      require_rewards: false
    })
    expect(JSON.stringify(call.body)).not.toMatch(/student_id|player_id|user_id|xp_amount|coin_amount/)
    game.dispose()
  })

  it('require_rewards 仅在 economy 开启且调用方显式要求时为 true（客户端从不传数量）', async () => {
    const router = createFetchRouter([metaRoute({ features: { run_v2: true, economy: true } }), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    expect(game.capabilities.rewardsEnabled).toBe(true)
    const run = game.startRun()
    await run.finish({ ...RESULT_INPUT, requireRewards: true })
    const call = router.callsFor(/\/finish/)[0]
    expect((call.body as Record<string, unknown>).require_rewards).toBe(true)
    expect(JSON.stringify(call.body)).not.toMatch(/xp|coin|reward_amount/i)

    const economyOff = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game: game2 } = await createVerifiedGame(economyOff)
    const run2 = game2.startRun()
    await run2.finish({ ...RESULT_INPUT, requireRewards: true })
    expect((economyOff.callsFor(/\/finish/)[0].body as Record<string, unknown>).require_rewards).toBe(false)
    game.dispose()
    game2.dispose()
  })

  it('REWARD_DISABLED 提示（200 + success:true）不阻断结算，且 UI 得到中文提示', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() =>
        okJson({
          run: { status: 'SETTLED' },
          settlement: { state: 'applied', reward_status: 'disabled' },
          error: { code: 'REWARD_DISABLED', message: '本轮不计奖励' }
        })
      )
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, settled: true, rewardStatus: 'disabled', rewardsEnabled: false })
    expect(outcome.message).toContain('不计奖励')
    game.dispose()
  })

  it('idempotent_replay / recovered 都视为成功并清除 pending', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied' }, idempotent_replay: true, recovered: true }))
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, idempotentReplay: true, recovered: true })
    expect(run.status).toBe('finished')
    expect(run.pendingPayload).not.toBeNull()
    game.dispose()
  })
})

describe('SDK 提交：finish 幂等（重复 finish 不得发第二次请求）', () => {
  it('同一 run 重复 finish（同输入）→ 只发一次请求，第二次标记 duplicate', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const first = await run.finish(RESULT_INPUT)
    const second = await run.finish(RESULT_INPUT)
    expect(first.success).toBe(true)
    expect(second).toMatchObject({ success: true, duplicate: true })
    expect(router.callsFor(/\/finish/)).toHaveLength(1)

    // 连无参调用也不得触发新请求
    const third = await run.finish()
    expect(third.duplicate).toBe(true)
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    game.dispose()
  })

  it('并发重复 finish → 复用同一次 in-flight 请求', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const [a, b] = await Promise.all([run.finish(RESULT_INPUT), run.finish(RESULT_INPUT)])
    expect(a.success).toBe(true)
    expect(b.success).toBe(true)
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    game.dispose()
  })

  it('同一 run 用不同成绩 finish → 本地判定 RUN_ALREADY_FINISHED，不发请求', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    await run.finish(RESULT_INPUT)
    const conflict = await run.finish({ ...RESULT_INPUT, score: 999 })
    expect(conflict.success).toBe(false)
    expect(conflict.error?.code).toBe('RUN_ALREADY_FINISHED')
    expect(conflict.retryable).toBe(false)
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    game.dispose()
  })

  it('新一局 = 新 run_id：重开后可再次提交', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const first = game.startRun()
    await first.finish(RESULT_INPUT)
    const second = game.startRun({ replaceActive: true })
    expect(second.id).not.toBe(first.id)
    await second.finish(RESULT_INPUT)
    const runIds = router.callsFor(/\/finish/).map((call) => (call.body as { run_id: string }).run_id)
    expect(new Set(runIds).size).toBe(2)
    game.dispose()
  })
})

describe('SDK 提交：重试、超时与 pending', () => {
  it('429 按 1200/2600/5200 退避重试（测试注入短延迟），且两次 payload 字节级一致', async () => {
    let attempt = 0
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => {
        attempt += 1
        return attempt === 1 ? errJson('RATE_LIMITED', 429, { retryable: true }) : okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied' } })
      })
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome.success).toBe(true)
    const calls = router.callsFor(/\/finish/)
    expect(calls).toHaveLength(2)
    expect(JSON.stringify(calls[0].body)).toBe(JSON.stringify(calls[1].body))
    expect(run.attempts).toBe(2)
    game.dispose()
  })

  it('重试耗尽 → 保留 pending、可手动重试，且重试仍是同一 payload', async () => {
    let attempt = 0
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => {
        attempt += 1
        return attempt <= 4 ? errJson('INTERNAL_ERROR', 500, { retryable: true }) : okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied' } })
      })
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const failed = await run.finish(RESULT_INPUT)
    expect(failed.success).toBe(false)
    expect(failed.retryable).toBe(true)
    expect(failed.error?.code).toBe('INTERNAL_ERROR')
    expect(run.status).toBe('failed')
    expect(run.pendingPayload).toMatchObject({ durationMs: 20000 })

    const bodies = router.callsFor(/\/finish/).map((call) => JSON.stringify(call.body))
    expect(bodies.length).toBe(4)
    expect(new Set(bodies).size).toBe(1)

    const retried = await run.retry()
    expect(retried.success).toBe(true)
    const afterRetry = router.callsFor(/\/finish/).map((call) => JSON.stringify(call.body))
    expect(new Set(afterRetry).size).toBe(1)
    game.dispose()
  })

  it('超时（服务端无响应）→ INTERNAL_ERROR 可重试，不抛异常、不卡死', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => new Promise(() => {}) as unknown as Response)
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome.success).toBe(false)
    expect(outcome.error?.code).toBe('INTERNAL_ERROR')
    expect(outcome.retryable).toBe(true)
    expect(outcome.message).toContain('超时')
    expect(run.status).toBe('failed')
    game.dispose()
  })

  it('POST /runs 失败（5xx）时不向 finish 发送请求（避免 RUN_INVALID 被 REJECTED）', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      { match: '/runs', method: 'POST', respond: (call: { url: string }) => (call.url.endsWith('/runs') ? errJson('INTERNAL_ERROR', 500, { retryable: true }) : undefined) }
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome.success).toBe(false)
    expect(outcome.retryable).toBe(true)
    expect(router.callsFor(/\/finish/)).toHaveLength(0)
    game.dispose()
  })

  it('409 RUN_ALREADY_FINISHED（服务端）→ 终态，不再重试', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => errJson('RUN_ALREADY_FINISHED', 409))
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome.error?.code).toBe('RUN_ALREADY_FINISHED')
    expect(outcome.retryable).toBe(false)
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    // 终态后 finish 不再发请求
    const again = await run.finish(RESULT_INPUT)
    expect(again.duplicate).toBe(true)
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    game.dispose()
  })

  it('SCHEMA_INVALID（本地校验失败）→ 不发任何请求且 run 进入终态', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishOk()])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish({ score: -1 })
    expect(outcome.error?.code).toBe('SCHEMA_INVALID')
    expect(router.callsFor(/\/finish/)).toHaveLength(0)
    expect(run.status).toBe('rejected')
    game.dispose()
  })

  it('RUN_INVALID → 用新 run_id 重建一次并成功（§5 码 6）', async () => {
    let finishAttempt = 0
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => {
        finishAttempt += 1
        return finishAttempt === 1
          ? errJson('RUN_INVALID', 400)
          : okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied' } })
      })
    ])
    const { game } = await createVerifiedGame(router)
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome.success).toBe(true)
    expect(outcome.reason).toBe('run_invalid_recreated')
    expect(outcome.recreatedRunId).toBeTruthy()
    expect(outcome.recreatedRunId).not.toBe(run.id)
    const runIds = router.callsFor(/\/finish/).map((call) => (call.body as { run_id: string }).run_id)
    expect(runIds[0]).toBe(run.id)
    expect(runIds[1]).toBe(outcome.recreatedRunId)
    game.dispose()
  })
})

describe('SDK 提交：会话恢复与降级', () => {
  it('GAME_SESSION_EXPIRED → 向宿主换新 ticket → 重建 session → 同一 payload 重试成功', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
    let finishAttempt = 0
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => {
        finishAttempt += 1
        return finishAttempt === 1
          ? errJson('GAME_SESSION_EXPIRED', 401)
          : okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied' } })
      })
    ])
    const { game } = await createVerifiedGame(router, { host })
    const run = game.startRun()
    const finishPromise = run.finish(RESULT_INPUT)

    // 宿主响应 request-ticket（模拟 §6.2.3 恢复策略 A）
    await waitFor(() => !!host.lastPosted('mini-hbut:game-sdk:request-ticket'))
    const ticketRequest = host.lastPosted('mini-hbut:game-sdk:request-ticket') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:ticket',
      game_id: 'hbut_stack',
      request_id: ticketRequest.request_id,
      ticket: TICKET2
    })

    const outcome = await finishPromise
    expect(outcome.success).toBe(true)
    const finishCalls = router.callsFor(/\/finish/)
    expect(finishCalls).toHaveLength(2)
    expect(JSON.stringify(finishCalls[0].body)).toBe(JSON.stringify(finishCalls[1].body))
    const sessionBodies = router.callsFor('/sessions').map((call) => (call.body as { ticket: string }).ticket)
    expect(sessionBodies).toEqual([TICKET, TICKET2])
    game.dispose()
  })

  it('FEATURE_DISABLED（V2 整体关闭）→ 不重试，回退 Legacy 提交同一局成绩', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => errJson('FEATURE_DISABLED', 403)),
      { match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }
    ])
    const legacyQueryHost = createFakeHostWindow({
      search: `?gpt=${TICKET}&${LEGACY_QUERY}`,
      origin: 'https://app.example'
    })
    const { game } = await createVerifiedGame(router, { host: legacyQueryHost })
    const run = game.startRun({ runId: 'run_legacyfallback_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })
    expect(game.mode).toBe('compatibility')
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    const legacyCall = router.callsFor('/submit')[0]
    expect(legacyCall.body).toMatchObject({
      game_id: 'hbut_stack',
      run_id: 'run_legacyfallback_1',
      student_id: '20240111',
      score: 650,
      max_level: 5,
      move_count: 5,
      ended_reason: 'lost',
      duration_ms: 20000,
      payload: { perfectCount: 3, perfectCombo: 2 }
    })
    game.dispose()
  })

  it('PROTOCOL_VERSION_UNSUPPORTED（服务端返回）→ 回退 Legacy，不再打 V2', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      createRunRoute(),
      finishRoute(() => errJson('PROTOCOL_VERSION_UNSUPPORTED', 400, { details: { supported: [1, 1] } })),
      { match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }
    ])
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: 'https://app.example' })
    const { game } = await createVerifiedGame(router, { host })
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome.success).toBe(true)
    expect(outcome.mode).toBe('compatibility')
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    expect(router.callsFor('/submit')).toHaveLength(1)
    game.dispose()
  })
})

describe('SDK 提交：compatibility / standalone', () => {
  it('compatibility 模式提交走 Legacy 通道，body 与既有 game_rank.js 完全一致（数值不变）', async () => {
    const router = createFetchRouter([{ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }])
    // 既有实现直接读 window.location / localStorage / navigator，这里为它准备同等的运行环境
    const host = createFakeHostWindow({ search: `?${LEGACY_QUERY}` })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('localStorage', host.win.localStorage)
    Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32', userAgent: 'test' }, configurable: true })

    const game = await createLegacyGame(router)
    expect(game.mode).toBe('compatibility')

    const run = game.startRun({ runId: 'run_equivalence_1', startedAt: 1700000000000 })
    const outcome = await run.finish({ ...RESULT_INPUT })
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    // 用既有实现（未迁移代码）构造同一局请求
    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    const context = readGameModuleContext()
    await submitGameRank(context, {
      runId: 'run_equivalence_1',
      score: RESULT_INPUT.score,
      maxLevel: RESULT_INPUT.maxLevel,
      durationMs: RESULT_INPUT.durationMs,
      moveCount: RESULT_INPUT.moveCount,
      endedReason: RESULT_INPUT.endedReason,
      extra: { ...RESULT_INPUT.extra }
    })
    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))
    const sdkBody = router.callsFor('/submit')[0].body
    expect(sdkBody).toEqual(legacyBody)
    game.dispose()
  })

  it('standalone 模式 finish 完全离线：本地成功、无任何请求', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(''),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    expect(outcome.message).toContain('本地')
    expect(router.calls).toHaveLength(0)
    // 重复 finish 依旧不发请求
    const again = await run.finish(RESULT_INPUT)
    expect(again.duplicate).toBe(true)
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})

describe('SDK 排行榜', () => {
  it('verified 模式读 V2 榜：query 正确、条目归一、绝不外泄身份字段', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      {
        match: '/leaderboards',
        method: 'GET',
        respond: () =>
          okJson({
            board: 'classic',
            scope_applied: 'class',
            metric: { name: 'layers', label: '层数' },
            entries: [
              {
                rank: 1,
                player_ref: 'a1b2c3d4e5f6',
                player_name: '张三',
                class_name: '机械2401',
                student_id: '20240111',
                score: 1240,
                metric: { name: 'layers', value: 26 },
                is_self: false,
                updated_at: '2026-09-27T08:02:31Z'
              }
            ],
            next_cursor: null
          })
      }
    ])
    const { game } = await createVerifiedGame(router)
    const result = await game.leaderboard({ scope: 'class', limit: 20 })
    expect(result).toMatchObject({ success: true, mode: 'verified', source: 'v2', scopeApplied: 'class' })
    expect(result.entries[0]).toEqual({
      rank: 1,
      player_name: '张三',
      class_name: '机械2401',
      display_name: '张三',
      score: 1240,
      total_score: null,
      metric_value: 26,
      is_self: false,
      updated_at: '2026-09-27T08:02:31Z',
      ref: 'a1b2c3d4e5f6'
    })
    expect(JSON.stringify(result.entries)).not.toContain('20240111')
    const call = router.callsFor('/leaderboards')[0]
    expect(call.url).toContain('game_id=hbut_stack')
    expect(call.url).toContain('board=classic')
    expect(call.url).toContain('scope=class')
    expect(call.url).toContain('limit=20')
    expect(call.url).not.toContain('student_id')
    game.dispose()
  })

  it('V2 榜失败 → 自动回退经典榜（compatibility）', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      { match: '/leaderboards', method: 'GET', respond: () => errJson('FEATURE_DISABLED', 403) },
      {
        match: '/leaderboard',
        method: 'GET',
        respond: () => okJson({ leaderboard: [{ rank: 1, player_name: '李四', score: 700 }] })
      }
    ])
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: 'https://app.example' })
    const { game } = await createVerifiedGame(router, { host })
    const result = await game.leaderboard({ scope: 'school', limit: 10 })
    expect(result).toMatchObject({ success: true, mode: 'compatibility', source: 'legacy', scopeApplied: 'school' })
    expect(result.entries[0]).toMatchObject({ rank: 1, display_name: '李四', score: 700 })
    expect(router.callsFor('/leaderboard').length).toBeGreaterThan(0)
    game.dispose()
  })

  it('compatibility 模式：class_total 用班级名与总分展示，绝不带学号', async () => {
    const router = createFetchRouter([
      {
        match: '/leaderboard',
        method: 'GET',
        respond: () =>
          okJson({
            leaderboard: [
              { rank: 1, class_name: '机械2401', total_score: 9999, student_id: '20240111' },
              { rank: 2, student_id: '20240112', score: 12 }
            ]
          })
      }
    ])
    const game = await createLegacyGame(router)
    const totalResult = await game.leaderboard({ scope: 'class_total' })
    expect(totalResult.entries[0]).toMatchObject({ rank: 1, display_name: '机械2401', score: 9999 })
    const classResult = await game.leaderboard({ scope: 'class' })
    expect(classResult.entries[1]).toMatchObject({ rank: 2, display_name: '匿名', score: 12 })
    expect(JSON.stringify(classResult.entries)).not.toContain('2024011')
    game.dispose()
  })

  it('standalone 模式：不请求网络，明确告知未连接', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(''),
      timeouts: { welcome: 5 }
    })
    const result = await game.leaderboard({ scope: 'class' })
    expect(result).toMatchObject({ success: false, mode: 'standalone', source: 'none', entries: [] })
    expect(result.message).toContain('本地')
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })

  it('榜单查询参数边界收敛：非法 scope → class，limit 越界 → 1..100', async () => {
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(),
      { match: '/leaderboards', method: 'GET', respond: () => okJson({ entries: [] }) }
    ])
    const { game } = await createVerifiedGame(router)
    await game.leaderboard({ scope: 'hacked', limit: 9999 })
    await game.leaderboard({ scope: 'school', limit: 0 })
    const urls = router.callsFor('/leaderboards').map((call) => call.url)
    expect(urls[0]).toContain('scope=class')
    expect(urls[0]).toContain('limit=100')
    expect(urls[1]).toContain('scope=school')
    expect(urls[1]).toContain('limit=1')
    game.dispose()
  })
})
