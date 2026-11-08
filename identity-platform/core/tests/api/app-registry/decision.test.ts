/**
 * T12（mini-hbut#1170）应用注册审核 —— 决定端点测试（approve/reject/列表）：
 * - approve happy path → 200（status=approved, reviewer 落库）；重复 approve → 409 INVALID_TRANSITION；
 * - TOCTOU：内容被改（重新提交 supersede / 直接篡改存储内容）→ 409 + 旧 review superseded；
 * - self-review → 403（审核人 == owner 的 user_id）；
 * - reject：无原因 → 400 INVALID_REASON；有原因 → 200（decision_reason 落库，rejected 可回炉重提）；
 * - 非法状态迁移 → 409（approve 已 rejected 的记录）；
 * - 收据：updateArtifactReceipts 写入后可按 review 读回（管理员列表含 artifact_receipts）；
 * - 鉴权：无 admin 身份 → 401；无角色 → 403；step-up 过期 → 403；
 *   服务令牌缺失 + 伪造 x-admin-subject → 401 且 handler 未执行（回归）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { createAdminUser, createPlainUser } from '../admin/helpers.js'
import {
  buildAppRegistryApp,
  createRegistryFixture,
  seedPortalClient,
  regGet,
  regPost,
  cloneBody,
  developerSubjectFor,
} from './helpers.js'
import {
  findReviewById,
  listReviewsByApp,
  updateArtifactReceipts,
} from '../../../src/db/repos/app_registry.repo.js'

const NOW = () => Math.floor(Date.now() / 1000)

describe('T12 审核决定 /approve /reject 与列表', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
    await seedPortalClient(db.sql)
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 提交审核，返回 review id 与 submit 响应 */
  async function submit(
    baseUrl: string,
    fixture: Awaited<ReturnType<typeof createRegistryFixture>>,
    body?: Record<string, unknown>,
  ): Promise<{ reviewId: string; status: number }> {
    const res = await regPost(
      baseUrl,
      `/api/v1/apps/${fixture.appId}/reviews`,
      { devSubject: fixture.developer.subject, body: body ?? cloneBody(fixture.baseBody) },
    )
    expect(res.status).toBe(201)
    const review = res.body.review as Record<string, unknown>
    return { reviewId: review.review_id as string, status: res.status }
  }

  it('approve：happy path 200 + reviewer 落库；重复 approve → 409 INVALID_TRANSITION', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId } = await submit(baseUrl, fixture)
      const ok = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(ok.status).toBe(200)
      const review = ok.body.review as Record<string, unknown>
      expect(review.status).toBe('approved')
      expect(review.decision).toBe('approved')
      expect(review.reviewer).toBe(admin.userId)
      expect(review.reviewed_at).toBeTruthy()

      // 幂等兜底：已 approved 再 approve → 状态机非法迁移 409（不是静默成功）
      const again = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(again.status).toBe(409)
      expect(again.body.error).toBe('INVALID_TRANSITION')
      const after = await findReviewById(db.sql, reviewId)
      expect(after?.status).toBe('approved')
      expect(after?.decision).toBe('approved')
    })
  })

  it('TOCTOU：重新提交改内容后 approve 旧 review → 409 且旧 review 已 superseded', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId: oldId } = await submit(baseUrl, fixture)
      // 开发者重新提交（内容变化）→ 旧 review 自动 superseded
      const changed = cloneBody(fixture.baseBody)
      const domains = changed.data_domains as Array<Record<string, unknown>>
      domains[0]!.purpose = '用途变更：新增导出'
      const resubmit = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews`,
        { devSubject: fixture.developer.subject, body: changed },
      )
      expect(resubmit.status).toBe(201)
      expect(resubmit.body.idempotency).toBe('superseded')
      const newReview = resubmit.body.review as Record<string, unknown>

      // 管理员去批准【旧】review：内容已变 → 409；旧记录保持 superseded
      const stale = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${oldId}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(stale.status).toBe(409)
      const oldRow = await findReviewById(db.sql, oldId)
      expect(oldRow?.status).toBe('superseded')
      expect(oldRow?.reviewer).toBeNull()

      // 批准当前 pending（新内容）→ 200
      const ok = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${newReview.review_id}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(ok.status).toBe(200)
      expect((ok.body.review as Record<string, unknown>).status).toBe('approved')
    })
  })

  it('TOCTOU（REVISION_MISMATCH）：存储内容被带外篡改 → approve → 409 REVISION_MISMATCH + superseded', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId } = await submit(baseUrl, fixture)
      // 模拟绕过 API 的带外内容篡改（revision 未重算 → 内容寻址失配）
      await db.sql.query(
        `UPDATE app_registry_reviews SET data_domains = $2::jsonb WHERE id = $1`,
        [
          reviewId,
          JSON.stringify([{ domain: 'school.grades', operations: ['read', 'export'], purpose: '被篡改' }]),
        ],
      )
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('REVISION_MISMATCH')
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('superseded')
      expect(row?.reviewer).toBeNull()
    })
  })

  it('self-review：审核人 == owner 的 user_id → 403（approve 与 reject 都拦）', async () => {
    // 管理员同时也是开发者（owner 语义）：用其开发者身份提交，再用其管理员身份审核
    const selfAdmin = await createAdminUser(db.sql, { role: 'identity_reviewer', asDeveloper: true })
    const appId = `self_${Math.random().toString(36).slice(2, 10)}`
    const body = cloneBody(
      (await createRegistryFixture(db.sql)).baseBody,
    )
    ;(body.casdoor as Record<string, unknown>).application_name = appId
    ;(body.casdoor as Record<string, unknown>).client_id = `cid-${appId}`
    body.entry = `more://${appId}`
    const selfSubject = developerSubjectFor(selfAdmin.userId)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${appId}/reviews`,
        { devSubject: selfSubject, body },
      )
      expect(res.status).toBe(201)
      const review = res.body.review as Record<string, unknown>
      // owner 是提交人的 developer_id（即这位管理员的 developer 行）
      expect(review.owner).toBe(selfAdmin.developerId)
      const reviewId = review.review_id as string

      const approve = await regPost(
        baseUrl,
        `/api/v1/apps/${appId}/reviews/${reviewId}/approve`,
        { adminSubject: selfAdmin.userId, authTime: NOW() },
      )
      expect(approve.status).toBe(403)
      expect(approve.body.error).toBe('SELF_REVIEW_FORBIDDEN')

      const reject = await regPost(
        baseUrl,
        `/api/v1/apps/${appId}/reviews/${reviewId}/reject`,
        { adminSubject: selfAdmin.userId, authTime: NOW(), body: { reason: '自己审自己' } },
      )
      expect(reject.status).toBe(403)
      expect(reject.body.error).toBe('SELF_REVIEW_FORBIDDEN')

      // 记录状态未被污染
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('submitted')
      expect(row?.reviewer).toBeNull()
    })
  })

  it('reject：无原因 → 400 INVALID_REASON；有原因 → 200 落库，rejected 后可回炉重提', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId } = await submit(baseUrl, fixture)
      // 无原因 → 400
      const noReason = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/reject`,
        { adminSubject: admin.userId, authTime: NOW(), body: {} },
      )
      expect(noReason.status).toBe(400)
      expect(noReason.body.error).toBe('INVALID_REASON')
      // 原记录仍是 submitted
      expect((await findReviewById(db.sql, reviewId))?.status).toBe('submitted')

      // 有原因 → 200
      const ok = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/reject`,
        { adminSubject: admin.userId, authTime: NOW(), body: { reason: '隐私政策缺失，补充后重新提交' } },
      )
      expect(ok.status).toBe(200)
      const review = ok.body.review as Record<string, unknown>
      expect(review.status).toBe('rejected')
      expect(review.decision).toBe('rejected')
      expect(review.decision_reason).toBe('隐私政策缺失，补充后重新提交')
      expect(review.reviewer).toBe(admin.userId)

      // rejected 可回炉：重新提交（内容变更）→ 新 pending version=2
      const changed = cloneBody(fixture.baseBody)
      const domains = changed.data_domains as Array<Record<string, unknown>>
      domains[0]!.purpose = '查询成绩（已补充隐私政策说明）'
      const resubmit = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews`,
        { devSubject: fixture.developer.subject, body: changed },
      )
      expect(resubmit.status).toBe(201)
      expect((resubmit.body.review as Record<string, unknown>).version).toBe(2)
      expect((resubmit.body.review as Record<string, unknown>).status).toBe('submitted')
    })
  })

  it('非法状态迁移 → 409（approve 一条已 rejected 的记录）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId } = await submit(baseUrl, fixture)
      const rejected = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/reject`,
        { adminSubject: admin.userId, authTime: NOW(), body: { reason: '驳回' } },
      )
      expect(rejected.status).toBe(200)
      const approveRejected = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(approveRejected.status).toBe(409)
      expect(approveRejected.body.error).toBe('INVALID_TRANSITION')
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('rejected')
      expect(row?.decision).toBe('rejected')
    })
  })

  it('收据：updateArtifactReceipts 写入后可按 review 读回（管理员列表含 artifact_receipts）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId } = await submit(baseUrl, fixture)
      const approved = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(approved.status).toBe(200)

      // provisioner 写入回执（此处由测试直接走仓库层，模拟 provisioner 路径）
      const at = new Date().toISOString()
      const written = await updateArtifactReceipts(db.sql, reviewId, {
        catalog: { at, result: 'ok' },
        casdoor: { at, result: 'failed', detail: '模拟：casdoor 不可达' },
      })
      expect(written).toBe(true)

      // 管理员列表按 review 读回
      const list = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, { adminSubject: admin.userId })
      expect(list.status).toBe(200)
      const reviews = list.body.reviews as Array<Record<string, unknown>>
      const target = reviews.find((r) => r.review_id === reviewId)
      const receipts = target?.artifact_receipts as Record<string, { result: string; detail?: string }>
      expect(receipts?.catalog?.result).toBe('ok')
      expect(receipts?.casdoor?.result).toBe('failed')
      expect(receipts?.casdoor?.detail).toBe('模拟：casdoor 不可达')

      // owner 视角不含内部回执
      const ownerList = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: fixture.developer.subject,
      })
      expect(ownerList.status).toBe(200)
      const ownerReviews = ownerList.body.reviews as Array<Record<string, unknown>>
      const ownerTarget = ownerReviews.find((r) => r.review_id === reviewId)
      expect(ownerTarget?.status).toBe('approved')
      expect(ownerTarget?.decision_reason).toBeNull()
      expect(ownerTarget?.artifact_receipts).toBeUndefined()
    })
  })

  it('列表：管理员可见全部状态（含 superseded）；无 admin 身份 → 401；无角色 → 403', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const plain = await createPlainUser(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 提交两版（第一版将被 supersede）
      await submit(baseUrl, fixture)
      const changed = cloneBody(fixture.baseBody)
      const domains = changed.data_domains as Array<Record<string, unknown>>
      domains[0]!.purpose = '用途变更'
      await regPost(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: fixture.developer.subject,
        body: changed,
      })

      // 无身份（无 admin/developer 头）→ 401
      const unauth = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`)
      expect(unauth.status).toBe(401)
      expect(unauth.body.error).toBe('UNAUTHORIZED')

      // 已登录但无角色 → 403
      const forbidden = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, { adminSubject: plain.userId })
      expect(forbidden.status).toBe(403)
      expect(forbidden.body.error).toBe('ADMIN_FORBIDDEN')

      // 管理员：全部状态可见
      const list = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, { adminSubject: admin.userId })
      expect(list.status).toBe(200)
      const reviews = list.body.reviews as Array<Record<string, unknown>>
      expect(list.body.total).toBe(2)
      const statuses = reviews.map((r) => r.status)
      expect(statuses).toContain('submitted')
      expect(statuses).toContain('superseded')
    })
  })

  it('step-up 与鉴权：无 admin 身份 → 401；无角色 → 403；auth-time 过期 → 403；review 不属于该 app → 404', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const plain = await createPlainUser(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId } = await submit(baseUrl, fixture)
      const approvePath = `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`

      // 无 admin 身份 → 401
      const unauth = await regPost(baseUrl, approvePath, {})
      expect(unauth.status).toBe(401)
      expect(unauth.body.error).toBe('ADMIN_UNAUTHORIZED')

      // 已登录但无角色 → 403
      const forbidden = await regPost(baseUrl, approvePath, { adminSubject: plain.userId, authTime: NOW() })
      expect(forbidden.status).toBe(403)
      expect(forbidden.body.error).toBe('ADMIN_FORBIDDEN')

      // step-up 过期（1 小时前认证，窗口 600s）→ 403 STEP_UP_REQUIRED
      const staleAuth = await regPost(baseUrl, approvePath, {
        adminSubject: admin.userId,
        authTime: NOW() - 3600,
      })
      expect(staleAuth.status).toBe(403)
      expect(staleAuth.body.error).toBe('STEP_UP_REQUIRED')
      // 未认证头（缺失）同样 fail closed
      const noAuth = await regPost(baseUrl, approvePath, { adminSubject: admin.userId })
      expect(noAuth.status).toBe(403)
      expect(noAuth.body.error).toBe('STEP_UP_REQUIRED')

      // review 不属于路径中的应用（IDOR）→ 404
      const otherApp = `other_${Math.random().toString(36).slice(2, 10)}`
      const idor = await regPost(
        baseUrl,
        `/api/v1/apps/${otherApp}/reviews/${reviewId}/approve`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(idor.status).toBe(404)
      expect(idor.body.error).toBe('REVIEW_NOT_FOUND')
    })
  })

  it('服务令牌缺失 + 伪造 x-admin-subject → 401 且 handler 未执行（PROTECTED_PREFIXES 回归）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { reviewId } = await submit(baseUrl, fixture)
      const approvePath = `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`

      // 不携带服务令牌，伪造管理员身份头
      const forged = await regPost(baseUrl, approvePath, {
        adminSubject: admin.userId,
        authTime: NOW(),
        serviceToken: false,
      })
      expect(forged.status).toBe(401)
      expect(forged.body.error).toBe('unauthorized')

      // handler 未执行：审核记录状态未变、无 approve 审计
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('submitted')
      expect(row?.reviewer).toBeNull()
      const audit = await db.sql.query<{ n: string | number }>(
        "SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'APP_REVIEW_APPROVED'",
      )
      expect(Number(audit.rows[0]?.n ?? 0)).toBe(0)
    })
  })
})
