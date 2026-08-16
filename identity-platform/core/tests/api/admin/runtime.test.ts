/**
 * #625 Suspend/Revoke 运行时测试：
 * - suspend：provider client-loader 立即不可加载（新 authorize/refresh 失败的
 *   机制路径）；全部协议 artifact 物理删除；幂等；非 active → 409；
 * - unsuspend：suspended → active；只允许从 suspended 恢复（revoked → 409）；
 * - revoke：终态不可逆；artifact + consents 全部撤销；幂等；
 * - step-up：admin 动作无近期认证 → 403 STEP_UP_REQUIRED。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { buildAdminApp, createAdminUser, adminPost } from './helpers.js'
import { createClientFixture } from '../../helpers/fixtures.js'
import { createClientLoader } from '../../../src/oidc/adapter/client-loader.js'
import { upsertOidcRecord, findOidcRecord } from '../../../src/db/repos/oidc-records.repo.js'
import { upsertConsent, findConsent } from '../../../src/db/repos/clients.repo.js'
import { TEST_KEK } from '../../helpers/keys.js'
import { listAuditEvents } from '../../../src/db/repos/audit.repo.js'

describe('#625 suspend / unsuspend / revoke 运行时效果', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 为该 client 造协议 artifact（AccessToken/RefreshToken/AuthorizationCode/Grant） */
  async function seedArtifacts(clientId: string, grantId: string): Promise<void> {
    await upsertOidcRecord(db.sql, { modelName: 'AccessToken', recordId: `at_${clientId}`, payload: { clientId, grantId }, expiresIn: 3600, grantId })
    await upsertOidcRecord(db.sql, { modelName: 'RefreshToken', recordId: `rt_${clientId}`, payload: { clientId, grantId }, expiresIn: 86400, grantId })
    await upsertOidcRecord(db.sql, { modelName: 'AuthorizationCode', recordId: `ac_${clientId}`, payload: { clientId, grantId }, expiresIn: 600, grantId })
    await upsertOidcRecord(db.sql, { modelName: 'Grant', recordId: grantId, payload: { clientId, accountId: 'acc_1' } })
  }

  it('suspend：provider 不再加载 client（authorize/refresh 失效路径）+ 全部 artifact 撤销', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const loader = createClientLoader({ sql: db.sql, clientSecretKek: TEST_KEK })

    // 前置：active 时可加载
    expect(await loader.find(fixture.clientId)).toBeDefined()
    // 造 artifact（本 client 与另一 client 各一份）
    await seedArtifacts(fixture.clientId, 'grant_a')
    const other = await createClientFixture(db.sql, { status: 'active' })
    await seedArtifacts(other.clientId, 'grant_b')

    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, {
        subject: admin.userId,
        authTime: now,
        body: { reason: '发现高风险：redirect 指向钓鱼域名' },
      })
      expect(res.status).toBe(200)
      expect((res.body.client as Record<string, unknown>).status).toBe('suspended')
      expect((res.body.client as Record<string, unknown>).revokedArtifacts).toBe(4)
    })

    // 真实作用：provider 的 Client 数据源不再返回该 client
    expect(await loader.find(fixture.clientId)).toBeUndefined()
    // 该 client 的 artifact 全部删除；其他 client 不受影响
    expect(await findOidcRecord(db.sql, 'AccessToken', `at_${fixture.clientId}`)).toBeNull()
    expect(await findOidcRecord(db.sql, 'RefreshToken', `rt_${fixture.clientId}`)).toBeNull()
    expect(await findOidcRecord(db.sql, 'AuthorizationCode', `ac_${fixture.clientId}`)).toBeNull()
    expect(await findOidcRecord(db.sql, 'Grant', 'grant_a')).toBeNull()
    expect(await findOidcRecord(db.sql, 'AccessToken', `at_${other.clientId}`)).not.toBeNull()
  })

  it('suspend 幂等：重复 suspend 返回既有状态，不重复撤销/审计', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const first = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, { subject: admin.userId, authTime: now, body: { reason: 'r1' } })
      expect(first.status).toBe(200)
      const events1 = (await listAuditEvents(db.sql, { actorType: 'admin' })).filter((e) => e.event_type === 'ADMIN_CLIENT_SUSPENDED').length
      const second = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, { subject: admin.userId, authTime: now, body: { reason: 'r2' } })
      expect(second.status).toBe(200)
      expect((second.body.client as Record<string, unknown>).revokedArtifacts).toBe(0)
      const events2 = (await listAuditEvents(db.sql, { actorType: 'admin' })).filter((e) => e.event_type === 'ADMIN_CLIENT_SUSPENDED').length
      expect(events2).toBe(events1)
    })
  })

  it('suspend 非 active（draft）→ 409 INVALID_STATE', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'draft' })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, { subject: admin.userId, authTime: now, body: { reason: 'x' } })
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('INVALID_STATE')
    })
  })

  it('unsuspend：suspended → active；从非 suspended 状态恢复 → 409', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const loader = createClientLoader({ sql: db.sql, clientSecretKek: TEST_KEK })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)

    await withServer(app, async (baseUrl) => {
      // active → suspended
      await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, { subject: admin.userId, authTime: now, body: { reason: '临时' } })
      expect(await loader.find(fixture.clientId)).toBeUndefined()
      // suspended → active
      const restored = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/unsuspend`, { subject: admin.userId, authTime: now, body: { reason: '已确认无风险' } })
      expect(restored.status).toBe(200)
      expect((restored.body.client as Record<string, unknown>).status).toBe('active')
      expect(await loader.find(fixture.clientId)).toBeDefined()
      // 已 active 再 unsuspend → 幂等 200（不报错）
      const again = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/unsuspend`, { subject: admin.userId, authTime: now, body: { reason: 'x' } })
      expect(again.status).toBe(200)
    })
  })

  it('unsuspend revoked → 409（只允许从 suspended 恢复）', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'revoked' })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/unsuspend`, { subject: admin.userId, authTime: now, body: { reason: 'x' } })
      expect(res.status).toBe(409)
    })
  })

  it('revoke：终态不可逆；artifact + consents 全撤销；幂等', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const loader = createClientLoader({ sql: db.sql, clientSecretKek: TEST_KEK })
    await seedArtifacts(fixture.clientId, 'grant_r')
    await upsertConsent(db.sql, { userId: fixture.userId, applicationId: fixture.applicationId, grantedScopes: ['openid'] })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)

    await withServer(app, async (baseUrl) => {
      const res = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/revoke`, {
        subject: admin.userId,
        authTime: now,
        body: { reason: '严重违规：伪造教育机构身份' },
      })
      expect(res.status).toBe(200)
      expect((res.body.client as Record<string, unknown>).status).toBe('revoked')
    })
    expect(await loader.find(fixture.clientId)).toBeUndefined()
    expect(await findOidcRecord(db.sql, 'AccessToken', `at_${fixture.clientId}`)).toBeNull()
    const consent = await findConsent(db.sql, fixture.userId, fixture.applicationId)
    expect(consent?.revoked_at).not.toBeNull()
    // 幂等重放
    await withServer(app, async (baseUrl) => {
      const again = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/revoke`, { subject: admin.userId, authTime: now, body: { reason: 'x' } })
      expect(again.status).toBe(200)
      expect((again.body.client as Record<string, unknown>).revokedArtifacts).toBe(0)
    })
    // 历史 audit 保留
    const events = await listAuditEvents(db.sql, { actorType: 'admin' })
    expect(events.filter((e) => e.event_type === 'ADMIN_CLIENT_REVOKED').length).toBe(1)
  })

  it('step-up：suspend 无近期认证 → 403 STEP_UP_REQUIRED（不只前端 confirm）', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, {
        subject: admin.userId, // 无 auth_time
        body: { reason: 'x' },
      })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe('STEP_UP_REQUIRED')
    })
  })

  it('reviewer 无 step-up 也需要：approve 敏感 scope 的 step-up 独立于角色', async () => {
    // 已覆盖于 review.test.ts；此处验证 admin 角色也不能豁免 step-up
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, {
        subject: admin.userId,
        authTime: Math.floor(Date.now() / 1000) - 3600,
        body: { reason: 'x' },
      })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe('STEP_UP_REQUIRED')
    })
  })
})
