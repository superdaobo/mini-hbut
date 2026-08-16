/**
 * Admin BFF 公共守卫（route handler 层，逻辑可单测，issue #625）。
 *
 * 与 developer BFF 同源的安全机制：
 * - 会话：HttpOnly cookie（mh_dev_session）→ AES-GCM 解密 → 过期检查；
 * - mutation：会话 + Origin 白名单 + CSRF 双提交 Cookie 三重检查；
 * - 身份：admin sub 一律从会话推导（x-admin-subject 由 BFF → Core）；
 * - step-up：会话 iat（= OIDC 登录完成时刻）作为 auth_time 传给 Core，
 *   Core 判定高风险动作是否在窗口内；STEP_UP_REQUIRED → 前端触发重新登录。
 *
 * 服务端 RBAC 边界：页面隐藏菜单只是体验，真正的角色判定在 BFF/Core
 * （/api/v1/admin/* 全部要求管理员角色，非管理员直接 403）。
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { parseSessionFromCookies, readCookie, CSRF_COOKIE_NAME } from '@/lib/auth-session/index'
import {
  CSRF_HEADER,
  originAllowed,
  verifyCsrf,
} from '@/lib/developer/csrf'
import type { DeveloperSessionPayload } from '@/lib/developer/contract'
import {
  allowedOrigins,
  errorJson,
  isOriginAllowed,
  noStoreJsonHeaders,
} from '@/lib/developer-api/bff'

export type EnvLike = Record<string, string | undefined>

export const ADMIN_SUBJECT_HEADER = 'x-admin-subject'
export const ADMIN_AUTH_TIME_HEADER = 'x-admin-auth-time'

/** 会话解析（缺失/过期/篡改一律 401） */
export function requireAdminSession(
  request: NextRequest,
  env: EnvLike = process.env,
): DeveloperSessionPayload | null {
  return parseSessionFromCookies(request.headers.get('cookie'), env)
}

/**
 * mutation 统一守卫：会话 → Origin → CSRF。
 * 通过返回会话载荷（含 iat → auth_time）；失败返回错误响应。
 */
export function guardAdminMutation(
  request: NextRequest,
  env: EnvLike = process.env,
): DeveloperSessionPayload | NextResponse {
  const session = requireAdminSession(request, env)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  if (!isOriginAllowed(request, env)) {
    return errorJson(403, 'forbidden')
  }
  const cookieHeader = request.headers.get('cookie')
  const header = request.headers.get(CSRF_HEADER)
  const cookie = readCookie(cookieHeader, CSRF_COOKIE_NAME)
  if (!verifyCsrf(header, cookie, session.csrf)) {
    return errorJson(403, 'forbidden')
  }
  return session
}

/** 会话 iat（epoch 秒）作为 auth_time；高风险动作传给 Core 校验窗口 */
export function authTimeOf(session: DeveloperSessionPayload): number {
  return session.iat
}

export { allowedOrigins, originAllowed, noStoreJsonHeaders }
