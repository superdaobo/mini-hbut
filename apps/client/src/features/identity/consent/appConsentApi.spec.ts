// src/features/identity/consent/appConsentApi.spec.ts
//
// Epic #1243（G3-03 / mini-hbut#1256）契约测试：逐类授权管理 API 客户端。
//
// 守的契约：
//   1. **双词汇表显式映射**：UI scope（`student.grades.read`）→ 服务端域（`grades`），
//      未知 scope 被丢弃（不猜、不隐式转换）；
//   2. **不抛异常**：网络/超时/非 2xx 一律转 `{ok:false, code}`；
//   3. **不猜成功**：只有 2xx 且 `success===true` 才算成功；
//   4. 撤销响应必须带 `identity_sso_unaffected`（学号 SSO 不受影响）；
//   5. 参数校验前置：空 app_id / 空 domains → 本地就拒绝（不发请求）。

import { describe, expect, it, vi } from 'vitest'

import type { ConsentTransportRequest } from './appConsentApi'
import {
  SCOPE_TO_CONSENT_DOMAIN,
  fetchAppConsents,
  grantAppConsents,
  revokeAppConsents,
  toConsentDomains
} from './appConsentApi'

const APP = 'fdl-forum'

const transportOf = (status: number, json: unknown) =>
  vi.fn(async (_request: ConsentTransportRequest) => ({ status, json }))

/** 取第一次请求（显式断言有调用，避免 TS 的 possibly-undefined）。 */
const firstRequest = (transport: ReturnType<typeof transportOf>): ConsentTransportRequest => {
  const calls = transport.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[0]![0]
}

describe('appConsentApi', () => {
  it('scope → 域映射是显式冻结表（未知 scope 被丢弃）', () => {
    expect(SCOPE_TO_CONSENT_DOMAIN['student.grades.read']).toBe('grades')
    expect(SCOPE_TO_CONSENT_DOMAIN['student.timetable.read']).toBe('schedule')
    expect(SCOPE_TO_CONSENT_DOMAIN['student.profile.read']).toBe('profile')
    expect(SCOPE_TO_CONSENT_DOMAIN['student.exams.read']).toBe('exams')
    expect(SCOPE_TO_CONSENT_DOMAIN['student.rank.read']).toBe('rank')
    // cloud_sync/forum/game 不在本端点范围
    expect(SCOPE_TO_CONSENT_DOMAIN['cloud_sync.read']).toBeUndefined()

    expect(
      toConsentDomains([
        'student.grades.read',
        'student.timetable.read',
        'student.grades.read',
        'unknown.scope',
        ''
      ])
    ).toEqual(['grades', 'schedule'])
  })

  it('fetch：成功 → 归一化逐域状态', async () => {
    const transport = transportOf(200, {
      success: true,
      policy_version: 3,
      domains: [
        { domain: 'grades', state: 'granted', consent_revision: 2 },
        { domain: 'schedule', state: 'revoked', consent_revision: 2 }
      ]
    })
    const snap = await fetchAppConsents(APP, { transport })
    expect(snap.ok).toBe(true)
    expect(snap.policyVersion).toBe(3)
    expect(snap.domains).toEqual([
      { domain: 'grades', state: 'granted', consentRevision: 2 },
      { domain: 'schedule', state: 'revoked', consentRevision: 2 }
    ])
    expect(transport).toHaveBeenCalledTimes(1)
    expect(firstRequest(transport).path).toContain('/identity/app-consents?app_id=fdl-forum')
  })

  it('fetch：401 → identity_required（不抛）', async () => {
    const snap = await fetchAppConsents(APP, { transport: transportOf(401, {}) })
    expect(snap).toEqual({ ok: false, code: 'identity_required', policyVersion: 0, domains: [] })
  })

  it('fetch：403 带 code → 用服务端机器码', async () => {
    const snap = await fetchAppConsents(APP, {
      transport: transportOf(403, { code: 'app_not_whitelisted' })
    })
    expect(snap.code).toBe('app_not_whitelisted')
  })

  it('fetch：网络异常 → service_unavailable（不抛）', async () => {
    const transport = vi.fn(async () => {
      throw new Error('network down')
    })
    const snap = await fetchAppConsents(APP, { transport })
    expect(snap.ok).toBe(false)
    expect(snap.code).toBe('service_unavailable')
  })

  it('fetch：200 但 success!=true → 不算成功（不猜）', async () => {
    const snap = await fetchAppConsents(APP, {
      transport: transportOf(200, { success: false, code: 'snapshot_missing' })
    })
    expect(snap.ok).toBe(false)
    expect(snap.code).toBe('snapshot_missing')
  })

  it('fetch：空 app_id → 本地拒绝，不发请求', async () => {
    const transport = vi.fn()
    const snap = await fetchAppConsents('   ', { transport })
    expect(snap.code).toBe('app_id_required')
    expect(transport).not.toHaveBeenCalled()
  })

  it('grant：成功 → 返回 granted + revision', async () => {
    const transport = transportOf(200, {
      success: true,
      granted: ['grades'],
      consent_revision: 5
    })
    const res = await grantAppConsents(APP, ['grades'], { transport })
    expect(res.ok).toBe(true)
    expect(res.granted).toEqual(['grades'])
    expect(res.consentRevision).toBe(5)
    const request = firstRequest(transport)
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({ app_id: APP, domains: ['grades'] })
  })

  it('grant：403 domain_not_allowed 原样透出（应用不能靠用户同意扩权）', async () => {
    const res = await grantAppConsents(APP, ['grades'], {
      transport: transportOf(403, { code: 'domain_not_allowed' })
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('domain_not_allowed')
  })

  it('grant：空 domains → 本地拒绝，不发请求', async () => {
    const transport = vi.fn()
    const res = await grantAppConsents(APP, [], { transport })
    expect(res.code).toBe('domains_required')
    expect(transport).not.toHaveBeenCalled()
  })

  it('revoke：all=true → 请求体带 all，响应带 identity_sso_unaffected', async () => {
    const transport = transportOf(200, {
      success: true,
      revoked: 2,
      identity_sso_unaffected: true
    })
    const res = await revokeAppConsents(APP, { all: true }, { transport })
    expect(res.ok).toBe(true)
    expect(res.revoked).toBe(2)
    expect(res.identitySsoUnaffected).toBe(true)
    expect(firstRequest(transport).body).toEqual({ app_id: APP, all: true })
  })

  it('revoke：指定域 → 请求体带 domains', async () => {
    const transport = transportOf(200, { success: true, revoked: 1, identity_sso_unaffected: true })
    await revokeAppConsents(APP, { domains: ['schedule'] }, { transport })
    expect(firstRequest(transport).body).toEqual({ app_id: APP, domains: ['schedule'] })
  })

  it('revoke：既没 all 也没 domains → 本地拒绝', async () => {
    const transport = vi.fn()
    const res = await revokeAppConsents(APP, {}, { transport })
    expect(res.code).toBe('domains_required')
    expect(transport).not.toHaveBeenCalled()
  })

  it('revoke：网络异常 → service_unavailable（不抛）', async () => {
    const transport = vi.fn(async () => {
      throw new Error('boom')
    })
    const res = await revokeAppConsents(APP, { all: true }, { transport })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('service_unavailable')
  })

  it('baseUrl 生效（拼接前缀，不重复斜杠）', async () => {
    const transport = transportOf(200, { success: true, domains: [] })
    await fetchAppConsents(APP, { transport, baseUrl: 'https://api.example.com/' })
    expect(firstRequest(transport).path).toBe(
      'https://api.example.com/identity/app-consents?app_id=fdl-forum'
    )
  })
})
