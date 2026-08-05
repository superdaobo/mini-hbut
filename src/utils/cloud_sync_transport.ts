/**
 * cloud_sync_transport：云同步代理 HTTP 传输与一次性鉴权挑战（challenge）管理。
 */
import type { CloudSyncRuntimeConfig } from './cloud_sync_config.js'
import {
  CHALLENGE_FALLBACK_TTL_MS,
  CHALLENGE_SKEW_MS,
  DEFAULT_SECRET_REF,
  DEFAULT_TIMEOUT_MS,
  safeParseJson,
  toSafeText
} from './cloud_sync_storage.js'

/** 将 axios 适配器响应体窄化为对象（避免无边界 any） */
export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

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

const canReuseChallenge = (config: CloudSyncRuntimeConfig): boolean => {
  const endpoint = toSafeText(config?.proxyEndpoint || config?.endpoint)
  if (!endpoint) return false
  if (challengeState.endpoint !== endpoint) return false
  if (!challengeState.token) return false
  return challengeState.expiresAt > Date.now() + CHALLENGE_SKEW_MS
}

const loadCloudSyncChallenge = async (
  config: CloudSyncRuntimeConfig,
  force = false
): Promise<string> => {
  if (!force && canReuseChallenge(config)) {
    return challengeState.token
  }
  const secretRef = toSafeText(config?.secretRef) || DEFAULT_SECRET_REF
  const query = new URLSearchParams({ secret_ref: secretRef }).toString()
  const res = await requestCloudSync(`/ping?${query}`, {
    method: 'GET',
    config,
    skipChallenge: true,
    allowRetry: false
  })
  const token = toSafeText(res?.challenge)
  if (!token) {
    throw new Error('云同步鉴权挑战获取失败')
  }
  const ttlSec = Number(res?.challenge_expires_in || 0)
  const ttlMs = Number.isFinite(ttlSec) && ttlSec > 0
    ? Math.max(10_000, Math.round(ttlSec * 1000))
    : CHALLENGE_FALLBACK_TTL_MS
  challengeState.token = token
  challengeState.endpoint = toSafeText(config?.proxyEndpoint || config?.endpoint)
  challengeState.expiresAt = Date.now() + ttlMs
  return token
}

interface RequestOptions {
  method?: string
  body?: unknown
  config: CloudSyncRuntimeConfig
  skipChallenge?: boolean
  allowRetry?: boolean
}

export const requestCloudSync = async (
  path: unknown,
  { method = 'GET', body, config, skipChallenge = false, allowRetry = true }: RequestOptions
): Promise<Record<string, unknown>> => {
  const endpoint = toSafeText(config?.proxyEndpoint || config?.endpoint)
  if (!endpoint) {
    throw new Error('云同步中转地址未配置')
  }
  const url = `${endpoint.replace(/\/+$/, '')}${path}`
  const timeoutMs = Math.max(3000, Number(config?.timeoutMs || DEFAULT_TIMEOUT_MS))
  const makeController = () => (typeof AbortController !== 'undefined' ? new AbortController() : null)

  const sendOnce = async (challengeToken = ''): Promise<{
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
    challengeToken = await loadCloudSyncChallenge(config, false)
  }

  let { response, parsed, text } = await sendOnce(challengeToken)
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
    clearCloudSyncChallengeState()
    challengeToken = await loadCloudSyncChallenge(config, true)
    ;({ response, parsed, text } = await sendOnce(challengeToken))
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
    const error = new Error(errText || `HTTP ${response.status}`)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('云同步服务返回了无效响应')
  }
  const parsedObj = parsed as Record<string, unknown>
  if (parsedObj.success === false) {
    throw new Error(toSafeText(parsedObj.error || parsedObj.message) || '云同步服务返回失败')
  }
  return parsedObj
}
