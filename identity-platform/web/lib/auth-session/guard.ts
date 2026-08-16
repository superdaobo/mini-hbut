/**
 * 页面级登录守卫（server components）。
 *
 * 背景（bug 修复）：/apps、/apps/new、/apps/[id] 此前是纯 client 页面，未登录也能
 * 打开页面（直到 API 401 才跳转）。统一改为：server 层先校验会话，未登录 → 302
 * /login（与 admin layout 一致，fail closed；登录态只在 HttpOnly cookie）。
 *
 * 用法（server page）：
 *   const session = await requireDeveloperSession()   // 未登录自动 redirect('/login')
 *   // 或 requireDeveloperSession({ redirectTo: '/login?next=/apps' })
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, decryptSession, isSessionValid } from './index'
import type { DeveloperSessionPayload } from '@/lib/developer/contract'

export interface GuardOptions {
  /** 未登录跳转目标（默认 /login） */
  redirectTo?: string
}

export async function requireDeveloperSession(
  options: GuardOptions = {},
): Promise<DeveloperSessionPayload> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)
  const { payload } = sessionCookie ? decryptSession(sessionCookie.value) : { payload: null }
  if (!isSessionValid(payload)) {
    redirect(options.redirectTo ?? '/login')
  }
  return payload as DeveloperSessionPayload
}
