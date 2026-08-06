/**
 * 课表领域 - 日历导出纯函数（构建 ICS 事件）。
 * 原内联于 ScheduleView.vue（日期换算/周事件/学期事件/时间戳后缀）。
 */
import { timeSchedule } from '../constants'
import { getCourseEndPeriod, mergeDailyCourses } from './layout'

/** 某一周某一天的课程列表（合并连续同名课程后），与原 getCoursesForDayAndWeek 一致 */
export const getCoursesForDayAndWeek = (
  _startDateStr: string,
  scheduleData: any[],
  dayIndex: number,
  weekNumber: number
): any[] => {
  const source = Array.isArray(scheduleData) ? scheduleData : []
  const dailyCourses = source.filter((course) => {
    return course.weekday === dayIndex && course.weeks.includes(weekNumber)
  })
  dailyCourses.sort((a, b) => a.period - b.period)
  return mergeDailyCourses(dailyCourses)
}

/** 文件名时间戳后缀：yyyyMMdd-HHmmss */
export const createTimestampSuffix = (): string => {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

/** 某一周某一天的 ISO 日期；startDateStr 为空返回 null */
export const getDateForWeekDay = (startDateStr: string, weekNumber: number, weekday: number): string | null => {
  if (!startDateStr) return null
  const base = new Date(startDateStr)
  base.setDate(base.getDate() + (weekNumber - 1) * 7 + (weekday - 1))
  const yyyy = base.getFullYear()
  const mm = String(base.getMonth() + 1).padStart(2, '0')
  const dd = String(base.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** 构建单门课的事件对象（复用一周/一学期两处公共逻辑） */
const buildCourseEvent = (
  course: any,
  iso: string,
  weekNumber: number,
  day: number
): Record<string, any> | null => {
  const startPeriod = Number(course.period) || 1
  const endPeriod = getCourseEndPeriod(course)
  const startSlot = timeSchedule.find((t) => t.p === startPeriod)
  const endSlot = timeSchedule.find((t) => t.p === endPeriod)
  if (!startSlot || !endSlot) return null

  const start = `${iso}T${startSlot.start}:00`
  const end = `${iso}T${endSlot.end}:00`
  const room = course.room_code || course.room || ''
  const location = [course.building, room].filter(Boolean).join(' ')
  const timeLabel = `第${weekNumber}周 周${day} 第${startPeriod}-${endPeriod}节 ${startSlot.start}-${endSlot.end}`
  const description = `时间: ${timeLabel}\n地点: ${location || '未标注'}`

  return {
    summary: course.name,
    description,
    location: location || undefined,
    start,
    end
  }
}

/** 导出某一周的事件列表 */
export const buildExportEventsForWeek = (
  weekNumber: number,
  options: { startDateStr: string; scheduleData: any[] }
): any[] => {
  const { startDateStr, scheduleData } = options || {}
  const events: any[] = []
  if (!startDateStr) return events
  const source = Array.isArray(scheduleData) ? scheduleData : []

  for (let day = 1; day <= 7; day++) {
    const iso = getDateForWeekDay(startDateStr, weekNumber, day)
    if (!iso) continue
    const courses = getCoursesForDayAndWeek(startDateStr, source, day, weekNumber)
    courses.forEach((course) => {
      const event = buildCourseEvent(course, iso, weekNumber, day)
      if (event) events.push(event)
    })
  }
  return events
}

/** 导出整个学期的事件列表（按课程去重） */
export const buildExportEventsForSemester = (options: { startDateStr: string; scheduleData: any[] }): any[] => {
  const { startDateStr, scheduleData } = options || {}
  const events: any[] = []
  if (!startDateStr) return events
  const source = Array.isArray(scheduleData) ? scheduleData : []
  const maxWeek = source.reduce((acc: number, course: any) => {
    const maxCourseWeek = Array.isArray(course.weeks) && course.weeks.length
      ? Math.max(...course.weeks)
      : 0
    return Math.max(acc, maxCourseWeek)
  }, 0)
  const totalWeeks = maxWeek || 25
  const seen = new Set<string>()

  for (let week = 1; week <= totalWeeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const iso = getDateForWeekDay(startDateStr, week, day)
      if (!iso) continue
      const courses = getCoursesForDayAndWeek(startDateStr, source, day, week)
      courses.forEach((course) => {
        const event = buildCourseEvent(course, iso, week, day)
        if (!event) return
        const teacher = course.teacher || ''
        const key = `${course.name}|${event.start}|${event.end}|${event.location || ''}|${teacher}`
        if (seen.has(key)) return
        seen.add(key)
        events.push(event)
      })
    }
  }
  return events
}
