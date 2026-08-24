/**
 * Account API 路由注册（#688 账户级 API Key 一期）。
 *
 * 两组路由（挂载约定与 #622/#624 对齐：本目录导出 registerAccountRoutes，
 * 由 src/api/index.ts 统一调用，本目录不 import api/index.ts）：
 *
 * 1. Bearer 直连组（Agent 持整串 Key 调用，前缀 /api/v1/account）：
 *    GET /me                       → {user_id, key:{id,name,prefix,scopes,created_at}}
 *    GET|POST /apps；GET|PATCH|DELETE /apps/:id
 *    POST /apps/:id/redirect-uris；DELETE /apps/:id/redirect-uris/:rid
 *    PUT|GET /apps/:id/scopes；POST /apps/:id/submit
 *    POST /apps/:id/credentials/rotate；POST /apps/:id/revoke；GET /apps/:id/audit
 *    GET /devices                  → 本账户设备列表
 *    GET /audit                    → 本账户审计事件
 *    认证：Authorization: Bearer <整串Key>（requireAccountKey 中间件挂在组前缀上）。
 *
 * 2. 管理面组（/api/v1/developer/keys，复用既有 service-token +
 *    x-developer-subject 链路，供门户 BFF 调用）：签发/列表/吊销。
 */
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { requireAccountKey } from './auth.js'
import { requireAccountAuth, respondAccountError } from './common.js'
import { registerAccountAppsRoutes } from './apps.js'
import { registerAccountDevicesRoutes } from './devices.js'
import { registerAccountAuditRoutes } from './audit.js'
import { registerDeveloperKeysRoutes, type DeveloperKeysApiDeps } from './keys.js'

export interface AccountApiDeps extends DeveloperKeysApiDeps {
  sql: SqlExecutor
}

/** 注册 #688 Account API 全部路由（由 api/index.ts 调用） */
export function registerAccountRoutes(router: Router, deps: AccountApiDeps): void {
  // Bearer 认证中间件只作用于 /api/v1/account 前缀（管理面 keys 组不受影响）
  router.use(`${API_PREFIX}/account`, requireAccountKey(deps.sql))

  // GET /api/v1/account/me —— 当前 Key 与账户信息（凭据元数据来自 ctx.state）
  router.get(`${API_PREFIX}/account/me`, async (ctx) => {
    try {
      const { userId, key } = requireAccountAuth(ctx)
      ctx.status = 200
      ctx.body = {
        user_id: userId,
        key: {
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes,
          created_at: key.createdAt.toISOString(),
        },
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  registerAccountAppsRoutes(router, deps)
  registerAccountDevicesRoutes(router, deps)
  registerAccountAuditRoutes(router, deps)
  registerDeveloperKeysRoutes(router, deps)
}
