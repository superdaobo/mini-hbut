/**
 * SDK 引擎与对外句柄（#904 任务 1）。
 *
 * 生命周期（init 全流程，任何一步失败都只降级、不抛错）：
 *   probe（platform/runtime + adapter）
 *     → host 握手（postMessage，校验 origin，有界超时）
 *     → Launch Ticket 读取（URL query；读后立即 replaceState 清理）
 *     → registry 快照覆盖 adapter（服务端权威）
 *     → /meta 版本协商（协议区间 / feature flags）
 *     → ticket → session 兑换（内存态，不落盘）
 *     → 模式判定：verified / compatibility / standalone
 *
 * 三模式与 trust-model.md 三档信任级别的对应：
 *   verified      → verified_session（进 V2 settlement）
 *   compatibility → legacy（经典榜；不发新资产）
 *   standalone    → 无信任凭据（纯本地）
 */

import { createGameAdapter } from './adapters/adapter.js'
import { createTransport } from './transport.js'
import { createTelemetry } from './telemetry.js'
import { clearLaunchTicketFromUrl, createHostBridge, readLaunchTicket } from './host-bridge.js'
import { createGamePlatformClient } from './platform/game-platform-client.js'
import { applyRegistryEntry, resolveRegistryEntry } from './platform/registry.js'
import { resolveClientVersion, resolvePlatformContext } from './runtime.js'
import { isEmbedded, readSearchParams } from './env.js'
import {
  createJumpOutLegacyAdapter,
  fetchJumpOutLegacyLeaderboard,
  readJumpOutLegacyContext,
  submitJumpOutLegacyRank
} from './legacy/legacy-jump-out.js'
import {
  canSubmitLegacyRank,
  fetchLegacyLeaderboard,
  LEGACY_CHANNEL_CODE,
  readLegacyModuleContext,
  resolveLegacyPlatformText,
  submitLegacyRank,
  writeLegacyModuleContext
} from './legacy/legacy-rank.js'
import { createRun, RUN_STATUS } from './run.js'
import { ERROR_CODES, GamePlatformError, normalizeError } from './errors.js'
import { emptyServiceCapabilities, isCapabilityDisabled, readServiceCapabilities, SERVICE_CAPABILITY_KEYS } from './capabilities.js'
import {
  DEFAULT_GAME_PLATFORM_API_BASE,
  GAME_PLATFORM_API_NAMESPACE,
  MODES,
  SDK_VERSION,
  PROTOCOL_VERSION,
  TRUST_LEVELS,
  isProtocolRangeCompatible
} from './version.js'
import { createPrefixedId, isPlainObject, safeText, toIntegerOrNull } from './utils.js'

/** PII 守卫：任何对外返回的榜单条目都必须剔除身份字段（protocol-v1.md §9.3） */
const PII_KEY_RE = /^(student_id|hbut_student_id|player_id|user_id|sub|openid|unionid)$/i
export const stripPiiFields = (entry) => {
  if (!isPlainObject(entry)) return {}
  const safe = {}
  for (const [key, value] of Object.entries(entry)) {
    if (PII_KEY_RE.test(key)) continue
    safe[key] = value
  }
  return safe
}

/**
 * 可信 Host 握手的最大尝试次数（契约 C）。
 *
 * verified 现在**必须**建立在「可信 Host 握手」之上；而宿主桥可能在 iframe 页面执行
 * SDK init 之后才创建（宿主在 onload / 远程配置返回后才重建桥），首次 hello 有被丢弃的
 * 风险 —— 因此做一次有界重试，避免把「宿主迟到」误判为「无宿主」而整体降级。
 * 仍未握手成功 → standalone/compatibility，且**零 V2 请求**（不兑换 ticket）。
 */
const HOST_HANDSHAKE_ATTEMPTS = 2

/** V2 base 归一：补协议、去尾斜杠、补 `/api/game-platform/v1`（末段与旧行为一致） */
const normalizeV2ApiBase = (value) => {
  const text = safeText(value)
  if (!text) return DEFAULT_GAME_PLATFORM_API_BASE
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const trimmed = withProtocol.replace(/\/+$/, '')
  if (trimmed.endsWith(GAME_PLATFORM_API_NAMESPACE)) return trimmed
  if (/\/api\/game-rank$/i.test(trimmed)) return `${trimmed.replace(/\/api\/game-rank$/i, '')}${GAME_PLATFORM_API_NAMESPACE}`
  if (/\/api$/i.test(trimmed)) return `${trimmed}/game-platform/v1`
  return `${trimmed}${GAME_PLATFORM_API_NAMESPACE}`
}

/**
 * **API base 单一决策出口**（P1-5 收口）。引擎与测试都只走这里，禁止任何游戏自带默认域。
 *
 * 决策链（优先级从高到低；V2 与 Legacy 两条通道各自判定）：
 *   1. `config.gamePlatformApiBase` / `config.apiBase` / `config.rankApiBase`（SDK 显式配置）
 *   2. Host 注入的 iframe URL query：`gp_api` / `rank_api`
 *      （宿主侧 MoreView / 游乐场把 `rank_api` 写进 iframe URL；V2 base 可由其**同源推导**）
 *   3. 持久化上下文：localStorage 中上一次 Host 注入的 `rankApiBase`
 *      （由 `readLegacyModuleContext` 读取；本函数只看 config/URL，引擎再叠加该层）
 *   4. 环境默认（`DEFAULT_GAME_PLATFORM_API_BASE`，生产源）——**只有 V2 通道有**。
 *
 * Fail closed 规则（不可违反）：
 * - **Legacy 无环境默认**：没有任何显式来源 → `legacyBase === ''` → 不可提交
 *   （引擎进入 standalone，零远程请求）。这正是「网页直开模块写进测试库」的根治点。
 * - Legacy 缺失时**不得**借用 V2 的环境默认（两者是不同后端语义，绝不互相兜底）。
 *
 * @param {object} config 引擎配置
 * @param {URLSearchParams} [params] URL query（默认惰性取 location）
 * @returns {{ v2Base: string, v2Source: string, legacyBase: string, legacySource: string, rankApiInjected: boolean }}
 *   `source ∈ 'config' | 'host' | 'host_derived' | 'env_default'`（legacy 另有 `'none'`）
 */
export const resolveApiBases = (config = {}, params) => {
  const search = params || readSearchParams()
  const configV2 = safeText(config.gamePlatformApiBase || config.apiBase)
  const hostV2 = safeText(search.get('game_platform_api')) || safeText(search.get('gp_api'))
  const configLegacy = safeText(config.rankApiBase)
  const hostLegacy = safeText(search.get('rank_api'))
  // 显式 Legacy 决策（SDK 配置 > Host 注入）；没有显式值时**不**设置任何默认
  const explicitLegacy = configLegacy || hostLegacy
  const legacySource = configLegacy ? 'config' : hostLegacy ? 'host' : 'none'
  // 未显式给 V2 base 时，从宿主注入的 rank_api 同源推导（避免游戏各自硬编码生产地址）
  const derivedFromRank = explicitLegacy
    ? normalizeV2ApiBase(safeText(explicitLegacy).replace(/\/api\/game-rank.*$/i, ''))
    : ''
  const explicitV2 = configV2 || hostV2
  const v2Source = configV2 ? 'config' : hostV2 ? 'host' : derivedFromRank ? 'host_derived' : 'env_default'
  return {
    v2Base: normalizeV2ApiBase(explicitV2 || derivedFromRank),
    v2Source,
    legacyBase: explicitLegacy ? safeText(explicitLegacy).replace(/\/+$/, '') : '',
    legacySource,
    rankApiInjected: !!explicitLegacy
  }
}

/**
 * 创建内部引擎。句柄与 Run 共享该引擎（Run 通过引擎回调触发降级/恢复/重建）。
 */
export const createEngine = (config = {}) => {
  const params = config.params || readSearchParams()
  const adapterConfig = config.adapter
  if (!adapterConfig || typeof adapterConfig.buildResult !== 'function') {
    throw new TypeError('MiniHBUTGame.init 需要 adapter（见 createGameAdapter）')
  }
  const gameId = safeText(config.gameId) || safeText(adapterConfig.gameId)
  if (!gameId) throw new TypeError('MiniHBUTGame.init 需要 gameId')
  if (safeText(config.gameId) && safeText(adapterConfig.gameId) && safeText(config.gameId) !== safeText(adapterConfig.gameId)) {
    throw new TypeError(`gameId 与 adapter.gameId 不一致：${config.gameId} ≠ ${adapterConfig.gameId}`)
  }
  const urlGameId = safeText(params.get('game_id'))
  const bases = resolveApiBases(config, params)
  const clock = typeof config.clock === 'function' ? config.clock : () => Date.now()
  /** 有效 adapter：registry 快照（服务端权威）可覆盖游戏自报值 */
  let effectiveAdapter = adapterConfig
  let readySettled = false

  const diagnostics = {
    gameId,
    sdkVersion: SDK_VERSION,
    reasons: [],
    conflicts: [],
    hostRejections: [],
    errors: [],
    legacy: {},
    /** API 决策结果（见 resolveApiBases；legacy 为空串 = 未配置 = 不可提交） */
    api: { v2: bases.v2Base, legacy: bases.legacyBase, rank_api_injected: bases.rankApiInjected, sources: { v2: bases.v2Source, legacy: bases.legacySource } }
  }
  const reasons = new Set()
  const noteReason = (reason) => {
    const text = safeText(reason)
    if (!text) return
    reasons.add(text)
    diagnostics.reasons = Array.from(reasons)
  }

  const telemetry = createTelemetry({
    sink: typeof config.telemetry === 'function' ? config.telemetry : config.telemetry?.sink,
    correlationId: config.telemetry?.correlationId
  })
  const platformContext = config.platformContext || resolvePlatformContext({ params })
  const clientVersion = resolveClientVersion({ params, clientVersion: config.clientVersion })

  const transport = createTransport({
    fetchImpl: config.fetchImpl,
    timeoutMs: config.requestTimeoutMs,
    retryDelaysMs: config.retryDelaysMs
  })

  // ---- Legacy 通道路由：template_v1（默认） / jump_out 旧协议 / 自定义 ----
  const legacyProtocol = safeText(config.legacyProtocol || config.legacy?.protocol) || 'template'
  const legacyStorageKeys = config.legacy?.storageKeys
  const legacyContext =
    legacyProtocol === 'jump_out'
      ? readJumpOutLegacyContext({ gameId, params, storage: config.storage })
      : readLegacyModuleContext({ gameId, params, storage: config.storage, storageKeys: legacyStorageKeys })
  if (bases.rankApiInjected) legacyContext.rankApiBase = bases.legacyBase
  if (legacyProtocol === 'template') writeLegacyModuleContext(legacyContext, { storage: config.storage, storageKeys: legacyStorageKeys })
  /**
   * Legacy base 的**最终生效来源**（诊断用）：
   * 显式配置 / Host 注入 → 直接来自 resolveApiBases；
   * 都没有但 localStorage 里有上一次 Host 注入的值 → 'stored'；
   * 仍没有 → 'none'（引擎会判定 standalone，零远程请求）。
   */
  const legacyBaseSource = bases.legacySource !== 'none' ? bases.legacySource : safeText(legacyContext.rankApiBase) ? 'stored' : 'none'
  diagnostics.api.legacy = safeText(legacyContext.rankApiBase || legacyContext.rank_api)
  diagnostics.api.sources.legacy = legacyBaseSource

  const legacyCapable = () => effectiveAdapter.capabilities.legacyCompatible !== false
  const customLegacy = config.legacy && typeof config.legacy.submit === 'function' ? config.legacy : null
  const legacyChannel =
    legacyProtocol === 'jump_out'
      ? {
          protocol: 'snake_case_legacy_v0',
          channel: 'legacy_rank_api_old',
          trustLevel: TRUST_LEVELS.legacy,
          canSubmit: () => legacyCapable() && !!safeText(legacyContext.rank_api),
          toLegacyPayload: createJumpOutLegacyAdapter().toLegacyPayload,
          submit: ({ payload }) => submitJumpOutLegacyRank({ context: legacyContext, payload, transport }),
          leaderboard: ({ scope, limit }) =>
            fetchJumpOutLegacyLeaderboard({ context: legacyContext, scope, limit, transport })
        }
      : customLegacy
        ? {
            protocol: safeText(customLegacy.protocol) || 'custom',
            channel: safeText(customLegacy.channel) || 'custom_legacy',
            trustLevel: TRUST_LEVELS.legacy,
            canSubmit: () => legacyCapable() && customLegacy.canSubmit() !== false,
            toLegacyPayload: customLegacy.toLegacyPayload,
            submit: ({ payload }) => customLegacy.submit({ payload, context: legacyContext }),
            leaderboard: ({ scope, limit }) => customLegacy.leaderboard({ scope, limit, context: legacyContext })
          }
        : {
            protocol: 'template_v1',
            channel: LEGACY_CHANNEL_CODE,
            trustLevel: TRUST_LEVELS.legacy,
            canSubmit: () => legacyCapable() && canSubmitLegacyRank(legacyContext),
            submit: ({ runId, payload, result, durationMs, overrides }) =>
              submitLegacyRank({
                gameId,
                context: legacyContext,
                transport,
                legacy: {
                  runId,
                  score: payload?.score,
                  maxLevel: payload?.max_level,
                  moveCount: payload?.move_count,
                  endedReason: payload?.ended_reason,
                  durationMs: payload?.duration_ms ?? durationMs,
                  payload: payload?.payload,
                  // Legacy 通道保留自由文本原值（§7.3）；字段名与既有实现逐字一致
                  playerName: overrides?.playerName,
                  className: overrides?.className,
                  schoolName: overrides?.schoolName,
                  major: overrides?.major,
                  platform: overrides?.platform || resolveLegacyPlatformText(),
                  runtime: overrides?.runtime || platformContext.runtimeRaw || 'module-web',
                  clientVersion: overrides?.clientVersion || legacyContext.appVersion
                }
              }),
            leaderboard: ({ scope, limit }) => fetchLegacyLeaderboard({ gameId, context: legacyContext, scope, limit, transport })
          }
  diagnostics.legacy = {
    protocol: legacyChannel.protocol,
    channel: legacyChannel.channel,
    capable: legacyCapable(),
    available: legacyChannel.canSubmit()
  }

  const bridge = createHostBridge({
    windowRef: config.windowRef,
    hostOrigins: config.hostOrigins,
    allowOpaqueOrigin: config.allowOpaqueOrigin,
    welcomeTimeoutMs: config.timeouts?.welcome,
    ticketTimeoutMs: config.timeouts?.ticket,
    telemetry
  })

  const state = {
    mode: MODES.standalone,
    /** Launch Ticket（仅内存；绝不落盘/入日志） */
    ticket: '',
    sessionIdempotencyKey: '',
    ticketSource: '',
    blocked: null,
    features: { run_v2: true, settlement: true, economy: false, legacy_dual_write: true, ...(config.features || {}) },
    limits: {},
    meta: null,
    welcome: null,
    registrySource: ''
  }

  const client = createGamePlatformClient({
    baseUrl: bases.v2Base,
    transport,
    gameId,
    correlationId: telemetry.correlationId
  })

  const modeListeners = new Set()
  const runs = new Map()
  let activeRun = null

  /**
   * 服务端/宿主能力声明（P1-1）。
   *
   * 纯派生：从 `state.meta`（/meta，服务端权威）与 `state.welcome`（宿主转发）读取，
   * 不落任何额外状态。**保守默认**：拿不到 /meta 或字段缺失 → false（见 capabilities.js）。
   */
  const readDeclaredCapabilities = () => readServiceCapabilities({ meta: state.meta, welcome: state.welcome })

  const engine = {
    gameId,
    get adapter() {
      return effectiveAdapter
    },
    clock,
    telemetry,
    transport,
    client,
    legacy: legacyChannel,
    bridge,
    diagnostics,

    ready: null,
    getMode: () => state.mode,
    isReady: () => readySettled,
    features: () => ({ ...state.features }),
    limits: () => ({ ...state.limits }),
    /** 服务端/宿主能力声明（保守；句柄的 leaderboard 闸门与 capabilities() 共用同一读取） */
    declaredCapabilities: () => readDeclaredCapabilities(),
    clientVersion: () => clientVersion,
    platformContext: () => ({ ...platformContext }),
    legacyContext: () => ({ ...legacyContext }),

    registerRun(run) {
      runs.set(run.id, run)
      activeRun = run
      return run
    },
    getRun: (runId) => runs.get(runId) || null,
    getActiveRun: () => activeRun,
    recreateRun(oldRunId) {
      const previous = runs.get(oldRunId)
      if (previous) previous.abandon('run_invalid_recreated')
      const next = createRun(engine, {})
      telemetry.event('run.recreated', { game_id: gameId, reason: 'run_invalid' })
      return next
    },

    /** 模式降级：只允许 verified → compatibility → standalone，绝不升级 */
    downgradeTo(nextMode, reason) {
      const order = { [MODES.verified]: 2, [MODES.compatibility]: 1, [MODES.standalone]: 0 }
      let target = nextMode
      if (target === MODES.compatibility && !legacyChannel.canSubmit()) target = MODES.standalone
      if (order[target] === undefined || order[target] >= order[state.mode]) {
        if (target !== state.mode) noteReason(`${reason || 'downgrade_noop'}_ignored`)
        return state.mode
      }
      state.mode = target
      client.clearSession()
      noteReason(reason || `downgrade_${target}`)
      bridge.notifyMode({ gameId, mode: target, trustLevel: engine.trustLevel() })
      telemetry.event('mode.downgrade', { game_id: gameId, mode: target, reason: reason || '' })
      for (const listener of modeListeners) {
        try {
          listener(engine.snapshot())
        } catch {
          // 监听器异常不得影响降级流程
        }
      }
      return state.mode
    },

    trustLevel() {
      if (state.mode === MODES.verified) return TRUST_LEVELS.verifiedSession
      if (state.mode === MODES.compatibility) return TRUST_LEVELS.legacy
      return null
    },

    /** 会话恢复：优先向宿主申请新 ticket；退路是用原 ticket 重新兑换（§6.2.2 幂等） */
    async recoverSession(reason) {
      const nextTicket = bridge.embedded ? await bridge.requestTicket({ gameId, reason }) : ''
      const candidate = safeText(nextTicket) || state.ticket
      if (!candidate) {
        noteReason('session_recovery_no_ticket')
        return false
      }
      state.ticket = candidate
      state.sessionIdempotencyKey = ''
      const result = await exchangeSession(candidate, { allowHostTicket: false })
      if (!result.ok) {
        noteReason(`session_recovery_failed_${safeText(result.error?.code).toLowerCase()}`)
        return false
      }
      noteReason('session_recovered')
      return true
    },

    snapshot() {
      return {
        sdkVersion: SDK_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        gameId,
        adapter: adapterConfig.describe ? adapterConfig.describe() : { game_id: gameId },
        mode: state.mode,
        trustLevel: engine.trustLevel(),
        features: engine.features(),
        limits: engine.limits(),
        capabilities: engine.capabilities(),
        diagnostics: engine.diagnosticsSnapshot(),
        legacy: { ...diagnostics.legacy }
      }
    },

    /**
     * 能力表（既有键语义不变 + 新增 `server`）。
     *
     * `server`＝服务端声明的端点能力（**保守**：未知即 false，见 capabilities.js），
     * 供游戏/宿主做 UI **前置隐藏**（P1-1：flag 打开但端点未实现时不得渲染入口）。
     *
     * `leaderboard` 的取值规则（避免误伤已上线游戏）：
     * - Legacy 可用 → true；
     * - verified 且服务端**没有明确说** leaderboards 不可用 → true（保持既有探测 + 降级行为）；
     * - 服务端**显式**声明 `leaderboards:false` → false（不再只信 flag 去点亮入口）。
     */
    capabilities() {
      const verified = state.mode === MODES.verified
      const legacyAvailable = legacyChannel.canSubmit()
      const declared = readDeclaredCapabilities()
      const leaderboardDisabled = isCapabilityDisabled(declared, 'leaderboards')
      return {
        ...adapterConfig.capabilities,
        canSubmitVerified: verified,
        canSubmitLegacy: legacyAvailable,
        canSubmit: verified || legacyAvailable,
        leaderboard: legacyAvailable || (verified && !leaderboardDisabled),
        /** 服务端能力（保守表；键名见 SERVICE_CAPABILITY_KEYS） */
        server: { ...declared.values },
        rewardsEnabled: verified && state.features.economy === true && !isCapabilityDisabled(declared, 'verified_reward'),
        blocked: state.blocked ? { code: state.blocked.code } : null
      }
    },

    /** 同步预判能力（init 完成前也可用于渲染 UI；失败只会更保守） */
    preflightCapabilities() {
      const ticketInfo = readLaunchTicket({ params })
      const legacyAvailable = legacyChannel.canSubmit()
      // 契约 C：verified 需要「可信 Host 握手」，iframe 外（浏览器直开）的 URL ticket
      // 不得被预判为可提交 —— 预判必须与最终判定同口径（否则 UI 会先乐观渲染 verified 入口）。
      const verifiedCandidate = !!ticketInfo && bridge.embedded
      return {
        ...adapterConfig.capabilities,
        canSubmitVerified: verifiedCandidate,
        canSubmitLegacy: legacyAvailable,
        canSubmit: verifiedCandidate || legacyAvailable,
        leaderboard: verifiedCandidate || legacyAvailable,
        /** ready 之前拿不到 /meta：能力表一律保守 false（UI 不得乐观渲染） */
        server: emptyServiceCapabilities(),
        rewardsEnabled: false,
        blocked: null,
        pending: true
      }
    },

    diagnosticsSnapshot() {
      const declared = readDeclaredCapabilities()
      return {
        gameId,
        sdkVersion: SDK_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        mode: state.mode,
        reasons: diagnostics.reasons.slice(),
        conflicts: diagnostics.conflicts.slice(),
        errors: diagnostics.errors.slice(),
        host: { embedded: bridge.embedded, rejections: bridge.rejections().slice() },
        registrySource: state.registrySource,
        ticket: { present: !!state.ticket, source: state.ticketSource },
        session: { present: client.hasSession() },
        api: { ...diagnostics.api, sources: { ...diagnostics.api.sources } },
        capabilities: {
          source: declared.source,
          declared: declared.declared.slice(),
          disabled: SERVICE_CAPABILITY_KEYS.filter((key) => isCapabilityDisabled(declared, key))
        },
        legacy: { ...diagnostics.legacy }
      }
    },

    onModeChange(listener) {
      if (typeof listener !== 'function') return () => {}
      modeListeners.add(listener)
      return () => modeListeners.delete(listener)
    },

    dispose() {
      bridge.dispose()
      modeListeners.clear()
      client.clearSession()
      state.ticket = ''
    },

    noteReason,
    noteError(error, stage) {
      const normalized = normalizeError(error, { stage })
      diagnostics.errors.push({ ...normalized.toReport(), stage: safeText(stage) })
      if (diagnostics.errors.length > 20) diagnostics.errors.shift()
      return normalized
    }
  }

  /** ticket → session（幂等；同一 ticket 复用同一 idempotency_key） */
  const exchangeSession = async (rawTicket, options = {}) => {
    const ticket = safeText(rawTicket)
    if (!ticket) {
      return { ok: false, error: new GamePlatformError(ERROR_CODES.AUTH_REQUIRED, { stage: 'session' }) }
    }
    if (!state.sessionIdempotencyKey) {
      state.sessionIdempotencyKey = createPrefixedId('idem', clock(), '')
    }
    try {
      const result = await client.exchangeTicket({ ticket, idempotencyKey: state.sessionIdempotencyKey })
      client.setSession({ sessionId: result.sessionId, sessionToken: result.sessionToken })
      telemetry.event('session.exchanged', { game_id: gameId, mode: MODES.verified, status: result.status })
      return { ok: true, replayed: result.replayed, expiresAt: result.expiresAt }
    } catch (error) {
      const normalized = normalizeError(error, { stage: 'session_exchange' })
      noteReason(`session_exchange_failed_${safeText(normalized.code).toLowerCase()}`)
      // 凭据类失败：向宿主申请新 ticket 后再试一次（§6.2.3 恢复策略 A）
      if (options.allowHostTicket !== false && bridge.embedded) {
        const code = normalized.code
        if ([ERROR_CODES.TICKET_INVALID, ERROR_CODES.TICKET_USED, ERROR_CODES.AUTH_REQUIRED, ERROR_CODES.GAME_SESSION_EXPIRED].includes(code)) {
          const nextTicket = await bridge.requestTicket({ gameId, reason: code })
          if (safeText(nextTicket) && safeText(nextTicket) !== ticket) {
            state.ticket = safeText(nextTicket)
            state.ticketSource = 'host'
            state.sessionIdempotencyKey = ''
            const retried = await exchangeSession(state.ticket, { allowHostTicket: false })
            if (retried.ok) noteReason('session_recovered_host_ticket')
            return retried
          }
          noteReason('session_exchange_no_new_ticket')
        }
      }
      return { ok: false, error: normalized }
    }
  }

  /** 模式落定（bootstrap 内部使用）：写状态 + 通知宿主 + 记原因 */
  const settleMode = (mode, reason) => {
    const target = mode === MODES.compatibility && !legacyChannel.canSubmit() ? MODES.standalone : mode
    state.mode = target
    if (reason) noteReason(reason)
    bridge.notifyMode({ gameId, mode: target, trustLevel: engine.trustLevel() })
    telemetry.event('mode.settled', { game_id: gameId, mode: target, reason: reason || '' })
    return target
  }

  // ---- bootstrap ----
  const bootstrap = async () => {
    // 0) game_id 一致性：URL / 宿主声明的 game_id 与 SDK 配置不一致 → 拒绝 V2（避免用错 ticket）
    if (urlGameId && urlGameId !== gameId) {
      noteReason('game_id_mismatch_url')
      state.blocked = { code: ERROR_CODES.GAME_SESSION_EXPIRED, message: '游戏标识不一致，已禁用可信提交' }
    }

    // 1) Host 握手（有界超时，失败不阻塞）：这是进入 verified 的**前置条件**（契约 C ①）。
    //    宿主桥可能晚于 iframe 页面就绪，故做一次有界重试；仍失败 → 后续判定必须降级。
    if (bridge.embedded) {
      for (let attempt = 0; attempt < HOST_HANDSHAKE_ATTEMPTS && !state.welcome; attempt += 1) {
        if (attempt > 0) noteReason('host_welcome_retry')
        const welcome = await bridge.requestWelcome({ gameId })
        state.welcome = welcome || null
      }
      diagnostics.hostRejections = bridge.rejections().slice()
      if (!state.welcome) noteReason('host_welcome_unavailable')
    } else {
      noteReason('not_embedded')
    }

    // 2) feature flags / registry 快照（宿主先给，meta 后覆盖）
    if (isPlainObject(state.welcome?.features)) state.features = { ...state.features, ...state.welcome.features }
    if (isPlainObject(state.welcome?.limits)) state.limits = { ...state.limits, ...state.welcome.limits }
    let resolvedAdapter = adapterConfig
    const welcomeRegistry = resolveRegistryEntry({ welcome: state.welcome, gameId })
    if (welcomeRegistry.entry) {
      const applied = applyRegistryEntry(resolvedAdapter, welcomeRegistry.entry, { clientVersion })
      resolvedAdapter = applied.adapter
      state.registrySource = welcomeRegistry.source
      diagnostics.conflicts.push(...applied.conflicts)
      if (applied.blocked) {
        state.blocked = applied.blocked
        noteReason(`registry_blocked_${safeText(applied.blocked.code).toLowerCase()}`)
      }
    }
    // 3) Launch Ticket（URL 优先；读后立即清理 URL）
    const ticketInfo = readLaunchTicket({ params })
    if (ticketInfo) {
      state.ticket = ticketInfo.ticket
      state.ticketSource = ticketInfo.source
      if (ticketInfo.shape === 'legacy_shape') noteReason('ticket_shape_legacy')
      clearLaunchTicketFromUrl({ history: config.history, location: config.location })
    } else if (safeText(state.welcome?.ticket)) {
      state.ticket = safeText(state.welcome.ticket)
      state.ticketSource = 'host_message'
    }

    // 4) 契约 C 前置判定（**不发请求即可判定** → 绝不发请求）：
    //    a) 无「可信 Host 握手」：浏览器直开 / 非白名单 origin 冒充宿主 / 握手被拒
    //       → 禁止 Identity AT 与 Game Session —— URL 里的 ticket 一并作废，不得兑换；
    //    b) 宿主显式声明 `capabilities.launch_ticket === false`：宿主侧前置判定未通过
    //       → 宿主声明优先于 URL 凭据（纵深防御），同样不得进入 verified。
    //    两种情况都只降级（compatibility 可玩 / standalone 本地），且后续不会发出任何 V2 请求。
    const hostTicketDenied = state.welcome?.capabilities?.launch_ticket === false
    if (!state.welcome || hostTicketDenied) {
      const gateReason = !state.welcome ? 'host_handshake_required' : 'host_ticket_disabled'
      if (state.ticket) noteReason('launch_ticket_discarded')
      state.ticket = ''
      state.ticketSource = ''
      state.sessionIdempotencyKey = ''
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, gateReason)
      return
    }

    // 5) 无 ticket → 直接判定降级模式（不额外发请求）
    if (!state.ticket) {
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, 'no_launch_ticket')
      return
    }
    if (state.blocked) {
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, `blocked_${safeText(state.blocked.code).toLowerCase()}`)
      return
    }

    // 6) /meta 版本协商（V2 可用性 + 协议区间 + registry）
    let metaOk = false
    let platformUnavailable = false
    try {
      const meta = await client.fetchMeta()
      metaOk = true
      state.meta = meta
      if (isPlainObject(meta.features)) state.features = { ...state.features, ...meta.features }
      if (isPlainObject(meta.limits) && Object.keys(meta.limits).length) state.limits = { ...state.limits, ...meta.limits }
      if (!isProtocolRangeCompatible(meta.protocolVersion)) {
        noteReason('protocol_version_unsupported')
        state.blocked = { code: ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED, message: '客户端与服务端版本不兼容，请升级后重试' }
      }
      const metaRegistry = resolveRegistryEntry({ meta, gameId })
      if (!state.registrySource && metaRegistry.entry) {
        const applied = applyRegistryEntry(resolvedAdapter, metaRegistry.entry, { clientVersion })
        resolvedAdapter = applied.adapter
        state.registrySource = metaRegistry.source
        diagnostics.conflicts.push(...applied.conflicts)
        if (applied.blocked && !state.blocked) {
          state.blocked = applied.blocked
          noteReason(`registry_blocked_${safeText(applied.blocked.code).toLowerCase()}`)
        }
      }
    } catch (error) {
      const normalized = engine.noteError(error, 'meta')
      // /meta 不可用（未部署 / 5xx / 断网）= Game Platform 整体不可用：
      // 直接降级，不做无谓的 session 兑换（stall 会拖慢游戏），符合兼容契约 3
      platformUnavailable = true
      noteReason(`meta_unavailable_${safeText(normalized.code).toLowerCase()}`)
      if (normalized.code === ERROR_CODES.FEATURE_DISABLED) {
        state.features = { ...state.features, run_v2: false }
      }
    }
    if (resolvedAdapter !== adapterConfig) {
      effectiveAdapter = resolvedAdapter
      diagnostics.adapterOverriddenBy = state.registrySource
    }
    if (state.features.run_v2 === false) {
      noteReason('run_v2_disabled')
      state.blocked = state.blocked || { code: ERROR_CODES.FEATURE_DISABLED, message: '游戏平台暂未开放' }
    }
    if (state.blocked) {
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, `blocked_${safeText(state.blocked.code).toLowerCase()}`)
      return
    }
    if (platformUnavailable) {
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, 'platform_unavailable')
      return
    }

    // 7) ticket → session 兑换（仅当可信 Host 握手成立；无宿主/被拒在此前已降级返回）
    const exchanged = await exchangeSession(state.ticket, { allowHostTicket: true })
    if (exchanged.ok) {
      settleMode(MODES.verified, exchanged.replayed ? 'verified_session_replayed' : 'verified_session_issued')
      if (!metaOk) noteReason('verified_without_meta')
      return
    }
    settleMode(
      legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone,
      `session_unavailable_${safeText(exchanged.error?.code).toLowerCase()}`
    )
  }

  engine.ready = bootstrap()
    .catch((error) => {
      // bootstrap 内部已尽量降级；这里是最后兜底，保证 ready 一定 resolve
      engine.noteError(error, 'bootstrap')
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, 'bootstrap_failed')
    })
    .then(() => {
      readySettled = true
      diagnostics.mode = state.mode
      telemetry.event('sdk.ready', { game_id: gameId, mode: state.mode, reason: diagnostics.reasons.join(',') })
      return engine
    })

  return engine
}

/**
 * 创建游戏句柄（**同步返回**，模式判定在后台进行，不阻塞渲染与玩法）。
 */
export const createGame = (config = {}) => {
  const engine = createEngine(config)

  const startRun = (options = {}) => {
    if (options.replaceActive === true) {
      const previous = engine.getActiveRun()
      if (previous && typeof previous.abandon === 'function') previous.abandon('replaced')
    }
    const run = createRun(engine, { runId: options.runId, startedAt: options.startedAt })
    // verified 模式下后台登记 run（T1）；失败不阻塞，finish 时会再次补登记
    if (engine.getMode() === MODES.verified) void run.ensureServerRun()
    return run
  }

  /** 榜单条目归一（V2） */
  const normalizeV2Entries = (entries, scope) => {
    const isClassTotal = scope === 'class_total'
    return (Array.isArray(entries) ? entries : []).map((raw, index) => {
      const entry = stripPiiFields(raw)
      const metricValue = toIntegerOrNull(entry.metric?.value)
      const score = toIntegerOrNull(entry.score) ?? 0
      const className = safeText(entry.class_name)
      const playerName = safeText(entry.player_name)
      return {
        rank: toIntegerOrNull(entry.rank) ?? index + 1,
        player_name: isClassTotal ? className || playerName : playerName || '湖工学子',
        class_name: className,
        display_name: isClassTotal ? className || '未知班级' : playerName || '湖工学子',
        score,
        total_score: isClassTotal ? score : null,
        metric_value: metricValue,
        is_self: entry.is_self === true,
        updated_at: safeText(entry.updated_at),
        ref: safeText(entry.player_ref)
      }
    })
  }

  /** 榜单条目归一（Legacy；保持既有 UI 的展示回落规则，但不外泄学号） */
  const normalizeLegacyEntries = (list, scope) => {
    const isClassTotal = scope === 'class_total'
    return (Array.isArray(list) ? list : []).map((raw, index) => {
      const entry = stripPiiFields(raw)
      const className = safeText(entry.class_name || entry.className)
      const playerName = safeText(entry.player_name || entry.playerName)
      const score = toIntegerOrNull(entry.score) ?? 0
      const totalScore = toIntegerOrNull(entry.total_score ?? entry.totalScore)
      return {
        rank: toIntegerOrNull(entry.rank) ?? index + 1,
        player_name: isClassTotal ? className || '未知班级' : playerName || '匿名',
        class_name: className,
        display_name: isClassTotal ? className || '未知班级' : playerName || '匿名',
        score: isClassTotal ? totalScore ?? 0 : score,
        total_score: totalScore,
        metric_value: null,
        is_self: entry.is_self === true,
        updated_at: safeText(entry.updated_at || entry.created_at),
        ref: ''
      }
    })
  }

  const leaderboardFromLegacy = async ({ scope, limit, reason }) => {
    try {
      const result = await engine.legacy.leaderboard({ scope, limit })
      if (result?.success !== true) {
        return {
          success: false,
          mode: MODES.compatibility,
          source: 'legacy',
          entries: [],
          message: safeText(result?.message || result?.error) || '排行榜加载失败',
          reason: reason || '',
          error: result?.code ? { code: result.code } : null
        }
      }
      return {
        success: true,
        mode: MODES.compatibility,
        source: 'legacy',
        trustLevel: TRUST_LEVELS.legacy,
        scopeApplied: scope,
        entries: normalizeLegacyEntries(result.list, scope),
        message: '',
        reason: reason || '',
        raw: result.raw
      }
    } catch (error) {
      const normalized = normalizeError(error, { stage: 'leaderboard_legacy' })
      return {
        success: false,
        mode: MODES.compatibility,
        source: 'legacy',
        entries: [],
        message: normalized.message,
        reason: reason || '',
        error: normalized
      }
    }
  }

  const leaderboard = async (options = {}) => {
    const attempt = Number(options.__attempt || 0)
    await engine.ready
    const scope = ['class', 'school', 'class_total'].includes(safeText(options.scope)) ? safeText(options.scope) : 'class'
    const limitValue = toIntegerOrNull(options.limit)
    const limit = Math.min(100, Math.max(1, limitValue === null ? 20 : limitValue))
    const mode = engine.getMode()

    if (mode === MODES.standalone) {
      return {
        success: false,
        mode,
        source: 'none',
        entries: [],
        scopeApplied: scope,
        message: '未连接排行榜服务（本地游玩）'
      }
    }
    if (mode === MODES.compatibility) return leaderboardFromLegacy({ scope, limit })

    // P1-1 运行时闸门：服务端**显式**声明 `/leaderboards` 未实现时，一个请求都不发
    // （未知/字段缺失仍走既有探测 + 降级，避免在 capabilities 字段尚未上线的过渡期误伤）。
    if (isCapabilityDisabled(engine.declaredCapabilities(), 'leaderboards')) {
      const gateReason = 'capability_leaderboards_disabled'
      if (engine.legacy.canSubmit()) return leaderboardFromLegacy({ scope, limit, reason: gateReason })
      return {
        success: false,
        mode,
        source: 'none',
        entries: [],
        scopeApplied: scope,
        reason: gateReason,
        message: '排行榜暂未开放（服务端未启用）',
        error: { code: ERROR_CODES.FEATURE_DISABLED, message: '排行榜暂未开放（服务端未启用）', retryable: false }
      }
    }

    try {
      const result = await engine.client.leaderboard({
        board: safeText(options.board) || engine.adapter.leaderboard.board,
        scope,
        limit,
        cursor: safeText(options.cursor)
      })
      return {
        success: true,
        mode,
        source: 'v2',
        trustLevel: TRUST_LEVELS.verifiedSession,
        board: result.board,
        scopeApplied: result.scopeApplied,
        metric: result.metric,
        nextCursor: result.nextCursor,
        entries: normalizeV2Entries(result.entries, result.scopeApplied || scope),
        message: '',
        raw: result.raw
      }
    } catch (error) {
      const normalized = engine.noteError(error, 'leaderboard')
      if (attempt < 1 && (normalized.code === ERROR_CODES.GAME_SESSION_EXPIRED || normalized.code === ERROR_CODES.AUTH_REQUIRED)) {
        const recovered = await engine.recoverSession(normalized.code)
        if (recovered) return leaderboard({ ...options, __attempt: attempt + 1 })
      }
      if (
        [ERROR_CODES.FEATURE_DISABLED, ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED, ERROR_CODES.CLIENT_VERSION_TOO_OLD, ERROR_CODES.LEGACY_ONLY].includes(
          normalized.code
        )
      ) {
        engine.downgradeTo(engine.legacy.canSubmit() ? MODES.compatibility : MODES.standalone, `leaderboard_${normalized.code.toLowerCase()}`)
      }
      if (engine.legacy.canSubmit()) {
        const fallback = await leaderboardFromLegacy({ scope, limit, reason: `v2_${normalized.code}` })
        return { ...fallback, v2Error: normalized.toReport() }
      }
      return {
        success: false,
        mode: engine.getMode(),
        source: 'v2',
        entries: [],
        scopeApplied: scope,
        message: normalized.message,
        error: normalized
      }
    }
  }

  const handle = {
    sdkVersion: SDK_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    gameId: engine.gameId,
    get adapter() {
      return engine.adapter
    },
    get ready() {
      return engine.ready
    },
    get mode() {
      return engine.getMode()
    },
    get trustLevel() {
      return engine.trustLevel()
    },
    /** init 完成前的同步预判（用于渲染）；完成后为最终能力 */
    get capabilities() {
      return engine.isReady() ? engine.capabilities() : engine.preflightCapabilities()
    },
    get features() {
      return engine.features()
    },
    get limits() {
      return engine.limits()
    },
    get diagnostics() {
      return engine.diagnosticsSnapshot()
    },
    get correlationId() {
      return engine.telemetry.correlationId
    },
    startRun,
    getActiveRun: () => engine.getActiveRun(),
    getRun: (runId) => engine.getRun(runId),
    leaderboard,
    onModeChange: (listener) => engine.onModeChange(listener),
    toJSON: () => engine.snapshot(),
    dispose: () => engine.dispose()
  }
  return handle
}

/** 统一的 init：等待模式判定完成（有界），失败也只是降级，不抛错 */
export const initGame = async (config = {}) => {
  const game = createGame(config)
  await game.ready
  return game
}

export { RUN_STATUS, MODES, TRUST_LEVELS, createGameAdapter, isEmbedded, createPrefixedId }
