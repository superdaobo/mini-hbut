const NIGHT_MODE_STORAGE_KEY = 'hbu_dark_mode'

/** 夜晚模式切换事件：供 ui_settings 等模块重新注入语义色 token */
export const NIGHT_MODE_CHANGED_EVENT = 'hbu-night-mode-changed'

const dispatchNightModeChanged = (enabled: boolean) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NIGHT_MODE_CHANGED_EVENT, { detail: { enabled } }))
}

export const applyNightModePreference = (enabled: boolean): boolean => {
  if (typeof document === 'undefined') return enabled

  if (enabled) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }

  try {
    localStorage.setItem(NIGHT_MODE_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // localStorage 不可用时仅同步当前 DOM 状态。
  }

  dispatchNightModeChanged(enabled)
  return enabled
}

export const initNightModeClass = (): boolean => {
  if (typeof document === 'undefined') return false
  const classList = document.documentElement.classList

  try {
    const stored = localStorage.getItem(NIGHT_MODE_STORAGE_KEY)
    if (stored === '1') return applyNightModePreference(true)
    if (stored === '0') return applyNightModePreference(false)
  } catch {
    // localStorage 读取失败时保留当前 DOM 状态。
  }

  return typeof classList.contains === 'function' ? classList.contains('dark') : false
}

export const isNightModeEnabled = (): boolean => {
  if (typeof document === 'undefined') return false
  const classList = document.documentElement.classList
  return typeof classList.contains === 'function' ? classList.contains('dark') : false
}
