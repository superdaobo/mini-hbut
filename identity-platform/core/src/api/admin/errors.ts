/**
 * Admin API 领域错误（#625）。
 *
 * 约定（与 #619 DomainError 一致）：
 * - 机器可读 code + HTTP status；错误 message 不携带敏感值（学号/secret/token）；
 * - 401/403 语义：401 = 无身份（缺 admin subject 头），403 = 有身份但角色不足/
 *   step-up 过期/self-review。
 */
import { DomainError } from '../../domain/errors.js'

/** 缺少 admin subject（BFF 未传身份头）：401 */
export class AdminUnauthorizedError extends DomainError {
  constructor() {
    super('ADMIN_UNAUTHORIZED', '缺少管理员身份（x-admin-subject）', 401)
  }
}

/** 有身份但角色不足 / 不是管理员 / 用户被禁用：403（不区分细节，防枚举） */
export class AdminForbiddenError extends DomainError {
  constructor() {
    super('ADMIN_FORBIDDEN', '当前账号没有管理员权限', 403)
  }
}

/** 高风险动作需要近期认证（auth_time 窗口过期）：403，需重新登录后重试 */
export class StepUpRequiredError extends DomainError {
  constructor(windowSeconds: number) {
    super('STEP_UP_REQUIRED', `高风险操作需要 ${Math.floor(windowSeconds / 60)} 分钟内的重新认证`, 403)
  }
}

/** 审核人不得审核自己（作为 owner）的应用：403 */
export class SelfReviewForbiddenError extends DomainError {
  constructor() {
    super('SELF_REVIEW_FORBIDDEN', '不能审核自己（作为应用所有者）提交的应用', 403)
  }
}

/** review 不存在（防枚举：与状态异常分开报错是安全的，review id 是 UUIDv7） */
export class ReviewNotFoundError extends DomainError {
  constructor() {
    super('REVIEW_NOT_FOUND', '审核记录不存在', 404)
  }
}

/** review 已不在 pending（已审/已 superseded），当前操作不适用：409 */
export class ReviewNotPendingError extends DomainError {
  constructor(status: string) {
    super('REVIEW_NOT_PENDING', `该审核已处于 ${status} 状态`, 409)
  }
}

/** 应用内容在快照后发生变化（TOCTOU 防护）：409，review 已被自动 superseded */
export class RevisionMismatchError extends DomainError {
  constructor() {
    super('REVISION_MISMATCH', '应用配置在提交审核后已变化，原审核已作废，请开发者重新提交', 409)
  }
}

/** 应用不存在（admin 视角）：404 */
export class AdminClientNotFoundError extends DomainError {
  constructor() {
    super('CLIENT_NOT_FOUND', 'Client 不存在', 404)
  }
}

/** 状态迁移非法（如 unsuspend 非 suspended、suspend 非 active）：409 */
export class AdminInvalidStateError extends DomainError {
  constructor(message: string) {
    super('INVALID_STATE', message, 409)
  }
}

/** 输入校验失败（reason/scope_decisions 等）：400 */
export class AdminInvalidInputError extends DomainError {
  constructor(message: string) {
    super('INVALID_INPUT', message, 400)
  }
}

/** 角色授予冲突（已存在且未撤销）：409 */
export class RoleAlreadyGrantedError extends DomainError {
  constructor(role: string) {
    super('ROLE_ALREADY_GRANTED', `该用户已拥有 ${role} 角色`, 409)
  }
}

/** 角色不存在或已撤销：404 */
export class RoleNotFoundError extends DomainError {
  constructor(role: string) {
    super('ROLE_NOT_FOUND', `该用户没有 ${role} 角色`, 404)
  }
}
