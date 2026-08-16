/**
 * Admin API DTO 序列化（#625）。
 *
 * 脱敏规则（不可违反）：
 * - 永不输出 student_id（学号）、client_secret 明文/密文、任何 token/handoff；
 * - 开发者信息只给内部 user_id + 展示名 + 联系邮箱（受控字段）；
 * - secret 只暴露「是否存在」等元数据布尔值；
 * - 时间统一 ISO 字符串。
 */
import type {
  AdminAppListRow,
  AdminAppRow,
  AdminAuditRow,
  AdminRedirectUriRow,
  AdminReviewRow,
  AdminScopeRow,
} from './queries.js'
import type { AdminRole } from './rbac.js'

export interface AdminMeDTO {
  sub: string
  roles: AdminRole[]
}

export interface AdminAppSummaryDTO {
  id: string
  client_id: string
  name: string
  client_type: string
  status: string
  developer: { user_id: string; display_name: string }
  /** 当前 requested 的 scope（风险分级由 Web 侧渲染） */
  scope_risks: string[]
  has_pending_review: boolean
  submitted_at: string | null
  reviewed_at: string | null
  updated_at: string
}

export function toAppSummary(row: AdminAppListRow): AdminAppSummaryDTO {
  return {
    id: row.id,
    client_id: row.client_id,
    name: row.name,
    client_type: row.client_type,
    status: row.status,
    developer: {
      user_id: row.developer_user_id,
      display_name: row.developer_display_name,
    },
    scope_risks: row.scope_risks ? row.scope_risks.split(',').filter(Boolean) : [],
    has_pending_review: row.status === 'pending_review',
    submitted_at: row.submitted_at ? row.submitted_at.toISOString() : null,
    reviewed_at: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    updated_at: row.updated_at.toISOString(),
  }
}

export interface AdminRedirectUriDTO {
  id: string
  uri: string
  kind: string
  created_at: string
}

export function toRedirectUriDTO(row: AdminRedirectUriRow): AdminRedirectUriDTO {
  return { id: row.id, uri: row.redirect_uri, kind: row.kind, created_at: row.created_at.toISOString() }
}

export interface AdminScopeDTO {
  scope: string
  status: string
  requested_at: string
  approved_at: string | null
  review_note: string | null
}

export function toScopeDTO(row: AdminScopeRow): AdminScopeDTO {
  return {
    scope: row.scope,
    status: row.status,
    requested_at: row.requested_at.toISOString(),
    approved_at: row.approved_at ? row.approved_at.toISOString() : null,
    review_note: row.review_note,
  }
}

export interface AdminReviewDTO {
  id: string
  application_id: string
  revision: string
  submitted_by: string
  submitted_at: string
  metadata: Record<string, unknown>
  redirect_uris: Array<{ uri: string; kind: string; created_at: string }>
  scopes: Array<{ scope: string; status: string; review_note: string | null; requested_at: string }>
  status: string
  reviewer_user_id: string | null
  reviewed_at: string | null
  decision_note: string | null
  scope_decisions: Array<{ scope: string; decision: string; note: string | null }> | null
}

export function toReviewDTO(row: AdminReviewRow): AdminReviewDTO {
  return {
    id: row.id,
    application_id: row.application_id,
    revision: row.revision,
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at.toISOString(),
    metadata: (row.metadata_snapshot_json as Record<string, unknown>) ?? {},
    redirect_uris: (row.redirect_uris_snapshot_json as Array<{ uri: string; kind: string; created_at: string }>) ?? [],
    scopes: (row.scopes_snapshot_json as Array<{ scope: string; status: string; review_note: string | null; requested_at: string }>) ?? [],
    status: row.status,
    reviewer_user_id: row.reviewer_user_id,
    reviewed_at: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    decision_note: row.decision_note,
    scope_decisions: (row.scope_decisions_json as Array<{ scope: string; decision: string; note: string | null }>) ?? null,
  }
}

export interface AdminAppDetailDTO {
  application: {
    id: string
    client_id: string
    name: string
    description: string | null
    homepage_url: string | null
    privacy_policy_url: string | null
    client_type: string
    status: string
    token_endpoint_auth_method: string
    subject_type: string
    /** 是否存在 client secret（web_confidential），绝不含明文/密文 */
    has_secret: boolean
    client_secret_expires_at: string | null
    created_at: string
    submitted_at: string | null
    reviewed_at: string | null
    activated_at: string | null
    updated_at: string
  }
  developer: {
    user_id: string
    display_name: string
    contact_email: string | null
    created_at: string
    total_apps: number
    penalized_apps: number
  } | null
  redirect_uris: AdminRedirectUriDTO[]
  scopes: AdminScopeDTO[]
  reviews: AdminReviewDTO[]
  pending_review: AdminReviewDTO | null
}

export function toAppDetail(
  app: AdminAppRow,
  developer: {
    user_id: string
    display_name: string
    contact_email: string | null
    created_at: Date
    total_apps: number
    penalized_apps: number
  } | null,
  redirectUris: AdminRedirectUriRow[],
  scopes: AdminScopeRow[],
  reviews: AdminReviewRow[],
): AdminAppDetailDTO {
  const pending = reviews.find((r) => r.status === 'pending') ?? null
  return {
    application: {
      id: app.id,
      client_id: app.client_id,
      name: app.name,
      description: app.description,
      homepage_url: app.homepage_url,
      privacy_policy_url: app.privacy_policy_url,
      client_type: app.client_type,
      status: app.status,
      token_endpoint_auth_method: app.token_endpoint_auth_method,
      subject_type: app.subject_type,
      has_secret: app.client_secret_encrypted !== null && app.client_type === 'web_confidential',
      client_secret_expires_at: app.client_secret_expires_at ? app.client_secret_expires_at.toISOString() : null,
      created_at: app.created_at.toISOString(),
      submitted_at: app.submitted_at ? app.submitted_at.toISOString() : null,
      reviewed_at: app.reviewed_at ? app.reviewed_at.toISOString() : null,
      activated_at: app.activated_at ? app.activated_at.toISOString() : null,
      updated_at: app.updated_at.toISOString(),
    },
    developer: developer
      ? {
          user_id: developer.user_id,
          display_name: developer.display_name,
          contact_email: developer.contact_email,
          created_at: developer.created_at.toISOString(),
          total_apps: developer.total_apps,
          penalized_apps: developer.penalized_apps,
        }
      : null,
    redirect_uris: redirectUris.map(toRedirectUriDTO),
    scopes: scopes.map(toScopeDTO),
    reviews: reviews.map(toReviewDTO),
    pending_review: pending ? toReviewDTO(pending) : null,
  }
}

export interface AdminAuditDTO {
  id: string
  event_type: string
  actor_type: string
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  result: string
  request_correlation_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export function toAuditDTO(row: AdminAuditRow): AdminAuditDTO {
  return {
    id: row.id,
    event_type: row.event_type,
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    target_type: row.target_type,
    target_id: row.target_id,
    result: row.result,
    request_correlation_id: row.request_correlation_id,
    metadata: (row.metadata_json as Record<string, unknown>) ?? {},
    created_at: row.created_at.toISOString(),
  }
}
