/**
 * OIDC 测试矩阵（#620：OIDC 6 条）。
 *
 * 1. ID Token iss/aud/exp/sub（含 auth_time/amr 认证上下文）；
 * 2. JWKS 能验证签名（RS256，node:crypto 手写验签）；
 * 3. pairwise sub（同 client 稳定、跨 client 不同、绝不等于学号/内部 user id）；
 * 4. UserInfo scope 过滤（只请求 profile 不返回 student.identity 字段）；
 * 5. 无 student.identity 时绝不返回学号；
 * 6. student.identity 返回 verification_method=mini_hbut_app（不伪装 official）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture } from '../helpers/fixtures.js'
import {
  startE2E,
  fullAuthorizationFlow,
  fetchJwks,
  jwtDecode,
  verifyJwtSignature,
  userinfoRequest,
  type E2EContext,
} from './helpers/e2e.js'

const REDIRECT_URI = 'https://app.example.com/cb'

describe('OIDC Claims / ID Token / UserInfo（#620 矩阵：6 条）', () => {
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

  it('1. ID Token 含 iss/aud/exp/sub（+ auth_time/amr 认证上下文）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: 'openid profile',
      userId: fixture.userId,
    })
    const { payload } = jwtDecode(flow.idToken)
    expect(payload.iss).toBe('https://id.example.test')
    expect(payload.aud).toContain(fixture.clientId)
    expect(typeof payload.exp).toBe('number')
    expect(typeof payload.iat).toBe('number')
    expect(payload.exp).toBeGreaterThan(payload.iat as number)
    expect(typeof payload.sub).toBe('string')
    expect(payload.sub).toBeTruthy()
    // #620 推荐认证上下文：amr + auth_time（App Approval 完成时间）
    expect(payload.amr).toContain('mini_hbut_app')
    expect(payload.amr).toContain('device_key')
    expect(typeof payload.auth_time).toBe('number')
    // nonce 原样回传（防重放）
    expect(payload.nonce).toBeTruthy()
    // profile scope：ID Token 最小化——不携带学号类 claim（#617 信任边界 10）
    expect(payload.hbut_student_id).toBeUndefined()
  })

  it('2. JWKS 能验证 ID Token 签名（RS256）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: 'openid profile',
      userId: fixture.userId,
    })
    const jwks = await fetchJwks(e2e!.baseUrl)
    expect(jwks.keys.length).toBeGreaterThan(0)
    // 公钥集不允许出现私钥参数（#620：/oauth/jwks 只发布 public keys）
    for (const key of jwks.keys) {
      expect(key.d).toBeUndefined()
      expect(key.p).toBeUndefined()
      expect(key.q).toBeUndefined()
      expect(key.dp).toBeUndefined()
      expect(key.dq).toBeUndefined()
      expect(key.qi).toBeUndefined()
    }
    const { header } = jwtDecode(flow.idToken)
    expect(header.alg).toBe('RS256')
    const verified = await verifyJwtSignature(flow.idToken, jwks as never)
    expect(verified.ok).toBe(true)
    expect(verified.kid).toBeTruthy()
    // 篡改 payload 后验签必须失败
    const [h, , s] = flow.idToken.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...jwtDecode(flow.idToken).payload, sub: 'forged' }),
    ).toString('base64url')
    const forged = await verifyJwtSignature(`${h}.${forgedPayload}.${s}`, jwks as never)
    expect(forged.ok).toBe(false)
  })

  it('3. pairwise sub：同 client 稳定、跨 client 不同、绝不等于学号或内部 user id', async () => {
    const fixtureA = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const fixtureB = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
      // v9 pairwise sector 默认取 redirect_uri 的 host（RFC 标准行为）：
      // 不同 host = 不同 sector = 不同 sub（跨应用隔离）
      redirectUris: [{ uri: 'https://app-b.example.com/cb', kind: 'web_https' }],
    })
    // 同一用户、同一 client 授权两次 → 同一 sub（确定性派生）
    const flowA1 = await fullAuthorizationFlow({
      db, baseUrl: e2e!.baseUrl, clientId: fixtureA.clientId,
      clientSecret: fixtureA.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI, scope: 'openid profile', userId: fixtureA.userId,
    })
    const flowA2 = await fullAuthorizationFlow({
      db, baseUrl: e2e!.baseUrl, clientId: fixtureA.clientId,
      clientSecret: fixtureA.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI, scope: 'openid profile', userId: fixtureA.userId,
    })
    const subA1 = jwtDecode(flowA1.idToken).payload.sub
    const subA2 = jwtDecode(flowA2.idToken).payload.sub
    expect(subA1).toBe(subA2)

    // 同一用户、不同 client（不同 redirect host = 不同 sector）→ 不同 sub
    const flowB = await fullAuthorizationFlow({
      db, baseUrl: e2e!.baseUrl, clientId: fixtureB.clientId,
      clientSecret: fixtureB.clientSecret ?? undefined,
      redirectUri: 'https://app-b.example.com/cb',
      scope: 'openid profile', userId: fixtureA.userId,
    })
    const subB = jwtDecode(flowB.idToken).payload.sub
    expect(subB).not.toBe(subA1)

    // sub 绝不等于学号（user 表里存的 student_id）或内部 user id
    const userRow = await db.sql.query<{ id: string }>('SELECT id FROM users WHERE id = $1', [fixtureA.userId])
    expect(userRow.rows).toHaveLength(1)
    expect(subA1).not.toBe(fixtureA.userId)
    expect(String(subA1)).not.toContain(fixtureA.userId)
    const identity = await db.sql.query<{ subject: string }>(
      'SELECT subject FROM linked_identities WHERE user_id = $1', [fixtureA.userId],
    )
    expect(String(subA1)).not.toBe(identity.rows[0]?.subject)
    expect(String(subA1)).not.toContain(identity.rows[0]?.subject ?? '')
  })

  it('4. UserInfo scope 过滤：只请求 profile → 不返回 student.identity 字段', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const flow = await fullAuthorizationFlow({
      db, baseUrl: e2e!.baseUrl, clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI, scope: 'openid profile', userId: fixture.userId,
    })
    const ui = await userinfoRequest({ baseUrl: e2e!.baseUrl, accessToken: flow.accessToken })
    expect(ui.status).toBe(200)
    expect(ui.body.sub).toBe(jwtDecode(flow.idToken).payload.sub)
    // profile scope：显示名
    expect(ui.body.name).toBe('测试学生')
    expect(ui.body.preferred_username).toBe('测试学生')
    // 未授予 student.identity：学号/验证方式绝不返回
    expect(ui.body.hbut_student_id).toBeUndefined()
    expect(ui.body.hbut_verification_method).toBeUndefined()
    expect(ui.body.hbut_verified_at).toBeUndefined()
  })

  it('5. 无 student.identity 时绝不返回学号（含 ID Token 与 UserInfo）', async () => {
    // client 只批 openid：连 profile 都没有
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid'],
      status: 'active',
    })
    const flow = await fullAuthorizationFlow({
      db, baseUrl: e2e!.baseUrl, clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI, scope: 'openid', userId: fixture.userId,
    })
    const { payload } = jwtDecode(flow.idToken)
    expect(payload.sub).toBeTruthy()
    expect(payload.hbut_student_id).toBeUndefined()
    expect(payload.name).toBeUndefined()
    const ui = await userinfoRequest({ baseUrl: e2e!.baseUrl, accessToken: flow.accessToken })
    expect(ui.status).toBe(200)
    const raw = JSON.stringify(ui.body)
    expect(raw).not.toContain('hbut_student_id')
    expect(raw).not.toContain('hbut_verification_method')
    // 学号（fixture 随机生成，从 DB 取实际值）不得出现在任何响应字段
    const identity = await db.sql.query<{ subject: string }>(
      'SELECT subject FROM linked_identities WHERE user_id = $1', [fixture.userId],
    )
    const studentId = identity.rows[0]?.subject
    expect(raw).not.toContain(studentId)
    // sub 本身也不得等于学号
    expect(String(payload.sub)).not.toBe(studentId)
  })

  it('6. student.identity 返回 verification_method=mini_hbut_app（不伪装 official）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile', 'student.identity'],
      status: 'active',
    })
    const flow = await fullAuthorizationFlow({
      db, baseUrl: e2e!.baseUrl, clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: 'openid profile student.identity', userId: fixture.userId,
    })
    const ui = await userinfoRequest({ baseUrl: e2e!.baseUrl, accessToken: flow.accessToken })
    expect(ui.status).toBe(200)
    const identity = await db.sql.query<{ subject: string }>(
      'SELECT subject FROM linked_identities WHERE user_id = $1', [fixture.userId],
    )
    expect(ui.body.hbut_student_id).toBe(identity.rows[0]?.subject)
    expect(ui.body.hbut_student_name).toBe('测试学生')
    expect(ui.body.hbut_verification_method).toBe('mini_hbut_app')
    expect(typeof ui.body.hbut_verified_at).toBe('string')
    // 绝不把 App 验证包装成官方验证
    expect(ui.body.hbut_verification_method).not.toBe('official')
    // 学号类敏感 claim 不出现在 ID Token（只走 UserInfo，#617 边界 10）
    const { payload } = jwtDecode(flow.idToken)
    expect(payload.hbut_student_id).toBeUndefined()
    expect(payload.hbut_student_name).toBeUndefined()
    expect(payload.hbut_verification_method).toBeUndefined()
  })
})
