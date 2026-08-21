// src/app/coordinators/sessionGate.spec.ts
//
// GitHub #659（根因 6/7）全局登录单飞测试：
//   - Gate 单飞核心：并发调用只有一个真实 fn 执行、复用同一 promise
//   - manual login（axios adapter 层 invoke('login')）与 65s 后台恢复
//     （attemptAutoRelogin → invoke('login')）并发时，login 只被调用一次
//   - attemptOnlineRecovery 在已有登录在飞时让路（不触发 restore/login）
//   - 失败后 Gate 释放，不长期阻塞后续登录

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  isLoginInFlight,
  resetLoginGate,
  runExclusiveLogin
} from './sessionGate'
import { createSessionCoordinator } from './SessionCoordinator'
import { invokeNative } from '../../platform/native'
import { loadChaoxingStoredPassword, loadPortalStoredPassword } from '../../composables/useSessionCredentials.js'
import { handleAuthPost } from '../../utils/axios_adapter/auth'
import type { OnlineSessionState } from '../../stores/auth'

vi.mock('../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true)
}))

vi.mock('../../composables/useSessionCredentials.js', () => ({
  loadPortalStoredPassword: vi.fn(),
  loadChaoxingStoredPassword: vi.fn()
}))

vi.mock('../../utils/test_account.js', () => ({
  TEST_ACCOUNT: { studentId: '2510231106' },
  isTestAccountSession: vi.fn(() => false),
  isTestAccountCredentials: vi.fn(() => false)
}))

vi.mock('../../utils/test_account_fixtures.js', () => ({
  getTestAccountGrades: vi.fn(() => []),
  seedTestAccountCaches: vi.fn()
}))

vi.mock('../../utils/api.js', () => ({
  setCachedData: vi.fn()
}))

vi.mock('../../utils/notify_center.js', () => ({
  startNotificationMonitor: vi.fn(() => Promise.resolve())
}))

vi.mock('../../utils/cloud_sync.js', () => ({
  resetCloudSyncCooldownForSession: vi.fn(),
  runAutoCloudSyncAfterLogin: vi.fn(() => Promise.resolve())
}))

// ─── 测试基建 ───────────────────────────────────────────────────────────────

const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear()
}

const makeState = () => ({
  studentId: ref(''),
  userUuid: ref(''),
  gradeData: ref<unknown[]>([]),
  gradeTeacherCache: ref(null),
  gradeTeacherCacheSid: ref(''),
  jwxtMaintenanceMode: ref(false),
  jwxtMaintenanceHint: ref(''),
  jwxtMaintenanceDetail: ref(''),
  jwxtRecoveryPhase: ref('idle'),
  jwxtLastCheckTime: ref(''),
  jwxtSessionLastError: ref(''),
  onlineSessionState: ref<OnlineSessionState>('unknown'),
  mutable: {
    sessionKeepAliveTimer: null as number | null,
    electricityKeepAliveTimer: null as number | null,
    jwxtRecoveryTimer: null as number | null,
    jwxtRecoveryInFlight: false
  }
})

const makeCoordinator = () => {
  const state = makeState()
  const runtime = {
    state,
    auth: { handleLogout: vi.fn() },
    navigation: {}
  } as unknown as Parameters<typeof createSessionCoordinator>[0]
  const coordinator = createSessionCoordinator(runtime)
  return { state, runtime, coordinator }
}

/** 初始化「后台自动重登」前置条件：门户记住密码 + 非学习通登录方式 */
const seedAutoReloginPreconditions = () => {
  storageMap.set('hbu_login_method', 'portal_password')
  storageMap.set('hbu_login_temporary', '0')
  vi.mocked(loadPortalStoredPassword).mockResolvedValue({
    username: '2023000001',
    password: 'pw-secret',
    backendRestorable: false
  })
  vi.mocked(loadChaoxingStoredPassword).mockResolvedValue(null)
}

const flushAsync = async (times = 10) => {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

beforeEach(() => {
  storageMap.clear()
  resetLoginGate()
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', stubStorage)
  // SessionCoordinator 内部定时器 / notifySessionOnline 等依赖 window
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn()
  })
  vi.mocked(invokeNative).mockImplementation(async (command: string) => {
    if (command === 'get_cookies') return 'session_cookie=1'
    if (command === 'set_offline_user_context') return null
    if (command === 'login') return { student_id: '2023000001' }
    throw new Error(`unexpected native command: ${command}`)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ─── 1. Gate 单飞核心 ───────────────────────────────────────────────────────

describe('sessionGate 单飞核心', () => {
  it('并发 runExclusiveLogin：fn 只执行一次，调用方复用同一 promise', async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5))
      return 'login-result'
    })
    const p1 = runExclusiveLogin(fn)
    const p2 = runExclusiveLogin(fn)
    const p3 = runExclusiveLogin(fn)
    expect(isLoginInFlight()).toBe(true)
    const results = await Promise.all([p1, p2, p3])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(results).toEqual(['login-result', 'login-result', 'login-result'])
    expect(isLoginInFlight()).toBe(false)
  })

  it('失败同样释放门：reject 后新调用可再次执行 fn', async () => {
    const failing = vi.fn(async () => {
      throw new Error('登录被拒绝')
    })
    const p1 = runExclusiveLogin(failing)
    await expect(p1).rejects.toThrow('登录被拒绝')
    expect(isLoginInFlight()).toBe(false)
    const ok = vi.fn(async () => 'second')
    await expect(runExclusiveLogin(ok)).resolves.toBe('second')
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('isLoginInFlight 覆盖整个请求生命周期（并发期间为 true）', async () => {
    // resolve 存于对象属性：TS 对「闭包内赋值 + 闭包外调用」的 let 变量
    // 会错误收窄为 never，属性访问不受控制流分析影响
    const holder: { resolve: ((v: string) => void) | null } = { resolve: null }
    const fn = vi.fn(() => new Promise<string>((r) => { holder.resolve = r }))
    const p = runExclusiveLogin(fn)
    await flushAsync()
    expect(isLoginInFlight()).toBe(true)
    holder.resolve?.('done')
    await expect(p).resolves.toBe('done')
    expect(isLoginInFlight()).toBe(false)
  })
})

// ─── 2. manual login vs 65s 后台恢复竞争 ────────────────────────────────────

describe('#659 manual login 与后台恢复竞争', () => {
  /** 让 invoke('login') 挂起，由测试显式放行（保证 in-flight 窗口可控） */
  const installDeferredLogin = () => {
    let resolveLogin: ((value: unknown) => void) | null = null
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'login') {
        return new Promise((r) => { resolveLogin = r })
      }
      if (command === 'get_cookies') return 'session_cookie=1'
      if (command === 'set_offline_user_context') return null
      throw new Error(`unexpected native command: ${command}`)
    })
    const release = (value: unknown = { student_id: '2023000001' }) => resolveLogin?.(value)
    return { release }
  }

  it('并发触发时 login 只被调用一次（后台恢复复用手动登录结果）', async () => {
    seedAutoReloginPreconditions()
    const { coordinator, state } = makeCoordinator()
    state.studentId.value = '2023000001'
    const { release } = installDeferredLogin()

    // 手动登录（模拟 LoginV3 → axios adapter → invoke('login')）先进入门
    const manualPromise = handleAuthPost('/v2/start_login', {
      username: '2023000001',
      password: 'user-typed-password',
      captcha: '',
      lt: '',
      execution: ''
    })
    await flushAsync()
    expect(isLoginInFlight()).toBe(true)
    // 65s 轮询触发的后台自动重登在登录尚未结束时并发进入
    const recoveryPromise = coordinator.attemptAutoRelogin()
    await flushAsync()
    release()
    const [manualResult, recoveryOk] = await Promise.all([manualPromise, recoveryPromise])
    const loginCalls = vi.mocked(invokeNative).mock.calls.filter(
      ([command]) => command === 'login'
    )
    expect(loginCalls).toHaveLength(1)
    expect(recoveryOk).toBe(true)
    expect(manualResult).toMatchObject({ data: { success: true } })
    expect(state.studentId.value).toBe('2023000001')
  })

  it('后台恢复先 in-flight：手动登录提交复用后台请求，不追加第二次 login', async () => {
    seedAutoReloginPreconditions()
    const { coordinator, state } = makeCoordinator()
    state.studentId.value = '2023000001'
    const { release } = installDeferredLogin()

    const recoveryPromise = coordinator.attemptAutoRelogin()
    await flushAsync()
    expect(isLoginInFlight()).toBe(true)
    const manualPromise = handleAuthPost('/v2/start_login', {
      username: '2023000001',
      password: 'pw',
      captcha: '',
      lt: '',
      execution: ''
    })
    await flushAsync()
    release()
    const [recoveryOk, manualResult] = await Promise.all([recoveryPromise, manualPromise])
    const loginCalls = vi.mocked(invokeNative).mock.calls.filter(
      ([command]) => command === 'login'
    )
    expect(loginCalls).toHaveLength(1)
    expect(recoveryOk).toBe(true)
    expect(manualResult).toMatchObject({ data: { success: true } })
  })

  it('65s 轮询 attemptOnlineRecovery 在登录在飞时让路：不发起 restore/login', async () => {
    seedAutoReloginPreconditions()
    const { coordinator, state } = makeCoordinator()
    state.studentId.value = '2023000001'
    storageMap.set('hbu_session_cookies', 'cookie=1')
    const { release } = installDeferredLogin()

    const manualPromise = handleAuthPost('/v2/start_login', {
      username: '2023000001',
      password: 'pw',
      captcha: '',
      lt: '',
      execution: ''
    })
    await flushAsync()
    expect(isLoginInFlight()).toBe(true)
    // 轮询恢复在手动登录尚未结束时进入：应让路（下轮再试）
    const recoveryPromise = coordinator.attemptOnlineRecovery({ silent: true })
    await flushAsync()
    release()
    const [recoveryOk, manualResult] = await Promise.all([recoveryPromise, manualPromise])

    const loginCalls = vi.mocked(invokeNative).mock.calls.filter(
      ([command]) => command === 'login'
    )
    const restoreCalls = vi.mocked(invokeNative).mock.calls.filter(
      ([command]) => command === 'restore_session' || command === 'restore_latest_session'
    )
    expect(loginCalls).toHaveLength(1)
    expect(restoreCalls).toHaveLength(0)
    expect(recoveryOk).toBe(false)
    expect(manualResult).toMatchObject({ data: { success: true } })
  })
})