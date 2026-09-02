<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  applyPreset,
  flushUiSettings,
  resetUiSettings,
  UI_PRESETS,
  useUiSettings
} from '../utils/ui_settings'
import {
  DEFAULT_BACKEND_TARGETS,
  DEFAULT_CLOUD_SYNC_ENDPOINT,
  resetAppSettings,
  useAppSettings
} from '../utils/app_settings'
import {
  FONT_CDN_OPTIONS,
  ensureFontLoaded,
  loadDeyiHeiFont,
  prefetchCdnFonts,
  setFontCdnProvider,
  useFontSettings
} from '../utils/font_settings'
import { applyOcrRuntimeConfig, getStoredOcrConfig } from '../utils/remote_config'
import {
  CLOUD_SYNC_UPDATED_EVENT,
  getCloudSyncLocalStatus,
  getCloudSyncRuntimeConfig
} from '../utils/cloud_sync'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { detectRuntime, isMobileLike } from '../platform/runtime'
import { showToast } from '../utils/toast'
// #623：设置中心「登录与安全」设备管理组件（Identity 状态 + 撤销）
import IdentityDeviceSettings from '../features/identity/components/IdentityDeviceSettings.vue'
// #627：设置中心「登录与安全」扫一扫登录入口（跨设备二维码授权）
import IdentityQrLoginEntry from '../features/identity/qr/IdentityQrLoginEntry.vue'
import {
  clearDebugLogs,
  formatDebugTime,
  getDebugLogs,
  pushDebugLog,
  subscribeDebugLogs
} from '../utils/debug_logger'
import {
  getNightModePreference,
  initNightModeClass,
  isNightModeEnabled,
  resolveNightModeDark,
  setNightModePreference
} from '../utils/night_mode'

const emit = defineEmits(['back', 'openWorkspaceLayout'])

// #627：扫一扫登录入口需要 IdentityCoordinator（由 App.vue 注入；web 预览等环境为 null）
const props = defineProps({
  identity: { type: Object, default: null }
})

const REMOTE_CONFIG_MODE_EVENT = 'hbu-remote-config-mode-changed'
const REMOTE_UPLOAD_ENDPOINT_KEY = 'hbu_temp_upload_endpoint'
const REMOTE_CONFIG_SNAPSHOT_KEY = 'hbu_remote_config_snapshot'
const DEFAULT_OCR_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/ocr/recognize'
const LOCAL_HOST_PATTERN =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i

const runtimeType = detectRuntime()
const isTauriApp = isTauriRuntime()
const isCapacitorApp = runtimeType === 'capacitor'
const runtimeLabel = computed(() => {
  if (runtimeType === 'tauri') return 'Tauri'
  if (runtimeType === 'capacitor') return 'Capacitor'
  return 'Web'
})

const activeTab = ref('appearance')
const uiSettings = useUiSettings()
const appSettings = useAppSettings()
const fontSettings = useFontSettings()

// #757 深浅色三态：'system' 跟随系统（默认）/ 'light' 白天 / 'dark' 夜间
const nightModeOptions = [
  { key: 'system', label: '跟随系统', desc: '自动适配系统深浅色' },
  { key: 'light', label: '白天', desc: '清爽明亮' },
  { key: 'dark', label: '夜间', desc: '夜间模式，保护眼睛' }
]
const nightModePreference = ref(getNightModePreference())
const isDarkMode = ref(isNightModeEnabled())
const themeTransitioning = ref(false)
const themeTransitionType = ref('') // 'to-dark' or 'to-light'

const nightModeHint = computed(() => {
  if (nightModePreference.value === 'system') return '正在跟随系统深浅色自动切换'
  return nightModePreference.value === 'dark' ? '夜间模式已开启，保护您的眼睛' : '白天模式，清爽明亮'
})

// 三态切换：保留原二态切换的全屏过渡动画，动画先播、主题后切
const setNightMode = (mode) => {
  if (nightModePreference.value === mode) return
  const willBeDark = resolveNightModeDark(mode)
  themeTransitionType.value = willBeDark ? 'to-dark' : 'to-light'
  themeTransitioning.value = true

  // 延迟切换实际主题，让动画先播放
  setTimeout(() => {
    nightModePreference.value = mode
    isDarkMode.value = setNightModePreference(mode)
    flushUiSettings()
  }, 400)

  // 动画结束后移除遮罩
  setTimeout(() => {
    themeTransitioning.value = false
    themeTransitionType.value = ''
  }, 1200)
}

// 初始化时读取偏好（含旧版二态键 hbu_dark_mode 的一次性迁移）与当前生效状态
const initDarkMode = () => {
  nightModePreference.value = getNightModePreference()
  isDarkMode.value = initNightModeClass()
}
initDarkMode()

const downloadingFont = ref(false)
const showFontModal = ref(false)
const fontDownloadProgress = ref(0)
const fontDownloadStatus = ref('idle')
const fontDownloadError = ref('')
const fontModalTitle = ref('字体加载')
const fontModalDescription = ref('正在处理字体资源，请稍候。')
const fontDownloadStep = ref('')
const fontModalRetryMode = ref('deyihei')
const pendingFontKey = ref('')
const cdnPrefetching = ref(false)
const probeRunning = ref(false)
const probeResults = ref({})
const probeFinishedAt = ref('')
const cloudSyncStatus = ref(null)
const cloudSyncStatusUpdatedAt = ref('')
let backendAutoApplyTimer = null
let backendAutoApplying = false
const debugLogs = ref([])
const debugFilter = ref('all')
const debugPanelRef = ref(null)
let unsubscribeDebugLogs = null

const DEBUG_LOG_LIMIT = 1000
const debugLevelOptions = [
  { key: 'all', label: '全部' },
  { key: 'debug', label: 'Debug' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' },
  { key: 'error', label: 'Error' },
  { key: 'log', label: 'Log' }
]

// 平台判断统一收敛到 src/platform/runtime.ts（单一来源）
const isMobileDevice = isMobileLike()

const currentStudentId = computed(() => localStorage.getItem('hbu_username') || '未登录')
const currentPresetLabel = computed(() => UI_PRESETS[uiSettings.preset]?.label || '自定义')
const activeDeviceLabel = computed(() => (isMobileDevice ? '移动端' : '桌面端'))
const backendSourceLabel = computed(() =>
  appSettings.backend.useRemoteConfig ? '远程配置（含本地兜底）' : '仅本地配置'
)
const activePreviewThreads = computed(() =>
  isMobileDevice
    ? appSettings.resourceShare.previewThreadsMobile
    : appSettings.resourceShare.previewThreadsDesktop
)
const activeDownloadThreads = computed(() =>
  isMobileDevice
    ? appSettings.resourceShare.downloadThreadsMobile
    : appSettings.resourceShare.downloadThreadsDesktop
)
const fontCdnOptions = FONT_CDN_OPTIONS
const localOnlyModeEnabled = computed(() => !appSettings.backend.useRemoteConfig)
const cloudSyncRuntime = computed(() => getCloudSyncRuntimeConfig())
const cloudSyncEnabledText = computed(() =>
  cloudSyncRuntime.value.enabled ? '已启用' : '未启用'
)
const cloudSyncUploadStatusText = computed(() => {
  const status = cloudSyncStatus.value
  if (!status || !status.lastUploadAt) return '暂无上传记录'
  return status.lastUploadOk ? '最近上传成功' : '最近上传失败'
})
const cloudSyncDownloadStatusText = computed(() => {
  const status = cloudSyncStatus.value
  if (!status || !status.lastDownloadAt) return '暂无下载记录'
  return status.lastDownloadOk ? '最近下载成功' : '最近下载失败'
})
const cloudSyncLastUploadError = computed(() =>
  String(cloudSyncStatus.value?.lastUploadError || '').trim()
)
const cloudSyncLastDownloadError = computed(() =>
  String(cloudSyncStatus.value?.lastDownloadError || '').trim()
)
const fontLocalAvailability = computed(() => {
  if (isMobileDevice) {
    return [
      '默认字体：本地可用（系统字体）',
      '黑体/宋体/楷体/仿宋：移动端通常不内置，建议先点“预缓存 CDN 字体”',
      '得意黑：需点击“下载得意黑”单独缓存'
    ]
  }
  return [
    '默认字体：本地可用（系统字体）',
    '黑体/宋体：Windows/macOS 上通常可本地替换',
    '楷体/仿宋：不同桌面系统覆盖不一致，建议预缓存 CDN 字体'
  ]
})
const FONT_DISPLAY_NAME = {
  heiti: '黑体',
  songti: '宋体',
  kaiti: '楷体',
  fangsong: '仿宋',
  deyihei: '得意黑'
}

const prefetchButtonText = computed(() => {
  const pending = String(pendingFontKey.value || '').trim()
  if (pending && pending !== 'default') {
    return `预缓存${FONT_DISPLAY_NAME[pending] || pending}`
  }
  const current = String(fontSettings.font || '').trim()
  if (current && current !== 'default') {
    return `预缓存${FONT_DISPLAY_NAME[current] || current}`
  }
  return '先选字体再缓存'
})

const filteredDebugLogs = computed(() => {
  if (debugFilter.value === 'all') return debugLogs.value
  return debugLogs.value.filter((item) => item.level === debugFilter.value)
})

const debugStats = computed(() => {
  const total = debugLogs.value.length
  const errors = debugLogs.value.filter((item) => item.level === 'error').length
  const warns = debugLogs.value.filter((item) => item.level === 'warn').length
  return { total, errors, warns }
})

const presetEntries = computed(() =>
  Object.entries(UI_PRESETS).map(([key, preset]) => ({
    key,
    ...preset
  }))
)

const toSafeText = (value) => String(value || '').trim()

const formatStatusTime = (value) => {
  const ts = Number(value || 0)
  if (!Number.isFinite(ts) || ts <= 0) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return '—'
  }
}

const refreshCloudSyncStatus = () => {
  const sid = String(localStorage.getItem('hbu_username') || '').trim()
  if (!sid) {
    cloudSyncStatus.value = null
    cloudSyncStatusUpdatedAt.value = ''
    return
  }
  const status = getCloudSyncLocalStatus(sid)
  cloudSyncStatus.value = status
  cloudSyncStatusUpdatedAt.value = new Date().toLocaleString()
}

const readSnapshotUploadEndpoint = () => {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY)
    if (!raw) return ''
    const snapshot = JSON.parse(raw)
    return toSafeText(
      snapshot?.temp_file_server?.schedule_upload_endpoint ||
        snapshot?.resource_share?.temp_upload_endpoint
    )
  } catch {
    return ''
  }
}

const getEffectiveUploadEndpoint = (backend) => {
  const localValue = toSafeText(backend?.tempUploadEndpoint)
  if (!backend?.useRemoteConfig) return localValue
  return (
    toSafeText(localStorage.getItem(REMOTE_UPLOAD_ENDPOINT_KEY)) ||
    readSnapshotUploadEndpoint() ||
    localValue
  )
}

const normalizeProbeTarget = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  const prefix = LOCAL_HOST_PATTERN.test(text) ? 'http://' : 'https://'
  return `${prefix}${text}`
}

const probeRows = computed(() => {
  const backend = appSettings.backend || {}
  const stored = getStoredOcrConfig()
  const uploadEndpoint = getEffectiveUploadEndpoint(backend)
  const cloudSyncConfig = getCloudSyncRuntimeConfig()
  const cloudSyncEndpoint = cloudSyncConfig.enabled
    ? normalizeProbeTarget(cloudSyncConfig.endpoint || DEFAULT_CLOUD_SYNC_ENDPOINT)
    : ''
  const localOcr = String(
    backend.ocrEndpoint ||
      (!backend.useRemoteConfig ? DEFAULT_OCR_ENDPOINT : stored.endpoint) ||
      ''
  ).trim()
  return [
    {
      id: 'ocr',
      label: 'OCR 服务器',
      url: normalizeProbeTarget(localOcr),
      desc: '验证码识别服务'
    },
    {
      id: 'upload',
      label: '临时上传服务器',
      url: normalizeProbeTarget(uploadEndpoint),
      desc: '课表导出临时文件上传'
    },
    {
      id: 'cloud_sync',
      label: '云同步服务',
      url: cloudSyncEndpoint,
      desc: '账号设置与课表云备份'
    },
    {
      id: 'portal',
      label: '新融合门户',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.portal),
      desc: '统一门户可达性'
    },
    {
      id: 'jwxt',
      label: '教务系统',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.jwxt),
      desc: '课程/成绩主系统'
    },
    {
      id: 'chaoxing',
      label: '超星渠道',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.chaoxing),
      desc: '教务超星入口'
    },
    {
      id: 'oneCode',
      label: '一码通',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.oneCode),
      desc: '一卡通与电费认证入口'
    },
    {
      id: 'library',
      label: '图书馆',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.library),
      desc: '图书服务站点'
    }
  ]
})

const cardStyleOptions = [
  { key: 'glass', label: '玻璃卡片', desc: '半透明层叠，观感轻盈' },
  { key: 'solid', label: '实体卡片', desc: '信息稳定，适合高频阅读' },
  { key: 'outline', label: '线框卡片', desc: '弱背景，强调边界层级' }
]

const navStyleOptions = [
  { key: 'floating', label: '悬浮导航', desc: '圆角悬浮底栏，现代移动风格' },
  { key: 'pill', label: '胶囊导航', desc: '选中态更突出，反馈更明显' },
  { key: 'compact', label: '紧凑导航', desc: '占用更少高度，提升信息密度' }
]

const densityOptions = [
  { key: 'comfortable', label: '舒适', desc: '留白更多，触控更友好' },
  { key: 'balanced', label: '均衡', desc: '效率与观感平衡（推荐）' },
  { key: 'compact', label: '紧凑', desc: '压缩间距，单屏显示更多内容' }
]

const startupPageOptions = [
  { key: 'home', label: '首页', desc: '默认进入综合首页' },
  { key: 'schedule', label: '课表', desc: '启动后直接进入课表' }
]

const interactionProfiles = [
  {
    key: 'mobile_focus',
    label: '移动高效',
    desc: '大按钮 · 紧凑间距 · 快速响应',
    patch: { radiusScale: 1.12, fontScale: 1.03, spaceScale: 1.08, motionScale: 0.9 },
    profile: { cardStyle: 'solid', navStyle: 'compact', density: 'compact', iconStyle: 'line', decor: 'none' }
  },
  {
    key: 'immersive_read',
    label: '沉浸阅读',
    desc: '柔和光效 · 舒适间距 · 细节丰富',
    patch: { radiusScale: 1.1, fontScale: 1.02, spaceScale: 1.04, motionScale: 1.0 },
    profile: { cardStyle: 'glass', navStyle: 'floating', density: 'comfortable', iconStyle: 'duotone', decor: 'grain' }
  },
  {
    key: 'minimal',
    label: '极简模式',
    desc: '线条简洁 · 信息密集 · 零装饰',
    patch: { radiusScale: 0.92, fontScale: 0.95, spaceScale: 0.9, motionScale: 0.85 },
    profile: { cardStyle: 'outline', navStyle: 'compact', density: 'compact', iconStyle: 'mono', decor: 'none' }
  },
  {
    key: 'classic',
    label: '经典布局',
    desc: '均衡配色 · 标准密度 · 双色图标',
    patch: { radiusScale: 1.0, fontScale: 1.0, spaceScale: 1.0, motionScale: 1.0 },
    profile: { cardStyle: 'solid', navStyle: 'pill', density: 'balanced', iconStyle: 'duotone', decor: 'mesh' }
  }
]

const withCacheBust = (url) => {
  const text = String(url || '').trim()
  if (!text) return ''
  return `${text}${text.includes('?') ? '&' : '?'}_probe=${Date.now()}`
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const toShortError = (error) => {
  const text = String(error?.message || error || '').toLowerCase()
  if (!text) return '请求失败'
  if (text.includes('timeout') || text.includes('aborted')) return '超时'
  if (text.includes('failed to fetch') || text.includes('network')) return '网络异常'
  if (text.length > 18) return `${text.slice(0, 18)}...`
  return text
}

const probeViaCapacitorHttp = async (url, timeoutMs) => {
  if (!isCapacitorApp) return null
  try {
    const core = await import('@capacitor/core')
    const capHttp = core?.CapacitorHttp || window?.Capacitor?.Plugins?.CapacitorHttp
    if (!capHttp?.request) return null
    const response = await capHttp.request({
      method: 'GET',
      url: withCacheBust(url),
      headers: { Accept: '*/*' },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs
    })
    return { status: Number(response?.status || 0), source: 'capacitor-http' }
  } catch {
    return null
  }
}

const probeViaFetch = async (url, timeoutMs) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = window.setTimeout(() => {
    controller?.abort?.()
  }, timeoutMs)
  try {
    const response = await fetch(withCacheBust(url), {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller?.signal
    })
    return { status: Number(response?.status || 0), source: 'fetch' }
  } finally {
    window.clearTimeout(timer)
  }
}

const probeViaImage = (url, timeoutMs) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    let done = false
    const timer = window.setTimeout(() => {
      if (done) return
      done = true
      img.onload = null
      img.onerror = null
      reject(new Error('timeout'))
    }, timeoutMs)

    const finish = (ok) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      if (ok) {
        resolve({ status: 0, source: 'image' })
      } else {
        reject(new Error('unreachable'))
      }
    }

    img.onload = () => finish(true)
    // 站点通常不是图片，onerror 仍可代表 DNS/TCP 可达。
    img.onerror = () => finish(true)
    img.src = withCacheBust(url)
  })

const probeEndpoint = async (url, timeoutMs) => {
  const start = nowMs()
  try {
    const capMeta = await probeViaCapacitorHttp(url, timeoutMs)
    if (capMeta) {
      return {
        status: 'success',
        latencyMs: Math.max(1, Math.round(nowMs() - start)),
        httpStatus: capMeta.status,
        source: capMeta.source
      }
    }

    const fetchMeta = await probeViaFetch(url, timeoutMs)
    return {
      status: 'success',
      latencyMs: Math.max(1, Math.round(nowMs() - start)),
      httpStatus: fetchMeta.status,
      source: fetchMeta.source
    }
  } catch (fetchError) {
    try {
      const imageMeta = await probeViaImage(url, timeoutMs)
      return {
        status: 'success',
        latencyMs: Math.max(1, Math.round(nowMs() - start)),
        httpStatus: imageMeta.status,
        source: imageMeta.source
      }
    } catch (imgError) {
      return {
        status: 'error',
        latencyMs: Math.max(1, Math.round(nowMs() - start)),
        error: toShortError(imgError || fetchError)
      }
    }
  }
}

const getProbeResult = (id) => probeResults.value[id] || { status: 'idle' }

const probeStateClass = (id) => {
  const result = getProbeResult(id)
  if (result.status === 'testing') return 'testing'
  if (result.status === 'error') return 'error'
  if (result.status === 'skipped') return 'idle'
  if (result.status !== 'success') return 'idle'
  if (result.latencyMs < 250) return 'fast'
  if (result.latencyMs < 800) return 'medium'
  return 'slow'
}

const probeStateText = (id) => {
  const result = getProbeResult(id)
  if (result.status === 'testing') return '检测中...'
  if (result.status === 'skipped') return '未配置地址'
  if (result.status === 'error') return `失败：${result.error || '请求异常'}`
  if (result.status === 'success') {
    if (result.httpStatus > 0) {
      return `${result.latencyMs} ms · HTTP ${result.httpStatus}`
    }
    return `${result.latencyMs} ms · 可达`
  }
  return '待检测'
}

const runSingleProbe = async (item, timeoutMs) => {
  if (!item.url) {
    probeResults.value = {
      ...probeResults.value,
      [item.id]: { status: 'skipped' }
    }
    return
  }
  pushDebugLog('Probe', `开始检测 ${item.label}: ${item.url}`, 'debug')
  probeResults.value = {
    ...probeResults.value,
    [item.id]: { status: 'testing' }
  }
  const result = await probeEndpoint(item.url, timeoutMs)
  pushDebugLog(
    'Probe',
    `${item.label} -> ${result.status}${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}`,
    result.status === 'error' ? 'warn' : 'info',
    result
  )
  probeResults.value = {
    ...probeResults.value,
    [item.id]: result
  }
}

const handleRunConnectivityTest = async () => {
  if (probeRunning.value) return
  const timeoutMs = Number(appSettings.backend.moduleParams.probeTimeoutMs || 8000)
  const rows = probeRows.value
  if (!rows.length) {
    showToast('当前没有可测速的目标地址', 'info')
    return
  }
  pushDebugLog('Settings', `开始功能测速：目标数=${rows.length}，超时=${timeoutMs}ms`, 'info')
  probeRunning.value = true
  probeFinishedAt.value = ''
  await Promise.all(rows.map((item) => runSingleProbe(item, timeoutMs)))
  probeRunning.value = false
  probeFinishedAt.value = new Date().toLocaleString()
  pushDebugLog('Settings', `功能测速完成，目标数=${rows.length}，超时=${timeoutMs}ms`, 'info')
  showToast('测速完成', 'success')
}

const refreshDebugPanel = () => {
  debugLogs.value = getDebugLogs(DEBUG_LOG_LIMIT)
}

const scrollDebugToBottom = () => {
  requestAnimationFrame(() => {
    const panel = debugPanelRef.value
    if (!panel) return
    panel.scrollTop = panel.scrollHeight
  })
}

const handleClearDebugPanel = () => {
  clearDebugLogs()
  refreshDebugPanel()
  showToast('调试日志已清空', 'success')
}

const handleCopyDebugLogs = async () => {
  const rows = debugLogs.value.map((item) => {
    return `${formatDebugTime(item.ts)} [${String(item.level || 'log').toUpperCase()}][${item.scope}] ${item.message}`
  })
  if (!rows.length) {
    showToast('当前没有调试日志', 'info')
    return
  }
  try {
    await navigator.clipboard.writeText(rows.join('\n'))
    showToast('调试日志已复制', 'success')
  } catch {
    showToast('复制失败，请检查剪贴板权限', 'error')
  }
}

const handleApplyPreset = (presetKey) => {
  applyPreset(presetKey)
  flushUiSettings()
  showToast(`已切换主题：${UI_PRESETS[presetKey].label}`, 'success')
}

const setProfileOption = (field, value, label) => {
  if (uiSettings.profile[field] === value) {
    flushUiSettings()
    showToast(`${label}已生效`, 'info')
    return
  }
  uiSettings.profile[field] = value
  flushUiSettings()
  showToast(`已切换：${label}`, 'success')
}

const handleApplyProfile = (profile) => {
  Object.entries(profile.patch).forEach(([k, v]) => {
    uiSettings[k] = v
  })
  if (profile.profile) {
    Object.entries(profile.profile).forEach(([k, v]) => {
      uiSettings.profile[k] = v
    })
  }
  flushUiSettings()
  showToast(`已应用方案：${profile.label}`, 'success')
}

const handleResetAppearance = () => {
  resetUiSettings()
  flushUiSettings()
  showToast('已恢复默认主题设置', 'success')
}

const handleApplyBackendSettings = async ({ silent = false, emitModeEvent = false } = {}) => {
  try {
    pushDebugLog(
      'Settings',
      `应用后端配置：useRemote=${appSettings.backend.useRemoteConfig ? '1' : '0'}`
    )
    const stored = getStoredOcrConfig()
    const customOcrEndpoint = String(appSettings.backend.ocrEndpoint || '').trim()
    const endpointList = customOcrEndpoint
      ? [customOcrEndpoint]
      : appSettings.backend.useRemoteConfig
        ? stored.endpoints
        : [DEFAULT_OCR_ENDPOINT]
    await applyOcrRuntimeConfig({
      ocr: {
        enabled: true,
        endpoint: endpointList[0] || stored.endpoint,
        endpoints: endpointList,
        local_fallback_endpoints: stored.local_fallback_endpoints
      }
    })
    window.dispatchEvent(new CustomEvent('hbu-ocr-config-updated'))

    const uploadEndpoint = String(appSettings.backend.tempUploadEndpoint || '').trim()
    const useRemoteConfig = appSettings.backend.useRemoteConfig
    const shouldWriteUploadEndpoint = !!uploadEndpoint || !useRemoteConfig

    if (shouldWriteUploadEndpoint) {
      if (uploadEndpoint) {
        localStorage.setItem(REMOTE_UPLOAD_ENDPOINT_KEY, uploadEndpoint)
      } else {
        localStorage.removeItem(REMOTE_UPLOAD_ENDPOINT_KEY)
      }
    }

    if (isTauriApp && shouldWriteUploadEndpoint) {
      await invokeNative('set_temp_upload_endpoint', { endpoint: uploadEndpoint || null })
    }

    const cloudSyncEndpoint = String(appSettings.backend.cloudSyncEndpoint || '').trim()
    const cloudSyncSecretRef = String(appSettings.backend.cloudSyncSecretRef || '').trim()
    const cloudSyncUploadCooldown = Number(appSettings.backend.moduleParams.cloudSyncUploadCooldownSec || 120)
    const cloudSyncDownloadCooldown = Number(appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec || 10)
    pushDebugLog(
      'Settings',
      `CloudSync 配置 endpoint=${cloudSyncEndpoint || '(remote/default)'} secret_ref=${cloudSyncSecretRef || '(remote/default)'} upload_cooldown=${cloudSyncUploadCooldown}s download_cooldown=${cloudSyncDownloadCooldown}s`,
      'debug'
    )

    if (emitModeEvent) {
      window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT))
    }

    if (!silent) {
      showToast('后端设置已应用', 'success')
    }
    pushDebugLog('Settings', '后端配置应用成功', 'info')
    return true
  } catch (e) {
    pushDebugLog('Settings', '后端配置应用失败', 'error', e)
    console.warn('[Settings] apply backend config failed', e)
    if (!silent) {
      showToast('应用后端设置失败，请检查地址格式', 'error')
    }
    return false
  }
}

const handleRemoteModeChanged = async () => {
  const nextUseRemoteConfig = !appSettings.backend.useRemoteConfig
  appSettings.backend.useRemoteConfig = nextUseRemoteConfig
  pushDebugLog('Settings', `切换配置源：${nextUseRemoteConfig ? '远程配置' : '仅本地'}`)
  if (nextUseRemoteConfig) {
    window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT))
    showToast('已启用远程配置', 'success')
    return
  }
  const ok = await handleApplyBackendSettings({ silent: true, emitModeEvent: true })
  if (ok) {
    showToast('已切换为仅本地配置', 'success')
  }
}

const handleResetBackend = () => {
  resetAppSettings()
  probeResults.value = {}
  probeFinishedAt.value = ''
  window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT))
  pushDebugLog('Settings', '后端参数已恢复默认')
  showToast('已恢复默认后端参数', 'success')
}

const clearBackendAutoApplyTimer = () => {
  if (backendAutoApplyTimer) {
    window.clearTimeout(backendAutoApplyTimer)
    backendAutoApplyTimer = null
  }
}

const scheduleBackendAutoApply = () => {
  clearBackendAutoApplyTimer()
  backendAutoApplyTimer = window.setTimeout(async () => {
    if (backendAutoApplying) return
    backendAutoApplying = true
    try {
      await handleApplyBackendSettings({ silent: true, emitModeEvent: false })
    } finally {
      backendAutoApplying = false
    }
  }, 420)
}

watch(
  () => [
    appSettings.backend.useRemoteConfig,
    appSettings.backend.ocrEndpoint,
    appSettings.backend.tempUploadEndpoint,
    appSettings.backend.cloudSyncEndpoint,
    appSettings.backend.cloudSyncSecretRef,
    appSettings.backend.moduleParams.requestTimeoutMs,
    appSettings.backend.moduleParams.probeTimeoutMs,
    appSettings.backend.moduleParams.cloudSyncCooldownSec,
    appSettings.backend.moduleParams.cloudSyncUploadCooldownSec,
    appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec,
    appSettings.retry.electricity,
    appSettings.retry.classroom,
    appSettings.retryDelayMs,
    appSettings.resourceShare.previewThreadsMobile,
    appSettings.resourceShare.previewThreadsDesktop,
    appSettings.resourceShare.downloadThreadsMobile,
    appSettings.resourceShare.downloadThreadsDesktop
  ],
  () => {
    scheduleBackendAutoApply()
  }
)

watch(
  () => activeTab.value,
  (tab) => {
    if (tab !== 'debug') return
    refreshDebugPanel()
    scrollDebugToBottom()
  }
)

watch(
  () => currentStudentId.value,
  () => {
    refreshCloudSyncStatus()
  }
)

onMounted(() => {
  refreshDebugPanel()
  refreshCloudSyncStatus()
  unsubscribeDebugLogs = subscribeDebugLogs((logs) => {
    debugLogs.value = logs.slice(-DEBUG_LOG_LIMIT)
    if (activeTab.value === 'debug') {
      scrollDebugToBottom()
    }
  })
  window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, refreshCloudSyncStatus)
  if (activeTab.value === 'debug') {
    scrollDebugToBottom()
  }
})

onBeforeUnmount(() => {
  clearBackendAutoApplyTimer()
  window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, refreshCloudSyncStatus)
  if (typeof unsubscribeDebugLogs === 'function') {
    unsubscribeDebugLogs()
    unsubscribeDebugLogs = null
  }
})

const handleSelectFont = async (fontKey) => {
  if (fontKey === 'default') {
    fontSettings.font = 'default'
    pendingFontKey.value = ''
    pushDebugLog('Font', '切换字体：默认')
    flushUiSettings()
    showToast('字体已应用', 'success')
    return
  }

  pushDebugLog('Font', `切换字体：${FONT_DISPLAY_NAME[fontKey] || fontKey}`)
  showFontModal.value = true
  fontModalTitle.value = `加载${FONT_DISPLAY_NAME[fontKey] || '字体'}`
  fontModalDescription.value = '正在检测本地缓存...'
  fontModalRetryMode.value = fontKey === 'deyihei' ? 'deyihei' : 'prefetch'
  fontDownloadProgress.value = 20
  fontDownloadStatus.value = 'downloading'
  fontDownloadError.value = ''
  fontDownloadStep.value = `检测本地缓存：${FONT_DISPLAY_NAME[fontKey] || fontKey}`

  // 第一步：尝试本地缓存（不联网）
  try {
    const cached = await ensureFontLoaded(fontKey, false, true)
    if (cached) {
      fontSettings.font = fontKey
      pendingFontKey.value = ''
      flushUiSettings()
      pushDebugLog('Font', `字体切换成功（缓存命中）：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, 'info')
      fontDownloadProgress.value = 100
      fontDownloadStatus.value = 'success'
      fontDownloadStep.value = '本地缓存命中，字体已应用'
      showToast('字体已应用', 'success')
      showFontModal.value = false
      return
    }
  } catch {
    // 缓存未命中，继续网络下载
  }

  // 第二步：本地缓存未命中，自动从 CDN 下载
  pushDebugLog('Font', `本地缓存未命中，开始从 CDN 下载：${FONT_DISPLAY_NAME[fontKey] || fontKey}`)
  fontModalDescription.value = '本地未缓存，正在从 CDN 下载字体...'
  fontDownloadProgress.value = 40
  fontDownloadStep.value = `正在下载：${FONT_DISPLAY_NAME[fontKey] || fontKey}`

  try {
    let loaded = false
    if (fontKey === 'deyihei') {
      loaded = await loadDeyiHeiFont(true)
    } else {
      loaded = await ensureFontLoaded(fontKey, true, false)
    }
    if (!loaded) throw new Error('font download failed')
    fontSettings.font = fontKey
    pendingFontKey.value = ''
    flushUiSettings()
    pushDebugLog('Font', `字体下载并应用成功：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, 'info')
    fontDownloadProgress.value = 100
    fontDownloadStatus.value = 'success'
    fontDownloadStep.value = '字体下载完成，已应用'
    showToast('字体已应用', 'success')
    showFontModal.value = false
  } catch (e) {
    console.warn('[Font] download failed', e)
    pendingFontKey.value = fontKey
    pushDebugLog('Font', `字体下载失败：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, 'error', e)
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = '字体下载失败，请检查网络后重试。'
    fontDownloadProgress.value = 0
    fontDownloadStep.value = ''
    showToast('字体下载失败，请检查网络后重试', 'error')
  }
}

const handleSelectCdnProvider = async (provider) => {
  if (fontSettings.cdnProvider === provider) return
  setFontCdnProvider(provider)
  if (fontSettings.font !== 'default') {
    await ensureFontLoaded(fontSettings.font, true)
  }
  pushDebugLog('Font', `切换 CDN 节点：${provider}`)
  showToast(`字体 CDN 已切换为：${provider === 'auto' ? '自动' : provider}`, 'success')
}

const handlePrefetchFonts = async (force = false, cacheAll = false) => {
  if (cdnPrefetching.value) return
  const pending = String(pendingFontKey.value || '').trim()
  const current = String(fontSettings.font || '').trim()
  let targets
  if (cacheAll) {
    targets = ['heiti', 'songti', 'kaiti', 'fangsong', 'deyihei']
  } else {
    targets = pending && pending !== 'default'
      ? [pending]
      : (current && current !== 'default' ? [current] : [])
  }
  if (!targets.length) {
    showToast('请先选择一个字体，再执行预缓存', 'info')
    return
  }
  pushDebugLog('Font', `开始预缓存字体，force=${force ? '1' : '0'}`)
  cdnPrefetching.value = true
  const needDeyiheiDownload = targets.includes('deyihei') && !fontSettings.loaded
  showFontModal.value = true
  fontModalTitle.value = cacheAll ? '缓存全部字体' : '预缓存云端字体'
  fontModalDescription.value = cacheAll
    ? `正在缓存全部 ${targets.length} 种字体...`
    : (needDeyiheiDownload
      ? '未检测到本地得意黑，将先缓存得意黑后再应用。'
      : `正在缓存：${targets.map((key) => FONT_DISPLAY_NAME[key] || key).join(' / ')}`)
  fontModalRetryMode.value = 'prefetch'
  fontDownloadProgress.value = 8
  fontDownloadStatus.value = 'downloading'
  fontDownloadError.value = ''
  fontDownloadStep.value = '准备预缓存字体...'
  try {
    const results = await prefetchCdnFonts(force, ({ key, index, total, ok }) => {
      const label = FONT_DISPLAY_NAME[key] || key
      if (showFontModal.value) {
        fontDownloadProgress.value = Math.max(12, Math.round((index / total) * 100))
        fontDownloadStep.value = `(${index}/${total}) ${label}${ok ? ' 缓存完成' : ' 缓存失败'}`
      }
    }, targets)
    const success = Object.values(results).filter(Boolean).length
    const requestedKey = targets[0]
    if (requestedKey && results[requestedKey]) {
      fontSettings.font = requestedKey
      pendingFontKey.value = ''
      flushUiSettings()
    }
    if (success === Object.keys(results).length) {
      pushDebugLog('Font', `字体预缓存完成：${success}/${Object.keys(results).length}`)
      fontDownloadStatus.value = 'success'
      showToast(`字体缓存完成：${success}/${Object.keys(results).length}`, 'success')
      showFontModal.value = false
    } else {
      pushDebugLog(
        'Font',
        `字体预缓存部分失败：${success}/${Object.keys(results).length}`,
        'warn',
        results
      )
      fontDownloadStatus.value = 'failed'
      fontDownloadError.value = `部分字体缓存失败（${success}/${Object.keys(results).length}）`
      showToast('部分字体缓存失败，请重试', 'error')
    }
  } catch (e) {
    pushDebugLog('Font', '字体预缓存失败', 'error', e)
    console.warn('[Font] prefetch failed', e)
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = '字体缓存失败，请检查网络后重试'
    fontDownloadProgress.value = 0
    fontDownloadStep.value = ''
    showToast('字体缓存失败，请检查网络后重试', 'error')
  } finally {
    cdnPrefetching.value = false
  }
}

const handleDownloadFont = async (force = false) => {
  if (downloadingFont.value) return
  pushDebugLog('Font', `下载得意黑：force=${force ? '1' : '0'}`)
  downloadingFont.value = true
  showFontModal.value = true
  fontModalTitle.value = '下载得意黑字体'
  fontModalDescription.value = '首次启用需下载字体文件，下载完成后会自动应用。'
  fontModalRetryMode.value = 'deyihei'
  fontDownloadStep.value = '准备下载得意黑...'
  fontDownloadProgress.value = 15
  fontDownloadStatus.value = 'downloading'
  fontDownloadError.value = ''
  try {
    const loaded = await loadDeyiHeiFont(force)
    if (!loaded) {
      throw new Error('font not loaded')
    }
    fontDownloadProgress.value = 100
    fontDownloadStatus.value = 'success'
    fontDownloadStep.value = '得意黑已缓存并应用'
    fontSettings.font = 'deyihei'
    pendingFontKey.value = ''
    pushDebugLog('Font', '得意黑下载并应用成功')
    showToast('字体下载完成，已应用得意黑', 'success')
    showFontModal.value = false
  } catch (e) {
    pushDebugLog('Font', '得意黑下载失败', 'error', e)
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = '字体下载失败，请检查网络后重试'
    fontDownloadProgress.value = 0
    fontDownloadStep.value = ''
    showToast('字体下载失败，请检查网络后重试', 'error')
    console.warn('[Font] download failed', e)
  } finally {
    downloadingFont.value = false
  }
}
</script>

<template src="../templates/views/SettingsView.html"></template>

<style src="../styles/views/SettingsView.scoped.css" scoped></style>
