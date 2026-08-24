/**
 * Account API —— 账户审计端点（#688）。
 *
 * GET /api/v1/account/audit → 本账户（developer 维度 actor_id）审计事件。
 * 与 developer API 的单应用审计同款输出形状，过滤维度从 target_id 换成
 * actor_id = 当前 Key 归属 developer 的 id（key_created / key_revoked /
 * app_created 等事件都以该维度落库）。
 */
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { requireAccountAuth, resolveAccountDeveloper, respondAccountError } from './common.js'

export function registerAccountAuditRoutes(router: Router, deps: { sql: SqlExecutor }): void {
  const { sql } = deps

  router.get(`${API_PREFIX}/account/audit`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      // 只按 actor_id 过滤；metadata 由写入侧保证不含敏感值
      const result = await sql.query(
        `SELECT id, created_at, event_type, actor_type, result, metadata_json
         FROM audit_events WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [dev.id],
      )
      ctx.status = 200
      ctx.body = {
        audit: result.rows.map((r: Record<string, unknown>) => ({
          id: r.id,
          at: r.created_at,
          action: r.event_type,
          actor: r.actor_type,
          detail: JSON.stringify(r.metadata_json ?? {}),
        })),
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })
}
