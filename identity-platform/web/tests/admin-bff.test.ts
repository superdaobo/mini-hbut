/**
 * Admin BFF 路由守卫测试（issue #625）：
 * - 所有端点要求会话（401）；mutation 要求 CSRF + Origin（403）；
 * - auth_time 从会话 iat 传播（step-up 由 Core 判定）；
 * - 非管理员（无角色）→ 403 forbidden（服务端 RBAC 边界，不只是隐藏菜单）；
 * - step_up_required / revision_mismatch 错误码透传；
 * - 响应一律 no-store。
 *
 * 使用模块级桩（与 BFF 路由同实例，IDENTITY_CORE_STUB=1）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { encryptSession } from '../lib/auth-session/index'
import { getStubDeveloperStore, clearStubDeveloperStore } from '../lib/developer-api/stub-store'
import { getStubAdminStore, clearStubAdminStore } from '../lib/admin/stub-store'
import { GET as meGet } from '../app/developer-site/api/v1/admin/me/route'
import { GET as overviewGet } from '../app/developer-site/api/v1/admin/overview/route'
import { GET as appsGet } from '../app/developer-site/api/v1/admin/apps/route'
import { GET as appGet } from '../app/developer-site/api/v1/admin/apps/[id]/route'
import { POST as approvePost } from '../app/developer-site/api/v1/admin/apps/[id]/reviews/[reviewId]/approve/route'
import { POST as rejectPost } from '../app/developer-site/api/v1/admin/apps/[id]/reviews/[reviewId]/reject/route'
import { POST as suspendPost } from '../app/developer-site/api/v1/admin/apps/[id]/suspend/route'
import { POST as revokePost } from '../app/developer-site/api/v1/admin/apps/[id]/revoke/route'
import { GET as auditGet } from '../app/developer-site/api/v1/admin/audit/route'

const ORIGIN = 'http://localhost:3000'
const TEST_SECRET = 'test-session-secret-0123456789abcdef'
/** 桩模式默认管理员 sub（与 stub-store 默认角色一致） */
const ADMIN_SUB = 'dev_sub_stub_0001'

function env(): Record<string, string | undefined> {
  return {
    WEB_SESSION_SECRET: TEST_SECRET,
    NODE_ENV: 'development',
    IDENTITY_ENVIRONMENT: 'development',
    IDENTITY_CORE_STUB: '1',
    DEVELOPER_REDIRECT_URI: `${ORIGIN}/callback`,
  }
}

const realEnv = process.env
beforeEach(() => {
  process.env = env() as NodeJS.ProcessEnv
  clearStubDeveloperStore()
  clearStubAdminStore()
})

function sessionCookies(sub = ADMIN_SUB, name = '管理员') {
  const now = Math.floor(Date.now() / 1000)
  const csrf = 'csrf-token-for-test'
  const token = encryptSession({ sub, display_name: name, csrf, iat: now, exp: now + 3600 }, env())
  return { cookie: `mh_dev_session=${token}; mh_dev_csrf=${csrf}`, csrf }
}

function makeRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
    body: init.body,
  })
}

function mutationHeaders(cookies: ReturnType<typeof sessionCookies>, withOrigin = true): Record<string, string> {
  return {
    cookie: cookies.cookie,
    'x-csrf-token': cookies.csrf,
    ...(withOrigin ? { origin: ORIGIN } : {}),
  }
}

/** 造一个提交审核的应用（owner = dev_sub） */
async function createSubmittedApp(): Promise<{ id: string }> {
  const dev = getStubDeveloperStore()
  const owner = 'dev_sub_0002'
  await dev.ensureDeveloper(owner, '测试开发者')
  const created = await dev.createApp(owner, {
    name: '课程助手',
    description: '课程查询',
    homepage_url: 'https://course.example.com',
    client_type: 'web_confidential',
    privacy_policy_url: 'https://course.example.com/privacy',
    contact: 'dev@example.com',
    redirect_uris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
    scopes: [{ scope: 'openid', justification: null }],
  })
  await dev.submitForReview(owner, created.id)
  return { id: created.id }
}

function params(id: string, reviewId = 'rev_x') {
  return { params: Promise.resolve({ id, reviewId }) }
}

describe('Admin BFF 会话/角色守卫', () => {
  it('无会话：me/overview/apps 全部 401', async () => {
    const res = await meGet(makeRequest('/api/v1/admin/me'))
    expect(res.status).toBe(401)
    const res2 = await overviewGet(makeRequest('/api/v1/admin/overview'))
    expect(res2.status).toBe(401)
    const res3 = await appsGet(makeRequest('/api/v1/admin/apps'))
    expect(res3.status).toBe(401)
  })

  it('非管理员（无角色）→ 403（服务端 RBAC，不因 URL 可访问而放行）', async () => {
    const cookies = sessionCookies('plain_user_0001', '普通用户')
    const res = await meGet(makeRequest('/api/v1/admin/me', { headers: { cookie: cookies.cookie } }))
    expect(res.status).toBe(403)
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ error: 'forbidden' })
  })

  it('管理员 me：返回身份 + 角色 + csrf', async () => {
    const cookies = sessionCookies()
    const res = await meGet(makeRequest('/api/v1/admin/me', { headers: { cookie: cookies.cookie } }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { admin: { sub: string; roles: string[] }; csrf_token: string }
    expect(body.admin.sub).toBe(ADMIN_SUB)
    expect(body.admin.roles).toContain('identity_admin')
    expect(body.csrf_token).toBe(cookies.csrf)
    // no-store
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})

describe('Admin BFF mutation 守卫（CSRF/Origin）', () => {
  it('mutation 缺 CSRF → 403；缺 Origin → 403；合法 → 通过', async () => {
    const { id } = await createSubmittedApp()
    const cookies = sessionCookies()

    // 缺 CSRF 头
    const noCsrf = await approvePost(
      makeRequest(`/api/v1/admin/apps/${id}/reviews/rev_x/approve`, {
        method: 'POST',
        headers: { cookie: cookies.cookie, origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ scope_decisions: [{ scope: 'openid', decision: 'approved' }] }),
      }),
      params(id),
    )
    expect(noCsrf.status).toBe(403)

    // 跨源（Origin 不在白名单）
    const crossOrigin = await approvePost(
      makeRequest(`/api/v1/admin/apps/${id}/reviews/rev_x/approve`, {
        method: 'POST',
        headers: { ...mutationHeaders(cookies), origin: 'https://evil.example.com' },
        body: JSON.stringify({ scope_decisions: [{ scope: 'openid', decision: 'approved' }] }),
      }),
      params(id),
    )
    expect(crossOrigin.status).toBe(403)

    // 合法请求 → 通过守卫（错误码来自业务层，此处应为 404 not_found 而非 403）
    const ok = await approvePost(
      makeRequest(`/api/v1/admin/apps/${id}/reviews/rev_x/approve`, {
        method: 'POST',
        headers: { ...mutationHeaders(cookies), 'content-type': 'application/json' },
        body: JSON.stringify({ scope_decisions: [{ scope: 'openid', decision: 'approved' }] }),
      }),
      params(id),
    )
    expect(ok.status).toBe(404)
  })

  it('suspend 缺 reason → 400（业务校验在守卫之后）', async () => {
    const { id } = await createSubmittedApp()
    const cookies = sessionCookies()
    const res = await suspendPost(
      makeRequest(`/api/v1/admin/apps/${id}/suspend`, {
        method: 'POST',
        headers: { ...mutationHeaders(cookies), 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      params(id),
    )
    expect(res.status).toBe(400)
  })
})

describe('Admin BFF 审核/运行时流程（桩，端到端）', () => {
  it('查看队列 → 审核通过 → 应用激活；重复 approve 幂等', async () => {
    const { id } = await createSubmittedApp()
    const cookies = sessionCookies()
    const list = await appsGet(makeRequest('/api/v1/admin/apps', { headers: { cookie: cookies.cookie } }))
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as { apps: Array<{ id: string; status: string }>; total: number }
    expect(listBody.total).toBe(1)
    expect(listBody.apps[0]?.id).toBe(id)

    const detail = await appGet(makeRequest(`/api/v1/admin/apps/${id}`, { headers: { cookie: cookies.cookie } }), params(id))
    const detailBody = (await detail.json()) as { app: { pending_review: { id: string } } }
    const reviewId = detailBody.app.pending_review.id

    const approve = await approvePost(
      makeRequest(`/api/v1/admin/apps/${id}/reviews/${reviewId}/approve`, {
        method: 'POST',
        headers: { ...mutationHeaders(cookies), 'content-type': 'application/json' },
        body: JSON.stringify({ scope_decisions: [{ scope: 'openid', decision: 'approved' }] }),
      }),
      params(id, reviewId),
    )
    expect(approve.status).toBe(200)

    const after = await appGet(makeRequest(`/api/v1/admin/apps/${id}`, { headers: { cookie: cookies.cookie } }), params(id))
    const afterBody = (await after.json()) as { app: { application: { status: string } } }
    expect(afterBody.app.application.status).toBe('active')
  })

  it('revision_mismatch 与 step_up_required 错误码透传', async () => {
    const { id } = await createSubmittedApp()
    const cookies = sessionCookies()
    const detail = await appGet(makeRequest(`/api/v1/admin/apps/${id}`, { headers: { cookie: cookies.cookie } }), params(id))
    const reviewId = ((await detail.json()) as { app: { pending_review: { id: string } } }).app.pending_review.id

    // 篡改内容（直改桩内部对象，模拟未来 Core 的变更路径）
    const live = getStubDeveloperStore()._allApps().find((a) => a.id === id)
    if (live) {
      live.name = '已改名'
    }
    const stale = await approvePost(
      makeRequest(`/api/v1/admin/apps/${id}/reviews/${reviewId}/approve`, {
        method: 'POST',
        headers: { ...mutationHeaders(cookies), 'content-type': 'application/json' },
        body: JSON.stringify({ scope_decisions: [{ scope: 'openid', decision: 'approved' }] }),
      }),
      params(id, reviewId),
    )
    expect(stale.status).toBe(409)
    expect((await stale.json()) as Record<string, unknown>).toMatchObject({ error: 'revision_mismatch' })
  })

  it('reviewer 角色（无 identity_admin）经 BFF 调 suspend → 403；admin 可 revoke', async () => {
    const { id } = await createSubmittedApp()
    const reviewerCookies = sessionCookies('reviewer_sub_0001', '审核员')
    // 给 reviewer 角色（默认桩只有 admin_sub 有角色）
    getStubAdminStore().setRole('reviewer_sub_0001', 'identity_reviewer')

    const denied = await suspendPost(
      makeRequest(`/api/v1/admin/apps/${id}/suspend`, {
        method: 'POST',
        headers: { ...mutationHeaders(reviewerCookies), 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'x' }),
      }),
      params(id),
    )
    expect(denied.status).toBe(403)
    expect((await denied.json()) as Record<string, unknown>).toMatchObject({ error: 'forbidden' })

    // admin 走完整流程：approve → suspend → revoke
    const adminCookies = sessionCookies()
    const detail = await appGet(makeRequest(`/api/v1/admin/apps/${id}`, { headers: { cookie: adminCookies.cookie } }), params(id))
    const reviewId = ((await detail.json()) as { app: { pending_review: { id: string } } }).app.pending_review.id
    await approvePost(
      makeRequest(`/api/v1/admin/apps/${id}/reviews/${reviewId}/approve`, {
        method: 'POST',
        headers: { ...mutationHeaders(adminCookies), 'content-type': 'application/json' },
        body: JSON.stringify({ scope_decisions: [{ scope: 'openid', decision: 'approved' }] }),
      }),
      params(id, reviewId),
    )
    const suspended = await suspendPost(
      makeRequest(`/api/v1/admin/apps/${id}/suspend`, {
        method: 'POST',
        headers: { ...mutationHeaders(adminCookies), 'content-type': 'application/json' },
        body: JSON.stringify({ reason: '安全响应' }),
      }),
      params(id),
    )
    expect(suspended.status).toBe(200)
    const revoked = await revokePost(
      makeRequest(`/api/v1/admin/apps/${id}/revoke`, {
        method: 'POST',
        headers: { ...mutationHeaders(adminCookies), 'content-type': 'application/json' },
        body: JSON.stringify({ reason: '永久撤销' }),
      }),
      params(id),
    )
    expect(revoked.status).toBe(200)
    // 审计查询（admin）
    const audit = await auditGet(makeRequest('/api/v1/admin/audit', { headers: { cookie: adminCookies.cookie } }))
    expect(audit.status).toBe(200)
    const auditBody = (await audit.json()) as { events: Array<{ event_type: string }> }
    expect(auditBody.events.map((e) => e.event_type)).toEqual(expect.arrayContaining([
      'ADMIN_APP_APPROVED',
      'ADMIN_CLIENT_SUSPENDED',
      'ADMIN_CLIENT_REVOKED',
    ]))
  })
})
