/**
 * Core API 契约（issue #630 定义的 sanitized DTO 与错误码）。
 *
 * 这些类型同时是 BFF 与浏览器端使用的合同：
 *  - Web 只读取 Core 返回的 sanitized 数据，不接触 device challenge / student id /
 *    authorization code / client secret / interaction 内部 payload；
 *  - 错误一律以 { error: <code> } JSON 返回，禁止在错误信息中携带 handoff 或其他敏感值。
 */

/** Core 侧请求状态（页面状态机的输入之一） */
export type CoreRequestStatus =
  | 'waiting_app'
  | 'app_opened'
  | 'approved'
  | 'denied'
  | 'expired'

/** scope 风险等级 */
export type ScopeRisk = 'basic' | 'sensitive'

export interface RequestScopeDTO {
  id: string
  label: string
  risk: ScopeRisk
}

export interface RequestClientDTO {
  /** 应用名称（第三方提供，渲染时必须转义，见安全测试） */
  name: string
  /** 应用主页 hostname（防钓鱼关键信息，必须展示） */
  homepage_host: string
  developer_display_name: string
  review_status: string
  /** 测试应用标记（Core 判定）：接力页据此展示"测试、不获取数据"说明 */
  is_test?: boolean
}

/** GET /api/v1/requests/:id 返回的请求详情（与 issue 示例 JSON 一致） */
export interface RequestDetailDTO {
  request_id: string
  /** ISO 8601 过期时间（真正过期判断始终由 Core 决定） */
  expires_at: string
  client: RequestClientDTO
  scopes: RequestScopeDTO[]
}

/** GET /api/v1/requests/:id/status 返回的最小状态 */
export interface RequestStatusDTO {
  request_id: string
  status: CoreRequestStatus
  expires_at: string
}

/** POST /api/v1/requests/:id/resume 返回（幂等：重复调用返回 already_resumed，不产生第二份授权结果） */
export interface ResumeResultDTO {
  status: 'approved' | 'already_resumed'
  /** oidc-provider interactionFinished 决定的回调地址；Web 不接受任意 next= */
  redirect_to?: string
}

export type CoreErrorCode =
  | 'invalid_handoff'
  | 'not_found'
  | 'expired'
  | 'client_unavailable'
  | 'not_approved'
  | 'invalid_request'
  | 'internal'

/** Core API 错误（BFF 捕获后映射为同域 JSON 错误，不泄露内部细节） */
export class CoreApiError extends Error {
  readonly status: number
  readonly code: CoreErrorCode

  constructor(status: number, code: CoreErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'CoreApiError'
    this.status = status
    this.code = code
  }
}
