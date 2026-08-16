/**
 * Admin 后台布局（server component，issue #625）。
 *  - 未登录 → 302 /login（fail closed；登录态只在 HttpOnly cookie）；
 *  - 导航：审核概览 / 应用队列 / 审计日志 / 返回开发者控制台；
 *  - 角色边界在 BFF/Core（页面隐藏菜单只是体验层，非安全边界）。
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, decryptSession, isSessionValid } from '@/lib/auth-session/index'
import './admin.css'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)
  const { payload } = sessionCookie ? decryptSession(sessionCookie.value) : { payload: null }
  if (!isSessionValid(payload)) {
    redirect('/login')
  }

  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="管理员导航">
        <a href="/admin">审核概览</a>
        <a href="/admin/apps">应用队列</a>
        <a href="/admin/audit">审计日志</a>
        <span className="admin-nav-spacer" />
        <a href="/apps">返回开发者控制台</a>
      </nav>
      {children}
    </div>
  )
}
