/**
 * 导出中心的个人日程纯函数。
 *
 * 与 ICS 共用“按绝对日期范围”原则，但这里保留 JSON/长图需要的业务字段，
 * 不把日程伪装成课程，也不生成 ICS DTO。
 */
import { normalizeScheduleEvent, type ScheduleEvent } from './eventTypes'
import type { ExportDateRange } from './calendarEvents'

export interface ExportCenterPersonalEvent {
  id: string
  title: string
  date: string
  start_time: string
  end_time: string
  location: string
  note: string
  color: string
  reminder_minutes: number | null
  created_at: string
  updated_at: string
}

export const toExportCenterPersonalEvent = (
  value: unknown
): ExportCenterPersonalEvent | null => {
  const event = normalizeScheduleEvent(value)
  if (!event || !event.title) return null
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    start_time: event.startTime,
    end_time: event.endTime,
    location: event.location,
    note: event.note,
    color: event.color,
    reminder_minutes: event.reminderMinutes,
    created_at: event.createdAt,
    updated_at: event.updatedAt
  }
}

const compareEvent = (a: ExportCenterPersonalEvent, b: ExportCenterPersonalEvent): number =>
  a.date.localeCompare(b.date) ||
  a.start_time.localeCompare(b.start_time) ||
  a.end_time.localeCompare(b.end_time) ||
  a.id.localeCompare(b.id)

/**
 * 规范化 + 范围过滤 + 跨学期去重。
 * seenIds 由调用方在多学期循环中共享，避免边界配置异常时同一日程进入多个分组。
 */
export const collectExportCenterPersonalEvents = (options: {
  events: unknown
  range: ExportDateRange
  seenIds?: Set<string>
}): ExportCenterPersonalEvent[] => {
  const list = Array.isArray(options?.events) ? options.events : []
  const range = options?.range
  const seenIds = options?.seenIds || new Set<string>()
  if (!range?.startDate || !range?.endDate) return []

  const output: ExportCenterPersonalEvent[] = []
  for (const raw of list) {
    const event = toExportCenterPersonalEvent(raw)
    if (!event) continue
    if (event.date < range.startDate || event.date > range.endDate) continue
    if (seenIds.has(event.id)) continue
    seenIds.add(event.id)
    output.push(event)
  }
  return output.sort(compareEvent)
}

export const personalEventTimeLabel = (
  event: Pick<ScheduleEvent, 'startTime' | 'endTime'> | ExportCenterPersonalEvent
): string => {
  const raw = event as ExportCenterPersonalEvent & Partial<ScheduleEvent>
  const start = String(raw.start_time || raw.startTime || '').trim()
  const end = String(raw.end_time || raw.endTime || '').trim()
  return start && end ? `${start}–${end}` : start || end
}
