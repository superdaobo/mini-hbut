const json = (body, status = 200, corsOrigin = '*') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  })

const corsPreflight = (origin = '*') =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400'
    }
  })

const toSafeText = (value) => String(value || '').trim()

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

class BadRequestError extends HttpError {
  constructor(message) {
    super(400, message)
  }
}

class RateLimitError extends HttpError {
  constructor(message) {
    super(429, message)
  }
}

const getStudentId = (value) => {
  const text = toSafeText(value)
  return /^\d{10}$/.test(text) ? text : ''
}

const verifyAuth = (request, env) => {
  const expected = toSafeText(env.SYNC_API_TOKEN)
  if (!expected) return true
  const header = toSafeText(request.headers.get('Authorization'))
  if (!header) return false
  const token = header.toLowerCase().startsWith('bearer ')
    ? toSafeText(header.slice(7))
    : header
  return token === expected
}

const getOrigin = (request) => {
  const origin = toSafeText(request.headers.get('Origin'))
  return origin || '*'
}

const getIp = (request) =>
  toSafeText(request.headers.get('CF-Connecting-IP')) ||
  toSafeText(request.headers.get('X-Forwarded-For')) ||
  '0.0.0.0'

const buildDataKey = (studentId) => `sync:${studentId}`
const buildRateKey = (studentId, action, ip) => `rate:${action}:${studentId}:${ip}`

const resolveRateLimitSeconds = (env, action) => {
  const normalized = toSafeText(action).toLowerCase()
  if (normalized === 'upload') {
    const value = Number(env.RATE_LIMIT_UPLOAD_SECONDS || env.RATE_LIMIT_SECONDS || 60)
    return Number.isFinite(value) ? value : 60
  }
  if (normalized === 'download') {
    const value = Number(env.RATE_LIMIT_DOWNLOAD_SECONDS || env.RATE_LIMIT_SECONDS || 60)
    return Number.isFinite(value) ? value : 60
  }
  if (normalized === 'ping') {
    const value = Number(env.RATE_LIMIT_PING_SECONDS || 15)
    return Number.isFinite(value) ? value : 15
  }
  const fallback = Number(env.RATE_LIMIT_SECONDS || 60)
  return Number.isFinite(fallback) ? fallback : 60
}

const checkRateLimit = async (env, studentId, action, ip) => {
  const ttl = resolveRateLimitSeconds(env, action)
  if (!Number.isFinite(ttl) || ttl <= 0) return
  const key = buildRateKey(studentId, action, ip)
  const exists = await env.SYNC_KV.get(key)
  if (exists) {
    throw new RateLimitError('请求过于频繁，请稍后再试')
  }
  await env.SYNC_KV.put(key, '1', { expirationTtl: Math.max(60, Math.floor(ttl)) })
}

const parseRequestJson = async (request) => {
  const text = await request.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new BadRequestError('请求体不是合法 JSON')
  }
}

const toErrorResponse = (error, origin) => {
  const status = Number(error?.status) || 500
  const message = toSafeText(error?.message) || '内部错误'
  return json({ success: false, error: message }, status, origin)
}

const handleUpload = async (request, env) => {
  const body = await parseRequestJson(request)
  const studentId = getStudentId(body?.student_id)
  if (!studentId) {
    return json({ success: false, error: 'student_id 不合法' }, 400, getOrigin(request))
  }
  const payload = body?.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ success: false, error: 'payload 不合法' }, 400, getOrigin(request))
  }

  await checkRateLimit(env, studentId, 'upload', getIp(request))

  const now = new Date().toISOString()
  const record = {
    student_id: studentId,
    updated_at: now,
    reason: toSafeText(body?.reason) || 'manual',
    device_id: toSafeText(body?.device_id),
    client_time: Number(body?.client_time || Date.now()) || Date.now(),
    payload
  }
  await env.SYNC_KV.put(buildDataKey(studentId), JSON.stringify(record))
  return json(
    {
      success: true,
      updated_at: now,
      student_id: studentId
    },
    200,
    getOrigin(request)
  )
}

const handleDownload = async (request, env) => {
  const url = new URL(request.url)
  const studentId = getStudentId(url.searchParams.get('student_id'))
  if (!studentId) {
    return json({ success: false, error: 'student_id 不合法' }, 400, getOrigin(request))
  }

  await checkRateLimit(env, studentId, 'download', getIp(request))

  const raw = await env.SYNC_KV.get(buildDataKey(studentId))
  if (!raw) {
    return json(
      {
        success: true,
        empty: true,
        data: null
      },
      200,
      getOrigin(request)
    )
  }
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return json({ success: false, error: '服务端数据损坏' }, 500, getOrigin(request))
  }
  return json(
    {
      success: true,
      data: parsed?.payload || null,
      meta: {
        student_id: studentId,
        updated_at: parsed?.updated_at || '',
        reason: parsed?.reason || '',
        device_id: parsed?.device_id || ''
      }
    },
    200,
    getOrigin(request)
  )
}

const handlePing = (request) =>
  json(
    {
      success: true,
      service: 'mini-hbut-cloud-sync',
      time: new Date().toISOString()
    },
    200,
    getOrigin(request)
  )

export default {
  async fetch(request, env) {
    const origin = getOrigin(request)
    if (request.method === 'OPTIONS') {
      return corsPreflight(origin)
    }
    if (!verifyAuth(request, env)) {
      return json({ success: false, error: '未授权访问' }, 401, origin)
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'GET' && path === '/sync/ping') {
      return handlePing(request)
    }
    if (request.method === 'POST' && path === '/sync/upload') {
      try {
        return await handleUpload(request, env)
      } catch (error) {
        return toErrorResponse(error, origin)
      }
    }
    if (request.method === 'GET' && path === '/sync/download') {
      try {
        return await handleDownload(request, env)
      } catch (error) {
        return toErrorResponse(error, origin)
      }
    }
    return json({ success: false, error: 'Not Found' }, 404, origin)
  }
}
