import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiniHBUTGame, createGameAdapter } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { createFakeHostWindow, createFetchRouter, errJson, okJson } from './_sdk_test_harness'
import type { FetchRoute } from './_sdk_test_harness'

/**
 * SDK 三模式判定（#904 任务 1/5）：
 * verified / compatibility / standalone 与 trust-model.md 三档信任级别的对应。
 * 必覆盖：verified init、无 host、ticket-session 失败、legacy fallback、wrong origin、
 * game_id mismatch、network offline、SDK 与 protocol 版本不匹配。
 */

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const TICKET2 = 'gpt_zyxwvutsrqponmlkjihgfedc'
const LEGACY_QUERY = 'student_id=20240111&player_name=叠塔&class_name=机械2401&rank_api=https://rank.example/api/game-rank'

const metaRoute = (payload: Record<string, unknown> = {}): FetchRoute => ({
  match: '/meta',
  method: 'GET',
  respond: () =>
    okJson({
      protocol_version: { min: 1, max: 1 },
      server_version: '2026.09.1',
      features: { run_v2: true, settlement: true, economy: false, legacy_dual_write: true },
      limits: { leaderboard_max_limit: 100 },
      registry: { synced_at: '2026-09-27T00:00:00Z', games: 12 },
      ...payload
    })
})

const sessionRoute = (responder?: () => Response): FetchRoute => ({
  match: '/sessions',
  method: 'POST',
  respond:
    responder ||
    (() =>
      okJson({
        session_id: 'sid_abcdefghijklmnop',
        session_token: 'gs_test_token_value',
        expires_at: '2026-09-27T09:00:00Z',
        replayed_session: false
      }))
})

const createGame = (config: Record<string, unknown> = {}) =>
  MiniHBUTGame.init({
    gameId: 'hbut_stack',
    adapter: HBUT_STACK_ADAPTER,
    retryDelaysMs: [1, 1],
    timeouts: { welcome: 30, ticket: 20 },
    ...config
  })

const createGameWithAdapter = (adapter: unknown, config: Record<string, unknown> = {}) =>
  MiniHBUTGame.init({
    adapter,
    retryDelaysMs: [1, 1],
    timeouts: { welcome: 30, ticket: 20 },
    ...config
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SDK 模式：verified（有合法 Game Session 才能进 V2）', () => {
  it('宿主握手 + ticket 兑换成功 → verified，并把 ticket 从 URL 清理、凭据不落盘', async () => {
    const host = createFakeHostWindow({
      search: `?game_id=hbut_stack&gpt=${TICKET}&${LEGACY_QUERY}`,
      origin: 'https://app.example'
    })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute({ features: { run_v2: true, economy: true } }), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    expect(hello).toBeTruthy()
    expect(hello.protocol_version).toBe(1)
    expect(hello.game_id).toBe('hbut_stack')
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id,
      features: { run_v2: true, economy: true },
      platform: 'android',
      runtime: 'capacitor-local',
      client_version: '1.4.12'
    })

    const game = await pending
    expect(game.mode).toBe('verified')
    expect(game.trustLevel).toBe('verified_session')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: true, canSubmitLegacy: true, rewardsEnabled: true })

    const sessionCalls = router.callsFor('/sessions')
    expect(sessionCalls).toHaveLength(1)
    expect(sessionCalls[0].body).toEqual({ protocol_version: 1, ticket: TICKET, game_id: 'hbut_stack' })
    expect(sessionCalls[0].headers['idempotency-key']).toBeTruthy()
    expect(JSON.stringify(sessionCalls[0].body)).not.toContain('student_id')

    // §6.2.3：读取 ticket 后立即清理 URL（保留其它参数）
    expect(host.historyUrls).toHaveLength(1)
    expect(host.historyUrls[0]).not.toContain(TICKET)
    expect(host.historyUrls[0]).toContain('student_id=20240111')

    // §6.2.3：session token / ticket 绝不落盘
    const stored = host.storageWrites.map((item) => `${item.key}=${item.value}`).join('|')
    expect(stored).not.toContain('gs_')
    expect(stored).not.toContain(TICKET)

    // 宿主收到模式通知（#905 可据此展示角标）
    const modeMessage = host.lastPosted('mini-hbut:game-sdk:mode') as Record<string, unknown>
    expect(modeMessage).toMatchObject({ mode: 'verified', trust_level: 'verified_session' })
    game.dispose()
  })

  it('exchange 幂等重放（replayed_session）也视为 verified', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(() =>
        okJson({
          session_id: 'sid_abcdefghijklmnop',
          session_token: 'gs_replayed',
          replayed_session: true
        })
      )
    ])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id
    })
    const game = await pending
    expect(game.mode).toBe('verified')
    expect(game.diagnostics.reasons).toContain('verified_session_replayed')
    game.dispose()
  })
})

describe('SDK 模式：无 host（直接打开 / 老 URL）', () => {
  it('无宿主 + 无任何凭据 → standalone（纯本地游玩）', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const game = await createGame({ params: new URLSearchParams('') })
    expect(game.mode).toBe('standalone')
    expect(game.trustLevel).toBeNull()
    expect(game.capabilities).toMatchObject({ canSubmit: false, leaderboard: false })
    expect(game.diagnostics.reasons).toContain('not_embedded')
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })

  it('无宿主但老 URL 带 student_id + rank_api → compatibility（经典榜继续可用）', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), { match: '/submit', method: 'POST', respond: () => okJson({}) }])
    vi.stubGlobal('fetch', router.fetch)
    const game = await createGame({ params: new URLSearchParams(LEGACY_QUERY) })
    expect(game.mode).toBe('compatibility')
    expect(game.trustLevel).toBe('legacy')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmitLegacy: true, rewardsEnabled: false })
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })

  it('legacy_compatible=false 的游戏在无宿主时只能 standalone（不得回落 Legacy）', async () => {
    const adapter = createGameAdapter({
      gameId: 'hbut_gomoku',
      metric: { name: 'score_only', semantics: 'none', max: 0 },
      capabilities: { ranked: false, legacyCompatible: false }
    })
    vi.stubGlobal('fetch', createFetchRouter([]).fetch)
    const game = await createGameWithAdapter(adapter, { params: new URLSearchParams(LEGACY_QUERY) })
    expect(game.mode).toBe('standalone')
    expect(game.capabilities.canSubmitLegacy).toBe(false)
    game.dispose()
  })
})

describe('SDK 模式：ticket-session 失败与 legacy fallback', () => {
  it('session 兑换 401（TICKET_INVALID）且宿主给不出新 ticket → compatibility', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(() => errJson('TICKET_INVALID', 401))
    ])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id
    })
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.diagnostics.reasons.some((item: string) => item.includes('session_exchange_failed'))).toBe(true)
    // 曾向宿主申请新 ticket（恢复策略 A），但宿主未响应 → 不阻塞、直接降级
    expect(host.lastPosted('mini-hbut:game-sdk:request-ticket')).toBeTruthy()
    game.dispose()
  })

  it('session 兑换 401 后宿主补发新 ticket → 用新 ticket 重试一次并进入 verified', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    let sessionAttempt = 0
    const router = createFetchRouter([
      metaRoute(),
      sessionRoute(() => {
        sessionAttempt += 1
        return sessionAttempt === 1
          ? errJson('TICKET_INVALID', 401)
          : okJson({ session_id: 'sid_abcdefghijklmnop', session_token: 'gs_second', replayed_session: false })
      })
    ])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id
    })
    // 宿主响应 request-ticket
    await new Promise((resolve) => setTimeout(resolve, 0))
    const ticketRequest = host.lastPosted('mini-hbut:game-sdk:request-ticket') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:ticket',
      game_id: 'hbut_stack',
      request_id: ticketRequest.request_id,
      ticket: TICKET2
    })

    const game = await pending
    expect(game.mode).toBe('verified')
    const bodies = router.callsFor('/sessions').map((call) => call.body as { ticket: string })
    expect(bodies.map((body) => body.ticket)).toEqual([TICKET, TICKET2])
    expect(game.diagnostics.reasons).toContain('session_recovered_host_ticket')
    game.dispose()
  })

  it('V2 未部署（/meta 裸 404）→ 不发起 session 兑换，直接走经典榜', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([{ match: '/meta', method: 'GET', respond: () => new Response('nope', { status: 404 }) }])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id
    })
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(router.callsFor('/sessions')).toHaveLength(0)
    expect(game.diagnostics.reasons.some((item: string) => item.includes('meta_unavailable_feature_disabled'))).toBe(true)
    game.dispose()
  })
})

describe('SDK 模式：宿主来源与绑定校验', () => {
  it('wrong origin 的 welcome 被拒绝（不采用其 ticket，不影响模式）', async () => {
    const host = createFakeHostWindow({ search: '', origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    // 恶意来源：携带有效形状的 ticket，但 origin 不在允许集合内
    host.deliver(
      {
        type: 'mini-hbut:game-sdk:welcome',
        protocol_version: 1,
        game_id: 'hbut_stack',
        request_id: hello.request_id,
        ticket: TICKET
      },
      { origin: 'https://evil.example' }
    )

    const game = await pending
    expect(game.mode).toBe('standalone')
    expect(router.callsFor('/sessions')).toHaveLength(0)
    expect(game.diagnostics.host.rejections.some((item: { reason: string }) => item.reason === 'origin_rejected')).toBe(true)
    expect(game.diagnostics.reasons).toContain('host_welcome_unavailable')
    game.dispose()
  })

  it('同时校验 event.source：非宿主窗口发来的 welcome 被拒绝', async () => {
    const host = createFakeHostWindow({ search: '', origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver(
      {
        type: 'mini-hbut:game-sdk:welcome',
        protocol_version: 1,
        game_id: 'hbut_stack',
        request_id: hello.request_id,
        ticket: TICKET
      },
      { source: { postMessage: () => {} } }
    )
    const game = await pending
    expect(game.mode).toBe('standalone')
    expect(game.diagnostics.host.rejections.some((item: { reason: string }) => item.reason === 'source_rejected')).toBe(true)
    game.dispose()
  })

  it('request_id 不匹配的 welcome 被忽略（防串台/重放）', async () => {
    const host = createFakeHostWindow({ search: '', origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: 'hs_stale_request',
      ticket: TICKET
    })
    const game = await pending
    expect(game.mode).toBe('standalone')
    expect(game.diagnostics.host.rejections.some((item: { reason: string }) => item.reason === 'request_id_mismatch')).toBe(true)
    game.dispose()
  })

  it('game_id mismatch（宿主声明了另一个游戏）→ 不使用其 ticket，不发 session 请求', async () => {
    const host = createFakeHostWindow({ search: '', origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)

    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_2048',
      request_id: hello.request_id,
      ticket: TICKET
    })
    const game = await pending
    expect(game.mode).toBe('standalone')
    expect(router.callsFor('/sessions')).toHaveLength(0)
    expect(game.diagnostics.host.rejections.some((item: { reason: string }) => item.reason === 'game_id_mismatch')).toBe(true)
    game.dispose()
  })

  it('game_id mismatch（URL query 与 SDK 配置不一致）→ 禁用可信提交', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const game = await createGame({ params: new URLSearchParams(`game_id=hbut_2048&gpt=${TICKET}&${LEGACY_QUERY}`) })
    expect(game.mode).toBe('compatibility')
    expect(router.callsFor('/sessions')).toHaveLength(0)
    expect(game.diagnostics.reasons).toContain('game_id_mismatch_url')
    game.dispose()
  })
})

describe('SDK 模式：SDK 版本与 protocol 版本不匹配', () => {
  it('welcome 声明的 protocol_version 超出支持区间 → 拒绝该握手', async () => {
    const host = createFakeHostWindow({ search: '', origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 2,
      game_id: 'hbut_stack',
      request_id: hello.request_id,
      ticket: TICKET
    })
    const game = await pending
    expect(game.mode).toBe('standalone')
    expect(router.callsFor('/sessions')).toHaveLength(0)
    expect(
      game.diagnostics.host.rejections.some((item: { reason: string }) => item.reason === 'protocol_version_unsupported')
    ).toBe(true)
    game.dispose()
  })

  it('/meta 的 [min,max] 与本 SDK 不兼容 → PROTOCOL_VERSION_UNSUPPORTED 降级，不重试', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchRouter([metaRoute({ protocol_version: { min: 2, max: 3 } }), sessionRoute()]).fetch
    )
    const game = await createGame({ params: new URLSearchParams(`gpt=${TICKET}&${LEGACY_QUERY}`) })
    expect(game.mode).toBe('compatibility')
    expect(game.capabilities.blocked).toMatchObject({ code: 'PROTOCOL_VERSION_UNSUPPORTED' })
    expect(game.diagnostics.reasons).toContain('protocol_version_unsupported')
    game.dispose()
  })

  it('registry 的 min_client_version 高于当前版本 → CLIENT_VERSION_TOO_OLD（软门禁）', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const pending = createGame({ clientVersion: '1.4.11' })
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id,
      registry_entry: {
        game_id: 'hbut_stack',
        status: 'active',
        min_client_version: '9.9.9',
        metric: { name: 'layers', max: 100000, semantics: 'count' }
      }
    })
    const game = await pending
    expect(game.mode).toBe('compatibility')
    expect(game.diagnostics.reasons.some((item: string) => item.includes('client_version_too_old'))).toBe(true)
    expect(router.callsFor('/sessions')).toHaveLength(0)
    game.dispose()
  })

  it('registry status=disabled → GAME_DISABLED，不提交', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id,
      registry_entry: { game_id: 'hbut_stack', status: 'disabled' }
    })
    const game = await pending
    expect(game.mode).toBe('standalone')
    expect(game.capabilities.blocked).toMatchObject({ code: 'GAME_DISABLED' })
    game.dispose()
  })

  it('registry metric 与游戏声明冲突时以服务端为准并记诊断', async () => {
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    const router = createFetchRouter([metaRoute(), sessionRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const pending = createGame()
    const hello = host.lastPosted('mini-hbut:game-sdk:hello') as Record<string, unknown>
    host.deliver({
      type: 'mini-hbut:game-sdk:welcome',
      protocol_version: 1,
      game_id: 'hbut_stack',
      request_id: hello.request_id,
      registry_entry: { game_id: 'hbut_stack', status: 'active', metric: { name: 'layers', max: 2048, semantics: 'count' } }
    })
    const game = await pending
    expect(game.mode).toBe('verified')
    expect(game.adapter.metric.max).toBe(2048)
    expect(game.diagnostics.conflicts).toContain('metric.max:100000→2048')
    game.dispose()
  })
})

describe('SDK 模式：网络故障（契约 3：故障不能让游戏整体不可玩）', () => {
  it('断网（fetch 全部 reject）→ 降级 compatibility，ready 不抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    )
    const game = await createGame({ params: new URLSearchParams(`gpt=${TICKET}&${LEGACY_QUERY}`) })
    expect(game.mode).toBe('compatibility')
    expect(game.diagnostics.errors.length).toBeGreaterThan(0)
    expect(game.diagnostics.errors[0].code).toBe('INTERNAL_ERROR')
    game.dispose()
  })

  it('断网且无 Legacy 通道 → standalone（本地可玩）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const game = await createGame({ params: new URLSearchParams(`gpt=${TICKET}`) })
    expect(game.mode).toBe('standalone')
    game.dispose()
  })

  it('/meta 返回 500（服务端异常）→ 降级而不是卡住', async () => {
    // 500 路由必须排在 metaRoute 之前：createFetchRouter 取首个命中路由
    vi.stubGlobal('fetch', createFetchRouter([{ match: '/meta', method: 'GET', respond: () => errJson('INTERNAL_ERROR', 500) }, sessionRoute()]).fetch)
    const game = await createGame({ params: new URLSearchParams(`gpt=${TICKET}&${LEGACY_QUERY}`) })
    expect(game.mode).toBe('compatibility')
    game.dispose()
  })
})

describe('SDK 模式：初始化契约', () => {
  it('缺少 adapter → 抛 TypeError（程序员错误必须显式）', () => {
    expect(() => MiniHBUTGame.create({ gameId: 'hbut_stack' })).toThrow(TypeError)
  })

  it('gameId 与 adapter.gameId 不一致 → 抛 TypeError', () => {
    expect(() => MiniHBUTGame.create({ gameId: 'hbut_2048', adapter: HBUT_STACK_ADAPTER })).toThrow(TypeError)
  })

  it('create() 同步可用（不阻塞渲染），capabilities 在 ready 前后都可用', async () => {
    vi.stubGlobal('fetch', createFetchRouter([metaRoute()]).fetch)
    const game = MiniHBUTGame.create({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(LEGACY_QUERY),
      timeouts: { welcome: 1 }
    })
    // 无 ticket 的分支完全同步完成：create() 返回时模式已确定
    expect(game.mode).toBe('compatibility')
    // capabilities 在 ready 前走「同步预判」（pending 标记），ready 后为最终值
    expect(game.capabilities.pending).toBe(true)
    expect(game.capabilities.canSubmitLegacy).toBe(true)
    await game.ready
    expect(game.capabilities.pending).toBeUndefined()
    expect(game.mode).toBe('compatibility')
    expect(game.capabilities).toMatchObject({ canSubmitVerified: false, canSubmit: true, leaderboard: true })
    game.dispose()
  })

  it('模式降级单向：verified → compatibility 生效，反向升级被忽略', async () => {
    vi.stubGlobal('fetch', createFetchRouter([metaRoute(), sessionRoute()]).fetch)
    const engine = MiniHBUTGame.createEngine({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(`gpt=${TICKET}&${LEGACY_QUERY}`),
      timeouts: { welcome: 1, ticket: 1 }
    })
    await engine.ready
    expect(engine.getMode()).toBe('verified')
    expect(engine.downgradeTo('compatibility', 'unit_test')).toBe('compatibility')
    // 已降级到 compatibility 后不允许回到 verified
    expect(engine.downgradeTo('verified', 'unit_test_upgrade')).toBe('compatibility')
    expect(engine.getMode()).toBe('compatibility')
    engine.dispose()
  })

  it('standalone 时 capability 全为 false（UI 不展示排行入口）', async () => {
    vi.stubGlobal('fetch', createFetchRouter([metaRoute()]).fetch)
    const game = await createGame({ params: new URLSearchParams('') })
    expect(game.mode).toBe('standalone')
    expect(game.capabilities).toMatchObject({
      canSubmit: false,
      canSubmitVerified: false,
      canSubmitLegacy: false,
      leaderboard: false,
      rewardsEnabled: false
    })
    game.dispose()
  })
})
