/**
 * Admin API 路由注册（issue #625）。
 *
 * 挂载约定（与 #622 对齐，见 src/api/index.ts 尾部注释）：
 * - 本文件导出 `registerAdminRoutes(router, deps)`，由主 Agent 在 Wave Gate
 *   统一 merge 到 src/api/index.ts 的 registerApiRoutes 中（本目录不 import
 *   api/index.ts，避免循环依赖）；
 * - deps 形状与 ApiDeps 兼容：{ sql, provider, handoffHmacKey } 之外的
 *   AdminApiDeps 只要求 sql（provider 保留对齐签名）。
 *
 * 安全边界（服务端 RBAC，绝不信任前端）：
 * - 身份：x-admin-subject header（BFF 从加密会话推导，Web 浏览器永不直接传）；
 * - 角色：identity_reviewer 可查看 + 审核；identity_admin 才可 suspend/revoke/
 *   audit 查询（user_roles 每次请求实时查询，撤销即时生效）；
 * - step-up：高风险动作要求 x-admin-auth-time（会话 iat）在窗口内
 *   （IDENTITY_ADMIN_STEP_UP_SECONDS，默认 600s）；
 * - CSRF：浏览器 → BFF 层由 SameSite=Lax + 双提交 Cookie + Origin 校验承担
 *   （web/lib/developer/csrf.ts 同一机制）；Core 只接受 BFF 服务端调用；
 * - 幂等：所有 mutation 条件更新，重复提交返回既有状态（不重复审计/副作用）；
 * - 防枚举/IDOR：app/review id 均为 UUIDv7；review 必须属于路径中的 app；
 *   self-review 默认禁止；响应不含学号/secret。
 */
import Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { resolveUserIdBySubject } from '../../domain/subject-resolution.js'
import { DomainError } from '../../domain/errors.js'
import {
  ADMIN_SUBJECT_HEADER,
  ADMIN_AUTH_TIME_HEADER,
  requireAdminRole,
  requireAdminView,
  type AdminRole,
} from './rbac.js'
import { stepUpWindowSeconds, assertRecentAuth } from './stepup.js'
import {
  getOverviewStats,
  listApplications,
  getApplicationDetail,
  listRedirectUrisFor,
  listScopesFor,
  listReviewsForApplication,
  findReviewById,
  listAuditEventsAdmin,
  type AdminAppListFilter,
} from './queries.js'
import {
  ensurePendingReview,
  approveReview,
  rejectReview,
  reviewHasSensitiveScope,
  type AdminReviewRowLike,
} from './reviews.js'
import { suspendClient, unsuspendClient, revokeClient } from './runtime.js'
import { toAppSummary, toAppDetail, toReviewDTO, toAuditDTO, type AdminMeDTO } from './serialize.js'
import {
  AdminInvalidInputError,
  ReviewNotFoundError,
  AdminClientNotFoundError,
} from './errors.js'

/** registerAdminRoutes 依赖（与 ApiDeps 形状兼容） */
export interface AdminApiDeps {
  sql: SqlExecutor
  /** 保留对齐 #620 ApiDeps 签名（suspend/revoke 直接作用于 adapter 数据表，无需 provider 引用） */
  provider?: unknown
  handoffHmacKey?: string
  /** 环境变量（测试可注入；缺省 process.env） */
  env?: Record<string, string | undefined>
  /** IDENTITY_PAIRWISE_SUBJECT_KEY：把 BFF 会话的 pairwise sub 解析为内部 user_id */
  pairwiseKey?: string
  /** 开发者门户登录 client_id（developer-portal）；缺省读取 env DEVELOPER_OIDC_CLIENT_ID */
  developerClientId?: string
}

const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 100
const MAX_OFFSET = 5000

/** 读取 x-admin-subject（BFF 会话推导；缺失 → undefined） */
function readSubject(ctx: RouterContext): string | undefined {
  const value = ctx.get(ADMIN_SUBJECT_HEADER)
  return value.length > 0 ? value : undefined
}

/** 读取 x-admin-auth-time（epoch 秒；缺失/非法 → undefined → step-up fail closed） */
function readAuthTime(ctx: RouterContext): number | undefined {
  const value = ctx.get(ADMIN_AUTH_TIME_HEADER)
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 统一错误响应（DomainError → status/code/message；其余 500 不泄露细节） */
function respondError(ctx: RouterContext, err: unknown): void {
  if (err instanceof DomainError) {
    ctx.status = err.status
    ctx.body = { error: err.code, message: err.message }
    return
  }
  ctx.app.emit('error', err as Error, ctx)
  ctx.status = 500
  ctx.body = { error: 'internal' }
}

async function readJsonBody(ctx: RouterContext): Promise<Record<string, unknown>> {
  let raw: unknown
  try {
    raw = JSON.parse(await readRawBody(ctx))
  } catch {
    throw new AdminInvalidInputError('请求体必须是合法 JSON 对象')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AdminInvalidInputError('请求体必须是 JSON 对象')
  }
  return raw as Record<string, unknown>
}

function readRawBody(ctx: RouterContext): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = ''
    ctx.req.setEncoding('utf8')
    ctx.req.on('data', (chunk: Buffer | string) => {
      data += chunk.toString('utf8')
      if (data.length > 64 * 1024) {
        reject(new AdminInvalidInputError('请求体过大'))
        ctx.req.destroy()
      }
    })
    ctx.req.on('end', () => resolve(data))
    ctx.req.on('error', reject)
  })
}

/** 解析整数查询参数（带边界） */
function readIntParam(
  ctx: RouterContext,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = ctx.query[name]
  if (raw === undefined || Array.isArray(raw)) {
    return fallback
  }
  const parsed = Number(String(raw))
  if (!Number.isInteger(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

function readStrParam(ctx: RouterContext, name: string): string | undefined {
  const raw = ctx.query[name]
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return undefined
  }
  return raw.trim().slice(0, 100)
}

/** 校验路径中的 review 确实属于该应用（防 IDOR 参数错配） */
async function loadReviewForApp(
  sql: SqlExecutor,
  reviewId: string,
  applicationId: string,
): Promise<AdminReviewRowLike> {
  const review = await findReviewById(sql, reviewId)
  if (!review || review.application_id !== applicationId) {
    throw new ReviewNotFoundError()
  }
  return review
}

/** 注册 #625 Admin API 路由（由主 Agent 在 api/index.ts 调用） */
export function registerAdminRoutes(router: Router, deps: AdminApiDeps): void {
  const { sql } = deps
  const env = deps.env ?? process.env
  const stepUpSeconds = stepUpWindowSeconds(env)
  const pairwiseKey = deps.pairwiseKey ?? env.IDENTITY_PAIRWISE_SUBJECT_KEY
  const developerClientId =
    deps.developerClientId ?? env.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal'

  // BFF 会话 sub 是 pairwise 派生值（developer-portal client），
  // 而 RBAC/user_roles 按内部 user_id 关联：先解析并写回 header。
  // 解析失败（sub 不存在/密钥缺失）→ 视为无身份（fail closed，不匹配任何用户）。
  router.use(async (ctx, next) => {
    const sub = readSubject(ctx)
    if (sub) {
      try {
        const userId = await resolveUserIdBySubject({
          sql,
          pairwiseKey,
          clientId: developerClientId,
          subject: sub,
        })
        if (userId) {
          // 写回 request header（ctx.set 只写 response header，后续 handler 的 ctx.get 读不到）
          ctx.request.headers[ADMIN_SUBJECT_HEADER] = userId
        }
      } catch {
        // 密钥未配置等：保留原 sub（RBAC 查询自然匹配不到 → 401/403）
      }
    }
    await next()
  })

  // 高风险动作统一守卫：identity_admin + 近期认证
  function guardHighRisk(ctx: RouterContext) {
    return async (fn: () => Promise<unknown>): Promise<void> => {
      try {
        await requireAdminRole(sql, readSubject(ctx), 'identity_admin')
        assertRecentAuth(readAuthTime(ctx), stepUpSeconds)
        ctx.status = 200
        ctx.body = await fn()
      } catch (err) {
        respondError(ctx, err)
      }
    }
  }

  // GET /api/v1/admin/me —— 当前管理员身份 + 角色（BFF 会话引导用）
  router.get(`${API_PREFIX}/admin/me`, async (ctx) => {
    try {
      const identity = await requireAdminView(sql, readSubject(ctx))
      const dto: AdminMeDTO = { sub: identity.userId, roles: identity.roles }
      ctx.status = 200
      ctx.body = dto
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/admin/overview —— 概览统计 + 最近安全事件（事件仅 identity_admin 可见，
  // 与 audit 查询权限一致；reviewer 只看到计数）
  router.get(`${API_PREFIX}/admin/overview`, async (ctx) => {
    try {
      const identity = await requireAdminView(sql, readSubject(ctx))
      const isAdmin = identity.roles.includes('identity_admin')
      const [stats, recent] = await Promise.all([
        getOverviewStats(sql),
        isAdmin ? listAuditEventsAdmin(sql, {}, 10) : Promise.resolve([]),
      ])
      ctx.status = 200
      ctx.body = {
        pending_reviews: stats.pendingReviews,
        pending_sensitive_scopes: stats.pendingSensitiveScopes,
        active_clients: stats.activeClients,
        suspended_clients: stats.suspendedClients,
        recent_events: recent.map(toAuditDTO),
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/admin/apps —— 应用队列（默认 pending 优先 + 过滤/分页）
  router.get(`${API_PREFIX}/admin/apps`, async (ctx) => {
    try {
      await requireAdminView(sql, readSubject(ctx))
      const filter: AdminAppListFilter = {
        status: readStrParam(ctx, 'status'),
        clientType: readStrParam(ctx, 'client_type'),
        search: readStrParam(ctx, 'search'),
        developer: readStrParam(ctx, 'developer'),
        sensitiveScope: ctx.query.sensitive_scope === '1' || ctx.query.sensitive_scope === 'true',
      }
      const limit = readIntParam(ctx, 'limit', DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT)
      const offset = readIntParam(ctx, 'offset', 0, 0, MAX_OFFSET)
      const { rows, total } = await listApplications(sql, filter, { limit, offset })
      ctx.status = 200
      ctx.body = { apps: rows.map(toAppSummary), total }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/admin/apps/:id —— 审核详情（8 分区数据源；懒物化 pending review）
  router.get(`${API_PREFIX}/admin/apps/:id`, async (ctx) => {
    try {
      await requireAdminView(sql, readSubject(ctx))
      const applicationId = ctx.params.id as string
      const detail = await getApplicationDetail(sql, applicationId)
      if (!detail.app) {
        throw new AdminClientNotFoundError()
      }
      // 懒物化审核快照（pending_review 且无/过期快照时自动 supersede + 重建）
      await ensurePendingReview(sql, applicationId)
      const [redirectUris, scopes, reviews] = await Promise.all([
        listRedirectUrisFor(sql, applicationId),
        listScopesFor(sql, applicationId),
        listReviewsForApplication(sql, applicationId),
      ])
      ctx.status = 200
      ctx.body = {
        app: toAppDetail(detail.app, detail.developer, redirectUris, scopes, reviews),
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/admin/apps/:id/reviews —— 审核历史
  router.get(`${API_PREFIX}/admin/apps/:id/reviews`, async (ctx) => {
    try {
      await requireAdminView(sql, readSubject(ctx))
      const applicationId = ctx.params.id as string
      const detail = await getApplicationDetail(sql, applicationId)
      if (!detail.app) {
        throw new AdminClientNotFoundError()
      }
      await ensurePendingReview(sql, applicationId)
      const reviews = await listReviewsForApplication(sql, applicationId)
      ctx.status = 200
      ctx.body = { reviews: reviews.map(toReviewDTO) }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/admin/apps/:id/reviews/:reviewId/approve
  //  - reviewer 及以上；含敏感 scope 的 review 需要近期认证（step-up）；
  //  - body: { scope_decisions: [{scope, decision, note?}], note? }
  router.post(`${API_PREFIX}/admin/apps/:id/reviews/:reviewId/approve`, async (ctx) => {
    try {
      const subject = readSubject(ctx)
      const identity = await requireAdminRole(sql, subject, 'identity_reviewer')
      const applicationId = ctx.params.id as string
      const reviewId = ctx.params.reviewId as string
      const review = await loadReviewForApp(sql, reviewId, applicationId)
      // step-up：仅对 pending 且含敏感 scope 的审核要求近期认证
      if (review.status === 'pending' && reviewHasSensitiveScope(review)) {
        assertRecentAuth(readAuthTime(ctx), stepUpSeconds)
      }
      const body = await readJsonBody(ctx)
      const result = await approveReview(sql, {
        reviewId,
        adminUserId: identity.userId,
        scopeDecisions: body.scope_decisions,
        note: body.note,
        requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
      })
      ctx.status = 200
      ctx.body = { review: result }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/admin/apps/:id/reviews/:reviewId/reject
  //  body: { reason }（开发者可读，必填 1..2000）
  router.post(`${API_PREFIX}/admin/apps/:id/reviews/:reviewId/reject`, async (ctx) => {
    try {
      const identity = await requireAdminRole(sql, readSubject(ctx), 'identity_reviewer')
      const applicationId = ctx.params.id as string
      const reviewId = ctx.params.reviewId as string
      await loadReviewForApp(sql, reviewId, applicationId)
      const body = await readJsonBody(ctx)
      const result = await rejectReview(sql, {
        reviewId,
        adminUserId: identity.userId,
        reason: typeof body.reason === 'string' ? body.reason : '',
        requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
      })
      ctx.status = 200
      ctx.body = { review: result }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/admin/apps/:id/suspend —— identity_admin + step-up
  router.post(`${API_PREFIX}/admin/apps/:id/suspend`, async (ctx) => {
    await guardHighRisk(ctx)(async () => {
      const identity = await requireAdminRole(sql, readSubject(ctx), 'identity_admin')
      const body = await readJsonBody(ctx)
      const result = await suspendClient(sql, {
        applicationId: ctx.params.id as string,
        adminUserId: identity.userId,
        reason: typeof body.reason === 'string' ? body.reason : '',
        requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
      })
      return { client: result }
    })
  })

  // POST /api/v1/admin/apps/:id/unsuspend —— identity_admin + step-up
  router.post(`${API_PREFIX}/admin/apps/:id/unsuspend`, async (ctx) => {
    await guardHighRisk(ctx)(async () => {
      const identity = await requireAdminRole(sql, readSubject(ctx), 'identity_admin')
      const body = await readJsonBody(ctx)
      const result = await unsuspendClient(sql, {
        applicationId: ctx.params.id as string,
        adminUserId: identity.userId,
        reason: typeof body.reason === 'string' ? body.reason : '',
        requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
      })
      return { client: result }
    })
  })

  // POST /api/v1/admin/apps/:id/revoke —— identity_admin + step-up（终态，不可逆）
  router.post(`${API_PREFIX}/admin/apps/:id/revoke`, async (ctx) => {
    await guardHighRisk(ctx)(async () => {
      const identity = await requireAdminRole(sql, readSubject(ctx), 'identity_admin')
      const body = await readJsonBody(ctx)
      const result = await revokeClient(sql, {
        applicationId: ctx.params.id as string,
        adminUserId: identity.userId,
        reason: typeof body.reason === 'string' ? body.reason : '',
        requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
      })
      return { client: result }
    })
  })

  // GET /api/v1/admin/audit —— 审计查询（仅 identity_admin）
  router.get(`${API_PREFIX}/admin/audit`, async (ctx) => {
    try {
      await requireAdminRole(sql, readSubject(ctx), 'identity_admin')
      const limit = readIntParam(ctx, 'limit', DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT)
      const rows = await listAuditEventsAdmin(
        sql,
        {
          eventType: readStrParam(ctx, 'event_type'),
          targetType: readStrParam(ctx, 'target_type'),
          before: readStrParam(ctx, 'before'),
        },
        limit,
      )
      ctx.status = 200
      ctx.body = { events: rows.map(toAuditDTO) }
    } catch (err) {
      respondError(ctx, err)
    }
  })
}

export type { AdminRole }
