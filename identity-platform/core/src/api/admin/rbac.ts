/**
 * Admin RBAC（#625）。
 *
 * 角色模型（与 issue 定义的 user_roles 一致，绑定内部 user id，不依赖 student_id）：
 *   - identity_reviewer：查看队列/详情 + approve/reject 审核（不可 suspend/revoke/查 audit）；
 *   - identity_admin：全部权限（含 suspend/unsuspend/revoke、audit 查询）。
 *
 * 传输约定（BFF → Core）：
 *   - x-admin-subject：会话推导的内部 user id（Web 永不从浏览器输入读取）；
 *   - 服务端每次请求都查 user_roles（无缓存），角色撤销即时生效；
 *   - 用户被禁用（users.status != 'active'）一律视为无权限（fail closed）。
 */
import type { SqlExecutor } from '../../db/types.js'
import { AdminUnauthorizedError, AdminForbiddenError } from './errors.js'

export const ADMIN_ROLES = ['identity_admin', 'identity_reviewer'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

/** 角色权限权重：admin > reviewer；mutate 类操作按需要求最低权重 */
export const ROLE_WEIGHT: Readonly<Record<AdminRole, number>> = {
  identity_reviewer: 1,
  identity_admin: 2,
}

export const ADMIN_SUBJECT_HEADER = 'x-admin-subject'
export const ADMIN_AUTH_TIME_HEADER = 'x-admin-auth-time'

/** 某用户当前生效的角色列表（已撤销的不算） */
export async function listRolesForUser(
  sql: SqlExecutor,
  userId: string,
): Promise<AdminRole[]> {
  const result = await sql.query<{ role: string }>(
    `SELECT role FROM user_roles
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY role`,
    [userId],
  )
  return result.rows
    .map((r) => r.role)
    .filter((r): r is AdminRole => (ADMIN_ROLES as readonly string[]).includes(r))
}

export interface AdminIdentity {
  userId: string
  roles: AdminRole[]
}

/** 用户是否有效（存在且 active）；不存在/禁用一律 false（fail closed） */
async function isActiveUser(sql: SqlExecutor, userId: string): Promise<boolean> {
  const result = await sql.query<{ status: string }>(
    'SELECT status FROM users WHERE id = $1',
    [userId],
  )
  const row = result.rows[0]
  return row?.status === 'active'
}

/**
 * 校验管理员身份（任意 admin 角色可查看类操作）。
 * 未登录/非管理员/用户禁用 → 抛 AdminUnauthorizedError / AdminForbiddenError。
 */
export async function requireAdminView(
  sql: SqlExecutor,
  subject: string | undefined,
): Promise<AdminIdentity> {
  if (!subject) {
    throw new AdminUnauthorizedError()
  }
  if (!(await isActiveUser(sql, subject))) {
    throw new AdminForbiddenError()
  }
  const roles = await listRolesForUser(sql, subject)
  if (roles.length === 0) {
    throw new AdminForbiddenError()
  }
  return { userId: subject, roles }
}

/**
 * 校验管理员身份并强制最低角色权重（如 suspend/revoke 需要 identity_admin）。
 * @param minRole 最低角色；缺省 identity_reviewer
 */
export async function requireAdminRole(
  sql: SqlExecutor,
  subject: string | undefined,
  minRole: AdminRole = 'identity_reviewer',
): Promise<AdminIdentity> {
  const identity = await requireAdminView(sql, subject)
  const minWeight = ROLE_WEIGHT[minRole]
  const hasEnough = identity.roles.some((r) => ROLE_WEIGHT[r] >= minWeight)
  if (!hasEnough) {
    throw new AdminForbiddenError()
  }
  return identity
}
