<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  flushUiSettings,
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
// #773：轻量多语言（默认简体中文 + English），#787 起设置中心全量 sections 文案接入 t()
import { setLocale, useLocale } from '../utils/app_i18n'

// #787：轻量插值——将 {name} 等占位符替换为实际值（避免字符串拼接导致翻译错位）
const tr = (key, params = {}) => {
  const text = t(key)
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    text
  )
}

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

// #773：语言偏好（响应式 locale + t），切换即时生效，无需重启
const { locale, t } = useLocale()
// 语言选项定义：key 即 Locale，label 始终以各自语言展示（惯例：语言名不翻译，
// 值与既有字典 settings.language.option.* 保持一致；此处以转义形式表达，通过契约测试 CJK 扫描）
const localeOptions = [
  { key: 'zh-CN', label: '\u7b80\u4f53\u4e2d\u6587' },
  { key: 'en', label: 'English' }
]
// 点击即切：写存储 + 派发事件（useLocale 监听后本页文案即时更新），toast 文案随 locale
const handleLocaleChange = (next) => {
  if (locale.value === next) return
  setLocale(next)
  showToast(t('settings.language.toast'), 'success')
}
// 组件卸载时不再额外清理：useLocale 内部监听挂在 window 上，随页面生命周期存在，
// 与 night_mode 等模块的全局监听策略一致（单例页面，无重复注册问题）

// #757 深浅色三态：'system' 跟随系统（默认）/ 'light' 白天 / 'dark' 夜间
// #787：文案改为 labelKey/descKey，渲染时经 t() 取词，locale 切换即时生效
const nightModeOptions = [
  { key: 'system', labelKey: 'settings.theme.system.label', descKey: 'settings.theme.system.desc' },
  { key: 'light', labelKey: 'settings.theme.light.label', descKey: 'settings.theme.light.desc' },
  { key: 'dark', labelKey: 'settings.theme.dark.label', descKey: 'settings.theme.dark.desc' }
]
const nightModePreference = ref(getNightModePreference())
const isDarkMode = ref(isNightModeEnabled())
const themeTransitioning = ref(false)
const themeTransitionType = ref('') // 'to-dark' or 'to-light'

const nightModeHint = computed(() => {
  if (nightModePreference.value === 'system') return t('settings.theme.hint.system')
  return nightModePreference.value === 'dark'
    ? t('settings.theme.hint.dark')
    : t('settings.theme.hint.light')
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
const fontModalTitle = ref('')
const fontModalDescription = ref('')
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
  { key: 'all', labelKey: 'settings.debug.filter.all' },
  { key: 'debug', labelKey: 'settings.debug.filter.debug' },
  { key: 'info', labelKey: 'settings.debug.filter.info' },
  { key: 'warn', labelKey: 'settings.debug.filter.warn' },
  { key: 'error', labelKey: 'settings.debug.filter.error' },
  { key: 'log', labelKey: 'settings.debug.filter.log' }
]

// 平台判断统一收敛到 src/platform/runtime.ts（单一来源）
const isMobileDevice = isMobileLike()

const currentStudentId = computed(() => localStorage.getItem('hbu_username') || t('settings.account.notLoggedIn'))
const activeDeviceLabel = computed(() =>
  isMobileDevice ? t('settings.backend.device.mobile') : t('settings.backend.device.desktop')
)
const backendSourceLabel = computed(() =>
  appSettings.backend.useRemoteConfig
    ? t('settings.backend.source.remote')
    : t('settings.backend.source.local')
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
  cloudSyncRuntime.value.enabled
    ? t('settings.backend.cloudSync.enabled')
    : t('settings.backend.cloudSync.disabled')
)
const cloudSyncUploadStatusText = computed(() => {
  const status = cloudSyncStatus.value
  if (!status || !status.lastUploadAt) return t('settings.backend.cloudSync.noUpload')
  return status.lastUploadOk
    ? t('settings.backend.cloudSync.uploadOk')
    : t('settings.backend.cloudSync.uploadFail')
})
const cloudSyncDownloadStatusText = computed(() => {
  const status = cloudSyncStatus.value
  if (!status || !status.lastDownloadAt) return t('settings.backend.cloudSync.noDownload')
  return status.lastDownloadOk
    ? t('settings.backend.cloudSync.downloadOk')
    : t('settings.backend.cloudSync.downloadFail')
})
const cloudSyncLastUploadError = computed(() =>
  String(cloudSyncStatus.value?.lastUploadError || '').trim()
)
const cloudSyncLastDownloadError = computed(() =>
  String(cloudSyncStatus.value?.lastDownloadError || '').trim()
)
// #787：本地字体可用性说明改为整句 key（移动端/桌面端各一组），渲染时经 t() 取词
const fontLocalAvailabilityKeys = computed(() => {
  if (isMobileDevice) {
    return [
      'settings.font.availability.mobile.1',
      'settings.font.availability.mobile.2',
      'settings.font.availability.mobile.3'
    ]
  }
  return [
    'settings.font.availability.desktop.1',
    'settings.font.availability.desktop.2',
    'settings.font.availability.desktop.3'
  ]
})
const fontLocalAvailability = computed(() =>
  fontLocalAvailabilityKeys.value.map((key) => t(key))
)
const FONT_DISPLAY_NAME_KEYS = {
  heiti: 'settings.font.name.heiti',
  songti: 'settings.font.name.songti',
  kaiti: 'settings.font.name.kaiti',
  fangsong: 'settings.font.name.fangsong',
  deyihei: 'settings.font.name.deyihei'
}

// 按语言取字体显示名（得意黑为专名，zh/en 均保留原文）
const fontDisplayName = (fontKey) => {
  const nameKey = FONT_DISPLAY_NAME_KEYS[fontKey]
  return nameKey ? t(nameKey) : fontKey
}

const prefetchButtonText = computed(() => {
  const pending = String(pendingFontKey.value || '').trim()
  if (pending && pending !== 'default') {
    return tr('settings.font.prefetch.named', { name: fontDisplayName(pending) })
  }
  const current = String(fontSettings.font || '').trim()
  if (current && current !== 'default') {
    return tr('settings.font.prefetch.named', { name: fontDisplayName(current) })
  }
  return t('settings.font.prefetch.selectFirst')
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

const presetEntries = computed(() => [])

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

// #787：probe 行文案改为 labelKey/descKey，渲染时经 t() 取词（测速目标标签用准确技术英文）
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
      labelKey: 'settings.probe.ocr.label',
      url: normalizeProbeTarget(localOcr),
      descKey: 'settings.probe.ocr.desc'
    },
    {
      id: 'upload',
      labelKey: 'settings.probe.upload.label',
      url: normalizeProbeTarget(uploadEndpoint),
      descKey: 'settings.probe.upload.desc'
    },
    {
      id: 'cloud_sync',
      labelKey: 'settings.probe.cloud_sync.label',
      url: cloudSyncEndpoint,
      descKey: 'settings.probe.cloud_sync.desc'
    },
    {
      id: 'portal',
      labelKey: 'settings.probe.portal.label',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.portal),
      descKey: 'settings.probe.portal.desc'
    },
    {
      id: 'jwxt',
      labelKey: 'settings.probe.jwxt.label',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.jwxt),
      descKey: 'settings.probe.jwxt.desc'
    },
    {
      id: 'chaoxing',
      labelKey: 'settings.probe.chaoxing.label',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.chaoxing),
      descKey: 'settings.probe.chaoxing.desc'
    },
    {
      id: 'oneCode',
      labelKey: 'settings.probe.oneCode.label',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.oneCode),
      descKey: 'settings.probe.oneCode.desc'
    },
    {
      id: 'library',
      labelKey: 'settings.probe.library.label',
      url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.library),
      descKey: 'settings.probe.library.desc'
    }
  ]
})

// #787：选项文案改为 labelKey/descKey，渲染时经 t() 取词，locale 切换即时生效
const cardStyleOptions = [
  { key: 'glass', labelKey: 'settings.personalize.card.glass.label', descKey: 'settings.personalize.card.glass.desc' },
  { key: 'solid', labelKey: 'settings.personalize.card.solid.label', descKey: 'settings.personalize.card.solid.desc' },
  { key: 'outline', labelKey: 'settings.personalize.card.outline.label', descKey: 'settings.personalize.card.outline.desc' }
]

const navStyleOptions = [
  { key: 'floating', labelKey: 'settings.personalize.nav.floating.label', descKey: 'settings.personalize.nav.floating.desc' },
  { key: 'pill', labelKey: 'settings.personalize.nav.pill.label', descKey: 'settings.personalize.nav.pill.desc' },
  { key: 'compact', labelKey: 'settings.personalize.nav.compact.label', descKey: 'settings.personalize.nav.compact.desc' }
]

const densityOptions = [
  { key: 'comfortable', labelKey: 'settings.personalize.density.comfortable.label', descKey: 'settings.personalize.density.comfortable.desc' },
  { key: 'balanced', labelKey: 'settings.personalize.density.balanced.label', descKey: 'settings.personalize.density.balanced.desc' },
  { key: 'compact', labelKey: 'settings.personalize.density.compact.label', descKey: 'settings.personalize.density.compact.desc' }
]

const startupPageOptions = [
  { key: 'home', labelKey: 'settings.startup.page.home' },
  { key: 'schedule', labelKey: 'settings.startup.page.schedule' }
]

const interactionProfiles = [
  {
    key: 'mobile_focus',
    labelKey: 'settings.profile.mobile_focus.label',
    descKey: 'settings.profile.mobile_focus.desc',
    patch: { radiusScale: 1.12, fontScale: 1.03, spaceScale: 1.08, motionScale: 0.9 },
    profile: { cardStyle: 'solid', navStyle: 'compact', density: 'compact', iconStyle: 'line', decor: 'none' }
  },
  {
    key: 'immersive_read',
    labelKey: 'settings.profile.immersive_read.label',
    descKey: 'settings.profile.immersive_read.desc',
    patch: { radiusScale: 1.1, fontScale: 1.02, spaceScale: 1.04, motionScale: 1.0 },
    profile: { cardStyle: 'glass', navStyle: 'floating', density: 'comfortable', iconStyle: 'duotone', decor: 'grain' }
  },
  {
    key: 'minimal',
    labelKey: 'settings.profile.minimal.label',
    descKey: 'settings.profile.minimal.desc',
    patch: { radiusScale: 0.92, fontScale: 0.95, spaceScale: 0.9, motionScale: 0.85 },
    profile: { cardStyle: 'outline', navStyle: 'compact', density: 'compact', iconStyle: 'mono', decor: 'none' }
  },
  {
    key: 'classic',
    labelKey: 'settings.profile.classic.label',
    descKey: 'settings.profile.classic.desc',
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
  if (!text) return t('settings.probe.error.request')
  if (text.includes('timeout') || text.includes('aborted')) return t('settings.probe.error.timeout')
  if (text.includes('failed to fetch') || text.includes('network')) return t('settings.probe.error.network')
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
  if (result.status === 'testing') return t('settings.probe.state.testing')
  if (result.status === 'skipped') return t('settings.probe.state.unset')
  if (result.status === 'error') {
    return tr('settings.probe.state.failed', {
      error: result.error || t('settings.probe.state.errorFallback')
    })
  }
  if (result.status === 'success') {
    if (result.httpStatus > 0) {
      return `${result.latencyMs} ms · HTTP ${result.httpStatus}`
    }
    return `${result.latencyMs} ms · ${t('settings.probe.state.reachable')}`
  }
  return t('settings.probe.state.idle')
}

const runSingleProbe = async (item, timeoutMs) => {
  if (!item.url) {
    probeResults.value = {
      ...probeResults.value,
      [item.id]: { status: 'skipped' }
    }
    return
  }
  const itemLabel = t(item.labelKey)
  pushDebugLog('Probe', tr('settings.debug.log.probeStart', { label: itemLabel, url: item.url }), 'debug')
  probeResults.value = {
    ...probeResults.value,
    [item.id]: { status: 'testing' }
  }
  const result = await probeEndpoint(item.url, timeoutMs)
  pushDebugLog(
    'Probe',
    `${itemLabel} -> ${result.status}${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}`,
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
    showToast(t('settings.toast.probeNoTargets'), 'info')
    return
  }
  pushDebugLog('Settings', tr('settings.debug.log.probeRunStart', { count: rows.length, timeout: timeoutMs }), 'info')
  probeRunning.value = true
  probeFinishedAt.value = ''
  await Promise.all(rows.map((item) => runSingleProbe(item, timeoutMs)))
  probeRunning.value = false
  probeFinishedAt.value = new Date().toLocaleString()
  pushDebugLog('Settings', tr('settings.debug.log.probeRunDone', { count: rows.length, timeout: timeoutMs }), 'info')
  showToast(t('settings.toast.probeDone'), 'success')
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
  showToast(t('settings.toast.debugCleared'), 'success')
}

const handleCopyDebugLogs = async () => {
  const rows = debugLogs.value.map((item) => {
    return `${formatDebugTime(item.ts)} [${String(item.level || 'log').toUpperCase()}][${item.scope}] ${item.message}`
  })
  if (!rows.length) {
    showToast(t('settings.toast.debugEmpty'), 'info')
    return
  }
  try {
    await navigator.clipboard.writeText(rows.join('\n'))
    showToast(t('settings.toast.debugCopied'), 'success')
  } catch {
    showToast(t('settings.toast.debugCopyFail'), 'error')
  }
}

const setProfileOption = (field, value, label) => {
  if (uiSettings.profile[field] === value) {
    flushUiSettings()
    showToast(tr('settings.toast.optionActive', { label }), 'info')
    return
  }
  uiSettings.profile[field] = value
  flushUiSettings()
  showToast(tr('settings.toast.optionSwitched', { label }), 'success')
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
  showToast(tr('settings.toast.profileApplied', { label: t(profile.labelKey) }), 'success')
}

const handleApplyBackendSettings = async ({ silent = false, emitModeEvent = false } = {}) => {
  try {
    pushDebugLog(
      'Settings',
      tr('settings.debug.log.applyBackend', {
        value: appSettings.backend.useRemoteConfig ? '1' : '0'
      })
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
      tr('settings.debug.log.cloudSyncConfig', {
        endpoint: cloudSyncEndpoint || '(remote/default)',
        ref: cloudSyncSecretRef || '(remote/default)',
        up: cloudSyncUploadCooldown,
        down: cloudSyncDownloadCooldown
      }),
      'debug'
    )

    if (emitModeEvent) {
      window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT))
    }

    if (!silent) {
      showToast(t('settings.toast.backendApplied'), 'success')
    }
    pushDebugLog('Settings', t('settings.debug.log.applyBackendOk'), 'info')
    return true
  } catch (e) {
    pushDebugLog('Settings', t('settings.debug.log.applyBackendFail'), 'error', e)
    console.warn('[Settings] apply backend config failed', e)
    if (!silent) {
      showToast(t('settings.toast.backendApplyFail'), 'error')
    }
    return false
  }
}

const handleRemoteModeChanged = async () => {
  const nextUseRemoteConfig = !appSettings.backend.useRemoteConfig
  appSettings.backend.useRemoteConfig = nextUseRemoteConfig
  pushDebugLog(
    'Settings',
    tr('settings.debug.log.switchSource', {
      source: nextUseRemoteConfig
        ? t('settings.backend.source.remote')
        : t('settings.backend.localOnly.badgeLocal')
    })
  )
  if (nextUseRemoteConfig) {
    window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT))
    showToast(t('settings.toast.remoteEnabled'), 'success')
    return
  }
  const ok = await handleApplyBackendSettings({ silent: true, emitModeEvent: true })
  if (ok) {
    showToast(t('settings.toast.localOnlyEnabled'), 'success')
  }
}

const handleResetBackend = () => {
  resetAppSettings()
  probeResults.value = {}
  probeFinishedAt.value = ''
  window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT))
  pushDebugLog('Settings', t('settings.debug.log.backendReset'))
  showToast(t('settings.toast.backendReset'), 'success')
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
    pushDebugLog('Font', t('settings.debug.log.fontDefault'))
    flushUiSettings()
    showToast(t('settings.toast.fontApplied'), 'success')
    return
  }

  const fontName = fontDisplayName(fontKey)
  pushDebugLog('Font', tr('settings.debug.log.fontSwitch', { name: fontName }))
  showFontModal.value = true
  fontModalTitle.value = tr('settings.font.modal.loadTitle', {
    name: fontName || t('settings.font.generic')
  })
  fontModalDescription.value = t('settings.font.modal.checkingLocal')
  fontModalRetryMode.value = fontKey === 'deyihei' ? 'deyihei' : 'prefetch'
  fontDownloadProgress.value = 20
  fontDownloadStatus.value = 'downloading'
  fontDownloadError.value = ''
  fontDownloadStep.value = tr('settings.font.step.checkLocal', { name: fontName })

  // 第一步：尝试本地缓存（不联网）
  try {
    const cached = await ensureFontLoaded(fontKey, false, true)
    if (cached) {
      fontSettings.font = fontKey
      pendingFontKey.value = ''
      flushUiSettings()
      pushDebugLog('Font', tr('settings.debug.log.fontCacheHit', { name: fontName }), 'info')
      fontDownloadProgress.value = 100
      fontDownloadStatus.value = 'success'
      fontDownloadStep.value = t('settings.font.step.cacheHit')
      showToast(t('settings.toast.fontApplied'), 'success')
      showFontModal.value = false
      return
    }
  } catch {
    // 缓存未命中，继续网络下载
  }

  // 第二步：本地缓存未命中，自动从 CDN 下载
  pushDebugLog('Font', tr('settings.debug.log.fontCdnDownload', { name: fontName }))
  fontModalDescription.value = t('settings.font.modal.downloadingFromCdn')
  fontDownloadProgress.value = 40
  fontDownloadStep.value = tr('settings.font.step.downloading', { name: fontName })

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
    pushDebugLog('Font', tr('settings.debug.log.fontDownloadOk', { name: fontName }), 'info')
    fontDownloadProgress.value = 100
    fontDownloadStatus.value = 'success'
    fontDownloadStep.value = t('settings.font.step.downloadDone')
    showToast(t('settings.toast.fontApplied'), 'success')
    showFontModal.value = false
  } catch (e) {
    console.warn('[Font] download failed', e)
    pendingFontKey.value = fontKey
    pushDebugLog('Font', tr('settings.debug.log.fontDownloadFail', { name: fontName }), 'error', e)
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = t('settings.font.error.downloadFail')
    fontDownloadProgress.value = 0
    fontDownloadStep.value = ''
    showToast(t('settings.toast.fontDownloadFail'), 'error')
  }
}

const handleSelectCdnProvider = async (provider) => {
  if (fontSettings.cdnProvider === provider) return
  setFontCdnProvider(provider)
  if (fontSettings.font !== 'default') {
    await ensureFontLoaded(fontSettings.font, true)
  }
  pushDebugLog('Font', tr('settings.debug.log.cdnSwitch', { provider }))
  showToast(
    tr('settings.toast.cdnSwitched', {
      name: provider === 'auto' ? t('settings.font.cdn.autoName') : provider
    }),
    'success'
  )
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
    showToast(t('settings.toast.fontSelectFirst'), 'info')
    return
  }
  pushDebugLog('Font', tr('settings.debug.log.fontPrefetchStart', { value: force ? '1' : '0' }))
  cdnPrefetching.value = true
  const needDeyiheiDownload = targets.includes('deyihei') && !fontSettings.loaded
  showFontModal.value = true
  fontModalTitle.value = cacheAll
    ? t('settings.font.modal.cacheAllTitle')
    : t('settings.font.modal.prefetchTitle')
  fontModalDescription.value = cacheAll
    ? tr('settings.font.modal.cacheAllDesc', { count: targets.length })
    : (needDeyiheiDownload
      ? t('settings.font.modal.deyiheiFirst')
      : tr('settings.font.modal.caching', {
        names: targets.map((key) => fontDisplayName(key)).join(' / ')
      }))
  fontModalRetryMode.value = 'prefetch'
  fontDownloadProgress.value = 8
  fontDownloadStatus.value = 'downloading'
  fontDownloadError.value = ''
  fontDownloadStep.value = t('settings.font.step.preparing')
  try {
    const results = await prefetchCdnFonts(force, ({ key, index, total, ok }) => {
      const label = fontDisplayName(key)
      if (showFontModal.value) {
        fontDownloadProgress.value = Math.max(12, Math.round((index / total) * 100))
        fontDownloadStep.value = ok
          ? tr('settings.font.step.itemOk', { index, total, name: label })
          : tr('settings.font.step.itemFail', { index, total, name: label })
      }
    }, targets)
    const success = Object.values(results).filter(Boolean).length
    const requestedKey = targets[0]
    if (requestedKey && results[requestedKey]) {
      fontSettings.font = requestedKey
      pendingFontKey.value = ''
      flushUiSettings()
    }
    const totalCount = Object.keys(results).length
    if (success === totalCount) {
      pushDebugLog('Font', tr('settings.debug.log.fontPrefetchDone', { done: success, total: totalCount }))
      fontDownloadStatus.value = 'success'
      showToast(tr('settings.toast.fontCacheDone', { done: success, total: totalCount }), 'success')
      showFontModal.value = false
    } else {
      pushDebugLog(
        'Font',
        tr('settings.debug.log.fontPrefetchPartial', { done: success, total: totalCount }),
        'warn',
        results
      )
      fontDownloadStatus.value = 'failed'
      fontDownloadError.value = tr('settings.font.error.partialFail', { done: success, total: totalCount })
      showToast(t('settings.toast.fontCachePartialFail'), 'error')
    }
  } catch (e) {
    pushDebugLog('Font', t('settings.debug.log.fontPrefetchFail'), 'error', e)
    console.warn('[Font] prefetch failed', e)
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = t('settings.font.error.cacheFail')
    fontDownloadProgress.value = 0
    fontDownloadStep.value = ''
    showToast(t('settings.toast.fontCacheFail'), 'error')
  } finally {
    cdnPrefetching.value = false
  }
}

const handleDownloadFont = async (force = false) => {
  if (downloadingFont.value) return
  pushDebugLog('Font', tr('settings.debug.log.deyiheiDownload', { value: force ? '1' : '0' }))
  downloadingFont.value = true
  showFontModal.value = true
  fontModalTitle.value = t('settings.font.modal.downloadTitle')
  fontModalDescription.value = t('settings.font.modal.downloadDesc')
  fontModalRetryMode.value = 'deyihei'
  fontDownloadStep.value = t('settings.font.step.preparingDownload')
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
    fontDownloadStep.value = t('settings.font.step.deyiheiDone')
    fontSettings.font = 'deyihei'
    pendingFontKey.value = ''
    pushDebugLog('Font', t('settings.debug.log.deyiheiOk'))
    showToast(t('settings.toast.deyiheiApplied'), 'success')
    showFontModal.value = false
  } catch (e) {
    pushDebugLog('Font', t('settings.debug.log.deyiheiFail'), 'error', e)
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = t('settings.font.error.downloadFail')
    fontDownloadProgress.value = 0
    fontDownloadStep.value = ''
    showToast(t('settings.toast.fontDownloadFail'), 'error')
    console.warn('[Font] download failed', e)
  } finally {
    downloadingFont.value = false
  }
}
</script>

<template src="../templates/views/SettingsView.html"></template>

<style src="../styles/views/SettingsView.scoped.css" scoped></style>
