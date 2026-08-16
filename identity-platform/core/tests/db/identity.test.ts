/**
 * DB 集成测试（#619 验收标准 1-3）：
 * 1. create user + linked identity；
 * 2. (provider, subject) 冲突返回 IDENTITY_ALREADY_BOUND（不静默合并）；
 * 3. revoke device 后无法再标 active。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import {
  createUserWithHbutIdentity,
} from '../../src/domain/users.js'
import {
  findIdentityByProviderSubject,
  findUserById,
} from '../../src/db/repos/users.repo.js'
import {
  createEnrollmentChallenge,
  registerDevice,
  activateDevice,
  revokeDevice,
} from '../../src/domain/devices.js'
import { findActiveDeviceById } from '../../src/db/repos/devices.repo.js'
import {
  DeviceNotActiveError,
  IdentityAlreadyBoundError,
} from '../../src/domain/errors.js'

describe('DB 集成：用户与学校身份', () => {
  let db: TestDatabase

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('1. create user + linked identity（verification_method=mini_hbut_app）', async () => {
    const { userId, identityId, created } = await createUserWithHbutIdentity(db.sql, {
      studentId: '2023000001',
      studentName: '张三',
      college: '计算机学院',
      major: '软件工程',
      className: '软工2301',
      grade: '2023',
    })

    expect(created).toBe(true)
    const user = await findUserById(db.sql, userId)
    expect(user).not.toBeNull()
    expect(user?.status).toBe('active')

    const identity = await findIdentityByProviderSubject(db.sql, 'hbut', '2023000001')
    expect(identity).not.toBeNull()
    expect(identity?.id).toBe(identityId)
    expect(identity?.user_id).toBe(userId)
    expect(identity?.verification_method).toBe('mini_hbut_app')
    expect(identity?.verification_level).toBe('low')
    expect(identity?.verified_at).toBeInstanceOf(Date)
    expect(identity?.student_name_snapshot).toBe('张三')

    // 主键是随机 UUIDv7，绝不是学号
    expect(userId).not.toContain('2023000001')
    expect(user?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('2. 相同学号冲突返回 IDENTITY_ALREADY_BOUND（不静默并入）', async () => {
    await createUserWithHbutIdentity(db.sql, { studentId: '2023000002', studentName: '李四' })

    await expect(
      createUserWithHbutIdentity(db.sql, { studentId: '2023000002', studentName: '李四' }),
    ).rejects.toBeInstanceOf(IdentityAlreadyBoundError)

    try {
      await createUserWithHbutIdentity(db.sql, { studentId: '2023000002', studentName: '李四' })
      expect.unreachable()
    } catch (err) {
      expect((err as IdentityAlreadyBoundError).code).toBe('IDENTITY_ALREADY_BOUND')
    }

    // 数据库中该学号仍然只有一条 identity（未被第二次创建合并）
    const identity = await findIdentityByProviderSubject(db.sql, 'hbut', '2023000002')
    expect(identity).not.toBeNull()
  })

  it('3. revoke device 后无法再标 active，approve 也不可用', async () => {
    const { userId } = await createUserWithHbutIdentity(db.sql, { studentId: '2023000003' })

    const { challenge } = await createEnrollmentChallenge(db.sql, { purpose: 'device_enrollment' })
    const { deviceId } = await registerDevice(db.sql, {
      userId,
      publicKeyJwk: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'T7x2L8j0kQm4vN6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7p',
      },
      platform: 'android',
      deviceName: '测试手机',
      challenge,
    })
    await activateDevice(db.sql, deviceId)
    expect(await findActiveDeviceById(db.sql, deviceId)).not.toBeNull()

    await revokeDevice(db.sql, deviceId, '用户主动吊销')
    expect(await findActiveDeviceById(db.sql, deviceId)).toBeNull()

    // revoked 设备无法再激活（条件更新 status='pending' 失败）
    await expect(activateDevice(db.sql, deviceId)).rejects.toBeInstanceOf(DeviceNotActiveError)
    // 吊销后再吊销也失败
    await expect(revokeDevice(db.sql, deviceId, '再次吊销')).rejects.toBeInstanceOf(DeviceNotActiveError)
  })

  it('设备公钥含私钥字段 d 时拒绝注册', async () => {
    const { userId } = await createUserWithHbutIdentity(db.sql, { studentId: '2023000004' })
    const { challenge } = await createEnrollmentChallenge(db.sql, { purpose: 'device_enrollment' })

    await expect(
      registerDevice(db.sql, {
        userId,
        publicKeyJwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'T7x2L8j0kQm4vN6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7p',
          d: 'not-a-real-private-key',
        },
        platform: 'android',
        deviceName: '恶意设备',
        challenge,
      }),
    ).rejects.toThrow(/不允许上传/)
  })
})
