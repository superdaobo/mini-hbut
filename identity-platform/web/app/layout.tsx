/**
 * 根布局：所有站点共用的 HTML 骨架与公共 footer。
 * 非官方声明（#617 第 19/20 条）在根布局统一输出，任何 Web 页公共 footer 都带此声明。
 */
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mini-HBUT Identity',
  description: 'Mini-HBUT 第三方身份接入平台（非湖北工业大学官方服务）',
  icons: {
    icon: [
      { url: '/icon.webp', type: 'image/webp', sizes: '512x512' },
      { url: '/icon.png', sizes: '512x512' },
    ],
    shortcut: '/icon.webp',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <main>{children}</main>
        <footer className="disclaimer">
          Mini-HBUT 为第三方学生开发工具，本服务不是湖北工业大学官方统一身份认证服务。
        </footer>
      </body>
    </html>
  )
}
