/**
 * #700 授权数据快照 API 测试（父 #697）：
 * - 上传 201：响应 { snapshot_id, expires_at=now+7d }，DB 只存密文（明文不落库）；
 * - 无效 handoff / 缺失 Device 签名 → 401；
 * - 同 user+client 重传 → 覆盖单行（不堆积历史）；
 * - 不同 client 不串读：(user_id, client_id) 强绑定；
 * - claims 注入成功与缺席（use='userinfo' 才注入；scope/快照双重门控）；
 * - revoked 设备签名拒；
 * - scope 越权（超出本次批准范围）→ 400；
 * - 应用 revoke → 快照级联删除。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { withServer } from '../helpers.js'
import {
  buildApp,
  buildEnrollBody,
  newTestDeviceKey,
  postJson,
  type TestDeviceKey,
} from './helpers.js'
import { createClientFixture } from '../helpers/fixtures.js'
import { TEST_KEK, TEST_HANDOFF_HMAC_KEY } from '../helpers/keys.js'
import { createAuthRequest } from '../../src/domain/auth-requests/service.js'
import { createEnrollmentChallenge, revokeDevice } from '../../src/domain/devices.js'
import { buildDeviceApiCanonical } from '../../src/api/app/canonical.js'
import { setClientStatus } from '../../src/domain/clients.js'
import { accountFinder } from '../../src/oidc/account.js'
import { findActiveByUserAndClient } from '../../src/db/repos/data-snapshots.repo.js'

const SNAPSHOT_PATH = '/api/v1/app/data-snapshots'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

describe('#700 data-snapshots API', () => {
  let db: TestDatabase
  let previousKek: string | undefined

  beforeEach(async () => {
    db = await createTestDatabase()
    // 快照加解密统一走 TEST_KEK（与生产同路径，仅环境变量值不同）
    previousKek = process.env.IDENTITY_CLIENT_SECRET_KEK
    process.env.IDENTITY_CLIENT_SECRET_KEK = TEST_KEK
  })
  afterEach(async () => {
    if (previousKek === undefined) {
      delete process.env.IDENTITY_CLIENT_SECRET_KEK
    } else {
      process.env.IDENTITY_CLIENT_SECRET_KEK = previousKek
    }
    await db.cleanup()
  })

  /** 通过 enroll API 注册一台设备，返回 device_id / user_id */
  async function enrollDevice(key: TestDeviceKey, studentId = '2023010101'): Promise<{
    deviceId: string
    userId: string
  }> {
    // enroll 只需有效 handoff（绑定任意活跃 client fixture 即可，与 scope 无关）
    const fixture = await createClientFixture(db.sql, { scopes: ['openid', 'profile'] })
    const request = await createAuthRequest(db.sql, {
      interactionUid: `iu_${randomUUID().replaceAll('-', '')}`,
      clientId: fixture.clientId,
      requestedScopes: ['openid', 'profile'],
      handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
    })
    const { challenge } = await createEnrollmentChallenge(db.sql, {
      purpose: 'device_enrollment',
      ttlSeconds: 300,
    })
    const app = buildApp(db.sql)
    let result: { status: number; body: Record<string, unknown> } = { status: 0, body: {} }
    await withServer(app, async (baseUrl) => {
      result = await postJson(
        baseUrl,
        '/api/v1/app/devices/enroll',
        buildEnrollBody({
          key,
          challenge,
          studentId,
          studentName: '张三',
        }),
        { authorization: `Handoff ${request.handoffSecret}` },
      )
    })
    expect(result.status).toBe(201)
    return {
      deviceId: String(result.body.device_id),
      userId: String(result.body.user_id),
    }
  }

  /**
   * 创建一条已批准的 auth_request（含数据域 scope），返回 handoff secret 与 client_id。
   * 快照上传的 Handoff 双因子要求该会话处于已批准链路状态。
   */
  async function createApprovedHandoff(opts: {
    userId: string
    deviceId: string
    scopes?: string[]
    /** 复用既有 client（同一应用再次授权） */
    clientId?: string
  }): Promise<{ clientId: string; handoffSecret: string }> {
    const scopes = opts.scopes ?? ['openid', 'student.grades.read']
    const fixture = opts.clientId ? null : await createClientFixture(db.sql, { scopes })
    const clientId = opts.clientId ?? fixture!.clientId
    const request = await createAuthRequest(db.sql, {
      interactionUid: `iu_${randomUUID().replaceAll('-', '')}`,
      clientId,
      requestedScopes: scopes,
      handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
    })
    await db.sql.query(
      `UPDATE auth_requests
          SET status = 'APPROVED', opened_at = NOW(), approved_at = NOW(),
              approved_user_id = $1, approved_device_id = $2
        WHERE id = $3`,
      [opts.userId, opts.deviceId, request.requestId],
    )
    return { clientId, handoffSecret: request.handoffSecret }
  }

  /** 构造 POST data-snapshots 的 Device 签名认证头 */
  function deviceAuthHeader(key: TestDeviceKey, deviceId: string): string {
    const issuedAt = Math.floor(Date.now() / 1000)
    const nonce = randomUUID().replaceAll('-', '')
    const canonical = buildDeviceApiCanonical({
      method: 'POST',
      path: SNAPSHOT_PATH,
      deviceId,
      issuedAt,
      nonce,
    })
    return `Device ${deviceId} ${issuedAt} ${nonce} ${key.sign(canonical)}`
  }

  async function uploadSnapshot(
    baseUrl: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return postJson(baseUrl, SNAPSHOT_PATH, body, headers)
  }

  function buildUploadBody(opts: {
    handoffSecret: string
    scopes?: string[]
    grades?: unknown
    timetable?: unknown
    fetchedAt?: string
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    if (opts.grades !== undefined) payload.grades = opts.grades
    if (opts.timetable !== undefined) payload.timetable = opts.timetable
    if (opts.fetchedAt !== undefined || opts.grades !== undefined || opts.timetable !== undefined) {
      payload.fetched_at = opts.fetchedAt ?? new Date().toISOString()
    }
    return {
      handoff: opts.handoffSecret,
      scopes: opts.scopes ?? ['student.grades.read'],
      payload,
    }
  }

  it('1. 上传 201：响应 snapshot_id/expires_at(+7d)，DB 只存密文且审计留痕', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key)
    const { clientId, handoffSecret } = await createApprovedHandoff({ userId, deviceId })

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const before = Date.now()
      const res = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({
          handoffSecret,
          grades: [{ course: '高等数学', score: 95 }],
          fetchedAt: '2026-08-24T08:00:00.000Z',
        }),
      )
      const after = Date.now()
      expect(res.status).toBe(201)
      expect(String(res.body.snapshot_id)).toMatch(/^[0-9a-f-]{36}$/)
      const expiresAt = new Date(String(res.body.expires_at)).getTime()
      // expires_at = now + 7 天（±5s 时钟容差）
      expect(expiresAt).toBeGreaterThanOrEqual(before + SEVEN_DAYS_MS - 5000)
      expect(expiresAt).toBeLessThanOrEqual(after + SEVEN_DAYS_MS + 5000)
    })

    // DB 断言：只存密文，明文绝不出现在任何列
    const rows = await db.sql.query<{ payload_enc: string; scope_set: unknown; client_id: string; user_id: string; fetched_at: Date | null }>(
      'SELECT * FROM data_snapshots WHERE user_id = $1',
      [userId],
    )
    expect(rows.rows.length).toBe(1)
    const row = rows.rows[0]!
    expect(row.client_id).toBe(clientId)
    expect(row.payload_enc).toMatch(/^enc:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
    expect(row.payload_enc).not.toContain('高等数学')
    expect(row.payload_enc).not.toContain('course')
    expect(row.fetched_at).not.toBeNull()

    // 审计：snapshot_uploaded 留痕（不含业务数据）
    const audit = await db.sql.query<{ event_type: string; metadata_json: unknown }>(
      "SELECT event_type, metadata_json FROM audit_events WHERE event_type = 'snapshot_uploaded'",
    )
    expect(audit.rows.length).toBe(1)
    const meta = JSON.stringify(audit.rows[0]!.metadata_json)
    expect(meta).not.toContain('高等数学')
  })

  it('2. 无效凭据拒绝：伪造/缺失 handoff → 401；缺失 Device 签名 → 401', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key)
    const { handoffSecret } = await createApprovedHandoff({ userId, deviceId })

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 完全没有 Authorization 头
      const noAuth = await uploadSnapshot(
        baseUrl,
        {},
        buildUploadBody({ handoffSecret, grades: { gpa: 3.8 } }),
      )
      expect(noAuth.status).toBe(401)
      expect((noAuth.body.error as { code: string }).code).toBe('DEVICE_AUTH_FAILED')

      // 有效 Device 签名 + 无效 handoff
      const badHandoff = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret: 'A'.repeat(64), grades: { gpa: 3.8 } }),
      )
      expect(badHandoff.status).toBe(401)
      expect((badHandoff.body.error as { code: string }).code).toBe('INVALID_HANDOFF')

      // DB 无写入
      const rows = await db.sql.query('SELECT * FROM data_snapshots')
      expect(rows.rows.length).toBe(0)
    })
  })

  it('3. 同 user+client 重传覆盖单行：DB 始终一行，内容为最新一次', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key)
    const { handoffSecret } = await createApprovedHandoff({ userId, deviceId })

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const first = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret, grades: { term: '2024-1', gpa: 3.1 } }),
      )
      expect(first.status).toBe(201)
      const second = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret, grades: { term: '2024-2', gpa: 3.9 } }),
      )
      expect(second.status).toBe(201)

      const rows = await db.sql.query<{ id: string }>('SELECT id FROM data_snapshots')
      expect(rows.rows.length).toBe(1)
      // 覆盖语义：(user_id, client_id) 单行 upsert，两次返回同一个 snapshot_id
      expect(String(second.body.snapshot_id)).toBe(String(first.body.snapshot_id))
    })

    const stored = await db.sql.query<{ payload_enc: string }>('SELECT payload_enc FROM data_snapshots')
    // 用同一 KEK 解开验证是第二份数据（走 security 层）
    const { decryptSnapshot } = await import('../../src/security/snapshot-crypto.js')
    const plain = JSON.parse(decryptSnapshot(stored.rows[0]!.payload_enc)) as { grades: { gpa: number } }
    expect(plain.grades.gpa).toBe(3.9)
  })

  it('4. 不同 client 不串读：clientB 无法读到 user 上传给 clientA 的快照', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key, '2023010102')
    const a = await createApprovedHandoff({ userId, deviceId, scopes: ['openid', 'student.grades.read'] })
    const b = await createApprovedHandoff({ userId, deviceId, scopes: ['openid', 'student.grades.read'] })
    expect(a.clientId).not.toBe(b.clientId)

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret: a.handoffSecret, grades: { secret: 'only-for-A' } }),
      )
      expect(res.status).toBe(201)
    })

    // repo 层：(user, clientB) 查不到
    expect(await findActiveByUserAndClient(db.sql, userId, a.clientId)).not.toBeNull()
    expect(await findActiveByUserAndClient(db.sql, userId, b.clientId)).toBeNull()

    // claims 层：clientB 的 userinfo 不含 hbut_grades
    const finder = accountFinder({ sql: db.sql })
    const accountB = await finder({ oidc: { client: { clientId: b.clientId } } }, userId)
    expect(accountB).toBeDefined()
    const claimsB = await accountB!.claims(
      'userinfo',
      new Set(['openid', 'student.grades.read']),
      {},
      [],
    )
    expect(claimsB.hbut_grades).toBeUndefined()

    // clientA 正常读到
    const accountA = await finder({ oidc: { client: { clientId: a.clientId } } }, userId)
    const claimsA = await accountA!.claims(
      'userinfo',
      new Set(['openid', 'student.grades.read']),
      {},
      [],
    )
    expect((claimsA.hbut_grades as { data: { secret: string } }).data.secret).toBe('only-for-A')
  })

  it('5. claims 注入成功与缺席：use=userinfo 注入；id_token/scope 缺失/无快照均缺席', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key, '2023010103')
    const { clientId, handoffSecret } = await createApprovedHandoff({
      userId,
      deviceId,
      scopes: ['openid', 'student.grades.read', 'student.timetable.read'],
    })
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({
          handoffSecret,
          scopes: ['student.grades.read', 'student.timetable.read'],
          grades: [{ course: '数据结构', score: 88 }],
          timetable: { mon: ['高等数学'] },
        }),
      )
      expect(res.status).toBe(201)
    })

    const finder = accountFinder({ sql: db.sql })
    // a) userinfo + 全部数据域 scope → 两个 claim 都注入
    const account = await finder({ oidc: { client: { clientId } } }, userId)
    const full = await account!.claims(
      'userinfo',
      new Set(['openid', 'student.grades.read', 'student.timetable.read']),
      {},
      [],
    )
    expect((full.hbut_grades as { data: Array<Record<string, unknown>> }).data[0]).toEqual({
      course: '数据结构',
      score: 88,
    })
    expect((full.hbut_grades as { fetched_at: string | null }).fetched_at).toBeTruthy()
    expect((full.hbut_timetable as { data: { mon: string[] } }).data.mon).toEqual(['高等数学'])

    // b) use=id_token：绝不注入（快照数据不能进 ID Token）
    const forIdToken = await accountFinder({ sql: db.sql })(
      { oidc: { client: { clientId } } },
      userId,
    )
    const idTokenClaims = await forIdToken!.claims(
      'id_token',
      new Set(['openid', 'student.grades.read']),
      {},
      [],
    )
    expect(idTokenClaims.hbut_grades).toBeUndefined()
    expect(idTokenClaims.hbut_timetable).toBeUndefined()

    // c) scope 不含数据域：即使有快照也缺席
    const narrow = await account!.claims('userinfo', new Set(['openid']), {}, [])
    expect(narrow.hbut_grades).toBeUndefined()

    // d) 无快照的用户：缺席且不报错
    const other = await createClientFixture(db.sql, { scopes: ['openid', 'student.grades.read'] })
    const emptyAccount = await finder({ oidc: { client: { clientId: other.clientId } } }, userId)
    const empty = await emptyAccount!.claims(
      'userinfo',
      new Set(['openid', 'student.grades.read']),
      {},
      [],
    )
    expect(empty.hbut_grades).toBeUndefined()
  })

  it('6. revoked 设备签名拒：吊销后上传 401，且无新快照写入', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key, '2023010104')
    const { handoffSecret } = await createApprovedHandoff({ userId, deviceId })

    // 先成功上传一次
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const ok = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret, grades: { n: 1 } }),
      )
      expect(ok.status).toBe(201)
    })

    // 吊销设备后再上传
    await revokeDevice(db.sql, deviceId, 'user_revoked')
    await withServer(app, async (baseUrl) => {
      const res = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret, grades: { n: 2 } }),
      )
      expect(res.status).toBe(401)
      expect((res.body.error as { code: string }).code).toBe('DEVICE_AUTH_FAILED')
    })

    // 快照内容仍是第一份（n 加密后不可直接断言，行数不变即可 + 解密验证）
    const rows = await db.sql.query<{ payload_enc: string }>('SELECT payload_enc FROM data_snapshots')
    expect(rows.rows.length).toBe(1)
    const { decryptSnapshot } = await import('../../src/security/snapshot-crypto.js')
    const plain = JSON.parse(decryptSnapshot(rows.rows[0]!.payload_enc)) as { grades: { n: number } }
    expect(plain.grades.n).toBe(1)
  })

  it('7. 越权防护：scope 超出本次批准范围 / payload 与 scope 不匹配 → 400', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key, '2023010105')
    // 本次只批了 grades，没批 timetable
    const { handoffSecret } = await createApprovedHandoff({ userId, deviceId, scopes: ['openid', 'student.grades.read'] })

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // a) 声称未批准的 timetable scope
      const resScope = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({
          handoffSecret,
          scopes: ['student.grades.read', 'student.timetable.read'],
          grades: { gpa: 3.2 },
          timetable: { mon: [] },
        }),
      )
      expect(resScope.status).toBe(400)
      expect((resScope.body.error as { code: string }).code).toBe('SNAPSHOT_INVALID_SCOPE')

      // b) 已批 grades 但缺 grades 数据
      const resMissing = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret, grades: undefined }),
      )
      expect(resMissing.status).toBe(400)

      // c) 非法 scope 名
      const resBad = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret, scopes: ['admin.all'], grades: {} }),
      )
      expect(resBad.status).toBe(400)

      // d) 未授权字段混入 payload（只批 grades 却带 timetable 字段）
      const resExtra = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        {
          handoff: handoffSecret,
          scopes: ['student.grades.read'],
          payload: { grades: { gpa: 3.2 }, timetable: { mon: [] }, fetched_at: new Date().toISOString() },
        },
      )
      expect(resExtra.status).toBe(400)

      expect((await db.sql.query('SELECT * FROM data_snapshots')).rows.length).toBe(0)
    })
  })

  it('8. 应用 revoke → 快照级联删除；过期快照读取缺席并被惰性清理', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key, '2023010106')
    const { clientId, handoffSecret } = await createApprovedHandoff({ userId, deviceId })

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret, grades: { v: 'will-vanish' } }),
      )
      expect(res.status).toBe(201)
    })

    // a) 过期：expires_at 改到过去 → repo 读不到 + 惰性删除生效
    await db.sql.query('UPDATE data_snapshots SET expires_at = NOW() - interval \'1 hour\' WHERE user_id = $1', [userId])
    expect(await findActiveByUserAndClient(db.sql, userId, clientId)).toBeNull()
    const finder = accountFinder({ sql: db.sql })
    const account = await finder({ oidc: { client: { clientId } } }, userId)
    await account!.claims('userinfo', new Set(['openid', 'student.grades.read']), {}, [])
    const afterLazy = await db.sql.query('SELECT * FROM data_snapshots WHERE user_id = $1', [userId])
    expect(afterLazy.rows.length).toBe(0)

    // b) 重新上传一份（同一 client）再 revoke 应用 → 快照被级联删除
    const handoff2 = await createApprovedHandoff({
      userId,
      deviceId,
      clientId,
      scopes: ['openid', 'student.grades.read'],
    })
    await withServer(app, async (baseUrl) => {
      const res = await uploadSnapshot(
        baseUrl,
        { authorization: deviceAuthHeader(key, deviceId) },
        buildUploadBody({ handoffSecret: handoff2.handoffSecret, grades: { v: 2 } }),
      )
      expect(res.status).toBe(201)
    })
    await setClientStatus(db.sql, clientId, 'revoked')
    const afterRevoke = await db.sql.query('SELECT * FROM data_snapshots WHERE client_id = $1', [clientId])
    expect(afterRevoke.rows.length).toBe(0)
  })
})
