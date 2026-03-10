import axios from 'axios'
import { LONG_TTL, getCachedData, setCachedData } from './api.js'
import { compareSemesterDesc } from './semester.js'
import {
  markScheduleSwitchPending,
  queueScheduleSemesterPopup,
  readScheduleLock
} from './schedule_prefetch.js'
import { useAppSettings } from './app_settings'
import { isCapacitorRuntime } from '../platform/native'
import { getRuntime, platformBridge } from '../platform'
import { pushDebugLog } from './debug_logger'
import {
  clearBackgroundFetchContext,
  syncBackgroundFetchContext
} from './background_fetch.js'

const RAW_API_BASE = import.meta.env.VITE_API_BASE || '/api'
const FALLBACK_API_BASE = 'https://hbut.6661111.xyz/api'
const DEFAULT_CHANNEL_ID = 'hbut-default'
const DEFAULT_INTERVAL_MINUTES = 30
const MIN_INTERVAL_MINUTES = 15
const POWER_ALERT_THRESHOLD = 10

const APP_BOOT_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const NOTIFY_SNAPSHOT_EVENT = 'hbu-notify-snapshot-updated'

const STORAGE_KEYS = {
  bg: 'hbu_notify_bg',
  exam: 'hbu_notify_exam',
  grade: 'hbu_notify_grade',
  power: 'hbu_notify_power',
  class: 'hbu_notify_class',
  classLeadMinutes: 'hbu_notify_class_lead_min',
  interval: 'hbu_notify_interval',
  dormSelection: 'last_dorm_selection'
}

const CLASS_PERIOD_TIME_MAP = {
  1: { start: '08:20', end: '09:05' },
  2: { start: '09:10', end: '09:55' },
  3: { start: '10:15', end: '11:00' },
  4: { start: '11:05', end: '11:50' },
  5: { start: '14:00', end: '14:45' },
  6: { start: '14:50', end: '15:35' },
  7: { start: '15:55', end: '16:40' },
  8: { start: '16:45', end: '17:30' },
  9: { start: '18:30', end: '19:15' },
  10: { start: '19:20', end: '20:05' },
  11: { start: '20:10', end: '20:55' }
}

const readBool = (key, fallback) => {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

const readInt = (key, fallback) => {
  const raw = Number(localStorage.getItem(key) || fallback)
  if (!Number.isFinite(raw)) return fallback
  return raw
}

const readJSON = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
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

const nowIso = () => new Date().toISOString()

const toSafeText = (value) => String(value ?? '').trim()

const toSafeNumber = (value) => {
  const num = Number.parseFloat(String(value ?? '').trim())
  return Number.isFinite(num) ? num : NaN
}

const hashText = (input) => {
  const text = String(input || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

const parseDay = (value) => {
  const text = toSafeText(value)
  if (!text) return null
  const normalized = text.replace(/\./g, '-').replace(/\//g, '-')
  const dateOnly = normalized.includes('T') ? normalized.split('T')[0] : normalized
  const date = new Date(dateOnly)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

const toDayKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getTomorrowKey = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 1)
  return toDayKey(date)
}

const getDormSelection = () => {
  const parsed = readJSON(STORAGE_KEYS.dormSelection, [])
  if (!Array.isArray(parsed) || parsed.length !== 4) return []
  return parsed.map((item) => toSafeText(item)).filter(Boolean)
}

const getNotifySettings = () => {
  const intervalRaw = readInt(STORAGE_KEYS.interval, DEFAULT_INTERVAL_MINUTES)
  const interval =
    [15, 30, 60].includes(intervalRaw) ? intervalRaw : DEFAULT_INTERVAL_MINUTES
  const classLeadRaw = readInt(STORAGE_KEYS.classLeadMinutes, 30)
  const classLeadMinutes = Math.min(120, Math.max(5, classLeadRaw))
  return {
    enableBackground: readBool(STORAGE_KEYS.bg, false),
    enableExamReminder: readBool(STORAGE_KEYS.exam, true),
    enableGradeNotice: readBool(STORAGE_KEYS.grade, true),
    enablePowerNotice: readBool(STORAGE_KEYS.power, true),
    enableClassReminder: readBool(STORAGE_KEYS.class, true),
    classLeadMinutes,
    intervalMinutes: interval
  }
}

const getApiBase = () => {
  const base = String(RAW_API_BASE || '').trim()
  if (/^https?:\/\//i.test(base)) return base
  if (isCapacitorRuntime()) {
    const fromNative = String(localStorage.getItem('hbu_bg_api_base') || '').trim()
    if (/^https?:\/\//i.test(fromNative)) return fromNative
    return FALLBACK_API_BASE
  }
  return base || '/api'
}

const toApiUrl = (path) => `${getApiBase().replace(/\/+$/, '')}${path}`

const toMinutes = (timeText) => {
  const text = toSafeText(timeText)
  if (!text || !text.includes(':')) return NaN
  const [h, m] = text.split(':').map((item) => Number(item))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN
  return h * 60 + m
}

const getCurrentMinutePrecise = () => {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
}

const getTodayWeekday = () => {
  const weekday = new Date().getDay()
  return weekday === 0 ? 7 : weekday
}

const toPositiveInt = (value, fallback = 0) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return Math.floor(num)
}

const normalizeWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return []
  return weeks
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

const buildGradesSignature = (grades) => {
  const list = Array.isArray(grades) ? grades : []
  const rows = list
    .map((item) => {
      const term = toSafeText(item.term)
      const name = toSafeText(item.course_name)
      const score = toSafeText(item.final_score)
      const credit = toSafeText(item.course_credit)
      const teacher = toSafeText(item.teacher)
      return `${term}|${name}|${score}|${credit}|${teacher}`
    })
    .sort()
  return `${rows.length}:${hashText(rows.join('||'))}`
}

const pickGradePreview = (grades, limit = 6) => {
  const list = Array.isArray(grades) ? [...grades] : []
  list.sort((a, b) => compareSemesterDesc(toSafeText(a?.term), toSafeText(b?.term)))
  return list.slice(0, limit).map((item) => ({
    term: toSafeText(item.term),
    course_name: toSafeText(item.course_name),
    final_score: toSafeText(item.final_score),
    teacher: toSafeText(item.teacher)
  }))
}

const normalizeExam = (item) => {
  const dateText = toSafeText(item?.exam_date || item?.date)
  const timeText = toSafeText(item?.exam_time || item?.start_time)
  return {
    course_name: toSafeText(item?.course_name),
    exam_type: toSafeText(item?.exam_type),
    exam_date: dateText,
    exam_time: timeText,
    location: toSafeText(item?.location),
    seat_no: toSafeText(item?.seat_no || item?.seat_number)
  }
}

const pickUpcomingExams = (exams, limit = 8) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const normalized = (Array.isArray(exams) ? exams : []).map(normalizeExam)

  const upcoming = normalized
    .filter((item) => {
      const day = parseDay(item.exam_date)
      if (!day) return true
      return day >= today
    })
    .sort((a, b) => {
      const da = parseDay(a.exam_date)
      const db = parseDay(b.exam_date)
      const ta = da?.getTime() || Number.MAX_SAFE_INTEGER
      const tb = db?.getTime() || Number.MAX_SAFE_INTEGER
      return ta - tb
    })

  const tomorrowKey = getTomorrowKey()
  return upcoming.slice(0, limit).map((item) => ({
    ...item,
    is_tomorrow: toDayKey(parseDay(item.exam_date)) === tomorrowKey
  }))
}

const buildTomorrowExamSignature = (exams) => {
  const rows = (Array.isArray(exams) ? exams : [])
    .map((item) => {
      const course = toSafeText(item.course_name)
      const date = toSafeText(item.exam_date)
      const time = toSafeText(item.exam_time)
      const location = toSafeText(item.location)
      return `${course}|${date}|${time}|${location}`
    })
    .sort()
  return `${rows.length}:${hashText(rows.join('||'))}`
}

const snapshotKeyFor = (studentId) => `hbu_notify_snapshot:${studentId}`
const gradeSigKeyFor = (studentId) => `hbu_notify_grade_signature:${studentId}`
const examSigKeyFor = (studentId) => `hbu_notify_exam_tomorrow:${studentId}`
const powerStateKeyFor = (studentId, roomKey) => `hbu_notify_power_state:${studentId}:${roomKey}`
const classReminderStateKeyFor = (studentId) => `hbu_notify_class_state:${studentId}`

const getRequestTimeoutMs = () => {
  try {
    const settings = useAppSettings()
    const value = Number(settings?.backend?.moduleParams?.requestTimeoutMs || 15000)
    if (!Number.isFinite(value)) return 15000
    return Math.min(60000, Math.max(5000, value))
  } catch {
    return 15000
  }
}

const emitSnapshotUpdate = (snapshot) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NOTIFY_SNAPSHOT_EVENT, { detail: snapshot }))
}

const getStoredSnapshot = (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  return readJSON(snapshotKeyFor(sid), null)
}

const setStoredSnapshot = (studentId, snapshot) => {
  const sid = toSafeText(studentId)
  if (!sid || !snapshot) return
  writeJSON(snapshotKeyFor(sid), snapshot)
}

const ensureNotifyReady = async (allowPrompt = false) => {
  let permission = 'prompt'
  try {
    permission = await platformBridge.getNotificationPermission()
  } catch {
    return false
  }
  if (permission !== 'granted' && allowPrompt) {
    try {
      permission = await platformBridge.requestNotificationPermission()
    } catch {
      permission = 'denied'
    }
  }
  if (permission !== 'granted') return false
  try {
    await platformBridge.ensureNotificationChannel(DEFAULT_CHANNEL_ID)
  } catch {
    // ignore
  }
  return true
}

const sendQueuedNotifications = async (queue, allowPrompt = false) => {
  if (!Array.isArray(queue) || queue.length === 0) return []
  const canNotify = await ensureNotifyReady(allowPrompt)
  if (!canNotify) return []

  const sent = []
  for (let i = 0; i < queue.length; i += 1) {
    const notice = queue[i]
    if (!notice?.title) continue
    try {
      const ok = await platformBridge.sendLocalNotification({
        channelId: DEFAULT_CHANNEL_ID,
        title: notice.title,
        body: notice.body || '',
        id: Math.floor(Date.now() / 1000) + i
      })
      if (ok) sent.push(notice)
    } catch {
      // ignore single notification error
    }
  }
  return sent
}

const refreshScheduleSilently = async (studentId) => {
  const timeoutMs = getRequestTimeoutMs()
  try {
    const res = await axios.post(
      toApiUrl('/v2/schedule/query'),
      { student_id: studentId },
      { timeout: timeoutMs }
    )
    const data = res?.data
    if (!data?.success) {
      return {
        success: false,
        error: toSafeText(data?.error || '课表刷新失败')
      }
    }
    const incomingSemester = toSafeText(data?.meta?.semester)
    const total = Array.isArray(data.data) ? data.data.length : 0
    const lockedSemester = readScheduleLock(studentId)

    setCachedData(`schedule:${studentId}`, data)
    if (incomingSemester) {
      setCachedData(`schedule:${studentId}:${incomingSemester}`, data)
    }

    const hasSwitchableNewSemester =
      !!lockedSemester &&
      !!incomingSemester &&
      incomingSemester !== lockedSemester &&
      total > 0

    if (hasSwitchableNewSemester) {
      // 仅标记“下次进入课表自动切换”，避免当前会话立即抖动。
      markScheduleSwitchPending(studentId, incomingSemester, 'notify-background')
      queueScheduleSemesterPopup(studentId, incomingSemester, 'new-semester')
    } else if (data?.meta) {
      const semesterForMeta = lockedSemester || incomingSemester
      localStorage.setItem(
        'hbu_schedule_meta',
        JSON.stringify({
          semester: semesterForMeta,
          start_date: toSafeText(data.meta.start_date),
          current_week: Number(data.meta.current_week || 0)
        })
      )
    }

    return {
      success: true,
      total,
      semester: incomingSemester,
      current_week: Number(data?.meta?.current_week || 0),
      locked_semester: lockedSemester,
      pending_switch: hasSwitchableNewSemester
    }
  } catch (error) {
    return {
      success: false,
      error: toSafeText(error?.message || error || '课表刷新失败')
    }
  }
}

const checkGrades = async (studentId, settings, queue) => {
  const timeoutMs = getRequestTimeoutMs()
  try {
    const res = await axios.post(
      toApiUrl('/v2/quick_fetch'),
      { student_id: studentId },
      { timeout: timeoutMs }
    )
    const data = res?.data
    if (!data?.success) {
      return {
        success: false,
        total: 0,
        changed: false,
        latestItems: [],
        error: toSafeText(data?.error || '成绩检查失败')
      }
    }

    setCachedData(`grades:${studentId}`, data)
    const grades = Array.isArray(data.data) ? data.data : []
    const signature = buildGradesSignature(grades)
    const sigKey = gradeSigKeyFor(studentId)
    const prevSignature = toSafeText(localStorage.getItem(sigKey))
    const changed = !!prevSignature && prevSignature !== signature

    localStorage.setItem(sigKey, signature)

    if (changed && settings.enableGradeNotice) {
      queue.push({
        title: '成绩有更新',
        body: `检测到新的成绩变动，共 ${grades.length} 条成绩记录，请进入应用查看详情。`
      })
    }

    return {
      success: true,
      total: grades.length,
      changed,
      latestItems: pickGradePreview(grades, 6),
      signature
    }
  } catch (error) {
    return {
      success: false,
      total: 0,
      changed: false,
      latestItems: [],
      error: toSafeText(error?.message || error || '成绩检查失败')
    }
  }
}

const checkExams = async (studentId, settings, queue) => {
  const timeoutMs = getRequestTimeoutMs()
  try {
    const res = await axios.post(
      toApiUrl('/v2/exams'),
      { student_id: studentId, semester: '' },
      { timeout: timeoutMs }
    )
    const data = res?.data
    if (!data?.success) {
      return {
        success: false,
        total: 0,
        upcoming: [],
        tomorrowCount: 0,
        error: toSafeText(data?.error || '考试检查失败')
      }
    }

    setCachedData(`exams:${studentId}:current`, data)

    const exams = Array.isArray(data.data) ? data.data : []
    const upcoming = pickUpcomingExams(exams, 8)
    const tomorrow = upcoming.filter((item) => item.is_tomorrow)
    const tomorrowKey = getTomorrowKey()
    const tomorrowSignature = buildTomorrowExamSignature(tomorrow)
    const persisted = readJSON(examSigKeyFor(studentId), {})
    const shouldNotify =
      settings.enableExamReminder &&
      tomorrow.length > 0 &&
      (
        toSafeText(persisted?.day) !== tomorrowKey ||
        toSafeText(persisted?.signature) !== tomorrowSignature
      )

    if (shouldNotify) {
      queue.push({
        title: '考试提醒',
        body:
          tomorrow.length === 1
            ? `明天有考试：${toSafeText(tomorrow[0].course_name)}`
            : `明天共有 ${tomorrow.length} 门考试，请提前做好准备。`
      })
    }

    writeJSON(examSigKeyFor(studentId), {
      day: tomorrowKey,
      signature: tomorrowSignature,
      updated_at: nowIso()
    })

    return {
      success: true,
      total: exams.length,
      upcoming,
      tomorrowCount: tomorrow.length
    }
  } catch (error) {
    return {
      success: false,
      total: 0,
      upcoming: [],
      tomorrowCount: 0,
      error: toSafeText(error?.message || error || '考试检查失败')
    }
  }
}

const checkElectricity = async (studentId, settings, queue, launchCheck = false) => {
  const timeoutMs = getRequestTimeoutMs()
  const selectedPath = getDormSelection()
  if (selectedPath.length !== 4) {
    return {
      success: false,
      configured: false,
      selectedPath: [],
      error: '未设置宿舍房间，请先在电费模块选择房间。'
    }
  }

  const [area_id, building_id, layer_id, room_id] = selectedPath
  const roomKey = selectedPath.join('-')
  const powerStateKey = powerStateKeyFor(studentId, roomKey)

  try {
    const res = await axios.post(
      toApiUrl('/v2/electricity/balance'),
      {
        area_id,
        building_id,
        layer_id,
        room_id,
        student_id: studentId
      },
      { timeout: timeoutMs }
    )
    const data = res?.data
    if (!data?.success) {
      return {
        success: false,
        configured: true,
        selectedPath,
        error: toSafeText(data?.error || '电费检查失败')
      }
    }

    const quantity = toSafeNumber(data.quantity)
    const balance = toSafeNumber(data.balance)
    const isLow = Number.isFinite(quantity) && quantity < POWER_ALERT_THRESHOLD
    const state = readJSON(powerStateKey, {})

    // 低电提醒去重策略：
    // 1) 启动检查（launchCheck=true）每次 App 启动最多提醒一次；
    // 2) 定时检查只在“从不低电 -> 低电”状态转变时提醒，避免重复打扰。
    let shouldNotify = false
    if (settings.enablePowerNotice && isLow) {
      if (launchCheck) {
        shouldNotify = toSafeText(state?.last_launch_boot) !== APP_BOOT_ID
      } else {
        shouldNotify = !state?.was_low
      }
    }

    if (shouldNotify) {
      queue.push({
        title: '电费不足提醒',
        body: `当前宿舍剩余电量 ${Number.isFinite(quantity) ? quantity.toFixed(2) : data.quantity} 度，已低于 ${POWER_ALERT_THRESHOLD} 度，请及时充值。`
      })
    }

    writeJSON(powerStateKey, {
      was_low: isLow,
      last_quantity: Number.isFinite(quantity) ? quantity : null,
      last_balance: Number.isFinite(balance) ? balance : null,
      last_launch_boot:
        launchCheck && isLow && settings.enablePowerNotice ? APP_BOOT_ID : toSafeText(state?.last_launch_boot),
      last_notified_at:
        shouldNotify ? nowIso() : toSafeText(state?.last_notified_at),
      updated_at: nowIso()
    })

    return {
      success: true,
      configured: true,
      selectedPath,
      quantity: Number.isFinite(quantity) ? quantity : null,
      balance: Number.isFinite(balance) ? balance : null,
      status: toSafeText(data.status),
      isLow,
      sync_time: toSafeText(data.sync_time)
    }
  } catch (error) {
    return {
      success: false,
      configured: true,
      selectedPath,
      error: toSafeText(error?.message || error || '电费检查失败')
    }
  }
}

const getSchedulePayloadForReminder = (studentId, semesterHint = '') => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const sem = toSafeText(semesterHint)
  if (sem) {
    const scoped = getCachedData(`schedule:${sid}:${sem}`, LONG_TTL)
    if (scoped?.data) return scoped.data
  }
  const global = getCachedData(`schedule:${sid}`, LONG_TTL)
  if (global?.data) return global.data
  return null
}

const getCoursePeriodRange = (course) => {
  const startPeriod = toPositiveInt(course?.period ?? course?.start_period, 0)
  if (startPeriod < 1 || startPeriod > 11) return null
  const endByField = toPositiveInt(course?.end_period, 0)
  const span = Math.max(1, toPositiveInt(course?.djs ?? course?.duration, 1))
  const computedEnd = endByField > 0 ? endByField : startPeriod + span - 1
  const endPeriod = Math.min(11, Math.max(startPeriod, computedEnd))
  return { startPeriod, endPeriod }
}

const getCourseMergeSignature = (course) => {
  const id = toSafeText(course?.id || '')
  const name = toSafeText(course?.name || '')
  const teacher = toSafeText(course?.teacher || '')
  const room = toSafeText(course?.room_code || course?.room || '')
  const className = toSafeText(course?.class_name || '')
  const building = toSafeText(course?.building || '')
  const custom = course?.is_custom ? '1' : '0'
  return `${id}|${name}|${teacher}|${room}|${className}|${building}|${custom}`
}

const getMergedTodayClasses = (courses, currentWeek, weekday) => {
  const normalized = (Array.isArray(courses) ? courses : [])
    .filter((course) => toPositiveInt(course?.weekday, 0) === weekday)
    .filter((course) => {
      const weeks = normalizeWeeks(course?.weeks)
      return weeks.length === 0 || weeks.includes(currentWeek)
    })
    .map((course) => {
      const range = getCoursePeriodRange(course)
      if (!range) return null
      return {
        ...course,
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
        signature: getCourseMergeSignature(course),
        room: toSafeText(course?.room_code || course?.room || '待定教室'),
        teacher: toSafeText(course?.teacher || ''),
        name: toSafeText(course?.name || '未命名课程')
      }
    })
    .filter(Boolean)

  const signatureCount = new Map()
  normalized.forEach((course) => {
    signatureCount.set(course.signature, (signatureCount.get(course.signature) || 0) + 1)
  })

  const sorted = normalized
    .map((course) => {
      const rawSpan = Math.max(1, course.endPeriod - course.startPeriod + 1)
      const duplicateCount = Number(signatureCount.get(course.signature) || 0)
      const unitSpan = course.is_custom ? rawSpan : (duplicateCount > 1 ? 1 : rawSpan)
      const endPeriod = Math.min(11, course.startPeriod + unitSpan - 1)
      return {
        ...course,
        rawSpan,
        unitSpan,
        endPeriod
      }
    })
    .sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod)

  const merged = []
  let i = 0
  while (i < sorted.length) {
    const current = sorted[i]
    const mergedItem = { ...current }
    let j = i + 1
    while (j < sorted.length) {
      const next = sorted[j]
      if (
        mergedItem.unitSpan === 1 &&
        next.unitSpan === 1 &&
        next.signature === mergedItem.signature &&
        next.startPeriod === mergedItem.endPeriod + 1
      ) {
        mergedItem.endPeriod = next.endPeriod
        j += 1
      } else {
        break
      }
    }
    const slot = CLASS_PERIOD_TIME_MAP[mergedItem.startPeriod]
    const startClock = slot?.start || '--:--'
    mergedItem.startClock = startClock
    mergedItem.startMinutes = toMinutes(startClock)
    merged.push(mergedItem)
    i = j
  }
  return merged
}

const toCourseReminderItems = (mergedClasses, leadMinutes) => {
  const nowMinute = getCurrentMinutePrecise()
  return (Array.isArray(mergedClasses) ? mergedClasses : [])
    .map((course) => {
      const startMinutes = Number(course?.startMinutes)
      if (!Number.isFinite(startMinutes)) return null
      const minsUntilStart = startMinutes - nowMinute
      if (minsUntilStart < 0 || minsUntilStart > leadMinutes) return null
      return {
        id: `${toSafeText(course?.signature || '')}|${course.startPeriod}|${course.endPeriod}`,
        name: toSafeText(course?.name || '未命名课程'),
        teacher: toSafeText(course?.teacher || ''),
        room: toSafeText(course?.room_code || course?.room || '待定教室'),
        weekday: toPositiveInt(course?.weekday, 0),
        startPeriod: toPositiveInt(course?.startPeriod, 0),
        endPeriod: toPositiveInt(course?.endPeriod, 0),
        startClock: toSafeText(course?.startClock || '--:--'),
        minsUntilStart: Math.max(0, Math.floor(minsUntilStart))
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.startPeriod - b.startPeriod)
}

const checkClassReminder = async (studentId, settings, queue, scheduleResult) => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return {
      success: false,
      enabled: false,
      totalToday: 0,
      triggered: 0,
      reason: 'missing-student-id'
    }
  }

  if (!settings.enableClassReminder) {
    return {
      success: true,
      enabled: false,
      totalToday: 0,
      triggered: 0
    }
  }

  const semesterHint = toSafeText(scheduleResult?.semester)
  const payload = getSchedulePayloadForReminder(sid, semesterHint)
  const courses = Array.isArray(payload?.data) ? payload.data.slice() : []
  const semesterForCustom = toSafeText(payload?.meta?.semester || semesterHint)
  if (semesterForCustom) {
    try {
      const customRes = await axios.post(
        toApiUrl('/v2/schedule/custom/list'),
        { student_id: sid, semester: semesterForCustom },
        { timeout: getRequestTimeoutMs() }
      )
      if (customRes?.data?.success && Array.isArray(customRes?.data?.data)) {
        courses.push(...customRes.data.data.map((item) => ({ ...item, is_custom: true })))
      }
    } catch {
      // ignore custom fetch error
    }
  }
  const currentWeek =
    toPositiveInt(payload?.meta?.current_week, 0) ||
    toPositiveInt(readJSON('hbu_schedule_meta', {})?.current_week, 1) ||
    1
  const weekday = getTodayWeekday()
  const leadMinutes = Math.min(120, Math.max(5, Number(settings.classLeadMinutes || 30)))
  const todayKey = toDayKey(new Date())
  const todayClasses = getMergedTodayClasses(courses, currentWeek, weekday)
  const candidates = toCourseReminderItems(todayClasses, leadMinutes)
  const nowMinute = getCurrentMinutePrecise()
  const nextUpcomingCourse = todayClasses
    .filter((course) => Number.isFinite(course?.startMinutes) && course.startMinutes >= nowMinute)
    .sort((a, b) => a.startPeriod - b.startPeriod)[0] || null

  const stateKey = classReminderStateKeyFor(sid)
  const state = readJSON(stateKey, {})
  const sentIds = state?.day === todayKey && Array.isArray(state?.sent_ids)
    ? state.sent_ids.map((item) => toSafeText(item)).filter(Boolean)
    : []
  const sentSet = new Set(sentIds)
  const toNotify = candidates.filter((item) => !sentSet.has(item.id))

  toNotify.forEach((item) => {
    const suffix = item.teacher ? `，授课教师 ${item.teacher}` : ''
    const leadText = item.minsUntilStart > 0 ? `${item.minsUntilStart} 分钟后` : '即将'
    queue.push({
      title: '上课提醒',
      body: `${leadText}开始：${item.name}（${item.startClock}，${item.room}${suffix}）`
    })
  })

  const nextCourse = candidates[0] || null
  const nextIds = [...sentSet, ...toNotify.map((item) => item.id)]
  writeJSON(stateKey, {
    day: todayKey,
    sent_ids: nextIds.slice(-120),
    updated_at: nowIso()
  })

  pushDebugLog(
    'Notify',
    `上课提醒检查完成 total=${todayClasses.length} trigger=${toNotify.length} lead=${leadMinutes}min`,
    'debug',
    {
      semester: semesterHint,
      currentWeek,
      weekday
    }
  )

  return {
    success: true,
    enabled: true,
    totalToday: todayClasses.length,
    triggered: toNotify.length,
    leadMinutes,
    currentWeek,
    nextCourse: (nextUpcomingCourse || nextCourse)
      ? {
          name: toSafeText((nextUpcomingCourse || nextCourse)?.name || ''),
          room: toSafeText((nextUpcomingCourse || nextCourse)?.room || ''),
          teacher: toSafeText((nextUpcomingCourse || nextCourse)?.teacher || ''),
          startClock: toSafeText((nextUpcomingCourse || nextCourse)?.startClock || ''),
          minsUntilStart: Number.isFinite(Number((nextUpcomingCourse || nextCourse)?.minsUntilStart))
            ? Number((nextUpcomingCourse || nextCourse).minsUntilStart)
            : Math.max(0, Math.floor(Number((nextUpcomingCourse || nextCourse)?.startMinutes || nowMinute) - nowMinute))
        }
      : null
  }
}

export const runNotificationCheck = async ({
  studentId,
  launchCheck = false,
  reason = 'manual',
  allowPermissionPrompt = false
} = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) return null

  const settings = getNotifySettings()
  const dormSelection = getDormSelection()

  if (isCapacitorRuntime()) {
    await syncBackgroundFetchContext({
      studentId: sid,
      settings,
      dormSelection
    })
  }

  const shouldRun =
    launchCheck || reason === 'manual' || reason === 'resume' || settings.enableBackground
  const checkedAt = nowIso()

  if (!shouldRun) {
    const fallbackSnapshot = getStoredSnapshot(sid)
    if (fallbackSnapshot) return fallbackSnapshot
    return {
      studentId: sid,
      checkedAt,
      runtime: 'idle',
      skipped: true,
      settings,
      schedule: { success: false, error: '后台检查未启用' },
      grades: { success: false, total: 0, changed: false, latestItems: [] },
      exams: { success: false, total: 0, upcoming: [], tomorrowCount: 0 },
      classReminder: {
        success: false,
        enabled: !!settings.enableClassReminder,
        totalToday: 0,
        triggered: 0
      },
      electricity: {
        success: false,
        configured: false,
        selectedPath: dormSelection,
        error: '后台检查未启用'
      },
      notifications: { queued: 0, sent: 0, items: [] }
    }
  }

  const queue = []
  pushDebugLog('Notify', `开始通知检查 reason=${reason} launch=${launchCheck ? '1' : '0'}`, 'info', {
    studentId: sid,
    settings
  })

  // 核心检查流程：课表静默刷新 + 成绩变更 + 考试提醒 + 电费实时监控。
  const [schedule, grades, exams, electricity] = await Promise.all([
    refreshScheduleSilently(sid),
    checkGrades(sid, settings, queue),
    checkExams(sid, settings, queue),
    checkElectricity(sid, settings, queue, launchCheck)
  ])
  const classReminder = await checkClassReminder(sid, settings, queue, schedule)

  const sent = await sendQueuedNotifications(queue, allowPermissionPrompt)
  pushDebugLog(
    'Notify',
    `通知检查完成 queue=${queue.length} sent=${sent.length}`,
    'info',
    {
      studentId: sid,
      reason,
      classTriggered: classReminder?.triggered || 0
    }
  )

  const snapshot = {
    studentId: sid,
    checkedAt,
    runtime: getRuntime(),
    reason,
    launchCheck,
    settings,
    schedule,
    grades,
    exams,
    classReminder,
    electricity,
    notifications: {
      queued: queue.length,
      sent: sent.length,
      items: sent
    }
  }

  setStoredSnapshot(sid, snapshot)
  emitSnapshotUpdate(snapshot)
  return snapshot
}

let monitorTimer = null
let monitorStudentId = ''
let monitorChecking = false
let monitorResumeListener = null
let monitorOnUpdate = null

const clearResumeListener = async () => {
  if (!monitorResumeListener) return
  try {
    await monitorResumeListener.remove()
  } catch {
    // ignore
  }
  monitorResumeListener = null
}

const monitorCheck = async ({ launchCheck = false, reason = 'interval' } = {}) => {
  if (!monitorStudentId || monitorChecking) return null
  monitorChecking = true
  try {
    const snapshot = await runNotificationCheck({
      studentId: monitorStudentId,
      launchCheck,
      reason,
      allowPermissionPrompt: false
    })
    if (typeof monitorOnUpdate === 'function' && snapshot) {
      monitorOnUpdate(snapshot)
    }
    return snapshot
  } finally {
    monitorChecking = false
  }
}

export const startNotificationMonitor = async ({ studentId, onUpdate } = {}) => {
  const sid = toSafeText(studentId)
  await stopNotificationMonitor()
  if (!sid) return false

  monitorStudentId = sid
  monitorOnUpdate = typeof onUpdate === 'function' ? onUpdate : null

  const settings = getNotifySettings()
  if (isCapacitorRuntime()) {
    await syncBackgroundFetchContext({
      studentId: sid,
      settings,
      dormSelection: getDormSelection()
    })
    try {
      const keepAlive = await platformBridge.setAggressiveKeepAlive(!!settings.enableBackground)
      pushDebugLog('Notify', `移动端前台服务状态 active=${keepAlive.active ? '1' : '0'}`, 'debug', keepAlive)
    } catch (error) {
      pushDebugLog('Notify', '移动端前台服务切换失败', 'warn', error)
    }
  }
  const intervalMinutes = Math.max(
    MIN_INTERVAL_MINUTES,
    Number(settings.intervalMinutes || DEFAULT_INTERVAL_MINUTES)
  )

  // 定时轮询：间隔来自通知设置页；启动时会立即做一次 launch 检查。
  monitorTimer = window.setInterval(() => {
    monitorCheck({ launchCheck: false, reason: 'interval' }).catch(() => {})
  }, intervalMinutes * 60 * 1000)
  pushDebugLog('Notify', `通知轮询已启动 interval=${intervalMinutes}min`, 'info', { studentId: sid })

  await monitorCheck({ launchCheck: true, reason: 'app-launch' })

  if (isCapacitorRuntime()) {
    try {
      const mod = await import('@capacitor/app')
      monitorResumeListener = await mod.App.addListener('appStateChange', (state) => {
        if (state?.isActive) {
          monitorCheck({ launchCheck: false, reason: 'resume' }).catch(() => {})
        }
      })
    } catch {
      // ignore
    }
  }

  return true
}

export const stopNotificationMonitor = async () => {
  if (monitorTimer) {
    window.clearInterval(monitorTimer)
    monitorTimer = null
  }
  await clearResumeListener()
  monitorStudentId = ''
  monitorChecking = false
  monitorOnUpdate = null
  pushDebugLog('Notify', '通知轮询已停止', 'debug')
  if (isCapacitorRuntime()) {
    try {
      await platformBridge.setAggressiveKeepAlive(false)
    } catch {
      // ignore
    }
    await clearBackgroundFetchContext()
  }
}

export const getLastNotifySnapshot = (studentId) => getStoredSnapshot(studentId)

export const getNotificationMonitorSettings = () => getNotifySettings()
