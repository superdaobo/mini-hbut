// src/features/identity/authHistoryRegression.spec.ts
//
// #775：授权记录（auth-history）服务层跨层回归测试。
//
// 覆盖 issue #775「客户端可测子集」的前端服务层部分：
//   1. fetchAuthHistory 前置守卫：无 device_id / 非 Tauri 运行时 → device_not_bound，
//      且绝不发起原生命令调用（identityFetchAuthHistory 零调用）；
//   2. 原生返回 status=200：合法 items 原样返回；空 items / 缺 items / 空 body → 空数组不抛；
//   3. status=200 + 非法 JSON body：当前实现 JSON.parse 直接抛 SyntaxError，
//      被 catch 折叠为 network_unavailable —— 本测试把该现状固化为契约，
//      待 #776 修复后应改为「返回空数组」，届时需同步调整本用例；
//   4. 非 200（401/403/404/500）：按 throwMappedError 现状断言映射行为
//      （响应体无错误信息时 code 兜底为 unknown、message 取状态码兜底文案；
//      携带 Core 错误体时按 mapServerCode 映射为用户可读错误码并透传脱敏文案）；
//   5. 原生 invoke 抛错 → 折叠为 network_unavailable（同样可能被 #776 改变，注明）；
//   6. DEFAULT_MESSAGES 契约：全部错误码默认文案非空、不含错误码字样。
//
// mock 方式：vi.mock('../../platform/native')（identityService.ts 的实际 import 路径）。
// 测试数据一律使用假 device_id（device-test-0001），绝不包含真实凭据。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  createServiceError,
  fetchAuthHistory,
  IDENTITY_DEVICE_ID_KEY
} from './identityService'
import { identityFetchAuthHistory, isTauriRuntime } from '../../platform/native'
import {
  IdentityServiceError,
  type IdentityAuthHistoryItem,
  type IdentityUserSafeErrorCode
} from './types'

vi.mock('../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
  identityFetchAuthHistory: vi.fn()
}))

// ─── 测试基建（node 环境无 localStorage，注入 stub；fetch 全局 stub 隔离诊断上报） ──

const TEST_DEVICE_ID = 'device-test-0001'

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

/** 构造授权历史条目 fixture（假数据，不含真实凭据） */
const makeItem = (requestId: string, appName: string): IdentityAuthHistoryItem => ({
  request_id: requestId,
  approved_at: new Date(Date.now() - 60_000).toISOString(),
  status: 'approved',
  client: {
    name: appName,
    homepage_host: 'app.example.test',
    developer_display_name: '测试开发者',
    review_status: 'verified'
  },
  scopes: [{ id: 'profile', label: '查看基本资料', risk: 'basic' }]
})

const nativeOk = (status: number, body: string) => ({ status, body })

beforeEach(() => {
  storageMap.clear()
  storageMap.set(IDENTITY_DEVICE_ID_KEY, TEST_DEVICE_ID)
  ;(globalThis as { localStorage?: Storage }).localStorage = stubStorage as unknown as Storage
  // 隔离 reportIdentityDiag 的诊断上报（不真正发 localhost 请求）
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  vi.mocked(isTauriRuntime).mockReturnValue(true)
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ─── 1. 前置守卫 ──────────────────────────────────────────────────────────────

describe('#775 fetchAuthHistory 前置守卫', () => {
  it('无 device_id → device_not_bound 且不发起原生命令调用', async () => {
    storageMap.delete(IDENTITY_DEVICE_ID_KEY)
    let caught: unknown = null
    try {
      await fetchAuthHistory()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(IdentityServiceError)
    expect(caught).toMatchObject({
      code: 'device_not_bound',
      name: 'IdentityServiceError'
    })
    expect((caught as IdentityServiceError).message).toContain('设备注册')
    expect(identityFetchAuthHistory).not.toHaveBeenCalled()
  })

  it('非 Tauri 运行时 → device_not_bound 且不发起原生命令调用', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false)
    await expect(fetchAuthHistory()).rejects.toMatchObject({ code: 'device_not_bound' })
    expect(identityFetchAuthHistory).not.toHaveBeenCalled()
  })
})

// ─── 2. status=200：正常与空态 ────────────────────────────────────────────────

describe('#775 fetchAuthHistory 200 响应解析', () => {
  it('合法 items → 原样返回数组，并把 device_id 透传给原生命令', async () => {
    const items = [makeItem('ar_test_0001', '课程助手'), makeItem('ar_test_0002', '打印助手')]
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeOk(200, JSON.stringify({ items })) as never
    )
    await expect(fetchAuthHistory()).resolves.toEqual(items)
    expect(identityFetchAuthHistory).toHaveBeenCalledWith(
      expect.objectContaining({ device_id: TEST_DEVICE_ID })
    )
  })

  it('空 items → 空数组', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeOk(200, JSON.stringify({ items: [] })) as never
    )
    await expect(fetchAuthHistory()).resolves.toEqual([])
  })

  it('缺 items 字段 → 空数组（宽容解析，不抛）', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(nativeOk(200, '{}') as never)
    await expect(fetchAuthHistory()).resolves.toEqual([])
  })

  it('body 为空字符串 → 空数组（fallback 解析 {}）', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(nativeOk(200, '') as never)
    await expect(fetchAuthHistory()).resolves.toEqual([])
  })
})

// ─── 3. 非法 JSON body（#776 修复后契约：宽容解析） ─────────────────────────

describe('#775 fetchAuthHistory 非法 JSON body（#776 修复后契约）', () => {
  it('status=200 + 非法 JSON → 返回空数组不抛（宽容解析，不误报网络错误）', async () => {
    // #776 修复后：成功路径响应体解析带局部保护，
    // SyntaxError 不再进 catch 折叠为 network_unavailable，而是按空态处理。
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(nativeOk(200, '{{not-json') as never)
    await expect(fetchAuthHistory()).resolves.toEqual([])
  })
})

// ─── 4. 非 200 状态映射（按 throwMappedError 现状断言） ───────────────────────

describe('#775 fetchAuthHistory 非 200 状态映射（现状契约）', () => {
  it.each([
    [401, '接力凭据无效，请从网页重新发起授权'],
    [403, '当前设备已被撤销，无法继续授权'],
    [404, '请求不存在或已完成'],
    [500, '授权处理失败，请稍后重试']
  ] as const)('HTTP %i 无错误体 → code=unknown + 状态码兜底文案（现状映射）', async (status, message) => {
    // 现状：响应体无 error 信息时 parseErrorPayload 得到 HTTP_xxx 伪码，
    // mapServerCode 兜底为 unknown，但 message 保留 mapStatusFallback 的状态码文案。
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(nativeOk(status, '') as never)
    await expect(fetchAuthHistory()).rejects.toMatchObject({ code: 'unknown', message })
  })

  it('401 + Core 结构化错误体 → 按 mapServerCode 映射并透传脱敏文案', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeOk(
        401,
        JSON.stringify({ error: { code: 'DEVICE_AUTH_FAILED', message: '设备签名验证失败' } })
      ) as never
    )
    await expect(fetchAuthHistory()).rejects.toMatchObject({
      code: 'device_revoked',
      message: '设备签名验证失败'
    })
  })

  it('401 + 纯 code 错误体（error 为字符串）→ 映射为 invalid_handoff', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(
      nativeOk(401, JSON.stringify({ error: 'INVALID_HANDOFF' })) as never
    )
    await expect(fetchAuthHistory()).rejects.toMatchObject({
      code: 'invalid_handoff',
      message: '接力凭据无效，请从网页重新发起授权'
    })
  })

  it('非 200 + 非法 JSON 错误体 → 仍按状态码兜底映射，不因解析失败误报网络错误', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue(nativeOk(403, '<html>gateway</html>') as never)
    await expect(fetchAuthHistory()).rejects.toMatchObject({
      code: 'unknown',
      message: '当前设备已被撤销，无法继续授权'
    })
  })
})

// ─── 5. 原生调用失败兜底（#777 修复后契约） ──────────────────────────────────

describe('#775 fetchAuthHistory 原生调用失败兜底（#777 修复后契约）', () => {
  it('invoke 抛错 → 兜底 network_unavailable（用户可读文案，不泄露内部错误）', async () => {
    // #777 修复后：invoke 本身失败（panic/运行时异常）拿不到结构化分类，
    // 仍按网络类兜底，但文案改为与 requestJson 一致的「无法连接身份服务」。
    vi.mocked(identityFetchAuthHistory).mockRejectedValue(
      new Error('invoke failed: identity_fetch_auth_history panic detail')
    )
    const err = await fetchAuthHistory().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(IdentityServiceError)
    expect(err).toMatchObject({
      code: 'network_unavailable',
      message: '无法连接身份服务，请检查网络后重试'
    })
    // 内部细节只进 internalDetail（脱敏日志），不进用户文案
    expect((err as IdentityServiceError).message).not.toContain('panic detail')
    expect((err as IdentityServiceError).internalDetail).toContain('invoke failed')
  })

  it('原生层 status=0 + error_kind=not_enrolled → device_not_bound（#777 结构化分类）', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue({
      status: 0,
      body: '',
      error_kind: 'not_enrolled',
      error_message: '本设备尚未注册身份，请先完成设备注册'
    }) as never
    await expect(fetchAuthHistory()).rejects.toMatchObject({
      code: 'device_not_bound',
      message: '本设备尚未注册身份，请先完成设备注册'
    })
  })

  it('原生层 status=0 + error_kind=keyring_unavailable → secure_storage_unavailable', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue({
      status: 0,
      body: '',
      error_kind: 'keyring_unavailable',
      error_message: '系统安全存储不可用，设备身份功能已停用（fail closed，不降级）：模拟'
    }) as never
    const err = await fetchAuthHistory().catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'secure_storage_unavailable' })
    // 用户文案来自 Rust 已脱敏 Display，不携带 device_id
    expect((err as IdentityServiceError).message).not.toContain(TEST_DEVICE_ID)
  })

  it('原生层 status=0 + error_kind=network → network_unavailable', async () => {
    vi.mocked(identityFetchAuthHistory).mockResolvedValue({
      status: 0,
      body: '',
      error_kind: 'network',
      error_message: '身份服务网络请求失败：连接超时'
    }) as never
    await expect(fetchAuthHistory()).rejects.toMatchObject({ code: 'network_unavailable' })
  })

  it('原生层 status=0 + error_kind=api（防御分支）→ 按状态码兜底映射', async () => {
    // 理论不可达：api 类错误应携带 HTTP status（#776）；防御性走 500 兜底
    vi.mocked(identityFetchAuthHistory).mockResolvedValue({
      status: 0,
      body: '',
      error_kind: 'api',
      error_message: '身份服务返回错误（HTTP 500）：服务器内部错误'
    }) as never
    await expect(fetchAuthHistory()).rejects.toMatchObject({ code: 'unknown' })
  })
})

// ─── 6. DEFAULT_MESSAGES 全覆盖契约 ──────────────────────────────────────────

describe('#775 DEFAULT_MESSAGES 用户可读文案契约', () => {
  // 与 types.ts 的 IdentityUserSafeErrorCode 清单保持同步（源码契约用例会在
  // DEFAULT_MESSAGES 键数量变化时给出失败信号，防止漏配）。
  const ALL_CODES: IdentityUserSafeErrorCode[] = [
    'request_expired',
    'request_not_found',
    'client_unavailable',
    'invalid_handoff',
    'network_unavailable',
    'device_not_bound',
    'device_revoked',
    'session_revalidation_required',
    'secure_storage_unavailable',
    'signature_rejected',
    'signing_material_missing',
    'test_account_blocked',
    'unknown'
  ]

  it('全部错误码默认文案非空且不含错误码字样', () => {
    for (const code of ALL_CODES) {
      const err = createServiceError(code)
      expect(err, `错误码 ${code} 应构造 IdentityServiceError`).toBeInstanceOf(IdentityServiceError)
      expect(err.code).toBe(code)
      expect(err.message.trim().length, `错误码 ${code} 默认文案为空`).toBeGreaterThan(4)
      expect(err.message, `错误码 ${code} 文案不应包含错误码 key 字样`).not.toContain(code)
    }
  })

  it('DEFAULT_MESSAGES 键集合与错误码清单一致（源码契约，防新增 code 漏配）', () => {
    const source = readFileSync(new URL('./identityService.ts', import.meta.url), 'utf8')
    const start = source.indexOf('const DEFAULT_MESSAGES')
    expect(start).toBeGreaterThan(0)
    const block = source.slice(start, source.indexOf('}', start))
    const keys = Array.from(block.matchAll(/^\s{2}([a-z_]+):/gm)).map((m) => m[1])
    expect(keys.sort()).toEqual([...ALL_CODES].sort())
  })
})
