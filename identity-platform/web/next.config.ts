import type { NextConfig } from 'next'
import { developerSiteSecurityHeaders } from './lib/security/headers'

/**
 * Next.js 配置（#618 骨架 + #626 developer 域安全头补位）。
 * 安全基线：关闭 x-powered-by 泄露；strictMode 开启。
 * Host 路由逻辑在 proxy.ts（Next 16 请求入口），本文件不碰。
 *
 * #626（#625 登记「developer 域 CSP 未附加」）：
 * - proxy.ts 为 #618 冻结文件，不对其做 Host 分支头注入；
 * - Next.js headers() 按【原始请求路径】匹配，而 proxy.ts 会把 developer
 *   路径 rewrite 成 /developer-site/*，因此不能用 source 前缀匹配；
 * - 改用 has: { type: 'header', key: 'host' } 正则匹配 developer.* 域
 *   （Next 内部将 has.value 编译为 ^...$ 正则，见 prepare-destination.js），
 *   对 developer 域全部响应附加与 auth 站点同强度的安全头
 *   （CSP / Permissions-Policy / COOP / no-store 等，纯函数可单测）。
 * - auth.* 域的头由 proxy.ts 附加（#630），两套机制互不覆盖。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // #628 E2E：dev 模式允许测试域名访问 dev 资源（auth/developer 分站点 E2E 需要；
  // 仅 dev server 生效，不影响生产构建；生产跨域由 proxy.ts + 安全头 fail closed）
  allowedDevOrigins: ['auth.example.test', 'developer.example.test', 'localhost', '127.0.0.1'],
  async headers() {
    return [
      {
        // developer.* 站点（含 Admin）：host 正则匹配，任意路径生效
        source: '/:path*',
        has: [{ type: 'header', key: 'host', value: 'developer\\..*' }],
        headers: Object.entries(developerSiteSecurityHeaders()).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ]
  },
}

export default nextConfig
