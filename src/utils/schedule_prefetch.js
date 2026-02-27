import axios from 'axios'
import { fetchWithCache, getCacheKey, setCachedData } from './api.js'
import { normalizeSemesterList, resolveCurrentSemester } from './semester.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const SCHEDULE_META_KEY = 'hbu_schedule_meta'
const SCHEDULE_LOCK_KEY = 'hbu_schedule_lock'
export const SCHEDULE_POPUP_PENDING_KEY = 'hbu_schedule_popup_pending'
export const SCHEDULE_SWITCH_PENDING_KEY = 'hbu_schedule_switch_pending'
const MAX_SEMESTER_PROBE = 8

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

const courseCount = (payload) => (Array.isArray(payload?.data) ? payload.data.length : 0)

const readScheduleLockRecord = () => readJSON(SCHEDULE_LOCK_KEY, null)

export const readScheduleLock = (studentId = '') => {
  const sid = toSafeText(studentId)
  const record = readScheduleLockRecord()
  if (!record) return ''
  const lockedSid = toSafeText(record.student_id)
  if (sid && lockedSid && sid !== lockedSid) return ''
  return toSafeText(record.semester)
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
    const olderIndex = anchorIndex + offset
    if (olderIndex < list.length) {
      const sem = list[olderIndex]
      if (!seen.has(sem)) {
        seen.add(sem)
        order.push(sem)
      }
    }

    if (offset === 0) continue

    const newerIndex = anchorIndex - offset
    if (newerIndex >= 0) {
      const sem = list[newerIndex]
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
  const { data, fromCache } = await fetchWithCache(key, async () => {
    const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
      student_id: sid,
      semester: sem || undefined
    })
    return res.data
  })
  return { key, data, fromCache: !!fromCache, semester: sem }
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

export const warmupScheduleForStudent = async (studentId, options = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { success: false, error: 'missing-student-id' }
  }
  const reasonText = toSafeText(options?.reason || 'warmup')
  const existingLock = readScheduleLock(sid)
  if (existingLock && !options?.forceProbe) {
    const snapshot = getCachedScheduleSnapshot(sid, existingLock)
    if (snapshot?.data?.success) {
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

  for (const semester of limitedCandidates) {
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
        fromCache: queryResult?.fromCache
      }
    }
    if (normalized.count > 0) {
      picked = {
        semester: semester || normalized.semester,
        payload: normalized.payload,
        fromCache: queryResult?.fromCache,
        count: normalized.count
      }
      break
    }
  }

  if (!picked && firstSuccess) {
    picked = {
      semester: toSafeText(firstSuccess.semester || firstSuccess.payload?.meta?.semester),
      payload: firstSuccess.payload,
      fromCache: !!firstSuccess.fromCache,
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

  const selectedSemester = updateStoredScheduleMeta(picked.payload?.meta, picked.semester)

  // 兼容旧逻辑：同时维护学期 key 与默认 key，保证首页和通知模块读取一致。
  const scopedKey = buildScheduleCacheKey(sid, selectedSemester)
  if (scopedKey) {
    setCachedData(scopedKey, picked.payload)
  }
  setCachedData(buildScheduleCacheKey(sid), picked.payload)
  writeScheduleLock(sid, selectedSemester, reasonText)
  if (!options?.skipPopup) {
    queueScheduleSemesterPopup(sid, selectedSemester, reasonText)
  }

  return {
    success: true,
    semester: selectedSemester,
    count: courseCount(picked.payload),
    fromCache: !!picked.fromCache,
    source: picked.count > 0 ? 'nearest-with-data' : 'fallback-semester',
    payload: picked.payload
  }
}
