/**
 * #834 时间画布适配器：领域记录 → 统一渲染输入 ScheduleTimelineItem。
 *
 * 本层只做「字段归一 + 节次→真实分钟」换算，不参与布局（lane 分配属 #837），
 * 也不产出像素坐标（坐标由 timeGeometry.ts 负责）。
 *
 * 安全策略：任何无法换算的记录一律返回 null（不进入渲染），绝不返回半成品。
 */
import { getCourseRealInterval, parseClockToMinute } from './timeGeometry'
import type { ScheduleTimeSlot, ScheduleTimelineItem } from './timelineTypes'

/** 把任意输入归一为合法星期序号（1..7）；非法返回 null */
const normalizeDayIndex = (value: unknown): number | null => {
  const day = Number(value)
  if (!Number.isFinite(day)) return null
  const truncated = Math.trunc(day)
  if (truncated < 1 || truncated > 7) return null
  return truncated
}

/** 把任意输入归一为非空字符串；空则返回 undefined */
const toOptionalText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

/**
 * 从日期串中提取 `月-日` 规范化键（去掉前导零），用于跨格式比对。
 * 例：'2026-08-31' / '2026/08/31' / '08-31' → '8-31'；无法解析返回 null。
 */
const toMonthDayKey = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  if (text.length === 0) return null
  const matched = /(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})/.exec(text)
  let month: number
  let day: number
  if (matched) {
    // 形如 YYYY-MM-DD：取后两段为月、日
    month = Number(matched[2])
    day = Number(matched[3])
  } else {
    // 形如 MM-DD
    const short = /^(\d{1,2})\D+(\d{1,2})$/.exec(text)
    if (!short) return null
    month = Number(short[1])
    day = Number(short[2])
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${month}-${day}`
}

/**
 * 课程（教务 official / 自定义 custom-course）→ TimelineItem。
 *
 * - 节次 → 真实起止分钟：跨节次取末节 end（中间课间不等长，不能按时长累加）；
 * - dayIndex 优先取入参；入参非法时回退 course.weekday；两者都非法 → null；
 * - 无法换算时间（节次越界到不可解析等）→ null。
 */
export function courseToTimelineItem(
  course: any,
  dayIndex: number,
  source: 'official' | 'custom-course',
  timeSchedule: ScheduleTimeSlot[]
): ScheduleTimelineItem | null {
  if (!course || typeof course !== 'object') return null

  const day = normalizeDayIndex(dayIndex) ?? normalizeDayIndex(course.weekday)
  if (day === null) return null

  const interval = getCourseRealInterval(
    Number(course.period),
    Number(course.djs),
    timeSchedule
  )
  if (interval === null) return null

  const title = toOptionalText(course.name) ?? ''
  const subtitle = [toOptionalText(course.teacher), toOptionalText(course.room_code ?? course.room)]
    .filter((part): part is string => !!part)
    .join(' · ')
  const id =
    toOptionalText(course._uid ?? course.id ?? course.source_id) ??
    `${source}:${day}:${interval.startMinute}:${interval.endMinute}:${title}`

  return {
    id,
    kind: 'course',
    dayIndex: day,
    startMinute: interval.startMinute,
    endMinute: interval.endMinute,
    title,
    subtitle: subtitle.length > 0 ? subtitle : undefined,
    color: toOptionalText(course.color),
    source,
    raw: course
  }
}

/**
 * 个人日程 → TimelineItem。
 *
 * - `date` 未命中 `weekDates`（即不属于当前渲染周）→ null，不进入当前周渲染；
 * - `weekDates` 缺失/为空时，才回退使用 `dayIndexHint`（便于单日视图等场景）；
 * - `startTime`/`endTime` 非法或 `startTime >= endTime` → null。
 */
export function eventToTimelineItem(
  event: {
    id: string
    title: string
    date: string
    startTime: string
    endTime: string
    location?: string
    color?: string
  },
  weekDates: string[],
  dayIndexHint?: number
): ScheduleTimelineItem | null {
  if (!event || typeof event !== 'object') return null

  const startMinute = parseClockToMinute(event.startTime)
  const endMinute = parseClockToMinute(event.endTime)
  if (startMinute === null || endMinute === null) return null
  // 起止倒置或零长度均视为非法
  if (endMinute <= startMinute) return null

  const dates = Array.isArray(weekDates) ? weekDates : []
  const eventKey = toMonthDayKey(event.date)

  let day: number | null = null
  if (eventKey !== null) {
    for (let i = 0; i < dates.length; i += 1) {
      if (toMonthDayKey(dates[i]) === eventKey) {
        day = i + 1
        break
      }
    }
  }
  // weekDates 缺失/为空（如单日视图）时才回退 hint；日期存在但未命中 → 明确不渲染
  if (day === null && dates.length === 0) {
    day = normalizeDayIndex(dayIndexHint)
  }
  if (day === null) return null

  const title = toOptionalText(event.title) ?? ''
  const id = toOptionalText(event.id) ?? `personal-event:${day}:${startMinute}:${endMinute}:${title}`

  return {
    id,
    kind: 'event',
    dayIndex: day,
    startMinute,
    endMinute,
    title,
    subtitle: toOptionalText(event.location),
    color: toOptionalText(event.color),
    source: 'personal-event',
    raw: event
  }
}
