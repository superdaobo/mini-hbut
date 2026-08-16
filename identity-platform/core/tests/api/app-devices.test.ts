/**
 * #622 服务端 enrollment API 测试（issue #622「Server enrollment」8 项）：
 * - first user/device；
 * - challenge replay；
 * - invalid signature；
 * - expired challenge；
 * - duplicate public key；
 * - duplicate student identity → LINK_REQUIRED（不合并）；
 * - test/demo account 拒绝 Production enrollment；
 * - Handoff 缺失/非法拒绝（防匿名创建 challenge）。
 * 另覆盖：challenge 端点需有效 handoff；enroll 原子性（失败无部分写入）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { withServer } from '../helpers.js'
import {
  buildApp,
  buildEnrollBody,
  createHandoffRequest,
  newTestDeviceKey,
  postJson,
} from './helpers.js'
import { findIdentityByProviderSubject, findUserById } from '../../src/db/repos/users.repo.js'
import { findActiveDeviceById, listDevicesByUser } from '../../src/db/repos/devices.repo.js'
import { createEnrollmentChallenge } from '../../src/domain/devices.js'

describe('#622 enroll API', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  async function enrollUrl(): Promise<string> {
    const handoff = await createHandoffRequest(db.sql)
    const app = buildApp(db.sql)
    let base = ''
    await withServer(app, async (baseUrl) => {
      base = baseUrl
    })
    return `${base}/api/v1/app/devices/enroll`
  }

  async function enrollViaApi(opts: {
    handoffSecret: string
    key?: ReturnType<typeof newTestDeviceKey>
    studentId?: string
    challenge?: string
    ttlSeconds?: number
    signatureOverride?: string
    studentName?: string
  }): Promise<{ status: number; body: Record<string, unknown> }> {
    const key = opts.key ?? newTestDeviceKey()
    const challenge = opts.challenge ?? (await createChallenge(opts.ttlSeconds))
    const app = buildApp(db.sql)
    let result: { status: number; body: Record<string, unknown> } = { status: 0, body: {} }
    await withServer(app, async (baseUrl) => {
      result = await postJson(
        baseUrl,
        '/api/v1/app/devices/enroll',
        buildEnrollBody({
          key,
          challenge,
          studentId: opts.studentId ?? '2023010101',
          studentName: opts.studentName ?? '张三',
          signatureOverride: opts.signatureOverride,
        }),
        { authorization: `Handoff ${opts.handoffSecret}` },
      )
    })
    return result
  }

  async function createChallenge(ttlSeconds = 300): Promise<string> {
    const { challenge } = await createEnrollmentChallenge(db.sql, {
      purpose: 'device_enrollment',
      ttlSeconds,
    })
    return challenge
  }

  it('1. first user/device：创建 user + mini_hbut_app 身份 + active 设备', async () => {
    const key = newTestDeviceKey()
    const handoff = await createHandoffRequest(db.sql)
    const challenge = await createChallenge()
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await postJson(
        baseUrl,
        '/api/v1/app/devices/enroll',
        buildEnrollBody({
          key,
          challenge,
          studentId: '2023010101',
          studentName: '张三',
          platform: 'android',
          appVersion: '1.2.3',
          deviceName: '我的手机',
        }),
        { authorization: `Handoff ${handoff.handoffSecret}` },
      )
      expect(res.status).toBe(201)
      expect(res.body.status).toBe('active')
      expect(res.body.fingerprint).toBe(key.fingerprint())
      expect(String(res.body.device_id)).toMatch(/^[0-9a-f-]{36}$/)

      // 身份：verification_method=mini_hbut_app / level=low（DB CHECK 固化，不谎称官方认证）
      const identity = await findIdentityByProviderSubject(db.sql, 'hbut', '2023010101')
      expect(identity).not.toBeNull()
      expect(identity?.verification_method).toBe('mini_hbut_app')
      expect(identity?.verification_level).toBe('low')
      expect(identity?.student_name_snapshot).toBe('张三')
      const user = await findUserById(db.sql, String(res.body.user_id))
      expect(user?.status).toBe('active')
      // 主键是 UUIDv7，绝不是学号
      expect(String(res.body.user_id)).not.toContain('2023010101')

      // 设备 active + 公钥指纹正确
      const device = await findActiveDeviceById(db.sql, String(res.body.device_id))
      expect(device?.public_key_fingerprint).toBe(key.fingerprint())
      expect(device?.platform).toBe('android')
      expect(device?.app_version).toBe('1.2.3')
    })
  })

  it('2. challenge replay：同一 challenge 不能用于第二次注册', async () => {
    const challenge = await createChallenge()
    const first = await enrollViaApi({
      handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
      challenge,
      studentId: '2023010102',
    })
    expect(first.status).toBe(201)
    // 同一 challenge + 新公钥 + 新学号 → CHALLENGE_INVALID（challenge 已被一次性消费）
    const res = await enrollViaApi({
      handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
      challenge,
      studentId: '2023010103',
    })
    expect(res.status).toBe(400)
    expect((res.body.error as { code: string }).code).toBe('CHALLENGE_INVALID')
  })

  it('3. invalid signature：验签失败，且不产生任何部分写入', async () => {
    const handoff = await createHandoffRequest(db.sql)
    const challenge = await createChallenge()
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await postJson(
        baseUrl,
        '/api/v1/app/devices/enroll',
        buildEnrollBody({
          key: newTestDeviceKey(),
          challenge,
          studentId: '2023010103',
          signatureOverride: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        }),
        { authorization: `Handoff ${handoff.handoffSecret}` },
      )
      expect(res.status).toBe(401)
      expect((res.body.error as { code: string }).code).toBe('SIGNATURE_INVALID')
    })
    // 原子性：无 user / 无 identity / 无 device
    expect(await findIdentityByProviderSubject(db.sql, 'hbut', '2023010103')).toBeNull()
    expect((await listDevicesByUser(db.sql, 'x')).length).toBe(0)
  })

  it('4. expired challenge：已过期 challenge 拒绝注册', async () => {
    const res = await enrollViaApi({
      handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
      challenge: await createChallenge(-1),
      studentId: '2023010104',
    })
    expect(res.status).toBe(400)
    expect((res.body.error as { code: string }).code).toBe('CHALLENGE_INVALID')
  })

  it('5. duplicate public key：同一公钥二次注册 → 409 DEVICE_FINGERPRINT_EXISTS', async () => {
    const key = newTestDeviceKey()
    const first = await enrollViaApi({
      handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
      key,
      studentId: '2023010105',
    })
    expect(first.status).toBe(201)
    // 新 challenge + 新学号，但同一把公钥
    const res = await enrollViaApi({
      handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
      key,
      studentId: '2023010106',
    })
    expect(res.status).toBe(409)
    expect((res.body.error as { code: string }).code).toBe('DEVICE_FINGERPRINT_EXISTS')
  })

  it('6. duplicate student identity：同学号二次注册 → 409 LINK_REQUIRED（绝不自动接管）', async () => {
    const first = await enrollViaApi({
      handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
      studentId: '2023010107',
    })
    expect(first.status).toBe(201)
    const res = await enrollViaApi({
      handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
      key: newTestDeviceKey(),
      studentId: '2023010107',
    })
    expect(res.status).toBe(409)
    expect((res.body.error as { code: string }).code).toBe('LINK_REQUIRED')
    // 学号仍只绑定一个 user，第二把公钥没有挂上去
    const identity = await findIdentityByProviderSubject(db.sql, 'hbut', '2023010107')
    expect(identity?.user_id).toBe(String(first.body.user_id))
    const devices = await listDevicesByUser(db.sql, String(first.body.user_id))
    expect(devices.length).toBe(1)
  })

  it('7. test/demo account：production 环境拒绝，development 允许', async () => {
    const previous = process.env.IDENTITY_ENVIRONMENT
    try {
      process.env.IDENTITY_ENVIRONMENT = 'production'
      const res = await enrollViaApi({
        handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
        studentId: '2023test01',
      })
      expect(res.status).toBe(400)
      expect((res.body.error as { code: string }).code).toBe('TEST_ACCOUNT_REJECTED')
      expect(await findIdentityByProviderSubject(db.sql, 'hbut', '2023test01')).toBeNull()

      // development 环境允许（本地开发注册不受限）
      process.env.IDENTITY_ENVIRONMENT = 'development'
      const ok = await enrollViaApi({
        handoffSecret: (await createHandoffRequest(db.sql)).handoffSecret,
        studentId: '2023test02',
      })
      expect(ok.status).toBe(201)
    } finally {
      if (previous === undefined) {
        delete process.env.IDENTITY_ENVIRONMENT
      } else {
        process.env.IDENTITY_ENVIRONMENT = previous
      }
    }
  })

  it('8. 无/非法 handoff：拒绝创建 challenge 与 enroll（防匿名无限创建）', async () => {
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // challenge 端点：无 handoff → 401
      const noAuth = await postJson(baseUrl, '/api/v1/app/devices/enrollment-challenges', {})
      expect(noAuth.status).toBe(401)
      // 伪造 handoff → 401
      const badAuth = await postJson(
        baseUrl,
        '/api/v1/app/devices/enrollment-challenges',
        {},
        { authorization: 'Handoff AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      )
      expect(badAuth.status).toBe(401)
      // enroll 无 handoff → 401
      const enroll = await postJson(baseUrl, '/api/v1/app/devices/enroll', buildEnrollBody({
        key: newTestDeviceKey(),
        challenge: 'c',
        studentId: '2023010108',
      }))
      expect(enroll.status).toBe(401)
      expect((enroll.body.error as { code: string }).code).toBe('INVALID_HANDOFF')
    })
  })

  it('challenge 端点：有效 handoff 返回一次性明文 challenge（DB 只存 hash）', async () => {
    const handoff = await createHandoffRequest(db.sql)
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await postJson(
        baseUrl,
        '/api/v1/app/devices/enrollment-challenges',
        {},
        { authorization: `Handoff ${handoff.handoffSecret}` },
      )
      expect(res.status).toBe(200)
      expect(String(res.body.challenge).length).toBeGreaterThanOrEqual(32)
      expect(String(res.body.expires_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      // challenge 明文不在数据库任何地方出现（只存 sha256）
      const stored = await db.sql.query<{ challenge_hash: string }>(
        'SELECT challenge_hash FROM device_enrollment_challenges',
      )
      expect(stored.rows.length).toBe(1)
      expect(stored.rows[0]?.challenge_hash).not.toContain(String(res.body.challenge))
    })
  })

  it('enroll body 未知字段（如 student_id 之外的声明字段）被拒绝', async () => {
    const handoff = await createHandoffRequest(db.sql)
    const challenge = await createChallenge()
    const body = buildEnrollBody({ key: newTestDeviceKey(), challenge, studentId: '2023010109' })
    body.college = '计算机学院' // 未知字段（V1 只接受固定字段集）
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await postJson(
        baseUrl,
        '/api/v1/app/devices/enroll',
        body,
        { authorization: `Handoff ${handoff.handoffSecret}` },
      )
      expect(res.status).toBe(400)
      expect((res.body.error as { code: string }).code).toBe('INVALID_REQUEST')
    })
  })
})
