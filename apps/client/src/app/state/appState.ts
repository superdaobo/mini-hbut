/**
 * App 壳共享状态（Phase 5：#574）
 *
 * 从 App.vue 迁出的全部响应式状态与模块级可变变量。
 * 模板中使用的名字（currentView、studentId、gradeData…）在此统一暴露，
 * App.vue / shell 组件通过 runtime.state 取用，保持模板变量名不变。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { AppStores } from '../contracts/runtime'
import type { OnlineSessionState } from '../../stores/auth'
import {
  HOME_LAYOUT_DEBUG_FORCE_KEY,
  HOME_LAYOUT_DEBUG_HIDDEN_KEY,
  LOGIN_METHOD_VIEW_KEY
} from './constants'
import { getProtectedViewLabel } from '../../utils/daily_access_key.js'
import { MAIN_TABS } from '../../navigation/app_navigation'
import { allowsInAppGithubUpdater } from '../../config/app_store_policy'
import { toGhProxyUrl } from '../../utils/updater.js'
import { useUiSettings } from '../../utils/ui_settings'
import type { NavigationDirection } from '../../stores/navigation'

/** 模块级非响应式可变状态（timer / listener / token / 标志位） */
export interface AppMutable {
  unlistenCloseRequested: null | (() => void)
  isClosingByUser: boolean
  viewportResizeRaf: number
  desktopResizePerfTimer: null | number
  pendingScrollToTopOnViewChange: boolean
  lastResumeHandledAt: number
  resumePendingSnapshot: null | Record<string, unknown>
  iosReloadFallbackAt: number
  iosHardReloadCount: number
  lastSoftRemountAt: number
  appBootstrapped: boolean
  capacitorAppStateListener: null | { remove: () => Promise<void> }
  widgetCrossDayTimer: null | number
  removeNotificationActionListener: null | (() => void)
  removeHomeLayoutDiagnosticsErrorCapture: null | (() => void)
  gradeTeacherRefreshTimer: null | number
  gradeRealtimeRetryTimer: null | number
  gradeNavigationToken: number
  sessionKeepAliveTimer: null | number
  electricityKeepAliveTimer: null | number
  jwxtRecoveryTimer: null | number
  jwxtRecoveryInFlight: boolean
  remoteConfigRefreshTimer: null | number
  markdownModulePromise: null | Promise<unknown>
  activeAnnouncementRenderToken: number
  blockingAnnouncementRenderToken: number
}

export interface RouteSnapshot {
  sid: string
  view: string
  tab: string
  module: string
}

export interface AppState {
  // stores refs（模板沿用原名）
  currentView: Ref<string>
  activeTab: Ref<string>
  currentModule: Ref<string>
  navDirection: Ref<NavigationDirection>
  studentId: Ref<string>
  userUuid: Ref<string>
  isLoggedIn: Ref<boolean>
  // GitHub #659：缓存身份 ≠ 在线会话。unknown/cached_offline/recovering/online/needs_login
  onlineSessionState: Ref<OnlineSessionState>
  gradeData: Ref<unknown[]>
  gradesOffline: Ref<boolean>
  gradesSyncTime: Ref<string>
  isLoading: Ref<boolean>
  showUpdateDialog: Ref<boolean>
  showForceUpdate: Ref<boolean>
  forceUpdateInfo: Ref<Record<string, unknown> | null>
  forceUpdateResolvedUrl: ComputedRef<string>
  forceUpdateDisplayUrl: ComputedRef<string>

  // 启动 / Splash（showSplash 由 bootstrap 按启动快照赋值）
  showSplash: Ref<boolean>
  splashStatus: Ref<string>
  splashStatusText: Ref<string>
  splashRef: Ref<unknown>

  // 导航 / 视图
  viewRenderNonce: Ref<number>
  widgetDeeplinkDate: Ref<string>
  widgetDeeplinkPeriod: Ref<number>
  moduleHostSession: Ref<Record<string, unknown>>
  appShellRef: Ref<HTMLElement | null>
  homeScrollSnapshot: Ref<number>
  // 返回首页恢复滚动期间置 true：视图隐藏避免"先顶部后闪现底部"
  homeScrollRestoring: Ref<boolean>

  // 登录 / 弹窗
  loginMode: Ref<string>
  showLoginPrompt: Ref<boolean>
  showExitDialog: Ref<boolean>
  exitingApp: Ref<boolean>
  showDailyAccessDialog: Ref<boolean>
  dailyAccessInput: Ref<string>
  dailyAccessError: Ref<string>
  pendingProtectedView: Ref<{ view: string; push?: boolean } | null>

  // 成绩附加状态
  lastGradeRefreshUsedOffline: Ref<boolean>
  gradeTeacherCache: Ref<unknown>
  gradeTeacherCacheSid: Ref<string>

  // JWXT 维护
  jwxtMaintenanceMode: Ref<boolean>
  jwxtMaintenanceHint: Ref<string>
  jwxtMaintenanceDetail: Ref<string>
  jwxtRecoveryPhase: Ref<string>
  jwxtLastCheckTime: Ref<string>
  jwxtSessionLastError: Ref<string>

  // 远程配置 / 公告
  remoteConfig: Ref<Record<string, any> | null>
  announcementData: Ref<{
    pinned: unknown[]
    ticker: unknown[]
    list: unknown[]
    confirm: unknown[]
  }>
  activeAnnouncement: Ref<Record<string, any> | null>
  showAnnouncementModal: Ref<boolean>
  blockingAnnouncement: Ref<Record<string, any> | null>
  showBlockingAnnouncement: Ref<boolean>
  activeAnnouncementHtml: Ref<string>
  blockingAnnouncementHtml: Ref<string>

  // 工作区布局编辑器
  showWorkspaceLayoutEditor: Ref<boolean>
  workspaceLayoutEditorTab: Ref<string>

  // 首页布局调试
  homeLayoutDebugHidden: Ref<boolean>
  homeLayoutDebugExpanded: Ref<boolean>
  homeLayoutDebugReport: Ref<string>
  homeLayoutDebugForced: boolean

  // computed
  viewTransitionEnterActive: ComputedRef<string | undefined>
  viewTransitionLeaveActive: ComputedRef<string | undefined>
  viewTransitionEnterFrom: ComputedRef<string | undefined>
  viewTransitionLeaveTo: ComputedRef<string | undefined>
  protectedViewPromptTitle: ComputedRef<string>
  configAdminIds: ComputedRef<string[]>
  isConfigAdmin: ComputedRef<boolean>
  aiModelOptions: ComputedRef<unknown[]>
  showTabBar: ComputedRef<boolean>
  showHomeLayoutDebug: ComputedRef<boolean>

  // 非响应式可变状态
  mutable: AppMutable
}

export interface CreateAppStateOptions {
  /** 快速课表启动（存在 schedule 渲染快照）时跳过 Splash */
  skipSplashForFastScheduleBoot?: boolean
}

export const createAppState = (stores: AppStores, options: CreateAppStateOptions = {}): AppState => {
  const navigationRefs = storeToRefs(stores.navigation)
  const authRefs = storeToRefs(stores.auth)
  const gradeRefs = storeToRefs(stores.grade)
  const updateRefs = storeToRefs(stores.update)

  const viewTransitionEnterActive = computed(() =>
    navigationRefs.navDirection.value === 'back'
      ? 'module-fade-back-enter-active'
      : navigationRefs.navDirection.value === 'forward'
        ? 'module-fade-fwd-enter-active'
        : undefined
  )
  const viewTransitionLeaveActive = computed(() =>
    navigationRefs.navDirection.value === 'back'
      ? 'module-fade-back-leave-active'
      : navigationRefs.navDirection.value === 'forward'
        ? 'module-fade-fwd-leave-active'
        : undefined
  )
  const viewTransitionEnterFrom = computed(() =>
    navigationRefs.navDirection.value === 'back'
      ? 'module-fade-back-enter-from'
      : navigationRefs.navDirection.value === 'forward'
        ? 'module-fade-fwd-enter-from'
        : undefined
  )
  const viewTransitionLeaveTo = computed(() =>
    navigationRefs.navDirection.value === 'back'
      ? 'module-fade-back-leave-to'
      : navigationRefs.navDirection.value === 'forward'
        ? 'module-fade-fwd-leave-to'
        : undefined
  )

  const savedLoginMode = String(localStorage.getItem(LOGIN_METHOD_VIEW_KEY) || '').trim()

  const mutable: AppMutable = {
    unlistenCloseRequested: null,
    isClosingByUser: false,
    viewportResizeRaf: 0,
    desktopResizePerfTimer: null,
    pendingScrollToTopOnViewChange: false,
    lastResumeHandledAt: 0,
    resumePendingSnapshot: null,
    iosReloadFallbackAt: 0,
    iosHardReloadCount: 0,
    lastSoftRemountAt: 0,
    appBootstrapped: false,
    capacitorAppStateListener: null,
    widgetCrossDayTimer: null,
    removeNotificationActionListener: null,
    removeHomeLayoutDiagnosticsErrorCapture: null,
    gradeTeacherRefreshTimer: null,
    gradeRealtimeRetryTimer: null,
    gradeNavigationToken: 0,
    sessionKeepAliveTimer: null,
    electricityKeepAliveTimer: null,
    jwxtRecoveryTimer: null,
    jwxtRecoveryInFlight: false,
    remoteConfigRefreshTimer: null,
    markdownModulePromise: null,
    activeAnnouncementRenderToken: 0,
    blockingAnnouncementRenderToken: 0
  }

  const remoteConfig = ref<Record<string, any> | null>(null)
  const announcementData = ref({ pinned: [] as unknown[], ticker: [] as unknown[], list: [] as unknown[], confirm: [] as unknown[] })
  const activeAnnouncement = ref<Record<string, any> | null>(null)
  const showAnnouncementModal = ref(false)
  const blockingAnnouncement = ref<Record<string, any> | null>(null)
  const showBlockingAnnouncement = ref(false)
  const activeAnnouncementHtml = ref('')
  const blockingAnnouncementHtml = ref('')

  const configAdminIds = computed(() => {
    const ids = remoteConfig.value?.config_admin_ids
    const merged = new Set(Array.isArray(ids) ? ids : [])
    merged.add('2510231106')
    return [...merged]
  })
  const isConfigAdmin = computed(() => configAdminIds.value.includes(authRefs.studentId.value))
  const aiModelOptions = computed(() => {
    const models = remoteConfig.value?.ai_models
    return Array.isArray(models) ? models : []
  })

  const forceUpdateResolvedUrl = computed(() => {
    // 合规包禁止旁加载 / GitHub 下载链，只走 App Store
    if (!allowsInAppGithubUpdater()) {
      const store = String(updateRefs.forceUpdateInfo.value?.store_url || '').trim()
      return store
    }
    const raw = String(updateRefs.forceUpdateInfo.value?.download_url || '').trim()
    return raw.startsWith('https://') ? toGhProxyUrl(raw) : raw
  })
  const forceUpdateDisplayUrl = computed(() => {
    const url = forceUpdateResolvedUrl.value
    if (!url) return ''
    try {
      const parsed = new URL(url)
      return `${parsed.hostname}${parsed.pathname}`
    } catch {
      return url
    }
  })

  const pendingProtectedView = ref<{ view: string; push?: boolean } | null>(null)
  const homeLayoutDebugHidden = ref(
    typeof window !== 'undefined' && localStorage.getItem(HOME_LAYOUT_DEBUG_HIDDEN_KEY) === '1'
  )

  const showTabBar = computed(() =>
    (MAIN_TABS as readonly string[]).includes(navigationRefs.currentView.value)
  )
  const homeLayoutDebugForced = (() => {
    if (typeof window === 'undefined') return false
    const search = window.location.search || ''
    const hash = window.location.hash || ''
    return (
      localStorage.getItem(HOME_LAYOUT_DEBUG_FORCE_KEY) === '1' ||
      /(?:[?&])debugLayout=1(?:&|$)/.test(search) ||
      /(?:[?&])debugLayout=1(?:&|$)/.test(hash)
    )
  })()

  return {
    currentView: navigationRefs.currentView,
    activeTab: navigationRefs.activeTab,
    currentModule: navigationRefs.currentModule,
    navDirection: navigationRefs.navDirection,
    studentId: authRefs.studentId,
    userUuid: authRefs.userUuid,
    isLoggedIn: authRefs.isLoggedIn,
    onlineSessionState: authRefs.onlineSessionState,
    gradeData: gradeRefs.grades,
    gradesOffline: gradeRefs.offline,
    gradesSyncTime: gradeRefs.syncTime,
    isLoading: gradeRefs.refreshing,
    showUpdateDialog: updateRefs.dialogVisible,
    showForceUpdate: ref(false),
    forceUpdateInfo: updateRefs.forceUpdateInfo,
    forceUpdateResolvedUrl,
    forceUpdateDisplayUrl,

    showSplash: ref(
      import.meta.env.DEV
        ? false
        : useUiSettings().splashEnabled !== false && !options.skipSplashForFastScheduleBoot
    ),
    splashStatus: ref('connecting'),
    splashStatusText: ref('正在启动…'),
    splashRef: ref(null),

    viewRenderNonce: ref(0),
    widgetDeeplinkDate: ref(''),
    widgetDeeplinkPeriod: ref(0),
    moduleHostSession: ref({}),
    appShellRef: ref(null),
    homeScrollSnapshot: ref(0),
    homeScrollRestoring: ref(false),

    loginMode: ref(savedLoginMode && savedLoginMode !== 'auto' ? savedLoginMode : 'portal_password'),
    showLoginPrompt: ref(false),
    showExitDialog: ref(false),
    exitingApp: ref(false),
    showDailyAccessDialog: ref(false),
    dailyAccessInput: ref(''),
    dailyAccessError: ref(''),
    pendingProtectedView,

    lastGradeRefreshUsedOffline: ref(false),
    gradeTeacherCache: ref(null),
    gradeTeacherCacheSid: ref(''),

    jwxtMaintenanceMode: ref(false),
    jwxtMaintenanceHint: ref(''),
    jwxtMaintenanceDetail: ref(''),
    jwxtRecoveryPhase: ref('idle'),
    jwxtLastCheckTime: ref(''),
    jwxtSessionLastError: ref(''),

    remoteConfig,
    announcementData,
    activeAnnouncement,
    showAnnouncementModal,
    blockingAnnouncement,
    showBlockingAnnouncement,
    activeAnnouncementHtml,
    blockingAnnouncementHtml,

    showWorkspaceLayoutEditor: ref(false),
    workspaceLayoutEditorTab: ref('home'),

    homeLayoutDebugHidden,
    homeLayoutDebugExpanded: ref(false),
    homeLayoutDebugReport: ref(''),
    homeLayoutDebugForced,

    viewTransitionEnterActive,
    viewTransitionLeaveActive,
    viewTransitionEnterFrom,
    viewTransitionLeaveTo,
    protectedViewPromptTitle: computed(() =>
      getProtectedViewLabel(pendingProtectedView.value?.view)
    ),
    configAdminIds,
    isConfigAdmin,
    aiModelOptions,
    showTabBar,
    showHomeLayoutDebug: computed(
      () =>
        navigationRefs.currentView.value === 'home' &&
        !homeLayoutDebugHidden.value &&
        homeLayoutDebugForced
    ),

    mutable
  }
}
