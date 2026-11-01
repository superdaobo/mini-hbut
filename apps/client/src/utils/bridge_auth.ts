/**
 * Bridge 会话令牌（#1163 T02）：主窗口专属凭据 + 统一注入。
 *
 * 契约（见 docs/architecture/contracts/facts-and-baseline.md §4 C3 与本轮 T02 决议）：
 * - 令牌只能由**主窗口**经原生命令 `bridge_session_token` 取得；
 * - 只驻留内存（模块级变量），**绝不**写入 localStorage / sessionStorage / IndexedDB /
 *   URL / 日志 / 子页面，也不挂到 `window` 上供其他 origin 读取；
 * - 非 Tauri 运行时（纯浏览器预览、测试环境）一律返回 `null`，调用方走无桥降级路径；
 * - 401 时清缓存：Bridge 可能已 respawn 换过令牌，下次调用重新取。
 */

import { invokeNative, isTauriRuntime } from '../platform/native'

const BRIDGE_SESSION_TOKEN_COMMAND = 'bridge_session_token'

let cachedToken: string | null = null
let inflight: Promise<string | null> | null = null

/** 仅供测试与 401 后的重取使用；不得暴露给业务代码随意调用。 */
export const resetBridgeSessionToken = (): void => {
  cachedToken = null
  inflight = null
}

/** 取当前窗口的 Bridge 会话令牌；取不到返回 null（不抛错）。 */
export const getBridgeSessionToken = async (): Promise<string | null> => {
  if (!isTauriRuntime()) return null
  if (cachedToken) return cachedToken
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const value = await invokeNative<string | null>(BRIDGE_SESSION_TOKEN_COMMAND)
      const token = typeof value === 'string' ? value.trim() : ''
      cachedToken = token ? token : null
      return cachedToken
    } catch {
      // 模块窗口 / 桥未启用 / 命令缺失：一律降级为「无凭据」，不重试、不记录令牌内容。
      cachedToken = null
      return null
    } finally {
      inflight = null
    }
  })()

  return inflight
}

const asHeaderRecord = (headers: HeadersInit | undefined): Record<string, string> => {
  const record: Record<string, string> = {}
  if (!headers) return record
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) record[key] = value
    return record
  }
  return { ...(headers as Record<string, string>) }
}

/** 在给定 headers 上补充 Bridge 凭据（无令牌时原样返回）。 */
export const withBridgeAuthHeaders = async (
  headers: HeadersInit | undefined
): Promise<Record<string, string>> => {
  const base = asHeaderRecord(headers)
  const token = await getBridgeSessionToken()
  if (!token) return base
  return { ...base, Authorization: `Bearer ${token}` }
}

/**
 * 访问本地 Bridge 的统一入口：自动补凭据；401 时清缓存（不自动重试，由调用方决定）。
 * 媒体类子资源（`<video src>`/`<img src>`）无法走这里，另行按 T02 契约 R4 处理。
 */
export const bridgeFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const headers = await withBridgeAuthHeaders(init.headers)
  const response = await fetch(url, { ...init, headers })
  if (response.status === 401) resetBridgeSessionToken()
  return response
}
