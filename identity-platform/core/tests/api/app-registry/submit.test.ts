/**
 * T12（mini-hbut#1170）应用注册审核 —— 提交端点测试：
 * - 提交 → 201 落库（version=1, status=submitted）；
 * - 同内容重复提交 → 200 幂等重放（返回既有 pending，不新增行、不重复审计）；
 * - 内容变更后重复提交 → 旧 pending superseded + 新建 version+1；
 * - 校验失败 → 400（redirect_uris 空 / release_seq 回退）；
 * - 鉴权：无 developer 身份 → 401；非 owner 开发者看他人应用 → 404（防枚举）；
 * - 服务令牌缺失 + 伪造头 → 401 且 handler 未执行（回归：PROTECTED_PREFIXES 被回退时本测试必挂）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import {
  buildAppRegistryApp,
  createRegistryFixture,
  seedPortalClient,
  regPost,
  regGet,
  cloneBody,
} from './helpers.js'
import { findPendingByApp, listReviewsByApp } from '../../../src/db/repos/app_registry.repo.js'

describe('T12 提交 /api/v1/apps/:appId/reviews', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
    await seedPortalClient(db.sql)
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('提交 → 201 落库（version=1, status=submitted）；同内容重复提交 → 200 幂等重放不新增行', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const path = `/api/v1/apps/${fixture.appId}/reviews`
      const first = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: cloneBody(fixture.baseBody) })
      expect(first.status).toBe(201)
      expect(first.body.created).toBe(true)
      expect(first.body.idempotency).toBe('created')
      const review1 = first.body.review as Record<string, unknown>
      expect(review1.app_id).toBe(fixture.appId)
      expect(review1.version).toBe(1)
      expect(review1.status).toBe('submitted')
      expect(review1.owner).toBe(fixture.developer.developerId)
      expect(review1.submitted_by).toBe(fixture.developer.userId)
      expect(typeof review1.revision).toBe('string')
      expect((review1.revision as string).length).toBe(64)

      // 同内容重复提交：幂等重放，返回既有 pending，不新增行
      const replay = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: cloneBody(fixture.baseBody) })
      expect(replay.status).toBe(200)
      expect(replay.body.created).toBe(false)
      expect(replay.body.idempotency).toBe('replay')
      const replayReview = replay.body.review as Record<string, unknown>
      expect(replayReview.review_id).toBe(review1.review_id)
      expect(replayReview.version).toBe(1)

      const rows = await listReviewsByApp(db.sql, fixture.appId)
      expect(rows.length).toBe(1)
      expect(rows[0]?.id).toBe(review1.review_id)
    })
  })

  it('内容变更后重复提交 → 旧 pending 被 superseded，新记录 version+1', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const path = `/api/v1/apps/${fixture.appId}/reviews`
      const first = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: cloneBody(fixture.baseBody) })
      expect(first.status).toBe(201)
      const review1 = first.body.review as Record<string, unknown>

      // 内容变更（data_domains 用途变化 → revision 变化）
      const changed = cloneBody(fixture.baseBody)
      const domains = changed.data_domains as Array<Record<string, unknown>>
      domains[0]!.purpose = '查询成绩并导出给第三方'
      const second = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: changed })
      expect(second.status).toBe(201)
      expect(second.body.created).toBe(true)
      expect(second.body.idempotency).toBe('superseded')
      expect(second.body.superseded_review_id).toBe(review1.review_id)
      const review2 = second.body.review as Record<string, unknown>
      expect(review2.version).toBe(2)
      expect(review2.status).toBe('submitted')
      expect(review2.revision).not.toBe(review1.revision)

      // 旧记录 superseded（单 pending 不变量：只剩一条 submitted）
      const old = await findPendingByApp(db.sql, fixture.appId)
      expect(old?.id).toBe(review2.review_id)
      const rows = await listReviewsByApp(db.sql, fixture.appId)
      expect(rows.length).toBe(2)
      const superseded = rows.find((r) => r.id === review1.review_id)
      expect(superseded?.status).toBe('superseded')
    })
  })

  it('校验失败 → 400（redirect_uris 为空 / release_seq 回退）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const path = `/api/v1/apps/${fixture.appId}/reviews`

      // redirect_uris 为空 → 400 MISSING_FIELD（领域层 assertSubmittable）
      const emptyUris = cloneBody(fixture.baseBody)
      emptyUris.redirect_uris = []
      const r1 = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: emptyUris })
      expect(r1.status).toBe(400)
      expect(r1.body.error).toBe('MISSING_FIELD')

      // release_seq 单调：先提交 remote 模块 seq=5，再提交 seq=3 → 400 RELEASE_SEQ_REGRESSION
      const remote = cloneBody(fixture.baseBody)
      remote.module = {
        manifest_url: 'https://cdn.example.com/manifest.json',
        artifact_url: 'https://cdn.example.com/app.v1.zip',
        publisher_key_id: 'pk_test_0001',
        release_seq: 5,
      }
      const r2 = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: remote })
      expect(r2.status).toBe(201)

      const remoteOld = cloneBody(fixture.baseBody)
      const domains = remoteOld.data_domains as Array<Record<string, unknown>>
      domains[0]!.purpose = '用途调整（配合新包）'
      remoteOld.module = {
        manifest_url: 'https://cdn.example.com/manifest.json',
        artifact_url: 'https://cdn.example.com/app.v2.zip',
        publisher_key_id: 'pk_test_0001',
        release_seq: 3,
      }
      const r3 = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: remoteOld })
      expect(r3.status).toBe(400)
      expect(r3.body.error).toBe('RELEASE_SEQ_REGRESSION')
    })
  })

  it('鉴权：无 developer 身份 → 401；非 owner 开发者查他人应用 → 404（防枚举）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const other = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const path = `/api/v1/apps/${fixture.appId}/reviews`
      // 无身份头 → 401
      const unauth = await regPost(baseUrl, path, { body: cloneBody(fixture.baseBody) })
      expect(unauth.status).toBe(401)
      expect(unauth.body.error).toBe('UNAUTHORIZED')

      const first = await regPost(baseUrl, path, { devSubject: fixture.developer.subject, body: cloneBody(fixture.baseBody) })
      expect(first.status).toBe(201)

      // 他人（非 owner）查该应用列表 → 404（不泄露存在性）
      const outsider = await regGet(baseUrl, path, { devSubject: other.developer.subject })
      expect(outsider.status).toBe(404)
      expect(outsider.body.error).toBe('REVIEW_NOT_FOUND')
    })
  })

  it('服务令牌缺失 + 伪造 x-developer-subject → 401 且 handler 未执行（PROTECTED_PREFIXES 回归）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const path = `/api/v1/apps/${fixture.appId}/reviews`
      // 不携带服务令牌（serviceToken: false），伪造 developer 身份头
      const forged = await regPost(baseUrl, path, {
        devSubject: fixture.developer.subject,
        serviceToken: false,
        body: cloneBody(fixture.baseBody),
      })
      // 服务令牌中间件在 router 之前拦截（#626 Threat 11）：401 unauthorized
      expect(forged.status).toBe(401)
      expect(forged.body.error).toBe('unauthorized')
      // handler 未执行：数据库里没有任何该应用的审核记录，也没有任何审计事件
      const rows = await listReviewsByApp(db.sql, fixture.appId)
      expect(rows.length).toBe(0)
      const audit = await db.sql.query<{ n: string | number }>(
        "SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'APP_REVIEW_SUBMITTED'",
      )
      expect(Number(audit.rows[0]?.n ?? 0)).toBe(0)

      // 令牌错误（伪造值）同样被拦
      const wrongToken = await regPost(baseUrl, path, {
        devSubject: fixture.developer.subject,
        serviceToken: 'forged-token-not-the-real-one',
        body: cloneBody(fixture.baseBody),
      })
      expect(wrongToken.status).toBe(401)
      expect(wrongToken.body.error).toBe('unauthorized')
    })
  })
})
