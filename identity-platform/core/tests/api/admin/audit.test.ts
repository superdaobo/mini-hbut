/**
 * #625 审计测试：
 * - 每个 mutation 产生对应事件（9 种事件全覆盖）；
 * - actor/target/revision/决策正确；
 * - metadata 不存 secret/token/handoff（strict 脱敏：含敏感字段整体拒绝落库）；
 * - 角色授予/撤销（bootstrap 语义）审计；
 * - audit 查询过滤/分页（before 游标）+ admin 权限（reviewer 403 已在 rbac 覆盖）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { buildAdminApp, createAdminUser, adminGet, adminPost } from './helpers.js'
import { createClientFixture } from '../../helpers/fixtures.js'
import { setClientStatus } from '../../../src/domain/clients.js'
import { ensurePendingReview, approveReview, rejectReview } from '../../../src/api/admin/reviews.js'
import { suspendClient, unsuspendClient, revokeClient } from '../../../src/api/admin/runtime.js'
import { grantAdminRole, revokeAdminRole } from '../../../src/api/admin/roles-service.js'
import { writeAdminAudit, ADMIN_EVENTS } from '../../../src/api/admin/audit.js'
import { listAuditEvents } from '../../../src/db/repos/audit.repo.js'
import { AuditSensitiveFieldError } from '../../../src/observability/audit/index.js'
import { listAuditEventsAdmin } from '../../../src/api/admin/queries.js'

describe('#625 审计（9 事件 / 脱敏 / 查询）', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('全部 9 种审计事件定义存在（issue 清单逐项核对）', () => {
    expect(Object.values(ADMIN_EVENTS).sort()).toEqual([
      'ADMIN_APP_APPROVED',
      'ADMIN_APP_REJECTED',
      'ADMIN_CLIENT_REVOKED',
      'ADMIN_CLIENT_SUSPENDED',
      'ADMIN_CLIENT_UNSUSPENDED',
      'ADMIN_ROLE_GRANTED',
      'ADMIN_ROLE_REVOKED',
      'ADMIN_SCOPE_APPROVED',
      'ADMIN_SCOPE_REJECTED',
    ].sort())
  })

  it('审核 mutation 审计：actor/target/revision/决策字段正确且无敏感值', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const fixture = await createClientFixture(db.sql, { scopes: ['openid', 'student.identity'], status: 'draft' })
    await setClientStatus(db.sql, fixture.clientId, 'pending_review')
    const review = await ensurePendingReview(db.sql, fixture.applicationId)

    await approveReview(db.sql, {
      reviewId: review?.id as string,
      adminUserId: reviewer.userId,
      scopeDecisions: [
        { scope: 'openid', decision: 'approved' },
        { scope: 'student.identity', decision: 'rejected', note: '理由不足' },
      ],
      note: '整体通过',
      requestCorrelationId: 'corr_0001',
    })

    const events = await listAuditEvents(db.sql, { actorType: 'admin' })
    const types = events.map((e) => e.event_type).sort()
    expect(types).toEqual(['ADMIN_APP_APPROVED', 'ADMIN_SCOPE_APPROVED', 'ADMIN_SCOPE_REJECTED'].sort())
    for (const e of events) {
      expect(e.actor_id).toBe(reviewer.userId)
      expect(e.target_type).toBe('application')
      expect(e.target_id).toBe(fixture.applicationId)
      expect(e.request_correlation_id).toBe('corr_0001')
      const meta = e.metadata_json as Record<string, unknown>
      expect(meta.review_id).toBe(review?.id)
      expect(meta.revision).toBe(review?.revision)
      // 绝不出现敏感键
      const raw = JSON.stringify(meta)
      expect(raw).not.toMatch(/secret|token|handoff|password|authorization/i)
    }
  })

  it('audit 脱敏：metadata 含 client_secret/token 时整体拒绝落库（strict）', async () => {
    await expect(writeAdminAudit(db.sql, {
      eventType: ADMIN_EVENTS.CLIENT_REVOKED,
      actorId: 'usr_x',
      metadata: { client_secret: 'sk_live_xxx', reason: '违规' },
    })).rejects.toThrow(AuditSensitiveFieldError)
    await expect(writeAdminAudit(db.sql, {
      eventType: ADMIN_EVENTS.CLIENT_REVOKED,
      actorId: 'usr_x',
      metadata: { refresh_token: 'rt_xxx' },
    })).rejects.toThrow(AuditSensitiveFieldError)
    // 值形态检测：Bearer 前缀文本也被拒
    await expect(writeAdminAudit(db.sql, {
      eventType: ADMIN_EVENTS.CLIENT_REVOKED,
      actorId: 'usr_x',
      metadata: { note: 'Bearer eyJhbGciOiJSUzI1NiJ9.xxx.yyy' },
    })).rejects.toThrow(AuditSensitiveFieldError)
    // 拒绝后无任何事件落库
    const events = await listAuditEvents(db.sql)
    expect(events.length).toBe(0)
  })

  it('reject / suspend / unsuspend / revoke 各写对应事件', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const now = Math.floor(Date.now() / 1000)

    // reject（先造 pending review）
    const fixture2 = await createClientFixture(db.sql, { scopes: ['openid'], status: 'draft' })
    await setClientStatus(db.sql, fixture2.clientId, 'pending_review')
    const review = await ensurePendingReview(db.sql, fixture2.applicationId)
    await rejectReview(db.sql, { reviewId: review?.id as string, adminUserId: admin.userId, reason: 'callback 非 https' })

    await suspendClient(db.sql, { applicationId: fixture.applicationId, adminUserId: admin.userId, reason: 'r1' })
    await unsuspendClient(db.sql, { applicationId: fixture.applicationId, adminUserId: admin.userId, reason: 'r2' })
    await revokeClient(db.sql, { applicationId: fixture.applicationId, adminUserId: admin.userId, reason: 'r3' })

    const types = (await listAuditEvents(db.sql, { actorType: 'admin' })).map((e) => e.event_type).sort()
    expect(types).toEqual([
      'ADMIN_APP_REJECTED',
      'ADMIN_CLIENT_REVOKED',
      'ADMIN_CLIENT_SUSPENDED',
      'ADMIN_CLIENT_UNSUSPENDED',
    ].sort())
  })

  it('角色授予/撤销审计（bootstrap 语义：system actor，不记学号）', async () => {
    const { userId } = await createAdminUser(db.sql, { role: 'identity_admin' })
    await grantAdminRole(db.sql, { userId, role: 'identity_reviewer' })
    await revokeAdminRole(db.sql, { userId, role: 'identity_reviewer' })
    const events = await listAuditEvents(db.sql)
    const granted = events.find((e) => e.event_type === 'ADMIN_ROLE_GRANTED')
    const revoked = events.find((e) => e.event_type === 'ADMIN_ROLE_REVOKED')
    expect(granted?.actor_type).toBe('system')
    expect(granted?.target_id).toBe(userId)
    expect((granted?.metadata_json as Record<string, unknown>).role).toBe('identity_reviewer')
    expect(revoked?.actor_type).toBe('system')
    // 角色实际生效/撤销
    const roles = await db.sql.query<{ role: string }>('SELECT role FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL', [userId])
    expect(roles.rows.map((r) => r.role)).toEqual(['identity_admin'])
    // 重复授予幂等（不再审计）
    await grantAdminRole(db.sql, { userId, role: 'identity_reviewer' })
    const grantedCount = (await listAuditEvents(db.sql)).filter((e) => e.event_type === 'ADMIN_ROLE_GRANTED').length
    expect(grantedCount).toBe(2) // 第一次 + 撤销后重新激活
  })

  it('admin:grant 对不存在的用户 → 400（fail closed）', async () => {
    await expect(grantAdminRole(db.sql, { userId: 'usr_not_exist', role: 'identity_admin' }))
      .rejects.toThrowError(/用户不存在/)
  })

  it('audit 查询：before 游标分页 + event_type 过滤', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)

    await withServer(app, async (baseUrl) => {
      for (let i = 0; i < 3; i += 1) {
        await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, { subject: admin.userId, authTime: now, body: { reason: `事件 ${i}` } })
        await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/unsuspend`, { subject: admin.userId, authTime: now, body: { reason: `恢复 ${i}` } })
      }
      // event_type 过滤
      const filtered = await adminGet(baseUrl, '/api/v1/admin/audit?event_type=ADMIN_CLIENT_SUSPENDED', { subject: admin.userId })
      expect(filtered.status).toBe(200)
      const events = filtered.body.events as Array<{ event_type: string }>
      expect(events.length).toBe(3)
      expect(events.every((e) => e.event_type === 'ADMIN_CLIENT_SUSPENDED')).toBe(true)
      // before 游标
      const first = events[0] as { id: string } | undefined
      expect(first).toBeDefined()
      const page2 = await adminGet(baseUrl, `/api/v1/admin/audit?event_type=ADMIN_CLIENT_SUSPENDED&before=${first?.id}`, { subject: admin.userId })
      const events2 = page2.body.events as Array<{ id: string }>
      expect(events2.length).toBe(2)
      expect(events2.some((e) => e.id === first?.id)).toBe(false)
      // limit 上限
      const limited = await adminGet(baseUrl, `/api/v1/admin/audit?limit=999`, { subject: admin.userId })
      expect((limited.body.events as unknown[]).length).toBeLessThanOrEqual(100)
    })
  })

  it('audit 查询结果为已脱敏数据（不泄露 secret）', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    await suspendClient(db.sql, { applicationId: fixture.applicationId, adminUserId: admin.userId, reason: '安全响应' })
    const rows = await listAuditEventsAdmin(db.sql, { eventType: 'ADMIN_CLIENT_SUSPENDED' }, 10)
    const meta = rows[0]?.metadata_json as Record<string, unknown>
    expect(meta.client_id).toBe(fixture.clientId)
    expect(meta.reason).toBe('安全响应')
    expect(JSON.stringify(meta)).not.toMatch(/secret|token/i)
  })
})
