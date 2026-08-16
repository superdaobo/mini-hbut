/**
 * #622 approve / 设备 API 测试（issue #622「Approve」10 项）：
 * - valid；
 * - revoked device；
 * - wrong device（不存在 / pending / 其他用户设备语义）；
 * - expired request；
 * - bad handoff；
 * - nonce replay（同 payload 重复提交不重复批准）；
 * - stale issued_at；
 * - scope tamper（篡改 scope 集合签名无法通过）；
 * - concurrent double approve（一次成功）；
 * - approval body 不信任 student_id（strict 拒绝 + 审批身份来自设备）。
 * 另覆盖：/devices/me、/devices/:id/revoke（Device 签名认证）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { withServer } from '../helpers.js'
import {
  buildApp,
  buildApproveBody,
  createHandoffRequest,
  newTestDeviceKey,
  postJson,
  type TestDeviceKey,
} from './helpers.js'
import { createUserWithHbutIdentity } from '../../src/domain/users.js'
import {
  createEnrollmentChallenge,
  registerDevice,
  activateDevice,
  revokeDevice,
} from '../../src/domain/devices.js'
import { findAuthRequestById } from '../../src/db/repos/auth-requests.repo.js'
import { findDeviceById } from '../../src/db/repos/devices.repo.js'
import { listAuditEvents } from '../../src/db/repos/audit.repo.js'
import { buildDeviceApiCanonical } from '../../src/api/app/canonical.js'

describe('#622 approve API', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 注册一个 active 设备 + 一个 WAITING_APP 请求（含 handoff），返回审批所需上下文 */
  async function setupApproval(opts: { ttlSeconds?: number; scopes?: string[] } = {}): Promise<{
    key: TestDeviceKey
    deviceId: string
    userId: string
    requestId: string
    handoffSecret: string
    serverChallenge: string
    clientId: string
    scopes: string[]
  }> {
    const { userId } = await createUserWithHbutIdentity(db.sql, {
      studentId: `2023${Math.floor(Math.random() * 900000) + 100000}`,
      studentName: '审批用户',
    })
    const key = newTestDeviceKey()
    const { challenge } = await createEnrollmentChallenge(db.sql, { purpose: 'device_enrollment' })
    const { deviceId } = await registerDevice(db.sql, {
      userId,
      publicKeyJwk: key.jwk,
      platform: 'windows',
      deviceName: '审批设备',
      challenge,
    })
    await activateDevice(db.sql, deviceId)
    const handoff = await createHandoffRequest(db.sql, opts)
    return {
      key,
      deviceId,
      userId,
      requestId: handoff.requestId,
      handoffSecret: handoff.handoffSecret,
      serverChallenge: handoff.serverChallenge,
      clientId: handoff.clientId,
      scopes: handoff.scopes,
    }
  }

  async function approveViaApi(opts: {
    requestId: string
    handoffSecret: string
    body: Record<string, unknown>
    handoffOverride?: string
  }): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = buildApp(db.sql)
    let result: { status: number; body: Record<string, unknown> } = { status: 0, body: {} }
    await withServer(app, async (baseUrl) => {
      result = await postJson(
        baseUrl,
        `/api/v1/app/auth-requests/${opts.requestId}/approve`,
        opts.body,
        { authorization: `Handoff ${opts.handoffOverride ?? opts.handoffSecret}` },
      )
    })
    return result
  }

  it('1. valid：handoff + Ed25519 验签通过 → APPROVED（身份由设备推导，audit/last_seen 落库）', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    const res = await approveViaApi({
      requestId: ctx.requestId,
      handoffSecret: ctx.handoffSecret,
      body,
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('APPROVED')
    expect(res.body.already_approved).toBe(false)

    // approved_user_id 由服务端按 device.user_id 决定（不信客户端任何声明）
    const row = await findAuthRequestById(db.sql, ctx.requestId)
    expect(row?.status).toBe('APPROVED')
    expect(row?.approved_user_id).toBe(ctx.userId)
    expect(row?.approved_device_id).toBe(ctx.deviceId)
    expect(row?.approval_nonce).toMatch(/^nonce_/)
    expect(row?.approved_at).toBeInstanceOf(Date)
    // device last_seen 在验签成功后更新
    const device = await findDeviceById(db.sql, ctx.deviceId)
    expect(device?.last_seen_at).toBeInstanceOf(Date)
    // audit：approve 事件（client nonce 记录，无敏感材料）
    const audits = await listAuditEvents(db.sql, { actorType: 'device' })
    const approveEvents = audits.filter((a) => a.event_type === 'auth_request.approved')
    expect(approveEvents.length).toBe(1)
    expect(approveEvents[0]?.actor_id).toBe(ctx.deviceId)
    expect(approveEvents[0]?.target_id).toBe(ctx.requestId)
  })

  it('2. revoked device：吊销后立即失去认证能力 → 403', async () => {
    const ctx = await setupApproval()
    await revokeDevice(db.sql, ctx.deviceId, '用户主动吊销')
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    const res = await approveViaApi({
      requestId: ctx.requestId,
      handoffSecret: ctx.handoffSecret,
      body,
    })
    expect(res.status).toBe(403)
    expect((res.body.error as { code: string }).code).toBe('DEVICE_NOT_ACTIVE')
    const row = await findAuthRequestById(db.sql, ctx.requestId)
    expect(row?.status).toBe('WAITING_APP') // 无状态迁移
  })

  it('3. wrong device：不存在/pending 设备一律 403，不泄露设备状态', async () => {
    const ctx = await setupApproval()
    // 不存在设备
    const ghost = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: '0198nonexistentdevice0000000000',
    })
    const resGhost = await approveViaApi({
      requestId: ctx.requestId,
      handoffSecret: ctx.handoffSecret,
      body: ghost,
    })
    expect(resGhost.status).toBe(403)

    // pending 设备（未激活）
    const { userId } = await createUserWithHbutIdentity(db.sql, {
      studentId: `2023${Math.floor(Math.random() * 900000) + 100000}`,
    })
    const pendingKey = newTestDeviceKey()
    const { challenge } = await createEnrollmentChallenge(db.sql, { purpose: 'device_enrollment' })
    const { deviceId: pendingDeviceId } = await registerDevice(db.sql, {
      userId,
      publicKeyJwk: pendingKey.jwk,
      platform: 'windows',
      deviceName: '未激活设备',
      challenge,
    })
    const pending = buildApproveBody({
      key: pendingKey,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: pendingDeviceId,
    })
    const resPending = await approveViaApi({
      requestId: ctx.requestId,
      handoffSecret: ctx.handoffSecret,
      body: pending,
    })
    expect(resPending.status).toBe(403)
  })

  it('4. expired request：过期后 approve → 410 且懒迁移 EXPIRED', async () => {
    const ctx = await setupApproval({ ttlSeconds: 60 })
    // 直接把过期时间改到过去（模拟 TTL 流逝）
    await db.sql.query(
      'UPDATE auth_requests SET expires_at = $2 WHERE id = $1',
      [ctx.requestId, new Date(Date.now() - 1000)],
    )
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    const res = await approveViaApi({
      requestId: ctx.requestId,
      handoffSecret: ctx.handoffSecret,
      body,
    })
    expect(res.status).toBe(410)
    expect((res.body.error as { code: string }).code).toBe('AUTH_REQUEST_EXPIRED')
    const row = await findAuthRequestById(db.sql, ctx.requestId)
    expect(row?.status).toBe('EXPIRED')
  })

  it('5. bad handoff：缺失/伪造 handoff → 401 INVALID_HANDOFF', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    const wrong = await approveViaApi({
      requestId: ctx.requestId,
      handoffSecret: ctx.handoffSecret,
      handoffOverride: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      body,
    })
    expect(wrong.status).toBe(401)
    expect((wrong.body.error as { code: string }).code).toBe('INVALID_HANDOFF')
    const row = await findAuthRequestById(db.sql, ctx.requestId)
    expect(row?.status).toBe('WAITING_APP')
  })

  it('6. nonce replay：同一 payload 重复提交幂等，不产生第二次批准', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    const first = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })
    expect(first.status).toBe(200)
    expect(first.body.already_approved).toBe(false)
    const approvedAt = (await findAuthRequestById(db.sql, ctx.requestId))?.approved_at

    // 完全相同 payload 重放 → 幂等成功，无第二次批准
    const replay = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })
    expect(replay.status).toBe(200)
    expect(replay.body.already_approved).toBe(true)

    const row = await findAuthRequestById(db.sql, ctx.requestId)
    expect(row?.approved_at?.getTime()).toBe(approvedAt?.getTime()) // 时间戳未被重写
    // audit 只有一条 approve 事件（不重复触发 provider interaction 的证据）
    const audits = await listAuditEvents(db.sql, { actorType: 'device' })
    expect(audits.filter((a) => a.event_type === 'auth_request.approved').length).toBe(1)
  })

  it('7. stale issued_at：超出 ±60s 时间窗 → 400 STALE_ISSUED_AT', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
      issuedAt: Math.floor(Date.now() / 1000) - 120,
    })
    const res = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })
    expect(res.status).toBe(400)
    expect((res.body.error as { code: string }).code).toBe('STALE_ISSUED_AT')
  })

  it('8. scope tamper：篡改 scope 集合的签名无法通过（服务端用存储快照重建 canonical）', async () => {
    const ctx = await setupApproval({ scopes: ['openid', 'profile', 'student.identity'] })
    // 攻击者只对 ['openid','profile'] 的 hash 签名（想偷砍敏感 scope）
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ['openid', 'profile'],
      deviceId: ctx.deviceId,
    })
    const res = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })
    expect(res.status).toBe(401)
    expect((res.body.error as { code: string }).code).toBe('SIGNATURE_INVALID')
    const row = await findAuthRequestById(db.sql, ctx.requestId)
    expect(row?.status).toBe('WAITING_APP')
  })

  it('9. concurrent double approve：并发只批准一次，另一次幂等成功', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const [a, b] = await Promise.all([
        postJson(
          baseUrl,
          `/api/v1/app/auth-requests/${ctx.requestId}/approve`,
          body,
          { authorization: `Handoff ${ctx.handoffSecret}` },
        ),
        postJson(
          baseUrl,
          `/api/v1/app/auth-requests/${ctx.requestId}/approve`,
          body,
          { authorization: `Handoff ${ctx.handoffSecret}` },
        ),
      ])
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)
      const createdFlags = [a.body.already_approved, b.body.already_approved]
      expect(createdFlags.filter((f) => f === false).length).toBe(1) // 恰好一次真正批准
      expect(createdFlags.filter((f) => f === true).length).toBe(1)  // 另一次幂等
    })
    // DB：单次批准，无重复审计
    const row = await findAuthRequestById(db.sql, ctx.requestId)
    expect(row?.status).toBe('APPROVED')
    const audits = await listAuditEvents(db.sql, { actorType: 'device' })
    expect(audits.filter((a) => a.event_type === 'auth_request.approved').length).toBe(1)
  })

  it('10. approval body 不信任 student_id：strict 拒绝身份声明字段', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    }) as Record<string, unknown>
    // 客户端即使伪造 student_id 也会被拒绝（审批身份只能来自设备）
    body.student_id = '2099999999'
    const res = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })
    expect(res.status).toBe(400)
    expect((res.body.error as { code: string }).code).toBe('INVALID_REQUEST')
  })

  it('canonical_version 不合法 → 400 INVALID_REQUEST', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    }) as Record<string, unknown>
    body.canonical_version = 'MINI-HBUT-AUTH-V2'
    const res = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })
    expect(res.status).toBe(400)
    expect((res.body.error as { code: string }).code).toBe('INVALID_REQUEST')
  })

  it('其他设备抢批已批准请求 → 409 AUTH_REQUEST_ALREADY_APPROVED', async () => {
    const ctx = await setupApproval()
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    expect((await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })).status).toBe(200)
    // 第二个用户 + 设备抢批同一请求（其签名合法）→ 409
    const other = await setupApproval()
    const otherBody = buildApproveBody({
      key: other.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: other.deviceId,
    })
    const res = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body: otherBody })
    expect(res.status).toBe(409)
    expect((res.body.error as { code: string }).code).toBe('AUTH_REQUEST_ALREADY_APPROVED')
  })

  it('DENIED 后 approve → 409（状态机拒绝非法迁移）', async () => {
    const ctx = await setupApproval()
    // 先走 deny（WAITING_APP → DENIED）
    await db.sql.query('UPDATE auth_requests SET status = \'DENIED\', denied_at = NOW() WHERE id = $1', [ctx.requestId])
    const body = buildApproveBody({
      key: ctx.key,
      requestId: ctx.requestId,
      challenge: ctx.serverChallenge,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      deviceId: ctx.deviceId,
    })
    const res = await approveViaApi({ requestId: ctx.requestId, handoffSecret: ctx.handoffSecret, body })
    expect(res.status).toBe(409)
  })
})

describe('#622 devices me/revoke（Device 签名认证）', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  async function setupDevice(): Promise<{ key: TestDeviceKey; deviceId: string; userId: string }> {
    const { userId } = await createUserWithHbutIdentity(db.sql, {
      studentId: `2023${Math.floor(Math.random() * 900000) + 100000}`,
    })
    const key = newTestDeviceKey()
    const { challenge } = await createEnrollmentChallenge(db.sql, { purpose: 'device_enrollment' })
    const { deviceId } = await registerDevice(db.sql, {
      userId,
      publicKeyJwk: key.jwk,
      platform: 'windows',
      deviceName: '自查询设备',
      challenge,
    })
    await activateDevice(db.sql, deviceId)
    return { key, deviceId, userId }
  }

  /** Device 签名认证头（MINI-HBUT-DEVICE-API-V1，method/path 与请求一致） */
  function deviceAuthHeader(
    key: TestDeviceKey,
    deviceId: string,
    method: string,
    path: string,
    opts: { issuedAt?: number; nonce?: string } = {},
  ): string {
    const issuedAt = opts.issuedAt ?? Math.floor(Date.now() / 1000)
    const nonce = opts.nonce ?? `nonce_${Math.random().toString(36).slice(2, 14)}`
    const canonical = buildDeviceApiCanonical({ method, path, deviceId, issuedAt, nonce })
    return `Device ${deviceId} ${issuedAt} ${nonce} ${key.sign(canonical)}`
  }

  it('GET /devices/me：合法签名返回设备信息（不含私钥材料）', async () => {
    const { key, deviceId } = await setupDevice()
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/app/devices/me`, {
        headers: { authorization: deviceAuthHeader(key, deviceId, 'GET', '/api/v1/app/devices/me') },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.device_id).toBe(deviceId)
      expect(body.status).toBe('active')
      expect(body.fingerprint).toBe(key.fingerprint())
      expect(body.platform).toBe('windows')
      expect(JSON.stringify(body)).not.toContain('"d"') // 无私钥材料
      expect(JSON.stringify(body)).not.toContain('seed')
    })
  })

  it('GET /devices/me：伪造签名 / 时间窗过期 / 无头 → 401', async () => {
    const { key, deviceId } = await setupDevice()
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 无头
      const noAuth = await fetch(`${baseUrl}/api/v1/app/devices/me`)
      expect(noAuth.status).toBe(401)
      // 伪造签名
      const bad = await fetch(`${baseUrl}/api/v1/app/devices/me`, {
        headers: {
          authorization: deviceAuthHeader(key, deviceId, 'GET', '/api/v1/app/devices/me', {
            issuedAt: Math.floor(Date.now() / 1000) - 120,
          }),
        },
      })
      expect(bad.status).toBe(401)
      // 篡改 canonical 路径（签名与请求不符）
      const wrongPath = deviceAuthHeader(key, deviceId, 'GET', '/api/v1/app/devices/evil')
      const wrong = await fetch(`${baseUrl}/api/v1/app/devices/me`, {
        headers: { authorization: wrongPath },
      })
      expect(wrong.status).toBe(401)
    })
  })

  it('POST /devices/:id/revoke：自撤销成功，revoked 后 me/approve 全部失效', async () => {
    const { key, deviceId, userId } = await setupDevice()
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/app/devices/${deviceId}/revoke`, {
        method: 'POST',
        headers: {
          authorization: deviceAuthHeader(key, deviceId, 'POST', `/api/v1/app/devices/${deviceId}/revoke`),
        },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.revoked).toBe(true)
      expect(body.last_active_device).toBe(true) // 撤销的是唯一 active 设备
      // revoked 后：设备签名认证立即失效（401，不泄露状态）
      const afterRevoke = await fetch(`${baseUrl}/api/v1/app/devices/me`, {
        headers: { authorization: deviceAuthHeader(key, deviceId, 'GET', '/api/v1/app/devices/me') },
      })
      expect(afterRevoke.status).toBe(401)
    })
    // 设备行保留（不 hard delete，audit 可追溯），状态 revoked
    const device = await findDeviceById(db.sql, deviceId)
    expect(device?.status).toBe('revoked')
    expect(device?.revoked_reason).toBe('user_revoked')
    expect(device?.user_id).toBe(userId)
  })

  it('POST /devices/:id/revoke：只能撤销本机（跨设备撤销 → 403）', async () => {
    const { key, deviceId } = await setupDevice()
    const other = await setupDevice()
    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 设备 A 尝试撤销设备 B
      const res = await fetch(`${baseUrl}/api/v1/app/devices/${other.deviceId}/revoke`, {
        method: 'POST',
        headers: {
          authorization: deviceAuthHeader(key, deviceId, 'POST', `/api/v1/app/devices/${other.deviceId}/revoke`),
        },
      })
      expect(res.status).toBe(403)
    })
    // 设备 B 仍然 active
    expect((await findDeviceById(db.sql, other.deviceId))?.status).toBe('active')
  })
})
