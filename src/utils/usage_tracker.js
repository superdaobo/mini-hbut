import { invokeNative, isTauriRuntime } from '../platform/native'
import { detectRuntime } from '../platform/runtime'
import { getCurrentVersion } from './updater'
import { scheduleUsageUpload } from './usage_uploader'

const CLOUD_SYNC_DEVICE_ID_KEY = 'hbu_cloud_sync_device_id'
const WEB_QUEUE_KEY = 'hbu_usage_events_queue_v1'
const WEB_SESSIONS_KEY = 'hbu_usage_sessions_queue_v1'
const DAILY_EVENT_LIMIT = 5000
const STUDENT_ID_RE = /^\d{10}$/

const toSafeText = (value) => String(value || '').trim()
const isValidStudentId = (value) => STUDENT_ID_RE.test(toSafeText(value))

let clientMetaCache = null
let clientMetaCacheAt = 0
let activeView = { id: '', startedAt: 0 }
let activeModule = { id: '', loadMode: '', launchMode: '', startedAt: 0 }
let activeSession = { sessionId: '', startedAt: 0 }
let initialized = false
let currentStudentId = 'anonymous'
let dailyEventCount = 0
let dailyEventDate = ''

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

const createEventId = () => {
  try {
    const id = crypto?.randomUUID?.()
    if (id) return id
  } catch {
    // ignore
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const createSessionId = () => {
  try {
    const id = crypto?.randomUUID?.()
    if (id) return id
  } catch {
    // ignore
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const todayKey = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const bumpDailyCounter = () => {
  const today = todayKey()
  if (dailyEventDate !== today) {
    dailyEventDate = today
    dailyEventCount = 0
  }
  dailyEventCount += 1
  return dailyEventCount <= DAILY_EVENT_LIMIT
}

const readWebQueue = (key) => {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeWebQueue = (key, items) => {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(-2000)))
  } catch {
    // ignore quota errors
  }
}

const getClientMeta = async () => {
  const now = Date.now()
  if (clientMetaCache && now - clientMetaCacheAt < 60_000) {
    return clientMetaCache
  }
  let version = ''
  try {
    version = toSafeText(await getCurrentVersion())
  } catch {
    version = ''
  }
  const runtime = detectRuntime()
  const platform = typeof navigator !== 'undefined'
    ? toSafeText(navigator.platform || navigator.userAgent || '')
    : ''
  clientMetaCache = {
    app_version: version,
    runtime,
    platform,
    os_version: typeof navigator !== 'undefined' ? toSafeText(navigator.userAgent || '') : '',
    arch: '',
    locale: typeof navigator !== 'undefined' ? toSafeText(navigator.language || '') : ''
  }
  clientMetaCacheAt = now
  return clientMetaCache
}

const resolveStudentId = () => {
  const sid = toSafeText(currentStudentId)
  if (isValidStudentId(sid)) return sid
  const stored = toSafeText(localStorage.getItem('hbu_username'))
  if (isValidStudentId(stored)) return stored
  return 'anonymous'
}

const persistEvent = async (event) => {
  if (!bumpDailyCounter()) return false
  if (isTauriRuntime()) {
    await invokeNative('usage_stats_record_event', { event })
    return true
  }
  const queue = readWebQueue(WEB_QUEUE_KEY)
  queue.push(event)
  writeWebQueue(WEB_QUEUE_KEY, queue)
  return true
}

const persistSession = async (session) => {
  if (isTauriRuntime()) {
    await invokeNative('usage_stats_end_session', { session })
    return true
  }
  const queue = readWebQueue(WEB_SESSIONS_KEY)
  queue.push(session)
  writeWebQueue(WEB_SESSIONS_KEY, queue)
  return true
}

const upsertDeviceProfile = async () => {
  const meta = await getClientMeta()
  const profile = {
    device_id: ensureDeviceId(),
    student_id: resolveStudentId(),
    app_version: meta.app_version,
    runtime: meta.runtime,
    platform: meta.platform,
    os_version: meta.os_version,
    arch: meta.arch,
    locale: meta.locale,
    updated_at: Date.now()
  }
  if (isTauriRuntime()) {
    await invokeNative('usage_stats_upsert_device_profile', { profile })
    return profile
  }
  try {
    localStorage.setItem('hbu_usage_device_profile_v1', JSON.stringify(profile))
  } catch {
    // ignore
  }
  return profile
}

const buildEvent = async ({
  eventType,
  targetKind,
  targetId,
  loadMode = 'native',
  launchMode = '',
  durationMs = 0,
  extra = {}
}) => {
  const meta = await getClientMeta()
  return {
    event_id: createEventId(),
    student_id: resolveStudentId(),
    device_id: ensureDeviceId(),
    event_type: eventType,
    target_kind: targetKind,
    target_id: toSafeText(targetId) || 'unknown',
    load_mode: toSafeText(loadMode) || 'native',
    launch_mode: toSafeText(launchMode),
    duration_ms: Math.max(0, Number(durationMs) || 0),
    app_version: meta.app_version,
    runtime: meta.runtime,
    platform: meta.platform,
    extra_json: JSON.stringify(extra || {}),
    occurred_at: Date.now()
  }
}

const maybeScheduleUpload = (reason = 'event') => {
  const sid = resolveStudentId()
  if (!isValidStudentId(sid)) return
  scheduleUsageUpload({ studentId: sid, reason })
}

export const setUsageTrackingStudentId = (studentId) => {
  currentStudentId = toSafeText(studentId) || 'anonymous'
}

export const trackViewNavigation = async (fromView, toView) => {
  if (!initialized) return
  const from = toSafeText(fromView)
  const to = toSafeText(toView)
  const now = Date.now()

  if (from && from !== to && activeView.id === from && activeView.startedAt > 0) {
    const durationMs = now - activeView.startedAt
    const closeEvent = await buildEvent({
      eventType: 'view_close',
      targetKind: 'view',
      targetId: from,
      loadMode: 'native',
      durationMs,
      extra: { next_view: to }
    })
    await persistEvent(closeEvent)
  }

  if (from === 'more_module_host' && to !== 'more_module_host' && activeModule.startedAt > 0) {
    const durationMs = now - activeModule.startedAt
    const moduleClose = await buildEvent({
      eventType: 'module_close',
      targetKind: 'module',
      targetId: activeModule.id,
      loadMode: activeModule.loadMode,
      launchMode: activeModule.launchMode,
      durationMs,
      extra: { next_view: to }
    })
    await persistEvent(moduleClose)
    activeModule = { id: '', loadMode: '', launchMode: '', startedAt: 0 }
  }

  if (to && to !== from) {
    const openEvent = await buildEvent({
      eventType: 'view_open',
      targetKind: 'view',
      targetId: to,
      loadMode: 'native',
      extra: { previous_view: from }
    })
    await persistEvent(openEvent)
    activeView = { id: to, startedAt: now }
    maybeScheduleUpload('view-nav')
  }
}

export const trackModuleOpen = async ({
  moduleId,
  loadMode = '',
  launchMode = '',
  moduleVersion = '',
  channel = ''
} = {}) => {
  if (!initialized) return
  const id = toSafeText(moduleId)
  if (!id) return
  const now = Date.now()
  const event = await buildEvent({
    eventType: 'module_open',
    targetKind: 'module',
    targetId: id,
    loadMode: loadMode || 'remote-site',
    launchMode,
    extra: { module_version: moduleVersion, channel }
  })
  await persistEvent(event)
  activeModule = {
    id,
    loadMode: loadMode || 'remote-site',
    launchMode: toSafeText(launchMode),
    startedAt: now
  }
  maybeScheduleUpload('module-open')
}

export const trackAppForeground = async () => {
  if (!initialized) return
  const now = Date.now()
  activeSession = { sessionId: createSessionId(), startedAt: now }
  const event = await buildEvent({
    eventType: 'app_foreground',
    targetKind: 'app',
    targetId: 'mini-hbut',
    loadMode: 'native'
  })
  await persistEvent(event)
  await upsertDeviceProfile()
}

export const trackAppBackground = async () => {
  if (!initialized) return
  const now = Date.now()
  if (activeSession.startedAt > 0 && activeSession.sessionId) {
    const meta = await getClientMeta()
    const durationMs = now - activeSession.startedAt
    await persistSession({
      session_id: activeSession.sessionId,
      student_id: resolveStudentId(),
      device_id: ensureDeviceId(),
      started_at: activeSession.startedAt,
      ended_at: now,
      duration_ms: durationMs,
      app_version: meta.app_version,
      runtime: meta.runtime,
      platform: meta.platform
    })
    const event = await buildEvent({
      eventType: 'app_background',
      targetKind: 'app',
      targetId: 'mini-hbut',
      loadMode: 'native',
      durationMs
    })
    await persistEvent(event)
    activeSession = { sessionId: '', startedAt: 0 }
    maybeScheduleUpload('app-background')
  }
}

export const initUsageTracker = ({ studentId = '' } = {}) => {
  if (studentId) setUsageTrackingStudentId(studentId)
  if (initialized) return
  initialized = true

  const onVisibility = () => {
    if (document.hidden) {
      void trackAppBackground()
      return
    }
    void trackAppForeground()
  }

  document.addEventListener('visibilitychange', onVisibility)
  if (!document.hidden) {
    void trackAppForeground()
  }
}

export const getWebUsagePendingQueues = () => ({
  events: readWebQueue(WEB_QUEUE_KEY),
  sessions: readWebQueue(WEB_SESSIONS_KEY),
  deviceProfile: (() => {
    try {
      const raw = localStorage.getItem('hbu_usage_device_profile_v1')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()
})

export const clearWebUsagePendingQueues = ({ eventIds = [], sessionIds = [] } = {}) => {
  if (eventIds.length) {
    const idSet = new Set(eventIds)
    writeWebQueue(WEB_QUEUE_KEY, readWebQueue(WEB_QUEUE_KEY).filter((item) => !idSet.has(item?.event_id)))
  }
  if (sessionIds.length) {
    const idSet = new Set(sessionIds)
    writeWebQueue(WEB_SESSIONS_KEY, readWebQueue(WEB_SESSIONS_KEY).filter((item) => !idSet.has(item?.session_id)))
  }
}

export const fetchPersonalUsageSummary = async (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid || !isTauriRuntime()) return null
  try {
    return await invokeNative('usage_stats_get_personal_summary', { studentId: sid })
  } catch {
    return null
  }
}
