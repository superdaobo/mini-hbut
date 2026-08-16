/**
 * 敏感值日志脱敏（#630 起，#626 扩展为通用脱敏）。
 *
 * 约定（issue #630）：handoff 不得出现在服务端日志；
 * #626：日志只允许白名单字段，任何 string 落盘前先过 redactSensitiveText，
 * 兜底拦截 Authorization / client_secret / code / refresh_token / 学号等。
 * 当前 BFF 不记录任何请求头；本工具作为兜底——未来接入结构化日志时，
 * 先对日志文本调用 redactSensitiveText 再落盘（或对 header 名整体忽略）。
 */

export const REDACTED_PLACEHOLDER = '[redacted]'

/** 值内嵌敏感模式（与 core/src/security/redact.ts 同规则集，独立实现避免跨包依赖） */
const VALUE_PATTERNS: ReadonlyArray<{ regex: RegExp }> = [
  // Authorization 头
  { regex: /(authorization\s*[:=]\s*)(?:bearer\s+|basic\s+)?[A-Za-z0-9._~+/=-]{8,}/gi },
  // 敏感头名
  { regex: /(x-identity-handoff\s*[:=]\s*)[A-Za-z0-9_-]{8,}/gi },
  { regex: /(x-identity-service-token\s*[:=]\s*)[A-Za-z0-9_-]{8,}/gi },
  // query / body 中的凭据参数
  { regex: /(client_secret["']?\s*[:=]\s*["']?)[^"'\s,&]{6,}/gi },
  { regex: /(\bcode["']?\s*[:=]\s*["']?)[A-Za-z0-9._~-]{10,}/gi },
  { regex: /(refresh_token["']?\s*[:=]\s*["']?)[A-Za-z0-9._~-]{10,}/gi },
  { regex: /(access_token["']?\s*[:=]\s*["']?)[A-Za-z0-9._~-]{10,}/gi },
  // handoff fragment（URL hash 中的长随机串；# 前缀保留便于定位）
  { regex: /(#)([A-Za-z0-9_-]{20,})/g },
  // 完整学号（仅在 student_id 上下文中，避免裸数字误伤）
  { regex: /(student_?id["']?\s*[:=]\s*["']?)[0-9]{6,12}/gi },
]

/** 通用敏感值脱敏：替换为占位符，保留上下文前缀（如 "authorization: "） */
export function redactSensitiveText(text: string): string {
  if (!text) {
    return text
  }
  let result = text
  for (const { regex } of VALUE_PATTERNS) {
    regex.lastIndex = 0
    result = result.replace(regex, (match, ...args) => {
      const prefix = typeof args[0] === 'string' ? args[0] : ''
      if (prefix && prefix.length < match.length) {
        return `${prefix}${REDACTED_PLACEHOLDER}`
      }
      return REDACTED_PLACEHOLDER
    })
  }
  return result
}

/** 把文本中的 handoff 原值替换为占位符（#630 语义保留） */
export function redactHandoff(text: string, handoff: string): string {
  if (!handoff) {
    return text
  }
  return redactSensitiveText(text.split(handoff).join(REDACTED_PLACEHOLDER))
}
