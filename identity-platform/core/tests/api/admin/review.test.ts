/**
 * P4-4（mini-hbut#1219）自建注册表退役 —— #625 审核写接口契约测试
 * （原 review.test.ts 改写：快照/TOCTOU/部分审批/幂等/step-up 等写行为测试
 * 随 approve/reject 退役一并移除，改为 410 Gone 契约 + 只读回归）。
 *
 * 权威源变更：自建审核（application_reviews / app_registry_reviews）不再是
 * 权威源；权威源 = 仓库 manifest/apps.json + PR 审核。
 *
 * 本文件覆盖：
 * - approve/reject 写接口 → 410 Gone + 固定响应体
 *   {"error":"registry_retired","message":"应用接入改由清单仓库 + PR 审核（见 manifest/README.md）"}
 *   （固定响应先于一切 DB 读取/身份解析/step-up 校验）；
 * - 服务层兜底：approveReview/rejectReview 直接调用即抛 RegistryRetiredError；
 * - 只读回归：GET 详情/队列仍 200，pending 快照仍由 ensurePendingReview
 *   懒物化（读取路径不受退役影响）；410 调用零审计、零状态变更。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { buildAdminApp, createAdminUser, adminGet, adminPost } from './helpers.js'
import { createClientFixture } from '../../helpers/fixtures.js'
import { setClientStatus } from '../../../src/domain/clients.js'
import { ensurePendingReview } from '../../../src/api/admin/reviews.js'
import { approveReview, rejectReview } from '../../../src/api/admin/reviews.js'
import { RegistryRetiredError } from '../../../src/domain/app-registry/retired.js'

/** 410 固定响应体（P4-4 冻结契约，与 domain/app-registry/retired.ts 一致） */
const RETIRED_BODY = {
  error: 'registry_retired',
  message: '应用接入改由清单仓库 + PR 审核（见 manifest/README.md）',
}

describe('P4-4 注册表退役：#625 审核写接口 410 Gone 契约', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 创建 pending 应用（draft → pending_review + 懒物化 pending review） */
  async function setupPendingReview(): Promise<{ applicationId: string; clientId: string; reviewId: string }> {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'draft',
      redirectUris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
    })
    await setClientStatus(db.sql, fixture.clientId, 'pending_review')
    const review = await ensurePendingReview(db.sql, fixture.applicationId)
    if (!review) {
      throw new Error('expected pending review')
    }
    return { applicationId: fixture.applicationId, clientId: fixture.clientId, reviewId: review.id }
  }

  it('POST approve → 410 Gone + 固定响应体（合法 reviewer + 既有 pending review）', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview()
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`,
        {
          subject: reviewer.userId,
          body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }] },
        },
      )
      expect(res.status).toBe(410)
      expect(res.body).toEqual(RETIRED_BODY)
    })
  })

  it('POST reject → 410 Gone + 固定响应体', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview()
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await adminPost(
        baseUrl,
        `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/reject`,
        { subject: reviewer.userId, body: { reason: '不同意' } },
      )
      expect(res.status).toBe(410)
      expect(res.body).toEqual(RETIRED_BODY)
    })
  })

  it('410 调用零副作用：审核状态/应用状态不变、无审计事件', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { applicationId, reviewId } = await setupPendingReview()
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      await adminPost(baseUrl, `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/approve`, {
        subject: reviewer.userId,
        body: { scope_decisions: [{ scope: 'openid', decision: 'approved' }] },
      })
      await adminPost(baseUrl, `/api/v1/admin/apps/${applicationId}/reviews/${reviewId}/reject`, {
        subject: reviewer.userId,
        body: { reason: '不同意' },
      })
    })
    // 审核仍是 pending（懒物化快照未被改写）
    const review = await ensurePendingReview(db.sql, applicationId)
    expect(review?.id).toBe(reviewId)
    expect(review?.status).toBe('pending')
    // 零审计
    const audit = await db.sql.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM audit_events')
    expect(audit.rows[0]?.n).toBe(0)
  })

  it('服务层兜底：approveReview/rejectReview 直接调用抛 RegistryRetiredError', async () => {
    await expect(
      approveReview(db.sql, {
        reviewId: 'rv-x',
        adminUserId: 'u-admin',
        scopeDecisions: [],
      }),
    ).rejects.toBeInstanceOf(RegistryRetiredError)
    await expect(
      rejectReview(db.sql, {
        reviewId: 'rv-x',
        adminUserId: 'u-admin',
        reason: '不同意',
      }),
    ).rejects.toBeInstanceOf(RegistryRetiredError)
  })
})

describe('P4-4 注册表退役：审核只读回归', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('GET 详情仍 200：管理员看到懒物化的 pending 快照（只读路径不受退役影响）', async () => {
    const reviewer = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'student.identity'],
      status: 'pending_review',
      redirectUris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
    })
    const review = await ensurePendingReview(db.sql, fixture.applicationId)
    const app = buildAdminApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const detail = await adminGet(baseUrl, `/api/v1/admin/apps/${fixture.applicationId}`, {
        subject: reviewer.userId,
      })
      expect(detail.status).toBe(200)
      const body = detail.body.app as Record<string, unknown>
      const pending = (body.reviews as Array<{ id: string; status: string; scopes: Array<{ scope: string }> }>).find(
        (r) => r.status === 'pending',
      )
      expect(pending?.id).toBe(review?.id)
      expect(pending?.scopes.map((s) => s.scope)).toEqual(['openid', 'student.identity'])
    })
  })
})
