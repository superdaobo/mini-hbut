/**
 * Admin 领域契约（issue #625）。
 *
 * Web 侧 Admin 后台与 Core Admin API（/api/v1/admin/*）的类型合同：
 * - 身份：BFF 从加密会话（mh_dev_session）推导 sub，经 x-admin-subject 传给 Core；
 * - 角色：identity_reviewer 可查看 + 审核；identity_admin 才可 suspend/revoke/审计；
 * - 高风险动作（敏感 scope 审核 / suspend / revoke）要求近期认证（session iat →
 *   x-admin-auth-time），过期返回 403 step_up_required，BFF 引导重新登录；
 * - 响应永不含 client_secret 明文/学号；审核数据来自不可变快照；
 * - 错误统一 { error: <code> }，不泄露资源存在性差异。
 */

/** 管理员角色（与 core user_roles 对齐） */
export type AdminRole = 'identity_admin' | 'identity_reviewer'

/** Client 生命周期状态（与 developer/contract 的 DeveloperAppStatus 对齐） */
export type AdminAppStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'suspended'
  | 'revoked'

/** Scope 风险分级（issue：openid/profile 基础；student.identity/offline_access 敏感） */
export type ScopeRisk = 'basic' | 'sensitive'

/** 审核状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'superseded'

export interface AdminMeDTO {
  sub: string
  roles: AdminRole[]
}

export interface AdminAuditEntryDTO {
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

export interface AdminOverviewDTO {
  pending_reviews: number
  pending_sensitive_scopes: number
  active_clients: number
  suspended_clients: number
  recent_events: AdminAuditEntryDTO[]
}

export interface AdminAppSummaryDTO {
  id: string
  client_id: string
  name: string
  client_type: string
  status: AdminAppStatus
  developer: { user_id: string; display_name: string }
  scope_risks: string[]
  has_pending_review: boolean
  submitted_at: string | null
  reviewed_at: string | null
  updated_at: string
}

export interface AdminRedirectUriDTO {
  id: string
  uri: string
  kind: string
  created_at: string
}

export interface AdminScopeDTO {
  scope: string
  status: string
  requested_at: string
  approved_at: string | null
  review_note: string | null
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
  status: ReviewStatus
  reviewer_user_id: string | null
  reviewed_at: string | null
  decision_note: string | null
  scope_decisions: Array<{ scope: string; decision: string; note: string | null }> | null
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
    status: AdminAppStatus
    token_endpoint_auth_method: string
    subject_type: string
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

/** scope 决策输入（approve 时每个快照 scope 都必须有决策） */
export interface ScopeDecisionInput {
  scope: string
  decision: 'approved' | 'rejected'
  note?: string | null
}

/** 高风险动作需近期认证；过期 → 403 step_up_required → BFF 触发重新登录 */
export type AdminApiErrorCode =
  | 'unauthorized' // 401：无会话/会话过期
  | 'forbidden' // 403：CSRF/Origin/角色不足/self-review
  | 'step_up_required' // 403：高风险动作需要重新认证
  | 'not_found' // 404：应用/审核不存在
  | 'invalid_request' // 400：输入校验失败
  | 'invalid_state' // 409：状态机不允许/审核已处理
  | 'revision_mismatch' // 409：应用内容在审核后变化（TOCTOU）
  | 'internal' // 500/502

/** Admin API 领域错误 */
export class AdminApiError extends Error {
  readonly status: number
  readonly code: AdminApiErrorCode

  constructor(status: number, code: AdminApiErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

/** Admin API 响应体里错误码 → 契约错误码（白名单映射，未知一律 internal） */
export function mapAdminErrorCode(raw: string | undefined): AdminApiErrorCode {
  switch (raw) {
    case 'unauthorized':
    case 'forbidden':
    case 'step_up_required':
    case 'not_found':
    case 'invalid_request':
    case 'invalid_state':
    case 'revision_mismatch':
      return raw
    default:
      return 'internal'
  }
}
