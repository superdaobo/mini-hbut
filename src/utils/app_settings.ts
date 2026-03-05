import { reactive, watch } from 'vue'

const STORAGE_KEY = 'hbu_app_settings_v1'
const LOCAL_HOST_PATTERN =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i
const DEFAULT_CLOUD_SYNC_ENDPOINT = 'https://mini-hbut-ocr-service.hf.space/api/cloud-sync'

const DEFAULT_BACKEND_TARGETS = {
  portal: 'https://e.hbut.edu.cn/stu/index.html#/',
  jwxt: 'https://jwxt.hbut.edu.cn/admin',
  chaoxing: 'https://hbut.jw.chaoxing.com/admin',
  oneCode: 'https://code.hbut.edu.cn',
  library: 'https://lib.hbut.edu.cn'
}

const DEFAULT_SETTINGS = {
  retry: {
    electricity: 2,
    classroom: 2
  },
  retryDelayMs: 2000,
  resourceShare: {
    previewThreadsMobile: 3,
    previewThreadsDesktop: 4,
    downloadThreadsMobile: 4,
    downloadThreadsDesktop: 6
  },
  backend: {
    useRemoteConfig: true,
    ocrEndpoint: '',
    tempUploadEndpoint: '',
    cloudSyncEndpoint: '',
    cloudSyncSecretRef: '',
    moduleTargets: { ...DEFAULT_BACKEND_TARGETS },
    moduleParams: {
      requestTimeoutMs: 15000,
      probeTimeoutMs: 8000,
      cloudSyncCooldownSec: 180
    }
  }
}

const clampNumber = (value, min, max, fallback) => {
  const num = Number(value)
  if (Number.isNaN(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

const normalizeUrl = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text.replace(/\s+/g, '')
  const prefix = LOCAL_HOST_PATTERN.test(text) ? 'http://' : 'https://'
  return `${prefix}${text}`.replace(/\s+/g, '')
}

const normalizeSettings = (raw) => {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  if (!raw || typeof raw !== 'object') return base

  const next = { ...base, ...raw }
  next.retry = { ...base.retry, ...(raw.retry || {}) }
  next.resourceShare = { ...base.resourceShare, ...(raw.resourceShare || {}) }
  next.backend = { ...base.backend, ...(raw.backend || {}) }
  // 模块目标地址固定使用默认值，不对用户开放编辑能力。
  next.backend.moduleTargets = { ...base.backend.moduleTargets }
  next.backend.moduleParams = {
    ...base.backend.moduleParams,
    ...(raw.backend?.moduleParams || {})
  }

  next.retry.electricity = clampNumber(next.retry.electricity, 0, 5, base.retry.electricity)
  next.retry.classroom = clampNumber(next.retry.classroom, 0, 5, base.retry.classroom)
  next.retryDelayMs = clampNumber(next.retryDelayMs, 500, 10000, base.retryDelayMs)
  next.resourceShare.previewThreadsMobile = clampNumber(
    next.resourceShare.previewThreadsMobile,
    1,
    8,
    base.resourceShare.previewThreadsMobile
  )
  next.resourceShare.previewThreadsDesktop = clampNumber(
    next.resourceShare.previewThreadsDesktop,
    1,
    12,
    base.resourceShare.previewThreadsDesktop
  )
  next.resourceShare.downloadThreadsMobile = clampNumber(
    next.resourceShare.downloadThreadsMobile,
    1,
    8,
    base.resourceShare.downloadThreadsMobile
  )
  next.resourceShare.downloadThreadsDesktop = clampNumber(
    next.resourceShare.downloadThreadsDesktop,
    1,
    12,
    base.resourceShare.downloadThreadsDesktop
  )
  next.backend.useRemoteConfig = next.backend.useRemoteConfig !== false
  next.backend.ocrEndpoint = normalizeUrl(next.backend.ocrEndpoint)
  next.backend.tempUploadEndpoint = normalizeUrl(next.backend.tempUploadEndpoint)
  next.backend.cloudSyncEndpoint = normalizeUrl(next.backend.cloudSyncEndpoint)
  next.backend.cloudSyncSecretRef = String(next.backend.cloudSyncSecretRef || '').trim()
  next.backend.moduleTargets = { ...base.backend.moduleTargets }
  next.backend.moduleParams.requestTimeoutMs = clampNumber(
    next.backend.moduleParams.requestTimeoutMs,
    5000,
    60000,
    base.backend.moduleParams.requestTimeoutMs
  )
  next.backend.moduleParams.probeTimeoutMs = clampNumber(
    next.backend.moduleParams.probeTimeoutMs,
    3000,
    30000,
    base.backend.moduleParams.probeTimeoutMs
  )
  next.backend.moduleParams.cloudSyncCooldownSec = clampNumber(
    next.backend.moduleParams.cloudSyncCooldownSec,
    30,
    3600,
    base.backend.moduleParams.cloudSyncCooldownSec
  )

  return next
}

const loadStoredSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const state = reactive(normalizeSettings(loadStoredSettings()))

const initAppSettings = () => {
  watch(
    state,
    () => {
      const normalized = normalizeSettings(state)
      const normalizedText = JSON.stringify(normalized)
      const stateText = JSON.stringify(state)

      if (stateText !== normalizedText) {
        state.retry = { ...normalized.retry }
        state.retryDelayMs = normalized.retryDelayMs
        state.resourceShare = { ...normalized.resourceShare }
        state.backend = {
          ...normalized.backend,
          moduleTargets: { ...normalized.backend.moduleTargets },
          moduleParams: { ...normalized.backend.moduleParams }
        }
      }

      try {
        localStorage.setItem(STORAGE_KEY, normalizedText)
      } catch {
        // ignore
      }
    },
    { deep: true, immediate: true }
  )
}

const useAppSettings = () => state

const resetAppSettings = () => {
  Object.assign(state, normalizeSettings(DEFAULT_SETTINGS))
}

const applyAppSettingsSnapshot = (raw) => {
  const normalized = normalizeSettings(raw)
  state.retry = { ...normalized.retry }
  state.retryDelayMs = normalized.retryDelayMs
  state.resourceShare = { ...normalized.resourceShare }
  state.backend = {
    ...normalized.backend,
    moduleTargets: { ...normalized.backend.moduleTargets },
    moduleParams: { ...normalized.backend.moduleParams }
  }
}

export {
  DEFAULT_BACKEND_TARGETS,
  DEFAULT_CLOUD_SYNC_ENDPOINT,
  DEFAULT_SETTINGS,
  initAppSettings,
  useAppSettings,
  resetAppSettings,
  applyAppSettingsSnapshot
}
