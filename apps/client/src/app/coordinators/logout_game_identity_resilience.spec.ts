/**
 * F2（PRR#2b 复验）：限制存储（隐私模式 / 权限拒绝）下，游戏落盘身份清理会抛 `SecurityError`
 * （实测调用栈：`clearGameIdentityCaches` ← `handleLogout`）。登出 / 换号流程必须**仍然完成**：
 * 学号置空、UI 回未登录、无异常冒泡 —— 清理失败不得成为登出 / 换号链路上的第一处未保护
 * 存储访问（否则会话失效登出不收口，界面仍停留在「已登录」）。
 *
 * 模拟方式与复验探针同形：`localStorage.length` 读取即抛 SecurityError（清理函数的第一个访问），
 * 其余读写正常，因此本用例只考「清理失败」这一件事。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createAuthCoordinator } from './AuthCoordinator'
import { clearGameIdentityCaches } from '../../utils/api.js'
import { invokeNative } from '../../platform/native'

vi.mock('../../platform/native', () => ({
  invokeNative: vi.fn(async () => null),
  isTauriRuntime: vi.fn(() => false)
}))

vi.mock('../../utils/test_account.js', () => ({
  TEST_ACCOUNT: { studentId: '2510231106' },
  isTestAccountSession: vi.fn(() => false),
  clearTestAccountSession: vi.fn()
}))

vi.mock('../../utils/test_account_fixtures.js', () => ({
  getTestAccountGrades: vi.fn(() => []),
  seedTestAccountCaches: vi.fn()
}))

vi.mock('../../utils/credential_storage.js', () => ({
  preservePortalRememberedPasswordOnLogout: vi.fn(async () => {}),
  ensureRememberedPasswordCached: vi.fn(async () => {})
}))

vi.mock('../../utils/notify_center.js', () => ({
  startNotificationMonitor: vi.fn(async () => {}),
  stopNotificationMonitor: vi.fn(async () => {})
}))

vi.mock('../../utils/widget_bridge', () => ({
  clearWidgetForLogout: vi.fn(async () => {})
}))

vi.mock('../../utils/cloud_sync.js', () => ({
  resetCloudSyncCooldownForSession: vi.fn(),
  runAutoCloudSyncAfterLogin: vi.fn(async () => {})
}))

vi.mock('../../utils/usage_tracker.js', () => ({
  initUsageTracker: vi.fn(),
  setUsageTrackingStudentId: vi.fn()
}))

vi.mock('../../utils/usage_uploader.js', () => ({
  scheduleUsageUpload: vi.fn()
}))

vi.mock('../../utils/local_reminder_scheduler', () => ({
  reconcileLocalReminders: vi.fn(async () => {}),
  clearRemindersForLogout: vi.fn(async () => {})
}))

vi.mock('../../utils/daily_access_key.js', () => ({
  clearDailyAccessGrant: vi.fn()
}))

const CURRENT_SID = '2024011001'
const NEXT_SID = '2024011002'

const storageMap = new Map<string, string>()

/** 限制存储：任何 `localStorage.length` 读取都抛 SecurityError（复验 E5 的实测形态） */
const createRestrictedStorage = () => ({
  get length(): number {
    const error = new Error('denied')
    error.name = 'SecurityError'
    throw error
  },
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  key: () => null,
  clear: () => storageMap.clear()
})

const makeRuntime = () => {
  const role = ref<'student' | 'teacher'>('student')
  const state = {
    studentId: ref(CURRENT_SID),
    userUuid: ref('uuid-a'),
    role,
    setIdentityRole: (value: unknown) => { role.value = value === 'teacher' ? 'teacher' : 'student' },
    // 契约 D / P2-2：登出必须把在线会话态一并重置为未确认（复用认证状态层同一 ref）
    onlineSessionState: ref<'unknown' | 'cached_offline' | 'recovering' | 'online' | 'needs_login'>('online'),
    gradeData: ref<unknown[]>([{ id: 1 }]),
    gradeTeacherCache: ref(null),
    gradeTeacherCacheSid: ref(CURRENT_SID)
  }
  const applyViewState = vi.fn()
  const runtime = {
    state,
    navigation: { applyViewState, replaceHistorySnapshot: vi.fn() },
    session: {
      stopSessionKeepAlive: vi.fn(),
      stopElectricityKeepAlive: vi.fn(),
      stopJwxtRecoveryPolling: vi.fn(),
      startJwxtRecoveryPolling: vi.fn(),
      clearJwxtMaintenance: vi.fn(),
      persistSessionCookies: vi.fn(async () => {}),
      startSessionKeepAlive: vi.fn(),
      startElectricityKeepAlive: vi.fn(),
      notifySessionOnline: vi.fn(),
      markLoginSessionToken: vi.fn()
    },
    notification: { stopWidgetCrossDayTimer: vi.fn() },
    grade: { handleRefreshGrades: vi.fn(async () => {}) }
  } as unknown as Parameters<typeof createAuthCoordinator>[0]
  return { runtime, state, applyViewState }
}

beforeEach(() => {
  storageMap.clear()
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', createRestrictedStorage())
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    setTimeout: (fn: () => void) => globalThis.setTimeout(fn, 0),
    clearTimeout: vi.fn()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('F2：限制存储下游戏身份清理失败不得阻断登出 / 换号', () => {
  it('自动登出（manual:false）仍完成收口：学号置空、会话停机、无异常冒泡', async () => {
    storageMap.set('hbu_username', CURRENT_SID)
    const { runtime, state, applyViewState } = makeRuntime()
    const auth = createAuthCoordinator(runtime)

    // 前置：清理确实会抛 SecurityError（证明本用例真的在考「清理失败」这一件事）
    expect(() => clearGameIdentityCaches(CURRENT_SID)).toThrow(/denied/)

    await expect(
      auth.handleLogout({ manual: false, reason: 'temp_session_expired' })
    ).resolves.toBeUndefined()

    expect(state.studentId.value).toBe('')
    expect(state.userUuid.value).toBe('')
    expect(state.gradeData.value).toEqual([])
    expect(state.gradeTeacherCacheSid.value).toBe('')
    // 流程未被清理异常截断：重置之后的收口动作都执行到了
    expect(applyViewState).toHaveBeenCalledWith('home')
    expect(runtime.session.stopSessionKeepAlive).toHaveBeenCalled()
    expect(runtime.notification.stopWidgetCrossDayTimer).toHaveBeenCalled()
  })

  it('切换账号仍完成：学号切到新账号、无异常冒泡', () => {
    const { runtime, state } = makeRuntime()
    const auth = createAuthCoordinator(runtime)

    expect(() => clearGameIdentityCaches(CURRENT_SID)).toThrow(/denied/)
    expect(() => auth.handleAccountSwitch({ studentId: NEXT_SID, role: 'student' })).not.toThrow()
    expect(state.studentId.value).toBe(NEXT_SID)
  })

  it('学生切教师时工号与角色同时落地，在线验证前保持 recovering', async () => {
    const { runtime, state } = makeRuntime()
    vi.mocked(invokeNative).mockResolvedValueOnce({ student_id: '20000000', role: 'teacher' })
    const auth = createAuthCoordinator(runtime)
    expect(() => auth.handleAccountSwitch({ studentId: '20000000', role: 'teacher' })).not.toThrow()
    expect(state.studentId.value).toBe('20000000')
    expect(state.role.value).toBe('teacher')
    expect(state.onlineSessionState.value).toBe('recovering')
    expect(storageMap.get('hbu_username')).toBe('20000000')
    expect(storageMap.get('hbu_username_role')).toBe('teacher')
    await vi.waitFor(() => {
      expect(runtime.session.notifySessionOnline).toHaveBeenCalledWith('account-switch')
    })
    expect(runtime.grade.handleRefreshGrades).not.toHaveBeenCalled()
    expect(runtime.session.startElectricityKeepAlive).not.toHaveBeenCalled()
  })

  it('教师切学生时恢复学生角色与学号，在线确认后才刷新学生成绩', async () => {
    const { runtime, state } = makeRuntime()
    vi.mocked(invokeNative).mockResolvedValueOnce({ student_id: NEXT_SID, role: 'student' })
    state.studentId.value = '20000000'
    state.setIdentityRole('teacher')
    const auth = createAuthCoordinator(runtime)
    auth.handleAccountSwitch({ studentId: NEXT_SID, role: 'student' })
    expect(state.studentId.value).toBe(NEXT_SID)
    expect(state.role.value).toBe('student')
    expect(state.onlineSessionState.value).toBe('recovering')
    await vi.waitFor(() => {
      expect(runtime.session.notifySessionOnline).toHaveBeenCalledWith('account-switch')
      expect(runtime.grade.handleRefreshGrades).toHaveBeenCalled()
    })
  })

  it('本地 Cookie 恢复了其他账号时，拒绝将目标账号标记为在线', async () => {
    const { runtime, state } = makeRuntime()
    vi.mocked(invokeNative).mockResolvedValueOnce({ student_id: NEXT_SID, role: 'student' })
    const auth = createAuthCoordinator(runtime)
    auth.handleAccountSwitch({ studentId: '20000000', role: 'teacher' })
    await vi.waitFor(() => {
      expect(state.onlineSessionState.value).toBe('cached_offline')
      expect(runtime.session.startJwxtRecoveryPolling).toHaveBeenCalled()
    })
    expect(runtime.session.notifySessionOnline).not.toHaveBeenCalled()
    expect(runtime.grade.handleRefreshGrades).not.toHaveBeenCalled()
  })

  it('账号连续切换后，迟到的旧账号校验结果不得再次确认在线', async () => {
    let releaseOld: (value: unknown) => void = () => {}
    vi.mocked(invokeNative)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOld = resolve }))
      .mockResolvedValueOnce({ student_id: NEXT_SID, role: 'student' })
    const { runtime, state } = makeRuntime()
    const auth = createAuthCoordinator(runtime)
    auth.handleAccountSwitch({ studentId: '20000000', role: 'teacher' })
    auth.handleAccountSwitch({ studentId: NEXT_SID, role: 'student' })
    await vi.waitFor(() => {
      expect(runtime.session.notifySessionOnline).toHaveBeenCalledTimes(1)
    })
    releaseOld({ student_id: '20000000', role: 'teacher' })
    await Promise.resolve()
    await Promise.resolve()
    expect(state.studentId.value).toBe(NEXT_SID)
    expect(state.role.value).toBe('student')
    expect(runtime.session.notifySessionOnline).toHaveBeenCalledTimes(1)
    expect(runtime.session.persistSessionCookies).toHaveBeenCalledTimes(1)
  })

  it('手动登出（manual:true）同样收口：清缓存失败不阻断学号置空与回首页', async () => {
    storageMap.set('hbu_username', CURRENT_SID)
    const { runtime, state, applyViewState } = makeRuntime()
    const auth = createAuthCoordinator(runtime)

    // 手动登出链路的第一处清理（clearUserScopedCaches → 游戏身份清理）在限制存储下抛错
    expect(() => clearGameIdentityCaches(CURRENT_SID)).toThrow(/denied/)

    await expect(auth.handleLogout({ manual: true })).resolves.toBeUndefined()

    expect(state.studentId.value).toBe('')
    expect(applyViewState).toHaveBeenCalledWith('home')
    expect(storageMap.get('hbu_manual_logout')).toBe('true')
  })

  /**
   * P2-2（复验修复）：登出必须把在线会话态重置为未确认（`unknown`）。
   *
   * 旧实现只清 `studentId`，留下「sessionVerified=true 但身份为空」的不一致态：
   * 当前虽无身份可注入，但任何 `studentId` 回填（缓存 / 恢复链）都会立刻被当作
   * 「已确认会话」放行游戏身份。行为级断言直接驱动真实 `AuthCoordinator.handleLogout`。
   */
  it('登出后会话态重置为未确认（sessionVerified=false），不再遗留 online', async () => {
    storageMap.set('hbu_username', CURRENT_SID)
    const { runtime, state } = makeRuntime()
    const auth = createAuthCoordinator(runtime)

    // 前置：会话已确认（online）—— 这正是复验实测的不一致态起点
    expect(state.onlineSessionState.value).toBe('online')

    await expect(auth.handleLogout({ manual: false, reason: 'temp_session_expired' })).resolves.toBeUndefined()

    expect(state.onlineSessionState.value).toBe('unknown')
    // 与 auth store 的 sessionVerified 同源：unknown ⇒ 未确认 ⇒ 游戏侧不承认身份
    expect(state.onlineSessionState.value === 'online').toBe(false)
    expect(state.studentId.value).toBe('')
  })

  it('手动登出同样把会话态重置为未确认（两条登出路径不得分叉）', async () => {
    storageMap.set('hbu_username', CURRENT_SID)
    const { runtime, state } = makeRuntime()
    const auth = createAuthCoordinator(runtime)

    expect(state.onlineSessionState.value).toBe('online')
    await expect(auth.handleLogout({ manual: true })).resolves.toBeUndefined()
    expect(state.onlineSessionState.value).toBe('unknown')
  })
})
