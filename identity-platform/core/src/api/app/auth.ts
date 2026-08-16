/**
 * App API 认证（#622）。
 *
 * 两类凭据：
 * 1. `Authorization: Handoff <secret>` —— 短期接力凭据（绑定 auth_request 的 HMAC hash）。
 *    - 用于 enrollment challenge / enroll（防匿名无限创建）与 approve（#617 边界 12）；
 *    - 比对用 constant-time compare（verify.ts）。
 * 2. `Authorization: Device <device_id> <issued_at> <nonce> <signature>` —— 设备签名 API
 *    （MINI-HBUT-DEVICE-API-V1，issue #622「device-signed API」路径）。
 *    - 用于 GET /devices/me、POST /devices/:id/revoke（Rust client 已实现该方案）；
 *    - method/path 由服务端从请求自身取值，防中间人改写；
 *    - 验签成功后 touch last_seen（契约：只在签名验证成功后更新）。
 *
 * 安全约定：任何失败都只返回业务错误，不泄露 secret/签名材料。
 */
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { parseJsonb } from '../../db/types.js'
import { findActiveDeviceById, touchDeviceLastSeen, type DeviceRow } from '../../db/repos/devices.repo.js'
import type { AuthRequestRow } from '../../db/repos/auth-requests.repo.js'
import { hmacSha256Base64url } from '../../security/hash.js'
import { assertEd25519PublicJwk } from '../../domain/devices.js'
import { touchUserLastActive } from '../../db/repos/users.repo.js'
import { buildDeviceApiCanonical } from './canonical.js'
import { constantTimeEqual, verifyEd25519 } from './verify.js'
import { DeviceAuthError, InvalidHandoffError } from './errors.js'

/** Handoff 方案名（Authorization 头 scheme） */
export const HANDOFF_SCHEME = 'Handoff'
/** 设备签名方案名（Authorization 头 scheme） */
export const DEVICE_SCHEME = 'Device'

export interface AppAuthDeps {
  sql: SqlExecutor
  handoffHmacKey: string | undefined
}

/** 解析 `Scheme <value>` 形式的 Authorization 头；格式非法返回 null */
export function parseAuthorizationHeader(
  ctx: RouterContext,
): { scheme: string; value: string } | null {
  const header = ctx.get('authorization')
  if (!header) {
    return null
  }
  const space = header.indexOf(' ')
  if (space <= 0 || space === header.length - 1) {
    return null
  }
  return { scheme: header.slice(0, space).trim(), value: header.slice(space + 1).trim() }
}

/** 校验请求携带的 Handoff secret 与给定请求匹配（constant-time；HMAC key 缺失 fail closed） */
export function verifyHandoffForRequest(
  ctx: RouterContext,
  deps: AppAuthDeps,
  request: AuthRequestRow,
): boolean {
  const parsed = parseAuthorizationHeader(ctx)
  if (!parsed || parsed.scheme.toLowerCase() !== HANDOFF_SCHEME.toLowerCase()) {
    return false
  }
  const expected = hmacSha256Base64url(deps.handoffHmacKey, parsed.value)
  return constantTimeEqual(expected, request.handoff_secret_hash)
}

/**
 * 按 handoff secret 查找有效（未过期）的 auth_request。
 * 用于 enrollment challenge / enroll：把一次性 challenge 的创建绑定到当前活跃的
 * Web 接力会话，防止完全匿名无限创建 challenge（#622「Server flow」步骤 1）。
 */
export async function findRequestByHandoffSecret(
  sql: SqlExecutor,
  handoffHmacKey: string | undefined,
  secret: string,
): Promise<AuthRequestRow | null> {
  const expected = hmacSha256Base64url(handoffHmacKey, secret)
  const result = await sql.query<AuthRequestRow>(
    `SELECT * FROM auth_requests
      WHERE handoff_secret_hash = $1 AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1`,
    [expected],
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  row.requested_scopes = parseJsonb<string[]>(row.requested_scopes)
  return row
}

export interface ClockSkewConfig {
  /** issued_at 允许偏差（秒），默认 60 */
  skewSeconds: number
}

/** 校验 issued_at 在 [now - skew, now + skew] 内 */
export function assertFreshIssuedAt(issuedAt: number, skewSeconds: number): boolean {
  if (!Number.isInteger(issuedAt)) {
    return false
  }
  const now = Math.floor(Date.now() / 1000)
  return Math.abs(now - issuedAt) <= skewSeconds
}

/**
 * 设备签名认证（Device 方案）：
 * 1. 解析头（5 段）；2. 设备存在且 active；3. issued_at 时间窗；
 * 4. 用请求自身 method/path 重建 canonical；5. Ed25519 验签。
 * 验签成功后 touch last_seen / last_active（契约要求只在签名验证成功后更新）。
 * 失败抛 DeviceAuthError（401）。
 */
export async function authenticateDeviceRequest(
  ctx: RouterContext,
  deps: AppAuthDeps & ClockSkewConfig,
): Promise<DeviceRow> {
  const { sql } = deps
  const parsed = parseAuthorizationHeader(ctx)
  if (!parsed || parsed.scheme.toLowerCase() !== DEVICE_SCHEME.toLowerCase()) {
    throw new DeviceAuthError('缺少 Device 认证头')
  }
  const parts = parsed.value.split(' ')
  if (parts.length !== 4) {
    throw new DeviceAuthError('Device 认证头格式非法')
  }
  const [deviceId, issuedAtRaw, nonce, signature] = parts as [string, string, string, string]
  if (!deviceId || !issuedAtRaw || !nonce || !signature) {
    throw new DeviceAuthError('Device 认证头字段缺失')
  }
  const issuedAt = Number(issuedAtRaw)
  if (!Number.isInteger(issuedAt)) {
    throw new DeviceAuthError('issued_at 非法')
  }
  const device = await findActiveDeviceById(sql, deviceId)
  if (!device) {
    // 不存在/非 active/已吊销：统一 401，不泄露设备状态
    throw new DeviceAuthError('设备不存在或不可用')
  }
  if (!assertFreshIssuedAt(issuedAt, deps.skewSeconds)) {
    throw new DeviceAuthError('签名时间超出允许偏差')
  }

  // method/path 一律取请求自身值（防中间人改写 canonical）
  const canonical = buildDeviceApiCanonical({
    method: ctx.method,
    path: ctx.path,
    deviceId: device.id,
    issuedAt,
    nonce,
  })
  const jwk = device.public_key_jwk as { kty: 'OKP'; crv: 'Ed25519'; x: string }
  try {
    assertEd25519PublicJwk(jwk)
  } catch {
    throw new DeviceAuthError('设备公钥数据异常')
  }
  if (!verifyEd25519(jwk, canonical, signature)) {
    throw new DeviceAuthError('签名验证失败')
  }

  // 签名验证成功后才更新活跃时间（#619 契约：last_seen_at 只在签名验证成功后更新）
  await touchDeviceLastSeen(sql, device.id)
  if (device.user_id) {
    await touchUserLastActive(sql, device.user_id)
  }
  return device
}
