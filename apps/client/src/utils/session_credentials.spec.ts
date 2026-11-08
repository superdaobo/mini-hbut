// #1171 T13：session_credentials 双轨凭据隔离与登出/切号统一清理 单元测试。
//
// 覆盖：
//   - 登出事件 → Identity 域（内存 AT）与 Legacy 域（bridge 会话令牌）都清空；
//   - 登录/切号恢复事件 → 同样两个域都清空；
//   - 隔离：bridge 令牌不会出现在 getIdentityAccessToken() 的结果里（反之亦然）；
//     Identity AT 不会出现在 withBridgeAuthHeaders 的 Authorization 里；
//   - 重复安装幂等（每个事件只挂一份监听）；卸载后监听解除。
//
// 说明：bridge 令牌的缓存/重取通过 mock `platform/native` 的 invoke 计数观察
// （每次 `bridge_session_token` 调用返回递增版本号 → 版本号变化证明缓存被清过）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true)
}))

import { getBridgeSessionToken, resetBridgeSessionToken, withBridgeAuthHeaders } from './bridge_auth'
import { invokeNative } from '../platform/native'
import {
  clearIdentityAccessToken,
  peekIdentityAccessToken,
  getIdentityAccessToken
} from './identity_access_token'
import {
  IDENTITY_DEVICE_TOKEN_LOGIN_EVENT,
  IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT,
  installIdentityDeviceTokenProvider,
  type DeviceTokenNativePayload
} from './identity_device_token'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'
import { PRODUCTION_CANONICAL_ISSUER } from '../features/identity/identityIssuers'

const DEVICE_ID = '0198a1b2c3d4e5f6a7b8c9d0'
const STUDENT_ID = '2023010101'
const IDENTITY_AT =
  'eyJhbGciOiJSUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ iss: PRODUCTION_CANONICAL_ISSUER, hbut_student_id: STUDENT_ID }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '') +
  '.' +
  's'.repeat(32)

const makeDevicePayload = (): DeviceTokenNativePayload => ({
  access_token: IDENTITY_AT,
  token_type: 'Bearer',
  expires_in: 900,
  expires_at: '2026-09-27T10:15:00.000Z'
})

interface ListenerRegistry {
  addEventListener: (type: string, handler: () => void) => void
  removeEventListener: (type: string, handler: () => void) => void
}

let listeners: Map<string, Set<() => void>>
let storage: Map<string, string>

const dispatchWindowEvent = (type: string): void => {
  for (const handler of listeners.get(type) ?? []) handler()
}

beforeEach(() => {
  listeners = new Map()
  storage = new Map([
    [IDENTITY_DEVICE_ID_KEY, DEVICE_ID],
    ['hbu_username', STUDENT_ID]
  ])
  const registry: ListenerRegistry = {
    addEventListener: (type, handler) => {
      const set = listeners.get(type) ?? new Set()
      set.add(handler)
      listeners.set(type, set)
    },
    removeEventListener: (type, handler) => {
      listeners.get(type)?.delete(handler)
    }
  }
  vi.stubGlobal('window', registry)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key)
  })
})

afterEach(() => {
  // 两个模块的内存态跨测试残留：bridge 令牌缓存 + Identity 内存令牌/在途任务，必须重置
  resetBridgeSessionToken()
  clearIdentityAccessToken()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

/** 安装 device token provider（Identity 域换票走 mock invoke；bridge 令牌计数递增） */
const installWithCountedBridge = (): void => {
  const state = { bridgeCalls: 0 }
  vi.mocked(invokeNative).mockImplementation(async (command: string) => {
    if (command === 'identity_device_token') {
      return makeDevicePayload()
    }
    if (command === 'bridge_session_token') {
      state.bridgeCalls += 1
      return `bridge-token-v${state.bridgeCalls}`
    }
    return null
  })
  installIdentityDeviceTokenProvider({})
}

const countIdentityMints = () =>
  vi.mocked(invokeNative).mock.calls.filter((args) => args[0] === 'identity_device_token').length

const countBridgeFetches = () =>
  vi.mocked(invokeNative).mock.calls.filter((args) => args[0] === 'bridge_session_token').length

describe('#1171 T13 双轨凭据隔离', () => {
  it('登出事件 → Identity 域与 Legacy 域都清空（AT 内存 + bridge 令牌缓存）', async () => {
    installWithCountedBridge()
    // Identity 域：换票并命中内存缓存
    expect(await getIdentityAccessToken()).toBe(IDENTITY_AT)
    expect(countIdentityMints()).toBe(1)
    // Legacy 域：bridge 令牌取一次并命中缓存
    expect(await getBridgeSessionToken()).toBe('bridge-token-v1')
    expect(await getBridgeSessionToken()).toBe('bridge-token-v1')
    expect(countBridgeFetches()).toBe(1)

    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)

    // Identity 域清空：内存 AT 不再可读
    expect(peekIdentityAccessToken()).toBe('')
    // Legacy 域清空：bridge 令牌缓存被重置 → 重新取到 v2
    expect(await getBridgeSessionToken()).toBe('bridge-token-v2')
    expect(countBridgeFetches()).toBe(2)
    // Identity 域按需重换（新会话重新走 provider）
    expect(await getIdentityAccessToken()).toBe(IDENTITY_AT)
    expect(countIdentityMints()).toBe(2)
  })

  it('登录/切号恢复事件 → 两个域同样都清空', async () => {
    installWithCountedBridge()
    expect(await getIdentityAccessToken()).toBe(IDENTITY_AT)
    expect(await getBridgeSessionToken()).toBe('bridge-token-v1')

    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)

    expect(peekIdentityAccessToken()).toBe('')
    expect(await getBridgeSessionToken()).toBe('bridge-token-v2')
    expect(countBridgeFetches()).toBe(2)
  })

  it('隔离：bridge 令牌冒充不了 Identity AT，Identity AT 也进不了 bridge 请求头', async () => {
    installWithCountedBridge()
    const identityAt = await getIdentityAccessToken()
    const bridgeToken = await getBridgeSessionToken()

    // 两域令牌各自独立
    expect(identityAt).toBe(IDENTITY_AT)
    expect(bridgeToken).toBe('bridge-token-v1')
    expect(identityAt).not.toBe(bridgeToken)
    // bridge 请求头只携带 bridge 令牌，绝不携带 Identity AT
    const headers = await withBridgeAuthHeaders({})
    expect(headers['Authorization']).toBe(`Bearer ${bridgeToken}`)
    expect(headers['Authorization']).not.toBe(`Bearer ${identityAt}`)
    // Identity 域读取永远拿不到 bridge 令牌
    expect(identityAt).not.toContain('bridge-token')
  })

  it('重复安装幂等：每个事件只挂一份监听；卸载后监听解除', async () => {
    installWithCountedBridge()
    const second = installIdentityDeviceTokenProvider({})
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)?.size).toBe(1)
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)?.size).toBe(1)
    second.uninstall()
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)?.size ?? 0).toBe(0)
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)?.size ?? 0).toBe(0)
  })
})
