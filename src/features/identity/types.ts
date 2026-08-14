// src/features/identity/types.ts
//
// #623：Identity 授权确认 UX 的领域类型（DTO / 状态 / 错误码）。
//
// 安全边界：
//   - 本文件只描述“可展示的清洗后数据”与“用户可读错误”，不承载任何 secret；
//   - handoff secret 只存在于 identityIntentStore 内存（#621 冻结模块），
//     本层所有类型都不包含 handoff 字段（网络层内部使用，不进入 UI 状态）。

/** scope 风险等级（来自 Core sanitized DTO 的 risk 字段） */
export type IdentityScopeRisk = 'basic' | 'sensitive'

/** 单个 scope 的展示信息（服务端下发，App 不信任 deep link 里的任何展示资料） */
export interface IdentityScopeInfo {
  id: string
  label: string
  risk: IdentityScopeRisk
}

/** 第三方应用展示信息（服务端下发 sanitized 数据） */
export interface IdentityClientInfo {
  name: string
  homepage_host: string
  developer_display_name: string
  review_status: string
  /** 测试应用标记（Core 判定）：授权栏据此展示"测试、不获取数据"说明 */
  is_test?: boolean
}

/**
 * GET /api/v1/requests/:id 返回的请求详情（与 identity-platform/web/lib/core-client/contract.ts 对齐）。
 *
 * challenge / client_id 为可选字段：
 *   - #622 冻结的 Core 当前只返回 sanitized 详情，不包含签名材料；
 *   - 本前端按“宽容解析”设计：服务端一旦下发（与 issue #623 示例 JSON 一致），
 *     approve 签名链路自动生效；缺失时进入 signing_material_missing 用户可读错误。
 */
export interface IdentityRequestDetail {
  request_id: string
  /** ISO 8601 过期时间（真正过期判定始终由 Core 决定，App 只做本地倒计时展示） */
  expires_at: string
  client: IdentityClientInfo
  scopes: IdentityScopeInfo[]
  /** 设备签名对象（非 secret；未来 Core 下发时使用） */
  challenge?: string
  /** 审批签名需要精确匹配的 client_id（未来 Core 下发时使用） */
  client_id?: string
}

/** 本机设备身份本地状态（identity_device_status 返回） */
export interface IdentityLocalDeviceStatus {
  /** keyring 可用且设备身份功能可工作 */
  available: boolean
  /** 本机是否已有设备密钥 */
  has_key: boolean
  /** 已有密钥时的指纹（sha256(canonical JWK) base64url） */
  fingerprint: string | null
  /** 不可用原因（简体中文；可用时为 null） */
  error: string | null
}

/** 设备注册结果（identity_enroll_device 返回） */
export interface IdentityEnrollResult {
  user_id: string
  device_id: string
  status: string
  fingerprint: string
}

/** 审批签名结果（identity_sign_auth_request 返回；绝不含私钥材料） */
export interface IdentitySignedApproval {
  device_id: string
  issued_at: number
  nonce: string
  signature: string
  canonical_version: string
}

/** Core approve 响应 */
export interface IdentityApproveResult {
  request_id: string
  status: string
  approved_at: string | null
  already_approved: boolean
}

/** 用户可读错误码（#623「错误页面/状态」清单收敛；UI 不显示 stack/DB/crypto detail） */
export type IdentityUserSafeErrorCode =
  | 'request_expired' // 应用请求已过期
  | 'request_not_found' // 请求不存在或已完成
  | 'client_unavailable' // 应用已被暂停
  | 'invalid_handoff' // 接力凭据无效（安全拒绝，不泄露细节）
  | 'network_unavailable' // 网络不可用
  | 'device_not_bound' // 设备尚未绑定
  | 'device_revoked' // 当前设备已撤销
  | 'session_revalidation_required' // 学校登录需要重新验证
  | 'secure_storage_unavailable' // 本机安全存储不可用
  | 'signature_rejected' // 服务器无法验证签名
  | 'signing_material_missing' // 授权签名材料不完整（Core 未下发 challenge/client_id）
  | 'test_account_blocked' // 测试账号不能用于正式身份服务
  | 'unknown' // 兜底通用错误

/** 带用户可读信息的业务错误（service 层统一抛出） */
export class IdentityServiceError extends Error {
  readonly code: IdentityUserSafeErrorCode
  /** 内部脱敏细节（仅日志，不展示） */
  readonly internalDetail?: string

  constructor(code: IdentityUserSafeErrorCode, message: string, internalDetail?: string) {
    super(message)
    this.name = 'IdentityServiceError'
    this.code = code
    this.internalDetail = internalDetail
  }
}

/**
 * #623 授权确认 Overlay 的 12 相位状态机（issue #623「Identity Store 状态」）。
 * 由 IdentityCoordinator 驱动；identityIntentStore（#621）仍保持其 8 相位合同，
 * 二者通过 coordinator 单向同步，不在本层重复定义意图队列。
 */
export type IdentityApprovalPhase =
  | 'idle'
  | 'received'
  | 'loading_request'
  | 'needs_login'
  | 'validating_session'
  | 'ready'
  | 'approving'
  | 'denying'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'error'

/** 授权最终结果（结果页展示用；intent store 的终态只有 done/error，细分在此记录） */
export type IdentityApprovalOutcome = 'approved' | 'denied' | 'cancelled' | 'expired' | 'error'

/** 结果页信息 */
export interface IdentityResultInfo {
  requestId: string
  outcome: IdentityApprovalOutcome
  /** 用户可读说明 */
  message: string
  /** 错误码（error 结果时存在；脱敏日志用） */
  errorCode?: IdentityUserSafeErrorCode
  /** 是否属于可重试的临时失败（网络类） */
  retryable: boolean
}
