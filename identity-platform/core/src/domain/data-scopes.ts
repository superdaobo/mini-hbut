/**
 * 数据域 scope 领域定义（#699 / #700，父 #697）。
 *
 * - 两个数据域 scope：student.grades.read / student.timetable.read；
 *   沿用 student.identity 的敏感审核策略（开发者提交用途说明 ≥10 字 + 管理员人工审批），
 *   白名单准入见 domain/clients.ts SCOPE_WHITELIST 与 0006 迁移 CHECK 约束；
 * - scope → userinfo claim 映射：注入目标只有 hbut_grades / hbut_timetable
 *   （use === 'userinfo' 时才允许出现，绝不经 id_token 泄露）；
 * - 快照 payload 形状：{ grades?, timetable?, fetched_at }，
 *   grades/timetable 为客户端抓取的原始 JSON（不解释内部结构），fetched_at 为 ISO 字符串。
 *   输入校验在 API 层（src/api/app/data-snapshots.ts），本文件只放纯定义与纯函数。
 */

/** 数据域 scope 白名单（#699 冻结契约） */
export const DATA_SCOPES = ['student.grades.read', 'student.timetable.read'] as const

export type DataScope = (typeof DATA_SCOPES)[number]

/** scope → userinfo claim 名（#700 冻结契约：hbut_grades / hbut_timetable） */
export const DATA_SCOPE_TO_CLAIM: Readonly<Record<DataScope, string>> = {
  'student.grades.read': 'hbut_grades',
  'student.timetable.read': 'hbut_timetable',
}

/** 判断是否数据域 scope */
export function isDataScope(scope: string): scope is DataScope {
  return (DATA_SCOPES as readonly string[]).includes(scope)
}

/** 规范化后的快照 payload 形状 */
export interface SnapshotPayload {
  grades?: unknown
  timetable?: unknown
  fetched_at?: string
}

/**
 * 构造注入 claim 的值：
 * `{ data: <上传的业务数据原样>, fetched_at: <ISO 字符串 | null> }`。
 * 包装层固定形状，避免客户端上传的任意结构直接成为 claim 顶层（防字段碰撞/歧义）。
 */
export function buildClaimValue(domainData: unknown, fetchedAt: unknown): Record<string, unknown> {
  return {
    data: domainData,
    fetched_at: typeof fetchedAt === 'string' ? fetchedAt : null,
  }
}
