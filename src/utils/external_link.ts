import { open } from '@tauri-apps/plugin-shell'
import { invoke } from '@tauri-apps/api/core'

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
    // 多级兜底，避免移动端/打包环境出现“点击无反应”。
    // 1) plugin-shell open 原始 URL
    // 2) plugin-shell open 编码 URL
    // 3) 调用 Rust 侧 open 命令（绕过前端 ACL 误配置风险）
    try {
      await open(url)
      return true
    } catch (_) {
      try {
        await open(encodeURI(url))
        return true
      } catch (_) {
        try {
          await invoke('open_external_url', { url })
          return true
        } catch (_) {
          try {
            await invoke('open_external_url', { url: encodeURI(url) })
            return true
          } catch {
            // 最后兜底，避免用户点击后无反馈
          }
        }
      }
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
      try {
        await invoke('open_external_url', { url: target })
        return true
      } catch {
        return false
      }
    }
  }
}

export const isHttpLink = (href: string) => !!normalizeHttpUrl(href)
