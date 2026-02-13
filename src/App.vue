<script setup>
import { ref, onMounted, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import axios from 'axios'
import Dashboard from './components/Dashboard.vue'
import GradeView from './components/GradeView.vue'
import ElectricityView from './components/ElectricityView.vue'
import ClassroomView from './components/ClassroomView.vue'
import ScheduleView from './components/ScheduleView.vue'
import GlobalScheduleView from './components/GlobalScheduleView.vue'
import StudentInfoView from './components/StudentInfoView.vue'
import ExamView from './components/ExamView.vue'
import RankingView from './components/RankingView.vue'
import CalendarView from './components/CalendarView.vue'
import AcademicProgressView from './components/AcademicProgressView.vue'
import TrainingPlanView from './components/TrainingPlanView.vue'
import MeView from './components/MeView.vue'
import OfficialView from './components/OfficialView.vue'
import FeedbackView from './components/FeedbackView.vue'
import NotificationView from './components/NotificationView.vue'
import ConfigEditor from './components/ConfigEditor.vue'
import SettingsView from './components/SettingsView.vue'
import ExportCenterView from './components/ExportCenterView.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import Toast from './components/Toast.vue'
import TransactionHistory from './components/TransactionHistory.vue'
import AiChatView from './components/AiChatView.vue'
import CampusMapView from './components/CampusMapView.vue'
import LibraryView from './components/LibraryView.vue'
import ResourceShareView from './components/ResourceShareView.vue'
import { fetchWithCache } from './utils/api.js'
import { checkForUpdates, getCurrentVersion } from './utils/updater.js'
import { renderMarkdown } from './utils/markdown.js'
import { fetchRemoteConfig } from './utils/remote_config.js'
import { openExternal, isHttpLink } from './utils/external_link'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const detectTauri = () => {
  try {
    if (typeof isTauri === 'function' && isTauri()) {
      return true
    }
  } catch (e) {
    // ignore
  }
  if (typeof window === 'undefined') return false
  if (window.__TAURI__ || window.__TAURI_INTERNALS__) return true
  const protocol = window.location?.protocol || ''
  if (protocol === 'tauri:') return true
  const host = window.location?.hostname || ''
  if (host === 'tauri.localhost') return true
  return false
}
const hasTauri = detectTauri()
const BRIDGE_BASE = hasTauri ? 'http://127.0.0.1:4399' : '/bridge'
const IOS_RESUME_RELOAD_MS = 3 * 60 * 1000
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
let hiddenAt = 0
let unlistenCloseRequested = null
let isClosingByUser = false

// 视图状态: home, schedule, me, grades...
const currentView = ref('home')
const activeTab = ref('home')
const gradeData = ref([])
const studentId = ref('')
const userUuid = ref('')
const currentModule = ref('')
const isLoading = ref(false)
const showLoginPrompt = ref(false)
const showExitDialog = ref(false)
const exitingApp = ref(false)
const gradesOffline = ref(false)
const gradesSyncTime = ref('')
const appShellRef = ref(null)

const SESSION_COOKIE_KEY = 'hbu_session_cookies'
const SESSION_COOKIE_TIME_KEY = 'hbu_session_cookie_time'
const COOKIE_SNAPSHOT_KEY = 'hbu_cookie_snapshot'
const SESSION_REFRESH_INTERVAL = 20 * 60 * 1000
let sessionKeepAliveTimer = null
const ELECTRICITY_REFRESH_INTERVAL = 10 * 60 * 1000
let electricityKeepAliveTimer = null

// 版本更新相关
const showUpdateDialog = ref(false)
const showForceUpdate = ref(false)
const forceUpdateInfo = ref(null)

const MAIN_TABS = ['home', 'schedule', 'notifications', 'me']
const ME_SUB_VIEWS = ['official', 'feedback', 'config', 'settings', 'export_center']

const remoteConfig = ref(null)
const announcementData = ref({ pinned: [], ticker: [], list: [], confirm: [] })
const activeAnnouncement = ref(null)
const showAnnouncementModal = ref(false)
const blockingAnnouncement = ref(null)
const showBlockingAnnouncement = ref(false)

// 默认使用 V2 全自动识别模式
const loginMode = ref('auto')

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
  showAnnouncementModal.value = true
}

const closeAnnouncement = () => {
  showAnnouncementModal.value = false
  activeAnnouncement.value = null
}

const confirmBlockingAnnouncement = () => {
  if (blockingAnnouncement.value?.id) {
    markAnnouncementConfirmed(blockingAnnouncement.value.id)
  }
  showBlockingAnnouncement.value = false
  blockingAnnouncement.value = null
  setTimeout(findNextBlockingAnnouncement, 200)
}

const handleContentClick = async (e) => {
  const target = e.target.closest('a')
  if (target && target.href) {
    e.preventDefault()
    await openExternal(target.href)
  }
}

const handleGlobalLinkClick = async (e) => {
  const target = e.target.closest('a')
  if (!target || !target.href) return
  const href = target.href
  if (!isHttpLink(href)) return
  e.preventDefault()
  await openExternal(href)
}

const handleExternalOpen = async (url) => {
  if (!url) return
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

const recoverViewportAfterTransition = () => {
  const activeEl = document.activeElement
  if (activeEl && typeof activeEl.blur === 'function') {
    activeEl.blur()
  }
  updateViewportUnit()
  nextTick(() => {
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
      updateViewportUnit()
    })
  })
}

const nudgeWebViewPaint = () => {
  const root = document.getElementById('app')
  if (!root) return
  root.style.opacity = '0.999'
  root.style.transform = 'translateZ(0)'
  requestAnimationFrame(() => {
    root.style.opacity = '1'
    root.style.transform = ''
  })
}

const scheduleViewportUpdate = () => {
  // 桌面端避免频繁重算 vh 导致“进入后瞬间缩放”；
  // 移动端仍保留实时同步（地址栏/刘海安全区会变化）。
  if (!isIOSLike && !isAndroidLike) {
    const hasVh = !!document.documentElement.style.getPropertyValue('--app-vh')
    if (!hasVh) updateViewportUnit()
    return
  }
  updateViewportUnit()
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    hiddenAt = Date.now()
    return
  }
  const idle = hiddenAt ? Date.now() - hiddenAt : 0
  hiddenAt = 0
  scheduleViewportUpdate()
  if (isIOSLike) {
    nudgeWebViewPaint()
  }

  // iOS 长时间后台后，WebView 偶发黑屏；主动重载可恢复渲染上下文
  if (isIOSLike && idle >= IOS_RESUME_RELOAD_MS) {
    setTimeout(() => {
      window.location.reload()
    }, 120)
  }
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
    module: currentModule.value
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
    module: currentModule.value
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
  currentModule.value = view
}

const goToView = (view, { push = true } = {}) => {
  applyViewState(view)
  if (push) {
    pushHistorySnapshot(view)
  } else {
    replaceHistorySnapshot(view)
  }
}

const parseHashRoute = () => {
  const hash = window.location.hash || '#/'
  const m = hash.match(/^#\/(\d{10})(?:\/(\w+))?$/)
  if (!m) return null
  return {
    sid: m[1],
    view: m[2] || 'home'
  }
}

const syncFromHash = async () => {
  const route = parseHashRoute()
  if (!route) {
    if (currentView.value !== 'home') {
      applyViewState('home')
    }
    return
  }

  studentId.value = route.sid
  localStorage.setItem('hbu_username', route.sid)
  applyViewState(route.view)

  if (route.view === 'grades' && gradeData.value.length === 0) {
    const ok = await fetchGradesFromAPI(route.sid)
    if (!ok) {
      applyViewState('me')
      replaceHistorySnapshot('me')
    }
  }
}

// 处理登录成功
const handleLoginSuccess = (data) => {
  gradeData.value = data
  studentId.value = localStorage.getItem('hbu_username') || ''
  // 跳转到 Dashboard 显示所有模块
  applyViewState('home')
  replaceHistorySnapshot('home')

  // 预取课表/培养方案默认数据并落地缓存
  if (studentId.value) {
    fetchWithCache(`schedule:${studentId.value}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
        student_id: studentId.value
      })
      if (res.data?.meta) {
        localStorage.setItem('hbu_schedule_meta', JSON.stringify({
          semester: res.data.meta.semester,
          start_date: res.data.meta.start_date,
          current_week: res.data.meta.current_week
        }))
      }
      return res.data
    })

    fetchWithCache(`training:options:${studentId.value}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/training_plan/options`, {
        student_id: studentId.value
      })
      if (res.data?.success) {
        localStorage.setItem('hbu_training_options', JSON.stringify({
          options: res.data.options || {},
          defaults: res.data.defaults || {}
        }))
      }
      return res.data
    })
  }

  localStorage.removeItem('hbu_manual_logout')
  persistSessionCookies()
  startSessionKeepAlive()
  startElectricityKeepAlive()
  recoverViewportAfterTransition()
}

// 处理导航
const handleNavigate = async (moduleId) => {
  applyViewState(moduleId)

  // 如果是成绩页面且数据为空，先获取数据
  if (moduleId === 'grades' && gradeData.value.length === 0) {
    const success = await fetchGradesFromAPI(studentId.value)
    if (!success) {
      // 获取失败，跳转到个人中心
      applyViewState('me')
      pushHistorySnapshot('me')
      return
    }
  }

  pushHistorySnapshot(moduleId)
}

// 处理返回仪表盘
const handleBackToDashboard = () => {
  goToView('home')
}

// 处理登出
const handleLogout = () => {
  applyViewState('home')
  gradeData.value = []
  studentId.value = ''
  userUuid.value = ''
  replaceHistorySnapshot('home')

  stopSessionKeepAlive()
  stopElectricityKeepAlive()
  localStorage.removeItem(SESSION_COOKIE_KEY)
  localStorage.removeItem(SESSION_COOKIE_TIME_KEY)
  localStorage.setItem('hbu_manual_logout', 'true')
  invoke('logout').catch(() => {})
}

// 切换登录模式
const handleSwitchLoginMode = (mode) => {
  loginMode.value = mode
}

const ensureConfigAccess = () => {
  if (currentView.value === 'config' && !isConfigAdmin.value) {
    applyViewState('me')
    replaceHistorySnapshot('me')
  }
}

// 从API获取成绩数据
const fetchGradesFromAPI = async (sid) => {
  isLoading.value = true
  try {
    const { data } = await fetchWithCache(`grades:${sid}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid })
      return res.data
    })

    if (data?.success && data?.data) {
      gradeData.value = data.data
      gradesOffline.value = !!data.offline
      gradesSyncTime.value = data.sync_time || ''
      return true
    }
  } catch (e) {
    console.error('获取成绩失败:', e)
  } finally {
    isLoading.value = false
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
  goToView('me')
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

// 检查更新
const handleCheckUpdate = () => {
  showUpdateDialog.value = true
}

// 自动检查更新
const autoCheckUpdate = async () => {
  try {
    const currentVersion = await getCurrentVersion()
    const skippedVersion = localStorage.getItem('hbu_skipped_version')
    
    const result = await checkForUpdates(currentVersion)
    if (result?.hasUpdate && result.latestVersion !== skippedVersion) {
      showUpdateDialog.value = true
    }
  } catch (e) {
    console.warn('[Update] 自动检查更新失败:', e)
  }
}

const handleForceUpdate = () => {
  if (forceUpdateInfo.value?.download_url) {
    openExternal(forceUpdateInfo.value.download_url)
    return
  }
  showUpdateDialog.value = true
}

const primeOcrEndpointFromCache = async () => {
  if (!hasTauri) return
  const cachedEndpoint = String(localStorage.getItem('hbu_ocr_endpoint') || '').trim()
  try {
    await invoke('set_ocr_endpoint', { endpoint: cachedEndpoint })
  } catch (e) {
    console.warn('[Config] 启动预设 OCR 端点失败:', e)
  }
}

const applyRemoteConfig = async () => {
  try {
    const config = await fetchRemoteConfig()
    remoteConfig.value = config
    announcementData.value = config.announcements || { pinned: [], ticker: [], list: [], confirm: [] }

    const remoteOcrEnabled = config.ocr?.enabled !== false
    const remoteOcrEndpoint = remoteOcrEnabled
      ? String(config.ocr?.endpoint || '').trim()
      : ''
    if (remoteOcrEndpoint) {
      localStorage.setItem('hbu_ocr_endpoint', remoteOcrEndpoint)
    } else {
      localStorage.removeItem('hbu_ocr_endpoint')
    }
    try {
      await invoke('set_ocr_endpoint', { endpoint: remoteOcrEndpoint })
    } catch (e) {
      console.warn('[Config] OCR 端点下发失败:', e)
    }

    // 课表临时文件上传地址：每次启动后由远程配置覆盖。
    // 优先由前端显式透传，Rust 侧也会缓存一份用于兜底。
    const uploadEndpoint = String(config?.temp_file_server?.schedule_upload_endpoint || '').trim()
    if (uploadEndpoint) {
      localStorage.setItem('hbu_temp_upload_endpoint', uploadEndpoint)
    } else {
      localStorage.removeItem('hbu_temp_upload_endpoint')
    }
    try {
      await invoke('set_temp_upload_endpoint', { endpoint: uploadEndpoint || null })
    } catch (e) {
      console.warn('[Config] 课表上传地址下发失败:', e)
    }

    const minVersion = config.force_update?.min_version
    if (minVersion) {
      const currentVersion = await getCurrentVersion()
      if (compareVersions(currentVersion, minVersion) < 0) {
        forceUpdateInfo.value = {
          min_version: minVersion,
          message: config.force_update?.message || '当前版本过低，请更新后继续使用。',
          download_url: config.force_update?.download_url || ''
        }
        showForceUpdate.value = true
      }
    }

    findNextBlockingAnnouncement()
  } catch (e) {
    console.warn('[Config] 远程配置加载失败:', e)
  }
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
  if (!hasTauri) return
  try {
    const cookies = await invoke('get_cookies')
    if (cookies) {
      localStorage.setItem(SESSION_COOKIE_KEY, cookies)
      localStorage.setItem(SESSION_COOKIE_TIME_KEY, Date.now().toString())
    }
  } catch (e) {
    console.warn('[Session] 保存 cookies 失败:', e)
  }
}

const tryRestoreSession = async () => {
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
  if (!cookies) return false

  try {
    const userInfo = hasTauri
      ? await invoke('restore_session', { cookies })
      : await restoreSessionViaBridge(cookies)
    if (userInfo?.student_id) {
      studentId.value = userInfo.student_id
      localStorage.setItem('hbu_username', userInfo.student_id)
      return true
    }
  } catch (e) {
    console.warn('[Session] 恢复会话失败，清理缓存:', e)
    localStorage.removeItem(SESSION_COOKIE_KEY)
    localStorage.removeItem(SESSION_COOKIE_TIME_KEY)
  }
  return false
}

const tryRestoreLatestSession = async () => {
  if (!hasTauri) return false
  if (localStorage.getItem('hbu_manual_logout') === 'true') {
    return false
  }
  try {
    const userInfo = await invoke('restore_latest_session')
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

const getStoredPassword = () => {
  const remember = localStorage.getItem('hbu_remember')
  const username = localStorage.getItem('hbu_username')
  const credential = localStorage.getItem('hbu_credentials')
  if (remember === 'false' || !username || !credential) {
    return null
  }
  if (credential.length > 50 || /[A-Za-z0-9+/=]{30,}/.test(credential)) {
    return null
  }
  return { username, password: credential }
}

const attemptAutoRelogin = async () => {
  if (!hasTauri) return false
  if (localStorage.getItem('hbu_manual_logout') === 'true') {
    return false
  }
  const creds = getStoredPassword()
  if (!creds) return false
  try {
    await invoke('login', {
      username: creds.username,
      password: creds.password,
      captcha: '',
      lt: '',
      execution: ''
    })
    await persistSessionCookies()
    if (!studentId.value) {
      studentId.value = creds.username
    }
    return true
  } catch (e) {
    console.warn('[Session] 自动登录失败:', e)
    return false
  }
}

const refreshSessionSilently = async () => {
  const cookies = localStorage.getItem(SESSION_COOKIE_KEY)
  if (!cookies) return
  if (!hasTauri) return

  try {
    await invoke('refresh_session')
    await persistSessionCookies()
  } catch (e) {
    console.warn('[Session] 会话刷新失败，尝试自动登录:', e)
    const relogged = await attemptAutoRelogin()
    if (!relogged) {
      stopSessionKeepAlive()
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
      await invoke('refresh_electricity_token')
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

const handlePopState = async () => {
  await syncFromHash()
}

const installCloseInterceptor = async () => {
  if (!hasTauri) return
  try {
    const appWindow = getCurrentWindow()
    unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
      if (isClosingByUser) return

      if (currentView.value !== 'home') {
        event.preventDefault()
        if ((window.history.length > 1) && (window.location.hash || '#/') !== '#/') {
          window.history.back()
        } else {
          goToView('home')
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

const confirmExitDialog = async () => {
  if (exitingApp.value) return
  exitingApp.value = true
  isClosingByUser = true
  try {
    if (hasTauri) {
      await invoke('exit_app')
    } else {
      window.close()
    }
  } catch (e) {
    console.warn('[Navigation] 退出应用失败:', e)
    try {
      const appWindow = getCurrentWindow()
      await appWindow.destroy()
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
  nextTick(() => {
    if (appShellRef.value) {
      appShellRef.value.scrollTop = 0
    }
  })
})

onMounted(async () => {
  document.addEventListener('click', handleGlobalLinkClick, true)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('popstate', handlePopState)
  window.addEventListener('resize', scheduleViewportUpdate)
  window.addEventListener('orientationchange', scheduleViewportUpdate)
  scheduleViewportUpdate()
  await installCloseInterceptor()
  await primeOcrEndpointFromCache()
  // 先拉取远程配置并下发 OCR 端点，确保后续主动登录/自动重登优先使用远程 OCR
  await applyRemoteConfig()

  let restored = await tryRestoreSession()
  if (!restored) {
    restored = await tryRestoreLatestSession()
  }
  let relogged = false
  if (!restored) {
    relogged = await attemptAutoRelogin()
  }

  await syncFromHash()

  if (restored && !window.location.hash) {
    applyViewState('home')
  }

  if (restored || relogged || studentId.value) {
    startSessionKeepAlive()
    startElectricityKeepAlive()
  }

  replaceHistorySnapshot(currentView.value)
  
  // 启动即检查更新
  autoCheckUpdate()

  ensureConfigAccess()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleGlobalLinkClick, true)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('resize', scheduleViewportUpdate)
  window.removeEventListener('orientationchange', scheduleViewportUpdate)
  if (typeof unlistenCloseRequested === 'function') {
    unlistenCloseRequested()
    unlistenCloseRequested = null
  }
})
</script>

<template>
  <main
    class="app-shell"
    :class="{ 'no-scroll': currentView === 'ai', 'schedule-full': currentView === 'schedule' }"
    ref="appShellRef"
  >
    <Transition name="module-fade" mode="out-in">
      <div :key="currentView" class="view-transition-root">
      <!-- 首页 -->
      <Dashboard 
        v-if="currentView === 'home'"
        :student-id="studentId"
        :user-uuid="userUuid"
        :is-logged-in="isLoggedIn"
        :ticker-notices="announcementData.ticker"
        :pinned-notices="announcementData.pinned"
        :notice-list="announcementData.list"
        @navigate="handleNavigate"
        @logout="handleLogout"
        @require-login="handleRequireLogin"
        @open-notice="openAnnouncement"
      />

      <!-- 课表（Tab） -->
      <ScheduleView 
        v-else-if="currentView === 'schedule'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 全校课表 -->
      <GlobalScheduleView
        v-else-if="currentView === 'qxzkb'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
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
      />

      <ExportCenterView
        v-else-if="currentView === 'export_center'"
        :student-id="studentId"
        @back="handleBackToMe"
        @logout="handleLogout"
      />
      
      <!-- 成绩查看 -->
      <GradeView 
        v-else-if="currentView === 'grades'"
        :grades="gradeData"
        :student-id="studentId"
        :offline="gradesOffline"
        :sync-time="gradesSyncTime"
        @back="handleBackToDashboard"
        @logout="handleLogout"
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

      <!-- 通知设置 -->
      <NotificationView 
        v-else-if="currentView === 'notifications'"
        :student-id="studentId"
        @back="handleBackToDashboard"
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

    <nav v-if="showTabBar" class="bottom-tab-bar glass-card">
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'home' }" @click="handleTabChange('home')">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5V21H4a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="tab-label">首页</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'schedule' }" @click="handleTabChange('schedule')">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4.5" width="18" height="16.5" rx="3" stroke="currentColor" stroke-width="1.8" />
            <path d="M7 3v3M17 3v3M3 9h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </span>
        <span class="tab-label">课表</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'notifications' }" @click="handleTabChange('notifications')">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3a5 5 0 0 0-5 5v2.6c0 .9-.3 1.8-.9 2.5L4.5 15a1 1 0 0 0 .8 1.6h13.4a1 1 0 0 0 .8-1.6l-1.6-1.9a3.9 3.9 0 0 1-.9-2.5V8a5 5 0 0 0-5-5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </span>
        <span class="tab-label">通知</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'me' }" @click="handleTabChange('me')">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" />
            <path d="M4 20c1.8-3.3 4.5-5 8-5s6.2 1.7 8 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </span>
        <span class="tab-label">我的</span>
      </button>
    </nav>

    <div v-if="showLoginPrompt" class="login-mask">
      <div class="login-mask-card">请先在个人中心登录</div>
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
        <button class="btn-primary" @click="handleForceUpdate">立即更新</button>
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
        <div class="notice-modal-content select-text" @click="handleContentClick" v-html="renderMarkdown(activeAnnouncement?.content || activeAnnouncement?.summary || '')"></div>
        <a v-if="activeAnnouncement?.link" class="notice-link" :href="activeAnnouncement.link" target="_blank" @click.prevent="handleExternalOpen(activeAnnouncement.link)">查看原文</a>
      </div>
    </div>

    <!-- 确认公告弹窗 -->
    <div v-if="showBlockingAnnouncement" class="notice-confirm-overlay">
      <div class="notice-confirm-card">
        <h3>重要公告</h3>
        <p class="notice-confirm-title">{{ blockingAnnouncement?.title }}</p>
        <div class="notice-confirm-content" v-html="renderMarkdown(blockingAnnouncement?.content || blockingAnnouncement?.summary || '')"></div>
        <div class="notice-confirm-actions">
          <button class="btn-secondary" @click="openAnnouncement(blockingAnnouncement)">查看详情</button>
          <button class="btn-primary" @click="confirmBlockingAnnouncement">我已知晓</button>
        </div>
      </div>
    </div>
    
    <!-- 全局提示 -->
    <Toast />
  </main>
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
  min-height: calc(var(--app-vh, 1vh) * 100);
  height: calc(var(--app-vh, 1vh) * 100);
  position: relative;
  padding-top: env(safe-area-inset-top);
  padding-bottom: 90px;
  overflow-y: scroll;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.app-shell.no-scroll {
  height: calc(var(--app-vh, 1vh) * 100);
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
}

.app-shell.schedule-full {
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
}

.app-shell.schedule-full > .schedule-view,
.app-shell.schedule-full > .view-transition-root > .schedule-view {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  min-height: calc(var(--app-vh, 1vh) * 100) !important;
  height: calc(var(--app-vh, 1vh) * 100) !important;
  padding: 0 0 calc(92px + env(safe-area-inset-bottom)) !important;
}

/* 统一业务页面高度策略：避免子页面写死 100vh 导致进入后再次缩放 */
.app-shell > .dashboard,
.app-shell > [class$='-view']:not(.schedule-view),
.app-shell > .view-transition-root > .dashboard,
.app-shell > .view-transition-root > [class$='-view']:not(.schedule-view) {
  min-height: calc(var(--app-vh, 1vh) * 100) !important;
  height: auto !important;
}

.bottom-tab-bar {
  position: fixed;
  top: auto;
  left: 0;
  right: 0;
  bottom: max(12px, env(safe-area-inset-bottom));
  margin-inline: auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
  align-content: center;
  gap: 8px;
  padding: 10px 16px;
  height: auto;
  min-height: 70px;
  max-height: 106px;
  width: min(
    540px,
    calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 28px)
  );
  border-radius: 20px;
  backdrop-filter: blur(20px);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.78));
  border: 1px solid rgba(148, 163, 184, 0.3);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16);
  z-index: 60;
  pointer-events: auto;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
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

.tab-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tab-icon svg {
  width: 20px;
  height: 20px;
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
  font-size: 13px;
  letter-spacing: 0.2px;
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
  background: rgba(0, 0, 0, 0.6);
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.force-update-card {
  background: var(--ui-surface);
  border-radius: 18px;
  padding: 24px;
  width: 100%;
  max-width: 360px;
  text-align: center;
  box-shadow: var(--ui-shadow-strong);
}

.force-update-card h3 {
  margin: 0 0 12px;
  font-size: 20px;
}

.force-update-message {
  color: var(--ui-muted);
  margin-bottom: 12px;
}

.force-update-meta {
  color: var(--ui-muted);
  font-size: 13px;
  margin-bottom: 16px;
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

