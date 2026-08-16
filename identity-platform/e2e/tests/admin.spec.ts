/**
 * L3 Web Browser E2E —— Admin 关键流（#628 第 5 节 + #625）。
 *
 * mock 模式验证：
 *   - /admin overview 统计卡片（待审核/敏感 scope/Active/Suspended）；
 *   - /admin/apps 审核队列 → 打开 detail（应用身份/开发者/redirect URIs/scopes）；
 *   - 审核通过：逐 scope 决策 → “通过并激活” → 状态 active（review revision 快照语义）；
 *   - 拒绝：必须填原因；
 *   - suspend（身份敏感操作）：需填原因并调用 API → 状态 suspended。
 *
 * 说明：TOCTOU（revision 不一致自动作废）、step-up 近期认证、IDOR 等由
 * core/tests/api/admin/* 与 web/tests/admin-*.test.ts 覆盖，本 spec 只跑页面流。
 */
import { expect, test } from '@playwright/test'
import { adminAppDetail, installMockRoutes, mockBackend, seedDeveloperSession } from './fixtures'

const APP_ID = 'app_e2e_pending'

test.beforeEach(async ({ page }) => {
  installMockRoutes(page, { fresh: true })
  // 注入 admin 会话，跳过 login 重定向（mock 模式模拟已登录）
  await seedDeveloperSession(page, 'identity_admin')
  // 列表用 summary DTO（平铺），detail 用嵌套 DTO（AdminAppDetailDTO）
  const summary = {
    id: APP_ID,
    client_id: 'cli_app_e2e_pending',
    name: '课程助手（待审核）',
    client_type: 'web_confidential',
    status: 'pending_review',
    developer: { user_id: 'usr_e2e_dev', display_name: 'E2E 开发者' },
    scope_risks: ['basic', 'sensitive'],
    has_pending_review: true,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    updated_at: new Date().toISOString(),
  }
  mockBackend.reviews = [summary]
  // detail 返回完整 DTO（嵌套结构；status 跟随后端状态，approve/suspend 后刷新可见）
  void page.route(`**/api/v1/admin/apps/${APP_ID}`, async (route) => {
    const current = mockBackend.reviews[0]?.status ?? 'pending_review'
    await route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify({ app: adminAppDetail({ id: APP_ID, name: '课程助手（待审核）', status: current }) }),
    })
  })
})

test('overview：统计卡片展示待审核/敏感 scope/Active/Suspended', async ({ page }) => {
  await page.goto('http://developer.example.test:3100/admin')
  await expect(page.getByText('待审核应用')).toBeVisible()
  await expect(page.getByText('待审核敏感 Scope 项')).toBeVisible()
  await expect(page.getByText('Active Client 数')).toBeVisible()
  await expect(page.getByText('Suspended Client 数')).toBeVisible()
})

test('审核队列 → 详情展示应用身份/开发者/redirect URIs/scopes', async ({ page }) => {
  await page.goto('http://developer.example.test:3100/admin/apps')
  await expect(page.getByText('课程助手（待审核）')).toBeVisible()
  await page.getByText('课程助手（待审核）').click()
  // 应用身份 + 开发者 + redirect URI 完整展示（防钓鱼信息；主页/隐私政策/redirect URI 都用精确文本）
  await expect(page.getByText('https://course.example.com', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('E2E 开发者')).toBeVisible()
  await expect(page.getByText('https://course.example.com/cb', { exact: true })).toBeVisible()
  // 敏感 scope 提示
  await expect(page.getByText(/本审核包含敏感 Scope/)).toBeVisible()
  // 审核快照 revision 提示
  await expect(page.getByText(/审核快照/)).toBeVisible()
})

test('审核通过：逐 scope 批准 → 通过并激活 → 状态 active', async ({ page }) => {
  await page.goto(`http://developer.example.test:3100/admin/apps/${APP_ID}`)
  await expect(page.getByText(/本审核包含敏感 Scope/)).toBeVisible()
  await page.getByRole('button', { name: '通过并激活' }).click()
  // 完成后页面刷新详情 → mock 后端状态 active
  await expect(page.getByText(/已启用|通过审核/)).toBeVisible()
  expect(mockBackend.reviews[0]?.status).toBe('active')
})

test('拒绝必须填写原因', async ({ page }) => {
  await page.goto(`http://developer.example.test:3100/admin/apps/${APP_ID}`)
  await page.getByRole('button', { name: '拒绝' }).click()
  await expect(page.getByText('拒绝必须填写开发者可读的原因')).toBeVisible()
  // 状态未变化
  expect(mockBackend.reviews[0]?.status).toBe('pending_review')
  // 填写原因后可拒绝
  await page.locator('#reject-reason').fill('redirect URI 与主页域名不一致')
  await page.getByRole('button', { name: '拒绝' }).click()
  await expect(page.getByText(/已拒绝/)).toBeVisible()
  expect(mockBackend.reviews[0]?.status).toBe('rejected')
})

test('suspend：填写原因后暂停，列表显示已暂停', async ({ page }) => {
  // 预置一个 active 应用（列表 summary + detail 嵌套）
  mockBackend.reviews = [
    {
      id: 'app_e2e_active',
      client_id: 'cli_app_e2e_active',
      name: '已激活应用',
      client_type: 'web_confidential',
      status: 'active',
      developer: { user_id: 'usr_e2e_dev', display_name: 'E2E 开发者' },
      scope_risks: ['basic'],
      has_pending_review: false,
      submitted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]
  void page.route('**/api/v1/admin/apps/app_e2e_active', async (route) => {
    const current = mockBackend.reviews[0]?.status ?? 'active'
    await route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify({ app: adminAppDetail({ id: 'app_e2e_active', name: '已激活应用', status: current }) }),
    })
  })
  await page.goto('http://developer.example.test:3100/admin/apps/app_e2e_active')
  // 不填原因直接暂停 → 被拒
  await page.getByRole('button', { name: /暂停/ }).first().click()
  await expect(page.getByText('请填写操作原因（将写入审计）')).toBeVisible()
  // 填原因后暂停
  await page.locator('#runtime-reason').fill('E2E 冒烟：暂停测试')
  await page.getByRole('button', { name: /暂停/ }).first().click()
  await expect(page.getByText('已暂停')).toBeVisible()
  expect(mockBackend.reviews[0]?.status).toBe('suspended')
})
