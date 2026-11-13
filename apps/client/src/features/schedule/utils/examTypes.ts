/**
 * 课表考试块领域模型（考试安排叠加到课表）。
 *
 * 数据来源：`POST /v2/exams`（与「考试安排」页同一接口、同一缓存 key）。
 * 该接口实测字段：`course_name` / `exam_date` / `exam_time` / `location` / `seat_no`，
 * 其中 `exam_time` 形如 `09:00-11:00`（也可能只有开始时间或为空）。
 *
 * 分层约定：
 * - 后端 / 请求层用 snake_case，前端内部一律 camelCase（本文件是唯一归一入口）；
 * - 纯函数模块：不依赖 Vue / DOM / i18n，可直接单测；
 * - 任何无法定位到「日期」的记录返回 null（课表没有日期就无法落格），
 *   缺时间的记录保留并标记 `timeTbd`，绝不静默丢失考试。
 */
import { isValidCalendarDate } from './eventTypes'

/** 考试未标注结束时间时的默认时长（分钟）：教务常规考试为 2 小时 */
export const DEFAULT_EXAM_DURATION_MINUTES = 120

/**
 * 「时间待定」考试的占位区间（08:00 - 10:00）。
 * 起点早于第一节（08:20），经 timeGeometry clamp 后卡片自然贴在当天列顶；
 * 占位取 2 小时而非 1 节，是为了让「名称 + 时间待定」在手机上仍可读，
 * 同时不冒充任何具体考试时段。
 */
export const EXAM_TIME_TBD_START_MINUTE = 8 * 60
export const EXAM_TIME_TBD_END_MINUTE = 10 * 60

/** 一天最后一分钟（23:59），用于兜底 clamp，避免跨日区间 */
const LAST_MINUTE_OF_DAY = 23 * 60 + 59

/** 课表考试块（前端 canonical，camelCase） */
export type ScheduleExam = {
  /** 稳定键：同一天同名课同时间同考场视为同一场考试 */
  id: string
  courseName: string
  /** YYYY-MM-DD */
  date: string
  /** 距 00:00 的分钟数；无法解析时间时为 null */
  startMinute: number | null
  endMinute: number | null
  /** 原始时间文本（展示兜底，例如「9:00」这类非标准写法） */
  timeText: string
  /** true = 接口没有可用时间，卡片应标注「时间待定」 */
  timeTbd: boolean
  location: string
  seatNo: string
}

/** 任意输入 → 去空白字符串；null / undefined → 空串 */
const toText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/** 取第一个有值的候选字段（兼容 snake_case / camelCase / 教务原始字段） */
const pick = (source: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key]
  }
  return undefined
}

/** 全角数字 / 冒号 / 连接符归一为半角，便于统一正则解析 */
const normalizeClockText = (value: unknown): string =>
  toText(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[～~—–－]/g, '-')

/** 从文本中提取所有 `HH:mm`（按出现顺序），非法时刻（25:00 等）直接跳过 */
const extractClocks = (text: string): number[] => {
  const clocks: number[] = []
  const pattern = /(\d{1,2})\s*:\s*(\d{2})/g
  let matched: RegExpExecArray | null
  while ((matched = pattern.exec(text)) !== null) {
    const hour = Number(matched[1])
    const minute = Number(matched[2])
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue
    clocks.push(hour * 60 + minute)
  }
  return clocks
}

/**
 * 解析考试时间文本 → 起止分钟。
 *
 * 支持：
 * - `09:00-11:00` / `09:00~11:00` / `９：００～１１：００`（全角）；
 * - `2026-07-15 09:00~11:00`（带日期前缀，只取时刻）；
 * - 只有开始时间 `09:00` → 结束 = 开始 + 默认时长；
 * - 空 / 无时刻 / 起止倒置 → null（调用方按「时间待定」处理）。
 */
export function parseExamTimeRange(
  value: unknown
): { startMinute: number; endMinute: number } | null {
  const clocks = extractClocks(normalizeClockText(value))
  if (clocks.length === 0) return null

  const startMinute = clocks[0]
  const rawEnd = clocks.length > 1 ? clocks[1] : startMinute + DEFAULT_EXAM_DURATION_MINUTES
  const endMinute = Math.min(rawEnd, LAST_MINUTE_OF_DAY)
  if (endMinute <= startMinute) return null
  return { startMinute, endMinute }
}

/**
 * 任意考试日期格式 → `YYYY-MM-DD`。
 * 支持 `2026-07-15` / `2026/7/15` / `2026.07.15`（含时间后缀也能识别日期部分）；
 * 不存在的日期（2026-02-30 等）返回空串。
 */
export function normalizeExamDate(value: unknown): string {
  const text = toText(value)
  if (!text) return ''
  const matched = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text)
  if (!matched) return ''
  const year = matched[1]
  const month = String(Number(matched[2])).padStart(2, '0')
  const day = String(Number(matched[3])).padStart(2, '0')
  const iso = `${year}-${month}-${day}`
  return isValidCalendarDate(iso) ? iso : ''
}

/**
 * `/v2/exams` 单条记录 → 课表考试块。
 *
 * 兼容字段：
 * - 前端 API 口径：`course_name` / `exam_date` / `exam_time` / `seat_no`；
 * - 后端 DTO 口径：`start_time` + `end_time` / `seat_number` / `location`；
 * - 教务原始口径：`kcmc` / `ksrq` / `kssj` / `jsmc` / `zwh`。
 *
 * 无法解析日期 → null；缺时间 → `timeTbd = true`（考试不能丢）。
 */
export function normalizeScheduleExam(raw: unknown): ScheduleExam | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>

  const date = normalizeExamDate(pick(source, ['exam_date', 'examDate', 'date', 'ksrq']))
  if (!date) return null

  const courseName = toText(pick(source, ['course_name', 'courseName', 'kcmc', 'name']))
  const location = toText(pick(source, ['location', 'place', 'room', 'jsmc', 'ksdd']))
  const seatNo = toText(pick(source, ['seat_no', 'seatNo', 'seat_number', 'zwh']))

  const rawTime = toText(pick(source, ['exam_time', 'examTime', 'kssj', 'time']))
  const startTime = toText(pick(source, ['start_time', 'startTime']))
  const endTime = toText(pick(source, ['end_time', 'endTime']))
  const timeText =
    rawTime || (startTime && endTime ? `${startTime}-${endTime}` : startTime)

  const range = parseExamTimeRange(timeText)
  const explicitId = toText(pick(source, ['id', 'exam_id', 'examId']))
  const id = explicitId || `exam:${date}:${courseName}:${timeText}:${location}`

  return {
    id,
    courseName,
    date,
    startMinute: range ? range.startMinute : null,
    endMinute: range ? range.endMinute : null,
    timeText,
    timeTbd: range === null,
    location,
    seatNo
  }
}

/** 考试是否落在给定周（`YYYY-MM-DD` 数组）内；返回 1..7，未命中返回 null */
export function examDayIndexInWeek(date: string, weekDates: string[]): number | null {
  const target = normalizeExamDate(date)
  if (!target) return null
  const dates = Array.isArray(weekDates) ? weekDates : []
  for (let index = 0; index < dates.length; index += 1) {
    if (normalizeExamDate(dates[index]) === target) return index + 1
  }
  return null
}
