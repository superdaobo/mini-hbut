/**
 * BFF → Core 服务令牌认证（#626 Threat 11 / #625 登记未落地项）。
 *
 * 背景：/api/v1/admin/**、/api/v1/developer/**、/api/v1/requests/** 是
 * Web BFF（auth./developer. 站点）到 Core 的 server-to-server 通道。
 * 仅靠 x-admin-subject / x-developer-subject / x-identity-handoff 头不够——
 * 这些头可以由任意客户端伪造，不能作为传输层认证。必须叠加服务令牌：
 *
 * - Web BFF 在每个请求附加 `x-identity-service-token: <IDENTITY_SERVICE_TOKEN>`；
 * - Core 校验该头与 IDENTITY_SERVICE_TOKEN 常量时间相等，拒绝伪造；
 * - 浏览器侧拿不到该令牌（只在 Vercel Web 环境变量，不进 bundle）；
 * - App（native）端点 /api/v1/app/** 不走此认证（handoff + 设备签名双因子），
 *   OIDC 协议端点 /oauth/** 是公开协议面（client 凭据/PKCE 自有认证）。
 *
 * 环境策略（fail closed 优先）：
 * - 配置了 IDENTITY_SERVICE_TOKEN → 一律校验（任何环境）；
 * - 未配置：production/preview 直接 503（服务不可用也不放行未认证请求）；
 *   development/test 放行并打 warn（本地联调便利，上线前必须配置）。
 *
 * 防时序侧信道：长度不同直接拒绝，长度相同用 timingSafeEqual。
 */
import type { Middleware } from 'koa'
import { timingSafeEqual } from 'node:crypto'

export type EnvLike = Record<string, string | undefined>

/** 服务令牌请求头名（与 web/lib/security/service-token.ts 保持同一常量） */
export const SERVICE_TOKEN_HEADER = 'x-identity-service-token'

/** 需要服务令牌的路径前缀（BFF server-to-server 通道） */
const PROTECTED_PREFIXES = ['/api/v1/requests/', '/api/v1/admin/', '/api/v1/developer/']

/** 常量时间比较两个字符串（长度不同立即 false，避免泄露长度信息） */
export function safeTokenEqual(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) {
    return false
  }
  if (expected.length !== actual.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'))
}

export interface ServiceTokenMiddlewareOptions {
  env?: EnvLike
  /** 测试注入令牌（缺省读 IDENTITY_SERVICE_TOKEN） */
  token?: string
}

/** 构造服务令牌校验中间件（#626：注册在 router 之前，仅保护 BFF 前缀） */
export function serviceTokenMiddleware(options: ServiceTokenMiddlewareOptions = {}): Middleware {
  const env = options.env ?? process.env
  const token = options.token ?? env.IDENTITY_SERVICE_TOKEN
  const environment = (env.IDENTITY_ENVIRONMENT ?? 'development').trim().toLowerCase()

  return async (ctx, next) => {
    const path = ctx.path
    if (!PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      await next()
      return
    }
    if (!token) {
      // 未配置：生产/预览 fail closed；开发/测试放行（本地联调）
      if (environment === 'production' || environment === 'preview') {
        ctx.status = 503
        ctx.body = { error: 'service_token_not_configured' }
        return
      }
      ctx.app.emit('warn', new Error('[security] IDENTITY_SERVICE_TOKEN 未配置，BFF 端点未认证（仅限 development/test）'))
      await next()
      return
    }
    const presented = ctx.get(SERVICE_TOKEN_HEADER)
    if (!safeTokenEqual(token, presented)) {
      // 拒绝 header 伪造：缺失/错误统一 401，不泄露差异原因
      ctx.status = 401
      ctx.set('Cache-Control', 'no-store')
      ctx.body = { error: 'unauthorized' }
      return
    }
    await next()
  }
}
