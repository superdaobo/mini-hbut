import { open } from '@tauri-apps/plugin-shell'

const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false
  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__ || window.location?.protocol === 'tauri:')
}

const normalizeHttpUrl = (href: string) => {
  try {
    const url = new URL(href, window.location.href)
    if (!/^https?:/i.test(url.href)) return null
    return url.href
  } catch {
    return null
  }
}

export const openExternal = async (href: string) => {
  const url = normalizeHttpUrl(href)
  if (!url) return false
  if (isTauriRuntime()) {
    try {
      await open(url)
      return true
    } catch (_) {
      // In Tauri runtime, avoid window.open fallback to prevent opening inside webview.
      return false
    }
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  } catch (_) {
    try {
      location.href = url
      return true
    } catch {
      return false
    }
  }
}

export const openExternalRaw = async (target: string) => {
  if (!target || !isTauriRuntime()) return false
  try {
    await open(target)
    return true
  } catch {
    try {
      await open(encodeURI(target))
      return true
    } catch {
      return false
    }
  }
}

export const isHttpLink = (href: string) => !!normalizeHttpUrl(href)
