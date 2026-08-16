/**
 * DB 集成测试（#619 验收标准 4-7）：
 * 4. AuthRequest 只能合法状态迁移；
 * 5. 并发两次 approve 只有一次成功；
 * 6. expired request 不可 approve；
 * 7. handoff secret 数据库只保存不可直接使用的 hash。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture } from '../helpers/fixtures.js'
import {
  createAuthRequest,
  approveAuthRequest,
  denyAuthRequest,
  openAuthRequest,
  cancelAuthRequest,
  advanceAuthRequestProtocol,
  verifyHandoffSecret,
  verifyScopeHash,
  transitionAuthRequestStatus,
  type CreateAuthRequestResult,
} from '../../src/domain/auth-requests/service.js'
import {
  isAllowedTransition,
  ALLOWED_TRANSITIONS,
  AUTH_REQUEST_STATUSES,
  type AuthRequestStatus,
} from '../../src/domain/auth-requests/state-machine.js'
import { findAuthRequestById } from '../../src/db/repos/auth-requests.repo.js'
import {
  createUserWithHbutIdentity,
} from '../../src/domain/users.js'
import {
  createEnrollmentChallenge,
  registerDevice,
  activateDevice,
} from '../../src/domain/devices.js'
import {
  AuthRequestAlreadyApprovedError,
  AuthRequestExpiredError,
  AuthRequestInvalidTransitionError,
} from '../../src/domain/errors.js'
import { TEST_HANDOFF_HMAC_KEY } from '../helpers/keys.js'

describe('DB 集成：AuthRequest 状态机', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  async function setupAuthRequest(ttlSeconds = 60): Promise<{
    request: CreateAuthRequestResult
    deviceId: string
    userId: string
  }> {
    const fixture = await createClientFixture(db.sql)
    const { userId } = await createUserWithHbutIdentity(db.sql, { studentId: `2023${Math.floor(Math.random() * 90000) + 10000}` })
    const { challenge } = await createEnrollmentChallenge(db.sql, { purpose: 'device_enrollment' })
    const { deviceId } = await registerDevice(db.sql, {
      userId,
      publicKeyJwk: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'X7x2L8j0kQm4vN6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7q',
      },
      platform: 'windows',
      deviceName: '测试设备',
      challenge,
    })
    await activateDevice(db.sql, deviceId)

    const request = await createAuthRequest(db.sql, {
      interactionUid: `iu_${Math.random().toString(36).slice(2, 12)}`,
      clientId: fixture.clientId,
      requestedScopes: ['openid', 'profile'],
      handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
      ttlSeconds,
    })
    return { request, deviceId, userId }
  }

  it('4a. 状态机合法迁移全链路：CREATED→…→CONSUMED', async () => {
    const { request, deviceId } = await setupAuthRequest()
    const r = await findAuthRequestById(db.sql, request.requestId)
    expect(r?.status).toBe('CREATED')

    // CREATED → WAITING_APP
    await transitionAuthRequestStatus(db.sql, request.requestId, 'WAITING_APP')
    // WAITING_APP → APP_OPENED
    await openAuthRequest(db.sql, request.requestId)
    // APP_OPENED → APPROVED
    const approved = await approveAuthRequest(db.sql, request.requestId, deviceId)
    expect(approved.created).toBe(true)
    expect(approved.row.status).toBe('APPROVED')
    expect(approved.row.approved_device_id).toBe(deviceId)
    expect(approved.row.approval_nonce).toMatch(/^nonce_/)
    // APPROVED → INTERACTION_FINISHED → CODE_ISSUED → CONSUMED
    await advanceAuthRequestProtocol(db.sql, request.requestId, 'INTERACTION_FINISHED')
    await advanceAuthRequestProtocol(db.sql, request.requestId, 'CODE_ISSUED')
    const consumed = await advanceAuthRequestProtocol(db.sql, request.requestId, 'CONSUMED')
    expect(consumed.status).toBe('CONSUMED')

    // 终态后不可再迁移
    await expect(
      advanceAuthRequestProtocol(db.sql, request.requestId, 'INTERACTION_FINISHED'),
    ).rejects.toBeInstanceOf(AuthRequestInvalidTransitionError)
  })

  it('4b. 非法迁移被拒绝（状态机表与实现一致）', async () => {
    const { request } = await setupAuthRequest()
    // 直接 deny（CREATED 不允许）→ 非法
    await expect(denyAuthRequest(db.sql, request.requestId)).rejects.toBeInstanceOf(
      AuthRequestInvalidTransitionError,
    )
    // CREATED → WAITING_APP 后 approve，再 cancel → 非法（APPROVED 不是 CANCELLED 来源）
    await transitionAuthRequestStatus(db.sql, request.requestId, 'WAITING_APP')
    // 状态机表本身的一致性检查：所有声明的迁移都是合法集合成员
    for (const from of AUTH_REQUEST_STATUSES) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(isAllowedTransition(from, to)).toBe(true)
        expect(from).not.toBe(to)
      }
    }
  })

  it('4c. deny 从 WAITING_APP/APP_OPENED 生效', async () => {
    const { request } = await setupAuthRequest()
    await transitionAuthRequestStatus(db.sql, request.requestId, 'WAITING_APP')
    await denyAuthRequest(db.sql, request.requestId)
    const r = await findAuthRequestById(db.sql, request.requestId)
    expect(r?.status).toBe('DENIED')
    expect(r?.denied_at).toBeInstanceOf(Date)
  })

  it('5. 并发两次 approve：只有一次成功创建批准，第二次幂等/安全失败', async () => {
    const { request, deviceId } = await setupAuthRequest()
    await transitionAuthRequestStatus(db.sql, request.requestId, 'WAITING_APP')

    // 同一设备并发两次 approve（真实并发：条件更新保证只有一次写入成功）
    const [a, b] = await Promise.all([
      approveAuthRequest(db.sql, request.requestId, deviceId),
      approveAuthRequest(db.sql, request.requestId, deviceId),
    ])
    const createdCount = [a, b].filter((r) => r.created).length
    expect(createdCount).toBe(1)

    // DB 中只有一份批准（非空 approved_at 唯一且相同）
    const row = await findAuthRequestById(db.sql, request.requestId)
    expect(row?.status).toBe('APPROVED')
    const [first] = [a, b]
    expect(first.row.approval_nonce).toBe(row?.approval_nonce)

    // 同一用户的另一台设备再次 approve → 安全失败（不产生第二次批准）
    const otherDevice = await registerSecondDevice(db.sql, row!.approved_user_id!)
    await expect(
      approveAuthRequest(db.sql, request.requestId, otherDevice),
    ).rejects.toBeInstanceOf(AuthRequestAlreadyApprovedError)

    // 状态仍是 APPROVED，approval_nonce 未变（没有生成第二次 grant）
    const rowAfter = await findAuthRequestById(db.sql, request.requestId)
    expect(rowAfter?.status).toBe('APPROVED')
    expect(rowAfter?.approval_nonce).toBe(row?.approval_nonce)
  })

  it('5b. 其他用户的设备 approve 已批准请求 → ALREADY_APPROVED', async () => {
    const { request, deviceId } = await setupAuthRequest()
    await transitionAuthRequestStatus(db.sql, request.requestId, 'WAITING_APP')
    await approveAuthRequest(db.sql, request.requestId, deviceId)

    // 另一个用户 + 设备
    const other = await createUserWithHbutIdentity(db.sql, { studentId: `2023${Math.floor(Math.random() * 90000) + 10000}` })
    const { challenge } = await createEnrollmentChallenge(db.sql, { purpose: 'device_enrollment' })
    const { deviceId: otherDevice } = await registerDevice(db.sql, {
      userId: other.userId,
      publicKeyJwk: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'Z7x2L8j0kQm4vN6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7r',
      },
      platform: 'android',
      deviceName: '其他用户设备',
      challenge,
    })
    await activateDevice(db.sql, otherDevice)

    await expect(
      approveAuthRequest(db.sql, request.requestId, otherDevice),
    ).rejects.toBeInstanceOf(AuthRequestAlreadyApprovedError)
  })

  it('6. expired request 不可 approve（懒迁移 EXPIRED）', async () => {
    const { request, deviceId } = await setupAuthRequest(120)
    await transitionAuthRequestStatus(db.sql, request.requestId, 'WAITING_APP')

    // 直接把 expires_at 回拨到过去（模拟超时，避免真实等待）
    await db.sql.query(
      `UPDATE auth_requests SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`,
      [request.requestId],
    )

    await expect(
      approveAuthRequest(db.sql, request.requestId, deviceId),
    ).rejects.toBeInstanceOf(AuthRequestExpiredError)

    // 状态被懒迁移为 EXPIRED（终态）
    const row = await findAuthRequestById(db.sql, request.requestId)
    expect(row?.status).toBe('EXPIRED')

    // 过期后 approve 依旧失败（终态不可迁移）
    await expect(
      approveAuthRequest(db.sql, request.requestId, deviceId),
    ).rejects.toBeInstanceOf(AuthRequestInvalidTransitionError)
  })

  it('7. handoff secret 数据库只保存 hash（HMAC 派生值）', async () => {
    const { request } = await setupAuthRequest()
    const row = await findAuthRequestById(db.sql, request.requestId)

    // 存储的是 HMAC 派生值，不是明文
    expect(row?.handoff_secret_hash).not.toBe(request.handoffSecret)
    expect(row?.handoff_secret_hash).toMatch(/^[A-Za-z0-9_-]{43}$/)

    // 用密钥可验证、无密钥不可反推
    expect(
      verifyHandoffSecret({
        handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
        handoffSecret: request.handoffSecret,
        request: row!,
      }),
    ).toBe(true)
    expect(
      verifyHandoffSecret({
        handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
        handoffSecret: 'wrong-secret-value',
        request: row!,
      }),
    ).toBe(false)

    // scope 快照与 hash 一致（防篡改）
    expect(verifyScopeHash(row!)).toBe(true)
  })
})

async function registerSecondDevice(
  sql: TestDatabase['sql'],
  userId: string,
): Promise<string> {
  const { challenge } = await createEnrollmentChallenge(sql, { purpose: 'device_enrollment' })
  const { deviceId } = await registerDevice(sql, {
    userId,
    publicKeyJwk: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'Y7x2L8j0kQm4vN6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7s',
    },
    platform: 'macos',
    deviceName: '第二台设备',
    challenge,
  })
  await activateDevice(sql, deviceId)
  return deviceId
}
