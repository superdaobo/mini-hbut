<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  applyPreset,
  flushUiSettings,
  resetUiSettings,
  UI_PRESETS,
  useUiSettings
} from '../utils/ui_settings'
import { DEFAULT_BACKEND_TARGETS, resetAppSettings, useAppSettings } from '../utils/app_settings'
import {
  FONT_CDN_OPTIONS,
  ensureFontLoaded,
  loadDeyiHeiFont,
  prefetchCdnFonts,
  setFontCdnProvider,
  useFontSettings
} from '../utils/font_settings'
import { applyOcrRuntimeConfig, getStoredOcrConfig } from '../utils/remote_config'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { detectRuntime } from '../platform/runtime'
import { showToast } from '../utils/toast'
import hbutLogo from '../assets/hbut-logo.png'

const emit = defineEmits(['back'])

const REMOTE_CONFIG_MODE_EVENT = 'hbu-remote-config-mode-changed'
const REMOTE_UPLOAD_ENDPOINT_KEY = 'hbu_temp_upload_endpoint'
const REMOTE_CONFIG_SNAPSHOT_KEY = 'hbu_remote_config_snapshot'
const DEFAULT_OCR_ENDPOINT = 'https://mini-hbut-ocr-service.hf.space/api/ocr/recognize'
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

const downloadingFont = ref(false)
const showFontModal = ref(false)
const fontDownloadProgress = ref(0)
const fontDownloadStatus = ref('idle')
const fontDownloadError = ref('')
const fontModalTitle = ref('字体加载')
const fontModalDescription = ref('正在处理字体资源，请稍候。')
const fontDownloadStep = ref('')
const fontModalRetryMode = ref('deyihei')
const cdnPrefetching = ref(false)
const probeRunning = ref(false)
const probeResults = ref({})
const probeFinishedAt = ref('')
let backendAutoApplyTimer = null
let backendAutoApplying = false

const isMobileDevice = (() => {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent || '')
})()

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

const presetEntries = computed(() =>
  Object.entries(UI_PRESETS).map(([key, preset]) => ({
    key,
    ...preset
  }))
)

const toSafeText = (value) => String(value || '').trim()

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

const iconOptions = [
  { key: 'duotone', label: '双色图标', desc: '重点信息更醒目' },
  { key: 'line', label: '线性图标', desc: '简洁专业，细节清晰' },
  { key: 'mono', label: '单色图标', desc: '弱化装饰，强化可读性' }
]

const decorOptions = [
  { key: 'mesh', label: '网格光斑', desc: '轻微光效与网格纹理' },
  { key: 'grain', label: '纸感颗粒', desc: '弱纹理背景，减少视觉疲劳' },
  { key: 'none', label: '纯净背景', desc: '移除装饰，仅保留渐变底色' }
]

const interactionProfiles = [
  {
    key: 'mobile_focus',
    label: '移动高效',
    desc: '按钮更大，动画更克制',
    patch: { radiusScale: 1.12, fontScale: 1.03, spaceScale: 1.08, motionScale: 0.9 }
  },
  {
    key: 'desktop_dense',
    label: '桌面密集',
    desc: '信息更紧凑，浏览更高效',
    patch: { radiusScale: 0.92, fontScale: 0.95, spaceScale: 0.9, motionScale: 0.85 }
  },
  {
    key: 'presentation',
    label: '展示模式',
    desc: '字号更大，过渡更柔和',
    patch: { radiusScale: 1.1, fontScale: 1.08, spaceScale: 1.06, motionScale: 1.12 }
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
  probeResults.value = {
    ...probeResults.value,
    [item.id]: { status: 'testing' }
  }
  const result = await probeEndpoint(item.url, timeoutMs)
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
  probeRunning.value = true
  probeFinishedAt.value = ''
  await Promise.all(rows.map((item) => runSingleProbe(item, timeoutMs)))
  probeRunning.value = false
  probeFinishedAt.value = new Date().toLocaleString()
  showToast('测速完成', 'success')
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

    if (emitModeEvent) {
      window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT))
    }

    if (!silent) {
      showToast('后端设置已应用', 'success')
    }
    return true
  } catch (e) {
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
    appSettings.backend.moduleParams.requestTimeoutMs,
    appSettings.backend.moduleParams.probeTimeoutMs,
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

onBeforeUnmount(() => {
  clearBackendAutoApplyTimer()
})

const handleSelectFont = async (fontKey) => {
  if (fontKey === 'default') {
    fontSettings.font = 'default'
    flushUiSettings()
    showToast('字体已应用', 'success')
    return
  }

  showFontModal.value = true
  fontModalTitle.value = `加载${FONT_DISPLAY_NAME[fontKey] || '字体'}`
  fontModalDescription.value = '正在检测本地缓存，如缺失会自动联网下载。'
  fontModalRetryMode.value = 'deyihei'
  fontDownloadProgress.value = 20
  fontDownloadStatus.value = 'downloading'
  fontDownloadError.value = ''
  fontDownloadStep.value = `准备加载：${FONT_DISPLAY_NAME[fontKey] || fontKey}`

  if (fontKey === 'deyihei' && fontSettings.loaded) {
    fontSettings.font = 'deyihei'
    flushUiSettings()
    fontDownloadProgress.value = 100
    fontDownloadStatus.value = 'success'
    fontDownloadStep.value = '本地缓存命中，已直接应用'
    showToast('已应用得意黑', 'success')
    showFontModal.value = false
    return
  }

  try {
    const loaded = await ensureFontLoaded(fontKey, false)
    if (!loaded) {
      const retryLoaded = await ensureFontLoaded(fontKey, true)
      if (!retryLoaded) {
        throw new Error('font not loaded')
      }
    }
    fontSettings.font = fontKey
    flushUiSettings()
    fontDownloadProgress.value = 100
    fontDownloadStatus.value = 'success'
    fontDownloadStep.value = '字体加载成功'
    showToast('字体已应用', 'success')
    showFontModal.value = false
    return
  } catch (e) {
    console.warn('[Font] apply failed', e)
  }

  if (fontKey !== 'deyihei') {
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = '字体加载失败，请检查网络后重试'
    fontDownloadProgress.value = 0
    fontDownloadStep.value = ''
    showToast('字体加载失败，请检查网络后重试', 'error')
    showFontModal.value = false
    return
  }

  showFontModal.value = true
  await handleDownloadFont()
}

const handleSelectCdnProvider = async (provider) => {
  if (fontSettings.cdnProvider === provider) return
  setFontCdnProvider(provider)
  if (fontSettings.font !== 'default') {
    await ensureFontLoaded(fontSettings.font, true)
  }
  showToast(`字体 CDN 已切换为：${provider === 'auto' ? '自动' : provider}`, 'success')
}

const handlePrefetchFonts = async (force = false) => {
  if (cdnPrefetching.value) return
  cdnPrefetching.value = true
  const needDeyiheiDownload = !fontSettings.loaded
  showFontModal.value = needDeyiheiDownload
  fontModalTitle.value = '预缓存云端字体'
  fontModalDescription.value = needDeyiheiDownload
    ? '未检测到本地得意黑，将先弹窗下载得意黑，再继续缓存其余字体。'
    : '正在依次检测并缓存黑体、宋体、楷体、仿宋、得意黑。'
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
    })
    const success = Object.values(results).filter(Boolean).length
    if (fontSettings.font !== 'default') {
      await ensureFontLoaded(fontSettings.font, true)
    }
    if (success === Object.keys(results).length) {
      fontDownloadStatus.value = 'success'
      showToast(`字体缓存完成：${success}/${Object.keys(results).length}`, 'success')
      showFontModal.value = false
    } else {
      fontDownloadStatus.value = 'failed'
      fontDownloadError.value = `部分字体缓存失败（${success}/${Object.keys(results).length}）`
      showToast('部分字体缓存失败，请重试', 'error')
    }
  } catch (e) {
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
    showToast('字体下载完成，已应用得意黑', 'success')
    showFontModal.value = false
  } catch (e) {
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

<template>
  <div class="settings-view">
    <header class="dashboard-header settings-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <div class="title-wrap">
          <span class="title">系统设置</span>
          <span class="sub-title">主题、后端与测速</span>
        </div>
      </div>
      <button class="header-btn btn-ripple" @click="emit('back')">返回</button>
    </header>

    <section class="settings-intro glass-card">
      <div class="pill-row">
        <span class="meta-pill student-pill">学号：{{ currentStudentId }}</span>
        <span class="meta-pill">设备：{{ activeDeviceLabel }}</span>
        <span class="meta-pill">主题：{{ currentPresetLabel }}</span>
      </div>
      <p>统一管理主题外观、后端地址与模块参数，配置会自动保存并可一键测速验证。</p>
    </section>

    <div class="tab-bar">
      <button class="tab-btn btn-ripple" :class="{ active: activeTab === 'appearance' }" @click="activeTab = 'appearance'">
        外观
      </button>
      <button class="tab-btn btn-ripple" :class="{ active: activeTab === 'backend' }" @click="activeTab = 'backend'">
        后端
      </button>
    </div>

    <template v-if="activeTab === 'appearance'">
      <section class="settings-section glass-card">
        <div class="section-head">
          <h3>主题（5 选 1）</h3>
          <button class="mini-btn btn-ripple" @click="handleResetAppearance">恢复默认</button>
        </div>
        <div class="preset-grid">
          <button
            v-for="preset in presetEntries"
            :key="preset.key"
            class="preset-card"
            :class="{ active: uiSettings.preset === preset.key }"
            @click="handleApplyPreset(preset.key)"
          >
            <span class="preset-swatch" :style="{ background: preset.background }"></span>
            <span class="preset-name">{{ preset.label }}</span>
            <span class="preset-tagline">{{ preset.tagline }}</span>
          </button>
        </div>
      </section>

      <section class="settings-section glass-card">
        <h3>界面个性化</h3>
        <div class="option-group">
          <label>卡片风格</label>
          <div class="chip-row">
            <button
              v-for="item in cardStyleOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.cardStyle === item.key }"
              @click="setProfileOption('cardStyle', item.key, `卡片风格：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>导航样式</label>
          <div class="chip-row">
            <button
              v-for="item in navStyleOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.navStyle === item.key }"
              @click="setProfileOption('navStyle', item.key, `导航样式：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>界面密度</label>
          <div class="chip-row">
            <button
              v-for="item in densityOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.density === item.key }"
              @click="setProfileOption('density', item.key, `界面密度：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>图标风格</label>
          <div class="chip-row">
            <button
              v-for="item in iconOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.iconStyle === item.key }"
              @click="setProfileOption('iconStyle', item.key, `图标风格：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>背景装饰</label>
          <div class="chip-row">
            <button
              v-for="item in decorOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.decor === item.key }"
              @click="setProfileOption('decor', item.key, `背景装饰：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section glass-card">
        <h3>快捷方案</h3>
        <div class="profile-grid">
          <button
            v-for="profile in interactionProfiles"
            :key="profile.key"
            class="profile-card"
            @click="handleApplyProfile(profile)"
          >
            <strong>{{ profile.label }}</strong>
            <span>{{ profile.desc }}</span>
          </button>
        </div>
      </section>

      <section class="settings-section glass-card">
        <h3>字体</h3>
        <div class="font-actions">
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'default' }" @click="handleSelectFont('default')">
            默认字体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'heiti' }" @click="handleSelectFont('heiti')">
            黑体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'songti' }" @click="handleSelectFont('songti')">
            宋体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'kaiti' }" @click="handleSelectFont('kaiti')">
            楷体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'fangsong' }" @click="handleSelectFont('fangsong')">
            仿宋
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'deyihei' }" @click="handleSelectFont('deyihei')">
            得意黑（需下载）
          </button>
        </div>
        <div class="font-cdn">
          <label>字体 CDN 节点</label>
          <div class="font-cdn-row">
            <button
              v-for="option in fontCdnOptions"
              :key="option.key"
              class="font-cdn-btn btn-ripple"
              :class="{ active: fontSettings.cdnProvider === option.key }"
              @click="handleSelectCdnProvider(option.key)"
            >
              <strong>{{ option.label }}</strong>
              <small>{{ option.desc }}</small>
            </button>
          </div>
        </div>
        <div class="font-availability">
          <label>本地字体可用性说明</label>
          <ul>
            <li v-for="item in fontLocalAvailability" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div class="font-download-row">
          <button class="mini-btn btn-ripple" :disabled="downloadingFont" @click="handleDownloadFont(fontSettings.loaded)">
            {{ downloadingFont ? '下载中...' : fontSettings.loaded ? '重新下载得意黑' : '下载得意黑' }}
          </button>
          <button class="mini-btn btn-ripple" :disabled="cdnPrefetching" @click="handlePrefetchFonts(false)">
            {{ cdnPrefetching ? '缓存中...' : '预缓存云端字体（含得意黑）' }}
          </button>
          <span class="hint">字体选择会自动保存；下次打开应用会自动恢复上次字体。</span>
        </div>
      </section>
    </template>

    <section v-else class="settings-section glass-card backend-shell">
      <div class="section-head">
        <h3>后端与模块参数</h3>
        <button class="mini-btn btn-ripple" @click="handleResetBackend">恢复默认</button>
      </div>

      <div class="backend-summary">
        <span class="status-pill">配置源：{{ backendSourceLabel }}</span>
        <span class="status-pill">运行时：{{ runtimeLabel }}</span>
        <span class="status-pill">预览线程：{{ activePreviewThreads }}</span>
        <span class="status-pill">下载线程：{{ activeDownloadThreads }}</span>
        <span class="status-pill">设备：{{ activeDeviceLabel }}</span>
      </div>

      <div class="backend-block">
        <div
          class="toggle-row"
          :class="{
            active: localOnlyModeEnabled,
            inactive: !localOnlyModeEnabled
          }"
        >
          <div class="toggle-text">
            <strong>不使用远程配置（仅本地）</strong>
            <small>开启后只应用本地设置，远程配置将不再覆盖 OCR/上传地址。</small>
          </div>
          <div class="toggle-meta">
            <span
              class="toggle-badge"
              :class="{
                active: localOnlyModeEnabled,
                inactive: !localOnlyModeEnabled
              }"
            >
              {{ localOnlyModeEnabled ? '仅本地' : '远程配置' }}
            </span>
            <button
              type="button"
              class="toggle-switch"
              :class="{ checked: localOnlyModeEnabled }"
              role="switch"
              :aria-checked="localOnlyModeEnabled"
              @click="handleRemoteModeChanged"
            >
              <span class="toggle-thumb"></span>
            </button>
          </div>
        </div>
      </div>

      <div class="backend-block">
        <h4>本地服务设置</h4>
        <p class="hint">仅支持手动填写地址，不展示本地预设列表。</p>
        <p class="hint">修改后会自动保存到本地并自动应用到当前运行实例。</p>
        <p v-if="appSettings.backend.useRemoteConfig" class="hint">
          当前启用远程配置，远程刷新后本地地址可能被覆盖；若需固定使用本地地址，请开启“仅本地”。
        </p>
        <div class="backend-grid">
          <label class="field">
            <span>OCR 服务器</span>
            <input
              type="text"
              placeholder="https://your-ocr.example/api/ocr/recognize"
              v-model.trim="appSettings.backend.ocrEndpoint"
            />
          </label>
          <label class="field">
            <span>临时文件上传服务器</span>
            <input
              type="text"
              placeholder="https://your-upload.example/api/temp/upload"
              v-model.trim="appSettings.backend.tempUploadEndpoint"
            />
          </label>
        </div>
      </div>

      <div class="backend-block">
        <h4>模块参数</h4>
        <div class="backend-grid">
          <label class="field">
            <span>电费查询重试次数</span>
            <input type="number" min="0" max="5" v-model.number="appSettings.retry.electricity" />
          </label>
          <label class="field">
            <span>空教室查询重试次数</span>
            <input type="number" min="0" max="5" v-model.number="appSettings.retry.classroom" />
          </label>
          <label class="field">
            <span>重试间隔（ms）</span>
            <input type="number" min="500" max="10000" step="100" v-model.number="appSettings.retryDelayMs" />
          </label>
          <label class="field">
            <span>通知检查请求超时（ms）</span>
            <input
              type="number"
              min="5000"
              max="60000"
              step="500"
              v-model.number="appSettings.backend.moduleParams.requestTimeoutMs"
            />
          </label>
          <label class="field">
            <span>功能测速超时（ms）</span>
            <input
              type="number"
              min="3000"
              max="30000"
              step="500"
              v-model.number="appSettings.backend.moduleParams.probeTimeoutMs"
            />
          </label>
          <label class="field">
            <span>移动端预览线程</span>
            <input type="number" min="1" max="8" step="1" v-model.number="appSettings.resourceShare.previewThreadsMobile" />
          </label>
          <label class="field">
            <span>桌面端预览线程</span>
            <input type="number" min="1" max="12" step="1" v-model.number="appSettings.resourceShare.previewThreadsDesktop" />
          </label>
          <label class="field">
            <span>移动端下载线程</span>
            <input type="number" min="1" max="8" step="1" v-model.number="appSettings.resourceShare.downloadThreadsMobile" />
          </label>
          <label class="field">
            <span>桌面端下载线程</span>
            <input type="number" min="1" max="12" step="1" v-model.number="appSettings.resourceShare.downloadThreadsDesktop" />
          </label>
        </div>
        <p class="hint">并发越高速度通常越快，但会提高设备与网络占用。</p>
      </div>

      <div class="backend-block">
        <div class="section-head section-head-compact">
          <h4>功能测试</h4>
          <button class="mini-btn btn-ripple" :disabled="probeRunning" @click="handleRunConnectivityTest">
            {{ probeRunning ? '测速中...' : '开始测速' }}
          </button>
        </div>
        <p class="hint">并发测试当前 OCR、上传、新融合门户、教务系统、超星渠道、一卡通与图书馆地址。</p>
        <div class="probe-list">
          <article v-for="item in probeRows" :key="item.id" class="probe-item">
            <div class="probe-main">
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
              <code class="probe-url">{{ item.url || '未设置地址' }}</code>
            </div>
            <span class="probe-state" :class="probeStateClass(item.id)">
              {{ probeStateText(item.id) }}
            </span>
          </article>
        </div>
        <p v-if="probeFinishedAt" class="hint">最近测速：{{ probeFinishedAt }}</p>
      </div>
    </section>

    <div v-if="showFontModal" class="font-modal">
      <div class="font-modal-card">
        <h3>{{ fontModalTitle }}</h3>
        <p>{{ fontModalDescription }}</p>
        <div class="font-modal-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${fontDownloadProgress}%` }"></div>
          </div>
          <span v-if="fontDownloadStatus === 'downloading'">下载中...</span>
          <span v-else-if="fontDownloadStatus === 'success'">下载完成</span>
          <span v-else-if="fontDownloadStatus === 'failed'">下载失败</span>
          <span v-else>等待开始</span>
        </div>
        <p v-if="fontDownloadStep" class="font-step">{{ fontDownloadStep }}</p>
        <p v-if="fontDownloadError" class="font-error">{{ fontDownloadError }}</p>
        <div class="font-modal-actions">
          <button
            v-if="fontDownloadStatus === 'failed' && fontModalRetryMode === 'deyihei'"
            class="btn-secondary btn-ripple"
            @click="handleDownloadFont(true)"
          >
            重试下载
          </button>
          <button
            v-if="fontDownloadStatus === 'failed' && fontModalRetryMode === 'prefetch'"
            class="btn-secondary btn-ripple"
            @click="handlePrefetchFonts(true)"
          >
            重试缓存
          </button>
          <button class="btn-primary btn-ripple" @click="showFontModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  padding: 22px 18px 124px;
  color: var(--ui-text);
  background: var(--ui-bg-gradient);
}

.settings-header {
  margin-bottom: 14px;
  padding: 12px 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.title-wrap {
  display: grid;
  gap: 2px;
}

.title {
  font-size: clamp(19px, 2.4vw, 24px);
  font-weight: 800;
  line-height: 1.1;
}

.sub-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-muted);
}

.settings-intro {
  margin-bottom: 14px;
  padding: 16px;
  display: grid;
  gap: 10px;
}

.settings-intro p {
  margin: 0;
  color: var(--ui-muted);
  line-height: 1.65;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 26%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 70%, #fff 30%);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 700;
}

.student-pill {
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 26%, #fff 74%),
    color-mix(in oklab, var(--ui-secondary) 20%, #fff 80%)
  );
  box-shadow: 0 8px 16px color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.tab-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.tab-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.42));
  background: var(--ui-surface);
  color: var(--ui-muted);
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.tab-btn.active {
  border-color: transparent;
  color: #ffffff;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
}

.settings-section {
  margin-bottom: 14px;
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.settings-section h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--ui-text);
}

.mini-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, rgba(148, 163, 184, 0.34));
  background: var(--ui-surface);
  color: var(--ui-text);
  border-radius: 10px;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}

.preset-card {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.34));
  border-radius: 14px;
  padding: 10px;
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  display: grid;
  gap: 6px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.preset-card.active {
  border-color: color-mix(in oklab, var(--ui-primary) 72%, #fff 28%);
  box-shadow: 0 10px 20px color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.preset-card:hover {
  transform: translateY(-1px);
}

.preset-swatch {
  width: 100%;
  height: 56px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.52);
}

.preset-name {
  font-size: 14px;
  font-weight: 800;
  color: var(--ui-text);
}

.preset-tagline {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-muted);
}

.option-group {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.option-group > label {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-muted);
}

.chip-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
}

.option-chip {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.32));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  color: var(--ui-text);
  border-radius: 12px;
  padding: 10px;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
}

.option-chip strong {
  font-size: 13px;
}

.option-chip small {
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.45;
}

.option-chip.active {
  border-color: color-mix(in oklab, var(--ui-primary) 72%, white);
  background: color-mix(in oklab, var(--ui-primary) 12%, #fff 88%);
  box-shadow: 0 8px 18px color-mix(in oklab, var(--ui-primary) 22%, transparent);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.profile-card {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, rgba(148, 163, 184, 0.34));
  background: color-mix(in oklab, var(--ui-surface) 86%, #fff 14%);
  color: var(--ui-text);
  border-radius: 12px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 6px;
}

.profile-card strong {
  font-size: 14px;
}

.profile-card span {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-muted);
}

.font-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.font-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.34));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  color: var(--ui-text);
  border-radius: 10px;
  height: 38px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.font-btn.active {
  border-color: transparent;
  color: #ffffff;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
}

.font-cdn {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.font-cdn > label,
.font-availability > label {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-muted);
}

.font-cdn-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
}

.font-cdn-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, rgba(148, 163, 184, 0.36));
  background: color-mix(in oklab, var(--ui-surface) 90%, #fff 10%);
  color: var(--ui-text);
  border-radius: 12px;
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 4px;
}

.font-cdn-btn strong {
  font-size: 13px;
}

.font-cdn-btn small {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-muted);
}

.font-cdn-btn.active {
  border-color: transparent;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
  box-shadow: 0 8px 18px color-mix(in oklab, var(--ui-primary) 25%, transparent);
}

.font-cdn-btn.active strong,
.font-cdn-btn.active small {
  color: #ffffff;
}

.font-availability {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.font-availability ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
}

.font-availability li {
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.5;
}

.font-download-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.backend-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.backend-shell {
  display: grid;
  gap: 12px;
}

.backend-block {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.28));
  border-radius: 14px;
  padding: 12px;
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  display: grid;
  gap: 10px;
}

.backend-block h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--ui-text);
}

.section-head-compact {
  margin-bottom: 0;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.3));
  border-radius: 12px;
  padding: 10px;
  transition: all 0.2s ease;
}

.toggle-row.inactive {
  border-color: color-mix(in oklab, var(--ui-primary) 15%, rgba(148, 163, 184, 0.34));
  background: color-mix(in oklab, var(--ui-surface) 94%, #fff 6%);
}

.toggle-row.active {
  border-color: rgba(249, 115, 22, 0.52);
  background: linear-gradient(
    135deg,
    rgba(251, 146, 60, 0.18),
    rgba(249, 115, 22, 0.12)
  );
}

.toggle-text {
  display: grid;
  gap: 4px;
}

.toggle-text strong {
  font-size: 14px;
  color: var(--ui-text);
}

.toggle-text small {
  color: var(--ui-muted);
  line-height: 1.5;
}

.toggle-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.toggle-badge {
  min-height: 26px;
  border-radius: 999px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
}

.toggle-badge.inactive {
  color: #1d4ed8;
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(96, 165, 250, 0.2);
}

.toggle-badge.active {
  color: #9a3412;
  border-color: rgba(249, 115, 22, 0.5);
  background: rgba(251, 146, 60, 0.26);
}

.toggle-switch {
  width: 54px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.54);
  background: rgba(148, 163, 184, 0.5);
  display: inline-flex;
  align-items: center;
  padding: 3px;
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
}

.toggle-switch .toggle-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.28);
  transition: transform 0.2s ease, background 0.2s ease;
}

.toggle-switch.checked {
  border-color: rgba(249, 115, 22, 0.58);
  background: linear-gradient(130deg, #fb923c, #f97316);
  box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.22);
}

.toggle-switch.checked .toggle-thumb {
  transform: translateX(24px);
  background: #fff7ed;
}

.toggle-switch:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px rgba(99, 102, 241, 0.24),
    inset 0 0 0 1px rgba(255, 255, 255, 0.24);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 700;
}

.backend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-muted);
}

.field input {
  height: 42px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, rgba(148, 163, 184, 0.4));
  background: color-mix(in oklab, var(--ui-surface) 90%, #fff 10%);
  padding: 0 12px;
  color: var(--ui-text);
}

.probe-list {
  display: grid;
  gap: 8px;
}

.probe-item {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 16%, rgba(148, 163, 184, 0.28));
  border-radius: 12px;
  padding: 10px;
  background: color-mix(in oklab, var(--ui-surface) 94%, #fff 6%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.probe-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.probe-main strong {
  font-size: 14px;
  color: var(--ui-text);
}

.probe-main small {
  font-size: 12px;
  color: var(--ui-muted);
}

.probe-url {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-muted);
  background: rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  padding: 3px 8px;
}

.probe-state {
  flex-shrink: 0;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, rgba(148, 163, 184, 0.24));
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-muted);
  background: rgba(148, 163, 184, 0.12);
}

.probe-state.fast {
  color: #0f5132;
  border-color: rgba(22, 163, 74, 0.45);
  background: rgba(34, 197, 94, 0.16);
}

.probe-state.medium {
  color: #7c4a03;
  border-color: rgba(245, 158, 11, 0.55);
  background: rgba(245, 158, 11, 0.18);
}

.probe-state.slow {
  color: #842029;
  border-color: rgba(220, 38, 38, 0.5);
  background: rgba(248, 113, 113, 0.2);
}

.probe-state.testing {
  color: #1d4ed8;
  border-color: rgba(59, 130, 246, 0.52);
  background: rgba(96, 165, 250, 0.2);
}

.probe-state.error {
  color: #842029;
  border-color: rgba(220, 38, 38, 0.55);
  background: rgba(248, 113, 113, 0.2);
}

.hint {
  margin-top: 10px;
  font-size: 13px;
  color: var(--ui-muted);
  line-height: 1.6;
}

.mini-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.font-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.font-modal-card {
  width: min(360px, 100%);
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  border-radius: 16px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.36));
  box-shadow: var(--ui-shadow-strong);
  padding: 18px;
}

.font-modal-card h3 {
  margin: 0;
  font-size: 20px;
  color: var(--ui-text);
}

.font-modal-card p {
  margin: 8px 0 0;
  color: var(--ui-muted);
  line-height: 1.6;
}

.font-modal-progress {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.25);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ui-primary), var(--ui-secondary));
}

.font-error {
  color: var(--ui-danger);
  font-size: 13px;
}

.font-step {
  margin-top: 8px;
  font-size: 13px;
  color: var(--ui-muted);
}

.font-modal-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-secondary,
.btn-primary {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, rgba(148, 163, 184, 0.3));
  border-radius: 10px;
  min-width: 88px;
  height: 38px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.btn-secondary {
  background: color-mix(in oklab, var(--ui-primary-soft) 42%, #fff 58%);
  color: var(--ui-text);
}

.btn-primary {
  border: none;
  color: #ffffff;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
}

@media (max-width: 720px) {
  .settings-view {
    padding: 14px 12px 110px;
  }

  .settings-header {
    padding: 10px 12px;
  }

  .title {
    font-size: 20px;
  }

  .preset-grid,
  .chip-row,
  .profile-grid,
  .backend-grid {
    grid-template-columns: 1fr;
  }

  .font-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .font-cdn-row {
    grid-template-columns: 1fr;
  }

  .toggle-row,
  .probe-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .probe-state {
    width: 100%;
    justify-content: center;
  }
}
</style>
