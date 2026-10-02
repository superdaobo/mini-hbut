/**
 * cloud_sync_transport：云同步代理 HTTP 传输与一次性鉴权挑战（challenge）管理。
 *
 * #629 双轨：请求优先携带 Mini-HBUT Identity access token（Authorization: Bearer），
 * token 缺失时回退 legacy challenge 流程（服务端 LEGACY_GRACE 期内兼容）；
 * 401 只触发一次 refresh（identity 单次刷新 + challenge 重取），不无限循环。
 *
 * 故障转移（契约 docs/architecture/backend-endpoints-contract.md §6）：
 * 按 `config.endpoints`（主 + 兜底）顺序尝试；网络错误 / 超时 / 5xx 触发切换并冷却该组，
 * 4xx 与业务错误不切换。challenge 与端点严格绑定，切换端点后必须重新获取。
 */
import type { CloudSyncRuntimeConfig } from './cloud_sync_config.js'
import { getIdentityAccessToken } from './identity_access_token.js'
import {
  CHALLENGE_FALLBACK_TTL_MS,
  CHALLENGE_SKEW_MS,
  DEFAULT_SECRET_REF,
  DEFAULT_TIMEOUT_MS,
  safeParseJson,
  toSafeText
} from './cloud_sync_storage.js'
import { markGroupFailed, markGroupSucceeded, orderCandidatesById } from './backend_failover'
import type { ChannelEndpoint } from './backend_endpoints'

/** 将 axios 适配器响应体窄化为对象（避免无边界 any） */
export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

type CloudSyncError = Error & { status?: number; noFailover?: boolean }

const challengeState = {
  token: '',
  expiresAt: 0,
  endpoint: ''
}

const clearCloudSyncChallengeState = (): void => {
  challengeState.token = ''
  challengeState.expiresAt = 0
}

const shouldAttachChallenge = (path: unknown): boolean => {
  const normalized = toSafeText(path).toLowerCase()
  return normalized.startsWith('/upload') || normalized.startsWith('/download')
}

const canReuseChallenge = (endpoint: string): boolean => {
  if (!endpoint) return false
  if (challengeState.endpoint !== endpoint) return false
  if (!challengeState.token) return false
  return challengeState.expiresAt > Date.now() + CHALLENGE_SKEW_MS
}

/** 业务错误（服务活着但拒绝了请求）：不触发跨组切换 */
const createBusinessError = (message: string, status = 0): CloudSyncError => {
  const error = new Error(message) as CloudSyncError
  error.status = status
  error.noFailover = true
  return error
}

/** 是否应触发故障转移：网络错误 / 超时 / 5xx 为是；4xx 与业务错误为否 */
export const isFailoverWorthyError = (error: unknown): boolean => {
  const typed = error as CloudSyncError | null | undefined
  if (typed?.noFailover) return false
  const status = Number(typed?.status || 0)
  if (status >= 400 && status < 500) return false
  return true
}

interface RequestOptions {
  method?: string
  body?: unknown
  config: CloudSyncRuntimeConfig
  skipChallenge?: boolean
  allowRetry?: boolean
}

const loadCloudSyncChallenge = async (
  endpoint: string,
  config: CloudSyncRuntimeConfig,
  force = false
): Promise<string> => {
  if (!force && canReuseChallenge(endpoint)) {
    return challengeState.token
  }
  const secretRef = toSafeText(config?.secretRef) || DEFAULT_SECRET_REF
  const query = new URLSearchParams({ secret_ref: secretRef }).toString()
  const res = await requestOnEndpoint(endpoint, `/ping?${query}`, {
    method: 'GET',
    config,
    skipChallenge: true,
    allowRetry: false
  })
  const token = toSafeText(res?.challenge)
  if (!token) {
    throw createBusinessError('云同步鉴权挑战获取失败')
  }
  const ttlSec = Number(res?.challenge_expires_in || 0)
  const ttlMs = Number.isFinite(ttlSec) && ttlSec > 0
    ? Math.max(10_000, Math.round(ttlSec * 1000))
    : CHALLENGE_FALLBACK_TTL_MS
  challengeState.token = token
  challengeState.endpoint = endpoint
  challengeState.expiresAt = Date.now() + ttlMs
  return token
}

/**
 * 在单一端点上执行一次完整请求（challenge 获取 + 401 单次刷新）。
 * 失败时抛带 `status` 的错误；业务层失败标记 `noFailover`（不触发跨组切换）。
 */
const requestOnEndpoint = async (
  endpoint: string,
  path: unknown,
  { method = 'GET', body, config, skipChallenge = false, allowRetry = true }: RequestOptions
): Promise<Record<string, unknown>> => {
  const url = `${endpoint.replace(/\/+$/, '')}${path}`
  const timeoutMs = Math.max(3000, Number(config?.timeoutMs || DEFAULT_TIMEOUT_MS))
  const makeController = () => (typeof AbortController !== 'undefined' ? new AbortController() : null)

  const sendOnce = async (
    challengeToken = '',
    identityToken: string | null = null
  ): Promise<{
    response: Response
    parsed: unknown
    text: string
  }> => {
    const controller = makeController()
    const timer = window.setTimeout(() => {
      controller?.abort?.()
    }, timeoutMs)
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json'
      }
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
      }
      // #629：Identity access token 优先（内存/session 层）；无 token 时走 legacy challenge
      if (identityToken) {
        headers.Authorization = `Bearer ${identityToken}`
      }
      if (challengeToken) {
        headers['x-cloud-sync-challenge'] = challengeToken
      }
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller?.signal
      })
      const text = await response.text()
      const parsed = safeParseJson<unknown>(text, null)
      return { response, parsed, text }
    } finally {
      window.clearTimeout(timer)
    }
  }

  let challengeToken = ''
  if (!skipChallenge && shouldAttachChallenge(path)) {
    challengeToken = await loadCloudSyncChallenge(endpoint, config, false)
  }
  let identityToken = await getIdentityAccessToken()

  let { response, parsed, text } = await sendOnce(challengeToken, identityToken)
  // OCR 中转 challenge 为一次性令牌，请求后立即作废，避免后续复用触发 401。
  if (challengeToken) {
    clearCloudSyncChallengeState()
  }
  if (
    !response.ok &&
    allowRetry &&
    !skipChallenge &&
    shouldAttachChallenge(path) &&
    response.status === 401
  ) {
    // 401 统一单次 refresh：identity token 刷新一次 + challenge 重取一次，不无限循环
    clearCloudSyncChallengeState()
    identityToken = await getIdentityAccessToken(true)
    challengeToken = await loadCloudSyncChallenge(endpoint, config, true)
    ;({ response, parsed, text } = await sendOnce(challengeToken, identityToken))
    if (challengeToken) {
      clearCloudSyncChallengeState()
    }
  }

  if (!response.ok) {
    const errText = toSafeText(
      (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)?.error || (parsed as Record<string, unknown>)?.message : '') ||
        text ||
        `HTTP ${response.status}`
    )
    const error = new Error(errText || `HTTP ${response.status}`) as CloudSyncError
    error.status = response.status
    // 4xx 视为"服务活着但请求有错"，由 isFailoverWorthyError 判定不切换
    throw error
  }
  if (!parsed || typeof parsed !== 'object') {
    throw createBusinessError('云同步服务返回了无效响应', response.status)
  }
  const parsedObj = parsed as Record<string, unknown>
  if (parsedObj.success === false) {
    throw createBusinessError(
      toSafeText(parsedObj.error || parsedObj.message) || '云同步服务返回失败',
      response.status
    )
  }
  return parsedObj
}

/** 从运行时配置解析候选端点（兼容旧形态：只有 proxyEndpoint 时视为单候选） */
const resolveEndpointCandidates = (config: CloudSyncRuntimeConfig): ChannelEndpoint[] => {
  const endpoints = Array.isArray(config?.endpoints) ? config.endpoints : []
  if (endpoints.length > 0) return endpoints
  const single = toSafeText(config?.proxyEndpoint || config?.endpoint)
  return single ? [{ groupId: 'legacy', failoverKey: single, url: single }] : []
}

export const requestCloudSync = async (
  path: unknown,
  options: RequestOptions
): Promise<Record<string, unknown>> => {
  const { config } = options
  const candidates = resolveEndpointCandidates(config)
  if (candidates.length === 0) {
    throw new Error('云同步中转地址未配置')
  }
  const order = orderCandidatesById(candidates, (item) => item.failoverKey, config?.failover)

  let lastError: CloudSyncError | null = null
  for (const candidate of order) {
    try {
      const result = await requestOnEndpoint(candidate.url, path, options)
      markGroupSucceeded(candidate.failoverKey)
      return result
    } catch (error) {
      const typed = error as CloudSyncError
      if (!isFailoverWorthyError(typed)) {
        throw typed
      }
      markGroupFailed(candidate.failoverKey, config?.failover)
      lastError = typed
    }
  }
  throw lastError || new Error('云同步服务不可用')
}
