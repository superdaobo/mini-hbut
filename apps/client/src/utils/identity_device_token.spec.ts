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
  DEFAULT_STUDENT_ID_CLAIM,
  DEFAULT_STUDENT_ID_CLAIM_FALLBACKS,
  IDENTITY_DEVICE_TOKEN_LOGIN_EVENT,
  IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT,
  createIdentityDeviceTokenProvider,
  decodeAccessTokenStudentId,
  decodeStudentIdFromPayload,
  installIdentityDeviceTokenProvider,
  resolveStudentIdClaimPolicy,
  type DeviceTokenNativePayload
} from './identity_device_token'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'

const DEVICE_ID = '0198a1b2c3d4e5f6a7b8c9d0'
const STUDENT_ID = '2023010101'
const OTHER_STUDENT_ID = '2023010199'
// #1171 T13：默认 fixture 携带 canonical issuer（与 identityIssuers.PRODUCTION_CANONICAL_ISSUER 同源）
const CANONICAL_ISSUER = 'https://id.xn--vhq74jc2fzpchter27a.com'
const EVIL_ISSUER = 'https://evil.example.com'

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
    iss: CANONICAL_ISSUER,
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

  it('#1171 T13：未知 issuer 显式拒绝：换票返回 null，可读错误含实际 issuer 且不含完整令牌', async () => {
    const reports: string[] = []
    const provider = createIdentityDeviceTokenProvider({
      invoke: makeInvoke(async () => okPayload({ iss: EVIL_ISSUER })),
      isTauri: () => true,
      report: (message) => reports.push(message)
    })
    expect(await provider.getAccessToken()).toBeNull()
    expect(reports.length).toBe(1)
    expect(reports[0]).toContain(EVIL_ISSUER)
    expect(reports[0]).toContain('拒绝')
    const token = okPayload({ iss: EVIL_ISSUER }).access_token
    expect(reports[0]).not.toContain(token)
  })

  it('#1171 T13：缺少 iss claim 同样拒绝（不得降级为不校验）', async () => {
    const reports: string[] = []
    // 构造缺 iss 的令牌（payload 里没有 iss claim）
    const noIss = makeJwt({
      aud: 'mini-hbut-hf-api',
      hbut_student_id: STUDENT_ID
    })
    const missing = createIdentityDeviceTokenProvider({
      invoke: makeInvoke(async () => ({
        access_token: noIss,
        token_type: 'Bearer',
        expires_in: 900,
        expires_at: '2026-09-27T10:15:00.000Z'
      })),
      isTauri: () => true,
      report: (message) => reports.push(message)
    })
    expect(await missing.getAccessToken()).toBeNull()
    expect(reports.join('|')).toContain('拒绝')
  })

  it('#1171 T13：canonical issuer 正常通过（既有成功路径不受影响）', async () => {
    const provider = createIdentityDeviceTokenProvider({
      invoke: makeInvoke(async () => okPayload()),
      isTauri: () => true
    })
    expect(await provider.getAccessToken()).toBe(okPayload().access_token)
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

// ── P2-6（#1210）：claim 名可配置（策略解析 + payload 取号回归） ─────────────────
// 规格 §2.1：默认行为零变化（不设 env 时 hbut_student_id 命中结果与原先一致）；
// env 非法时不抛错（忽略并回落默认）；`decodeAccessTokenStudentId` 内部改走策略。
describe('P2-6（#1210）claim 名策略：学号 claim 名可配置', () => {
  beforeEach(() => {
    // 两个 env 显式重置为空（= 未设 → 默认策略）；避免 env 桩跨用例泄漏
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM', '')
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('默认：不设 env 时策略 = hbut_student_id + 默认回退链，且 hbut_student_id 命中', () => {
    expect(DEFAULT_STUDENT_ID_CLAIM).toBe('hbut_student_id')
    expect([...DEFAULT_STUDENT_ID_CLAIM_FALLBACKS]).toEqual(['oauth_OIDC_id', 'student_id'])
    const policy = resolveStudentIdClaimPolicy()
    expect(policy.primary).toBe('hbut_student_id')
    expect(policy.fallbacks).toEqual(['oauth_OIDC_id', 'student_id'])
    // 默认命中（与既有行为一致：payload 的 hbut_student_id 原样取出）
    expect(decodeStudentIdFromPayload({ hbut_student_id: STUDENT_ID })).toBe(STUDENT_ID)
  })

  it('改 env 主名为 oauth_OIDC_id：命中 oauth_OIDC_id（证明配置生效）', () => {
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM', 'oauth_OIDC_id')
    const policy = resolveStudentIdClaimPolicy()
    expect(policy.primary).toBe('oauth_OIDC_id')
    // 主名从回退链中剔除（去重）
    expect(policy.fallbacks).toEqual(['student_id'])
    // 策略取号 + 既有入口 decodeAccessTokenStudentId 内部都改走策略
    expect(decodeStudentIdFromPayload({ oauth_OIDC_id: STUDENT_ID })).toBe(STUDENT_ID)
    const token = makeJwt({ iss: CANONICAL_ISSUER, oauth_OIDC_id: STUDENT_ID })
    expect(decodeAccessTokenStudentId(token)).toBe(STUDENT_ID)
  })

  it('回退链：主名缺失时按序尝试 oauth_OIDC_id → student_id；多值同时存在时主名优先', () => {
    // 主名缺失 → 第一个回退命中
    expect(decodeStudentIdFromPayload({ oauth_OIDC_id: '2023010102' })).toBe('2023010102')
    // 前一个缺失 → 第二个回退命中
    expect(decodeStudentIdFromPayload({ student_id: '2023010103' })).toBe('2023010103')
    // 全部候选都有值 → 主名优先（顺序正确）
    expect(
      decodeStudentIdFromPayload({
        hbut_student_id: '2023010101',
        oauth_OIDC_id: '2023010102',
        student_id: '2023010103'
      })
    ).toBe('2023010101')
  })

  it('全部缺失返回 ""；非对象 payload 也返回 ""（绝不抛错）', () => {
    expect(decodeStudentIdFromPayload({})).toBe('')
    expect(decodeStudentIdFromPayload({ other_claim: 'x' })).toBe('')
    for (const bad of [undefined, null, 'str', 42, ['arr']]) {
      expect(decodeStudentIdFromPayload(bad)).toBe('')
    }
    // 纯空白字符串视为缺失（按策略回退到下一个候选）
    expect(
      decodeStudentIdFromPayload({ hbut_student_id: '   ', oauth_OIDC_id: '2023010104' })
    ).toBe('2023010104')
  })

  it('非法 env：主名非法 → 忽略并回落默认；回退全非法 → 忽略并回落默认（不抛错）', () => {
    // 主名含 / 与空白、回退含非法项 —— 均不匹配 ^[A-Za-z_][A-Za-z0-9_.]{0,63}$
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM', '../x')
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS', '../y,bad name')
    const policy = resolveStudentIdClaimPolicy() // 必须不抛
    expect(policy.primary).toBe(DEFAULT_STUDENT_ID_CLAIM)
    expect(policy.fallbacks).toEqual([...DEFAULT_STUDENT_ID_CLAIM_FALLBACKS])
    // 解码行为回落默认策略（hbut_student_id 仍命中）
    expect(decodeStudentIdFromPayload({ hbut_student_id: STUDENT_ID })).toBe(STUDENT_ID)

    // 混合列表：合法项保留、非法项逐条忽略（顺序不变）
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM', '')
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS', 'oauth_OIDC_id,../z,student_id')
    const mixed = resolveStudentIdClaimPolicy()
    expect(mixed.primary).toBe('hbut_student_id')
    expect(mixed.fallbacks).toEqual(['oauth_OIDC_id', 'student_id'])
  })

  it('与既有 decodeAccessTokenStudentId 行为一致：默认 env 下 hbut_student_id 命中 / 非法输入返回空串', () => {
    // 默认 env：与旧实现同输入同输出（hbut_student_id 命中结果不变）
    expect(decodeAccessTokenStudentId(makeJwt({ hbut_student_id: STUDENT_ID }))).toBe(STUDENT_ID)
    // 非法输入返回 '' 不抛（既有用例语义保持不变）
    for (const bad of ['', 'not-a-jwt', 'a.b', 'a.b.c.d', 'x.y.z']) {
      expect(decodeAccessTokenStudentId(bad)).toBe('')
    }
    // 缺 iss 的令牌同样能取学号（本函数只解码，不验签/不校验 issuer）
    expect(decodeAccessTokenStudentId(makeJwt({ hbut_student_id: STUDENT_ID }))).toBe(STUDENT_ID)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 复核 O-2/O-3 回归：claim 名校验与 ocr 同口径（拒 `..`）+ 非默认名告警一次
// ═══════════════════════════════════════════════════════════════════════════

describe('claim 名校验（O-2）与非默认名告警（O-3）', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("含 '..' 的 claim 名被拒绝并回落默认", () => {
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM', 'x..y')
    const policy = resolveStudentIdClaimPolicy()
    expect(policy.primary).toBe('hbut_student_id')
    expect(policy.fallbacks).not.toContain('x..y')
  })

  it('非默认主名生效且只告警一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM', 'oauth_OIDC_id')
    const first = resolveStudentIdClaimPolicy()
    const second = resolveStudentIdClaimPolicy()
    expect(first.primary).toBe('oauth_OIDC_id')
    expect(second.primary).toBe('oauth_OIDC_id')
    const related = warn.mock.calls.filter((c) => String(c[0]).includes('学号 claim 名'))
    expect(related.length).toBeLessThanOrEqual(1)
  })
})
