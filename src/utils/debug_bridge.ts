import { invokeNative, isTauriRuntime } from '../platform/native'
import { pushDebugLog } from './debug_logger'
import { blobToDataUrl, captureElementToBlob } from './capture_service'
import { getBootMetricsSnapshot } from './boot_metrics'

const SCREENSHOT_EVENT_NAME = 'hbu-debug-screenshot-request'
const OPEN_MODULE_EVENT_NAME = 'hbu-debug-open-module-request'
const NAVIGATE_EVENT_NAME = 'hbu-debug-navigate-request'
const RESET_MORE_MODULES_EVENT_NAME = 'hbu-debug-reset-more-modules-request'
const STATE_EVENT_NAME = 'hbu-debug-state-request'
const MODULE_HOST_SESSION_KEY = 'hbu_more_module_host_session'
const MODULE_CDN_OVERRIDE_STORAGE_KEY = 'hbu_debug_module_cdn_base'
const MORE_MODULE_STORAGE_KEYS = [
  MODULE_HOST_SESSION_KEY,
  'hbu_more_module_state_v1',
  'hbu_more_module_catalog_cache_v1',
  'hbu_more_module_manifest_cache_v1',
  'hbu_module_channel'
]

let initialized = false
let unlistenScreenshot = null
let unlistenOpenModule = null
let unlistenNavigate = null
let unlistenResetMoreModules = null
let unlistenState = null

const resolveDebugHash = (sid: string, view: string) => {
  const normalizedSid = String(sid || '').trim()
  const normalizedView = String(view || '').trim() || 'home'
  if (!/^\d{10}$/.test(normalizedSid)) return '#/'
  if (normalizedView === 'home') return `#/${normalizedSid}`
  return `#/${normalizedSid}/${normalizedView}`
}

type DebugCaptureSaveResult = {
  path: string
  mime: string
  size: number
}

const completeScreenshot = async (payload) => {
  await invokeNative('complete_debug_screenshot', { payload })
}

const completeOpenModule = async (payload) => {
  await invokeNative('complete_debug_open_module', { payload })
}

const completeResetMoreModules = async (payload) => {
  await invokeNative('complete_debug_reset_more_modules', { payload })
}

const completeState = async (payload) => {
  await invokeNative('complete_debug_state', { payload })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForNextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

const collectDebugScrollAncestors = () => {
  const entries: Array<Record<string, unknown>> = []
  let current = document.querySelector('.more-module-host-view')

  while (current instanceof HTMLElement && entries.length < 8) {
    const style = window.getComputedStyle(current)
    entries.push({
      tag: current.tagName.toLowerCase(),
      className: current.className || '',
      overflowY: style.overflowY || '',
      clientHeight: Number(current.clientHeight || 0),
      scrollHeight: Number(current.scrollHeight || 0),
      scrollTop: Number(current.scrollTop || 0)
    })
    current = current.parentElement
  }

  const scrollingElement = document.scrollingElement
  if (scrollingElement instanceof HTMLElement) {
    entries.push({
      tag: scrollingElement.tagName.toLowerCase(),
      className: scrollingElement.className || '',
      overflowY: window.getComputedStyle(scrollingElement).overflowY || '',
      clientHeight: Number(scrollingElement.clientHeight || 0),
      scrollHeight: Number(scrollingElement.scrollHeight || 0),
      scrollTop: Number(scrollingElement.scrollTop || 0),
      kind: 'document.scrollingElement'
    })
  }

  return entries
}

const resolveDebugScrollContainer = () => {
  let current = document.querySelector('.more-module-host-view')
  while (current instanceof HTMLElement) {
    if (current.scrollHeight > current.clientHeight + 1) {
      return current
    }
    current = current.parentElement
  }
  const scrollingElement = document.scrollingElement
  return scrollingElement instanceof HTMLElement ? scrollingElement : null
}

const readStoredModuleHostSession = () => {
  try {
    const raw = localStorage.getItem(MODULE_HOST_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const resolveInjectedModuleHostSession = (value) => {
  if (!value || typeof value !== 'object') return null
  const session = value as Record<string, unknown>
  const moduleId = String(session.module_id || session.moduleId || '').trim()
  const previewUrl = String(session.preview_url || session.previewUrl || '').trim()
  const version = String(session.version || '').trim()
  if (!moduleId && !previewUrl && !version) return null
  return session
}

const applyDebugScrollInstruction = async (instruction) => {
  if (instruction === null || instruction === undefined || instruction === '') return
  const scrollContainer = resolveDebugScrollContainer()

  const normalizedText = String(instruction).trim().toLowerCase()
  if (normalizedText === 'top') {
    if (scrollContainer) {
      scrollContainer.scrollTop = 0
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
    await waitForNextPaint()
    return
  }

  if (normalizedText === 'bottom') {
    const targetTop = scrollContainer
      ? Math.max(0, Number(scrollContainer.scrollHeight || 0) - Number(scrollContainer.clientHeight || 0))
      : Math.max(
          0,
          Number(document.documentElement?.scrollHeight || 0) - Number(window.innerHeight || 0)
        )
    if (scrollContainer) {
      scrollContainer.scrollTop = targetTop
    } else {
      window.scrollTo({ top: targetTop, behavior: 'instant' as ScrollBehavior })
    }
    await waitForNextPaint()
    return
  }

  const numeric = Number(instruction)
  if (Number.isFinite(numeric)) {
    if (scrollContainer) {
      scrollContainer.scrollTop = Math.max(0, numeric)
    } else {
      window.scrollTo({ top: Math.max(0, numeric), behavior: 'instant' as ScrollBehavior })
    }
    await waitForNextPaint()
  }
}

const readElementRect = (element: Element | null) => {
  if (!(element instanceof Element)) return null
  const rect = element.getBoundingClientRect()
  return {
    x: Number(rect.x || 0),
    y: Number(rect.y || 0),
    top: Number(rect.top || 0),
    left: Number(rect.left || 0),
    right: Number(rect.right || 0),
    bottom: Number(rect.bottom || 0),
    width: Number(rect.width || 0),
    height: Number(rect.height || 0)
  }
}

const readModuleHostLayoutState = () => {
  const root = document.querySelector('.more-module-host-view')
  const body = document.querySelector('.more-module-host-view__body')
  const shell = document.querySelector('.module-frame-shell')
  const frame = document.querySelector('.module-frame')

  const rootEl = root instanceof HTMLElement ? root : null
  const bodyEl = body instanceof HTMLElement ? body : null
  const shellEl = shell instanceof HTMLElement ? shell : null
  const frameEl = frame instanceof HTMLIFrameElement ? frame : null

  if (!rootEl && !shellEl && !frameEl) return null

  return {
    windowInnerWidth: Number(window.innerWidth || 0),
    windowInnerHeight: Number(window.innerHeight || 0),
    windowScrollY: Number(window.scrollY || 0),
    documentClientHeight: Number(document.documentElement?.clientHeight || 0),
    documentScrollHeight: Number(document.documentElement?.scrollHeight || 0),
    bodyClientHeight: Number(document.body?.clientHeight || 0),
    bodyScrollHeight: Number(document.body?.scrollHeight || 0),
    rootRect: readElementRect(rootEl),
    rootClientHeight: Number(rootEl?.clientHeight || 0),
    rootScrollHeight: Number(rootEl?.scrollHeight || 0),
    rootScrollTop: Number(rootEl?.scrollTop || 0),
    bodyRect: readElementRect(bodyEl),
    bodyClientHeightInner: Number(bodyEl?.clientHeight || 0),
    bodyScrollHeightInner: Number(bodyEl?.scrollHeight || 0),
    shellRect: readElementRect(shellEl),
    shellClientHeight: Number(shellEl?.clientHeight || 0),
    shellScrollHeight: Number(shellEl?.scrollHeight || 0),
    shellStyleHeight: shellEl?.style?.height || '',
    frameRect: readElementRect(frameEl),
    frameClientHeight: Number(frameEl?.clientHeight || 0),
    frameOffsetHeight: Number(frameEl?.offsetHeight || 0),
    frameStyleHeight: frameEl?.style?.height || '',
    frameSrc: frameEl?.src || '',
    scrollAncestors: collectDebugScrollAncestors()
  }
}

export const initDebugBridgeClient = async () => {
  if (initialized || !isTauriRuntime()) return
  const eventApi = await import('@tauri-apps/api/event')

  unlistenScreenshot = await eventApi.listen(SCREENSHOT_EVENT_NAME, async (event) => {
    const payload = event?.payload || {}
    const requestId = String(payload.requestId || '')
    const format = String(payload.format || 'png').toLowerCase() === 'webp' ? 'webp' : 'png'
    const returnMode = String(payload.return || payload.returnMode || 'path').toLowerCase()
    pushDebugLog('DebugBridge', `收到截图请求：${requestId || 'unknown'}`, 'debug', payload)

    if (!requestId) {
      return
    }

    try {
      const viewportHeight = Math.max(
        window.innerHeight || 0,
        document.documentElement?.clientHeight || 0,
        900
      )
      const captured = await captureElementToBlob({
        selector: payload.selector || null,
        format,
        backgroundColor: '#f4f7ff',
        maxHeight: viewportHeight + 120,
        scale: 1.5
      })
      const dataUrl = await blobToDataUrl(captured.blob)
      const base64 = dataUrl.split(',')[1] || ''
      const saved = await invokeNative<DebugCaptureSaveResult>('save_debug_capture_file', {
        req: {
          filename: payload.filename || '',
          mimeType: captured.mime,
          contentBase64: base64
        }
      })
      await completeScreenshot({
        requestId,
        success: true,
        savedPath: saved?.path || '',
        mime: captured.mime,
        width: captured.width,
        height: captured.height,
        base64: returnMode === 'base64' || returnMode === 'both' ? base64 : null
      })
      pushDebugLog('DebugBridge', `截图完成：${requestId}`, 'info', {
        path: saved?.path,
        width: captured.width,
        height: captured.height
      })
    } catch (error) {
      await completeScreenshot({
        requestId,
        success: false,
        error: error?.message || String(error || '截图失败')
      }).catch(() => {})
      pushDebugLog('DebugBridge', `截图失败：${requestId}`, 'error', error)
    }
  })

  unlistenOpenModule = await eventApi.listen(OPEN_MODULE_EVENT_NAME, async (event) => {
    const payload = event?.payload || {}
    const requestId = String(payload.requestId || '')
    const moduleId = String(payload.moduleId || payload.module_id || '').trim()
    const requestedStudentId = String(
      payload.studentId ||
      payload.student_id ||
      localStorage.getItem('hbu_username') ||
      ''
    ).trim()

    if (!requestId) return

    try {
      if (!moduleId) {
        throw new Error('模块 ID 不能为空')
      }

      const targetHash = resolveDebugHash(requestedStudentId, 'more')
      if (targetHash && targetHash !== '#/' && window.location.hash !== targetHash) {
        window.location.hash = targetHash
        await sleep(260)
      } else if (targetHash && targetHash !== '#/') {
        window.dispatchEvent(new PopStateEvent('popstate'))
      }

      await waitForNextPaint()

      const startedAt = Date.now()
      const selector = `[data-module-id="${moduleId.replace(/"/g, '\\"')}"]`
      let targetButton: HTMLElement | null = null
      while (Date.now() - startedAt < 8000) {
        const matched = document.querySelector(selector)
        if (matched instanceof HTMLElement && !matched.hasAttribute('disabled')) {
          targetButton = matched
          break
        }
        await sleep(120)
      }

      if (!(targetButton instanceof HTMLElement)) {
        throw new Error(`未找到模块按钮：${moduleId}`)
      }

      targetButton.click()
      await completeOpenModule({
        requestId,
        success: true
      })
      pushDebugLog('DebugBridge', `模块点击完成：${moduleId}`, 'info')
    } catch (error) {
      await completeOpenModule({
        requestId,
        success: false,
        error: error?.message || String(error || '模块点击失败')
      }).catch(() => {})
      pushDebugLog('DebugBridge', `模块点击失败：${moduleId || requestId}`, 'error', error)
    }
  })

  unlistenResetMoreModules = await eventApi.listen(RESET_MORE_MODULES_EVENT_NAME, async (event) => {
    const payload = event?.payload || {}
    const requestId = String(payload.requestId || '')
    if (!requestId) return

    try {
      const sid = String(localStorage.getItem('hbu_username') || '').trim()
      const moreHash = resolveDebugHash(sid, 'more')
      if (
        sid &&
        typeof window.location.hash === 'string' &&
        window.location.hash.includes('/more_module_host') &&
        moreHash &&
        moreHash !== '#/'
      ) {
        window.location.hash = moreHash
        await sleep(260)
      }

      for (const key of MORE_MODULE_STORAGE_KEYS) {
        try {
          localStorage.removeItem(key)
        } catch {
          // ignore per-key local storage failure
        }
        try {
          sessionStorage.removeItem(key)
        } catch {
          // ignore per-key session storage failure
        }
      }

      const cdnBaseOverride = String(payload.cdnBaseOverride || payload.cdn_base_override || '').trim()
      if (cdnBaseOverride) {
        localStorage.setItem(MODULE_CDN_OVERRIDE_STORAGE_KEY, cdnBaseOverride)
      } else {
        localStorage.removeItem(MODULE_CDN_OVERRIDE_STORAGE_KEY)
      }

      await waitForNextPaint()
      await completeResetMoreModules({
        requestId,
        success: true
      })
      pushDebugLog('DebugBridge', '模块缓存状态已清空', 'info', {
        clearedKeys: MORE_MODULE_STORAGE_KEYS,
        cdnBaseOverride
      })
    } catch (error) {
      await completeResetMoreModules({
        requestId,
        success: false,
        error: error?.message || String(error || '模块缓存状态清空失败')
      }).catch(() => {})
      pushDebugLog('DebugBridge', '模块缓存状态清空失败', 'error', error)
    }
  })

  unlistenNavigate = await eventApi.listen(NAVIGATE_EVENT_NAME, async (event) => {
    const payload = event?.payload || {}
    const navigatePayload = payload.payload && typeof payload.payload === 'object' ? payload.payload : null
    const view = String(payload.view || payload.module || '').trim() || 'home'
    const sid = String(
      payload.studentId ||
      payload.student_id ||
      localStorage.getItem('hbu_username') ||
      ''
    ).trim()

    const targetHash = resolveDebugHash(sid, view)
    if (!targetHash || targetHash === '#/') {
      pushDebugLog('DebugBridge', `导航请求忽略：缺少有效学号（view=${view}）`, 'warn', payload)
      return
    }

    const injectedModuleHostSession =
      view === 'more_module_host' ? resolveInjectedModuleHostSession(navigatePayload) : null

    if (injectedModuleHostSession) {
      try {
        localStorage.setItem(MODULE_HOST_SESSION_KEY, JSON.stringify(injectedModuleHostSession))
      } catch {
        // ignore storage failure for debug navigation
      }
    }

    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash
    } else {
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    await waitForNextPaint()
    await applyDebugScrollInstruction(
      payload.scrollTo ?? payload.scroll_to ?? navigatePayload?.scrollTo ?? navigatePayload?.scroll_to
    )

    pushDebugLog('DebugBridge', `导航完成：${targetHash}`, 'info', payload)
  })

  unlistenState = await eventApi.listen(STATE_EVENT_NAME, async (event) => {
    const payload = event?.payload || {}
    const requestId = String(payload.requestId || '')
    if (!requestId) return

    try {
      await completeState({
        requestId,
        success: true,
        state: {
          hash: window.location.hash || '',
          href: window.location.href || '',
          title: document.title || '',
          capturedAt: new Date().toISOString(),
          bootMetrics: getBootMetricsSnapshot(),
          moduleHostSession: readStoredModuleHostSession(),
          moduleHostLayout: readModuleHostLayoutState()
        }
      })
    } catch (error) {
      await completeState({
        requestId,
        success: false,
        error: error?.message || String(error || '状态读取失败')
      }).catch(() => {})
      pushDebugLog('DebugBridge', `状态读取失败：${requestId}`, 'error', error)
    }
  })

  await invokeNative('set_debug_bridge_ready', { ready: true }).catch((error) => {
    pushDebugLog('DebugBridge', '设置截图桥接就绪状态失败', 'warn', error)
  })

  window.addEventListener('beforeunload', () => {
    void invokeNative('set_debug_bridge_ready', { ready: false }).catch(() => {})
    if (typeof unlistenScreenshot === 'function') {
      unlistenScreenshot()
      unlistenScreenshot = null
    }
    if (typeof unlistenOpenModule === 'function') {
      unlistenOpenModule()
      unlistenOpenModule = null
    }
    if (typeof unlistenNavigate === 'function') {
      unlistenNavigate()
      unlistenNavigate = null
    }
    if (typeof unlistenResetMoreModules === 'function') {
      unlistenResetMoreModules()
      unlistenResetMoreModules = null
    }
    if (typeof unlistenState === 'function') {
      unlistenState()
      unlistenState = null
    }
    initialized = false
  })

  initialized = true
  pushDebugLog('DebugBridge', '调试桥接客户端已初始化', 'info')
}
