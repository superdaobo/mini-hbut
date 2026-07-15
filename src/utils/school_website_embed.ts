import { detectRuntime } from '../platform/runtime'
import {
  isLikelyAndroidUserAgent,
  isLikelyIOSUserAgent,
  isTauriDesktopRuntime,
  isTauriRuntime
} from '../platform/native'

export const SCHOOL_WEBSITE_URL = 'https://www.hbut.edu.cn/'
const LOCAL_BRIDGE_BASE =
  detectRuntime() === 'tauri' ? 'http://127.0.0.1:4399' : '/bridge'

export const SCHOOL_WEBSITE_PROXY_URL = `${LOCAL_BRIDGE_BASE}/school-website/`

export type SchoolWebsiteEmbedMode =
  | 'tauri-webview'
  | 'proxy-iframe'
  | 'direct-iframe'
  | 'external-open'

export type EmbedBounds = {
  x: number
  y: number
  width: number
  height: number
}

export const resolveSchoolWebsiteIframeUrl = (mode: Exclude<SchoolWebsiteEmbedMode, 'tauri-webview' | 'external-open'>) =>
  mode === 'proxy-iframe' ? SCHOOL_WEBSITE_PROXY_URL : SCHOOL_WEBSITE_URL

const canUseTauriEmbeddedWebview = () => isTauriDesktopRuntime()

export const probeSchoolWebsiteProxyReachable = async () => {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 1500)
    // 优先 /health（轻量）；失败再探代理路径
    const healthUrl = LOCAL_BRIDGE_BASE.replace(/\/$/, '') + '/health'
    try {
      const health = await fetch(healthUrl, { method: 'GET', signal: controller.signal })
      if (health.ok) {
        window.clearTimeout(timer)
        return true
      }
    } catch {
      // fall through
    }
    const response = await fetch(SCHOOL_WEBSITE_PROXY_URL, {
      method: 'HEAD',
      signal: controller.signal
    })
    window.clearTimeout(timer)
    return response.ok || response.status === 405 || response.status === 404
  } catch {
    return false
  }
}

/**
 * 前台恢复时探测 bridge；供 App resume / 官网页 remount 使用。
 * 返回 true 表示 loopback 可用。
 */
export const recoverSchoolWebsiteBridgeOnResume = async (): Promise<boolean> => {
  if (!isTauriRuntime()) return false
  if (isLikelyAndroidUserAgent()) return false
  return probeSchoolWebsiteProxyReachable()
}

export const resolveSchoolWebsiteEmbedMode = async (): Promise<SchoolWebsiteEmbedMode> => {
  if (canUseTauriEmbeddedWebview()) return 'tauri-webview'

  // Tauri Android 不走 loopback 代理，官网也无法 iframe 直连。
  if (isTauriRuntime() && isLikelyAndroidUserAgent()) {
    return 'external-open'
  }

  // Tauri iOS：依赖 loopback Bridge + proxy-iframe。
  if (isTauriRuntime() && isLikelyIOSUserAgent()) {
    if (await probeSchoolWebsiteProxyReachable()) return 'proxy-iframe'
    return 'external-open'
  }

  if (await probeSchoolWebsiteProxyReachable()) return 'proxy-iframe'
  return 'direct-iframe'
}

const waitForLayout = async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export const measureSchoolWebsiteEmbedBounds = async (
  container: HTMLElement
): Promise<EmbedBounds> => {
  await waitForLayout()

  const rect = container.getBoundingClientRect()
  let top = Math.max(0, Math.round(rect.top))
  let left = Math.max(0, Math.round(rect.left))
  let width = Math.max(1, Math.round(rect.width))
  let height = Math.max(1, Math.round(rect.height))

  if (canUseTauriEmbeddedWebview()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const scaleFactor = await win.scaleFactor()
      const innerSize = await win.innerSize()
      const innerLogical = innerSize.toLogical(scaleFactor)
      const bottomPadding = 12

      if (top <= 0 && container.parentElement) {
        const parentRect = container.parentElement.getBoundingClientRect()
        top = Math.max(0, Math.round(parentRect.top + (rect.top - parentRect.top)))
      }

      // #373：以 DOM 容器为准。旧逻辑在 height < 45% 窗口时强行撑满，
      // 返回过渡期会把子 WebView 放大成「无返回键全屏」。
      if (width < 8) {
        width = Math.max(1, Math.round(innerLogical.width - left * 2))
      }
      if (height < 8) {
        height = Math.max(1, Math.round(innerLogical.height - top - bottomPadding))
      }
    } catch {
      // 保留 DOM 测量结果
    }
  }

  return { x: left, y: top, width, height }
}

/** 强制关闭桌面子 WebView（返回/卸载兜底，避免全屏残留） */
export const forceCloseSchoolWebsiteEmbed = async () => {
  if (!canUseTauriEmbeddedWebview()) return
  try {
    await invokeNative('school_website_embed_close')
  } catch {
    // ignore
  }
}

type MountOptions = {
  container: HTMLElement
  onReady?: () => void
  onError?: (message: string) => void
}

type MountedEmbed = {
  mode: SchoolWebsiteEmbedMode
  cleanup: () => Promise<void>
}

const invokeNative = async <T = unknown>(command: string, args?: Record<string, unknown>) => {
  const core = await import('@tauri-apps/api/core')
  if (typeof args === 'undefined') return core.invoke<T>(command)
  return core.invoke<T>(command, args)
}

const syncNativeEmbedBounds = async (container: HTMLElement) => {
  const bounds = await measureSchoolWebsiteEmbedBounds(container)
  await invokeNative('school_website_embed_resize', { bounds })
}

export const mountSchoolWebsiteEmbed = async ({
  container,
  onReady,
  onError
}: MountOptions): Promise<MountedEmbed> => {
  const mode = await resolveSchoolWebsiteEmbedMode()

  if (mode !== 'tauri-webview') {
    onReady?.()
    return {
      mode,
      cleanup: async () => {}
    }
  }

  let closed = false
  try {
    const bounds = await measureSchoolWebsiteEmbedBounds(container)
    if (closed) {
      return { mode, cleanup: async () => {} }
    }
    await invokeNative('school_website_embed_open', { bounds })

    const resizeObserver = new ResizeObserver(() => {
      if (closed) return
      // 容器已离开布局树时勿再 resize（返回卸载竞态）
      if (!container.isConnected) return
      const r = container.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) return
      void syncNativeEmbedBounds(container).catch(() => {})
    })
    resizeObserver.observe(container)
    if (container.parentElement) {
      resizeObserver.observe(container.parentElement)
    }

    const handleWindowResize = () => {
      if (closed || !container.isConnected) return
      void syncNativeEmbedBounds(container).catch(() => {})
    }
    window.addEventListener('resize', handleWindowResize)

    const layoutTimer = window.setInterval(() => {
      if (closed || !container.isConnected) return
      void syncNativeEmbedBounds(container).catch(() => {})
    }, 300)
    window.setTimeout(() => {
      window.clearInterval(layoutTimer)
    }, 1800)

    onReady?.()

    return {
      mode,
      cleanup: async () => {
        if (closed) return
        closed = true
        window.clearInterval(layoutTimer)
        resizeObserver.disconnect()
        window.removeEventListener('resize', handleWindowResize)
        try {
          await invokeNative('school_website_embed_close')
        } catch {
          // ignore cleanup failure
        }
      }
    }
  } catch (error) {
    closed = true
    try {
      await invokeNative('school_website_embed_close')
    } catch {
      // ignore
    }
    const message = error instanceof Error ? error.message : '创建学校官网内嵌视图失败'
    onError?.(message)
    throw error
  }
}
