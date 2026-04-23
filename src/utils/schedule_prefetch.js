import axios from 'axios'
import { fetchWithCache, getCacheKey, setCachedData } from './api.js'
import { normalizeSemesterList, resolveCurrentSemester, semesterIsNewer } from './semester.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const SCHEDULE_META_KEY = 'hbu_schedule_meta'
const SCHEDULE_LOCK_KEY = 'hbu_schedule_lock'
const SCHEDULE_RENDER_SNAPSHOT_SCHEMA = 1
const SCHEDULE_RENDER_SNAPSHOT_PREFIX = 'hbu_schedule_render_snapshot_v1'
export const SCHEDULE_POPUP_PENDING_KEY = 'hbu_schedule_popup_pending'
export const SCHEDULE_SWITCH_PENDING_KEY = 'hbu_schedule_switch_pending'
const MAX_SEMESTER_PROBE = 8
const MANUAL_SCHEDULE_LOCK_REASON = 'manual-select'
const AUTO_SCHEDULE_LOCK_REASONS = new Set([
  '',
  'warmup',
  'first-enter',
  'schedule-fetch',
  'pending-switch',
  'notify-background',
  'fallback-semester',
  'locked-cache'
])

const toSafeText = (value) => String(value ?? '').trim()

const toPositiveInt = (value, fallback = 1) => {
  const num = Number(value || 0)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return Math.floor(num)
}

const readJSON = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const readScheduleMeta = () => {
  return readJSON(SCHEDULE_META_KEY, {})
}

export const updateStoredScheduleMeta = (meta, fallbackSemester = '') => {
  const cached = readScheduleMeta()
  const semester = toSafeText(meta?.semester || fallbackSemester || cached?.semester)
  const startDate = toSafeText(meta?.start_date || cached?.start_date)
  const week = toPositiveInt(meta?.current_week || cached?.current_week, 1)
  const totalWeeks = toPositiveInt(meta?.total_weeks || cached?.total_weeks, 25)
  const vacationNotice = toSafeText(meta?.vacation_notice || cached?.vacation_notice)
  localStorage.setItem(
    SCHEDULE_META_KEY,
    JSON.stringify({
      semester,
      start_date: startDate,
      current_week: week,
      total_weeks: totalWeeks,
      vacation_notice: vacationNotice
    })
  )
  return semester
}

export const buildScheduleCacheKey = (studentId, semester = '') => {
  const sid = toSafeText(studentId)
  const sem = toSafeText(semester)
  if (!sid) return ''
  return sem ? `schedule:${sid}:${sem}` : `schedule:${sid}`
}

const buildScheduleRenderSnapshotKey = (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) return ''
  return `${SCHEDULE_RENDER_SNAPSHOT_PREFIX}:${sid}`
}

const normalizeScheduleRenderSnapshot = (raw, studentId = '', semester = '') => {
  if (!raw || typeof raw !== 'object') return null
  const sid = toSafeText(raw.student_id || studentId)
  const sem = toSafeText(raw.semester)
  if (!sid || !sem) return null
  if (studentId && sid !== toSafeText(studentId)) return null
  if (semester && sem !== toSafeText(semester)) return null
  const schemaVersion = Number(raw.schema_version || 0)
  if (schemaVersion !== SCHEDULE_RENDER_SNAPSHOT_SCHEMA) return null

  return {
    schema_version: SCHEDULE_RENDER_SNAPSHOT_SCHEMA,
    student_id: sid,
    semester: sem,
    meta: raw.meta && typeof raw.meta === 'object'
      ? {
          semester: toSafeText(raw.meta.semester || sem),
          start_date: toSafeText(raw.meta.start_date),
          current_week: toPositiveInt(raw.meta.current_week, 1),
          total_weeks: toPositiveInt(raw.meta.total_weeks, 25),
          vacation_notice: toSafeText(raw.meta.vacation_notice)
        }
      : {
          semester: sem,
          start_date: '',
          current_week: 1,
          total_weeks: 25,
          vacation_notice: ''
        },
    selected_week: toPositiveInt(raw.selected_week, 1),
    sync_time: toSafeText(raw.sync_time),
    offline: !!raw.offline,
    remote_schedule_data: Array.isArray(raw.remote_schedule_data) ? raw.remote_schedule_data : [],
    custom_schedule_data: Array.isArray(raw.custom_schedule_data) ? raw.custom_schedule_data : [],
    merged_schedule_data: Array.isArray(raw.merged_schedule_data) ? raw.merged_schedule_data : [],
    updated_at: toSafeText(raw.updated_at)
  }
}

export const readScheduleRenderSnapshot = (studentId, semester = '') => {
  const key = buildScheduleRenderSnapshotKey(studentId)
  if (!key) return null
  const raw = readJSON(key, null)
  return normalizeScheduleRenderSnapshot(raw, studentId, semester)
}

export const hasScheduleRenderSnapshot = (studentId, semester = '') => {
  return !!readScheduleRenderSnapshot(studentId, semester)
}

export const writeScheduleRenderSnapshot = (studentId, snapshot) => {
  const normalized = normalizeScheduleRenderSnapshot(
    {
      schema_version: SCHEDULE_RENDER_SNAPSHOT_SCHEMA,
      ...snapshot,
      student_id: toSafeText(snapshot?.student_id || studentId)
    },
    studentId
  )
  if (!normalized) return null
  const key = buildScheduleRenderSnapshotKey(normalized.student_id)
  if (!key) return null
  writeJSON(key, normalized)
  return normalized
}

export const clearScheduleRenderSnapshot = (studentId = '') => {
  const key = buildScheduleRenderSnapshotKey(studentId)
  if (!key) return false
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

const courseCount = (payload) => (Array.isArray(payload?.data) ? payload.data.length : 0)

const readScheduleLockRecord = () => readJSON(SCHEDULE_LOCK_KEY, null)

const normalizeScheduleLockRecord = (record) => {
  if (!record || typeof record !== 'object') return null
  const semester = toSafeText(record.semester)
  if (!semester) return null
  const student_id = toSafeText(record.student_id)
  const reason = toSafeText(record.reason)
  const at = Number(record.at || 0)
  return {
    student_id,
    semester,
    reason,
    at: Number.isFinite(at) && at > 0 ? at : 0
  }
}

export const isAutoScheduleLockReason = (reason = '') => {
  const text = toSafeText(reason)
  if (text === MANUAL_SCHEDULE_LOCK_REASON) return false
  return AUTO_SCHEDULE_LOCK_REASONS.has(text)
}

export const readScheduleLockDetail = (studentId = '') => {
  const sid = toSafeText(studentId)
  const record = normalizeScheduleLockRecord(readScheduleLockRecord())
  if (!record) return null
  if (sid && record.student_id && sid !== record.student_id) return null
  return record
}

export const readScheduleLock = (studentId = '') => {
  const record = readScheduleLockDetail(studentId)
  return record?.semester || ''
}

export const clearScheduleLock = (studentId = '') => {
  const sid = toSafeText(studentId)
  const record = normalizeScheduleLockRecord(readScheduleLockRecord())
  if (!record) return false
  if (sid && record.student_id && sid !== record.student_id) return false
  try {
    localStorage.removeItem(SCHEDULE_LOCK_KEY)
    return true
  } catch {
    return false
  }
}

export const writeScheduleLock = (studentId, semester, reason = 'manual') => {
  const sid = toSafeText(studentId)
  const sem = toSafeText(semester)
  if (!sid || !sem) return ''
  writeJSON(SCHEDULE_LOCK_KEY, {
    student_id: sid,
    semester: sem,
    reason: toSafeText(reason),
    at: Date.now()
  })
  return sem
}

export const markScheduleSwitchPending = (studentId, semester, reason = 'background') => {
  const sid = toSafeText(studentId)
  const sem = toSafeText(semester)
  if (!sid || !sem) return
  writeJSON(SCHEDULE_SWITCH_PENDING_KEY, {
    student_id: sid,
    semester: sem,
    reason: toSafeText(reason),
    at: Date.now()
  })
}

export const consumeScheduleSwitchPending = (studentId = '') => {
  const sid = toSafeText(studentId)
  const record = readJSON(SCHEDULE_SWITCH_PENDING_KEY, null)
  if (!record) return ''
  const targetSid = toSafeText(record.student_id)
  if (sid && targetSid && sid !== targetSid) return ''
  localStorage.removeItem(SCHEDULE_SWITCH_PENDING_KEY)
  return toSafeText(record.semester)
}

export const queueScheduleSemesterPopup = (studentId, semester, reason = 'warmup') => {
  const sid = toSafeText(studentId)
  const sem = toSafeText(semester)
  if (!sid || !sem) return
  writeJSON(SCHEDULE_POPUP_PENDING_KEY, {
    student_id: sid,
    semester: sem,
    reason: toSafeText(reason),
    at: Date.now()
  })
}

const parseCacheEntry = (cacheKey) => {
  const raw = localStorage.getItem(getCacheKey(cacheKey))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.data) return null
    return {
      data: parsed.data,
      timestamp: Number(parsed.timestamp) || Date.now()
    }
  } catch {
    return null
  }
}

export const getCachedScheduleSnapshot = (studentId, semester = '') => {
  const sid = toSafeText(studentId)
  const sem = toSafeText(semester)
  if (!sid) return null

  const scopedKey = sem ? buildScheduleCacheKey(sid, sem) : ''
  if (scopedKey) {
    const scoped = parseCacheEntry(scopedKey)
    if (scoped) return { ...scoped, key: scopedKey, semester: sem }
  }

  const fallbackKey = buildScheduleCacheKey(sid)
  const fallback = parseCacheEntry(fallbackKey)
  if (fallback) return { ...fallback, key: fallbackKey, semester: sem }
  return null
}

const buildNearestSemesterOrder = (semesterList, anchorSemester = '') => {
  const list = normalizeSemesterList(semesterList)
  if (!list.length) return []

  const anchor = toSafeText(anchorSemester)
  const anchorIndex = anchor ? list.indexOf(anchor) : -1
  if (anchorIndex < 0) return list

  const order = []
  const seen = new Set()

  for (let offset = 0; order.length < list.length; offset += 1) {
    if (offset === 0) {
      const sem = list[anchorIndex]
      if (!seen.has(sem)) {
        seen.add(sem)
        order.push(sem)
      }
      continue
    }

    // 先查更新的学期，再查更旧的学期（用户更关心即将到来的课表）
    const newerIndex = anchorIndex - offset
    if (newerIndex >= 0) {
      const sem = list[newerIndex]
      if (!seen.has(sem)) {
        seen.add(sem)
        order.push(sem)
      }
    }

    const olderIndex = anchorIndex + offset
    if (olderIndex < list.length) {
      const sem = list[olderIndex]
      if (!seen.has(sem)) {
        seen.add(sem)
        order.push(sem)
      }
    }
  }

  return order
}

const querySchedule = async (studentId, semester = '') => {
  const sid = toSafeText(studentId)
  const sem = toSafeText(semester)
  const key = buildScheduleCacheKey(sid, sem)
  if (!key) return null
  const { data, fromCache, stale } = await fetchWithCache(key, async () => {
    const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
      student_id: sid,
      semester: sem || undefined
    })
    return res.data
  })
  return { key, data, fromCache: !!fromCache, stale: !!stale, semester: sem }
}

const normalizeSemesterPayload = (payload) => {
  if (!payload?.success) return null
  return {
    success: true,
    semester: toSafeText(payload?.meta?.semester),
    count: courseCount(payload),
    payload
  }
}

const isAuthoritativeSchedulePayload = (payload, queryResult) => {
  if (!payload?.success) return false
  if (payload?.offline) return false
  if (queryResult?.fromCache || queryResult?.stale) return false
  return true
}

export const warmupScheduleForStudent = async (studentId, options = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { success: false, error: 'missing-student-id' }
  }
  const reasonText = toSafeText(options?.reason || 'warmup')
  const existingLock = readScheduleLock(sid)
  if (existingLock && !options?.forceProbe) {
    const snapshot = getCachedScheduleSnapshot(sid, existingLock)
    if (snapshot?.data?.success && !snapshot?.data?.offline) {
      return {
        success: true,
        semester: existingLock,
        count: courseCount(snapshot.data),
        fromCache: true,
        source: 'locked-cache',
        payload: snapshot.data
      }
    }
  }

  const preferredSemester = toSafeText(options?.preferredSemester)
  const cachedMeta = readScheduleMeta()
  const cachedSemester = toSafeText(cachedMeta?.semester)

  let semesterList = []
  let currentSemester = ''
  try {
    const semesterRes = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    })
    const semesterData = semesterRes?.data
    if (semesterData?.success) {
      semesterList = normalizeSemesterList(semesterData?.semesters || [])
      currentSemester = toSafeText(semesterData?.current)
    }
  } catch {
    semesterList = []
  }

  const anchorSemester = resolveCurrentSemester(
    semesterList,
    preferredSemester || currentSemester || cachedSemester
  )

  const orderedCandidates = buildNearestSemesterOrder(semesterList, anchorSemester)
  const limitedCandidates = orderedCandidates.slice(0, MAX_SEMESTER_PROBE)

  let firstSuccess = null
  let picked = null
  let extraNewerChecks = 0
  const MAX_EXTRA_NEWER = 2

  for (const semester of limitedCandidates) {
    // anchor 学期自身有课 → 直接采用，不再探测
    if (picked && picked.semester === anchorSemester) break
    // 已找到非 anchor 有课学期 → 只继续探测更新的学期（最多 MAX_EXTRA_NEWER 次）
    if (picked) {
      if (!semesterIsNewer(semester, picked.semester)) continue
      if (extraNewerChecks >= MAX_EXTRA_NEWER) continue
      extraNewerChecks++
    }

    let queryResult = null
    try {
      queryResult = await querySchedule(sid, semester)
    } catch {
      continue
    }
    const payload = queryResult?.data
    if (payload?.need_login) {
      return { success: false, need_login: true, error: 'need-login' }
    }
    const normalized = normalizeSemesterPayload(payload)
    if (!normalized) continue

    if (!firstSuccess) {
      firstSuccess = {
        semester: semester || normalized.semester,
        payload: normalized.payload,
        fromCache: queryResult?.fromCache,
        stale: queryResult?.stale
      }
    }
    if (normalized.count > 0) {
      picked = {
        semester: semester || normalized.semester,
        payload: normalized.payload,
        fromCache: queryResult?.fromCache,
        stale: queryResult?.stale,
        count: normalized.count
      }
    }
  }

  if (!picked && firstSuccess) {
    picked = {
      semester: toSafeText(firstSuccess.semester || firstSuccess.payload?.meta?.semester),
      payload: firstSuccess.payload,
      fromCache: !!firstSuccess.fromCache,
      stale: !!firstSuccess.stale,
      count: courseCount(firstSuccess.payload)
    }
  }

  if (!picked) {
    try {
      const fallback = await querySchedule(sid, '')
      const normalized = normalizeSemesterPayload(fallback?.data)
      if (normalized) {
        picked = {
          semester: normalized.semester || anchorSemester || cachedSemester,
          payload: normalized.payload,
          fromCache: fallback?.fromCache,
          stale: fallback?.stale,
          count: normalized.count
        }
      }
    } catch {
      picked = null
    }
  }

  if (!picked?.payload?.success) {
    return {
      success: false,
      semester: anchorSemester || cachedSemester,
      error: 'schedule-warmup-failed'
    }
  }

  const authoritative = isAuthoritativeSchedulePayload(picked.payload, picked)
  const previousStoredSemester = cachedSemester
  const payloadSemester = toSafeText(picked.payload?.meta?.semester || picked.semester)
  let selectedSemester = payloadSemester || previousStoredSemester || anchorSemester
  if (authoritative || !previousStoredSemester) {
    selectedSemester = updateStoredScheduleMeta(picked.payload?.meta, selectedSemester)
  }

  // 兼容旧逻辑：同时维护学期 key 与默认 key，保证首页和通知模块读取一致。
  const scopedKey = buildScheduleCacheKey(sid, payloadSemester || selectedSemester)
  if (scopedKey) {
    setCachedData(scopedKey, picked.payload)
  }
  setCachedData(buildScheduleCacheKey(sid), picked.payload)
  if (authoritative || options?.forceLock) {
    writeScheduleLock(sid, selectedSemester, reasonText)
  } else {
    const lockDetail = readScheduleLockDetail(sid)
    if (lockDetail && isAutoScheduleLockReason(lockDetail.reason)) {
      clearScheduleLock(sid)
    }
  }
  if (!options?.skipPopup) {
    queueScheduleSemesterPopup(sid, selectedSemester, reasonText)
  }

  return {
    success: true,
    semester: selectedSemester,
    count: courseCount(picked.payload),
    fromCache: !!picked.fromCache,
    stale: !!picked.stale,
    authoritative,
    source: picked.count > 0 ? 'nearest-with-data' : 'fallback-semester',
    payload: picked.payload
  }
}
