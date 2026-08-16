/**
 * Developer 领域契约（issue #624）。
 *
 * 本文件定义 Web 侧 Developer Portal 与 Core Developer API 之间的类型合同：
 *  - Web BFF 只读取 Core 返回的 sanitized DTO，浏览器永远接触不到 client_secret
 *    明文（除创建/rotate 那一次响应）、student_id 或内部 developer 主键；
 *  - 所有 endpoint 的 owner 一律从 Portal 会话（OIDC sub）推导，
 *    禁止接受 body 里的 developer_id/student_id（越权面，见 IDOR 测试）；
 *  - 错误统一 { error: <code> }，不泄露「资源不存在」与「资源非本人所有」的差异
 *    （一律 404 not_found，防止枚举）。
 *
 * 与 Core（#620，写边界外）的对接说明见 lib/developer-api/store.ts。
 */

/** 开发者（OIDC 登录用户）状态 */
export type DeveloperStatus = 'active' | 'suspended'

/** Client 生命周期状态（与 core/src/domain/clients.ts 的 ApplicationStatus 一一对应） */
export type DeveloperAppStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'suspended'
  | 'revoked'

/** V1 支持的应用类型（browser_public 不在本 Issue 范围） */
export type DeveloperClientType = 'web_confidential' | 'native_public'

/** Redirect URI 类型（与 core RedirectUriKind 对齐） */
export type RedirectUriKind = 'web_https' | 'native_custom' | 'native_loopback'

/** Scope 审核状态（与 core ScopeStatus 对齐） */
export type ScopeStatus = 'requested' | 'approved' | 'rejected'

/** Redirect URI 的校验/生效状态：随应用审核生效，或 draft 阶段直接生效 */
export type RedirectUriValidationStatus = 'pending' | 'approved'

/** 审计动作类型（secret 值永不落 audit） */
export type AuditAction =
  | 'app.created'
  | 'app.updated'
  | 'app.deleted'
  | 'app.submitted'
  | 'app.reviewed'
  | 'app.revoked'
  | 'app.suspended'
  | 'app.activated'
  | 'redirect_uri.added'
  | 'redirect_uri.removed'
  | 'scopes.updated'
  | 'secret.rotated'

export interface DeveloperDTO {
  /** OIDC sub（Portal 会话中的身份标识；对 Core 而言是 developers.user_id） */
  sub: string
  display_name: string
  status: DeveloperStatus
  created_at: string
}

export interface RedirectUriDTO {
  id: string
  uri: string
  kind: RedirectUriKind
  validation_status: RedirectUriValidationStatus
  created_at: string
}

export interface ScopeDTO {
  scope: string
  status: ScopeStatus
  /** 使用理由（敏感 scope 必填） */
  justification: string | null
  /** 隐私政策 URL（敏感 scope 必填） */
  privacy_policy_url: string | null
  /** 开发者联系方式（敏感 scope 必填） */
  contact: string | null
  requested_at: string
  approved_at: string | null
  /** 管理员审核意见（rejected 时必有可行动说明，不是红色「失败」） */
  review_note: string | null
}

/** Secret 元数据（明文只出现在 create/rotate 的响应中一次） */
export interface SecretMetadataDTO {
  /** web_confidential 才有值；native_public 恒为 null */
  created_at: string | null
  last_rotated_at: string | null
  /** 形如 sha256:<hex 前 16 位>，用于人工核对 */
  fingerprint: string | null
  /** 明文末 4 位，便于对账 */
  last4: string | null
}

export interface AuditEntryDTO {
  id: string
  at: string
  action: AuditAction
  actor: 'developer' | 'admin' | 'system'
  detail: string
}

export interface ReviewInfoDTO {
  status: DeveloperAppStatus
  submitted_at: string | null
  reviewed_at: string | null
  decision: 'approved' | 'rejected' | null
  /** 被拒绝原因（rejected 时必须有可行动内容） */
  rejection_reason: string | null
  /** 管理员补充意见 */
  review_notes: string | null
  /** 需要修改的项目清单 */
  needs_changes: string[] | null
}

/** 应用列表卡片（Dashboard） */
export interface DeveloperAppSummaryDTO {
  id: string
  client_id: string
  name: string
  client_type: DeveloperClientType
  status: DeveloperAppStatus
  /** scope 摘要（名称列表，含审核状态） */
  scopes: string[]
  updated_at: string
}

/**
 * 应用详情（Tabs 数据源）。
 * 注意：不继承 DeveloperAppSummaryDTO——Detail 的 scopes 是 ScopeDTO[]（含审核状态），
 * Summary 的 scopes 是 string[]（摘要），两者类型不兼容（TS 接口继承要求属性可赋值）。
 */
export interface DeveloperAppDetailDTO {
  id: string
  client_id: string
  name: string
  client_type: DeveloperClientType
  status: DeveloperAppStatus
  /** 详情视图：完整 ScopeDTO（含审核状态/理由），区别于摘要的 string[] */
  scopes: ScopeDTO[]
  updated_at: string
  description: string | null
  homepage_url: string | null
  privacy_policy_url: string | null
  contact: string | null
  created_at: string
  submitted_at: string | null
  activated_at: string | null
  redirect_uris: RedirectUriDTO[]
  review: ReviewInfoDTO
  secret: SecretMetadataDTO
  audit: AuditEntryDTO[]
}

/** 创建应用的输入（字段语义见 issue #624 创建表单） */
export interface CreateAppInput {
  name: string
  description: string
  homepage_url: string | null
  client_type: DeveloperClientType
  privacy_policy_url: string | null
  contact: string | null
  redirect_uris: RedirectUriInput[]
  scopes: ScopeRequestInput[]
}

export interface RedirectUriInput {
  uri: string
  kind: RedirectUriKind
}

export interface ScopeRequestInput {
  scope: string
  /** 使用理由（student.identity / offline_access 必填） */
  justification: string | null
}

/** 可编辑字段（draft/rejected 之外一律锁定；PATCH 部分更新，全部可选） */
export interface UpdateAppInput {
  name?: string
  description?: string
  homepage_url?: string | null
  privacy_policy_url?: string | null
  contact?: string | null
}

/** 创建成功（client_secret 只在这一次返回；native 恒为 null） */
export interface CreateAppResult {
  id: string
  client_id: string
  client_secret: string | null
}

/** Developer API 错误码（BFF 同域映射；Web 侧 UI 据此翻译中文提示） */
export type DeveloperApiErrorCode =
  | 'unauthorized' // 401：无会话/会话过期
  | 'forbidden' // 403：CSRF 失败 / 开发者被暂停 / Origin 不允许
  | 'not_found' // 404：应用不存在或非本人所有（不区分，防枚举）
  | 'invalid_request' // 400：输入校验失败
  | 'invalid_state' // 409：生命周期不允许当前操作
  | 'internal' // 500/502：内部错误

/** 开发者 API 领域错误（携带状态码与错误码，路由层统一映射） */
export class DeveloperApiError extends Error {
  readonly status: number
  readonly code: DeveloperApiErrorCode

  constructor(status: number, code: DeveloperApiErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'DeveloperApiError'
    this.status = status
    this.code = code
  }
}

/** 会话载荷（加密存储于 HttpOnly cookie，见 lib/auth-session） */
export interface DeveloperSessionPayload {
  sub: string
  display_name: string
  /** 双提交 CSRF 值（同值写入非 HttpOnly cookie 供前端回传） */
  csrf: string
  iat: number
  exp: number
}
