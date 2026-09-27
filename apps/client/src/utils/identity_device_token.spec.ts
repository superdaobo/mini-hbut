// #902：设备换票 provider 单元测试。
//
// 覆盖（任务书阶段 2 第 8 条）：
//   - provider 注册 / 卸载（install → hasIdentityAccessTokenProvider 为 true）；
//   - 成功换票：invoke 参数正确、返回 AT、被 identity_access_token 内存缓存（第二次不重复换票）；
//   - V1 无 refresh token：401 后 forceRefresh = 再换一次（并发共享一次）；
//   - logout / 登录事件 → 内存令牌清空（清空后再取会重新换票；无会话时返回 null）；
//   - 失败一律 null（非 Tauri / 未注册 / 无本地会话 / invoke 抛错 / 形状非法 / 主体不一致）；
//   - 主体一致性护栏：AT 的 hbut_student_id 必须等于本地会话学号；
//   - **不写任何 storage**（只读 localStorage；写操作计数必须为 0）；
//   - 不把 AT 写进日志（report 文案不含 token）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearIdentityAccessToken,
  getIdentityAccessToken,
  hasIdentityAccessTokenProvider,
  setIdentityAccessTokenProvider
} from './identity_access_token'
import {
  IDENTITY_DEVICE_TOKEN_LOGIN_EVENT,
  IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT,
  createIdentityDeviceTokenProvider,
  decodeAccessTokenStudentId,
  installIdentityDeviceTokenProvider,
  type DeviceTokenNativePayload
} from './identity_device_token'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'

const DEVICE_ID = '0198a1b2c3d4e5f6a7b8c9d0'
const STUDENT_ID = '2023010101'
const OTHER_STUDENT_ID = '2023010199'

/** 构造三段式假 JWT（payload 可指定 claims）；签名段只是占位（本模块不验签） */
const makeJwt = (claims: Record<string, unknown>): string => {
  const b64url = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64url({ alg: 'RS256', typ: 'at+jwt', kid: 'test' })}.${b64url(claims)}.${'s'.repeat(64)}`
}

const okPayload = (claims: Record<string, unknown> = {}): DeviceTokenNativePayload => ({
  access_token: makeJwt({
    aud: 'mini-hbut-hf-api',
    scope: 'game.read game.play',
    hbut_student_id: STUDENT_ID,
    hbut_student_name: '测试学生',
    ...claims
  }),
  token_type: 'Bearer',
  expires_in: 900,
  expires_at: '2026-09-27T10:15:00.000Z'
})

/** 记录调用参数的 invoke 假实现（返回固定 payload / 抛错 / 自定义） */
const makeInvoke = (
  impl: () => Promise<DeviceTokenNativePayload> = async () => okPayload()
) =>
  vi.fn(async (_command: string, _args?: Record<string, unknown>): Promise<unknown> => impl())

interface StorageMock {
  values: Map<string, string>
  writes: string[]
}

let storage: StorageMock
let listeners: Map<string, Set<() => void>>
/** 事件派发（模拟 AuthCoordinator 的 window.dispatchEvent(CustomEvent)） */
const dispatchWindowEvent = (type: string): void => {
  for (const handler of listeners.get(type) ?? []) handler()
}

beforeEach(() => {
  storage = { values: new Map(), writes: [] }
  listeners = new Map()
  const windowMock = {
    addEventListener: (type: string, handler: () => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(handler)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler)
    }
  }
  vi.stubGlobal('window', windowMock)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      // 记录所有写操作：#902 硬约束是「AT 绝不落任何 storage」，本测试以此断言
      storage.writes.push(`${key}=${value}`)
      storage.values.set(key, value)
    },
    removeItem: (key: string) => {
      storage.writes.push(`remove:${key}`)
      storage.values.delete(key)
    }
  })
  storage.values.set(IDENTITY_DEVICE_ID_KEY, DEVICE_ID)
  storage.values.set('hbu_username', STUDENT_ID)
})

afterEach(() => {
  setIdentityAccessTokenProvider(null)
  clearIdentityAccessToken()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('#902 设备换票 provider', () => {
  it('注册 provider：hasIdentityAccessTokenProvider 为 true，惰性换票并命中内存缓存', async () => {
    const invoke = makeInvoke()
    expect(hasIdentityAccessTokenProvider()).toBe(false)
    const installed = installIdentityDeviceTokenProvider({
      invoke,
      isTauri: () => true,
      readCoreBaseUrl: () => 'https://id.example.test'
    })
    expect(hasIdentityAccessTokenProvider()).toBe(true)

    const token = await getIdentityAccessToken()
    expect(token).toBe(okPayload().access_token)
    // 惰性：第一次调用才换票；参数只含 baseUrl/deviceId（其余由 Rust 侧固定）
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('identity_device_token', {
      baseUrl: 'https://id.example.test',
      deviceId: DEVICE_ID
    })
    // 内存缓存：后续调用不再换票（即使 provider 被反复询问）
    expect(await getIdentityAccessToken()).toBe(token)
    expect(invoke).toHaveBeenCalledTimes(1)

    installed.uninstall()
    expect(hasIdentityAccessTokenProvider()).toBe(false)
  })

  it('V1 无 refresh token：401 后 forceRefresh 重新换票，并发共享一次', async () => {
    const invoke = makeInvoke()
    installIdentityDeviceTokenProvider({ invoke, isTauri: () => true })
    expect(await getIdentityAccessToken()).toBe(okPayload().access_token)
    const [a, b] = await Promise.all([getIdentityAccessToken(true), getIdentityAccessToken(true)])
    expect(a).toBe(okPayload().access_token)
    expect(b).toBe(a)
    // 首次 1 次 + 并发刷新 1 次（identity_access_token 的单次 refresh 语义）
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('logout 事件清空内存令牌；登录事件同样清空（换账号不得复用旧 AT）', async () => {
    const invoke = makeInvoke()
    installIdentityDeviceTokenProvider({ invoke, isTauri: () => true })
    expect(await getIdentityAccessToken()).toBe(okPayload().access_token)

    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)
    // 登出后重新取：无本地会话学号 → 不再换票，返回 null（legacy 回退）
    storage.values.delete('hbu_username')
    expect(await getIdentityAccessToken()).toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1)

    // 重新登录（补回会话）→ 事件清空后按需重换
    storage.values.set('hbu_username', STUDENT_ID)
    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)
    expect(await getIdentityAccessToken()).toBe(okPayload().access_token)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('卸载后不再监听事件、provider 置空（内存令牌一并清空）', async () => {
    const invoke = makeInvoke()
    const installed = installIdentityDeviceTokenProvider({ invoke, isTauri: () => true })
    await getIdentityAccessToken()
    installed.uninstall()
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)?.size ?? 0).toBe(0)
    expect(await getIdentityAccessToken()).toBeNull()
  })

  it('重复安装幂等：不叠加事件监听，旧实例卸载不会打掉新安装的 provider', async () => {
    const first = installIdentityDeviceTokenProvider({ invoke: makeInvoke(), isTauri: () => true })
    const second = installIdentityDeviceTokenProvider({ invoke: makeInvoke(), isTauri: () => true })
    // 监听只保留一份（每次安装都会先解绑上一次）
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)?.size ?? 0).toBe(1)
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)?.size ?? 0).toBe(1)
    // 旧实例卸载：provider 仍由新安装持有（不清空）
    first.uninstall()
    expect(hasIdentityAccessTokenProvider()).toBe(true)
    second.uninstall()
    expect(hasIdentityAccessTokenProvider()).toBe(false)
    expect(listeners.get(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)?.size ?? 0).toBe(0)
  })

  it('失败一律 null：非 Tauri / 未注册设备 / 无本地会话', async () => {
    const invoke = makeInvoke()
    // 非 Tauri（Web/Capacitor 无设备私钥）
    expect(
      await createIdentityDeviceTokenProvider({ invoke, isTauri: () => false }).getAccessToken()
    ).toBeNull()
    // 未注册设备
    storage.values.delete(IDENTITY_DEVICE_ID_KEY)
    expect(
      await createIdentityDeviceTokenProvider({ invoke, isTauri: () => true }).getAccessToken()
    ).toBeNull()
    // 无本地会话（未登录/已登出）
    storage.values.set(IDENTITY_DEVICE_ID_KEY, DEVICE_ID)
    storage.values.delete('hbu_username')
    expect(
      await createIdentityDeviceTokenProvider({ invoke, isTauri: () => true }).getAccessToken()
    ).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('invoke 抛错 / 返回空 token / 非 JWT 形状 → null，且提示文案不含 token', async () => {
    const reports: string[] = []
    const cases: Array<() => Promise<DeviceTokenNativePayload>> = [
      async () => {
        throw new Error('身份服务返回错误（HTTP 403）：设备换取身份令牌的能力未开启')
      },
      async () => ({ ...okPayload(), access_token: '' }),
      async () => ({ ...okPayload(), access_token: 'opaque-token-without-dots' })
    ]
    for (const impl of cases) {
      const provider = createIdentityDeviceTokenProvider({
        invoke: makeInvoke(impl),
        isTauri: () => true,
        report: (message) => reports.push(message)
      })
      expect(await provider.getAccessToken()).toBeNull()
    }
    expect(reports.length).toBeGreaterThan(0)
    for (const message of reports) {
      expect(message).not.toContain('eyJ') // 不含 JWT 头部 base64
      expect(message.length).toBeLessThanOrEqual(200)
    }
  })

  it('主体一致性护栏：AT 主体学号 ≠ 本地会话学号 → 丢弃（防跨账号数据错配）', async () => {
    const reports: string[] = []
    // 设备绑定的是其他学号（例如本地已切换账号）
    const mismatch = createIdentityDeviceTokenProvider({
      invoke: makeInvoke(async () => okPayload({ hbut_student_id: OTHER_STUDENT_ID })),
      isTauri: () => true,
      report: (message) => reports.push(message)
    })
    expect(await mismatch.getAccessToken()).toBeNull()
    expect(reports.join('|')).toContain('不一致')

    // 缺少受控 claim 同样丢弃（资源服务器也要求该 claim 才能确认主体）
    const missingClaim = createIdentityDeviceTokenProvider({
      invoke: makeInvoke(async () => okPayload({ hbut_student_id: undefined })),
      isTauri: () => true,
      report: () => undefined
    })
    expect(await missingClaim.getAccessToken()).toBeNull()

    // 一致 → 返回
    const matched = createIdentityDeviceTokenProvider({
      invoke: makeInvoke(),
      isTauri: () => true,
      report: () => undefined
    })
    expect(await matched.getAccessToken()).toBe(okPayload().access_token)
  })

  it('绝不写任何 storage（AT 仅内存；只允许读取 device_id / 会话学号）', async () => {
    const invoke = makeInvoke()
    installIdentityDeviceTokenProvider({ invoke, isTauri: () => true })
    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT)
    const token = await getIdentityAccessToken()
    expect(token).toBeTruthy()
    // 成功/失败/事件三条路径都不得写 storage
    dispatchWindowEvent(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT)
    expect(storage.writes).toEqual([])
  })

  it('decodeAccessTokenStudentId：非法输入返回空串（绝不抛错）', () => {
    expect(decodeAccessTokenStudentId(makeJwt({ hbut_student_id: STUDENT_ID }))).toBe(STUDENT_ID)
    for (const bad of ['', 'not-a-jwt', 'a.b', 'a.b.c.d', 'x.y.z']) {
      expect(decodeAccessTokenStudentId(bad)).toBe('')
    }
  })

  it('AT 到期后由调用方重新换票（V1 无 refresh token，服务端 expires_in=900）', async () => {
    const invoke = makeInvoke()
    const provider = createIdentityDeviceTokenProvider({ invoke, isTauri: () => true })
    const first = await provider.getAccessToken()
    // 强制刷新 → 再换一次（等价于到期后重新换取；不存在 refresh_token 请求）
    const second = await provider.refreshAccessToken()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(2)
    const args = invoke.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(args).sort()).toEqual(['baseUrl', 'deviceId'])
  })
})
