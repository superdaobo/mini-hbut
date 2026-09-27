/**
 * Game Platform V2 客户端（`/api/game-platform/v1/*`，protocol-v1.md §1.2 端点清单）。
 *
 * 硬约束：
 * - 会话凭据（GS token）**只存在于本客户端实例的内存中**：不落盘、不入日志、不回传宿主（§6.2.3）；
 * - 请求体字段严格使用 §2.2 白名单，出现 actor / 奖励数量字段本地即拒绝（§2.3、trust-model §3）；
 * - `content_hash` 由服务端计算，SDK 不提交（§3.3.1）；
 * - finish 重试必须字节级同 payload：本模块只负责发送，由上层 Run 保证 payload 稳定。
 */

import { GAME_PLATFORM_API_NAMESPACE, PROTOCOL_VERSION } from '../version.js'
import {
  ERROR_CODES,
  FORBIDDEN_ACTOR_FIELDS,
  FORBIDDEN_AUTHORITY_FIELDS,
  GamePlatformError
} from '../errors.js'
import { buildUrl } from '../transport.js'
import { isPlainObject, safeText } from '../utils.js'

/**
 * 本地防线：V2 请求体不得出现 actor 类字段与奖励数量类字段。
 * actor 出现 → FORBIDDEN_ACTOR（安全信号）；奖励数量/服务端权威字段 → SCHEMA_INVALID。
 */
export const assertNoForbiddenFields = (payload) => {
  if (!isPlainObject(payload)) return
  for (const field of FORBIDDEN_ACTOR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new GamePlatformError(ERROR_CODES.FORBIDDEN_ACTOR, {
        message: '提交数据包含身份字段，已阻止发送',
        details: { field }
      })
    }
  }
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new GamePlatformError(ERROR_CODES.SCHEMA_INVALID, {
        message: '提交数据包含服务端权威字段，已阻止发送',
        details: { field }
      })
    }
  }
  if (isPlainObject(payload.result)) assertNoForbiddenFields(payload.result)
  if (isPlainObject(payload.result?.extra)) assertNoForbiddenFields(payload.result.extra)
}

const normalizeSettlement = (raw) => {
  if (!isPlainObject(raw)) return null
  return {
    state: safeText(raw.state),
    rewardStatus: safeText(raw.reward_status),
    settledAt: safeText(raw.settled_at)
  }
}

/**
 * 创建 V2 客户端。
 * @param {object} options
 * @param {string} options.baseUrl V2 API base
 * @param {object} options.transport createTransport() 实例
 * @param {object} [options.session] { sessionId, sessionToken }
 * @param {string} [options.correlationId]
 */
export const createGamePlatformClient = (options = {}) => {
  const baseUrl = safeText(options.baseUrl).replace(/\/+$/, '')
  const transport = options.transport
  if (!transport) throw new TypeError('createGamePlatformClient 需要 transport')
  const gameId = safeText(options.gameId)
  const correlationId = safeText(options.correlationId)
  let session = options.session
    ? { sessionId: safeText(options.session.sessionId), sessionToken: safeText(options.session.sessionToken) }
    : null

  const authHeaders = () => {
    const headers = {}
    if (correlationId) headers[transport.correlationHeader] = correlationId
    if (session?.sessionToken) headers.Authorization = `Bearer ${session.sessionToken}`
    return headers
  }

  const url = (path, query) => buildUrl(baseUrl || GAME_PLATFORM_API_NAMESPACE, path, query)

  const postJson = (path, body, { retry = false, headers = {}, query } = {}) => {
    assertNoForbiddenFields(body)
    const init = {
      url: url(path, query),
      method: 'POST',
      headers: { ...authHeaders(), ...headers },
      body: JSON.stringify({ protocol_version: PROTOCOL_VERSION, ...body })
    }
    return retry ? transport.requestJsonWithRetry(init) : transport.requestJson(init)
  }

  const getJson = (path, query, { retry = false } = {}) => {
    const init = { url: url(path, query), method: 'GET', headers: authHeaders() }
    return retry ? transport.requestJsonWithRetry(init) : transport.requestJson(init)
  }

  return {
    baseUrl,
    get session() {
      return session ? { ...session } : null
    },
    hasSession: () => !!session?.sessionToken,
    setSession(next) {
      session = next
        ? { sessionId: safeText(next.sessionId), sessionToken: safeText(next.sessionToken) }
        : null
    },
    clearSession() {
      session = null
    },

    /** 版本协商 / 能力清单 / registry 快照（无需认证） */
    async fetchMeta() {
      const { data, status } = await transport.requestJson({
        url: url('/meta'),
        method: 'GET',
        headers: correlationId ? { [transport.correlationHeader]: correlationId } : {}
      })
      return {
        protocolVersion: data.protocol_version,
        serverVersion: safeText(data.server_version),
        features: isPlainObject(data.features) ? { ...data.features } : {},
        limits: isPlainObject(data.limits) ? { ...data.limits } : {},
        registry: isPlainObject(data.registry) ? { ...data.registry } : {},
        status,
        raw: data
      }
    },

    /** ticket → Game Session（原子兑换 + 幂等重放；§6.2.1/§6.2.2） */
    async exchangeTicket({ ticket, idempotencyKey }) {
      const { data, status } = await postJson(
        '/sessions',
        { ticket: safeText(ticket), game_id: gameId },
        {
          // ticket 为一次性凭据：失败重试由上层按幂等语义决定，这里不做自动重试
          retry: false,
          headers: idempotencyKey ? { 'Idempotency-Key': safeText(idempotencyKey) } : {}
        }
      )
      return {
        sessionId: safeText(data.session_id),
        sessionToken: safeText(data.session_token),
        expiresAt: safeText(data.expires_at),
        replayed: data.replayed_session === true,
        status,
        raw: data
      }
    },

    /** 显式创建 run（T1：幂等键 = run_id） */
    async createRun(payload = {}) {
      const { data, status } = await postJson('/runs', {
        game_id: gameId,
        run_id: safeText(payload.runId),
        session_id: safeText(payload.sessionId) || session?.sessionId || '',
        client_version: safeText(payload.clientVersion),
        platform: safeText(payload.platform),
        runtime: safeText(payload.runtime),
        started_at: safeText(payload.startedAt)
      })
      const run = isPlainObject(data.run) ? data.run : {}
      return {
        runId: safeText(run.run_id) || safeText(payload.runId),
        status: safeText(run.status),
        idempotentReplay: data.idempotent_replay === true,
        statusCode: status,
        raw: data
      }
    },

    /** run 状态查询（断线恢复、幂等核对） */
    async fetchRun(runId) {
      const { data } = await getJson(`/runs/${encodeURIComponent(safeText(runId))}`)
      const run = isPlainObject(data.run) ? data.run : {}
      return { status: safeText(run.status), raw: data }
    },

    /**
     * finish：提交结果触发结算（T3）。
     * payload 必须由上层保证「同一 run 字节级稳定」（§3.3）。
     */
    async finishRun(payload = {}) {
      const runId = safeText(payload.runId)
      const body = {
        game_id: gameId,
        run_id: runId,
        session_id: safeText(payload.sessionId) || session?.sessionId || '',
        client_version: safeText(payload.clientVersion),
        platform: safeText(payload.platform),
        runtime: safeText(payload.runtime),
        started_at: safeText(payload.startedAt),
        finished_at: safeText(payload.finishedAt),
        duration_ms: payload.durationMs,
        result: payload.result,
        require_rewards: payload.requireRewards === true
      }
      const { data, status, requestId, hint, attempts } = await postJson(
        `/runs/${encodeURIComponent(runId)}/finish`,
        body,
        { retry: true }
      )
      const run = isPlainObject(data.run) ? data.run : {}
      const hintCode = safeText(hint?.code)
      return {
        runId,
        runStatus: safeText(run.status) || 'FINISHED',
        settlement: normalizeSettlement(data.settlement),
        idempotentReplay: data.idempotent_replay === true,
        recovered: data.recovered === true,
        rewardDisabled: hintCode === ERROR_CODES.REWARD_DISABLED,
        hint: hintCode ? { code: hintCode, message: safeText(hint?.message) } : null,
        requestId,
        status,
        attempts,
        raw: data
      }
    },

    /** 排行榜读取（§9）：公开榜无需认证，本人态用当前 session */
    async leaderboard({ board = 'classic', scope = 'school', limit = 20, cursor } = {}) {
      const { data, status } = await getJson('/leaderboards', {
        game_id: gameId,
        board,
        scope,
        limit: String(limit),
        cursor
      })
      const metric = isPlainObject(data.metric) ? { ...data.metric } : null
      const entries = Array.isArray(data.entries) ? data.entries : []
      return {
        board: safeText(data.board) || board,
        scopeApplied: safeText(data.scope_applied) || scope,
        metric,
        nextCursor: data.next_cursor ? safeText(data.next_cursor) : null,
        generatedAt: safeText(data.generated_at),
        entries,
        status,
        raw: data
      }
    }
  }
}
