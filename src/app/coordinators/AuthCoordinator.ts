/**
 * 认证 Coordinator（Phase 5：#574）
 *
 * 从 App.vue 迁出的登录成功 / 登出 / 登录模式切换 / 登录提示逻辑。
 * 登录态以 AuthStore 为生产状态源（studentId / userUuid / isLoggedIn），
 * 通过 state 读写，模板变量名保持不变。
 */
import axios from 'axios'
import type { AppRuntime, AuthCoordinator } from '../contracts/runtime'
import { API_BASE, LOGIN_METHOD_VIEW_KEY, LOGIN_METHOD_KEY, LOGIN_TEMP_FLAG_KEY, LOGOUT_REASON_KEY, SESSION_COOKIE_KEY, SESSION_COOKIE_TIME_KEY, LOGIN_SESSION_TOKEN_KEY } from '../state/constants'
import {
  clearScheduleRenderSnapshot,
  SCHEDULE_POPUP_PENDING_KEY,
  SCHEDULE_SWITCH_PENDING_KEY
} from '../../utils/schedule_prefetch.js'
import { fetchWithCache, clearUserScopedCaches, clearCacheByPrefix, setCachedData } from '../../utils/api.js'
import { clearDailyAccessGrant } from '../../utils/daily_access_key.js'
import { preservePortalRememberedPasswordOnLogout } from '../../utils/credential_storage.js'
import {
  TEST_ACCOUNT,
  clearTestAccountSession,
  isTestAccountSession
} from '../../utils/test_account.js'
import { getTestAccountGrades, seedTestAccountCaches } from '../../utils/test_account_fixtures.js'
import { clearWidgetForLogout } from '../../utils/widget_bridge'
import { startNotificationMonitor, stopNotificationMonitor } from '../../utils/notify_center.js'
import { ensureRememberedPasswordCached } from '../../utils/credential_storage.js'
import {
  resetCloudSyncCooldownForSession,
  runAutoCloudSyncAfterLogin
} from '../../utils/cloud_sync.js'
import {
  initUsageTracker,
  setUsageTrackingStudentId,
  scheduleUsageUpload
} from '../../utils/usage_tracker.js'
import { invokeNative, isTauriRuntime } from '../../platform/native'

export const createAuthCoordinator = (runtime: AppRuntime): AuthCoordinator => {
  const { state } = runtime
  const hasTauri = isTauriRuntime()

  const clearTestAccountRuntimeCaches = () => {
    clearCacheByPrefix(`grades:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`schedule:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`classroom:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`studentinfo:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`student_info:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`exams:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`ranking:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`calendar:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`academic:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`training:options:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`training:jys:${TEST_ACCOUNT.studentId}`)
    clearCacheByPrefix(`electricity:${TEST_ACCOUNT.studentId}`)
  }

  // 处理登录成功
  const handleLoginSuccess = (data: unknown) => {
    state.gradeData.value = data as unknown[]
    state.studentId.value = localStorage.getItem('hbu_username') || ''
    state.gradeTeacherCache.value = null
    state.gradeTeacherCacheSid.value = state.studentId.value
    // 跳转到 Dashboard 显示所有模块
    runtime.navigation.applyViewState('home')
    runtime.navigation.replaceHistorySnapshot('home')

    // 预取培养方案默认数据并落地缓存
    if (state.studentId.value) {
      runtime.session.markLoginSessionToken()
      if (isTestAccountSession()) {
        seedTestAccountCaches(setCachedData, state.studentId.value)
        state.gradeData.value = getTestAccountGrades()
      }

      void fetchWithCache<Record<string, any>>(`training:options:${state.studentId.value}`, async () => {
        const res = await axios.post<Record<string, any>>(`${API_BASE}/v2/training_plan/options`, {
          student_id: state.studentId.value
        })
        if (res.data?.success && !isTestAccountSession()) {
          localStorage.setItem('hbu_training_options', JSON.stringify({
            options: res.data.options || {},
            defaults: res.data.defaults || {}
          }))
        }
        return res.data
      })
    }

    localStorage.removeItem('hbu_manual_logout')
    localStorage.removeItem(LOGOUT_REASON_KEY)
    if (!isTestAccountSession()) {
      void runtime.session.persistSessionCookies()
      runtime.session.startSessionKeepAlive()
      runtime.session.startElectricityKeepAlive()
      if (state.studentId.value) {
        void ensureRememberedPasswordCached(state.studentId.value).catch((e) => {
          console.warn('[Session] 登录后缓存记住密码失败:', e)
        })
        startNotificationMonitor({ studentId: state.studentId.value }).catch((e) => {
          console.warn('[Notify] 启动通知监控失败:', e)
        })
        resetCloudSyncCooldownForSession(state.studentId.value)
        runAutoCloudSyncAfterLogin({
          studentId: state.studentId.value,
          latestGrades: Array.isArray(data) ? data : []
        }).catch((e) => {
          console.warn('[CloudSync] 登录后自动同步失败:', e)
        })
        setUsageTrackingStudentId(state.studentId.value)
        initUsageTracker({ studentId: state.studentId.value })
        scheduleUsageUpload({ studentId: state.studentId.value, reason: 'login', force: true })
      }
    }
    runtime.session.clearJwxtMaintenance()
    runtime.session.stopJwxtRecoveryPolling()
    // #520：登录成功后主动探测教务会话是否真正恢复（刷新学习通短票/CAS 桥接）。
    // 若探测失败，refreshSessionSilently 内部会自动进入后台重登 + 定时重试，
    // 避免用户重新登录后仍长期停留在「会话已过期」状态。
    if (!isTestAccountSession() && hasTauri) {
      window.setTimeout(() => {
        void runtime.session.refreshSessionSilently()
      }, 2500)
    }
    runtime.lifecycle.recoverViewportAfterTransition()
  }

  // 处理登出
  const handleLogout = async (options: Record<string, unknown> = {}) => {
    const payload = options && typeof options === 'object' ? options : {}
    const manual = payload.manual !== false
    const reason = String(payload.reason || '').trim()
    const notice = String(payload.notice || '').trim()
    const logoutSid = String(state.studentId.value || localStorage.getItem('hbu_username') || '').trim()
    const wasTestAccountSession = isTestAccountSession()

    if (!wasTestAccountSession) {
      try {
        await preservePortalRememberedPasswordOnLogout()
      } catch (e) {
        console.warn('[Session] 退出前同步记住密码失败:', e)
      }
    }

    if (manual && logoutSid) {
      clearUserScopedCaches(logoutSid)
      clearScheduleRenderSnapshot(logoutSid)
      window.dispatchEvent(new CustomEvent('hbu-session-logout', {
        detail: { studentId: logoutSid, manual: true }
      }))
    }

    runtime.navigation.applyViewState('home')
    state.gradeData.value = []
    state.gradeTeacherCache.value = null
    state.gradeTeacherCacheSid.value = ''
    state.studentId.value = ''
    state.userUuid.value = ''
    runtime.navigation.replaceHistorySnapshot('home')

    runtime.session.stopSessionKeepAlive()
    runtime.session.stopElectricityKeepAlive()
    void stopNotificationMonitor()
    runtime.session.stopJwxtRecoveryPolling()
    runtime.session.clearJwxtMaintenance()
    localStorage.removeItem(SESSION_COOKIE_KEY)
    localStorage.removeItem(SESSION_COOKIE_TIME_KEY)
    localStorage.removeItem(LOGIN_SESSION_TOKEN_KEY)
    localStorage.removeItem(LOGIN_METHOD_KEY)
    localStorage.removeItem(LOGIN_TEMP_FLAG_KEY)
    localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY)
    localStorage.removeItem(SCHEDULE_SWITCH_PENDING_KEY)
    clearDailyAccessGrant()
    if (reason) {
      localStorage.setItem(LOGOUT_REASON_KEY, reason)
    } else {
      localStorage.removeItem(LOGOUT_REASON_KEY)
    }
    if (manual) {
      localStorage.setItem('hbu_manual_logout', 'true')
    } else {
      localStorage.removeItem('hbu_manual_logout')
    }
    if (wasTestAccountSession) {
      clearTestAccountRuntimeCaches()
      clearTestAccountSession()
    } else {
      invokeNative('logout').catch(() => {})
    }
    if (notice) {
      window.setTimeout(() => {
        window.alert(notice)
      }, 80)
    }
    // Widget 快照属于真实账号设备状态，演示账号退出时不触发 native/plugin 清理。
    if (!wasTestAccountSession) {
      clearWidgetForLogout().catch(() => {})
    }
    // 清除跨天定时器
    runtime.notification.stopWidgetCrossDayTimer()
  }

  // 切换登录模式
  const handleSwitchLoginMode = (mode: string) => {
    state.loginMode.value = mode
    localStorage.setItem(LOGIN_METHOD_VIEW_KEY, mode)
  }

  const handleRequireLogin = () => {
    state.showLoginPrompt.value = true
    setTimeout(() => {
      state.showLoginPrompt.value = false
    }, 2200)
  }

  return {
    handleLoginSuccess,
    handleLogout,
    handleSwitchLoginMode,
    handleRequireLogin
  }
}
