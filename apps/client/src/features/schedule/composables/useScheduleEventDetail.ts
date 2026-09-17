/**
 * 个人日程详情弹层状态编排（#838）。
 *
 * 与 `useScheduleDetail.ts`（课程详情）**并列而不混入**：课程详情仍由 useScheduleDetail 独占，
 * 本函数只维护日程详情（选中日程 / 冲突 / 编辑交接 / 删除编排），两者互不覆盖。
 *
 * 职责边界：
 * - 负责：详情开关与选中日程、冲突列表、编辑交接、删除编排、切周 / 切学期的 stale 清理；
 * - 不负责：详情 UI（ScheduleEventDetail.vue）、编辑表单（#836 统一创建器）、Grid 渲染（#837）。
 *
 * 冲突判定复用 `useScheduleEvents.conflictsOf`（其内部走 #834 `timeGeometry.intervalsOverlap`），
 * 本模块不自建第二套重叠算法，也永不因冲突阻断任何操作。
 */
import { computed, ref, watch } from 'vue'

import { normalizeScheduleEvent, type ScheduleEvent } from '../utils/eventTypes'
import type { ScheduleConfirmDialog } from './useConfirmDialog'
import type { ScheduleEventConflict, ScheduleEventDraft, ScheduleEvents } from './useScheduleEvents'
import type { ScheduleEventData } from './useScheduleEventData'

export interface ScheduleEventDetailOptions {
  props: any
  /** 当前周日程数据层（useScheduleEventData 的返回值） */
  eventData: ScheduleEventData
  /** 日程 CRUD 组合式函数（useScheduleEvents 的返回值） */
  events: ScheduleEvents
  /**
   * 共享确认弹窗实例（与 useScheduleEvents 传入的是同一个）。
   *
   * ⚠ 本 composable 刻意**不**调用它：删除的二次确认由 `events.deleteEvent` 内部统一发起
   * （文案 deleteConfirmTitle / deleteConfirmLine / schedule.editor.confirmDelete）。
   * 若这里再调一次 askConfirm，用户会连续看到两个确认框。
   * 该字段仅用于与 useScheduleEvents 的接线形态对齐，父组件按同一份 options 传参即可。
   */
  confirmDialog?: ScheduleConfirmDialog
  /** 当前周全部课程（扁平），供冲突计算使用 */
  getWeekCourses: () => any[]
  /** 编辑交接回调：草稿已回填、详情已关闭后调用，由父组件决定如何打开统一编辑器 */
  onEdit?: (event: ScheduleEvent) => void
}

export const useScheduleEventDetail = (options: ScheduleEventDetailOptions) => {
  const { props, eventData, events, getWeekCourses, onEdit } = options

  /** 详情弹层可见性 */
  const showEventDetail = ref(false)
  /** 当前选中的日程（camelCase 领域对象），null 表示无选中 */
  const selectedEvent = ref<ScheduleEvent | null>(null)
  /** 详情内错误（删除失败等）；非空时详情内可见，绝不关闭详情制造假成功 */
  const detailError = ref('')

  /** 选中日程 → 冲突判定草稿（conflictsOf 只认草稿形状，字段一一对应） */
  const draftOfSelectedEvent = (event: ScheduleEvent): ScheduleEventDraft => ({
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    note: event.note,
    color: event.color,
    reminderMinutes: event.reminderMinutes
  })

  /**
   * 当前日程的冲突列表。
   * 复用 `events.conflictsOf`（内部 = #834 intervalsOverlap），并传 `excludeEventId`
   * 排除自身，保证「自己不算自己的冲突」。
   */
  const detailConflicts = computed<ScheduleEventConflict[]>(() => {
    const event = selectedEvent.value
    if (!event) return []
    const courses = typeof getWeekCourses === 'function' ? getWeekCourses() : []
    return events.conflictsOf(draftOfSelectedEvent(event), {
      courses: Array.isArray(courses) ? courses : [],
      events: eventData.weekEvents.value,
      excludeEventId: event.id
    })
  })

  /**
   * 打开详情：Grid 传来的原始对象可能是 snake_case payload 或 camelCase 领域对象，
   * 统一经 `normalizeScheduleEvent` 归一；归一失败（缺 id / 非法日期时间）不打开。
   */
  const openEventDetail = (raw: any): boolean => {
    const normalized = normalizeScheduleEvent(raw)
    if (!normalized) return false
    detailError.value = ''
    selectedEvent.value = normalized
    showEventDetail.value = true
    return true
  }

  /** 关闭详情并清空选中与错误（用户关闭 / 删除成功 / stale 清理共用） */
  const closeEventDetail = () => {
    showEventDetail.value = false
    selectedEvent.value = null
    detailError.value = ''
  }

  /**
   * 编辑交接：把选中日程回填进统一编辑器草稿（`populateEventDraft` 内部同时写入
   * `editingEventId`，因此无需再手动赋值），成功后关闭详情并交给 `onEdit` 回调，
   * 由父组件决定如何打开编辑器。
   */
  const requestEditEvent = (): boolean => {
    const event = selectedEvent.value
    if (!event) return false
    // 归一后的日程必定可回填；回填失败说明对象不可编辑，直接返回 false（不制造假成功）
    if (!events.populateEventDraft(event)) return false
    closeEventDetail()
    onEdit?.(event)
    return true
  }

  /**
   * 删除当前日程。
   *
   * - 只删明确 event id（`events.deleteEvent(selectedEvent.id)`），不触碰任何课程；
   * - 二次确认由 `events.deleteEvent` 统一发起（同一 confirmDialog 实例），本层不再重复确认；
   * - 成功才关闭详情并刷新当前周；失败保留详情并把错误写入 `detailError`。
   */
  const requestDeleteEvent = async (): Promise<boolean> => {
    const event = selectedEvent.value
    if (!event?.id) return false

    detailError.value = ''
    // 清空上一次残留错误：用于区分「用户取消」（返回 false 且无错误）与「删除失败」（返回 false 且有错误）
    events.eventError.value = ''

    const ok = await events.deleteEvent(event.id)
    if (!ok) {
      detailError.value = String(events.eventError?.value || '').trim()
      return false
    }

    closeEventDetail()
    await eventData.refreshWeekEvents()
    return true
  }

  /**
   * 切周 / 切学期 / 周数据刷新后的 stale 清理：
   * 当前选中的日程若已不在当前周 `weekEvents` 中（换周、被其他端删除、刷新后消失），
   * 立即关闭详情，避免继续展示过期数据。
   */
  watch(
    () => [
      String(props?.studentId || ''),
      eventData.weekIsoDates.value.join(','),
      eventData.weekEvents.value.map((item) => item.id).join(',')
    ],
    () => {
      const current = selectedEvent.value
      if (!current) return
      const stillExists = eventData.weekEvents.value.some((item) => item.id === current.id)
      if (!stillExists) closeEventDetail()
    }
  )

  return {
    showEventDetail,
    selectedEvent,
    detailConflicts,
    detailError,
    openEventDetail,
    closeEventDetail,
    requestEditEvent,
    requestDeleteEvent
  }
}

export type ScheduleEventDetail = ReturnType<typeof useScheduleEventDetail>
