// src/app/coordinators/accountSwitchOnline.spec.ts
//
// GitHub #1061：师生切号后的「目标账号专属自动恢复」回归。
//   - 自动重登必须只使用**目标账号自身**的安全存储凭据，禁止用旧账号凭据串号；
//   - 重登返回的身份必须与目标账号一致，否则拒绝采纳；
//   - 恢复成功后在教师身份下不得启动学生专属电费保活 / 通知任务。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { resetLoginGate } from './sessionGate'
import { resetLoginCooldown } from './loginCooldown'
import { createSessionCoordinator } from './SessionCoordinator'
import { invokeNative } from '../../platform/native'
import { startNotificationMonitor } from '../../utils/notify_center.js'
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

const makeCoordinator = () => {
  const state = makeState()
  const runtime = {
    state: {
      ...state,
      setIdentityRole: (value: unknown) => {
        state.role.value = value === 'teacher' ? 'teacher' : 'student'
      }
    },
    auth: { handleLogout: vi.fn() },
    navigation: {}
  } as unknown as Parameters<typeof createSessionCoordinator>[0]
  return { state, runtime, coordinator: createSessionCoordinator(runtime) }
}

beforeEach(() => {
  storageMap.clear()
  resetLoginGate()
  resetLoginCooldown()
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', stubStorage)
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn()
  })
  storageMap.set('hbu_login_method', 'portal_password')
  storageMap.set('hbu_login_temporary', '0')
  vi.mocked(loadPortalStoredPassword).mockResolvedValue(null)
  vi.mocked(loadChaoxingStoredPassword).mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const commandCalls = () => vi.mocked(invokeNative).mock.calls.map(([command]) => command)

describe('#1061 目标账号专属自动恢复（禁止串号）', () => {
  it('只用目标账号自身的存储凭据重登，绝不使用旧账号记住密码', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '20000000'
    state.role.value = 'teacher'
    // 旧学生账号的全局记住密码仍在本地：绝不能被用于教师目标账号。
    vi.mocked(loadPortalStoredPassword).mockResolvedValue({
      username: '2510232001',
      password: 'old-student-secret',
      backendRestorable: true
    } as unknown as Awaited<ReturnType<typeof loadPortalStoredPassword>>)
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'has_restorable_credentials') return true
      if (command === 'auto_relogin_from_stored') {
        return { student_id: '20000000', role: 'teacher' }
      }
      if (command === 'get_cookies') return 'teacher-cookie=1'
      throw new Error(`unexpected native command: ${command}`)
    })

    await expect(coordinator.attemptAutoRelogin()).resolves.toBe(true)
    expect(invokeNative).toHaveBeenCalledWith(
      'auto_relogin_from_stored',
      expect.objectContaining({ studentId: '20000000' })
    )
    expect(commandCalls()).not.toContain('login')
    expect(state.studentId.value).toBe('20000000')
    expect(state.role.value).toBe('teacher')
  })

  it('目标账号没有匹配凭据时直接判定需重登，绝不回退到其他账号凭据', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '2510232001'
    vi.mocked(loadPortalStoredPassword).mockResolvedValue({
      username: '20000000',
      password: 'teacher-secret',
      backendRestorable: true
    } as unknown as Awaited<ReturnType<typeof loadPortalStoredPassword>>)
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'has_restorable_credentials') return false
      throw new Error(`unexpected native command: ${command}`)
    })

    await expect(coordinator.attemptAutoRelogin()).resolves.toBe(false)
    expect(commandCalls()).not.toContain('auto_relogin_from_stored')
    expect(commandCalls()).not.toContain('login')
    expect(state.studentId.value).toBe('2510232001')
    expect(state.jwxtSessionLastError.value).toContain('需要重新登录')
  })

  it('重登返回的账号与目标账号不一致时拒绝采纳（不串号）', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '2510232001'
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'has_restorable_credentials') return true
      if (command === 'auto_relogin_from_stored') {
        // 凭据被换绑到别的账号：服务端返回的身份与目标不符
        return { student_id: '2510239999', role: 'student' }
      }
      throw new Error(`unexpected native command: ${command}`)
    })

    await expect(coordinator.attemptAutoRelogin()).resolves.toBe(false)
    expect(state.studentId.value).toBe('2510232001')
    expect(state.jwxtSessionLastError.value).toContain('不一致')
  })
})

describe('#1061 恢复成功后的身份隔离', () => {
  it('教师目标恢复成功不启动学生电费保活与通知任务', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '20000000'
    state.role.value = 'teacher'
    storageMap.set('hbu_session_cookies', 'teacher-cookie=1')
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'refresh_session') throw new Error('登录已过期')
      if (command === 'has_restorable_credentials') return true
      if (command === 'auto_relogin_from_stored') {
        return { student_id: '20000000', role: 'teacher' }
      }
      if (command === 'get_cookies') return 'teacher-cookie=1'
      throw new Error(`unexpected native command: ${command}`)
    })

    await coordinator.refreshSessionSilently({ quiet: true })
    expect(state.onlineSessionState.value).toBe('online')
    expect(state.role.value).toBe('teacher')
    expect(state.mutable.electricityKeepAliveTimer).toBeNull()
    expect(startNotificationMonitor).not.toHaveBeenCalled()
    expect(commandCalls()).not.toContain('refresh_electricity_token')
  })

  it('学生目标恢复成功仍启动电费保活（回归护栏）', async () => {
    const { state, coordinator } = makeCoordinator()
    state.studentId.value = '2510232001'
    storageMap.set('hbu_session_cookies', 'cookie=1')
    vi.mocked(invokeNative).mockImplementation(async (command: string) => {
      if (command === 'refresh_session') throw new Error('登录已过期')
      if (command === 'has_restorable_credentials') return true
      if (command === 'auto_relogin_from_stored') {
        return { student_id: '2510232001', role: 'student' }
      }
      if (command === 'get_cookies') return 'cookie=1'
      throw new Error(`unexpected native command: ${command}`)
    })

    await coordinator.refreshSessionSilently({ quiet: true })
    expect(state.onlineSessionState.value).toBe('online')
    expect(state.mutable.electricityKeepAliveTimer).toBe(1)
  })
})

describe('#1061 会话协调器接线契约', () => {
  const source = () => readFileSync(new URL('./SessionCoordinator.ts', import.meta.url), 'utf8')

  it('自动重登按目标账号解析凭据并复验身份', () => {
    const src = source()

    expect(src).toContain("invoke<boolean>('has_restorable_credentials'")
    expect(src).toContain("invoke('auto_relogin_from_stored'")
    expect(src).toContain('matchesCurrentTarget(userInfo as Record<string, unknown>)')
    expect(src).toContain('自动重登返回的账号与目标账号不一致，已拒绝采纳')
  })

  it('学习通凭据与目标账号不一致时跳过重登', () => {
    const src = source()

    expect(src).toContain("String(chaoxingCreds.account || '').trim() !== targetSid")
    expect(src).toContain('本地学习通凭据与目标账号不一致，已跳过自动重登')
  })

  it('恢复/自动重登后的电费保活按教师身份隔离', () => {
    const src = source()

    expect(src).toContain('if (!isTeacherRoleValue(state.role.value)) startElectricityKeepAlive()')
  })
})
