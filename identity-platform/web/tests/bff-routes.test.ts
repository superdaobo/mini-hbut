/**
 * BFF 路由安全测试（#630 Security 验收项，直调 Next.js route handler）。
 * 使用 Core 桩（IDENTITY_CORE_STUB=1 + seedStubRequest）驱动：
 *  - request id alone 不能读详情/状态（缺 handoff → 401）；
 *  - handoff 格式非法 → fail closed；
 *  - 任意 next= 参数被拒绝（400）；
 *  - resume 幂等（approved → already_resumed）；
 *  - 所有响应 Cache-Control: no-store。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { clearStubStore, seedStubRequest } from '../lib/core-client/index'
import { GET as getDetail } from '../app/auth-site/api/auth/requests/[id]/route'
import { GET as getStatus } from '../app/auth-site/api/auth/requests/[id]/status/route'
import { POST as postResume } from '../app/auth-site/api/auth/requests/[id]/resume/route'
import { BASE_DETAIL, makeStubRecord, VALID_HANDOFF } from './fixtures'

const REQUEST_ID = BASE_DETAIL.request_id
const BASE_URL = 'https://auth.xn--vhq74jc2fzpchter27a.com'

function makeRequest(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
  })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  clearStubStore()
  process.env.IDENTITY_CORE_STUB = '1'
})

describe('GET /api/auth/requests/[id]（详情）', () => {
  it('只有 request id、没有 handoff：401 missing_handoff（不给详情）', async () => {
    const res = await getDetail(makeRequest(`/api/auth/requests/${REQUEST_ID}`), params(REQUEST_ID))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'missing_handoff' })
  })

  it('handoff 格式非法（过短）：fail closed 401', async () => {
    const res = await getDetail(
      makeRequest(`/api/auth/requests/${REQUEST_ID}`, { headers: { 'x-identity-handoff': 'short' } }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(401)
  })

  it('handoff 合法且匹配：200 返回 sanitized DTO，响应 no-store', async () => {
    seedStubRequest(makeStubRecord())
    const res = await getDetail(
      makeRequest(`/api/auth/requests/${REQUEST_ID}`, { headers: { 'x-identity-handoff': VALID_HANDOFF } }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    const body = await res.json()
    expect(body.request_id).toBe(REQUEST_ID)
    expect(body.client.name).toBe('课程助手')
    // sanitized：不含 student id / code / secret
    expect(JSON.stringify(body)).not.toMatch(/student_id|authorization_code|secret/i)
  })

  it('handoff 值错误（格式合法但 Core 校验失败）：401 invalid_handoff', async () => {
    seedStubRequest(makeStubRecord())
    const res = await getDetail(
      makeRequest(`/api/auth/requests/${REQUEST_ID}`, {
        headers: { 'x-identity-handoff': 'another-valid-handoff-token-000000000' }, // secretguard: allow-test-fixture
      }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_handoff' })
  })

  it('请求不存在：404 not_found', async () => {
    const res = await getDetail(
      makeRequest(`/api/auth/requests/ar_unknown_9999`, { headers: { 'x-identity-handoff': VALID_HANDOFF } }),
      params('ar_unknown_9999'),
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('畸形 request id：400 invalid_request（防注入）', async () => {
    const bad = 'ar_../etc/passwd'
    const res = await getDetail(
      makeRequest(`/api/auth/requests/${encodeURIComponent(bad)}`, { headers: { 'x-identity-handoff': VALID_HANDOFF } }),
      params(bad),
    )
    expect(res.status).toBe(400)
  })

  it('携带 next= 参数：400 next_not_allowed（回调不由 Web 决定）', async () => {
    seedStubRequest(makeStubRecord())
    const res = await getDetail(
      makeRequest(`/api/auth/requests/${REQUEST_ID}?next=https://evil.example.com`, {
        headers: { 'x-identity-handoff': VALID_HANDOFF },
      }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'next_not_allowed' })
  })

  it('错误响应同样 no-store', async () => {
    const res = await getDetail(makeRequest(`/api/auth/requests/${REQUEST_ID}`), params(REQUEST_ID))
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })
})

describe('GET /api/auth/requests/[id]/status（轮询）', () => {
  it('无 handoff：401；有 handoff：200 最小状态', async () => {
    seedStubRequest(makeStubRecord({ status: 'waiting_app' }))
    const denied = await getStatus(makeRequest(`/api/auth/requests/${REQUEST_ID}/status`), params(REQUEST_ID))
    expect(denied.status).toBe(401)
    const ok = await getStatus(
      makeRequest(`/api/auth/requests/${REQUEST_ID}/status`, { headers: { 'x-identity-handoff': VALID_HANDOFF } }),
      params(REQUEST_ID),
    )
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Cache-Control')).toContain('no-store')
    const body = await ok.json()
    expect(body).toEqual({
      request_id: REQUEST_ID,
      status: 'waiting_app',
      expires_at: BASE_DETAIL.expires_at,
    })
  })

  it('Core 判定过期：410 expired', async () => {
    seedStubRequest(makeStubRecord({ status: 'expired' }))
    const res = await getStatus(
      makeRequest(`/api/auth/requests/${REQUEST_ID}/status`, { headers: { 'x-identity-handoff': VALID_HANDOFF } }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: 'expired' })
  })
})

describe('POST /api/auth/requests/[id]/resume', () => {
  it('无 handoff：401', async () => {
    const res = await postResume(makeRequest(`/api/auth/requests/${REQUEST_ID}/resume`, { method: 'POST' }), params(REQUEST_ID))
    expect(res.status).toBe(401)
  })

  it('未 APPROVED：409 not_approved（Core 重新验证后拒绝）', async () => {
    seedStubRequest(makeStubRecord({ status: 'waiting_app' }))
    const res = await postResume(
      makeRequest(`/api/auth/requests/${REQUEST_ID}/resume`, {
        method: 'POST',
        headers: { 'x-identity-handoff': VALID_HANDOFF },
      }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'not_approved' })
  })

  it('APPROVED：200 + redirect_to 由 Core 决定；响应 no-store', async () => {
    seedStubRequest(
      makeStubRecord({ status: 'approved', resumeRedirectTo: 'https://course.example.com/cb?code=abc' }),
    )
    const res = await postResume(
      makeRequest(`/api/auth/requests/${REQUEST_ID}/resume`, {
        method: 'POST',
        headers: { 'x-identity-handoff': VALID_HANDOFF },
      }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    const body = await res.json()
    expect(body.status).toBe('approved')
    expect(body.redirect_to).toBe('https://course.example.com/cb?code=abc')
  })

  it('resume 幂等：第二次返回 already_resumed，不产生第二份授权结果', async () => {
    seedStubRequest(
      makeStubRecord({ status: 'approved', resumeRedirectTo: 'https://course.example.com/cb?code=abc' }),
    )
    const call = () =>
      postResume(
        makeRequest(`/api/auth/requests/${REQUEST_ID}/resume`, {
          method: 'POST',
          headers: { 'x-identity-handoff': VALID_HANDOFF },
        }),
        params(REQUEST_ID),
      )
    const first = await (await call()).json()
    const second = await (await call()).json()
    expect(first.status).toBe('approved')
    expect(second.status).toBe('already_resumed')
  })

  it('携带 next= 参数：400 next_not_allowed（绝不自己跳第三方 URL）', async () => {
    seedStubRequest(makeStubRecord({ status: 'approved' }))
    const res = await postResume(
      makeRequest(`/api/auth/requests/${REQUEST_ID}/resume?next=https://evil.example.com`, {
        method: 'POST',
        headers: { 'x-identity-handoff': VALID_HANDOFF },
      }),
      params(REQUEST_ID),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'next_not_allowed' })
  })
})
