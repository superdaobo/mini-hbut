import { effectScope, reactive, watch } from 'vue'
import { SYSTEM_UI_SETTINGS, UI_PRESETS } from '../config/ui_settings'

const STORAGE_KEY = 'hbu_ui_settings_v2'

const CARD_STYLES = ['glass', 'solid', 'outline']
const NAV_STYLES = ['floating', 'pill', 'compact']
const DENSITY_STYLES = ['comfortable', 'balanced', 'compact']
const ICON_STYLES = ['duotone', 'line', 'mono']
const DECOR_STYLES = ['mesh', 'grain', 'none']

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const hexToRgb = (hex) => {
  if (!hex || typeof hex !== 'string') return null
  const normalized = hex.replace('#', '').trim()
  if (normalized.length !== 6) return null
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

const makeRgba = (hex, alpha) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(59, 130, 246, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

const normalizeProfile = (profile = {}) => {
  const base = { ...SYSTEM_UI_SETTINGS.profile }
  const next = { ...base, ...(profile || {}) }
  if (!CARD_STYLES.includes(next.cardStyle)) next.cardStyle = base.cardStyle
  if (!NAV_STYLES.includes(next.navStyle)) next.navStyle = base.navStyle
  if (!DENSITY_STYLES.includes(next.density)) next.density = base.density
  if (!ICON_STYLES.includes(next.iconStyle)) next.iconStyle = base.iconStyle
  if (!DECOR_STYLES.includes(next.decor)) next.decor = base.decor
  return next
}

const normalizeSettings = (raw) => {
  const base = { ...SYSTEM_UI_SETTINGS, profile: { ...SYSTEM_UI_SETTINGS.profile } }
  if (!raw || typeof raw !== 'object') return base

  const merged = {
    ...base,
    ...raw,
    profile: normalizeProfile(raw.profile)
  }

  if (!UI_PRESETS[merged.preset]) {
    merged.preset = base.preset
  }
  merged.customCss = typeof merged.customCss === 'string' ? merged.customCss : ''
  merged.customJs = typeof merged.customJs === 'string' ? merged.customJs : ''
  merged.surfaceOpacity = clamp(Number(merged.surfaceOpacity) || base.surfaceOpacity, 0.5, 1)
  merged.borderOpacity = clamp(Number(merged.borderOpacity) || base.borderOpacity, 0.05, 0.8)
  merged.radiusScale = clamp(Number(merged.radiusScale) || base.radiusScale, 0.7, 1.6)
  merged.fontScale = clamp(Number(merged.fontScale) || base.fontScale, 0.82, 1.2)
  merged.spaceScale = clamp(Number(merged.spaceScale) || base.spaceScale, 0.82, 1.2)
  merged.motionScale = clamp(Number(merged.motionScale) || base.motionScale, 0.2, 1.3)
  merged.profile = normalizeProfile(merged.profile)
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
    // ignore storage failures
  }
}

const applyCustomCode = (settings) => {
  if (typeof document === 'undefined') return

  const cssId = 'custom-theme-css'
  const jsId = 'custom-theme-js'
  const cssEl = document.getElementById(cssId)
  const jsEl = document.getElementById(jsId)

  if (settings.customCss) {
    const styleEl = cssEl || document.createElement('style')
    styleEl.id = cssId
    styleEl.textContent = settings.customCss
    if (!cssEl) document.head.appendChild(styleEl)
  } else {
    cssEl?.remove()
  }

  if (settings.customJs) {
    jsEl?.remove()
    const scriptEl = document.createElement('script')
    scriptEl.id = jsId
    scriptEl.type = 'text/javascript'
    scriptEl.textContent = settings.customJs
    document.body.appendChild(scriptEl)
  } else {
    jsEl?.remove()
  }
}

const applyUiSettings = (settings) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const currentPreset = UI_PRESETS[settings.preset] || UI_PRESETS[SYSTEM_UI_SETTINGS.preset]
  const isDark = currentPreset?.category === 'dark'

  const surface = isDark
    ? `rgba(15, 23, 42, ${settings.surfaceOpacity})`
    : `rgba(255, 255, 255, ${settings.surfaceOpacity})`
  const border = isDark
    ? `rgba(148, 163, 184, ${Math.max(0.14, settings.borderOpacity)})`
    : `rgba(148, 163, 184, ${settings.borderOpacity})`

  root.style.setProperty('--ui-primary', settings.primary)
  root.style.setProperty('--ui-secondary', settings.secondary)
  root.style.setProperty('--ui-primary-soft', makeRgba(settings.primary, 0.12))
  root.style.setProperty('--ui-primary-soft-strong', makeRgba(settings.primary, 0.22))
  root.style.setProperty('--ui-bg-gradient', settings.background)
  root.style.setProperty('--ui-text', settings.text)
  root.style.setProperty('--ui-muted', settings.muted)
  root.style.setProperty('--ui-surface', surface)
  root.style.setProperty('--ui-surface-border', border)
  root.style.setProperty('--ui-radius-scale', String(settings.radiusScale))
  root.style.setProperty('--ui-font-scale', String(settings.fontScale))
  root.style.setProperty('--ui-space-scale', String(settings.spaceScale))
  root.style.setProperty('--ui-motion-scale', String(settings.motionScale))
  root.style.setProperty('--ui-danger', settings.danger)
  root.style.setProperty('--ui-success', settings.success)

  root.style.setProperty('--primary-color', settings.primary)
  root.style.setProperty('--secondary-color', settings.secondary)
  root.style.setProperty('--bg-gradient', settings.background)
  root.style.setProperty('--glass-bg', surface)
  root.style.setProperty('--glass-border', border)
  root.style.setProperty('--text-color', settings.text)

  root.setAttribute('data-theme', settings.preset)
  root.setAttribute('data-ui-card', settings.profile.cardStyle)
  root.setAttribute('data-ui-nav', settings.profile.navStyle)
  root.setAttribute('data-ui-density', settings.profile.density)
  root.setAttribute('data-ui-icon', settings.profile.iconStyle)
  root.setAttribute('data-ui-decor', settings.profile.decor)

  applyCustomCode(settings)
}

const state = reactive(normalizeSettings(loadStoredSettings()))

let initialized = false
let scope = null

const initUiSettings = () => {
  if (initialized) return
  initialized = true
  scope = effectScope()
  scope.run(() => {
    const sync = () => {
      const normalized = normalizeSettings(state)
      const changed = Object.keys(normalized).some((key) => normalized[key] !== state[key])
      if (changed) {
        Object.assign(state, normalized)
      }
      storeSettings(normalized)
      applyUiSettings(normalized)
    }
    sync()
    watch(state, sync, { deep: true })
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
  if (typeof preset.surfaceOpacity === 'number') state.surfaceOpacity = preset.surfaceOpacity
  if (typeof preset.borderOpacity === 'number') state.borderOpacity = preset.borderOpacity
  if (typeof preset.radiusScale === 'number') state.radiusScale = preset.radiusScale
  if (typeof preset.fontScale === 'number') state.fontScale = preset.fontScale
  if (typeof preset.spaceScale === 'number') state.spaceScale = preset.spaceScale
  if (typeof preset.motionScale === 'number') state.motionScale = preset.motionScale
}

const resetUiSettings = () => {
  Object.assign(state, normalizeSettings(SYSTEM_UI_SETTINGS))
}

export { initUiSettings, useUiSettings, applyPreset, resetUiSettings, applyUiSettings, normalizeSettings, UI_PRESETS }
