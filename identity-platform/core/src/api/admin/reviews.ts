/**
 * 审核领域服务（#625）。
 *
 * 核心不变量：
 *   1. 快照不可变：提交时冻结 metadata/redirect_uris/scopes 为 JSONB，
 *      管理员看到的是快照，不是实时表；
 *   2. 内容寻址 revision：sha256(名称/描述/主页/隐私/类型/redirect/scopes)，
 *      approve 必须比对「review.revision == 当前内容 revision」，否则自动
 *      superseded + 409 REVISION_MISMATCH（防 TOCTOU）；
 *   3. 原子性：review 迁移与 app 状态迁移在同一事务；app 的 UPDATE 额外
 *      带 updated_at 条件（= 快照时刻），并发开发者修改会触发回滚；
 *   4. 幂等：已 approved/rejected 的 review 重复操作返回既有结果（不重复审计）；
 *   5. self-review 默认禁止：审核人 user_id == owner developer 的 user_id 时拒绝。
 *
 * 关于「pending 期间安全配置只读或自动 superseded」：V1 采用自动 superseded。
 * 当前 Core 尚无开发者修改 API（#624 的 /api/v1/developer/* 未落地），
 * 本模块在读取队列/详情时懒物化 pending review 并自动作废过期快照；
 * 未来开发者 API 落地时，其 mutation 应复用本模块的 ensurePendingReview
 * （变更 → supersede 旧快照 → 重新提交）。
 */
import type { SqlExecutor, QueryResultRow } from '../../db/types.js'
import {
  computeRevision,
  findReviewById,
  insertPendingReview,
  listRedirectUrisFor,
  listScopesFor,
  markReviewSuperseded,
  transitionReviewStatus,
  applyScopeDecision,
  findPendingReview,
  type AdminAppRow,
  type ReviewSnapshotInput,
} from './queries.js'
import {
  ReviewNotFoundError,
  ReviewNotPendingError,
  RevisionMismatchError,
  SelfReviewForbiddenError,
  AdminClientNotFoundError,
  AdminInvalidStateError,
  AdminInvalidInputError,
} from './errors.js'
import { writeAdminAudit, ADMIN_EVENTS } from './audit.js'

// ---------------------------------------------------------------------------
// Scope 风险分级（issue #625：openid/profile 基础；student.identity/offline_access 敏感）
// ---------------------------------------------------------------------------

export const SENSITIVE_SCOPES = ['student.identity', 'offline_access'] as const

export function scopeRisk(scope: string): 'basic' | 'sensitive' {
  return (SENSITIVE_SCOPES as readonly string[]).includes(scope) ? 'sensitive' : 'basic'
}

/** 文本限制：非空、去首尾空白、长度 1..2000、无控制字符 */
export function assertReason(reason: unknown, field: string): string {
  if (typeof reason !== 'string') {
    throw new AdminInvalidInputError(`${field} 必须是非空字符串`)
  }
  const trimmed = reason.trim()
  if (trimmed.length === 0 || trimmed.length > 2000) {
    throw new AdminInvalidInputError(`${field} 长度必须在 1..2000 字符`)
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed)) {
    throw new AdminInvalidInputError(`${field} 包含非法控制字符`)
  }
  return trimmed
}

/** 可选 note：最长 2000；空串视为 null */
export function assertOptionalNote(note: unknown, field: string): string | null {
  if (note === undefined || note === null) {
    return null
  }
  if (typeof note !== 'string') {
    throw new AdminInvalidInputError(`${field} 必须是字符串`)
  }
  const trimmed = note.trim()
  if (trimmed.length > 2000) {
    throw new AdminInvalidInputError(`${field} 长度不能超过 2000 字符`)
  }
  return trimmed.length === 0 ? null : trimmed
}

// ---------------------------------------------------------------------------
// 快照构建
// ---------------------------------------------------------------------------

interface AppContext {
  app: AdminAppRow
  redirectUris: Array<{ uri: string; kind: string; created_at: string }>
  scopes: Array<{ scope: string; status: string; review_note: string | null; requested_at: string }>
  /** owner developer 的 user_id（提交人） */
  submittedBy: string
}

/** 读取应用当前内容上下文（快照与 revision 的数据源） */
async function loadAppContext(sql: SqlExecutor, applicationId: string): Promise<AppContext | null> {
  const appResult = await sql.query<AdminAppRow>(
    'SELECT * FROM oauth_applications WHERE id = $1',
    [applicationId],
  )
  const app = appResult.rows[0]
  if (!app) {
    return null
  }
  const [redirectUris, scopes, devResult] = await Promise.all([
    listRedirectUrisFor(sql, applicationId),
    listScopesFor(sql, applicationId),
    sql.query<{ user_id: string }>(
      'SELECT user_id FROM developers WHERE id = $1',
      [app.owner_developer_id],
    ),
  ])
  return {
    app,
    redirectUris: redirectUris
      .map((r) => ({ uri: r.redirect_uri, kind: r.kind, created_at: r.created_at.toISOString() }))
      .sort((a, b) => a.uri.localeCompare(b.uri) || a.kind.localeCompare(b.kind)),
    scopes: scopes
      .map((s) => ({
        scope: s.scope,
        status: s.status,
        review_note: s.review_note,
        requested_at: s.requested_at.toISOString(),
      }))
      .sort((a, b) => a.scope.localeCompare(b.scope)),
    submittedBy: devResult.rows[0]?.user_id ?? '',
  }
}

/** 计算当前内容 revision（确定性：数组已排序、键序固定） */
function currentRevision(ctx: AppContext): string {
  return computeRevision({
    name: ctx.app.name,
    description: ctx.app.description,
    homepage_url: ctx.app.homepage_url,
    privacy_policy_url: ctx.app.privacy_policy_url,
    client_type: ctx.app.client_type,
    redirect_uris: ctx.redirectUris.map((r) => ({ uri: r.uri, kind: r.kind })),
    scopes: ctx.scopes.map((s) => ({ scope: s.scope, status: s.status, review_note: s.review_note })),
  })
}

/** metadata 快照（绝不含 client_secret / 学号） */
function metadataSnapshot(ctx: AppContext): Record<string, unknown> {
  return {
    name: ctx.app.name,
    description: ctx.app.description ?? null,
    homepage_url: ctx.app.homepage_url ?? null,
    privacy_policy_url: ctx.app.privacy_policy_url ?? null,
    client_type: ctx.app.client_type,
    token_endpoint_auth_method: ctx.app.token_endpoint_auth_method,
    subject_type: ctx.app.subject_type,
    // 快照时刻的 updated_at：approve 时作为 app UPDATE 的原子性条件
    updated_at: ctx.app.updated_at.toISOString(),
  }
}

/**
 * 确保该应用存在一份与当前内容一致的 pending review（懒物化 + 自动 supersede）。
 * - 应用不在 pending_review → 返回 null；
 * - 已有 pending review 且内容一致 → 返回既有；
 * - 已有但内容已变 → 旧 review 标记 superseded，重建新快照；
 * - 无 pending review → 从当前内容创建。
 *
 * 并发安全：事务内先 SELECT ... FOR UPDATE 锁应用行，把并发的 ensure 串行化，
 * 保证「每个应用最多一个 pending review」不变量（不用 partial unique index，
 * 原因见 migrations/0002_admin_roles.sql 注释）。
 */
export async function ensurePendingReview(
  sql: SqlExecutor,
  applicationId: string,
): Promise<AdminReviewRowLike | null> {
  return sql.withTransaction(async (tx) => {
    // 锁应用行：并发 ensure 同一应用时串行执行
    await tx.query('SELECT id FROM oauth_applications WHERE id = $1 FOR UPDATE', [applicationId])
    const ctx = await loadAppContext(tx, applicationId)
    if (!ctx || ctx.app.status !== 'pending_review') {
      return null
    }
    const existing = await findPendingReview(tx, applicationId)
    if (existing) {
      if (existing.revision === currentRevision(ctx)) {
        return existing
      }
      await markReviewSuperseded(tx, existing.id)
    }
    return createReviewSnapshot(tx, ctx)
  })
}

/** 行类型简写（避免长类型名四处引用） */
export type AdminReviewRowLike = NonNullable<Awaited<ReturnType<typeof findReviewById>>>

/** 创建审核快照（幂等：并发冲突时复用既有 pending） */
async function createReviewSnapshot(
  sql: SqlExecutor,
  ctx: AppContext,
): Promise<AdminReviewRowLike | null> {
  const input: ReviewSnapshotInput = {
    applicationId: ctx.app.id,
    revision: currentRevision(ctx),
    submittedBy: ctx.submittedBy,
    metadata: metadataSnapshot(ctx),
    redirectUris: ctx.redirectUris,
    scopes: ctx.scopes,
  }
  const created = await insertPendingReview(sql, input)
  if (created) {
    return created
  }
  // 并发冲突：另一请求刚建了 pending review
  return findPendingReview(sql, ctx.app.id)
}

// ---------------------------------------------------------------------------
// 审核公共校验（self-review / pending / revision / app 状态）
// ---------------------------------------------------------------------------

interface ReviewTarget {
  review: AdminReviewRowLike
  app: AdminAppRow
  ctx: AppContext
  ownerUserId: string
}

/** 加载 review + app，做 self-review/pending/revision 校验；供 approve/reject 共用 */
async function loadReviewTarget(
  sql: SqlExecutor,
  reviewId: string,
  adminUserId: string,
): Promise<ReviewTarget> {
  const review = await findReviewById(sql, reviewId)
  if (!review) {
    throw new ReviewNotFoundError()
  }
  const ctx = await loadAppContext(sql, review.application_id)
  if (!ctx) {
    throw new AdminClientNotFoundError()
  }
  // self-review：审核人即应用 owner → 拒绝
  if (ctx.submittedBy && ctx.submittedBy === adminUserId) {
    throw new SelfReviewForbiddenError()
  }
  return { review, app: ctx.app, ctx, ownerUserId: ctx.submittedBy }
}

/** review 必须 pending；已审（approved/rejected）→ 返回 true 表示幂等重放 */
function assertReviewPending(review: AdminReviewRowLike): { replay: boolean } {
  if (review.status === 'pending') {
    return { replay: false }
  }
  return { replay: true }
}

/** revision 必须与当前内容一致；不一致 → supersede + 抛错 */
async function assertRevisionCurrent(
  sql: SqlExecutor,
  review: AdminReviewRowLike,
  ctx: AppContext,
): Promise<void> {
  if (review.revision !== currentRevision(ctx)) {
    await markReviewSuperseded(sql, review.id)
    throw new RevisionMismatchError()
  }
}

// ---------------------------------------------------------------------------
// Approve（部分 scope 审批 + 激活）
// ---------------------------------------------------------------------------

export interface ScopeDecisionInput {
  scope: string
  decision: 'approved' | 'rejected'
  note: string | null
}

export interface ApproveReviewResult {
  reviewId: string
  applicationId: string
  status: 'approved'
  /** 本次（或历史重放）的 scope 决策 */
  scopeDecisions: ScopeDecisionInput[]
  note: string | null
}

export interface ApproveReviewInput {
  reviewId: string
  adminUserId: string
  scopeDecisions: unknown
  note?: unknown
  requestCorrelationId?: string | null
}

/** 校验 scope 决策覆盖快照全部 scope（不多不少），并清洗 note */
function validateScopeDecisions(
  review: AdminReviewRowLike,
  rawDecisions: unknown,
): ScopeDecisionInput[] {
  const snapshotScopes = (review.scopes_snapshot_json as Array<{ scope: string }>) ?? []
  if (!Array.isArray(rawDecisions)) {
    throw new AdminInvalidInputError('scope_decisions 必须是数组')
  }
  const byScope = new Map<string, ScopeDecisionInput>()
  for (const item of rawDecisions) {
    if (typeof item !== 'object' || item === null) {
      throw new AdminInvalidInputError('scope_decisions 每项必须是对象')
    }
    const entry = item as Record<string, unknown>
    if (typeof entry.scope !== 'string' || (entry.decision !== 'approved' && entry.decision !== 'rejected')) {
      throw new AdminInvalidInputError('scope_decisions 每项必须包含 scope 与 approved/rejected 决策')
    }
    if (byScope.has(entry.scope)) {
      throw new AdminInvalidInputError(`scope ${entry.scope} 重复决策`)
    }
    byScope.set(entry.scope, {
      scope: entry.scope,
      decision: entry.decision,
      note: assertOptionalNote(entry.note, `scope ${entry.scope} 的 note`),
    })
  }
  // 快照里每个 scope 都必须有决策；不允许决策快照外的 scope
  for (const s of snapshotScopes) {
    if (!byScope.has(s.scope)) {
      throw new AdminInvalidInputError(`缺少 scope ${s.scope} 的决策`)
    }
  }
  for (const scope of byScope.keys()) {
    if (!snapshotScopes.some((s) => s.scope === scope)) {
      throw new AdminInvalidInputError(`scope ${scope} 不在本次审核的快照中`)
    }
  }
  return [...byScope.values()]
}

/** review 快照是否含敏感 scope（step-up 判定用） */
export function reviewHasSensitiveScope(review: AdminReviewRowLike): boolean {
  const scopes = (review.scopes_snapshot_json as Array<{ scope: string }>) ?? []
  return scopes.some((s) => scopeRisk(s.scope) === 'sensitive')
}

/**
 * 批准审核（事务）：
 *   1. 校验 pending + revision + self-review；
 *   2. 迁移 review → approved（条件更新，并发安全）；
 *   3. 同步 scope 决策到 oauth_application_scopes；
 *   4. 应用 → active（approve == activate，V1 决策）+ reviewed_at/activated_at；
 *   5. 审计 ADMIN_APP_APPROVED + 逐 scope ADMIN_SCOPE_APPROVED/REJECTED。
 * 幂等：review 已审 → 直接返回既有决策（不重复写/审计）。
 */
export async function approveReview(
  sql: SqlExecutor,
  input: ApproveReviewInput,
): Promise<ApproveReviewResult> {
  const target = await loadReviewTarget(sql, input.reviewId, input.adminUserId)
  const { review, app, ctx } = target
  const pending = assertReviewPending(review)
  const note = assertOptionalNote(input.note, 'note')
  if (pending.replay) {
    // 幂等重放：仅 approved 可重放；rejected/superseded 一律 409
    if (review.status !== 'approved') {
      throw new ReviewNotPendingError(review.status)
    }
    // 返回既有结果（决策来自 scope_decisions_json，绝不复用请求体）
    const replayed = replayDecisions(review)
    return {
      reviewId: review.id,
      applicationId: review.application_id,
      status: 'approved',
      scopeDecisions: replayed,
      note: review.decision_note,
    }
  }
  const decisions = validateScopeDecisions(review, input.scopeDecisions)

  await sql.withTransaction(async (tx) => {
    // revision 一致性（内容寻址）
    await assertRevisionCurrent(tx, review, ctx)
    // review 迁移（条件更新：pending → approved，并发下只有一个成功）
    const moved = await transitionReviewStatus(tx, review.id, 'approved', {
      reviewerUserId: input.adminUserId,
      decisionNote: note,
      scopeDecisions: decisions,
    })
    if (!moved) {
      throw new ReviewNotPendingError('approved')
    }
    // scope 决策落地
    for (const d of decisions) {
      await applyScopeDecision(tx, app.id, d.scope, d.decision, d.note)
    }
    // 应用状态迁移：仅 pending_review 且快照时刻未变 → active（approve == activate）
    const movedApp = await sql.query<QueryResultRow>(
      `UPDATE oauth_applications
          SET status = 'active', reviewed_at = NOW(), activated_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending_review' AND date_trunc('milliseconds', updated_at) = $2::timestamptz`,
      [app.id, (review.metadata_snapshot_json as Record<string, unknown>).updated_at],
    )
    if ((movedApp.rowCount ?? 0) !== 1) {
      // 并发变更（开发者编辑 / 状态变化）→ 回滚 review 迁移
      throw new RevisionMismatchError()
    }
    // 审计
    await writeAdminAudit(tx, {
      eventType: ADMIN_EVENTS.APP_APPROVED,
      actorId: input.adminUserId,
      targetType: 'application',
      targetId: app.id,
      requestCorrelationId: input.requestCorrelationId ?? null,
      metadata: { review_id: review.id, revision: review.revision, note },
    })
    for (const d of decisions) {
      await writeAdminAudit(tx, {
        eventType: d.decision === 'approved' ? ADMIN_EVENTS.SCOPE_APPROVED : ADMIN_EVENTS.SCOPE_REJECTED,
        actorId: input.adminUserId,
        targetType: 'application',
        targetId: app.id,
        requestCorrelationId: input.requestCorrelationId ?? null,
        metadata: { review_id: review.id, revision: review.revision, scope: d.scope, note: d.note },
      })
    }
  })

  return {
    reviewId: review.id,
    applicationId: review.application_id,
    status: 'approved',
    scopeDecisions: decisions,
    note,
  }
}

/** 从已审 review 重放决策（幂等响应，不用请求体） */
function replayDecisions(review: AdminReviewRowLike): Array<{ scope: string; decision: 'approved' | 'rejected'; note: string | null }> {
  const raw = review.scope_decisions_json as Array<Record<string, unknown>> | null
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter((d) => typeof d.scope === 'string' && (d.decision === 'approved' || d.decision === 'rejected'))
    .map((d) => ({
      scope: d.scope as string,
      decision: d.decision as 'approved' | 'rejected',
      note: typeof d.note === 'string' ? d.note : null,
    }))
}


// ---------------------------------------------------------------------------
// Reject（必须填写开发者可读 reason）
// ---------------------------------------------------------------------------

export interface RejectReviewInput {
  reviewId: string
  adminUserId: string
  /** 开发者可读拒绝原因（必填，1..2000） */
  reason: string
  requestCorrelationId?: string | null
}

export interface RejectReviewResult {
  reviewId: string
  applicationId: string
  status: 'rejected'
  reason: string
}

/**
 * 拒绝审核（事务）：pending + revision + self-review 校验 →
 * review → rejected、应用 → rejected；审计 ADMIN_APP_REJECTED。
 * 幂等：已 rejected → 返回既有 reason（不重复审计）。
 */
export async function rejectReview(
  sql: SqlExecutor,
  input: RejectReviewInput,
): Promise<RejectReviewResult> {
  const reason = assertReason(input.reason, 'reason')
  const target = await loadReviewTarget(sql, input.reviewId, input.adminUserId)
  const { review, app, ctx } = target
  const pending = assertReviewPending(review)
  if (pending.replay) {
    if (review.status === 'rejected') {
      return { reviewId: review.id, applicationId: review.application_id, status: 'rejected', reason: review.decision_note ?? reason }
    }
    throw new ReviewNotPendingError(review.status)
  }

  await sql.withTransaction(async (tx) => {
    await assertRevisionCurrent(tx, review, ctx)
    const moved = await transitionReviewStatus(tx, review.id, 'rejected', {
      reviewerUserId: input.adminUserId,
      decisionNote: reason,
      scopeDecisions: null,
    })
    if (!moved) {
      throw new ReviewNotPendingError('rejected')
    }
    const movedApp = await tx.query<QueryResultRow>(
      `UPDATE oauth_applications
          SET status = 'rejected', reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending_review' AND date_trunc('milliseconds', updated_at) = $2::timestamptz`,
      [app.id, (review.metadata_snapshot_json as Record<string, unknown>).updated_at],
    )
    if ((movedApp.rowCount ?? 0) !== 1) {
      throw new RevisionMismatchError()
    }
    await writeAdminAudit(tx, {
      eventType: ADMIN_EVENTS.APP_REJECTED,
      actorId: input.adminUserId,
      targetType: 'application',
      targetId: app.id,
      requestCorrelationId: input.requestCorrelationId ?? null,
      metadata: { review_id: review.id, revision: review.revision, reason },
    })
  })

  return { reviewId: review.id, applicationId: review.application_id, status: 'rejected', reason }
}

/** 供未来开发者 API 调用：提交/变更时重建 pending review 快照（导出给写边界外复用） */
export { ensurePendingReview as createPendingReviewForSubmission }
