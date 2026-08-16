/**
 * 领域错误类型（#619）。
 *
 * 约定：
 * - 业务错误用领域错误类携带机器可读 code（HTTP 层据此映射状态码与错误体）；
 * - 错误 message 不得携带任何敏感值（secret、token、学号等）。
 */

export class DomainError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.status = status
  }
}

/** 相同学号已被其他用户绑定，禁止静默并入（#617 首次绑定语义） */
export class IdentityAlreadyBoundError extends DomainError {
  constructor() {
    super('IDENTITY_ALREADY_BOUND', '该学校身份已绑定其他账户，需由已有设备批准或人工恢复', 409)
  }
}

/** 设备公钥指纹冲突（同一把 Ed25519 公钥已注册） */
export class DeviceFingerprintExistsError extends DomainError {
  constructor() {
    super('DEVICE_FINGERPRINT_EXISTS', '该设备公钥已注册', 409)
  }
}

/** 设备不存在 / 非 active / 已吊销 */
export class DeviceNotActiveError extends DomainError {
  constructor(reason: 'not_found' | 'not_active' | 'revoked' | 'belongs_to_other_user' = 'not_active') {
    super('DEVICE_NOT_ACTIVE', `设备不可用（${reason}）`, 403)
  }
}

/** 一次性 challenge 无效（不存在 / 已消费 / 已过期 / 不匹配） */
export class ChallengeInvalidError extends DomainError {
  constructor() {
    super('CHALLENGE_INVALID', 'enrollment challenge 无效或已过期', 400)
  }
}

/** AuthRequest 不存在 */
export class AuthRequestNotFoundError extends DomainError {
  constructor() {
    super('AUTH_REQUEST_NOT_FOUND', '认证请求不存在', 404)
  }
}

/** AuthRequest 已过期，不可再操作 */
export class AuthRequestExpiredError extends DomainError {
  constructor() {
    super('AUTH_REQUEST_EXPIRED', '认证请求已过期', 410)
  }
}

/** AuthRequest 当前状态不允许该迁移（非法状态机迁移） */
export class AuthRequestInvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('AUTH_REQUEST_INVALID_TRANSITION', `认证请求状态不允许 ${from} → ${to}`, 409)
  }
}

/** 请求已被其他设备批准（并发 approve 的安全失败路径） */
export class AuthRequestAlreadyApprovedError extends DomainError {
  constructor() {
    super('AUTH_REQUEST_ALREADY_APPROVED', '该认证请求已被其他设备批准', 409)
  }
}

/** pairwise subject 密钥未配置（fail closed） */
export class PairwiseKeyNotConfiguredError extends DomainError {
  constructor() {
    super('PAIRWISE_KEY_NOT_CONFIGURED', 'pairwise subject 密钥未配置，拒绝派生', 500)
  }
}

/** Client 不存在或不可用（draft/suspended/revoked 一律视为不可用） */
export class ClientNotFoundError extends DomainError {
  constructor() {
    super('CLIENT_NOT_FOUND', 'Client 不存在或不可用', 404)
  }
}

/** Client 状态迁移非法（如 revoked 后重新 activate） */
export class ClientInvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('CLIENT_INVALID_TRANSITION', `Client 状态不允许 ${from} → ${to}`, 409)
  }
}

/** 请求的 scope 不在 V1 白名单 */
export class InvalidScopeError extends DomainError {
  constructor(scope: string) {
    super('INVALID_SCOPE', `scope 不在 V1 白名单：${scope}`, 400)
  }
}

/** audit metadata 包含敏感字段，拒绝落库 */
export class AuditSensitiveFieldError extends DomainError {
  constructor(field: string) {
    super('AUDIT_SENSITIVE_FIELD', `audit metadata 含敏感字段：${field}`, 400)
  }
}
