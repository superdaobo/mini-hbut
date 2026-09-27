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

// ---------------------------------------------------------------------------
// #902 设备换票（device-signed token exchange）专用错误
//
// 错误码口径（协议 `docs/game-platform/protocol-v1.md` §5 的 17 码，逐条对应关系）：
//   - SCHEMA_INVALID（400）#15：请求体形状/字段非法（含"非 actor 类的服务端权威字段"）；
//   - FORBIDDEN_ACTOR（403）#17：请求体出现 actor 字段（student_id / player_id / user_id）——
//     本路径的身份**只能**来自设备签名 → 设备记录 → user_id，绝不接受请求体声明；
//   - AUTH_REQUIRED（401）#1：challenge 不存在/已消费/已过期（凭据校验链 fail closed）；
//   - FEATURE_DISABLED（403）#10：设备换票能力未配置（灰度默认关闭）→ 客户端直接回退 legacy；
//   - RATE_LIMITED（429）#9：由 security/rate-limit.ts 中间件产出（既有 envelope）。
// 设备签名本身失败沿用既有 DEVICE_AUTH_FAILED（401，与 /devices/me 同口径），
// 语义上是 AUTH_REQUIRED 的设备签名子类，保持 App API 既有契约不漂移。
// ---------------------------------------------------------------------------

/** 请求体形状/字段非法（协议 §5 #15） */
export class SchemaInvalidError extends DomainError {
  constructor(detail: string) {
    super('SCHEMA_INVALID', `请求体无效：${detail}`, 400)
  }
}

/** 请求体含 actor 字段（协议 §5 #17）：身份只能来自设备签名 */
export class ForbiddenActorError extends DomainError {
  constructor(field: string) {
    super('FORBIDDEN_ACTOR', `请求体不得包含身份字段 ${field}（身份只能来自设备签名）`, 403)
  }
}

/**
 * 设备换票 challenge 无效（协议 §5 #1）。
 * 不存在 / 已消费 / 已过期 / 属于其它设备 **共用同一错误与文案**：
 * 不给探测者提供状态预言机（协议 §6.2.4 探测防护），细节只进服务端日志。
 */
export class DeviceChallengeInvalidError extends DomainError {
  constructor() {
    super('AUTH_REQUIRED', '设备 challenge 无效或已失效，请重新获取', 401)
  }
}

/** 设备换票能力未开启（协议 §5 #10）：未配置第一方换票 client 或该 client 不可用 */
export class DeviceTokenFeatureDisabledError extends DomainError {
  constructor() {
    super('FEATURE_DISABLED', '设备换取身份令牌的能力未开启', 403)
  }
}

/** 统一业务错误响应：`{ error: { code, message } }`（message 不含敏感材料） */
export function respondError(ctx: RouterContext, err: DomainError): void {
  ctx.status = err.status
  ctx.body = { error: { code: err.code, message: err.message } }
}
