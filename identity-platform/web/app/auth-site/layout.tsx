/**
 * auth.* 站点布局。
 *  - 站点 Header（品牌 Logo + "使用 Mini-HBUT 完成登录"）；
 *  - await connection() 保证按请求动态渲染（配合 proxy.ts 的 no-store 安全头，不做静态缓存）。
 *
 * 安全响应头（no-store / no-referrer / nosniff / CSP）在 proxy.ts 统一设置
 * （纯逻辑见 lib/security/headers.ts，有自动测试）。
 * 非官方声明在根布局（app/layout.tsx）的公共 footer 统一输出。
 */
import { connection } from 'next/server'
import { IconShield } from './_components/icons'

export default async function AuthSiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 请求级动态渲染：阻止本站点 HTML 被静态/边缘缓存
  await connection()
  return (
    <>
      <header className="auth-header">
        <div className="auth-brand-row">
          <span className="auth-logo" aria-hidden="true">
            {/* 品牌图标：mini-HBUT 实际软件图标（public/icon.webp） */}
            <img src="/icon.webp" alt="" width={40} height={40} />
          </span>
          <div>
            <div className="auth-brand">Mini-HBUT Identity</div>
            <div className="auth-subtitle">使用 Mini-HBUT 完成登录</div>
          </div>
        </div>
        <div className="auth-decor" aria-hidden="true">
          <IconShield />
        </div>
      </header>
      {children}
    </>
  )
}
