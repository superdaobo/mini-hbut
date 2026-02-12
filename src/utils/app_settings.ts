import { reactive, watch } from 'vue'

const STORAGE_KEY = 'hbu_app_settings_v1'

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
  }
}

const clampNumber = (value, min, max, fallback) => {
  const num = Number(value)
  if (Number.isNaN(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

const normalizeSettings = (raw) => {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  if (!raw || typeof raw !== 'object') return base
  const next = { ...base, ...raw }
  next.retry = { ...base.retry, ...(raw.retry || {}) }
  next.resourceShare = { ...base.resourceShare, ...(raw.resourceShare || {}) }
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
      const retryChanged =
        state.retry.electricity !== normalized.retry.electricity ||
        state.retry.classroom !== normalized.retry.classroom
      const delayChanged = state.retryDelayMs !== normalized.retryDelayMs
      const resourceShareChanged =
        state.resourceShare.previewThreadsMobile !== normalized.resourceShare.previewThreadsMobile ||
        state.resourceShare.previewThreadsDesktop !== normalized.resourceShare.previewThreadsDesktop ||
        state.resourceShare.downloadThreadsMobile !== normalized.resourceShare.downloadThreadsMobile ||
        state.resourceShare.downloadThreadsDesktop !== normalized.resourceShare.downloadThreadsDesktop
      if (retryChanged || delayChanged || resourceShareChanged) {
        state.retry = { ...normalized.retry }
        state.retryDelayMs = normalized.retryDelayMs
        state.resourceShare = { ...normalized.resourceShare }
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
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

export { DEFAULT_SETTINGS, initAppSettings, useAppSettings, resetAppSettings }
