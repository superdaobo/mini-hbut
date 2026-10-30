// src/app/coordinators/sessionNetworkFastFail.spec.ts
//
// GitHub #1146（epic #1145 E1）：网络状态监控 + 恢复链断网快速失败 + 恢复即时重试
//   - navigator.onLine=false 时 attemptOnlineRecovery 立即返回 false，不 invoke 任何网络命令
//   - navigator.onLine=false 时 attemptAutoRelogin 立即返回 false，不发起登录请求
//   - navigator.onLine=false 时 refreshSessionSilently 跳过刷新，不触发失败分支
//   - offline 事件 → auth.deviceOnline=false 并停掉 65s 恢复轮询
//   - online 事件 → auth.deviceOnline=true 并立即恢复（不等 65s 轮询）
//   - 设备离线期间 startJwxtRecoveryPolling 不启动（避免无效轮询）
//
// navigator.onLine mock 方式：Object.defineProperty / vi.stubGlobal，测试后由
// afterEach 的 vi.unstubAllGlobals() 还原。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { resetLoginGate } from './sessionGate'
import { createSessionCoordinator } from './SessionCoordinator'
import { invokeNative } from '../../platform/native'
import { loadChaoxingStoredPassword, loadPortalStoredPassword } from '../../composables/useSessionCredentials.js'
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

// window 桩：捕获 addEventListener/removeEventListener，便于手动派发 online/offline
const windowListeners = new Map<string, Set<(ev?: unknown) => void>>()
const emitWindowEvent = (type: string) => {
  windowListeners.get(type)?.forEach((handler) => handler({ type }))
}
const stubWindow = {
  dispatchEvent: vi.fn(),
  setTimeout: vi.fn(() => 1),
  clearTimeout: vi.fn(),
  setInterval: vi.fn(() => 1),
  clearInterval: vi.fn(),
  addEventListener: (type: string, handler: (ev?: unknown) => void) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set())
    windowListeners.get(type)?.add(handler)
  },
  removeEventListener: (type: string, handler: (ev?: unknown) => void) => {
    windowListeners.get(type)?.delete(handler)
  }
}

const makeState = () => ({
  role: ref<'student' | 'teacher'>('student'),
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

// 取出某条 native 命令是否被调用过（按命令名精确判断，不受参数形态影响）
const invokedCommands = () => vi.mocked(invokeNative).mock.calls.map((c) => String(c[0]))

const makeCoordinator = () => {
  const state = makeState()
  // auth 店桩：deviceOnline 为普通布尔（Pinia 代理解包后的访问形态一致）
  const authStore = { deviceOnline: true }
  const runtime = {
    state: {
      ...state,
      setIdentityRole: (value: unknown) => {
        state.role.value = value === 'teacher' ? 'teacher' : 'student'
      }
    },
    auth: { handleLogout: vi.fn() },
    stores: { auth: authStore },
    navigation: {}
  } as unknown as Parameters<typeof createSessionCoordinator>[0]
  const coordinator = createSessionCoordinator(runtime)
  return { state, runtime, coordinator, authStore }
}

const flushAsync = async (times = 10) => {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

beforeEach(() => {
  storageMap.clear()
  windowListeners.clear()
  resetLoginGate()
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', stubStorage)
  vi.stubGlobal('window', stubWindow)
  // 默认在线（未显式 stub navigator 时恢复链走正常网络路径）
  vi.stubGlobal('navigator', { onLine: true })
  vi.mocked(invokeNative).mockImplementation(async (command: string) => {
    if (command === 'get_cookies') return 'session_cookie=1'
    if (command === 'set_offline_user_context') return null
    if (command === 'restore_session') return { student_id: '2023000001' }
    if (command === 'login') return { student_id: '2023000001' }
    throw new Error(`unexpected native command: ${command}`)
  })
  vi.mocked(loadPortalStoredPassword).mockResolvedValue(null)
  vi.mocked(loadChaoxingStoredPassword).mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── 1. 快速失败：断网时恢复链不发起任何网络请求 ─────────────────────────────

describe('#1146 断网快速失败（navigator.onLine=false）', () => {
  it('attemptOnlineRecovery 立即返回 false：不 invoke restore/login，非静默标记离线横幅', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '2023000001'
    storageMap.set('hbu_session_cookies', 'cookie=1')
    vi.stubGlobal('navigator', { onLine: false })

    const ok = await coordinator.attemptOnlineRecovery({ silent: false })
    expect(ok).toBe(false)
    // 核心断言：没有任何网络命令被发起（不空等 30s HTTP 超时）
    expect(invokedCommands()).toEqual([])
    // 非静默路径：维护横幅带离线语义（phase=failed）
    expect(state.jwxtMaintenanceMode.value).toBe(true)
    expect(state.jwxtRecoveryPhase.value).toBe('failed')
    expect(state.jwxtMaintenanceHint.value).toContain('离线')
    // 本地缓存身份保留，不踢登录页
    expect(state.studentId.value).toBe('2023000001')
    expect(state.onlineSessionState.value).toBe('cached_offline')
  })

  it('attemptAutoRelogin 立即返回 false：不发起任何登录请求', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '2023000001'
    storageMap.set('hbu_login_method', 'portal_password')
    vi.stubGlobal('navigator', { onLine: false })

    const ok = await coordinator.attemptAutoRelogin()
    expect(ok).toBe(false)
    expect(invokedCommands()).toEqual([])
  })

  it('refreshSessionSilently 跳过刷新：不 invoke refresh_session、不启动恢复轮询、不触发失败分支', async () => {
    const { coordinator, runtime, state } = makeCoordinator()
    storageMap.set('hbu_session_cookies', 'cookie=1')
    vi.stubGlobal('navigator', { onLine: false })

    await coordinator.refreshSessionSilently()
    expect(invokedCommands()).toEqual([])
    expect(state.mutable.jwxtRecoveryTimer).toBeNull()
    expect(runtime.auth.handleLogout).not.toHaveBeenCalled()
  })

  it('设备离线期间 startJwxtRecoveryPolling 不启动（避免 65s 无效轮询）', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '2023000001'
    vi.stubGlobal('navigator', { onLine: false })

    coordinator.startJwxtRecoveryPolling()
    expect(state.mutable.jwxtRecoveryTimer).toBeNull()
  })
})

// ─── 2. online/offline 事件驱动 ──────────────────────────────────────────────

describe('#1146 online/offline 事件驱动（deviceOnline 状态 + 即时恢复）', () => {
  it('offline 事件 → auth.deviceOnline=false，且已运行的 65s 恢复轮询被停掉', async () => {
    const { state, coordinator, authStore } = makeCoordinator()
    state.studentId.value = '2023000001'
    coordinator.installNetworkStateListeners()
    // 先让恢复轮询跑起来（模拟此前已进入恢复流程）
    coordinator.startJwxtRecoveryPolling()
    expect(state.mutable.jwxtRecoveryTimer).not.toBeNull()

    vi.stubGlobal('navigator', { onLine: false })
    emitWindowEvent('offline')
    expect(authStore.deviceOnline).toBe(false)
    expect(state.mutable.jwxtRecoveryTimer).toBeNull()
  })

  it('online 事件 → auth.deviceOnline=true，立即触发恢复（不等 65s 轮询）', async () => {
    const { state, coordinator, authStore } = makeCoordinator()
    state.studentId.value = '2023000001'
    storageMap.set('hbu_session_cookies', 'cookie=1')
    storageMap.set('hbu_login_method', 'portal_password')
    coordinator.installNetworkStateListeners()

    // 先离线：停轮询 + 记录离线态
    vi.stubGlobal('navigator', { onLine: false })
    emitWindowEvent('offline')
    expect(authStore.deviceOnline).toBe(false)

    // 网络恢复：online 事件应立即跑完整恢复链（restore_session 被调用）
    vi.stubGlobal('navigator', { onLine: true })
    emitWindowEvent('online')
    await flushAsync()
    expect(authStore.deviceOnline).toBe(true)
    expect(invokedCommands()).toContain('restore_session')
    // 恢复成功 → 在线会话建立（不依赖 65s 轮询周期）
    expect(state.onlineSessionState.value).toBe('online')
    expect(state.jwxtRecoveryPhase.value).toBe('idle')
  })

  it('online 事件立即恢复失败时回落 65s 轮询', async () => {
    const { state, coordinator, authStore } = makeCoordinator()
    state.studentId.value = '2023000001'
    storageMap.set('hbu_session_cookies', 'cookie=1')
    storageMap.set('hbu_login_method', 'portal_password')
    coordinator.installNetworkStateListeners()

    vi.stubGlobal('navigator', { onLine: true })
    // 恢复链全失败（restore 与 login 均不可用）
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'restore_session' || command === 'restore_latest_session') {
        throw new Error('会话恢复失败')
      }
      if (command === 'login' || command === 'auto_relogin_from_stored') {
        throw new Error('登录失败')
      }
      if (command === 'has_restorable_credentials') return false
      if (command === 'get_cookies') return 'session_cookie=1'
      throw new Error(`unexpected native command: ${command}`)
    })

    emitWindowEvent('online')
    await flushAsync(20)
    expect(authStore.deviceOnline).toBe(true)
    // 即时恢复失败 → 回落轮询
    expect(state.mutable.jwxtRecoveryTimer).not.toBeNull()
  })

  it('无 studentId（未登录 / 已手动登出）时 online 事件不触发恢复', async () => {
    const { coordinator, authStore } = makeCoordinator()
    coordinator.installNetworkStateListeners()
    vi.stubGlobal('navigator', { onLine: true })

    emitWindowEvent('online')
    await flushAsync()
    expect(authStore.deviceOnline).toBe(true)
    // 无目标身份：不发起任何恢复
    expect(invokedCommands()).toEqual([])
  })

  it('installNetworkStateListeners 幂等：重复安装不重复注册监听', async () => {
    const make = makeCoordinator()
    make.coordinator.installNetworkStateListeners()
    make.coordinator.installNetworkStateListeners()
    expect(windowListeners.get('online')?.size).toBe(1)
    expect(windowListeners.get('offline')?.size).toBe(1)
    make.coordinator.removeNetworkStateListeners()
    expect(windowListeners.get('online')?.size).toBe(0)
    expect(windowListeners.get('offline')?.size).toBe(0)
  })
})
