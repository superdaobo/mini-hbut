/**
 * handoff 解析与深链构造（纯函数，可单测）。
 *
 * 安全约定（issue #630）：
 *  - handoff 是 Core 生成的一次性高熵值，数据库只存其摘要；
 *  - 浏览器从 location.hash 读取到内存，不写 localStorage/IndexedDB；
 *  - 所有 BFF/Core 调用只经敏感 header x-identity-handoff 转发；
 *  - 深链只携带 request_id 与 handoff，不含 student id / client 展示数据 / scope / token。
 */

/** handoff token 格式：一次性高熵值（20~128 位 URL-safe 字符） */
export const HANDOFF_TOKEN_RE = /^[A-Za-z0-9._~-]{20,128}$/

/** 深链 hash 中 handoff 的键名（#h=<one-time-handoff>） */
export const HANDOFF_HASH_KEY = 'h'

/** request id 格式：ar_ 前缀 + URL-safe 短标识（与 Core #619 生成规则一致，如 ar_xxx） */
export const REQUEST_ID_RE = /^ar_[A-Za-z0-9_-]{3,64}$/

export function isValidRequestId(requestId: string): boolean {
  return REQUEST_ID_RE.test(requestId)
}

/** 从 location.hash（形如 "#h=<one-time-handoff>"）解析 handoff；缺失/非法返回 null */
export function parseHandoffFromHash(hash: string): string | null {
  if (!hash || !hash.startsWith('#')) {
    return null
  }
  const params = new URLSearchParams(hash.slice(1))
  const token = params.get(HANDOFF_HASH_KEY)
  if (!token || !HANDOFF_TOKEN_RE.test(token)) {
    return null
  }
  return token
}

/** 构造 Mini-HBUT 深链（App 的 Identity 路径，只含 request_id 与 handoff） */
export function buildIdentityDeepLink(requestId: string, handoff: string): string {
  const params = new URLSearchParams({ request_id: requestId, handoff })
  return `minihbut://identity?${params.toString()}`
}

/**
 * resume 回调白名单校验：只允许 http/https 地址。
 * 注意：真正的安全边界是“值只能来自 Core 响应（oidc-provider 决定）”，
 * 本函数只是客户端兜底，防止异常数据（如 javascript:）被当作跳转目标。
 */
export function resolveSafeRedirect(raw: string | null | undefined): string | null {
  if (!raw) {
    return null
  }
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
