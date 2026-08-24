import { onBeforeUnmount, onMounted, nextTick, watch } from 'vue'
import {
  useAuthStore,
  useGradeStore,
  useLifecycleStore,
  useNavigationStore,
  useUpdateStore
} from '../stores'
import type { AppHandlers, AppRuntime, AppStores } from './contracts/runtime'
import { createAppState } from './state/appState'
import { createNavigationCoordinator } from './coordinators/NavigationCoordinator'
import { createSessionCoordinator } from './coordinators/SessionCoordinator'
import { createAuthCoordinator } from './coordinators/AuthCoordinator'
import { createLifecycleCoordinator } from './coordinators/LifecycleCoordinator'
import { createGradeCoordinator } from './coordinators/GradeCoordinator'
import { createUpdateCoordinator } from './coordinators/UpdateCoordinator'
import { createRemoteConfigCoordinator } from './coordinators/RemoteConfigCoordinator'
import { createNotificationCoordinator } from './coordinators/NotificationCoordinator'
import { createIdentityCoordinator } from './coordinators/IdentityCoordinator'
import { isIOSLike as detectIOSLike } from '../platform/runtime'
import { isTestAccountSession } from '../utils/test_account.js'
import { startNotificationMonitor, stopNotificationMonitor } from '../utils/notify_center.js'
import { tryWriteSnapshotFromCache } from '../utils/widget_bridge'
import { initUsageTracker } from '../utils/usage_tracker.js'
import { startUsageUploadScheduler, stopUsageUploadScheduler } from '../utils/usage_uploader.js'
import { runCampusNetworkAutoLogin } from '../utils/campus_network_service'
import { installHomeLayoutDiagnosticsErrorCapture, collectHomeLayoutDiagnostics } from '../utils/home_layout_diagnostics'
import { showToast } from '../utils/toast'
import { markBootMetric } from '../utils/boot_metrics.js'
import { ensureRememberedPasswordCached } from '../utils/credential_storage.js'
import { loadChaoxingStoredPassword, loadPortalStoredPassword } from '../composables/useSessionCredentials.js'
import { REMOTE_CONFIG_UPDATED_EVENT } from '../utils/remote_config.js'
import {
  HOME_LAYOUT_DEBUG_HIDDEN_KEY,
  JWXT_MAINTENANCE_EVENT,
  REMOTE_CONFIG_MODE_EVENT
} from './state/constants'

export const useAppRuntime = () => {
  const stores: AppStores = {
    auth: useAuthStore(),
    navigation: useNavigationStore(),
    lifecycle: useLifecycleStore(),
    grade: useGradeStore(),
    update: useUpdateStore()
  }
  const runtime = {} as AppRuntime
  runtime.stores = stores
  runtime.state = createAppState(stores)
  runtime.navigation = createNavigationCoordinator(runtime)
  runtime.session = createSessionCoordinator(runtime)
  runtime.auth = createAuthCoordinator(runtime)
  runtime.lifecycle = createLifecycleCoordinator(runtime)
  runtime.grade = createGradeCoordinator(runtime)
  runtime.update = createUpdateCoordinator(runtime)
  runtime.remoteConfig = createRemoteConfigCoordinator(runtime)
  runtime.notification = createNotificationCoordinator(runtime)
  runtime.identity = createIdentityCoordinator(runtime)

  const { state } = runtime
  const startup = runtime.navigation.readStartupSnapshot()
  state.currentView.value = startup.initialView
  state.activeTab.value = startup.initialTab
  state.currentModule.value = startup.initialModule
  if (startup.bootStudentIdHint && !state.studentId.value) state.studentId.value = startup.bootStudentIdHint
  if (startup.skipSplashForFastScheduleBoot) state.showSplash.value = false
  state.moduleHostSession.value = runtime.navigation.readModuleHostSession()

  const handleSplashDismissed = () => {
    state.showSplash.value = false
    runtime.navigation.markBootMetric('splash_dismissed', {
      current_view: state.currentView.value,
      fast_schedule_boot: startup.skipSplashForFastScheduleBoot
    })
  }

  const dismissSplash = (reason = '') => {
    try {
      ;(state.splashRef.value as { dismiss?: () => void } | null)?.dismiss?.()
    } catch (error) {
      console.warn('[Boot] splash dismiss failed:', error)
    }
    handleSplashDismissed()
    if (reason) console.info('[Boot] dismissSplash:', reason)
  }

  const openWorkspaceLayoutEditor = (tab = 'home') => {
    state.workspaceLayoutEditorTab.value = tab === 'notifications' ? 'notifications' : 'home'
    state.showWorkspaceLayoutEditor.value = true
  }
  const closeWorkspaceLayoutEditor = () => {
    state.showWorkspaceLayoutEditor.value = false
  }

  const refreshHomeLayoutDebugReport = () => {
    state.homeLayoutDebugReport.value = collectHomeLayoutDiagnostics()
  }
  const copyHomeLayoutDebugReport = async () => {
    refreshHomeLayoutDebugReport()
    try {
      await navigator.clipboard.writeText(state.homeLayoutDebugReport.value)
      showToast('调试信息已复制', 'success')
    } catch {
      showToast('复制失败，请手动复制', 'error')
    }
  }
  const toggleHomeLayoutDebugReport = () => {
    state.homeLayoutDebugExpanded.value = !state.homeLayoutDebugExpanded.value
    if (state.homeLayoutDebugExpanded.value) refreshHomeLayoutDebugReport()
  }
  const hideHomeLayoutDebug = () => {
    state.homeLayoutDebugHidden.value = true
    localStorage.setItem(HOME_LAYOUT_DEBUG_HIDDEN_KEY, '1')
  }

  runtime.handlers = {
    handleNavigate: runtime.navigation.handleNavigate,
    handleLogout: runtime.auth.handleLogout,
    handleRequireLogin: runtime.auth.handleRequireLogin,
    handleRetrySessionRecovery: runtime.session.handleRetrySessionRecovery,
    handleLoginSuccess: runtime.auth.handleLoginSuccess,
    handleSwitchLoginMode: runtime.auth.handleSwitchLoginMode,
    handleCheckUpdate: runtime.update.handleCheckUpdate,
    handleOpenOfficial: runtime.navigation.handleOpenOfficial,
    handleOpenFeedback: runtime.navigation.handleOpenFeedback,
    handleOpenConfig: runtime.navigation.handleOpenConfig,
    handleOpenSettings: runtime.navigation.handleOpenSettings,
    handleBackToDashboard: runtime.navigation.handleBackToDashboard,
    handleBackToMe: runtime.navigation.handleBackToMe,
    handleBackToMoreCenter: runtime.navigation.handleBackToMoreCenter,
    handleRefreshGrades: runtime.grade.handleRefreshGrades,
    handleTabChange: runtime.navigation.handleTabChange,
    handleSplashDismissed,
    handleForceUpdate: runtime.update.handleForceUpdate,
    openAnnouncement: runtime.remoteConfig.openAnnouncement,
    openWorkspaceLayoutEditor,
    closeWorkspaceLayoutEditor,
    closeAnnouncement: runtime.remoteConfig.closeAnnouncement,
    confirmBlockingAnnouncement: runtime.remoteConfig.confirmBlockingAnnouncement,
    handleContentClick: runtime.remoteConfig.handleContentClick,
    handleExternalOpen: runtime.remoteConfig.handleExternalOpen,
    hideHomeLayoutDebug,
    copyHomeLayoutDebugReport,
    toggleHomeLayoutDebugReport,
    closeDailyAccessDialog: runtime.navigation.closeDailyAccessDialog,
    handleDailyAccessInput: runtime.navigation.handleDailyAccessInput,
    submitDailyAccessKey: runtime.navigation.submitDailyAccessKey,
    cancelExitDialog: runtime.navigation.cancelExitDialog,
    confirmExitDialog: runtime.navigation.confirmExitDialog
  } satisfies AppHandlers

  const handleGlobalLinkClick = (event: Event) => {
    void runtime.remoteConfig.handleContentClick(event)
  }
  const handlePopState = () => void runtime.navigation.handlePopState()
  const handleMaintenanceEvent = (event: Event) => runtime.session.handleJwxtMaintenanceEvent(event)
  const handleRemoteModeEvent = () => runtime.remoteConfig.handleRemoteConfigModeChanged()
  const handleRemoteUpdatedEvent = () => runtime.remoteConfig.handleRemoteConfigUpdated()

  watch(state.currentView, (view, previous) => {
    runtime.navigation.handleViewChanged(view, previous)
    nextTick(() => runtime.lifecycle.scheduleViewportUpdate())
  })

  onMounted(async () => {
    console.time('[Boot] total')
    const splashFailsafe = window.setTimeout(() => {
      if (state.showSplash.value) dismissSplash('failsafe-2.5s')
      state.mutable.appBootstrapped = true
      // #621：bootstrap 完成后冲刷冷启动深链缓冲（内存 PendingExternalIntent -> Identity 调度）
      runtime.identity.flushPendingIntents()
    }, 2500)

    document.addEventListener('click', handleGlobalLinkClick, true)
    window.addEventListener('popstate', handlePopState)
    window.addEventListener(JWXT_MAINTENANCE_EVENT, handleMaintenanceEvent)
    window.addEventListener(REMOTE_CONFIG_MODE_EVENT, handleRemoteModeEvent)
    window.addEventListener(REMOTE_CONFIG_UPDATED_EVENT, handleRemoteUpdatedEvent)
    state.mutable.removeHomeLayoutDiagnosticsErrorCapture = installHomeLayoutDiagnosticsErrorCapture()
    runtime.lifecycle.installResumeListeners()
    runtime.lifecycle.installCapacitorStateListener()
    runtime.lifecycle.scheduleViewportUpdate()
    runtime.notification.installWidgetDeeplinkListeners()
    void runtime.notification.installNotificationActionListener()
    runtime.session.clearJwxtMaintenance()

    let cachedIdentity = false
    try {
      cachedIdentity = await runtime.session.restoreCachedIdentityFromLocal()
      await runtime.navigation.syncFromHash()
    } catch (error) {
      console.warn('[Boot] local bootstrap failed:', error)
    }
    dismissSplash(cachedIdentity ? 'cached-identity' : 'enter-ui-first')
    state.mutable.appBootstrapped = true
    // #621：bootstrap 完成后冲刷冷启动深链缓冲（幂等：无缓冲时直接返回）
    runtime.identity.flushPendingIntents()
    runtime.navigation.replaceHistorySnapshot(state.currentView.value)
    runtime.session.ensureConfigAccess()
    window.clearTimeout(splashFailsafe)

    const restoreTask = (async () => {
      if (isTestAccountSession()) {
        return { restored: runtime.session.restoreTestAccountSession(), relogged: false }
      }
      let restored = await runtime.session.tryRestoreSession()
      if (!restored) restored = await runtime.session.tryRestoreLatestSession()
      let relogged = false
      if (!restored && !runtime.session.isTemporaryLoginSession()) {
        relogged = await runtime.session.attemptAutoRelogin()
      }
      return { restored, relogged }
    })()
    void restoreTask
      .then(async (result) => {
        const { restored, relogged } = result || { restored: false, relogged: false }
        if (!restored && !relogged) {
          // #355：长闲/会话失效时保留首页缓存身份，后台静默恢复；禁止强制踢回登录页
          if (!isTestAccountSession() && (cachedIdentity || state.studentId.value)) {
            let hasCreds = false
            try {
              const portalCreds = await loadPortalStoredPassword()
              const cxCreds = await loadChaoxingStoredPassword()
              hasCreds = !!(portalCreds || cxCreds)
            } catch (e) {
              console.warn('[Session] 检查本地凭据失败:', e)
              hasCreds = false
            }
            if (hasCreds) {
              runtime.session.markJwxtMaintenance('会话需恢复，正在后台自动登录…', {
                phase: 'recovering',
                detail: state.jwxtSessionLastError.value || 'cookie 已失效，使用记住密码重登'
              })
              runtime.session.startJwxtRecoveryPolling()
              runtime.session.attemptOnlineRecovery({ silent: true }).then((ok) => {
                if (ok) return
                runtime.session.markJwxtMaintenance('自动登录未成功，将继续后台重试。当前展示缓存数据。', {
                  phase: 'failed',
                  detail: state.jwxtSessionLastError.value || '恢复失败'
                })
              }).catch((e) => {
                state.jwxtSessionLastError.value = runtime.session.formatSessionError(e)
                runtime.session.markJwxtMaintenance('后台恢复异常，将定时重试。', {
                  phase: 'failed',
                  detail: state.jwxtSessionLastError.value
                })
              })
            } else {
              console.warn('[Session] 会话失效且无记住密码，首页提示手动登录（#355，不再强制 logout）')
              runtime.session.markJwxtMaintenance(
                '登录状态已失效，本地未找到可用密码。请手动登录融合门户以同步最新数据；此前缓存仍可查看。',
                {
                  phase: 'need_login',
                  detail: state.jwxtSessionLastError.value || '无记住密码，无法后台自动登录'
                }
              )
            }
          }
          return
        }
        runtime.session.clearJwxtMaintenance()
        runtime.session.stopJwxtRecoveryPolling()
        if (!isTestAccountSession()) {
          runtime.session.startSessionKeepAlive()
          runtime.session.startElectricityKeepAlive()
          if (state.studentId.value) {
            runtime.session.markLoginSessionToken()
            void ensureRememberedPasswordCached(state.studentId.value).catch((e) => {
              console.warn('[Session] 启动后缓存记住密码失败:', e)
            })
            void startNotificationMonitor({ studentId: state.studentId.value })
          }
          runtime.session.notifySessionOnline(relogged ? 'boot-auto-relogin' : 'boot-session-restore')
        }
      })
      .catch((error) => console.warn('[Boot] session restore failed:', error))

    void runtime.remoteConfig.applyRemoteConfig().finally(runtime.remoteConfig.startRemoteConfigRefresh)
    void runtime.remoteConfig.primeOcrEndpointFromCache()
    void runtime.navigation.installCloseInterceptor()
    if (state.studentId.value && !isTestAccountSession()) {
      void tryWriteSnapshotFromCache(state.studentId.value)
      runtime.notification.scheduleWidgetCrossDayTimer()
    }
    window.setTimeout(() => void runtime.update.autoCheckUpdate(), 1500)
    initUsageTracker({ studentId: state.studentId.value })
    startUsageUploadScheduler(() => state.studentId.value)
    void runCampusNetworkAutoLogin({ studentId: state.studentId.value, reason: 'app-boot' })
    markBootMetric('app_runtime_ready', { current_view: state.currentView.value })
    console.timeEnd('[Boot] total')
  })

  onBeforeUnmount(() => {
    stopUsageUploadScheduler()
    document.removeEventListener('click', handleGlobalLinkClick, true)
    window.removeEventListener('popstate', handlePopState)
    window.removeEventListener(JWXT_MAINTENANCE_EVENT, handleMaintenanceEvent)
    window.removeEventListener(REMOTE_CONFIG_MODE_EVENT, handleRemoteModeEvent)
    window.removeEventListener(REMOTE_CONFIG_UPDATED_EVENT, handleRemoteUpdatedEvent)
    runtime.lifecycle.dispose()
    runtime.session.stopSessionKeepAlive()
    runtime.session.stopElectricityKeepAlive()
    runtime.session.stopJwxtRecoveryPolling()
    runtime.remoteConfig.stopRemoteConfigRefresh()
    runtime.notification.stopWidgetCrossDayTimer()
    runtime.identity.dispose()
    if (typeof state.mutable.removeNotificationActionListener === 'function') {
      state.mutable.removeNotificationActionListener()
      state.mutable.removeNotificationActionListener = null
    }
    void stopNotificationMonitor()
    runtime.grade.clearGradeRealtimeRetry()
  })

  return {
    runtime,
    state,
    handlers: runtime.handlers,
    isIOSLike: detectIOSLike(),
    isTestAccountSession
  }
}
