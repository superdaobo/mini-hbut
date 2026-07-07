import { invokeNative, isTauriRuntime } from '../platform/native'
import { getCloudSyncRuntimeConfig } from './cloud_sync'
import { pushDebugLog } from './debug_logger'
import {
  clearWebUsagePendingQueues,
  getWebUsagePendingQueues
} from './usage_tracker'

const CLOUD_SYNC_DEVICE_ID_KEY = 'hbu_cloud_sync_device_id'
const USAGE_UPLOAD_LAST_SUCCESS_PREFIX = 'hbu_usage_upload_last_success:'
const DEFAULT_TIMEOUT_MS = 12000
const DEFAULT_UPLOAD_COOLDOWN_MS = 15 * 60 * 1000
const CHALLENGE_SKEW_MS = 3000
const CHALLENGE_FALLBACK_TTL_MS = 60 * 1000
const BATCH_LIMIT = 200
const STUDENT_ID_RE = /^\d{10}$/

const challengeState = {
  token: '',
  expiresAt: 0,
  endpoint: ''
}

let uploadTimer = null
let uploadInFlight = null

const toSafeText = (value) => String(value || '').trim()
const isValidStudentId = (value) => STUDENT_ID_RE.test(toSafeText(value))

const safeParseJson = (raw, fallback = null) => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const ensureDeviceId = () => {
  let id = toSafeText(localStorage.getItem(CLOUD_SYNC_DEVICE_ID_KEY))
  if (id) return id
  try {
    id = (crypto?.randomUUID?.() || '').trim()
  } catch {
    id = ''
  }
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
  localStorage.setItem(CLOUD_SYNC_DEVICE_ID_KEY, id)
  return id
}

const normalizeUsageStatsEndpoint = (value) => {
  const text = toSafeText(value)
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/usage-stats$/i.test(normalized)) return normalized
  if (/\/api\/cloud-sync$/i.test(normalized)) {
    return normalized.replace(/\/api\/cloud-sync$/i, '/api/usage-stats')
  }
  return `${normalized}/api/usage-stats`
}

export const getUsageStatsRuntimeConfig = () => {
  const cloudCfg = getCloudSyncRuntimeConfig()
  const endpoint = normalizeUsageStatsEndpoint(cloudCfg.proxyEndpoint || cloudCfg.endpoint)
  return {
    enabled: Boolean(endpoint) && cloudCfg.enabled !== false,
    endpoint,
    secretRef: toSafeText(cloudCfg.secretRef) || 'kv1-main',
    timeoutMs: Math.max(3000, Number(cloudCfg.timeoutMs || DEFAULT_TIMEOUT_MS))
  }
}

const getLastUploadTs = (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) return 0
  return Number(localStorage.getItem(`${USAGE_UPLOAD_LAST_SUCCESS_PREFIX}${sid}`) || 0) || 0
}

const setLastUploadTs = (studentId, ts = Date.now()) => {
  const sid = toSafeText(studentId)
  if (!sid) return
  localStorage.setItem(`${USAGE_UPLOAD_LAST_SUCCESS_PREFIX}${sid}`, String(ts))
}

const canReuseChallenge = (config) => {
  const endpoint = toSafeText(config?.endpoint)
  if (!endpoint) return false
  if (challengeState.endpoint !== endpoint) return false
  if (!challengeState.token) return false
  return challengeState.expiresAt > Date.now() + CHALLENGE_SKEW_MS
}

const loadUsageStatsChallenge = async (config, force = false) => {
  if (!force && canReuseChallenge(config)) {
    return challengeState.token
  }
  const secretRef = toSafeText(config?.secretRef) || 'kv1-main'
  const query = new URLSearchParams({ secret_ref: secretRef }).toString()
  const url = `${config.endpoint.replace(/\/+$/, '')}/ping?${query}`
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = window.setTimeout(() => controller?.abort?.(), config.timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal
    })
    const parsed = safeParseJson(await response.text(), null)
    if (!response.ok) {
      throw new Error(toSafeText(parsed?.error) || `usage-stats ping 失败 (${response.status})`)
    }
    const token = toSafeText(parsed?.challenge)
    if (!token) throw new Error('usage-stats 鉴权挑战获取失败')
    const ttlSec = Number(parsed?.challenge_expires_in || 0)
    const ttlMs = Number.isFinite(ttlSec) && ttlSec > 0
      ? Math.max(10_000, Math.round(ttlSec * 1000))
      : CHALLENGE_FALLBACK_TTL_MS
    challengeState.token = token
    challengeState.endpoint = config.endpoint
    challengeState.expiresAt = Date.now() + ttlMs
    return token
  } finally {
    window.clearTimeout(timer)
  }
}

const requestUsageStats = async (path, { method = 'GET', body, config, skipChallenge = false } = {}) => {
  const endpoint = toSafeText(config?.endpoint)
  if (!endpoint) throw new Error('usage-stats 服务地址未配置')
  const url = `${endpoint.replace(/\/+$/, '')}${path}`
  const challengeToken = skipChallenge ? '' : await loadUsageStatsChallenge(config)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = window.setTimeout(() => controller?.abort?.(), config.timeoutMs)
  try {
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (challengeToken) headers['x-usage-stats-challenge'] = challengeToken
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal
    })
    const parsed = safeParseJson(await response.text(), null)
    if (!response.ok) {
      throw new Error(toSafeText(parsed?.error) || `usage-stats 请求失败 (${response.status})`)
    }
    return parsed
  } finally {
    window.clearTimeout(timer)
  }
}

const collectPendingBatch = async (studentId, deviceId) => {
  if (isTauriRuntime()) {
    return await invokeNative('usage_stats_list_pending_upload', {
      studentId,
      deviceId,
      limit: BATCH_LIMIT
    })
  }
  const web = getWebUsagePendingQueues()
  return {
    events: (web.events || []).slice(0, BATCH_LIMIT),
    sessions: (web.sessions || []).slice(0, BATCH_LIMIT),
    device_profile: web.deviceProfile || null
  }
}

const markBatchUploaded = async (studentId, eventIds, sessionIds) => {
  const uploadedAt = Date.now()
  if (isTauriRuntime()) {
    await invokeNative('usage_stats_mark_uploaded', {
      eventIds,
      sessionIds,
      uploadedAt
    })
    return
  }
  clearWebUsagePendingQueues({ eventIds, sessionIds })
}

export const runUsageStatsUpload = async ({
  studentId,
  reason = 'manual',
  force = false
} = {}) => {
  const sid = toSafeText(studentId)
  if (!isValidStudentId(sid)) {
    return { success: false, error: '学号无效，跳过 usage 上传' }
  }
  const cfg = getUsageStatsRuntimeConfig()
  if (!cfg.enabled) {
    return { success: false, error: 'usage-stats 未启用' }
  }
  if (!force) {
    const lastTs = getLastUploadTs(sid)
    const remain = DEFAULT_UPLOAD_COOLDOWN_MS - (Date.now() - lastTs)
    if (lastTs > 0 && remain > 0) {
      return { success: false, cooldown: true, remainingMs: remain, error: 'usage 上传冷却中' }
    }
  }

  const deviceId = ensureDeviceId()
  const batch = await collectPendingBatch(sid, deviceId)
  const events = Array.isArray(batch?.events) ? batch.events : []
  const sessions = Array.isArray(batch?.sessions) ? batch.sessions : []
  if (!events.length && !sessions.length && !batch?.device_profile) {
    return { success: true, skipped: true, accepted: 0 }
  }

  pushDebugLog('UsageStats', `开始上传 student=${sid} reason=${reason} events=${events.length}`, 'info')
  try {
    const response = await requestUsageStats('/upload', {
      method: 'POST',
      config: cfg,
      body: {
        student_id: sid,
        device_id: deviceId,
        secret_ref: cfg.secretRef,
        client_time: Date.now(),
        events,
        sessions,
        device_profile: batch?.device_profile || null
      }
    })
    const acceptedEventIds = events.map((item) => toSafeText(item?.event_id)).filter(Boolean)
    const acceptedSessionIds = sessions.map((item) => toSafeText(item?.session_id)).filter(Boolean)
    await markBatchUploaded(sid, acceptedEventIds, acceptedSessionIds)
    setLastUploadTs(sid)
    pushDebugLog('UsageStats', `上传成功 student=${sid} accepted=${response?.accepted ?? acceptedEventIds.length}`, 'info')
    return { success: true, response }
  } catch (error) {
    pushDebugLog('UsageStats', `上传失败 student=${sid}`, 'warn', error)
    return { success: false, error: String(error?.message || error || 'usage 上传失败') }
  }
}

export const fetchRemotePersonalUsageSummary = async (studentId) => {
  const sid = toSafeText(studentId)
  if (!isValidStudentId(sid)) return null
  const cfg = getUsageStatsRuntimeConfig()
  if (!cfg.enabled) return null
  try {
    const query = new URLSearchParams({ student_id: sid, secret_ref: cfg.secretRef }).toString()
    return await requestUsageStats(`/personal?${query}`, { method: 'GET', config: cfg })
  } catch {
    return null
  }
}

export const scheduleUsageUpload = ({ studentId, reason = 'scheduled', force = false } = {}) => {
  const sid = toSafeText(studentId)
  if (!isValidStudentId(sid)) return
  if (uploadInFlight) return
  uploadInFlight = runUsageStatsUpload({ studentId: sid, reason, force })
    .catch(() => ({ success: false }))
    .finally(() => {
      uploadInFlight = null
    })
}

export const startUsageUploadScheduler = (getStudentId) => {
  if (uploadTimer) return
  const tick = () => {
    const sid = toSafeText(typeof getStudentId === 'function' ? getStudentId() : getStudentId)
    if (sid) scheduleUsageUpload({ studentId: sid, reason: 'interval' })
  }
  uploadTimer = window.setInterval(tick, DEFAULT_UPLOAD_COOLDOWN_MS)
}

export const stopUsageUploadScheduler = () => {
  if (!uploadTimer) return
  window.clearInterval(uploadTimer)
  uploadTimer = null
}
