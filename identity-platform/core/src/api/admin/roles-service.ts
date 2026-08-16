/**
 * 管理员角色授予/撤销服务（#625）。
 *
 * 使用场景：
 * - out-of-band bootstrap 脚本（core/scripts/admin-grant.ts）→ actor_type='system'；
 * - 未来管理 API（本版本不暴露 HTTP 端点，防匿名 bootstrap 面）。
 *
 * 安全约束：
 * - 只接受内部 user id（usr_ 前缀不做强校验，但必须是 users 表已存在用户）；
 * - 用户不存在 → 抛错（fail closed）；
 * - 审计 ADMIN_ROLE_GRANTED / ADMIN_ROLE_REVOKED（不记 secret/学号）。
 */
import type { SqlExecutor } from '../../db/types.js'
import { findUserById } from '../../db/repos/users.repo.js'
import { grantRole, revokeRole } from './queries.js'
import { AdminInvalidInputError, RoleNotFoundError } from './errors.js'
import { writeAdminAudit, ADMIN_EVENTS } from './audit.js'
import type { AdminRole } from './rbac.js'

export interface GrantAdminRoleInput {
  userId: string
  role: AdminRole
  /** 授予人内部 user id；bootstrap 脚本为 null（actor 记 system） */
  grantedBy?: string | null
  requestCorrelationId?: string | null
}

/**
 * 授予管理员角色（幂等：已有且未撤销 → 不重复写/审计；撤销后重新激活 → 记审计）。
 * 用户不存在 → AdminInvalidInputError。
 */
export async function grantAdminRole(
  sql: SqlExecutor,
  input: GrantAdminRoleInput,
): Promise<{ created: boolean }> {
  const user = await findUserById(sql, input.userId)
  if (!user) {
    throw new AdminInvalidInputError(`用户不存在：${input.userId}`)
  }
  const result = await grantRole(sql, {
    userId: input.userId,
    role: input.role,
    grantedBy: input.grantedBy ?? null,
  })
  if (result.created || result.reactivated) {
    await writeAdminAudit(sql, {
      eventType: ADMIN_EVENTS.ROLE_GRANTED,
      actorType: input.grantedBy ? 'admin' : 'system',
      actorId: input.grantedBy ?? null,
      targetType: 'user',
      targetId: input.userId,
      requestCorrelationId: input.requestCorrelationId ?? null,
      metadata: { role: input.role },
    })
  }
  return { created: result.created }
}

export interface RevokeAdminRoleInput {
  userId: string
  role: AdminRole
  /** 执行人；bootstrap 脚本为 null（actor 记 system） */
  revokedBy?: string | null
  requestCorrelationId?: string | null
}

/**
 * 撤销管理员角色（软删除）；该用户没有该角色 → RoleNotFoundError。
 * 撤销已生效：下一次请求即不再有权限（服务端无角色缓存）。
 */
export async function revokeAdminRole(
  sql: SqlExecutor,
  input: RevokeAdminRoleInput,
): Promise<void> {
  const result = await revokeRole(sql, { userId: input.userId, role: input.role })
  if (!result.revoked) {
    throw new RoleNotFoundError(input.role)
  }
  await writeAdminAudit(sql, {
    eventType: ADMIN_EVENTS.ROLE_REVOKED,
    actorType: input.revokedBy ? 'admin' : 'system',
    actorId: input.revokedBy ?? null,
    targetType: 'user',
    targetId: input.userId,
    requestCorrelationId: input.requestCorrelationId ?? null,
    metadata: { role: input.role },
  })
}
