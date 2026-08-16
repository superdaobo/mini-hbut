/**
 * E2E 共享 mock 后端与 fixture（#628）。
 *
 * mock 模式用 page.route 拦截 Web BFF API，内存 Map 模拟 Core 的：
 *  - AuthRequest 状态机：CREATED → WAITING_APP → APPROVED/DENIED/EXPIRED；
 *  - Developer 应用列表/创建；
 *  - Admin 审核队列/批准/暂停。
 *
 * 设计要点：
 *  - 状态后端是进程内单例 Map，跨 browser context 共享 →
 *    这正是 L5 双 context（PC context + Phone context）能协同的原因；
 *  - route handler 对 x-identity-handoff 头做断言/透传校验，模拟 Core 的
 *    handoff 校验（缺失/不匹配 → 401），页面层不能只靠“没发 handoff”就拿到详情；
 *  - 所有 mock 响应带 Cache-Control: no-store（页面轮询正确性依赖）。
 */
import type { Page, Route } from '@playwright/test'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'

export const HOSTS = {
  AUTH: 'http://auth.example.test:3100',
  DEVELOPER: 'http://developer.example.test:3100',
}

/** 与 web 端一致的会话加密参数（WEB_SESSION_SECRET 固定为 E2E 专用值） */
const E2E_WEB_SESSION_SECRET = 'e2e-only-session-secret-0123456789abcdef'

/**
 * 生成合法 Developer/Admin 会话 cookie（与 web/lib/auth-session 同构：
 * AES-256-GCM，密钥 = sha256(WEB_SESSION_SECRET)，载荷 base64url(iv|tag|ciphertext)）。
 * 用途：mock 模式下模拟“已登录”，让 developer/admin 页面跳过 login 重定向。
 */
export function buildSessionCookie(overrides: { role?: string; displayName?: string } = {}): {
  name: string
  value: string
  domain: string
  path: string
} {
  const key = createHash('sha256').update(E2E_WEB_SESSION_SECRET, 'utf8').digest()
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: 'usr_e2e_' + (overrides.role === 'identity_admin' ? 'admin' : 'dev'),
    display_name: overrides.displayName ?? 'E2E 用户',
    csrf: 'csrf_e2e_session_token',
    iat: now,
    exp: now + 3600,
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    name: 'mh_dev_session',
    value: Buffer.concat([iv, tag, encrypted]).toString('base64url'),
    domain: 'developer.example.test',
    path: '/',
  }
}

/** 注入 developer 站点会话 cookie（模拟已登录） */
export async function seedDeveloperSession(page: Page, role: 'developer' | 'identity_admin' = 'developer') {
  const cookie = buildSessionCookie({ role })
  await page.context().addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
    },
    // 非 HttpOnly 双提交 CSRF cookie（与 payload.csrf 同值；BFF mutation 校验）
    {
      name: 'mh_dev_csrf',
      value: 'csrf_e2e_session_token',
      domain: cookie.domain,
      path: cookie.path,
    },
  ])
}

/** AuthRequest 状态（与 core/src/domain/auth-requests 状态机对齐） */
export type MockRequestStatus =
  | 'waiting_app'
  | 'app_opened'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'invalid'
  | 'client_unavailable'

export interface MockAuthRequest {
  requestId: string
  handoff: string
  status: MockRequestStatus
  expiresAt: string
  client: {
    client_id: string
    name: string
    homepage_host: string
    developer_display_name: string
    review_status: string
  }
  scopes: Array<{ id: string; label: string; risk: string }>
  resumeRedirectTo: string
}

/** 进程内共享状态后端（跨 context；测试文件间用 unique 前缀隔离） */
export const mockBackend = {
  requests: new Map<string, MockAuthRequest>(),
  /** 每次 status 请求自增（断言轮询发生） */
  statusPolls: new Map<string, number>(),
  /** 已调用过的 resume（防重复 resume 断言） */
  resumed: new Set<string>(),
  /** developer 应用列表 */
  apps: [] as Array<Record<string, unknown>>,
  /** admin 审核队列 */
  reviews: [] as Array<Record<string, unknown>>,
  /** admin session（mock 的登录态） */
  adminLoggedIn: true,
}

export function defaultDetail(req: Partial<MockAuthRequest>): MockAuthRequest {
  return {
    requestId: req.requestId ?? 'req_mock',
    handoff: req.handoff ?? 'ho_mock_e2e_handoff_value',
    status: req.status ?? 'waiting_app',
    expiresAt: req.expiresAt ?? new Date(Date.now() + 120_000).toISOString(),
    client: req.client ?? {
      client_id: 'cli_e2e_demo',
      name: '课程助手（E2E）',
      homepage_host: 'course.example.com',
      developer_display_name: 'Mini-HBUT 团队',
      review_status: 'verified',
    },
    scopes: req.scopes ?? [
      { id: 'openid', label: '确认你的 Mini-HBUT 身份', risk: 'basic' },
      { id: 'profile', label: '查看基础资料', risk: 'basic' },
      { id: 'student.identity', label: '获取你的学校身份（敏感）', risk: 'sensitive' },
    ],
    resumeRedirectTo: req.resumeRedirectTo ?? 'http://auth.example.test:3100/cb-done',
  }
}

export interface MockOptions {
  /** 用固定后端还是每测试新后端 */
  fresh?: boolean
}

/**
 * 安装全套 mock route。
 * - page.route 的 handler 内直接操作 mockBackend（进程内共享）；
 * - BFF 路径：/api/auth/requests/*（auth-site）、/api/v1/*（developer/admin）。
 */
export function installMockRoutes(page: Page, opts: MockOptions = {}) {
  if (opts.fresh) {
    mockBackend.requests.clear()
    mockBackend.statusPolls.clear()
    mockBackend.resumed.clear()
    mockBackend.apps = []
    mockBackend.reviews = []
  }

  // ---- auth-site BFF：/api/auth/requests/:id[/status|/resume] ----
  // 注意：Playwright glob 的 `*` 不跨 `/`，必须用 `**` 才能覆盖 status/resume 子路径
  void page.route('**/api/auth/requests/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const segments = url.pathname.split('/').filter(Boolean) // api/auth/requests/:id[/status|/resume]
    const requestId = segments[segments.length - 1] ?? ''
    const action = requestId === 'status' || requestId === 'resume'
      ? requestId
      : 'detail'
    const id = action === 'detail' ? requestId : segments[segments.length - 2] ?? ''
    const req = mockBackend.requests.get(id)

    if (action === 'status') {
      mockBackend.statusPolls.set(id, (mockBackend.statusPolls.get(id) ?? 0) + 1)
    }

    if (action === 'resume') {
      if (!req || req.status !== 'approved') {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'not_approved' }) })
        return
      }
      mockBackend.resumed.add(id)
      await route.fulfill({
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        contentType: 'application/json',
        body: JSON.stringify({ redirect_to: req.resumeRedirectTo }),
      })
      return
    }

    if (!req) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) })
      return
    }
    // handoff 校验（#630/#628：只有 request id 无 handoff 不给详情）
    const handoff = route.request().headers()['x-identity-handoff']
    if (!handoff || handoff !== req.handoff) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_handoff' }) })
      return
    }
    // CLIENT_UNAVAILABLE：Core 在 detail 阶段以 error code 返回（#630 状态机）
    if (req.status === 'client_unavailable') {
      await route.fulfill({
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
        contentType: 'application/json',
        body: JSON.stringify({ error: 'client_unavailable' }),
      })
      return
    }
    const isStatus = action === 'status'
    const body = isStatus
      ? { request_id: req.requestId, status: req.status, expires_at: req.expiresAt }
      : {
          request_id: req.requestId,
          expires_at: req.expiresAt,
          client: req.client,
          scopes: req.scopes,
        }
    await route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  // ---- Core API（phone context 模拟 App 调用 approve/deny；同源路径便于 mock）----
  void page.route('**/api/v1/requests/*/approve', async (route: Route) => {
    const url = new URL(route.request().url())
    const requestId = url.pathname.split('/').filter(Boolean)[3] ?? ''
    const req = mockBackend.requests.get(requestId)
    if (!req) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) })
      return
    }
    if (req.status === 'approved') {
      // 幂等：重复 approve 不产生第二次批准（#626 device replay）
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ created: false }) })
      return
    }
    if (req.status !== 'waiting_app' && req.status !== 'app_opened') {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_state' }) })
      return
    }
    req.status = 'approved'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ created: true }) })
  })

  void page.route('**/api/v1/requests/*/deny', async (route: Route) => {
    const url = new URL(route.request().url())
    const requestId = url.pathname.split('/').filter(Boolean)[3] ?? ''
    const req = mockBackend.requests.get(requestId)
    if (!req) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) })
      return
    }
    req.status = 'denied'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ created: true }) })
  })

  // ---- Developer BFF：/api/v1/developer/apps ----
  void page.route('**/api/v1/developer/apps*', async (route: Route) => {
    const method = route.request().method()
    const url = new URL(route.request().url())
    if (method === 'GET' && !url.pathname.includes('/apps/')) {
      await route.fulfill({
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        contentType: 'application/json',
        body: JSON.stringify({ apps: mockBackend.apps }),
      })
      return
    }
    if (method === 'GET' && url.pathname.includes('/apps/')) {
      const id = url.pathname.split('/').filter(Boolean).pop() ?? ''
      const app = mockBackend.apps.find((a) => a.id === id)
      await route.fulfill({
        status: app ? 200 : 404,
        headers: { 'Cache-Control': 'no-store' },
        contentType: 'application/json',
        body: JSON.stringify(app ? { app } : { error: 'not_found' }),
      })
      return
    }
    if (method === 'POST' && url.pathname.endsWith('/apps')) {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      const app = {
        id: `app_e2e_${mockBackend.apps.length + 1}`,
        client_id: `cli_e2e_${Date.now().toString(36)}`,
        name: payload.name ?? '未命名应用',
        client_type: payload.client_type ?? 'web_confidential',
        status: 'draft',
        scopes: payload.scopes ?? ['openid'],
        created_at: new Date().toISOString(),
      }
      mockBackend.apps.unshift(app)
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(app) })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) })
  })

  // ---- Admin BFF：/api/v1/admin/* ----
  void page.route('**/api/v1/admin/overview', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify({
        overview: {
          pending_reviews: 2,
          pending_sensitive_scopes: 1,
          active_clients: 5,
          suspended_clients: 1,
          recent_events: [],
        },
      }),
    })
  })
  // 同时覆盖 /apps（列表）与 /apps/:id[/suspend|/reviews...]（page.route 不支持数组，用 RegExp）
  void page.route(/\/api\/v1\/admin\/apps(\/.*)?$/, async (route: Route) => {
    const method = route.request().method()
    const url = new URL(route.request().url())
    const path = url.pathname
    // 列表 / detail
    if (method === 'GET' && !path.includes('/reviews/')) {
      if (path.endsWith('/apps')) {
        await route.fulfill({
          status: 200,
          headers: { 'Cache-Control': 'no-store' },
          contentType: 'application/json',
          body: JSON.stringify({ apps: mockBackend.reviews, total: mockBackend.reviews.length }),
        })
        return
      }
      const id = path.split('/').filter(Boolean).pop() ?? ''
      const app = mockBackend.reviews.find((a) => a.id === id)
      await route.fulfill({
        status: app ? 200 : 404,
        headers: { 'Cache-Control': 'no-store' },
        contentType: 'application/json',
        body: JSON.stringify(app ? { app } : { error: 'not_found' }),
      })
      return
    }
    // suspend / unsuspend / revoke（path 形如 .../apps/:id/suspend，id 是倒数第二段）
    const segments = path.split('/').filter(Boolean)
    const id = segments[segments.length - 2] ?? ''
    const app = mockBackend.reviews.find((a) => a.id === id)
    if (app) {
      if (path.endsWith('/suspend')) app.status = 'suspended'
      if (path.endsWith('/unsuspend')) app.status = 'active'
      if (path.endsWith('/revoke')) app.status = 'revoked'
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(app) })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) })
  })
  void page.route('**/api/v1/admin/apps/*/reviews', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify({
        reviews: [
          {
            id: 'rev_e2e_1',
            application_id: 'app_e2e_pending',
            revision: 'rev_v1',
            submitted_by: 'usr_e2e_dev',
            submitted_at: new Date().toISOString(),
            metadata: { name: '课程助手（待审核）' },
            redirect_uris: [
              { uri: 'https://course.example.com/cb', kind: 'web_https', created_at: new Date().toISOString() },
            ],
            scopes: [
              { scope: 'openid', status: 'approved', review_note: null, requested_at: new Date().toISOString() },
              { scope: 'student.identity', status: 'pending', review_note: '用于课程同步', requested_at: new Date().toISOString() },
            ],
            status: 'pending',
            reviewer_user_id: null,
            reviewed_at: null,
            decision_note: null,
            scope_decisions: null,
          },
        ],
      }),
    })
  })
  void page.route('**/api/v1/admin/apps/*/reviews/*/approve', async (route: Route) => {
    const url = new URL(route.request().url())
    const id = url.pathname.split('/').filter(Boolean)[4] ?? ''
    const app = mockBackend.reviews.find((a) => a.id === id)
    if (app) app.status = 'active'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  void page.route('**/api/v1/admin/apps/*/reviews/*/reject', async (route: Route) => {
    const url = new URL(route.request().url())
    const id = url.pathname.split('/').filter(Boolean)[4] ?? ''
    const app = mockBackend.reviews.find((a) => a.id === id)
    if (app) app.status = 'rejected'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  // ---- Admin session / me（结构对齐 web admin-api MeResult：admin 嵌套 + csrf_token）----
  void page.route('**/api/v1/admin/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        admin: {
          sub: 'usr_e2e_admin',
          display_name: 'E2E 管理员',
          roles: ['identity_admin', 'identity_reviewer'],
        },
        csrf_token: 'csrf_e2e_session_token',
      }),
    })
  })
  void page.route('**/api/v1/admin/session/reauth', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  // ---- Developer session / me（me 结构对齐 web MeResult：developer 嵌套 + csrf_token）----
  void page.route('**/api/v1/developer/session*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logged_in: true, user: { id: 'usr_e2e_dev', display_name: 'E2E 开发者' } }),
    })
  })
  void page.route('**/api/v1/developer/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        developer: {
          user_id: 'usr_e2e_dev',
          display_name: 'E2E 开发者',
          email: 'e2e@example.com',
        },
        csrf_token: 'csrf_e2e_session_token',
      }),
    })
  })
}

/** 常用 handoff 读取（页面只从 hash 读取，服务端拿不到 —— 这里模拟浏览器行为） */
export function handoffFragment(handoff: string): string {
  return `#h=${encodeURIComponent(handoff)}`
}

/** AdminAppDetailDTO 工厂（与 web/lib/admin/contract.ts 对齐） */
export function adminAppDetail(overrides: { id: string; name?: string; status?: string }): Record<string, unknown> {
  const id = overrides.id
  const now = new Date().toISOString()
  return {
    application: {
      id,
      client_id: `cli_${id}`,
      name: overrides.name ?? '待审核应用',
      description: 'E2E 测试应用描述',
      homepage_url: 'https://course.example.com',
      privacy_policy_url: 'https://course.example.com/privacy',
      client_type: 'web_confidential',
      status: overrides.status ?? 'pending_review',
      token_endpoint_auth_method: 'client_secret_basic',
      subject_type: 'pairwise',
      has_secret: true,
      client_secret_expires_at: null,
      created_at: now,
      submitted_at: now,
      reviewed_at: null,
      activated_at: null,
      updated_at: now,
    },
    developer: {
      user_id: 'usr_e2e_dev',
      display_name: 'E2E 开发者',
      contact_email: 'e2e@example.com',
      created_at: now,
      total_apps: 1,
      penalized_apps: 0,
    },
    redirect_uris: [
      { id: 'ru_1', uri: 'https://course.example.com/cb', kind: 'web_https', created_at: now },
    ],
    scopes: [
      { scope: 'openid', status: 'approved', requested_at: now, approved_at: now, review_note: null },
      { scope: 'student.identity', status: 'pending', requested_at: now, approved_at: null, review_note: '需要学校身份用于课程同步' },
    ],
    reviews: [
      {
        id: `rev_${id}`,
        application_id: id,
        revision: 'rev_v1',
        submitted_by: 'usr_e2e_dev',
        submitted_at: now,
        metadata: { name: '待审核应用', description: 'E2E 测试应用描述' },
        redirect_uris: [
          { uri: 'https://course.example.com/cb', kind: 'web_https', created_at: now },
        ],
        scopes: [
          { scope: 'openid', status: 'approved', review_note: null, requested_at: now },
          { scope: 'student.identity', status: 'pending', review_note: '需要学校身份用于课程同步', requested_at: now },
        ],
        status: 'pending',
        reviewer_user_id: null,
        reviewed_at: null,
        decision_note: null,
        scope_decisions: null,
      },
    ],
    pending_review: (overrides.status ?? 'pending_review') === 'pending_review'
      ? {
          id: `rev_${id}`,
          application_id: id,
          revision: 'rev_v1',
          submitted_by: 'usr_e2e_dev',
          submitted_at: now,
          metadata: { name: '待审核应用', description: 'E2E 测试应用描述' },
          redirect_uris: [
            { uri: 'https://course.example.com/cb', kind: 'web_https', created_at: now },
          ],
          scopes: [
            { scope: 'openid', status: 'approved', review_note: null, requested_at: now },
            { scope: 'student.identity', status: 'pending', review_note: '需要学校身份用于课程同步', requested_at: now },
          ],
          status: 'pending',
          reviewer_user_id: null,
          reviewed_at: null,
          decision_note: null,
          scope_decisions: null,
        }
      : null,
  }
}
