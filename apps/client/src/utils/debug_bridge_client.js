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

const getDebugBridge = async (path, { token = '', baseUrl = DEFAULT_LOCAL_BRIDGE } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: withAuthHeaders(token)
  })
  const body = await parseBridgeJson(response)
  if (!response.ok) {
    throw new Error(body?.error?.message || `DebugBridge 请求失败：HTTP ${response.status}`)
  }
  return body?.data ?? body
}

const deleteDebugBridge = async (path, { token = '', baseUrl = DEFAULT_LOCAL_BRIDGE } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: withAuthHeaders(token)
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

/** 拉取运行时日志（Rust + 前端推送） */
export const debugFetchLogs = (query = {}, options = {}) => {
  const params = new URLSearchParams()
  if (query.limit != null) params.set('limit', String(query.limit))
  if (query.sinceId != null) params.set('since_id', String(query.sinceId))
  if (query.scope) params.set('scope', query.scope)
  if (query.level) params.set('level', query.level)
  if (query.q) params.set('q', query.q)
  const qs = params.toString()
  return getDebugBridge(`/debug/logs${qs ? `?${qs}` : ''}`, options)
}

export const debugClearLogs = (options = {}) => deleteDebugBridge('/debug/logs', options)

export const debugPushLog = (payload, options = {}) =>
  postDebugBridge('/debug/logs/push', payload, options)

export const debugDiag = (options = {}) => getDebugBridge('/debug/diag', options)

export const debugListRoutes = (options = {}) => getDebugBridge('/debug/routes', options)

export const debugChaoxingSession = (payload = {}, options = {}) =>
  postDebugBridge('/debug/chaoxing/session', payload, options)

export const debugChaoxingCourses = (payload = {}, options = {}) =>
  postDebugBridge('/debug/chaoxing/courses', payload, options)

export const debugInboxFetch = (payload = {}, options = {}) =>
  postDebugBridge('/debug/inbox', payload, options)
