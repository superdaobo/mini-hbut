/**
 * Suspend / Unsuspend / Revoke 运行时控制（#625）。
 *
 * 关键设计（真实作用 oidc-provider，不是 UI 状态）：
 * - oidc-provider 的 Client 数据源是 oauth_applications，client-loader 只加载
 *   status='active' 的应用（src/oidc/adapter/client-loader.ts）。因此：
 *   suspend → 新 authorize / token refresh / 任何 client 认证立即 invalid_client；
 *   revoke  → 同上 + 终态不可恢复；
 * - 令牌策略（V1 决策，安全优先）：suspend/revoke 同时物理删除该 client 在
 *   oidc_provider_records 的全部协议 artifact（AccessToken/AuthorizationCode/
 *   RefreshToken/DeviceCode/Grant 等），现有 access token 不保留到 TTL 结束；
 * - revoke 额外撤销全部 oauth_consents（revoked_at），即使未来重新审核通过，
 *   用户也必须重新授权（不静默续权）；
 * - 全部操作条件更新（状态机约束）+ 幂等（重复操作返回既有状态）+ 审计。
 */
import type { SqlExecutor } from '../../db/types.js'
import {
  revokeProviderArtifactsForClient,
  revokeConsentsForApplication,
  type AdminAppRow,
} from './queries.js'
import {
  AdminClientNotFoundError,
  AdminInvalidStateError,
} from './errors.js'
import { assertReason } from './reviews.js'
import { writeAdminAudit, ADMIN_EVENTS } from './audit.js'

async function findAppById(sql: SqlExecutor, applicationId: string): Promise<AdminAppRow | null> {
  const result = await sql.query<AdminAppRow>(
    'SELECT * FROM oauth_applications WHERE id = $1',
    [applicationId],
  )
  return result.rows[0] ?? null
}

/** 条件迁移后的幂等兜底：返回新状态；已处于目标态 → null（幂等） */
async function applyTransition(
  sql: SqlExecutor,
  applicationId: string,
  from: readonly string[],
  to: 'suspended' | 'active' | 'revoked',
): Promise<{ applied: boolean; app: AdminAppRow }> {
  // IN 占位符展开（不用 ANY($n::text[])：pg-mem 对数组参数匹配有缺陷）
  const fromPlaceholders = from.map((_, i) => `$${i + 2}`).join(', ')
  const setIndex = from.length + 2
  const result = await sql.query<AdminAppRow>(
    `UPDATE oauth_applications
        SET status = $${setIndex}, updated_at = NOW()
      WHERE id = $1 AND status IN (${fromPlaceholders})
      RETURNING *`,
    [applicationId, ...from, to],
  )
  if ((result.rowCount ?? 0) === 1) {
    return { applied: true, app: result.rows[0] as AdminAppRow }
  }
  const app = await findAppById(sql, applicationId)
  if (!app) {
    throw new AdminClientNotFoundError()
  }
  return { applied: false, app }
}

export interface SuspendClientInput {
  applicationId: string
  adminUserId: string
  reason: string
  requestCorrelationId?: string | null
}

export interface SuspendClientResult {
  applicationId: string
  clientId: string
  status: 'suspended'
  /** 物理撤销的 provider artifact 数（0 = 幂等重放） */
  revokedArtifacts: number
  reason: string
}

/**
 * 暂停 Client：active → suspended。
 * - 新 authorize/refresh 立即失败（provider 不再加载该 client）；
 * - 同时撤销全部 grant/token 链（见文件头策略决策）；
 * - 幂等：已 suspended → 直接返回（不重复撤销/审计）。
 */
export async function suspendClient(
  sql: SqlExecutor,
  input: SuspendClientInput,
): Promise<SuspendClientResult> {
  const reason = assertReason(input.reason, 'reason')
  const { applied, app } = await applyTransition(sql, input.applicationId, ['active'], 'suspended')
  if (!app) {
    throw new AdminClientNotFoundError()
  }
  if (!applied) {
    if (app.status === 'suspended') {
      return {
        applicationId: app.id,
        clientId: app.client_id,
        status: 'suspended',
        revokedArtifacts: 0,
        reason,
      }
    }
    throw new AdminInvalidStateError(`只有 active 状态的 Client 可以暂停（当前 ${app.status}）`)
  }
  const revokedArtifacts = await revokeProviderArtifactsForClient(sql, app.client_id)
  await writeAdminAudit(sql, {
    eventType: ADMIN_EVENTS.CLIENT_SUSPENDED,
    actorId: input.adminUserId,
    targetType: 'application',
    targetId: app.id,
    requestCorrelationId: input.requestCorrelationId ?? null,
    metadata: { client_id: app.client_id, reason, revoked_artifacts: revokedArtifacts },
  })
  return { applicationId: app.id, clientId: app.client_id, status: 'suspended', revokedArtifacts, reason }
}

export interface UnsuspendClientInput {
  applicationId: string
  adminUserId: string
  reason: string
  requestCorrelationId?: string | null
}

export interface UnsuspendClientResult {
  applicationId: string
  clientId: string
  status: 'active'
  reason: string
}

/**
 * 恢复 Client：suspended → active（仅此状态可恢复；issue「unsuspend only from
 * allowed state」）。已被物理撤销的 token 不会复活（用户重新授权）。
 */
export async function unsuspendClient(
  sql: SqlExecutor,
  input: UnsuspendClientInput,
): Promise<UnsuspendClientResult> {
  const reason = assertReason(input.reason, 'reason')
  const { applied, app } = await applyTransition(sql, input.applicationId, ['suspended'], 'active')
  if (!app) {
    throw new AdminClientNotFoundError()
  }
  if (!applied) {
    if (app.status === 'active') {
      return { applicationId: app.id, clientId: app.client_id, status: 'active', reason }
    }
    throw new AdminInvalidStateError(`只有 suspended 状态的 Client 可以恢复（当前 ${app.status}）`)
  }
  await writeAdminAudit(sql, {
    eventType: ADMIN_EVENTS.CLIENT_UNSUSPENDED,
    actorId: input.adminUserId,
    targetType: 'application',
    targetId: app.id,
    requestCorrelationId: input.requestCorrelationId ?? null,
    metadata: { client_id: app.client_id, reason },
  })
  return { applicationId: app.id, clientId: app.client_id, status: 'active', reason }
}

export interface RevokeClientInput {
  applicationId: string
  adminUserId: string
  reason: string
  requestCorrelationId?: string | null
}

export interface RevokeClientResult {
  applicationId: string
  clientId: string
  status: 'revoked'
  revokedArtifacts: number
  revokedConsents: number
  reason: string
}

/**
 * 永久撤销 Client（任意非终态 → revoked，终态不可逆）：
 * - provider 立即不可见；撤销全部协议 artifact 与用户授权记录；
 * - 重新接入必须新 Client + 新 review（revoked 无任何回退路径）；
 * - 历史 audit 不删除。
 */
export async function revokeClient(
  sql: SqlExecutor,
  input: RevokeClientInput,
): Promise<RevokeClientResult> {
  const reason = assertReason(input.reason, 'reason')
  const { applied, app } = await applyTransition(
    sql,
    input.applicationId,
    ['draft', 'pending_review', 'approved', 'active', 'suspended'],
    'revoked',
  )
  if (!app) {
    throw new AdminClientNotFoundError()
  }
  if (!applied) {
    if (app.status === 'revoked') {
      return {
        applicationId: app.id,
        clientId: app.client_id,
        status: 'revoked',
        revokedArtifacts: 0,
        revokedConsents: 0,
        reason,
      }
    }
    throw new AdminInvalidStateError(`当前状态（${app.status}）不可撤销`)
  }
  const [revokedArtifacts, revokedConsents] = await Promise.all([
    revokeProviderArtifactsForClient(sql, app.client_id),
    revokeConsentsForApplication(sql, app.id),
  ])
  await writeAdminAudit(sql, {
    eventType: ADMIN_EVENTS.CLIENT_REVOKED,
    actorId: input.adminUserId,
    targetType: 'application',
    targetId: app.id,
    requestCorrelationId: input.requestCorrelationId ?? null,
    metadata: {
      client_id: app.client_id,
      reason,
      revoked_artifacts: revokedArtifacts,
      revoked_consents: revokedConsents,
    },
  })
  return {
    applicationId: app.id,
    clientId: app.client_id,
    status: 'revoked',
    revokedArtifacts,
    revokedConsents,
    reason,
  }
}
