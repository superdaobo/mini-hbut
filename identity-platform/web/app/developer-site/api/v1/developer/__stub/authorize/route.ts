/**
 * 桩模式专用授权端点（仅 IDENTITY_OIDC_STUB=1 / IDENTITY_CORE_STUB=1 时注册）。
 * 模拟 Core 的 /oauth/authorize：立即 302 回 callback 并颁发桩授权码。
 * 真实模式（Core #620 就绪）下该路由不存在任何业务意义，关闭开关即 404。
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { newStubAuthCode } from '@/lib/developer-oidc'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const env = process.env
  if (env.IDENTITY_OIDC_STUB !== '1' && env.IDENTITY_CORE_STUB !== '1') {
    return new NextResponse(null, { status: 404 })
  }
  const state = request.nextUrl.searchParams.get('state')
  const redirectUri = env.DEVELOPER_REDIRECT_URI?.trim()
  if (!state || !redirectUri) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const url = new URL(redirectUri)
  url.searchParams.set('code', newStubAuthCode())
  url.searchParams.set('state', state)
  return NextResponse.redirect(url, 302)
}
