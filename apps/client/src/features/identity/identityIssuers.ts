// src/features/identity/identityIssuers.ts
//
// #1171 T13：客户端多 issuer 兼容（Identity 令牌 issuer 校验）。
//
// 信任边界规则（与 identity-platform/core/src/config/issuer.ts 的 #617 约定对齐）：
//   - 协议字段只用 canonical ASCII（Punycode）issuer；Unicode 与 Punycode 禁止混用；
//   - 客户端以「一组已接受 issuer」替代写死单一 issuer（可配置列表）：
//       1. 默认 = Production canonical issuer；
//       2. 编程式覆盖 `setAcceptedIdentityIssuers`（远端配置/测试注入点）；
//       3. DEV 本地覆盖（localStorage JSON 数组，仅 DEV + loopback 生效，
//          Production 永不从 localStorage 读 issuer 列表——与 identityService 的
//          origin 覆盖规则同源）。
//   - **未知 issuer 一律显式拒绝**（返回可读错误，调用方丢弃令牌并回退 legacy 双轨），
//     绝不降级为「跳过校验」；缺 iss / 无法解码同样拒绝（fail closed）。
//
// 安全边界：本模块只做本地解码与 issuer 比对，不做验签（验签是资源服务器的职责，
// 本地自解 payload 不构成信任提升）；issuer 是 URL 而非秘密，可进入诊断文案，
// 但完整令牌绝不出现在任何文案里。

/** Production canonical issuer（Punycode ASCII；与 identity-platform 的 PRODUCTION_CANONICAL_ISSUER 同源） */
export const PRODUCTION_CANONICAL_ISSUER = 'https://id.xn--vhq74jc2fzpchter27a.com'

/** DEV 本地覆盖键：JSON 字符串数组；Production 永不信任（见 getAcceptedIdentityIssuers） */
export const IDENTITY_ACCEPTED_ISSUERS_KEY = 'hbu_identity_accepted_issuers'

/** 编程式覆盖（测试 / 远端配置注入点）；null 表示恢复默认列表 */
let overrideIssuers: string[] | null = null

const isDevRuntime = (): boolean => {
  try {
    return Boolean(import.meta.env && import.meta.env.DEV)
  } catch {
    return false
  }
}

const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'

/**
 * 归一化 issuer 为 canonical 形式（protocol + host (+port) + path，尾斜杠去除）。
 *
 * - https 必须；http 仅在 DEV 环境且为 loopback 时允许（本地联调）；
 * - 浏览器 WHATWG URL 自动把 Unicode host 转成 Punycode（与后端 domainToASCII 一致）；
 * - 含 userinfo / query / fragment 的输入拒绝（issuer 不应携带这些成分）；
 * - 任何解析失败返回 null（fail closed，绝不静默放行）。
 */
export const normalizeIssuerValue = (raw: unknown): string | null => {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.username || url.password || url.search || url.hash) return null
  if (url.protocol !== 'https:') {
    // http 仅 DEV + loopback
    if (!(url.protocol === 'http:' && isDevRuntime() && isLoopbackHost(url.hostname))) {
      return null
    }
  }
  const host = url.hostname
  if (!host) return null
  const port = url.port ? `:${url.port}` : ''
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.protocol}//${host}${port}${path}`
}

/** 默认已接受 issuer 列表（迁移期可扩展；单一事实源 = Production canonical） */
export const getDefaultAcceptedIssuers = (): string[] => [PRODUCTION_CANONICAL_ISSUER]

/** 读取 DEV 本地覆盖（localStorage JSON 数组；非法/缺省一律忽略，不回退错误） */
const readDevOverrideIssuers = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(IDENTITY_ACCEPTED_ISSUERS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const normalized: string[] = []
    for (const item of parsed) {
      const value = normalizeIssuerValue(item)
      if (value) normalized.push(value)
    }
    return normalized
  } catch {
    return []
  }
}

/**
 * 设置已接受 issuer 列表（编程式，供远端配置/测试注入）。
 * - 传入值逐条归一化，非法项丢弃；去重；
 * - 显式空数组 = 接受集合为空 → 所有 issuer 均被拒绝（fail closed，不是恢复默认）；
 * - null = 恢复默认列表。
 */
export const setAcceptedIdentityIssuers = (values: string[] | null): void => {
  if (values === null) {
    overrideIssuers = null
    return
  }
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const normalized = normalizeIssuerValue(value)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      next.push(normalized)
    }
  }
  overrideIssuers = next
}

/**
 * 当前生效的已接受 issuer 列表：
 * - 有编程式覆盖 → 只返回覆盖（不再并入默认，保证远端配置语义明确）；
 * - 无覆盖 → 默认 ∪ DEV 本地覆盖（Production 不读 localStorage）。
 */
export const getAcceptedIdentityIssuers = (): string[] => {
  if (overrideIssuers) return [...overrideIssuers]
  const merged = new Set<string>()
  for (const value of getDefaultAcceptedIssuers()) merged.add(value)
  if (isDevRuntime()) {
    for (const value of readDevOverrideIssuers()) merged.add(value)
  }
  return [...merged]
}

/** 某值（归一化后）是否属于已接受 issuer 列表 */
export const isAcceptedIdentityIssuer = (value: unknown): boolean => {
  const normalized = normalizeIssuerValue(value)
  if (!normalized) return false
  return getAcceptedIdentityIssuers().includes(normalized)
}

/**
 * 解码三段式 JWT 的 payload（**不验签**，本地校验专用）。
 * 任何失败（段数不对 / 非 base64url / 非 JSON 对象）返回 null，绝不抛错。
 */
export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const decoded = globalThis.atob(padded)
    // UTF-8 安全解码（payload 可能含非 ASCII 字符）
    const json = decodeURIComponent(
      Array.from(decoded, (ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    )
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export interface IssuerCheckOk {
  ok: true
  /** 归一化后的 issuer（canonical 形式） */
  issuer: string
}

export interface IssuerCheckRejected {
  ok: false
  reason: 'undecodable' | 'missing_iss' | 'unknown_issuer'
  /** 用户/诊断可读的拒绝原因（不含完整令牌） */
  message: string
}

export type IssuerCheckResult = IssuerCheckOk | IssuerCheckRejected

/**
 * 校验令牌 issuer 是否属于已接受集合（#1171 T13 客户端侧）。
 *
 * 失败一律显式拒绝（fail closed）：
 *   - undecodable：令牌无法解码为 JSON payload；
 *   - missing_iss：缺少 iss claim（不得当作「无 issuer 也放行」）；
 *   - unknown_issuer：iss 不在已接受列表（迁移期新旧 issuer 均需在列表中登记）。
 * 消息为可读文案，含实际 issuer 值（URL，非秘密），便于归因；绝不包含完整令牌。
 */
export const verifyIdentityTokenIssuer = (token: string): IssuerCheckResult => {
  const payload = decodeJwtPayload(token)
  if (!payload) {
    return { ok: false, reason: 'undecodable', message: '身份令牌无法解析（issuer 校验失败），已拒绝' }
  }
  const issRaw = payload['iss']
  if (typeof issRaw !== 'string' || !issRaw.trim()) {
    return { ok: false, reason: 'missing_iss', message: '身份令牌缺少签发者（iss）声明，已拒绝' }
  }
  const normalized = normalizeIssuerValue(issRaw)
  if (normalized && getAcceptedIdentityIssuers().includes(normalized)) {
    return { ok: true, issuer: normalized }
  }
  return {
    ok: false,
    reason: 'unknown_issuer',
    message: `未知的身份签发者：${issRaw.trim().slice(0, 200)}（不在已接受 issuer 列表，已拒绝）`
  }
}
