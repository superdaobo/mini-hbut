/**
 * 课表领域 - 学期派生/存储纯函数。
 * 原内联于 ScheduleView.vue（deriveSemesterByDate/resolveDisplayStudentId/readStoredSemester）。
 * #750：新增开学日期驱动的应选学期纯函数（resolveSemesterByStartDate）。
 */
import { SCHEDULE_META_KEY } from '../constants'

/** 按当前日期推算所在学期（9月=第一学期，3月/2月15日后=第二学期） */
export const deriveSemesterByDate = (date = new Date()): string => {
  const year = Number(date.getFullYear())
  const month = Number(date.getMonth()) + 1
  const day = Number(date.getDate())
  let academicYearStart = year - 1
  let term = 1
  if (month >= 9) {
    academicYearStart = year
    term = 1
  } else if (month >= 3) {
    academicYearStart = year - 1
    term = 2
  } else if (month === 2 && day >= 15) {
    academicYearStart = year - 1
    term = 2
  } else {
    academicYearStart = year - 1
    term = 1
  }
  return `${academicYearStart}-${academicYearStart + 1}-${term}`
}

/**
 * 解析展示用学号：优先 props.studentId；主动退出后不再回退 hbu_username；
 * 否则仅在 hbu_username 为 10 位数字时回退。
 */
export const resolveDisplayStudentId = (studentId: string): string => {
  const sid = String(studentId || '').trim()
  if (sid) return sid
  if (localStorage.getItem('hbu_manual_logout') === 'true') return ''
  const fallback = String(localStorage.getItem('hbu_username') || '').trim()
  return /^\d{10}$/.test(fallback) ? fallback : ''
}

/** 读取本地存储的学期元信息（完整 meta：semester/start_date/current_week/total_weeks 等） */
export const readStoredSemesterMeta = (): Record<string, unknown> | null => {
  try {
    const raw = localStorage.getItem(SCHEDULE_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** 读取本地存储的学期元信息中的学期键 */
export const readStoredSemester = (): string => {
  return String(readStoredSemesterMeta()?.semester || '').trim()
}

/**
 * #750 推算下一学期：term1 → 同学年 term2；term2 → 下一学年 term1。
 * 学期键格式非法返回 ''。
 */
export const getNextSemesterString = (semester: string): string => {
  const m = String(semester || '').trim().match(/^(\d{4})-(\d{4})-([12])$/)
  if (!m) return ''
  const startYear = Number(m[1])
  const endYear = Number(m[2])
  const term = Number(m[3])
  if (endYear !== startYear + 1) return ''
  if (term === 1) return `${startYear}-${endYear}-2`
  return `${endYear}-${endYear + 1}-1`
}

// ============ #750 开学日期驱动应选学期 ============

/** 提前切换窗口：开学前 3 天自动切到新学期（产品语义） */
export const SEMESTER_SWITCH_LEAD_DAYS = 3

/** 学期条目：semester 为学期键（如 2025-2026-1），start_date 为开学日（YYYY-MM-DD，可缺省） */
export interface SemesterStartDateEntry {
  semester: string
  start_date?: string | null
}

/**
 * 将 YYYY-MM-DD 解析为「本地时区当日 00:00」的 Date。
 * 仅接受日期字符串；非法输入返回 null。避免 new Date('YYYY-MM-DD') 被 UTC 解析导致的时区偏移。
 */
export const parseSemesterLocalDate = (text?: string | null): Date | null => {
  const raw = String(text || '').trim()
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  // 防御 2026-02-31 这类溢出日期（构造后回滚到 3 月）
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

const startOfDay = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * #750 时间驱动应选学期（产品语义）：
 * 「应显示学期」= 学期列表中 start_date <= 今天 + leadDays 的最近（最大 start_date）一个。
 * - 开学前 3 天进入提前窗口自动切新学期；
 * - 窗口内新学期未发布课表时，该学期仍会成为 target，由调用方保持旧学期 + 提示重探；
 * - 列表为空 / 无任何有效 start_date / 所有 start_date 均晚于窗口 → 返回 null，调用方回退现有推算链。
 * 并列 start_date 时取列表中靠前（调用方约定列表新学期在前）。
 */
export const resolveSemesterByStartDate = (
  entries: readonly (SemesterStartDateEntry | null | undefined)[],
  today: Date = new Date(),
  leadDays: number = SEMESTER_SWITCH_LEAD_DAYS
): string | null => {
  if (!Array.isArray(entries) || entries.length === 0) return null
  const baseDay = startOfDay(today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date())
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.floor(Number(leadDays))) : SEMESTER_SWITCH_LEAD_DAYS
  const cutoff = new Date(baseDay)
  cutoff.setDate(cutoff.getDate() + lead)

  let best: { semester: string; start: Date } | null = null
  for (const entry of entries) {
    const semester = String(entry?.semester || '').trim()
    if (!semester) continue
    const start = parseSemesterLocalDate(entry?.start_date)
    if (!start) continue
    if (start.getTime() > cutoff.getTime()) continue
    if (!best || start.getTime() > best.start.getTime()) {
      best = { semester, start }
    }
  }
  return best ? best.semester : null
}

/**
 * #750 判断给定开学日是否已进入提前切换窗口（start_date <= 今天 + leadDays）。
 * start_date 非法时返回 false（调用方按「窗口外/未知」处理）。
 */
export const isSemesterStartWithinLeadWindow = (
  startDate?: string | null,
  today: Date = new Date(),
  leadDays: number = SEMESTER_SWITCH_LEAD_DAYS
): boolean => {
  const start = parseSemesterLocalDate(startDate)
  if (!start) return false
  const baseDay = startOfDay(today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date())
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.floor(Number(leadDays))) : SEMESTER_SWITCH_LEAD_DAYS
  const cutoff = new Date(baseDay)
  cutoff.setDate(cutoff.getDate() + lead)
  return start.getTime() <= cutoff.getTime()
}
