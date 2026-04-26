const DEFAULT_LOCAL_BRIDGE = 'http://127.0.0.1:4399'

const withAuthHeaders = (token, extraHeaders = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders
  }
  const authToken = String(token || '').trim()
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
    headers['x-local-token'] = authToken
  }
  return headers
}

const parseBridgeJson = async (response) => {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return {
      success: false,
      error: { message: text || `HTTP ${response.status}` }
    }
  }
}

const postDebugBridge = async (path, payload, { token = '', baseUrl = DEFAULT_LOCAL_BRIDGE } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: withAuthHeaders(token),
    body: JSON.stringify(payload || {})
  })
  const body = await parseBridgeJson(response)
  if (!response.ok) {
    throw new Error(body?.error?.message || `DebugBridge 请求失败：HTTP ${response.status}`)
  }
  return body?.data ?? body
}

export const debugCustomScheduleUpsert = (payload, options = {}) =>
  postDebugBridge('/debug/custom_schedule/upsert', payload, options)

export const debugCaptureCurrentPage = (payload, options = {}) =>
  postDebugBridge('/debug/dom_screenshot', payload, options)

export const debugCaptureNativeWindow = (payload, options = {}) =>
  postDebugBridge('/debug/screenshot', payload, options)
