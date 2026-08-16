/**
 * 安全层（#626 Security 硬化落地）。
 *
 * 模块清单：
 * - random.ts / hash.ts / client-secret.ts：CSPRNG、HMAC、Client Secret
 *   AES-256-GCM 加密（#619 既有，KEK 只存环境变量）；
 * - rate-limit.ts：Postgres 原子持久化限流（migration 0003，无外部依赖）；
 * - service-token.ts：BFF → Core 服务令牌认证（IDENTITY_SERVICE_TOKEN）；
 * - redact.ts：日志敏感值脱敏（logger.ts 落盘前统一调用）。
 *
 * 安全基线：任何密钥材料禁止硬编码/进日志/进响应；密钥缺失/占位时
 * fail closed（抛错或 503），绝不静默降级。
 */
export const securityStatus = { implemented: true, issue: '#626' }
