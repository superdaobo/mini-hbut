// src/app/coordinators/sessionOnlineState.spec.ts
//
// GitHub #659：onlineSessionState 状态流转测试
//   - restoreCachedIdentityFromLocal → cached_offline（isLoggedIn 仍为 true）
//   - 恢复开始 → recovering（attemptOnlineRecovery）
//   - 恢复成功 → online（notifySessionOnline / 恢复成功路径）
//   - 恢复失败 → cached_offline（相位 failed 联动）
//   - 明确需重登 → needs_login（无可用凭据）
//   - 离线缓存回归：在线失效但本地缓存存在时缓存身份可展示、
//     手动登录可接管、不清成绩缓存

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
let gradeCacheCleared = false

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

const flushAsync = async (times = 10) => {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

beforeEach(() => {
  storageMap.clear()
  gradeCacheCleared = false
  resetLoginGate()
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', stubStorage)
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
    if (command === 'restore_session') return { student_id: '2023000001' }
    if (command === 'login') return { student_id: '2023000001' }
    throw new Error(`unexpected native command: ${command}`)
  })
  // 记录成绩缓存是否被清除（离线回归断言：不得清缓存）
  const originalRemoveItem = stubStorage.removeItem
  stubStorage.removeItem = (key: string) => {
    if (String(key).startsWith('grades:')) gradeCacheCleared = true
    originalRemoveItem(key)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── 1. 缓存身份 ≠ 在线会话 ─────────────────────────────────────────────────

describe('#659 缓存身份恢复（cached_offline）', () => {
  it('恢复本地缓存身份：onlineSessionState=cached_offline，isLoggedIn 语义不变', async () => {
    const { coordinator, state } = makeCoordinator()
    storageMap.set('hbu_username', '2023000001')
    storageMap.set('hbu_login_method', 'portal_password')
    storageMap.set('hbu_login_temporary', '0')

    const ok = await coordinator.restoreCachedIdentityFromLocal()
    expect(ok).toBe(true)
    expect(state.studentId.value).toBe('2023000001')
    // isLoggedIn（studentId 非空）行为保持不变
    expect(state.studentId.value.length > 0).toBe(true)
    // 但在线会话状态明确为「未恢复」
    expect(state.onlineSessionState.value).toBe('cached_offline')
    // 通知 Rust 侧离线上下文
    expect(vi.mocked(invokeNative)).toHaveBeenCalledWith(
      'set_offline_user_context',
      expect.anything()
    )
  })

  it('在线失效但本地缓存存在：缓存身份可展示、成绩缓存不被清除', async () => {
    const { coordinator, state } = makeCoordinator()
    storageMap.set('hbu_username', '2023000001')
    storageMap.set('hbu_login_method', 'portal_password')
    storageMap.set('hbu_login_temporary', '0')
    gradeCacheCleared = false

    await coordinator.restoreCachedIdentityFromLocal()
    // 在线会话恢复失败（cookie 恢复失败）
    vi.mocked(invokeNative).mockRejectedValueOnce(new Error('会话已失效'))
    const restored = await coordinator.tryRestoreSession()
    expect(restored).toBe(false)
    expect(state.studentId.value).toBe('2023000001')
    expect(state.onlineSessionState.value).toBe('cached_offline')
    expect(gradeCacheCleared).toBe(false)
  })
})

// ─── 2. 状态流转：cached_offline → recovering → online / cached_offline ─────

describe('#659 状态流转', () => {
  it('恢复进行中 → recovering；恢复成功 → online；恢复失败 → cached_offline', async () => {
    const { coordinator, state } = makeCoordinator()
    storageMap.set('hbu_username', '2023000001')
    storageMap.set('hbu_login_method', 'portal_password')
    storageMap.set('hbu_login_temporary', '0')
    storageMap.set('hbu_session_cookies', 'cookie=1')
    await coordinator.restoreCachedIdentityFromLocal()
    expect(state.onlineSessionState.value).toBe('cached_offline')

    // 恢复开始（可在 silent 轮询中触发）；同步段即进入「正在恢复」
    const recoveryPromise = coordinator.attemptOnlineRecovery({ silent: true })
    expect(state.onlineSessionState.value).toBe('recovering')
    const ok = await recoveryPromise
    expect(ok).toBe(true)
    // restore_session 成功 → notifySessionOnline → online
    expect(state.onlineSessionState.value).toBe('online')
    expect(state.jwxtRecoveryPhase.value).toBe('idle')
  })

  it('恢复失败 → 相位 failed → onlineSessionState 回落 cached_offline', async () => {
    const { coordinator, state } = makeCoordinator()
    storageMap.set('hbu_username', '2023000001')
    storageMap.set('hbu_login_method', 'portal_password')
    storageMap.set('hbu_login_temporary', '0')
    await coordinator.restoreCachedIdentityFromLocal()

    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'restore_session' || command === 'restore_latest_session') {
        throw new Error('会话恢复失败: 网络异常')
      }
      if (command === 'login') return { student_id: '2023000001' }
      if (command === 'get_cookies') return 'session_cookie=1'
      if (command === 'set_offline_user_context') return null
      throw new Error(`unexpected native command: ${command}`)
    })
    vi.mocked(loadPortalStoredPassword).mockResolvedValue(null)
    vi.mocked(loadChaoxingStoredPassword).mockResolvedValue(null)

    const ok = await coordinator.attemptOnlineRecovery({ silent: false })
    expect(ok).toBe(false)
    expect(state.onlineSessionState.value).toBe('cached_offline')
    expect(state.jwxtRecoveryPhase.value).toBe('failed')
    // 本地缓存身份仍在（不踢登录页）
    expect(state.studentId.value).toBe('2023000001')
  })

  it('无可用凭据且恢复失败 → needs_login', async () => {
    const { coordinator, state } = makeCoordinator()
    storageMap.set('hbu_username', '2023000001')
    storageMap.set('hbu_login_method', 'portal_password')
    storageMap.set('hbu_login_temporary', '0')
    await coordinator.restoreCachedIdentityFromLocal()

    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'restore_session' || command === 'restore_latest_session') {
        throw new Error('会话已过期')
      }
      if (command === 'get_cookies') return 'session_cookie=1'
      if (command === 'set_offline_user_context') return null
      throw new Error(`unexpected native command: ${command}`)
    })
    vi.mocked(loadPortalStoredPassword).mockResolvedValue(null)
    vi.mocked(loadChaoxingStoredPassword).mockResolvedValue(null)

    await coordinator.handleRetrySessionRecovery()
    await flushAsync()
    expect(state.onlineSessionState.value).toBe('needs_login')
    expect(state.jwxtRecoveryPhase.value).toBe('need_login')
    // 缓存身份保留、缓存未清
    expect(state.studentId.value).toBe('2023000001')
    expect(gradeCacheCleared).toBe(false)
  })

  it('已登录自动恢复成功路径：notifySessionOnline 显式置 online', async () => {
    const { coordinator, state } = makeCoordinator()
    storageMap.set('hbu_username', '2023000001')
    storageMap.set('hbu_login_method', 'portal_password')
    storageMap.set('hbu_login_temporary', '0')
    storageMap.set('hbu_session_cookies', 'cookie=1')
    await coordinator.restoreCachedIdentityFromLocal()
    expect(state.onlineSessionState.value).toBe('cached_offline')

    coordinator.notifySessionOnline('session-restore')
    expect(state.onlineSessionState.value).toBe('online')
    expect(state.jwxtMaintenanceMode.value).toBe(false)
  })

  it('登出后 clearJwxtMaintenance：onlineSessionState 回到 unknown', async () => {
    const { coordinator, state } = makeCoordinator()
    storageMap.set('hbu_username', '2023000001')
    storageMap.set('hbu_login_method', 'portal_password')
    storageMap.set('hbu_login_temporary', '0')
    await coordinator.restoreCachedIdentityFromLocal()
    expect(state.onlineSessionState.value).toBe('cached_offline')
    // 模拟 AuthCoordinator 登出：清空身份后再清维护态
    state.studentId.value = ''
    coordinator.clearJwxtMaintenance()
    expect(state.onlineSessionState.value).toBe('unknown')
  })
})