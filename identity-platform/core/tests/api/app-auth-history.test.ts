/**
 * 设备授权历史 API 测试（「授权记录」页数据源）：
 * - 本机批准过的记录按时间倒序返回（含应用名/域名/scope 标签/状态）；
 * - 只返回 approved_device_id = 本机的记录（其他设备/未批准的不出现）；
 * - 设备签名认证：缺失/无效 → 401 DEVICE_AUTH_FAILED。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { withServer } from '../helpers.js'
import {
  buildApp,
  buildEnrollBody,
  createHandoffRequest,
  newTestDeviceKey,
  postJson,
  type TestDeviceKey,
} from './helpers.js'
import { createClientFixture } from '../helpers/fixtures.js'
import { createAuthRequest } from '../../src/domain/auth-requests/service.js'
import { createEnrollmentChallenge } from '../../src/domain/devices.js'
import { buildDeviceApiCanonical } from '../../src/api/app/canonical.js'
import { TEST_HANDOFF_HMAC_KEY } from '../helpers/keys.js'

describe('app auth-history API', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  /** 通过 enroll API 注册一台设备，返回 device_id / user_id */
  async function enrollDevice(key: TestDeviceKey): Promise<{ deviceId: string; userId: string }> {
    const handoff = await createHandoffRequest(db.sql)
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
          studentId: '2023010101',
          studentName: '张三',
        }),
        { authorization: `Handoff ${handoff.handoffSecret}` },
      )
    })
    expect(result.status).toBe(201)
    return {
      deviceId: String(result.body.device_id),
      userId: String(result.body.user_id),
    }
  }

  /** 插入一条已批准的 auth_request（SQL 直改，绕开 approve 签名流程） */
  async function insertApprovedRequest(opts: {
    deviceId: string
    userId: string
    scopes?: string[]
    clientId?: string
    approvedOffsetMinutes?: number
  }): Promise<{ requestId: string; clientId: string }> {
    const scopes = opts.scopes ?? ['openid', 'profile']
    const fixture = await createClientFixture(db.sql, { scopes })
    const clientId = opts.clientId ?? fixture.clientId
    const request = await createAuthRequest(db.sql, {
      interactionUid: `iu_${randomUUID().replaceAll('-', '')}`,
      clientId,
      requestedScopes: scopes,
      handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
    })
    const offset = opts.approvedOffsetMinutes ?? 0
    await db.sql.query(
      `UPDATE auth_requests
          SET status = 'APPROVED', opened_at = NOW(), approved_at = $3,
              approved_user_id = $1, approved_device_id = $2
        WHERE id = $4`,
      [
        opts.userId,
        opts.deviceId,
        new Date(Date.now() - offset * 60_000),
        request.requestId,
      ],
    )
    return { requestId: request.requestId, clientId }
  }

  /** 构造 GET auth-history 的 Device 签名认证头（与 Rust 客户端一致） */
  function deviceAuthHeader(key: TestDeviceKey, deviceId: string): string {
    const issuedAt = Math.floor(Date.now() / 1000)
    const nonce = randomUUID().replaceAll('-', '')
    const canonical = buildDeviceApiCanonical({
      method: 'GET',
      path: '/api/v1/app/devices/me/auth-history',
      deviceId,
      issuedAt,
      nonce,
    })
    return `Device ${deviceId} ${issuedAt} ${nonce} ${key.sign(canonical)}`
  }

  async function getAuthHistory(
    baseUrl: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}/api/v1/app/devices/me/auth-history`, { headers })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  it('1. 返回本机批准过的授权记录（应用名/域名/scope/状态/时间倒序）', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key)

    // 两条本机记录：较新的在前
    await insertApprovedRequest({ deviceId, userId, approvedOffsetMinutes: 10 })
    const newer = await insertApprovedRequest({ deviceId, userId, approvedOffsetMinutes: 1 })

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await getAuthHistory(baseUrl, { authorization: deviceAuthHeader(key, deviceId) })
      expect(res.status).toBe(200)
      const items = ((res.body.items ?? []) as Array<Record<string, unknown>>)
      expect(items.length).toBe(2)
      // 倒序：较新的在前
      expect(items[0]!.request_id).toBe(newer.requestId)
      const item = items[0] as Record<string, unknown>
      expect(item.status).toBe('APPROVED')
      expect(typeof item.approved_at).toBe('string')
      const client = item.client as Record<string, unknown>
      expect(client.name).toBe('测试应用')
      expect(client.homepage_host).toBe('app.example.com')
      expect(client.review_status).toBe('active')
      const scopes = item.scopes as Array<Record<string, unknown>>
      expect(scopes.map((s) => s.id)).toEqual(['openid', 'profile'])
      expect(scopes[0]!.label).toBeTruthy()
      expect(scopes[0]!.risk).toBe('basic')
    })
  })

  it('2. 只返回本设备批准的记录（其他设备/未批准的不出现）', async () => {
    const key = newTestDeviceKey()
    const { deviceId, userId } = await enrollDevice(key)
    // 本机一条
    const mine = await insertApprovedRequest({ deviceId, userId })
    // 其他设备批准的一条（approved_device_id 不同）
    const otherDeviceId = randomUUID()
    await insertApprovedRequest({ deviceId: otherDeviceId, userId })
    // 本设备但未批准的一条（status 仍是 CREATED）
    await createAuthRequest(db.sql, {
      interactionUid: `iu_${randomUUID().replaceAll('-', '')}`,
      clientId: mine.clientId,
      requestedScopes: ['openid'],
      handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
    })

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      const res = await getAuthHistory(baseUrl, { authorization: deviceAuthHeader(key, deviceId) })
      expect(res.status).toBe(200)
      const items = ((res.body.items ?? []) as Array<Record<string, unknown>>)
      expect(items.length).toBe(1)
      expect(items[0]!.request_id).toBe(mine.requestId)
    })
  })

  it('3. 签名缺失/无效 → 401 DEVICE_AUTH_FAILED', async () => {
    const key = newTestDeviceKey()
    const { deviceId } = await enrollDevice(key)

    const app = buildApp(db.sql)
    await withServer(app, async (baseUrl) => {
      // 无认证头
      const missing = await getAuthHistory(baseUrl, {})
      expect(missing.status).toBe(401)
      expect((missing.body.error as Record<string, unknown>).code).toBe('DEVICE_AUTH_FAILED')

      // 签名被篡改
      const badHeader = `Device ${deviceId} ${Math.floor(Date.now() / 1000)} ${randomUUID().replaceAll('-', '')} ${'A'.repeat(86)}`
      const bad = await getAuthHistory(baseUrl, { authorization: badHeader })
      expect(bad.status).toBe(401)
      expect((bad.body.error as Record<string, unknown>).code).toBe('DEVICE_AUTH_FAILED')

      // 正确签名（对照用：应 200）
      const ok = await getAuthHistory(baseUrl, { authorization: deviceAuthHeader(key, deviceId) })
      expect(ok.status).toBe(200)
    })
  })
})
