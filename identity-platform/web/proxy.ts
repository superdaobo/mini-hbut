/**
 * Next.js 16 请求入口（proxy.ts，替代旧 middleware.ts）。
 *
 * 职责：
 *   1. 按 Host 做站点路由（fail closed）——
 *      - auth.<domain>      -> rewrite /auth-site/*
 *      - developer.<domain> -> rewrite /developer-site/*
 *      - Preview host       -> rewrite /preview-site/*（必须显式列入白名单）
 *      - 未知 Host          -> 404，绝不默认落到管理后台
 *   2. auth（含 preview）站点响应统一附加安全头（#630）：
 *      no-store / no-referrer / nosniff / CSP（生产严格，开发放宽）。
 *      HTML 页面与同域 BFF API 响应都经过这里；纯逻辑在 lib/security/headers.ts（可单测）。
 *
 * 纯分类逻辑在 lib/host-router.ts（可单测），本文件只做薄封装。
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { classifyHost } from './lib/host-router'
import { authSiteSecurityHeaders } from './lib/security/headers'

const SITE_PREFIX: Record<'auth' | 'developer' | 'preview', string> = {
  auth: '/auth-site',
  developer: '/developer-site',
  preview: '/preview-site',
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const env = process.env

  const decision = classifyHost(host, {
    authOrigin: env.AUTH_PUBLIC_ORIGIN,
    developerOrigin: env.DEVELOPER_PUBLIC_ORIGIN,
    previewHosts: (env.IDENTITY_PREVIEW_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
    allowLocalhostDev: (env.IDENTITY_ENVIRONMENT ?? 'development') === 'development',
  })

  if (decision.kind === 'blocked') {
    // fail closed：未识别 Host 一律 404，响应体不携带任何路由/环境信息
    return new NextResponse(null, { status: 404 })
  }

  // 把原路径挂到对应站点前缀下，由 App Router 渲染站点页面
  const prefix = SITE_PREFIX[decision.kind]
  const pathname = request.nextUrl.pathname
  const target = new URL(`${prefix}${pathname}${request.nextUrl.search}`, request.nextUrl)
  const response = NextResponse.rewrite(target)

  // auth 站点（及 preview 部署）统一安全头：页面与 BFF API 响应均生效
  if (decision.kind === 'auth' || decision.kind === 'preview') {
    for (const [key, value] of Object.entries(authSiteSecurityHeaders())) {
      response.headers.set(key, value)
    }
  }

  return response
}

// 只对页面/API 请求生效，跳过 Next 内部静态资源，降低代理开销
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
