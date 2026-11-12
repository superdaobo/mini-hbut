/**
 * P4-4（mini-hbut#1219）自建注册表退役 —— provision 端点契约测试
 * （原 provision.test.ts 改写）。
 *
 * 权威源变更：自建注册表（app_registry_reviews）不再是权威源；权威源 =
 * 仓库 manifest/apps.json + PR 审核。provision 端点与 submit/approve/reject
 * 一并退役：一律 410 Gone + 固定响应体（domain/app-registry/retired.ts）：
 *   {"error":"registry_retired","message":"应用接入改由清单仓库 + PR 审核（见 manifest/README.md）"}
 *
 * 本文件覆盖：
 * - POST provision → 410 Gone + 固定响应体（固定响应先于一切 DB 读取/
 *   身份解析/适配器调用，无审计、无状态变更）；
 * - 服务令牌回归：无令牌/伪造令牌 → 401（中间件仍在 router 之前）。
 *
 * 说明：编排层纯逻辑（runProvisioning）的领域测试保留在 provisioner.test.ts
 * （该文件不经过本路由，不受退役影响）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { createAdminUser } from '../admin/helpers.js'
import {
  createRegistryFixture,
  buildAppRegistryApp,
  regPost,
} from './helpers.js'

/** 410 固定响应体（P4-4 冻结契约，与 domain/app-registry/retired.ts 一致） */
const RETIRED_BODY = {
  error: 'registry_retired',
  message: '应用接入改由清单仓库 + PR 审核（见 manifest/README.md）',
}

describe('P4-4 注册表退役：provision 端点 410 Gone 契约', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('POST provision → 410 Gone + 固定响应体（即使 admin 身份合法）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/rv-nonexistent/provision`,
        { adminSubject: admin.userId, body: {} },
      )
      expect(res.status).toBe(410)
      expect(res.body).toEqual(RETIRED_BODY)
    })
  })

  it('服务令牌仍在 router 之前：无令牌/伪造令牌 → 401（先于 410）', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const app = buildAppRegistryApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const path = `/api/v1/apps/${fixture.appId}/reviews/rv-x/provision`
      const noToken = await regPost(baseUrl, path, { serviceToken: false, body: {} })
      expect(noToken.status).toBe(401)

      const forged = await regPost(baseUrl, path, { serviceToken: 'wrong-token', body: {} })
      expect(forged.status).toBe(401)
    })
  })
})
