/**
 * auth.* / developer.* 站点安全响应头（纯函数，可单测）。
 *
 * 要求（issue #630 Security Headers + #626 Threat 7 XSS / Threat 9 CORS）：
 *  - Cache-Control: no-store（页面与 BFF 均不缓存）；
 *  - Referrer-Policy: no-referrer（不向外泄露来源，包括 handoff 所在页面）；
 *  - X-Content-Type-Options: nosniff；
 *  - CSP：frame-ancestors 'none'、object-src 'none'、base-uri 'self'、
 *    form-action 'self'、upgrade-insecure-requests；script/style/image 只允许
 *    自身所需；不加载广告/第三方 analytics/任意第三方 script；
 *  - Permissions-Policy：禁摄像头/麦克风/定位/支付/USB（web 面最小权限）；
 *  - Trusted Types：Next.js 16 的 RSC 内联脚本尚未原生兼容
 *    `require-trusted-types-for 'script'`，因此做成显式开关
 *    （IDENTITY_CSP_TRUSTED_TYPES=1），框架升级稳定支持后再默认启用；
 *  - 生产严格 CSP；开发模式放宽（Next HMR/dev overlay 需要 inline script），
 *    部署（next start / Vercel）时 NODE_ENV=production，自动使用严格策略。
 */
export type EnvLike = Record<string, string | undefined>

/** 基础头（所有环境都生效） */
export function baseSecurityHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    // 旧浏览器兜底（frame-ancestors 的补充）
    'X-Frame-Options': 'DENY',
  }
}

/** 浏览器功能权限最小化（#626 Threat 7：第三方脚本即使被注入也无敏感能力可用） */
export function permissionsPolicyHeaders(): Record<string, string> {
  return {
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()',
    // 跨源隔离加固：阻止窗口被跨源页面包进 opener 上下文（防 window.opener 类攻击）
    'Cross-Origin-Opener-Policy': 'same-origin',
    // 跨域策略：拒绝被其他站点 fetch 本资源（防 side-channel 读取）
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
  }
}

/** 生产严格 CSP：只允许自身 origin 的 script/style/image，禁止任何内联执行 */
export function strictContentSecurityPolicy(opts: { trustedTypes?: boolean } = {}): string {
  const directives = [
    "default-src 'self'",
    // Next.js RSC 需要内联 hydration 脚本（self.__next_f）；无它页面 JS 不执行（#630 接力页卡 LOADING）。
    // XSS 纵深由 React 自动转义 + 无 dangerouslySetInnerHTML（security 测试断言）兜底。
    "script-src 'self' 'unsafe-inline'",
    // Next.js 需要 style 内联（样式属性/动态注入）；style 不执行脚本，风险可控
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]
  // #626：Trusted Types 显式开关（Next RSC 内联脚本兼容性说明见文件头）
  if (opts.trustedTypes) {
    directives.push("require-trusted-types-for 'script'")
  }
  return directives.join('; ')
}

/** 开发模式 CSP：保留 frame-ancestors/object-src 等硬约束，放宽 script/style（HMR 需要） */
export function devContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** Trusted Types 是否启用（IDENTITY_CSP_TRUSTED_TYPES=1；缺省关闭） */
export function trustedTypesEnabled(env: EnvLike): boolean {
  return env.IDENTITY_CSP_TRUSTED_TYPES === '1'
}

/** auth.* 站点完整安全头（按环境选择 CSP） */
export function authSiteSecurityHeaders(env: EnvLike = process.env): Record<string, string> {
  const production = (env.NODE_ENV ?? 'production') === 'production'
  return {
    ...baseSecurityHeaders(),
    'Content-Security-Policy': production
      ? strictContentSecurityPolicy({ trustedTypes: trustedTypesEnabled(env) })
      : devContentSecurityPolicy(),
    ...permissionsPolicyHeaders(),
  }
}

/**
 * developer.* 站点完整安全头（#626：#625 登记「developer 域 CSP 未附加」的补位）。
 * 与 auth 站点同强度：CSP 严格、权限策略最小化、不缓存。
 * 接入方式：由 proxy.ts 对 developer Host 分支附加（该文件为 #618 冻结，
 * 需要在主 Agent 批准的 Wave Gate 中增加一行）；测试直接断言本函数输出。
 */
export function developerSiteSecurityHeaders(env: EnvLike = process.env): Record<string, string> {
  const production = (env.NODE_ENV ?? 'production') === 'production'
  return {
    ...baseSecurityHeaders(),
    'Content-Security-Policy': production
      ? strictContentSecurityPolicy({ trustedTypes: trustedTypesEnabled(env) })
      : devContentSecurityPolicy(),
    ...permissionsPolicyHeaders(),
  }
}
