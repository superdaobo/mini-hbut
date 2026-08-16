/**
 * Core API 客户端测试：类型化 client 与桩实现（#630 与 Core 的对接合同）。
 *  - handoff 只进 header 不进 URL（安全属性）；
 *  - 错误码/状态码映射与契约一致；
 *  - 桩实现幂等 resume（不产生第二份授权结果）。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  buildCoreRequest,
  clearStubStore,
  coreBaseUrl,
  createCoreClient,
  createCoreStubClient,
  HANDOFF_HEADER,
} from '../lib/core-client/index'
import { CoreApiError } from '../lib/core-client/contract'
import { BASE_DETAIL, makeStubRecord, VALID_HANDOFF } from './fixtures'

describe('coreBaseUrl', () => {
  it('必须显式配置，缺失抛错（fail closed）', () => {
    expect(() => coreBaseUrl({})).toThrow()
    expect(() => coreBaseUrl({ IDENTITY_CORE_BASE_URL: 'https://core.example.com' })).not.toThrow()
  })

  it('去掉尾部斜杠', () => {
    expect(coreBaseUrl({ IDENTITY_CORE_BASE_URL: 'https://core.example.com///' })).toBe(
      'https://core.example.com',
    )
  })
})

describe('buildCoreRequest（handoff 不进 URL）', () => {
  it('handoff 只进敏感 header', () => {
    const { url, headers } = buildCoreRequest(
      'https://core.example.com',
      '/api/v1/requests/ar_abc',
      VALID_HANDOFF,
    )
    expect(url).toBe('https://core.example.com/api/v1/requests/ar_abc')
    expect(url).not.toContain(VALID_HANDOFF)
    expect(url).not.toContain('handoff')
    expect(headers[HANDOFF_HEADER]).toBe(VALID_HANDOFF)
  })

  it('#626：配置了 IDENTITY_SERVICE_TOKEN 时附加服务令牌头（BFF→Core 认证）', () => {
    const env = { IDENTITY_SERVICE_TOKEN: 'svc-token-0123456789abcdef0123456789abcdef' } // secretguard: allow-test-fixture
    const { headers } = buildCoreRequest(
      'https://core.example.com',
      '/api/v1/requests/ar_abc',
      VALID_HANDOFF,
      env,
    )
    expect(headers['x-identity-service-token']).toBe('svc-token-0123456789abcdef0123456789abcdef')
    // handoff 与令牌都不进 URL
    const { url } = buildCoreRequest('https://core.example.com', '/api/v1/requests/ar_abc', VALID_HANDOFF, env)
    expect(url).not.toContain('svc-token')
  })

  it('#626：未配置令牌时不附加服务令牌头', () => {
    const { headers } = buildCoreRequest(
      'https://core.example.com',
      '/api/v1/requests/ar_abc',
      VALID_HANDOFF,
      {},
    )
    expect(headers['x-identity-service-token']).toBeUndefined()
  })
})

describe('createCoreClient（真实客户端）', () => {
  it('成功请求解析 DTO，且请求 URL 不含 handoff', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(BASE_DETAIL), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const client = createCoreClient('https://core.example.com', fetchImpl)
    const detail = await client.getRequestDetail('ar_test_0001', VALID_HANDOFF)
    expect(detail.request_id).toBe(BASE_DETAIL.request_id)

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).not.toContain(VALID_HANDOFF)
    expect((init?.headers as Record<string, string> | undefined)?.[HANDOFF_HEADER]).toBe(VALID_HANDOFF)
    expect(init?.method).toBe('GET')
  })

  it('错误响应映射为 CoreApiError（code/status）', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_handoff' }), { status: 401 }),
    )
    const client = createCoreClient('https://core.example.com', fetchImpl)
    await expect(client.getRequestStatus('ar_test_0001', 'wrong')).rejects.toMatchObject({
      code: 'invalid_handoff',
      status: 401,
    })
  })

  it('非 JSON 错误体映射为 internal', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 502 }))
    const client = createCoreClient('https://core.example.com', fetchImpl)
    await expect(client.resumeRequest('ar_test_0001', VALID_HANDOFF)).rejects.toMatchObject({
      code: 'internal',
      status: 502,
    })
  })

  it('resume 走 POST', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: 'approved' }), { status: 200 }),
    )
    const client = createCoreClient('https://core.example.com', fetchImpl)
    await client.resumeRequest('ar_test_0001', VALID_HANDOFF)
    expect(fetchImpl.mock.calls[0]![1]?.method).toBe('POST')
  })

  it('CoreApiError 是 Error 子类（可被 BFF 捕获识别）', () => {
    const err = new CoreApiError(404, 'not_found')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('not_found')
    expect(err.status).toBe(404)
  })
})

describe('createCoreStubClient（Core 未实现前的桩）', () => {
  it('handoff 正确时返回详情；错误 handoff → invalid_handoff；缺失 → not_found', async () => {
    const store = new Map([[BASE_DETAIL.request_id, makeStubRecord()]])
    const client = createCoreStubClient(store)
    await expect(client.getRequestDetail(BASE_DETAIL.request_id, VALID_HANDOFF)).resolves.toMatchObject({
      request_id: BASE_DETAIL.request_id,
    })
    await expect(client.getRequestDetail(BASE_DETAIL.request_id, 'wrong-handoff-value-000000000')).rejects.toMatchObject({ code: 'invalid_handoff', status: 401 })
    await expect(client.getRequestDetail('ar_unknown_9999', VALID_HANDOFF)).rejects.toMatchObject({ code: 'not_found', status: 404 })
  })

  it('status=expired → 410 expired（含详情与状态端点）', async () => {
    const store = new Map([[BASE_DETAIL.request_id, makeStubRecord({ status: 'expired' })]])
    const client = createCoreStubClient(store)
    await expect(client.getRequestDetail(BASE_DETAIL.request_id, VALID_HANDOFF)).rejects.toMatchObject({ code: 'expired', status: 410 })
    await expect(client.getRequestStatus(BASE_DETAIL.request_id, VALID_HANDOFF)).rejects.toMatchObject({ code: 'expired', status: 410 })
  })

  it('resume 幂等：第一次 approved，第二次 already_resumed，不产生第二份结果', async () => {
    const store = new Map([
      [BASE_DETAIL.request_id, makeStubRecord({ status: 'approved', resumeRedirectTo: 'https://course.example.com/cb' })],
    ])
    const client = createCoreStubClient(store)
    const first = await client.resumeRequest(BASE_DETAIL.request_id, VALID_HANDOFF)
    expect(first).toMatchObject({ status: 'approved', redirect_to: 'https://course.example.com/cb' })
    const second = await client.resumeRequest(BASE_DETAIL.request_id, VALID_HANDOFF)
    expect(second).toMatchObject({ status: 'already_resumed', redirect_to: 'https://course.example.com/cb' })
    expect(store.get(BASE_DETAIL.request_id)!.resumeCalls).toBe(2)
  })

  it('未 APPROVED 时 resume → 409 not_approved', async () => {
    const store = new Map([[BASE_DETAIL.request_id, makeStubRecord({ status: 'waiting_app' })]])
    const client = createCoreStubClient(store)
    await expect(client.resumeRequest(BASE_DETAIL.request_id, VALID_HANDOFF)).rejects.toMatchObject({
      code: 'not_approved',
      status: 409,
    })
  })

  it('clearStubStore 清空全局桩仓库', () => {
    clearStubStore()
    const client = createCoreStubClient(new Map())
    expect(client).toBeDefined()
  })
})
