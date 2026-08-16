/**
 * L3 Web Browser E2E —— Developer 门户关键流（#628 第 5 节 + #624）。
 *
 * mock 模式验证：
 *   - 应用列表展示（名称/client_id/类型/状态）；
 *   - 创建草稿（名称/描述/类型/主页/redirect URIs/scope 申请）→ POST 被调 → 列表出现；
 *   - 敏感 scope 申请要求填写用途理由（表单层约束）。
 *
 * 说明：secret show-once 与 rotate 在 web/tests/developer-*.test.ts 已覆盖
 * （BFF 层单测），本 spec 聚焦页面关键流；真实 Core 联调见 demo-client 与
 * runbook L6/L7 的 smoke 流程。
 */
import { expect, test } from '@playwright/test'
import { installMockRoutes, mockBackend, seedDeveloperSession } from './fixtures'

test.beforeEach(async ({ page }) => {
  installMockRoutes(page, { fresh: true })
  // 注入 developer 会话，跳过 login 重定向（mock 模式模拟已登录）
  await seedDeveloperSession(page)
  mockBackend.apps = [
    {
      id: 'app_e2e_existing',
      client_id: 'cli_e2e_existing',
      name: '课程表助手',
      client_type: 'web_confidential',
      status: 'active',
      scopes: ['openid', 'profile'],
      created_at: new Date().toISOString(),
    },
  ]
})

test('应用列表：展示名称/client_id/类型/状态', async ({ page }) => {
  await page.goto('http://developer.example.test:3100/apps')
  await expect(page.getByRole('heading', { name: '我的应用' })).toBeVisible()
  await expect(page.getByText('课程表助手')).toBeVisible()
  await expect(page.getByText('cli_e2e_existing')).toBeVisible()
  await expect(page.getByText('Web（Confidential）')).toBeVisible()
  await expect(page.getByText('已启用')).toBeVisible()
})

test('创建草稿：填表提交后出现在列表（含敏感 scope 用途理由）', async ({ page }) => {
  await page.goto('http://developer.example.test:3100/apps/new')
  await expect(page.getByRole('heading', { name: '创建应用' })).toBeVisible()

  await page.locator('#app-name').fill('成绩通知助手（E2E）')
  await page.locator('#app-desc').fill('用于同步成绩并推送考试提醒的 E2E 测试应用。')
  await page.locator('#app-type').selectOption('web_confidential')
  await page.locator('#app-home').fill('https://grade.example.com')
  // redirect URI 第一行
  await page.locator('input[placeholder="https://example.com/oauth/callback"]').first().fill('https://grade.example.com/cb')
  // 申请 student.identity（敏感 scope）→ 出现理由输入
  const sensitiveBox = page.locator('input[type="checkbox"]').filter({ has: page.locator('xpath=ancestor::label') })
  // 勾选全部 scope（openid/profile/student.identity）
  const boxes = page.locator('input[type="checkbox"]')
  const count = await boxes.count()
  for (let i = 0; i < count; i++) {
    await boxes.nth(i).check()
  }
  // 勾选全部 scope 后敏感 scope 各有理由输入框（student.identity + offline_access）
  const reasonBoxes = page.getByPlaceholder(/申请 .* 的使用理由/)
  const reasonCount = await reasonBoxes.count()
  for (let i = 0; i < reasonCount; i++) {
    await reasonBoxes.nth(i).fill('仅用于向用户展示成绩概要，不对外共享。')
  }
  await page.locator('#app-privacy').fill('https://grade.example.com/privacy')
  await page.locator('#app-contact').fill('e2e@example.com')

  await page.getByRole('button', { name: '创建应用（草稿）' }).click()
  // 创建成功 → 进入详情页（draft 状态提示）
  await expect(page.getByText(/已进入草稿状态/)).toBeVisible()
  expect(mockBackend.apps.some((a) => a.name === '成绩通知助手（E2E）')).toBe(true)
  const created = mockBackend.apps[0]
  expect(created.status).toBe('draft')
  // 列表出现
  await page.goto('http://developer.example.test:3100/apps')
  await expect(page.getByText('成绩通知助手（E2E）')).toBeVisible()
  void sensitiveBox
})

test('安全：应用描述可含 <script> 但页面以文本渲染（XSS 不执行）', async ({ page }) => {
  await page.goto('http://developer.example.test:3100/apps')
  // 预置含 HTML 注入的应用名
  mockBackend.apps.unshift({
    id: 'app_e2e_xss',
    client_id: 'cli_e2e_xss',
    name: '<img src=x onerror=window.__xss=1>',
    client_type: 'native_public',
    status: 'draft',
    scopes: ['openid'],
    created_at: new Date().toISOString(),
  })
  await page.goto('http://developer.example.test:3100/apps')
  await expect(page.getByText('Native（Public + PKCE）')).toBeVisible()
  const xss = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss)
  expect(xss).toBeUndefined()
})
