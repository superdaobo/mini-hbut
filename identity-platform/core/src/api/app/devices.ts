/**
 * 设备 API（#622）。
 *
 * 端点：
 *   POST /api/v1/app/devices/enrollment-challenges   Handoff 认证（防匿名无限创建）
 *   POST /api/v1/app/devices/enroll                  Handoff 认证（首台设备注册）
 *   GET  /api/v1/app/devices/me                      Device 签名认证（设备自查询）
 *   POST /api/v1/app/devices/:id/revoke              Device 签名认证（设备自撤销，V1 仅本机）
 *
 * 安全模型（#617 信任边界 13-14、18）：
 * - 服务端只保存 Ed25519 公钥 JWK，私钥永不离开设备；
 * - enrollment assertion 由新私钥签名，证明「本机持有私钥 + 声明本地学校会话属于此学号」，
 *   绝不把 mini_hbut_app 升级为官方认证（verification_level 固定 low，DB CHECK 固化）；
 * - 相同学号已存在 → 409 LINK_REQUIRED，绝不静默挂新公钥（防抢账户）；
 * - challenge 一次性（原子消费）、短时、DB 只存 hash；
 * - enrollment 全程在单个事务内（用户+身份+设备+激活 all-or-nothing）。
 */
import type { RouterContext } from '@koa/router'
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { findIdentityByProviderSubject } from '../../db/repos/users.repo.js'
import { insertUser, insertLinkedIdentity } from '../../db/repos/users.repo.js'
import {
  consumeEnrollmentChallenge,
  findDeviceByFingerprint,
  listDevicesByUser,
  reactivateRevokedDevice,
  type DeviceRow
} from '../../db/repos/devices.repo.js'
import {
  createEnrollmentChallenge,
  registerDevice,
  revokeDevice,
  activateDevice,
  assertEd25519PublicJwk,
} from '../../domain/devices.js'
import { assertValidHbutSubject } from '../../domain/users.js'
import {
  ChallengeInvalidError,
  DeviceFingerprintExistsError,
  DomainError,
  DeviceNotActiveError,
} from '../../domain/errors.js'
import { sha256Base64url } from '../../security/hash.js'
import { newUuidV7 } from '../../domain/ids.js'
import { buildEnrollCanonical, jwkFingerprint, type EnrollCanonicalInput } from './canonical.js'
import { verifyEd25519 } from './verify.js'
import { readJsonBody } from './body.js'
import {
  findRequestByHandoffSecret,
  assertFreshIssuedAt,
  authenticateDeviceRequest,
  type AppAuthDeps,
  type ClockSkewConfig,
} from './auth.js'
import {
  InvalidHandoffError,
  InvalidRequestError,
  InvalidSignatureError,
  LinkRequiredError,
  StaleIssuedAtError,
  TestAccountRejectedError,
  AppInternalError,
  respondError,
} from './errors.js'

export const APP_API_PREFIX = '/api/v1/app'

/** 测试/演示账号标记（production 环境拒绝，防污染生产 Identity 用户） */
const TEST_ACCOUNT_PATTERN = /(test|demo|fake)/i

/** enrollment challenge 的允许 purpose（V1 只有设备注册） */
const CHALLENGE_PURPOSES = new Set(['device_enrollment'])

export interface DevicesApiDeps extends AppAuthDeps, ClockSkewConfig {
  sql: SqlExecutor
  /** enrollment challenge TTL（秒），默认 300 */
  challengeTtlSeconds?: number
}

function isProduction(): boolean {
  return (process.env.IDENTITY_ENVIRONMENT ?? 'development').trim().toLowerCase() === 'production'
}

/** 解析 enroll 请求体并做字段级校验（strict：未知字段一律拒绝） */
function parseEnrollBody(body: unknown): {
  publicJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string }
  platform: DeviceRow['platform']
  appVersion: string
  deviceName: string
  challenge: string
  studentId: string
  studentName: string
  issuedAt: number
  nonce: string
  signature: string
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidRequestError('请求体必须是 JSON 对象')
  }
  const b = body as Record<string, unknown>
  const allowed = new Set([
    'public_jwk', 'platform', 'app_version', 'device_name', 'challenge',
    'student_id', 'student_name', 'issued_at', 'nonce', 'signature',
  ])
  for (const key of Object.keys(b)) {
    if (!allowed.has(key)) {
      throw new InvalidRequestError(`未知字段 ${key}`)
    }
  }
  for (const field of ['public_jwk', 'platform', 'device_name', 'challenge', 'student_id', 'issued_at', 'nonce', 'signature'] as const) {
    if (b[field] === undefined || b[field] === null || b[field] === '') {
      throw new InvalidRequestError(`缺少字段 ${field}`)
    }
  }
  const publicJwk = b.public_jwk as { kty: string; crv: string; x: string }
  try {
    assertEd25519PublicJwk(publicJwk)
  } catch (err) {
    throw new InvalidRequestError((err as Error).message)
  }
  const platform = String(b.platform)
  const validPlatforms = ['windows', 'macos', 'linux', 'android', 'ios', 'unknown']
  if (!validPlatforms.includes(platform)) {
    throw new InvalidRequestError(`platform 非法：${platform}`)
  }
  const deviceName = String(b.device_name).trim()
  if (deviceName.length === 0 || [...deviceName].length > 64) {
    throw new InvalidRequestError('device_name 长度须为 1..=64')
  }
  const appVersion = b.app_version === undefined ? '' : String(b.app_version)
  if (appVersion.length > 64) {
    throw new InvalidRequestError('app_version 超长')
  }
  const challenge = String(b.challenge)
  if (challenge.length === 0 || challenge.length > 256) {
    throw new InvalidRequestError('challenge 长度非法')
  }
  const studentId = String(b.student_id).trim()
  const studentName = String(b.student_name ?? '').trim()
  const issuedAt = b.issued_at
  if (typeof issuedAt !== 'number' || !Number.isInteger(issuedAt)) {
    throw new InvalidRequestError('issued_at 必须是整数')
  }
  const nonce = String(b.nonce)
  const signature = String(b.signature)
  if (nonce.length === 0 || nonce.length > 128) {
    throw new InvalidRequestError('nonce 长度非法')
  }
  if (signature.length === 0 || signature.length > 128) {
    throw new InvalidRequestError('signature 长度非法')
  }
  try {
    assertValidHbutSubject(studentId)
  } catch {
    throw new InvalidRequestError('student_id 格式非法')
  }
  return {
    publicJwk: { kty: 'OKP', crv: 'Ed25519', x: publicJwk.x },
    platform: platform as DeviceRow['platform'],
    appVersion,
    deviceName,
    challenge,
    studentId,
    studentName,
    issuedAt,
    nonce,
    signature,
  }
}

/** 注册 devices 路由（由 registerAppRoutes 调用） */
export function registerDeviceRoutes(router: Router, deps: DevicesApiDeps): void {
  // POST /api/v1/app/devices/enrollment-challenges —— 一次性 enrollment challenge
  router.post(`${APP_API_PREFIX}/devices/enrollment-challenges`, async (ctx) => {
    try {
      const auth = ctx.get('authorization')
      const handoff = auth.replace(/^Handoff\s+/i, '').trim()
      if (!handoff || handoff === auth) {
        throw new InvalidHandoffError()
      }
      // 必须关联当前活跃的 Web 接力会话，防止完全匿名无限创建 challenge
      const request = await findRequestByHandoffSecret(deps.sql, deps.handoffHmacKey, handoff)
      if (!request) {
        throw new InvalidHandoffError()
      }
      const body = await readJsonBody(ctx)
      const purpose = (body as { purpose?: unknown } | undefined)?.purpose ?? 'device_enrollment'
      if (typeof purpose !== 'string' || !CHALLENGE_PURPOSES.has(purpose)) {
        throw new InvalidRequestError(`purpose 只允许 ${[...CHALLENGE_PURPOSES].join('/')}`)
      }
      const { challenge, expiresAt } = await createEnrollmentChallenge(deps.sql, {
        purpose,
        ttlSeconds: deps.challengeTtlSeconds ?? 300,
      })
      ctx.status = 200
      ctx.body = { challenge, expires_at: expiresAt.toISOString() }
    } catch (err) {
      handleError(ctx, err)
    }
  })

  // POST /api/v1/app/devices/enroll —— 首台设备注册（原子事务）
  router.post(`${APP_API_PREFIX}/devices/enroll`, async (ctx) => {
    try {
      const auth = ctx.get('authorization')
      const handoff = auth.replace(/^Handoff\s+/i, '').trim()
      if (!handoff || handoff === auth) {
        throw new InvalidHandoffError()
      }
      const boundRequest = await findRequestByHandoffSecret(deps.sql, deps.handoffHmacKey, handoff)
      if (!boundRequest) {
        throw new InvalidHandoffError()
      }
      const input = parseEnrollBody(await readJsonBody(ctx))

      // production 环境拒绝测试/演示账号创建 Identity 用户
      if (isProduction() && TEST_ACCOUNT_PATTERN.test(input.studentId)) {
        throw new TestAccountRejectedError()
      }
      // 签名时间窗
      if (!assertFreshIssuedAt(input.issuedAt, deps.skewSeconds)) {
        throw new StaleIssuedAtError()
      }
      // 指纹 = sha256(canonical 紧凑 JWK JSON)（与 Rust DeviceKey::fingerprint 一致）
      const fingerprint = jwkFingerprint(input.publicJwk)
      // 重建 enrollment canonical（字段全部来自请求，其中 fingerprint 服务端重算）并验签
      const canonical = buildEnrollCanonical({
        challenge: input.challenge,
        publicKeyFingerprint: fingerprint,
        studentId: input.studentId,
        studentName: input.studentName,
        issuedAt: input.issuedAt,
        nonce: input.nonce,
      } satisfies EnrollCanonicalInput)
      if (!verifyEd25519(input.publicJwk, canonical, input.signature)) {
        throw new InvalidSignatureError()
      }

      // 原子事务：用户/身份/设备 all-or-nothing（任何一步失败不产生部分写入）。
      // #679 多设备自绑定：同一学号的新设备凭有效 handoff+challenge+签名断言
      // 直接挂到既有身份，不再要求「已绑定设备批准」；同密钥重试幂等返回既有绑定。
      const result = await deps.sql.withTransaction(async (tx) => {
        const identity = await findIdentityByProviderSubject(tx, 'hbut', input.studentId)
        const existingDevice = await findDeviceByFingerprint(tx, fingerprint)

        // 学号尚无身份 → 首台设备注册（原路径）
        if (!identity) {
          const userId = newUuidV7()
          await insertUser(tx, { id: userId })
          await insertLinkedIdentity(tx, {
            id: newUuidV7(),
            user_id: userId,
            provider: 'hbut',
            subject: input.studentId,
            student_name_snapshot: input.studentName || null,
            verification_method: 'mini_hbut_app',
            verification_level: 'low',
            verified_at: new Date(),
          })
          // 一次性消费 challenge + 指纹冲突检查 + 插入 pending 设备
          const registered = await registerDevice(tx, {
            userId,
            publicKeyJwk: input.publicJwk,
            platform: input.platform,
            appVersion: input.appVersion || undefined,
            deviceName: input.deviceName,
            challenge: input.challenge,
            challengePurpose: 'device_enrollment',
          })
          await activateDevice(tx, registered.deviceId)
          return { userId, deviceId: registered.deviceId }
        }

        const userId = identity.user_id
        if (existingDevice) {
          if (existingDevice.user_id !== userId) {
            // 指纹属于其他学号：跨账号冲突仍拒绝（指纹全局唯一不变式不变）
            throw new DeviceFingerprintExistsError()
          }
          if (existingDevice.status === 'active') {
            // 同密钥重试 / #677 补绑定重放：幂等返回既有绑定（不消费 challenge，重试安全）
            return { userId, deviceId: existingDevice.id }
          }
          // revoked → 同密钥重新注册即重新激活（密码登录 + 签名断言即表达意图）
          const consumedRevive = await consumeEnrollmentChallenge(
            tx,
            sha256Base64url(input.challenge),
          )
          if (!consumedRevive) throw new ChallengeInvalidError()
          const reactivated = await reactivateRevokedDevice(tx, existingDevice.id)
          if (!reactivated) throw new DeviceFingerprintExistsError()
          return { userId, deviceId: existingDevice.id }
        }

        // 学号有身份 + 全新设备 → 挂到既有身份（多设备自绑定核心场景）
        const registered = await registerDevice(tx, {
          userId,
          publicKeyJwk: input.publicJwk,
          platform: input.platform,
          appVersion: input.appVersion || undefined,
          deviceName: input.deviceName,
          challenge: input.challenge,
          challengePurpose: 'device_enrollment',
        })
        await activateDevice(tx, registered.deviceId)
        return { userId, deviceId: registered.deviceId }
      })

      ctx.status = 201
      ctx.body = {
        user_id: result.userId,
        device_id: result.deviceId,
        status: 'active',
        fingerprint,
      }
    } catch (err) {
      handleError(ctx, err)
    }
  })

  // GET /api/v1/app/devices/me —— 设备自查询（Device 签名认证）
  router.get(`${APP_API_PREFIX}/devices/me`, async (ctx) => {
    try {
      const device = await authenticateDeviceRequest(ctx, deps)
      ctx.status = 200
      ctx.body = {
        device_id: device.id,
        status: device.status,
        fingerprint: device.public_key_fingerprint,
        platform: device.platform,
        app_version: device.app_version,
        device_name: device.device_name,
        created_at: device.created_at.toISOString(),
        last_seen_at: device.last_seen_at ? device.last_seen_at.toISOString() : null,
      }
    } catch (err) {
      handleError(ctx, err)
    }
  })

  // POST /api/v1/app/devices/:id/revoke —— 设备自撤销（Device 签名认证，V1 仅允许撤销本机）
  router.post(`${APP_API_PREFIX}/devices/:id/revoke`, async (ctx) => {
    try {
      const device = await authenticateDeviceRequest(ctx, deps)
      const targetId = ctx.params.id as string
      if (targetId !== device.id) {
        // V1 只支持本机自撤销；跨设备撤销走后续关联流程
        throw new DeviceNotActiveError('belongs_to_other_user')
      }
      await revokeDevice(deps.sql, device.id, 'user_revoked')
      // 撤销后检查是否还有剩余 active 设备（供前端二次确认/恢复提示）
      const remaining = (await listDevicesByUser(deps.sql, device.user_id)).filter(
        (d) => d.status === 'active' && d.id !== device.id,
      )
      ctx.status = 200
      ctx.body = {
        device_id: device.id,
        revoked: true,
        last_active_device: remaining.length === 0,
      }
    } catch (err) {
      handleError(ctx, err)
    }
  })
}

/** DomainError → HTTP；未知错误 → 500（不泄露细节） */
function handleError(ctx: RouterContext, err: unknown): void {
  if (err instanceof DomainError) {
    respondError(ctx, err)
    return
  }
  // UNIQUE 约束兜底（并发注册）：identities 冲突 → LINK_REQUIRED；指纹冲突 → DEVICE_FINGERPRINT_EXISTS
  if ((err as { code?: string }).code === '23505') {
    const detail = String((err as { detail?: unknown }).detail ?? (err as { constraint?: unknown }).constraint ?? '')
    if (/linked_identities|identities/i.test(detail)) {
      respondError(ctx, new LinkRequiredError())
      return
    }
    respondError(ctx, new DeviceFingerprintExistsError())
    return
  }
  ctx.app.emit('error', err as Error, ctx)
  respondError(ctx, new AppInternalError())
}
