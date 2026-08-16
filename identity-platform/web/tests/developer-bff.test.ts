/**
 * Developer BFF 路由守卫测试（issue #624：所有 mutation 必须会话 + CSRF + Origin；
 * IDOR 在路由层统一 404；响应一律 no-store）。
 *
 * 使用模块级桩（与 BFF 路由同实例），beforeEach 清空隔离。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { encryptSession } from '../lib/auth-session/index'
import { getStubDeveloperStore, clearStubDeveloperStore } from '../lib/developer-api/stub-store'
import { GET as appsGet, POST as appsPost } from '../app/developer-site/api/v1/developer/apps/route'
import { GET as appGet, PATCH as appPatch, DELETE as appDelete } from '../app/developer-site/api/v1/developer/apps/[id]/route'
import { POST as rotatePost } from '../app/developer-site/api/v1/developer/apps/[id]/credentials/rotate/route'
import { POST as submitPost } from '../app/developer-site/api/v1/developer/apps/[id]/submit/route'
import { POST as revokePost } from '../app/developer-site/api/v1/developer/apps/[id]/revoke/route'
import { POST as redirectPost } from '../app/developer-site/api/v1/developer/apps/[id]/redirect-uris/route'
import { PUT as scopesPut } from '../app/developer-site/api/v1/developer/apps/[id]/scopes/route'

const ORIGIN = 'http://localhost:3000'
const TEST_SECRET = 'test-session-secret-0123456789abcdef'

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
})
afterEach(() => {
  process.env = realEnv
})

/** 构造带会话/CSRF cookie 的请求头 */
function sessionCookies(sub = 'sub_a', name = '开发者 A') {
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

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

function mutationHeaders(cookies: ReturnType<typeof sessionCookies>, withOrigin = true): Record<string, string> {
  return {
    cookie: cookies.cookie,
    'x-csrf-token': cookies.csrf,
    ...(withOrigin ? { origin: ORIGIN } : {}),
  }
}

/** 通过桩 store 直接建一个应用（BFF 成功路径由下面专门用例覆盖） */
async function createAppViaBff(sub: string, name: string): Promise<{ id: string }> {
  const store = getStubDeveloperStore()
  await store.ensureDeveloper(sub, name)
  const created = await store.createApp(sub, {
    name: `${name} 的应用`,
    description: 'BFF 测试应用',
    homepage_url: 'https://course.example.com',
    client_type: 'web_confidential',
    privacy_policy_url: null,
    contact: null,
    redirect_uris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
    scopes: [{ scope: 'openid', justification: null }],
  })
  return { id: created.id }
}

describe('会话守卫（401）', () => {
  it('GET 列表/详情/审计 无会话：401 unauthorized', async () => {
    expect((await appsGet(makeRequest('/api/v1/developer/apps'))).status).toBe(401)
    expect((await appGet(makeRequest('/api/v1/developer/apps/app_1'), params('app_1'))).status).toBe(401)
  })

  it('全部 mutation 无会话：401（不区分接口）', async () => {
    expect((await appsPost(makeRequest('/api/v1/developer/apps', { method: 'POST' }))).status).toBe(401)
    expect((await appPatch(makeRequest('/api/v1/developer/apps/app_1', { method: 'PATCH' }), params('app_1'))).status).toBe(401)
    expect((await appDelete(makeRequest('/api/v1/developer/apps/app_1', { method: 'DELETE' }), params('app_1'))).status).toBe(401)
    expect((await rotatePost(makeRequest('/api/v1/developer/apps/app_1/credentials/rotate', { method: 'POST' }), params('app_1'))).status).toBe(401)
    expect((await submitPost(makeRequest('/api/v1/developer/apps/app_1/submit', { method: 'POST' }), params('app_1'))).status).toBe(401)
    expect((await revokePost(makeRequest('/api/v1/developer/apps/app_1/revoke', { method: 'POST' }), params('app_1'))).status).toBe(401)
    expect((await redirectPost(makeRequest('/api/v1/developer/apps/app_1/redirect-uris', { method: 'POST' }), params('app_1'))).status).toBe(401)
    expect((await scopesPut(makeRequest('/api/v1/developer/apps/app_1/scopes', { method: 'PUT' }), params('app_1'))).status).toBe(401)
  })

  it('错误响应统一 {error} 且 no-store', async () => {
    const res = await appsGet(makeRequest('/api/v1/developer/apps'))
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })
})

describe('CSRF / Origin 守卫（403）', () => {
  it('有会话但缺 CSRF header：403 forbidden', async () => {
    const cookies = sessionCookies()
    const res = await appsPost(
      makeRequest('/api/v1/developer/apps', {
        method: 'POST',
        headers: { cookie: cookies.cookie, origin: ORIGIN, 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it('CSRF header 与 cookie 不一致：403', async () => {
    const cookies = sessionCookies()
    const res = await appsPost(
      makeRequest('/api/v1/developer/apps', {
        method: 'POST',
        headers: {
          cookie: cookies.cookie,
          'x-csrf-token': 'wrong-token',
          origin: ORIGIN,
          'content-type': 'application/json',
        },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('跨源 mutation：403（Origin 白名单拒绝）', async () => {
    const cookies = sessionCookies()
    const res = await appsPost(
      makeRequest('/api/v1/developer/apps', {
        method: 'POST',
        headers: {
          cookie: cookies.cookie,
          'x-csrf-token': cookies.csrf,
          origin: 'https://evil.example.com',
          'content-type': 'application/json',
        },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('会话过期：401（解析为 null），而非 403', async () => {
    const now = Math.floor(Date.now() / 1000)
    const expired = encryptSession(
      { sub: 'sub_a', display_name: 'A', csrf: 'c', iat: now - 7200, exp: now - 60 },
      env(),
    )
    const res = await appsGet(
      makeRequest('/api/v1/developer/apps', { headers: { cookie: `mh_dev_session=${expired}` } }),
    )
    expect(res.status).toBe(401)
  })
})

describe('IDOR（路由层统一 404 不泄露存在性）', () => {
  it('A 的会话读取 B 的应用：404 not_found（与不存在一致）', async () => {
    const { id } = await createAppViaBff('sub_b', '开发者 B')
    const cookiesA = sessionCookies('sub_a', '开发者 A')
    // A 未被 ensureDeveloper 也行：requireOwned 先于开发者状态检查？—— 需建档以走到查找逻辑
    const store = getStubDeveloperStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const res = await appGet(
      makeRequest(`/api/v1/developer/apps/${id}`, { headers: { cookie: cookiesA.cookie } }),
      params(id),
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('A 的会话 rotate B 的 secret：404；A 提交 B 的应用：404', async () => {
    const { id } = await createAppViaBff('sub_b', '开发者 B')
    const store = getStubDeveloperStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const cookiesA = sessionCookies('sub_a', '开发者 A')
    const h = mutationHeaders(cookiesA)
    expect((await rotatePost(makeRequest(`/api/v1/developer/apps/${id}/credentials/rotate`, { method: 'POST', headers: h }), params(id))).status).toBe(404)
    expect((await submitPost(makeRequest(`/api/v1/developer/apps/${id}/submit`, { method: 'POST', headers: h }), params(id))).status).toBe(404)
    expect((await revokePost(makeRequest(`/api/v1/developer/apps/${id}/revoke`, { method: 'POST', headers: h }), params(id))).status).toBe(404)
    const patchRes = await appPatch(
      makeRequest(`/api/v1/developer/apps/${id}`, {
        method: 'PATCH',
        headers: { ...h, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '劫持' }),
      }),
      params(id),
    )
    expect(patchRes.status).toBe(404)
  })

  it('不存在的 app id 与 B 的 app 返回完全一致（防枚举）', async () => {
    const { id } = await createAppViaBff('sub_b', '开发者 B')
    const store = getStubDeveloperStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const cookiesA = sessionCookies('sub_a', '开发者 A')
    const missing = await appGet(
      makeRequest('/api/v1/developer/apps/app_nope', { headers: { cookie: cookiesA.cookie } }),
      params('app_nope'),
    )
    const foreign = await appGet(
      makeRequest(`/api/v1/developer/apps/${id}`, { headers: { cookie: cookiesA.cookie } }),
      params(id),
    )
    expect(missing.status).toBe(foreign.status)
    expect(await missing.json()).toEqual(await foreign.json())
  })
})

describe('成功路径与响应头', () => {
  it('带会话+CSRF：创建 201，响应 no-store；GET 列表 200 no-store', async () => {
    const store = getStubDeveloperStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const cookies = sessionCookies('sub_a', '开发者 A')
    const res = await appsPost(
      makeRequest('/api/v1/developer/apps', {
        method: 'POST',
        headers: {
          cookie: cookies.cookie,
          'x-csrf-token': cookies.csrf,
          origin: ORIGIN,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: '课程表助手',
          description: '展示课程与考试安排的第三方工具',
          homepage_url: 'https://course.example.com',
          client_type: 'web_confidential',
          privacy_policy_url: null,
          contact: null,
          redirect_uris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
          scopes: [{ scope: 'openid', justification: null }],
        }),
      }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    const body = (await res.json()) as { client_secret: string | null }
    expect(body.client_secret).toBeTruthy()

    const list = await appsGet(makeRequest('/api/v1/developer/apps', { headers: { cookie: cookies.cookie } }))
    expect(list.status).toBe(200)
    expect(list.headers.get('Cache-Control')).toContain('no-store')
  })

  it('提交→批准→启用全流程（BFF 路径 + 管理员 simulateAdminReview）后仍可正常操作', async () => {
    const store = getStubDeveloperStore()
    const { id } = await createAppViaBff('sub_a', '开发者 A')
    const cookies = sessionCookies('sub_a', '开发者 A')
    const h = mutationHeaders(cookies)

    const submitted = await submitPost(
      makeRequest(`/api/v1/developer/apps/${id}/submit`, { method: 'POST', headers: h }),
      params(id),
    )
    expect(submitted.status).toBe(200)
    const detail = (await submitted.json()) as { app: { status: string } }
    expect(detail.app.status).toBe('pending_review')

    store.simulateAdminReview(id, { to: 'approved' })
    store.simulateAdminReview(id, { to: 'active' })

    const rotated = await rotatePost(
      makeRequest(`/api/v1/developer/apps/${id}/credentials/rotate`, { method: 'POST', headers: h }),
      params(id),
    )
    expect(rotated.status).toBe(200)
    const rotBody = (await rotated.json()) as { client_secret: string }
    expect(rotBody.client_secret).toBeTruthy()
  })
})
