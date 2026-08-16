/**
 * 设备领域服务（#619 / #617 信任边界 13-14）。
 *
 * - 设备私钥永不离开设备：服务端只接收并保存 Ed25519 公钥 JWK；
 * - JWK 必须无 `d` 字段（有则拒绝）；
 * - enrollment challenge 一次性、短时，数据库只存 hash；
 * - revoked 设备永远不能 approve auth request（findActiveDeviceById 保证）。
 */
import type { SqlExecutor } from '../db/types.js'
import {
  insertDevice,
  insertEnrollmentChallenge,
  consumeEnrollmentChallenge,
  findDeviceByFingerprint,
  setDeviceStatus,
  type DevicePlatform,
} from '../db/repos/devices.repo.js'
import {
  ChallengeInvalidError,
  DeviceFingerprintExistsError,
  DeviceNotActiveError,
} from './errors.js'
import { newUuidV7 } from './ids.js'
import { sha256Base64url } from '../security/hash.js'
import { newRandomSecret } from '../security/random.js'

/** 生成一次性 enrollment challenge（明文只返回一次，DB 存 sha256 hash） */
export function createEnrollmentChallenge(
  sql: SqlExecutor,
  input: { purpose: string; ttlSeconds?: number },
): Promise<{ challenge: string; expiresAt: Date }> {
  const challenge = newRandomSecret(32)
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 300) * 1000)
  return insertEnrollmentChallenge(sql, {
    id: newUuidV7(),
    challengeHash: sha256Base64url(challenge),
    purpose: input.purpose,
    expiresAt,
  }).then(() => ({ challenge, expiresAt }))
}

/** Ed25519 公钥 JWK 校验：kty=OKP、crv=Ed25519、有 x、无 d */
export function assertEd25519PublicJwk(jwk: unknown): void {
  const j = jwk as { kty?: unknown; crv?: unknown; x?: unknown; d?: unknown }
  if (!j || typeof j !== 'object') {
    throw new Error('[devices] public_key_jwk 必须是对象')
  }
  if (j.kty !== 'OKP' || j.crv !== 'Ed25519') {
    throw new Error('[devices] 只允许 Ed25519（OKP/Ed25519）公钥')
  }
  if (typeof j.x !== 'string' || j.x.length === 0) {
    throw new Error('[devices] 缺少 x（公钥）字段')
  }
  if ('d' in j && j.d !== undefined) {
    throw new Error('[devices] 私钥字段 d 不允许上传')
  }
}

/** 设备公钥指纹：sha256(规范化 JWK JSON) base64url */
export function deviceFingerprint(jwk: unknown): string {
  return sha256Base64url(JSON.stringify(jwk))
}

export interface RegisterDeviceInput {
  userId: string
  publicKeyJwk: unknown
  platform: DevicePlatform
  appVersion?: string
  deviceName: string
  /** 一次性 enrollment challenge 明文（服务端比对 hash 后消费） */
  challenge: string
  /** challenge 创建时的 purpose（必须匹配） */
  challengePurpose?: string
}

export interface RegisterDeviceResult {
  deviceId: string
  status: 'pending'
}

/**
 * 注册设备（首次绑定流程的一部分）：
 * 1. 校验 JWK 为 Ed25519 公钥（无 d）；
 * 2. 原子消费 challenge（hash 匹配 + 未过期 + 未消费，并发只有一次成功）；
 * 3. 指纹冲突拒绝；插入 pending 设备。
 */
export async function registerDevice(
  sql: SqlExecutor,
  input: RegisterDeviceInput,
): Promise<RegisterDeviceResult> {
  assertEd25519PublicJwk(input.publicKeyJwk)
  const fingerprint = deviceFingerprint(input.publicKeyJwk)

  const consumed = await consumeEnrollmentChallenge(sql, sha256Base64url(input.challenge))
  if (!consumed) {
    throw new ChallengeInvalidError()
  }

  const existing = await findDeviceByFingerprint(sql, fingerprint)
  if (existing) {
    throw new DeviceFingerprintExistsError()
  }

  const deviceId = newUuidV7()
  await insertDevice(sql, {
    id: deviceId,
    user_id: input.userId,
    publicKeyJwk: input.publicKeyJwk,
    publicKeyFingerprint: fingerprint,
    platform: input.platform,
    appVersion: input.appVersion ?? null,
    deviceName: input.deviceName.slice(0, 64),
    status: 'pending',
  })
  return { deviceId, status: 'pending' }
}

/** 激活设备：pending → active（revoked 无法再激活） */
export async function activateDevice(
  sql: SqlExecutor,
  deviceId: string,
): Promise<void> {
  const ok = await setDeviceStatus(sql, deviceId, 'active')
  if (!ok) {
    throw new DeviceNotActiveError('not_active')
  }
}

/** 吊销设备：pending/active → revoked */
export async function revokeDevice(
  sql: SqlExecutor,
  deviceId: string,
  reason?: string,
): Promise<void> {
  const ok = await setDeviceStatus(sql, deviceId, 'revoked', { revokedReason: reason ?? null })
  if (!ok) {
    throw new DeviceNotActiveError('not_found')
  }
}
