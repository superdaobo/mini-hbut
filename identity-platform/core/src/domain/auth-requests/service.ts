/**
 * AuthRequest 领域服务（#619）。
 *
 * 职责：
 * - 创建（生成 request_id / server_challenge / handoff secret，只存 hash）；
 * - 状态机驱动的原子迁移：approve / deny / open / cancel / expire / 协议推进；
 * - approve 的幂等与并发安全：条件更新保证并发 approve 只有一次生效。
 *
 * 边界说明（#619 写边界）：
 * - 设备签名验证（Ed25519）由 #622 在调用 approve 前完成；
 * - 本服务只负责状态机与 device 状态校验（active + 归属一致）。
 */
import type { SqlExecutor } from '../../db/types.js'
import {
  insertAuthRequest,
  findAuthRequestById,
  transitionAuthRequest,
  type AuthRequestRow,
  type TransitionPatch,
} from '../../db/repos/auth-requests.repo.js'
import { findActiveDeviceById } from '../../db/repos/devices.repo.js'
import {
  APPROVE_FROM_STATUSES,
  DENY_FROM_STATUSES,
  isAllowedTransition,
  isTerminalStatus,
  nonTerminalStatuses,
  type AuthRequestStatus,
} from './state-machine.js'
import {
  AuthRequestAlreadyApprovedError,
  AuthRequestExpiredError,
  AuthRequestInvalidTransitionError,
  AuthRequestNotFoundError,
  DeviceNotActiveError,
} from '../errors.js'
import { newUuidV7 } from '../ids.js'
import { hmacSha256Base64url, sha256Base64url } from '../../security/hash.js'
import { newPrefixedRandomId, newRandomSecret } from '../../security/random.js'

/** AuthRequest 默认 TTL（#617：约 120 秒，配置化）。 */
export const AUTH_REQUEST_TTL_SECONDS = 120

export interface CreateAuthRequestInput {
  interactionUid: string
  clientId: string
  requestedScopes: string[]
  /** IDENTITY_HANDOFF_HMAC_KEY（handoff secret 只存 HMAC 派生值） */
  handoffHmacKey: string | undefined
  /** 覆盖默认 TTL（测试用；生产用 AUTH_REQUEST_TTL_SECONDS） */
  ttlSeconds?: number
}

export interface CreateAuthRequestResult {
  requestId: string
  serverChallenge: string
  /** 只返回一次；此后仅以 HMAC hash 形式存在于数据库 */
  handoffSecret: string
  expiresAt: Date
}

export function createAuthRequest(
  sql: SqlExecutor,
  input: CreateAuthRequestInput,
): Promise<CreateAuthRequestResult> {
  const requestId = newPrefixedRandomId('ar', 16)
  const serverChallenge = newRandomSecret(32)
  const handoffSecret = newRandomSecret(32)
  const ttlSeconds = input.ttlSeconds ?? AUTH_REQUEST_TTL_SECONDS
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
  // 规范化 scope 列表（去重、排序）后计算 hash，防篡改比对
  const normalizedScopes = [...new Set(input.requestedScopes)].sort()
  const scopeHash = sha256Base64url(JSON.stringify(normalizedScopes))
  const handoffSecretHash = hmacSha256Base64url(input.handoffHmacKey, handoffSecret)

  return insertAuthRequest(sql, {
    id: requestId,
    interactionUid: input.interactionUid,
    clientId: input.clientId,
    requestedScopes: normalizedScopes,
    scopeHash,
    serverChallenge,
    handoffSecretHash,
    expiresAt,
  }).then(() => ({ requestId, serverChallenge, handoffSecret, expiresAt }))
}

export function verifyHandoffSecret(
  input: { handoffHmacKey: string | undefined; handoffSecret: string; request: AuthRequestRow },
): boolean {
  const expected = hmacSha256Base64url(input.handoffHmacKey, input.handoffSecret)
  return expected === input.request.handoff_secret_hash
}

/** 校验 scope_hash 与当前快照一致（防篡改） */
export function verifyScopeHash(request: AuthRequestRow): boolean {
  const normalized = [...new Set(request.requested_scopes as string[])].sort()
  return sha256Base64url(JSON.stringify(normalized)) === request.scope_hash
}

/** 标记 App 已读取请求详情：WAITING_APP → APP_OPENED */
export async function openAuthRequest(
  sql: SqlExecutor,
  requestId: string,
): Promise<AuthRequestRow> {
  const row = await transitionAuthRequest(
    sql, requestId, ['WAITING_APP'], 'APP_OPENED', { openedAt: new Date() },
  )
  if (!row) {
    throw await classifyTransitionFailure(sql, requestId, 'WAITING_APP', 'APP_OPENED')
  }
  return row
}

export interface ApproveAuthRequestResult {
  row: AuthRequestRow
  /** true = 本次调用完成了首次批准；false = 幂等命中既有批准 */
  created: boolean
}

/**
 * 用户批准：WAITING_APP/APP_OPENED → APPROVED。
 *
 * 并发安全：原子条件更新，只有第一个调用能成功写入批准；
 * 后续调用走幂等（同一设备返回既有结果）或安全失败（其他设备已批准）。
 *
 * 前置要求（由调用方/#622 完成）：
 * - 设备签名 challenge 已验证；
 * - deviceId 对应的设备存在、active。
 */
export async function approveAuthRequest(
  sql: SqlExecutor,
  requestId: string,
  deviceId: string,
): Promise<ApproveAuthRequestResult> {
  const device = await findActiveDeviceById(sql, deviceId)
  if (!device) {
    throw new DeviceNotActiveError()
  }
  const approvalNonce = newPrefixedRandomId('nonce', 16)

  const row = await transitionAuthRequest(
    sql,
    requestId,
    APPROVE_FROM_STATUSES,
    'APPROVED',
    {
      approvedAt: new Date(),
      approvedUserId: device.user_id,
      approvedDeviceId: deviceId,
      approvalNonce,
    },
  )
  if (row) {
    return { row, created: true }
  }

  // 条件更新失败：区分 不存在 / 已批准（幂等）/ 过期 / 非法状态
  const current = await findAuthRequestById(sql, requestId)
  if (!current) {
    throw new AuthRequestNotFoundError()
  }
  if (current.status === 'APPROVED') {
    if (
      current.approved_device_id === deviceId
      && current.approved_user_id === device.user_id
    ) {
      // 同一设备重复 approve：幂等返回既有结果，不生成第二次批准
      return { row: current, created: false }
    }
    throw new AuthRequestAlreadyApprovedError()
  }
  if (!isTerminalStatus(current.status)) {
    // 非终态但未批准：可能已过期（懒迁移到 EXPIRED 再报错）
    if (current.expires_at.getTime() <= Date.now()) {
      await transitionAuthRequest(
        sql, requestId, nonTerminalStatuses(), 'EXPIRED', {}, { allowExpired: true },
      )
      throw new AuthRequestExpiredError()
    }
    throw new AuthRequestInvalidTransitionError(current.status, 'APPROVED')
  }
  throw new AuthRequestInvalidTransitionError(current.status, 'APPROVED')
}

/** 用户拒绝：WAITING_APP/APP_OPENED → DENIED */
export async function denyAuthRequest(
  sql: SqlExecutor,
  requestId: string,
): Promise<AuthRequestRow> {
  const row = await transitionAuthRequest(
    sql, requestId, DENY_FROM_STATUSES, 'DENIED', { deniedAt: new Date() },
  )
  if (!row) {
    throw await classifyTransitionFailure(sql, requestId, DENY_FROM_STATUSES.join('/'), 'DENIED')
  }
  return row
}

/** Web 页面取消：CREATED/WAITING_APP/APP_OPENED → CANCELLED */
export async function cancelAuthRequest(
  sql: SqlExecutor,
  requestId: string,
): Promise<AuthRequestRow> {
  const row = await transitionAuthRequest(
    sql, requestId, ['CREATED', 'WAITING_APP', 'APP_OPENED'], 'CANCELLED',
  )
  if (!row) {
    throw await classifyTransitionFailure(sql, requestId, 'CREATED/WAITING_APP/APP_OPENED', 'CANCELLED')
  }
  return row
}

/** 懒过期：任意非终态 → EXPIRED（只在明确调用时执行，不依赖定时器） */
export async function expireAuthRequest(
  sql: SqlExecutor,
  requestId: string,
): Promise<AuthRequestRow | null> {
  const row = await transitionAuthRequest(
    sql, requestId, nonTerminalStatuses(), 'EXPIRED', {}, { allowExpired: true },
  )
  return row
}

/** OIDC 协议推进（#620 调用）：APPROVED → INTERACTION_FINISHED → CODE_ISSUED → CONSUMED */
export async function advanceAuthRequestProtocol(
  sql: SqlExecutor,
  requestId: string,
  to: 'INTERACTION_FINISHED' | 'CODE_ISSUED' | 'CONSUMED',
): Promise<AuthRequestRow> {
  const fromMap: Record<'INTERACTION_FINISHED' | 'CODE_ISSUED' | 'CONSUMED', AuthRequestStatus> = {
    INTERACTION_FINISHED: 'APPROVED',
    CODE_ISSUED: 'INTERACTION_FINISHED',
    CONSUMED: 'CODE_ISSUED',
  }
  const from = fromMap[to]
  const patch: TransitionPatch = to === 'INTERACTION_FINISHED'
    ? { interactionFinishedAt: new Date() }
    : {}
  const row = await transitionAuthRequest(sql, requestId, [from], to, patch)
  if (!row) {
    throw await classifyTransitionFailure(sql, requestId, from, to)
  }
  return row
}

/** 通用迁移（校验合法迁移表） */
export async function transitionAuthRequestStatus(
  sql: SqlExecutor,
  requestId: string,
  to: AuthRequestStatus,
): Promise<AuthRequestRow> {
  const current = await findAuthRequestById(sql, requestId)
  if (!current) {
    throw new AuthRequestNotFoundError()
  }
  if (!isAllowedTransition(current.status, to)) {
    throw new AuthRequestInvalidTransitionError(current.status, to)
  }
  const row = await transitionAuthRequest(sql, requestId, [current.status], to)
  if (!row) {
    throw await classifyTransitionFailure(sql, requestId, current.status, to)
  }
  return row
}

/** 把条件更新失败归类为具体业务错误 */
async function classifyTransitionFailure(
  sql: SqlExecutor,
  requestId: string,
  from: string,
  to: string,
): Promise<Error> {
  const current = await findAuthRequestById(sql, requestId)
  if (!current) {
    return new AuthRequestNotFoundError()
  }
  if (!isTerminalStatus(current.status)) {
    if (current.expires_at.getTime() <= Date.now()) {
      await transitionAuthRequest(
        sql, requestId, nonTerminalStatuses(), 'EXPIRED', {}, { allowExpired: true },
      )
      return new AuthRequestExpiredError()
    }
  }
  return new AuthRequestInvalidTransitionError(from, to)
}
