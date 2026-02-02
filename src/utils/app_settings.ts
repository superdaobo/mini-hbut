import { reactive, watch } from 'vue'

const STORAGE_KEY = 'hbu_app_settings_v1'

const DEFAULT_SETTINGS = {
  retry: {
    electricity: 2,
    classroom: 2
  },
  retryDelayMs: 2000
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
  next.retry.electricity = clampNumber(next.retry.electricity, 0, 5, base.retry.electricity)
  next.retry.classroom = clampNumber(next.retry.classroom, 0, 5, base.retry.classroom)
  next.retryDelayMs = clampNumber(next.retryDelayMs, 500, 10000, base.retryDelayMs)
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
      if (retryChanged || delayChanged) {
        state.retry = { ...normalized.retry }
        state.retryDelayMs = normalized.retryDelayMs
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
