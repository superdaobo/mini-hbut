/**
 * Authorization Code + PKCE 测试矩阵（#620：AuthCode 8 条）。
 *
 * 1. Web confidential happy path；
 * 2. Native public + S256 happy path；
 * 3. wrong verifier；
 * 4. missing PKCE public client；
 * 5. code replay；
 * 6. code/client mismatch；
 * 7. code/redirect mismatch；
 * 8. expired code。
 *
 * 另含 #620 要求的恶意 redirect_uri 负向测试（精确匹配，拒绝宽匹配）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture } from '../helpers/fixtures.js'
import { TEST_KEK } from '../helpers/keys.js'
import {
  startE2E,
  beginAuthorize,
  parseInteractionTarget,
  approveAsDevice,
  resumeRequest,
  completeAuthorize,
  parseCallback,
  tokenRequest,
  pkcePair,
  fullAuthorizationFlow,
  type E2EContext,
} from './helpers/e2e.js'

const REDIRECT_URI = 'https://app.example.com/cb'
const LOOPBACK_URI = 'http://127.0.0.1:9999/cb'
const SCOPE = 'openid profile'

describe('Authorization Code + PKCE（#620 矩阵：8 条）', () => {
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

  it('1. Web confidential happy path：完整流程签发 tokens', async () => {
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
      scope: SCOPE,
      userId: fixture.userId,
    })
    expect(flow.accessToken).toBeTruthy()
    expect(flow.idToken).toBeTruthy()
    // refresh_token：请求 scope 不含 offline_access → 不应发放（#620 条件发放）
    expect(flow.refreshToken).toBeUndefined()
  })

  it('2. Native public + S256 happy path（无 client_secret，client_id 在 body）', async () => {
    const fixture = await createClientFixture(db.sql, {
      clientType: 'native_public',
      scopes: ['openid', 'profile'],
      status: 'active',
      redirectUris: [{ uri: LOOPBACK_URI, kind: 'native_loopback' }],
    })
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: fixture.clientId,
      redirectUri: LOOPBACK_URI,
      scope: SCOPE,
      userId: fixture.userId,
    })
    expect(flow.accessToken).toBeTruthy()
    expect(flow.idToken).toBeTruthy()
    // public client 不允许带 secret 认证：Bearer 之外的 client_secret_basic 应失败
    const result = await tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'authorization_code',
      clientId: fixture.clientId,
      clientSecret: 'attacker-guessed-secret',
      code: flow.code,
      codeVerifier: flow.codeVerifier,
      redirectUri: LOOPBACK_URI,
    })
    expect(result.status).toBe(401)
    expect(result.body.error).toBe('invalid_client')
  })

  it('3. wrong verifier → 400 invalid_grant', async () => {
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
      scope: SCOPE,
      userId: fixture.userId,
    })
    const wrong = pkcePair().codeVerifier
    const result = await tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'authorization_code',
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      code: flow.code,
      codeVerifier: wrong,
      redirectUri: REDIRECT_URI,
    })
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('invalid_grant')
  })

  it('4. missing PKCE public client → invalid_request（PKCE 强制，授权前拒绝）', async () => {
    const fixture = await createClientFixture(db.sql, {
      clientType: 'native_public',
      scopes: ['openid', 'profile'],
      status: 'active',
      redirectUris: [{ uri: LOOPBACK_URI, kind: 'native_loopback' }],
    })
    // 不带 code_challenge 的 authorize：pkce.required 恒 true → 进入交互前直接
    // 拒绝，303 到【已注册】redirect_uri 携带标准 error=invalid_request（#620）
    const auth = await beginAuthorize({
      baseUrl: e2e!.baseUrl,
      clientId: fixture.clientId,
      redirectUri: LOOPBACK_URI,
      scope: SCOPE,
      state: 'st_no_pkce',
    })
    expect(auth.status).toBe(303)
    const cb = parseCallback(auth.location!)
    expect(cb.code).toBeUndefined()
    expect(cb.error).toBe('invalid_request')
    expect(cb.state).toBe('st_no_pkce')
    // 错误回传的必须是已注册的 redirect_uri（不允许发往任意 URL）
    expect(new URL(auth.location!).origin + new URL(auth.location!).pathname)
      .toBe(LOOPBACK_URI)
    // 未进入 App Approval：没有创建 AuthRequest（interaction 未开始）
    const rows = await db.sql.query('SELECT id FROM auth_requests')
    expect(rows.rows).toHaveLength(0)
  })

  it('5. code replay：同一 code 二次兑换 → invalid_grant', async () => {
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
      scope: SCOPE,
      userId: fixture.userId,
    })
    const replay = await tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'authorization_code',
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      code: flow.code,
      codeVerifier: flow.codeVerifier,
      redirectUri: REDIRECT_URI,
    })
    expect(replay.status).toBe(400)
    expect(replay.body.error).toBe('invalid_grant')
  })

  it('6. code/client mismatch：A 的 code 用 B 的凭据兑换 → invalid_grant', async () => {
    const fixtureA = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const fixtureB = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: fixtureA.clientId,
      clientSecret: fixtureA.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: SCOPE,
      userId: fixtureA.userId,
    })
    const result = await tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'authorization_code',
      clientId: fixtureB.clientId,
      clientSecret: fixtureB.clientSecret ?? undefined,
      code: flow.code,
      codeVerifier: flow.codeVerifier,
      redirectUri: REDIRECT_URI,
    })
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('invalid_grant')
  })

  it('7. code/redirect mismatch：兑换时 redirect_uri 不同 → invalid_grant', async () => {
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
      scope: SCOPE,
      userId: fixture.userId,
    })
    const result = await tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'authorization_code',
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      code: flow.code,
      codeVerifier: flow.codeVerifier,
      redirectUri: 'https://evil.example.com/cb',
    })
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('invalid_grant')
  })

  it('8. expired code → invalid_grant', async () => {
    // code TTL 1 秒；签发后等待过期再兑换
    const expired = await startE2E(db, { codeTtlSeconds: 1 })
    try {
      const fixture = await createClientFixture(db.sql, {
        scopes: ['openid', 'profile'],
        status: 'active',
      })
      const { codeVerifier, codeChallenge } = pkcePair()
      const auth = await beginAuthorize({
        baseUrl: expired.baseUrl,
        clientId: fixture.clientId,
        redirectUri: REDIRECT_URI,
        scope: SCOPE,
        state: 'st_expired',
        nonce: 'no_expired',
        codeChallenge,
        codeChallengeMethod: 'S256',
      })
      expect(auth.status).toBe(303)
      const { requestId, handoffSecret } = parseInteractionTarget(auth.location!)
      await approveAsDevice(db, { requestId, userId: fixture.userId })
      const resume = await resumeRequest({
        baseUrl: expired.baseUrl,
        requestId,
        handoffSecret: handoffSecret!,
      })
      const done = await completeAuthorize({
        baseUrl: expired.baseUrl,
        redirectTo: String(resume.body.redirect_to),
        cookies: auth.cookies,
      })
      const cb = parseCallback(done.location!)
      expect(cb.code).toBeTruthy()
      await new Promise((r) => setTimeout(r, 1500))
      const result = await tokenRequest({
        baseUrl: expired.baseUrl,
        grantType: 'authorization_code',
        clientId: fixture.clientId,
        clientSecret: fixture.clientSecret ?? undefined,
        code: cb.code!,
        codeVerifier,
        redirectUri: REDIRECT_URI,
      })
      expect(result.status).toBe(400)
      expect(result.body.error).toBe('invalid_grant')
    } finally {
      await expired.close()
    }
  })

  it('负向：恶意 redirect_uri 一律拒绝（不重定向，错误不发往未注册 URI）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const malicious = [
      'https://app.example.com.evil.test/cb', // 后缀域混淆
      'https://app.example.com/cb/extra',     // 路径后缀宽匹配
      'https://evil.test/?next=https://app.example.com/cb', // query 注入
      'https://app.example.com@evil.test/cb', // userinfo@host 混淆
      'https://app.example.com/cb%2F..%2F..%2Fevil', // encoded path 变体
    ]
    for (const uri of malicious) {
      const auth = await beginAuthorize({
        baseUrl: e2e!.baseUrl,
        clientId: fixture.clientId,
        redirectUri: uri,
        scope: SCOPE,
        state: 'st_evil',
      })
      // 拒绝时不重定向到恶意 URI：400 + 无 Location（或 Location 不指向恶意 URI）
      expect(auth.status, uri).toBe(400)
      const location = auth.location
      if (location) {
        expect(location, uri).not.toContain('code=')
        expect(location, uri).not.toContain(encodeURIComponent(uri))
      }
    }
  })
})
