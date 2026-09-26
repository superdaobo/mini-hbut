/**
 * Scope 风险分级（唯一权威定义，#902a）。
 *
 * 背景：敏感 scope 分级原先在 api/admin/reviews.ts:50 与 api/admin/queries.ts:190
 * 各写一份字面量列表（另有 :151 / :213 两处 SQL IN 列表），四处必须一致，
 * 否则「敏感 scope 计数/过滤」会与 reviewHasSensitiveScope 的 step-up 判定漂移。
 * 本模块把权威列表下沉到领域层，API 模块一律从此导入；
 * web 侧（web/lib/developer/scopes.ts 的 risk 字段）是独立构建产物，
 * 只能靠契约测试对齐（见 web/tests/developer-validation.test.ts）。
 *
 * 判定口径：能读取受控学生数据、能长期驻留凭据、或能代表用户在游戏平台侧
 * 换取凭据的 scope 一律 sensitive（需要用途说明 + 管理员人工审批 + step-up）。
 */
import type { SqlExecutor } from '../db/types.js'

/** 敏感 scope（#625 初版两项 + #902a 游戏平台两项） */
export const SENSITIVE_SCOPES = [
  'student.identity',
  'offline_access',
  'game.read',
  'game.play',
] as const

export function scopeRisk(scope: string): 'basic' | 'sensitive' {
  return (SENSITIVE_SCOPES as readonly string[]).includes(scope) ? 'sensitive' : 'basic'
}

/**
 * 敏感 scope 的 SQL IN 列表片段（供 admin 过滤/统计复用，避免 SQL 字面量与
 * SENSITIVE_SCOPES 漂移）。值全部来自代码内常量，不含任何用户输入。
 */
export function sensitiveScopesSqlList(): string {
  return SENSITIVE_SCOPES.map((s) => `'${s}'`).join(', ')
}

/** 待审敏感 scope 行数（admin 概览 `pendingSensitiveScopes`，#902a 起含 game.*） */
export async function countPendingSensitiveScopes(sql: SqlExecutor): Promise<number> {
  const result = await sql.query<{ n: string | number }>(
    `SELECT COUNT(*) AS n
       FROM oauth_application_scopes s
       JOIN oauth_applications a ON a.id = s.application_id
      WHERE a.status = 'pending_review'
        AND s.status = 'requested'
        AND s.scope IN (${sensitiveScopesSqlList()})`,
  )
  const raw = result.rows[0]?.n ?? 0
  return typeof raw === 'number' ? raw : Number(raw)
}
