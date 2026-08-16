/**
 * Refresh Token / Revocation 测试矩阵（#620：Refresh/Revoke 4 条）。
 *
 * 1. rotation：refresh 后旧 token 失效、新 token 替换；
 * 2. old refresh replay → 预期 revoke（整链撤销，新旧 refresh 全部失效）；
 * 3. explicit revoke（POST /oauth/revoke）→ refresh 立即失效；
 * 4. suspended client 无法继续 refresh（动态加载拒绝 invalid_client）。
 *
 * 前提：#620 规定 refresh_token 只在 offline_access 被批准且本次授权请求
 * 含 offline_access 时发放（happy path 断言由 authcode 矩阵覆盖）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture } from '../helpers/fixtures.js'
import {
  startE2E,
  fullAuthorizationFlow,
  tokenRequest,
  revokeToken,
  type E2EContext,
} from './helpers/e2e.js'

const REDIRECT_URI = 'https://app.example.com/cb'
const SCOPE = 'openid profile offline_access'

describe('Refresh Token / Revocation（#620 矩阵：4 条）', () => {
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

  /** 授权并拿到 refresh_token（offline_access） */
  async function grantRefresh(clientId: string, clientSecret?: string) {
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId,
      clientSecret,
      redirectUri: REDIRECT_URI,
      scope: SCOPE,
      userId: (await db.sql.query<{ user_id: string }>(
        'SELECT u.id AS user_id FROM users u JOIN linked_identities li ON li.user_id = u.id LIMIT 1',
      )).rows[0]!.user_id,
      // OIDC Core：offline_access 必须伴随 prompt=consent（v9 强制，否则静默移除）；
      // 实际用户同意由 App Approval 完成（custom interaction）
      prompt: 'consent',
    })
    expect(flow.refreshToken).toBeTruthy()
    return flow
  }

  async function refresh(opts: {
    clientId: string
    clientSecret?: string
    refreshToken: string
  }) {
    return tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'refresh_token',
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      refreshToken: opts.refreshToken,
    })
  }

  it('1. rotation：refresh 后返回新 refresh_token，旧 token 立即失效', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile', 'offline_access'],
      status: 'active',
    })
    const flow = await grantRefresh(fixture.clientId, fixture.clientSecret ?? undefined)
    const first = await refresh({
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      refreshToken: flow.refreshToken!,
    })
    expect(first.status).toBe(200)
    expect(first.body.access_token).toBeTruthy()
    const rotated = first.body.refresh_token as string
    // rotation：新 refresh token 与旧的不同
    expect(rotated).toBeTruthy()
    expect(rotated).not.toBe(flow.refreshToken)

    // 旧 refresh token 重用 → invalid_grant（rotation 已使其失效）
    const replayOld = await refresh({
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      refreshToken: flow.refreshToken!,
    })
    expect(replayOld.status).toBe(400)
    expect(replayOld.body.error).toBe('invalid_grant')
  })

  it('2. old refresh replay 触发整链 revoke（新旧 refresh 全部失效）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile', 'offline_access'],
      status: 'active',
    })
    const flow = await grantRefresh(fixture.clientId, fixture.clientSecret ?? undefined)

    // 第一次 refresh：正常 rotation
    const first = await refresh({
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      refreshToken: flow.refreshToken!,
    })
    expect(first.status).toBe(200)
    const rotated = first.body.refresh_token as string

    // 恶意客户端重放【已轮换掉的旧 refresh】→ v9 replay 检测 → 撤销整个 grant 链
    const replay = await refresh({
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      refreshToken: flow.refreshToken!,
    })
    expect(replay.status).toBe(400)
    expect(replay.body.error).toBe('invalid_grant')

    // 整链撤销：连最新轮换出的 refresh 也无法再使用
    const afterReplay = await refresh({
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      refreshToken: rotated,
    })
    expect(afterReplay.status).toBe(400)
    expect(afterReplay.body.error).toBe('invalid_grant')
  })

  it('3. explicit revoke：POST /oauth/revoke 后 refresh 立即失效', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile', 'offline_access'],
      status: 'active',
    })
    const flow = await grantRefresh(fixture.clientId, fixture.clientSecret ?? undefined)

    const revoked = await revokeToken({
      baseUrl: e2e!.baseUrl,
      token: flow.refreshToken!,
      tokenTypeHint: 'refresh_token',
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
    })
    expect(revoked.status).toBe(200)

    const after = await refresh({
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      refreshToken: flow.refreshToken!,
    })
    expect(after.status).toBe(400)
    expect(after.body.error).toBe('invalid_grant')
  })

  it('4. suspended client 无法继续 refresh（动态加载拒绝）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile', 'offline_access'],
      status: 'active',
    })
    const flow = await grantRefresh(fixture.clientId, fixture.clientSecret ?? undefined)

    // 管理员挂起 client（#619：只有 active 才被 provider 加载）
    const { setClientStatus } = await import('../../src/domain/clients.js')
    await setClientStatus(db.sql, fixture.clientId, 'suspended')

    const after = await refresh({
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret ?? undefined,
      refreshToken: flow.refreshToken!,
    })
    expect(after.status).toBe(401)
    expect(after.body.error).toBe('invalid_client')
  })
})
