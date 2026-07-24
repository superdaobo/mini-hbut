<script setup>
import { ref, onMounted, computed, watch, nextTick, onBeforeUnmount, defineAsyncComponent } from 'vue'
import axios from 'axios'
import UpdateDialog from './components/UpdateDialog.vue'
import Toast from './components/Toast.vue'
import SplashScreen from './components/SplashScreen.vue'
import DemoModeBanner from './components/DemoModeBanner.vue'
import WorkspaceLayoutEditor from './components/WorkspaceLayoutEditor.vue'
import { fetchWithCache, getStaleCachedData, setCachedData, clearUserScopedCaches, clearCacheByPrefix } from './utils/api.js'
import {
  readScheduleRenderSnapshot,
  clearScheduleRenderSnapshot,
  SCHEDULE_POPUP_PENDING_KEY,
  SCHEDULE_SWITCH_PENDING_KEY
} from './utils/schedule_prefetch.js'
import {
  checkAppleStoreUpdate,
  getSkippedAppleStoreVersion,
  openAppStoreUpdatePage
} from './utils/apple_app_update'
import { checkForUpdates, getCurrentVersion, toGhProxyUrl } from './utils/updater.js'
import {
  fetchRemoteConfig,
  applyOcrRuntimeConfig,
  getStoredOcrConfig,
  isRemoteConfigEnabled,
  REMOTE_CONFIG_UPDATED_EVENT
} from './utils/remote_config.js'
import { resetCloudSyncCooldownForSession, runAutoCloudSyncAfterLogin } from './utils/cloud_sync.js'
import {
  initUsageTracker,
  setUsageTrackingStudentId,
  trackViewNavigation
} from './utils/usage_tracker.js'
import {
  scheduleUsageUpload,
  startUsageUploadScheduler,
  stopUsageUploadScheduler
} from './utils/usage_uploader.js'
import {
  TEST_ACCOUNT,
  clearTestAccountSession,
  isTestAccountSession
} from './utils/test_account.js'
import {
  getTestAccountGrades,
  seedTestAccountCaches
} from './utils/test_account_fixtures.js'
import { isWebsiteDemoBuild } from './utils/website_demo_boot.js'
import {
  loadChaoxingStoredPassword,
  loadPortalStoredPassword
} from './composables/useSessionCredentials.js'
import { ensureRememberedPasswordCached, preservePortalRememberedPasswordOnLogout } from './utils/credential_storage.js'
import { startNotificationMonitor, stopNotificationMonitor } from './utils/notify_center.js'
import { openExternal, isHttpLink } from './utils/external_link'
import { useUiSettings } from './utils/ui_settings'
import { hasBootMetric, markBootMetric, resetBootMetrics } from './utils/boot_metrics.js'
import { tryWriteSnapshotFromCache, clearWidgetForLogout } from './utils/widget_bridge'
import { showToast } from './utils/toast'
import {
  collectHomeLayoutDiagnostics,
  installHomeLayoutDiagnosticsErrorCapture
} from './utils/home_layout_diagnostics'
import {
  clearDailyAccessGrant,
  getProtectedViewLabel,
  hasDailyAccessGrant,
  isProtectedView,
  markDailyAccessGranted,
  sanitizeDailyAccessInput,
  verifyDailyAccessKey
} from './utils/daily_access_key.js'
import {
  canUseLocalModuleBridgePreview,
  isLocalModuleBridgePreviewUrl,
  normalizeModuleHostSessionPayload,
  resolveModuleHostPreviewSource
} from './utils/more_modules.js'
import {
  MAIN_TABS,
  ME_SUB_VIEWS,
  HIERARCHICAL_PARENT_VIEW_MAP,
  isLoginRequiredView,
  normalizeViewName
} from './navigation/app_navigation.ts'
import { allowsInAppGithubUpdater, isViewAllowed } from './config/app_store_policy'
import { canOpenModule } from './utils/moduleAccess'
import {
  resolvePolicySafeSnapshotView,
  resolvePolicySafeView
} from './config/accessible_view'
import {
  exitNativeApp,
  getCurrentNativeWindow,
  invokeNative,
  isTauriRuntime
} from './platform/native'
import { isCapacitorRuntime } from './platform/native'
import { platformBridge } from './platform'
import { resolveNotificationActionTarget } from './platform/notification_actions'
import { runCampusNetworkAutoLogin } from './utils/campus_network_service'

const createAsyncPage = (loader) => defineAsyncComponent({
  loader,
  delay: 0,
  suspensible: false
})

const loadDashboardView = () => import('./components/Dashboard.vue')
const loadGradeView = () => import('./components/GradeView.vue')
const loadElectricityView = () => import('./components/ElectricityView.vue')
const loadClassroomView = () => import('./components/ClassroomView.vue')
const loadScheduleView = () => import('./components/ScheduleView.vue')
const loadGlobalScheduleView = () => import('./components/GlobalScheduleView.vue')
const loadCourseSelectionView = () => import('./components/CourseSelectionView.vue')
const loadStudentInfoView = () => import('./components/StudentInfoView.vue')
const loadExamView = () => import('./components/ExamView.vue')
const loadRankingView = () => import('./components/RankingView.vue')
const loadCalendarView = () => import('./components/CalendarView.vue')
const loadSchoolInboxView = () => import('./components/SchoolInboxView.vue')
const loadAcademicProgressView = () => import('./components/AcademicProgressView.vue')
const loadTrainingPlanView = () => import('./components/TrainingPlanView.vue')
const loadForumView = () => import('./components/ForumView.vue')
const loadMeView = () => import('./components/MeView.vue')
const loadOfficialView = () => import('./components/OfficialView.vue')
const loadFeedbackView = () => import('./components/FeedbackView.vue')
const loadNotificationView = () => import('./components/NotificationView.vue')
const loadConfigEditorView = () => import('./components/ConfigEditor.vue')
const loadSettingsView = () => import('./components/SettingsView.vue')
const loadPrivacyDataView = () => import('./components/PrivacyDataView.vue')
const loadExportCenterView = () => import('./components/ExportCenterView.vue')
const loadServiceStatsView = () => import('./components/ServiceStatsView.vue')
const loadSchoolWebsiteView = () => import('./components/SchoolWebsiteView.vue')
const loadQuickLinksView = () => import('./components/QuickLinksView.vue')
const loadCampusNetworkView = () => import('./components/CampusNetworkView.vue')
const loadMoreView = () => import('./components/MoreView.vue')
const loadMoreModuleHostView = () => import('./components/MoreModuleHostView.vue')
const loadMoreChaoxingCheckinView = () => import('./components/MoreChaoxingCheckinView.vue')
const loadTransactionHistoryView = () => import('./components/TransactionHistory.vue')
const loadCampusCodeView = () => import('./components/CampusCodeView.vue')
const loadAiChatView = () => import('./components/AiChatView.vue')
const loadCampusMapView = () =>
  import('./features/campus-guide/config.ts').then(({ readCampusGuideMode }) =>
    readCampusGuideMode() === 'tencent'
      ? import('./features/campus-guide/views/CampusGuideShell.vue')
      : import('./components/CampusMapView.vue')
  )
const loadLibraryView = () => import('./components/LibraryView.vue')
const loadResourceShareView = () => import('./components/ResourceShareView.vue')
const loadChaoxingClassView = () => import('./components/ChaoxingClassView.vue')
const loadChaoxingHubView = () => import('./components/ChaoxingHubView.vue')
const loadChaoxingInboxView = () => import('./components/ChaoxingInboxView.vue')
const loadTeachingEvalView = () => import('./components/TeachingEvalView.vue')
const loadBroadbandView = () => import('./components/BroadbandView.vue')
const loadSportsVenueView = () => import('./components/SportsVenueView.vue')
const loadTowerGoView = () => import('./components/TowerGoView.vue')
const loadSmartOrientationView = () => import('./components/SmartOrientationView.vue')

const Dashboard = createAsyncPage(loadDashboardView)
const GradeView = createAsyncPage(loadGradeView)
const ElectricityView = createAsyncPage(loadElectricityView)
const ClassroomView = createAsyncPage(loadClassroomView)
const ScheduleView = createAsyncPage(loadScheduleView)
const GlobalScheduleView = createAsyncPage(loadGlobalScheduleView)
const CourseSelectionView = createAsyncPage(loadCourseSelectionView)
const StudentInfoView = createAsyncPage(loadStudentInfoView)
const ExamView = createAsyncPage(loadExamView)
const RankingView = createAsyncPage(loadRankingView)
const CalendarView = createAsyncPage(loadCalendarView)
const SchoolInboxView = createAsyncPage(loadSchoolInboxView)
const AcademicProgressView = createAsyncPage(loadAcademicProgressView)
const TrainingPlanView = createAsyncPage(loadTrainingPlanView)
const ForumView = createAsyncPage(loadForumView)
const MeView = createAsyncPage(loadMeView)
const OfficialView = createAsyncPage(loadOfficialView)
const FeedbackView = createAsyncPage(loadFeedbackView)
const NotificationView = createAsyncPage(loadNotificationView)
const ConfigEditor = createAsyncPage(loadConfigEditorView)
const SettingsView = createAsyncPage(loadSettingsView)
const PrivacyDataView = createAsyncPage(loadPrivacyDataView)
const ExportCenterView = createAsyncPage(loadExportCenterView)
const ServiceStatsView = createAsyncPage(loadServiceStatsView)
const SchoolWebsiteView = createAsyncPage(loadSchoolWebsiteView)
const QuickLinksView = createAsyncPage(loadQuickLinksView)
const CampusNetworkView = createAsyncPage(loadCampusNetworkView)
const MoreView = createAsyncPage(loadMoreView)
const MoreModuleHostView = createAsyncPage(loadMoreModuleHostView)
const MoreChaoxingCheckinView = createAsyncPage(loadMoreChaoxingCheckinView)
const TransactionHistory = createAsyncPage(loadTransactionHistoryView)
const CampusCodeView = createAsyncPage(loadCampusCodeView)
const AiChatView = createAsyncPage(loadAiChatView)
const CampusMapView = createAsyncPage(loadCampusMapView)
const LibraryView = createAsyncPage(loadLibraryView)
const ResourceShareView = createAsyncPage(loadResourceShareView)
const ChaoxingClassView = createAsyncPage(loadChaoxingClassView)
const ChaoxingHubView = createAsyncPage(loadChaoxingHubView)
const ChaoxingInboxView = createAsyncPage(loadChaoxingInboxView)
const TeachingEvalView = createAsyncPage(loadTeachingEvalView)
const BroadbandView = createAsyncPage(loadBroadbandView)
const SportsVenueView = createAsyncPage(loadSportsVenueView)
const TowerGoView = createAsyncPage(loadTowerGoView)
const SmartOrientationView = createAsyncPage(loadSmartOrientationView)

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const GRADE_CACHE_REFRESH_RETRY_MS = 8000
const hasTauri = isTauriRuntime()
const invoke = invokeNative
const BRIDGE_BASE = hasTauri ? 'http://127.0.0.1:4399' : '/bridge'
// #451：softRemount 阈值从 3min 提高到 10min，避免中等后台误伤触发整树 remount
const IOS_RESUME_SOFT_REMOUNT_MS = 10 * 60 * 1000
// 硬 reload 仅作为末级兜底：idle 更长 + 本会话未用过
const IOS_RESUME_HARD_RELOAD_MS = 15 * 60 * 1000
const IOS_RELOAD_MIN_INTERVAL_MS = 60 * 1000
const isIOSLike = (() => {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  const platform = window.navigator.platform || ''
  const maxTouchPoints = window.navigator.maxTouchPoints || 0
  return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)
})()
const isAndroidLike = (() => {
  if (typeof window === 'undefined') return false
  return /Android/i.test(window.navigator.userAgent || '')
})()
const isDesktopLike = !isIOSLike && !isAndroidLike
let hiddenAt = 0
let unlistenCloseRequested = null
let isClosingByUser = false
let viewportResizeRaf = 0
let desktopResizePerfTimer = null
let pendingScrollToTopOnViewChange = false
let lastResumeHandledAt = 0
let resumePendingSnapshot = null
let iosReloadFallbackAt = 0
/** #451：本会话已执行硬 reload 次数，防止白屏循环 */
let iosHardReloadCount = 0
const IOS_HARD_RELOAD_MAX_PER_SESSION = 1
/** softRemount 节流，避免连续 resume 事件叠 remount */
let lastSoftRemountAt = 0
const SOFT_REMOUNT_MIN_INTERVAL_MS = 30 * 1000
let appBootstrapped = false
let capacitorAppStateListener = null
let widgetCrossDayTimer = null
let removeNotificationActionListener = null
let removeHomeLayoutDiagnosticsErrorCapture = null
let gradeTeacherRefreshTimer = null
let gradeRealtimeRetryTimer = null
let gradeNavigationToken = 0

// Widget 深链接参数（由 widgetDeeplink 事件或 appUrlOpen 注入）
const widgetDeeplinkDate = ref('')
const widgetDeeplinkPeriod = ref(0)

const VIEW_PREFETCHERS = Object.freeze({
  home: loadDashboardView,
  schedule: loadScheduleView,
  qxzkb: loadGlobalScheduleView,
  course_selection: loadCourseSelectionView,
  me: loadMeView,
  official: loadOfficialView,
  feedback: loadFeedbackView,
  config: loadConfigEditorView,
  settings: loadSettingsView,
  privacy_data: loadPrivacyDataView,
  export_center: loadExportCenterView,
  service_stats: loadServiceStatsView,
  school_website: loadSchoolWebsiteView,
  quick_links: loadQuickLinksView,
  campus_network: loadCampusNetworkView,
  more: loadMoreView,
  more_module_host: loadMoreModuleHostView,
  more_chaoxing_checkin: loadMoreChaoxingCheckinView,
  grades: loadGradeView,
  electricity: loadElectricityView,
  transactions: loadTransactionHistoryView,
  campus_code: loadCampusCodeView,
  notifications: loadNotificationView,
  classroom: loadClassroomView,
  studentinfo: loadStudentInfoView,
  exams: loadExamView,
  ranking: loadRankingView,
  calendar: loadCalendarView,
  school_inbox: loadSchoolInboxView,
  academic: loadAcademicProgressView,
  training: loadTrainingPlanView,
  forum: loadForumView,
  ai: loadAiChatView,
  campus_map: loadCampusMapView,
  library: loadLibraryView,
  resource_share: loadResourceShareView,
  chaoxing_class: loadChaoxingClassView,
  chaoxing_hub: loadChaoxingHubView,
  chaoxing_inbox: loadChaoxingInboxView,
  teaching_eval: loadTeachingEvalView,
  broadband: loadBroadbandView,
  sports_venue: loadSportsVenueView,
  towergo: loadTowerGoView,
  smart_orientation: loadSmartOrientationView
})

const prefetchViewComponent = (view) => {
  const loader = VIEW_PREFETCHERS[normalizeViewName(view)]
  if (typeof loader === 'function') {
    void loader()
  }
}

const resolveInitialAccessibleView = (view) => {
  // 合规构建：hash/启动页不得落到被禁 view（与 goToView 同一策略）
  const normalized = resolvePolicySafeView(view, 'home')
  if (isProtectedView(normalized) && !hasDailyAccessGrant()) {
    return 'home'
  }
  return normalized
}

const readWindowRouteSnapshot = () => {
  if (typeof window === 'undefined') return null
  const state = window.history?.state
  if (state && state.__hbu) {
    return {
      sid: String(state.sid || '').trim(),
      view: normalizeViewName(state.view || state.module || state.tab),
      tab: String(state.tab || '').trim(),
      module: String(state.module || '').trim()
    }
  }
  const hash = window.location.hash || '#/'
  const match = hash.match(/^#\/(\d{10})(?:\/(\w+))?$/)
  if (!match) return null
  return {
    sid: match[1],
    view: normalizeViewName(match[2] || 'home'),
    tab: '',
    module: ''
  }
}

const readCachedStudentId = () => {
  if (typeof window === 'undefined') return ''
  return String(localStorage.getItem('hbu_username') || '').trim()
}

const initialRouteSnapshot = readWindowRouteSnapshot()
const startupPageSetting = useUiSettings().startupPage || 'home'
const initialView = resolveInitialAccessibleView(initialRouteSnapshot?.view || startupPageSetting)
const initialTab = String(
  initialRouteSnapshot?.tab ||
    (MAIN_TABS.includes(initialView) ? initialView : (ME_SUB_VIEWS.includes(initialView) ? 'me' : 'home'))
).trim() || 'home'
const initialModule = String(
  initialRouteSnapshot?.module ||
    (MAIN_TABS.includes(initialView) ? '' : initialView === 'home' ? '' : initialView)
).trim()
const bootStudentIdHint = String(initialRouteSnapshot?.sid || readCachedStudentId() || '').trim()
const bootScheduleSnapshot =
  initialView === 'schedule' && bootStudentIdHint
    ? readScheduleRenderSnapshot(bootStudentIdHint)
    : null
const skipSplashForFastScheduleBoot = !!bootScheduleSnapshot

const MODULE_HOST_SESSION_KEY = 'hbu_more_module_host_session'

resetBootMetrics({
  initial_view: initialView,
  fast_schedule_boot: skipSplashForFastScheduleBoot,
  startup_page: startupPageSetting
})

const buildModuleHostSession = (payload = {}) => {
  const raw = payload && typeof payload === 'object' ? payload : {}
  const resolved = resolveModuleHostPreviewSource(raw)
  const rawPreviewUrl = String(raw.preview_url || raw.previewUrl || '').trim()
  const rawPreviewMode = String(raw.preview_mode || raw.previewMode || '').trim()
  const sanitizedPreviewUrl =
    !canUseLocalModuleBridgePreview() && isLocalModuleBridgePreviewUrl(resolved.resolvedPreviewUrl)
      ? ''
      : String(resolved.resolvedPreviewUrl || '').trim()
  const sanitizedLocalPreviewUrl =
    !canUseLocalModuleBridgePreview() &&
    isLocalModuleBridgePreviewUrl(String(raw.local_preview_url || raw.localPreviewUrl || resolved.localPreviewUrl || '').trim())
      ? ''
      : String(raw.local_preview_url || raw.localPreviewUrl || resolved.localPreviewUrl || '').trim()
  const bridgeBlocked =
    !canUseLocalModuleBridgePreview() && (isLocalModuleBridgePreviewUrl(rawPreviewUrl) || rawPreviewMode === 'tauri-local')
  const normalizedPreviewMode =
    String(resolved.sourceKind || '').trim() ||
    (bridgeBlocked ? '' : rawPreviewMode)
  const normalizedInvalidReason = String(
    raw.invalid_reason || raw.invalidReason || (!sanitizedPreviewUrl && bridgeBlocked ? 'tauri-bridge-blocked' : '')
  ).trim()
  return {
    module_id: String(raw.module_id || raw.moduleId || '').trim(),
    module_name: String(raw.module_name || raw.moduleName || '').trim(),
    preview_url: sanitizedPreviewUrl,
    version: String(raw.version || '').trim(),
    min_compatible_version: String(raw.min_compatible_version || raw.minCompatibleVersion || '').trim(),
    channel: String(raw.channel || 'main').trim() || 'main',
    local_ready: !!sanitizedPreviewUrl && raw.local_ready !== false,
    source: String(raw.source || '').trim(),
    preview_mode: normalizedPreviewMode,
    invalid_reason: normalizedInvalidReason,
    open_url: String(raw.open_url || raw.openUrl || resolved.openUrl || '').trim(),
    package_url: String(raw.package_url || raw.packageUrl || resolved.packageUrl || '').trim(),
    package_urls: Array.isArray(raw.package_urls)
      ? raw.package_urls
      : Array.isArray(raw.packageUrls)
        ? raw.packageUrls
        : resolved.packageUrls,
    entry_path: String(raw.entry_path || raw.entryPath || resolved.entryPath || '').trim(),
    resolved_entry_path: String(
      raw.resolved_entry_path || raw.resolvedEntryPath || resolved.resolvedEntryPath || ''
    ).trim(),
    local_preview_url: sanitizedLocalPreviewUrl,
    site_root_path: String(raw.site_root_path || raw.siteRootPath || resolved.siteRootPath || '').trim(),
    bundle_zip_path: String(
      raw.bundle_zip_path || raw.bundleZipPath || resolved.bundleZipPath || ''
    ).trim(),
    cache_dir: String(raw.cache_dir || '').trim(),
    bundle_path: String(raw.bundle_path || '').trim(),
    manifest_url: String(raw.manifest_url || raw.manifestUrl || resolved.manifestUrl || '').trim(),
    manifest_checked_at: String(raw.manifest_checked_at || raw.manifestCheckedAt || '').trim()
  }
}

const writeModuleHostSessionStorage = (payload) => {
  try {
    localStorage.setItem(MODULE_HOST_SESSION_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage failure
  }
}

const readModuleHostSession = () => {
  try {
    const raw = localStorage.getItem(MODULE_HOST_SESSION_KEY)
    if (!raw) return buildModuleHostSession()
    return buildModuleHostSession(JSON.parse(raw))
  } catch {
    return buildModuleHostSession()
  }
}

const persistModuleHostSession = (payload) => {
  const normalized = buildModuleHostSession(payload)
  writeModuleHostSessionStorage(normalized)
  return normalized
}

const repairModuleHostSession = async (payload) => {
  try {
    const repaired = await normalizeModuleHostSessionPayload(payload || {})
    const normalized = buildModuleHostSession(repaired)
    writeModuleHostSessionStorage(normalized)
    return normalized
  } catch {
    const fallback = buildModuleHostSession(payload)
    writeModuleHostSessionStorage(fallback)
    return fallback
  }
}

// 视图状态: home, schedule, me, grades...
const currentView = ref(initialView)
const activeTab = ref(initialTab)
const gradeData = ref([])
const studentId = ref(String(initialRouteSnapshot?.sid || '').trim())
const userUuid = ref('')
const currentModule = ref(initialModule)
const moduleHostSession = ref(readModuleHostSession())
const viewRenderNonce = ref(0)
const showWorkspaceLayoutEditor = ref(false)
const workspaceLayoutEditorTab = ref('home')
const isLoading = ref(false)
const showLoginPrompt = ref(false)
// 开发态默认不再叠第二层 Vue Splash（index.html 已有原生启动页；双层易造成“永远加载”）
const showSplash = ref(
  import.meta.env.DEV
    ? false
    : useUiSettings().splashEnabled !== false && !skipSplashForFastScheduleBoot
)
const HOME_LAYOUT_DEBUG_HIDDEN_KEY = 'hbu_home_layout_debug_hidden'
const HOME_LAYOUT_DEBUG_FORCE_KEY = 'hbu_home_layout_debug_enabled'
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
const homeLayoutDebugHidden = ref(
  typeof window !== 'undefined' && localStorage.getItem(HOME_LAYOUT_DEBUG_HIDDEN_KEY) === '1'
)
const homeLayoutDebugExpanded = ref(false)
const homeLayoutDebugReport = ref('')
prefetchViewComponent(initialView)
watch(currentView, (view, prev) => {
  prefetchViewComponent(view)
  // #373：离开学校官网时强制关掉桌面子 WebView，避免盖住「我的」等内容区
  if (prev === 'school_website' && view !== 'school_website') {
    void import('./utils/school_website_embed').then((mod) => {
      void mod.forceCloseSchoolWebsiteEmbed?.()
    }).catch(() => {})
  }
})
if (skipSplashForFastScheduleBoot && !hasBootMetric('splash_dismissed')) {
  markBootMetric('splash_dismissed', {
    current_view: initialView,
    fast_schedule_boot: true,
    skipped: true
  })
}
const splashStatus = ref('connecting')
const splashStatusText = ref('正在启动…')
const splashRef = ref(null)
const showExitDialog = ref(false)
const exitingApp = ref(false)
const showDailyAccessDialog = ref(false)
const dailyAccessInput = ref('')
const dailyAccessError = ref('')
const pendingProtectedView = ref(null)
const gradesOffline = ref(false)
const gradesSyncTime = ref('')
const lastGradeRefreshUsedOffline = ref(false)
const gradeTeacherCache = ref(null)
const gradeTeacherCacheSid = ref('')
const appShellRef = ref(null)
const homeScrollSnapshot = ref(0)
const jwxtMaintenanceMode = ref(false)
const jwxtMaintenanceHint = ref('')
const jwxtLastCheckTime = ref('')
/** idle | recovering | failed | need_login | maintenance */
const jwxtRecoveryPhase = ref('idle')
const jwxtMaintenanceDetail = ref('')
const jwxtSessionLastError = ref('')

const SESSION_COOKIE_KEY = 'hbu_session_cookies'
const SESSION_COOKIE_TIME_KEY = 'hbu_session_cookie_time'
const COOKIE_SNAPSHOT_KEY = 'hbu_cookie_snapshot'
const LOGIN_SESSION_TOKEN_KEY = 'hbu_login_session_token'
const LOGIN_METHOD_KEY = 'hbu_login_method'
const LOGIN_METHOD_VIEW_KEY = 'hbu_login_entry_mode'
const LOGIN_TEMP_FLAG_KEY = 'hbu_login_temporary'
const CHAOXING_ACCOUNT_KEY = 'hbu_cx_account'
const CHAOXING_PASSWORD_KEY = 'hbu_cx_password'
const CHAOXING_REMEMBER_KEY = 'hbu_cx_remember'
const LOGOUT_REASON_KEY = 'hbu_logout_reason'
const TEMP_SESSION_EXPIRED_REASON = 'temp_session_expired'
const JWXT_MAINTENANCE_KEY = 'hbu_jwxt_maintenance'
const JWXT_MAINTENANCE_TIME_KEY = 'hbu_jwxt_maintenance_time'
const JWXT_MAINTENANCE_HINT_KEY = 'hbu_jwxt_maintenance_hint'
const JWXT_MAINTENANCE_DETAIL_KEY = 'hbu_jwxt_maintenance_detail'
const JWXT_MAINTENANCE_PHASE_KEY = 'hbu_jwxt_maintenance_phase'
const JWXT_MAINTENANCE_EVENT = 'hbu-jwxt-maintenance'
const REMOTE_CONFIG_MODE_EVENT = 'hbu-remote-config-mode-changed'
const SESSION_REFRESH_INTERVAL = 20 * 60 * 1000
let sessionKeepAliveTimer = null
const ELECTRICITY_REFRESH_INTERVAL = 10 * 60 * 1000
let electricityKeepAliveTimer = null
const JWXT_RECOVERY_INTERVAL = 65 * 1000
let jwxtRecoveryTimer = null
let jwxtRecoveryInFlight = false
const REMOTE_CONFIG_REFRESH_INTERVAL = 60 * 1000
let remoteConfigRefreshTimer = null

// 版本更新相关
const showUpdateDialog = ref(false)
const showForceUpdate = ref(false)
const forceUpdateInfo = ref(null)
const protectedViewPromptTitle = computed(() => getProtectedViewLabel(pendingProtectedView.value?.view))
const forceUpdateResolvedUrl = computed(() => {
  // 合规包禁止旁加载 / GitHub 下载链，只走 App Store
  if (!allowsInAppGithubUpdater()) {
    const store = String(forceUpdateInfo.value?.store_url || '').trim()
    return store
  }
  const raw = String(forceUpdateInfo.value?.download_url || '').trim()
  if (!raw) return ''
  return toGhProxyUrl(raw) || raw
})
const forceUpdateDisplayUrl = computed(() => {
  if (!allowsInAppGithubUpdater() && !forceUpdateResolvedUrl.value) {
    return '请在 App Store 中更新'
  }
  const target = String(forceUpdateResolvedUrl.value || '').trim()
  if (!target) return '未提供下载地址'
  return target.length > 68 ? `${target.slice(0, 65)}...` : target
})

const remoteConfig = ref(null)
const announcementData = ref({ pinned: [], ticker: [], list: [], confirm: [] })
const activeAnnouncement = ref(null)
const showAnnouncementModal = ref(false)
const blockingAnnouncement = ref(null)
const showBlockingAnnouncement = ref(false)
const activeAnnouncementHtml = ref('')
const blockingAnnouncementHtml = ref('')

let markdownModulePromise = null
let activeAnnouncementRenderToken = 0
let blockingAnnouncementRenderToken = 0

const escapeHtml = (content = '') =>
  String(content || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderAnnouncementMarkdown = async (content = '') => {
  const normalized = String(content || '')
  if (!normalized.trim()) return ''
  try {
    markdownModulePromise ||= import('./utils/markdown.js')
    const { renderMarkdown } = await markdownModulePromise
    return renderMarkdown(normalized)
  } catch (error) {
    console.warn('[Announcement] markdown render fallback:', error)
    return `<p>${escapeHtml(normalized)}</p>`
  }
}

if (currentView.value === 'more_module_host' && !moduleHostSession.value.preview_url) {
  currentView.value = 'more'
  activeTab.value = 'me'
  currentModule.value = 'more'
}

// 默认登录方式：新融合门户账号密码
const savedLoginMode = String(localStorage.getItem(LOGIN_METHOD_VIEW_KEY) || '').trim()
const loginMode = ref(savedLoginMode && savedLoginMode !== 'auto' ? savedLoginMode : 'portal_password')

const isLoggedIn = computed(() => !!studentId.value)
const configAdminIds = computed(() => {
  const ids = remoteConfig.value?.config_admin_ids
  const merged = new Set(Array.isArray(ids) ? ids : [])
  merged.add('2510231106')
  return [...merged]
})
const isConfigAdmin = computed(() => configAdminIds.value.includes(studentId.value))
const aiModelOptions = computed(() => {
  const models = remoteConfig.value?.ai_models
  return Array.isArray(models) ? models : []
})

const ANNOUNCEMENT_CONFIRM_KEY = 'hbu_announcement_confirmed'
const ANNOUNCEMENT_SNAPSHOT_KEY = 'hbu_announcement_snapshot'

const normalizeAnnouncementPayload = (payload) => ({
  pinned: Array.isArray(payload?.pinned) ? payload.pinned : [],
  ticker: Array.isArray(payload?.ticker) ? payload.ticker : [],
  list: Array.isArray(payload?.list) ? payload.list : [],
  confirm: Array.isArray(payload?.confirm) ? payload.confirm : []
})

const hasAnnouncementContent = (payload) => {
  const normalized = normalizeAnnouncementPayload(payload)
  return (
    normalized.pinned.length > 0 ||
    normalized.ticker.length > 0 ||
    normalized.list.length > 0 ||
    normalized.confirm.length > 0
  )
}

const restoreAnnouncementSnapshot = () => {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const normalized = normalizeAnnouncementPayload(parsed)
    return hasAnnouncementContent(normalized) ? normalized : null
  } catch {
    return null
  }
}

const persistAnnouncementSnapshot = (payload) => {
  const normalized = normalizeAnnouncementPayload(payload)
  if (!hasAnnouncementContent(normalized)) return
  try {
    localStorage.setItem(ANNOUNCEMENT_SNAPSHOT_KEY, JSON.stringify(normalized))
  } catch {
    // ignore
  }
}

const compareVersions = (v1, v2) => {
  const parts1 = (v1 || '').replace(/^v/, '').split('.').map(Number)
  const parts2 = (v2 || '').replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

const getConfirmedAnnouncementIds = () => {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_CONFIRM_KEY)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const isAnnouncementConfirmed = (id) => {
  if (!id) return true
  return getConfirmedAnnouncementIds().includes(id)
}

const markAnnouncementConfirmed = (id) => {
  if (!id) return
  const ids = new Set(getConfirmedAnnouncementIds())
  ids.add(id)
  localStorage.setItem(ANNOUNCEMENT_CONFIRM_KEY, JSON.stringify([...ids]))
}

const getAllAnnouncements = () => {
  const map = new Map()
  const lists = [
    announcementData.value.pinned,
    announcementData.value.ticker,
    announcementData.value.list,
    announcementData.value.confirm
  ]
  lists.flat().forEach((item) => {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item)
    }
  })
  return [...map.values()]
}

const findNextBlockingAnnouncement = () => {
  const pending = getAllAnnouncements().find(
    (item) => item?.require_confirm && !isAnnouncementConfirmed(item.id)
  )
  if (pending) {
    blockingAnnouncement.value = pending
    showBlockingAnnouncement.value = true
  } else {
    blockingAnnouncement.value = null
    showBlockingAnnouncement.value = false
  }
}

const openAnnouncement = (item) => {
  if (!item) return
  activeAnnouncement.value = item
  showBlockingAnnouncement.value = false
  showAnnouncementModal.value = true
}

const closeAnnouncement = () => {
  showAnnouncementModal.value = false
  activeAnnouncement.value = null
  findNextBlockingAnnouncement()
}

const confirmBlockingAnnouncement = () => {
  if (blockingAnnouncement.value?.id) {
    markAnnouncementConfirmed(blockingAnnouncement.value.id)
  }
  showBlockingAnnouncement.value = false
  blockingAnnouncement.value = null
  setTimeout(findNextBlockingAnnouncement, 200)
}

watch(
  () => [
    activeAnnouncement.value?.id,
    activeAnnouncement.value?.content,
    activeAnnouncement.value?.summary
  ],
  async () => {
    const content = String(activeAnnouncement.value?.content || activeAnnouncement.value?.summary || '')
    const token = ++activeAnnouncementRenderToken
    if (!content.trim()) {
      activeAnnouncementHtml.value = ''
      return
    }
    const html = await renderAnnouncementMarkdown(content)
    if (token === activeAnnouncementRenderToken) {
      activeAnnouncementHtml.value = html
    }
  },
  { immediate: true }
)

watch(
  () => [
    blockingAnnouncement.value?.id,
    blockingAnnouncement.value?.content,
    blockingAnnouncement.value?.summary
  ],
  async () => {
    const content = String(blockingAnnouncement.value?.content || blockingAnnouncement.value?.summary || '')
    const token = ++blockingAnnouncementRenderToken
    if (!content.trim()) {
      blockingAnnouncementHtml.value = ''
      return
    }
    const html = await renderAnnouncementMarkdown(content)
    if (token === blockingAnnouncementRenderToken) {
      blockingAnnouncementHtml.value = html
    }
  },
  { immediate: true }
)

const handleContentClick = async (e) => {
  const target = e.target.closest('a')
  if (target && target.href) {
    if (e.__hbuExternalHandled) return
    e.__hbuExternalHandled = true
    e.preventDefault()
    await openExternal(target.href)
  }
}

const handleGlobalLinkClick = async (e) => {
  if (e.__hbuExternalHandled) return
  const target = e.target.closest('a')
  if (!target || !target.href) return
  const href = target.href
  if (!isHttpLink(href)) return
  e.__hbuExternalHandled = true
  e.preventDefault()
  await openExternal(href)
}

const handleExternalOpen = async (url, e) => {
  if (!url) return
  if (e) {
    if (e.__hbuExternalHandled) return
    e.__hbuExternalHandled = true
    e.preventDefault()
  }
  await openExternal(url)
}

const forceScrollTop = () => {
  try {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    if (appShellRef.value) {
      appShellRef.value.scrollTop = 0
    }
  } catch {
    // ignore
  }
}

const updateViewportUnit = () => {
  if (typeof window === 'undefined') return
  // 优先 clientHeight，避免地址栏/键盘/可视窗口瞬时波动导致“二次缩放”
  const viewportHeight =
    document.documentElement.clientHeight ||
    window.innerHeight ||
    window.visualViewport?.height
  if (!viewportHeight) return
  const nextVh = viewportHeight * 0.01
  const prevVh = Number.parseFloat(document.documentElement.style.getPropertyValue('--app-vh'))
  // 忽略小于约 10px 的抖动（0.1vh * 100），避免页面进入后瞬时缩放
  if (Number.isFinite(prevVh) && Math.abs(prevVh - nextVh) < 0.1) return
  document.documentElement.style.setProperty('--app-vh', `${nextVh}px`)
}

const readCssSafeAreaBottom = () => {
  if (typeof document === 'undefined' || !document.body) return 0
  const probe = document.createElement('div')
  probe.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'pointer-events:none',
    'padding-bottom:env(safe-area-inset-bottom, 0px)'
  ].join(';')
  document.body.appendChild(probe)
  const safeBottom = Number.parseFloat(window.getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return safeBottom
}

const updateNativeSafeAreaFallback = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const root = document.documentElement
  const shouldUseNativeFallback = isIOSLike && (hasTauri || isCapacitorRuntime())
  if (!shouldUseNativeFallback || readCssSafeAreaBottom() > 0) {
    root.style.setProperty('--app-safe-bottom-fallback', '0px')
    return
  }

  const screenWidth = Math.min(window.screen?.width || 0, window.screen?.height || 0)
  const screenHeight = Math.max(window.screen?.width || 0, window.screen?.height || 0)
  const portraitFallback = screenWidth >= 744 && screenHeight >= 1024 ? 20 : 34
  const fallback = screenHeight >= 812 ? portraitFallback : 0
  document.documentElement.style.setProperty('--app-safe-bottom-fallback', `${fallback}px`)
}

const recoverViewportAfterTransition = ({ scrollToTop = true, blurActive = true } = {}) => {
  const activeEl = document.activeElement
  if (blurActive && activeEl && typeof activeEl.blur === 'function') {
    activeEl.blur()
  }
  updateViewportUnit()
  nextTick(() => {
    if (scrollToTop) {
      forceScrollTop()
    }
    requestAnimationFrame(() => {
      if (scrollToTop) {
        forceScrollTop()
      }
      updateViewportUnit()
    })
  })
}

const HOME_SCROLL_STORAGE_KEY = 'hbu_home_scroll_top'

const getAppShellScrollTop = () => {
  const shell = appShellRef.value
  // 首页主滚动容器是 .app-shell，优先读它（即使为 0）
  if (shell && typeof shell.scrollTop === 'number' && Number.isFinite(shell.scrollTop)) {
    return Math.max(0, shell.scrollTop)
  }
  const windowTop = Number(
    window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
  )
  return Number.isFinite(windowTop) ? Math.max(0, windowTop) : 0
}

const rememberHomeScrollPosition = () => {
  if (currentView.value !== 'home') return
  const top = getAppShellScrollTop()
  homeScrollSnapshot.value = top
  try {
    sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, String(top))
  } catch {
    // ignore
  }
}

const readStoredHomeScrollTop = () => {
  const mem = Math.max(0, Number(homeScrollSnapshot.value || 0))
  if (mem > 0) return mem
  try {
    const stored = Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0)
    return Number.isFinite(stored) ? Math.max(0, stored) : 0
  } catch {
    return 0
  }
}

/** 在 Transition out-in 后内容高度才就绪，需多次回写避免被 clamp 成顶部 */
const restoreHomeScrollPosition = () => {
  const targetTop = readStoredHomeScrollTop()
  if (targetTop <= 0) return

  let tries = 0
  const maxTries = 24
  const applyScroll = () => {
    if (currentView.value !== 'home') return
    try {
      if (appShellRef.value) {
        appShellRef.value.scrollTop = targetTop
      }
      window.scrollTo(0, targetTop)
      document.documentElement.scrollTop = targetTop
      document.body.scrollTop = targetTop
    } catch {
      // ignore
    }
    tries += 1
    const current = getAppShellScrollTop()
    // 内容未撑开时 scrollTop 会被压到较小值，继续重试
    if (Math.abs(current - targetTop) > 4 && tries < maxTries) {
      requestAnimationFrame(applyScroll)
    }
  }

  nextTick(() => {
    applyScroll()
    requestAnimationFrame(applyScroll)
    // 覆盖 module-fade out-in 常见时长
    ;[50, 120, 200, 320, 480, 700].forEach((ms) => {
      window.setTimeout(applyScroll, ms)
    })
  })
}

const VIEW_HEALTH_SELECTOR_MAP = Object.freeze({
  home: '.dashboard-root',
  schedule: '.schedule-view',
  classroom: '.classroom-view',
  more_module_host: '.more-module-host-view',
  school_website: '.school-website-view',
  more: '.more-view',
  me: '.me-view'
})

/**
 * #451：更保守的 DOM 健康检查。
 * - 缺壳/transition 根：不健康
 * - 有映射 selector：元素存在且具备基本布局尺寸
 * - 无映射：仅要求至少有一个子节点（不再用恒真的 textContent 条件）
 * - 过渡动画进行中：视为「暂未可知」，偏向 healthy，避免误判触发 remount/reload
 */
const isCurrentViewDomHealthy = (view = currentView.value) => {
  try {
    const root = appShellRef.value || document.querySelector('.app-shell')
    if (!root) return false
    const transitionRoot = root.querySelector('.view-transition-root')
    if (!transitionRoot) return false

    // leave/enter 过渡中子树可能短暂为空，勿判死
    const leaving = transitionRoot.querySelector('.v-leave-active, .v-enter-active, .module-fade-leave-active, .module-fade-enter-active')
    if (leaving) return true

    const expectedSelector = VIEW_HEALTH_SELECTOR_MAP[normalizeViewName(view)]
    if (expectedSelector) {
      const el = transitionRoot.querySelector(expectedSelector)
      if (!el) return false
      // 有节点但完全无布局尺寸时仍可能是半死 WebView
      try {
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 && rect.height <= 0) return false
      } catch {
        // getBoundingClientRect 异常时保守认为「存在即可」
      }
      return true
    }
    return transitionRoot.childElementCount > 0
  } catch {
    // 健康检查自身绝不能抛出导致 resume 崩溃
    return true
  }
}

/**
 * #451：硬 reload 末级兜底，强节流 + 每会话上限，避免白屏循环。
 */
const maybeHardReloadAfterResume = (targetView, { idleMs = 0 } = {}) => {
  if (!isIOSLike) return false
  if (iosHardReloadCount >= IOS_HARD_RELOAD_MAX_PER_SESSION) return false
  if (idleMs < IOS_RESUME_HARD_RELOAD_MS) return false
  if (isCurrentViewDomHealthy(targetView)) return false
  const now = Date.now()
  if (now - iosReloadFallbackAt < IOS_RELOAD_MIN_INTERVAL_MS) return false
  iosReloadFallbackAt = now
  iosHardReloadCount += 1
  try {
    console.warn('[Lifecycle#451] hard reload fallback', {
      view: targetView,
      idleMs,
      count: iosHardReloadCount
    })
  } catch {
    // ignore
  }
  try {
    window.location.reload()
  } catch {
    // ignore
  }
  return true
}

const nudgeWebViewPaint = (
  targetView = currentView.value,
  { verify = false, allowReload = false, idleMs = 0 } = {}
) => {
  const root = document.getElementById('app')
  if (!root) return
  try {
    root.style.opacity = '0.999'
    root.style.transform = 'translateZ(0)'
    requestAnimationFrame(() => {
      try {
        root.style.opacity = '1'
        root.style.transform = ''
      } catch {
        // ignore paint nudge failures
      }
    })
  } catch {
    // ignore
  }
  if (!verify) return
  // 仅在恢复场景下做健康检查；二次确认后再考虑硬 reload（#451）
  setTimeout(() => {
    if (isCurrentViewDomHealthy(targetView)) return
    // 再等一帧布局，减少误判
    setTimeout(() => {
      if (isCurrentViewDomHealthy(targetView)) return
      if (!allowReload) return
      maybeHardReloadAfterResume(targetView, { idleMs })
    }, 400)
  }, 800)
}

const scheduleViewportUpdate = () => {
  // 桌面端避免频繁重算 vh 导致“进入后瞬间缩放”；
  // 移动端仍保留实时同步（地址栏/刘海安全区会变化）。
  if (!isIOSLike && !isAndroidLike) {
    const hasVh = !!document.documentElement.style.getPropertyValue('--app-vh')
    updateNativeSafeAreaFallback()
    if (!hasVh) updateViewportUnit()
    return
  }
  updateNativeSafeAreaFallback()
  updateViewportUnit()
}

const markDesktopWindowResizing = () => {
  if (!isDesktopLike || typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.add('window-resizing')
  if (desktopResizePerfTimer) {
    window.clearTimeout(desktopResizePerfTimer)
  }
  desktopResizePerfTimer = window.setTimeout(() => {
    root.classList.remove('window-resizing')
    desktopResizePerfTimer = null
  }, 180)
}

const handleViewportResize = () => {
  markDesktopWindowResizing()
  if (viewportResizeRaf) return
  viewportResizeRaf = window.requestAnimationFrame(() => {
    viewportResizeRaf = 0
    scheduleViewportUpdate()
  })
}

const collectCurrentViewSnapshot = () => ({
  sid: String(studentId.value || '').trim(),
  view: normalizeViewName(currentView.value),
  tab: String(activeTab.value || '').trim(),
  module:
    currentView.value === 'more_module_host'
      ? String(moduleHostSession.value?.module_id || '').trim()
      : String(currentModule.value || '').trim()
})

const restoreViewFromSnapshot = async (
  snapshot,
  { softRemount = false, allowHardReload = false, idleMs = 0 } = {}
) => {
  const resolved = snapshot || collectCurrentViewSnapshot()
  // 先按合规策略收敛，再处理 more_module_host 预览修复
  let targetViewRaw = resolvePolicySafeSnapshotView(resolved, currentView.value, 'home')
  if (targetViewRaw === 'more_module_host') {
    moduleHostSession.value = await repairModuleHostSession(readModuleHostSession())
  }
  let targetView =
    targetViewRaw === 'more_module_host' && !moduleHostSession.value.preview_url
      ? resolvePolicySafeView('more', 'home')
      : targetViewRaw
  // more 在合规构建下也可能被禁 → 再收敛一次
  targetView = resolvePolicySafeView(targetView, 'home')
  if (resolved?.sid) {
    studentId.value = String(resolved.sid || '').trim()
    try {
      localStorage.setItem('hbu_username', studentId.value)
    } catch {
      // ignore storage failure on resume
    }
  }
  if (!ensureProtectedViewAccess(targetView, {
    push: false,
    redirectToFallback: true,
    fallbackView: 'home'
  })) {
    return
  }
  pendingScrollToTopOnViewChange = false
  applyViewState(targetView)
  replaceHistorySnapshot(targetView)

  // #451：softRemount 带节流，避免 focus/visibility/pageshow 连发叠 nonce
  let didSoftRemount = false
  if (softRemount) {
    const now = Date.now()
    if (now - lastSoftRemountAt >= SOFT_REMOUNT_MIN_INTERVAL_MS) {
      lastSoftRemountAt = now
      viewRenderNonce.value += 1
      didSoftRemount = true
    }
  }
  await nextTick()
  recoverViewportAfterTransition({ scrollToTop: false, blurActive: false })
  if (isIOSLike && (didSoftRemount || !isCurrentViewDomHealthy(targetView))) {
    requestAnimationFrame(() => {
      nudgeWebViewPaint(targetView, {
        verify: true,
        // 仅当确实执行了 softRemount 且允许硬 reload 时才考虑 location.reload
        allowReload: didSoftRemount && allowHardReload,
        idleMs
      })
    })
  }
}

// ─── Widget 跨天调度 ─────────────────────────────────────────────────────
// 对齐 design §9.2：注册 setTimeout 到下一个 00:00 + 60s（Asia/Shanghai），触发 tryWriteSnapshotFromCache

/**
 * 计算距离下一个 Asia/Shanghai 00:00:00 + 60s 的毫秒数
 */
const msUntilNextDayCrossover = () => {
  const now = new Date()
  // 获取 Asia/Shanghai 当前日期
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(now)
  const get = (type) => parts.find(p => p.type === type)?.value ?? '0'
  const h = Number(get('hour'))
  const m = Number(get('minute'))
  const s = Number(get('second'))
  // 当天已过的秒数
  const elapsedSeconds = h * 3600 + m * 60 + s
  // 距离明天 00:00:00 的秒数
  const secondsUntilMidnight = 86400 - elapsedSeconds
  // 加 60s 缓冲
  return (secondsUntilMidnight + 60) * 1000
}

const scheduleWidgetCrossDayTimer = () => {
  if (widgetCrossDayTimer) {
    clearTimeout(widgetCrossDayTimer)
    widgetCrossDayTimer = null
  }
  if (!studentId.value) return
  const delay = msUntilNextDayCrossover()
  widgetCrossDayTimer = setTimeout(() => {
    widgetCrossDayTimer = null
    if (studentId.value && !isTestAccountSession()) {
      tryWriteSnapshotFromCache(studentId.value).catch(() => {})
      // 递归注册下一天
      scheduleWidgetCrossDayTimer()
    }
  }, delay)
}

/**
 * 处理 Widget 深链接 payload
 * 切换到课表视图并注入 date + period 参数
 */
const handleWidgetDeeplinkPayload = (payload) => {
  if (!payload) return
  const date = String(payload.date || '').trim()
  const source = String(payload.source || '').trim()
  const period = Number(payload.period) || 0

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
  if (source && source !== 'widget') return

  console.info('[Widget] Deep link received:', { date, source, period })

  // 注入深链接参数
  widgetDeeplinkDate.value = date
  widgetDeeplinkPeriod.value = period

  // 切换到课表视图
  if (currentView.value !== 'schedule') {
    goToView('schedule', { push: true })
  }
}

/**
 * 处理 Widget 导航 payload（电费 / 考试等）
 */
const handleWidgetNavigatePayload = (payload) => {
  if (!payload) return
  const view = normalizeViewName(String(payload.view || '').trim())
  const source = String(payload.source || 'widget').trim()
  if (!view) return
  if (source && source !== 'widget') return
  if (view !== 'electricity' && view !== 'exams') return
  console.info('[Widget] Navigate received:', { view, source })
  if (currentView.value !== view) {
    goToView(view, { push: true })
  }
}

/**
 * 解析 minihbut:// 小组件 URL
 */
const parseWidgetOpenUrl = (urlStr) => {
  try {
    const url = new URL(urlStr)
    if (url.protocol !== 'minihbut:') return null
    const source = url.searchParams.get('source') || 'widget'
    if (url.hostname === 'schedule') {
      return {
        kind: 'schedule',
        date: url.searchParams.get('date') || '',
        source,
        period: url.searchParams.get('period') || ''
      }
    }
    if (url.hostname === 'electricity') {
      return { kind: 'navigate', view: 'electricity', source }
    }
    if (url.hostname === 'exam') {
      return { kind: 'navigate', view: 'exams', source }
    }
    return null
  } catch {
    return null
  }
}

const handleWidgetOpenPayload = (payload) => {
  if (!payload) return
  if (payload.kind === 'schedule' || payload.date) {
    handleWidgetDeeplinkPayload(payload)
    return
  }
  if (payload.kind === 'navigate' || payload.view) {
    handleWidgetNavigatePayload(payload)
  }
}

/** @deprecated 使用 parseWidgetOpenUrl */
const parseWidgetDeeplinkUrl = (urlStr) => parseWidgetOpenUrl(urlStr)

/**
 * 注册 Widget 深链接监听器（Capacitor appUrlOpen + 原生 bridge 事件）
 */
const installWidgetDeeplinkListeners = () => {
  // 监听原生 bridge 派发的 widgetDeeplink 事件（Android triggerJSEvent / iOS triggerJSEvent）
  window.addEventListener('widgetDeeplink', (e) => {
    try {
      const detail = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail
      handleWidgetDeeplinkPayload(detail)
    } catch {
      try {
        const raw = (e && typeof e === 'object') ? JSON.parse(String(e.data || '{}')) : {}
        handleWidgetDeeplinkPayload(raw)
      } catch {
        // ignore
      }
    }
  })

  window.addEventListener('widgetNavigate', (e) => {
    try {
      const detail = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail
      handleWidgetNavigatePayload(detail)
    } catch {
      try {
        const raw = (e && typeof e === 'object') ? JSON.parse(String(e.data || '{}')) : {}
        handleWidgetNavigatePayload(raw)
      } catch {
        // ignore
      }
    }
  })

  // Capacitor appUrlOpen 事件（冷启动 / 热启动 URL 打开）
  if (isCapacitorRuntime()) {
    import('@capacitor/app').then((mod) => {
      mod.App.addListener('appUrlOpen', (event) => {
        if (!event?.url) return
        const payload = parseWidgetOpenUrl(event.url)
        if (payload) {
          const dispatch = () => handleWidgetOpenPayload(payload)
          if (!appBootstrapped) {
            const waitForBoot = setInterval(() => {
              if (appBootstrapped) {
                clearInterval(waitForBoot)
                dispatch()
              }
            }, 100)
            setTimeout(() => clearInterval(waitForBoot), 5000)
          } else {
            dispatch()
          }
        }
      })
    }).catch(() => {})
  }
}

const runAfterAppBootstrapped = (callback) => {
  if (appBootstrapped) {
    callback()
    return
  }
  const waitForBoot = setInterval(() => {
    if (!appBootstrapped) return
    clearInterval(waitForBoot)
    callback()
  }, 100)
  setTimeout(() => clearInterval(waitForBoot), 5000)
}

const handleNotificationActionPayload = (payload) => {
  const { view } = resolveNotificationActionTarget(payload)
  runAfterAppBootstrapped(() => {
    goToView(view, { push: true })
  })
}

const installNotificationActionListener = () => {
  platformBridge.addNotificationActionListener(handleNotificationActionPayload)
    .then((remove) => {
      removeNotificationActionListener = typeof remove === 'function' ? remove : null
    })
    .catch(() => {
      removeNotificationActionListener = null
    })
}

const handleAppResume = (source = 'visibilitychange') => {
  if (!appBootstrapped || document.hidden) return
  const now = Date.now()
  // 合并 visibility/pageshow/focus 连发，降低恢复路径重入
  if (now - lastResumeHandledAt < 320) return
  lastResumeHandledAt = now
  const idle = hiddenAt ? now - hiddenAt : 0
  hiddenAt = 0
  const snapshot = resumePendingSnapshot || readWindowRouteSnapshot() || collectCurrentViewSnapshot()
  resumePendingSnapshot = null
  scheduleViewportUpdate()
  const targetView = normalizeViewName(snapshot?.view || snapshot?.module || currentView.value)
  // #451：仅长后台 + DOM 明确不健康时 softRemount；硬 reload 另设更高 idle 门槛
  const softRemount =
    isIOSLike && idle >= IOS_RESUME_SOFT_REMOUNT_MS && !isCurrentViewDomHealthy(targetView)
  const allowHardReload = isIOSLike && idle >= IOS_RESUME_HARD_RELOAD_MS
  if (isIOSLike && !softRemount) {
    nudgeWebViewPaint(targetView, { verify: false, allowReload: false, idleMs: idle })
  }
  void restoreViewFromSnapshot(snapshot, {
    softRemount,
    allowHardReload,
    idleMs: idle,
    source
  })
  // 回前台：探测 loopback bridge，并通知内嵌页恢复（官网/模块）
  void recoverEmbeddedWebAfterResume(targetView, idle)
  // 回前台时重算跨天定时器剩余时间
  if (studentId.value) {
    scheduleWidgetCrossDayTimer()
  }
  void runCampusNetworkAutoLogin({
    studentId: studentId.value,
    reason: source
  }).catch((error) => {
    console.warn('[CampusNetwork] auto login failed:', error)
  })
}

const recoverEmbeddedWebAfterResume = async (targetView, idleMs = 0) => {
  try {
    const {
      recoverSchoolWebsiteBridgeOnResume,
      invokeEnsureHttpBridge
    } = await import('./utils/school_website_embed.ts')
    // #453：resume 先 ensure bridge，再 remount 内嵌
    let ensureResult = null
    try {
      ensureResult = await invokeEnsureHttpBridge()
    } catch {
      ensureResult = null
    }
    const bridgeOk = await recoverSchoolWebsiteBridgeOnResume()
    // 挂后台超过 8s 或 bridge 曾不可达：对官网 / 模块宿主发自定义事件强制 remount
    if (idleMs >= 8000 || !bridgeOk || targetView === 'school_website' || targetView === 'more_module_host') {
      window.dispatchEvent(new CustomEvent('hbu-embed-resume', {
        detail: {
          view: targetView,
          bridgeOk,
          idleMs,
          source: 'app-resume',
          ensureStatus: ensureResult?.status || null,
          bridgeEnabled: ensureResult?.enabled !== false,
          // 明确降级信号：bridge 仍不可用时宿主应展示可操作 fallback（重试/外开）
          forceFallback: !bridgeOk && idleMs >= 8000
        }
      }))
    }
  } catch {
    // ignore resume recovery failures
  }
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    hiddenAt = Date.now()
    resumePendingSnapshot = readWindowRouteSnapshot() || collectCurrentViewSnapshot()
    return
  }
  handleAppResume('visibilitychange')
}

const handlePageShow = () => {
  handleAppResume('pageshow')
}

const handleWindowFocus = () => {
  handleAppResume('focus')
}

const resolveHash = (sid, view) => {
  if (!sid) return '#/'
  if (!view || view === 'home') return `#/${sid}`
  return `#/${sid}/${view}`
}

const replaceHistorySnapshot = (view = currentView.value) => {
  const sid = studentId.value || ''
  const state = {
    __hbu: true,
    sid,
    view,
    tab: activeTab.value,
    module:
      view === 'more_module_host'
        ? String(moduleHostSession.value?.module_id || '').trim()
        : currentModule.value
  }
  window.history.replaceState(state, '', resolveHash(sid, view))
}

const pushHistorySnapshot = (view = currentView.value) => {
  const sid = studentId.value || ''
  const state = {
    __hbu: true,
    sid,
    view,
    tab: activeTab.value,
    module:
      view === 'more_module_host'
        ? String(moduleHostSession.value?.module_id || '').trim()
        : currentModule.value
  }
  window.history.pushState(state, '', resolveHash(sid, view))
}

const applyViewState = (view) => {
  currentView.value = view
  if (MAIN_TABS.includes(view)) {
    activeTab.value = view
    currentModule.value = ''
    return
  }
  if (ME_SUB_VIEWS.includes(view)) {
    activeTab.value = 'me'
  }
  currentModule.value =
    view === 'more_module_host'
      ? String(moduleHostSession.value?.module_id || 'more_module_host').trim()
      : view
}

const resolveAccessFallbackView = (view = 'home') => {
  const normalized = normalizeViewName(view)
  if (!normalized || normalized === 'home') return 'home'
  if (isProtectedView(normalized)) return 'home'
  return normalized
}

const queueProtectedViewPrompt = (view, { push = true } = {}) => {
  pendingProtectedView.value = {
    view: normalizeViewName(view),
    push: push !== false
  }
  dailyAccessInput.value = ''
  dailyAccessError.value = ''
  showDailyAccessDialog.value = true
}

const ensureProtectedViewAccess = (
  view,
  { push = true, redirectToFallback = false, fallbackView = currentView.value } = {}
) => {
  const normalized = normalizeViewName(view)
  if (!isProtectedView(normalized) || hasDailyAccessGrant()) {
    return true
  }

  if (redirectToFallback) {
    const fallback = resolveAccessFallbackView(fallbackView)
    pendingScrollToTopOnViewChange = false
    applyViewState(fallback)
    replaceHistorySnapshot(fallback)
  }

  queueProtectedViewPrompt(normalized, { push })
  return false
}

const ensureLoginRequiredViewAccess = (view) => {
  const normalized = normalizeViewName(view)
  if (!isLoginRequiredView(normalized) || isLoggedIn.value) {
    return true
  }
  handleRequireLogin()
  return false
}

const goToViewInternal = (view, { push = true, restoreScroll = false, scrollToTop } = {}) => {
  const normalized = normalizeViewName(view)
  const fromView = currentView.value
  // 离开首页前记住滚动位置
  if (fromView === 'home' && normalized !== 'home') {
    rememberHomeScrollPosition()
  }
  // 从任意子页回到首页：默认恢复滚动；仅显式 scrollToTop:true 才置顶
  const returningHome = normalized === 'home' && fromView !== 'home'
  const shouldRestoreHomeScroll =
    normalized === 'home' &&
    scrollToTop !== true &&
    (restoreScroll || returningHome)
  pendingScrollToTopOnViewChange = !shouldRestoreHomeScroll
  applyViewState(normalized)
  if (push) {
    pushHistorySnapshot(normalized)
  } else {
    replaceHistorySnapshot(normalized)
  }
  if (shouldRestoreHomeScroll) {
    recoverViewportAfterTransition({ scrollToTop: false, blurActive: true })
    restoreHomeScrollPosition()
  } else {
    recoverViewportAfterTransition({ scrollToTop: true, blurActive: true })
  }
  void trackViewNavigation(fromView, normalized)
}

const goToView = (view, { push = true, restoreScroll = false } = {}) => {
  const normalized = normalizeViewName(view)
  // App Store 合规：统一拒绝已禁用 view（宫格/深链/通知/历史恢复共用）
  if (!isViewAllowed(normalized)) {
    showToast('当前版本不可用该功能')
    if (normalized !== 'home' && isViewAllowed('home')) {
      goToViewInternal('home', { push: false, restoreScroll: true })
    }
    return false
  }
  // 首页模块硬禁用 / available 策略（与 Dashboard.navigateTo 同一 canOpenModule）
  const access = canOpenModule(
    { id: normalized, requiresLogin: false },
    { isLoggedIn: isLoggedIn.value }
  )
  if (!access.ok && access.reason && !access.needLogin) {
    showToast(access.reason)
    if (normalized !== 'home' && isViewAllowed('home')) {
      goToViewInternal('home', { push: false, restoreScroll: true })
    }
    return false
  }
  if (!ensureLoginRequiredViewAccess(normalized)) {
    return false
  }
  if (!ensureProtectedViewAccess(normalized, { push, fallbackView: currentView.value })) {
    return false
  }
  goToViewInternal(normalized, { push, restoreScroll })
  return true
}

const resolveParentView = (view) => {
  const normalized = normalizeViewName(view)
  if (!normalized || normalized === 'home') return ''
  if (HIERARCHICAL_PARENT_VIEW_MAP[normalized]) {
    return HIERARCHICAL_PARENT_VIEW_MAP[normalized]
  }
  if (MAIN_TABS.includes(normalized)) {
    return 'home'
  }
  return 'home'
}

const goToParentView = () => {
  const parentView = resolveParentView(currentView.value)
  if (!parentView) return false
  goToViewInternal(parentView, { push: false, restoreScroll: parentView === 'home' })
  return true
}

const parseHashRoute = () => {
  const snapshot = readWindowRouteSnapshot()
  if (!snapshot?.sid) return null
  return {
    sid: snapshot.sid,
    view: normalizeViewName(snapshot.view)
  }
}

const syncFromHash = async ({ scrollToTop = false } = {}) => {
  const route = parseHashRoute()
  if (!route) {
    if (currentView.value !== 'home') {
      pendingScrollToTopOnViewChange = scrollToTop
      applyViewState('home')
    }
    return
  }

  studentId.value = route.sid
  localStorage.setItem('hbu_username', route.sid)
  // hash 深链：#/{sid}/campus_code 等在合规构建下必须落到 home，不能 applyViewState 绕过
  const safeView = resolvePolicySafeView(route.view, 'home')
  if (!ensureProtectedViewAccess(safeView, {
    push: false,
    redirectToFallback: true,
    fallbackView: 'home'
  })) {
    return
  }
  pendingScrollToTopOnViewChange = scrollToTop
  applyViewState(safeView)

  if (safeView === 'grades' && gradeData.value.length === 0) {
    void loadGradesForCurrentView()
  }
}

const markLoginSessionToken = () => {
  try {
    localStorage.setItem(LOGIN_SESSION_TOKEN_KEY, `${Date.now()}`)
  } catch {
    // ignore
  }
}

const restoreTestAccountSession = () => {
  if (!isTestAccountSession()) return false
  const sid = TEST_ACCOUNT.studentId
  studentId.value = sid
  gradeData.value = getTestAccountGrades()
  gradeTeacherCache.value = null
  gradeTeacherCacheSid.value = sid
  localStorage.setItem('hbu_username', sid)
  localStorage.setItem(LOGIN_METHOD_KEY, 'test_account')
  localStorage.setItem(LOGIN_TEMP_FLAG_KEY, '0')
  localStorage.removeItem('hbu_manual_logout')
  localStorage.removeItem(LOGOUT_REASON_KEY)
  seedTestAccountCaches(setCachedData, sid)
  clearJwxtMaintenance()
  stopJwxtRecoveryPolling()
  return true
}

// 处理登录成功
const handleLoginSuccess = (data) => {
  gradeData.value = data
  studentId.value = localStorage.getItem('hbu_username') || ''
  gradeTeacherCache.value = null
  gradeTeacherCacheSid.value = studentId.value
  // 跳转到 Dashboard 显示所有模块
  applyViewState('home')
  replaceHistorySnapshot('home')

  // 预取培养方案默认数据并落地缓存
  if (studentId.value) {
    markLoginSessionToken()
    if (isTestAccountSession()) {
      seedTestAccountCaches(setCachedData, studentId.value)
      gradeData.value = getTestAccountGrades()
    }

    fetchWithCache(`training:options:${studentId.value}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/training_plan/options`, {
        student_id: studentId.value
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
    persistSessionCookies()
    startSessionKeepAlive()
    startElectricityKeepAlive()
    if (studentId.value) {
      void ensureRememberedPasswordCached(studentId.value).catch((e) => {
        console.warn('[Session] 登录后缓存记住密码失败:', e)
      })
      startNotificationMonitor({ studentId: studentId.value }).catch((e) => {
        console.warn('[Notify] 启动通知监控失败:', e)
      })
      resetCloudSyncCooldownForSession(studentId.value)
      runAutoCloudSyncAfterLogin({
        studentId: studentId.value,
        latestGrades: Array.isArray(data) ? data : []
      }).catch((e) => {
        console.warn('[CloudSync] 登录后自动同步失败:', e)
      })
      setUsageTrackingStudentId(studentId.value)
      initUsageTracker({ studentId: studentId.value })
      scheduleUsageUpload({ studentId: studentId.value, reason: 'login', force: true })
    }
  }
  clearJwxtMaintenance()
  stopJwxtRecoveryPolling()
  recoverViewportAfterTransition()
}

const normalizeNavigateTarget = (target) => {
  if (typeof target === 'string') {
    return {
      view: normalizeViewName(target),
      payload: null
    }
  }
  if (target && typeof target === 'object') {
    return {
      view: normalizeViewName(target.view || target.route || target.moduleId || target.module_id),
      payload: target.payload && typeof target.payload === 'object' ? target.payload : null
    }
  }
  return {
    view: 'home',
    payload: null
  }
}

const loadGradesForCurrentView = async (options = {}) => {
  const token = ++gradeNavigationToken
  const sid = String(studentId.value || '').trim()
  if (!sid || currentView.value !== 'grades') return false

  const ok = await fetchGradesFromAPI(sid, options)
  if (token !== gradeNavigationToken || currentView.value !== 'grades') {
    return ok
  }
  if (!ok) {
    showToast('成绩加载失败，请稍后重试', 'error')
  }
  return ok
}

// 处理导航
const handleNavigate = async (target) => {
  const normalized = normalizeNavigateTarget(target)

  if (normalized.view === 'more_module_host') {
    const session = persistModuleHostSession(normalized.payload || {})
    const repairedSession = await repairModuleHostSession(session)
    moduleHostSession.value = repairedSession
    if (!repairedSession.preview_url) {
      goToView('more')
      return
    }
  }

  const navigated = goToView(normalized.view)
  if (!navigated) return

  if (normalized.view === 'grades') {
    void loadGradesForCurrentView()
  }
}

// 处理返回仪表盘
const handleBackToDashboard = () => {
  goToView('home', { restoreScroll: true })
}

const isTemporaryLoginSession = () => {
  const method = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
  const marked = localStorage.getItem(LOGIN_TEMP_FLAG_KEY) === '1'
  return marked || method.endsWith('_temp')
}

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

// 处理登出
const handleLogout = async (options = {}) => {
  const payload = options && typeof options === 'object' ? options : {}
  const manual = payload.manual !== false
  const reason = String(payload.reason || '').trim()
  const notice = String(payload.notice || '').trim()
  const logoutSid = String(studentId.value || localStorage.getItem('hbu_username') || '').trim()
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

  applyViewState('home')
  gradeData.value = []
  gradeTeacherCache.value = null
  gradeTeacherCacheSid.value = ''
  studentId.value = ''
  userUuid.value = ''
  replaceHistorySnapshot('home')

  stopSessionKeepAlive()
  stopElectricityKeepAlive()
  void stopNotificationMonitor()
  stopJwxtRecoveryPolling()
  clearJwxtMaintenance()
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
  if (widgetCrossDayTimer) {
    clearTimeout(widgetCrossDayTimer)
    widgetCrossDayTimer = null
  }
}

// 切换登录模式
const handleSwitchLoginMode = (mode) => {
  loginMode.value = mode
  localStorage.setItem(LOGIN_METHOD_VIEW_KEY, mode)
}

const isManualLogout = () => localStorage.getItem('hbu_manual_logout') === 'true'

const formatCheckTime = (ts = Date.now()) => {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

const normalizeRecoveryPhase = (phase, fallback = 'maintenance') => {
  const p = String(phase || '').trim()
  if (['idle', 'recovering', 'failed', 'need_login', 'maintenance'].includes(p)) return p
  return fallback
}

const markJwxtMaintenance = (hint = '', options = {}) => {
  if (!studentId.value && !options.force) return
  const detail = String(options.detail || jwxtSessionLastError.value || '').trim()
  const phase = normalizeRecoveryPhase(options.phase, detail ? 'failed' : 'maintenance')
  jwxtMaintenanceMode.value = true
  jwxtLastCheckTime.value = formatCheckTime()
  jwxtMaintenanceHint.value = hint || '教务系统正在维护或暂时不可用，当前为缓存数据。'
  jwxtMaintenanceDetail.value = detail
  jwxtRecoveryPhase.value = phase
  if (detail) jwxtSessionLastError.value = detail
  try {
    localStorage.setItem(JWXT_MAINTENANCE_KEY, '1')
    localStorage.setItem(JWXT_MAINTENANCE_TIME_KEY, String(Date.now()))
    if (jwxtMaintenanceHint.value) {
      localStorage.setItem(JWXT_MAINTENANCE_HINT_KEY, jwxtMaintenanceHint.value)
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
  jwxtMaintenanceMode.value = false
  jwxtMaintenanceHint.value = ''
  jwxtLastCheckTime.value = ''
  jwxtMaintenanceDetail.value = ''
  jwxtSessionLastError.value = ''
  jwxtRecoveryPhase.value = 'idle'
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
  if (!studentId.value) return
  clearJwxtMaintenance()
  window.dispatchEvent(new CustomEvent('hbu-session-online', {
    detail: {
      studentId: studentId.value,
      source
    }
  }))
}

const syncJwxtMaintenanceFromStorage = () => {
  const active = localStorage.getItem(JWXT_MAINTENANCE_KEY) === '1'
  if (!active) {
    jwxtMaintenanceMode.value = false
    jwxtMaintenanceHint.value = ''
    jwxtLastCheckTime.value = ''
    jwxtMaintenanceDetail.value = ''
    jwxtRecoveryPhase.value = 'idle'
    return
  }

  jwxtMaintenanceMode.value = true
  const hint = String(localStorage.getItem(JWXT_MAINTENANCE_HINT_KEY) || '').trim()
  jwxtMaintenanceHint.value = hint || '教务系统正在维护或暂时不可用，当前为缓存数据。'
  jwxtMaintenanceDetail.value = String(localStorage.getItem(JWXT_MAINTENANCE_DETAIL_KEY) || '').trim()
  jwxtRecoveryPhase.value = normalizeRecoveryPhase(
    localStorage.getItem(JWXT_MAINTENANCE_PHASE_KEY),
    'maintenance'
  )
  const ts = Number(localStorage.getItem(JWXT_MAINTENANCE_TIME_KEY) || Date.now())
  jwxtLastCheckTime.value = formatCheckTime(ts)
}

const handleJwxtMaintenanceEvent = (event) => {
  const detail = event?.detail || {}
  if (detail.active) {
    const hint = String(detail.hint || '').trim()
    markJwxtMaintenance(hint, {
      detail: detail.detail || detail.error || '',
      phase: detail.phase || 'maintenance'
    })
    if (studentId.value && !isManualLogout()) {
      startJwxtRecoveryPolling()
    }
    return
  }
  clearJwxtMaintenance()
  stopJwxtRecoveryPolling()
}

const formatSessionError = (err) => {
  const raw = String(err?.message || err || '').trim()
  if (!raw) return ''
  // 截断过长堆栈，保留用户可读摘要
  const firstLine = raw.split(/[\r\n]/)[0] || raw
  return firstLine.length > 280 ? `${firstLine.slice(0, 280)}…` : firstLine
}

const handleRetrySessionRecovery = async () => {
  if (isManualLogout() || !studentId.value) {
    handleRequireLogin?.()
    return
  }
  jwxtRecoveryPhase.value = 'recovering'
  markJwxtMaintenance('正在后台恢复会话…', {
    phase: 'recovering',
    detail: jwxtSessionLastError.value || ''
  })
  try {
    const ok = await attemptOnlineRecovery({ silent: false })
    if (!ok) {
      const hasPortal = !!(await getStoredPassword().catch(() => null))
      const hasCx = !!(await getStoredChaoxingPassword().catch(() => null))
      if (!hasPortal && !hasCx) {
        markJwxtMaintenance('会话已过期，本地未保存密码，请手动登录融合门户。', {
          phase: 'need_login',
          detail: jwxtSessionLastError.value || '无可用记住密码'
        })
      } else {
        markJwxtMaintenance('自动登录未成功，将继续在后台重试。当前展示缓存数据。', {
          phase: 'failed',
          detail: jwxtSessionLastError.value || '恢复失败'
        })
        startJwxtRecoveryPolling()
      }
    }
  } catch (e) {
    jwxtSessionLastError.value = formatSessionError(e)
    markJwxtMaintenance('恢复会话时出错，请稍后重试或手动登录。', {
      phase: 'failed',
      detail: jwxtSessionLastError.value
    })
  }
}

const restoreCachedIdentityFromLocal = async () => {
  if (isManualLogout()) return false
  const cachedSid = String(localStorage.getItem('hbu_username') || '').trim()
  if (!cachedSid) return false
  if (!/^\d{10}$/.test(cachedSid)) {
    localStorage.removeItem('hbu_username')
    return false
  }
  if (isTestAccountSession() && cachedSid === TEST_ACCOUNT.studentId) {
    return restoreTestAccountSession()
  }

  studentId.value = cachedSid
  // 异步通知 Rust 侧，不阻塞首屏
  if (hasTauri) {
    invokeNative('set_offline_user_context', {
      student_id: cachedSid,
      studentId: cachedSid
    }).catch((e) => {
      console.warn('[Session] 设置离线上下文失败:', e)
    })
  }
  return true
}

const stopJwxtRecoveryPolling = () => {
  if (jwxtRecoveryTimer) {
    clearInterval(jwxtRecoveryTimer)
    jwxtRecoveryTimer = null
  }
  jwxtRecoveryInFlight = false
}

const attemptOnlineRecovery = async (options = {}) => {
  if (isTestAccountSession()) return restoreTestAccountSession()
  if (!hasTauri || isManualLogout()) return false
  if (jwxtRecoveryInFlight) return false
  jwxtRecoveryInFlight = true
  if (!options.silent) {
    jwxtRecoveryPhase.value = 'recovering'
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
      if (studentId.value) {
        startNotificationMonitor({ studentId: studentId.value }).catch((e) => {
          console.warn('[Notify] 恢复后启动通知监控失败:', e)
        })
      }
      await persistSessionCookies()
      stopJwxtRecoveryPolling()
      notifySessionOnline(relogged ? 'auto-relogin' : 'session-restore')
      // 后台恢复/重登录成功后自动上传成绩和设置到云端（不含自定义课程）
      if (relogged && studentId.value) {
        resetCloudSyncDataForSession(studentId.value)
        runAutoCloudSyncAfterLogin({
          studentId: studentId.value,
          latestGrades: []
        }).catch((e) => {
          console.warn('[CloudSync] 恢复后自动同步失败:', e)
        })
      }
    } else if (!options.silent) {
      markJwxtMaintenance('会话暂不可用，当前展示缓存数据。', {
        phase: 'failed',
        detail: jwxtSessionLastError.value || '恢复未成功'
      })
    }
    return success
  } catch (e) {
    jwxtSessionLastError.value = formatSessionError(e)
    if (!options.silent) {
      markJwxtMaintenance('恢复会话失败', {
        phase: 'failed',
        detail: jwxtSessionLastError.value
      })
    }
    return false
  } finally {
    jwxtRecoveryInFlight = false
  }
}

const startJwxtRecoveryPolling = () => {
  if (isTestAccountSession()) return
  if (isManualLogout() || !studentId.value) return
  stopJwxtRecoveryPolling()
  jwxtRecoveryTimer = setInterval(() => {
    attemptOnlineRecovery({ silent: true }).then((ok) => {
      if (ok) return
      markJwxtMaintenance('后台自动登录仍未成功，将继续重试。', {
        phase: 'failed',
        detail: jwxtSessionLastError.value || '恢复失败'
      })
    }).catch((e) => {
      console.warn('[Session] 教务恢复轮询失败:', e)
      jwxtSessionLastError.value = formatSessionError(e)
      markJwxtMaintenance('后台恢复异常', {
        phase: 'failed',
        detail: jwxtSessionLastError.value
      })
    })
  }, JWXT_RECOVERY_INTERVAL)
}

const ensureConfigAccess = () => {
  if (currentView.value === 'config' && !isConfigAdmin.value) {
    applyViewState('me')
    replaceHistorySnapshot('me')
  }
}

const fetchGradesRemote = async (sid, { teacherCurrentOnly = false } = {}) => {
  const res = await axios.post(`${API_BASE}/v2/quick_fetch`, {
    student_id: sid,
    teacher_current_only: teacherCurrentOnly
  })
  return res.data
}

const normalizeGradeTeacherKey = (value) => {
  const key = String(value ?? '').trim()
  return key || ''
}

const gradeTeacherKeys = (grade = {}) => {
  const keys = [
    normalizeGradeTeacherKey(grade.kcbh),
    normalizeGradeTeacherKey(grade.course_code),
    normalizeGradeTeacherKey(grade.courseCode),
    normalizeGradeTeacherKey(grade.grade_id),
    normalizeGradeTeacherKey(grade.gradeId)
  ].filter(Boolean)
  return [...new Set(keys)]
}

const mergeGradeTeacherCache = (grades = [], cachePayload = gradeTeacherCache.value) => {
  if (!Array.isArray(grades) || !cachePayload || typeof cachePayload !== 'object') {
    return Array.isArray(grades) ? grades : []
  }
  const byKcbh = cachePayload.by_kcbh && typeof cachePayload.by_kcbh === 'object'
    ? cachePayload.by_kcbh
    : {}
  if (!Object.keys(byKcbh).length) return grades
  let changed = false
  const merged = grades.map((grade) => {
    if (!grade || typeof grade !== 'object') return grade
    const currentTeacher = String(grade.course_teacher ?? grade.courseTeacher ?? '').trim()
    if (currentTeacher) return grade
    for (const key of gradeTeacherKeys(grade)) {
      const teacher = String(byKcbh[key] ?? '').trim()
      if (teacher) {
        changed = true
        return { ...grade, course_teacher: teacher }
      }
    }
    return grade
  })
  return changed ? merged : grades
}

const refreshGradeTeacherCache = async ({ currentOnly = false } = {}) => {
  const sid = String(studentId.value || '').trim()
  if (!sid || !hasTauri) return null
  try {
    const payload = currentOnly
      ? await invoke('sync_grade_teachers_current_semester')
      : await invoke('get_grade_teacher_cache')
    if (payload?.success !== false) {
      gradeTeacherCache.value = payload
      gradeTeacherCacheSid.value = sid
      if (Array.isArray(gradeData.value) && gradeData.value.length > 0) {
        gradeData.value = mergeGradeTeacherCache(gradeData.value, payload)
      }
    }
    return payload
  } catch (error) {
    console.warn('[Grades] 任课教师缓存刷新失败:', error)
    return null
  }
}

const scheduleGradeTeacherCacheRefresh = () => {
  if (gradeTeacherRefreshTimer) {
    clearTimeout(gradeTeacherRefreshTimer)
    gradeTeacherRefreshTimer = null
  }
  const delays = [1800, 4200, 8000]
  let index = 0
  const run = () => {
    gradeTeacherRefreshTimer = null
    if (!studentId.value || currentView.value !== 'grades') return
    void refreshGradeTeacherCache({ currentOnly: false }).finally(() => {
      index += 1
      if (index < delays.length && currentView.value === 'grades') {
        gradeTeacherRefreshTimer = setTimeout(run, delays[index])
      }
    })
  }
  gradeTeacherRefreshTimer = setTimeout(run, delays[index])
}

const clearGradeRealtimeRetry = () => {
  if (gradeRealtimeRetryTimer) {
    clearTimeout(gradeRealtimeRetryTimer)
    gradeRealtimeRetryTimer = null
  }
}

const scheduleGradeRealtimeRetry = () => {
  clearGradeRealtimeRetry()
  gradeRealtimeRetryTimer = setTimeout(() => {
    gradeRealtimeRetryTimer = null
    if (currentView.value === 'grades' && gradesOffline.value && studentId.value) {
      void fetchGradesFromAPI(studentId.value, { force: true, teacherCurrentOnly: true, silent: true })
    }
  }, GRADE_CACHE_REFRESH_RETRY_MS)
}

const resolveGradeSyncTime = (data) => {
  const explicit = String(data?.sync_time || data?.updated_at || data?.timestamp || '').trim()
  if (explicit) return explicit
  if (data?.offline) return gradesSyncTime.value || ''
  return new Date().toISOString()
}

const applyStaleGradesSnapshot = (sid) => {
  const stale = getStaleCachedData(`grades:${sid}`)
  const data = stale?.data
  if (!data?.success || !Array.isArray(data.data) || data.data.length === 0) {
    return false
  }
  return applyGradesPayload(data)
}

const applyGradesPayload = (data) => {
  if (data?.success && data?.data) {
    if (gradeTeacherCacheSid.value !== String(studentId.value || '').trim()) {
      gradeTeacherCache.value = null
    }
    gradeData.value = mergeGradeTeacherCache(data.data)
    gradesOffline.value = !!data.offline
    gradesSyncTime.value = resolveGradeSyncTime(data)
    if (!data.offline) {
      clearGradeRealtimeRetry()
      void refreshGradeTeacherCache({ currentOnly: false })
      if (data.teacher_enrichment_pending) {
        scheduleGradeTeacherCacheRefresh()
      }
    } else if (currentView.value === 'grades') {
      scheduleGradeRealtimeRetry()
    }
    return true
  }
  return false
}

// 从API获取成绩数据
const fetchGradesFromAPI = async (sid, { force = false, teacherCurrentOnly = false, silent = false } = {}) => {
  if (!sid) return false
  lastGradeRefreshUsedOffline.value = false
  clearGradeRealtimeRetry()
  const showedStaleSnapshot = !force ? applyStaleGradesSnapshot(sid) : false
  if (!silent || showedStaleSnapshot) {
    isLoading.value = true
  }
  try {
    // 成绩必须以教务完整列表为权威源：始终 forceRemote，避免 SWR/TTL 命中
    // 把已删除成绩（如故障 0 分）从本地缓存复活到 UI（对齐 v1.4.2）。
    const { data } = await fetchWithCache(
      `grades:${sid}`,
      () => fetchGradesRemote(sid, { teacherCurrentOnly }),
      undefined,
      { forceRemote: true, priority: 'foreground' }
    )
    lastGradeRefreshUsedOffline.value = !!data?.offline
    if (data?.success && !data.offline) {
      // 整表替换：先清 grades:{sid}* 学期分片，再写主缓存，避免已删除成绩残留分片被云同步并回。
      clearCacheByPrefix(`grades:${sid}`)
      setCachedData(`grades:${sid}`, data)
      if (Array.isArray(data.data)) {
        const bySem = {}
        data.data.forEach((item) => {
          const sem = String(item?.term || item?.xnxq || item?.semester || '').trim()
          if (!sem) return
          if (!Array.isArray(bySem[sem])) bySem[sem] = []
          bySem[sem].push(item)
        })
        Object.entries(bySem).forEach(([sem, list]) => {
          if (!list.length) return
          setCachedData(`grades:${sid}:${sem}`, { success: true, data: list })
        })
      }
    }
    return applyGradesPayload(data)
  } catch (e) {
    console.error('获取成绩失败:', e)
  } finally {
    if (!silent || showedStaleSnapshot) {
      isLoading.value = false
    }
  }
  return false
}

const handleRequireLogin = () => {
  showLoginPrompt.value = true
  setTimeout(() => {
    showLoginPrompt.value = false
  }, 2200)
}

const handleTabChange = (tab) => {
  goToView(tab)
}

// 打开官方发布页
const handleOpenOfficial = () => {
  goToView('official')
}

const handleBackToMe = () => {
  // 从学校官网等内嵌页返回时，确保桌面子 WebView 已关
  if (currentView.value === 'school_website') {
    void import('./utils/school_website_embed').then((mod) => {
      void mod.forceCloseSchoolWebsiteEmbed?.()
    }).catch(() => {})
  }
  goToView('me')
}

const handleBackToMoreCenter = () => {
  goToView('more')
}

const handleRefreshGrades = async () => {
  const ok = await fetchGradesFromAPI(studentId.value, { force: true, teacherCurrentOnly: true })
  if (ok && !lastGradeRefreshUsedOffline.value) {
    void refreshGradeTeacherCache({ currentOnly: true })
  }
  if (ok && lastGradeRefreshUsedOffline.value) {
    showToast('教务系统暂不可用，已显示缓存', 'warning')
  } else if (ok) {
    showToast('成绩已刷新', 'success')
  } else {
    showToast('成绩刷新失败', 'error')
  }
}

const handleOpenFeedback = () => {
  goToView('feedback')
}

const handleOpenConfig = () => {
  goToView('config')
}

const handleOpenSettings = () => {
  goToView('settings')
}

const openWorkspaceLayoutEditor = (tab = 'home') => {
  workspaceLayoutEditorTab.value = tab === 'notifications' ? 'notifications' : 'home'
  showWorkspaceLayoutEditor.value = true
}

const closeWorkspaceLayoutEditor = () => {
  showWorkspaceLayoutEditor.value = false
}

// 检查更新
const handleCheckUpdate = () => {
  showUpdateDialog.value = true
}

const handleSplashDismissed = () => {
  showSplash.value = false
  if (!hasBootMetric('splash_dismissed')) {
    markBootMetric('splash_dismissed', {
      current_view: currentView.value,
      fast_schedule_boot: skipSplashForFastScheduleBoot
    })
  }
}

/** 关闭启动页：必须立刻摘掉 v-if，不能只靠子组件动画回调（否则会永远卡在加载） */
const dismissSplash = (reason = '') => {
  if (!showSplash.value) {
    handleSplashDismissed()
    return
  }
  try {
    splashRef.value?.dismiss?.()
  } catch (e) {
    console.warn('[Boot] splashRef.dismiss 失败:', e)
  }
  // 立即隐藏：子组件 emit 可能因 ref 未挂载 / 动画被打断而不触发
  showSplash.value = false
  handleSplashDismissed()
  if (reason) {
    console.info('[Boot] dismissSplash:', reason)
  }
}

// 自动检查更新：
// - 合规 iOS 包：仅 App Store Lookup（无 GitHub/CDN）
// - 其它构建：尊重用户频道（默认 stable，开启 dev 后才查 beta）
const autoCheckUpdate = async () => {
  // 官网 Hero 离线演示：禁止版本检查外连
  if (isWebsiteDemoBuild() || isTestAccountSession()) return
  try {
    const currentVersion = await getCurrentVersion()

    if (!allowsInAppGithubUpdater()) {
      const result = await checkAppleStoreUpdate(currentVersion)
      const skipped = getSkippedAppleStoreVersion()
      if (result?.hasUpdate && result.storeVersion && result.storeVersion !== skipped) {
        showUpdateDialog.value = true
      }
      return
    }

    const { getUpdateChannel, getSkippedVersion } = await import('./utils/updater.js')
    const channel = getUpdateChannel()
    const skippedVersion = getSkippedVersion(channel)

    const result = await checkForUpdates(currentVersion, { channel })
    if (result?.hasUpdate && result.latestVersion !== skippedVersion) {
      showUpdateDialog.value = true
    }
  } catch (e) {
    console.warn('[Update] 自动检查更新失败:', e)
  }
}

const handleForceUpdate = async () => {
  if (!allowsInAppGithubUpdater()) {
    const opened = await openAppStoreUpdatePage({
      trackViewUrl: forceUpdateInfo.value?.store_url,
      trackId: forceUpdateInfo.value?.apple_app_id
    })
    if (!opened && forceUpdateResolvedUrl.value) {
      await openExternal(forceUpdateResolvedUrl.value)
    }
    return
  }
  if (forceUpdateResolvedUrl.value) {
    await openExternal(forceUpdateResolvedUrl.value)
    return
  }
  showUpdateDialog.value = true
}

const primeOcrEndpointFromCache = async () => {
  if (!hasTauri) return
  const cached = getStoredOcrConfig()
  try {
    await invokeNative('set_ocr_runtime_config', {
      endpoints: cached.endpoints || [],
      localFallbackEndpoints: cached.local_fallback_endpoints || []
    })
  } catch (e) {
    const cachedEndpoint = String(localStorage.getItem('hbu_ocr_endpoint') || '').trim()
    try {
      await invokeNative('set_ocr_endpoint', { endpoint: cachedEndpoint })
    } catch (fallbackErr) {
      console.warn('[Config] 启动预设 OCR 端点失败:', fallbackErr)
    }
  }
}

const applyRemoteConfig = async () => {
  // 官网 Hero 离线演示：跳过远程配置拉取
  if (isWebsiteDemoBuild()) return
  try {
    const config = await fetchRemoteConfig()
    remoteConfig.value = config
    const remoteAnnouncements = normalizeAnnouncementPayload(config.announcements)
    if (hasAnnouncementContent(remoteAnnouncements)) {
      announcementData.value = remoteAnnouncements
      persistAnnouncementSnapshot(remoteAnnouncements)
    } else {
      const snapshotAnnouncements = restoreAnnouncementSnapshot()
      if (snapshotAnnouncements) {
        announcementData.value = snapshotAnnouncements
      }
    }

    await applyOcrRuntimeConfig(config)
    window.dispatchEvent(new CustomEvent('hbu-ocr-config-updated'))

    // 课表临时文件上传地址：每次启动后由远程配置覆盖。
    // 优先由前端显式透传，Rust 侧也会缓存一份用于兜底。
    const uploadEndpoint = String(config?.temp_file_server?.schedule_upload_endpoint || '').trim()
    if (uploadEndpoint) {
      localStorage.setItem('hbu_temp_upload_endpoint', uploadEndpoint)
    } else {
      localStorage.removeItem('hbu_temp_upload_endpoint')
    }
    try {
      await invokeNative('set_temp_upload_endpoint', { endpoint: uploadEndpoint || null })
    } catch (e) {
      console.warn('[Config] 课表上传地址下发失败:', e)
    }

    const minVersion = config.force_update?.min_version
    if (minVersion) {
      const currentVersion = await getCurrentVersion()
      if (compareVersions(currentVersion, minVersion) < 0) {
        if (!allowsInAppGithubUpdater()) {
          // 合规包：强制更新只引导 App Store，禁止旁加载 download_url
          forceUpdateInfo.value = {
            min_version: minVersion,
            message:
              config.force_update?.message ||
              '当前版本过低，请通过 App Store 更新后继续使用。',
            download_url: '',
            store_url: '',
            apple_app_id: ''
          }
          showForceUpdate.value = true
        } else {
          forceUpdateInfo.value = {
            min_version: minVersion,
            message: config.force_update?.message || '当前版本过低，请更新后继续使用。',
            download_url: config.force_update?.download_url || ''
          }
          showForceUpdate.value = true
        }
      }
    }

    findNextBlockingAnnouncement()
  } catch (e) {
    console.warn('[Config] 远程配置加载失败:', e)
  }
}

const startRemoteConfigRefresh = () => {
  stopRemoteConfigRefresh()
  if (!isRemoteConfigEnabled()) return
  remoteConfigRefreshTimer = setInterval(() => {
    applyRemoteConfig().catch((e) => {
      console.warn('[Config] 定时刷新远程配置失败:', e)
    })
  }, REMOTE_CONFIG_REFRESH_INTERVAL)
}

const stopRemoteConfigRefresh = () => {
  if (!remoteConfigRefreshTimer) return
  clearInterval(remoteConfigRefreshTimer)
  remoteConfigRefreshTimer = null
}

const handleRemoteConfigModeChanged = () => {
  stopRemoteConfigRefresh()
  applyRemoteConfig()
    .catch((e) => {
      console.warn('[Config] 切换配置源后刷新失败:', e)
    })
    .finally(() => {
      startRemoteConfigRefresh()
    })
}

/** 后台远端配置相对快照有变动时，重新应用到 UI/OCR 等 */
const handleRemoteConfigUpdated = () => {
  applyRemoteConfig().catch((e) => {
    console.warn('[Config] 远端配置变更后重新应用失败:', e)
  })
}

const bridgePost = async (path, payload = {}) => {
  const res = await fetch(`${BRIDGE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  return res.json()
}

const restoreSessionViaBridge = async (cookies) => {
  const res = await bridgePost('/restore_session', { cookies })
  if (res?.success && res?.data?.student_id) {
    return res.data
  }
  throw new Error(res?.error?.message || '恢复会话失败')
}

const importCookiesViaBridge = async (snapshot) => {
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
    const cookies = await invokeNative('get_cookies')
    if (cookies) {
      localStorage.setItem(SESSION_COOKIE_KEY, cookies)
      localStorage.setItem(SESSION_COOKIE_TIME_KEY, Date.now().toString())
    }
  } catch (e) {
    console.warn('[Session] 保存 cookies 失败:', e)
  }
}

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
        studentId.value = info.student_id
        localStorage.setItem('hbu_username', info.student_id)
        return true
      }
    } catch (e) {
      console.warn('[Session] 导入 cookies 失败:', e)
    }
    return false
  }
  if (!cookies) {
    if (isTemporaryLoginSession()) {
      handleLogout({
        manual: false,
        reason: TEMP_SESSION_EXPIRED_REASON,
        notice: '扫码临时登录会话已失效，请重新登录。'
      })
    }
    return false
  }

  try {
    const userInfo = hasTauri
      ? await invokeNative('restore_session', { cookies })
      : await restoreSessionViaBridge(cookies)
    if (userInfo?.student_id) {
      studentId.value = userInfo.student_id
      localStorage.setItem('hbu_username', userInfo.student_id)
      return true
    }
  } catch (e) {
    if (isTemporaryLoginSession()) {
      console.warn('[Session] 临时登录恢复失败，自动退出:', e)
      handleLogout({
        manual: false,
        reason: TEMP_SESSION_EXPIRED_REASON,
        notice: '扫码临时登录会话已失效，请重新登录。'
      })
      return false
    }
    jwxtSessionLastError.value = formatSessionError(e)
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
    const userInfo = await invokeNative('restore_latest_session')
    if (userInfo?.student_id) {
      studentId.value = userInfo.student_id
      localStorage.setItem('hbu_username', userInfo.student_id)
      await persistSessionCookies()
      return true
    }
  } catch (e) {
    console.warn('[Session] 自动恢复历史会话失败:', e)
  }
  return false
}

const getStoredPassword = () => loadPortalStoredPassword()

const getStoredChaoxingPassword = () => loadChaoxingStoredPassword()

const isLikelyStudentId = (value) => /^\d{10}$/.test(String(value || '').trim())

const resolveAutoLoginStudentId = async (payload) => {
  const payloadSid = String(payload?.student_id || payload?.studentId || '').trim()
  if (isLikelyStudentId(payloadSid)) return payloadSid
  const cachedSid = String(localStorage.getItem('hbu_username') || '').trim()
  if (isLikelyStudentId(cachedSid)) return cachedSid
  try {
    const info = await invokeNative('fetch_student_info')
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
      const payload = await invokeNative('chaoxing_password_login', {
        account: chaoxingCreds.account,
        password: chaoxingCreds.password
      })
      const sid = await resolveAutoLoginStudentId(payload)
      if (sid) {
        studentId.value = sid
        localStorage.setItem('hbu_username', sid)
      } else {
        throw new Error('学习通自动登录未解析到 10 位学号')
      }
      await persistSessionCookies()
      return true
    } catch (e) {
      jwxtSessionLastError.value = formatSessionError(e)
      console.warn('[Session] 学习通自动登录失败:', e)
      return false
    }
  }

  const creds = await getStoredPassword()
  if (!creds) {
    jwxtSessionLastError.value = '本地未找到融合门户记住密码'
    return false
  }

  const doLogin = async () => {
    const userInfo = await invokeNative('login', {
      username: creds.username,
      password: creds.password,
      captcha: '',
      lt: '',
      execution: ''
    })
    await persistSessionCookies()
    const sid = String(userInfo?.student_id || creds.username || '').trim()
    if (sid) {
      studentId.value = sid
      localStorage.setItem('hbu_username', sid)
    }
  }

  try {
    await doLogin()
    return true
  } catch (e) {
    // 检测登录冷却错误，等待后重试一次
    const msg = String(e?.message || e || '')
    const cooldownMatch = msg.match(/登录频率过高，请(\d+)秒后再试/)
    if (cooldownMatch) {
      const waitSec = parseInt(cooldownMatch[1], 10)
      if (waitSec > 0 && waitSec <= 120) {
        console.info(`[Session] 登录冷却中，${waitSec}秒后重试...`)
        jwxtSessionLastError.value = `登录冷却中，${waitSec} 秒后重试`
        markJwxtMaintenance(`登录冷却，${waitSec} 秒后自动重试…`, {
          phase: 'recovering',
          detail: jwxtSessionLastError.value
        })
        await new Promise(r => setTimeout(r, (waitSec + 2) * 1000))
        try {
          await doLogin()
          return true
        } catch (e2) {
          jwxtSessionLastError.value = formatSessionError(e2)
          console.warn('[Session] 冷却后重试仍失败:', e2)
          return false
        }
      }
    }
    jwxtSessionLastError.value = formatSessionError(e)
    console.warn('[Session] 自动登录失败:', e)
    return false
  }
}

const refreshSessionSilently = async () => {
  if (isTestAccountSession()) return
  const cookies = localStorage.getItem(SESSION_COOKIE_KEY)
  if (!cookies) return
  if (!hasTauri) return

  try {
    await invokeNative('refresh_session')
    await persistSessionCookies()
  } catch (e) {
    if (isTemporaryLoginSession()) {
      console.warn('[Session] 临时登录会话已失效，自动退出:', e)
      handleLogout({
        manual: false,
        reason: TEMP_SESSION_EXPIRED_REASON,
        notice: '扫码临时登录会话已失效，请重新登录。'
      })
      return
    }
    jwxtSessionLastError.value = formatSessionError(e)
    console.warn('[Session] 会话刷新失败，尝试自动登录:', e)
    markJwxtMaintenance('会话失效，正在后台自动登录…', {
      phase: 'recovering',
      detail: jwxtSessionLastError.value
    })
    const relogged = await attemptAutoRelogin()
    if (!relogged) {
      stopSessionKeepAlive()
      markJwxtMaintenance('后台自动登录未成功，将定时重试。当前为缓存数据。', {
        phase: 'failed',
        detail: jwxtSessionLastError.value
      })
      startJwxtRecoveryPolling()
    } else {
      clearJwxtMaintenance()
      // 后台重登录成功后自动上传成绩和设置到云端（不含自定义课程）
      if (studentId.value) {
        resetCloudSyncCooldownForSession(studentId.value)
        runAutoCloudSyncAfterLogin({
          studentId: studentId.value,
          latestGrades: []
        }).catch((e) => {
          console.warn('[CloudSync] 后台重登录后自动同步失败:', e)
        })
      }
    }
  }
}

const startSessionKeepAlive = () => {
  stopSessionKeepAlive()
  sessionKeepAliveTimer = setInterval(refreshSessionSilently, SESSION_REFRESH_INTERVAL)
}

const stopSessionKeepAlive = () => {
  if (sessionKeepAliveTimer) {
    clearInterval(sessionKeepAliveTimer)
    sessionKeepAliveTimer = null
  }
}

const startElectricityKeepAlive = () => {
  stopElectricityKeepAlive()
  electricityKeepAliveTimer = setInterval(async () => {
    try {
      await invokeNative('refresh_electricity_token')
    } catch (e) {
      console.warn('[Electricity] Token refresh failed:', e)
    }
  }, ELECTRICITY_REFRESH_INTERVAL)
}

const stopElectricityKeepAlive = () => {
  if (electricityKeepAliveTimer) {
    clearInterval(electricityKeepAliveTimer)
    electricityKeepAliveTimer = null
  }
}

const showTabBar = computed(() => MAIN_TABS.includes(currentView.value))
const showHomeLayoutDebug = computed(() => (
  currentView.value === 'home' &&
  !homeLayoutDebugHidden.value &&
  homeLayoutDebugForced
))

const refreshHomeLayoutDebugReport = () => {
  homeLayoutDebugReport.value = collectHomeLayoutDiagnostics({
    currentView: currentView.value,
    activeTab: activeTab.value,
    isIOSLike,
    isAndroidLike,
    hasTauri,
    isCapacitorRuntime: isCapacitorRuntime(),
    studentIdPresent: !!String(studentId.value || '').trim(),
    showTabBar: showTabBar.value,
    appShellScrollTop: Number(appShellRef.value?.scrollTop || 0)
  })
}

const copyHomeLayoutDebugReport = async () => {
  refreshHomeLayoutDebugReport()
  const text = homeLayoutDebugReport.value
  try {
    await navigator.clipboard.writeText(text)
    homeLayoutDebugExpanded.value = true
    showToast('首页布局调试信息已复制', 'success', 2600)
  } catch (error) {
    homeLayoutDebugExpanded.value = true
    showToast('自动复制失败，请手动复制文本框内容', 'warning', 3600)
    console.warn('[LayoutDebug] copy failed:', error)
  }
}

const toggleHomeLayoutDebugReport = () => {
  homeLayoutDebugExpanded.value = !homeLayoutDebugExpanded.value
  if (homeLayoutDebugExpanded.value) {
    refreshHomeLayoutDebugReport()
  }
}

const hideHomeLayoutDebug = () => {
  homeLayoutDebugHidden.value = true
  homeLayoutDebugExpanded.value = false
  try {
    localStorage.setItem(HOME_LAYOUT_DEBUG_HIDDEN_KEY, '1')
  } catch {
    // ignore storage failure
  }
  showToast('已隐藏首页布局调试入口', 'info', 2200)
}

const handlePopState = async () => {
  if (!isDesktopLike) {
    const fromView = currentView.value
    const handled = goToParentView()
    if (!handled) {
      // 无父级时回首页并恢复滚动
      goToViewInternal('home', { push: false, restoreScroll: true })
      return
    }
    // goToParentView 已处理首页恢复；勿再 forceScrollTop 冲掉位置
    if (currentView.value === 'home' || fromView !== 'home') {
      // 仅在非首页落地时再校正视口
      if (currentView.value !== 'home') {
        recoverViewportAfterTransition({ scrollToTop: true, blurActive: true })
      } else {
        recoverViewportAfterTransition({ scrollToTop: false, blurActive: true })
        restoreHomeScrollPosition()
      }
    }
    return
  }

  const prev = currentView.value
  await syncFromHash({ scrollToTop: false })
  if (currentView.value === 'home' && prev !== 'home') {
    recoverViewportAfterTransition({ scrollToTop: false, blurActive: true })
    restoreHomeScrollPosition()
  } else {
    recoverViewportAfterTransition({ scrollToTop: true, blurActive: true })
  }
}

const installCloseInterceptor = async () => {
  if (!hasTauri) return
  try {
    const appWindow = await getCurrentNativeWindow()
    if (!appWindow) return
    unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
      if (isClosingByUser) return

      if (currentView.value !== 'home') {
        event.preventDefault()
        if ((window.history.length > 1) && (window.location.hash || '#/') !== '#/') {
          window.history.back()
        } else {
          goToView('home', { restoreScroll: true })
        }
        return
      }

      event.preventDefault()
      showExitDialog.value = true
      replaceHistorySnapshot('home')
    })
  } catch (e) {
    console.warn('[Navigation] 安装关闭拦截失败:', e)
  }
}

const cancelExitDialog = () => {
  showExitDialog.value = false
}

const closeDailyAccessDialog = () => {
  showDailyAccessDialog.value = false
  dailyAccessInput.value = ''
  dailyAccessError.value = ''
  pendingProtectedView.value = null
}

const handleDailyAccessInput = (event) => {
  dailyAccessInput.value = sanitizeDailyAccessInput(event?.target?.value || '')
  if (dailyAccessError.value) {
    dailyAccessError.value = ''
  }
}

const submitDailyAccessKey = () => {
  const normalized = sanitizeDailyAccessInput(dailyAccessInput.value)
  dailyAccessInput.value = normalized
  if (!verifyDailyAccessKey(normalized)) {
    dailyAccessError.value = '今日秘钥不正确，请重新输入。'
    return
  }

  const targetView = normalizeViewName(pendingProtectedView.value?.view || 'home')
  const push = pendingProtectedView.value?.push !== false
  markDailyAccessGranted()
  showDailyAccessDialog.value = false
  dailyAccessError.value = ''
  pendingProtectedView.value = null
  goToViewInternal(targetView, { push })
}

const confirmExitDialog = async () => {
  if (exitingApp.value) return
  exitingApp.value = true
  isClosingByUser = true
  try {
    await exitNativeApp()
  } catch (e) {
    console.warn('[Navigation] 退出应用失败:', e)
    try {
      const appWindow = await getCurrentNativeWindow()
      if (appWindow) {
        await appWindow.destroy()
      }
    } catch (fallbackErr) {
      console.warn('[Navigation] destroy 回退失败:', fallbackErr)
    }
  } finally {
    showExitDialog.value = false
    exitingApp.value = false
    isClosingByUser = false
  }
}

// 页面加载时检查 URL
watch(currentView, () => {
  const shouldScrollTop = pendingScrollToTopOnViewChange
  pendingScrollToTopOnViewChange = false
  if (!shouldScrollTop) return
  nextTick(() => {
    if (appShellRef.value) {
      appShellRef.value.scrollTop = 0
    }
  })
})

onMounted(async () => {
  console.time('[Boot] total')
  console.time('[Boot] to-splash-dismiss')
  // 启动页硬超时 2.5s：绝不因网络/会话卡在加载遮罩
  const splashFailsafeTimer = window.setTimeout(() => {
    if (!showSplash.value) return
    console.warn('[Boot] splash failsafe 2.5s：强制进入应用')
    splashStatusText.value = '准备就绪'
    dismissSplash('failsafe-2.5s')
    if (!appBootstrapped) {
      appBootstrapped = true
      replaceHistorySnapshot(currentView.value)
      ensureConfigAccess()
    }
  }, 2500)
  document.addEventListener('click', handleGlobalLinkClick, true)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('popstate', handlePopState)
  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('resize', handleViewportResize)
  window.addEventListener('orientationchange', handleViewportResize)
  window.addEventListener(JWXT_MAINTENANCE_EVENT, handleJwxtMaintenanceEvent)
  window.addEventListener(REMOTE_CONFIG_MODE_EVENT, handleRemoteConfigModeChanged)
  window.addEventListener(REMOTE_CONFIG_UPDATED_EVENT, handleRemoteConfigUpdated)
  removeHomeLayoutDiagnosticsErrorCapture = installHomeLayoutDiagnosticsErrorCapture()
  scheduleViewportUpdate()
  installWidgetDeeplinkListeners()
  installNotificationActionListener()
  clearJwxtMaintenance()
  const cachedAnnouncements = restoreAnnouncementSnapshot()
  if (cachedAnnouncements) {
    announcementData.value = cachedAnnouncements
  }

  // ── 阶段 1：本地身份恢复（纯 localStorage，极快） ──
  console.time('[Boot] local-identity')
  let bootstrappedCachedIdentity = false
  try {
    bootstrappedCachedIdentity = await restoreCachedIdentityFromLocal()
  } catch (e) {
    console.warn('[Boot] local-identity 失败:', e)
  }
  console.timeEnd('[Boot] local-identity')
  markBootMetric('identity_restored', {
    restored: !!bootstrappedCachedIdentity,
    student_id: String(studentId.value || '').trim()
  })

  // ── 阶段 2：尽快进入主界面（不阻塞会话恢复） ──
  try {
    await syncFromHash({ scrollToTop: false })
  } catch (e) {
    console.warn('[Boot] syncFromHash 失败:', e)
  }
  if (!window.location.hash) {
    pendingScrollToTopOnViewChange = false
    const startupPage = resolvePolicySafeView(useUiSettings().startupPage || 'home', 'home')
    if (ensureProtectedViewAccess(startupPage, {
      push: false,
      redirectToFallback: true,
      fallbackView: 'home'
    })) {
      applyViewState(startupPage)
    }
  }
  splashStatusText.value = bootstrappedCachedIdentity ? '准备就绪' : '正在进入…'
  dismissSplash(bootstrappedCachedIdentity ? 'cached-identity' : 'enter-ui-first')
  console.timeEnd('[Boot] to-splash-dismiss')
  appBootstrapped = true
  replaceHistorySnapshot(currentView.value)
  ensureConfigAccess()
  window.clearTimeout(splashFailsafeTimer)

  // ── 阶段 3：后台并行执行网络任务（不再挡住启动页） ──
  console.time('[Boot] background-tasks')
  if (bootstrappedCachedIdentity && studentId.value && !isTestAccountSession()) {
    // 仅更新状态点/内部 phase，不弹整页文案（首页圆点负责展示）
    jwxtRecoveryPhase.value = 'recovering'
  }
  const sessionRestoreTask = (async () => {
    console.time('[Boot] session-restore')
    let restored = false
    let relogged = false
    if (isTestAccountSession()) {
      restored = restoreTestAccountSession()
      console.timeEnd('[Boot] session-restore')
      return { restored, relogged }
    }
    restored = await tryRestoreSession()
    if (!restored) {
      restored = await tryRestoreLatestSession()
    }
    if (!restored && !isTemporaryLoginSession()) {
      jwxtRecoveryPhase.value = 'recovering'
      relogged = await attemptAutoRelogin()
    }
    console.timeEnd('[Boot] session-restore')
    return { restored, relogged }
  })()

  void sessionRestoreTask
    .then((result) => {
      if (!result?.restored && !result?.relogged) {
        if (bootstrappedCachedIdentity && studentId.value) {
          // 后台恢复失败：标记红点，不强制踢登录
          markJwxtMaintenance('会话未恢复，可点击状态点查看详情', {
            phase: 'failed',
            detail: jwxtSessionLastError.value || '自动登录未成功'
          })
        }
        return
      }
      clearJwxtMaintenance()
      if (isTestAccountSession()) return
      startSessionKeepAlive()
      startElectricityKeepAlive()
      if (studentId.value) {
        markLoginSessionToken()
        startNotificationMonitor({ studentId: studentId.value }).catch(() => {})
      }
      notifySessionOnline(result.relogged ? 'boot-auto-relogin' : 'boot-session-restore')
    })
    .catch((e) => console.warn('[Boot] session-restore late fail:', e))

  void (async () => {
    if (isWebsiteDemoBuild()) {
      console.info('[Boot] website-demo: skip remote-config')
      return
    }
    console.time('[Boot] remote-config')
    try {
      await applyRemoteConfig()
    } catch (e) {
      console.warn('[Config] 远程配置后台加载失败:', e)
    } finally {
      startRemoteConfigRefresh()
      console.timeEnd('[Boot] remote-config')
    }
  })()

  void Promise.all([primeOcrEndpointFromCache(), installCloseInterceptor()]).catch((e) => {
    console.warn('[Boot] infra 后台任务失败:', e)
  })

  // 非阻塞：仅用于阶段 5 的 onlineReady 判断（最多等 3s）
  const sessionResult = await Promise.race([
    sessionRestoreTask,
    new Promise((resolve) => {
      window.setTimeout(() => resolve({ restored: false, relogged: false, timedOut: true }), 3000)
    })
  ])
  const { restored, relogged } = sessionResult || {}
  const onlineReady = !!(restored || relogged)
  console.timeEnd('[Boot] background-tasks')
  markBootMetric('session_restore_finished', {
    restored: !!restored,
    relogged: !!relogged,
    online_ready: !!onlineReady,
    student_id: String(studentId.value || '').trim(),
    timed_out: !!(sessionResult && sessionResult.timedOut)
  })

  // 再兜底一次（防止任何路径漏关）
  if (showSplash.value) {
    dismissSplash('post-boot-guard')
  }

  if (currentView.value === 'more_module_host') {
    moduleHostSession.value = await repairModuleHostSession(moduleHostSession.value)
    if (!moduleHostSession.value.preview_url) {
      pendingScrollToTopOnViewChange = false
      applyViewState(resolvePolicySafeView('more', 'home'))
    } else if (!isViewAllowed('more_module_host')) {
      pendingScrollToTopOnViewChange = false
      applyViewState('home')
    }
  }

  // ── 阶段 5：后台启动长期任务 ──
  if (onlineReady && !isTestAccountSession()) {
    startSessionKeepAlive()
    startElectricityKeepAlive()
    if (studentId.value) {
      markLoginSessionToken()
      void ensureRememberedPasswordCached(studentId.value).catch((e) => {
        console.warn('[Session] 启动后缓存记住密码失败:', e)
      })
      startNotificationMonitor({ studentId: studentId.value }).catch((e) => {
        console.warn('[Notify] 启动通知监控失败:', e)
      })
    }
    clearJwxtMaintenance()
    stopJwxtRecoveryPolling()
    if (bootstrappedCachedIdentity || skipSplashForFastScheduleBoot) {
      notifySessionOnline(relogged ? 'boot-auto-relogin' : 'boot-session-restore')
    }
  } else if (!isTestAccountSession() && (bootstrappedCachedIdentity || studentId.value)) {
    // #355：长闲/会话失效时保留首页缓存身份，后台静默恢复；禁止强制踢回登录页
    let hasCreds = false
    try {
      const portalCreds = await getStoredPassword()
      const cxCreds = await getStoredChaoxingPassword()
      hasCreds = !!(portalCreds || cxCreds)
    } catch (e) {
      console.warn('[Session] 检查本地凭据失败:', e)
      hasCreds = false
    }

    if (hasCreds) {
      markJwxtMaintenance('会话需恢复，正在后台自动登录…', {
        phase: 'recovering',
        detail: jwxtSessionLastError.value || 'cookie 已失效，使用记住密码重登'
      })
      startJwxtRecoveryPolling()
      attemptOnlineRecovery({ silent: true }).then((ok) => {
        if (ok) return
        markJwxtMaintenance('自动登录未成功，将继续后台重试。当前展示缓存数据。', {
          phase: 'failed',
          detail: jwxtSessionLastError.value || '恢复失败'
        })
      }).catch((e) => {
        jwxtSessionLastError.value = formatSessionError(e)
        markJwxtMaintenance('后台恢复异常，将定时重试。', {
          phase: 'failed',
          detail: jwxtSessionLastError.value
        })
      })
    } else {
      // 无密码：不踢出，首页维护窗提示手动登录（保留缓存成绩/课表）
      console.warn('[Session] 会话失效且无记住密码，首页提示手动登录（#355，不再强制 logout）')
      markJwxtMaintenance(
        '登录状态已失效，本地未找到可用密码。请手动登录融合门户以同步最新数据；此前缓存仍可查看。',
        {
          phase: 'need_login',
          detail: jwxtSessionLastError.value || '无记住密码，无法后台自动登录'
        }
      )
    }
  }

  if (!appBootstrapped) {
    replaceHistorySnapshot(currentView.value)
    ensureConfigAccess()
    appBootstrapped = true
  }

  // Widget 快照（异步不阻塞）
  if (studentId.value && !isTestAccountSession()) {
    tryWriteSnapshotFromCache(studentId.value).catch(() => {})
    scheduleWidgetCrossDayTimer()
  }

  // 延迟检查更新
  window.setTimeout(() => { autoCheckUpdate() }, 1500)
  initUsageTracker({ studentId: studentId.value })
  startUsageUploadScheduler(() => studentId.value)
  void runCampusNetworkAutoLogin({
    studentId: studentId.value,
    reason: 'app-boot'
  }).catch((error) => {
    console.warn('[CampusNetwork] boot auto login failed:', error)
  })
  console.timeEnd('[Boot] total')

  // Capacitor 环境注册原生 appStateChange 事件（补充浏览器 visibilitychange 的盲区）
  if (isCapacitorRuntime()) {
    import('@capacitor/app').then((mod) => {
      mod.App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          handleAppResume('capacitor-appStateChange')
        } else {
          hiddenAt = Date.now()
          resumePendingSnapshot = readWindowRouteSnapshot() || collectCurrentViewSnapshot()
        }
      }).then((handle) => {
        capacitorAppStateListener = handle
      }).catch(() => {})
    }).catch(() => {})
  }
})

onBeforeUnmount(() => {
  stopUsageUploadScheduler()
  document.removeEventListener('click', handleGlobalLinkClick, true)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('pageshow', handlePageShow)
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('resize', handleViewportResize)
  window.removeEventListener('orientationchange', handleViewportResize)
  window.removeEventListener(JWXT_MAINTENANCE_EVENT, handleJwxtMaintenanceEvent)
  window.removeEventListener(REMOTE_CONFIG_MODE_EVENT, handleRemoteConfigModeChanged)
  window.removeEventListener(REMOTE_CONFIG_UPDATED_EVENT, handleRemoteConfigUpdated)
  if (viewportResizeRaf) {
    window.cancelAnimationFrame(viewportResizeRaf)
    viewportResizeRaf = 0
  }
  if (desktopResizePerfTimer) {
    window.clearTimeout(desktopResizePerfTimer)
    desktopResizePerfTimer = null
  }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('window-resizing')
  }
  if (typeof unlistenCloseRequested === 'function') {
    unlistenCloseRequested()
    unlistenCloseRequested = null
  }
  if (typeof removeNotificationActionListener === 'function') {
    removeNotificationActionListener()
    removeNotificationActionListener = null
  }
  void stopNotificationMonitor()
  stopJwxtRecoveryPolling()
  stopRemoteConfigRefresh()
  if (widgetCrossDayTimer) {
    clearTimeout(widgetCrossDayTimer)
    widgetCrossDayTimer = null
  }
  if (gradeTeacherRefreshTimer) {
    clearTimeout(gradeTeacherRefreshTimer)
    gradeTeacherRefreshTimer = null
  }
  clearGradeRealtimeRetry()
  if (capacitorAppStateListener) {
    capacitorAppStateListener.remove().catch(() => {})
    capacitorAppStateListener = null
  }
  if (typeof removeHomeLayoutDiagnosticsErrorCapture === 'function') {
    removeHomeLayoutDiagnosticsErrorCapture()
    removeHomeLayoutDiagnosticsErrorCapture = null
  }
})
</script>

<template>
  <!-- 启动画面 -->
  <SplashScreen
    v-if="showSplash"
    ref="splashRef"
    :status="splashStatus"
    :status-text="splashStatusText"
    @dismiss="handleSplashDismissed"
  />

  <main
    class="app-shell"
    :class="{
      'no-scroll': currentView === 'ai',
      'ai-full': currentView === 'ai',
      'schedule-full': currentView === 'schedule',
      'module-host-full': currentView === 'more_module_host',
      'ios-safe': isIOSLike
    }"
    ref="appShellRef"
  >
    <DemoModeBanner v-if="isLoggedIn && isTestAccountSession()" />
    <Transition name="module-fade" mode="out-in">
      <div :key="`${currentView}:${viewRenderNonce}`" class="view-transition-root">
      <!-- 首页 -->
      <Dashboard 
        v-if="currentView === 'home'"
        :student-id="studentId"
        :user-uuid="userUuid"
        :is-logged-in="isLoggedIn"
        :jwxt-maintenance="jwxtMaintenanceMode"
        :jwxt-maintenance-hint="jwxtMaintenanceHint"
        :jwxt-maintenance-detail="jwxtMaintenanceDetail"
        :jwxt-recovery-phase="jwxtRecoveryPhase"
        :jwxt-last-check-time="jwxtLastCheckTime"
        :ticker-notices="announcementData.ticker"
        :pinned-notices="announcementData.pinned"
        :notice-list="announcementData.list"
        @navigate="handleNavigate"
        @logout="handleLogout"
        @require-login="handleRequireLogin"
        @retry-session-recovery="handleRetrySessionRecovery"
        @open-notice="openAnnouncement"
        @openSettings="openWorkspaceLayoutEditor('home')"
      />

      <!-- 课表（Tab） -->
      <ScheduleView 
        v-else-if="currentView === 'schedule'"
        :student-id="studentId"
        :widget-date="widgetDeeplinkDate"
        :widget-period="widgetDeeplinkPeriod"
        @back="handleBackToDashboard"
        @logout="handleLogout"
        @widget-deeplink-consumed="widgetDeeplinkDate = ''; widgetDeeplinkPeriod = 0"
      />

      <!-- 全校课表 -->
      <GlobalScheduleView
        v-else-if="currentView === 'qxzkb'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <CourseSelectionView
        v-else-if="currentView === 'course_selection'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 校园论坛（Tab） -->
      <ForumView
        v-else-if="currentView === 'forum'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @require-login="handleRequireLogin"
      />

      <!-- 个人中心（Tab） -->
      <MeView 
        v-else-if="currentView === 'me'"
        :student-id="studentId"
        :is-logged-in="isLoggedIn"
        :login-mode="loginMode"
        :config-admin-ids="configAdminIds"
        @success="handleLoginSuccess"
        @switchMode="handleSwitchLoginMode"
        @navigate="handleNavigate"
        @logout="handleLogout"
        @checkUpdate="handleCheckUpdate"
        @openOfficial="handleOpenOfficial"
        @openFeedback="handleOpenFeedback"
        @openConfig="handleOpenConfig"
        @openSettings="handleOpenSettings"
      />

      <!-- 官方发布页 -->
      <OfficialView 
        v-else-if="currentView === 'official'"
        @back="handleBackToMe"
      />

      <!-- 问题反馈页 -->
      <FeedbackView 
        v-else-if="currentView === 'feedback'"
        @back="handleBackToMe"
      />

      <ConfigEditor
        v-else-if="currentView === 'config' && isConfigAdmin"
        @back="handleBackToMe"
      />

      <SettingsView
        v-else-if="currentView === 'settings'"
        @back="handleBackToMe"
        @openWorkspaceLayout="openWorkspaceLayoutEditor"
      />

      <PrivacyDataView
        v-else-if="currentView === 'privacy_data'"
        @back="handleBackToMe"
        @logout="handleLogout"
        @cleared="handleLogout"
      />

      <ExportCenterView
        v-else-if="currentView === 'export_center'"
        :student-id="studentId"
        @back="handleBackToMe"
        @logout="handleLogout"
      />

      <ServiceStatsView
        v-else-if="currentView === 'service_stats'"
        :student-id="studentId"
        @back="handleBackToMe"
      />

      <SchoolWebsiteView
        v-else-if="currentView === 'school_website' && isLoggedIn"
        @back="handleBackToMe"
      />

      <QuickLinksView
        v-else-if="currentView === 'quick_links' && isLoggedIn"
        @back="handleBackToMe"
      />

      <CampusNetworkView
        v-else-if="currentView === 'campus_network' && isLoggedIn"
        :student-id="studentId"
        @back="handleBackToMe"
      />

      <MoreView
        v-else-if="currentView === 'more'"
        :student-id="studentId"
        @back="handleBackToMe"
        @navigate="handleNavigate"
      />

      <MoreModuleHostView
        v-else-if="currentView === 'more_module_host'"
        :session="moduleHostSession"
        @back="handleBackToMoreCenter"
      />

      <MoreChaoxingCheckinView
        v-else-if="currentView === 'more_chaoxing_checkin'"
        :student-id="studentId"
        @back="handleBackToMoreCenter"
      />

      <!-- 成绩查看 -->
      <GradeView 
        v-else-if="currentView === 'grades'"
        :grades="gradeData"
        :student-id="studentId"
        :offline="gradesOffline"
        :sync-time="gradesSyncTime"
        :refreshing="isLoading"
        @back="handleBackToDashboard"
        @logout="handleLogout"
        @refresh="handleRefreshGrades"
      />

      <!-- 电费查询 -->
      <!-- 电费查询 -->
      <ElectricityView 
        v-else-if="currentView === 'electricity'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 交易记录 -->
      <TransactionHistory 
        v-else-if="currentView === 'transactions'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <CampusCodeView
        v-else-if="currentView === 'campus_code'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 通知设置 -->
      <NotificationView 
        v-else-if="currentView === 'notifications'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @openWorkspaceLayout="openWorkspaceLayoutEditor('notifications')"
      />

      <!-- 空教室查询 -->
      <ClassroomView 
        v-else-if="currentView === 'classroom'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 个人信息 -->
      <StudentInfoView 
        v-else-if="currentView === 'studentinfo'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 考试安排 -->
      <ExamView 
        v-else-if="currentView === 'exams'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 绩点排名 -->
      <RankingView 
        v-else-if="currentView === 'ranking'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 校历 -->
      <CalendarView 
        v-else-if="currentView === 'calendar'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 学校消息 -->
      <SchoolInboxView
        v-else-if="currentView === 'school_inbox'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 学业完成情况 -->
      <AcademicProgressView 
        v-else-if="currentView === 'academic'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 培养方案 -->
      <TrainingPlanView 
        v-else-if="currentView === 'training'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- AI 助手 -->
      <AiChatView 
        v-else-if="currentView === 'ai'"
        :student-id="studentId"
        :model-options="aiModelOptions"
        @back="handleBackToDashboard"
      />

      <!-- 校园地图 -->
      <CampusMapView
        v-else-if="currentView === 'campus_map'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 图书查询 -->
      <LibraryView
        v-else-if="currentView === 'library'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 资料分享 -->
      <ResourceShareView
        v-else-if="currentView === 'resource_share'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 资料分享：邀请码入班 + 班级资料 -->
      <ChaoxingClassView
        v-else-if="currentView === 'chaoxing_class'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 学习通：课程中心 -->
      <ChaoxingHubView
        v-else-if="currentView === 'chaoxing_hub'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 学习通：收件箱 -->
      <ChaoxingInboxView
        v-else-if="currentView === 'chaoxing_inbox'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 教学评教 -->
      <TeachingEvalView
        v-else-if="currentView === 'teaching_eval'"
        @back="handleBackToDashboard"
      />

      <!-- 教育网网费 -->
      <BroadbandView
        v-else-if="currentView === 'broadband'"
        @back="handleBackToDashboard"
      />

      <!-- 运动场馆 -->
      <SportsVenueView
        v-else-if="currentView === 'sports_venue'"
        @back="handleBackToDashboard"
      />


      <!-- 小塔出行 -->
      <TowerGoView
        v-else-if="currentView === 'towergo'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 智慧迎新 -->
      <SmartOrientationView
        v-else-if="currentView === 'smart_orientation'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />
      
      <!-- 其他模块占位 -->
      <div v-else class="coming-soon-page">
        <div class="coming-soon-content">
          <div class="emoji">🚧</div>
          <h2>{{ currentModule }} 模块开发中</h2>
          <p>敬请期待...</p>
          <button @click="handleBackToDashboard">返回仪表盘</button>
        </div>
      </div>
      </div>
    </Transition>
  </main>

  <nav v-if="showTabBar" class="bottom-tab-bar glass-card">
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'home' }" @click="handleTabChange('home')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <path d="M3 10.8L12 3l9 7.8V21a1 1 0 0 1-1 1h-5.3a1 1 0 0 1-1-1v-5h-3.4v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.8z" />
          </svg>
        </span>
        <span class="tab-label">首页</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'schedule' }" @click="handleTabChange('schedule')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <rect x="3.2" y="4.5" width="17.6" height="16.3" rx="3.1" />
            <path d="M7 2.8v3.5M17 2.8v3.5M3.2 9.3h17.6" />
          </svg>
        </span>
        <span class="tab-label">课表</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'notifications' }" @click="handleTabChange('notifications')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <path d="M12 3.5a5.8 5.8 0 0 0-5.8 5.8v3.2c0 .8-.2 1.6-.6 2.3L4.3 17a1.3 1.3 0 0 0 1.1 2h13.2a1.3 1.3 0 0 0 1.1-2l-1.3-2.2a4.7 4.7 0 0 1-.6-2.3V9.3A5.8 5.8 0 0 0 12 3.5z" />
            <path d="M9.3 19a2.7 2.7 0 0 0 5.4 0" />
          </svg>
        </span>
        <span class="tab-label">通知</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'me' }" @click="handleTabChange('me')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4.1" />
            <path d="M4 20c1.8-3.6 4.7-5.5 8-5.5s6.2 1.9 8 5.5" />
          </svg>
        </span>
        <span class="tab-label">我的</span>
      </button>
  </nav>

  <section v-if="showHomeLayoutDebug" class="home-layout-debug-panel" aria-label="当前首页布局调试">
    <div class="home-layout-debug-head">
      <div>
        <p class="home-layout-debug-kicker">当前首页布局调试</p>
        <p class="home-layout-debug-copy">复制后发回，用于定位 iOS 安全区和底栏位置。</p>
      </div>
      <button class="home-layout-debug-close" type="button" @click="hideHomeLayoutDebug">隐藏</button>
    </div>
    <div class="home-layout-debug-actions">
      <button class="home-layout-debug-primary" type="button" @click="copyHomeLayoutDebugReport">复制调试信息</button>
      <button class="home-layout-debug-secondary" type="button" @click="toggleHomeLayoutDebugReport">
        {{ homeLayoutDebugExpanded ? '收起' : '显示' }}
      </button>
    </div>
    <textarea
      v-if="homeLayoutDebugExpanded"
      class="home-layout-debug-output"
      :value="homeLayoutDebugReport"
      readonly
      rows="12"
    />
  </section>

  <div v-if="showLoginPrompt" class="login-mask">
    <div class="login-mask-card">请先在个人中心登录</div>
  </div>

  <div v-if="showDailyAccessDialog" class="daily-access-overlay">
    <div class="daily-access-card">
      <h3>输入今日秘钥</h3>
      <p class="daily-access-desc">
        {{ protectedViewPromptTitle }} 已启用访问门禁，请输入根据当天日期生成的秘钥后再进入。
      </p>
      <p class="daily-access-tip">详情请询问管理员。</p>
      <form class="daily-access-form" @submit.prevent="submitDailyAccessKey">
        <input
          class="daily-access-input"
          :value="dailyAccessInput"
          type="text"
          placeholder="例如 ABCDE-FGHIJ"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="11"
          autofocus
          @input="handleDailyAccessInput"
        />
        <p v-if="dailyAccessError" class="daily-access-error">{{ dailyAccessError }}</p>
        <div class="daily-access-actions">
          <button type="button" class="btn-secondary" @click="closeDailyAccessDialog">取消</button>
          <button type="submit" class="btn-primary">验证并进入</button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="showExitDialog" class="exit-dialog-overlay">
    <div class="exit-dialog-card">
      <h3>退出应用</h3>
      <p>是否退出 Mini-HBUT？</p>
      <div class="exit-dialog-actions">
        <button class="btn-secondary" :disabled="exitingApp" @click="cancelExitDialog">取消</button>
        <button class="btn-danger" :disabled="exitingApp" @click="confirmExitDialog">
          {{ exitingApp ? '退出中...' : '退出' }}
        </button>
      </div>
    </div>
  </div>

  <!-- 版本更新对话框 -->
  <UpdateDialog 
    v-if="showUpdateDialog"
    @close="showUpdateDialog = false"
  />

  <!-- 强制更新覆盖层 -->
  <div v-if="showForceUpdate" class="force-update-overlay">
    <div class="force-update-card">
      <h3>需要更新</h3>
      <p class="force-update-message">
        {{ forceUpdateInfo?.message || '当前版本过低，请更新后继续使用。' }}
      </p>
      <p class="force-update-meta">最低版本：v{{ forceUpdateInfo?.min_version }}</p>
      <div v-if="forceUpdateResolvedUrl" class="force-update-download">
        <span class="force-update-label">下载地址</span>
        <button class="force-update-link" @click="handleForceUpdate">{{ forceUpdateDisplayUrl }}</button>
      </div>
      <div class="force-update-actions">
        <button class="btn-primary force-update-btn" @click="handleForceUpdate">立即更新</button>
      </div>
    </div>
  </div>

  <!-- 公告详情弹窗 -->
  <div v-if="showAnnouncementModal" class="notice-modal-overlay" @click.self="closeAnnouncement">
    <div class="notice-modal">
      <div class="notice-modal-header">
        <h3>{{ activeAnnouncement?.title }}</h3>
        <button class="notice-close" @click="closeAnnouncement">×</button>
      </div>
      <div v-if="activeAnnouncement?.updated_at" class="notice-modal-meta">
        更新时间：{{ activeAnnouncement.updated_at }}
      </div>
      <div v-if="activeAnnouncement?.image" class="notice-modal-image">
        <img :src="activeAnnouncement.image" :alt="activeAnnouncement.title" />
      </div>
      <div class="notice-modal-content select-text" @click="handleContentClick" v-html="activeAnnouncementHtml"></div>
      <a
        v-if="activeAnnouncement?.link"
        class="notice-link"
        :href="activeAnnouncement.link"
        target="_blank"
        @click.prevent="handleExternalOpen(activeAnnouncement.link, $event)"
      >
        查看原文
      </a>
    </div>
  </div>

  <!-- 确认公告弹窗 -->
  <div v-if="showBlockingAnnouncement" class="notice-confirm-overlay">
    <div class="notice-confirm-card">
      <h3>重要公告</h3>
      <p class="notice-confirm-title">{{ blockingAnnouncement?.title }}</p>
      <div class="notice-confirm-content" v-html="blockingAnnouncementHtml"></div>
      <div class="notice-confirm-actions">
        <button class="btn-secondary" @click="openAnnouncement(blockingAnnouncement)">查看详情</button>
        <button class="btn-primary" @click="confirmBlockingAnnouncement">我已知晓</button>
      </div>
    </div>
  </div>
    
  <!-- 全局提示 -->
  <WorkspaceLayoutEditor
    :visible="showWorkspaceLayoutEditor"
    :initial-tab="workspaceLayoutEditorTab"
    @close="closeWorkspaceLayoutEditor"
  />
  <Toast />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.coming-soon-page {
  min-height: calc(var(--app-vh, 1vh) * 100);
  background: var(--ui-bg-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
}

.coming-soon-content {
  text-align: center;
  color: #fff;
}

.coming-soon-content .emoji {
  font-size: 80px;
  margin-bottom: 20px;
}

.coming-soon-content h2 {
  font-size: 28px;
  margin-bottom: 12px;
}

.coming-soon-content p {
  opacity: 0.8;
  margin-bottom: 24px;
}

.coming-soon-content button {
  padding: 12px 32px;
  background: var(--ui-surface);
  color: var(--ui-primary);
  border: none;
  border-radius: 99px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 12px;
  transition: transform 0.2s;
}

.coming-soon-content button:hover {
  transform: scale(1.05);
}

.select-text {
  user-select: text;
  -webkit-user-select: text;
}

.coming-soon-content button:hover {
  transform: scale(1.05);
}

.view-transition-root {
  width: 100%;
  min-height: 100%;
}

.module-fade-enter-active,
.module-fade-leave-active {
  transition:
    opacity calc(0.16s * var(--ui-motion-scale)) ease,
    transform calc(0.16s * var(--ui-motion-scale)) ease;
}

.module-fade-enter-from,
.module-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .module-fade-enter-active,
  .module-fade-leave-active {
    transition: none;
  }
}

.app-shell {
  --safe-top-fallback: 0px;
  min-height: calc(var(--app-vh, 1vh) * 100);
  height: calc(var(--app-vh, 1vh) * 100);
  position: relative;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(128px + var(--app-safe-bottom));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  /* 隐藏滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.app-shell::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.app-shell.no-scroll {
  height: calc(var(--app-vh, 1vh) * 100);
  overflow: hidden;
  padding-bottom: var(--app-safe-bottom);
}

.app-shell.ai-full {
  padding-bottom: 0;
}

.app-shell.ai-full > .view-transition-root {
  min-height: 100%;
  height: 100%;
  display: flex;
}

.app-shell.ai-full > .view-transition-root > .ai-view {
  width: 100%;
  min-height: 100%;
  height: 100% !important;
}

.app-shell.ios-safe {
  --safe-top-fallback: 44px;
}

.app-shell.schedule-full {
  --schedule-safe-top: max(env(safe-area-inset-top), var(--safe-top-fallback, 0px));
  padding-top: var(--schedule-safe-top);
  padding-bottom: calc(128px + var(--app-safe-bottom));
  overflow: hidden;
}

.app-shell.schedule-full > .schedule-view,
.app-shell.schedule-full > .view-transition-root > .schedule-view {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  min-height: calc(
    var(--app-vh, 1vh) * 100 - var(--schedule-safe-top)
  ) !important;
  height: calc(
    var(--app-vh, 1vh) * 100 - var(--schedule-safe-top)
  ) !important;
  padding: 0 !important;
}

@media (max-width: 900px) {
  .app-shell.schedule-full {
    --schedule-safe-top: max(env(safe-area-inset-top), var(--safe-top-fallback, 0px));
  }
}

/* 统一业务页面高度策略：避免子页面写死 100vh 导致进入后再次缩放 */
.app-shell > .dashboard,
.app-shell > [class$='-view']:not(.schedule-view):not(.ai-view),
.app-shell > .view-transition-root > .dashboard,
.app-shell > .view-transition-root > [class$='-view']:not(.schedule-view):not(.ai-view) {
  min-height: calc(var(--app-vh, 1vh) * 100) !important;
  height: auto !important;
}

.app-shell.module-host-full {
  padding-bottom: 0;
  overflow: hidden;
}

.app-shell.module-host-full > .view-transition-root {
  min-height: 100%;
  height: 100%;
  display: flex;
}

.app-shell.module-host-full > .view-transition-root > .more-module-host-view {
  width: 100%;
  min-height: 100%;
  height: 100% !important;
}

.bottom-tab-bar {
  position: fixed;
  top: auto;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  bottom: calc(10px + var(--app-safe-bottom));
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  align-items: center;
  align-content: center;
  gap: 6px;
  padding: 8px 14px;
  height: auto;
  min-height: 62px;
  max-height: 92px;
  width: min(
    540px,
    calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 20px)
  );
  border-radius: 20px;
  backdrop-filter: blur(20px);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.78));
  border: 1px solid rgba(148, 163, 184, 0.3);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16);
  z-index: 60;
  pointer-events: auto;
}

.bottom-tab-bar:hover,
.bottom-tab-bar:focus-within {
  transform: translateX(-50%);
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 5px;
  border: none;
  background: transparent;
  color: var(--ui-muted);
  font-size: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.tab-item.active {
  color: var(--ui-primary);
  background: var(--ui-primary-soft);
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.2);
}

.tab-item.active .tab-icon {
  transform: translateY(-1px);
}

.tab-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tab-icon-svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tab-item.active .tab-icon::after {
  content: '';
  position: absolute;
  right: -3px;
  bottom: -2px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--ui-primary) 22%, transparent);
}

.tab-label {
  font-size: 12px;
  letter-spacing: 0.2px;
}

.home-layout-debug-panel {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  right: max(12px, env(safe-area-inset-right, 0px));
  z-index: 9990;
  width: min(360px, calc(100vw - 24px));
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.16);
  background: rgba(248, 250, 252, 0.96);
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.2);
  color: #0f172a;
  backdrop-filter: blur(16px);
}

.home-layout-debug-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.home-layout-debug-kicker,
.home-layout-debug-copy {
  margin: 0;
}

.home-layout-debug-kicker {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.home-layout-debug-copy {
  margin-top: 3px;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
}

.home-layout-debug-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.home-layout-debug-primary,
.home-layout-debug-secondary,
.home-layout-debug-close {
  border: none;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.home-layout-debug-primary,
.home-layout-debug-secondary {
  height: 34px;
  padding: 0 12px;
}

.home-layout-debug-primary {
  flex: 1;
  color: #fff;
  background: #2563eb;
}

.home-layout-debug-secondary,
.home-layout-debug-close {
  color: #334155;
  background: #e2e8f0;
}

.home-layout-debug-close {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 9px;
}

.home-layout-debug-output {
  display: block;
  width: 100%;
  max-height: min(420px, 52vh);
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(100, 116, 139, 0.35);
  border-radius: 10px;
  background: #020617;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  line-height: 1.45;
  resize: vertical;
}

.login-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  z-index: 20;
}

.login-mask-card {
  padding: 16px 24px;
  background: var(--ui-surface);
  border-radius: 16px;
  font-weight: 600;
  color: var(--ui-text);
  border: 1px solid rgba(148, 163, 184, 0.3);
  box-shadow: var(--ui-shadow-soft);
}

.daily-access-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(10px);
}

.daily-access-card {
  width: min(460px, 100%);
  padding: 24px;
  border-radius: 22px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  border: 1px solid rgba(148, 163, 184, 0.28);
  box-shadow: var(--ui-shadow-strong);
}

.daily-access-card h3 {
  margin: 0;
  font-size: 24px;
  color: var(--ui-text);
}

.daily-access-desc {
  margin: 12px 0 0;
  color: var(--ui-text);
  line-height: 1.6;
}

.daily-access-tip {
  margin: 8px 0 0;
  color: var(--ui-muted);
  font-size: 13px;
  line-height: 1.5;
}

.daily-access-form {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.daily-access-input {
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(248, 250, 252, 0.92);
  color: var(--ui-text);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1.8px;
  text-transform: uppercase;
}

.daily-access-input:focus {
  outline: none;
  border-color: var(--ui-primary);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--ui-primary) 18%, transparent);
}

.daily-access-error {
  margin: 0;
  color: var(--ui-danger);
  font-size: 14px;
}

.daily-access-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.exit-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.exit-dialog-card {
  width: min(420px, 100%);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.95));
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 20px;
  box-shadow: var(--ui-shadow-strong);
  padding: 22px;
}

.exit-dialog-card h3 {
  margin: 0 0 10px;
  font-size: 24px;
  color: var(--ui-text);
}

.exit-dialog-card p {
  margin: 0;
  font-size: 18px;
  color: var(--ui-muted);
}

.exit-dialog-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-secondary,
.btn-danger,
.btn-primary {
  height: 42px;
  min-width: 96px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary {
  background: var(--ui-primary-soft);
  color: var(--ui-text);
}

.btn-primary {
  background: var(--ui-primary);
  color: #fff;
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.btn-secondary:disabled,
.btn-primary:disabled,
.btn-danger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.force-update-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
   background: rgba(2, 6, 23, 0.68);
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
   backdrop-filter: blur(5px);
}

.force-update-card {
   background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 255, 0.94));
   border-radius: 20px;
   padding: 22px 20px 18px;
   width: 100%;
   max-width: 390px;
   text-align: left;
   border: 1px solid color-mix(in oklab, var(--ui-primary) 28%, rgba(148, 163, 184, 0.24));
   box-shadow: 0 28px 60px rgba(15, 23, 42, 0.32);
}

.force-update-card h3 {
   margin: 0 0 10px;
   font-size: 21px;
   line-height: 1.25;
   color: #0f172a;
}

.force-update-message {
   color: #334155;
   margin: 0 0 12px;
   line-height: 1.55;
   font-size: 14px;
}

.force-update-meta {
   color: #475569;
   font-size: 13px;
   margin: 0;
}

.force-update-download {
   margin-top: 10px;
   padding: 10px 11px;
   border-radius: 12px;
   background: rgba(241, 245, 249, 0.8);
   border: 1px solid rgba(148, 163, 184, 0.35);
}

.force-update-label {
   display: block;
   margin-bottom: 6px;
   font-size: 12px;
   font-weight: 700;
   color: #475569;
}

.force-update-link {
   width: 100%;
   border: none;
   background: transparent;
   color: #1d4ed8;
   font-size: 12px;
   font-weight: 600;
   text-align: left;
   line-height: 1.4;
   cursor: pointer;
   padding: 0;
}

.force-update-actions {
   margin-top: 14px;
   display: flex;
   justify-content: flex-end;
}

.force-update-btn {
   min-width: 120px;
}

.notice-modal-overlay,
.notice-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9997;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.notice-modal,
.notice-confirm-card {
  background: var(--ui-surface);
  border-radius: 18px;
  width: 100%;
  max-width: 520px;
  max-height: 82vh;
  overflow: auto;
  padding: 20px;
  box-shadow: var(--ui-shadow-strong);
}

.notice-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.notice-modal-header h3 {
  margin: 0;
  font-size: 20px;
  color: var(--ui-text);
}

.notice-close {
  border: none;
  background: var(--ui-primary-soft);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
}

.notice-modal-meta {
  color: var(--ui-muted);
  font-size: 12px;
  margin: 8px 0 12px;
}

.notice-modal-image img {
  width: 100%;
  border-radius: 12px;
  margin-bottom: 12px;
}

.notice-modal-content {
  color: var(--ui-muted);
  line-height: 1.6;
}

.notice-link {
  display: inline-block;
  margin-top: 12px;
  color: var(--ui-primary);
  text-decoration: none;
}

.notice-confirm-title {
  font-weight: 600;
  margin: 8px 0 12px;
}

.notice-confirm-content {
  color: var(--ui-muted);
  line-height: 1.6;
}

.notice-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}

</style>
