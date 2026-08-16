/**
 * Developer BFF 公共守卫（route handler 层，逻辑可单测）。
 *
 * 安全要点（issue #624）：
 *  - 所有 /api/v1/developer/* mutation 必须先过会话校验（HttpOnly cookie →
 *    AES-GCM 解密 → 过期检查），owner 一律从会话 sub 推导；
 *  - CSRF：双提交 Cookie（header x-csrf-token == cookie == 会话内值）+ Origin 校验；
 *  - 错误统一 { error: <code> } + no-store；绝不回显 secret/内部细节；
 *  - 响应头 Cache-Control: no-store（开发者数据一律不缓存）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  CSRF_COOKIE_NAME,
  parseSessionFromCookies,
  readCookie,
} from '@/lib/auth-session/index'
import { CSRF_HEADER, originAllowed, verifyCsrf } from '@/lib/developer/csrf'
import type { DeveloperSessionPayload } from '@/lib/developer/contract'
import { DeveloperApiError } from '@/lib/developer/contract'
import { normalizeHost } from '@/lib/host-router'

export type EnvLike = Record<string, string | undefined>

export function noStoreJsonHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
  }
}

export function errorJson(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status, headers: noStoreJsonHeaders() })
}

/** 会话解析：缺失/过期/篡改一律 401（不区分，防探测） */
export function requireSession(
  request: NextRequest,
  env: EnvLike = process.env,
): DeveloperSessionPayload | null {
  return parseSessionFromCookies(request.headers.get('cookie'), env)
}

/** Origin 白名单（开发环境额外放行 localhost） */
export function allowedOrigins(env: EnvLike = process.env): string[] {
  const list: string[] = []
  const devOrigin = env.DEVELOPER_PUBLIC_ORIGIN?.trim()
  if (devOrigin) {
    list.push(devOrigin.replace(/\/+$/, ''))
  }
  const authOrigin = env.AUTH_PUBLIC_ORIGIN?.trim()
  if (authOrigin) {
    list.push(authOrigin.replace(/\/+$/, ''))
  }
  return list
}

export function isOriginAllowed(request: NextRequest, env: EnvLike = process.env): boolean {
  const allowLocalhostDev = (env.IDENTITY_ENVIRONMENT ?? 'development') === 'development'
  // Origin 缺失（curl/同源导航）放行；存在则必须命中白名单
  return originAllowed(request.headers.get('origin'), allowedOrigins(env), allowLocalhostDev)
}

/** CSRF 校验：header、cookie、会话内值三者一致才通过 */
export function isCsrfValid(request: NextRequest, session: DeveloperSessionPayload, env: EnvLike = process.env): boolean {
  const header = request.headers.get(CSRF_HEADER)
  const cookie = readCookie(request.headers.get('cookie'), CSRF_COOKIE_NAME)
  return verifyCsrf(header, cookie, session.csrf)
}

/** 统一错误映射：DeveloperApiError → { error, message? } JSON；未知错误 → 502 internal */
export function developerErrorResponse(err: unknown): NextResponse {
  if (err instanceof DeveloperApiError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status, headers: noStoreJsonHeaders() },
    )
  }
  return NextResponse.json({ error: 'internal' }, { status: 502, headers: noStoreJsonHeaders() })
}

/** 统一成功 JSON（no-store） */
export function jsonOk(data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: noStoreJsonHeaders() })
}

/** 开发者站点公开 origin（Cookie Secure 判定用；host 规范化比较） */
export function developerPublicOrigin(env: EnvLike = process.env): string {
  return env.DEVELOPER_PUBLIC_ORIGIN?.trim() ?? ''
}

export { normalizeHost }

/**
 * mutation 统一守卫：会话 → Origin → CSRF 三重检查。
 * 通过返回会话载荷；失败返回错误响应（调用方直接 return）。
 */
export function guardMutation(
  request: NextRequest,
  env: EnvLike = process.env,
): DeveloperSessionPayload | NextResponse {
  const session = requireSession(request, env)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  if (!isOriginAllowed(request, env)) {
    return errorJson(403, 'forbidden')
  }
  if (!isCsrfValid(request, session, env)) {
    return errorJson(403, 'forbidden')
  }
  return session
}
