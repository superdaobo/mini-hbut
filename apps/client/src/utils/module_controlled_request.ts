/**
 * 模块受控请求的宿主侧协议（#1167 T06/T07 接缝）。
 *
 * 链路：模块 iframe ──postMessage──▶ 宿主（本文件）──invoke──▶ Rust session_fetch
 *       └────────── 同一个 request_id 的响应 postMessage 回模块 ◀──┘
 *
 * 这里只做**形状校验**与**错误归一**，不做授权判定：
 * 授权在 Rust（能力登记表 + 实例信任 + 账号作用域）。宿主绝不替模块决定「能不能」。
 */
import { t } from './app_i18n'

/** 模块 → 宿主的请求消息类型（与 SDK 侧约定一致）。 */
export const MODULE_FETCH_REQUEST_TYPE = 'hbu-module-fetch'
/** 宿主 → 模块的响应消息类型。 */
export const MODULE_FETCH_RESPONSE_TYPE = 'hbu-module-fetch-result'

export interface ModuleFetchRequestMessage {
  type: typeof MODULE_FETCH_REQUEST_TYPE
  request_id: string
  capability: string
  query?: Record<string, string>
  form?: Record<string, string>
  timeout_ms?: number
}

export interface ModuleFetchErrorPayload {
  code: string
  message: string
}

export interface ModuleFetchResponseMessage {
  type: typeof MODULE_FETCH_RESPONSE_TYPE
  request_id: string
  ok: boolean
  status?: number
  content_type?: string
  body?: string
  error?: ModuleFetchErrorPayload
}

const REQUEST_ID_PATTERN = /^[a-z0-9_]{6,64}$/i
const CAPABILITY_PATTERN = /^[a-z][a-z0-9._]{2,63}$/

/** 只接受字符串值，拒绝嵌套/数组/超长，避免把结构塞进参数。 */
const normalizeParams = (raw: unknown): Record<string, string> | null => {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') return null
    if (key.length > 64 || value.length > 512) return null
    out[key] = value
  }
  if (Object.keys(out).length > 16) return null
  return out
}

/**
 * 校验模块发来的消息，返回可直接交给 Rust 的请求参数。
 * 形状不合法 → 返回 null（调用方**静默丢弃**，不回应，避免给模块回声探测）。
 */
export const normalizeModuleFetchMessage = (
  payload: unknown
): Omit<ModuleFetchRequestMessage, 'type'> | null => {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as Record<string, unknown>
  if (raw.type !== MODULE_FETCH_REQUEST_TYPE) return null
  const requestId = typeof raw.request_id === 'string' ? raw.request_id.trim() : ''
  if (!REQUEST_ID_PATTERN.test(requestId)) return null
  const capability = typeof raw.capability === 'string' ? raw.capability.trim() : ''
  if (!CAPABILITY_PATTERN.test(capability)) return null
  const query = normalizeParams(raw.query)
  const form = normalizeParams(raw.form)
  if (query === null || form === null) return null
  const timeout =
    typeof raw.timeout_ms === 'number' && Number.isFinite(raw.timeout_ms)
      ? Math.max(1, Math.min(15_000, Math.floor(raw.timeout_ms)))
      : undefined
  return {
    request_id: requestId,
    capability,
    query,
    form,
    ...(timeout ? { timeout_ms: timeout } : {})
  }
}

/**
 * 从 Rust 错误串里解出 `CODE: 文案` 的码（Rust 侧统一格式）。
 * 没有码时按 `MODULE_UPSTREAM_ERROR` 处理（不把原始异常文本透给模块）。
 */
export const parseModuleFetchError = (
  raw: unknown
): ModuleFetchErrorPayload => {
  const text = typeof raw === 'string' ? raw : String((raw as Error)?.message || raw || '')
  const matched = /^(MODULE_[A-Z_]{3,64}):\s*([\s\S]*)$/.exec(text.trim())
  if (matched) {
    return { code: matched[1], message: matched[2].trim() || matched[1] }
  }
  return { code: 'MODULE_UPSTREAM_ERROR', message: text.trim() || '请求失败' }
}

/** 构造回给模块的响应消息。 */
export const buildModuleFetchResponse = (
  requestId: string,
  outcome:
    | { ok: true; status: number; content_type?: string; body: string }
    | { ok: false; error: ModuleFetchErrorPayload }
): ModuleFetchResponseMessage => {
  if (outcome.ok) {
    return {
      type: MODULE_FETCH_RESPONSE_TYPE,
      request_id: requestId,
      ok: true,
      status: outcome.status,
      content_type: outcome.content_type || '',
      body: outcome.body
    }
  }
  return {
    type: MODULE_FETCH_RESPONSE_TYPE,
    request_id: requestId,
    ok: false,
    error: outcome.error
  }
}

/** 受控请求错误码 → 三语文案（未知码回退原文，不吞错）。 */
export const moduleFetchErrorText = (error: ModuleFetchErrorPayload): string => {
  const key = `more.moduleFetch.${error.code}`
  const text = t(key)
  return text && text !== key ? text : error.message
}
