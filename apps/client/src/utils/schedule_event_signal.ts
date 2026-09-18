/**
 * 个人日程本地变更广播。
 *
 * 这是“数据已变化”的轻量信号，不携带标题/备注等隐私内容。
 * Dashboard 用它刷新今日安排；Cloud Sync 用它触发自动上传。
 */
export const SCHEDULE_EVENT_CHANGED_EVENT = 'hbu:schedule-event-changed'

export type ScheduleEventChangeReason = 'crud' | 'cloud-restore'

export interface ScheduleEventChangedDetail {
  studentId: string
  reason: ScheduleEventChangeReason
}

export const emitScheduleEventChanged = (
  studentId: unknown,
  reason: ScheduleEventChangeReason = 'crud'
): void => {
  if (typeof window === 'undefined') return
  const sid = String(studentId || '').trim()
  if (!sid) return
  window.dispatchEvent(new CustomEvent<ScheduleEventChangedDetail>(SCHEDULE_EVENT_CHANGED_EVENT, {
    detail: { studentId: sid, reason }
  }))
}
