/**
 * Web BFF → Core 服务令牌（#626 Threat 11）。
 *
 * BFF（auth./developer. 站点服务端）调用 Core 的 /api/v1/requests|admin|developer
 * 时，必须携带 `x-identity-service-token: <IDENTITY_SERVICE_TOKEN>`。
 * Core 侧常量时间校验（core/src/security/service-token.ts），拒绝伪造。
 *
 * 安全属性：
 * - 令牌只存在于 Vercel Web 环境变量，永不进浏览器 bundle/日志/URL；
 * - 本 helper 缺省不读取任何值到响应；只是构造请求头；
 * - 未配置时返回 undefined：Core 在 development/test 放行、production/preview
 *   直接 503（fail closed），本地联调不受影响。
 */
export type EnvLike = Record<string, string | undefined>

/** 服务令牌请求头名（与 core/src/security/service-token.ts 保持同一常量） */
export const SERVICE_TOKEN_HEADER = 'x-identity-service-token'

/** 读取环境变量中的服务令牌（未配置返回 undefined，不抛错） */
export function serviceToken(env: EnvLike = process.env): string | undefined {
  const value = env.IDENTITY_SERVICE_TOKEN?.trim()
  return value && value.length > 0 ? value : undefined
}

/** 构造服务令牌头（未配置时返回空对象，客户端附加逻辑透明） */
export function serviceTokenHeaders(env: EnvLike = process.env): Record<string, string> {
  const token = serviceToken(env)
  return token ? { [SERVICE_TOKEN_HEADER]: token } : {}
}
