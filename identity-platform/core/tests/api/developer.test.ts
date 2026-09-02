/**
 * #687 Developer API 测试（直挂 registerDeveloperRoutes，不经 service-token 中间件——
 * 测试环境未配置 service-token 时该中间件本就不在装配路径上）。
 *
 * 身份链路：x-developer-subject（pairwise sub）→ resolveUserIdBySubject → user_id
 *   → developers 表 → 应用 owner 校验。因此 harness 需要：
 *  - 一个 client_id = 'developer-portal' 的应用 + redirect_uri（resolveSector 用 host 作 sector）；
 *  - 测试 pairwise key（TEST_PAIRWISE_KEY），sub 由 derivePairwiseSubject(sector, userId) 推导。
 *
 * 覆盖：
 *  1. PATCH 更新 name/description/contact 成功且 DB 真实落库（contact 白名单修复）；
 *  2. detail 返回 secret 元数据 last4 / fingerprint 非 null 且值正确；
 *  3. GET scopes 返回 scope 列表；
 *  4. 越权/状态机兜底：无 subject 401；pending_review PATCH 409；active 应用元数据可编辑并写审计。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Koa from 'koa'
import Router from '@koa/router'
import type { SqlExecutor } from '../../src/db/types.js'
import { registerDeveloperRoutes } from '../../src/api/developer/index.js'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { withServer } from '../helpers.js'
import { createClientFixture, type ClientFixture } from '../helpers/fixtures.js'
import { insertDeveloper } from '../helpers/developers.js'
import { TEST_KEK, TEST_PAIRWISE_KEY } from '../helpers/keys.js'
import { derivePairwiseSubject } from '../../src/domain/subjects.js'
import { createUserWithHbutIdentity } from '../../src/domain/users.js'
import { newUuidV7 } from '../../src/domain/ids.js'
import {
  findApplicationByClientId,
  insertApplication,
  replaceRedirectUris,
} from '../../src/db/repos/clients.repo.js'
import { sha256Base64url } from '../../src/security/hash.js'

/** developer-portal 登录应用的 redirect host（resolveSector 取它作 pairwise sector） */
const PORTAL_SECTOR = 'portal.example.com'

/** 组装仅含 developer 路由的 Koa app（生产由 api/index.ts 统一装配 + service-token 保护） */
function buildDeveloperApp(sql: SqlExecutor): Koa {
  const app = new Koa()
  const router = new Router()
  registerDeveloperRoutes(router, {
    sql,
    pairwiseKey: TEST_PAIRWISE_KEY,
    clientSecretKek: TEST_KEK,
  })
  app.use(router.routes())
  app.use(router.allowedMethods())
  return app
}

/** 首次访问前置：插入 client_id='developer-portal' 应用（sector 解析依赖其 redirect_uri） */
async function seedPortalClient(sql: SqlExecutor): Promise<void> {
  const { userId } = await createUserWithHbutIdentity(sql, {
    studentId: `2023${Math.floor(Math.random() * 900000) + 100000}`,
    studentName: '门户占位用户',
  })
  const ownerDevId = newUuidV7()
  await insertDeveloper(sql, { id: ownerDevId, userId, displayName: '门户占位开发者' })
  const portalAppId = newUuidV7()
  await insertApplication(sql, {
    id: portalAppId,
    client_id: 'developer-portal',
    owner_developer_id: ownerDevId,
    name: '开发者门户',
    client_type: 'web_confidential',
    token_endpoint_auth_method: 'client_secret_basic',
  })
  await replaceRedirectUris(sql, portalAppId, [
    { uri: `https://${PORTAL_SECTOR}/callback`, kind: 'web_https' },
  ])
}

/** BFF 会话 sub 的测试推导：与 subject-resolution.ts 的 sector 语义一致 */
function subjectFor(userId: string): string {
  return derivePairwiseSubject({
    pairwiseKey: TEST_PAIRWISE_KEY,
    sectorOrClientId: PORTAL_SECTOR,
    userId,
  })
}

interface DevResponse {
  status: number
  body: Record<string, unknown>
}

function devHeaders(subject?: string): Record<string, string> {
  return subject ? { 'x-developer-subject': subject } : {}
}

async function devGet(baseUrl: string, path: string, subject?: string): Promise<DevResponse> {
  const res = await fetch(`${baseUrl}${path}`, { headers: devHeaders(subject) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function devPatch(
  baseUrl: string,
  path: string,
  body: unknown,
  subject?: string,
): Promise<DevResponse> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...devHeaders(subject) },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('#687 developer API', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
    await seedPortalClient(db.sql)
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('1. 无 x-developer-subject → 401 unauthorized', async () => {
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await devGet(baseUrl, '/api/v1/developer/me')
      expect(res.status).toBe(401)
      expect(res.body.error).toBe('unauthorized')
    })
  })

  it('2. PATCH 更新 name/description/contact 成功且 DB 落库（contact 白名单修复）', async () => {
    const fixture: ClientFixture = await createClientFixture(db.sql, {
      status: 'draft',
      scopes: ['openid'],
    })
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await devPatch(
        baseUrl,
        `/api/v1/developer/apps/${fixture.applicationId}`,
        { name: '改名后的应用', description: '新描述', contact: 'dev@example.com' },
        subjectFor(fixture.userId),
      )
      expect(res.status).toBe(200)
      const updated = res.body.app as Record<string, unknown>
      expect(updated.name).toBe('改名后的应用')
      expect(updated.description).toBe('新描述')
      // 此前 UPDATABLE_COLUMNS 缺 contact → patch 被拒；修复后必须真实返回
      expect(updated.contact).toBe('dev@example.com')

      // DB 层确认落库（不只看响应体）
      const row = await findApplicationByClientId(db.sql, fixture.clientId)
      expect(row?.name).toBe('改名后的应用')
      expect(row?.description).toBe('新描述')
      expect(row?.contact).toBe('dev@example.com')
    })
  })

  it('3. detail 返回 secret 元数据 last4/fingerprint 非 null 且值正确', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'draft', scopes: ['openid'] })
    expect(fixture.clientSecret).toBeTruthy() // web_confidential 创建时必有明文（仅此一次）
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await devGet(
        baseUrl,
        `/api/v1/developer/apps/${fixture.applicationId}`,
        subjectFor(fixture.userId),
      )
      expect(res.status).toBe(200)
      const detail = res.body.app as Record<string, unknown>
      const secret = detail.secret as Record<string, string | null>
      // 占位 null 已替换为真实元数据：末 4 位 + 完整指纹（sha256Base64url）
      expect(secret.last4).toBe((fixture.clientSecret as string).slice(-4))
      expect(secret.fingerprint).toBe(sha256Base64url(fixture.clientSecret as string))
      // 库中无轮换时间列：保持 null（不谎造）
      expect(secret.last_rotated_at).toBeNull()
      // 明文绝不能出现在响应里
      expect(JSON.stringify(res.body)).not.toContain(fixture.clientSecret as string)
    })
  })

  it('4. GET scopes 返回 scope 列表（scope/status/justification）', async () => {
    const fixture = await createClientFixture(db.sql, {
      status: 'active',
      scopes: ['openid', 'profile'],
    })
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await devGet(
        baseUrl,
        `/api/v1/developer/apps/${fixture.applicationId}/scopes`,
        subjectFor(fixture.userId),
      )
      expect(res.status).toBe(200)
      const scopes = res.body.scopes as Array<{ scope: string; status: string; justification: string | null }>
      expect(scopes.map((s) => s.scope).sort()).toEqual(['openid', 'profile'])
      for (const s of scopes) {
        expect(s.status).toBe('approved')
        expect(s.justification).toBeNull()
      }
    })
  })

  it('5. active 应用 PATCH 元数据 → 成功落库并写审计（#692 后续放开）', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'active', scopes: ['openid'] })
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await devPatch(
        baseUrl,
        `/api/v1/developer/apps/${fixture.applicationId}`,
        { name: '上架后改名', description: '上架后新简介' },
        subjectFor(fixture.userId),
      )
      expect(res.status).toBe(200)
      const updated = res.body.app as Record<string, unknown>
      expect(updated.name).toBe('上架后改名')
      // 审计：developer.app_updated 落库（元数据编辑可追溯）
      const audit = await db.sql.query(
        `SELECT event_type FROM audit_events WHERE target_id = $1 AND event_type = 'developer.app_updated'`,
        [fixture.applicationId],
      )
      expect(audit.rows.length).toBe(1)
      const row = await findApplicationByClientId(db.sql, fixture.clientId)
      expect(row?.name).toBe('上架后改名')
    })
  })

  it('5b. pending_review 应用 PATCH → 409 invalid_state（审核中编辑会使审核失效）', async () => {
    const fixture = await createClientFixture(db.sql, {
      status: 'pending_review',
      scopes: ['openid'],
    })
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await devPatch(
        baseUrl,
        `/api/v1/developer/apps/${fixture.applicationId}`,
        { name: '审核中改名尝试' },
        subjectFor(fixture.userId),
      )
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('invalid_state')
    })
  })

  it('6. 非本人应用 → 404 not_found（owner 过滤，防枚举）', async () => {
    const owner = await createClientFixture(db.sql, { status: 'draft', scopes: ['openid'] })
    const stranger = await createClientFixture(db.sql, { status: 'draft', scopes: ['openid'] })
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // stranger 的 sub 访问 owner 的应用
      const res = await devGet(
        baseUrl,
        `/api/v1/developer/apps/${owner.applicationId}`,
        subjectFor(stranger.userId),
      )
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('not_found')    
    })
  })

  it('7. pending_review 应用 PATCH → 409 invalid_state（审核中编辑会使审核失效）', async () => {
    const fixture: ClientFixture = await createClientFixture(db.sql, {
      status: 'pending_review',
      scopes: ['openid'],
    })
    const app = buildDeveloperApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await devPatch(
        baseUrl,
        `/api/v1/developer/apps/${fixture.applicationId}`,
        { name: '改名尝试' },
        subjectFor(fixture.userId),
      )
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('invalid_state')
    })
  })
})
