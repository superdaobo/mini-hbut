/**
 * T12（mini-hbut#1170）应用注册审核路由 —— P4-4（mini-hbut#1219）：
 * 自建注册表退役，只读保留。
 *
 * 权威源变更（见 domain/app-registry/retired.ts）：
 * - 自建注册表（app_registry_reviews 表）**不再是权威源**；
 * - 权威源 = 仓库 `manifest/apps.json`（mini-hbut-ocr-service）+ PR 审核；
 * - 本表仅作历史只读快照：列表只读端点保留，写端点全部返回 410 Gone。
 *
 * 挂载：/api/v1/apps/:appId/reviews/**（受 service-token 中间件保护，
 * 见 src/security/service-token.ts PROTECTED_PREFIXES；BFF 通道）。
 *
 * 端点（P4-4 后）：
 *   GET  /api/v1/apps/:appId/reviews                  列表（只读保留：管理员全部状态 / owner 本人）
 *   POST /api/v1/apps/:appId/reviews                  → 410 Gone（提交入口退役）
 *   POST /api/v1/apps/:appId/reviews/:reviewId/approve  → 410 Gone（审批退役）
 *   POST /api/v1/apps/:appId/reviews/:reviewId/reject   → 410 Gone（驳回退役）
 *   POST /api/v1/apps/:appId/reviews/:reviewId/provision  → 410 Gone（provision 退役，
 *     编排层 provisioner.ts 不再被调用，见 provision.routes.ts）
 *
 * 410 响应体固定（domain/app-registry/retired.ts REGISTRY_RETIRED_BODY）：
 *   {"error":"registry_retired","message":"应用接入改由清单仓库 + PR 审核（见 manifest/README.md）"}
 *
 * 边界（读路径沿用 #625 admin 路由同一套身份/RBAC 设施，不另建第二套账号认证）：
 * - 身份：x-admin-subject（pairwise sub 经 resolveUserIdBySubject 回写内部
 *   user_id，与 admin/index.ts:190-209 同逻辑）/ x-developer-subject（开发者通道）；
 * - RBAC：管理员通道 requireAdminView（未登录 401 / 无角色 403，fail closed）；
 *   开发者通道只能看自己是 owner 的应用（防枚举，非本人 404）；
 * - 410 写端点不做任何身份解析/DB 读写：资源已退役，固定响应即终态
 *   （服务令牌中间件仍在 router 之前拦截无令牌请求，回归由测试保证）。
 */
import Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { DomainError } from '../../domain/errors.js'
import { newUuidV7 } from '../../domain/ids.js'
import { resolveUserIdBySubject } from '../../domain/subject-resolution.js'
import { AppRegistryError } from '../../domain/app-registry/lifecycle.js'
import { REGISTRY_RETIRED_BODY } from '../../domain/app-registry/retired.js'
import {
  ADMIN_SUBJECT_HEADER,
  requireAdminView,
} from '../admin/rbac.js'
import { DEVELOPER_SUBJECT_HEADER } from '../developer/index.js'
import { assertAppId } from './validate.js'
import {
  listReviewsByApp,
  type AppRegistryReviewRow,
} from '../../db/repos/app_registry.repo.js'
import { registerAppRegistryProvisionRoutes, type ProvisioningDeps } from './provision.routes.js'

export interface AppRegistryApiDeps {
  sql: SqlExecutor
  /** IDENTITY_PAIRWISE_SUBJECT_KEY（把 BFF pairwise sub 解析为内部 user_id） */
  pairwiseKey?: string
  /** 开发者门户登录 client_id；缺省读 env DEVELOPER_OIDC_CLIENT_ID */
  developerClientId?: string
  /** 环境变量（测试可注入；缺省 process.env） */
  env?: Record<string, string | undefined>
  /** T12 provisioner 编排层依赖（部署侧注入的接口形状保留以兼容装配方；
   *  P4-4 退役后 provision 端点一律 410 Gone，不再编排落库） */
  provisioning?: ProvisioningDeps
}

/** AppRegistryError.code → HTTP 状态（未知 code 默认 400，fail closed；仅读路径错误映射仍用） */
const APP_REGISTRY_STATUS_BY_CODE: Record<string, number> = {
  REVISION_MISMATCH: 409,
  SELF_REVIEW_FORBIDDEN: 403,
  FORBIDDEN: 403,
  STEP_UP_REQUIRED: 403,
  INVALID_TRANSITION: 409,
  ALREADY_TERMINAL: 409,
  INVALID_REASON: 400,
  MISSING_FIELD: 400,
  ILLEGAL_REDIRECT_URI: 400,
  RELEASE_SEQ_REGRESSION: 400,
  SUBMIT_CONFLICT: 409,
}

function respondError(ctx: RouterContext, err: unknown): void {
  if (err instanceof AppRegistryError) {
    ctx.status = APP_REGISTRY_STATUS_BY_CODE[err.code] ?? 400
    ctx.body = { error: err.code, message: err.message }
    return
  }
  if (err instanceof DomainError) {
    ctx.status = err.status
    ctx.body = { error: err.code, message: err.message }
    return
  }
  ctx.app.emit('error', err as Error, ctx)
  ctx.status = 500
  ctx.body = { error: 'internal' }
}

/** P4-4：退役写端点统一 410 Gone（固定响应体，见 retired.ts） */
function respondRegistryRetired(ctx: RouterContext): void {
  ctx.status = 410
  ctx.body = REGISTRY_RETIRED_BODY
}

function readAdminSubject(ctx: RouterContext): string | undefined {
  const value = ctx.get(ADMIN_SUBJECT_HEADER)
  return value.length > 0 ? value : undefined
}

/**
 * 开发者身份：x-developer-subject → user_id → developer 行。
 * developer 行不存在时按 user_id 幂等建档（#624 语义，developer/index.ts:115-131）；
 * subject 缺失/无法解析 → null（fail closed）。
 */
async function resolveDeveloper(
  sql: SqlExecutor,
  deps: AppRegistryApiDeps,
  subject: string | undefined,
): Promise<{ userId: string; developerId: string } | null> {
  if (!subject) {
    return null
  }
  let userId: string | null
  try {
    userId = await resolveUserIdBySubject({
      sql,
      pairwiseKey: deps.pairwiseKey ?? deps.env?.IDENTITY_PAIRWISE_SUBJECT_KEY,
      clientId: deps.developerClientId ?? deps.env?.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal',
      subject,
    })
  } catch {
    return null
  }
  if (!userId) {
    return null
  }
  const result = await sql.query<{ id: string }>(
    'SELECT id FROM developers WHERE user_id = $1',
    [userId],
  )
  const existing = result.rows[0]?.id
  if (existing) {
    return { userId, developerId: existing }
  }
  const developerId = `dev_${newUuidV7()}`
  await sql.query(
    `INSERT INTO developers (id, user_id, display_name, status) VALUES ($1, $2, '', 'active')`,
    [developerId, userId],
  )
  return { userId, developerId }
}

/** 管理员视角 DTO（全部字段，含 casdoor 配置与产物回执） */
function toAdminDTO(row: AppRegistryReviewRow): Record<string, unknown> {
  return {
    review_id: row.id,
    app_id: row.app_id,
    version: row.version,
    revision: row.revision,
    form: row.form,
    entry: row.entry,
    redirect_uris: row.redirect_uris,
    allowed_groups: row.allowed_groups,
    data_domains: row.data_domains,
    compat: row.compat,
    module: row.module,
    casdoor: row.casdoor,
    owner: row.owner,
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at,
    reviewer: row.reviewer,
    reviewed_at: row.reviewed_at,
    decision: row.decision,
    decision_reason: row.decision_reason,
    status: row.status,
    artifact_receipts: row.artifact_receipts,
  }
}

/** owner 视角 DTO（§6.1：状态/结论/可读原因/审计；不含 provisioner 内部回执） */
function toOwnerDTO(row: AppRegistryReviewRow): Record<string, unknown> {
  return {
    review_id: row.id,
    app_id: row.app_id,
    version: row.version,
    revision: row.revision,
    form: row.form,
    entry: row.entry,
    redirect_uris: row.redirect_uris,
    allowed_groups: row.allowed_groups,
    data_domains: row.data_domains,
    compat: row.compat,
    module: row.module,
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at,
    reviewer: row.reviewer,
    reviewed_at: row.reviewed_at,
    decision: row.decision,
    decision_reason: row.decision_reason,
    status: row.status,
  }
}

/** 注册 T12 应用注册审核路由（由 registerApiRoutes 统一挂载，见 src/api/index.ts） */
export function registerAppRegistryRoutes(router: Router, deps: AppRegistryApiDeps): void {
  const { sql } = deps
  const pairwiseKey = deps.pairwiseKey ?? deps.env?.IDENTITY_PAIRWISE_SUBJECT_KEY
  const developerClientId = deps.developerClientId ?? deps.env?.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal'

  // 与 admin 路由同逻辑：BFF 传的可能是 pairwise sub，解析成内部 user_id 回写
  // （admin/index.ts:190-209）；解析失败保留原值（直连内部 user_id 的 BFF 不受影响）
  router.use(async (ctx, next) => {
    const subject = readAdminSubject(ctx)
    if (subject) {
      try {
        const userId = await resolveUserIdBySubject({ sql, pairwiseKey, clientId: developerClientId, subject })
        if (userId) {
          ctx.request.headers[ADMIN_SUBJECT_HEADER] = userId
        }
      } catch {
        // 密钥未配置等：保留原 subject，由 RBAC fail closed
      }
    }
    await next()
  })

  // POST /api/v1/apps/:appId/reviews —— 提交（P4-4 退役：410 Gone）
  router.post(`${API_PREFIX}/apps/:appId/reviews`, async (ctx) => {
    respondRegistryRetired(ctx)
  })

  // GET /api/v1/apps/:appId/reviews —— 列表（只读保留：管理员全部状态；owner 仅本人应用）
  router.get(`${API_PREFIX}/apps/:appId/reviews`, async (ctx) => {
    try {
      const appId = assertAppId(ctx.params.appId ?? '')
      const adminSubject = readAdminSubject(ctx)
      if (adminSubject) {
        // 管理员通道：requireAdminView（未登录 401 / 无角色 403，fail closed）
        await requireAdminView(sql, adminSubject)
        const reviews = await listReviewsByApp(sql, appId)
        ctx.status = 200
        ctx.body = { app_id: appId, total: reviews.length, reviews: reviews.map(toAdminDTO) }
        return
      }
      // 开发者通道：只能看自己是 owner 的应用（防枚举，非本人 404）
      const developer = await resolveDeveloper(sql, deps, ctx.get(DEVELOPER_SUBJECT_HEADER))
      if (!developer) {
        throw new DomainError('UNAUTHORIZED', '缺少身份信息（x-admin-subject 或 x-developer-subject）', 401)
      }
      const reviews = await listReviewsByApp(sql, appId)
      if (!reviews.some((r) => r.owner === developer.developerId)) {
        throw new DomainError('REVIEW_NOT_FOUND', '审核记录不存在', 404)
      }
      ctx.status = 200
      ctx.body = { app_id: appId, total: reviews.length, reviews: reviews.map(toOwnerDTO) }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/apps/:appId/reviews/:reviewId/approve —— 批准（P4-4 退役：410 Gone）
  router.post(`${API_PREFIX}/apps/:appId/reviews/:reviewId/approve`, async (ctx) => {
    respondRegistryRetired(ctx)
  })

  // POST /api/v1/apps/:appId/reviews/:reviewId/reject —— 驳回（P4-4 退役：410 Gone）
  router.post(`${API_PREFIX}/apps/:appId/reviews/:reviewId/reject`, async (ctx) => {
    respondRegistryRetired(ctx)
  })

  // POST /api/v1/apps/:appId/reviews/:reviewId/provision —— 上架（P4-4 退役：410 Gone，
  // 编排层 provisioner.ts 不再被调用，见 provision.routes.ts）
  registerAppRegistryProvisionRoutes(router, {
    sql,
    env: deps.env ?? process.env,
    provisioning: deps.provisioning,
  })
}
