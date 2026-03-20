import { invokeNative, isTauriRuntime } from '../platform/native'
import { pushDebugLog } from './debug_logger'
import { blobToDataUrl, captureElementToBlob } from './capture_service'

const SCREENSHOT_EVENT_NAME = 'hbu-debug-screenshot-request'
const NAVIGATE_EVENT_NAME = 'hbu-debug-navigate-request'

let initialized = false
let unlistenScreenshot = null
let unlistenNavigate = null

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
      const captured = await captureElementToBlob({
        selector: payload.selector || null,
        format,
        backgroundColor: '#f4f7ff'
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

  unlistenNavigate = await eventApi.listen(NAVIGATE_EVENT_NAME, async (event) => {
    const payload = event?.payload || {}
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

    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash
    } else {
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    pushDebugLog('DebugBridge', `导航完成：${targetHash}`, 'info', payload)
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
    if (typeof unlistenNavigate === 'function') {
      unlistenNavigate()
      unlistenNavigate = null
    }
    initialized = false
  })

  initialized = true
  pushDebugLog('DebugBridge', '调试桥接客户端已初始化', 'info')
}
