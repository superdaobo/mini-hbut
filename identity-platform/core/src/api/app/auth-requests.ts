/**
 * AuthRequest approve API（#622）。
 *
 *   POST /api/v1/app/auth-requests/:request_id/approve
 *   Authorization: Handoff <short-lived-handoff-secret>
 *   body: { device_id, issued_at, nonce, signature, canonical_version? }
 *
 * 信任模型（#617 边界 12 + #622）：
 * - 不发送/不信任 student_id：审批身份由服务端从 device_id → active device → user_id 推导；
 * - body 字段 strict 白名单（canonical_version 可选且必须等于 MINI-HBUT-AUTH-V1，
 *   其余未知字段一律 400，防止客户端混入身份声明字段）；
 * - 12 步验证（issue #622「Core 验证顺序」）：
 *     1  request 存在；
 *     2  handoff hash constant-time compare；
 *     3  request 未过期（过期懒迁移 EXPIRED）；
 *     4  device 存在且 active；
 *     5  public JWK/算法合法；
 *     6  issued_at 在允许时间偏差内（默认 ±60s，配置化）；
 *     7  nonce 防重放（签名绑定 request+challenge+device+scope；请求状态机单次迁移；
 *        同一 payload 重复提交幂等，不重复触发 provider interaction）；
 *     8  重建 canonical（scope_hash 由服务端存储快照重算，不信任客户端）；
 *     9  Ed25519 verify；
 *     10 原子条件更新 → APPROVED（并发 double approve 只有一次生效）；
 *     11 写 audit；
 *     12 更新 device last_seen / user last_active。
 *   任何一步失败都不得部分写入（10-12 在单个事务内）。
 */
import type { RouterContext } from '@koa/router'
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { findAuthRequestById } from '../../db/repos/auth-requests.repo.js'
import { findActiveDeviceById, touchDeviceLastSeen } from '../../db/repos/devices.repo.js'
import { touchUserLastActive } from '../../db/repos/users.repo.js'
import {
  approveAuthRequest,
  verifyScopeHash,
  expireAuthRequest,
} from '../../domain/auth-requests/service.js'
import { assertEd25519PublicJwk } from '../../domain/devices.js'
import {
  AuthRequestExpiredError,
  AuthRequestNotFoundError,
  DeviceNotActiveError,
  DomainError,
} from '../../domain/errors.js'
import { writeAuditEvent } from '../../observability/audit/index.js'
import { sha256Hex } from '../../security/hash.js'
import { normalizeScopes, scopeHash, buildAuthCanonical, AUTH_VERSION } from './canonical.js'
import { verifyEd25519 } from './verify.js'
import { readJsonBody } from './body.js'
import {
  verifyHandoffForRequest,
  assertFreshIssuedAt,
  type AppAuthDeps,
  type ClockSkewConfig,
} from './auth.js'
import { APP_API_PREFIX } from './devices.js'
import {
  InvalidHandoffError,
  InvalidRequestError,
  InvalidSignatureError,
  StaleIssuedAtError,
  AppInternalError,
  respondError,
} from './errors.js'

export interface ApproveApiDeps extends AppAuthDeps, ClockSkewConfig {
  sql: SqlExecutor
}

/** approve body 字段白名单（strict：student_id 等身份声明字段一律拒绝） */
const APPROVE_BODY_FIELDS = new Set(['device_id', 'issued_at', 'nonce', 'signature', 'canonical_version'])

/** 解析并校验 approve body（字段白名单 + 类型检查） */
function parseApproveBody(body: unknown): {
  deviceId: string
  issuedAt: number
  nonce: string
  signature: string
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidRequestError('请求体必须是 JSON 对象')
  }
  const b = body as Record<string, unknown>
  for (const key of Object.keys(b)) {
    if (!APPROVE_BODY_FIELDS.has(key)) {
      // 未知字段（含 student_id 等身份声明）一律拒绝：审批身份只能来自设备
      throw new InvalidRequestError(`未知字段 ${key}（审批身份由服务端从设备推导）`)
    }
  }
  const { device_id: deviceId, issued_at: issuedAt, nonce, signature, canonical_version: canonicalVersion } = b
  if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 128) {
    throw new InvalidRequestError('device_id 非法')
  }
  if (typeof issuedAt !== 'number' || !Number.isInteger(issuedAt)) {
    throw new InvalidRequestError('issued_at 必须是整数')
  }
  if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > 128) {
    throw new InvalidRequestError('nonce 非法')
  }
  if (typeof signature !== 'string' || signature.length === 0 || signature.length > 128) {
    throw new InvalidRequestError('signature 非法')
  }
  if (canonicalVersion !== undefined && canonicalVersion !== AUTH_VERSION) {
    throw new InvalidRequestError(`canonical_version 只支持 ${AUTH_VERSION}`)
  }
  return { deviceId, issuedAt, nonce, signature }
}

/** 注册 approve 路由（由 registerAppRoutes 调用） */
export function registerAuthRequestRoutes(router: Router, deps: ApproveApiDeps): void {
  router.post(`${APP_API_PREFIX}/auth-requests/:request_id/approve`, async (ctx) => {
    try {
      const requestId = ctx.params.request_id as string

      // 1. request 存在
      const request = await findAuthRequestById(deps.sql, requestId)
      if (!request) {
        throw new AuthRequestNotFoundError()
      }

      // 2. handoff hash constant-time compare（#617 信任边界 12：request_id 不能单独批准请求）
      if (!verifyHandoffForRequest(ctx, deps, request)) {
        throw new InvalidHandoffError()
      }

      // 3. 未过期（过期 → 懒迁移 EXPIRED → 410）
      if (request.expires_at.getTime() <= Date.now()) {
        await expireAuthRequest(deps.sql, requestId).catch(() => undefined)
        throw new AuthRequestExpiredError()
      }

      // body 解析（strict 白名单；在验签前完成，保证任何失败都无副作用）
      const input = parseApproveBody(await readJsonBody(ctx))

      // 4. device 存在且 active（revoked/pending 一律拒绝）
      const device = await findActiveDeviceById(deps.sql, input.deviceId)
      if (!device) {
        throw new DeviceNotActiveError('not_found')
      }

      // 5. public JWK/算法合法（DB 数据不变量；异常数据 fail closed → 500）
      const jwk = device.public_key_jwk as { kty: 'OKP'; crv: 'Ed25519'; x: string }
      try {
        assertEd25519PublicJwk(jwk)
      } catch {
        throw new AppInternalError()
      }

      // 6. issued_at 在允许时间偏差内（默认 ±60s）
      if (!assertFreshIssuedAt(input.issuedAt, deps.skewSeconds)) {
        throw new StaleIssuedAtError()
      }

      // 7/8. 重建 canonical：字段全部来自服务端存储快照（challenge/client_id/scope 均不信任客户端）。
      //      scope_hash 按 #622 协议规范（去重+字典序+单空格 join 后 SHA-256）由存储的
      //      requested_scopes 重算 —— 与 Rust canonical::scope_hash 逐字节一致；
      //      verifyScopeHash 另行保证 DB 内 scope 快照与其入库 hash 的一致性（#619 语义）。
      if (!verifyScopeHash(request)) {
        throw new AppInternalError()
      }
      const computedScopeHash = scopeHash(normalizeScopes(request.requested_scopes as string[]))
      const canonical = buildAuthCanonical({
        requestId: request.id,
        challenge: request.server_challenge,
        clientId: request.client_id,
        scopeHash: computedScopeHash,
        deviceId: device.id,
        decision: 'approve',
        issuedAt: input.issuedAt,
        nonce: input.nonce,
      })

      // 9. Ed25519 verify（签名绑定 request+challenge+client+scope+device+nonce）
      if (!verifyEd25519(jwk, canonical, input.signature)) {
        throw new InvalidSignatureError()
      }

      // 10-12. 原子事务：条件更新 APPROVED（并发只有一次生效）+ audit + last_seen
      //        approveAuthRequest 内部状态机：WAITING_APP/APP_OPENED → APPROVED；
      //        已批准同设备 → 幂等（created=false，不重复批准）；其他设备 → 409。
      const result = await deps.sql.withTransaction(async (tx) => {
        const approved = await approveAuthRequest(tx, requestId, device.id)
        if (approved.created) {
          await writeAuditEvent(tx, {
            eventType: 'auth_request.approved',
            actorType: 'device',
            actorId: device.id,
            targetType: 'auth_request',
            targetId: requestId,
            result: 'success',
            metadata: {
              approval_client_nonce: input.nonce,
              signature_hash: sha256Hex(input.signature),
            },
          })
          await touchDeviceLastSeen(tx, device.id)
          if (device.user_id) {
            await touchUserLastActive(tx, device.user_id)
          }
        }
        return approved
      })

      ctx.status = 200
      ctx.body = {
        request_id: requestId,
        status: 'APPROVED',
        approved_at: result.row.approved_at?.toISOString() ?? null,
        already_approved: !result.created,
      }
    } catch (err) {
      if (err instanceof DomainError) {
        respondError(ctx, err)
        return
      }
      ctx.app.emit('error', err as Error, ctx)
      respondError(ctx, new AppInternalError())
    }
  })
}
