/**
 * audit metadata 序列化器（#619）。
 *
 * 目标：拒绝敏感字段落库。docs/issues/619.json 明确禁止保存：
 * - authorization code；
 * - access/refresh token、id_token；
 * - client_secret；
 * - handoff secret；
 * - device private key；
 * - HBUT 密码/Cookie；
 * - 完整 Authorization header。
 *
 * 实现：递归扫描对象键（含嵌套/数组），命中敏感键名时：
 * - strict 模式（默认）：抛 AuditSensitiveFieldError，整体拒绝落库；
 * - 非 strict 模式：用 '[REDACTED]' 替换（供必须记录场景）。
 *
 * 另对字符串值做轻量形态检测（Bearer token、eyJ 开头 JWT 形态），
 * 防止"无害键名 + 敏感值"绕过。
 */
import { AuditSensitiveFieldError } from '../../domain/errors.js'

const SENSITIVE_KEYS = new Set([
  'secret', 'client_secret', 'clientsecret', 'token', 'access_token', 'accesstoken',
  'refresh_token', 'refreshtoken', 'id_token', 'idtoken', 'authorization_code',
  'auth_code', 'password', 'passwd', 'pwd', 'cookie', 'cookies', 'handoff',
  'handoff_secret', 'private_key', 'privatekey', 'api_key', 'apikey', 'authorization',
  'code_verifier', 'credential', 'credentials', 'session_id', 'device_private_key',
])

/** 键名黑名单正则（覆盖 *_secret / *_token / *_code / *_password 等后缀） */
const SENSITIVE_KEY_PATTERN = /(^|_|-)(secret|token|password|passwd|pwd|cookie|handoff|authorization|privatekey|apikey|credential)(s)?($|_|-)/i
const SENSITIVE_PREFIX_PATTERN = /^authorization[_-]/i

/** 值形态检测：Bearer 前缀 / JWT（eyJ…） */
const SENSITIVE_VALUE_PATTERN = /(^Bearer\s+|^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$)/

export { AuditSensitiveFieldError } from '../../domain/errors.js'

export interface AuditSerializationResult {
  metadata: Record<string, unknown>
  redacted: string[]
}

function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_KEYS.has(key)) {
    return true
  }
  if (SENSITIVE_PREFIX_PATTERN.test(key)) {
    return true
  }
  return SENSITIVE_KEY_PATTERN.test(key)
}

function isSensitiveValue(value: unknown): boolean {
  return typeof value === 'string' && SENSITIVE_VALUE_PATTERN.test(value)
}

/**
 * 递归校验并（可选）脱敏 metadata。
 * strict=true：发现任何敏感字段即抛错（推荐默认）；
 * strict=false：替换为 '[REDACTED]'。
 */
export function sanitizeAuditMetadata(
  input: unknown,
  opts: { strict?: boolean } = {},
): AuditSerializationResult {
  const strict = opts.strict ?? true
  const redacted: string[] = []

  function walk(value: unknown, path: string): unknown {
    if (Array.isArray(value)) {
      return value.map((item, i) => walk(item, `${path}[${i}]`))
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const childPath = path ? `${path}.${key}` : key
        if (isSensitiveKey(key)) {
          if (strict) {
            throw new AuditSensitiveFieldError(childPath)
          }
          redacted.push(childPath)
          out[key] = '[REDACTED]'
          continue
        }
        if (isSensitiveValue(item)) {
          if (strict) {
            throw new AuditSensitiveFieldError(`${childPath}（值形态疑似凭据）`)
          }
          redacted.push(childPath)
          out[key] = '[REDACTED]'
          continue
        }
        out[key] = walk(item, childPath)
      }
      return out
    }
    return value
  }

  const walked = walk(input ?? {}, '')
  if (walked === null || typeof walked !== 'object' || Array.isArray(walked)) {
    throw new AuditSensitiveFieldError('$root（metadata 必须是对象）')
  }
  return { metadata: walked as Record<string, unknown>, redacted }
}
