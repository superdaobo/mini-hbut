import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { createFakeHostWindow, createFetchRouter, errJson, okJson, waitFor } from './_sdk_test_harness'
import type { FetchRoute } from './_sdk_test_harness'

/**
 * 契约 C（standalone 边界锁死）—— SDK 侧纵深防御。
 *
 * 四个场景的 SDK 行为（判定必须**前置**：不发请求即可判定的情形不得发请求）：
 * 1. 浏览器直开（无 Host）→ 本地游玩 + 本地成绩；**零** V2 请求（含 URL 里的 ticket 也作废）；
 * 2. Host + 白名单 origin + 合法 Session → 全链路 verified（ticket 兑换 → /runs → /finish）；
 * 3. Host 但 origin 不在白名单（冒充宿主）→ 降级 compatibility/standalone；零 V2 请求；
 * 4. Host + 白名单 origin 但 Session 非法/过期 → 可玩 + 本地成绩；任何 V2 写零请求。
 *
 * 另含纵深防御断言：宿主显式 `capabilities.launch_ticket=false` 时，URL 凭据也不得兑换。
 */

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const TICKET2 = 'gpt_zyxwvutsrqponmlkjihgfedc'
const HOST_ORIGIN = 'https://app.example'
const EVIL_ORIGIN = 'https://evil.example'
const LEGACY_QUERY = 'student_id=20240111&player_name=叠塔&class_name=机械2401&rank_api=https://rank.example/api/game-rank'
const RESULT_INPUT = { score: 650, maxLevel: 5, moveCount: 5, durationMs: 20000, endedReason: 'lost' }

/** 「凭据 / V2 写 / 钱包 / 榜」全部端点（零请求断言用） */
const V2_AND_CREDENTIAL_SURFACE = /\/tickets|\/sessions|\/runs|\/finish|\/me\/wallet|\/leaderboards/

const metaRoute = (payload: Record<string, unknown> = {}): FetchRoute => ({
  match: '/meta',
  method: 'GET',
  respond: () =>
    okJson({
      protocol_version: { min: 1, max: 1 },
      server_version: '2026.09.1',
      features: { run_v2: true, settlement: true, economy: false },
      limits: {},
      ...payload
    })
})

const sessionRoute = (): FetchRoute => ({
  match: '/sessions',
  method: 'POST',
  respond: () => okJson({ session_id: 'sid_abcdefghijklmnop', session_token: 'gs_boundary_token', replayed_session: false })
})

const createRunRoute = (): FetchRoute => ({
  match: /\/runs$/,
  method: 'POST',
  respond: () => okJson({ run: { run_id: 'server', status: 'CREATED' } })
})

const finishRoute = (): FetchRoute => ({
  match: /\/runs\/.+\/finish$/,
  method: 'POST',
  respond: () => okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied', reward_status: 'granted' } })
})

const leaderboardRoute = (): FetchRoute => ({ match: '/leaderboards', method: 'GET', respond: () => okJson({ entries: [] }) })

const legacySubmitRoute = (): FetchRoute => ({ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) })

const fullRouter = () =>
  createFetchRouter([
    metaRoute(),
    sessionRoute(),
    createRunRoute(),
    finishRoute(),
    leaderboardRoute(),
    legacySubmitRoute()
  ])

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('契约 C：standalone 边界（SDK 侧）', () => {
  it('场景1 浏览器直开（无 Host，URL 带 ticket）→ standalone + 本地成绩，所有凭据/V2 端点零请求', async () => {
    const router = fullRouter()
    vi.stubGlobal('fetch', router.fetch)
    // 浏览器直开：没有 parent（无 Host），URL 里即使带了 ticket 也必须作废（不得兑换 Game Session）
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(`gpt=${TICKET}&student_id=20240111&player_name=叠塔&class_name=机械2401`),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.trustLevel).toBeNull()
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmitLegacy: false, leaderboard: false })
    expect(game.diagnostics.reasons).toContain('host_handshake_required')
    expect(game.diagnostics.ticket.present).toBe(false)
    expect(router.calls).toHaveLength(0)

    // 本地游玩：成绩落本地、无上传、无请求
    const run = game.startRun({ runId: 'run_boundary_local_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    expect(outcome.message).toContain('本地')
    expect(run.result).toMatchObject({ score: 650, metric: { value: 5 } })
    const board = await game.leaderboard({ scope: 'class' })
    expect(board).toMatchObject({ success: false, source: 'none' })
    expect(router.callsFor(V2_AND_CREDENTIAL_SURFACE)).toHaveLength(0)
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })

  it('场景2 Host + 白名单 origin + 合法 Session → 全链路 verified（ticket 兑换 → /runs → /finish）', async () => {
    const router = fullRouter()
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: HOST_ORIGIN })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      // 显式 Host 白名单：只有该 origin 的 welcome 才被采纳
      hostOrigins: [HOST_ORIGIN],
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 20, ticket: 20 },
      requestTimeoutMs: 60
    })
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    expect(hello).toBeTruthy()
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id,
      capabilities: { launch_ticket: true, session_recovery: true }
    })
    const game = await pending
    expect(game.mode).toBe('verified')
    expect(game.trustLevel).toBe('verified_session')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: true, rewardsEnabled: false })

    const run = game.startRun({ runId: 'run_boundary_verified_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: true, mode: 'verified', trustLevel: 'verified_session' })
    expect(router.callsFor(/\/sessions$/)).toHaveLength(1)
    expect(router.callsFor(/\/runs$/)).toHaveLength(1)
    expect(router.callsFor(/\/runs\/.+\/finish$/)).toHaveLength(1)
    // SDK 自身绝不打 /tickets（取票只经宿主桥）
    expect(router.callsFor('/tickets')).toHaveLength(0)
    const board = await game.leaderboard({ scope: 'class' })
    expect(board).toMatchObject({ success: true, source: 'v2' })
    game.dispose()
  })

  it('场景3 非白名单 origin 冒充 Host → 不得 verified；URL ticket 也不兑换（零 V2 请求），经典榜仍可玩', async () => {
    const router = fullRouter()
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: EVIL_ORIGIN })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      hostOrigins: [HOST_ORIGIN],
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 5, ticket: 5 }
    })
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    // 恶意来源冒充宿主：携带合法形状的 ticket，但 origin 不在白名单
    host.deliver(
      {
        type: 'mini-hbut:game-sdk:welcome',
        protocol_version: 1,
        game_id: 'hbut_stack',
        request_id: hello.request_id,
        ticket: TICKET2
      },
      { origin: EVIL_ORIGIN }
    )
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.trustLevel).toBe('legacy')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmitLegacy: true })
    expect(game.diagnostics.host.rejections.some((item: { reason: string }) => item.reason === 'origin_rejected')).toBe(true)
    expect(game.diagnostics.reasons).toContain('host_handshake_required')
    // 判定前置：/meta 都不发，更不发 /sessions、/runs、/finish
    expect(router.calls).toHaveLength(0)

    // 可玩：成绩只走经典榜通道
    const run = game.startRun({ runId: 'run_boundary_evil_host_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })
    expect(router.callsFor(V2_AND_CREDENTIAL_SURFACE)).toHaveLength(0)
    expect(router.callsFor('/submit')).toHaveLength(1)
    game.dispose()
  })

  it('场景4 Host + 白名单 origin 但 Session 非法/过期 → 可玩 + 本地成绩，任何 V2 写零请求', async () => {
    const router = createFetchRouter([
      metaRoute(),
      { match: '/sessions', method: 'POST', respond: () => errJson('GAME_SESSION_EXPIRED', 401) },
      createRunRoute(),
      finishRoute(),
      leaderboardRoute(),
      legacySubmitRoute()
    ])
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: HOST_ORIGIN })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      hostOrigins: [HOST_ORIGIN],
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 20, ticket: 5 }
    })
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({ type: 'mini-hbut:game-sdk:welcome', protocol_version: 1, game_id: 'hbut_stack', request_id: hello.request_id })
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.trustLevel).toBe('legacy')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmitLegacy: true })
    expect(game.diagnostics.reasons.some((item: string) => item.includes('session_exchange_failed'))).toBe(true)
    // 兑换失败后曾向宿主申请新 ticket（恢复策略 A），宿主未响应 → 有界超时后降级
    expect(host.lastPosted('mini-hbut:game-sdk:request-ticket')).toBeTruthy()

    const run = game.startRun({ runId: 'run_boundary_expired_session_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })
    expect(run.result).toMatchObject({ score: 650 })
    // 任何 V2 写 / 钱包 / 排行写零请求
    expect(router.callsFor(/\/runs/)).toHaveLength(0)
    expect(router.callsFor(/\/finish/)).toHaveLength(0)
    expect(router.callsFor('/me/wallet')).toHaveLength(0)
    expect(router.callsFor('/leaderboards')).toHaveLength(0)
    expect(router.callsFor('/submit')).toHaveLength(1)
    game.dispose()
  })

  it('Host 握手成功但无 ticket/会话 → standalone（无经典榜通道），凭据/V2 端点零请求', async () => {
    const router = fullRouter()
    const host = createFakeHostWindow({ search: '', origin: HOST_ORIGIN })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      hostOrigins: [HOST_ORIGIN],
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 20, ticket: 20 },
      requestTimeoutMs: 60
    })
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({ type: 'mini-hbut:game-sdk:welcome', protocol_version: 1, game_id: 'hbut_stack', request_id: hello.request_id })
    const game = await pending
    expect(game.mode).toBe('standalone')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmitLegacy: false })
    expect(game.diagnostics.reasons).toContain('no_launch_ticket')
    expect(router.calls).toHaveLength(0)

    const run = game.startRun({ runId: 'run_boundary_no_ticket_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone' })
    expect(router.callsFor(V2_AND_CREDENTIAL_SURFACE)).toHaveLength(0)
    game.dispose()
  })

  it('宿主显式声明 launch_ticket=false → 即使 URL 带 ticket 也不得进入 verified（纵深防御）', async () => {
    const router = fullRouter()
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: HOST_ORIGIN })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      hostOrigins: [HOST_ORIGIN],
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 20, ticket: 20 },
      requestTimeoutMs: 60
    })
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id,
      capabilities: { launch_ticket: false, session_recovery: false }
    })
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false })
    expect(game.diagnostics.reasons).toContain('host_ticket_disabled')
    expect(router.callsFor(V2_AND_CREDENTIAL_SURFACE)).toHaveLength(0)
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })

  it('宿主桥晚于首次 hello 就绪：有界重试仍能建立握手（不把宿主迟到误判为无宿主）', async () => {
    const router = fullRouter()
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: HOST_ORIGIN })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      hostOrigins: [HOST_ORIGIN],
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 10, ticket: 20 },
      requestTimeoutMs: 60
    })
    // 第一次 hello 故意不响应（模拟宿主桥尚未就绪）；等待第二次 hello 后再回 welcome
    const helloCount = () => host.posted.filter((item) => item.message?.type === 'mini-hbut:game-sdk:hello').length
    await waitFor(() => helloCount() >= 2, 500)
    expect(helloCount()).toBeGreaterThanOrEqual(2)
    const second = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({ type: 'mini-hbut:game-sdk:welcome', protocol_version: 1, game_id: 'hbut_stack', request_id: second.request_id })
    const game = await pending
    expect(game.mode).toBe('verified')
    expect(game.diagnostics.reasons).toContain('host_welcome_retry')
    game.dispose()
  })
})
