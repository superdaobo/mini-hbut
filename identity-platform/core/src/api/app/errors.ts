/**
 * App API 错误类型（#622）。
 *
 * 约定（与 #630 requests API 一致的安全基调）：
 * - 错误响应一律 `{ error: { code, message } }`，message 为简体中文、不含敏感材料；
 * - code 大写 snake（与 #619 domain 错误码风格一致），HTTP 层据此返回状态码；
 * - 业务失败（验签失败、设备不可用等）不泄露任何 secret / 签名材料细节。
 */
import type { RouterContext } from '@koa/router'
import { DomainError } from '../../domain/errors.js'

/** 请求体非法（字段缺失/多余/格式错误）；strict 字段白名单拒绝 student_id 等审批身份字段 */
export class InvalidRequestError extends DomainError {
  constructor(detail: string) {
    super('INVALID_REQUEST', `请求体无效：${detail}`, 400)
  }
}

/** Handoff 头缺失/格式非法/与请求不匹配 */
export class InvalidHandoffError extends DomainError {
  constructor() {
    super('INVALID_HANDOFF', '接力凭据（handoff）无效', 401)
  }
}

/** 设备签名认证失败（Device 方案：签名/时间窗/设备不匹配） */
export class DeviceAuthError extends DomainError {
  constructor(detail: string) {
    super('DEVICE_AUTH_FAILED', `设备签名认证失败：${detail}`, 401)
  }
}

/** issued_at 超出允许时钟偏差（默认 ±60s，配置化） */
export class StaleIssuedAtError extends DomainError {
  constructor() {
    super('STALE_ISSUED_AT', '签名时间超出允许偏差', 400)
  }
}

/** 设备签名验证失败（Ed25519 verify 不通过 / canonical 与请求上下文不符） */
export class InvalidSignatureError extends DomainError {
  constructor() {
    super('SIGNATURE_INVALID', '设备签名无效', 401)
  }
}

/** 已存在该学号身份：V1 不自动关联第二设备，必须走已有设备批准流程 */
export class LinkRequiredError extends DomainError {
  constructor() {
    super('LINK_REQUIRED', '该学号已有绑定账户，第二设备需由已绑定设备批准', 409)
  }
}

/** 测试/演示账号在 production 环境拒绝创建 Identity 用户 */
export class TestAccountRejectedError extends DomainError {
  constructor() {
    super('TEST_ACCOUNT_REJECTED', '测试/演示账号不允许在生产环境注册身份', 400)
  }
}

/** 内部不变量被破坏（如 scope_hash 与 scope 快照不一致）——fail closed，不返回细节 */
export class AppInternalError extends DomainError {
  constructor() {
    super('INTERNAL', '内部错误', 500)
  }
}

/** 统一业务错误响应：`{ error: { code, message } }`（message 不含敏感材料） */
export function respondError(ctx: RouterContext, err: DomainError): void {
  ctx.status = err.status
  ctx.body = { error: { code: err.code, message: err.message } }
}
