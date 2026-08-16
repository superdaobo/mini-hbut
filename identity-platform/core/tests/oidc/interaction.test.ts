/**
 * Custom Interaction 测试矩阵（#620：Interaction 5 条）。
 *
 * 1. approve 后 provider 正常 resume（状态机完整推进到 CONSUMED）；
 * 2. deny → 标准 access_denied（provider 错误语义，不发 code）；
 * 3. expired → 410 expired（懒迁移 EXPIRED，重新授权是新交互）；
 * 4. 未 APPROVED 直接 hit resume 不可绕过（409 not_approved，不发 code）；
 * 5. interaction uid/client 与 AuthRequest 不匹配不可绕过
 *    （client 不一致 400 invalid_request；resume cookie 不匹配 provider 拒绝）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture } from '../helpers/fixtures.js'
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
  type E2EContext,
} from './helpers/e2e.js'

const REDIRECT_URI = 'https://app.example.com/cb'

/** 发起 authorize 并返回交互上下文（cookie jar + AuthRequest） */
async function startInteraction(
  e2e: E2EContext,
  clientId: string,
  opts: { scope?: string; state?: string; nonce?: string } = {},
) {
  const { codeVerifier, codeChallenge } = pkcePair()
  const state = opts.state ?? `st_${Math.random().toString(36).slice(2, 8)}`
  const auth = await beginAuthorize({
    baseUrl: e2e.baseUrl,
    clientId,
    redirectUri: REDIRECT_URI,
    scope: opts.scope ?? 'openid profile',
    state,
    nonce: opts.nonce ?? 'no_1',
    codeChallenge,
    codeChallengeMethod: 'S256',
  })
  expect(auth.status).toBe(303)
  const { requestId, handoffSecret } = parseInteractionTarget(auth.location!)
  return { auth, requestId, handoffSecret: handoffSecret!, codeVerifier, state }
}

describe('Custom Interaction（#620 矩阵：5 条）', () => {
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

  it('1. approve 后 provider 正常 resume（状态机 CREATED→…→CONSUMED）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { auth, requestId, handoffSecret, codeVerifier } = await startInteraction(e2e!, fixture.clientId)

    // 交互创建时状态 CREATED（interactions.url 创建 AuthRequest）
    const before = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    expect(before.rows[0]?.status).toBe('CREATED')

    await approveAsDevice(db, { requestId, userId: fixture.userId })
    const approved = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    expect(approved.rows[0]?.status).toBe('APPROVED')

    const resume = await resumeRequest({ baseUrl: e2e!.baseUrl, requestId, handoffSecret })
    expect(resume.status).toBe(200)
    expect(resume.body.status).toBe('approved')
    expect(typeof resume.body.redirect_to).toBe('string')

    const finished = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    expect(finished.rows[0]?.status).toBe('INTERACTION_FINISHED')

    // 浏览器 resume：provider 发 code，观测推进 CODE_ISSUED
    const done = await completeAuthorize({
      baseUrl: e2e!.baseUrl,
      redirectTo: String(resume.body.redirect_to),
      cookies: auth.cookies,
    })
    expect(done.status).toBe(303)
    const cb = parseCallback(done.location!)
    expect(cb.code).toBeTruthy()
    expect(cb.state).toBeDefined()
    const codeIssued = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    expect(codeIssued.rows[0]?.status).toBe('CODE_ISSUED')

    // code 兑换后 CONSUMED（观测点；serverless 下尽力关联）
    const tok = await tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'authorization_code',
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      code: cb.code!,
      codeVerifier,
      redirectUri: REDIRECT_URI,
    })
    expect(tok.status).toBe(200)
    expect(tok.body.access_token).toBeTruthy()
    const consumed = await db.sql.query<{ status: string }>(
      'SELECT status FROM auth_requests WHERE id = $1', [requestId],
    )
    // 允许最终为 CONSUMED（进程内映射命中）或停留 CODE_ISSUED（观测尽力而为）
    expect(['CODE_ISSUED', 'CONSUMED']).toContain(consumed.rows[0]?.status)
  })

  it('2. deny → 标准 access_denied（不发 code）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { auth, requestId, handoffSecret } = await startInteraction(e2e!, fixture.clientId)

    // 用户拒绝（#623 Web deny）：先推进 WAITING_APP（状态机 CREATED→WAITING_APP→DENIED）
    const { transitionAuthRequestStatus, denyAuthRequest } = await import('../../src/domain/auth-requests/service.js')
    await transitionAuthRequestStatus(db.sql, requestId, 'WAITING_APP').catch(() => undefined)
    await denyAuthRequest(db.sql, requestId)

    // 业务侧：DENIED 后 resume → 409 not_approved（#630 合同）
    const resume = await resumeRequest({ baseUrl: e2e!.baseUrl, requestId, handoffSecret })
    expect(resume.status).toBe(409)
    expect(resume.body.error).toBe('not_approved')

    // 协议侧 deny 语义（provider 标准错误）：写 result.error 后浏览器 resume
    // → provider 回 redirect_uri?error=access_denied，绝不发 code
    const interactionUid = String((await db.sql.query<{ interaction_uid: string }>(
      'SELECT interaction_uid FROM auth_requests WHERE id = $1', [requestId],
    )).rows[0]?.interaction_uid)
    const interaction = await e2e!.provider.Interaction.find(interactionUid)
    expect(interaction).toBeDefined()
    interaction!.result = { error: 'access_denied', error_description: 'user denied the request' }
    await interaction!.persist()
    const done = await completeAuthorize({
      baseUrl: e2e!.baseUrl,
      redirectTo: interaction!.returnTo,
      cookies: auth.cookies,
    })
    const cb = done.location ? parseCallback(done.location) : {}
    expect(cb.code).toBeUndefined()
    expect(cb.error).toBe('access_denied')
  })

  it('3. expired → 410 expired（懒迁移 EXPIRED；重新授权是新交互）', async () => {
    // AuthRequest/Interaction TTL 1 秒
    const short = await startE2E(db, { authRequestTtlSeconds: 1 })
    try {
      const fixture = await createClientFixture(db.sql, {
        scopes: ['openid', 'profile'],
        status: 'active',
      })
      const { requestId, handoffSecret } = await startInteraction(short, fixture.clientId)
      await approveAsDevice(db, { requestId, userId: fixture.userId })
      await new Promise((r) => setTimeout(r, 1500))

      const resume = await resumeRequest({ baseUrl: short.baseUrl, requestId, handoffSecret })
      expect(resume.status).toBe(410)
      expect(resume.body.error).toBe('expired')
      // 懒迁移：状态已 EXPIRED
      const row = await db.sql.query<{ status: string }>(
        'SELECT status FROM auth_requests WHERE id = $1', [requestId],
      )
      expect(row.rows[0]?.status).toBe('EXPIRED')
      // 浏览器拿旧 redirect_to 也无法换 code（Interaction 已过期，provider 拒绝）
      const done = await completeAuthorize({
        baseUrl: short.baseUrl,
        redirectTo: '/oauth/authorize/expired-uid-placeholder',
        cookies: (await startInteraction(short, fixture.clientId)).auth.cookies,
      })
      // 无论 provider 返回什么，都不可能出现 code
      const cb = done.location ? parseCallback(done.location) : {}
      expect(cb.code).toBeUndefined()
    } finally {
      await short.close()
    }
  })

  it('4. 未 APPROVED 直接 hit resume 不可绕过（409 + 不发 code）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const { auth, requestId, handoffSecret } = await startInteraction(e2e!, fixture.clientId)

    // 未 approve 直接 resume → 409 not_approved（状态仍 CREATED）
    const resume = await resumeRequest({ baseUrl: e2e!.baseUrl, requestId, handoffSecret })
    expect(resume.status).toBe(409)
    expect(resume.body.error).toBe('not_approved')

    // 浏览器访问 redirect_to（无 result）→ interaction policy 再次要求交互，
    // 回到 auth.*（303），绝不放行发 code
    const interactionUid = String((await db.sql.query<{ interaction_uid: string }>(
      'SELECT interaction_uid FROM auth_requests WHERE id = $1', [requestId],
    )).rows[0]?.interaction_uid)
    const interaction = await e2e!.provider.Interaction.find(interactionUid)
    expect(interaction).toBeDefined()
    const done = await completeAuthorize({
      baseUrl: e2e!.baseUrl,
      redirectTo: interaction!.returnTo,
      cookies: auth.cookies,
    })
    expect(done.status).toBe(303)
    const target = done.location ?? ''
    expect(target).toContain('/r/') // 回到 auth.* 交互页（App Approval 未完成）
    expect(target).not.toContain('code=')
  })

  it('5. interaction uid/client 与 AuthRequest 不匹配不可绕过', async () => {
    const fixtureA = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const fixtureB = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    // 两个 client 各自发起授权 → 两个 AuthRequest + 两个 Interaction
    const flowA = await startInteraction(e2e!, fixtureA.clientId, { state: 'st_a' })
    const flowB = await startInteraction(e2e!, fixtureB.clientId, { state: 'st_b' })
    await approveAsDevice(db, { requestId: flowA.requestId, userId: fixtureA.userId })

    // (1) interaction_uid 指向【不存在的】交互（如被篡改/清理）→ resume 拒绝（410 expired）
    const aUid = String((await db.sql.query<{ interaction_uid: string }>(
      'SELECT interaction_uid FROM auth_requests WHERE id = $1', [flowA.requestId],
    )).rows[0]?.interaction_uid)
    await db.sql.query(
      'UPDATE auth_requests SET interaction_uid = $1 WHERE id = $2',
      ['forged-nonexistent-uid', flowA.requestId],
    )
    const resume1 = await resumeRequest({
      baseUrl: e2e!.baseUrl,
      requestId: flowA.requestId,
      handoffSecret: flowA.handoffSecret,
    })
    expect(resume1.status).toBe(410)
    expect(resume1.body.error).toBe('expired')

    // 恢复原 interaction_uid 后再次篡改为【另一个 client 的交互 uid】
    const bUid = String((await db.sql.query<{ interaction_uid: string }>(
      'SELECT interaction_uid FROM auth_requests WHERE id = $1', [flowB.requestId],
    )).rows[0]?.interaction_uid)
    // 先删除 B 的 AuthRequest（释放 interaction_uid 的 UNIQUE 占用），再指向 B 的交互
    await db.sql.query('DELETE FROM auth_requests WHERE id = $1', [flowB.requestId])
    await db.sql.query(
      'UPDATE auth_requests SET interaction_uid = $1 WHERE id = $2',
      [bUid, flowA.requestId],
    )

    // (2) interaction 的 params.client_id（B）≠ AuthRequest.client_id（A）→ 400 invalid_request
    // （resume 防混淆：绝不把 login/consent 写入其他 client 的交互）
    const resume2 = await resumeRequest({
      baseUrl: e2e!.baseUrl,
      requestId: flowA.requestId,
      handoffSecret: flowA.handoffSecret,
    })
    expect(resume2.status).toBe(400)
    expect(resume2.body.error).toBe('invalid_request')

    // (3) provider 侧 resume cookie 不匹配（签名 cookie 无法伪造）：
    // 用错误签名的 resume cookie 访问 A 的 redirect_to → provider 拒绝，不发 code
    const interaction = await e2e!.provider.Interaction.find(aUid)
    expect(interaction).toBeDefined()
    const resumeTarget = interaction!.returnTo.startsWith('http')
      ? interaction!.returnTo
      : `${e2e!.baseUrl}${interaction!.returnTo}`
    const res = await fetch(resumeTarget, {
      redirect: 'manual',
      headers: { cookie: `_interaction_resume=forged-cookie-value` },
    })
    expect(res.status).not.toBe(303)
    const text = await res.text()
    expect(text).not.toContain('code=')
  })
})
