/**
 * #625 审核流测试：
 * - submit 快照：metadata/redirect_uris/scopes 冻结，管理员看到的是快照；
 * - TOCTOU：开发者修改后 approve → REVISION_MISMATCH + 旧 review superseded；
 * - 部分 scope 审批：openid 批准 + student.identity 拒绝 → 各自落地/审计；
 * - reject：必须 reason；rejected 后可重新提交（新 pending review）；
 * - 幂等：重复 approve 返回既有结果且不重复审计；
 * - step-up：敏感 scope approve 要求近期认证；基础 scope 不需要；
 * - 缺失/多余 scope 决策 → 400。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { buildAdminApp, createAdminUser, adminGet, adminPost } from './helpers.js'
import { createClientFixture } from '../../helpers/fixtures.js'
import { setClientStatus } from '../../../src/domain/clients.js'
import { updateAppBasic } from './helpers.js'
import { ensurePendingReview, createPendingReviewForSubmission } from '../../../src/api/admin/reviews.js'
import { listAuditEvents } from '../../../src/db/repos/audit.repo.js'
import { listApprovedScopes } from '../../../src/db/repos/clients.repo.js'
import { findPendingReview } from '../../../src/api/admin/queries.js'

describe('#625 审核流（快照/TOCTOU/部分审批/幂等/step-up）', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 创建 draft 应用并提交审核，返回 pending review id */
  async function setupPendingReview(opts: {
    scopes?: string[]
    redirectUris?: Array<{ uri: string; kind: 'web_https' | 'native_loopback' }>
  }): Promise<{ applicationId: string; clientId: string; reviewId: string; scopes: string[] }> {
    const scopes = opts.scopes ?? ['openid', 'profile']
    const fixture = await createClientFixture(db.sql, {
      scopes,
      status: 'draft',
      redirectUris: opts.redirectUris,
    })
    await setClientStatus(db.sql, fixture.clientId, 'pending_review')
    const review = await ensurePendingReview(db.sql, fixture.applicationId)
    if (!review) {
      throw new Error('expected pending review')
    }
    return { applicationId: fixture.applicationId, clientId: fixture.clientId, reviewId: review.id, scopes }
  }

  it('快照冻结：提交后、变更前的审核快照是提交时刻的不可变副本', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({
      scopes: ['openid', 'student.identity'],
      redirectUris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
    })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 变更前读取：管理员看到的是提交时刻快照
      const detail = await adminGet(baseUrl, `/api/v1/admin/apps/${applicationId}`, { subject: reviewer.userId })
      expect(detail.status).toBe(200)
      const body = detail.body.app as Record<string, unknown>
      const pending = (body.reviews as Array<{
        id: string
        metadata: Record<string, unknown>
        redirect_uris: Array<{ uri: string }>
        scopes: Array<{ scope: string }>
        status: string
      }>).find((r) => r.status === 'pending')
      expect(pending?.id).toBe(reviewId)
      expect(pending?.metadata.name).toBe('测试应用')
      expect(pending?.redirect_uris[0]?.uri).toBe('https://course.example.com/oauth/callback')
      expect(pending?.scopes.map((s) => s.scope)).toEqual(['openid', 'student.identity'])

      // 开发者提交后修改（模拟未来 developer API 的 mutation）
      await updateAppBasic(db.sql, applicationId, { name: '改名后的应用', description: '改描述' })
      // 再次读取：旧快照 superseded，懒物化生成新 pending 快照（管理员永远看到当前内容，
      // 而 approve 时刻的 revision 比对保证「看到的配置 == 批准的配置」）
      const after = await adminGet(baseUrl, `/api/v1/admin/apps/${applicationId}`, { subject: reviewer.userId })
      const afterBody = after.body.app as Record<string, unknown>
      const reviews = afterBody.reviews as Array<{ id: string; status: string; metadata: Record<string, unknown> }>
      const old = reviews.find((r) => r.id === reviewId)
      expect(old?.status).toBe('superseded')
      const fresh = reviews.find((r) => r.status === 'pending')
      expect(fresh?.metadata.name).toBe('改名后的应用')
      // 实时数据
      expect((afterBody.application as Record<string, unknown>).name).toBe('改名后的应用')
    })
  })

  it('TOCTOU：开发者修改后 approve → 409 REVISION_MISMATCH，旧 review 自动 superseded', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({ scopes: ['openid'] })
    // 模拟开发者修改（内容变化）
    await updateAppBasic(db.sql, applicationId, { name: '已改名的应用' })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }] } },
      )
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('REVISION_MISMATCH')
      // 旧 review 已 superseded；懒物化会生成新 pending（不同 id，内容为当前配置）
      const reviews = await adminGet(baseUrl, `/api/v1/admin/apps/${applicationId}/reviews`, { subject: reviewer.userId })
      const list = reviews.body.reviews as Array<{ id: string; status: string }>
      const old = list.find((r) => r.id === reviewId)
      expect(old?.status).toBe('superseded')
      const pending = list.filter((r) => r.status === 'pending')
      expect(pending.length).toBe(1)
      expect(pending[0]?.id).not.toBe(reviewId)
      // 应用保持 pending_review（未被批准）
      const status = await db.sql.query<{ status: string }>('SELECT status FROM oauth_applications WHERE id = $1', [applicationId])
      expect(status.rows[0]?.status).toBe('pending_review')
    })
  })

  it('部分 scope 审批：敏感 scope 单独拒绝后仅批准项进入 provider 可加载集合', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({ scopes: ['openid', 'student.identity'] })
    const now = Math.floor(Date.now() / 1000)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        {
          subject: reviewer.userId,
          authTime: now, // 含敏感 scope → 需要近期认证
          body: {
            note: '身份用途描述充分，通过；student.identity 用途不足，拒绝',
            scope_decisions: [
              { scope: 'openid', decision: 'approved' },
              { scope: 'student.identity', decision: 'rejected', note: '用途描述不足，且非官方保证级别不满足需求' },
            ],
          },
        },
      )
      expect(res.status).toBe(200)
      // 应用激活（approve == activate）
      const status = await db.sql.query<{ status: string }>('SELECT status FROM oauth_applications WHERE id = $1', [applicationId])
      expect(status.rows[0]?.status).toBe('active')
      // provider 只加载批准的 scope
      const approved = await listApprovedScopes(db.sql, applicationId)
      expect(approved).toEqual(['openid'])
      // scope 级审计
      const audit = await listAuditEvents(db.sql, { actorType: 'admin' })
      const types = audit.map((e) => e.event_type)
      expect(types).toContain('ADMIN_APP_APPROVED')
      expect(types).toContain('ADMIN_SCOPE_APPROVED')
      expect(types).toContain('ADMIN_SCOPE_REJECTED')
    })
  })

  it('step-up：含敏感 scope 的 approve 无近期认证 → 403 STEP_UP_REQUIRED', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({ scopes: ['openid', 'offline_access'] })
    const app = buildAdminApp(db.sql, { IDENTITY_ADMIN_STEP_UP_SECONDS: '600' })
    await withServer(app, async (baseUrl) => {
      // 无 auth_time
      const noAuth = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'offline_access', decision: 'approved' }] } },
      )
      expect(noAuth.status).toBe(403)
      expect(noAuth.body.error).toBe('STEP_UP_REQUIRED')
      // 过期 auth_time（20 分钟前）
      const stale = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, authTime: Math.floor(Date.now() / 1000) - 1200, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'offline_access', decision: 'approved' }] } },
      )
      expect(stale.status).toBe(403)
      expect(stale.body.error).toBe('STEP_UP_REQUIRED')
      // 未来时间戳 → 拒绝
      const future = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, authTime: Math.floor(Date.now() / 1000) + 3600, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'offline_access', decision: 'approved' }] } },
      )
      expect(future.status).toBe(403)
      // 近期认证 → 通过
      const ok = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, authTime: Math.floor(Date.now() / 1000), body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'offline_access', decision: 'approved' }] } },
      )
      expect(ok.status).toBe(200)
    })
  })

  it('基础 scope（openid/profile）approve 不需要 step-up', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({ scopes: ['openid', 'profile'] })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'profile', decision: 'approved' }] } },
      )
      expect(res.status).toBe(200)
    })
  })

  it('幂等：重复 approve 返回既有结果，不重复写 scope/审计', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({ scopes: ['openid'] })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const first = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }] } },
      )
      expect(first.status).toBe(200)
      const auditAfterFirst = (await listAuditEvents(db.sql, { actorType: 'admin' })).filter((e) => e.event_type === 'ADMIN_APP_APPROVED').length
      const second = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'rejected' }] } }, // 篡改决策不影响重放
      )
      expect(second.status).toBe(200)
      expect((second.body.review as Record<string, unknown>).status).toBe('approved')
      const auditAfterSecond = (await listAuditEvents(db.sql, { actorType: 'admin' })).filter((e) => e.event_type === 'ADMIN_APP_APPROVED').length
      expect(auditAfterSecond).toBe(auditAfterFirst)
      // 重放返回的是落库决策，不是请求体
      const decisions = (second.body.review as { scopeDecisions: Array<{ scope: string; decision: string }> }).scopeDecisions
      expect(decisions[0]?.decision).toBe('approved')
    })
  })

  it('reject：必须填写 reason；应用回 rejected；可重新提交', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({ scopes: ['openid'] })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 缺 reason → 400
      const noReason = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/reject`,
        { subject: reviewer.userId, body: {} },
      )
      expect(noReason.status).toBe(400)
      // 正式拒绝
      const rejected = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/reject`,
        { subject: reviewer.userId, body: { reason: 'redirect URI 不符合要求：callback 必须为 https' } },
      )
      expect(rejected.status).toBe(200)
      const status = await db.sql.query<{ status: string }>('SELECT status FROM oauth_applications WHERE id = $1', [applicationId])
      expect(status.rows[0]?.status).toBe('rejected')
      // 重复 reject → 幂等返回既有 reason
      const again = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/reject`,
        { subject: reviewer.userId, body: { reason: '另一理由' } },
      )
      expect(again.status).toBe(200)
      expect((again.body.review as Record<string, unknown>).reason).toBe('redirect URI 不符合要求：callback 必须为 https')
      // 重新提交：rejected → pending_review（注：Core 状态机当前把 rejected 视为终态，
      // 该迁移将由未来 #624 开发者 API 处理；此处模拟其效果）→ 新 pending review 生成
      await db.sql.query(`UPDATE oauth_applications SET status = 'pending_review', submitted_at = NOW() WHERE id = $1`, [applicationId])
      const review = await createPendingReviewForSubmission(db.sql, applicationId)
      expect(review).not.toBeNull()
      const pending = await findPendingReview(db.sql, applicationId)
      expect(pending?.id).not.toBe(reviewId)
    })
  })

  it('缺失/多余 scope 决策 → 400 INVALID_INPUT', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview({ scopes: ['openid', 'profile'] })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const missing = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }] } },
      )
      expect(missing.status).toBe(400)
      const extra = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'profile', decision: 'approved' }, { scope: 'offline_access', decision: 'approved' }] } },
      )
      expect(extra.status).toBe(400)
    })
  })

  it('未知 reviewId → 404', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId } = await setupPendingReview({ scopes: ['openid'] })
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/00000000-0000-7000-8000-000000000000/approve`,
        { subject: reviewer.userId, body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }] } },
      )
      expect(res.status).toBe(404)
    })
  })
})
