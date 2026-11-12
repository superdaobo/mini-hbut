/**
 * P4-4（mini-hbut#1219）自建注册表退役 —— 审批/驳回端点契约测试
 * （原 decision.test.ts 改写）。
 *
 * 权威源变更：自建注册表（app_registry_reviews）不再是权威源；权威源 =
 * 仓库 manifest/apps.json + PR 审核。approve/reject 端点一律 410 Gone +
 * 固定响应体（与 submit/provision 同一契约，domain/app-registry/retired.ts）：
 *   {"error":"registry_retired","message":"应用接入改由清单仓库 + PR 审核（见 manifest/README.md）"}
 *
 * 本文件覆盖：
 * - POST approve / reject → 410 Gone + 固定响应体（无论 review 是否存在，
 *   固定响应先于一切 DB 读取/身份解析）；
 * - 服务令牌回归：无令牌/伪造令牌 → 401（中间件仍在 router 之前）；
 * - 服务层兜底：approveReview/rejectReview（admin/reviews.ts）直接调用
 *   即抛 RegistryRetiredError（fail closed，任何调用链不得再经此写库）；
 * - 只读回归：GET 列表管理员通道 200（审核历史仍可查询）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { createAdminUser } from '../admin/helpers.js'
import {
  createRegistryFixture,
  buildAppRegistryApp,
  regGet,
  regPost,
} from './helpers.js'
import { listReviewsByApp } from '../../../src/db/repos/app_registry.repo.js'
import { approveReview, rejectReview } from '../../../src/api/admin/reviews.js'
import { RegistryRetiredError } from '../../../src/domain/app-registry/retired.js'

/** 410 固定响应体（P4-4 冻结契约，与 domain/app-registry/retired.ts 一致） */
const RETIRED_BODY = {
  error: 'registry_retired',
  message: '应用接入改由清单仓库 + PR 审核（见 manifest/README.md）',
}

describe('P4-4 注册表退役：审批/驳回端点 410 Gone 契约', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('POST approve → 410 Gone + 固定响应体（即使 admin 身份合法）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/rv-nonexistent/approve`,
        { adminSubject: admin.userId, body: {} },
      )
      expect(res.status).toBe(410)
      expect(res.body).toEqual(RETIRED_BODY)
    })
  })

  it('POST reject → 410 Gone + 固定响应体', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/rv-nonexistent/reject`,
        { adminSubject: admin.userId, body: { reason: '不同意' } },
      )
      expect(res.status).toBe(410)
      expect(res.body).toEqual(RETIRED_BODY)
    })
  })

  it('服务令牌仍在 router 之前：无令牌/伪造令牌 → 401（先于 410）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const path = `/api/v1/apps/${fixture.appId}/reviews/rv-x/approve`
      const noToken = await regPost(baseUrl, path, { serviceToken: false, body: {} })
      expect(noToken.status).toBe(401)

      const forged = await regPost(baseUrl, path, { serviceToken: 'wrong-token', body: {} })
      expect(forged.status).toBe(401)
    })
  })

  it('服务层兜底：approveReview/rejectReview 直接调用抛 RegistryRetiredError', async () => {
    // 不经 HTTP 的任何调用链（脚本/对账/遗留代码）同样 fail closed
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
    // 库中零写入
    expect((await listReviewsByApp(db.sql, 'reg_nobody')).length).toBe(0)
  })
})

describe('P4-4 注册表退役：审核历史只读回归', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('GET 列表（管理员通道）仍 200：审核历史可查询', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regGet(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        adminSubject: admin.userId,
      })
      expect(res.status).toBe(200)
      expect(res.body.total).toBe(0)
    })
  })
})
