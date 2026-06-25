import { detectRuntime } from '../platform/runtime'

export const SCHOOL_WEBSITE_URL = 'https://www.hbut.edu.cn/'
const SCHOOL_WEBSITE_EMBED_LABEL = 'school-website-embed'
const LOCAL_BRIDGE_BASE = 'http://127.0.0.1:4399'

export const SCHOOL_WEBSITE_PROXY_URL = `${LOCAL_BRIDGE_BASE}/school-website/`

export type SchoolWebsiteEmbedMode = 'tauri-webview' | 'proxy-iframe' | 'direct-iframe'

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

type MountOptions = {
  container: HTMLElement
  onReady?: () => void
  onError?: (message: string) => void
}

type MountedEmbed = {
  mode: SchoolWebsiteEmbedMode
  cleanup: () => Promise<void>
}

const syncWebviewBounds = async (
  webview: import('@tauri-apps/api/webview').Webview,
  container: HTMLElement
) => {
  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
  const rect = container.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  await webview.setPosition(new LogicalPosition(Math.round(rect.left), Math.round(rect.top)))
  await webview.setSize(new LogicalSize(width, height))
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
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const { Webview } = await import('@tauri-apps/api/webview')

    const appWindow = getCurrentWindow()
    const existing = await Webview.getByLabel(SCHOOL_WEBSITE_EMBED_LABEL)
    if (existing) {
      try {
        await existing.close()
      } catch {
        // ignore stale embed cleanup failure
      }
    }

    const rect = container.getBoundingClientRect()
    const webview = new Webview(appWindow, SCHOOL_WEBSITE_EMBED_LABEL, {
      url: SCHOOL_WEBSITE_URL,
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      focus: true
    })

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('创建学校官网内嵌视图超时'))
      }, 8000)

      webview.once('tauri://created', () => {
        window.clearTimeout(timer)
        resolve()
      })
      webview.once('tauri://error', (event) => {
        window.clearTimeout(timer)
        reject(new Error(String(event?.payload || '创建学校官网内嵌视图失败')))
      })
    })

    await webview.setAutoResize(false)
    await syncWebviewBounds(webview, container)

    const resizeObserver = new ResizeObserver(() => {
      void syncWebviewBounds(webview, container).catch(() => {})
    })
    resizeObserver.observe(container)

    let closed = false
    const handleWindowResize = () => {
      if (closed) return
      void syncWebviewBounds(webview, container).catch(() => {})
    }
    window.addEventListener('resize', handleWindowResize)

    onReady?.()

    return {
      mode,
      cleanup: async () => {
        if (closed) return
        closed = true
        resizeObserver.disconnect()
        window.removeEventListener('resize', handleWindowResize)
        try {
          await webview.close()
        } catch {
          try {
            await webview.hide()
          } catch {
            // ignore cleanup failure
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建学校官网内嵌视图失败'
    onError?.(message)
    throw error
  }
}
