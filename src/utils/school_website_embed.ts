import { detectRuntime } from '../platform/runtime'

export const SCHOOL_WEBSITE_URL = 'https://www.hbut.edu.cn/'
const LOCAL_BRIDGE_BASE =
  detectRuntime() === 'tauri' ? 'http://127.0.0.1:4399' : '/bridge'

export const SCHOOL_WEBSITE_PROXY_URL = `${LOCAL_BRIDGE_BASE}/school-website/`

export type SchoolWebsiteEmbedMode = 'tauri-webview' | 'proxy-iframe' | 'direct-iframe'

export type EmbedBounds = {
  x: number
  y: number
  width: number
  height: number
}

export const resolveSchoolWebsiteIframeUrl = (mode: Exclude<SchoolWebsiteEmbedMode, 'tauri-webview'>) =>
  mode === 'proxy-iframe' ? SCHOOL_WEBSITE_PROXY_URL : SCHOOL_WEBSITE_URL

const canUseTauriEmbeddedWebview = () => detectRuntime() === 'tauri'

const probeProxyReachable = async () => {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 1500)
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

export const resolveSchoolWebsiteEmbedMode = async (): Promise<SchoolWebsiteEmbedMode> => {
  if (canUseTauriEmbeddedWebview()) return 'tauri-webview'
  if (await probeProxyReachable()) return 'proxy-iframe'
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
      const window = getCurrentWindow()
      const scaleFactor = await window.scaleFactor()
      const innerSize = await window.innerSize()
      const innerLogical = innerSize.toLogical(scaleFactor)
      const bottomPadding = 12

      if (top <= 0 && container.parentElement) {
        const parentRect = container.parentElement.getBoundingClientRect()
        top = Math.max(0, Math.round(parentRect.top + (rect.top - parentRect.top)))
      }

      width = Math.max(1, Math.round(rect.width || innerLogical.width - left * 2))
      const heightFromWindow = Math.max(1, Math.round(innerLogical.height - top - bottomPadding))
      const minExpected = Math.round(innerLogical.height * 0.45)
      height = height >= minExpected ? height : heightFromWindow
    } catch {
      // 保留 DOM 测量结果
    }
  }

  return { x: left, y: top, width, height }
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

  try {
    const bounds = await measureSchoolWebsiteEmbedBounds(container)
    await invokeNative('school_website_embed_open', { bounds })

    const resizeObserver = new ResizeObserver(() => {
      void syncNativeEmbedBounds(container).catch(() => {})
    })
    resizeObserver.observe(container)
    if (container.parentElement) {
      resizeObserver.observe(container.parentElement)
    }

    let closed = false
    const handleWindowResize = () => {
      if (closed) return
      void syncNativeEmbedBounds(container).catch(() => {})
    }
    window.addEventListener('resize', handleWindowResize)

    const layoutTimer = window.setInterval(() => {
      if (closed) return
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
    const message = error instanceof Error ? error.message : '创建学校官网内嵌视图失败'
    onError?.(message)
    throw error
  }
}
