/**
 * T12（mini-hbut#1170）provision 端点测试（provision.routes.ts）：
 * - 未配置适配器/快照读取器 → 503 provisioner_not_configured，且库里状态未变；
 * - 成功路径 → 200 + 状态 approved→provisioned + APP_PROVISIONED 审计事件存在；
 * - 部分失败（目录写入失败）→ 200 + 状态仍为 approved + 返回 failures + 回执落库；
 * - 安全阀（数据域未登记）→ 409 provision_stopped + 可读 stopReason + 零适配器调用 + 状态未变；
 * - 记录不存在 → 404；状态不对（submitted）→ 409；
 * - 鉴权：无 admin 身份 → 401；有身份无角色 → 403；step-up 缺失 → 403。
 *
 * 全部使用假适配器 + 假快照读取器（createTestDatabase + withServer，学 decision.test.ts 风格）；
 * 不连真实 Casdoor、不发任何网络请求。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Koa from 'koa'
import Router from '@koa/router'
import type { SqlExecutor } from '../../../src/db/types.js'
import { createTestDatabase, type TestDatabase } from '../../helpers/pg.js'
import { withServer } from '../../helpers.js'
import { createAdminUser, createPlainUser } from '../admin/helpers.js'
import {
  TEST_PAIRWISE_KEY,
} from '../../helpers/keys.js'
import {
  TEST_SERVICE_TOKEN,
  createRegistryFixture,
  seedPortalClient,
  regPost,
  type RegistryFixture,
} from './helpers.js'
import { registerAppRegistryRoutes } from '../../../src/api/app-registry/index.js'
import { serviceTokenMiddleware } from '../../../src/security/service-token.js'
import { findReviewById } from '../../../src/db/repos/app_registry.repo.js'
import type { ProvisioningDeps } from '../../../src/api/app-registry/provision.routes.js'
import type { ProvisionAdapters } from '../../../src/api/app-registry/provisioner.js'

const NOW = () => Math.floor(Date.now() / 1000)

/** 目录展示元数据（embedded → internal；与审核记录无关的展示字段）。 */
const PRESENTATION = {
  name: '成绩查询',
  icon: 'grades.png',
  summary: '查询成绩',
  kind: 'internal' as const,
}

type AdapterName = 'casdoor' | 'policy' | 'catalog' | 'module'

interface FakeAdapters {
  adapters: ProvisionAdapters
  /** 按调用顺序记录的适配器名（断言 ①→②→③ 与零调用用）。 */
  calls: AdapterName[]
}

/** 假适配器工厂：默认成功；可对指定产物注入失败原因（适配器契约：返回 { ok:false } 不抛异常）。 */
function makeFakeAdapters(fail: Partial<Record<AdapterName, string>> = {}): FakeAdapters {
  const calls: AdapterName[] = []
  const call = (name: AdapterName) => {
    calls.push(name)
    const failReason = fail[name]
    return failReason !== undefined ? { ok: false as const, error: failReason } : { ok: true as const }
  }
  return {
    calls,
    adapters: {
      casdoor: { writeAppConfig: async () => call('casdoor') },
      policy: { writePolicies: async () => call('policy') },
      catalog: { publishEntry: async () => call('catalog') },
      module: { registerArtifact: async () => call('module') },
    },
  }
}

/** 现状快照读取器：空现状 → 领域 plan 全部产物为 create（module 因无模块产物被领域判 skip）。 */
const emptySnapshot = {
  read: async () => ({ casdoor: null, policy: [], catalog: null, module: null }),
}

/** 构造 provision 编排层依赖（注入假适配器 + 空现状快照）。 */
function makeProvisioning(opts: {
  allowedDomains?: readonly string[]
  fail?: Partial<Record<AdapterName, string>>
} = {}): { provisioning: ProvisioningDeps; calls: AdapterName[] } {
  const fake = makeFakeAdapters(opts.fail ?? {})
  return {
    provisioning: {
      adapters: fake.adapters,
      snapshot: emptySnapshot,
      presentation: PRESENTATION,
      allowedDomains: opts.allowedDomains ?? ['school.grades'],
    },
    calls: fake.calls,
  }
}

/** 组装仅含 T12 路由的 Koa app（服务令牌在 router 之前，与 buildAppRegistryApp 同装配）；provisioning 可注入。 */
function buildProvisionApp(sql: SqlExecutor, provisioning?: ProvisioningDeps): Koa {
  const app = new Koa()
  app.use(async (ctx, next) => {
    ctx.state.requestId = 'test_prov_0001'
    await next()
  })
  app.use(serviceTokenMiddleware({ token: TEST_SERVICE_TOKEN, env: { IDENTITY_ENVIRONMENT: 'test' } }))
  const router = new Router()
  registerAppRegistryRoutes(router, {
    sql,
    pairwiseKey: TEST_PAIRWISE_KEY,
    developerClientId: 'developer-portal',
    env: { IDENTITY_PAIRWISE_SUBJECT_KEY: TEST_PAIRWISE_KEY },
    provisioning,
  })
  app.use(router.routes())
  app.use(router.allowedMethods())
  return app
}

async function auditCount(sql: SqlExecutor, eventType: string): Promise<number> {
  const result = await sql.query<{ n: string | number }>(
    'SELECT COUNT(*) AS n FROM audit_events WHERE event_type = $1',
    [eventType],
  )
  return Number(result.rows[0]?.n ?? 0)
}

describe('T12 provision 端点 /provision', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
    await seedPortalClient(db.sql)
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 提交并批准，返回 review id（provision 的前置状态 approved） */
  async function submitAndApprove(
    baseUrl: string,
    fixture: RegistryFixture,
    adminUserId: string,
  ): Promise<string> {
    const res = await regPost(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
      devSubject: fixture.developer.subject,
      body: fixture.baseBody,
    })
    expect(res.status).toBe(201)
    const reviewId = (res.body.review as Record<string, unknown>).review_id as string
    const approved = await regPost(
      baseUrl,
      `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/approve`,
      { adminSubject: adminUserId, authTime: NOW() },
    )
    expect(approved.status).toBe(200)
    return reviewId
  }

  it('未配置适配器/快照读取器 → 503 provisioner_not_configured，且库里状态未变', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    // 未注入 provisioning → fail closed
    const app = buildProvisionApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const reviewId = await submitAndApprove(baseUrl, fixture, admin.userId)
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/provision`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('provisioner_not_configured')
      // 库里状态未变（未被空实现"假装成功"）
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('approved')
    })
  })

  it('成功路径 → 200 + 状态变 provisioned + 审计事件存在 + 适配器按 ①②③ 各调一次', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { provisioning, calls } = makeProvisioning()
    const app = buildProvisionApp(db.sql, provisioning)
    await withServer(app, async (baseUrl) => {
      const reviewId = await submitAndApprove(baseUrl, fixture, admin.userId)
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/provision`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(res.status).toBe(200)
      expect(res.body.reviewId).toBe(reviewId)
      expect(res.body.allSucceeded).toBe(true)
      expect(res.body.suggestedStatus).toBe('provisioned')
      const steps = res.body.steps as Array<Record<string, unknown>>
      expect(steps).toHaveLength(4)

      // 适配器：①Casdoor → ②策略 → ③目录；④模块因无 module 产物被领域判 skip（零调用）
      expect(calls).toEqual(['casdoor', 'policy', 'catalog'])

      // 状态落库 provisioned
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('provisioned')

      // 审计事件存在
      expect(await auditCount(db.sql, 'APP_PROVISIONED')).toBe(1)
    })
  })

  it('部分失败（目录写入失败）→ 200 + 状态仍为 approved + 返回 failures + 回执落库', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { provisioning, calls } = makeProvisioning({
      fail: { catalog: '模拟：目录目标不可达' },
    })
    const app = buildProvisionApp(db.sql, provisioning)
    await withServer(app, async (baseUrl) => {
      const reviewId = await submitAndApprove(baseUrl, fixture, admin.userId)
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/provision`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(res.status).toBe(200)
      expect(res.body.allSucceeded).toBe(false)
      const failures = res.body.failures as Array<{ artifact: string; error: string }>
      expect(failures).toHaveLength(1)
      expect(failures[0]?.artifact).toBe('catalog')
      expect(failures[0]?.error).toBe('模拟：目录目标不可达')
      expect(res.body.receiptsSaved).toBe(true)

      // 前序产物仍被调用、失败产物不中断后续（此处 module 本就该 skip）
      expect(calls).toEqual(['casdoor', 'policy', 'catalog'])

      // 状态未改（仍为 approved）+ 回执已写回（catalog=failed）
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('approved')
      expect(row?.artifact_receipts.catalog?.result).toBe('failed')
      expect(row?.artifact_receipts.catalog?.detail).toBe('模拟：目录目标不可达')

      // 未全部成功 → 不写 provision 审计
      expect(await auditCount(db.sql, 'APP_PROVISIONED')).toBe(0)
    })
  })

  it('安全阀（申请未登记数据域）→ 409 provision_stopped + stopReason + 零适配器调用 + 状态未变', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    // 数据域全集不含审核记录申请的 school.grades → 领域安全阀整轮停止（退出码 2）
    const { provisioning, calls } = makeProvisioning({ allowedDomains: ['forum', 'schedule'] })
    const app = buildProvisionApp(db.sql, provisioning)
    await withServer(app, async (baseUrl) => {
      const reviewId = await submitAndApprove(baseUrl, fixture, admin.userId)
      const res = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/provision`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('provision_stopped')
      expect(String(res.body.stop_reason)).toContain('school.grades')

      // 安全阀：零次适配器调用
      expect(calls).toEqual([])
      // 状态未变、回执未动
      const row = await findReviewById(db.sql, reviewId)
      expect(row?.status).toBe('approved')
      expect(Object.keys(row?.artifact_receipts ?? {})).toHaveLength(0)
    })
  })

  it('记录不存在 → 404；状态不对（submitted）→ 409 INVALID_STATE', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const { provisioning } = makeProvisioning()
    const app = buildProvisionApp(db.sql, provisioning)
    await withServer(app, async (baseUrl) => {
      // 记录不存在 → 404
      const missing = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/01999999-0000-7000-8000-000000000099/provision`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(missing.status).toBe(404)
      expect(missing.body.error).toBe('REVIEW_NOT_FOUND')

      // 状态不对：submitted 直接 provision → 409 INVALID_STATE
      const res = await regPost(baseUrl, `/api/v1/apps/${fixture.appId}/reviews`, {
        devSubject: fixture.developer.subject,
        body: fixture.baseBody,
      })
      expect(res.status).toBe(201)
      const reviewId = (res.body.review as Record<string, unknown>).review_id as string
      const wrong = await regPost(
        baseUrl,
        `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/provision`,
        { adminSubject: admin.userId, authTime: NOW() },
      )
      expect(wrong.status).toBe(409)
      expect(wrong.body.error).toBe('INVALID_STATE')
      // 状态未被污染
      expect((await findReviewById(db.sql, reviewId))?.status).toBe('submitted')
    })
  })

  it('鉴权：无 admin 身份 → 401；有身份无角色 → 403；step-up 缺失 → 403', async () => {
    const fixture = await createRegistryFixture(db.sql)
    const admin = await createAdminUser(db.sql, { role: 'identity_reviewer' })
    const plain = await createPlainUser(db.sql)
    const { provisioning } = makeProvisioning()
    const app = buildProvisionApp(db.sql, provisioning)
    await withServer(app, async (baseUrl) => {
      const reviewId = await submitAndApprove(baseUrl, fixture, admin.userId)
      const provisionPath = `/api/v1/apps/${fixture.appId}/reviews/${reviewId}/provision`

      // 无 admin 身份 → 401
      const unauth = await regPost(baseUrl, provisionPath, {})
      expect(unauth.status).toBe(401)
      expect(unauth.body.error).toBe('ADMIN_UNAUTHORIZED')

      // 已登录但无角色 → 403
      const forbidden = await regPost(baseUrl, provisionPath, { adminSubject: plain.userId, authTime: NOW() })
      expect(forbidden.status).toBe(403)
      expect(forbidden.body.error).toBe('ADMIN_FORBIDDEN')

      // 有角色但缺 step-up（未带 x-admin-auth-time）→ 403（fail closed）
      const noStepUp = await regPost(baseUrl, provisionPath, { adminSubject: admin.userId })
      expect(noStepUp.status).toBe(403)
      expect(noStepUp.body.error).toBe('STEP_UP_REQUIRED')

      // 以上全部被拦：状态未变、无审计
      expect((await findReviewById(db.sql, reviewId))?.status).toBe('approved')
      expect(await auditCount(db.sql, 'APP_PROVISIONED')).toBe(0)
    })
  })
})
