/**
 * P4-4（mini-hbut#1219）自建注册表退役 —— 提交端点契约测试（原 submit.test.ts 改写）。
 *
 * 权威源变更：自建注册表（app_registry_reviews）不再是权威源；权威源 =
 * 仓库 manifest/apps.json + PR 审核。写端点一律 410 Gone + 固定响应体：
 *   {"error":"registry_retired","message":"应用接入改由清单仓库 + PR 审核（见 manifest/README.md）"}
 *
 * 本文件覆盖：
 * - POST 提交 → 410 Gone + 固定响应体，且 DB 零写入（fail closed 的读侧验证）；
 * - 服务令牌回归：410 发生在 router 内、服务令牌中间件仍在 router 之前
 *   （无令牌/伪造令牌 → 401，先于 410）；
 * - 只读路径保留：GET 列表（管理员通道 200 + 空列表；开发者通道 owner 视图
 *   200、非本人 404、无身份 401）。review 行改用 raw SQL 直接插入
 *   （insertReview 写方法已退役，调用即抛 RegistryRetiredError）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqlExecutor } from '../../../src/db/types.js'
import { newUuidV7 } from '../../../src/domain/ids.js'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { createAdminUser } from '../admin/helpers.js'
import {
  createRegistryFixture,
  seedPortalClient,
  buildAppRegistryApp,
  regGet,
  regPost,
  type RegistryFixture,
} from './helpers.js'
import { listReviewsByApp } from '../../../src/db/repos/app_registry.repo.js'

/** 410 固定响应体（P4-4 冻结契约，与 domain/app-registry/retired.ts 一致） */
const RETIRED_BODY = {
  error: 'registry_retired',
  message: '应用接入改由清单仓库 + PR 审核（见 manifest/README.md）',
}

/**
 * raw SQL 直接插入一条审核记录（测试专用；生产写路径已退役）。
 * 列约束见 migrations/0010_app_registry_reviews.sql（revision 必须 64 位 hex）。
 */
async function insertReviewRowDirect(
  sql: SqlExecutor,
  fixture: RegistryFixture,
  overrides: { status?: string } = {},
): Promise<string> {
  const id = newUuidV7()
  await sql.query(
    `INSERT INTO app_registry_reviews
       (id, app_id, version, revision, form, entry, redirect_uris, allowed_groups,
        data_domains, compat, module, casdoor, owner, submitted_by, status)
     VALUES ($1, $2, 1, $3, 'embedded', 'more://test', $4, $5, $6, $7, NULL, $8, $9, $10, $11)`,
    [
      id,
      fixture.appId,
      'a'.repeat(64),
      JSON.stringify(fixture.baseBody.redirect_uris),
      JSON.stringify(fixture.baseBody.allowed_groups),
      JSON.stringify(fixture.baseBody.data_domains),
      JSON.stringify(fixture.baseBody.compat),
      JSON.stringify(fixture.baseBody.casdoor),
      fixture.developer.developerId,
      fixture.developer.userId,
      overrides.status ?? 'submitted',
    ],
  )
  return id
}

describe('P4-4 注册表退役：提交端点 410 Gone 契约', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
    // developer-portal 登录应用（pairwise sector 解析依赖其 redirect_uri）
    await seedPortalClient(db.sql)
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('POST 提交 → 410 Gone + 固定响应体；DB 零写入', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regPost(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: fixture.developer.subject,
        body: fixture.baseBody,
      })
      expect(res.status).toBe(410)
      expect(res.body).toEqual(RETIRED_BODY)
      // 写路径退役：库中不得出现任何审核行
      expect((await listReviewsByApp(db.sql, fixture.appId)).length).toBe(0)
    })
  })

  it('服务令牌仍在 router 之前：无令牌/伪造令牌 → 401（先于 410）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const noToken = await regPost(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: fixture.developer.subject,
        serviceToken: false,
        body: fixture.baseBody,
      })
      expect(noToken.status).toBe(401)

      const forged = await regPost(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: fixture.developer.subject,
        serviceToken: 'wrong-token',
        body: fixture.baseBody,
      })
      expect(forged.status).toBe(401)
      expect((await listReviewsByApp(db.sql, fixture.appId)).length).toBe(0)
    })
  })
})

describe('P4-4 注册表退役：只读列表路径保留', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
    // developer-portal 登录应用（pairwise sector 解析依赖其 redirect_uri）
    await seedPortalClient(db.sql)
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('管理员通道：无记录 → 200 + 空列表', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        adminSubject: admin.userId,
      })
      expect(res.status).toBe(200)
      expect(res.body.app_id).toBe(fixture.appId)
      expect(res.body.total).toBe(0)
      expect(res.body.reviews).toEqual([])
    })
  })

  it('开发者通道：owner 本人 → 200 + owner 视图（不含 artifact_receipts）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const reviewId = await insertReviewRowDirect(db.sql, fixture)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: fixture.developer.subject,
      })
      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      const first = (res.body.reviews as Array<Record<string, unknown>>)[0]! // total=1 已断言，必有首行
      expect(first.review_id).toBe(reviewId)
      expect(first.status).toBe('submitted')
      // owner 视图不含 provisioner 内部回执
      expect(first.artifact_receipts).toBeUndefined()
    })
  })

  it('开发者通道：非本人应用 → 404（防枚举，与不存在一致）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    await insertReviewRowDirect(db.sql, fixture)
    const stranger = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: stranger.developer.subject,
      })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('REVIEW_NOT_FOUND')
    })
  })

  it('无身份信息 → 401（fail closed）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`)
      expect(res.status).toBe(401)
    })
  })
})
