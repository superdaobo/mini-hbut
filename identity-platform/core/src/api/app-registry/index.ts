/**
 * T12（mini-hbut#1170）应用注册审核路由。
 *
 * 挂载：/api/v1/apps/:appId/reviews/**（受 service-token 中间件保护，
 * 见 src/security/service-token.ts PROTECTED_PREFIXES；BFF 通道）。
 *
 * 端点：
 *   POST /api/v1/apps/:appId/reviews                  提交（开发者通道，幂等）
 *   GET  /api/v1/apps/:appId/reviews                  列表（管理员全部状态 / owner 本人）
 *   POST /api/v1/apps/:appId/reviews/:reviewId/approve  批准（管理员 + step-up）
 *   POST /api/v1/apps/:appId/reviews/:reviewId/reject  驳回（管理员 + step-up + 原因必填）
 *   POST /api/v1/apps/:appId/reviews/:reviewId/provision  上架（管理员 + step-up；
 *     编排层 provisioner.ts，依赖部署侧注入，见 provision.routes.ts）
 *
 * 边界（与 #625 admin 路由同一套身份/审计设施，不另建第二套账号认证）：
 * - 身份：x-admin-subject（pairwise sub 经 resolveUserIdBySubject 回写，
 *   与 admin/index.ts:190-209 同逻辑）/ x-developer-subject（developer 通道）；
 * - RBAC：approve/reject 要求 identity_reviewer 及以上（requireAdminRole，
 *   rbac.ts:86-99，实时查 user_roles，fail closed）；
 * - step-up：approve 与 reject 都要求 x-admin-auth-time 在
 *   IDENTITY_ADMIN_STEP_UP_SECONDS 窗口内（stepup.ts:34-48；契约未定义敏感
 *   数据域分级，按 fail-closed 对两类决定统一要求近期再认证，比旧 reject
 *   无 step-up 更严）；
 * - 领域层只做判定（lifecycle.ts 守卫 + revision.ts 内容寻址 + idempotency.ts
 *   重复提交判定），本层负责落库、审计、错误映射，不重写状态机；
 * - 错误映射（AppRegistryError.code → HTTP）：
 *   REVISION_MISMATCH 409 / SELF_REVIEW_FORBIDDEN 403 / FORBIDDEN 403 /
 *   STEP_UP_REQUIRED 403 / INVALID_TRANSITION 409 / ALREADY_TERMINAL 409 /
 *   INVALID_REASON 400 / MISSING_FIELD 400 / ILLEGAL_REDIRECT_URI 400 /
 *   RELEASE_SEQ_REGRESSION 400；
 * - 审计：submit/approve/reject 写 audit_events（strict 脱敏，
 *   observability/audit），幂等重放不重复审计。
 */
import Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { readJsonBody } from '../app/body.js'
import { resolveUserIdBySubject } from '../../domain/subject-resolution.js'
import { DomainError } from '../../domain/errors.js'
import { newUuidV7 } from '../../domain/ids.js'
import {
  ADMIN_AUTH_TIME_HEADER,
  ADMIN_SUBJECT_HEADER,
  requireAdminRole,
  requireAdminView,
  type AdminRole,
} from '../admin/rbac.js'
import { stepUpWindowSeconds, assertRecentAuth } from '../admin/stepup.js'
import { DEVELOPER_SUBJECT_HEADER } from '../developer/index.js'
import {
  AppRegistryError,
  assertApprovalAllowed,
  assertRejectionAllowed,
  assertSubmittable,
} from '../../domain/app-registry/lifecycle.js'
import { computeReviewRevision, revisionMatches, type RevisionInput } from '../../domain/app-registry/revision.js'
import { decideSubmissionReplay } from '../../domain/app-registry/idempotency.js'
import type { ReviewStatus } from '../../domain/app-registry/types.js'
import {
  findPendingByApp,
  findReviewById,
  insertReview,
  listReviewsByApp,
  maxReleaseSeqForApp,
  nextVersionForApp,
  updateStatus,
  setReviewDecision,
  type AppRegistryReviewRow,
} from '../../db/repos/app_registry.repo.js'
import { writeAuditEvent } from '../../observability/audit/index.js'
import { assertAppId, parseSubmitBody, type SubmitContent } from './validate.js'
import { registerAppRegistryProvisionRoutes, type ProvisioningDeps } from './provision.routes.js'

export interface AppRegistryApiDeps {
  sql: SqlExecutor
  /** IDENTITY_PAIRWISE_SUBJECT_KEY（把 BFF pairwise sub 解析为内部 user_id） */
  pairwiseKey?: string
  /** 开发者门户登录 client_id；缺省读 env DEVELOPER_OIDC_CLIENT_ID */
  developerClientId?: string
  /** 环境变量（测试可注入；缺省 process.env） */
  env?: Record<string, string | undefined>
  /** T12 provisioner 编排层依赖（部署侧注入：四适配器 + 快照读取器，见 provision.routes.ts）；
   *  未配置 → POST .../provision 返回 503 provisioner_not_configured（fail closed） */
  provisioning?: ProvisioningDeps
}

/** AppRegistryError.code → HTTP 状态（未知 code 默认 400，fail closed） */
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

function readAdminSubject(ctx: RouterContext): string | undefined {
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

/** 把审核记录行还原为 revision 输入（内容与存储的快照同源） */
function rowToRevisionInput(row: AppRegistryReviewRow): RevisionInput {
  return {
    app_id: row.app_id,
    form: row.form,
    entry: row.entry ?? '',
    redirect_uris: row.redirect_uris,
    allowed_groups: row.allowed_groups,
    data_domains: row.data_domains,
    compat: row.compat,
    module: row.module,
    casdoor: row.casdoor,
    owner: row.owner,
  }
}

/** self-review 比对：审核人 user_id vs owner 的 user_id（owner developer 缺失时退回提交人） */
async function resolveOwnerUserId(sql: SqlExecutor, review: AppRegistryReviewRow): Promise<string> {
  const result = await sql.query<{ user_id: string }>(
    'SELECT user_id FROM developers WHERE id = $1',
    [review.owner],
  )
  return result.rows[0]?.user_id ?? review.submitted_by
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '23505' || String((err as Error)?.message ?? '').includes('duplicate key')
}

export interface SubmitResult {
  review: AppRegistryReviewRow
  /** 是否新建行（false = 幂等重放，返回既有 pending） */
  created: boolean
  /** 幂等语义：created / replay / superseded（新建且作废旧 pending） */
  idempotency: 'created' | 'replay' | 'superseded'
  /** 被 supersede 的旧 review id（superseded 时有值） */
  supersededReviewId: string | null
}

/**
 * 提交事务（单 pending 不变量 + §4.1 幂等）：
 * - SELECT ... FOR UPDATE 锁该应用既有行，串行化同应用并发提交
 *   （无既有行时无锁，靠 (app_id, version) 唯一约束裁决，冲突重试）；
 * - decideSubmissionReplay：无 pending → 新建；同 (app_id, revision) → 返回既有；
 *   同 app 不同 revision → 旧行置 superseded（条件 UPDATE）再新建。
 */
async function submitReview(
  sql: SqlExecutor,
  content: SubmitContent,
  revision: string,
  developer: { userId: string; developerId: string },
  requestCorrelationId: string | null,
  maxAttempts = 3,
): Promise<SubmitResult> {
  const appId = content.app_id
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sql.withTransaction(async (tx) => {
        await tx.query('SELECT id FROM app_registry_reviews WHERE app_id = $1 FOR UPDATE', [appId])
        const pending = await findPendingByApp(tx, appId)
        const decision = decideSubmissionReplay(
          pending ? { review_id: pending.id, revision: pending.revision } : null,
          { revision },
        )
        if (decision.kind === 'replay') {
          // 幂等重放：不新增行、不重复审计（decideSubmissionReplay 返回 replay 时既有 pending 必存在）
          if (!pending) {
            throw new AppRegistryError('SUBMIT_CONFLICT', '并发提交冲突，请重试')
          }
          return {
            review: pending,
            created: false,
            idempotency: 'replay' as const,
            supersededReviewId: null,
          }
        }
        let supersededReviewId: string | null = null
        if (decision.kind === 'supersede') {
          const moved = await updateStatus(tx, { reviewId: decision.reviewId, from: 'submitted', to: 'superseded' })
          if (!moved) {
            // 并发下旧行已被他人迁移：回滚重试重新判定
            throw new AppRegistryError('SUBMIT_CONFLICT', '并发提交冲突，请重试')
          }
          supersededReviewId = decision.reviewId
        }
        const version = await nextVersionForApp(tx, appId)
        const created = await insertReview(tx, {
          id: newUuidV7(),
          appId,
          version,
          revision,
          form: content.form,
          entry: content.form === 'embedded' ? content.entry : null,
          redirectUris: content.redirect_uris,
          allowedGroups: content.allowed_groups,
          dataDomains: content.data_domains,
          compat: content.compat,
          module: content.module,
          casdoor: content.casdoor,
          owner: content.owner,
          submittedBy: developer.userId,
        })
        await writeAuditEvent(tx, {
          eventType: 'APP_REVIEW_SUBMITTED',
          actorType: 'developer',
          actorId: developer.userId,
          targetType: 'app_registry_review',
          targetId: created.id,
          result: 'success',
          requestCorrelationId,
          metadata: {
            app_id: appId,
            review_id: created.id,
            version: version,
            revision,
            idempotency: decision.kind === 'supersede' ? 'superseded' : 'created',
            ...(supersededReviewId ? { superseded_review_id: supersededReviewId } : {}),
          },
        })
        return {
          review: created,
          created: true,
          idempotency: decision.kind === 'supersede' ? ('superseded' as const) : ('created' as const),
          supersededReviewId,
        }
      })
    } catch (err) {
      const retriable = isUniqueViolation(err) || (err instanceof AppRegistryError && err.code === 'SUBMIT_CONFLICT')
      if (retriable && attempt < maxAttempts) {
        continue
      }
      throw err
    }
  }
}

/** 审核决定（approve/reject）：领域层守卫 → 条件迁移落库 → 审计（同一事务） */
async function applyDecision(
  sql: SqlExecutor,
  opts: {
    review: AppRegistryReviewRow
    adminUserId: string
    kind: 'approve' | 'reject'
    reason?: string
    requestCorrelationId: string | null
  },
): Promise<void> {
  const { review, adminUserId, kind, requestCorrelationId } = opts
  const appId = review.app_id
  // 当前内容 = 该应用最新 submitted 记录的内容（没有 submitted 时取本记录自身）
  const latest = await findPendingByApp(sql, appId)
  const currentContent = latest && latest.id !== review.id ? rowToRevisionInput(latest) : rowToRevisionInput(review)
  const ownerUserId = await resolveOwnerUserId(sql, review)

  if (kind === 'approve') {
    try {
      assertApprovalAllowed({
        review: { revision: review.revision, owner: ownerUserId, status: review.status as ReviewStatus },
        currentContent,
        reviewerId: adminUserId,
      })
    } catch (err) {
      if (err instanceof AppRegistryError && err.code === 'REVISION_MISMATCH') {
        // TOCTOU：内容已变 → 旧记录作废（与旧模型 reviews.ts 相同语义）
        await updateStatus(sql, { reviewId: review.id, from: 'submitted', to: 'superseded' }).catch(() => undefined)
      }
      throw err
    }
    await sql.withTransaction(async (tx) => {
      const moved = await updateStatus(tx, { reviewId: review.id, from: 'submitted', to: 'approved' })
      if (!moved) {
        throw new AppRegistryError('INVALID_TRANSITION', `只有 submitted 可批准，当前 ${review.status}`)
      }
      await setReviewDecision(tx, { reviewId: review.id, reviewer: adminUserId, decision: 'approved', decisionReason: null })
      await writeAuditEvent(tx, {
        eventType: 'APP_REVIEW_APPROVED',
        actorType: 'admin',
        actorId: adminUserId,
        targetType: 'app_registry_review',
        targetId: review.id,
        result: 'success',
        requestCorrelationId,
        metadata: { app_id: appId, review_id: review.id, version: review.version, revision: review.revision },
      })
    })
    return
  }

  // reject：原因必填（领域层 assertReason → INVALID_REASON 400）
  const reason = assertRejectionAllowed({
    review: { status: review.status as ReviewStatus },
    reviewerId: adminUserId,
    owner: ownerUserId,
    reason: opts.reason ?? '',
  })
  if (!revisionMatches(review, currentContent)) {
    await updateStatus(sql, { reviewId: review.id, from: 'submitted', to: 'superseded' }).catch(() => undefined)
    throw new AppRegistryError('REVISION_MISMATCH', '应用内容在提交后已变化，原审核已作废，请重新提交')
  }
  await sql.withTransaction(async (tx) => {
    const moved = await updateStatus(tx, { reviewId: review.id, from: 'submitted', to: 'rejected' })
    if (!moved) {
      throw new AppRegistryError('INVALID_TRANSITION', `只有 submitted 可驳回，当前 ${review.status}`)
    }
    await setReviewDecision(tx, { reviewId: review.id, reviewer: adminUserId, decision: 'rejected', decisionReason: reason })
    await writeAuditEvent(tx, {
      eventType: 'APP_REVIEW_REJECTED',
      actorType: 'admin',
      actorId: adminUserId,
      targetType: 'app_registry_review',
      targetId: review.id,
      result: 'success',
      requestCorrelationId,
      metadata: { app_id: appId, review_id: review.id, version: review.version, revision: review.revision, reason },
    })
  })
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

/** 按 reviewId 加载并校验属于路径中的应用（IDOR 防护：不匹配按 404） */
async function loadReviewForApp(
  sql: SqlExecutor,
  reviewId: string,
  appId: string,
): Promise<AppRegistryReviewRow> {
  const review = await findReviewById(sql, reviewId)
  if (!review || review.app_id !== appId) {
    throw new DomainError('REVIEW_NOT_FOUND', '审核记录不存在', 404)
  }
  return review
}

/** 注册 T12 应用注册审核路由（由 registerApiRoutes 统一挂载，见 src/api/index.ts） */
export function registerAppRegistryRoutes(router: Router, deps: AppRegistryApiDeps): void {
  const { sql } = deps
  const pairwiseKey = deps.pairwiseKey ?? deps.env?.IDENTITY_PAIRWISE_SUBJECT_KEY
  const developerClientId = deps.developerClientId ?? deps.env?.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal'
  const stepSeconds = stepUpWindowSeconds(deps.env ?? process.env)

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

  // POST /api/v1/apps/:appId/reviews —— 提交（开发者通道；§4.1 幂等）
  router.post(`${API_PREFIX}/apps/:appId/reviews`, async (ctx) => {
    try {
      const appId = assertAppId(ctx.params.appId ?? '')
      const developer = await resolveDeveloper(sql, deps, ctx.get(DEVELOPER_SUBJECT_HEADER))
      if (!developer) {
        throw new DomainError('UNAUTHORIZED', '缺少开发者身份（x-developer-subject）', 401)
      }
      const rawBody = await readJsonBody(ctx)
      const content = parseSubmitBody(rawBody, appId, developer.developerId)
      // 领域层语义校验（entry 互斥 / 组非空 / data_domains 非空 / release_seq 单调）
      const previousReleaseSeq = await maxReleaseSeqForApp(sql, appId)
      assertSubmittable(content, { previousReleaseSeq })
      const revision = computeReviewRevision(content)
      const result = await submitReview(
        sql,
        content,
        revision,
        developer,
        (ctx.state.requestId as string | undefined) ?? null,
      )
      ctx.status = result.created ? 201 : 200
      ctx.body = {
        app_id: appId,
        created: result.created,
        idempotency: result.idempotency,
        ...(result.supersededReviewId ? { superseded_review_id: result.supersededReviewId } : {}),
        review: toAdminDTO(result.review),
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/apps/:appId/reviews —— 列表（管理员全部状态；owner 仅本人应用）
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

  // POST /api/v1/apps/:appId/reviews/:reviewId/approve —— 批准（reviewer + step-up）
  router.post(`${API_PREFIX}/apps/:appId/reviews/:reviewId/approve`, async (ctx) => {
    try {
      const identity = await requireAdminRole(sql, readAdminSubject(ctx), 'identity_reviewer')
      assertRecentAuth(readAuthTime(ctx), stepSeconds)
      const appId = assertAppId(ctx.params.appId ?? '')
      const review = await loadReviewForApp(sql, ctx.params.reviewId ?? '', appId)
      await applyDecision(sql, {
        review,
        adminUserId: identity.userId,
        kind: 'approve',
        requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
      })
      const updated = await findReviewById(sql, review.id)
      ctx.status = 200
      ctx.body = { review: updated ? toAdminDTO(updated) : toAdminDTO(review) }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/apps/:appId/reviews/:reviewId/reject —— 驳回（reviewer + step-up + 原因必填）
  router.post(`${API_PREFIX}/apps/:appId/reviews/:reviewId/reject`, async (ctx) => {
    try {
      const identity = await requireAdminRole(sql, readAdminSubject(ctx), 'identity_reviewer')
      assertRecentAuth(readAuthTime(ctx), stepSeconds)
      const appId = assertAppId(ctx.params.appId ?? '')
      const review = await loadReviewForApp(sql, ctx.params.reviewId ?? '', appId)
      const rawBody = await readJsonBody(ctx)
      const reasonRaw = typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>).reason
        : undefined
      await applyDecision(sql, {
        review,
        adminUserId: identity.userId,
        kind: 'reject',
        reason: typeof reasonRaw === 'string' ? reasonRaw : '',
        requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
      })
      const updated = await findReviewById(sql, review.id)
      ctx.status = 200
      ctx.body = { review: updated ? toAdminDTO(updated) : toAdminDTO(review) }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/apps/:appId/reviews/:reviewId/provision —— 上架（reviewer + step-up；
  // 编排层 provisioner.ts，依赖部署侧注入，见 provision.routes.ts）
  registerAppRegistryProvisionRoutes(router, {
    sql,
    env: deps.env ?? process.env,
    provisioning: deps.provisioning,
  })
}
