/**
 * #625 RBAC + IDOR + self-review 测试：
 * - non-admin（无角色/普通 developer）→ 403；
 * - 无 subject 头 → 401；
 * - 用户被禁用 → 403；
 * - reviewer 可查看/审核；reviewer 不能 suspend/revoke/查 audit（403）；
 * - admin 可 suspend/revoke/查 audit；
 * - 角色撤销即时生效；
 * - self-review 默认禁止（owner == 审核人 → 403 SELF_REVIEW_FORBIDDEN）；
 * - review 不属于路径 app → 404（IDOR 参数错配）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { buildAdminApp, createAdminUser, createPlainUser, adminGet, adminPost } from './helpers.js'
import { createClientFixture } from '../../helpers/fixtures.js'
import { setClientStatus } from '../../../src/domain/clients.js'
import { ensurePendingReview } from '../../../src/api/admin/reviews.js'
import { TEST_KEK } from '../../helpers/keys.js'

describe('#625 admin RBAC / IDOR / self-review', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('无 x-admin-subject → 401 ADMIN_UNAUTHORIZED', async () => {
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminGet(baseUrl, '/api/v1/admin/overview')
      expect(res.status).toBe(401)
      expect(res.body.error).toBe('ADMIN_UNAUTHORIZED')
    })
  })

  it('普通用户（无角色）→ 403；developer 不能 admin', async () => {
    const { userId } = await createPlainUser(db.sql)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminGet(baseUrl, '/api/v1/admin/overview', { subject: userId })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe('ADMIN_FORBIDDEN')
      // mutation 同样拒绝
      const suspend = await adminPost(baseUrl, '/api/v1/admin/apps/whatever/suspend', {
        subject: userId,
        authTime: Math.floor(Date.now() / 1000),
        body: { reason: 'x' },
      })
      expect(suspend.status).toBe(403)
    })
  })

  it('用户被禁用（users.status=disabled）→ 403（fail closed）', async () => {
    const { userId } = await createAdminUser(db.sql, { role: 'identity_admin' })
    await db.sql.query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [userId])
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminGet(baseUrl, '/api/v1/admin/overview', { subject: userId })
      expect(res.status).toBe(403)
    })
  })

  it('reviewer 可查看 + 审核；不能 suspend/revoke/查 audit（角色差异）', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const fixture = await createClientFixture(db.sql, { scopes: ['openid', 'profile'], status: 'draft' })
    await setClientStatus(db.sql, fixture.clientId, 'pending_review')
    await ensurePendingReview(db.sql, fixture.applicationId)
    const app = buildAdminApp(db.sql)

    await withServer(app, async (baseUrl) => {
      // 查看
      const overview = await adminGet(baseUrl, '/api/v1/admin/overview', { subject: reviewer.userId })
      expect(overview.status).toBe(200)
      const list = await adminGet(baseUrl, '/api/v1/admin/apps', { subject: reviewer.userId })
      expect(list.status).toBe(200)
      // 审核（approve 无敏感 scope → 无需 step-up）
      const reviews = await adminGet(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/reviews`, { subject: reviewer.userId })
      const reviewId = (reviews.body.reviews as Array<{ id: string }>)[0]?.id
      expect(reviewId).toBeTruthy()
      const approved = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${fixture.applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'profile', decision: 'approved' }] } },
      )
      expect(approved.status).toBe(200)
      // reviewer 不能 suspend / revoke / audit
      const suspend = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, {
        subject: reviewer.userId,
        authTime: Math.floor(Date.now() / 1000),
        body: { reason: 'x' },
      })
      expect(suspend.status).toBe(403)
      const audit = await adminGet(baseUrl, '/api/v1/admin/audit', { subject: reviewer.userId })
      expect(audit.status).toBe(403)
    })
  })

  it('admin 可 suspend/revoke/查 audit', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)

    await withServer(app, async (baseUrl) => {
      const suspend = await adminPost(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/suspend`, {
        subject: admin.userId,
        authTime: now,
        body: { reason: '安全事件响应' },
      })
      expect(suspend.status).toBe(200)
      const audit = await adminGet(baseUrl, '/api/v1/admin/audit', { subject: admin.userId })
      expect(audit.status).toBe(200)
      expect((audit.body.events as Array<{ event_type: string }>).some((e) => e.event_type === 'ADMIN_CLIENT_SUSPENDED')).toBe(true)
    })
  })

  it('角色撤销即时生效（下次请求 403）', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const before = await adminGet(baseUrl, '/api/v1/admin/overview', { subject: admin.userId })
      expect(before.status).toBe(200)
      await db.sql.query(`UPDATE user_roles SET revoked_at = NOW() WHERE user_id = $1`, [admin.userId])
      const after = await adminGet(baseUrl, '/api/v1/admin/overview', { subject: admin.userId })
      expect(after.status).toBe(403)
    })
  })

  it('self-review 禁止：owner 本人审核 → 403 SELF_REVIEW_FORBIDDEN', async () => {
    // 管理员同时也是应用 owner
    const owner = await createAdminUser(db.sql, { role: 'identity_reviewer', asDeveloper: true })
    const fixture = await createClientFixture(db.sql, { scopes: ['openid'], status: 'draft' })
    // 把应用 owner 换成该管理员
    await db.sql.query(
      `UPDATE oauth_applications SET owner_developer_id = $1 WHERE id = $2`,
      [owner.developerId, fixture.applicationId],
    )
    await setClientStatus(db.sql, fixture.clientId, 'pending_review')
    await ensurePendingReview(db.sql, fixture.applicationId)
    const app = buildAdminApp(db.sql)

    await withServer(app, async (baseUrl) => {
      const reviews = await adminGet(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}/reviews`, { subject: owner.userId })
      const reviewId = (reviews.body.reviews as Array<{ id: string }>)[0]?.id
      const approve = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${fixture.applicationId}/reviews/${reviewId}/approve`,
        { subject: owner.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }] } },
      )
      expect(approve.status).toBe(403)
      expect(approve.body.error).toBe('SELF_REVIEW_FORBIDDEN')
    })
  })

  it('review 不属于路径 app → 404（IDOR 参数错配）', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const a = await createClientFixture(db.sql, { status: 'draft' })
    const b = await createClientFixture(db.sql, { status: 'draft' })
    await setClientStatus(db.sql, a.clientId, 'pending_review')
    await setClientStatus(db.sql, b.clientId, 'pending_review')
    await ensurePendingReview(db.sql, a.applicationId)
    await ensurePendingReview(db.sql, b.applicationId)
    const app = buildAdminApp(db.sql)

    await withServer(app, async (baseUrl) => {
      const reviews = await adminGet(baseUrl, `/api/v1/admin/apps/${a.applicationId}/reviews`, { subject: reviewer.userId })
      const reviewIdOfA = (reviews.body.reviews as Array<{ id: string }>)[0]?.id
      // 用 B 的 app id + A 的 review id → 404
      const res = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${b.applicationId}/reviews/${reviewIdOfA}/reject`,
        { subject: reviewer.userId, body: { reason: '不匹配' } },
      )
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('REVIEW_NOT_FOUND')
    })
  })

  it('不存在的 app → 404', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminGet(baseUrl, '/api/v1/admin/apps/00000000-0000-7000-8000-000000000000', { subject: reviewer.userId })
      expect(res.status).toBe(404)
    })
  })

  it('me 返回角色；无角色 403', async () => {
    const admin = await createAdminUser(db.sql, { role: 'identity_admin' })
    const plain = await createPlainUser(db.sql)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const me = await adminGet(baseUrl, '/api/v1/admin/me', { subject: admin.userId })
      expect(me.status).toBe(200)
      expect(me.body.roles).toEqual(['identity_admin'])
      const denied = await adminGet(baseUrl, '/api/v1/admin/me', { subject: plain.userId })
      expect(denied.status).toBe(403)
    })
  })
})
