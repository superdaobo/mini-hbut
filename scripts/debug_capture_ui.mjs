const bridgeBase = String(process.env.BRIDGE_BASE || 'http://127.0.0.1:4399').replace(/\/+$/, '')
const debugToken = String(process.env.DEBUG_TOKEN || '').trim()
const debugView = String(process.env.DEBUG_VIEW || '').trim()
const debugStudentId = String(process.env.DEBUG_STUDENT_ID || '').trim()
const debugSelector = String(process.env.DEBUG_SELECTOR || '.app-shell').trim()
const debugFilename = String(process.env.DEBUG_FILENAME || `debug-capture-${Date.now()}.png`).trim()
const debugWaitMs = Math.max(0, Number(process.env.DEBUG_WAIT_MS || 1800) || 1800)
const debugNavigatePayloadRaw = String(process.env.DEBUG_NAVIGATE_PAYLOAD || '').trim()

const parseNavigatePayload = () => {
  if (!debugNavigatePayloadRaw) return undefined
  try {
    const parsed = JSON.parse(debugNavigatePayloadRaw)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch (error) {
    throw new Error(`DEBUG_NAVIGATE_PAYLOAD 不是合法 JSON：${error?.message || error}`)
  }
}

const buildHeaders = () => {
  const headers = {
    'Content-Type': 'application/json'
  }
  if (debugToken) {
    headers.Authorization = `Bearer ${debugToken}`
    headers['x-local-token'] = debugToken
  }
  return headers
}

const postJson = async (path, payload) => {
  const response = await fetch(`${bridgeBase}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload || {})
  })
  const text = await response.text()
  let body = {}
  try {
    body = JSON.parse(text)
  } catch {
    body = { success: false, error: { message: text || `HTTP ${response.status}` } }
  }
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error?.message || body?.message || `请求失败：HTTP ${response.status}`)
  }
  return body?.data ?? body
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const main = async () => {
  if (debugView) {
    const navigatePayload = parseNavigatePayload()
    await postJson('/debug/navigate', {
      view: debugView,
      student_id: debugStudentId || undefined,
      payload: navigatePayload
    })
    if (debugWaitMs > 0) {
      await sleep(debugWaitMs)
    }
  }

  const captured = await postJson('/debug/screenshot', {
    selector: debugSelector || undefined,
    format: 'png',
    return: 'path',
    filename: debugFilename
  })

  console.log('[debug-capture-ui] screenshot:', JSON.stringify(captured, null, 2))
}

main().catch((error) => {
  console.error('[debug-capture-ui] 失败:', error?.message || error)
  process.exitCode = 1
})
