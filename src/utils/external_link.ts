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

const isLikelyMiniProgramCode = (value: string) => {
  const trimmed = (value || '').trim()
  return trimmed.startsWith('#小程序://') || trimmed.startsWith('小程序://')
}

const miniProgramCandidates = (value: string) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return []

  const clean = trimmed.replace(/^#/, '')
  const candidates = new Set<string>()

  // 保留用户原始口令（有些系统可直接处理）
  candidates.add(trimmed)
  candidates.add(clean)

  // 解析口令尾部 token，转换成 weixin 深链，兼容 iOS/Android。
  const tokenMatch = clean.match(/\/([A-Za-z0-9_-]{6,})$/)
  const token = tokenMatch?.[1]
  if (token) {
    candidates.add(`weixin://dl/business/?t=${token}`)
  }

  return [...candidates].filter(Boolean)
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
  const raw = (target || '').trim()
  if (!raw) return false

  const tryTargets = isLikelyMiniProgramCode(raw) ? miniProgramCandidates(raw) : [raw, encodeURI(raw)]

  if (isTauriRuntime()) {
    for (const item of tryTargets) {
      try {
        await open(item)
        return true
      } catch {
        try {
          await invoke('open_external_url', { url: item })
          return true
        } catch {
          // continue
        }
      }
    }
    return false
  }

  for (const item of tryTargets) {
    try {
      window.location.href = item
      return true
    } catch {
      // continue
    }
  }
  return false
}

export const openWeChatMiniProgram = async (code: string) => {
  const candidates = miniProgramCandidates(code)
  for (const target of candidates) {
    const ok = await openExternalRaw(target)
    if (ok) return true
  }
  return false
}

export const isHttpLink = (href: string) => !!normalizeHttpUrl(href)
