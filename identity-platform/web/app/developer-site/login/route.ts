/**
 * Dogfood 登录入口：GET /login。
 *  - 已有有效会话 → 302 /apps；
 *  - 否则生成 state / nonce / PKCE verifier（全部入 HttpOnly cookie），
 *    302 到 OIDC 授权端点（Authorization Code + PKCE S256）。
 *
 * 安全：浏览器 bundle 不接触 verifier / state / nonce；cookie SameSite=Lax。
 */

import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  OIDC_PKCE_COOKIE,
  OIDC_STATE_COOKIE,
  parseSessionFromCookies,
  serializeCookie,
  sessionCookieSecure,
} from '@/lib/auth-session/index'
import { getOidcClient } from '@/lib/developer-oidc'

export const dynamic = 'force-dynamic'

const OIDC_FLOW_MAX_AGE = 600 // 登录中间态 10 分钟

function newToken(): string {
  return randomBytes(32).toString('base64url')
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url')
}

export async function GET(request: NextRequest) {
  const env = process.env
  // 已登录直接进控制台
  if (parseSessionFromCookies(request.headers.get('cookie'), env)) {
    return NextResponse.redirect(new URL('/apps', request.nextUrl.origin), 302)
  }

  const state = newToken()
  const nonce = newToken()
  const verifier = newToken()

  const redirectUri = env.DEVELOPER_REDIRECT_URI?.trim()
  if (!redirectUri) {
    // fail closed：未配置回调地址绝不发起登录
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  let authUrl: string
  try {
    authUrl = await getOidcClient(env).buildAuthUrl({
      state,
      nonce,
      codeChallenge: pkceChallenge(verifier),
    })
  } catch {
    // 配置缺失/发现失败：登录不可用，但绝不降级为其他登录方式
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const secure = sessionCookieSecure(env)
  const response = NextResponse.redirect(authUrl, 302)
  response.headers.append(
    'Set-Cookie',
    serializeCookie(OIDC_STATE_COOKIE, JSON.stringify({ state, nonce }), {
      secure,
      maxAgeSeconds: OIDC_FLOW_MAX_AGE,
      httpOnly: true,
      sameSite: 'Lax',
    }),
  )
  response.headers.append(
    'Set-Cookie',
    serializeCookie(OIDC_PKCE_COOKIE, verifier, {
      secure,
      maxAgeSeconds: OIDC_FLOW_MAX_AGE,
      httpOnly: true,
      sameSite: 'Lax',
    }),
  )
  return response
}
