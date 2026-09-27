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
import {
  DEFAULT_GAME_PLATFORM_API_BASE,
  DEFAULT_LEGACY_RANK_API_BASE,
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

const resolveApiBases = (config, params) => {
  const explicitV2 = safeText(config.gamePlatformApiBase || config.apiBase) || safeText(params.get('game_platform_api')) || safeText(params.get('gp_api'))
  const explicitLegacy = safeText(config.rankApiBase) || safeText(params.get('rank_api'))
  const normalizeV2 = (value) => {
    const text = safeText(value)
    if (!text) return DEFAULT_GAME_PLATFORM_API_BASE
    const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
    const trimmed = withProtocol.replace(/\/+$/, '')
    if (trimmed.endsWith(GAME_PLATFORM_API_NAMESPACE)) return trimmed
    if (/\/api\/game-rank$/i.test(trimmed)) return `${trimmed.replace(/\/api\/game-rank$/i, '')}${GAME_PLATFORM_API_NAMESPACE}`
    if (/\/api$/i.test(trimmed)) return `${trimmed}/game-platform/v1`
    return `${trimmed}${GAME_PLATFORM_API_NAMESPACE}`
  }
  // 未显式给 V2 base 时，从宿主注入的 rank_api 同源推导（避免游戏各自硬编码生产地址）
  const derivedFromRank = explicitLegacy
    ? normalizeV2(explicitLegacy.replace(/\/api\/game-rank.*$/i, ''))
    : ''
  return {
    v2Base: normalizeV2(explicitV2 || derivedFromRank),
    legacyBase: explicitLegacy ? explicitLegacy.replace(/\/+$/, '') : DEFAULT_LEGACY_RANK_API_BASE,
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
    api: { v2: bases.v2Base, legacy: bases.legacyBase, rank_api_injected: bases.rankApiInjected }
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

    capabilities() {
      const verified = state.mode === MODES.verified
      const legacyAvailable = legacyChannel.canSubmit()
      return {
        ...adapterConfig.capabilities,
        canSubmitVerified: verified,
        canSubmitLegacy: legacyAvailable,
        canSubmit: verified || legacyAvailable,
        leaderboard: verified || legacyAvailable,
        rewardsEnabled: verified && state.features.economy === true,
        blocked: state.blocked ? { code: state.blocked.code } : null
      }
    },

    /** 同步预判能力（init 完成前也可用于渲染 UI；失败只会更保守） */
    preflightCapabilities() {
      const ticketInfo = readLaunchTicket({ params })
      const legacyAvailable = legacyChannel.canSubmit()
      const canSubmit = !!ticketInfo || legacyAvailable
      return {
        ...adapterConfig.capabilities,
        canSubmitVerified: !!ticketInfo,
        canSubmitLegacy: legacyAvailable,
        canSubmit,
        leaderboard: canSubmit,
        rewardsEnabled: false,
        blocked: null,
        pending: true
      }
    },

    diagnosticsSnapshot() {
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
        api: { ...diagnostics.api },
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

    // 1) Host 握手（有界超时，失败不阻塞）
    if (bridge.embedded) {
      const welcome = await bridge.requestWelcome({ gameId })
      state.welcome = welcome || null
      diagnostics.hostRejections = bridge.rejections().slice()
      if (!welcome) noteReason('host_welcome_unavailable')
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

    // 4) 无 ticket → 直接判定降级模式（不额外发请求）
    if (!state.ticket) {
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, 'no_launch_ticket')
      return
    }
    if (state.blocked) {
      settleMode(legacyChannel.canSubmit() ? MODES.compatibility : MODES.standalone, `blocked_${safeText(state.blocked.code).toLowerCase()}`)
      return
    }

    // 5) /meta 版本协商（V2 可用性 + 协议区间 + registry）
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

    // 6) ticket → session 兑换
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
