/**
 * 个人日程领域模型（#836，依赖 #835 的 transport 契约）。
 *
 * 分层约定：
 * - 后端 / Tauri / HTTP Bridge 一律用 snake_case（`start_time` / `reminder_minutes` …）；
 * - 前端内部一律用本文件的 camelCase 领域模型 `ScheduleEvent`；
 * - 边界只在本文件做一次归一（normalize）与一次反归一（toScheduleEventPayload），
 *   其他模块不得再各自拼装 snake_case 字段名，避免契约漂移。
 *
 * 纯函数模块：不依赖 Vue / DOM / i18n，可直接单测。
 */
import { parseClockToMinute } from './timeGeometry'

/** 个人日程领域模型（前端 canonical，camelCase）。由 #835 transport 的 snake_case payload 归一而来。 */
export type ScheduleEvent = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  location: string
  note: string
  color: string
  reminderMinutes: number | null
  createdAt: string
  updatedAt: string
}

/** 提醒选项（V1 固定档位，`null` = 不提醒） */
export const REMINDER_OPTIONS: Array<{ value: number | null; labelKey: string }> = [
  { value: null, labelKey: 'schedule.event.reminder.none' },
  { value: 0, labelKey: 'schedule.event.reminder.atStart' },
  { value: 5, labelKey: 'schedule.event.reminder.min5' },
  { value: 10, labelKey: 'schedule.event.reminder.min10' },
  { value: 30, labelKey: 'schedule.event.reminder.min30' },
  { value: 60, labelKey: 'schedule.event.reminder.hour1' }
]

/** 允许的提醒档位（校验用；与 REMINDER_OPTIONS 同源，避免两处漂移） */
export const ALLOWED_REMINDER_MINUTES: Array<number | null> = REMINDER_OPTIONS.map(
  (option) => option.value
)

/** 任意输入 → 去空白字符串；null / undefined → 空串 */
const toText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/** 取第一个有值的候选字段（用于 snake_case / camelCase 双兼容读取） */
const pick = (source: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return undefined
}

/**
 * 严格校验 `YYYY-MM-DD`：定长 10、分隔符位置固定、月 1-12、日不超当月天数（含闰年）。
 * 与后端 `validate_schedule_event_input` 的日期规则保持一致；前端校验只做体验优化，
 * 最终判定仍以后端为准。
 */
export function isValidCalendarDate(value: unknown): boolean {
  const text = toText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const year = Number(text.slice(0, 4))
  const month = Number(text.slice(5, 7))
  const day = Number(text.slice(8, 10))
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

/** 指定年月的天数（含闰年规则） */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30
  return 31
}

/** 把 #835 transport 的 snake_case payload 归一为领域模型；关键字段非法返回 null。 */
export function normalizeScheduleEvent(payload: any): ScheduleEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const source = payload as Record<string, unknown>

  // id：兼容 event_id / eventId（列表接口与单条接口的字段名差异）
  const id = toText(pick(source, ['id', 'event_id', 'eventId']))
  if (!id) return null

  const date = toText(pick(source, ['date']))
  if (!isValidCalendarDate(date)) return null

  const startTime = toText(pick(source, ['start_time', 'startTime']))
  const endTime = toText(pick(source, ['end_time', 'endTime']))
  const startMinute = parseClockToMinute(startTime)
  const endMinute = parseClockToMinute(endTime)
  // V1 不支持跨日：起止必须都是合法 HH:mm 且 end > start
  if (startMinute === null || endMinute === null || endMinute <= startMinute) return null

  const rawReminder = pick(source, ['reminder_minutes', 'reminderMinutes'])
  const reminderNumber = Number(rawReminder)
  // 缺失 / 非数字 / 负数（后端同样拒绝）一律归一为「不提醒」
  const reminderMinutes =
    rawReminder === undefined || rawReminder === null || !Number.isFinite(reminderNumber) || reminderNumber < 0
      ? null
      : Math.trunc(reminderNumber)

  return {
    id,
    title: toText(pick(source, ['title'])),
    date,
    startTime,
    endTime,
    location: toText(pick(source, ['location'])),
    note: toText(pick(source, ['note'])),
    color: toText(pick(source, ['color'])),
    reminderMinutes,
    createdAt: toText(pick(source, ['created_at', 'createdAt'])),
    updatedAt: toText(pick(source, ['updated_at', 'updatedAt']))
  }
}

/**
 * 领域模型 → #835 请求体（snake_case）。
 *
 * 只输出日程自身字段：`student_id`（调用方上下文）与 `event_id`（update 定位用）
 * 由 composable 在提交时按 add / update 分别补充，避免本函数承担两种语义。
 */
export function toScheduleEventPayload(event: ScheduleEvent): Record<string, unknown> {
  return {
    title: event.title,
    date: event.date,
    start_time: event.startTime,
    end_time: event.endTime,
    location: event.location,
    note: event.note,
    color: event.color,
    reminder_minutes: event.reminderMinutes
  }
}
