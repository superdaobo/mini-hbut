/**
 * 课表领域 - 整周渲染数据组合式函数（布局派生入口）。
 * 原内联于 ScheduleView.vue（weekCoursesWithColor/getCoursesForDay/Widget 高亮）。
 */
import { computed, ref } from 'vue'
import { buildWeekCoursesWithColors, getCourseStyle } from '../utils/layout'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleMenu } from './useScheduleMenu'
import type { ScheduleSemester } from './useScheduleSemester'

export interface ScheduleGridOptions {
  data: ScheduleData
  semester: ScheduleSemester
  menu: ScheduleMenu
}

export const useScheduleGrid = (options: ScheduleGridOptions) => {
  const { data, semester, menu } = options

  /** Widget 深链接高亮状态 */
  const widgetHighlightPeriod = ref(0)
  const widgetHighlightDay = ref(0)

  /** 当前周整周课程（含合并与冲突块，已分配配色） */
  const weekCoursesWithColor = computed(() => {
    const fallbackSemester = String(semester.semester.value || semester.semesterDraft.value || '').trim()
    return buildWeekCoursesWithColors(Number(semester.selectedWeek.value || 1), {
      scheduleData: data.scheduleData.value,
      fallbackSemester
    })
  })

  /** 某一列的课程列表 */
  const getCoursesForDay = (dayIndex: any): any[] => {
    const day = Number(dayIndex)
    return weekCoursesWithColor.value[day] || []
  }

  /** 课程卡片是否应被 Widget 深链接高亮（同一天 + period 范围包含目标节次） */
  const isWidgetHighlighted = (course: any, day: any): boolean => {
    if (!widgetHighlightPeriod.value || !widgetHighlightDay.value) return false
    if (Number(day) !== widgetHighlightDay.value) return false
    const start = Number(course?.period) || 1
    const span = Math.max(1, Number(course?.djs) || 1)
    const end = start + span - 1
    return widgetHighlightPeriod.value >= start && widgetHighlightPeriod.value <= end
  }

  /** 设置 Widget 高亮（供入口深链接 watcher 调用） */
  const setWidgetHighlight = (day: number, period: number) => {
    widgetHighlightDay.value = day >= 1 && day <= 7 ? day : 0
    widgetHighlightPeriod.value = period >= 1 && period <= 14 ? period : 0
  }

  const clearWidgetHighlight = () => {
    widgetHighlightPeriod.value = 0
    widgetHighlightDay.value = 0
  }

  /** 课程卡片样式（依赖当前样式模式，供模板计算） */
  const getCourseCardStyle = (course: any) => {
    return getCourseStyle(course, menu.scheduleCourseCardStyle.value)
  }

  return {
    weekCoursesWithColor,
    widgetHighlightPeriod,
    widgetHighlightDay,
    getCoursesForDay,
    isWidgetHighlighted,
    setWidgetHighlight,
    clearWidgetHighlight,
    getCourseCardStyle
  }
}

export type ScheduleGrid = ReturnType<typeof useScheduleGrid>
