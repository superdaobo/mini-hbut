// src/features/identity/authHistoryErrors.spec.ts
//
// #776/#777：授权记录错误契约测试。
//
// 覆盖两条错误映射链（服务层纯映射行为，不触网、不依赖 DOM）：
//   1. #777 error_kind → IdentityUserSafeErrorCode：Rust IdentityError 变体的
//      稳定机器码（not_enrolled / keyring_* / network / api / internal 等）
//      经原生输出 { status:0, error_kind } 进入前端后的映射行为；
//   2. #776 status → code：Core 非 2xx（401/403/404/410/422/409/500 等）
//      按响应体错误码 + 状态码兜底走 throwMappedError 同款映射，
//      网络类（invoke 抛错）兜底 network_unavailable，不再全部折叠为同一文案。
//
// 脱敏自查：错误文案绝不携带 device_id 全文、签名、token；内部细节只进 internalDetail。
// mock 方式：vi.mock('../../platform/native')，与 authHistoryRegression.spec 一致。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createServiceError,
  fetchAuthHistory,
  IDENTITY_DEVICE_ID_KEY
} from './identityService'
import { identityFetchAuthHistory, isTauriRuntime } from '../../platform/native'
import { IdentityServiceError, type IdentityUserSafeErrorCode } from './types'

vi.mock('../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
  identityFetchAuthHistory: vi.fn()
}))

const TEST_DEVICE_ID = 'device-test-0001'

// node 环境无 localStorage：注入 stub（与 authHistoryRegression.spec 同款基建）
const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear(),
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  length: 0
}

/** 原生层失败输出（#777 结构化错误分类） */
const nativeFailure = (kind: string, message: string) => ({
  status: 0,
  body: '',
  error_kind: kind,
  error_message: message
})

/** Core 非 2xx 输出（#776：status 透传 + 响应体错误体） */
const nativeHttpError = (status: number, body = '') => ({
  status,
  body,
  error_kind: null,
  error_message: null
})

const catchCode = async (promise: Promise<unknown>): Promise<IdentityServiceError> =>
  (await promise.catch((err: unknown) => err)) as IdentityServiceError

beforeEach(() => {
  storageMap.clear()
  storageMap.set(IDENTITY_DEVICE_ID_KEY, TEST_DEVICE_ID)
  ;(globalThis as { localStorage?: Storage }).localStorage = stubStorage as unknown as Storage
  // 隔离 reportIdentityDiag 的诊断上报
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  vi.mocked(isTauriRuntime).mockReturnValue(true)
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ─── 1. #777：error_kind → code 映射契约 ─────────────────────────────────────

describe('#777 error_kind → 用户可读错误码映射', () => {
  it.each([
    ['not_enrolled', 'device_not_bound'],
    ['keyring_unavailable', 'secure_storage_unavailable'],
    ['keyring_write_mismatch', 'secure_storage_unavailable'],
    ['keyring_backend_missing', 'secure_storage_unavailable'],
    ['network', 'network_unavailable'],
    ['invalid_input', 'unknown'],
    ['core_base_url_missing', 'unknown'],
    ['no_local_login', 'unknown'],
    ['internal', 'unknown']
  ] as const)('error_kind=%s → code=%s', async (kind, expected) => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeFailure(kind, `脱敏诊断文本（${kind}）`)
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err).toBeInstanceOf(IdentityServiceError)
    expect(err.code).toBe(expected)
    // Rust 已脱敏文案透传给用户；kind 只进 internalDetail
    expect(err.message).toBe(`脱敏诊断文本（${kind}）`)
    expect(err.internalDetail).toContain(kind)
  })

  it('未知 error_kind → 兜底 unknown（前向兼容：旧版 App 遇新 kind 不误分类）', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeFailure('future_kind_999', '未来版本的错误')
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('unknown')
  })

  it('error_message 缺失 → 使用该 code 的默认文案', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue({
      status: 0,
      body: '',
      error_kind: 'network',
      error_message: null
    }) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('network_unavailable')
    expect(err.message).toBe('网络不可用，无法连接身份服务，请稍后重试')
  })

  it('脱敏契约：secure_storage_unavailable 文案不携带 device_id/签名材料', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeFailure(
        'keyring_unavailable',
        '系统安全存储不可用，设备身份功能已停用（fail closed，不降级）：模拟'
      )
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.message).not.toContain(TEST_DEVICE_ID)
    expect(err.message).not.toContain('signature')
    expect(err.internalDetail).not.toContain(TEST_DEVICE_ID)
  })
})

// ─── 2. #776：status → code 映射契约（throwMappedError 同款） ─────────────────

describe('#776 Core 非 2xx 状态映射（响应体错误码优先，状态码兜底）', () => {
  it.each([
    [401, '接力凭据无效，请从网页重新发起授权'],
    [403, '当前设备已被撤销，无法继续授权'],
    [404, '请求不存在或已完成'],
    [410, '应用请求已过期，请从网页重新发起'],
    [422, '应用已被暂停，无法继续授权'],
    [409, '请求不存在或已完成'],
    [500, '授权处理失败，请稍后重试'],
    [502, '授权处理失败，请稍后重试'],
    [503, '授权处理失败，请稍后重试']
  ] as const)('HTTP %i 无错误体 → 状态码兜底文案（code=unknown，与 throwMappedError 现状一致）', async (status, expectedMessage) => {
    // 无错误体时 parseErrorPayload 得到 HTTP_xxx 伪码 → mapServerCode 兜底 unknown，
    // 但 message 保留 mapStatusFallback 的状态码文案（#775 回归 spec 已锁定该现状）。
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(nativeHttpError(status)) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err).toBeInstanceOf(IdentityServiceError)
    expect(err.code).toBe('unknown')
    expect(err.message).toBe(expectedMessage)
    // internalDetail 记录 status 与上下文（脱敏诊断，不含响应体原文）
    expect(err.internalDetail).toContain(`HTTP ${status}`)
    expect(err.internalDetail).toContain('fetchAuthHistory')
  })

  it('401 + Core 结构化错误体 {error:{code,message}} → 按 mapServerCode 映射并透传脱敏文案', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeHttpError(
        401,
        JSON.stringify({ error: { code: 'DEVICE_AUTH_FAILED', message: '设备签名验证失败' } })
      )
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('device_revoked')
    expect(err.message).toBe('设备签名验证失败')
  })

  it('403 + SIGNATURE_INVALID → signature_rejected', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeHttpError(403, JSON.stringify({ error: { code: 'SIGNATURE_INVALID', message: '签名校验失败' } }))
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('signature_rejected')
  })

  it('410 + AUTH_REQUEST_EXPIRED → request_expired', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeHttpError(410, JSON.stringify({ error: 'EXPIRED' }))
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('request_expired')
  })

  it('非 2xx + 非法 JSON 错误体（网关 HTML）→ 仍按状态码兜底，不误报网络错误', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeHttpError(502, '<html>Bad Gateway</html>')
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('unknown')
    expect(err.message).not.toContain('<html>')
  })

  it('错误体携带的 message 为空 → 回退状态码默认文案', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeHttpError(403, JSON.stringify({ error: { code: 'DEVICE_AUTH_FAILED', message: '' } }))
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('device_revoked')
    expect(err.message).toBe('当前设备已被撤销，无法继续授权')
  })
})

// ─── 3. 网络失败兜底 + 成功路径宽容解析（#776 删除「全折叠」逻辑） ─────────────

describe('#776 网络失败与成功路径契约', () => {
  it('invoke 抛错（原生 panic/运行时异常）→ network_unavailable 兜底，内部细节不进用户文案', async () => {
    vi.mocked(identityFetchAuthHistory).mockRejectedValue(
      new Error('invoke failed: panic-with-token-abc')
    )
    const err = await catchCode(fetchAuthHistory())
    expect(err.code).toBe('network_unavailable')
    expect(err.message).toBe('无法连接身份服务，请检查网络后重试')
    expect(err.message).not.toContain('panic-with-token-abc')
    expect(err.internalDetail).toContain('invoke failed')
  })

  it('200 + 非法 JSON body → 空数组不抛（不再折叠为 network_unavailable）', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue({
      status: 200,
      body: '{{not-json',
      error_kind: null,
      error_message: null
    }) as never
    await expect(fetchAuthHistory()).resolves.toEqual([])
  })

  it('200 + 空 body → 空数组', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue({
      status: 200,
      body: '',
      error_kind: null,
      error_message: null
    }) as never
    await expect(fetchAuthHistory()).resolves.toEqual([])
  })
})

// ─── 4. 可重试性契约（View 重试按钮的依据） ─────────────────────────────────

describe('#776 错误码可重试性契约', () => {
  // View 对 network/5xx 允许重试；device_revoked/no_device 显示引导而非无限重试。
  const RETRYABLE: IdentityUserSafeErrorCode[] = ['network_unavailable']
  const GUIDED: IdentityUserSafeErrorCode[] = ['device_revoked', 'device_not_bound', 'secure_storage_unavailable']

  it('网络类错误可重试（IdentityCoordinator 的 retryable 语义保持一致）', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeFailure('network', '身份服务网络请求失败：连接超时')
    ) as never
    const err = await catchCode(fetchAuthHistory())
    expect(RETRYABLE).toContain(err.code)
  })

  it('设备被撤销/未注册/安全存储不可用 → 走引导而非重试（错误码分类正确是前提）', async () => {
    const cases: Array<[string, IdentityUserSafeErrorCode]> = [
      ['not_enrolled', 'device_not_bound'],
      ['keyring_unavailable', 'secure_storage_unavailable']
    ]
    for (const [kind, expected] of cases) {
      vi.mocked(identityFetchAuthHistory).mockResolvedValue(
        nativeFailure(kind, `脱敏诊断（${kind}）`)
      ) as never
      const err = await catchCode(fetchAuthHistory())
      expect(err.code).toBe(expected)
      expect(GUIDED).toContain(err.code)
    }
  })

  it('默认文案契约：引导类错误码的 DEFAULT_MESSAGES 非空（createServiceError 兜底）', () => {
    for (const code of GUIDED) {
      const err = createServiceError(code)
      expect(err.message.trim().length).toBeGreaterThan(4)
    }
  })
})
