/**
 * Core API 合同测试（issue #630，对齐 web/lib/core-client/contract.ts）。
 *
 * 端点：
 *   GET  /api/v1/requests/:id           → RequestDetailDTO（sanitized）
 *   GET  /api/v1/requests/:id/status    → RequestStatusDTO
 *   POST /api/v1/requests/:id/resume    → ResumeResultDTO（幂等）
 *
 * 覆盖：
 * - DTO 形状与 sanitized 约束（不泄露 handoff/challenge/code/内部字段）；
 * - 错误码矩阵：401 invalid_handoff / 404 not_found / 410 expired /
 *   409 not_approved / 422 client_unavailable / 400 invalid_request；
 * - resume 幂等（重复调用 already_resumed + 同一 redirect_to）；
 * - 响应/错误体不携带敏感值。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture } from '../helpers/fixtures.js'
import { TEST_HANDOFF_HMAC_KEY, TEST_SERVICE_TOKEN } from '../helpers/keys.js'
import { HANDOFF_HEADER } from '../../src/api/requests.js'
import {
  startE2E,
  beginAuthorize,
  parseInteractionTarget,
  approveAsDevice,
  resumeRequest,
  type E2EContext,
} from '../oidc/helpers/e2e.js'

const REDIRECT_URI = 'https://app.example.com/cb'

describe('Core API #630 合同（requests 端点）', () => {
  let db: TestDatabase
  let e2e: E2EContext | null = null

  beforeEach(async () => {
    db = await createTestDatabase()
    e2e = await startE2E(db)
  })
  afterEach(async () => {
    if (e2e) await e2e.close()
    await db.cleanup()
  })

  /** 发起 authorize 拿到 AuthRequest + handoff（模拟 Web 打开的输入） */
  async function createRequest(clientId: string, scope = 'openid profile') {
    const { pkcePair } = await import('../oidc/helpers/e2e.js')
    const pair = pkcePair()
    const auth = await beginAuthorize({
      baseUrl: e2e!.baseUrl,
      clientId,
      redirectUri: REDIRECT_URI,
      scope,
      state: 'st_api',
      nonce: 'no_api',
      codeChallenge: pair.codeChallenge,
      codeChallengeMethod: 'S256',
    })
    expect(auth.status).toBe(303)
    return parseInteractionTarget(auth.location!)
  }

  async function getDetail(requestId: string, handoff?: string) {
    const headers: Record<string, string> = {
      'x-identity-service-token': TEST_SERVICE_TOKEN,
    }
    if (handoff) headers[HANDOFF_HEADER] = handoff
    const res = await fetch(`${e2e!.baseUrl}/api/v1/requests/${requestId}`, { headers })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  async function getStatus(requestId: string, handoff: string) {
    const res = await fetch(`${e2e!.baseUrl}/api/v1/requests/${requestId}/status`, {
      headers: {
        [HANDOFF_HEADER]: handoff,
        'x-identity-service-token': TEST_SERVICE_TOKEN,
      },
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  it('GET /api/v1/requests/:id 返回 sanitized DTO（#630 字段形状）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile', 'student.identity'],
      status: 'active',
      redirectUris: [{ uri: REDIRECT_URI, kind: 'web_https' }],
    })
    const { requestId, handoffSecret } = await createRequest(
      fixture.clientId,
      'openid profile student.identity',
    )
    const { status, body } = await getDetail(requestId, handoffSecret)
    expect(status).toBe(200)
    // 顶层字段：request_id / expires_at / client / scopes
    expect(body.request_id).toBe(requestId)
    expect(typeof body.expires_at).toBe('string')
    expect(new Date(body.expires_at as string).getTime()).toBeGreaterThan(Date.now())
    expect(body.client).toMatchObject({
      name: '测试应用',
      developer_display_name: '测试开发者',
      review_status: 'active',
    })
    // homepage_host：fixture 未配置主页 → 空串；类型必须是 string（sanitized）
    expect(typeof (body.client as { homepage_host: unknown }).homepage_host).toBe('string')
    // scopes 数组：id/label/risk（risk 按敏感度）
    const scopes = body.scopes as Array<{ id: string; label: string; risk: string }>
    expect(scopes.map((s) => s.id)).toEqual(
      expect.arrayContaining(['openid', 'profile', 'student.identity']),
    )
    const studentIdentity = scopes.find((s) => s.id === 'student.identity')
    expect(studentIdentity?.risk).toBe('sensitive')
    expect(scopes.find((s) => s.id === 'openid')?.risk).toBe('basic')
    // sanitized：绝不返回 handoff/challenge/code/secret/学号等内部字段
    const raw = JSON.stringify(body)
    expect(raw).not.toContain(handoffSecret)
    expect(raw).not.toContain('handoff')
    expect(raw).not.toContain('server_challenge')
    expect(raw).not.toContain('code')
    expect(raw).not.toContain('client_secret')
    expect(raw).not.toContain('interaction_uid')
    expect(raw).not.toContain('scope_hash')
    expect(raw).not.toContain('student_id')
  })

  it('GET /api/v1/requests/:id 首次访问推进 CREATED → WAITING_APP（页面可见性）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { requestId, handoffSecret } = await createRequest(fixture.clientId)
    const before = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    expect(before.rows[0]?.status).toBe('CREATED')
    await getDetail(requestId, handoffSecret)
    const after = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    expect(after.rows[0]?.status).toBe('WAITING_APP')
  })

  it('GET /api/v1/requests/:id/status 返回最小状态（页面轮询）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { requestId, handoffSecret } = await createRequest(fixture.clientId)
    const before = await getStatus(requestId, handoffSecret!)
    expect(before.status).toBe(200)
    expect(before.body.request_id).toBe(requestId)
    expect(before.body.status).toBe('waiting_app') // CREATED→WAITING_APP 映射
    expect(typeof before.body.expires_at).toBe('string')

    await approveAsDevice(db, { requestId, userId: fixture.userId })
    const after = await getStatus(requestId, handoffSecret!)
    expect(after.body.status).toBe('approved')
  })

  it('POST /resume 幂等：重复调用返回 already_resumed + 同一 redirect_to', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { requestId, handoffSecret } = await createRequest(fixture.clientId)
    await approveAsDevice(db, { requestId, userId: fixture.userId })

    const first = await resumeRequest({
      baseUrl: e2e!.baseUrl, requestId, handoffSecret: handoffSecret!,
    })
    expect(first.status).toBe(200)
    expect(first.body.status).toBe('approved')
    expect(typeof first.body.redirect_to).toBe('string')

    // 第二次（幂等）：already_resumed + 同一 redirect_to，不产生第二份授权结果
    const second = await resumeRequest({
      baseUrl: e2e!.baseUrl, requestId, handoffSecret: handoffSecret!,
    })
    expect(second.status).toBe(200)
    expect(second.body.status).toBe('already_resumed')
    expect(second.body.redirect_to).toBe(first.body.redirect_to)

    // 只创建了一个 Grant（没有第二份授权结果）
    const grants = await db.sql.query("SELECT id FROM oidc_provider_records WHERE model_name = 'Grant'")
    expect(grants.rows).toHaveLength(1)
  })

  it('错误码矩阵：#630 合同错误（401/404/410/409/422/400）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { requestId, handoffSecret } = await createRequest(fixture.clientId)

    // 401：handoff 缺失或错误
    const noHandoff = await getDetail(requestId)
    expect(noHandoff.status).toBe(401)
    expect(noHandoff.body.error).toBe('invalid_handoff')
    const wrongHandoff = await getDetail(requestId, 'wrong-handoff-value')
    expect(wrongHandoff.status).toBe(401)
    expect(wrongHandoff.body.error).toBe('invalid_handoff')

    // 404：不存在的 request
    const missing = await getDetail('ar_nonexistent', handoffSecret)
    expect(missing.status).toBe(404)
    expect(missing.body.error).toBe('not_found')

    // 410：过期（懒迁移 EXPIRED；status 端点按 #630 错误码返回 410 + error）
    await db.sql.query(
      "UPDATE auth_requests SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
      [requestId],
    )
    const expired = await getDetail(requestId, handoffSecret)
    expect(expired.status).toBe(410)
    expect(expired.body.error).toBe('expired')
    const expiredStatus = await getStatus(requestId, handoffSecret!)
    expect(expiredStatus.status).toBe(410)
    expect(expiredStatus.body.error).toBe('expired')
    // 懒迁移生效：DB 状态已是 EXPIRED
    const migrated = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    expect(migrated.rows[0]?.status).toBe('EXPIRED')

    // 409：未批准 resume
    const { requestId: req2, handoffSecret: hs2 } = await createRequest(fixture.clientId)
    const notApproved = await resumeRequest({
      baseUrl: e2e!.baseUrl, requestId: req2, handoffSecret: hs2!,
    })
    expect(notApproved.status).toBe(409)
    expect(notApproved.body.error).toBe('not_approved')

    // 400：scope 快照 hash 被篡改（防御性校验；在 suspend 之前完成，client 仍 active）
    const { requestId: req4, handoffSecret: hs4 } = await createRequest(fixture.clientId)
    await approveAsDevice(db, { requestId: req4, userId: fixture.userId })
    await db.sql.query(
      "UPDATE auth_requests SET scope_hash = 'tampered-hash' WHERE id = $1",
      [req4],
    )
    const tampered = await resumeRequest({
      baseUrl: e2e!.baseUrl, requestId: req4, handoffSecret: hs4!,
    })
    expect(tampered.status).toBe(400)
    expect(tampered.body.error).toBe('invalid_request')

    // 422：client 不可用（suspended 后 resume；suspended 后也无法再发起授权）
    const { requestId: req3, handoffSecret: hs3 } = await createRequest(fixture.clientId)
    await approveAsDevice(db, { requestId: req3, userId: fixture.userId })
    const { setClientStatus } = await import('../../src/domain/clients.js')
    await setClientStatus(db.sql, fixture.clientId, 'suspended')
    const unavailable = await resumeRequest({
      baseUrl: e2e!.baseUrl, requestId: req3, handoffSecret: hs3!,
    })
    expect(unavailable.status).toBe(422)
    expect(unavailable.body.error).toBe('client_unavailable')
  })

  it('错误响应不泄露敏感值（handoff/内部字段/学号）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { requestId } = await createRequest(fixture.clientId)
    // 各种错误路径
    const responses = [
      await getDetail(requestId, 'leak-attempt-secret'),
      await getDetail('ar_nonexistent', 'leak-attempt-secret'),
      await resumeRequest({ baseUrl: e2e!.baseUrl, requestId: 'ar_nonexistent', handoffSecret: 'leak-attempt-secret' }),
    ]
    for (const r of responses) {
      const raw = JSON.stringify(r.body)
      expect(raw).not.toContain('leak-attempt-secret')
      expect(raw).not.toContain('handoff_secret_hash')
      expect(raw).not.toContain('server_challenge')
      expect(raw).not.toContain('client_secret')
      expect(raw).not.toContain('interaction_uid')
    }
    // handoff HMAC key 本身也不得出现在任何响应
    expect(JSON.stringify(responses)).not.toContain(TEST_HANDOFF_HMAC_KEY)
  })
})
