/**
 * developer.* 站点布局（server component）。
 *  - 顶部：品牌 + 环境标识 + 导航（我的应用 / 文档）+ 当前开发者 + 登出；
 *  - 会话在服务端解析（HttpOnly cookie），只把展示所需字段传给客户端组件；
 *  - 未登录：显示「登录」入口；页面级鉴权由各页/API 自行 fail closed。
 */
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, decryptSession, isSessionValid } from '@/lib/auth-session/index'
import { environmentLabel } from '@/lib/developer/issuer'
import { OFFICIAL_IDENTITY_DOCS_URL } from '@/lib/developer/docs'
import { LogoutButton } from './_components/logout-button'
import './developer.css'

export const dynamic = 'force-dynamic'

export default async function DeveloperSiteLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)
  const { payload } = sessionCookie ? decryptSession(sessionCookie.value) : { payload: null }
  const session = isSessionValid(payload) ? payload : null

  return (
    <div className="dev-shell">
      <header className="dev-header">
        <div className="dev-header-left">
          <a className="dev-brand" href="/">
            <span className="dev-brand-logo" aria-hidden="true">
              <img src="/icon.webp" alt="" width={28} height={28} />
            </span>
            Mini-HBUT 开发者平台
          </a>
          <span className="dev-env-badge" title="当前环境标识（Preview/Production 禁止混用 issuer）">
            {environmentLabel()}
          </span>
        </div>
        <nav className="dev-nav" aria-label="主导航">
          <a href="/apps">我的应用</a>
          {session ? <a href="/keys">API 密钥</a> : null}
          <a href={OFFICIAL_IDENTITY_DOCS_URL}>接入文档</a>
          {session ? <a href="/admin">审核后台</a> : null}
        </nav>
        <div className="dev-account">
          {session ? (
            <LogoutButton displayName={session.display_name} csrfToken={session.csrf} />
          ) : (
            <a className="dev-login-link" href="/login">
              使用 Mini-HBUT 登录
            </a>
          )}
        </div>
      </header>
      <div className="dev-content">{children}</div>
    </div>
  )
}
