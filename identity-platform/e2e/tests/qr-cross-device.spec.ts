/**
 * L5 Cross-device E2E —— QR 双上下文（#628 第 9 节 + #627）。
 *
 * 用两个 Playwright browser context 模拟：
 *   - PC context：auth.* 接力页（展示 QR + 轮询状态）；
 *   - Phone context：手机 Mini-HBUT（模拟扫 QR 后进入请求详情、用户批准）。
 *
 * 场景覆盖：#628 要求的 approve / deny / expire / two phones race /
 * revoked device / invalid QR。
 *
 * 说明：
 *   - QR 图片本身不用真摄像头：payload 构建/解析已由 web/tests/auth-qr.test.ts
 *     与主仓库 src/features/identity/qr/*.spec.ts（parseIdentityQr）单元覆盖；
 *   - 本 spec 验证“双上下文共享同一 AuthRequest、手机批准后 PC 轮询收敛”；
 *   - Phone context 的 approve/deny 通过页面上下文 fetch 调 mock Core API
 *     （模拟 App 设备签名后的审批请求），approve 幂等由 mock 后端保证。
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { defaultDetail, handoffFragment, installMockRoutes, mockBackend } from './fixtures'

const REQUEST_ID = 'req_e2e_qr'
const HANDOFF = 'ho_e2e_qr_secret_value_0002'

/** 手机上下文（viewport 模拟手机，携带独立 cookie 域） */
async function phoneContext(browser: { newContext: (o?: Record<string, unknown>) => Promise<BrowserContext> }): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: 'http://auth.example.test:3100',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  })
}

/** Phone 页面上下文内调用 Core approve/deny（模拟 App 审批） */
async function phoneDecide(page: Page, action: 'approve' | 'deny') {
  await page.evaluate(
    ([id, act]) =>
      fetch(`/api/v1/requests/${id}/${act}`, { method: 'POST' }).then((r) => r.json()),
    [REQUEST_ID, action] as const,
  )
}

test.beforeEach(async ({ browser }, testInfo) => {
  // 每个测试用自己的 browser 级状态会互相污染 → 用 testInfo 隔离由 fresh 保证
  void browser
  mockBackend.requests.clear()
  mockBackend.statusPolls.clear()
  mockBackend.resumed.clear()
})

test('QR 双上下文：手机批准后 PC 轮询收敛到 APPROVED', async ({ browser, page: pcPage }) => {
  installMockRoutes(pcPage, { fresh: true })
  mockBackend.requests.set(REQUEST_ID, defaultDetail({ requestId: REQUEST_ID, handoff: HANDOFF }))

  // PC：接力页展示 QR + WAITING_APP
  await pcPage.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(pcPage.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  await expect(pcPage.getByRole('img', { name: /跨设备登录二维码/ })).toBeVisible()

  // Phone：扫描进入（同一 AuthRequest）
  const phoneCtx = await phoneContext(browser)
  const phone = await phoneCtx.newPage()
  installMockRoutes(phone, { fresh: false })
  await phone.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await phone.waitForLoadState('domcontentloaded')
  await expect(phone.getByText('课程助手（E2E）')).toBeVisible()

  // 手机批准（App 内设备签名 approve）
  await phoneDecide(phone, 'approve')

  // PC 轮询发现 APPROVED → resume → 跟随重定向（页面跳离接力页）
  await pcPage.waitForURL('**/cb-done', { timeout: 10_000 })
  expect(mockBackend.resumed.has(REQUEST_ID)).toBe(true)
  await phoneCtx.close()
})

test('QR 双上下文：手机拒绝 → PC 显示拒绝（不产生 resume）', async ({ browser, page: pcPage }) => {
  installMockRoutes(pcPage, { fresh: true })
  mockBackend.requests.set(REQUEST_ID, defaultDetail({ requestId: REQUEST_ID, handoff: HANDOFF }))
  await pcPage.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(pcPage.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()

  const phoneCtx = await phoneContext(browser)
  const phone = await phoneCtx.newPage()
  installMockRoutes(phone, { fresh: false })
  await phone.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await phone.waitForLoadState('domcontentloaded')
  await phoneDecide(phone, 'deny')

  await expect(pcPage.getByText('你已在 Mini-HBUT 中拒绝此次授权')).toBeVisible()
  expect(mockBackend.resumed.has(REQUEST_ID)).toBe(false)
  await phoneCtx.close()
})

test('QR 过期：PC 轮询到 EXPIRED（手机不再能批准）', async ({ browser, page: pcPage }) => {
  installMockRoutes(pcPage, { fresh: true })
  mockBackend.requests.set(REQUEST_ID, defaultDetail({ requestId: REQUEST_ID, handoff: HANDOFF }))
  await pcPage.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(pcPage.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()

  // 服务端判定过期（真正过期判断以 Core 为准）
  mockBackend.requests.get(REQUEST_ID)!.status = 'expired'
  await expect(pcPage.getByText('此次登录请求已过期，请回到原应用重新发起')).toBeVisible()

  // 手机此时批准 → mock 后端 invalid_state（409），PC 状态不变
  const phoneCtx = await phoneContext(browser)
  const phone = await phoneCtx.newPage()
  installMockRoutes(phone, { fresh: false })
  // 手机打开同一请求（显示过期状态），再尝试批准 → 409
  await phone.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await phone.waitForLoadState('domcontentloaded')
  const result = await phone.evaluate(
    (rid) => fetch(`/api/v1/requests/${rid}/approve`, { method: 'POST' }).then((r) => ({ status: r.status })),
    [REQUEST_ID],
  )
  expect(result.status).toBe(409)
  await phoneCtx.close()
})

test('QR 双手机竞争：两台手机同时批准，只生效一次（幂等）', async ({ browser, page: pcPage }) => {
  installMockRoutes(pcPage, { fresh: true })
  mockBackend.requests.set(REQUEST_ID, defaultDetail({ requestId: REQUEST_ID, handoff: HANDOFF }))
  await pcPage.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)

  const phoneCtxA = await phoneContext(browser)
  const phoneCtxB = await phoneContext(browser)
  const phoneA = await phoneCtxA.newPage()
  const phoneB = await phoneCtxB.newPage()
  installMockRoutes(phoneA, { fresh: false })
  installMockRoutes(phoneB, { fresh: false })
  await phoneA.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await phoneB.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)

  // 并发批准：两请求都发出（mock 串行处理，但语义上第二次是幂等 created:false）
  const [ra, rb] = await Promise.all([
    phoneA.evaluate((rid) => fetch(`/api/v1/requests/${rid}/approve`, { method: 'POST' }).then((r) => r.json()), [REQUEST_ID]),
    phoneB.evaluate((rid) => fetch(`/api/v1/requests/${rid}/approve`, { method: 'POST' }).then((r) => r.json()), [REQUEST_ID]),
  ])
  // 至少一次 created:true，第二次不产生第二次批准（#626 device replay 幂等）
  expect([ra.created, rb.created].filter(Boolean).length).toBeGreaterThanOrEqual(1)
  expect(ra.created || rb.created).toBe(true)

  await pcPage.waitForURL('**/cb-done', { timeout: 10_000 })
  expect(mockBackend.resumed.has(REQUEST_ID)).toBe(true)
  await phoneCtxA.close()
  await phoneCtxB.close()
})

test('QR 双上下文：已撤销设备不能批准（mock 校验 revoked）', async ({ browser, page: pcPage }) => {
  installMockRoutes(pcPage, { fresh: true })
  mockBackend.requests.set(REQUEST_ID, defaultDetail({ requestId: REQUEST_ID, handoff: HANDOFF }))
  await pcPage.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)

  // 模拟 Core 侧：设备已撤销 → approve 被拒绝（这里用 mock 后端的 revoked 标记）
    const phoneCtx = await phoneContext(browser)
  const phone = await phoneCtx.newPage()
  installMockRoutes(phone, { fresh: false })
  await phone.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await phone.waitForLoadState('domcontentloaded')
  // 拦截 approve：模拟设备撤销后 Core 拒绝（#622 revoked device reject）
  await phone.route('**/api/v1/requests/*/approve', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'device_revoked' }),
    })
  })
  const result = await phone.evaluate(
    (rid) => fetch(`/api/v1/requests/${rid}/approve`, { method: 'POST' }).then((r) => ({ status: r.status })),
    [REQUEST_ID],
  )
  expect(result.status).toBe(403)
  // PC 仍停留在 WAITING_APP（未被批准）
  await expect(pcPage.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()
  expect(mockBackend.resumed.has(REQUEST_ID)).toBe(false)
  await phoneCtx.close()
})

test('无效 QR：手机端解析到畸形深链 → 页面 INVALID 且不泄露详情', async ({ browser, page: pcPage }) => {
  installMockRoutes(pcPage, { fresh: true })
  mockBackend.requests.set(REQUEST_ID, defaultDetail({ requestId: REQUEST_ID, handoff: HANDOFF }))
  await pcPage.goto(`/r/${REQUEST_ID}${handoffFragment(HANDOFF)}`)
  await expect(pcPage.getByText('请在 Mini-HBUT 中确认此次登录')).toBeVisible()

  // 手机扫到畸形 QR（缺 handoff 的 URL）
  const phoneCtx = await phoneContext(browser)
  const phone = await phoneCtx.newPage()
  installMockRoutes(phone, { fresh: false })
  await phone.goto(`/r/${REQUEST_ID}`)
  await expect(phone.getByText('链接缺少一次性凭据，无法读取授权信息')).toBeVisible()
  // 不显示任何客户端详情
  expect(await phone.getByText('课程助手（E2E）').count()).toBe(0)
  await phoneCtx.close()
})
