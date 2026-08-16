/**
 * Admin HTTP 客户端测试（issue #625，BFF → Core 契约）：
 * - 身份/认证时间经专用 header 传递（x-admin-subject / x-admin-auth-time）；
 * - 错误码白名单映射（含 step_up_required / revision_mismatch）；
 * - 未知错误码 → internal（不向客户端回显）；
 * - 桩模式开关。
 */
import { describe, expect, it, vi } from 'vitest'
import { createAdminApiHttpClient, isAdminStubMode, ADMIN_SUBJECT_HEADER, ADMIN_AUTH_TIME_HEADER } from '../lib/admin/client'
import { AdminApiError } from '../lib/admin/contract'

const BASE = 'https://core.example.com'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('#625 admin HTTP client（BFF → Core）', () => {
  it('GET 请求带 x-admin-subject；mutation 带 auth-time', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { sub: 'usr_a', roles: ['identity_admin'] }))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { review: { status: 'approved' } }))

    const client = createAdminApiHttpClient(BASE, fetchMock)
    const me = await client.me('usr_a')
    expect(me.roles).toEqual(['identity_admin'])
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ [ADMIN_SUBJECT_HEADER]: 'usr_a' })

    await client.approveReview('usr_a', 'app_1', 'rev_1', { scope_decisions: [{ scope: 'openid', decision: 'approved' }] }, 1234567890)
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>
    expect(secondHeaders[ADMIN_SUBJECT_HEADER]).toBe('usr_a')
    expect(secondHeaders[ADMIN_AUTH_TIME_HEADER]).toBe('1234567890')
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"scope_decisions"')
  })

  it('错误映射：401/403/404/409/step_up/revision 白名单；未知 → internal', async () => {
    const cases: Array<[number, string, AdminApiError['code']]> = [
      [401, 'unauthorized', 'unauthorized'],
      [403, 'forbidden', 'forbidden'],
      [403, 'step_up_required', 'step_up_required'],
      [404, 'not_found', 'not_found'],
      [400, 'invalid_request', 'invalid_request'],
      [409, 'invalid_state', 'invalid_state'],
      [409, 'revision_mismatch', 'revision_mismatch'],
      [500, 'weird_code', 'internal'],
      [502, 'internal', 'internal'],
    ]
    for (const [status, errorCode, expected] of cases) {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(status, { error: errorCode }))
      const client = createAdminApiHttpClient(BASE, fetchMock)
      await expect(client.me('usr_a')).rejects.toMatchObject({ status, code: expected })
    }
  })

  it('非 JSON 错误体 → internal（不回显细节）', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const client = createAdminApiHttpClient(BASE, fetchMock)
    await expect(client.me('usr_a')).rejects.toMatchObject({ status: 500, code: 'internal' })
  })

  it('step_up_required 携带 message（前端提示用）', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(403, { error: 'step_up_required', message: '需要 10 分钟内的重新认证' }))
    const client = createAdminApiHttpClient(BASE, fetchMock)
    let err: AdminApiError | null = null
    try {
      await client.suspendClient('usr_a', 'app_1', 'x', 1)
    } catch (e) {
      err = e as AdminApiError
    }
    expect(err?.code).toBe('step_up_required')
    expect(err?.message).toContain('重新认证')
  })

  it('桩模式开关与 Core 基址', () => {
    expect(isAdminStubMode({ IDENTITY_CORE_STUB: '1' })).toBe(true)
    expect(isAdminStubMode({ IDENTITY_OIDC_STUB: '1' })).toBe(true)
    expect(isAdminStubMode({})).toBe(false)
  })
})
