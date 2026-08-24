/**
 * #688 账户级 API Key 测试：
 * - 签发：明文只出现一次、库中只有 hash、列表不泄露明文/hash；
 * - Bearer 认证：/me 全链路；无效 Key 401；吊销后 403 API_KEY_REVOKED；
 *   过期 403 API_KEY_EXPIRED；
 * - 应用管理镜像：Bearer 创建应用 → 列表 → 详情全链路；
 * - 管理面（x-developer-subject）：GET /keys 无敏感值；DELETE 吊销；
 * - 限流分组存在性冒烟（apiKeyRead open / apiKeyWrite closed）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Koa from 'koa'
import Router from '@koa/router'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { withServer } from '../helpers.js'
import { createClientFixture } from '../helpers/fixtures.js'
import {
  TEST_KEK,
  TEST_PAIRWISE_KEY,
} from '../helpers/keys.js'
import { registerAccountRoutes } from '../../src/api/account/index.js'
import { insertApiKey } from '../../src/db/repos/api-keys.repo.js'
import { hmacSha256Base64url } from '../../src/security/hash.js'
import { DEFAULT_RATE_LIMIT_GROUPS } from '../../src/security/rate-limit.js'
import { derivePairwiseSubject } from '../../src/domain/subjects.js'

/** 组装仅含 account 路由的 Koa app（测试用；生产由 app.ts + api/index.ts 组装） */
function buildAccountApp(sql: TestDatabase['sql']): Koa {
  const app = new Koa()
  const router = new Router()
  registerAccountRoutes(router, {
    sql,
    pairwiseKey: TEST_PAIRWISE_KEY,
    env: { IDENTITY_CLIENT_SECRET_KEK: TEST_KEK },
  })
  app.use(router.routes())
  app.use(router.allowedMethods())
  return app
}

/** 开发者门户 subject 解析依赖 client_id='developer-portal' 的注册记录 */
async function insertDeveloperPortalClient(
  sql: TestDatabase['sql'],
  developerId: string,
): Promise<void> {
  await sql.query(
    `INSERT INTO oauth_applications (id, client_id, owner_developer_id, name, client_type, status)
     VALUES ('app_dev_portal', 'developer-portal', $1, '开发者门户', 'web_confidential', 'active')`,
    [developerId],
  )
  await sql.query(
    `INSERT INTO oauth_redirect_uris (id, application_id, redirect_uri, kind)
     VALUES ('ru_dev_portal', 'app_dev_portal', 'https://developer.example.com/cb', 'web_https')`,
  )
}

/** 由内部 user_id 派生门户会话 sub（sector = portal redirect host，与 resolveUserIdBySubject 一致） */
function developerSubject(userId: string): string {
  return derivePairwiseSubject({
    pairwiseKey: TEST_PAIRWISE_KEY,
    sectorOrClientId: 'developer.example.com',
    userId,
  })
}

interface IssuedKey {
  key: string
  id: string
}

/** 经管理面签发一把 Key（返回明文；契约：明文只此一次） */
async function issueKey(baseUrl: string, subject: string, name: string): Promise<{ status: number; body: Record<string, unknown>; issued?: IssuedKey }> {
  const res = await fetch(`${baseUrl}/api/v1/developer/keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-developer-subject': subject },
    body: JSON.stringify({ name }),
  })
  const body = (await res.json()) as Record<string, unknown>
  return {
    status: res.status,
    body,
    issued: res.status === 201
      ? {
          key: body.key as string,
          id: (body.info as Record<string, unknown>).id as string,
        }
      : undefined,
  }
}

async function bearerRequest(
  baseUrl: string,
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (token !== null) {
    headers.authorization = `Bearer ${token}`
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) {
    return { status: res.status, body: {} }
  }
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('#688 账户级 API Key（签发/Bearer 认证/account 端点）', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 标准夹具：user+developer+已有应用 + portal client（供 subject 解析） */
  async function setupFixture(): Promise<{ userId: string; subject: string; applicationId: string }> {
    const fixture = await createClientFixture(db.sql, {})
    await insertDeveloperPortalClient(db.sql, fixture.developerId)
    return {
      userId: fixture.userId,
      subject: developerSubject(fixture.userId),
      applicationId: fixture.applicationId,
    }
  }

  it('签发：明文只返回一次且匹配契约形态；库中只存 hash；列表无敏感值', async () => {
    const fx = await setupFixture()
    const app = buildAccountApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await issueKey(baseUrl, fx.subject, '我的第一把 Key')
      expect(res.status).toBe(201)
      const full = res.issued!.key
      // 冻结契约形态：mhbat_<8位小写hex>_<43位base64url>
      expect(full).toMatch(/^mhbat_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/)
      expect((res.body.info as Record<string, unknown>).prefix).toBe(full.slice(0, 14))

      // 库中只存 sha256Base64url(整串)，绝不存明文
      const row = await db.sql.query<{ secret_hash: string }>(
        'SELECT secret_hash FROM api_keys WHERE prefix = $1',
        [full.slice(0, 14)],
      )
      expect(row.rows[0]?.secret_hash).toBe(hmacSha256Base64url(TEST_KEK, full))
      expect(row.rows[0]?.secret_hash).not.toContain(full)

      // 管理面 GET：无明文/无 hash
      const list = await fetch(`${baseUrl}/api/v1/developer/keys`, {
        headers: { 'x-developer-subject': fx.subject },
      })
      expect(list.status).toBe(200)
      const listBody = (await list.json()) as { keys: Array<Record<string, unknown>> }
      expect(listBody.keys).toHaveLength(1)
      expect(listBody.keys[0]?.name).toBe('我的第一把 Key')
      expect(listBody.keys[0]?.status).toBe('active')
      const serialized = JSON.stringify(listBody)
      expect(serialized).not.toContain('secret_hash')
      expect(serialized).not.toContain(full)
      expect(serialized).not.toContain(hmacSha256Base64url(TEST_KEK, full))
    })
  })

  it('签发校验：缺 name → 400 invalid_request；未认证 subject → 401', async () => {
    await setupFixture()
    const app = buildAccountApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const noName = await fetch(`${baseUrl}/api/v1/developer/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-developer-subject': 'whatever' },
        body: JSON.stringify({}),
      })
      // subject 非法先于 name 校验（fail closed）
      expect(noName.status).toBe(401)

      const validSub = (await createClientFixture(db.sql, {})).userId
      const sub = developerSubject(validSub)
      const emptyName = await fetch(`${baseUrl}/api/v1/developer/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-developer-subject': sub },
        body: JSON.stringify({ name: '   ' }),
      })
      expect(emptyName.status).toBe(400)
      expect(((await emptyName.json()) as Record<string, unknown>).error).toBe('invalid_request')
    })
  })

  it('Bearer /me 全链路：返回 user_id 与 key 元数据（不含 secret/hash）', async () => {
    const fx = await setupFixture()
    const app = buildAccountApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { issued } = await issueKey(baseUrl, fx.subject, 'me-key')
      const me = await bearerRequest(baseUrl, 'GET', '/api/v1/account/me', issued!.key)
      expect(me.status).toBe(200)
      expect(me.body.user_id).toBe(fx.userId)
      const key = me.body.key as Record<string, unknown>
      expect(key.prefix).toBe(issued!.key.slice(0, 14))
      expect(key.scopes).toEqual(['account.full'])
      const serialized = JSON.stringify(me.body)
      expect(serialized).not.toContain(issued!.key.slice(14))
      expect(serialized).not.toContain('secret_hash')
    })
  })

  it('Bearer 创建应用 → 列表 → 详情全链路（身份来自 Key 归属账户）', async () => {
    const fx = await setupFixture()
    const app = buildAccountApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { issued } = await issueKey(baseUrl, fx.subject, 'apps-key')
      const token = issued!.key

      const created = await bearerRequest(baseUrl, 'POST', '/api/v1/account/apps', token, {
        name: 'API Key 创建的应用',
        description: '经账户级 Key 直连创建',
        client_type: 'web_confidential',
        redirect_uris: [{ uri: 'https://agent.example.com/cb', kind: 'web_https' }],
        scopes: [{ scope: 'openid' }, { scope: 'profile' }],
      })
      expect(created.status).toBe(201)
      const newAppId = created.body.id as string
      expect(typeof created.body.client_id).toBe('string')

      const list = await bearerRequest(baseUrl, 'GET', '/api/v1/account/apps', token)
      expect(list.status).toBe(200)
      const apps = list.body.apps as Array<Record<string, unknown>>
      expect(apps.map((a) => a.id)).toContain(newAppId)
      // 夹具预置应用同样可见（同账户归属）
      expect(apps.map((a) => a.id)).toContain(fx.applicationId)

      const detail = await bearerRequest(baseUrl, 'GET', `/api/v1/account/apps/${newAppId}`, token)
      expect(detail.status).toBe(200)
      expect((detail.body.app as Record<string, unknown>).name).toBe('API Key 创建的应用')

      // 提交审核（draft → pending_review）
      const submitted = await bearerRequest(baseUrl, 'POST', `/api/v1/account/apps/${newAppId}/submit`, token, {})
      expect(submitted.status).toBe(200)

      // 设备列表（本账户为空数组起步）
      const devices = await bearerRequest(baseUrl, 'GET', '/api/v1/account/devices', token)
      expect(devices.status).toBe(200)
      expect(devices.body.devices).toEqual([])
    })
  })

  it('无效 Key：缺失头 / 乱串 / 格式合法但不存在 → 统一 401 API_KEY_INVALID', async () => {
    await setupFixture()
    const app = buildAccountApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const noHeader = await bearerRequest(baseUrl, 'GET', '/api/v1/account/me', null)
      expect(noHeader.status).toBe(401)
      expect(noHeader.body.error).toBe('API_KEY_INVALID')

      const garbage = await bearerRequest(baseUrl, 'GET', '/api/v1/account/me', 'garbage-token')
      expect(garbage.status).toBe(401)
      expect(garbage.body.error).toBe('API_KEY_INVALID')

      const wrongScheme = await fetch(`${baseUrl}/api/v1/account/me`, {
        headers: { authorization: 'Basic mhbat_00000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      })
      expect(wrongScheme.status).toBe(401)

      const unknownPrefix = await bearerRequest(
        baseUrl,
        'GET',
        '/api/v1/account/me',
        `mhbat_00000000_${'a'.repeat(43)}`,
      )
      expect(unknownPrefix.status).toBe(401)
      expect(unknownPrefix.body.error).toBe('API_KEY_INVALID')

      // 篡改主体（prefix 存在但 hash 不匹配）
      const { issued } = await issueKey(baseUrl, developerSubject((await createClientFixture(db.sql, {})).userId), 'tamper')
      const tampered = `${issued!.key.slice(0, -1)}${issued!.key.endsWith('a') ? 'b' : 'a'}`
      const tamperedRes = await bearerRequest(baseUrl, 'GET', '/api/v1/account/me', tampered)
      expect(tamperedRes.status).toBe(401)
      expect(tamperedRes.body.error).toBe('API_KEY_INVALID')
    })
  })

  it('吊销后 → 403 API_KEY_REVOKED；重复吊销幂等 204；吊销写审计', async () => {
    const fx = await setupFixture()
    const app = buildAccountApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const { issued } = await issueKey(baseUrl, fx.subject, 'revoke-me')
      const token = issued!.key

      // 吊销前可用
      const before = await bearerRequest(baseUrl, 'GET', '/api/v1/account/me', token)
      expect(before.status).toBe(200)

      const del = await fetch(`${baseUrl}/api/v1/developer/keys/${issued!.id}`, {
        method: 'DELETE',
        headers: { 'x-developer-subject': fx.subject },
      })
      expect(del.status).toBe(204)

      // 吊销后 Bearer → 403 API_KEY_REVOKED
      const after = await bearerRequest(baseUrl, 'GET', '/api/v1/account/me', token)
      expect(after.status).toBe(403)
      expect(after.body.error).toBe('API_KEY_REVOKED')

      // 幂等重放吊销仍 204
      const again = await fetch(`${baseUrl}/api/v1/developer/keys/${issued!.id}`, {
        method: 'DELETE',
        headers: { 'x-developer-subject': fx.subject },
      })
      expect(again.status).toBe(204)

      // 审计：key_created / key_revoked 各一条，metadata 只含 key_id/name/prefix
      const auditRows = await db.sql.query<{ event_type: string; metadata_json: unknown }>(
        "SELECT event_type, metadata_json FROM audit_events WHERE target_type = 'api_key' ORDER BY event_type",
      )
      const types = auditRows.rows.map((r) => r.event_type)
      expect(types).toContain('developer.key_created')
      expect(types).toContain('developer.key_revoked')
      for (const r of auditRows.rows) {
        const meta = (typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json) : r.metadata_json) as Record<string, unknown>
        expect(Object.keys(meta).sort()).toEqual(['key_id', 'name', 'prefix'])
      }
    })
  })

  it('过期 Key → 403 API_KEY_EXPIRED；非本人吊销 → 404 防枚举', async () => {
    const fx = await setupFixture()
    const other = await createClientFixture(db.sql, {})
    const app = buildAccountApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 手工插入一把已过期的 Key（形态合法）
      const expiredFull = `mhbat_deadbeef_${'a'.repeat(43)}`
      await insertApiKey(db.sql, {
        id: 'ak_expired_fixture',
        userId: fx.userId,
        name: '过期 Key',
        prefix: 'mhbat_deadbeef',
        secretHash: hmacSha256Base64url(TEST_KEK, expiredFull),
      })
      await db.sql.query("UPDATE api_keys SET expires_at = NOW() - INTERVAL '1 day' WHERE id = 'ak_expired_fixture'")
      const expiredRes = await bearerRequest(baseUrl, 'GET', '/api/v1/account/me', expiredFull)
      expect(expiredRes.status).toBe(403)
      expect(expiredRes.body.error).toBe('API_KEY_EXPIRED')

      // 非本人 DELETE → 404（防枚举）
      const { issued } = await issueKey(baseUrl, fx.subject, 'others-key')
      const foreignSubject = developerSubject(other.userId)
      const forbiddenDel = await fetch(`${baseUrl}/api/v1/developer/keys/${issued!.id}`, {
        method: 'DELETE',
        headers: { 'x-developer-subject': foreignSubject },
      })
      expect(forbiddenDel.status).toBe(404)
    })
  })

  it('限流分组存在性冒烟：apiKeyRead(open) / apiKeyWrite(closed) 覆盖 account 前缀', () => {
    const read = DEFAULT_RATE_LIMIT_GROUPS.find((g) => g.name === 'apiKeyRead')
    const write = DEFAULT_RATE_LIMIT_GROUPS.find((g) => g.name === 'apiKeyWrite')
    expect(read).toBeDefined()
    expect(read?.rule.failPolicy).toBe('open')
    expect(read?.methods).toContain('GET')
    expect(write).toBeDefined()
    expect(write?.rule.failPolicy).toBe('closed')
    expect(write?.methods).toEqual(expect.arrayContaining(['POST', 'PATCH', 'PUT', 'DELETE']))
    for (const g of [read, write]) {
      expect(g?.prefixes).toContain('/api/v1/account/')
    }
  })
})
