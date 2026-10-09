import { describe, expect, it } from 'vitest'
import {
  buildRollingWidgetScheduleIndex,
  buildTodayCourseSnapshot,
  resolveTodaySnapshotFromScheduleIndex,
} from './widget_snapshot'

describe('#1029 Android Widget 滚动课表索引', () => {
  const now = new Date('2026-10-11T09:00:00+08:00') // 周日，开学第 3 周
  const course = (week: number, weekday: number) => ({
    name: '通信原理', teacher: '张老师', weekday, week_index: week,
    period: 1, period_end: 2, room: '一教101'
  })

  it('在周日写快照，App 被杀后周一仍能从本地下周索引解析课程', () => {
    const courses = [course(4, 1)]
    const index = buildRollingWidgetScheduleIndex({
      cache: courses, baseWeekIndex: 3, startDate: '2026-09-21',
      totalWeeks: 20, now
    })
    expect(index.days).toHaveLength(1)
    expect(index.days[0]).toMatchObject({ week_index: 4, weekday: 1 })
    const oldToday = buildTodayCourseSnapshot({
      cache: courses, studentId: 'test', weekIndex: 3, now
    })
    expect(oldToday.courses).toHaveLength(0)
    const monday = new Date('2026-10-12T09:00:00+08:00')
    const nextDay = resolveTodaySnapshotFromScheduleIndex(
      { ...oldToday, schedule_index: index },
      monday
    )
    expect(nextDay).toMatchObject({
      date: '2026-10-12', week_index: 4, weekday: 1
    })
    expect(nextDay.courses.map((item) => item.name)).toEqual(['通信原理'])
  })

  it('即使课程分布覆盖全年，也只预展开本周与下周，不创建 25x7 大快照', () => {
    const many = Array.from({ length: 25 * 7 }, (_, i) =>
      course(Math.floor(i / 7) + 1, i % 7 + 1)
    )
    const index = buildRollingWidgetScheduleIndex({
      cache: many, baseWeekIndex: 3, totalWeeks: 25, now
    })
    expect(index.days).toHaveLength(14)
    expect(index.days.every((day) => day.week_index === 3 || day.week_index === 4)).toBe(true)
    expect(JSON.stringify(index).length).toBeLessThan(16 * 1024)
  })

  it('老学期最后一周不生成虚假的未来周次', () => {
    const index = buildRollingWidgetScheduleIndex({
      cache: [course(20, 1)], baseWeekIndex: 20, totalWeeks: 20, now
    })
    expect(index.days.map((day) => day.week_index)).toEqual([20])
  })
})
