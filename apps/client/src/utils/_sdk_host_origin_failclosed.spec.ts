import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchRoute } from './_sdk_test_harness'

/**
 * P1-B（复验修复）：SDK 必须 fail closed —— 只有**显式**宿主来源才能进入可信握手。
 *
 * 复验实测的漏洞面：旧 `createHostOriginGuard` 在未显式给 `hostOrigins` 时回落
 * `document.referrer` origin + 自身页面 origin，于是**任意第三方页面**把游戏 iframe 嵌进去
 * 即被 SDK 当成可信宿主 → 触发 `GET /meta` + `POST /sessions`（真实 V2 探测请求），
 * 与契约 C「非白名单 origin ⇒ 不得 verified、零 V2 请求」矛盾。
 *
 * 修复后的解析顺序（唯一两级）：显式 `config.hostOrigins` > URL 注入的 `host_origin` > （无）。
 * 本文件覆盖四种情形（全部用真实 SDK + 可控 fetch 路由，含**请求清单实测**）：
 *   ① 显式 hostOrigins 命中 → verified；
 *   ② **无任何显式来源** → 不 verified 且 V2 面零请求（连 hello 都不发）；
 *   ③ URL 注入 host_origin 命中 → verified（且 referrer 不参与判定）；
 *   ④ 非白名单 origin 冒充宿主 → 不 verified、零 V2 请求。
 *
 * 夹具说明：`createFakeHostWindow` 默认按宿主契约注入 `host_origin`（模拟真实
 * MoreView / MoreModuleHostView）；只有本文件 ②/④ 用 `injectHostOrigin: false` 关闭，
 * 以复现「第三方页面不声明宿主来源」的原始形态。
 */

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const HOST_ORIGIN = 'https://app.example'
const EVIL_ORIGIN = 'https://evil.example'
const LEGACY_QUERY =
  'student_id=20240111&player_name=叠塔&class_name=机械2401&rank_api=https://rank.example/api/game-rank'
/** 凭据 / V2 探测 / V2 写 / 榜：契约 C 的「零请求面」 */
const V2_SURFACE = /\/meta|\/sessions|\/tickets|\/runs|\/finish|\/leaderboards/

const metaRoute = (): FetchRoute => ({
  match: '/meta',
  method: 'GET',
  respond: () =>
    okJson({
      protocol_version: { min: 1, max: 1 },
      features: { run_v2: true, settlement: true, economy: false },
      limits: {}
    })
})

const sessionRoute = (): FetchRoute => ({
  match: '/sessions',
  method: 'POST',
  respond: () => okJson({ session_id: 'sid_abcdefghijklmnop', session_token: 'gs_boundary_token', replayed_session: false })
})

const fullRouter = () =>
  createFetchRouter([
    metaRoute(),
    sessionRoute(),
    { match: /\/runs$/, method: 'POST', respond: () => okJson({ run: { run_id: 'server', status: 'CREATED' } }) },
    {
      match: /\/runs\/.+\/finish$/,
      method: 'POST',
      respond: () => okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied', reward_status: 'granted' } })
    },
    { match: '/leaderboards', method: 'GET', respond: () => okJson({ entries: [] }) },
    { match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }
  ])

/** 与测试同口径的「模式 + 零 V2 请求」断言，错误信息里带完整请求清单便于复验 */
const expectNoV2Requests = (router: ReturnType<typeof createFetchRouter>) => {
  const v2Calls = router.callsFor(V2_SURFACE)
  expect(
    v2Calls.map((call) => `${call.method} ${call.url}`),
    '契约 C：无显式宿主来源时 V2 面必须零请求'
  ).toEqual([])
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('P1-B 契约 C：宿主来源 fail closed（四情形）', () => {
  it('① 显式 hostOrigins 命中 → verified（既有配置路径零回归）', async () => {
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
      capabilities: { launch_ticket: true, session_recovery: true }
    })
    const game = await pending
    expect(game.mode).toBe('verified')
    expect(game.trustLevel).toBe('verified_session')
    // 已验证：V2 探测（/meta）与会话兑换（/sessions）确实发生
    expect(router.callsFor('/meta').length).toBeGreaterThanOrEqual(1)
    expect(router.callsFor(/\/sessions$/)).toHaveLength(1)
    expect(router.callsFor('/tickets')).toHaveLength(0)
    game.dispose()
  })

  it('② 无任何显式来源 → 不 verified（compatibility）+ V2 面零请求（请求清单实测为空）', async () => {
    const router = fullRouter()
    // 第三方嵌入形态：不注入 host_origin；即便 referrer 指向一个「看似宿主」的页面也不得被采纳
    const host = createFakeHostWindow({
      search: `?gpt=${TICKET}&${LEGACY_QUERY}`,
      origin: HOST_ORIGIN,
      referrer: `${HOST_ORIGIN}/more`,
      injectHostOrigin: false
    })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 5, ticket: 5 }
    })
    // fail closed：连 hello 都不发（桥没有可信目标 origin）
    expect(host.lastPosted('mini-hbut:game-sdk:hello')).toBeNull()
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.trustLevel).toBe('legacy')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmitLegacy: true })
    expect(game.diagnostics.reasons).toContain('host_welcome_unavailable')
    expect(host.lastPosted('mini-hbut:game-sdk:hello')).toBeNull()

    const run = game.startRun({ runId: 'run_p1b_no_source' })
    const outcome = await run.finish({ score: 650, maxLevel: 5, durationMs: 20000, moveCount: 5, endedReason: 'lost' })
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', uploaded: true })
    // 请求清单实测：V2 面（/meta、/sessions、/tickets、/runs、/finish、/leaderboards）一条都没有
    expectNoV2Requests(router)
    // 经典榜通道仍可用（只允许 compatibility/standalone，不是禁玩）
    expect(router.callsFor('/submit')).toHaveLength(1)
    game.dispose()
  })

  it('②b 无显式来源但伪造 welcome（带 ticket）→ 不采用、不兑换、零 V2 请求', async () => {    const router = fullRouter()
    const host = createFakeHostWindow({
      search: `?gpt=${TICKET}&${LEGACY_QUERY}`,
      origin: HOST_ORIGIN,
      referrer: `${HOST_ORIGIN}/more`,
      injectHostOrigin: false
    })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 5, ticket: 5 }
    })
    // 宿主页面（referrer 同 origin）主动投递 welcome —— 未显式声明来源，一律不采信。
    // `request_id` 取实际发出的 hello（若旧实现真的发了），让「自洽伪造」尽可能强，
    // 从而把判定压到来源校验这一层。
    const helloRequestId =
      (host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown> | null)?.request_id ||
      'hs_forged_0001'
    host.deliver(
      {
        type: 'mini-hbut:game-sdk:welcome',
        protocol_version: 1,
        game_id: 'hbut_stack',
        request_id: helloRequestId,
        ticket: TICKET
      },
      { origin: HOST_ORIGIN }
    )
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.diagnostics.ticket.present).toBe(false)
    expectNoV2Requests(router)
    game.dispose()
  })

  it('②c preflight 同口径：无显式来源的嵌入页在 ready 前也不得乐观预判 verified', async () => {
    const router = fullRouter()
    const host = createFakeHostWindow({
      search: `?gpt=${TICKET}&${LEGACY_QUERY}`,
      origin: HOST_ORIGIN,
      injectHostOrigin: false
    })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const game = MiniHBUTGame.create({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(`gpt=${TICKET}&${LEGACY_QUERY}`),
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 5, ticket: 5 }
    })
    // ready 之前走同步预判：在 iframe 内但无显式宿主来源 → verified 必须保守 false
    expect(game.capabilities.pending).toBe(true)
    expect(game.capabilities.canSubmitVerified).toBe(false)
    expect(host.lastPosted('mini-hbut:game-sdk:hello')).toBeNull()
    await game.ready
    expect(game.mode).toBe('compatibility')
    expectNoV2Requests(router)
    game.dispose()
  })

  it('③ URL 注入 host_origin 命中 → verified（referrer 不参与判定）', async () => {
    const router = fullRouter()
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: HOST_ORIGIN })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
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
    expect(router.callsFor(/\/sessions$/)).toHaveLength(1)
    game.dispose()
  })

  it('③b URL 注入的 host_origin 与真实来源不一致 → 拒绝（不得回落 referrer / 自身 origin）', async () => {
    const router = fullRouter()
    // 注入的是 evil.example；真实宿主是 app.example，且 referrer 也指向 app.example。
    // 旧实现会从 referrer 推导白名单从而放行；修复后只认显式 host_origin → 必须拒绝。
    const host = createFakeHostWindow({
      search: `?gpt=${TICKET}&${LEGACY_QUERY}&host_origin=${encodeURIComponent(EVIL_ORIGIN)}`,
      origin: HOST_ORIGIN,
      referrer: `${HOST_ORIGIN}/more`,
      injectHostOrigin: false
    })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 5, ticket: 5 }
    })
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    expect(hello).toBeTruthy()
    host.deliver(
      {
        type: 'mini-hbut:game-sdk:welcome',
        protocol_version: 1,
        game_id: 'hbut_stack',
        request_id: hello.request_id,
        ticket: TICKET
      },
      { origin: HOST_ORIGIN }
    )
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.diagnostics.reasons).toContain('host_welcome_unavailable')
    expectNoV2Requests(router)
    game.dispose()
  })

  it('④ 非白名单 origin 冒充宿主（第三方页面嵌入，默认路径）→ 不 verified、V2 面零请求', async () => {
    const router = fullRouter()
    // 复验实测的原始形态：任意第三方页面嵌入游戏，既没有显式 hostOrigins 也没有 host_origin。
    // 旧实现会把自身页面 origin / referrer origin（都是 evil.example）当成可信宿主 →
    // 触发 /meta + /sessions；修复后必须一律拒绝（origin_unverifiable）。
    const host = createFakeHostWindow({
      search: `?gpt=${TICKET}&${LEGACY_QUERY}`,
      origin: EVIL_ORIGIN,
      injectHostOrigin: false
    })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const pending = MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 5, ticket: 5 }
    })
    // 冒名者主动投递自洽的 welcome（带 ticket）—— 不得被采信。
    // `request_id` 取实际发出的 hello（若旧实现真的发了），把判定压到来源校验这一层。
    const helloRequestId =
      (host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown> | null)?.request_id ||
      'hs_evil_0001'
    host.deliver(
      {
        type: 'mini-hbut:game-sdk:welcome',
        protocol_version: 1,
        game_id: 'hbut_stack',
        request_id: helloRequestId,
        ticket: TICKET
      },
      { origin: EVIL_ORIGIN }
    )
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.trustLevel).toBe('legacy')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmitLegacy: true })
    expect(
      game.diagnostics.host.rejections.some((item: { reason: string }) => item.reason === 'origin_unverifiable')
    ).toBe(true)
    expect(game.diagnostics.ticket.present).toBe(false)
    expectNoV2Requests(router)
    game.dispose()
  })
})
