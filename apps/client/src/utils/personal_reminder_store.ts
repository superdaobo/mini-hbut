/**
 * 个人日程提醒取数（#839，Epic #833）
 *
 * 只负责「按当前学生 + 未来滚动窗口」读取个人日程（#835 的 list-range 契约），
 * 供 local_reminder_scheduler 的 reconcileLocalReminders 构建提醒计划使用。
 *
 * 失败降级原则：本模块任何异常都静默返回空数组——提醒取数失败绝不能阻断
 * 日程 CRUD 主流程，也不能影响课程/考试提醒的登记。
 */
import { invokeNative, isTauriRuntime } from '../platform/native'
import { toDayKey, toSafeText } from './notify_center_util.js'
import type { PersonalReminderEvent } from './personal_reminder_plan'

/** 后端 list-range 单条日程 payload（#835 字段白名单，snake_case） */
interface ScheduleEventPayload {
  id?: unknown
  title?: unknown
  date?: unknown
  start_time?: unknown
  end_time?: unknown
  location?: unknown
  reminder_minutes?: unknown
  /** 后端会返回 note，但提醒链路不读取它（隐私：不进通知、不进日志） */
  note?: unknown
}

export interface PersonalReminderFetchOptions {
  studentId: string
  /** 当前时刻，用于推算窗口日期范围 */
  now: Date
  /** 滚动窗口天数；由调用方传入（与课程/考试共用同一窗口，避免两处默认值漂移） */
  windowDays: number
}

/** 把后端 payload 归一为提醒计划输入；reminder_minutes 非数字时视为「不提醒」 */
const toReminderEvent = (raw: ScheduleEventPayload): PersonalReminderEvent => {
  const minutesRaw = raw?.reminder_minutes
  const minutes = minutesRaw === null || minutesRaw === undefined ? null : Number(minutesRaw)
  return {
    id: toSafeText(raw?.id),
    title: toSafeText(raw?.title),
    date: toSafeText(raw?.date),
    startTime: toSafeText(raw?.start_time),
    endTime: toSafeText(raw?.end_time),
    location: toSafeText(raw?.location),
    reminderMinutes: minutes !== null && Number.isFinite(minutes) ? minutes : null
  }
}

/**
 * 读取窗口内个人日程（闭区间 今天 ~ 今天 + windowDays，YYYY-MM-DD）。
 * Tauri 分支参数名为驼峰（studentId / startDate / endDate），与 schedule_event.ts 一致；
 * 非 Tauri 运行时没有本地日程库，直接返回空数组（提醒静默降级）。
 */
export const listPersonalReminderEvents = async (
  options: PersonalReminderFetchOptions
): Promise<PersonalReminderEvent[]> => {
  try {
    const studentId = toSafeText(options?.studentId)
    if (!studentId) return []
    if (!isTauriRuntime()) return []

    const now =
      options?.now instanceof Date && !Number.isNaN(options.now.getTime()) ? options.now : new Date()
    const daysRaw = Number(options?.windowDays)
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.floor(daysRaw) : 0

    const start = new Date(now.getTime())
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + days * 86400000)

    const payload = await invokeNative('list_schedule_events_range', {
      studentId,
      startDate: toDayKey(start),
      endDate: toDayKey(end)
    })
    const result =
      payload && typeof payload === 'object' ? (payload as { success?: unknown; data?: unknown }) : {}
    if (result.success === false || !Array.isArray(result.data)) return []
    return (result.data as ScheduleEventPayload[]).map(toReminderEvent)
  } catch {
    // 命令不可用 / 数据库异常 / 非 Tauri：静默降级为空，绝不向调用方抛错
    return []
  }
}
