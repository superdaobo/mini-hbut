// P2-5（#1209）：token provider 选择器（默认 OIDC + 过渡开关）单元测试。
//
// 覆盖（p2-5-refresh-token-spec.md §2.3 / §3）：
//   - 三种模式选择：非 Tauri → 'disabled'；开关 '1' → 'device'；否则（默认）→ 'oidc'；
//     开关仅显式 '1' 生效（'0'/'true'/'' → oidc）；
//   - **默认不回退设备换票**：'oidc' 模式下（含无会话/刷新失败）绝不调用
//     `identity_device_token`（回退必须显式开开关）；
//   - 过渡开关：'device' 模式设备换票优先（走 identity_device_token 既有链路）；
//   - 'oidc' 模式复用既有事件挂点（hbu-session-logout / hbu-identity-login-resumed）
//     触发三清（identity_oidc_logout 被调用）；重复安装不叠加监听。
//
// 说明：`platform/native` 整模块 mock（invoke 按命令名路由，区分两条换票链路）；
// 过渡开关用 `vi.stubEnv` 注入（与仓库既有 import.meta.env 测试范式一致）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true)
}))

import { invokeNative, isTauriRuntime } from '../platform/native'
import {
  getIdentityAccessToken,
  hasIdentityAccessTokenProvider,
  setIdentityAccessTokenProvider
} from './identity_access_token'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'
import { PRODUCTION_CANONICAL_ISSUER } from '../features/identity/identityIssuers'
import {
  IDENTITY_DEVICE_TOKEN_LOGIN_EVENT,
  IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT
} from './identity_device_token'
import { installIdentityTokenProvider, resolveIdentityTokenMode } from './identity_token_provider'

const DEVICE_ID = '0198a1b2c3d4e5f6a7b8c9d0'
const STUDENT_ID = '2023010101'
const OIDC_AT = 'oidc-access-token-value'

/** 构造三段式假 JWT（设备换票链路要求 canonical issuer + 主体学号一致） */
const makeJwt = (claims: Record<string, unknown>): string => {
  const b64url = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64url({ alg: 'RS256', typ: 'at+jwt', kid: 'test' })}.${b64url(claims)}.${'s'.repeat(64)}`
}

const DEVICE_AT = makeJwt({
  iss: PRODUCTION_CANONICAL_ISSUER,
  aud: 'mini-hbut-hf-api',
  hbut_student_id: STUDENT_ID
})

/** OIDC 成功 payload（冻结契约 §2.2 形状） */
const oidcOkPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ok: true,
  kind: 'oidc_refresh_ok',
  message: '登录状态已更新',
  access_token: OIDC_AT,
  expires_at: 1893456000,
  student_id_masked: '2023***',
  ...overrides
})

const deviceOkPayload = (): Record<string, unknown> => ({
  access_token: DEVICE_AT,
  token_type: 'Bearer',
  expires_in: 900,
  expires_at: '2026-09-27T10:15:00.000Z'
})

let listeners: Map<string, Set<() => void>>
let storage: Map<string, string>

const dispatchWindowEvent = (type: string): void => {
  for (const handler of listeners.get(type) ?? []) handler()
}

const countInvoke = (command: string): number =>
  vi.mocked(invokeNative).mock.calls.filter((args) => args[0] === command).length

beforeEach(() => {
  listeners = new Map()
  storage = new Map([
    [IDENTITY_DEVICE_ID_KEY, DEVICE_ID],
    ['hbu_username', STUDENT_ID]
  ])
  const registry = {
    addEventListener: (type: string, handler: () => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(handler)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler)
    }
  }
  vi.stubGlobal('window', registry)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key)
  })
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  // 按命令名路由两条换票链路 + OIDC 登出（计数区分是否发生静默回退）
  vi.mocked(invokeNative).mockImplementation(async (command: string): Promise<unknown> => {
    if (command === 'identity_oidc_access_token') return oidcOkPayload()
    if (command === 'identity_device_token') return deviceOkPayload()
    if (command === 'identity_oidc_logout') return { ok: true, kind: 'oidc_logout_ok', message: '已退出登录' }
    return null
  })
  // 缺省不设过渡开关（默认 oidc 路径）
  vi.stubEnv('VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED', '')
})

afterEach(() => {
  setIdentityAccessTokenProvider(null)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('resolveIdentityTokenMode：三种模式选择（冻结规则）', () => {
  it('默认：Tauri + 未设开关 → oidc', () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    expect(resolveIdentityTokenMode()).toBe('oidc')
  })

  it('过渡开关：Tauri + VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED=1 → device', () => {
    vi.stubEnv('VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED', '1')
    expect(resolveIdentityTokenMode()).toBe('device')
  })

  it('开关仅显式 1 生效：0 / true / 空 / 未设置 → 仍是默认 oidc', () => {
    for (const value of ['0', 'true', '', 'yes']) {
      vi.stubEnv('VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED', value)
      expect(resolveIdentityTokenMode()).toBe('oidc')
    }
  })

  it('非 Tauri → disabled（即使开关已开：无 keyring/设备私钥，两个 provider 都不可用）', () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false)
    vi.stubEnv('VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED', '1')
    expect(resolveIdentityTokenMode()).toBe('disabled')
  })
})

describe('installIdentityTokenProvider：安装行为', () => {
  it('默认 oidc：换票走 identity_oidc_access_token，且绝不回退设备换票', async () => {
    expect(hasIdentityAccessTokenProvider()).toBe(false)
    installIdentityTokenProvider()
    expect(hasIdentityAccessTokenProvider()).toBe(true)
    expect(await getIdentityAccessToken()).toBe(OIDC_AT)
    // 只走了 OIDC 链路；设备换票命令从未被调用（默认不回退）
    expect(countInvoke('identity_oidc_access_token')).toBe(1)
    expect(countInvoke('identity_device_token')).toBe(0)
  })

  it('默认 oidc 且无会话/刷新失败：返回 null，仍不回退设备换票（issue 核心约束）', async () => {
    vi.mocked(invokeNative).mockImplementation(async (command: string): Promise<unknown> => {
      if (command === 'identity_oidc_access_token') {
        return { ok: false, kind: 'oidc_session_absent', message: '未登录' }
      }
      if (command === 'identity_device_token') return deviceOkPayload()
      return null
    })
    installIdentityTokenProvider()
    // 无 OIDC 会话 → null（调用方走 legacy 双轨），而不是静默切到设备换票
    expect(await getIdentityAccessToken()).toBeNull()
    expect(countInvoke('identity_device_token')).toBe(0)
    // 401 强制刷新（force:true）同样不回退
    expect(await getIdentityAccessToken(true)).toBeNull()
    expect(countInvoke('identity_device_token')).toBe(0)
  })

  it('过渡开关：设备换票优先（走 identity_device_token 既有链路，OIDC 命令不被调用）', async () => {
    vi.stubEnv('VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED', '1')
    installIdentityTokenProvider()
    expect(await getIdentityAccessToken()).toBe(DEVICE_AT)
    expect(countInvoke('identity_device_token')).toBe(1)
    expect(countInvoke('identity_oidc_access_token')).toBe(0)
  })

  it('非 Tauri：不安装任何 provider（调用方统一走 legacy 双轨）', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false)
    installIdentityTokenProvider()
    expect(hasIdentityAccessTokenProvider()).toBe(false)
    expect(await getIdentityAccessToken()).toBeNull()
    expect(vi.mocked(invokeNative)).not.toHaveBeenCalled()
  })

  it('oidc 模式复用既有事件挂点做三清：登出/切号事件 → identity_oidc_logout 被调用', async () => {
    installIdentityTokenProvider()
    // 先拿到一次 AT（证明 provider 生效）
    expect(await getIdentityAccessToken()).toBe(OIDC_AT)

    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)
    expect(countInvoke('identity_oidc_logout')).toBe(1)

    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)
    expect(countInvoke('identity_oidc_logout')).toBe(2)
  })

  it('重复安装幂等：每个事件只挂一份监听（不叠加）', async () => {
    installIdentityTokenProvider()
    installIdentityTokenProvider()
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)?.size).toBe(1)
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)?.size).toBe(1)
  })
})
