import { effectScope, reactive, watch } from 'vue'
import { SYSTEM_UI_SETTINGS, UI_PRESETS } from '../config/ui_settings'

const STORAGE_KEY = 'hbu_ui_settings_v1'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const hexToRgb = (hex) => {
  if (!hex || typeof hex !== 'string') return null
  const normalized = hex.replace('#', '').trim()
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16)
    const g = parseInt(normalized[1] + normalized[1], 16)
    const b = parseInt(normalized[2] + normalized[2], 16)
    return { r, g, b }
  }
  if (normalized.length !== 6) return null
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

const makeRgba = (hex, alpha) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(99, 102, 241, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

const normalizeSettings = (raw) => {
  const base = { ...SYSTEM_UI_SETTINGS }
  if (!raw || typeof raw !== 'object') return base
  const merged = { ...base, ...raw }
  if (!UI_PRESETS[merged.preset]) {
    merged.preset = base.preset
  }
  merged.customCss = typeof merged.customCss === 'string' ? merged.customCss : ''
  merged.customJs = typeof merged.customJs === 'string' ? merged.customJs : ''
  merged.surfaceOpacity = clamp(Number(merged.surfaceOpacity) || base.surfaceOpacity, 0.5, 1)
  merged.borderOpacity = clamp(Number(merged.borderOpacity) || base.borderOpacity, 0.05, 0.8)
  merged.radiusScale = clamp(Number(merged.radiusScale) || base.radiusScale, 0.6, 2)
  merged.fontScale = clamp(Number(merged.fontScale) || base.fontScale, 0.7, 1.6)
  merged.spaceScale = clamp(Number(merged.spaceScale) || base.spaceScale, 0.6, 1.8)
  merged.motionScale = clamp(Number(merged.motionScale) || base.motionScale, 0, 2)
  return merged
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

const storeSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage failures.
  }
}

const applyCustomCode = (settings) => {
  if (typeof document === 'undefined') return
  const cssId = 'custom-theme-css'
  const jsId = 'custom-theme-js'
  const existingCss = document.getElementById(cssId)
  const existingJs = document.getElementById(jsId)

  if (settings.preset !== 'custom') {
    existingCss?.remove()
    existingJs?.remove()
    return
  }

  if (settings.customCss) {
    const styleEl = existingCss || document.createElement('style')
    styleEl.id = cssId
    styleEl.textContent = settings.customCss
    if (!existingCss) document.head.appendChild(styleEl)
  } else {
    existingCss?.remove()
  }

  if (settings.customJs) {
    existingJs?.remove()
    const scriptEl = document.createElement('script')
    scriptEl.id = jsId
    scriptEl.type = 'text/javascript'
    scriptEl.textContent = settings.customJs
    document.body.appendChild(scriptEl)
  } else {
    existingJs?.remove()
  }
}

const applyUiSettings = (settings) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const isCyberpunk = settings.preset === 'cyberpunk'
  const surface = isCyberpunk
    ? `rgba(10, 15, 28, ${settings.surfaceOpacity})`
    : `rgba(255, 255, 255, ${settings.surfaceOpacity})`
  const border = isCyberpunk
    ? `rgba(41, 200, 224, ${settings.borderOpacity})`
    : `rgba(255, 255, 255, ${settings.borderOpacity})`

  root.style.setProperty('--ui-primary', settings.primary)
  root.style.setProperty('--ui-secondary', settings.secondary)
  root.style.setProperty('--ui-primary-soft', makeRgba(settings.primary, 0.12))
  root.style.setProperty('--ui-primary-soft-strong', makeRgba(settings.primary, 0.22))
  root.style.setProperty('--ui-bg-gradient', settings.background)
  root.style.setProperty('--ui-text', settings.text)
  root.style.setProperty('--ui-muted', settings.muted)
  root.style.setProperty('--ui-neon-cyan', settings.primary)
  root.style.setProperty('--ui-neon-pink', settings.secondary)
  root.style.setProperty('--ui-neon-purple', makeRgba(settings.secondary, 0.85))
  root.style.setProperty('--ui-surface', surface)
  root.style.setProperty('--ui-surface-border', border)
  root.style.setProperty('--ui-radius-scale', settings.radiusScale.toString())
  root.style.setProperty('--ui-font-scale', settings.fontScale.toString())
  root.style.setProperty('--ui-space-scale', settings.spaceScale.toString())
  root.style.setProperty('--ui-motion-scale', settings.motionScale.toString())
  root.style.setProperty('--ui-danger', settings.danger)
  root.style.setProperty('--ui-success', settings.success)
  root.setAttribute('data-theme', settings.preset)
  applyCustomCode(settings)

  root.style.setProperty('--primary-color', settings.primary)
  root.style.setProperty('--secondary-color', settings.secondary)
  root.style.setProperty('--bg-gradient', settings.background)
  root.style.setProperty('--glass-bg', surface)
  root.style.setProperty('--glass-border', border)
  root.style.setProperty('--text-color', settings.text)
}

const state = reactive(normalizeSettings(loadStoredSettings()))

let initialized = false
let scope = null

const initUiSettings = () => {
  if (initialized) return
  initialized = true
  scope = effectScope()
  scope.run(() => {
    applyUiSettings(state)
    const saveAndApply = () => {
      const normalized = normalizeSettings(state)
      const changed = Object.keys(normalized).some((key) => normalized[key] !== state[key])
      if (changed) {
        Object.assign(state, normalized)
      }
      storeSettings(normalized)
      applyUiSettings(normalized)
    }
    saveAndApply()
    const deepWatch = () => saveAndApply()
    watch(state, deepWatch, { deep: true })
  })
}

const useUiSettings = () => state

const applyPreset = (presetKey) => {
  const preset = UI_PRESETS[presetKey]
  if (!preset) return
  state.preset = presetKey
  state.primary = preset.primary
  state.secondary = preset.secondary
  state.background = preset.background
  state.text = preset.text
  state.muted = preset.muted
}

const resetUiSettings = () => {
  Object.assign(state, normalizeSettings(SYSTEM_UI_SETTINGS))
}

export {
  initUiSettings,
  useUiSettings,
  applyPreset,
  resetUiSettings,
  applyUiSettings,
  normalizeSettings,
  UI_PRESETS
}
