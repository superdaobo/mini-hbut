// P2-5（#1209）：OIDC 会话 provider（默认路径）单元测试。
//
// 覆盖（p2-5-refresh-token-spec.md §2.1 / §3）：
//   - getAccessToken：命令与入参 `{ input: { force: false } }` 正确、返回 AT、
//     经 install 后命中 identity_access_token 内存缓存（第二次不重复取）；
//   - refreshAccessToken：force=true（401 强制刷新语义）；
//   - 失败一律 null（ok:false / 无会话 / 空 token / 形状畸形 / invoke 抛错 / 非 Tauri）；
//   - install：Tauri 时注册 provider；**非 Tauri 不安装**（hasIdentityAccessTokenProvider 保持 false）；
//   - 零泄露：不写任何 storage（写操作计数为 0）；错误路径不产生任何输出。
//
// 说明：`platform/native` 整模块 mock（invokeNative / isTauriRuntime 均为 vi.fn），
// 与 session_credentials.spec.ts 同款；provider 级用例改用 deps 注入（与
// identity_device_token.spec.ts 同款范式）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true)
}))

import { invokeNative, isTauriRuntime } from '../platform/native'
import {
  clearIdentityAccessToken,
  getIdentityAccessToken,
  hasIdentityAccessTokenProvider,
  setIdentityAccessTokenProvider
} from './identity_access_token'
import {
  createIdentityOidcTokenProvider,
  fetchOidcAccessToken,
  installIdentityOidcTokenProvider
} from './identity_oidc_token'

const AT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzdWJfMDEiLCJpc3MiOiJodHRwOi8vdG9rZW5lbnBvaW50In0.sig'

/** 冻结契约 §2.2 的成功 payload（snake_case 逐字对应） */
const okPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ok: true,
  kind: 'oidc_refresh_ok',
  message: '登录状态已更新',
  access_token: AT,
  expires_at: 1893456000,
  student_id_masked: '2023***',
  ...overrides
})

/** 记录调用参数的 invoke 假实现（返回固定 payload / 抛错 / 自定义） */
const makeInvoke = (impl: () => Promise<unknown> = async () => okPayload()) =>
  vi.fn(async (_command: string, _args?: Record<string, unknown>): Promise<unknown> => impl())

interface StorageMock {
  values: Map<string, string>
  writes: string[]
}

let storage: StorageMock

beforeEach(() => {
  storage = { values: new Map(), writes: [] }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      // 记录所有写操作：P2-5 硬约束「AT 绝不落任何持久化」，本测试以此断言
      storage.writes.push(`${key}=${value}`)
      storage.values.set(key, value)
    },
    removeItem: (key: string) => {
      storage.writes.push(`remove:${key}`)
      storage.values.delete(key)
    }
  })
  // 缺省 Tauri；isTauriRuntime 每个用例按需覆盖
  vi.mocked(isTauriRuntime).mockReturnValue(true)
})

afterEach(() => {
  setIdentityAccessTokenProvider(null)
  clearIdentityAccessToken()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('P2-5 OIDC provider：取票（createIdentityOidcTokenProvider / fetchOidcAccessToken）', () => {
  it('getAccessToken：命令名与入参正确（单 input + force:false），返回 AT', async () => {
    const invoke = makeInvoke()
    const provider = createIdentityOidcTokenProvider({ invoke, isTauri: () => true })
    expect(await provider.getAccessToken()).toBe(AT)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('identity_oidc_access_token', { input: { force: false } })
  })

  it('refreshAccessToken：force=true（401 强制刷新语义）', async () => {
    const invoke = makeInvoke()
    const provider = createIdentityOidcTokenProvider({ invoke, isTauri: () => true })
    expect(await provider.refreshAccessToken()).toBe(AT)
    expect(invoke).toHaveBeenCalledWith('identity_oidc_access_token', { input: { force: true } })
  })

  it('成功路径经 install 后命中内存缓存：第二次 get 不重复取票', async () => {
    const invoke = makeInvoke()
    setIdentityAccessTokenProvider(createIdentityOidcTokenProvider({ invoke, isTauri: () => true }))
    expect(await getIdentityAccessToken()).toBe(AT)
    expect(invoke).toHaveBeenCalledTimes(1)
    // 内存缓存命中（identity_access_token 的单飞/缓存语义）：不重复 invoke
    expect(await getIdentityAccessToken()).toBe(AT)
    expect(invoke).toHaveBeenCalledTimes(1)
    // 401 后强制刷新 → 再取一次（force:true）
    expect(await getIdentityAccessToken(true)).toBe(AT)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('失败一律 null：ok:false（无会话）/ 空 token / 形状畸形', async () => {
    const cases: Array<() => Promise<unknown>> = [
      async () => ({ ok: false, kind: 'oidc_session_absent', message: '未登录' }),
      async () => okPayload({ access_token: '' }),
      async () => okPayload({ access_token: '   ' }),
      async () => okPayload({ access_token: undefined }),
      async () => okPayload({ ok: true, access_token: 12345 }),
      async () => ({ ok: true, kind: 'oidc_refresh_ok', message: '登录状态已更新' }),
      async () => null
    ]
    for (const impl of cases) {
      const provider = createIdentityOidcTokenProvider({
        invoke: makeInvoke(impl),
        isTauri: () => true
      })
      expect(await provider.getAccessToken()).toBeNull()
    }
  })

  it('invoke 抛错（Rust 内部故障）→ null，绝不抛给调用方', async () => {
    const provider = createIdentityOidcTokenProvider({
      invoke: makeInvoke(async () => {
        throw new Error('internal error: keyring write failed')
      }),
      isTauri: () => true
    })
    await expect(provider.getAccessToken()).resolves.toBeNull()
    await expect(provider.refreshAccessToken()).resolves.toBeNull()
  })

  it('非 Tauri（Web/Capacitor 无 keyring 会话）→ null 且不发起 invoke', async () => {
    const invoke = makeInvoke()
    const provider = createIdentityOidcTokenProvider({ invoke, isTauri: () => false })
    expect(await provider.getAccessToken()).toBeNull()
    expect(await provider.refreshAccessToken()).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
    // 独立入口同款语义
    expect(await fetchOidcAccessToken(false, { invoke, isTauri: () => false })).toBeNull()
  })

  it('绝不写任何 storage（AT 仅内存）', async () => {
    const provider = createIdentityOidcTokenProvider({ invoke: makeInvoke(), isTauri: () => true })
    expect(await provider.getAccessToken()).toBe(AT)
    expect(await provider.refreshAccessToken()).toBe(AT)
    // 成功路径 + 失败路径都不得写 storage
    const failing = createIdentityOidcTokenProvider({
      invoke: makeInvoke(async () => ({ ok: false, kind: 'oidc_refresh_failed', message: 'x' })),
      isTauri: () => true
    })
    expect(await failing.getAccessToken()).toBeNull()
    expect(storage.writes).toEqual([])
  })
})

describe('P2-5 OIDC provider：install（生产注入点）', () => {
  it('Tauri 运行时：注册 provider（hasIdentityAccessTokenProvider 为 true），惰性取票', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    vi.mocked(invokeNative).mockImplementation(async () => okPayload())
    expect(hasIdentityAccessTokenProvider()).toBe(false)
    installIdentityOidcTokenProvider()
    expect(hasIdentityAccessTokenProvider()).toBe(true)
    expect(await getIdentityAccessToken()).toBe(AT)
    expect(vi.mocked(invokeNative)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(invokeNative)).toHaveBeenCalledWith('identity_oidc_access_token', {
      input: { force: false }
    })
  })

  it('非 Tauri 运行时：不安装（provider 保持 null，调用方走 legacy 双轨）', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false)
    installIdentityOidcTokenProvider()
    expect(hasIdentityAccessTokenProvider()).toBe(false)
    expect(await getIdentityAccessToken()).toBeNull()
    expect(vi.mocked(invokeNative)).not.toHaveBeenCalled()
  })
})
