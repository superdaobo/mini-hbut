/**
 * Admin 查询/写入 SQL 层（#625）。
 *
 * 说明：
 * - 本模块只读/写现有表（oauth_applications / oauth_redirect_uris /
 *   oauth_application_scopes / oauth_consents / oidc_provider_records /
 *   audit_events / users / developers / user_roles / application_reviews），
 *   不修改 #619 的 repo 文件（写边界），SQL 在此自包含；
 * - oidc_provider_records 的 payload 是 JSONB，为兼容 pg-mem 与真 PG，
 *   「按 clientId 撤销协议 artifact」采用读取后 JS 过滤再按 id 删除
 *   （artifact 数量受用户/客户端规模约束，量级小）；
 * - 所有查询结果列名与行接口对齐，由 serialize.ts 统一映射 DTO。
 */
import type { SqlExecutor, QueryResultRow } from '../../db/types.js'
import { parseJsonb } from '../../db/types.js'
import { newUuidV7 } from '../../domain/ids.js'
import { createHash } from 'node:crypto'
import type { AdminRole } from './rbac.js'

// ---------------------------------------------------------------------------
// 行类型（与表结构对应）
// ---------------------------------------------------------------------------

export interface AdminAppRow extends QueryResultRow {
  id: string
  client_id: string
  owner_developer_id: string
  name: string
  description: string | null
  homepage_url: string | null
  privacy_policy_url: string | null
  client_type: 'web_confidential' | 'native_public' | 'browser_public'
  status: 'draft' | 'pending_review' | 'approved' | 'active' | 'rejected' | 'suspended' | 'revoked'
  token_endpoint_auth_method: string
  subject_type: string
  client_secret_encrypted: string | null
  client_secret_expires_at: Date | null
  created_at: Date
  submitted_at: Date | null
  reviewed_at: Date | null
  activated_at: Date | null
  updated_at: Date
}

export interface AdminRedirectUriRow extends QueryResultRow {
  id: string
  application_id: string
  redirect_uri: string
  kind: string
  created_at: Date
}

export interface AdminScopeRow extends QueryResultRow {
  id: string
  application_id: string
  scope: string
  requested_at: Date
  approved_at: Date | null
  status: string
  review_note: string | null
}

export interface AdminReviewRow extends QueryResultRow {
  id: string
  application_id: string
  revision: string
  submitted_by: string
  submitted_at: Date
  metadata_snapshot_json: unknown
  redirect_uris_snapshot_json: unknown
  scopes_snapshot_json: unknown
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
  reviewer_user_id: string | null
  reviewed_at: Date | null
  decision_note: string | null
  scope_decisions_json: unknown
  created_at: Date
  updated_at: Date
}

export interface AdminAuditRow extends QueryResultRow {
  id: string
  event_type: string
  actor_type: string
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  result: string
  request_correlation_id: string | null
  ip_hash: string | null
  user_agent_summary: string | null
  metadata_json: unknown
  created_at: Date
}

// ---------------------------------------------------------------------------
// 快照与 revision（内容寻址，防 TOCTOU）
// ---------------------------------------------------------------------------

/** 参与 revision 计算的应用内容字段（不含状态/时间戳等管理字段） */
export interface RevisionContent {
  name: string
  description: string | null
  homepage_url: string | null
  privacy_policy_url: string | null
  client_type: string
  redirect_uris: Array<{ uri: string; kind: string }>
  scopes: Array<{ scope: string; status: string; review_note: string | null }>
}

/** 计算内容寻址 revision（sha256 hex）；输入数组必须先排序保证确定性 */
export function computeRevision(content: RevisionContent): string {
  const canonical = JSON.stringify({
    name: content.name,
    description: content.description ?? null,
    homepage_url: content.homepage_url ?? null,
    privacy_policy_url: content.privacy_policy_url ?? null,
    client_type: content.client_type,
    redirect_uris: content.redirect_uris,
    scopes: content.scopes,
  })
  return createSha256Hex(canonical)
}

function createSha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

// ---------------------------------------------------------------------------
// 概览
// ---------------------------------------------------------------------------

export interface AdminOverviewStats {
  pendingReviews: number
  pendingSensitiveScopes: number
  activeClients: number
  suspendedClients: number
}

export async function getOverviewStats(sql: SqlExecutor): Promise<AdminOverviewStats> {
  const [pending, sensitive, active, suspended] = await Promise.all([
    sql.query<{ n: string | number }>(
      "SELECT COUNT(*) AS n FROM oauth_applications WHERE status = 'pending_review'",
    ),
    sql.query<{ n: string | number }>(
      `SELECT COUNT(*) AS n
         FROM oauth_application_scopes s
         JOIN oauth_applications a ON a.id = s.application_id
        WHERE a.status = 'pending_review'
          AND s.status = 'requested'
          AND s.scope IN ('student.identity', 'offline_access')`,
    ),
    sql.query<{ n: string | number }>(
      "SELECT COUNT(*) AS n FROM oauth_applications WHERE status = 'active'",
    ),
    sql.query<{ n: string | number }>(
      "SELECT COUNT(*) AS n FROM oauth_applications WHERE status = 'suspended'",
    ),
  ])
  const toNum = (v: string | number): number => (typeof v === 'number' ? v : Number(v))
  return {
    pendingReviews: toNum(pending.rows[0]?.n ?? 0),
    pendingSensitiveScopes: toNum(sensitive.rows[0]?.n ?? 0),
    activeClients: toNum(active.rows[0]?.n ?? 0),
    suspendedClients: toNum(suspended.rows[0]?.n ?? 0),
  }
}

// ---------------------------------------------------------------------------
// 应用列表（pending 优先 + 过滤 + 分页）
// ---------------------------------------------------------------------------

export interface AdminAppListFilter {
  status?: string
  clientType?: string
  /** 包含敏感 scope（student.identity / offline_access） */
  sensitiveScope?: boolean
  /** 搜索 app 名称 / client_id / 开发者昵称（ILIKE） */
  search?: string
  /** 开发者内部 user_id 精确匹配 */
  developer?: string
}

export interface AdminAppListRow extends AdminAppRow {
  developer_user_id: string
  developer_display_name: string
  scope_risks: string
}

const SENSITIVE_SCOPES = ['student.identity', 'offline_access']

export async function listApplications(
  sql: SqlExecutor,
  filter: AdminAppListFilter,
  opts: { limit: number; offset: number },
): Promise<{ rows: AdminAppListRow[]; total: number }> {
  const where: string[] = []
  const values: unknown[] = []

  if (filter.status) {
    values.push(filter.status)
    where.push(`a.status = $${values.length}`)
  }
  if (filter.clientType) {
    values.push(filter.clientType)
    where.push(`a.client_type = $${values.length}`)
  }
  if (filter.sensitiveScope) {
    where.push(`EXISTS (
      SELECT 1 FROM oauth_application_scopes s2
       WHERE s2.application_id = a.id
         AND s2.status = 'requested'
         AND s2.scope IN ('student.identity', 'offline_access')
    )`)
  }
  if (filter.developer) {
    values.push(filter.developer)
    where.push(`dev.user_id = $${values.length}`)
  }
  if (filter.search) {
    values.push(`%${filter.search}%`)
    where.push(`(a.name ILIKE $${values.length} OR a.client_id ILIKE $${values.length} OR dev.display_name ILIKE $${values.length})`)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  // 主查询（scope 风险在下方按 app 分组补充，避免 string_agg——pg-mem 不支持）
  const result = await sql.query<AdminAppListRow>(
    `SELECT a.*, dev.user_id AS developer_user_id, dev.display_name AS developer_display_name
       FROM oauth_applications a
       JOIN developers dev ON dev.id = a.owner_developer_id
       ${whereSql}
      ORDER BY (a.status = 'pending_review') DESC, a.submitted_at DESC NULLS LAST, a.updated_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, opts.limit, opts.offset],
  )
  const totalResult = await sql.query<{ n: string | number }>(
    `SELECT COUNT(*) AS n
       FROM oauth_applications a
       JOIN developers dev ON dev.id = a.owner_developer_id
       ${whereSql}`,
    values,
  )
  // requested scope 按 app 分组（跨 pg-mem/真 PG 通用）
  if (result.rows.length > 0) {
    const appIds = result.rows.map((r) => r.id)
    const scopeResult = await sql.query<{ application_id: string; scope: string }>(
      `SELECT application_id, scope FROM oauth_application_scopes
        WHERE status = 'requested' AND application_id = ANY($1::text[])
        ORDER BY application_id, scope`,
      [appIds],
    )
    const byApp = new Map<string, string[]>()
    for (const row of scopeResult.rows) {
      const list = byApp.get(row.application_id) ?? []
      list.push(row.scope)
      byApp.set(row.application_id, list)
    }
    for (const row of result.rows) {
      row.scope_risks = (byApp.get(row.id) ?? []).join(',')
    }
  }
  const toNum = (v: string | number): number => (typeof v === 'number' ? v : Number(v))
  return { rows: result.rows, total: toNum(totalResult.rows[0]?.n ?? 0) }
}

// ---------------------------------------------------------------------------
// 应用详情
// ---------------------------------------------------------------------------

export interface AdminAppDetail {
  app: AdminAppRow | null
  developer: {
    user_id: string
    display_name: string
    contact_email: string | null
    created_at: Date
    /** 该开发者名下应用总数 / 被暂停或撤销数（处罚概览） */
    total_apps: number
    penalized_apps: number
  } | null
}

export async function getApplicationDetail(sql: SqlExecutor, applicationId: string): Promise<AdminAppDetail> {
  const appResult = await sql.query<AdminAppRow>(
    'SELECT * FROM oauth_applications WHERE id = $1',
    [applicationId],
  )
  const app = appResult.rows[0] ?? null
  if (!app) {
    return { app: null, developer: null }
  }
  const devResult = await sql.query<QueryResultRow & {
    user_id: string
    display_name: string
    contact_email: string | null
    created_at: Date
  }>(
    'SELECT user_id, display_name, contact_email, created_at FROM developers WHERE id = $1',
    [app.owner_developer_id],
  )
  const dev = devResult.rows[0]
  if (!dev) {
    return { app, developer: null }
  }
  // 处罚概览：总数 + 被暂停/撤销数（pg-mem 不支持相关子查询，拆成独立 COUNT）
  const [totalResult, penalizedResult] = await Promise.all([
    sql.query<{ n: string | number }>(
      'SELECT COUNT(*) AS n FROM oauth_applications WHERE owner_developer_id = $1',
      [app.owner_developer_id],
    ),
    sql.query<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM oauth_applications
        WHERE owner_developer_id = $1 AND status IN ('suspended', 'revoked')`,
      [app.owner_developer_id],
    ),
  ])
  const toNum = (v: string | number): number => (typeof v === 'number' ? v : Number(v))
  return {
    app,
    developer: {
      user_id: dev.user_id,
      display_name: dev.display_name,
      contact_email: dev.contact_email,
      created_at: dev.created_at,
      total_apps: toNum(totalResult.rows[0]?.n ?? 0),
      penalized_apps: toNum(penalizedResult.rows[0]?.n ?? 0),
    },
  }
}

export async function listRedirectUrisFor(sql: SqlExecutor, applicationId: string): Promise<AdminRedirectUriRow[]> {
  const result = await sql.query<AdminRedirectUriRow>(
    'SELECT * FROM oauth_redirect_uris WHERE application_id = $1 ORDER BY created_at, redirect_uri',
    [applicationId],
  )
  return result.rows
}

export async function listScopesFor(sql: SqlExecutor, applicationId: string): Promise<AdminScopeRow[]> {
  const result = await sql.query<AdminScopeRow>(
    'SELECT * FROM oauth_application_scopes WHERE application_id = $1 ORDER BY scope',
    [applicationId],
  )
  return result.rows
}

export async function listReviewsForApplication(
  sql: SqlExecutor,
  applicationId: string,
): Promise<AdminReviewRow[]> {
  const result = await sql.query<AdminReviewRow>(
    'SELECT * FROM application_reviews WHERE application_id = $1 ORDER BY submitted_at DESC',
    [applicationId],
  )
  return result.rows.map(parseReviewRow)
}

export async function findReviewById(sql: SqlExecutor, reviewId: string): Promise<AdminReviewRow | null> {
  const result = await sql.query<AdminReviewRow>(
    'SELECT * FROM application_reviews WHERE id = $1',
    [reviewId],
  )
  const row = result.rows[0]
  return row ? parseReviewRow(row) : null
}

function parseReviewRow(row: AdminReviewRow): AdminReviewRow {
  row.metadata_snapshot_json = parseJsonb<Record<string, unknown>>(row.metadata_snapshot_json)
  row.redirect_uris_snapshot_json = parseJsonb<unknown[]>(row.redirect_uris_snapshot_json)
  row.scopes_snapshot_json = parseJsonb<unknown[]>(row.scopes_snapshot_json)
  row.scope_decisions_json = row.scope_decisions_json
    ? parseJsonb<unknown[]>(row.scope_decisions_json)
    : null
  return row
}

// ---------------------------------------------------------------------------
// 审核快照写入
// ---------------------------------------------------------------------------

export interface ScopeSnapshotEntry {
  scope: string
  status: string
  review_note: string | null
  requested_at: string
}

export interface ReviewSnapshotInput {
  applicationId: string
  revision: string
  submittedBy: string
  metadata: Record<string, unknown>
  redirectUris: Array<{ uri: string; kind: string; created_at: string }>
  scopes: ScopeSnapshotEntry[]
}

/** 插入 pending review；若已有 pending（并发）返回 null（调用方复用既有） */
export async function insertPendingReview(
  sql: SqlExecutor,
  input: ReviewSnapshotInput,
): Promise<AdminReviewRow | null> {
  try {
    const result = await sql.query<AdminReviewRow>(
      `INSERT INTO application_reviews (
         id, application_id, revision, submitted_by, submitted_at,
         metadata_snapshot_json, redirect_uris_snapshot_json, scopes_snapshot_json,
         status
       ) VALUES ($1, $2, $3, $4, NOW(), $5::jsonb, $6::jsonb, $7::jsonb, 'pending')
       RETURNING *`,
      [
        newUuidV7(),
        input.applicationId,
        input.revision,
        input.submittedBy,
        JSON.stringify(input.metadata),
        JSON.stringify(input.redirectUris),
        JSON.stringify(input.scopes),
      ],
    )
    return parseReviewRow(result.rows[0] as AdminReviewRow)
  } catch (err) {
    // 唯一冲突：同一应用已有 pending review（并发 materialize）
    if (isUniqueViolation(err)) {
      return null
    }
    throw err
  }
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '23505' || String((err as Error)?.message ?? '').includes('duplicate key')
}

/** 条件更新：仅 pending → 目标状态；返回是否发生迁移 */
export async function transitionReviewStatus(
  sql: SqlExecutor,
  reviewId: string,
  to: 'approved' | 'rejected' | 'superseded',
  patch: {
    reviewerUserId: string
    decisionNote: string | null
    scopeDecisions: unknown[] | null
  },
): Promise<boolean> {
  const result = await sql.query(
    `UPDATE application_reviews
        SET status = $2, reviewer_user_id = $3, reviewed_at = NOW(),
            decision_note = $4, scope_decisions_json = $5::jsonb, updated_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [
      reviewId,
      to,
      patch.reviewerUserId,
      patch.decisionNote,
      patch.scopeDecisions ? JSON.stringify(patch.scopeDecisions) : null,
    ],
  )
  return (result.rowCount ?? 0) === 1
}

/** 无条件标记 superseded（开发者修改后自动作废旧审核） */
export async function markReviewSuperseded(sql: SqlExecutor, reviewId: string): Promise<void> {
  await sql.query(
    `UPDATE application_reviews
        SET status = 'superseded', updated_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [reviewId],
  )
}

/** 当前 pending review（可能过期） */
export async function findPendingReview(
  sql: SqlExecutor,
  applicationId: string,
): Promise<AdminReviewRow | null> {
  const result = await sql.query<AdminReviewRow>(
    `SELECT * FROM application_reviews
      WHERE application_id = $1 AND status = 'pending'`,
    [applicationId],
  )
  const row = result.rows[0]
  return row ? parseReviewRow(row) : null
}

// ---------------------------------------------------------------------------
// scope 状态同步（审核决策落地到 oauth_application_scopes）
// ---------------------------------------------------------------------------

/** 写 scope 决策：approved/rejected + review_note（审核人）；approved_at 只在批准时刷新 */
export async function applyScopeDecision(
  sql: SqlExecutor,
  applicationId: string,
  scope: string,
  decision: 'approved' | 'rejected',
  note: string | null,
): Promise<void> {
  await sql.query(
    `UPDATE oauth_application_scopes
        SET status = $3, review_note = $4,
            approved_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE approved_at END
      WHERE application_id = $1 AND scope = $2`,
    [applicationId, scope, decision, note],
  )
}

// ---------------------------------------------------------------------------
// Suspend/Revoke 运行时效果（oidc-provider Adapter 权威数据）
// ---------------------------------------------------------------------------

/** 与 oidc-records.repo 的 grantable 集合对齐 + Grant 父记录 */
const PROVIDER_ARTIFACT_MODELS = [
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'BackchannelAuthenticationRequest',
  'PreAuthorizedCode',
  'Grant',
]

/**
 * 撤销某 client 的全部协议 artifact（真实作用 oidc-provider）：
 * 读取 payload 后 JS 过滤 clientId（兼容 pg-mem），按 id 硬删除。
 * 返回删除条数。
 */
export async function revokeProviderArtifactsForClient(
  sql: SqlExecutor,
  clientId: string,
): Promise<number> {
  // IN 占位符展开（不用 ANY($n::text[])：pg-mem 对数组参数匹配有缺陷）
  const placeholders = PROVIDER_ARTIFACT_MODELS.map((_, i) => `$${i + 1}`).join(', ')
  const result = await sql.query<QueryResultRow & { id: string; model_name: string; payload_jsonb: unknown }>(
    `SELECT id, model_name, payload_jsonb FROM oidc_provider_records
      WHERE model_name IN (${placeholders})`,
    PROVIDER_ARTIFACT_MODELS,
  )
  const targets: string[] = []
  for (const row of result.rows) {
    const payload = parseJsonb<Record<string, unknown>>(row.payload_jsonb)
    if (payload.clientId === clientId) {
      targets.push(row.id)
    }
  }
  if (targets.length === 0) {
    return 0
  }
  // DELETE 用 IN 占位符展开（pg-mem 的 DELETE ... ANY($n::text[]) 静默不匹配）
  const delPlaceholders = targets.map((_, i) => `$${i + 1}`).join(', ')
  const del = await sql.query(
    `DELETE FROM oidc_provider_records WHERE id IN (${delPlaceholders})`,
    targets,
  )
  return del.rowCount ?? 0
}

/** 撤销某应用的全部用户授权记录（revoke 时清空 consent，防止「复活」后静默续权） */
export async function revokeConsentsForApplication(sql: SqlExecutor, applicationId: string): Promise<number> {
  const result = await sql.query(
    `UPDATE oauth_consents SET revoked_at = NOW(), updated_at = NOW()
      WHERE application_id = $1 AND revoked_at IS NULL`,
    [applicationId],
  )
  return result.rowCount ?? 0
}

// ---------------------------------------------------------------------------
// 审计查询（admin 专用）
// ---------------------------------------------------------------------------

export interface AdminAuditFilter {
  eventType?: string
  targetType?: string
  /** UUIDv7 游标：只返回 created_at 更早（id 字典序更小）的记录 */
  before?: string
}

export async function listAuditEventsAdmin(
  sql: SqlExecutor,
  filter: AdminAuditFilter,
  limit: number,
): Promise<AdminAuditRow[]> {
  const where: string[] = []
  const values: unknown[] = []
  if (filter.eventType) {
    values.push(filter.eventType)
    where.push(`event_type = $${values.length}`)
  }
  if (filter.targetType) {
    values.push(filter.targetType)
    where.push(`target_type = $${values.length}`)
  }
  if (filter.before) {
    // UUIDv7 时间有序游标：先取游标行时间，再按 (created_at, id) 字典序回退
    // （不用行比较子查询 (a,b) < (SELECT ...)——pg-mem 不支持）
    const cursor = await sql.query<{ created_at: Date }>(
      'SELECT created_at FROM audit_events WHERE id = $1',
      [filter.before],
    )
    const cursorAt = cursor.rows[0]?.created_at
    if (cursorAt) {
      values.push(cursorAt)
      where.push(`(created_at < $${values.length} OR (created_at = $${values.length} AND id < $${values.length + 1}))`)
      values.push(filter.before)
    }
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const result = await sql.query<AdminAuditRow>(
    `SELECT * FROM audit_events ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1}`,
    [...values, limit],
  )
  return result.rows.map((row) => {
    row.metadata_json = parseJsonb<Record<string, unknown>>(row.metadata_json)
    return row
  })
}

// ---------------------------------------------------------------------------
// 角色仓储（RBAC 表读写；CLI 与未来管理 API 共用）
// ---------------------------------------------------------------------------

export async function findActiveRole(
  sql: SqlExecutor,
  userId: string,
  role: AdminRole,
): Promise<QueryResultRow & { granted_at: Date; revoked_at: Date | null } | null> {
  const result = await sql.query<QueryResultRow & { granted_at: Date; revoked_at: Date | null }>(
    `SELECT * FROM user_roles WHERE user_id = $1 AND role = $2`,
    [userId, role],
  )
  return result.rows[0] ?? null
}

/** 授予角色（不存在则插入；已存在且未撤销 → created=false 幂等；已撤销则重新激活） */
export async function grantRole(
  sql: SqlExecutor,
  input: { userId: string; role: AdminRole; grantedBy?: string | null },
): Promise<{ created: boolean; reactivated: boolean }> {
  const existing = await findActiveRole(sql, input.userId, input.role)
  if (existing && existing.revoked_at === null) {
    return { created: false, reactivated: false }
  }
  if (existing && existing.revoked_at !== null) {
    await sql.query(
      `UPDATE user_roles SET revoked_at = NULL, granted_by = $3, granted_at = NOW()
        WHERE user_id = $1 AND role = $2`,
      [input.userId, input.role, input.grantedBy ?? null],
    )
    // 重新激活也是权限变更，必须审计（roles-service 依据 reactivated 落 ROLE_GRANTED）
    return { created: false, reactivated: true }
  }
  await sql.query(
    `INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, $2, $3)`,
    [input.userId, input.role, input.grantedBy ?? null],
  )
  return { created: true, reactivated: false }
}

/** 撤销角色（软删除）；不存在或已撤销返回 false */
export async function revokeRole(
  sql: SqlExecutor,
  input: { userId: string; role: AdminRole },
): Promise<{ revoked: boolean }> {
  const result = await sql.query(
    `UPDATE user_roles SET revoked_at = NOW()
      WHERE user_id = $1 AND role = $2 AND revoked_at IS NULL`,
    [input.userId, input.role],
  )
  return { revoked: (result.rowCount ?? 0) === 1 }
}
