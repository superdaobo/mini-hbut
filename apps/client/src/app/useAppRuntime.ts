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
import { reconcileGameIdentityOnBoot } from '../utils/api.js'
import { startNotificationMonitor, stopNotificationMonitor } from '../utils/notify_center.js'
import { tryWriteSnapshotFromCache } from '../utils/widget_bridge'
import { initUsageTracker } from '../utils/usage_tracker.js'
import { startUsageUploadScheduler, stopUsageUploadScheduler } from '../utils/usage_uploader.js'
import { runCampusNetworkAutoLogin } from '../utils/campus_network_service'
import { installHomeLayoutDiagnosticsErrorCapture, collectHomeLayoutDiagnostics } from '../utils/home_layout_diagnostics'
import {
  installIdentityDeviceTokenProvider,
  type InstallIdentityDeviceTokenResult
} from '../utils/identity_device_token'
import { showToast } from '../utils/toast'
import { setAppStoreSessionVerifier } from '../config/app_store_policy'
import { markBootMetric } from '../utils/boot_metrics.js'
import { recordBootStage } from '../utils/boot_diagnostics'
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
  // 真实在线会话是 iOS 功能策略的单一可信来源，绝不以本地记住的工号判断。
  setAppStoreSessionVerifier(() => Boolean(stores.auth.studentId && stores.auth.sessionVerified))
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

  // #902：注册 Identity Access Token provider（设备签名换票，AT 仅内存）。
  // 这是 #629 identity_access_token.ts 的生产注入点：未注入时 getIdentityAccessToken()
  // 恒为 null（Forum / Cloud Sync 走 legacy）；注入后失败仍返回 null，行为向后兼容。
  // 登出 / 登录事件由 provider 内部监听并清空内存令牌（见 utils/identity_device_token.ts）。
  let identityDeviceTokenInstall: InstallIdentityDeviceTokenResult | null = null
  try {
    identityDeviceTokenInstall = installIdentityDeviceTokenProvider()
  } catch (err) {
    // 注册失败绝不阻断启动：保持未注入状态 = 调用方走 legacy
    console.warn('[IdentityToken] provider 注册失败，继续使用 legacy 链路:', err)
  }

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
    // #991：启动页移除原因必须留痕（此前只有 console.info，崩溃后无从追溯）
    recordBootStage('splash-dismissed', { reason })
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
    // #755：一键切换账号成功收尾（MeView 弹层回调）
    handleAccountSwitch: runtime.auth.handleAccountSwitch,
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
      // #991：兜底被触发说明常规启动路径超时，必须留痕
      recordBootStage('splash-failsafe-fired', { show_splash: state.showSplash.value })
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
    // #962：boot 早期只清理上次会话遗留的维护横幅（localStorage + 展示态），
    // **没有任何网络验证** —— 不得升级 onlineSessionState（cached_offline/unknown 保持，
    // 等待下方恢复链的真实结果经 notifySessionOnline 确认）。
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

    // P0（残留通道补齐）：`sessionRestoreVerified` 记录「恢复流程是否确认过可用会话」，
    // 必须在恢复流程内部赋值 —— 若写在 .then 里，.then 自身抛错会被误判为「无会话」。
    let sessionRestoreVerified = false
    const restoreTask = (async () => {
      if (isTestAccountSession()) {
        const restored = runtime.session.restoreTestAccountSession()
        sessionRestoreVerified = restored
        return { restored, relogged: false }
      }
      let restored = await runtime.session.tryRestoreSession()
      if (!restored) restored = await runtime.session.tryRestoreLatestSession()
      let relogged = false
      if (!restored && !runtime.session.isTemporaryLoginSession()) {
        relogged = await runtime.session.attemptAutoRelogin()
      }
      sessionRestoreVerified = restored || relogged
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
      .finally(() => {
        // P0：会话恢复流程**收口**（含恢复链异常路径）—— 未确认可用会话时，设备级游戏身份键
        // （`*_rank_context_v1`）仍是上一用户快照（强杀/崩溃冷启动不会经过任何登出入口），
        // 必须在这里清掉，否则未登录打开模块会被模块自身回落读取并以其身份提交成绩。
        //
        // 契约 D（身份收紧与游客态）：收口只看**会话是否确认**这唯一事实源
        //（`stores/auth.sessionVerified` 的启动期结果 `sessionRestoreVerified`）；
        // `state.studentId` 可能只是 #355 的离线缓存身份 —— 缓存身份不豁免清理，故不再传入。
        // 幂等：重复执行零删除、零写入。
        reconcileGameIdentityOnBoot(sessionRestoreVerified)
      })

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
    recordBootStage('runtime-ready', { current_view: state.currentView.value })
    console.timeEnd('[Boot] total')
  })

  onBeforeUnmount(() => {
    setAppStoreSessionVerifier(null)
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
    // #902：解绑 provider 与登出/登录监听（幂等）；卸载后 getIdentityAccessToken() 回到 null
    identityDeviceTokenInstall?.uninstall()
    identityDeviceTokenInstall = null
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
