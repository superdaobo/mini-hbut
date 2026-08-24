/**
 * Core REST API 路由注册（#620）。
 *
 * 挂载约定（写边界，供并行 agent 对齐）：
 * - 本文件只负责 /api/v1/requests/**（#630 合同）的注册；
 * - #622（Device enrollment/approve 端点）独占 src/api/app/** 目录，
 *   本文件【不】import 该目录；#622 需导出
 *     registerAppRoutes(router: Router, deps: AppRoutesDeps): void
 *   并由主 Agent 在 Wave Gate 统一 merge 到下方调用点（见 registerApiRoutes 尾部注释）。
 * - OIDC 协议端点（/oauth/**、/.well-known/**）由 provider 自身路由处理，
 *   不经本文件（见 src/app.ts 组装）。
 */
import Router from '@koa/router'
import type Provider from 'oidc-provider'
import type { SqlExecutor } from '../db/types.js'
import { registerRequestsRoutes, API_PREFIX, type RequestsApiDeps } from './requests.js'
import { registerAppRoutes } from './app/index.js'
import { registerAdminRoutes } from './admin/index.js'
import { registerDeveloperRoutes } from './developer/index.js'
import { registerAccountRoutes } from './account/index.js'

export { API_PREFIX, HANDOFF_HEADER } from './requests.js'
export type { RequestsApiDeps } from './requests.js'

/** Core API 依赖（#622 的 registerAppRoutes 复用同一 deps 形状） */
export interface ApiDeps {
  sql: SqlExecutor
  provider: Provider
  handoffHmacKey: string | undefined
}

/**
 * 注册全部 Core API 路由（#630 requests API + 预留 #622 app 挂载点）。
 * 由 app.ts 在挂载 OIDC provider 之前调用（保证 /api/v1 不被 provider 404 吞掉）。
 */
export function registerApiRoutes(router: Router, deps: ApiDeps): void {
  registerRequestsRoutes(router, {
    sql: deps.sql,
    provider: deps.provider,
    handoffHmacKey: deps.handoffHmacKey,
  })

  // #622 app 端点（W3 Gate 已 merge）：设备 enrollment / approve / me / revoke
  registerAppRoutes(router, deps)

  // #625 admin 端点（W4 Gate merge）：审核概览/队列/详情/决策/运行时动作/审计。
  // AdminApiDeps 与 ApiDeps 形状兼容（sql + provider + handoffHmacKey + env）。
  registerAdminRoutes(router, {
    sql: deps.sql,
    provider: deps.provider,
    handoffHmacKey: deps.handoffHmacKey,
    env: process.env,
  })

  // #624 developer 端点（W4 Gate merge）：开发者门户 me/apps CRUD/回调/权限/提交/凭据/审计。
  registerDeveloperRoutes(router, {
    sql: deps.sql,
    pairwiseKey: process.env.IDENTITY_PAIRWISE_SUBJECT_KEY,
    clientSecretKek: process.env.IDENTITY_CLIENT_SECRET_KEK,
    developerClientId: process.env.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal',
    env: process.env,
  })

  // #688 account 端点：账户级 API Key——Bearer 直连 /api/v1/account/**，
  // 以及管理面 /api/v1/developer/keys（service-token + x-developer-subject 链路）。
  registerAccountRoutes(router, {
    sql: deps.sql,
    pairwiseKey: process.env.IDENTITY_PAIRWISE_SUBJECT_KEY,
    developerClientId: process.env.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal',
    env: process.env,
  })
}
