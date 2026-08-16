/**
 * devices / device_enrollment_challenges 仓储（#619）。
 * 设备只存 Ed25519 公钥 JWK；challenge 只存 hash、一次性、短时。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'

export type DeviceStatus = 'pending' | 'active' | 'revoked'
export type DevicePlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'

export interface DeviceRow extends QueryResultRow {
  id: string
  user_id: string
  public_key_jwk: unknown
  key_algorithm: string
  public_key_fingerprint: string
  platform: DevicePlatform
  app_version: string | null
  device_name: string
  status: DeviceStatus
  created_at: Date
  activated_at: Date | null
  last_seen_at: Date | null
  revoked_at: Date | null
  revoked_reason: string | null
}

export async function insertDevice(sql: SqlExecutor, device: {
  id: string
  user_id: string
  publicKeyJwk: unknown
  publicKeyFingerprint: string
  platform: DevicePlatform
  appVersion?: string | null
  deviceName: string
  status?: DeviceStatus
}): Promise<void> {
  await sql.query(
    `INSERT INTO devices (
       id, user_id, public_key_jwk, key_algorithm, public_key_fingerprint,
       platform, app_version, device_name, status
     ) VALUES ($1, $2, $3::jsonb, 'Ed25519', $4, $5, $6, $7, $8)`,
    [
      device.id,
      device.user_id,
      JSON.stringify(device.publicKeyJwk),
      device.publicKeyFingerprint,
      device.platform,
      device.appVersion ?? null,
      device.deviceName,
      device.status ?? 'pending',
    ],
  )
}

export async function findDeviceById(sql: SqlExecutor, id: string): Promise<DeviceRow | null> {
  const result = await sql.query<DeviceRow>('SELECT * FROM devices WHERE id = $1', [id])
  return result.rows[0] ?? null
}

export async function findActiveDeviceById(
  sql: SqlExecutor,
  id: string,
): Promise<DeviceRow | null> {
  const result = await sql.query<DeviceRow>(
    "SELECT * FROM devices WHERE id = $1 AND status = 'active'",
    [id],
  )
  return result.rows[0] ?? null
}

export async function findDeviceByFingerprint(
  sql: SqlExecutor,
  fingerprint: string,
): Promise<DeviceRow | null> {
  const result = await sql.query<DeviceRow>(
    'SELECT * FROM devices WHERE public_key_fingerprint = $1',
    [fingerprint],
  )
  return result.rows[0] ?? null
}

/**
 * 设备状态迁移（条件更新）：
 * - pending → active（激活）
 * - pending/active → revoked（吊销）
 * revoked 设备无法再激活：activate 的条件 status='pending' 会失败。
 * 返回是否更新成功。
 */
export async function setDeviceStatus(
  sql: SqlExecutor,
  id: string,
  status: DeviceStatus,
  opts: { activatedAt?: Date; revokedAt?: Date; revokedReason?: string | null } = {},
): Promise<boolean> {
  if (status === 'active') {
    const result = await sql.query(
      `UPDATE devices
         SET status = 'active', activated_at = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [id, opts.activatedAt ?? new Date()],
    )
    return (result.rowCount ?? 0) === 1
  }
  if (status === 'revoked') {
    const result = await sql.query(
      `UPDATE devices
         SET status = 'revoked', revoked_at = $2, revoked_reason = $3, updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'active')`,
      [id, opts.revokedAt ?? new Date(), opts.revokedReason ?? null],
    )
    return (result.rowCount ?? 0) === 1
  }
  // 回到 pending 不合法（设备一旦激活/吊销不可回退），直接拒绝
  return false
}

/** 仅在经过签名验证的请求后更新 last_seen_at */
export async function touchDeviceLastSeen(sql: SqlExecutor, id: string): Promise<void> {
  await sql.query('UPDATE devices SET last_seen_at = NOW() WHERE id = $1', [id])
}

export async function listDevicesByUser(sql: SqlExecutor, userId: string): Promise<DeviceRow[]> {
  const result = await sql.query<DeviceRow>(
    'SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at',
    [userId],
  )
  return result.rows
}

// ---------------------------------------------------------------------------
// device_enrollment_challenges
// ---------------------------------------------------------------------------

export interface EnrollmentChallengeRow extends QueryResultRow {
  id: string
  challenge_hash: string
  purpose: string
  expires_at: Date
  consumed_at: Date | null
  created_at: Date
}

export async function insertEnrollmentChallenge(sql: SqlExecutor, challenge: {
  id: string
  challengeHash: string
  purpose: string
  expiresAt: Date
}): Promise<void> {
  await sql.query(
    `INSERT INTO device_enrollment_challenges (id, challenge_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [challenge.id, challenge.challengeHash, challenge.purpose, challenge.expiresAt],
  )
}

/**
 * 一次性消费 challenge：hash 匹配 + 未过期 + 未消费 三条件同时成立才成功。
 * 条件更新保证并发下只有一个调用能消费成功。
 */
export async function consumeEnrollmentChallenge(
  sql: SqlExecutor,
  challengeHash: string,
): Promise<boolean> {
  const result = await sql.query(
    `UPDATE device_enrollment_challenges
        SET consumed_at = NOW()
      WHERE challenge_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
    [challengeHash],
  )
  return (result.rowCount ?? 0) === 1
}
