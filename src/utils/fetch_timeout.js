/**
 * 统一 fetch 超时封装（AbortController 实现）。
 *
 * - 默认超时 10s，可通过第三个参数 timeoutMs 配置（<=0 或非数字时回退默认值）。
 * - 支持与外部 signal 合并：外部 signal 中止时立即中止本次请求；超时优先，两者不冲突。
 * - 超时抛出的错误 name 为 'TimeoutError'，便于上层统一识别（见 isTimeoutError）。
 * - 不支持 AbortController 的环境退化为普通 fetch（无超时），保证兼容性。
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

const isAbortLikeError = (error) => {
  const name = String(error?.name || '')
  return name === 'AbortError' || name === 'TimeoutError'
}

const describeInput = (input) => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return String(input?.url || '')
}

export async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const safeTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS
  const externalSignal = init?.signal || null

  if (typeof AbortController !== 'function') {
    // 环境不支持 AbortController：退化为无超时请求，保证功能可用。
    return fetch(input, init)
  }

  const controller = new AbortController()
  let timedOut = false
  let timer = null
  const onExternalAbort = () => controller.abort()

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  try {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, safeTimeout)
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut && isAbortLikeError(error)) {
      const timeoutError = new Error(`fetch timeout after ${safeTimeout}ms: ${describeInput(input)}`)
      timeoutError.name = 'TimeoutError'
      timeoutError.cause = error
      throw timeoutError
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * 判断错误是否为 fetch 超时（TimeoutError 或消息含 timeout/timed out）。
 */
export const isTimeoutError = (error) => {
  if (error?.name === 'TimeoutError') return true
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('timeout') || message.includes('timed out')
}

/**
 * 判断错误是否为 AbortError（含超时与外部 signal 中止）。
 */
export const isAbortError = (error) => isAbortLikeError(error)

const makeTimeoutError = (label, timeoutMs) => {
  const error = new Error(`${label || 'operation'} timeout after ${timeoutMs}ms`)
  error.name = 'TimeoutError'
  return error
}

/**
 * 通用 Promise 超时包装：为任意返回 Promise 的任务（如 fetchWithCache 的 fetcher）施加超时。
 *
 * - 兼容任意任务签名：返回包装函数，原样透传参数给 task(...args)。
 * - 超时抛 name === 'TimeoutError'（与 fetchWithTimeout 语义一致，isTimeoutError 可识别）。
 * - 不中止任务本身（Promise 无法外部取消），仅丢弃迟到结果并抛超时；适合调用方已有
 *   stale 回退/维护模式兜底的场景（fetchWithCache 即此类）。
 */
export const withTimeout = (task, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, label = 'operation') => {
  const safeTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS
  return (...args) => {
    let timer = null
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(makeTimeoutError(label, safeTimeout)), safeTimeout)
    })
    return Promise.race([Promise.resolve().then(() => task(...args)), timeout]).finally(() => {
      if (timer) clearTimeout(timer)
    })
  }
}
