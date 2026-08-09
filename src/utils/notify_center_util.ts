/**
 * notify_center 常量与通用工具模块：存储 key、课时表、成绩/考试签名、
 * 课表合并等纯逻辑。通知检查在 ./notify_center_checks.ts，编排在 ./notify_center.ts。
 */
import { LONG_TTL, getCachedData } from './api.js'
import { compareSemesterDesc } from './semester.js'
import { useAppSettings } from './app_settings'
import { isCapacitorRuntime } from '../platform/native'

const RAW_API_BASE = import.meta.env.VITE_API_BASE || '/api'
const FALLBACK_API_BASE = 'https://hbut.6661111.xyz/api'
export const DEFAULT_CHANNEL_ID = 'hbut-default'
export const DEFAULT_INTERVAL_MINUTES = 30
export const MIN_INTERVAL_MINUTES = 15
export const POWER_ALERT_THRESHOLD = 10
export const NOTIFY_LAUNCH_CHECK_DELAY_MS = 7000

export const APP_BOOT_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const STORAGE_KEYS = {
  bg: 'hbu_notify_bg',
  exam: 'hbu_notify_exam',
  grade: 'hbu_notify_grade',
  power: 'hbu_notify_power',
  class: 'hbu_notify_class',
  classLeadMinutes: 'hbu_notify_class_lead_min',
  interval: 'hbu_notify_interval',
  dormSelection: 'last_dorm_selection',
  schoolInbox: 'hbu_notify_school_inbox'
}

export const CLASS_PERIOD_TIME_MAP: Record<number, { start: string; end: string }> = {
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

export const readBool = (key: string, fallback: boolean): boolean => {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

export const readInt = (key: string, fallback: number): number => {
  const raw = Number(localStorage.getItem(key) || fallback)
  if (!Number.isFinite(raw)) return fallback
  return raw
}

export const readJSON = <T = unknown>(key: string, fallback: T | null = null): T | null => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const writeJSON = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export const nowIso = (): string => new Date().toISOString()

export const toSafeText = (value: unknown): string => String(value ?? '').trim()

export const normalizeDormPathValue = (value: unknown): string => {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return String(item.value ?? item.id ?? item.label ?? item.name ?? '').trim()
  }
  return String(value ?? '').trim()
}

export const toSafeNumber = (value: unknown): number => {
  const num = Number.parseFloat(String(value ?? '').trim())
  return Number.isFinite(num) ? num : NaN
}

export const hashText = (input: unknown): string => {
  const text = String(input || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

export const parseDay = (value: unknown): Date | null => {
  const text = toSafeText(value)
  if (!text) return null
  const normalized = text.replace(/\./g, '-').replace(/\//g, '-')
  const dateOnly = normalized.includes('T') ? normalized.split('T')[0] : normalized
  const date = new Date(dateOnly)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

export const toDayKey = (date: Date | null | undefined): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const getTomorrowKey = (): string => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 1)
  return toDayKey(date)
}

export const getDormSelection = (): string[] => {
  const parsed = readJSON<unknown[]>(STORAGE_KEYS.dormSelection, [])
  if (!Array.isArray(parsed) || parsed.length !== 4) return []
  return parsed
    .map((item) => normalizeDormPathValue(item))
    .filter((item) => item !== '')
}

export interface NotifySettingsFull extends Record<string, unknown> {
  enableBackground: boolean
  enableExamReminder: boolean
  enableGradeNotice: boolean
  enablePowerNotice: boolean
  enableClassReminder: boolean
  enableSchoolInbox: boolean
  classLeadMinutes: number
  intervalMinutes: number
}

export const getNotifySettings = (): NotifySettingsFull => {
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
    enableSchoolInbox: readBool(STORAGE_KEYS.schoolInbox, true),
    classLeadMinutes,
    intervalMinutes: interval
  }
}

export const getApiBase = (): string => {
  const base = String(RAW_API_BASE || '').trim()
  if (/^https?:\/\//i.test(base)) return base
  if (isCapacitorRuntime()) {
    const fromNative = String(localStorage.getItem('hbu_bg_api_base') || '').trim()
    if (/^https?:\/\//i.test(fromNative)) return fromNative
    return FALLBACK_API_BASE
  }
  return base || '/api'
}

export const toApiUrl = (path: string): string => `${getApiBase().replace(/\/+$/, '')}${path}`

export const toMinutes = (timeText: unknown): number => {
  const text = toSafeText(timeText)
  if (!text || !text.includes(':')) return NaN
  const [h, m] = text.split(':').map((item) => Number(item))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN
  return h * 60 + m
}

export const getCurrentMinutePrecise = (): number => {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
}

export const getTodayWeekday = (): number => {
  const weekday = new Date().getDay()
  return weekday === 0 ? 7 : weekday
}

export const toPositiveInt = (value: unknown, fallback = 0): number => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return Math.floor(num)
}

export const normalizeWeeks = (weeks: unknown): number[] => {
  if (!Array.isArray(weeks)) return []
  return weeks
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

export const buildGradesSignature = (grades: unknown): string => {
  const list = Array.isArray(grades) ? grades : []
  const rows = list
    .map((item) => {
      const grade = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const term = toSafeText(grade.term)
      const name = toSafeText(grade.course_name)
      const score = toSafeText(grade.final_score)
      const credit = toSafeText(grade.course_credit)
      const teacher = toSafeText(grade.teacher)
      return `${term}|${name}|${score}|${credit}|${teacher}`
    })
    .sort()
  return `${rows.length}:${hashText(rows.join('||'))}`
}

export const pickGradePreview = (grades: unknown, limit = 6): Array<Record<string, string>> => {
  const list = Array.isArray(grades) ? [...grades] : []
  list.sort((a, b) => compareSemesterDesc(toSafeText(a?.term), toSafeText(b?.term)))
  return list.slice(0, limit).map((item) => ({
    term: toSafeText(item?.term),
    course_name: toSafeText(item?.course_name),
    final_score: toSafeText(item?.final_score),
    teacher: toSafeText(item?.teacher)
  }))
}

export interface NormalizedExam {
  course_name: string
  exam_type: string
  exam_date: string
  exam_time: string
  location: string
  seat_no: string
  is_tomorrow?: boolean
}

export const normalizeExam = (item: unknown): NormalizedExam => {
  const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
  const dateText = toSafeText(raw.exam_date || raw.date)
  const timeText = toSafeText(raw.exam_time || raw.start_time)
  return {
    course_name: toSafeText(raw.course_name),
    exam_type: toSafeText(raw.exam_type),
    exam_date: dateText,
    exam_time: timeText,
    location: toSafeText(raw.location),
    seat_no: toSafeText(raw.seat_no || raw.seat_number)
  }
}

export const pickUpcomingExams = (exams: unknown, limit = 8): NormalizedExam[] => {
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

export const buildTomorrowExamSignature = (exams: unknown): string => {
  const rows = (Array.isArray(exams) ? exams : [])
    .map((item) => {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const course = toSafeText(raw.course_name)
      const date = toSafeText(raw.exam_date)
      const time = toSafeText(raw.exam_time)
      const location = toSafeText(raw.location)
      return `${course}|${date}|${time}|${location}`
    })
    .sort()
  return `${rows.length}:${hashText(rows.join('||'))}`
}

export const snapshotKeyFor = (studentId: string): string => `hbu_notify_snapshot:${studentId}`
export const gradeSigKeyFor = (studentId: string): string => `hbu_notify_grade_signature:${studentId}`
export const examSigKeyFor = (studentId: string): string => `hbu_notify_exam_tomorrow:${studentId}`
export const powerStateKeyFor = (studentId: string, roomKey: string): string =>
  `hbu_notify_power_state:${studentId}:${roomKey}`
export const classReminderStateKeyFor = (studentId: string): string =>
  `hbu_notify_class_state:${studentId}`
export const schoolInboxStateKeyFor = (studentId: string): string =>
  `hbu_notify_school_inbox_state:${studentId}`

export const resolveLoginMode = (): string => toSafeText(localStorage.getItem('hbu_login_method'))

export const getRequestTimeoutMs = (): number => {
  try {
    const settings = useAppSettings()
    const value = Number(settings?.backend?.moduleParams?.requestTimeoutMs || 15000)
    if (!Number.isFinite(value)) return 15000
    return Math.min(60000, Math.max(5000, value))
  } catch {
    return 15000
  }
}

export const getCoursePeriodRange = (course: Record<string, unknown>): {
  startPeriod: number
  endPeriod: number
} | null => {
  const startPeriod = toPositiveInt(course?.period ?? course?.start_period, 0)
  if (startPeriod < 1 || startPeriod > 11) return null
  const endByField = toPositiveInt(course?.end_period, 0)
  const span = Math.max(1, toPositiveInt(course?.djs ?? course?.duration, 1))
  const computedEnd = endByField > 0 ? endByField : startPeriod + span - 1
  const endPeriod = Math.min(11, Math.max(startPeriod, computedEnd))
  return { startPeriod, endPeriod }
}

export const getCourseMergeSignature = (course: Record<string, unknown>): string => {
  const id = toSafeText(course?.id || '')
  const name = toSafeText(course?.name || '')
  const teacher = toSafeText(course?.teacher || '')
  const room = toSafeText(course?.room_code || course?.room || '')
  const className = toSafeText(course?.class_name || '')
  const building = toSafeText(course?.building || '')
  const custom = course?.is_custom ? '1' : '0'
  return `${id}|${name}|${teacher}|${room}|${className}|${building}|${custom}`
}

export interface MergedCourse extends Record<string, unknown> {
  startPeriod: number
  endPeriod: number
  signature: string
  room: string
  teacher: string
  name: string
  rawSpan: number
  unitSpan: number
  startClock?: string
  startMinutes?: number
}

export const getMergedTodayClasses = (
  courses: unknown,
  currentWeek: number,
  weekday: number
): MergedCourse[] => {
  const normalized = (Array.isArray(courses) ? courses : [])
    .filter((course) => {
      const raw = course && typeof course === 'object' ? (course as Record<string, unknown>) : {}
      return toPositiveInt(raw.weekday, 0) === weekday
    })
    .filter((course) => {
      const raw = course && typeof course === 'object' ? (course as Record<string, unknown>) : {}
      const weeks = normalizeWeeks(raw.weeks)
      return weeks.length === 0 || weeks.includes(currentWeek)
    })
    .map((course) => {
      const raw = course && typeof course === 'object' ? (course as Record<string, unknown>) : {}
      const range = getCoursePeriodRange(raw)
      if (!range) return null
      return {
        ...raw,
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
        signature: getCourseMergeSignature(raw),
        room: toSafeText(raw?.room_code || raw?.room || '待定教室'),
        teacher: toSafeText(raw?.teacher || ''),
        name: toSafeText(raw?.name || '未命名课程')
      } as MergedCourse
    })
    .filter((course): course is MergedCourse => course !== null)

  const signatureCount = new Map<string, number>()
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

  const merged: MergedCourse[] = []
  let i = 0
  while (i < sorted.length) {
    const current = sorted[i]
    const mergedItem: MergedCourse = { ...current }
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

export interface CourseReminderItem {
  id: string
  name: string
  teacher: string
  room: string
  weekday: number
  startPeriod: number
  endPeriod: number
  startClock: string
  minsUntilStart: number
}

export const toCourseReminderItems = (
  mergedClasses: unknown,
  leadMinutes: number
): CourseReminderItem[] => {
  const nowMinute = getCurrentMinutePrecise()
  return (Array.isArray(mergedClasses) ? mergedClasses : [])
    .map((course) => {
      const raw = course && typeof course === 'object' ? (course as Record<string, unknown>) : {}
      const startMinutes = Number(raw?.startMinutes)
      if (!Number.isFinite(startMinutes)) return null
      const minsUntilStart = startMinutes - nowMinute
      if (minsUntilStart < 0 || minsUntilStart > leadMinutes) return null
      return {
        id: `${toSafeText(raw?.signature || '')}|${raw.startPeriod}|${raw.endPeriod}`,
        name: toSafeText(raw?.name || '未命名课程'),
        teacher: toSafeText(raw?.teacher || ''),
        room: toSafeText(raw?.room_code || raw?.room || '待定教室'),
        weekday: toPositiveInt(raw?.weekday, 0),
        startPeriod: toPositiveInt(raw?.startPeriod, 0),
        endPeriod: toPositiveInt(raw?.endPeriod, 0),
        startClock: toSafeText(raw?.startClock || '--:--'),
        minsUntilStart: Math.max(0, Math.floor(minsUntilStart))
      }
    })
    .filter((item): item is CourseReminderItem => item !== null)
    .sort((a, b) => a.startPeriod - b.startPeriod)
}

export const getSchedulePayloadForReminder = (
  studentId: unknown,
  semesterHint = ''
): { data?: unknown; meta?: Record<string, unknown> } | null => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const sem = toSafeText(semesterHint)
  if (sem) {
    const scoped = getCachedData(`schedule:${sid}:${sem}`, LONG_TTL)
    if (scoped?.data) return scoped.data as { data?: unknown; meta?: Record<string, unknown> }
  }
  const global = getCachedData(`schedule:${sid}`, LONG_TTL)
  if (global?.data) return global.data as { data?: unknown; meta?: Record<string, unknown> }
  return null
}
