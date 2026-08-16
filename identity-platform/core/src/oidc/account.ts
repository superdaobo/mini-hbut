/**
 * findAccount 与 Claims 映射（#620 / #617 信任边界 8-10）。
 *
 * - accountId = 内部 user id（UUIDv7），绝不用学号；
 * - 学号只作为 linked_identity.subject 存储，(provider, subject) UNIQUE；
 * - 对外 sub 由 pairwiseIdentifier 派生（src/domain/subjects.ts），本文件不派生；
 * - scope → claims 映射：
 *     openid            → sub（provider 自动附加，pairwise 派生）
 *     profile           → name / preferred_username
 *     student.identity  → hbut_student_id / hbut_student_name /
 *                         hbut_verification_method / hbut_verified_at
 * - ID Token 只保留登录所需最小 claim：student.identity 类 claim
 *   （学号/姓名/验证方式）只在 use === 'userinfo' 时返回，避免第三方
 *   日志/前端无意长期保存敏感学生资料（#617 信任边界 10）。
 * - 用户 suspended/不存在 → 返回 undefined（provider 视为不可用账户，
 *   授权/刷新均失败）。
 */
import type { SqlExecutor } from '../db/types.js'
import {
  findUserById,
  findIdentityByUserId,
  type LinkedIdentityRow,
} from '../db/repos/users.repo.js'

export type ClaimsUse = 'userinfo' | 'id_token'

export interface AccountObject {
  accountId: string
  claims(use: ClaimsUse, scope: Set<string>, claims: Record<string, unknown>, rejected: string[]): Promise<Record<string, unknown>>
}

/**
 * 构造 findAccount 回调（provider 配置 findAccount: accountFinder({ sql })）。
 * sub 参数是内部 user id（accountId），不能当作学号查询。
 */
export function accountFinder(deps: { sql: SqlExecutor }): (ctx: unknown, sub: string) => Promise<AccountObject | undefined> {
  return async (_ctx: unknown, sub: string): Promise<AccountObject | undefined> => {
    const user = await findUserById(deps.sql, sub)
    if (!user || user.status !== 'active') {
      // 不存在或 suspended/disabled：provider 视为找不到账户（安全失败）
      return undefined
    }
    const identity = await findIdentityByUserId(deps.sql, sub)
    return {
      accountId: sub,
      claims: async (use, _scope, _claims, _rejected) =>
        buildClaims(identity, use),
    }
  }
}

/** profile 显示名：优先姓名快照；无绑定身份时缺省（不返回字段） */
function buildClaims(identity: LinkedIdentityRow | null, use: ClaimsUse): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!identity) {
    return out
  }
  // profile scope：name / preferred_username（已定义并经 consent 的字段）
  if (identity.student_name_snapshot) {
    out.name = identity.student_name_snapshot
    out.preferred_username = identity.student_name_snapshot
  }
  // student.identity scope：仅 UserInfo 返回（ID Token 最小化）
  if (use === 'userinfo') {
    out.hbut_student_id = identity.subject
    if (identity.student_name_snapshot) {
      out.hbut_student_name = identity.student_name_snapshot
    }
    out.hbut_verification_method = identity.verification_method
    out.hbut_verified_at = identity.verified_at.toISOString()
  }
  return out
}
