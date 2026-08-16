/**
 * Web 安全层（#626 Security 硬化落地）。
 *
 * 模块清单：
 * - headers.ts：auth/developer 站点安全头（CSP、Permissions-Policy、COOP、
 *   Trusted Types 开关），proxy.ts 附加；
 * - redact.ts：日志敏感值脱敏（handoff / Authorization / secret / 学号）；
 * - service-token.ts：BFF → Core 服务令牌构造（IDENTITY_SERVICE_TOKEN）。
 *
 * 与 Core 侧对应：core/src/security/{rate-limit,service-token,redact}.ts。
 */
export const webSecurityStatus = { implemented: true, issue: '#626' }
