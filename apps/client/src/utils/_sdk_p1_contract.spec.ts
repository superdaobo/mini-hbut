import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MiniHBUTGame,
  SERVICE_CAPABILITY_KEYS,
  canSubmitLegacyRank,
  emptyServiceCapabilities,
  isCapabilityDisabled,
  readServiceCapabilities,
  resolveApiBases
} from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchCall, FetchRoute } from './_sdk_test_harness'
import {
  DEFAULT_GAME_CENTER_FLAGS,
  GAME_CENTER_FLAG_KEYS,
  RESERVED_GAME_CENTER_FLAG_DEFAULTS,
  RESERVED_GAME_CENTER_FLAG_KEYS
} from './game_center/base'
import { resolveEffectiveGameCenterFlags, resolveGameCenterFlags } from './game_center/flags'
import { getFeaturePolicy, setAppStoreBuildOverrideForTests } from '../config/app_store_policy'

/**
 * Production Readiness P1 收口契约（SDK 侧）：
 *
 * 1. **P1-5 三模式网络行为**：standalone 零远程请求（不发 V2、也不发 Legacy），
 *    成绩只留在本地；compatibility / verified 提交路径不变（有既有测试守护）。
 *    核心回归点：`?student_id=...`（**无** `rank_api`）的「网页直开模块」
 *    必须落到 standalone —— 旧实现会回落到硬编码测试域并把成绩写进测试库。
 *
 * 2. **API base 决策链 fail closed**：SDK 配置 > Host 注入（`gp_api` / `rank_api`）> 环境默认（仅 V2）。
 *    Legacy 通道**没有**环境默认：无显式注入即不可提交。
 *
 * 3. **capability-driven（P1-1）**：读取 `/meta.capabilities`（含宿主转发 + features 过渡形态），
 *    未知一律 false（供 UI 前置隐藏）；运行时只在服务端**显式声明**不可用时短路请求。
 */

const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const LEGACY_QUERY =
  'student_id=20240111&player_name=叠塔&class_name=机械2401&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'
/** 网页直开（学校站点/模块页）常见形态：有身份，但没有任何 API 决策 */
const DIRECT_OPEN_QUERY = 'student_id=20240111&player_name=叠塔&class_name=机械2401'

const RESULT_INPUT = {
  score: 650,
  maxLevel: 5,
  moveCount: 5,
  durationMs: 20000,
  endedReason: 'lost'
}

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
  respond: () => okJson({ session_id: 'sid_abcdefghijklmnop', session_token: 'gs_test_token', replayed_session: false })
})

const createRunRoute = (): FetchRoute => ({
  match: '/runs',
  method: 'POST',
  respond: (call: FetchCall) => (call.url.endsWith('/runs') ? okJson({ run: { run_id: 'server', status: 'CREATED' } }) : undefined)
})

const finishRoute = (): FetchRoute => ({
  match: /\/runs\/.+\/finish/,
  method: 'POST',
  respond: () => okJson({ run: { status: 'SETTLED' }, settlement: { state: 'applied', reward_status: 'granted' } })
})

const legacySubmitRoute = (): FetchRoute => ({
  match: '/submit',
  method: 'POST',
  respond: () => okJson({ success: true })
})

const leaderboardRoute = (): FetchRoute => ({ match: '/leaderboards', method: 'GET', respond: () => okJson({ entries: [] }) })

/** verified 句柄：Host 握手 + ticket 兑换（Host 同时注入 rank_api，V2 base 由其同源推导） */
const createVerifiedGame = async (
  router: ReturnType<typeof createFetchRouter>,
  options: { search?: string; clientVersion?: string } = {}
) => {
  const host = createFakeHostWindow({
    search: options.search || `?gpt=${TICKET}&${LEGACY_QUERY}`,
    origin: 'https://app.example'
  })
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('P1-5 三模式网络行为（standalone 零远程请求）', () => {
  it('网页直开（有 student_id、无 rank_api、无 ticket）→ standalone，全程零请求', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), legacySubmitRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(DIRECT_OPEN_QUERY),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.trustLevel).toBeNull()
    expect(game.capabilities).toMatchObject({ canSubmit: false, canSubmitLegacy: false, leaderboard: false })
    expect(router.calls).toHaveLength(0)

    const run = game.startRun()
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
    expect(outcome.message).toContain('本地')
    expect(run.result).toMatchObject({ score: 650, metric: { value: 5 } })
    expect(await run.retry()).toMatchObject({ duplicate: true })
    expect((await game.leaderboard({ scope: 'class' })).source).toBe('none')
    // P1-5 核心断言：不发 V2（/meta、/sessions、/runs、/finish），也不发 Legacy（/submit）
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })

  it('网页直开但**未注入** rank_api → 不写任何伪造的 API base（不继承测试域）', async () => {
    const host = createFakeHostWindow({ search: `?${DIRECT_OPEN_QUERY}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('localStorage', host.win.localStorage)
    vi.stubGlobal('fetch', createFetchRouter([]).fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.diagnostics.api.legacy).toBe('')
    expect(game.diagnostics.api.sources.legacy).toBe('none')
    // 有身份信息 → 上下文会落盘；但 rankApiBase 必须是空串（不继承任何隐式远程目标）
    expect(host.storageWrites.length).toBeGreaterThan(0)
    for (const write of host.storageWrites) {
      expect(write.value).not.toContain('testocr1')
      const parsed = JSON.parse(write.value) as Record<string, unknown>
      if (Object.prototype.hasOwnProperty.call(parsed, 'rankApiBase')) expect(parsed.rankApiBase).toBe('')
    }
    game.dispose()
  })

  it('compatibility（显式注入 rank_api）只打 Legacy /submit，不发任何 V2 请求', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), legacySubmitRoute()])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(LEGACY_QUERY),
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('compatibility')
    expect(router.calls).toHaveLength(0)

    const run = game.startRun({ runId: 'run_p1_legacy_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })
    expect(router.calls).toHaveLength(1)
    expect(router.calls[0].url).toBe('https://rank.example/api/game-rank/submit')
    expect(router.callsFor('/meta')).toHaveLength(0)
    expect(router.callsFor('/sessions')).toHaveLength(0)
    expect(router.callsFor(/\/finish/)).toHaveLength(0)
    game.dispose()
  })

  it('verified（Host ticket + 注入 rank_api）只打 V2，不发 Legacy /submit', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishRoute(), legacySubmitRoute()])
    const { game } = await createVerifiedGame(router)
    expect(game.mode).toBe('verified')
    // V2 base 由 Host 注入的 rank_api 同源推导（不依赖 SDK 内建域）
    expect(router.callsFor('/meta')[0].url).toBe('https://rank.example/api/game-platform/v1/meta')

    const run = game.startRun({ runId: 'run_p1_verified_1' })
    const outcome = await run.finish(RESULT_INPUT)
    expect(outcome).toMatchObject({ success: true, mode: 'verified', trustLevel: 'verified_session', uploaded: true })
    expect(router.callsFor('/sessions')).toHaveLength(1)
    expect(router.callsFor(/\/finish/)).toHaveLength(1)
    expect(router.callsFor('/submit')).toHaveLength(0)
    game.dispose()
  })

  it('#970c：慢网首开（宿主桥迟到、welcome 无响应）→ 有界重试后本轮降级且零 V2 请求', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishRoute(), leaderboardRoute()])
    // 有 host_origin（桥 embedded）但**始终不投递 welcome** —— 模拟慢网下宿主晚于 iframe 就绪
    const host = createFakeHostWindow({ search: `?gpt=${TICKET}&${LEGACY_QUERY}`, origin: 'https://app.example' })
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 10, ticket: 10 },
      requestTimeoutMs: 60
    })
    // 有界重试：恰好 HOST_HANDSHAKE_ATTEMPTS 次 hello，不会无限挂起
    expect(host.posted.filter((item) => item.message?.type === 'mini-hbut:game-sdk:hello')).toHaveLength(2)
    // 本轮降级（显式注入过 rank_api → legacy 可提交 → compatibility），非 verified
    expect(game.mode).toBe('compatibility')
    expect(game.trustLevel).toBe('legacy')
    // 已知取舍：本轮无自愈 —— mode 通知宿主（非静默）+ 原因写入 diagnostics
    expect(game.diagnostics.reasons).toContain('host_welcome_unavailable')
    expect(game.diagnostics.reasons).toContain('host_welcome_retry')
    expect(host.lastPosted('mini-hbut:game-sdk:mode')).toMatchObject({ mode: 'compatibility' })
    // 零 V2 请求：不兑换 ticket、不读 /meta（即使远程服务可用）
    expect(router.callsFor('/meta')).toHaveLength(0)
    expect(router.callsFor('/sessions')).toHaveLength(0)
    game.dispose()
  })
})

describe('P1-5 API base 决策链（fail closed）', () => {
  it('无任何配置：Legacy 无默认域（不可提交），V2 用生产环境默认', () => {
    const bases = resolveApiBases({}, new URLSearchParams(''))
    expect(bases.legacyBase).toBe('')
    expect(bases.legacySource).toBe('none')
    expect(bases.rankApiInjected).toBe(false)
    expect(bases.v2Source).toBe('env_default')
    expect(bases.v2Base).toBe('https://mini.hbut.site/api/game-platform/v1')
    // 回归护栏：测试域绝不出现（P1-5 根因）
    expect(bases.v2Base).not.toContain('mini-hbut-testocr1')
    expect(canSubmitLegacyRank({ legacyStudentId: '20240111', rankApiBase: bases.legacyBase })).toBe(false)
  })

  it('优先级：SDK 配置 > Host 注入（URL query）', () => {
    const hostOnly = resolveApiBases({}, new URLSearchParams('rank_api=host.example/api/game-rank&gp_api=https://gp.example'))
    expect(hostOnly.legacyBase).toBe('host.example/api/game-rank')
    expect(hostOnly.legacySource).toBe('host')
    expect(hostOnly.v2Source).toBe('host')
    expect(hostOnly.v2Base).toBe('https://gp.example/api/game-platform/v1')

    const configured = resolveApiBases(
      { rankApiBase: 'config.example/api/game-rank', gamePlatformApiBase: 'https://cfg.example/api/game-platform/v1' },
      new URLSearchParams('rank_api=host.example/api/game-rank&gp_api=https://gp.example')
    )
    expect(configured.legacyBase).toBe('config.example/api/game-rank')
    expect(configured.legacySource).toBe('config')
    expect(configured.v2Base).toBe('https://cfg.example/api/game-platform/v1')
    expect(configured.v2Source).toBe('config')
  })

  it('只注入 rank_api：V2 base 同源推导（Host 只需一个决策）', () => {
    const bases = resolveApiBases({}, new URLSearchParams('rank_api=https://rank.example/api/game-rank'))
    expect(bases.legacyBase).toBe('https://rank.example/api/game-rank')
    expect(bases.v2Base).toBe('https://rank.example/api/game-platform/v1')
    expect(bases.v2Source).toBe('host_derived')
  })

  it('持久化上下文可作为 Legacy 来源，但仍需显式身份 + 显式 base 才可提交', () => {
    const host = createFakeHostWindow({
      search: `?${DIRECT_OPEN_QUERY}`,
      origin: 'https://app.example'
    })
    const storage = host.win.localStorage as Storage
    storage.setItem(
      'hbut_stack_rank_context_v1',
      JSON.stringify({ studentId: '20240111', playerName: '叠塔', className: '机械2401', rankApiBase: 'https://stored.example/api/game-rank' })
    )
    vi.stubGlobal('window', host.win)
    vi.stubGlobal('localStorage', host.win.localStorage)
    vi.stubGlobal('fetch', createFetchRouter([legacySubmitRoute()]).fetch)
    return MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      timeouts: { welcome: 5 }
    }).then((game) => {
      expect(game.mode).toBe('compatibility')
      expect(game.diagnostics.api.legacy).toBe('https://stored.example/api/game-rank')
      expect(game.diagnostics.api.sources.legacy).toBe('stored')
      game.dispose()
    })
  })

  it('SDK 源码里不再出现测试域（结构性护栏）', () => {
    const sdkRoot = resolve(process.cwd(), '../../website/modules-src/_sdk/src')
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(resolve(dir, entry.name)) : entry.name.endsWith('.js') ? [resolve(dir, entry.name)] : []
      )
    for (const file of walk(sdkRoot)) {
      expect(readFileSync(file, 'utf8'), `${file} 不得硬编码测试域`).not.toContain('mini-hbut-testocr1')
    }
  })
})

describe('P1-1 服务端能力（capabilities）：保守默认 + 显式声明才短路', () => {
  it('读不到 /meta 与宿主声明 → 一律 false，且不伪造 declared', () => {
    const none = readServiceCapabilities({})
    expect(none.values).toEqual(emptyServiceCapabilities())
    expect(none.declared).toEqual([])
    expect(none.source).toBe('none')
    expect(Object.keys(none.values).sort()).toEqual([...SERVICE_CAPABILITY_KEYS].sort())
  })

  it('meta.capabilities 完整声明 → 逐项生效（服务端权威）', () => {
    const declared = readServiceCapabilities({
      meta: { capabilities: { leaderboards: true, daily_tasks: false, gomoku_competitive: true, verified_reward: false } }
    })
    expect(declared.values).toEqual({
      leaderboards: true,
      daily_tasks: false,
      gomoku_competitive: true,
      verified_reward: false
    })
    expect(declared.declared).toEqual([...SERVICE_CAPABILITY_KEYS])
    expect(declared.source).toBe('meta')
    expect(isCapabilityDisabled(declared, 'leaderboards')).toBe(false)
    expect(isCapabilityDisabled(declared, 'daily_tasks')).toBe(true)
  })

  it('字段缺失 / 类型非法 → 未知即 false（不得乐观放行）', () => {
    const partial = readServiceCapabilities({ meta: { capabilities: { leaderboards: { enabled: true } } } })
    expect(partial.values.leaderboards).toBe(false)
    expect(partial.declared).toEqual([])
    for (const bad of [2, 'maybe', null, [], { on: true }]) {
      const parsed = readServiceCapabilities({ meta: { capabilities: { leaderboards: bad } } })
      expect(parsed.values.leaderboards).toBe(false)
      expect(parsed.declared).toEqual([])
    }
  })

  it('#965：features 过渡形态（纯能力名）仍兼容读取，但 capabilities 是唯一权威', () => {
    // 集成期过渡：服务端尚未统一下发 capabilities 时，features.<纯能力名> 兜底读取；
    // 该形态只覆盖「命名差异」，不接受 flag 形态名（见下一用例），且优先级低于 capabilities。
    const fromFeatures = readServiceCapabilities({ meta: { features: { leaderboards: false } } })
    expect(fromFeatures.values.leaderboards).toBe(false)
    expect(fromFeatures.declared).toEqual(['leaderboards'])
    expect(fromFeatures.source).toBe('meta')

    const fromLiteral = readServiceCapabilities({ meta: { capabilities: { leaderboards: 'off', daily_tasks: 'enabled' } } })
    expect(fromLiteral.values.leaderboards).toBe(false)
    expect(fromLiteral.values.daily_tasks).toBe(true)
  })

  it('#965：flag 形态名（*_enabled）在任何作用域都不能被读成「端点已实现」', () => {
    // capabilities 作用域同样拒绝（此前只在 features 作用域拒绝）——
    // `capabilities.leaderboards_enabled=true` 是 flag 语义，不是能力声明（P1-1 复发路径）
    const flagShapedCapabilities = readServiceCapabilities({
      meta: {
        capabilities: {
          leaderboards_enabled: true,
          daily_tasks_enabled: true,
          gomoku_competitive_enabled: true,
          verified_reward_enabled: true
        }
      }
    })
    expect(flagShapedCapabilities.values).toEqual(emptyServiceCapabilities())
    expect(flagShapedCapabilities.declared).toEqual([])
    expect(flagShapedCapabilities.source).toBe('none')

    // features 作用域维持拒绝
    const flagShapedFeatures = readServiceCapabilities({ meta: { features: { daily_tasks_enabled: true } } })
    expect(flagShapedFeatures.values.daily_tasks).toBe(false)
    expect(flagShapedFeatures.declared).toEqual([])

    // welcome 两个作用域同样拒绝
    const flagShapedWelcome = readServiceCapabilities({
      welcome: { capabilities: { leaderboards_enabled: true }, features: { verified_reward_enabled: true } }
    })
    expect(flagShapedWelcome.values).toEqual(emptyServiceCapabilities())
    expect(flagShapedWelcome.declared).toEqual([])

    // 纯能力名不受影响（主形状仍生效）
    const pure = readServiceCapabilities({ meta: { capabilities: { leaderboards: true } } })
    expect(pure.values.leaderboards).toBe(true)
    expect(pure.declared).toEqual(['leaderboards'])

    // capabilities 与 features 同时声明时，capabilities（唯一权威）胜出
    const authoritative = readServiceCapabilities({
      meta: { capabilities: { leaderboards: false }, features: { leaderboards: true } }
    })
    expect(authoritative.values.leaderboards).toBe(false)
  })

  it('优先级 meta > welcome，且宿主自身握手能力不污染能力表', () => {
    const merged = readServiceCapabilities({
      meta: { capabilities: { leaderboards: true } },
      welcome: { capabilities: { leaderboards: false, daily_tasks: true } }
    })
    expect(merged.values.leaderboards).toBe(true)
    expect(merged.values.daily_tasks).toBe(true)
    expect(merged.declared).toEqual(['leaderboards', 'daily_tasks'])
    expect(merged.source).toBe('meta')

    const hostOnly = readServiceCapabilities({ welcome: { capabilities: { launch_ticket: false, session_recovery: true } } })
    expect(hostOnly.values).toEqual(emptyServiceCapabilities())
    expect(hostOnly.declared).toEqual([])
    expect(hostOnly.source).toBe('none')
  })

  it('verified + 服务端显式声明无 /leaderboards、且无经典榜 → 一个榜请求都不发', async () => {
    const router = createFetchRouter([
      metaRoute({ capabilities: { leaderboards: false, daily_tasks: false, gomoku_competitive: false, verified_reward: false } }),
      sessionRoute(),
      createRunRoute(),
      finishRoute(),
      leaderboardRoute()
    ])
    // 只注入 V2 base（无 student_id / rank_api → 没有经典榜通道）
    const { game } = await createVerifiedGame(router, {
      search: `?gpt=${TICKET}&gp_api=https://rank.example/api/game-platform/v1`
    })
    expect(game.mode).toBe('verified')
    expect(game.capabilities.server.leaderboards).toBe(false)
    expect(game.capabilities.leaderboard).toBe(false)
    expect(game.diagnostics.capabilities).toMatchObject({
      source: 'meta',
      disabled: ['leaderboards', 'daily_tasks', 'gomoku_competitive', 'verified_reward']
    })

    const result = await game.leaderboard({ scope: 'class' })
    expect(result).toMatchObject({ success: false, source: 'none', reason: 'capability_leaderboards_disabled' })
    expect(result.message).toContain('暂未开放')
    expect(router.callsFor('/leaderboards')).toHaveLength(0)
    game.dispose()
  })

  it('verified + 服务端显式声明无 /leaderboards、但经典榜可用 → 不发 V2 榜，回落经典榜', async () => {
    const router = createFetchRouter([
      metaRoute({ capabilities: { leaderboards: false } }),
      sessionRoute(),
      createRunRoute(),
      finishRoute(),
      leaderboardRoute(),
      // 经典榜 URL 形状：`.../game-rank/leaderboard/?game_id=...`（注意复数是 V2 榜，必须区分）
      { match: /\/leaderboard\/?\?/, method: 'GET', respond: () => okJson({ leaderboard: [{ rank: 1, player_name: '李四', score: 700 }] }) }
    ])
    const { game } = await createVerifiedGame(router)
    expect(game.capabilities.server.leaderboards).toBe(false)
    // 经典榜仍可用 → 本地至少还有一条可读榜路径（既有键语义不变）
    expect(game.capabilities.leaderboard).toBe(true)
    const result = await game.leaderboard({ scope: 'class' })
    expect(result).toMatchObject({ success: true, source: 'legacy', mode: 'compatibility' })
    expect(router.callsFor(/\/leaderboards/)).toHaveLength(0)
    expect(router.callsFor(/\/leaderboard\/?\?/)).toHaveLength(1)
    game.dispose()
  })

  it('/meta 未声明 capabilities（过渡期）→ 保守 server=false，但不改变既有探测 + 降级行为', async () => {
    const router = createFetchRouter([metaRoute(), sessionRoute(), createRunRoute(), finishRoute(), leaderboardRoute()])
    const { game } = await createVerifiedGame(router)
    expect(game.capabilities.server).toEqual(emptyServiceCapabilities())
    expect(game.diagnostics.capabilities).toMatchObject({ source: 'none', declared: [], disabled: [] })
    // 未知 ≠ 禁用：已上线的 verified 榜路径不得因字段缺失被误伤
    expect(game.capabilities.leaderboard).toBe(true)
    const result = await game.leaderboard({ scope: 'class' })
    expect(result).toMatchObject({ success: true, source: 'v2' })
    expect(router.callsFor('/leaderboards')).toHaveLength(1)
    game.dispose()
  })

  it('服务端显式声明可用 → 正常读 V2 榜；verified_reward 显式 false 关闭 rewardsEnabled', async () => {
    const router = createFetchRouter([
      metaRoute({
        features: { run_v2: true, economy: true },
        capabilities: { leaderboards: true, verified_reward: false }
      }),
      sessionRoute(),
      createRunRoute(),
      finishRoute(),
      leaderboardRoute()
    ])
    const { game } = await createVerifiedGame(router)
    expect(game.capabilities.server).toMatchObject({ leaderboards: true, verified_reward: false })
    expect(game.capabilities.leaderboard).toBe(true)
    expect(game.capabilities.rewardsEnabled).toBe(false)
    const result = await game.leaderboard({ scope: 'class' })
    expect(result).toMatchObject({ success: true, source: 'v2' })
    game.dispose()
  })

  it('ready 之前（preflight）能力表一律保守 false', async () => {
    vi.stubGlobal('fetch', createFetchRouter([metaRoute()]).fetch)
    const game = MiniHBUTGame.create({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: new URLSearchParams(LEGACY_QUERY),
      timeouts: { welcome: 5 }
    })
    expect(game.capabilities.pending).toBe(true)
    expect(game.capabilities.server).toEqual(emptyServiceCapabilities())
    await game.ready
    expect(game.capabilities.pending).toBeUndefined()
    game.dispose()
  })
})

describe('P1 收口：客户端新增 flag（定义在 base.ts，默认 false）', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
  })

  it('三个新 flag 的 key 与默认值被精确冻结，且默认一律 false', () => {
    // 精确冻结（可失败的护栏）：多一个/少一个/改名都会红
    expect([...RESERVED_GAME_CENTER_FLAG_KEYS]).toEqual([
      'game_daily_tasks_enabled',
      'gomoku_competitive_enabled',
      'verified_reward_enabled'
    ])
    for (const key of RESERVED_GAME_CENTER_FLAG_KEYS) {
      expect(RESERVED_GAME_CENTER_FLAG_DEFAULTS[key], key).toBe(false)
      expect(DEFAULT_GAME_CENTER_FLAGS[key], key).toBe(false)
      expect(GAME_CENTER_FLAG_KEYS, key).toContain(key)
    }
    // 未下发任何配置时的生效值：一律关（fail closed，读不到不得当开启）
    const effective = resolveGameCenterFlags({})
    for (const key of RESERVED_GAME_CENTER_FLAG_KEYS) {
      expect(effective[key], key).toBe(false)
    }
  })

  it('远程配置可打开新 flag（仅表达"产品想不想要"，不等于能力可用）', () => {
    const flags = resolveGameCenterFlags({
      game_platform: { flags: { game_daily_tasks_enabled: true, verified_reward_enabled: true } }
    })
    expect(flags.game_daily_tasks_enabled).toBe(true)
    expect(flags.verified_reward_enabled).toBe(true)
    // 未下发的那一个仍然 false（不因同块里有 true 而被带开）
    expect(flags.gomoku_competitive_enabled).toBe(false)
  })

  it('合规包（guest/demo）下三个新 flag 被策略夹紧为 false，即使远程下发 true', () => {
    setAppStoreBuildOverrideForTests(true)
    const policy = getFeaturePolicy({ isLoggedIn: false, isDemoSession: true })
    const flags = resolveEffectiveGameCenterFlags(
      {
        game_platform: {
          flags: {
            game_daily_tasks_enabled: true,
            gomoku_competitive_enabled: true,
            verified_reward_enabled: true
          }
        }
      },
      policy
    )
    for (const key of RESERVED_GAME_CENTER_FLAG_KEYS) {
      expect(flags[key], `${key} 必须在合规包下被夹紧`).toBe(false)
    }
  })
})
