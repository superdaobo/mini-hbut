/**
 * 湖工五子棋 —— 服务端确认赛果的客户端接线（#908，`server_verified_match`）。
 *
 * 信任原则（docs/game-platform/trust-model.md §2.1 / §3.2 第 9 条）：
 *
 * - 客户端**不能**声明赛果，只能"上报我以为的结果"（`claimed_outcome`），由服务端按自己
 *   记录的 move 序列复算；响应的 `match.result` 才是权威值；
 * - 客户端本地判定的胜负（`gomoku.js` 的 `status === 'won'`）只用于**先渲染**与发起上报，
 *   绝不用作成绩、奖励或榜单依据；
 * - 信任级别命名逐字取 SDK 的 `TRUST_LEVELS.serverVerifiedMatch`，只有服务端返回
 *   `server_verified === true` 时本地才把这一局视为"服务端已确认"。
 *
 * 旁路铁律（issue 硬约束）：统计与上报的任何失败都**不得**影响下棋——本模块所有网络
 * 调用都被包进 `guard()`，失败只写入 `lastError` 并回到"未确认"状态，绝不 throw。
 *
 * 身份凭据：端点要求 `Authorization: Bearer <GS token>`（protocol-v1.md §1.2）。GS token
 * 只存在于内存（SDK §6.2.3 禁止落盘），由宿主通过 iframe URL 注入的一次性 Launch Ticket
 * 兑换（`#905` 接线）。宿主尚未注入 ticket 时本模块整体降级为"禁用"（不影响下棋）。
 *
 * W1（relay 身份绑定）：席位绑定成功后服务端下发 `relay_binding`（HMAC 签名凭证，
 * 只含非 PII 字段）。宿主把它交给 relay 房间，key 请求携带该凭证 → 服务端就能确认
 * "这个 `peer_id` 属于这个已验证的 Game Session"，同房对手即使拿到对方 `peer_id`
 * 也无法代表对方落子 / 重入 / poll / leave。
 */

import {
  DEFAULT_GAME_PLATFORM_API_BASE,
  GAME_PLATFORM_API_NAMESPACE,
  PROTOCOL_VERSION,
  TRUST_LEVELS
} from '../../../../_sdk/src/version.js'
import {
  assertNoForbiddenFields,
  createGamePlatformClient
} from '../../../../_sdk/src/platform/game-platform-client.js'
import { clearLaunchTicketFromUrl, readLaunchTicket } from '../../../../_sdk/src/host-bridge.js'
import { createTransport } from '../../../../_sdk/src/transport.js'

export const GOMOKU_GAME_ID = 'hbut_gomoku'

/** 信任级别（逐字复用 SDK 定义；本模块只在服务端确认后返回该值）。 */
export const MATCH_TRUST_LEVEL = TRUST_LEVELS.serverVerifiedMatch

/** 客户端可上报的"我以为"枚举（不是赛果）。 */
export const CLAIM_OUTCOMES = Object.freeze({
  win: 'win',
  loss: 'loss',
  draw: 'draw'
})

/** 服务端比赛结果的枚举（`MatchRecord.result`）。 */
export const MATCH_RESULTS = Object.freeze({
  blackWin: 'black_win',
  whiteWin: 'white_win',
  draw: 'draw',
  abandoned: 'abandoned'
})

/** 上报重试策略：只对可重试错误退避（与 SDK 的 1200/2600/5200ms 同口径）。 */
export const CLAIM_RETRY_DELAYS_MS = Object.freeze([1200, 2600, 5200])

/**
 * W1：席位绑定声明头 —— 告诉服务端"本席位后续 relay 请求会携带绑定凭证"。
 * 服务端据此对该席位的 relay 请求强制校验（旧客户端不发该头，行为不变）。
 */
export const RELAY_AUTH_HEADER = 'X-Gomoku-Relay-Auth'

const RETRYABLE_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504])

const safeText = (value) => String(value ?? '').trim()

/**
 * V2 API base 推导（与 SDK `resolveApiBases` 同规则，避免游戏各自硬编码生产地址）：
 * 显式注入 `game_platform_api`/`gp_api` 优先，其次从宿主注入的 `rank_api` 同源推导。
 */
export const resolveGamePlatformBase = ({ injected = '', rankApi = '' } = {}) => {
  const explicit = safeText(injected)
  if (explicit) return normalizeBase(explicit)
  const rank = safeText(rankApi)
  if (rank) {
    if (/\/api\/game-rank$/i.test(rank)) {
      return normalizeBase(rank.replace(/\/api\/game-rank$/i, ''))
    }
    if (/\/api$/i.test(rank)) {
      return normalizeBase(`${rank.replace(/\/+$/, '')}/game-platform/v1`)
    }
  }
  return DEFAULT_GAME_PLATFORM_API_BASE
}

const normalizeBase = (value) => {
  const text = safeText(value)
  if (!text) return DEFAULT_GAME_PLATFORM_API_BASE
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const trimmed = withProtocol.replace(/\/+$/, '')
  if (trimmed.endsWith(GAME_PLATFORM_API_NAMESPACE)) return trimmed
  if (/\/api$/i.test(trimmed)) return `${trimmed}/game-platform/v1`
  return `${trimmed}${GAME_PLATFORM_API_NAMESPACE}`
}

/** 端点路径（与 modules/game_platform/gomoku_routes.py 逐条对应）。 */
export const matchPaths = (matchId) => {
  const id = encodeURIComponent(safeText(matchId))
  return {
    seat: `/matches/${id}/seat`,
    result: `/matches/${id}/result`,
    detail: `/matches/${id}`,
    stats: '/me/gomoku/stats'
  }
}

/**
 * 席位绑定请求体（**不得**出现 actor / 奖励数量字段；本地先断言一次）。
 * `match_id` 只在 URL 路径里，body 不重复。
 *
 * 冻结字段：`peer_secret`（join 响应下发的不透明字符串）只在拿到时携带；
 * 旧服务端 / 灰度未上线时请求形状与旧版逐字一致（不得因缺字段而报错）。
 */
export const buildSeatClaimBody = ({
  roomCode = '',
  peerId = '',
  clientVersion = '',
  peerSecret = ''
} = {}) => {
  const body = {
    protocol_version: PROTOCOL_VERSION,
    room_code: safeText(roomCode),
    peer_id: safeText(peerId)
  }
  const version = safeText(clientVersion)
  if (version) body.client_version = version
  const secret = safeText(peerSecret)
  if (secret) body.peer_secret = secret
  assertNoForbiddenFields(body)
  return body
}

/** 结果上报请求体：只有"我以为的结果"，没有 winner/score/actor。 */
export const buildResultClaimBody = ({ claimedOutcome = '' } = {}) => {
  const body = { protocol_version: PROTOCOL_VERSION }
  const claim = safeText(claimedOutcome)
  if (claim) body.claimed_outcome = claim
  assertNoForbiddenFields(body)
  return body
}

/**
 * W1：从席位绑定响应里提取 relay 绑定凭证（**只含非 PII 的签名 token**）。
 *
 * relay 侧凭它把 ``peer_id`` 与已验证的 Game Session 绑定：对手拿到别人的
 * ``peer_id`` 但没有该凭证 → 落子 / 重入 / poll / leave 一律被服务端拒绝。
 */
export const extractRelayBinding = (payload = {}) => {
  const raw = payload?.relay_binding || payload?.relayBinding || {}
  const source = raw && typeof raw === 'object' ? raw : {}
  const token = safeText(source.token)
  const expiresAt = Number(source.expires_at ?? source.expiresAt ?? 0) || 0
  return { token, expiresAt }
}

/** 服务端赛果 → 本席位视角的胜负（本地仅用于展示，权威性来自服务端字段）。 */
export const outcomeForSeat = (result, seat) => {
  const normalized = safeText(result)
  if (normalized === MATCH_RESULTS.draw) return 'draw'
  if (normalized === MATCH_RESULTS.abandoned || !normalized) return 'abandoned'
  if (normalized === `${safeText(seat)}_win`) return 'win'
  return safeText(seat) ? 'loss' : 'abandoned'
}

/**
 * 归一化服务端比赛视图（白名单字段；绝不透传 player_id / peer_id）。
 */
export const normalizeMatchView = (raw = {}) => {
  const match = raw && typeof raw === 'object' ? raw : {}
  const pick = (camel, snake) => (match[camel] !== undefined ? match[camel] : match[snake])
  const anomalies = pick('anomalies', 'anomalies')
  const claimVerdicts = pick('claimVerdicts', 'claim_verdicts')
  const seatOccupied = pick('seatOccupied', 'seat_occupied')
  const authenticatedRaw = pick('authenticated', 'authenticated')
  return {
    matchId: safeText(pick('matchId', 'match_id')),
    roomCode: safeText(pick('roomCode', 'room_code')),
    status: safeText(match.status),
    result: safeText(match.result),
    endedReason: safeText(pick('endedReason', 'ended_reason')),
    winnerSeat: safeText(pick('winnerSeat', 'winner_seat')),
    loserSeat: safeText(pick('loserSeat', 'loser_seat')),
    plies: Number(match.plies || 0) || 0,
    serverVerified: match.server_verified === true || match.serverVerified === true,
    // W1：着法是否可归因于已验证身份（缺字段 = 旧服务端，按已认证兼容处理）。
    authenticated: authenticatedRaw === undefined ? true : authenticatedRaw === true,
    anomalies: anomalies && typeof anomalies === 'object' ? { ...anomalies } : {},
    claimVerdicts:
      claimVerdicts && typeof claimVerdicts === 'object' ? { ...claimVerdicts } : {},
    seatOccupied: seatOccupied && typeof seatOccupied === 'object' ? { ...seatOccupied } : {},
    reconnects: Number(match.reconnects || 0) || 0
  }
}

/**
 * 客户端上报 vs 服务端复算的裁决（**服务端永远优先**）。
 *
 * 返回 `trustLevel` 只在服务端确认时才是 `server_verified_match`：客户端本地判"我赢了"
 * 但服务端还没确认（或判定不同）时，本地不得把它当作已确认赛果。
 */
export const resolveAuthoritativeOutcome = ({ claim = {}, match = {}, seat = '' } = {}) => {
  const view = normalizeMatchView(match)
  const claimed = safeText(claim.claimed)
  const authoritative = safeText(claim.authoritative) || outcomeForSeat(view.result, seat)
  // W1：未认证局（着法无法归因）不得声称"服务端已确认"（不计统计、不发奖）。
  const confirmed = view.serverVerified && view.authenticated && Boolean(authoritative)
  const mismatched = Boolean(claimed) && confirmed && claimed !== authoritative
  return {
    claimed,
    authoritative: confirmed ? authoritative : '',
    matched: confirmed && claimed === authoritative,
    mismatched,
    trustLevel: confirmed ? MATCH_TRUST_LEVEL : '',
    settled: view.status === 'finalized' || view.status === 'abandoned'
  }
}

/** 展示文案（服务端确认后才声称"已确认"）。 */
export const describeMatchOutcome = ({ outcome = '', trustLevel = '', endedReason = '' } = {}) => {
  const label =
    outcome === 'win' ? '胜' : outcome === 'loss' ? '负' : outcome === 'draw' ? '平' : '未定'
  if (!label || outcome === '') return '本局结果待服务端确认。'
  const reasonText =
    endedReason === 'timeout'
      ? '（超时判负）'
      : endedReason === 'forfeit' || endedReason === 'disconnect'
        ? '（对手离开判负）'
        : endedReason === 'both_disconnected' || endedReason === 'room_dissolved'
          ? '（对局作废）'
          : ''
  if (trustLevel !== MATCH_TRUST_LEVEL) {
    return `本局结果：${label}${reasonText}（服务端未确认）`
  }
  return `本局结果：${label}${reasonText}（服务端已确认）`
}

/** 可重试判定：网络错误/超时/429/5xx 才重试（4xx 语义错误一律不重试）。 */
export const isRetryableMatchError = (error) => {
  const status = Number(error?.status || 0)
  if (status === 0) return true
  return RETRYABLE_STATUS.has(status)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 失败是否值得重试：优先信服务端 envelope 的 ``error.retryable``；
 * 没有 envelope（网络层失败）时按 HTTP 状态判定——**有确定状态码就必须按它判**，
 * 否则 403/400 这类确定性失败会被当成网络抖动重试 9 秒（实测踩过的坑）。
 */
const shouldRetryFailure = (error) => {
  const flag = error?.payload?.error?.retryable
  if (typeof flag === 'boolean') return flag
  return isRetryableMatchError({ status: Number(error?.status || 0) })
}

/**
 * 生产传输层：`Authorization: Bearer <GS token>` + `Idempotency-Key: <match_id>`。
 * 幂等键按协议 §1.2 取 `match_id`，因此重试与重复上报都不会产生第二条结果。
 */
export const createPlatformMatchTransport = ({
  sessionToken = '',
  baseUrl = '',
  fetchImpl = globalThis.fetch?.bind(globalThis),
  clientVersion = ''
} = {}) => {
  const token = safeText(sessionToken)
  const base = safeText(baseUrl) || DEFAULT_GAME_PLATFORM_API_BASE
  const request = async (
    path,
    { method = 'POST', body = null, idempotencyKey = '', headers: extraHeaders = null } = {}
  ) => {
    if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持 fetch')
    const headers = {
      'content-type': 'application/json',
      'X-Game-Platform-Protocol': String(PROTOCOL_VERSION)
    }
    if (extraHeaders && typeof extraHeaders === 'object') {
      for (const [key, value] of Object.entries(extraHeaders)) {
        if (value === undefined || value === null || String(value) === '') continue
        headers[key] = String(value)
      }
    }
    if (token) headers.Authorization = `Bearer ${token}`
    if (clientVersion) headers['X-Client-Version'] = clientVersion
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body)
    })
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    if (!response.ok || payload?.success === false) {
      const error = new Error(
        payload?.error?.message || `服务端请求失败 ${Number(response.status || 0)}`.trim()
      )
      error.status = Number(response.status || 0)
      error.code = safeText(payload?.error?.code)
      error.payload = payload
      throw error
    }
    return payload || {}
  }
  return {
    hasSession: () => Boolean(token),
    async claimSeat({ matchId, roomCode = '', peerId = '', peerSecret = '' }) {
      // W1：声明"该席位 relay 请求会携带绑定凭证"，服务端据此强制校验（防 peer_id 冒用）。
      return request(matchPaths(matchId).seat, {
        body: buildSeatClaimBody({ roomCode, peerId, clientVersion, peerSecret }),
        idempotencyKey: safeText(matchId),
        headers: { [RELAY_AUTH_HEADER]: '1' }
      })
    },
    async reportResult({ matchId, claimedOutcome = '' }) {
      return request(matchPaths(matchId).result, {
        body: buildResultClaimBody({ claimedOutcome }),
        idempotencyKey: safeText(matchId)
      })
    },
    async fetchStats() {
      return request(matchPaths('').stats, { method: 'GET' })
    },
    async fetchMatch({ matchId }) {
      return request(matchPaths(matchId).detail, { method: 'GET' })
    }
  }
}

/**
 * 比赛可信层：席位绑定 → 结果上报 → 采纳服务端权威赛果。
 *
 * 设计要点：
 * - **幂等**：同一 `match_id` 的席位绑定只做一次；结果上报同一 `claimed_outcome` 只做一次；
 * - **旁路**：任何失败只记 `lastError`，状态回到"未确认"，绝不 throw、绝不阻塞下棋；
 * - **服务端优先**：`snapshot().outcome` 只用服务端返回的字段；客户端本地判定仅作 `localClaim`。
 */
export const createGomokuMatchTrust = ({
  transport,
  gameId = GOMOKU_GAME_ID,
  onUpdate = () => {},
  logger = null
} = {}) => {
  const state = {
    gameId,
    enabled: Boolean(transport?.hasSession?.()),
    matchId: '',
    roomCode: '',
    seat: '',
    seatClaimed: false,
    reported: '',
    lastError: '',
    lastErrorCode: '',
    lastPayload: null,
    stats: null,
    // W1：服务端签发的 relay 绑定凭证（内存态；随席位绑定下发、随换场/复位清空）。
    relayBinding: '',
    relayBindingExpiresAt: 0,
    // W1/F1：凭证所属的 match_id —— 只有与当前房间已下发的 match_id 一致才允许携带。
    relayBindingMatchId: ''
  }

  /**
   * 冻结字段：join 响应里的 `peer_secret`（不透明字符串，每次 join 重签）。
   * **只存内存**：不进 state/snapshot（避免随 onUpdate 广播、被渲染或落盘），
   * 不进 localStorage / postMessage / diagnostics / 日志；只在 seat 请求体里携带。
   */
  let peerSecret = ''

  const emit = () => {
    try {
      onUpdate({ ...state })
    } catch {
      // 回调异常不得影响主流程（UI 层异常与统计无关）。
    }
  }

  const guard = async (label, action, { retry = true } = {}) => {
    if (!transport) {
      state.enabled = false
      state.lastError = '未连接服务端比赛通道'
      emit()
      return null
    }
    const delays = retry ? CLAIM_RETRY_DELAYS_MS : []
    for (let attempt = 0; ; attempt += 1) {
      try {
        const payload = await action()
        state.enabled = true
        state.lastError = ''
        state.lastErrorCode = ''
        state.lastPayload = payload
        emit()
        return payload
      } catch (error) {
        const retryable = shouldRetryFailure(error)
        if (retryable && attempt < delays.length) {
          await wait(delays[attempt])
          continue
        }
        state.lastError = safeText(error?.message) || `${label}失败`
        state.lastErrorCode = safeText(error?.code)
        if (logger && typeof logger.warn === 'function') {
          logger.warn(`[gomoku] ${label}失败：${state.lastErrorCode || state.lastError}`)
        }
        emit()
        return null
      }
    }
  }

  /** 记住 relay 下发的 match_id（relay join/poll 响应的 additive 字段）。 */
  const rememberMatch = ({ matchId = '', roomCode = '' } = {}) => {
    const next = safeText(matchId)
    if (!next) return state.matchId
    if (state.matchId && state.matchId !== next) {
      // 换场（房间被回收后复用同一房间号）→ 重置座位绑定、绑定凭证与上报记忆。
      state.seatClaimed = false
      state.reported = ''
      state.seat = ''
      state.relayBinding = ''
      state.relayBindingExpiresAt = 0
      state.relayBindingMatchId = ''
    }
    state.matchId = next
    if (roomCode) state.roomCode = safeText(roomCode)
    emit()
    return state.matchId
  }

  /**
   * F1：离开 / 重置房间时显式作废 relay 凭证（内存态），避免同房号重连把上一局凭证带进新连接。
   */
  const forgetRelayBinding = () => {
    if (!state.relayBinding && !state.relayBindingMatchId && !state.relayBindingExpiresAt) return ''
    state.relayBinding = ''
    state.relayBindingExpiresAt = 0
    state.relayBindingMatchId = ''
    emit()
    return ''
  }

  /**
   * F1：只返回"属于指定 match_id"的凭证；matchId 未下发（新连接）时绝不携带。
   */
  const relayBindingForMatch = (matchId = '') => {
    const target = safeText(matchId)
    if (!target || !state.relayBindingMatchId || state.relayBindingMatchId !== target) return ''
    return state.relayBinding
  }

  /** 冻结字段：join 响应里的 peer_secret（只存内存；空值 = 清空旧值，请求体不带该字段）。 */
  const setPeerSecret = (value = '') => {
    peerSecret = safeText(value)
  }

  const claimSeat = async ({ peerId = '', roomCode = '', force = false } = {}) => {
    if (!state.matchId) return null
    if (state.seatClaimed && !force) return null
    const payload = await guard('绑定比赛席位', () =>
      transport.claimSeat({
        matchId: state.matchId,
        roomCode: roomCode || state.roomCode,
        peerId,
        peerSecret
      })
    )
    if (payload) {
      state.seat = safeText(payload.seat)
      state.seatClaimed = true
      const binding = extractRelayBinding(payload)
      // 无条件覆盖：服务端未回传 token 时必须清空旧凭证，不得沿用（重绑后新旧凭证不可混用）。
      state.relayBinding = binding.token
      state.relayBindingExpiresAt = binding.token ? binding.expiresAt : 0
      state.relayBindingMatchId = binding.token ? state.matchId : ''
    }
    return payload
  }

  const reportResult = async ({ claimedOutcome = '', force = false } = {}) => {
    const claim = safeText(claimedOutcome)
    if (!state.matchId) return null
    if (!force && claim && state.reported === claim) return state.lastPayload
    const payload = await guard('上报比赛结果', () =>
      transport.reportResult({ matchId: state.matchId, claimedOutcome: claim })
    )
    if (payload) {
      state.reported = claim
      state.seat = safeText(payload.seat) || state.seat
      const raw = payload.match || {}
      state.stats = payload.stats || state.stats
      if (payload.settled) state.seatClaimed = true
      const view = normalizeMatchView(raw)
      if (view.matchId) state.matchId = view.matchId
    }
    return payload
  }

  const refreshStats = async () => {
    const payload = await guard('读取竞技统计', () => transport.fetchStats())
    if (payload?.stats) state.stats = payload.stats
    return state.stats
  }

  /** 采纳服务端权威赛果（供 UI 渲染；未确认时 trustLevel 为空串）。 */
  const authoritative = () => {
    const payload = state.lastPayload || {}
    const view = normalizeMatchView(payload.match || {})
    return {
      ...resolveAuthoritativeOutcome({ claim: payload.claim || {}, match: view, seat: state.seat }),
      matchId: view.matchId || state.matchId,
      settled: payload.settled === true,
      anomalies: view.anomalies,
      claimVerdicts: view.claimVerdicts,
      description: describeMatchOutcome({
        outcome: outcomeForSeat(view.result, state.seat),
        trustLevel: view.serverVerified && view.authenticated ? MATCH_TRUST_LEVEL : '',
        endedReason: view.endedReason
      })
    }
  }

  return {
    rememberMatch,
    claimSeat,
    reportResult,
    refreshStats,
    authoritative,
    snapshot: () => ({ ...state }),
    isEnabled: () => state.enabled,
    /**
     * W1：relay 绑定凭证（席位绑定响应下发；内存态，绝不落盘）。
     * 宿主把它交给 relay 房间（``online.js`` 的 ``setRelayBinding``），
     * 使 relay 侧能把 ``peer_id`` 与已验证身份绑定（对手不能冒用他人 ``peer_id``）。
     */
    relayBinding: () => state.relayBinding,
    /** F1：凭证所属 match_id（空 = 无有效凭证）。 */
    relayBindingMatchId: () => state.relayBindingMatchId,
    /** F1：只返回属于指定 match_id 的凭证（matchId 未下发时恒为空串）。 */
    relayBindingForMatch,
    /** F1：离开 / 重置房间时作废内存里的 relay 凭证。 */
    forgetRelayBinding,
    /** 冻结字段：join 响应里的 peer_secret（只存内存，绝不落盘/广播）。 */
    setPeerSecret
  }
}

/**
 * 宿主注入的一次性 Launch Ticket → Game Session（`gpt_` → `gs_`）。
 *
 * 未注入 ticket（例如宿主尚未接线 #905）时返回 `{ enabled: false }`，调用方应整体降级为
 * "只下棋、不统计"，不得因此阻塞游戏。
 */
export const bootstrapMatchSession = async ({
  params = null,
  location = null,
  history = null,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  gameId = GOMOKU_GAME_ID,
  baseUrl = '',
  logger = null
} = {}) => {
  try {
    const resolved = readLaunchTicket(params ? { params } : {})
    if (!resolved?.ticket) return { enabled: false, reason: 'no_launch_ticket' }
    const base = safeText(baseUrl) || DEFAULT_GAME_PLATFORM_API_BASE
    const transport = createTransport({ fetchImpl })
    const client = createGamePlatformClient({ baseUrl: base, transport, gameId })
    const exchanged = await client.exchangeTicket({
      ticket: resolved.ticket,
      idempotencyKey: `gomoku-${resolved.ticket.slice(-16)}`
    })
    clearLaunchTicketFromUrl(location && history ? { location, history } : {})
    if (!exchanged?.sessionToken) return { enabled: false, reason: 'no_session_token' }
    return {
      enabled: true,
      reason: '',
      sessionToken: exchanged.sessionToken,
      expiresAt: exchanged.expiresAt || '',
      baseUrl: base
    }
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`[gomoku] 比赛会话兑换失败：${safeText(error?.code) || safeText(error?.message)}`)
    }
    return { enabled: false, reason: safeText(error?.code) || 'session_exchange_failed' }
  }
}

/** 组合入口：兑换会话 → 构造传输层 → 构造可信层（任何失败都返回禁用的可信层）。 */
export const createGomokuMatchTrustFromHost = async ({
  params = null,
  location = null,
  history = null,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  gameId = GOMOKU_GAME_ID,
  baseUrl = '',
  clientVersion = '',
  onUpdate = () => {},
  logger = null
} = {}) => {
  const base = safeText(baseUrl) || DEFAULT_GAME_PLATFORM_API_BASE
  const session = await bootstrapMatchSession({
    params,
    location,
    history,
    fetchImpl,
    gameId,
    baseUrl: base,
    logger
  })
  if (!session.enabled) {
    return {
      enabled: false,
      reason: session.reason,
      trust: createGomokuMatchTrust({ transport: null, gameId, onUpdate, logger })
    }
  }
  const transport = createPlatformMatchTransport({
    sessionToken: session.sessionToken,
    baseUrl: session.baseUrl || base,
    fetchImpl,
    clientVersion
  })
  return {
    enabled: true,
    reason: '',
    trust: createGomokuMatchTrust({ transport, gameId, onUpdate, logger })
  }
}
