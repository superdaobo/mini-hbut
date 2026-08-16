/**
 * Dogfood 回调：GET /callback（server-side，Authorization Code + PKCE 交换）。
 *
 * 流程：校验 state（对照 HttpOnly cookie，常量时间比较）→ 交换授权码 →
 * 创建加密会话（HttpOnly + SameSite=Lax）→ 清除登录中间态 cookie → 302 /apps。
 *
 * 安全：
 *  - 无 code/state 或 cookie 缺失 → 400（不产生会话）；
 *  - state 不匹配 → 400（登录 CSRF 防护）；
 *  - id_token 的 iss/aud/exp/nonce 校验由 openid-client 完成（不手写）；
 *  - 失败一律 4xx 错误 JSON，绝不把异常细节回显。
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  OIDC_PKCE_COOKIE,
  OIDC_STATE_COOKIE,
  buildCsrfCookie,
  buildSessionCookie,
  encryptSession,
  readCookie,
  serializeCookie,
  sessionCookieSecure,
  sessionTtlSeconds,
} from '@/lib/auth-session/index'
import { newCsrfToken } from '@/lib/developer/csrf'
import { getOidcClient } from '@/lib/developer-oidc'

export const dynamic = 'force-dynamic'

interface StoredFlow {
  state: string
  nonce: string
}

/** 常量时间比较（防时序侧信道） */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export async function GET(request: NextRequest) {
  const env = process.env
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const cookieHeader = request.headers.get('cookie')

  const redirectUri = env.DEVELOPER_REDIRECT_URI?.trim()
  if (!redirectUri) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  if (!code || !stateParam) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const stateRaw = readCookie(cookieHeader, OIDC_STATE_COOKIE)
  const verifier = readCookie(cookieHeader, OIDC_PKCE_COOKIE)
  let flow: StoredFlow | null = null
  try {
    flow = stateRaw ? (JSON.parse(stateRaw) as StoredFlow) : null
  } catch {
    flow = null
  }
  if (!flow || !verifier || typeof flow.state !== 'string' || typeof flow.nonce !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  // state 必须与登录时签发的一致（登录 CSRF 防护）
  if (!timingSafeEqual(flow.state, stateParam)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  let user: { sub: string; display_name: string; claims: Record<string, unknown> }
  try {
    user = await getOidcClient(env).exchangeCode({
      currentUrl: request.nextUrl.toString(),
      codeVerifier: verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
    })
  } catch {
    // 交换失败（授权码无效/已被使用/校验失败）：不产生会话
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const now = Math.floor(Date.now() / 1000)
  const csrf = newCsrfToken()
  const token = encryptSession(
    {
      sub: user.sub,
      display_name: user.display_name,
      csrf,
      iat: now,
      exp: now + sessionTtlSeconds(env),
    },
    env,
  )

  const response = NextResponse.redirect(new URL('/apps', request.nextUrl.origin), 302)
  response.headers.append('Set-Cookie', buildSessionCookie(token, env))
  response.headers.append('Set-Cookie', buildCsrfCookie(csrf, env))
  // 清除 OIDC 登录中间态 cookie（state/nonce/verifier 一次性：登录完成后即失效）
  const clearFlowCookie = (name: string) =>
    serializeCookie(name, '', {
      secure: sessionCookieSecure(env),
      maxAgeSeconds: 0,
      httpOnly: true,
      sameSite: 'Lax',
    })
  response.headers.append('Set-Cookie', clearFlowCookie(OIDC_STATE_COOKIE))
  response.headers.append('Set-Cookie', clearFlowCookie(OIDC_PKCE_COOKIE))
  return response
}
