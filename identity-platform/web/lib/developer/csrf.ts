/**
 * CSRF 防护（双提交 Cookie + Origin 校验，纯函数可单测）。
 *
 * 方案（issue #624「CSRF 防护所有 mutation」）：
 *  - 会话 cookie 为 HttpOnly + SameSite=Lax：跨站 POST 请求浏览器不会携带会话
 *    cookie，mutation 需要会话 → 跨站请求天然 401；
 *  - 双提交 Cookie：登录时生成随机 csrf 值，同时写入会话载荷与同名的
 *    非 HttpOnly cookie（mh_dev_csrf，SameSite=Lax）；mutation 必须带
 *    x-csrf-token header 且与 cookie、会话内值三者一致；
 *  - Origin 校验：跨源请求（含携带了合法 cookie 的旧浏览器场景）直接 403。
 */

import { randomBytes } from 'node:crypto'

export const CSRF_HEADER = 'x-csrf-token'

/** 生成 32 字节 URL-safe CSRF 值 */
export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 常量时间比较（防时序侧信道） */
export function csrfTokensEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false
  }
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * 校验 CSRF：header、cookie、会话内值三者必须一致。
 * @param headerValue  x-csrf-token header
 * @param cookieValue  mh_dev_csrf cookie
 * @param sessionValue 会话载荷内的 csrf
 */
export function verifyCsrf(
  headerValue: string | null | undefined,
  cookieValue: string | null | undefined,
  sessionValue: string | null | undefined,
): boolean {
  if (!csrfTokensEqual(headerValue, cookieValue)) {
    return false
  }
  return csrfTokensEqual(headerValue, sessionValue)
}

/**
 * Origin 校验：浏览器发起的跨源 mutation 一律拒绝。
 * 无 Origin 头（curl/服务端调用/同源导航）放行——此时会话 cookie 的
 * SameSite=Lax + CSRF 头校验仍然是主防线。
 */
export function originAllowed(origin: string | null, allowedOrigins: readonly string[], allowLocalhostDev: boolean): boolean {
  if (!origin) {
    return true
  }
  const trimmed = origin.trim().replace(/\/+$/, '')
  for (const allowed of allowedOrigins) {
    const a = allowed.trim().replace(/\/+$/, '')
    if (trimmed === a) {
      return true
    }
  }
  if (allowLocalhostDev) {
    const m = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.exec(trimmed)
    if (m) {
      return true
    }
  }
  return false
}
