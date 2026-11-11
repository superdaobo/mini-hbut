// #1210 P2-6：handoff / 登出 / 切号 事件链路回归锁（规格 §2.2，验收②③）。
//
// 本文件只**加**回归测试，不改任何实现（规格 §2.2 硬约束）。锁死三条链路：
//
//   1. **handoff 回归**：`minihbut://identity?request_id=..&handoff=..`
//      → `parseMiniHbutDeepLink`（严格形状校验）→ `IdentityCoordinator.submitIntent`
//      收到 `{requestId, handoff, arrivedAt}` 且 delivery 透传（cold-start / warm 都覆盖）；
//      非法 handoff（过短 / 非法字符 / 超长 / 缺失）→ 解析返回既有错误码
//      `invalid-identity`（通用文案，不回显参数值），且**不提交**；
//      冷启动投递走内存缓冲 + flush 入队（#621 合同，#739 死信标记仅内存）。
//
//   2. **登出回归**：`hbu-session-logout` → 三清
//      （① Identity AT 内存清空 ② legacy bridge 令牌缓存重置 ③ `identity_oidc_logout` 被调用）
//      —— 复用既有事件挂点（identity_device_token 安装器 / P2-5 三清收口），不新增事件。
//
//   3. **切号回归**：`hbu-identity-login-resumed` → 同样三清；
//      随后 `getIdentityAccessToken()` 重新取票（provider 的 invoke 被再次调用）。
//
// 范式说明：mock 写法与 `utils/session_credentials.spec.ts`（P2-5 三清回归）与
// `app/coordinators/IdentityCoordinator.spec.ts`（#621 调度合同）一致：
//   - `vi.mock` platform/native（invoke 计数 / isTauri 恒 true）、toast、identityService
//     （fetchRequestDetail 挂起，避免 #623 加载流程干扰调度断言）；
//   - `vi.stubGlobal('window')` 提供 addEventListener 注册表，事件派发走同一注册表；
//   - 假 JWT 可解码但内容全假（零泄露：token 只进断言，不进日志/文案）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true)
}))

vi.mock('../../utils/toast', () => ({
  showToast: vi.fn()
}))

// #623 流程依赖挂起（never resolve）：让本文件聚焦调度/事件断言，
// 加载流程停在 loading 相位（与 IdentityCoordinator.spec.ts 同款 mock）
vi.mock('./identityService', () => ({
  fetchRequestDetail: vi.fn(() => new Promise(() => {})),
  fetchEnrollmentChallenge: vi.fn(() => new Promise(() => {})),
  submitApprove: vi.fn(() => new Promise(() => {})),
  submitTerminalAction: vi.fn(() => new Promise(() => {})),
  getIdentityBffBaseUrl: vi.fn(() => 'https://auth.example.test'),
  getIdentityCoreBaseUrl: vi.fn(() => 'https://core.example.test'),
  isTestAccountBlocked: vi.fn(() => false),
  createServiceError: vi.fn(() => new Error('mocked'))
}))

import { createIdentityCoordinator } from '../../app/coordinators/IdentityCoordinator'
import {
  getIdentityIntentSnapshot,
  resetIdentityIntentStore
} from './identityIntentStore'
import { resetIdentityUiState } from './identityStore'
import { parseMiniHbutDeepLink } from '../../platform/deep_link'
import { showToast } from '../../utils/toast'
import { invokeNative } from '../../platform/native'
import {
  IDENTITY_DEVICE_TOKEN_LOGIN_EVENT,
  IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT,
  installIdentityDeviceTokenProvider,
  type DeviceTokenNativePayload
} from '../../utils/identity_device_token'
import {
  clearIdentityAccessToken,
  getIdentityAccessToken,
  peekIdentityAccessToken
} from '../../utils/identity_access_token'
import { getBridgeSessionToken, resetBridgeSessionToken } from '../../utils/bridge_auth'
import { IDENTITY_DEVICE_ID_KEY } from './identityStore'
import { PRODUCTION_CANONICAL_ISSUER } from './identityIssuers'
import type { DeepLinkDelivery } from '../../platform/deep_link'

// ── 假数据（全部可解码但内容假；零泄露：不打印、不回显到错误文案） ──────────────
const DEVICE_ID = '0198a1b2c3d4e5f6a7b8c9d0'
const STUDENT_ID = '2023010101'
const REQUEST_ID = 'ar_0198a1b2c3d4e5f6' // ar_ + base64url(16)：满足 IDENTITY_REQUEST_ID_PATTERN
const HANDOFF = 'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9' // 32 字符：满足 IDENTITY_HANDOFF_PATTERN
const VALID_DEEP_LINK = `minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}`

/** 三段式假 JWT（payload 可指定 claims；签名段占位，本模块不验签） */
const makeJwt = (claims: Record<string, unknown>): string => {
  const b64url = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64url({ alg: 'RS256', typ: 'at+jwt', kid: 'test' })}.${b64url(claims)}.${'s'.repeat(64)}`
}

const makeDevicePayload = (): DeviceTokenNativePayload => ({
  access_token: makeJwt({
    iss: PRODUCTION_CANONICAL_ISSUER,
    aud: 'mini-hbut-hf-api',
    hbut_student_id: STUDENT_ID
  }),
  token_type: 'Bearer',
  expires_in: 900,
  expires_at: '2026-09-27T10:15:00.000Z'
})

// ── 窗口/存储 stub（与 session_credentials.spec.ts 同款范式） ──────────────────
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
  resetIdentityIntentStore()
  resetIdentityUiState()
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  resetBridgeSessionToken()
  clearIdentityAccessToken()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ── 1. handoff 深链 → submitIntent ───────────────────────────────────────────
describe('#1210 handoff 回归：深链解析 → IdentityCoordinator.submitIntent', () => {
  /**
   * 模拟 NotificationCoordinator.dispatchMiniHbutDeepLink 的 identity 分支
   *（生产接线见该文件：parse → 仅 identity 分支 → submitIntent 三字段 + delivery 透传）。
   * 无效解析结果静默跳过（生产同款：不回显、不提交）。
   */
  const dispatchIdentityLink = (
    rawUrl: string,
    delivery: DeepLinkDelivery,
    submitIntent: (intent: { requestId: string; handoff: string; arrivedAt: number }, d?: DeepLinkDelivery) => void
  ): void => {
    const result = parseMiniHbutDeepLink(rawUrl)
    if (!result.ok || result.link.kind !== 'identity') return
    submitIntent(
      { requestId: result.link.requestId, handoff: result.link.handoff, arrivedAt: Date.now() },
      delivery
    )
  }

  it('合法链接：解析通过，requestId/handoff 原样透传给 submitIntent（cold-start 与 warm 两种 delivery）', () => {
    const submitIntent = vi.fn()
    dispatchIdentityLink(VALID_DEEP_LINK, 'cold-start', submitIntent)
    expect(submitIntent).toHaveBeenCalledTimes(1)
    expect(submitIntent).toHaveBeenCalledWith(
      { requestId: REQUEST_ID, handoff: HANDOFF, arrivedAt: expect.any(Number) },
      'cold-start'
    )
    submitIntent.mockClear()
    dispatchIdentityLink(VALID_DEEP_LINK, 'warm', submitIntent)
    expect(submitIntent).toHaveBeenCalledTimes(1)
    expect(submitIntent).toHaveBeenCalledWith(
      { requestId: REQUEST_ID, handoff: HANDOFF, arrivedAt: expect.any(Number) },
      'warm'
    )
  })

  it('cold-start 投递：bootstrap 前入内存缓冲（不丢、不弹提示），flush 后入队成为 active', () => {
    const coordinator = createIdentityCoordinator(
      ({ state: { mutable: { appBootstrapped: false } } }) as unknown as Parameters<
        typeof createIdentityCoordinator
      >[0]
    )
    dispatchIdentityLink(VALID_DEEP_LINK, 'cold-start', coordinator.submitIntent)
    // 冷启动缓冲：未 bootstrap 时不进 store
    expect(getIdentityIntentSnapshot().active).toBeNull()
    expect(showToast).not.toHaveBeenCalled()
    // bootstrap 完成后的冲刷（#621 合同）：入队并成为 active
    coordinator.flushPendingIntents()
    const active = getIdentityIntentSnapshot().active
    expect(active?.requestId).toBe(REQUEST_ID)
    expect(active?.handoff).toBe(HANDOFF)
    // arrivedAt 由 submitIntent 归一化为数字（透传 / Date.now() 兜底）
    expect(typeof (active?.arrivedAt as number)).toBe('number')
  })

  it('warm 投递：已 bootstrap 时直接进入队列成为 active（#623 自动进入加载）', () => {
    const coordinator = createIdentityCoordinator(
      ({ state: { mutable: { appBootstrapped: true } } }) as unknown as Parameters<
        typeof createIdentityCoordinator
      >[0]
    )
    dispatchIdentityLink(VALID_DEEP_LINK, 'warm', coordinator.submitIntent)
    const active = getIdentityIntentSnapshot().active
    expect(active?.requestId).toBe(REQUEST_ID)
    expect(active?.handoff).toBe(HANDOFF)
    expect(typeof (active?.arrivedAt as number)).toBe('number')
    // #623：提交后自动推进 received -> loading（fetchRequestDetail 挂起在 mock 上）
    expect(active?.phase).toBe('loading')
    // 队列无积压（单条链接）
    expect(getIdentityIntentSnapshot().queue).toEqual([])
  })

  it('非法 handoff（过短）：解析拒绝（既有错误码 invalid-identity），不提交，错误文案不回显参数值', () => {
    const shortHandoff = 'Ab3_xYz9' // 8 字符 < 32
    const submitIntent = vi.fn()
    dispatchIdentityLink(
      `minihbut://identity?request_id=${REQUEST_ID}&handoff=${shortHandoff}`,
      'warm',
      submitIntent
    )
    expect(submitIntent).not.toHaveBeenCalled()
    const result = parseMiniHbutDeepLink(
      `minihbut://identity?request_id=${REQUEST_ID}&handoff=${shortHandoff}`
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-identity') // 既有通用错误码（不区分缺哪个参数）
      expect(result.error.message).not.toContain(shortHandoff)
      expect(result.error.message).not.toContain(REQUEST_ID)
    }
  })

  it('非法 handoff（非法字符 / 超长 / 缺失）：同样拒绝且不提交', () => {
    const cases = [
      // 非法字符（空格与 !@# 不在 [A-Za-z0-9._~-] 内）
      `minihbut://identity?request_id=${REQUEST_ID}&handoff=Ab3_xYz9!@%20Ab3_xYz9Ab3_xYz9Ab3_xYz9`,
      // 超长（129 > 128）
      `minihbut://identity?request_id=${REQUEST_ID}&handoff=${'A'.repeat(129)}`,
      // 缺失 handoff 参数
      `minihbut://identity?request_id=${REQUEST_ID}`
    ]
    for (const rawUrl of cases) {
      const submitIntent = vi.fn()
      dispatchIdentityLink(rawUrl, 'cold-start', submitIntent)
      expect(submitIntent).not.toHaveBeenCalled()
      const result = parseMiniHbutDeepLink(rawUrl)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('invalid-identity')
        expect(result.error.message).not.toContain(REQUEST_ID)
      }
    }
  })
})

// ── 2/3. 登出 / 切号 → 三清（既有事件挂点，P2-5 收口） ─────────────────────────
describe('#1210 登出/切号回归：hbu-session-logout / hbu-identity-login-resumed → 三清', () => {
  /** 安装 provider：Identity 域换票 + bridge 域版本号递增（观察缓存重置）+ OIDC 域 logout */
  const installWithCountedBridge = (): void => {
    const state = { bridgeCalls: 0 }
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'identity_device_token') return makeDevicePayload()
      if (command === 'bridge_session_token') {
        state.bridgeCalls += 1
        return `bridge-token-v${state.bridgeCalls}`
      }
      if (command === 'identity_oidc_logout') return { ok: true, kind: 'oidc_logout_ok', message: '已退出登录' }
      return null
    })
    installIdentityDeviceTokenProvider({})
  }

  const countIdentityMints = () =>
    vi.mocked(invokeNative).mock.calls.filter((args) => args[0] === 'identity_device_token').length
  const countBridgeFetches = () =>
    vi.mocked(invokeNative).mock.calls.filter((args) => args[0] === 'bridge_session_token').length
  const countOidcLogouts = () =>
    vi.mocked(invokeNative).mock.calls.filter((args) => args[0] === 'identity_oidc_logout').length

  it('登出（hbu-session-logout）→ 三清：① Identity AT 清空 ② bridge 令牌缓存重置 ③ identity_oidc_logout 被调用', async () => {
    installWithCountedBridge()
    // 先让两个内存域各持有一个令牌
    expect(await getIdentityAccessToken()).toBe(makeDevicePayload().access_token)
    expect(countIdentityMints()).toBe(1)
    expect(await getBridgeSessionToken()).toBe('bridge-token-v1')
    expect(countBridgeFetches()).toBe(1)
    expect(countOidcLogouts()).toBe(0)

    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)

    // ① Identity 域（同步）：内存 AT 清空
    expect(peekIdentityAccessToken()).toBe('')
    // ② Legacy 域（同步）：bridge 缓存重置 → 重新取到 v2
    expect(await getBridgeSessionToken()).toBe('bridge-token-v2')
    expect(countBridgeFetches()).toBe(2)
    // ③ OIDC 域（异步 best-effort）：identity_oidc_logout 被调用一次
    expect(countOidcLogouts()).toBe(1)
  })

  it('切号（hbu-identity-login-resumed）→ 同样三清；随后 getIdentityAccessToken 重新取票', async () => {
    installWithCountedBridge()
    expect(await getIdentityAccessToken()).toBe(makeDevicePayload().access_token)
    expect(await getBridgeSessionToken()).toBe('bridge-token-v1')
    expect(countIdentityMints()).toBe(1)

    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)

    // 三清断言（与登出事件同一收口）
    expect(peekIdentityAccessToken()).toBe('')
    expect(await getBridgeSessionToken()).toBe('bridge-token-v2')
    expect(countOidcLogouts()).toBe(1)

    // 旧 AT 已清 → 重新取票走 provider（provider 的 invoke 被再次调用）
    expect(countIdentityMints()).toBe(1)
    const reminted = await getIdentityAccessToken()
    expect(reminted).toBe(makeDevicePayload().access_token)
    expect(countIdentityMints()).toBe(2)
  })

  it('登出/切号事件幂等：重复派发不抛错、监听不叠加（安装器只挂一份）', async () => {
    installWithCountedBridge()
    expect(await getIdentityAccessToken()).toBeTruthy()
    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)
    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)
    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)
    expect(peekIdentityAccessToken()).toBe('')
    // 监听只有一份（重复安装/派发不叠加）
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)?.size).toBe(1)
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)?.size).toBe(1)
    // OIDC 域为 fire-and-forget：每个登出/切号事件各触发一次 logout（共 3 次）
    expect(countOidcLogouts()).toBe(3)
  })
})
