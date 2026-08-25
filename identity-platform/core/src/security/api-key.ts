/**
 * 账户级 API Key 生成 / 校验（#688，冻结契约 v1）。
 *
 * Key 形态（逐字一致）：
 *   mhbat_<8位小写hex>_<43位base64url>
 *   即 "mhbat_" + 8 hex prefix + "_" + 32 字节随机 base64url（无填充），
 *   总长 58 字符。prefix 列存 "mhbat_<8位hex>"（14 字符）。
 *
 * 存储约定：
 * - 库中只存 sha256Base64url(整串)，绝不存明文；
 * - 明文只在签发响应中出现一次，服务端无法找回。
 *
 * 校验约定（失败细分三种领域错误，且不泄露存在性/状态给未持密者）：
 *   1) 格式非法 / prefix 无对应行 / hash 不匹配 → API_KEY_INVALID(401)；
 *   2) hash 匹配但 status=revoked             → API_KEY_REVOKED(403)；
 *   3) hash 匹配但已过 expires_at              → API_KEY_EXPIRED(403)。
 * 顺序刻意「先验 hash、后看状态」：未证明持有 secret 前，不泄露任何状态信息。
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { SqlExecutor } from '../db/types.js'
import { hmacSha256Base64url } from './hash.js'
import { findApiKeyByPrefix, type ApiKeyRow } from '../db/repos/api-keys.repo.js'
import { ApiKeyExpiredError, ApiKeyInvalidError, ApiKeyRevokedError } from '../domain/errors.js'

/** Key 固定前缀（契约 v1） */
export const API_KEY_PREFIX = 'mhbat_'

/** hex prefix 长度（8 位小写 hex = 32-bit 随机） */
const HEX_PREFIX_LENGTH = 8

/** 随机主体字节数（32 字节 → base64url 43 字符） */
const SECRET_BYTES = 32

/** 整串总长：6("mhbat_") + 8(hex) + 1("_") + 43(base64url) */
export const API_KEY_FULL_LENGTH = API_KEY_PREFIX.length + HEX_PREFIX_LENGTH + 1 + 43

/** Key 完整形态（整串）正则：mhbat_ + 8 小写 hex + _ + 43 位 base64url */
const API_KEY_FULL_RE = /^mhbat_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/

export interface GeneratedApiKey {
  /** 整串明文（只返回一次，绝不入库/日志） */
  full: string
  /** 入库前缀 "mhbat_<8hex>"（14 字符，UNIQUE） */
  prefix: string
  /** HMAC-SHA256(整串, 服务端 pepper)，入库值 */
  hash: string
}

/**
 * 存储哈希 pepper 的解析来源：
 *   1) 注入 env 的 IDENTITY_CLIENT_SECRET_KEK（测试/装配优先，如 TEST_KEK）；
 *   2) 进程 env 同名变量（生产运行时）；
 *   3) production 缺失/不足 32 字节 → fail closed 抛错；
 *      非生产回退开发常量并告警（严禁用于生产）。
 */
export function resolveApiKeyPepper(env?: Record<string, string | undefined>): string {
  const injected = env?.IDENTITY_CLIENT_SECRET_KEK
  if (injected && Buffer.from(injected, 'utf8').length >= 32) {
    return injected
  }
  const fromProcess = process.env.IDENTITY_CLIENT_SECRET_KEK
  if (fromProcess && Buffer.from(fromProcess, 'utf8').length >= 32) {
    return fromProcess
  }
  if (process.env.IDENTITY_ENVIRONMENT === 'production') {
    throw new Error(
      '[security] IDENTITY_CLIENT_SECRET_KEK 缺失或不足 32 字节，API Key 无法安全存储（fail closed）',
    )
  }
  // eslint-disable-next-line no-console
  console.error('[security] 开发/测试环境使用固定 API Key pepper——严禁用于生产')
  return 'mini-hbut-dev-api-key-pepper::fallback::0000'
}

/**
 * 生成一把新 Key（CSPRNG；禁止 Math.random 参与任何密钥材料）。
 * prefix 取自独立随机源，与主体互不派生；UNIQUE 冲突由调用方重试。
 *
 * 存储哈希用 HMAC-SHA256(pepper)：对高熵随机 Key 而言防碰撞足够，
 * 引入服务端 pepper 同时满足 CodeQL 对「快速哈希存密码类凭据」的红线（#688）。
 */
export function generateApiKey(pepper: string): GeneratedApiKey {
  const hexPrefix = randomBytes(HEX_PREFIX_LENGTH / 2).toString('hex')
  const prefix = `${API_KEY_PREFIX}${hexPrefix}`
  const body = randomBytes(SECRET_BYTES).toString('base64url')
  const full = `${prefix}_${body}`
  return { full, prefix, hash: hmacSha256Base64url(pepper, full) }
}

/**
 * 校验 Bearer 凭据并返回对应 api_keys 行（含 user_id，供后续 owner 解析）。
 * 失败按契约细分三种 DomainError；成功后由调用方负责 touch last_used_at。
 */
export async function verifyApiKey(
  sql: SqlExecutor,
  pepper: string,
  token: string,
): Promise<ApiKeyRow> {
  // 1) 形态校验：任何格式偏差一律 invalid（不区分缺头/截断/篡改）
  if (token.length !== API_KEY_FULL_LENGTH || !API_KEY_FULL_RE.test(token)) {
    throw new ApiKeyInvalidError()
  }
  const prefix = token.slice(0, API_KEY_PREFIX.length + HEX_PREFIX_LENGTH)
  const row = await findApiKeyByPrefix(sql, prefix)
  if (!row) {
    throw new ApiKeyInvalidError()
  }
  // 2) constant-time 比对 HMAC-SHA256(整串, pepper)；长度相同（43 字符）才进比对
  const computed = Buffer.from(hmacSha256Base64url(pepper, token), 'utf8')
  const stored = Buffer.from(row.secret_hash, 'utf8')
  if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) {
    throw new ApiKeyInvalidError()
  }
  // 3) 已证明持有 secret，才允许看到状态细节
  if (row.status === 'revoked') {
    throw new ApiKeyRevokedError()
  }
  if (row.expires_at !== null && row.expires_at.getTime() <= Date.now()) {
    throw new ApiKeyExpiredError()
  }
  return row
}
