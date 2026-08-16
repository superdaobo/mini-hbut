/**
 * 日志敏感值脱敏（#626 Logging / Privacy）。
 *
 * 结构化日志只允许记录：correlation_id / event_type / route / status_code /
 * duration / client_id / 内部 id 或哈希 / error_code。禁止：password、cookie、
 * Authorization header、code/token/refresh token、client_secret、private JWK、
 * handoff、完整 student_id、请求体 dump。
 *
 * 本模块提供两层保险：
 * 1. 白名单意识：调用方只把允许的字段传给 logger（logger.ts 已按此约定）；
 * 2. 兜底脱敏：所有 string 字段在落盘前过 redactSensitiveText，即使未来
 *    有人误加字段，敏感模式也会被替换为 [redacted]（纵深防御）。
 */
export const REDACTED = '[redacted]'

/** 敏感键名（值一律脱敏；大小写不敏感） */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-identity-handoff',
  'x-identity-service-token',
  'x-admin-subject',
  'x-developer-subject',
  'client_secret',
  'clientsecret',
  'password',
  'passwd',
  'pwd',
  'refresh_token',
  'access_token',
  'id_token',
  'token',
  'handoff',
  'jwk',
  'kek',
  'private_key',
  'student_id',
  'studentid',
  'session_secret',
  'service_token',
]

/** 值内嵌敏感模式（替换整段，保留上下文前缀便于排查） */
const VALUE_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  // Authorization 头
  { name: 'authorization', regex: /(authorization\s*[:=]\s*)(?:bearer\s+|basic\s+)?[A-Za-z0-9._~+/=-]{8,}/gi },
  // 敏感头名
  { name: 'handoff header', regex: /(x-identity-handoff\s*[:=]\s*)[A-Za-z0-9_-]{8,}/gi },
  { name: 'service token header', regex: /(x-identity-service-token\s*[:=]\s*)[A-Za-z0-9_-]{8,}/gi },
  // query / body 中的凭据参数
  { name: 'client_secret param', regex: /(client_secret["']?\s*[:=]\s*["']?)[^"'\s,&]{6,}/gi },
  { name: 'code param', regex: /(\bcode["']?\s*[:=]\s*["']?)[A-Za-z0-9._~-]{10,}/gi },
  { name: 'refresh_token param', regex: /(refresh_token["']?\s*[:=]\s*["']?)[A-Za-z0-9._~-]{10,}/gi },
  { name: 'access_token param', regex: /(access_token["']?\s*[:=]\s*["']?)[A-Za-z0-9._~-]{10,}/gi },
  // handoff fragment（URL hash 中的长随机串；# 前缀保留便于定位）
  { name: 'handoff fragment', regex: /(#)([A-Za-z0-9_-]{20,})/g },
  // 完整学号（仅在 student_id 上下文中，避免裸数字误伤）
  { name: 'student_id', regex: /(student_?id["']?\s*[:=]\s*["']?)[0-9]{6,12}/gi },
]

/**
 * 把文本中的敏感值替换为占位符。
 * 纯函数、可单测；幂等（已替换的内容不会再匹配）。
 */
export function redactSensitiveText(text: string): string {
  if (!text) {
    return text
  }
  let result = text
  for (const pattern of VALUE_PATTERNS) {
    pattern.regex.lastIndex = 0
    result = result.replace(pattern.regex, (match, ...args) => {
      // 第一个参数若为字符串则是捕获组 1（上下文前缀），保留前缀只替换值
      const prefix = typeof args[0] === 'string' ? args[0] : ''
      if (prefix && prefix.length < match.length) {
        return `${prefix}${REDACTED}`
      }
      return REDACTED
    })
  }
  return result
}

/** 按字段名判断是否属于敏感键（值整体脱敏） */
export function isSensitiveFieldKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[_-]/g, '')
  return SENSITIVE_KEYS.some((k) => lower.includes(k.replace(/[_-]/g, '').toLowerCase()))
}

/**
 * 对日志字段对象做递归脱敏：
 * - 键命中敏感键名 → 整体替换；
 * - string 值 → 模式脱敏；
 * - 嵌套对象/数组递归处理（防未来误传结构化敏感值）。
 */
export function redactLogFields(fields: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!fields) {
    return fields
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (isSensitiveFieldKey(key)) {
      out[key] = REDACTED
      continue
    }
    if (typeof value === 'string') {
      out[key] = redactSensitiveText(value)
    } else if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Error)) {
      out[key] = redactLogFields(value as Record<string, unknown>)
    } else {
      out[key] = value
    }
  }
  return out
}
