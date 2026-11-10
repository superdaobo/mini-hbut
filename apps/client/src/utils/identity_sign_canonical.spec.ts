// P1-1 (goal-10) 身份 v2 canonical 构造 + 设备密钥签名（正式路径）单元测试：
//   - 参数映射遵循 Tauri v2 惯例：前端 camelCase → Rust snake_case（框架自动转换）；
//   - `buildIdentityV2Canonical` 的 studentName/nonce/ts 缺省 → 不传该键（不传空值键）；
//   - 返回值透传：字段与 Rust 侧 serde 序列化一一对应（snake_case），不做变换；
//   - invoke reject（未登记 / 未登录 / 命令不可用 等）→ 以固定稳定文案 reject，
//     **不透传**原始错误细节；
//   - 畸形响应（缺字段 / 类型错 / alg 不符）→ 折叠为失败（reject），绝不当成功透出；
//   - 全程零 console 输出（签名 / 公钥 / 明文不得进日志），零存储写入。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildIdentityV2Canonical, signIdentityV2Canonical } from './identity_sign_canonical'

// hoisted mock：避免 vi.mock 提升导致的外部变量未初始化问题（与 identity_v2_dev_seam.spec.ts 同类）
const { invokeNativeMock } = vi.hoisted(() => ({ invokeNativeMock: vi.fn() }))

vi.mock('../platform/native', () => ({
  invokeNative: invokeNativeMock
}))

const BUILD_COMMAND = 'identity_build_v2_canonical'
const SIGN_COMMAND = 'identity_sign_canonical'

// 86 字符 = 64 字节 Ed25519 签名的 base64url（无 padding）；内容为固定假值（非真实签名）
const FAKE_SIGNATURE = `${'ab3d'.repeat(21)}ef`

/** 符合构造命令冻结形状的响应（student_name_hash 取真实 sha256("")，对应空姓名场景） */
const makeBuildResponse = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  canonical:
    'v1|device-0001|2021123456|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|0123456789abcdef0123456789abcdef|1700000000',
  device_id: 'device-0001',
  student_id_masked: '2021***',
  student_name_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  nonce: '0123456789abcdef0123456789abcdef',
  ts: 1700000000,
  ...overrides
})

/** 符合签名命令冻结形状的响应（字段与 SignedCanonicalPayload 一一对应） */
const makeSignResponse = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  device_id: 'device-0001',
  alg: 'Ed25519',
  signature: FAKE_SIGNATURE,
  fingerprint: 'fp-device-0001-2021',
  public_key_jwk: '{"kty":"OKP","crv":"Ed25519","x":"fakeXyZ0"}',
  canonical_sha256: 'a'.repeat(64),
  student_id_masked: '2021***',
  ...overrides
})

const CANONICAL =
  'v1|device-0001|2021123456|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|0123456789abcdef0123456789abcdef|1700000000'

/** 捕获 reject 的 Error；若 promise 竟解析成功，直接让断言失败 */
const expectReject = async (promise: Promise<unknown>): Promise<Error> => {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(Error)
  return caught as Error
}

const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const

describe('buildIdentityV2Canonical（identity_build_v2_canonical）', () => {
  let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []
  // node 环境没有 localStorage：注入探针桩，钉死「封装绝不写存储」
  const storageStub = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }

  beforeEach(() => {
    // 监听全部 console 通道：封装的全流程必须零输出（签名 / 公钥 / 明文不得进日志）
    consoleSpies = consoleMethods.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {})
    )
    vi.stubGlobal('localStorage', storageStub)
    invokeNativeMock.mockReset()
    storageStub.getItem.mockClear()
    storageStub.setItem.mockClear()
    storageStub.removeItem.mockClear()
    storageStub.clear.mockClear()
  })

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore()
    }
    vi.unstubAllGlobals()
    invokeNativeMock.mockReset()
  })

  it('参数映射：必填 deviceId + 三个可选参数全给 → { input: {...snake_case} }（复核 R1 契约）', async () => {
    invokeNativeMock.mockResolvedValue(makeBuildResponse())
    await buildIdentityV2Canonical({
      deviceId: 'device-0001',
      studentName: '张三',
      nonce: 'abc123',
      ts: 1700000001
    })
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    // 契约：Rust 侧是单参结构体 `input`（Tauri 按 args["input"] 取参），字段名 snake_case
    expect(invokeNativeMock).toHaveBeenCalledWith(BUILD_COMMAND, {
      input: {
        device_id: 'device-0001',
        student_name: '张三',
        nonce: 'abc123',
        ts: 1700000001
      }
    })
  })

  it('缺 deviceId（或空串）→ 不触达原生命令，直接稳定文案 reject', async () => {
    const noDevice = await expectReject(buildIdentityV2Canonical({}))
    expect(noDevice.message).toBe('构造 canonical 失败：输入缺失或不合法')
    const emptyDevice = await expectReject(buildIdentityV2Canonical({ deviceId: '   ' }))
    expect(emptyDevice.message).toBe('构造 canonical 失败：输入缺失或不合法')
    expect(invokeNativeMock).not.toHaveBeenCalled()
  })

  it('只给必填 deviceId → payload 只有 device_id（不传任何空值键）', async () => {
    invokeNativeMock.mockResolvedValue(makeBuildResponse())
    await buildIdentityV2Canonical({ deviceId: 'device-0001' })
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    expect(invokeNativeMock).toHaveBeenCalledWith(BUILD_COMMAND, {
      input: { device_id: 'device-0001' }
    })
  })

  it('studentName 缺省 → 不传该键（避免 Rust 侧把空串当姓名）；只传给出的键', async () => {
    invokeNativeMock.mockResolvedValue(makeBuildResponse())
    await buildIdentityV2Canonical({ deviceId: 'device-0001', ts: 1700000002 })
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    expect(invokeNativeMock).toHaveBeenCalledWith(BUILD_COMMAND, {
      input: { device_id: 'device-0001', ts: 1700000002 }
    })
    // payload 里不得出现任何缺省字段（含空串键）
    const args = invokeNativeMock.mock.calls[0][1] as { input: Record<string, unknown> }
    expect(args.input).not.toHaveProperty('student_name')
    expect(args.input).not.toHaveProperty('nonce')
    expect(Object.keys(args.input)).toEqual(['device_id', 'ts'])
  })

  it('返回值透传：snake_case 字段与 Rust 侧一一对应，不做变换', async () => {
    const response = makeBuildResponse()
    invokeNativeMock.mockResolvedValue(response)
    const result = await buildIdentityV2Canonical({ deviceId: 'device-0001', studentName: '张三' })
    expect(result).toEqual(response)
    // 钉死字段名集合与关键类型
    expect(Object.keys(result).sort()).toEqual(
      ['canonical', 'device_id', 'nonce', 'student_id_masked', 'student_name_hash', 'ts'].sort()
    )
    expect(typeof result.ts).toBe('number')
    expect(result.device_id).toBe('device-0001')
  })

  it('invoke reject（未登录 / 命令不可用 等）：以固定稳定文案 reject，不透传原始错误', async () => {
    const rawDetail = '未登录：请先在本机完成登录后再操作 [session-err-9]'
    invokeNativeMock.mockRejectedValue(new Error(rawDetail))
    const error = await expectReject(buildIdentityV2Canonical({ deviceId: 'device-0001' }))
    // 文案固定、稳定（与 Rust 原始文案完全无关）
    expect(error.message).toBe(
      '构造身份 v2 canonical 失败：当前环境不满足构造条件（未登录或命令不可用）'
    )
    // 原始错误细节不得透出
    expect(error.message).not.toContain(rawDetail)
    expect(error.message).not.toContain('session-err-9')
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
  })

  it('畸形响应（缺字段 / 类型错）：折叠为失败，绝不原样放行', async () => {
    const badResponses: unknown[] = [
      null,
      undefined,
      'not-an-object',
      42,
      {},
      makeBuildResponse({ ts: '1700000000' }), // ts 类型错
      makeBuildResponse({ canonical: '' }), // 必填字符串为空
      makeBuildResponse({ device_id: 123 }), // 类型错
      { ...makeBuildResponse(), nonce: undefined } // 缺字段
    ]
    for (const bad of badResponses) {
      invokeNativeMock.mockReset()
      invokeNativeMock.mockResolvedValue(bad)
      const error = await expectReject(buildIdentityV2Canonical({ deviceId: 'device-0001' }))
      expect(error.message).toBe('构造身份 v2 canonical 失败：Rust 侧响应形状异常')
    }
    // 全程零 console
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('成功路径全程零 console 输出、零存储写入', async () => {
    invokeNativeMock.mockResolvedValue(makeBuildResponse())
    await buildIdentityV2Canonical({ deviceId: 'device-0001', studentName: '张三' })
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(storageStub.setItem).not.toHaveBeenCalled()
    expect(storageStub.removeItem).not.toHaveBeenCalled()
    expect(storageStub.clear).not.toHaveBeenCalled()
  })
})

describe('signIdentityV2Canonical（identity_sign_canonical）', () => {
  let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []
  const storageStub = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }

  beforeEach(() => {
    consoleSpies = consoleMethods.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {})
    )
    vi.stubGlobal('localStorage', storageStub)
    invokeNativeMock.mockReset()
    storageStub.getItem.mockClear()
    storageStub.setItem.mockClear()
    storageStub.removeItem.mockClear()
    storageStub.clear.mockClear()
  })

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore()
    }
    vi.unstubAllGlobals()
    invokeNativeMock.mockReset()
  })

  it('参数映射：{deviceId, studentId, canonical} → camelCase 键传入原生命令', async () => {
    invokeNativeMock.mockResolvedValue(makeSignResponse())
    await signIdentityV2Canonical({
      deviceId: 'device-0001',
      studentId: '2021123456',
      canonical: CANONICAL
    })
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    // 契约（复核 R1）：{ input: { device_id, student_id, canonical } }（snake_case + input 包装）
    expect(invokeNativeMock).toHaveBeenCalledWith(SIGN_COMMAND, {
      input: {
        device_id: 'device-0001',
        student_id: '2021123456',
        canonical: CANONICAL
      }
    })
  })

  it('返回值透传：7 个 snake_case 字段一一对应，alg 恒为 Ed25519，签名 86 字符', async () => {
    const response = makeSignResponse()
    invokeNativeMock.mockResolvedValue(response)
    const result = await signIdentityV2Canonical({
      deviceId: 'device-0001',
      studentId: '2021123456',
      canonical: CANONICAL
    })
    expect(result).toEqual(response)
    expect(Object.keys(result).sort()).toEqual(
      [
        'alg',
        'canonical_sha256',
        'device_id',
        'fingerprint',
        'public_key_jwk',
        'signature',
        'student_id_masked'
      ].sort()
    )
    expect(result.alg).toBe('Ed25519')
    // 签名恒 86 字符（64 字节 base64url 无 padding）
    expect(result.signature).toHaveLength(86)
  })

  it('invoke reject（Rust 返回「未登记 / 未登录」类文案）：固定稳定文案 reject，不透传原始细节', async () => {
    const rawDetail = '未登记设备：本机没有设备密钥，请先完成设备注册 [keyring-err-7]'
    invokeNativeMock.mockRejectedValue(new Error(rawDetail))
    const error = await expectReject(
      signIdentityV2Canonical({
        deviceId: 'device-0001',
        studentId: '2021123456',
        canonical: CANONICAL
      })
    )
    // 文案固定、稳定：与 Rust 原始错误串逐字无关
    expect(error.message).toBe(
      '签名 canonical 失败：当前环境不满足签名条件（设备未登记、未登录或命令不可用）'
    )
    expect(error.message).not.toContain(rawDetail)
    expect(error.message).not.toContain('keyring-err-7')
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
  })

  it('畸形响应（缺字段 / 类型错 / alg 不符）：折叠为失败，绝不把签名材料当成功透出', async () => {
    const badResponses: unknown[] = [
      null,
      {},
      'not-an-object',
      makeSignResponse({ signature: '' }), // 必填字符串为空
      makeSignResponse({ alg: 'RSA' }), // alg 不符
      makeSignResponse({ public_key_jwk: 42 }), // 类型错
      { ...makeSignResponse(), canonical_sha256: undefined } // 缺字段
    ]
    for (const bad of badResponses) {
      invokeNativeMock.mockReset()
      invokeNativeMock.mockResolvedValue(bad)
      const error = await expectReject(
        signIdentityV2Canonical({
          deviceId: 'device-0001',
          studentId: '2021123456',
          canonical: CANONICAL
        })
      )
      expect(error.message).toBe('签名 canonical 失败：Rust 侧响应形状异常')
    }
  })

  it('入参缺失或不是非空字符串：直接以稳定文案 reject，不触达原生命令', async () => {
    const badInputs: unknown[] = [
      undefined,
      null,
      {},
      { deviceId: '', studentId: '2021123456', canonical: CANONICAL },
      { deviceId: 'device-0001', studentId: '2021123456', canonical: 42 }
    ]
    for (const bad of badInputs) {
      invokeNativeMock.mockReset()
      const error = await expectReject(
        signIdentityV2Canonical(bad as unknown as { deviceId: string; studentId: string; canonical: string })
      )
      expect(error.message).toBe('签名 canonical 失败：输入缺失或不合法')
    }
    // 本地守卫必须在 invoke 之前：任何情况下都不得触达原生命令
    expect(invokeNativeMock).not.toHaveBeenCalled()
  })

  it('成功与失败路径全程零 console 输出、零存储写入', async () => {
    invokeNativeMock.mockResolvedValue(makeSignResponse())
    await signIdentityV2Canonical({
      deviceId: 'device-0001',
      studentId: '2021123456',
      canonical: CANONICAL
    })
    // 再走一遍失败路径（invoke reject）
    invokeNativeMock.mockRejectedValue(new Error('未登记设备：本机没有设备密钥 [keyring-err-7]'))
    await expectReject(
      signIdentityV2Canonical({
        deviceId: 'device-0001',
        studentId: '2021123456',
        canonical: CANONICAL
      })
    )
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(storageStub.setItem).not.toHaveBeenCalled()
    expect(storageStub.removeItem).not.toHaveBeenCalled()
    expect(storageStub.clear).not.toHaveBeenCalled()
  })
})
