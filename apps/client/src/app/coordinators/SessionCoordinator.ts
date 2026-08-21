/**
 * 会话 Coordinator（Phase 5：#574）
 *
 * 从 App.vue 迁出的会话恢复（cookie 桥接 / 自动重登 / 后台轮询）、
 * keep-alive 定时刷新、JWXT 维护状态与测试账号会话逻辑。
 * 登录态以 AuthStore 为生产状态源，通过 state 读写。
 */
import type { AppRuntime, SessionCoordinator } from '../contracts/runtime'
import {
  SESSION_COOKIE_KEY,
  SESSION_COOKIE_TIME_KEY,
  COOKIE_SNAPSHOT_KEY,
  LOGIN_SESSION_TOKEN_KEY,
  LOGIN_METHOD_KEY,
  LOGIN_TEMP_FLAG_KEY,
  LOGOUT_REASON_KEY,
  TEMP_SESSION_EXPIRED_REASON,
  JWXT_MAINTENANCE_KEY,
  JWXT_MAINTENANCE_TIME_KEY,
  JWXT_MAINTENANCE_HINT_KEY,
  JWXT_MAINTENANCE_DETAIL_KEY,
  JWXT_MAINTENANCE_PHASE_KEY,
  SESSION_REFRESH_INTERVAL,
  ELECTRICITY_REFRESH_INTERVAL,
  JWXT_RECOVERY_INTERVAL
} from '../state/constants'
import { saveRememberedUsername, clearRememberedUsername } from '../../utils/remembered_username'
import {
  TEST_ACCOUNT,
  isTestAccountSession
} from '../../utils/test_account.js'
import { getTestAccountGrades, seedTestAccountCaches } from '../../utils/test_account_fixtures.js'
import { loadChaoxingStoredPassword, loadPortalStoredPassword } from '../../composables/useSessionCredentials.js'
import { setCachedData } from '../../utils/api.js'
import { startNotificationMonitor } from '../../utils/notify_center.js'
import { resetCloudSyncCooldownForSession, runAutoCloudSyncAfterLogin } from '../../utils/cloud_sync.js'
import { invokeNative, isTauriRuntime } from '../../platform/native'
import { runExclusiveLogin, isLoginInFlight } from './sessionGate'

export const createSessionCoordinator = (runtime: AppRuntime): SessionCoordinator => {
  const { state } = runtime
  const hasTauri = isTauriRuntime()
  const invoke = <T = Record<string, any>>(command: string, args?: Record<string, unknown>) =>
    invokeNative<T>(command, args)

  // ── 桥接 / Cookie ────────────────────────────────────────────────────
  const bridgePost = async (path: string, payload: Record<string, unknown> = {}) => {
    const bridgeBase = hasTauri ? 'http://127.0.0.1:4399' : '/bridge'
    const res = await fetch(`${bridgeBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    })
    return res.json()
  }

  const restoreSessionViaBridge = async (cookies: string) => {
    const res = await bridgePost('/restore_session', { cookies })
    if (res?.success && res?.data?.student_id) {
      return res.data
    }
    throw new Error(res?.error?.message || '恢复会话失败')
  }

  const importCookiesViaBridge = async (snapshot: Record<string, unknown>) => {
    const res = await bridgePost('/import_cookies', snapshot || {})
    if (res?.success && res?.data?.user?.student_id) {
      return res.data.user
    }
    throw new Error(res?.error?.message || '导入 cookies 失败')
  }

  const persistSessionCookies = async () => {
    if (isTestAccountSession()) return
    if (!hasTauri) return
    try {
      const cookies = await invoke('get_cookies')
      if (cookies) {
        localStorage.setItem(SESSION_COOKIE_KEY, String(cookies))
        localStorage.setItem(SESSION_COOKIE_TIME_KEY, Date.now().toString())
      }
    } catch (e) {
      console.warn('[Session] 保存 cookies 失败:', e)
    }
  }

  // ── 会话状态判定 ─────────────────────────────────────────────────────
  const markLoginSessionToken = () => {
    try {
      localStorage.setItem(LOGIN_SESSION_TOKEN_KEY, `${Date.now()}`)
    } catch {
      // ignore
    }
  }

  const isTemporaryLoginSession = () => {
    const method = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
    const marked = localStorage.getItem(LOGIN_TEMP_FLAG_KEY) === '1'
    return marked || method.endsWith('_temp')
  }

  const isManualLogout = () => localStorage.getItem('hbu_manual_logout') === 'true'

  // ── 测试账号 ─────────────────────────────────────────────────────────
  const restoreTestAccountSession = () => {
    if (!isTestAccountSession()) return false
    const sid = TEST_ACCOUNT.studentId
    state.studentId.value = sid
    state.gradeData.value = getTestAccountGrades()
    state.gradeTeacherCache.value = null
    state.gradeTeacherCacheSid.value = sid
    saveRememberedUsername(sid)
    localStorage.setItem(LOGIN_METHOD_KEY, 'test_account')
    localStorage.setItem(LOGIN_TEMP_FLAG_KEY, '0')
    localStorage.removeItem('hbu_manual_logout')
    localStorage.removeItem(LOGOUT_REASON_KEY)
    seedTestAccountCaches(setCachedData, sid)
    state.onlineSessionState.value = 'online'
    clearJwxtMaintenance()
    stopJwxtRecoveryPolling()
    return true
  }

  // ── 本地身份恢复 ─────────────────────────────────────────────────────
  const restoreCachedIdentityFromLocal = async () => {
    if (isManualLogout()) return false
    const cachedSid = String(localStorage.getItem('hbu_username') || '').trim()
    if (!cachedSid) return false
    if (!/^\d{10}$/.test(cachedSid)) {
      clearRememberedUsername()
      return false
    }
    if (isTestAccountSession() && cachedSid === TEST_ACCOUNT.studentId) {
      return restoreTestAccountSession()
    }

    state.studentId.value = cachedSid
    // #659：仅恢复了本地缓存身份，在线会话尚未建立（与 isLoggedIn 解耦）
    state.onlineSessionState.value = 'cached_offline'
    // 异步通知 Rust 侧，不阻塞首屏
    if (hasTauri) {
      invoke('set_offline_user_context', {
        student_id: cachedSid,
        studentId: cachedSid
      }).catch((e) => {
        console.warn('[Session] 设置离线上下文失败:', e)
      })
    }
    return true
  }

  // ── 会话恢复 ─────────────────────────────────────────────────────────
  const tryRestoreSession = async () => {
    if (isTestAccountSession()) return restoreTestAccountSession()
    const cookies = localStorage.getItem(SESSION_COOKIE_KEY)
    if (!cookies && !hasTauri) {
      try {
        const snapshotRaw = localStorage.getItem(COOKIE_SNAPSHOT_KEY)
        if (!snapshotRaw) return false
        const snapshot = JSON.parse(snapshotRaw)
        const info = await importCookiesViaBridge(snapshot)
        if (info?.student_id) {
          state.studentId.value = info.student_id
          saveRememberedUsername(info.student_id)
          return true
        }
      } catch (e) {
        console.warn('[Session] 导入 cookies 失败:', e)
      }
      return false
    }
    if (!cookies) {
      if (isTemporaryLoginSession()) {
        void runtime.auth.handleLogout({
          manual: false,
          reason: TEMP_SESSION_EXPIRED_REASON,
          notice: '扫码临时登录会话已失效，请重新登录。'
        })
      }
      return false
    }

    try {
      const userInfo = hasTauri
        ? await invoke('restore_session', { cookies })
        : await restoreSessionViaBridge(cookies)
      if (userInfo?.student_id) {
        state.studentId.value = userInfo.student_id
        saveRememberedUsername(userInfo.student_id)
        return true
      }
    } catch (e) {
      if (isTemporaryLoginSession()) {
        console.warn('[Session] 临时登录恢复失败，自动退出:', e)
        void runtime.auth.handleLogout({
          manual: false,
          reason: TEMP_SESSION_EXPIRED_REASON,
          notice: '扫码临时登录会话已失效，请重新登录。'
        })
        return false
      }
      state.jwxtSessionLastError.value = formatSessionError(e)
      console.warn('[Session] 恢复会话失败，保留本地缓存以便离线展示:', e)
      // 仅在明确手动退出时清理；教务系统维护期间需要保留 cookies + 缓存兜底。
      if (isManualLogout()) {
        localStorage.removeItem(SESSION_COOKIE_KEY)
        localStorage.removeItem(SESSION_COOKIE_TIME_KEY)
      }
    }
    return false
  }

  const tryRestoreLatestSession = async () => {
    if (isTestAccountSession()) return restoreTestAccountSession()
    if (!hasTauri) return false
    if (isManualLogout()) {
      return false
    }
    try {
      const userInfo = await invoke('restore_latest_session')
      if (userInfo?.student_id) {
        state.studentId.value = userInfo.student_id
        saveRememberedUsername(userInfo.student_id)
        await persistSessionCookies()
        return true
      }
    } catch (e) {
      console.warn('[Session] 自动恢复历史会话失败:', e)
    }
    return false
  }

  // ── 自动重登 ─────────────────────────────────────────────────────────
  const getStoredPassword = () => loadPortalStoredPassword()
  const getStoredChaoxingPassword = () => loadChaoxingStoredPassword()

  const isLikelyStudentId = (value: unknown) => /^\d{10}$/.test(String(value || '').trim())

  const resolveAutoLoginStudentId = async (payload: Record<string, unknown>) => {
    const payloadSid = String(payload?.student_id || payload?.studentId || '').trim()
    if (isLikelyStudentId(payloadSid)) return payloadSid
    const cachedSid = String(localStorage.getItem('hbu_username') || '').trim()
    if (isLikelyStudentId(cachedSid)) return cachedSid
    try {
      const info = await invoke('fetch_student_info')
      const sid = String(
        info?.student_id || info?.studentId || info?.data?.student_id || info?.data?.xh || ''
      ).trim()
      if (isLikelyStudentId(sid)) return sid
    } catch (e) {
      console.warn('[Session] 自动重登学号解析失败:', e)
    }
    return ''
  }

  const attemptAutoRelogin = async () => {
    if (isTestAccountSession()) return restoreTestAccountSession()
    if (!hasTauri) return false
    if (isManualLogout()) {
      return false
    }
    const method = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
    if (method.startsWith('chaoxing_')) {
      const chaoxingCreds = await getStoredChaoxingPassword()
      if (!chaoxingCreds) return false
      try {
        // #659：自动重登与手动登录互斥单飞 —— 已有登录在飞时复用同一请求
        const payload = await runExclusiveLogin(() =>
          invoke('chaoxing_password_login', {
            account: chaoxingCreds.account,
            password: chaoxingCreds.password
          })
        )
        const sid = await resolveAutoLoginStudentId(payload as Record<string, unknown>)
        if (sid) {
          state.studentId.value = sid
          saveRememberedUsername(sid)
        } else {
          throw new Error('学习通自动登录未解析到 10 位学号')
        }
        await persistSessionCookies()
        return true
      } catch (e) {
        state.jwxtSessionLastError.value = formatSessionError(e)
        console.warn('[Session] 学习通自动登录失败:', e)
        return false
      }
    }

    const creds = await getStoredPassword()
    if (!creds) {
      state.jwxtSessionLastError.value = '本地未找到融合门户记住密码'
      return false
    }

    // #520：前端密钥环无凭据但后端 DB 无条件保存过密码（未勾记住密码也落库），
    // 直接调用后端 auto_relogin_from_stored 走完整 CAS 登录，立即恢复而非等轮询。
    if (creds.backendRestorable) {
      try {
        const userInfo = await runExclusiveLogin(() =>
          invoke('auto_relogin_from_stored', {
            studentId: creds.username
          })
        )
        await persistSessionCookies()
        const sid = String(
          userInfo?.student_id || userInfo?.studentId || creds.username || ''
        ).trim()
        if (sid) {
          state.studentId.value = sid
          saveRememberedUsername(sid)
        }
        return true
      } catch (e) {
        state.jwxtSessionLastError.value = formatSessionError(e)
        console.warn('[Session] 后端存储凭据自动登录失败:', e)
        return false
      }
    }

    const doLogin = () =>
      // #659：invoke('login') 走全局单飞门 —— 与手动登录互斥复用，
      // 绝不在已有登录请求在飞时再次触发
      runExclusiveLogin(async () => {
        const userInfo = await invoke('login', {
          username: creds.username,
          password: creds.password,
          captcha: '',
          lt: '',
          execution: ''
        })
        await persistSessionCookies()
        const sid = String(userInfo?.student_id || creds.username || '').trim()
        if (sid) {
          state.studentId.value = sid
          saveRememberedUsername(sid)
        }
        return userInfo
      })

    try {
      await doLogin()
      return true
    } catch (e) {
      // 检测登录冷却错误，等待后重试一次
      const msg = String((e as Error)?.message || e || '')
      const cooldownMatch = msg.match(/登录频率过高，请(\d+)秒后再试/)
      if (cooldownMatch) {
        const waitSec = parseInt(cooldownMatch[1], 10)
        if (waitSec > 0 && waitSec <= 120) {
          console.info(`[Session] 登录冷却中，${waitSec}秒后重试...`)
          state.jwxtSessionLastError.value = `登录冷却中，${waitSec} 秒后重试`
          markJwxtMaintenance(`登录冷却，${waitSec} 秒后自动重试…`, {
            phase: 'recovering',
            detail: state.jwxtSessionLastError.value
          })
          await new Promise((r) => window.setTimeout(r, (waitSec + 2) * 1000))
          try {
            await doLogin()
            return true
          } catch (e2) {
            state.jwxtSessionLastError.value = formatSessionError(e2)
            console.warn('[Session] 冷却后重试仍失败:', e2)
            return false
          }
        }
      }
      state.jwxtSessionLastError.value = formatSessionError(e)
      console.warn('[Session] 自动登录失败:', e)
      return false
    }
  }

  // 会话刷新错误分类：网络类错误 ≠ 会话过期，避免误报「会话已过期」诱导用户反复登录
  const classifySessionError = (err: unknown): 'network' | 'auth' | 'unknown' => {
    const raw = String((err as Error)?.message || err || '').toLowerCase()
    if (
      /error sending request|timed? ?out|timeout|connection|connect |network|econnrefused|econnreset|dns |resolve|socket|eof|broken pipe/i.test(raw)
    ) {
      return 'network'
    }
    if (/login|401|403|unauthorized|session|expired|cookie|not logged/i.test(raw)) {
      return 'auth'
    }
    return 'unknown'
  }

  // #587：网络/DNS 错误 ≠ 登录失败，提示文案区分，避免误导用户反复登录
  const sessionFailureHint = (fallback: string): string => {
    if (classifySessionError(state.jwxtSessionLastError.value) === 'network') {
      return '网络异常，无法连接教务系统，稍后自动重试。'
    }
    return fallback
  }

  // #623：敏感 scope（student.identity）授权前的在线会话校验。
  // 与 refreshSessionSilently 不同：返回是否验证成功（true = 学校会话在线可验证），
  // 失败时不触发自动重登/维护横幅风暴（由 Identity 流程决定后续 restore/login）。
  const refreshSessionVerified = async (options: { quiet?: boolean } = {}): Promise<boolean> => {
    void options
    if (isTestAccountSession()) return true
    const cookies = localStorage.getItem(SESSION_COOKIE_KEY)
    if (!cookies) return false
    if (!hasTauri) return false
    try {
      await invoke('refresh_session')
      await persistSessionCookies()
      return true
    } catch (e) {
      state.jwxtSessionLastError.value = formatSessionError(e)
      return false
    }
  }

  const refreshSessionSilently = async (options: { quiet?: boolean } = {}) => {
    if (isTestAccountSession()) return
    const cookies = localStorage.getItem(SESSION_COOKIE_KEY)
    if (!cookies) return
    if (!hasTauri) return

    try {
      await invoke('refresh_session')
      await persistSessionCookies()
    } catch (e) {
      if (isTemporaryLoginSession()) {
        console.warn('[Session] 临时登录会话已失效，自动退出:', e)
        void runtime.auth.handleLogout({
          manual: false,
          reason: TEMP_SESSION_EXPIRED_REASON,
          notice: '扫码临时登录会话已失效，请重新登录。'
        })
        return
      }
      state.jwxtSessionLastError.value = formatSessionError(e)
      const kind = classifySessionError(e)
      if (kind === 'network') {
        // 网络异常 ≠ 会话过期：静默记录，由 keep-alive 下轮重试，不弹「会话失效」横幅
        console.warn('[Session] 会话刷新网络异常，稍后自动重试:', e)
        return
      }
      if (options.quiet) {
        // 登录成功后的首次探测：失败时静默后台恢复，不立即弹「会话失效」横幅（用户刚登录，勿误导）
        console.warn('[Session] 登录后会话探测未通过，静默后台恢复:', e)
        const relogged = await attemptAutoRelogin()
        if (relogged) {
          clearJwxtMaintenance()
          startSessionKeepAlive()
          startElectricityKeepAlive()
          await persistSessionCookies()
          notifySessionOnline('auto-relogin')
        }
        return
      }
      console.warn('[Session] 会话刷新失败，尝试自动登录:', e)
      markJwxtMaintenance('会话失效，正在后台自动登录…', {
        phase: 'recovering',
        detail: state.jwxtSessionLastError.value
      })
      const relogged = await attemptAutoRelogin()
      if (!relogged) {
        stopSessionKeepAlive()
        markJwxtMaintenance(sessionFailureHint('后台自动登录未成功，将定时重试。当前为缓存数据。'), {
          phase: 'failed',
          detail: state.jwxtSessionLastError.value
        })
        startJwxtRecoveryPolling()
      } else {
        clearJwxtMaintenance()
        // 后台重登录成功后自动上传成绩和设置到云端（不含自定义课程）
        if (state.studentId.value) {
          resetCloudSyncCooldownForSession(state.studentId.value)
          runAutoCloudSyncAfterLogin({
            studentId: state.studentId.value,
            latestGrades: []
          }).catch((e) => {
            console.warn('[CloudSync] 后台重登录后自动同步失败:', e)
          })
        }
      }
    }
  }

  // ── keep-alive 定时器 ────────────────────────────────────────────────
  const startSessionKeepAlive = () => {
    stopSessionKeepAlive()
    state.mutable.sessionKeepAliveTimer = window.setInterval(refreshSessionSilently, SESSION_REFRESH_INTERVAL)
  }

  const stopSessionKeepAlive = () => {
    if (state.mutable.sessionKeepAliveTimer) {
      window.clearInterval(state.mutable.sessionKeepAliveTimer)
      state.mutable.sessionKeepAliveTimer = null
    }
  }

  const startElectricityKeepAlive = () => {
    stopElectricityKeepAlive()
    state.mutable.electricityKeepAliveTimer = window.setInterval(async () => {
      try {
        await invoke('refresh_electricity_token')
      } catch (e) {
        console.warn('[Electricity] Token refresh failed:', e)
      }
    }, ELECTRICITY_REFRESH_INTERVAL)
  }

  const stopElectricityKeepAlive = () => {
    if (state.mutable.electricityKeepAliveTimer) {
      window.clearInterval(state.mutable.electricityKeepAliveTimer)
      state.mutable.electricityKeepAliveTimer = null
    }
  }

  // ── 后台恢复轮询 ─────────────────────────────────────────────────────
  const stopJwxtRecoveryPolling = () => {
    if (state.mutable.jwxtRecoveryTimer) {
      window.clearInterval(state.mutable.jwxtRecoveryTimer)
      state.mutable.jwxtRecoveryTimer = null
    }
    state.mutable.jwxtRecoveryInFlight = false
  }

  const attemptOnlineRecovery = async (options: { silent?: boolean } = {}) => {
    if (isTestAccountSession()) return restoreTestAccountSession()
    if (!hasTauri || isManualLogout()) return false
    // #659：手动/自动登录已在飞时，恢复链让路（下轮轮询再试），
    // 避免「后台恢复」与「正在进行的登录」并发双请求
    if (isLoginInFlight()) return false
    if (state.mutable.jwxtRecoveryInFlight) return false
    state.mutable.jwxtRecoveryInFlight = true
    // 在线会话状态：进入恢复即明确「正在后台恢复」（轮询 silent 也如实记录）
    state.onlineSessionState.value = 'recovering'
    if (!options.silent) {
      state.jwxtRecoveryPhase.value = 'recovering'
    }
    try {
      let restored = await tryRestoreSession()
      if (!restored) {
        restored = await tryRestoreLatestSession()
      }
      let relogged = false
      if (!restored && !isTemporaryLoginSession()) {
        relogged = await attemptAutoRelogin()
      }
      const success = restored || relogged
      if (success) {
        clearJwxtMaintenance()
        startSessionKeepAlive()
        startElectricityKeepAlive()
        if (state.studentId.value) {
          startNotificationMonitor({ studentId: state.studentId.value }).catch((e) => {
            console.warn('[Notify] 恢复后启动通知监控失败:', e)
          })
        }
        await persistSessionCookies()
        stopJwxtRecoveryPolling()
        notifySessionOnline(relogged ? 'auto-relogin' : 'session-restore')
        // 后台恢复/重登录成功后自动上传成绩和设置到云端（不含自定义课程）
        if (relogged && state.studentId.value) {
          resetCloudSyncCooldownForSession(state.studentId.value)
          runAutoCloudSyncAfterLogin({
            studentId: state.studentId.value,
            latestGrades: []
          }).catch((e) => {
            console.warn('[CloudSync] 恢复后自动同步失败:', e)
          })
        }
      } else if (!options.silent) {
        markJwxtMaintenance('会话暂不可用，当前展示缓存数据。', {
          phase: 'failed',
          detail: state.jwxtSessionLastError.value || '恢复未成功'
        })
      }
      return success
    } catch (e) {
      state.jwxtSessionLastError.value = formatSessionError(e)
      if (!options.silent) {
        markJwxtMaintenance('恢复会话失败', {
          phase: 'failed',
          detail: state.jwxtSessionLastError.value
        })
      }
      return false
    } finally {
      state.mutable.jwxtRecoveryInFlight = false
    }
  }

  const startJwxtRecoveryPolling = () => {
    if (isTestAccountSession()) return
    if (isManualLogout() || !state.studentId.value) return
    stopJwxtRecoveryPolling()
    state.mutable.jwxtRecoveryTimer = window.setInterval(() => {
      attemptOnlineRecovery({ silent: true }).then((ok) => {
        if (ok) return
        markJwxtMaintenance(sessionFailureHint('后台自动登录仍未成功，将继续重试。'), {
          phase: 'failed',
          detail: state.jwxtSessionLastError.value || '恢复失败'
        })
      }).catch((e) => {
        console.warn('[Session] 教务恢复轮询失败:', e)
        state.jwxtSessionLastError.value = formatSessionError(e)
        markJwxtMaintenance('后台恢复异常', {
          phase: 'failed',
          detail: state.jwxtSessionLastError.value
        })
      })
    }, JWXT_RECOVERY_INTERVAL)
  }

  // ── 配置访问守卫 ─────────────────────────────────────────────────────
  const ensureConfigAccess = () => {
    if (state.currentView.value === 'config' && !state.isConfigAdmin.value) {
      runtime.navigation.applyViewState('me')
      runtime.navigation.replaceHistorySnapshot('me')
    }
  }

  // ── JWXT 维护状态 ────────────────────────────────────────────────────
  const formatCheckTime = (ts = Date.now()) => {
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return ''
    }
  }

  const normalizeRecoveryPhase = (phase: unknown, fallback = 'maintenance') => {
    const p = String(phase || '').trim()
    if (['idle', 'recovering', 'failed', 'need_login', 'maintenance'].includes(p)) return p
    return fallback
  }

  const markJwxtMaintenance = (hint = '', options: Record<string, unknown> = {}) => {
    if (!state.studentId.value && !options.force) return
    const detail = String(options.detail || state.jwxtSessionLastError.value || '').trim()
    const phase = normalizeRecoveryPhase(options.phase, detail ? 'failed' : 'maintenance')
    // #659：维护/恢复相位与在线会话状态联动
    if (phase === 'recovering') {
      state.onlineSessionState.value = 'recovering'
    } else if (phase === 'need_login') {
      state.onlineSessionState.value = 'needs_login'
    } else if (phase === 'failed') {
      // 在线会话明确未恢复：只要本地身份仍在，就如实标记「缓存离线」
      state.onlineSessionState.value = state.studentId.value ? 'cached_offline' : 'unknown'
    }
    state.jwxtMaintenanceMode.value = true
    state.jwxtLastCheckTime.value = formatCheckTime()
    state.jwxtMaintenanceHint.value = hint || '教务系统正在维护或暂时不可用，当前为缓存数据。'
    state.jwxtMaintenanceDetail.value = detail
    state.jwxtRecoveryPhase.value = phase
    if (detail) state.jwxtSessionLastError.value = detail
    try {
      localStorage.setItem(JWXT_MAINTENANCE_KEY, '1')
      localStorage.setItem(JWXT_MAINTENANCE_TIME_KEY, String(Date.now()))
      if (state.jwxtMaintenanceHint.value) {
        localStorage.setItem(JWXT_MAINTENANCE_HINT_KEY, state.jwxtMaintenanceHint.value)
      }
      if (detail) {
        localStorage.setItem(JWXT_MAINTENANCE_DETAIL_KEY, detail.slice(0, 800))
      }
      localStorage.setItem(JWXT_MAINTENANCE_PHASE_KEY, phase)
    } catch {
      // ignore
    }
  }

  const clearJwxtMaintenance = () => {
    // #659：维护解除时校正在线会话状态 ——
    // 本地身份存在且已脱离 unknown（曾恢复过缓存/曾在线）→ 视为在线会话建立；
    // 身份已清空（登出）→ 回到 unknown
    if (state.studentId.value && state.onlineSessionState.value !== 'unknown') {
      state.onlineSessionState.value = 'online'
    } else if (!state.studentId.value) {
      state.onlineSessionState.value = 'unknown'
    }
    state.jwxtMaintenanceMode.value = false
    state.jwxtMaintenanceHint.value = ''
    state.jwxtLastCheckTime.value = ''
    state.jwxtMaintenanceDetail.value = ''
    state.jwxtSessionLastError.value = ''
    state.jwxtRecoveryPhase.value = 'idle'
    try {
      localStorage.removeItem(JWXT_MAINTENANCE_KEY)
      localStorage.removeItem(JWXT_MAINTENANCE_TIME_KEY)
      localStorage.removeItem(JWXT_MAINTENANCE_HINT_KEY)
      localStorage.removeItem(JWXT_MAINTENANCE_DETAIL_KEY)
      localStorage.removeItem(JWXT_MAINTENANCE_PHASE_KEY)
    } catch {
      // ignore
    }
  }

  const notifySessionOnline = (source = 'recovery') => {
    if (!state.studentId.value) return
    // #659：会话在线信号是「在线会话已建立」的权威状态源
    state.onlineSessionState.value = 'online'
    clearJwxtMaintenance()
    window.dispatchEvent(new CustomEvent('hbu-session-online', {
      detail: {
        studentId: state.studentId.value,
        source
      }
    }))
  }

  const syncJwxtMaintenanceFromStorage = () => {
    const active = localStorage.getItem(JWXT_MAINTENANCE_KEY) === '1'
    if (!active) {
      state.jwxtMaintenanceMode.value = false
      state.jwxtMaintenanceHint.value = ''
      state.jwxtLastCheckTime.value = ''
      state.jwxtMaintenanceDetail.value = ''
      state.jwxtRecoveryPhase.value = 'idle'
      return
    }

    state.jwxtMaintenanceMode.value = true
    const hint = String(localStorage.getItem(JWXT_MAINTENANCE_HINT_KEY) || '').trim()
    state.jwxtMaintenanceHint.value = hint || '教务系统正在维护或暂时不可用，当前为缓存数据。'
    state.jwxtMaintenanceDetail.value = String(localStorage.getItem(JWXT_MAINTENANCE_DETAIL_KEY) || '').trim()
    state.jwxtRecoveryPhase.value = normalizeRecoveryPhase(
      localStorage.getItem(JWXT_MAINTENANCE_PHASE_KEY),
      'maintenance'
    )
    const ts = Number(localStorage.getItem(JWXT_MAINTENANCE_TIME_KEY) || Date.now())
    state.jwxtLastCheckTime.value = formatCheckTime(ts)
  }

  const handleJwxtMaintenanceEvent = (event: unknown) => {
    const detail = (event as { detail?: Record<string, unknown> })?.detail || {}
    if (detail.active) {
      const hint = String(detail.hint || '').trim()
      markJwxtMaintenance(hint, {
        detail: detail.detail || detail.error || '',
        phase: detail.phase || 'maintenance'
      })
      if (state.studentId.value && !isManualLogout()) {
        startJwxtRecoveryPolling()
      }
      return
    }
    clearJwxtMaintenance()
    stopJwxtRecoveryPolling()
  }

  const formatSessionError = (err: unknown) => {
    const raw = String((err as Error)?.message || err || '').trim()
    if (!raw) return ''
    // 截断过长堆栈，保留用户可读摘要
    const firstLine = raw.split(/[\r\n]/)[0] || raw
    return firstLine.length > 280 ? `${firstLine.slice(0, 280)}…` : firstLine
  }

  const handleRetrySessionRecovery = async () => {
    if (isManualLogout() || !state.studentId.value) {
      runtime.auth.handleRequireLogin()
      return
    }
    state.jwxtRecoveryPhase.value = 'recovering'
    markJwxtMaintenance('正在后台恢复会话…', {
      phase: 'recovering',
      detail: state.jwxtSessionLastError.value || ''
    })
    try {
      const ok = await attemptOnlineRecovery({ silent: false })
      if (!ok) {
        const hasPortal = !!(await getStoredPassword().catch(() => null))
        const hasCx = !!(await getStoredChaoxingPassword().catch(() => null))
        if (!hasPortal && !hasCx) {
          markJwxtMaintenance('会话已过期，本地未保存密码，请手动登录融合门户。', {
            phase: 'need_login',
            detail: state.jwxtSessionLastError.value || '无可用记住密码'
          })
        } else {
          markJwxtMaintenance(sessionFailureHint('自动登录未成功，将继续在后台重试。当前展示缓存数据。'), {
            phase: 'failed',
            detail: state.jwxtSessionLastError.value || '恢复失败'
          })
          startJwxtRecoveryPolling()
        }
      }
    } catch (e) {
      state.jwxtSessionLastError.value = formatSessionError(e)
      markJwxtMaintenance('恢复会话时出错，请稍后重试或手动登录。', {
        phase: 'failed',
        detail: state.jwxtSessionLastError.value
      })
    }
  }

  return {
    restoreCachedIdentityFromLocal,
    tryRestoreSession,
    tryRestoreLatestSession,
    attemptAutoRelogin,
    attemptOnlineRecovery,
    refreshSessionSilently,
    refreshSessionVerified,
    persistSessionCookies,
    startSessionKeepAlive,
    stopSessionKeepAlive,
    startElectricityKeepAlive,
    stopElectricityKeepAlive,
    markLoginSessionToken,
    isTemporaryLoginSession,
    isManualLogout,
    restoreTestAccountSession,
    ensureConfigAccess,
    startJwxtRecoveryPolling,
    stopJwxtRecoveryPolling,
    markJwxtMaintenance,
    clearJwxtMaintenance,
    syncJwxtMaintenanceFromStorage,
    handleJwxtMaintenanceEvent,
    handleRetrySessionRecovery,
    notifySessionOnline,
    formatSessionError
  }
}
