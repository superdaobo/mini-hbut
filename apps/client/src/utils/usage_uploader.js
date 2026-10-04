import { invokeNative, isTauriRuntime } from '../platform/native'
import { getCloudSyncRuntimeConfig } from './cloud_sync'
import { pushDebugLog } from './debug_logger'
import {
  clearWebUsagePendingQueues,
  getWebUsagePendingQueues
} from './usage_tracker'
import { shouldApplyAppStoreRestrictions } from '../config/app_store_policy'
import { isTestAccountSession } from './test_account.js'
import { isValidStudentId } from './student_id.js'

const CLOUD_SYNC_DEVICE_ID_KEY = 'hbu_cloud_sync_device_id'
const USAGE_UPLOAD_LAST_SUCCESS_PREFIX = 'hbu_usage_upload_last_success:'
const DEFAULT_TIMEOUT_MS = 12000
const DEFAULT_UPLOAD_COOLDOWN_MS = 15 * 60 * 1000
const BATCH_LIMIT = 200

// ── 失败退避与降噪（#933）───────────────────────────────────────
// 服务端 401/500 期间，此前每次页面切换都会全量重试 200 条事件并全部失败、
// 刷同级别 warn 日志。现在：连续失败按指数退避暂停自动上传，日志按计数聚合。
const USAGE_UPLOAD_BACKOFF_BASE_MS = 30 * 1000
const USAGE_UPLOAD_BACKOFF_MAX_MS = 15 * 60 * 1000
const USAGE_UPLOAD_FAILURE_LOG_INTERVAL = 10

const uploadFailureState = {
  consecutiveFailures: 0,
  totalFailures: 0,
  suppressedLogCount: 0,
  lastError: '',
  lastErrorKind: '',
  lastErrorAt: 0,
  backoffUntil: 0,
  lastSuccessAt: 0
}

/**
 * usage 上传诊断快照。
 * 供调试状态接口（/debug/state）与失败日志 details 读取：
 * 失败计数、最近错误、退避剩余时间均可观测。
 */
export const getUsageUploadDiagnostics = () => ({
  consecutiveFailures: uploadFailureState.consecutiveFailures,
  totalFailures: uploadFailureState.totalFailures,
  suppressedLogCount: uploadFailureState.suppressedLogCount,
  lastError: uploadFailureState.lastError,
  lastErrorKind: uploadFailureState.lastErrorKind,
  lastErrorAt: uploadFailureState.lastErrorAt,
  backoffUntil: uploadFailureState.backoffUntil,
  backoffRemainingMs: Math.max(0, uploadFailureState.backoffUntil - Date.now()),
  lastSuccessAt: uploadFailureState.lastSuccessAt
})

// 从错误消息归类失败级别（http_401 / http_500 / timeout / network），用于聚合降噪。
const classifyUsageUploadErrorKind = (error) => {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout'
  const message = String(error?.message || error || '')
  const status = message.match(/\((\d{3})\)/)?.[1]
  if (status) return `http_${status}`
  if (/abort|timeout/i.test(message)) return 'timeout'
  return 'network'
}

const nextUploadBackoffMs = (consecutiveFailures) =>
  Math.min(
    USAGE_UPLOAD_BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveFailures - 1),
    USAGE_UPLOAD_BACKOFF_MAX_MS
  )

const recordUploadFailure = (error, studentId) => {
  const state = uploadFailureState
  const kind = classifyUsageUploadErrorKind(error)
  const backoffMs = nextUploadBackoffMs(state.consecutiveFailures + 1)
  state.consecutiveFailures += 1
  state.totalFailures += 1
  state.lastError = String(error?.message || error || 'usage 上传失败')
  state.lastErrorKind = kind
  state.lastErrorAt = Date.now()
  state.backoffUntil = state.lastErrorAt + backoffMs

  // 失败降噪：连续失败只在首次与每第 N 次输出同级别日志，其余聚合计数（#933）
  const shouldLog =
    state.consecutiveFailures === 1 ||
    state.consecutiveFailures % USAGE_UPLOAD_FAILURE_LOG_INTERVAL === 0
  if (!shouldLog) {
    state.suppressedLogCount += 1
    return
  }
  pushDebugLog(
    'UsageStats',
    `上传失败 student=${studentId} 连续第 ${state.consecutiveFailures} 次 kind=${kind} 退避 ${Math.round(backoffMs / 1000)}s`,
    'warn',
    { error: state.lastError, diagnostics: getUsageUploadDiagnostics() }
  )
  state.suppressedLogCount = 0
}

const resetUploadFailureState = () => {
  uploadFailureState.consecutiveFailures = 0
  uploadFailureState.suppressedLogCount = 0
  uploadFailureState.lastError = ''
  uploadFailureState.lastErrorKind = ''
  uploadFailureState.lastErrorAt = 0
  uploadFailureState.backoffUntil = 0
  uploadFailureState.lastSuccessAt = Date.now()
}

let uploadTimer = null
let uploadInFlight = null

const toSafeText = (value) => String(value || '').trim()

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

const loadUsageStatsChallenge = async (config) => {
  // 服务端 challenge 是一次性消费的，不能按 TTL 缓存复用。
  // 每次业务请求获取独立 challenge，避免 heartbeat / upload 并发抢同一个 token。
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
      // 错误消息带状态码，供失败级别归类（http_401/http_500）与排障（#933）
      const detail = toSafeText(parsed?.error)
      throw new Error(
        detail
          ? `usage-stats ping 失败 (${response.status}): ${detail}`
          : `usage-stats ping 失败 (${response.status})`
      )
    }
    const token = toSafeText(parsed?.challenge)
    if (!token) throw new Error('usage-stats 鉴权挑战获取失败')
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
      // 错误消息带状态码，供失败级别归类（http_401/http_500）与排障（#933）
      const detail = toSafeText(parsed?.error)
      throw new Error(
        detail
          ? `usage-stats 请求失败 (${response.status}): ${detail}`
          : `usage-stats 请求失败 (${response.status})`
      )
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
  // 合规 guest/demo 禁用；真实登录允许
  if (shouldApplyAppStoreRestrictions() || isTestAccountSession()) {
    return { success: false, error: 'usage 上传已在当前合规收紧会话/演示会话禁用' }
  }
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
    // 连续失败退避：服务端 401/500 期间不再每次页面切换都全量重试（#933）
    const backoffRemain = uploadFailureState.backoffUntil - Date.now()
    if (backoffRemain > 0) {
      return {
        success: false,
        backoff: true,
        remainingMs: backoffRemain,
        error: 'usage 上传退避中（此前连续失败）'
      }
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
    resetUploadFailureState()
    pushDebugLog('UsageStats', `上传成功 student=${sid} accepted=${response?.accepted ?? acceptedEventIds.length}`, 'info')
    return { success: true, response }
  } catch (error) {
    recordUploadFailure(error, sid)
    return { success: false, error: String(error?.message || error || 'usage 上传失败') }
  }
}

export const sendUsageHeartbeat = async ({
  studentId,
  event,
  deviceProfile = null
} = {}) => {
  if (shouldApplyAppStoreRestrictions() || isTestAccountSession()) {
    return { success: false, error: 'usage heartbeat 已在当前合规收紧会话/演示会话禁用' }
  }
  const sid = toSafeText(studentId)
  if (!isValidStudentId(sid) || !event || typeof event !== 'object') {
    return { success: false, error: 'usage heartbeat 参数无效' }
  }
  const cfg = getUsageStatsRuntimeConfig()
  if (!cfg.enabled) {
    return { success: false, error: 'usage-stats 未启用' }
  }
  try {
    const response = await requestUsageStats('/heartbeat', {
      method: 'POST',
      config: cfg,
      body: {
        student_id: sid,
        device_id: ensureDeviceId(),
        secret_ref: cfg.secretRef,
        client_time: Date.now(),
        event,
        device_profile: deviceProfile
      }
    })
    return { success: true, response }
  } catch (error) {
    pushDebugLog('UsageStats', `heartbeat 失败 student=${sid}`, 'warn', error)
    return { success: false, error: String(error?.message || error || 'usage heartbeat 失败') }
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
