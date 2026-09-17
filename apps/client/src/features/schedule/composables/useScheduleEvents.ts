/**
 * 个人日程（#836）表单状态与 CRUD 组合式函数。
 *
 * 与 `useScheduleEditor.ts` 的课程逻辑**并列而不混入**：课程表单对象
 * （`addCourseForm`）仍由 useScheduleEditor 独占，本函数只维护日程草稿，
 * 两者互不覆盖——统一创建器里「课程填一半切日程再切回」不会丢内容。
 *
 * 职责边界：
 * - 负责：日程草稿、校验、add/update/delete 提交、与课程/其他日程的冲突提示；
 * - 不负责：Grid 渲染（#837）、提醒调度（#839）、ICS 导出（#840）。
 *
 * 冲突判定复用 #834 `utils/timeGeometry.ts` 的 `intervalsOverlap` /
 * `getCourseRealInterval`，本模块不自建第二套重叠算法；冲突**只做 warning**，
 * 永不阻止提交。
 */
import { ref } from 'vue'
import axios from 'axios'
import { t } from '../../../utils/app_i18n'
import { courseThemes, timeSchedule } from '../constants'
import {
  MINUTES_PER_DAY,
  getCourseRealInterval,
  intervalsOverlap,
  parseClockToMinute
} from '../utils/timeGeometry'
import {
  ALLOWED_REMINDER_MINUTES,
  isValidCalendarDate,
  normalizeScheduleEvent,
  toScheduleEventPayload,
  type ScheduleEvent
} from '../utils/eventTypes'
import type { ScheduleConfirmDialog } from './useConfirmDialog'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleSemester } from './useScheduleSemester'

/** 日程草稿（创建 / 编辑共用的扁平表单状态） */
export type ScheduleEventDraft = {
  title: string
  date: string
  startTime: string
  endTime: string
  location: string
  note: string
  color: string
  reminderMinutes: number | null
}

/** 打开创建器时的预填参数（仅覆盖合法字段，非法值一律回退默认值） */
export type ScheduleEventPrefill = Partial<ScheduleEventDraft>

/** 冲突条目：来源标题 + 来源占用区间（分钟） */
export type ScheduleEventConflict = {
  label: string
  startMinute: number
  endMinute: number
}

/** 冲突判定上下文；省略时课程取当前课表数据、其他日程取空列表 */
export interface ScheduleEventConflictContext {
  /** 当前周课表课程（official + custom），字段含 weekday / period / djs / name */
  courses?: any[]
  /** 其他日程（由调用方提供，编辑态请用 excludeEventId 排除自身） */
  events?: ScheduleEvent[]
  /** 编辑态排除自身，避免与自己判为冲突 */
  excludeEventId?: string
}

export interface ScheduleEventsOptions {
  props: any
  semester: ScheduleSemester
  data: ScheduleData
  /** 删除前确认弹窗（与 useScheduleEditor 共用同一实例；缺省时跳过确认直接删） */
  confirmDialog?: ScheduleConfirmDialog
  /** 日程变更成功后的刷新回调（父组件负责重拉当前周日程 / 刷新网格） */
  onChanged?: () => void | Promise<void>
}

/** 日程默认开始时间 */
export const DEFAULT_EVENT_START = '09:00'
/** 日程默认结束时间（保证 end > start） */
export const DEFAULT_EVENT_END = '10:00'
/** 日程默认颜色：取课表主题首色描边，保证卡片有稳定可见色 */
export const DEFAULT_EVENT_COLOR = courseThemes[0]?.border || '#72b9ff'

/** 分钟数 → `HH:mm`；非有限数返回空串，越界钳制到 [00:00, 23:59] */
export const formatMinuteToClock = (minute: number): string => {
  if (!Number.isFinite(minute)) return ''
  const clamped = Math.min(Math.max(Math.trunc(minute), 0), MINUTES_PER_DAY - 1)
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/** 今天（本地时区）的 `YYYY-MM-DD` */
const todayIso = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** `YYYY-MM-DD` → 星期序号 1..7（周日 = 7）；非法日期返回 null */
const weekdayIndexOfDate = (date: string): number | null => {
  if (!isValidCalendarDate(date)) return null
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const day = parsed.getDay()
  return day === 0 ? 7 : day
}

/**
 * 保证草稿起止合法：`startTime` 非法 → 回退默认档；`endTime` 非法或不晚于
 * `startTime` → 回退为「开始时间 + 1 小时」（23:00 后钳制到 23:59；若仍不满足
 * 则整体回退默认档）。用于预填与默认值两条路径，保证不变量 `end > start`。
 */
const withGuaranteedOrder = (
  startTime: string,
  endTime: string
): { startTime: string; endTime: string } => {
  const startMinute = parseClockToMinute(startTime)
  if (startMinute === null) {
    return { startTime: DEFAULT_EVENT_START, endTime: DEFAULT_EVENT_END }
  }
  const endMinute = parseClockToMinute(endTime)
  if (endMinute !== null && endMinute > startMinute) {
    return { startTime, endTime }
  }
  const fallbackEnd = Math.min(startMinute + 60, MINUTES_PER_DAY - 1)
  if (fallbackEnd <= startMinute) {
    return { startTime: DEFAULT_EVENT_START, endTime: DEFAULT_EVENT_END }
  }
  return { startTime, endTime: formatMinuteToClock(fallbackEnd) }
}

export const useScheduleEvents = (options: ScheduleEventsOptions) => {
  const { props, semester, data, confirmDialog, onChanged } = options

  const eventDraft = ref<ScheduleEventDraft>({
    title: '',
    date: '',
    startTime: DEFAULT_EVENT_START,
    endTime: DEFAULT_EVENT_END,
    location: '',
    note: '',
    color: DEFAULT_EVENT_COLOR,
    reminderMinutes: null
  })
  const eventError = ref('')
  const savingEvent = ref(false)
  const deletingEvent = ref(false)
  /** 非空表示当前处于编辑态（提交走 update） */
  const editingEventId = ref('')

  const API_BASE = import.meta.env.VITE_API_BASE || '/api'

  /**
   * 默认日期：当前选中周内的今天；当前周不含今天（含 weekDates 为空）时取该周第一天，
   * 仍无法确定则回退系统今天。不做任何隐私数据推断。
   */
  const pickDefaultEventDate = (): string => {
    const days = semester?.weekDates?.value
    if (Array.isArray(days) && days.length > 0) {
      const today = days.find((day: any) => day?.isToday && isValidCalendarDate(day?.iso))
      if (today) return String(today.iso)
      const first = days.find((day: any) => isValidCalendarDate(day?.iso))
      if (first) return String(first.iso)
    }
    return todayIso()
  }

  /** 重置为创建态草稿；`overrides` 只接受合法值，非法值回退默认（不变量 end > start） */
  const resetEventDraft = (overrides: ScheduleEventPrefill = {}) => {
    const date = isValidCalendarDate(overrides.date) ? String(overrides.date) : pickDefaultEventDate()
    const order = withGuaranteedOrder(
      typeof overrides.startTime === 'string' ? overrides.startTime : DEFAULT_EVENT_START,
      typeof overrides.endTime === 'string' ? overrides.endTime : DEFAULT_EVENT_END
    )
    // 预填只接受固定档位，非法值（含 undefined / 任意数字）一律回落「不提醒」
    const reminder = overrides.reminderMinutes
    eventDraft.value = {
      title: typeof overrides.title === 'string' ? overrides.title : '',
      date,
      startTime: order.startTime,
      endTime: order.endTime,
      location: typeof overrides.location === 'string' ? overrides.location : '',
      note: typeof overrides.note === 'string' ? overrides.note : '',
      color: typeof overrides.color === 'string' && overrides.color.trim() ? overrides.color.trim() : DEFAULT_EVENT_COLOR,
      reminderMinutes: reminder !== undefined && ALLOWED_REMINDER_MINUTES.includes(reminder) ? reminder : null
    }
    eventError.value = ''
    editingEventId.value = ''
  }

  /** 编辑态回填：归一失败（缺 id / 非法时间等）返回 false，不污染当前草稿 */
  const populateEventDraft = (event: any): boolean => {
    const normalized = normalizeScheduleEvent(event)
    if (!normalized) return false
    eventDraft.value = {
      title: normalized.title,
      date: normalized.date,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      location: normalized.location,
      note: normalized.note,
      color: normalized.color || DEFAULT_EVENT_COLOR,
      reminderMinutes: normalized.reminderMinutes
    }
    editingEventId.value = normalized.id
    eventError.value = ''
    return true
  }

  /**
   * 表单校验：返回错误文案的 i18n key；通过时返回空串。
   * 前端校验只做体验优化，最终判定以后端为准（后端已做同样的严格校验）。
   */
  const validateEventDraft = (): string => {
    const draft = eventDraft.value
    if (!String(draft?.title || '').trim()) return 'schedule.event.titleRequired'
    const date = String(draft?.date || '').trim()
    if (!date) return 'schedule.event.dateRequired'
    if (!isValidCalendarDate(date)) return 'schedule.event.dateInvalid'
    const startMinute = parseClockToMinute(String(draft?.startTime || ''))
    const endMinute = parseClockToMinute(String(draft?.endTime || ''))
    if (startMinute === null || endMinute === null) return 'schedule.event.timeInvalid'
    if (endMinute <= startMinute) return 'schedule.event.endBeforeStart'
    const reminder = draft?.reminderMinutes ?? null
    if (!ALLOWED_REMINDER_MINUTES.includes(reminder)) return 'schedule.event.reminderInvalid'
    return ''
  }

  /**
   * 计算草稿与课程 / 其他日程的时间冲突（半开区间，首尾相接不算冲突）。
   * 仅作提示，调用方不得据此阻止提交。
   */
  const conflictsOf = (
    draft: ScheduleEventDraft = eventDraft.value,
    context: ScheduleEventConflictContext = {}
  ): ScheduleEventConflict[] => {
    const date = String(draft?.date || '').trim()
    const weekday = weekdayIndexOfDate(date)
    const startMinute = parseClockToMinute(String(draft?.startTime || ''))
    const endMinute = parseClockToMinute(String(draft?.endTime || ''))
    if (weekday === null || startMinute === null || endMinute === null || endMinute <= startMinute) {
      return []
    }

    const untitled = t('schedule.event.untitled')
    const conflicts: ScheduleEventConflict[] = []

    const courses = Array.isArray(context.courses) ? context.courses : data?.scheduleData?.value ?? []
    for (const course of courses) {
      if (Number(course?.weekday) !== weekday) continue
      const interval = getCourseRealInterval(Number(course?.period), Number(course?.djs), timeSchedule)
      if (!interval) continue
      if (!intervalsOverlap(startMinute, endMinute, interval.startMinute, interval.endMinute)) continue
      conflicts.push({
        label: String(course?.name || '').trim() || untitled,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute
      })
    }

    const excludeId = String(context.excludeEventId || '').trim()
    const events = Array.isArray(context.events) ? context.events : []
    for (const item of events) {
      if (!item) continue
      if (excludeId && String(item.id) === excludeId) continue
      if (String(item.date || '') !== date) continue
      const itemStart = parseClockToMinute(String(item.startTime || ''))
      const itemEnd = parseClockToMinute(String(item.endTime || ''))
      if (itemStart === null || itemEnd === null) continue
      if (!intervalsOverlap(startMinute, endMinute, itemStart, itemEnd)) continue
      conflicts.push({
        label: String(item.title || '').trim() || untitled,
        startMinute: itemStart,
        endMinute: itemEnd
      })
    }

    return conflicts.sort((a, b) => a.startMinute - b.startMinute)
  }

  /** 提交日程：创建走 add、编辑走 update；失败必须把 error 透出，绝不制造假成功 */
  const submitEvent = async (): Promise<boolean> => {
    if (savingEvent.value) return false
    const sid = String(props?.studentId || '').trim()
    if (!sid) {
      eventError.value = t('schedule.event.studentRequired')
      return false
    }
    const errorKey = validateEventDraft()
    if (errorKey) {
      eventError.value = t(errorKey)
      return false
    }

    const isEditing = !!editingEventId.value
    const draft = eventDraft.value
    const event: ScheduleEvent = {
      id: editingEventId.value,
      title: String(draft.title || '').trim(),
      date: String(draft.date || '').trim(),
      startTime: String(draft.startTime || '').trim(),
      endTime: String(draft.endTime || '').trim(),
      location: String(draft.location || '').trim(),
      note: String(draft.note || '').trim(),
      color: String(draft.color || '').trim() || DEFAULT_EVENT_COLOR,
      reminderMinutes: draft.reminderMinutes ?? null,
      createdAt: '',
      updatedAt: ''
    }
    const payload = isEditing
      ? { student_id: sid, event_id: event.id, ...toScheduleEventPayload(event) }
      : { student_id: sid, ...toScheduleEventPayload(event) }

    savingEvent.value = true
    eventError.value = ''
    try {
      const res = await axios.post(
        `${API_BASE}/v2/schedule/event/${isEditing ? 'update' : 'add'}`,
        payload
      )
      if (!res.data?.success) {
        throw new Error(res.data?.error || t('schedule.event.submitFailed'))
      }
      await onChanged?.()
      editingEventId.value = ''
      return true
    } catch (e) {
      eventError.value = String(
        (e as any)?.response?.data?.error || (e as any)?.message || t('schedule.event.submitFailed')
      )
      return false
    } finally {
      savingEvent.value = false
    }
  }

  /** 删除日程（有 confirmDialog 时先二次确认）；成功返回 true */
  const deleteEvent = async (eventId: string): Promise<boolean> => {
    const sid = String(props?.studentId || '').trim()
    const id = String(eventId || '').trim()
    if (!sid || !id || deletingEvent.value) return false

    if (confirmDialog?.askConfirm) {
      const confirmed = await confirmDialog.askConfirm({
        title: t('schedule.event.deleteConfirmTitle'),
        lines: [t('schedule.event.deleteConfirmLine')],
        confirmText: t('schedule.editor.confirmDelete'),
        cancelText: t('schedule.confirm.cancel'),
        danger: true
      })
      if (!confirmed) return false
    }

    deletingEvent.value = true
    eventError.value = ''
    try {
      const res = await axios.post(`${API_BASE}/v2/schedule/event/delete`, {
        student_id: sid,
        event_id: id
      })
      if (!res.data?.success) {
        throw new Error(res.data?.error || t('schedule.event.deleteFailed'))
      }
      await onChanged?.()
      if (editingEventId.value === id) editingEventId.value = ''
      return true
    } catch (e) {
      eventError.value = String(
        (e as any)?.response?.data?.error || (e as any)?.message || t('schedule.event.deleteFailed')
      )
      return false
    } finally {
      deletingEvent.value = false
    }
  }

  return {
    eventDraft,
    eventError,
    savingEvent,
    deletingEvent,
    editingEventId,
    resetEventDraft,
    populateEventDraft,
    validateEventDraft,
    conflictsOf,
    submitEvent,
    deleteEvent
  }
}

export type ScheduleEvents = ReturnType<typeof useScheduleEvents>
