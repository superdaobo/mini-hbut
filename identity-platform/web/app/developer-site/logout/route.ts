/**
 * Dogfood 登出：POST /logout（带 CSRF，防 logout CSRF）。
 * 清除会话与 CSRF cookie，302 回首页。
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { clearSessionCookies } from '@/lib/auth-session/index'
import { guardMutation } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const guard = guardMutation(request)
  if (guard instanceof NextResponse) {
    return guard
  }
  const response = NextResponse.redirect(new URL('/', request.nextUrl.origin), 302)
  for (const c of clearSessionCookies(process.env)) {
    response.headers.append('Set-Cookie', c)
  }
  return response
}

/** GET /logout 一律 405（登出必须走 POST + CSRF） */
export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
