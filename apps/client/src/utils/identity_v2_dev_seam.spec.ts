// P0-7 (goal-10) 身份 v2 DEV 签名自检缝单元测试：
//   - 生产构建（非 DEV）/ DEV 构建未开全局开关 → 直接返回 enabled=false，且**绝不** invoke；
//   - 全局开关非严格 true（'1'/'true'/对象等）→ 同样 disabled（fail safe）；
//   - DEV + 开关 → 调 identity_v2_dev_sign_selfcheck（camelCase 参数），归一化为成功形状；
//   - Rust 自检失败 / 响应畸形 / invoke 抛错 → 一律折叠为失败形状，不抛出、不透传原始错误；
//   - reason 不得携带入参（学号 / 姓名明文）；全程零 console 输出（签名 / 公钥 / 明文不进日志）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  IDENTITY_V2_DEV_COMMAND,
  identityV2DevSignSelfcheck,
  isIdentityV2DevSeamEnabled,
  type IdentityV2DevProof
} from './identity_v2_dev_seam'

// hoisted mock：避免 vi.mock 提升导致的外部变量未初始化问题（与 certProbe.spec.ts 同类）
const { invokeNativeMock } = vi.hoisted(() => ({ invokeNativeMock: vi.fn() }))

vi.mock('../platform/native', () => ({
  invokeNative: invokeNativeMock
}))

const DEV_GLOBAL_KEY = '__HBUT_IDENTITY_V2_DEV__'

const setDevGlobal = (value: unknown): void => {
  ;(globalThis as unknown as Record<string, unknown>)[DEV_GLOBAL_KEY] = value
}

// 86 字符 = 64 字节 Ed25519 签名的 base64url（无 padding）；内容为固定假值（非真实签名）
const FAKE_SIGNATURE = `${'ab3d'.repeat(21)}ef`

/** 构造符合冻结接口形状的证明（student_name_hash 取真实 sha256("")，对应空姓名场景） */
const makeProof = (overrides: Partial<IdentityV2DevProof> = {}): IdentityV2DevProof => ({
  device_id: 'device-0001',
  student_id: '2021123456',
  student_name_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  nonce: '0123456789abcdef0123456789abcdef',
  ts: 1700000000,
  alg: 'Ed25519',
  canonical:
    'v1|device-0001|2021123456|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|0123456789abcdef0123456789abcdef|1700000000',
  signature: FAKE_SIGNATURE,
  public_key_jwk: '{"kty":"OKP","crv":"Ed25519","x":"fakeXyZ0"}',
  ...overrides
})

describe('isIdentityV2DevSeamEnabled（DEV 缝双门）', () => {
  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>)[DEV_GLOBAL_KEY]
    vi.unstubAllEnvs()
  })

  it('非 DEV 构建：即使全局开关已设置也不可用（生产 fail closed）', () => {
    vi.stubEnv('DEV', false)
    setDevGlobal(true)
    expect(isIdentityV2DevSeamEnabled()).toBe(false)
  })

  it('DEV 构建但未设置全局开关：不可用', () => {
    vi.stubEnv('DEV', true)
    expect(isIdentityV2DevSeamEnabled()).toBe(false)
  })

  it('DEV 构建 + 全局开关严格为 true：可用', () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    expect(isIdentityV2DevSeamEnabled()).toBe(true)
  })

  it('全局开关为非严格 true 的值（"1" / 1 / 对象等）：一律不可用（fail safe）', () => {
    vi.stubEnv('DEV', true)
    for (const bad of ['1', 'true', 1, {}, [], false, null, undefined] as unknown[]) {
      setDevGlobal(bad)
      expect(isIdentityV2DevSeamEnabled()).toBe(false)
    }
  })
})

describe('identityV2DevSignSelfcheck（DEV 调用缝）', () => {
  const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const
  let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []

  beforeEach(() => {
    // 监听全部 console 通道：缝的全流程必须零输出（签名 / 公钥 / 明文不得进日志）
    consoleSpies = consoleMethods.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {})
    )
  })

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore()
    }
    delete (globalThis as unknown as Record<string, unknown>)[DEV_GLOBAL_KEY]
    vi.unstubAllEnvs()
    invokeNativeMock.mockReset()
  })

  it('生产构建（非 DEV）：直接返回 enabled=false，且绝不调用 invoke', async () => {
    vi.stubEnv('DEV', false)
    setDevGlobal(true) // 即使有人在生产构建里留下了开关值，也必须读不到
    const result = await identityV2DevSignSelfcheck({
      deviceId: 'device-0001',
      studentId: '2021123456',
      studentName: '张三'
    })
    expect(result.enabled).toBe(false)
    if (result.enabled === false) {
      expect(typeof result.reason).toBe('string')
      expect(result.reason).toContain('生产构建不可用')
      // reason 不得携带任何入参（学号 / 姓名明文）
      expect(result.reason).not.toContain('2021123456')
      expect(result.reason).not.toContain('张三')
    }
    // 禁用形状：不得出现 proof / self_check_ok 字段
    expect(result).not.toHaveProperty('proof')
    expect(result).not.toHaveProperty('self_check_ok')
    expect(invokeNativeMock).not.toHaveBeenCalled()
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('DEV 构建但全局开关未开启：同样 disabled，且绝不调用 invoke', async () => {
    vi.stubEnv('DEV', true)
    const result = await identityV2DevSignSelfcheck({
      deviceId: 'device-0001',
      studentId: '2021123456'
    })
    expect(result.enabled).toBe(false)
    if (result.enabled === false) {
      expect(result.reason).toContain(DEV_GLOBAL_KEY)
    }
    expect(invokeNativeMock).not.toHaveBeenCalled()
  })

  it('DEV + 开关：调用命令（camelCase 参数）并归一化为成功形状', async () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    const proof = makeProof()
    invokeNativeMock.mockResolvedValue({
      enabled: true,
      self_check_ok: true,
      message: '签名自检通过',
      proof
    })

    const result = await identityV2DevSignSelfcheck({
      deviceId: 'device-0001',
      studentId: '2021123456',
      studentName: '张三'
    })

    // 命令名 + camelCase 参数钉死（Tauri v2：前端 camelCase / Rust snake_case 由框架转换）
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    expect(invokeNativeMock).toHaveBeenCalledWith(IDENTITY_V2_DEV_COMMAND, {
      deviceId: 'device-0001',
      studentId: '2021123456',
      studentName: '张三'
    })

    // 返回形状：字段名与 Rust 侧 snake_case 一致，原样透出
    expect(result).toEqual({
      enabled: true,
      self_check_ok: true,
      message: '签名自检通过',
      proof
    })
    // 钉死字段名与 86 字符签名：先收窄 union 与 proof 的可空性，再逐字段断言
    if (result.enabled !== true) throw new Error('预期成功形状，实际返回了禁用形状')
    if (result.proof === null) throw new Error('预期携带证明体，实际为 null')
    expect(Object.keys(result.proof).sort()).toEqual(
      [
        'alg',
        'canonical',
        'device_id',
        'nonce',
        'public_key_jwk',
        'signature',
        'student_id',
        'student_name_hash',
        'ts'
      ].sort()
    )
    // 签名恒 86 字符（64 字节 base64url 无 padding）
    expect(result.proof.signature).toHaveLength(86)
  })

  it('studentName 缺省时不传该键（Rust 侧 Option 按空串处理）', async () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    invokeNativeMock.mockResolvedValue({
      enabled: true,
      self_check_ok: true,
      message: '签名自检通过',
      proof: makeProof()
    })
    await identityV2DevSignSelfcheck({ deviceId: 'device-0001', studentId: '2021123456' })
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    expect(invokeNativeMock).toHaveBeenCalledWith(IDENTITY_V2_DEV_COMMAND, {
      deviceId: 'device-0001',
      studentId: '2021123456'
    })
  })

  it('Rust 返回 self_check_ok=false：折叠为失败形状，且证明不透传给 UI', async () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    invokeNativeMock.mockResolvedValue({
      enabled: true,
      self_check_ok: false,
      message: '验签失败（自检）',
      proof: makeProof()
    })
    const result = await identityV2DevSignSelfcheck({ deviceId: 'device-0001', studentId: '2021123456' })
    expect(result).toEqual({
      enabled: true,
      self_check_ok: false,
      message: '验签失败（自检）',
      proof: null
    })
  })

  it('畸形响应（proof 缺字段 / 类型错）：一律按失败处理，绝不原样放行', async () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    const badProofs: unknown[] = [
      null,
      {},
      'not-an-object',
      { ...makeProof(), ts: '1700000000' },
      { ...makeProof(), signature: '' },
      { ...makeProof(), public_key_jwk: 42 }
    ]
    for (const bad of badProofs) {
      invokeNativeMock.mockReset()
      invokeNativeMock.mockResolvedValue({
        enabled: true,
        self_check_ok: true,
        message: '签名自检通过',
        proof: bad
      })
      const result = await identityV2DevSignSelfcheck({ deviceId: 'device-0001', studentId: '2021123456' })
      expect(result).toMatchObject({ enabled: true, self_check_ok: false, proof: null })
    }
  })

  it('invoke 抛错（Rust 门禁 Err / 命令未注册 / 非 Tauri 运行时）：折叠为失败形状，不抛出、不透传原始错误', async () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    invokeNativeMock.mockRejectedValue(new Error('identity v2 dev seam disabled'))
    const result = await identityV2DevSignSelfcheck({ deviceId: 'device-0001', studentId: '2021123456' })
    expect(result).toMatchObject({ enabled: true, self_check_ok: false, proof: null })
    if (result.enabled === true) {
      expect(result.message).toContain('调用失败')
      // 原始错误文本不得原样透出（错误串可能携带命令名以外内容）
      expect(result.message).not.toContain('identity v2 dev seam disabled')
    }
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
  })

  it('Rust 返回 enabled=false（结构性关闭）：折叠为禁用形状，reason 仅用 Rust 人读 message', async () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    invokeNativeMock.mockResolvedValue({
      enabled: false,
      message: 'identity v2 dev seam disabled',
      self_check_ok: false,
      proof: null
    })
    const result = await identityV2DevSignSelfcheck({ deviceId: 'device-0001', studentId: '2021123456' })
    expect(result).toMatchObject({ enabled: false })
    if (result.enabled === false) {
      expect(result.reason).toContain('identity v2 dev seam disabled')
    }
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
  })

  it('成功路径全程零 console 输出：签名 / 公钥 / 明文不进日志', async () => {
    vi.stubEnv('DEV', true)
    setDevGlobal(true)
    invokeNativeMock.mockResolvedValue({
      enabled: true,
      self_check_ok: true,
      message: '签名自检通过',
      proof: makeProof()
    })
    await identityV2DevSignSelfcheck({
      deviceId: 'device-0001',
      studentId: '2021123456',
      studentName: '张三'
    })
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
  })
})
