/**
 * 课表领域 - 个人日程（#835）并入日历导出的纯函数层（#840）。
 *
 * 设计约束：
 * - 复用既有 ICS pipeline 与 ScheduleExportEvent DTO，本文件只把个人日程映射成
 *   与 buildCourseEvent 完全一致的字段形状（summary/start/end/location/description），
 *   不新增第二套 generator、不在此层做任何网络请求（取列表由调用方注入 fetchEvents）。
 * - 事件时间为裸本地时间字符串 `YYYY-MM-DDTHH:mm:ss`，与课程导出保持一致，
 *   时区由 Rust 侧统一按 Asia/Shanghai 处理；ICS 文本转义亦由 Rust utils/ics.rs 负责，
 *   前端只保证不丢字符。
 * - 范围过滤是硬约束：个人日程没有 semester 字段，必须落在导出范围内才纳入，禁止全量导出。
 */
import { getDateForWeekDay, resolveSemesterTotalWeeks } from './calendar'

/** 个人日程（/v2/schedule/event/list-range 返回项，仅声明导出所需字段） */
export interface PersonalScheduleEvent {
  id?: string | number | null
  title?: string | null
  date?: string | null
  start_time?: string | null
  end_time?: string | null
  location?: string | null
  note?: string | null
  reminder_minutes?: number | null
  [key: string]: any
}

/** 导出事件对象：与课程事件字段形状一致（Rust 侧 ScheduleExportEvent） */
export interface ExportEventItem {
  summary: string
  description?: string
  location?: string
  start: string
  end: string
}

/** 导出日期范围（闭区间，ISO 日期字符串 YYYY-MM-DD） */
export interface ExportDateRange {
  startDate: string
  endDate: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** 单条个人日程 → 导出事件对象；标题/日期/时间缺失或非法时返回 null（跳过而非污染 ICS） */
export const buildPersonalEventExportItem = (
  event: PersonalScheduleEvent | null | undefined
): ExportEventItem | null => {
  if (!event || typeof event !== 'object') return null
  const title = String(event.title ?? '').trim()
  const date = String(event.date ?? '').trim()
  const startTime = String(event.start_time ?? '').trim()
  const endTime = String(event.end_time ?? '').trim()
  if (!title || !ISO_DATE_RE.test(date)) return null
  if (!HH_MM_RE.test(startTime) || !HH_MM_RE.test(endTime)) return null

  // 地点/备注为空时与课程导出一致：location 省略，description 省略（行为稳定）
  const location = String(event.location ?? '').trim()
  const note = String(event.note ?? '').trim()
  return {
    summary: title,
    description: note || undefined,
    location: location || undefined,
    start: `${date}T${startTime}:00`,
    end: `${date}T${endTime}:00`
  }
}

/** 去重键：优先用日程 id；缺 id（理论上不出现）时退化为内容指纹，避免同一条日程重复导出 */
const personalEventKey = (event: PersonalScheduleEvent): string => {
  const id = String(event?.id ?? '').trim()
  if (id) return `id:${id}`
  return `fingerprint:${String(event?.date ?? '')}|${String(event?.start_time ?? '')}|${String(event?.end_time ?? '')}|${String(event?.title ?? '')}`
}

/** 开始时间升序比较（裸本地时间字符串可直接字典序比较） */
const compareByStart = (a: ExportEventItem, b: ExportEventItem): number => {
  if (a.start === b.start) return 0
  return a.start < b.start ? -1 : 1
}

/**
 * 个人日程列表 → 导出事件列表：范围过滤（闭区间）→ 去重 → 按开始时间升序。
 * 与课程事件同时段不会被裁剪，二者共存。
 */
export const buildPersonalExportEvents = (options: {
  events?: unknown
  startDate: string
  endDate: string
}): ExportEventItem[] => {
  const { events, startDate, endDate } = options || ({} as any)
  const list = Array.isArray(events) ? events : []
  const start = String(startDate || '').trim()
  const end = String(endDate || '').trim()
  if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end)) return []

  const seen = new Set<string>()
  const result: ExportEventItem[] = []
  for (const raw of list) {
    const event = raw as PersonalScheduleEvent
    const date = String(event?.date ?? '').trim()
    // 闭区间过滤：日程没有 semester 字段，只有落在导出范围内才纳入
    if (!ISO_DATE_RE.test(date) || date < start || date > end) continue
    const key = personalEventKey(event)
    if (seen.has(key)) continue
    const item = buildPersonalEventExportItem(event)
    if (!item) continue
    seen.add(key)
    result.push(item)
  }
  return result.sort(compareByStart)
}

/** 学期导出日期范围：与 buildExportEventsForSemester 共用「开学日 + 周数」推导（末日 = 第 totalWeeks 周周日） */
export const resolveSemesterDateRange = (
  startDateStr: string,
  scheduleData: any[]
): ExportDateRange | null => {
  const start = String(startDateStr || '').trim()
  if (!ISO_DATE_RE.test(start)) return null
  const totalWeeks = resolveSemesterTotalWeeks(scheduleData)
  const endDate = getDateForWeekDay(start, totalWeeks, 7)
  if (!endDate) return null
  return { startDate: start, endDate }
}

/** 周导出日期范围：优先取当前周 7 天（weekDates），缺失时按开学日 + 周次推算 */
export const resolveWeekDateRange = (options: {
  weekDates?: Array<{ iso?: string }>
  startDateStr: string
  weekNumber: number
}): ExportDateRange | null => {
  const { weekDates, startDateStr, weekNumber } = options || ({} as any)
  const isos = (Array.isArray(weekDates) ? weekDates : [])
    .map((day) => String(day?.iso ?? '').trim())
    .filter((iso) => ISO_DATE_RE.test(iso))
    .sort()
  if (isos.length) {
    return { startDate: isos[0], endDate: isos[isos.length - 1] }
  }
  const week = Number(weekNumber) || 1
  const startDate = getDateForWeekDay(String(startDateStr || ''), week, 1)
  const endDate = getDateForWeekDay(String(startDateStr || ''), week, 7)
  if (!startDate || !endDate) return null
  return { startDate, endDate }
}

/** 合并结果：events 为「课程 + 个人日程」的最终导出列表 */
export interface MergePersonalEventsResult {
  events: ExportEventItem[]
  personalEventCount: number
  personalEventsFailed: boolean
}

/**
 * 把个人日程并入课程导出列表。
 * - fetchEvents 由调用方注入（便于测试与替换数据源），本函数不直接发请求。
 * - 取日程失败只降级为「本次无日程」，课程导出照常返回（personalEventsFailed=true 供调用方记录）。
 * - 合并后按开始时间升序（课程事件本身已按周/日/节次升序，稳定排序不改变其相对顺序）。
 */
export const mergePersonalEventsIntoExport = async (options: {
  courseEvents?: ExportEventItem[]
  range?: ExportDateRange | null
  fetchEvents?: (range: ExportDateRange) => Promise<PersonalScheduleEvent[]>
}): Promise<MergePersonalEventsResult> => {
  const courseEvents = Array.isArray(options?.courseEvents) ? options.courseEvents : []
  const range = options?.range || null
  const fetchEvents = options?.fetchEvents
  if (!range || typeof fetchEvents !== 'function') {
    return { events: courseEvents, personalEventCount: 0, personalEventsFailed: false }
  }

  let rawEvents: unknown = []
  let personalEventsFailed = false
  try {
    rawEvents = await fetchEvents(range)
  } catch {
    // 取日程失败不阻断课程导出；失败事实由调用方写入日志（不打印日程内容）
    personalEventsFailed = true
  }

  const personalEvents = buildPersonalExportEvents({
    events: rawEvents,
    startDate: range.startDate,
    endDate: range.endDate
  })
  const events = [...courseEvents, ...personalEvents]
  events.sort(compareByStart)
  return { events, personalEventCount: personalEvents.length, personalEventsFailed }
}
