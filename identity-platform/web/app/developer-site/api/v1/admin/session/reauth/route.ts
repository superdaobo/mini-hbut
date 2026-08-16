/**
 * BFF：POST /api/v1/admin/session/reauth —— step-up 重新认证入口。
 *
 * 高风险动作（敏感 scope 审核 / suspend / revoke）被 Core 以
 * 403 step_up_required 拒绝时，前端调用本端点：
 *  - 清除会话 cookie（mh_dev_session / mh_dev_csrf）；
 *  - 302 到 /login 重新走 Mini-HBUT App Approval（不是前端 confirm 弹窗）。
 * 由于是「主动放弃会话」动作，本端点不做 CSRF 校验（清除会话本身无害，
 * 且 CSRF 头来自会话，会话已被判定过期时前端无法取得）；仍要求 Origin 同源。
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  clearSessionCookies,
} from '@/lib/auth-session/index'
import { isOriginAllowed } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // 跨源请求一律拒绝（防第三方站点触发登出循环）
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin), 302)
  for (const cookie of clearSessionCookies()) {
    response.headers.append('Set-Cookie', cookie)
  }
  return response
}
