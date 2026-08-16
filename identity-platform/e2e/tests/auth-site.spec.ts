/**
 * L3 Web Browser E2E —— auth.* 授权接力页（#628 第 4 节 + #630 状态机）。
 *
 * mock 模式（默认）：page.route 拦截 BFF API，验证页面状态机与安全边界：
 *   - handoff 只走 x-identity-handoff 头（不进 query / HTML / 日志）；
 *   - 无 handoff 时只有 request id 不给详情（401 → MISSING_HANDOFF 文案）；
 *   - WAITING_APP 展示请求卡片（应用名/主页/开发者/审核状态）与权限列表；
 *   - "打开 Mini-HBUT" 只携带 request_id + handoff（无学生信息/scope/token）；
 *   - 终态（DENIED/EXPIRED/CLIENT_UNAVAILABLE）文案与停止轮询；
 *   - APPROVED → resume → 跟随 Core 决定的重定向；
 *   - 短轮询发生且进入终态后停止；
 *   - 刷新后（hash 仍在）可恢复流程。
 *
 * 真实服务模式（E2E_MOCK=0 + E2E_BASE_URL）：仅作为 smoke 骨架使用，
 * 协议级校验由 demo-client（openid-client）负责，见 ../demo-client/README.md。
 */
import { expect, test } from '@playwright/test'
import { defaultDetail, handoffFragment, installMockRoutes, mockBackend } from './fixtures'

const REQUEST_ID = 'req_e2e_auth'
const HANDOFF = 'ho_e2e_auth_secret_value_0001'

test.beforeEach(async ({ page }) => {
  installMockRoutes(page, { fresh: true })
  mockBackend.requests.set(
    REQUEST_ID,
    defaultDetail({ requestId: REQUEST_ID, handoff: HANDOFF }),
  )
})

test('无 handoff：只有 request id 不显示详情（MISSING_HANDOFF）', async ({ page }) => {
  await page.goto(`/r/${REQUEST_ID}`)
  await expect(page.getByText('链接缺少一次性凭据，无法读取授权信息')).toBeVisible()
  // 不发起详情请求（handoff 缺失直接本地终态）
  expect(mockBackend.statusPolls.get(REQUEST_ID) ?? 0).toBe(0)
})

test('错误 handoff：401，不展示任何请求详情', async ({ page }) => {
  // 值需满足 HANDOFF_TOKEN_RE（≥20 字符）才会走到服务端校验；格式非法属于缺凭据分支
  await page.goto(`/r/${REQUEST_ID}${handoffFragment('ho_e2e_wrong_value_9999')}`)
  await expect(page.getByText(/授权链接无效或已失效/)).toBeVisible()
  expect(page.getByText('课程助手（E2E）')).toHaveCount(0)
})

test('WAITING_APP：请求卡片 + 权限列表 + 打开按钮只含 request_id/handoff', async ({ page }) => {
  await page.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  // 请求卡片：应用名 / 主页 hostname / 开发者 / 审核状态（防钓鱼要素齐全）
  await expect(page.getByRole('heading', { name: '课程助手（E2E）' })).toBeVisible()
  await expect(page.getByText('course.example.com')).toBeVisible()
  await expect(page.getByText('Mini-HBUT 团队')).toBeVisible()
  await expect(page.getByText('已通过审核')).toBeVisible()
  // 权限列表
  await expect(page.getByText('获取你的学校身份（敏感）')).toBeVisible()
  await expect(page.getByText('确认你的 Mini-HBUT 身份')).toBeVisible()
  // 状态横幅
  await expect(page.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  // 打开按钮：scheme 深链，只含 request_id + handoff
  const btn = page.locator('a.open-app-btn')
  await expect(btn).toHaveAttribute(
    'href',
    `minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}`,
  )
  const href = await btn.getAttribute('href')
  expect(href).not.toContain('student')
  expect(href).not.toContain('scope')
  expect(href).not.toContain('token')
  // 非官方声明固定 footer
  await expect(
    page.getByText('Mini-HBUT 为第三方学生开发工具，本服务不是湖北工业大学官方统一身份认证服务。'),
  ).toBeVisible()
})

test('handoff 只走 header：query / 服务端 HTML 不含 handoff（合法通道仅按钮 href 与 hash）', async ({ page }) => {
  const seenHeaders: string[] = []
  // 只观察（不再注册 route，避免覆盖 beforeEach 的 mock 拦截）
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/requests/')) {
      seenHeaders.push(req.headers()['x-identity-handoff'] ?? '')
    }
  })
  // 捕获主文档的服务端响应体（未经 hydration 的 HTML）
  let serverHtml = ''
  page.on('response', async (res) => {
    if (res.url().includes('/r/') && res.headers()['content-type']?.includes('text/html')) {
      serverHtml = (await res.text().catch(() => '')) ?? ''
    }
  })
  await page.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(page.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  // BFF 请求确实携带 handoff 头（详情 + 至少一次轮询）
  await expect.poll(() => seenHeaders.filter((h) => h === HANDOFF).length).toBeGreaterThanOrEqual(2)
  // 页面 URL 只有 hash 里有 handoff（query 里没有）
  const url = new URL(page.url())
  expect(url.search).not.toContain(HANDOFF)
  expect(url.hash).toContain(HANDOFF)
  // 服务端渲染 HTML 不含 handoff（hash 不发给服务器，#630 安全边界）
  expect(serverHtml).not.toContain(HANDOFF)
  // 合法通道：打开按钮 href 携带 handoff（给 App 用）+ QR fallback 链接的 hash 中
  const btn = page.locator('a.open-app-btn')
  await expect(btn).toHaveAttribute('href', `minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}`)
})

test('APPROVED：停止轮询并调 resume 跟随重定向', async ({ page }) => {
  await page.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(page.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  mockBackend.requests.get(REQUEST_ID)!.status = 'approved'
  // APPROVED → resume → 跟随 Core 决定的重定向（页面跳离接力页；同源 mock 回调）
  await page.waitForURL('**/cb-done', { timeout: 10_000 })
  // resume 被调用（一次）
  expect(mockBackend.resumed.has(REQUEST_ID)).toBe(true)
  // 终态后轮询停止：等待 2.5s，轮询计数不再增长
  const pollsAfter = mockBackend.statusPolls.get(REQUEST_ID) ?? 0
  await page.waitForTimeout(2500)
  expect(mockBackend.statusPolls.get(REQUEST_ID) ?? 0).toBe(pollsAfter)
})

test('DENIED / EXPIRED / CLIENT_UNAVAILABLE 终态文案', async ({ page }) => {
  // 每段用独立 requestId（同 URL 同 hash 的 goto 不会触发重新导航）
  const cases: Array<[string, string, RegExp]> = [
    ['req_e2e_denied', 'denied', /你已在 Mini-HBUT 中拒绝此次授权/],
    ['req_e2e_expired', 'expired', /此次登录请求已过期，请回到原应用重新发起/],
    ['req_e2e_unavail', 'client_unavailable', /该应用当前不可用，请稍后再试/],
  ]
  for (const [rid, status, re] of cases) {
    mockBackend.requests.set(rid, defaultDetail({ requestId: rid, handoff: HANDOFF, status }))
    await page.goto(`/r/${rid}${handoffFragment(HANDOFF)}`)
    await expect(page.getByText(re)).toBeVisible()
  }
})

test('短轮询发生：WAITING_APP 下 status 端点被周期调用', async ({ page }) => {
  await page.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(page.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  await expect
    .poll(() => mockBackend.statusPolls.get(REQUEST_ID) ?? 0, { timeout: 4000 })
    .toBeGreaterThanOrEqual(2)
})

test('刷新页面后（hash 保留）流程可恢复', async ({ page }) => {
  await page.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(page.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  await page.reload()
  // hash 保留 → 重新拉详情，仍在 WAITING_APP
  await expect(page.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  await expect(page.getByText('课程助手（E2E）')).toBeVisible()
})
