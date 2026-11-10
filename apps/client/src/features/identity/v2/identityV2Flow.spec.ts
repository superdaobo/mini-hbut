/**
 * identityV2Flow.spec.ts —— §5 三个流程封装（验收 ①②③ + 零 console / 零存储）。
 *
 * mock 面：
 *   - `../../platform/native` 的 `invokeNative`（唯一 invoke 入口；断言命令名与入参契约）；
 *   - 内存版 localStorage（seed 本机 device_id；spy 钉死 setItem/removeItem/clear 零调用）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enrollV2, startRebind, approveRebind, parseRebindCode } from './identityV2Flow'
import { FLOW_MESSAGES } from './identityV2Errors'
import { encodeRebindCode } from './rebindCode'
import { IDENTITY_DEVICE_ID_KEY } from '../identityStore'

vi.mock('../../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: () => false
}))

import { invokeNative } from '../../../platform/native'

const mockInvoke = vi.mocked(invokeNative)

// ── 内存 localStorage（与仓库其它 spec 同款 stub 姿势）────────────────────────
class MemStorage {
  private map = new Map<string, string>()
  getItem = (key: string): string | null => (this.map.has(key) ? this.map.get(key)! : null)
  setItem = (key: string, value: string): void => {
    this.map.set(key, String(value))
  }
  removeItem = (key: string): void => {
    this.map.delete(key)
  }
  clear = (): void => {
    this.map.clear()
  }
}

const LOCAL_DEVICE_ID = 'device-local-001'
const NEW_DEVICE_ID = 'device-new-002'
const R = 'abcdef0123456789abcdef0123456789' // 32 位小写 hex
const K = 'ab'.repeat(32) // 64 位小写 hex

let storage: MemStorage

/** 含 6 类敏感子串的服务端错误串（reason 嵌在其中；折叠后必须全部消失） */
const sensitiveErrorText = (reason: string): string =>
  `HTTP 409 {"reason":"${reason}","student_id":"202312345678","signature":"MEQCIBSIGBODYDATA","public_key_jwk":"{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"abc\"}","url":"https://auth.example.com/identity/device/enroll?token=secret","request_id":"${R}"}`

const FUTURE_TS = (): number => Math.floor(Date.now() / 1000) + 3600

const validCode = (): string => {
  const encoded = encodeRebindCode({ r: R, d: NEW_DEVICE_ID, k: K, e: FUTURE_TS() })
  return encoded.ok ? encoded.code : ''
}

beforeEach(() => {
  mockInvoke.mockReset()
  storage = new MemStorage()
  vi.stubGlobal('localStorage', storage)
  storage.setItem(IDENTITY_DEVICE_ID_KEY, LOCAL_DEVICE_ID)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── 验收 ①：首次登记成功路径可用 ────────────────────────────────────────────

describe('验收 ①：enrollV2 成功路径', () => {
  it('登记成功 → {ok:true, kind:"first_claim_ok", deviceId, studentIdMasked}，且只调 identity_enroll_v2（单 input 对象 + snake_case）', async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: 'first_claim_ok',
      message: FLOW_MESSAGES.first_claim_ok,
      device_id: LOCAL_DEVICE_ID,
      student_id_masked: '2023***'
    })
    const result = await enrollV2()
    expect(result).toEqual({
      ok: true,
      kind: 'first_claim_ok',
      message: FLOW_MESSAGES.first_claim_ok,
      deviceId: LOCAL_DEVICE_ID,
      studentIdMasked: '2023***'
    })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke).toHaveBeenCalledWith('identity_enroll_v2', {
      input: { device_id: LOCAL_DEVICE_ID }
    })
  })

  it('服务端 student_active_on_other_device → kind=student_taken，文案含「旧设备」（引导换机），且不透传原文', async () => {
    mockInvoke.mockRejectedValueOnce(new Error(sensitiveErrorText('student_active_on_other_device')))
    const result = await enrollV2()
    expect(result).toEqual({ ok: false, kind: 'student_taken', message: FLOW_MESSAGES.student_taken })
    expect(result).toMatchObject({ ok: false, kind: 'student_taken' })
    if (!result.ok) expect(result.message).toContain('旧设备')
    // 敏感子串一律被折叠
    for (const fragment of [
      '202312345678',
      'MEQCIBSIGBODYDATA',
      'OKP',
      'https://auth.example.com',
      R,
      'student_active_on_other_device',
      '409'
    ]) {
      expect(result.message.includes(fragment)).toBe(false)
    }
  })

  it('同设备重复登记（idempotent）→ already_registered', async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: 'already_registered',
      message: FLOW_MESSAGES.already_registered,
      device_id: LOCAL_DEVICE_ID,
      student_id_masked: '2023***'
    })
    const result = await enrollV2()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.kind).toBe('already_registered')
  })

  it('本机未登记（无 device_id）→ not_enrolled，且**不发请求**', async () => {
    storage.removeItem(IDENTITY_DEVICE_ID_KEY)
    const result = await enrollV2()
    expect(result).toEqual({ ok: false, kind: 'not_enrolled', message: FLOW_MESSAGES.not_enrolled })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('Rust 成功响应畸形（缺字段/非对象）→ unknown（绝不按成功透出）', async () => {
    mockInvoke.mockResolvedValueOnce({ foo: 1 })
    expect(await enrollV2()).toEqual({ ok: false, kind: 'unknown', message: FLOW_MESSAGES.unknown })
    mockInvoke.mockResolvedValueOnce(42)
    expect(await enrollV2()).toEqual({ ok: false, kind: 'unknown', message: FLOW_MESSAGES.unknown })
  })
})

// ── 验收 ②：客户端无「直接接管」路径 ─────────────────────────────────────────

describe('验收 ②：startRebind / approveRebind 路径边界', () => {
  it('startRebind 只调用 identity_rebind_request_v2（不碰 approve），成功返回 rebindCode + expiresAt', async () => {
    const e = FUTURE_TS()
    mockInvoke.mockResolvedValueOnce({
      kind: 'request_pending',
      message: FLOW_MESSAGES.request_pending,
      device_id: LOCAL_DEVICE_ID,
      student_id_masked: '2023***',
      request_id: R,
      expires_at: e,
      new_pubkey_sha256: K
    })
    const result = await startRebind()
    expect(result.ok).toBe(true)
    if (!result.ok || result.kind !== 'request_pending') throw new Error('unreachable')
    expect(result.deviceId).toBe(LOCAL_DEVICE_ID)
    expect(result.expiresAt).toBe(e)
    expect(result.rebindCode).toMatch(/^HBRB1:[A-Z2-7]+$/)
    // 换机码可被本模块解析，且字段与 Rust 返回材料一致
    expect(parseRebindCode(result.rebindCode)).toMatchObject({
      ok: true,
      requestId: R,
      newDeviceId: LOCAL_DEVICE_ID,
      pubkeySha256: K,
      expiresAt: e
    })
    // 只有一条命令调用，且不是 approve
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke.mock.calls[0][0]).toBe('identity_rebind_request_v2')
    expect(mockInvoke.mock.calls.every((call) => call[0] !== 'identity_rebind_approve_v2')).toBe(true)
  })

  it('startRebind 成功但响应缺换机码材料 → unknown（不当成功处理）', async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: 'request_pending',
      device_id: LOCAL_DEVICE_ID,
      student_id_masked: '2023***',
      request_id: R,
      // 缺 expires_at / new_pubkey_sha256
    })
    expect(await startRebind()).toEqual({ ok: false, kind: 'unknown', message: FLOW_MESSAGES.unknown })
  })

  it('startRebind 本机已是活跃设备 → already_registered（无 request_id / 换机码）', async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: 'already_registered',
      message: FLOW_MESSAGES.already_registered,
      device_id: LOCAL_DEVICE_ID,
      student_id_masked: '2023***'
    })
    const result = await startRebind()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.kind).toBe('already_registered')
      expect('rebindCode' in result).toBe(false)
    }
  })

  it('approveRebind 换机码非法 → code_invalid，且**绝不**调用任何 invoke', async () => {
    for (const bad of ['HBRB1:AAAA', 'HBRA1:' + 'A'.repeat(40), '', 'hbrb1' + ':!!!' + 'A'.repeat(40)]) {
      const result = await approveRebind(bad)
      expect(result).toEqual({ ok: false, kind: 'code_invalid', message: FLOW_MESSAGES.code_invalid })
    }
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('approveRebind 本地校验通过后只调用 identity_rebind_approve_v2，入参为码里 4 个可公开字段 + 本机 device_id（snake_case 单 input 对象）', async () => {
    const e = FUTURE_TS()
    const code = validCode()
    expect(code).not.toBe('')
    mockInvoke.mockResolvedValueOnce({
      kind: 'approved',
      message: FLOW_MESSAGES.approved,
      device_id: NEW_DEVICE_ID,
      student_id_masked: '2023***'
    })
    const result = await approveRebind(code)
    expect(result).toEqual({
      ok: true,
      kind: 'approved',
      message: FLOW_MESSAGES.approved,
      deviceId: NEW_DEVICE_ID,
      studentIdMasked: '2023***'
    })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    // 批准方 = 本机 device_id（Rust 侧强校验：必须等于 canonical 的 approver 段）
    expect(mockInvoke).toHaveBeenCalledWith('identity_rebind_approve_v2', {
      input: {
        request_id: R,
        new_device_id: NEW_DEVICE_ID,
        new_pubkey_sha256: K,
        expires_at: e,
        approver_device_id: LOCAL_DEVICE_ID
      }
    })
  })

  it('approveRebind 本机未登记 → not_enrolled，且**不发请求**（旧设备批准必须用本机当前活跃设备）', async () => {
    storage.removeItem(IDENTITY_DEVICE_ID_KEY)
    const result = await approveRebind(validCode())
    expect(result).toEqual({ ok: false, kind: 'not_enrolled', message: FLOW_MESSAGES.not_enrolled })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('Rust 抛错（InvalidInput/approver_mismatch 原文）→ 折叠为 approver_mismatch，不透传原始文案', async () => {
    mockInvoke.mockRejectedValueOnce(
      new Error(`InvalidInput: approver_mismatch approver 不是该学号当前活跃设备 raw=${sensitiveErrorText('rebind_approver_mismatch')}`)
    )
    const result = await approveRebind(validCode())
    expect(result).toEqual({ ok: false, kind: 'approver_mismatch', message: FLOW_MESSAGES.approver_mismatch })
    for (const fragment of ['InvalidInput', '202312345678', 'rebind_approver_mismatch', R, 'MEQCIBSIGBODYDATA']) {
      expect(result.message.includes(fragment)).toBe(false)
    }
  })

  it('Rust 错误为纯 kind 字符串（结构化折叠后的形态）→ 精确还原 kind', async () => {
    mockInvoke.mockRejectedValueOnce('rebind_request_expired')
    const result = await approveRebind(validCode())
    expect(result).toEqual({ ok: false, kind: 'request_expired', message: FLOW_MESSAGES.request_expired })
    mockInvoke.mockRejectedValueOnce({ kind: 'network' })
    const result2 = await approveRebind(validCode())
    expect(result2).toEqual({ ok: false, kind: 'network', message: FLOW_MESSAGES.network })
  })
})

// ── 验收 ③：全部服务端 reason → kind/文案逐字 + 零敏感透传 ──────────────────

describe('验收 ③：服务端 reason 全表折叠（逐字 + 零敏感）', () => {
  const cases: Array<{ reason: string; flow: () => Promise<unknown>; kind: keyof typeof FLOW_MESSAGES }> = [
    { reason: 'student_active_on_other_device', flow: () => enrollV2(), kind: 'student_taken' },
    { reason: 'device_active_for_other_student', flow: () => enrollV2(), kind: 'device_taken' },
    { reason: 'rebind_no_active_device', flow: () => startRebind(), kind: 'no_active_device' },
    { reason: 'rebind_new_device_taken', flow: () => startRebind(), kind: 'device_taken' },
    { reason: 'rebind_request_expired', flow: () => approveRebind(validCode()), kind: 'request_expired' },
    { reason: 'rebind_request_already_done', flow: () => approveRebind(validCode()), kind: 'request_done' },
    { reason: 'rebind_approver_mismatch', flow: () => approveRebind(validCode()), kind: 'approver_mismatch' },
    { reason: 'rebind_request_not_found', flow: () => approveRebind(validCode()), kind: 'code_invalid' },
    { reason: 'rebind_pubkey_mismatch', flow: () => approveRebind(validCode()), kind: 'code_invalid' },
    { reason: 'device_not_registered', flow: () => enrollV2(), kind: 'not_enrolled' },
    { reason: 'no_local_login', flow: () => enrollV2(), kind: 'not_logged_in' },
    { reason: 'keyring_unavailable', flow: () => enrollV2(), kind: 'secure_storage_unavailable' },
    // 未知 reason → unknown（不透传原文）
    { reason: 'zzz_totally_unknown_reason', flow: () => enrollV2(), kind: 'unknown' }
  ]

  for (const { reason, flow, kind } of cases) {
    it(`reason=${reason} → kind=${kind}（逐字文案 + 零敏感）`, async () => {
      mockInvoke.mockRejectedValueOnce(new Error(sensitiveErrorText(reason)))
      const result = (await flow()) as { ok: boolean; kind?: string; message: string }
      expect(result).toEqual({ ok: false, kind, message: FLOW_MESSAGES[kind] })
      for (const fragment of [
        '202312345678',
        'MEQCIBSIGBODYDATA',
        'OKP',
        'https://auth.example.com',
        R,
        reason
      ]) {
        expect(result.message.includes(fragment), `文案不得包含「${fragment}」`).toBe(false)
      }
    })
  }
})

// ── 零 console / 零存储 ─────────────────────────────────────────────────────

describe('零 console / 零存储（spy 钉死）', () => {
  it('全部流程（成功/失败/非法码）不写 console、不写 localStorage', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const setItem = vi.spyOn(storage, 'setItem')
    const clearSpy = vi.spyOn(storage, 'clear')

    // 成功路径 ×3
    mockInvoke.mockResolvedValueOnce({ kind: 'first_claim_ok', device_id: LOCAL_DEVICE_ID, student_id_masked: '2023***' })
    await enrollV2()
    const e = FUTURE_TS()
    mockInvoke.mockResolvedValueOnce({ kind: 'request_pending', device_id: LOCAL_DEVICE_ID, student_id_masked: '2023***', request_id: R, expires_at: e, new_pubkey_sha256: K })
    await startRebind()
    mockInvoke.mockResolvedValueOnce({ kind: 'approved', device_id: NEW_DEVICE_ID, student_id_masked: '2023***' })
    await approveRebind(validCode())
    // 失败路径（折叠）+ 本地失败（不发请求）
    mockInvoke.mockRejectedValueOnce(new Error(sensitiveErrorText('rebind_approver_mismatch')))
    await approveRebind(validCode())
    await approveRebind('HBRB1:AAAA')
    // setup 操作：移除本机 device_id（在 removeItem spy 安装**之前**，避免计入流程写）
    storage.removeItem(IDENTITY_DEVICE_ID_KEY)
    const removeItem = vi.spyOn(storage, 'removeItem')
    await enrollV2()

    expect(consoleLog).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleInfo).not.toHaveBeenCalled()
    expect(consoleDebug).not.toHaveBeenCalled()
    // 唯一允许的存储访问是 setup 前的 seed 与 setup 的 remove；流程代码零写
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(clearSpy).not.toHaveBeenCalled()

    consoleLog.mockRestore()
    consoleWarn.mockRestore()
    consoleError.mockRestore()
    consoleInfo.mockRestore()
    consoleDebug.mockRestore()
  })
})
