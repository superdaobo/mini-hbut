/**
 * Mini-HBUT Identity Platform E2E 配置（#628）。
 *
 * 运行模式（二选一）：
 *
 * 1. mock 模式（默认，本机/CI 无凭据可跑）：
 *    - webServer 启动 identity-web 的 next dev（localhost:3100，development 环境放行）；
 *    - 测试用 page.route 拦截同域 BFF API（/api/auth/requests/**、/api/v1/**），
 *      内存共享后端模拟 Core 的 AuthRequest/Developer/Admin 状态机；
 *    - 适合验证页面状态机、安全边界（handoff 只走 header）、双 context QR 接力。
 *
 * 2. 真实服务模式（Preview/Production smoke，见 runbook L6/L7）：
 *    - 先部署 core/web（Vercel Preview 或本地起 core + web），再设置
 *      E2E_BASE_URL / E2E_CORE_BASE_URL 指向真实部署；
 *    - 测试文件中以 `describe.skip(process.env.E2E_MOCK !== '1')` 关闭 mock，
 *      并配合 demo-client（openid-client 消费者）做协议级校验。
 */
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // mock 模式固定 auth.example.test（proxy 按 Host 分站点）；真实模式用 E2E_BASE_URL
    baseURL:
      process.env.E2E_MOCK === '0'
        ? BASE_URL
        : 'http://auth.example.test:3100',
    trace: 'retain-on-failure',
    // 把测试域名解析到本地（Next proxy 按 Host 分站点：auth.*/developer.*）
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP auth.example.test 127.0.0.1, MAP developer.example.test 127.0.0.1',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: process.env.E2E_MOCK === '1' || process.env.E2E_MOCK === undefined
    ? {
        // mock 模式：本地 next dev（development 环境放行 localhost）。
        // 直接 node 调 next 的 JS 入口，避免 Windows 上 shell/cmd spawn 差异。
        command: 'node node_modules/next/dist/bin/next dev -p 3100',
        // 注意：必须用 fileURLToPath 处理中文路径（URL pathname 会百分号编码导致 cwd 无效）
        cwd: fileURLToPath(new URL('../web', import.meta.url)),
        port: 3100,
        reuseExistingServer: !process.env.CI,
        env: {
          // Git Bash 环境下的 Windows spawn 兼容（ComSpec 必须显式给出）
          ComSpec: 'C:\\Windows\\system32\\cmd.exe',
          PATH: `${process.env.PATH ?? ''};C:\\Windows\\System32;C:\\Windows`,
          IDENTITY_ENVIRONMENT: 'development',
          // 测试域名经 host-resolver-rules 指向本地；proxy 按 Host 分站点
          AUTH_PUBLIC_ORIGIN: 'http://auth.example.test:3100',
          DEVELOPER_PUBLIC_ORIGIN: 'http://developer.example.test:3100',
          WEB_SESSION_SECRET: 'e2e-only-session-secret-0123456789abcdef', // secretguard: allow-test-fixture
          // mock 模式下 BFF 由 page.route 拦截，Core 地址只是占位
          IDENTITY_CORE_BASE_URL: 'http://127.0.0.1:9',
          IDENTITY_PUBLIC_ISSUER: 'https://id.example.test',
        },
        timeout: 120_000,
      }
    : undefined,
})
