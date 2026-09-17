/**
 * #833 Wave2 主 Agent 接线：当前周个人日程数据层。
 *
 * 职责：按当前学生 + 当前浏览周（`semester.weekDates` 的 ISO 日期区间）拉取个人日程，
 * 归一为前端领域模型（camelCase），并提供给 ScheduleGrid 按天消费。
 *
 * 设计要点：
 * - **切周 / 切学期竞态**：用单调递增的请求令牌丢弃过期响应，避免慢响应覆盖新周数据；
 * - **失败不阻断课表**：取日程失败按「本周无日程」处理，课表照常渲染；
 * - 日程与 semester 无硬绑定：当前学期只决定「正在看哪组日期」。
 */
import { computed, ref, watch } from 'vue'
import axios from 'axios'

import { normalizeScheduleEvent, type ScheduleEvent } from '../utils/eventTypes'

export interface ScheduleEventDataOptions {
  props: any
  semester: any
}

export const useScheduleEventData = (options: ScheduleEventDataOptions) => {
  const { props, semester } = options
  const API_BASE = import.meta.env.VITE_API_BASE || '/api'

  /** 当前周日程（camelCase 领域模型，已过滤非法记录） */
  const weekEvents = ref<ScheduleEvent[]>([])
  const loadingWeekEvents = ref(false)

  /**
   * 请求令牌：每次发起加载自增，响应回来时若令牌已变则丢弃。
   * 用于消除「快速切周时旧响应覆盖新周」的竞态。
   */
  let requestToken = 0

  /** 当前浏览周的 ISO 日期数组（周一 → 周日），无法确定时为空数组 */
  const weekIsoDates = computed<string[]>(() => {
    const days = semester?.weekDates?.value
    if (!Array.isArray(days)) return []
    return days
      .map((day: any) => (typeof day?.iso === 'string' ? day.iso : ''))
      .filter((iso: string) => iso.length > 0)
  })

  /** 从响应中提取日程数组：兼容 Tauri 与本地 Bridge 两种包装层级 */
  const extractEventList = (response: any): any[] => {
    const body = response?.data
    const inner = body?.data ?? body
    return Array.isArray(inner) ? inner : []
  }

  /**
   * 加载当前周日程。任何异常都静默降级为「本周无日程」，
   * 保证日程读取失败不会影响课表本身可用。
   */
  const loadWeekEvents = async (): Promise<void> => {
    const studentId = String(props?.studentId || '').trim()
    const dates = weekIsoDates.value
    if (!studentId || dates.length === 0) {
      weekEvents.value = []
      return
    }

    const token = requestToken + 1
    requestToken = token
    loadingWeekEvents.value = true

    try {
      const res = await axios.post(`${API_BASE}/v2/schedule/event/list-range`, {
        student_id: studentId,
        start_date: dates[0],
        end_date: dates[dates.length - 1]
      })
      if (token !== requestToken) return
      weekEvents.value = extractEventList(res)
        .map((item: any) => normalizeScheduleEvent(item))
        .filter((event: ScheduleEvent | null): event is ScheduleEvent => event !== null)
    } catch {
      if (token !== requestToken) return
      weekEvents.value = []
    } finally {
      if (token === requestToken) loadingWeekEvents.value = false
    }
  }

  /** Grid 消费入口：某天（1..7，周一=1）的日程 */
  const getEventsForDay = (dayIndex: number): ScheduleEvent[] => {
    const index = Number(dayIndex) - 1
    if (!Number.isInteger(index) || index < 0 || index > 6) return []
    const iso = weekIsoDates.value[index]
    if (!iso) return []
    return weekEvents.value.filter((event) => event.date === iso)
  }

  /** 按 id 取日程（详情 / 编辑态回填用） */
  const findEventById = (eventId: string): ScheduleEvent | null => {
    const id = String(eventId || '').trim()
    if (!id) return null
    return weekEvents.value.find((event) => event.id === id) ?? null
  }

  // 学生或浏览周变化即重新加载；首次进入也会立即拉一次
  watch(
    () => [String(props?.studentId || ''), weekIsoDates.value.join(',')],
    () => {
      void loadWeekEvents()
    },
    { immediate: true }
  )

  return {
    weekEvents,
    loadingWeekEvents,
    weekIsoDates,
    getEventsForDay,
    findEventById,
    refreshWeekEvents: loadWeekEvents
  }
}

export type ScheduleEventData = ReturnType<typeof useScheduleEventData>
