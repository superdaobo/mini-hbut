/**
 * 开发者门户首页 `/`（server component）。
 * 未登录：简介 + 登录 CTA + OIDC 能力 + scope 简介 + 非官方声明 + 文档入口；
 * 已登录：额外展示「进入控制台」。
 */
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, decryptSession, isSessionValid } from '@/lib/auth-session/index'
import { SCOPE_META, SCOPE_WHITELIST } from '@/lib/developer/scopes'
import { OFFICIAL_IDENTITY_DOCS_URL } from '@/lib/developer/docs'

export const dynamic = 'force-dynamic'

export default async function DeveloperSiteHomePage() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)
  const { payload } = sessionCookie ? decryptSession(sessionCookie.value) : { payload: null }
  const loggedIn = isSessionValid(payload)

  return (
    <div className="dev-card">
      <h1>Mini-HBUT 开发者平台</h1>
      <p>
        面向第三方开发者的一站式接入门户：创建应用、管理回调地址与权限、提交审核，
        通过标准的 OIDC/OAuth 2.0（Authorization Code + PKCE）接入 Mini-HBUT 身份服务。
      </p>

      <p className="dev-note">
        <strong>非官方声明：</strong>
        Mini-HBUT 为第三方学生开发工具，本服务<strong>不是湖北工业大学官方统一身份认证服务</strong>；
        当前身份验证方法为 <code>mini_hbut_app</code>（Mini-HBUT App 本地验证），不构成学校官方背书。
      </p>

      <h2>OIDC 能提供什么</h2>
      <ul>
        <li>标准 OpenID Connect Discovery 与 JWKS，客户端可用任意成熟 SDK 接入；</li>
        <li>Authorization Code + PKCE（S256），Web 与 Native 应用均支持；</li>
        <li>Pairwise Subject：第三方看到的 <code>sub</code> 与学号无关；</li>
        <li>精确的 Redirect URI 注册，杜绝回调劫持；</li>
        <li>敏感权限（学校身份 / 长期令牌）必须经管理员审核与用户授权。</li>
      </ul>

      <h2>可用 Scope（V1）</h2>
      <ul>
        {SCOPE_WHITELIST.map((id) => {
          const meta = SCOPE_META[id]
          return (
            <li key={id}>
              <code>{meta.id}</code>：{meta.description}
            </li>
          )
        })}
      </ul>

      <h2>开始接入</h2>
      <p>
        <a href="/apps">创建应用</a> · <a href={OFFICIAL_IDENTITY_DOCS_URL}>接入文档</a>
        （官网统一维护：Quick Start / Scopes &amp; Claims / Security / Errors）
      </p>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {loggedIn ? (
          <>
            <a className="dev-btn dev-btn-primary" href="/apps">
              进入控制台
            </a>
            <a className="dev-btn" href={OFFICIAL_IDENTITY_DOCS_URL}>
              查看接入文档
            </a>
          </>
        ) : (
          <a className="dev-btn dev-btn-primary" href="/login">
            使用 Mini-HBUT 登录
          </a>
        )}
      </div>

      <p className="dev-inline-hint" style={{ marginTop: 20 }}>
        隐私与安全：应用接入需经管理员审核；敏感 scope 全程披露使用理由与隐私政策；
        client secret 仅用于后端，前端与日志中不会出现。
      </p>
    </div>
  )
}
