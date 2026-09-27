/**
 * HTTP 传输层：超时、退避重试、协议 envelope 解析、错误归一。
 *
 * 关键决策：
 * - **只有 `error.retryable === true` 才重试**（码表 + 服务端显式标志共同决定）：
 *   429/5xx/网络/超时退避重试；409/401/400/403/404/426 一律不重试
 *   （protocol-v1.md §3.3 要求 409 立即停止重试）；
 * - POST 重试是安全的：run 用 run_id 幂等、ticket/session 用自身状态幂等（§3.3、§6.2.2）；
 * - 服务端 message 直接作为可展示文案；本地兜底文案为简体中文；
 * - **本文件禁止任何 console/日志输出**（§10 L1/L5：凭据不得入日志）。
 */

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_DELAYS_MS,
  PROTOCOL_VERSION
} from './version.js'
import {
  ERROR_CODES,
  GamePlatformError,
  codeFromHttpStatus,
  isAbortError,
  normalizeErrorCode
} from './errors.js'
import { delay, normalizeNfc, safeText } from './utils.js'

const PROTOCOL_HEADER = 'X-Game-Platform-Protocol'
const CORRELATION_HEADER = 'X-Game-Client-Correlation'

/** 解析响应文本为 JSON（失败返回 null，不抛错） */
const parseJsonText = (text) => {
  try {
    const parsed = JSON.parse(text || '')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * 协议 envelope 判定：`{success:true,...}` 或 `{success:false,error:{code,...}}`。
 * 非 envelope（裸 404 / HTML 错误页 / 网关响应）一律按「V2 未部署」处理
 * → FEATURE_DISABLED（protocol-v1.md §1.1：未实现路径返回 404 + FEATURE_DISABLED）。
 */
const isProtocolEnvelope = (payload) =>
  !!payload && typeof payload === 'object' && (payload.success === true || payload.success === false)

/** 从服务端 envelope 构造统一错误（无 envelope 时按 HTTP 状态兜底） */
const errorFromEnvelope = (payload, status) => {
  const rawError = payload?.error
  const isObjectError = !!rawError && typeof rawError === 'object'
  const code = isObjectError ? normalizeErrorCode(rawError.code, '') : ''
  const message = isObjectError
    ? safeText(rawError.message)
    : typeof rawError === 'string'
      ? safeText(rawError)
      : ''
  return new GamePlatformError(code || codeFromHttpStatus(status), {
    message: message || undefined,
    status: Number(status) || 0,
    retryable: isObjectError && typeof rawError.retryable === 'boolean' ? rawError.retryable : undefined,
    requestId: safeText(payload?.request_id || rawError?.request_id),
    details: isObjectError && rawError.details && typeof rawError.details === 'object' ? rawError.details : {}
  })
}

/**
 * 创建传输层实例。
 * @param {object} [deps]
 * @param {Function} [deps.fetchImpl] 注入 fetch（测试/自定义）
 * @param {number} [deps.timeoutMs] 默认超时
 * @param {number[]} [deps.retryDelaysMs] 退避序列
 */
export const createTransport = (deps = {}) => {
  const fetchImpl = deps.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  const defaultTimeoutMs = Number(deps.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS)
  const retryDelaysMs = Array.isArray(deps.retryDelaysMs)
    ? deps.retryDelaysMs.slice()
    : DEFAULT_RETRY_DELAYS_MS.slice()

  /** 单次请求：带超时 + 协议 envelope 解析 */
  const requestJson = async (init = {}) => {
    if (!fetchImpl) {
      throw new GamePlatformError(ERROR_CODES.INTERNAL_ERROR, {
        message: '当前环境不支持网络请求',
        retryable: false,
        details: { reason: 'fetch_unavailable' }
      })
    }
    const { url, timeoutMs: customTimeout, ...fetchInit } = init
    if (!url) throw new TypeError('requestJson 需要 url')
    const timeoutMs = Number(customTimeout || defaultTimeoutMs) || defaultTimeoutMs
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    let timer = null
    const timeoutError = new GamePlatformError(ERROR_CODES.INTERNAL_ERROR, {
      message: '网络请求超时，请稍后重试',
      retryable: true,
      details: { reason: 'timeout', timeout_ms: timeoutMs }
    })
    try {
      const setTimer = globalThis.setTimeout
      const timeoutPromise = new Promise((_, reject) => {
        if (typeof setTimer !== 'function') return
        timer = setTimer(() => {
          if (controller) controller.abort()
          reject(timeoutError)
        }, timeoutMs)
      })
      const response = await Promise.race([
        fetchImpl(url, {
          ...fetchInit,
          signal: controller ? controller.signal : fetchInit.signal,
          headers: {
            Accept: 'application/json',
            [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
            ...(fetchInit.body ? { 'Content-Type': 'application/json' } : {}),
            ...(fetchInit.headers || {})
          }
        }),
        timeoutPromise
      ])
      const text = await response.text()
      const payload = parseJsonText(text)
      const status = Number(response.status || 0)

      if (!response.ok) {
        if (isProtocolEnvelope(payload)) throw errorFromEnvelope(payload, status)
        const code = status === 404 || status === 405 ? ERROR_CODES.FEATURE_DISABLED : codeFromHttpStatus(status)
        throw new GamePlatformError(code, {
          message: safeText(payload?.message) || undefined,
          status,
          details: { envelope_missing: true }
        })
      }
      if (!isProtocolEnvelope(payload)) {
        throw new GamePlatformError(ERROR_CODES.INTERNAL_ERROR, {
          message: '服务返回了无法识别的响应',
          status,
          retryable: false,
          details: { envelope_missing: true }
        })
      }
      return {
        data: payload,
        status,
        requestId: safeText(payload.request_id),
        // 200 + success:true 但带 error 提示（REWARD_DISABLED 的提示性返回，§2.2）
        hint: payload.success === true && payload.error ? payload.error : null
      }
    } catch (error) {
      if (error === timeoutError) throw timeoutError
      if (error instanceof GamePlatformError) throw error
      if (isAbortError(error)) {
        throw new GamePlatformError(ERROR_CODES.INTERNAL_ERROR, {
          message: '网络请求超时，请稍后重试',
          retryable: true,
          details: { reason: 'timeout' },
          cause: error
        })
      }
      const networkLike = /network|fetch|failed|offline|load/i.test(safeText(error?.message || error))
      throw new GamePlatformError(ERROR_CODES.INTERNAL_ERROR, {
        message: networkLike ? '网络不可用，请检查网络后重试' : undefined,
        retryable: true,
        details: { reason: networkLike ? 'offline' : 'network_error' },
        cause: error
      })
    } finally {
      if (timer && typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(timer)
    }
  }

  /**
   * 带退避重试的请求：尝试次数 = 1 + retryDelaysMs.length（默认 4 次 = 1200/2600/5200ms）。
   * 重试条件完全由 `GamePlatformError.retryable` 决定（服务端可显式覆盖）。
   */
  const requestJsonWithRetry = async (init = {}, options = {}) => {
    const delays = Array.isArray(options.retryDelaysMs) ? options.retryDelaysMs : retryDelaysMs
    const maxAttempts = Math.max(1, Number(options.maxAttempts || delays.length + 1))
    let lastError = null
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await delay(delays[attempt - 1] ?? delays[delays.length - 1] ?? 0)
      try {
        const result = await requestJson(init)
        return { ...result, attempts: attempt + 1 }
      } catch (error) {
        const normalized =
          error instanceof GamePlatformError
            ? error
            : new GamePlatformError(ERROR_CODES.INTERNAL_ERROR, { cause: error, retryable: true })
        lastError = normalized
        if (attempt >= maxAttempts - 1 || normalized.retryable !== true) throw normalized
      }
    }
    throw lastError || new GamePlatformError(ERROR_CODES.INTERNAL_ERROR)
  }

  return {
    requestJson,
    requestJsonWithRetry,
    /** 统一请求头（关联 id 只用于链路追踪，不含任何主体身份） */
    buildHeaders: (extra = {}) => ({ [PROTOCOL_HEADER]: String(PROTOCOL_VERSION), ...extra }),
    protocolHeader: PROTOCOL_HEADER,
    correlationHeader: CORRELATION_HEADER,
    retryDelaysMs,
    defaultTimeoutMs
  }
}

/** 拼接 URL（避免双斜杠；query 只接受字符串/数字，值做 NFC 归一） */
export const buildUrl = (base, path, query) => {
  const root = safeText(base).replace(/\/+$/, '')
  const suffix = safeText(path)
  const url = `${root}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const text = safeText(value)
    if (text) params.set(key, normalizeNfc(text))
  }
  const queryString = params.toString()
  return queryString ? `${url}?${queryString}` : url
}
