/**
 * #622 跨语言 canonical 签名规范（Node 侧实现）。
 *
 * 必须与 Rust `src-tauri/src/identity/canonical.rs` 逐字节一致，由 golden fixture
 * （tests/api/app-canonical.test.ts 与 Rust 测试共享同一 JSON）双向验证：
 * - UTF-8 编码；
 * - `\n` LF 换行；字段固定顺序；**最后一行后有一个 LF**（canonical 文本以 `\n` 结尾）；
 * - 除 `student_name` 外，字段值只允许 RFC 3986 unreserved 字符（A-Za-z0-9._~-，长度 1..=128）；
 * - `issued_at` 为 UNIX 秒（正整数，≤ 4102444800）；
 * - scope 规范化：空白分割 → 去空 → 去重 → 字典序 → 单空格 join → SHA-256 → base64url；
 * - Ed25519 直接对 canonical 字节签名（禁止对 JSON.stringify 后文本签名）。
 */
import { sha256Base64url } from '../../security/hash.js'

export const AUTH_VERSION = 'MINI-HBUT-AUTH-V1'
export const ENROLL_VERSION = 'MINI-HBUT-ENROLL-V1'
export const DEVICE_API_VERSION = 'MINI-HBUT-DEVICE-API-V1'

/** approve 决策值（V1 只支持 approve；deny 不需要设备签名） */
export const DECISION_APPROVE = 'approve'

/** 数字字段最大值（UNIX 秒；2100-01-01 之前均合法，用于拒绝极端输入） */
export const MAX_UNIX_SECONDS = 4102444800

/** token 字段合法字符集（RFC 3986 unreserved），长度 1..=128 */
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/

/** 校验协议 token 字段值（与 Rust assert_token_field 一致） */
export function assertTokenField(name: string, value: string): void {
  if (!TOKEN_PATTERN.test(value)) {
    throw new Error(`${name} 含协议外字符或长度非法`)
  }
}

/** Cc（Control）类别：C0 + DEL + C1，与 Rust char::is_control 一致 */
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f-\u009f]/

/** 校验 UTF-8 展示字段（student_name）：无控制字符、码点数 ≤ 64（与 Rust chars().count() 一致） */
export function assertDisplayField(name: string, value: string): void {
  if ([...value].length > 64 || CONTROL_CHAR_PATTERN.test(value)) {
    throw new Error(`${name} 含控制字符或超长`)
  }
}

/** 校验 UNIX 秒字段（与 Rust assert_issued_at 一致） */
export function assertIssuedAt(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_UNIX_SECONDS) {
    throw new Error('issued_at 超出合法范围')
  }
}

/**
 * scope 规范化：空白分割 → trim → 去空 → 去重 → 字典序。
 * Rust 侧用 BTreeSet（码点序）；Node sort() 为 UTF-16 序 —— V1 scope 白名单
 * （openid/profile/student.identity/offline_access）均为 ASCII，两者结果一致。
 */
export function normalizeScopes(scopes: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of scopes) {
    for (const part of raw.split(/\s+/)) {
      if (part.length > 0) {
        seen.add(part)
      }
    }
  }
  return [...seen].sort()
}

/** scope_hash = sha256(规范化 scope 单空格 join) base64url */
export function scopeHash(normalizedScopes: readonly string[]): string {
  return sha256Base64url(normalizedScopes.join(' '))
}

/** MINI-HBUT-AUTH-V1 输入（字段来自服务端存储的 AuthRequest 快照，不信任客户端） */
export interface AuthCanonicalInput {
  requestId: string
  challenge: string
  clientId: string
  scopeHash: string
  deviceId: string
  decision: string
  issuedAt: number
  nonce: string
}

/** 构建 approve canonical 文本（固定字段顺序 + 末尾 LF；与 Rust build_auth_canonical 逐字节一致） */
export function buildAuthCanonical(input: AuthCanonicalInput): string {
  assertTokenField('request_id', input.requestId)
  assertTokenField('challenge', input.challenge)
  assertTokenField('client_id', input.clientId)
  assertTokenField('scope_hash', input.scopeHash)
  assertTokenField('device_id', input.deviceId)
  assertTokenField('decision', input.decision)
  assertTokenField('nonce', input.nonce)
  assertIssuedAt(input.issuedAt)
  if (input.decision !== DECISION_APPROVE) {
    throw new Error(`decision 只支持 ${DECISION_APPROVE}`)
  }
  return [
    AUTH_VERSION,
    `request_id=${input.requestId}`,
    `challenge=${input.challenge}`,
    `client_id=${input.clientId}`,
    `scope_hash=${input.scopeHash}`,
    `device_id=${input.deviceId}`,
    `decision=${input.decision}`,
    `issued_at=${input.issuedAt}`,
    `nonce=${input.nonce}`,
    '', // 末尾空串 → join('\n') 产生最后一个 '\n'
  ].join('\n')
}

/** MINI-HBUT-ENROLL-V1 输入 */
export interface EnrollCanonicalInput {
  challenge: string
  publicKeyFingerprint: string
  studentId: string
  studentName: string
  issuedAt: number
  nonce: string
}

/** 构建 enrollment assertion canonical 文本（末尾 LF；student_name 允许 UTF-8 可见字符） */
export function buildEnrollCanonical(input: EnrollCanonicalInput): string {
  assertTokenField('challenge', input.challenge)
  assertTokenField('public_key_fingerprint', input.publicKeyFingerprint)
  assertTokenField('student_id', input.studentId)
  assertDisplayField('student_name', input.studentName)
  assertTokenField('nonce', input.nonce)
  assertIssuedAt(input.issuedAt)
  return [
    ENROLL_VERSION,
    `challenge=${input.challenge}`,
    `public_key_fingerprint=${input.publicKeyFingerprint}`,
    `student_id=${input.studentId}`,
    `student_name=${input.studentName}`,
    `issued_at=${input.issuedAt}`,
    `nonce=${input.nonce}`,
    '',
  ].join('\n')
}

/** MINI-HBUT-DEVICE-API-V1 输入（设备签名 API 认证） */
export interface DeviceApiCanonicalInput {
  /** 请求方法（服务端从请求自身取值，统一大写，防中间人改写） */
  method: string
  /** 请求路径（服务端从请求自身取值，不含 query） */
  path: string
  deviceId: string
  issuedAt: number
  nonce: string
}

/** 构建设备签名 API canonical 文本（与 Rust build_device_api_canonical 一致） */
export function buildDeviceApiCanonical(input: DeviceApiCanonicalInput): string {
  const method = input.method.trim().toUpperCase()
  if (method.length === 0 || method.length > 16) {
    throw new Error('method 非法')
  }
  if (input.path.length === 0 || input.path.length > 256 || input.path.startsWith('?')) {
    throw new Error('path 非法')
  }
  assertTokenField('device_id', input.deviceId)
  assertTokenField('nonce', input.nonce)
  assertIssuedAt(input.issuedAt)
  return [
    DEVICE_API_VERSION,
    `method=${method}`,
    `path=${input.path}`,
    `device_id=${input.deviceId}`,
    `issued_at=${input.issuedAt}`,
    `nonce=${input.nonce}`,
    '',
  ].join('\n')
}

/**
 * canonical 紧凑 JWK JSON（手工拼接：字段顺序 kty,crv,x 与无空格格式固定）。
 * 与 Rust canonical_jwk_json 逐字节一致，供 fingerprint 与 enroll canonical 使用。
 */
export function canonicalJwkJson(jwk: { kty: string; crv: string; x: string }): string {
  return `{"kty":"${jwk.kty}","crv":"${jwk.crv}","x":"${jwk.x}"}`
}

/** 设备指纹 = sha256(canonical 紧凑 JWK JSON) base64url（与 Rust DeviceKey::fingerprint 一致） */
export function jwkFingerprint(jwk: { kty: string; crv: string; x: string }): string {
  return sha256Base64url(canonicalJwkJson(jwk))
}
