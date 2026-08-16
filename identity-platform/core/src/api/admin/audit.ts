/**
 * Admin 审计事件（#625：9 种事件，不存 secret/token/handoff）。
 *
 * 写入统一走 observability/audit 的 writeAuditEvent（strict 脱敏），
 * metadata 只含：review id/revision/决策/note/scope 名/reason 等白名单字段；
 * 明文 secret、token、handoff、code 等出现即整体拒绝落库（AuditSensitiveFieldError）。
 */
import type { SqlExecutor } from '../../db/types.js'
import { writeAuditEvent } from '../../observability/audit/index.js'
import type { ActorType } from '../../observability/audit/index.js'

export const ADMIN_EVENTS = {
  APP_APPROVED: 'ADMIN_APP_APPROVED',
  APP_REJECTED: 'ADMIN_APP_REJECTED',
  SCOPE_APPROVED: 'ADMIN_SCOPE_APPROVED',
  SCOPE_REJECTED: 'ADMIN_SCOPE_REJECTED',
  CLIENT_SUSPENDED: 'ADMIN_CLIENT_SUSPENDED',
  CLIENT_UNSUSPENDED: 'ADMIN_CLIENT_UNSUSPENDED',
  CLIENT_REVOKED: 'ADMIN_CLIENT_REVOKED',
  ROLE_GRANTED: 'ADMIN_ROLE_GRANTED',
  ROLE_REVOKED: 'ADMIN_ROLE_REVOKED',
} as const

export type AdminEventType = (typeof ADMIN_EVENTS)[keyof typeof ADMIN_EVENTS]

export interface WriteAdminAuditInput {
  eventType: AdminEventType
  /** 操作者（管理员内部 user id）；CLI 脚本传 'system' 角色 */
  actorType?: ActorType
  actorId: string | null
  targetType?: string
  targetId?: string | null
  result?: 'success' | 'denied' | 'error'
  requestCorrelationId?: string | null
  metadata?: Record<string, unknown>
}

/** 写 admin 审计事件（默认 actor_type='admin'；strict 脱敏由 writeAuditEvent 保证） */
export async function writeAdminAudit(sql: SqlExecutor, input: WriteAdminAuditInput): Promise<void> {
  await writeAuditEvent(sql, {
    eventType: input.eventType,
    actorType: input.actorType ?? 'admin',
    actorId: input.actorId,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    result: input.result ?? 'success',
    requestCorrelationId: input.requestCorrelationId ?? null,
    metadata: input.metadata ?? {},
  })
}
