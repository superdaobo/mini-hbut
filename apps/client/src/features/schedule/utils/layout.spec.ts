/**
 * #1115 课表冲突显示（merged / side-by-side）数据契约。
 *
 * 重点锁住：
 * - merged：冲突区间只保留汇总卡，真实课程按非冲突节次切片；
 * - 切片只改显示区间（_displayStart/_displaySpan），原始 period/djs 不变；
 * - side-by-side：只保留真实课程，不生成汇总卡；
 * - 局部重叠、长课跨多个冲突、3/4 门、同名不同教师、无冲突回归；
 * - getCourseStyle / courseToTimelineItem 使用显示区间。
 */
import { describe, expect, it } from 'vitest'
import {
  buildOverflowConflictCourse,
  buildVisibleMergedCourses,
  buildWeekCoursesWithColors,
  collectPeriodConflicts,
  getCourseStyle
} from './layout'
import { courseToTimelineItem } from './timelineAdapters'
import { timeSchedule } from '../constants'

const course = (overrides: Record<string, any> = {}) => ({
  id: overrides.id || `c-${overrides.name || 'x'}-${overrides.period || 1}-${overrides.weekday || 1}`,
  name: '高等数学',
  teacher: '张老师',
  room: 'A101',
  room_code: 'A101',
  building: '1号楼',
  weekday: 1,
  period: 1,
  djs: 2,
  weeks: [1],
  weeks_text: '1',
  credit: '3',
  class_name: '数学1班',
  is_custom: false,
  ...overrides
})

const dayCourses = (data: Record<number, any[]>, day = 1) => data[day] || []

describe('#1115 merged 冲突显示', () => {
  it('两门完全重叠：只保留一张汇总卡，真实课程全部被汇总', () => {
    const data = buildWeekCoursesWithColors(1, {
      scheduleData: [
        course({ id: 'a', name: '高等数学', period: 1, djs: 2 }),
        course({ id: 'b', name: '大学物理', period: 1, djs: 2 })
      ]
    })
    const list = dayCourses(data)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      is_conflict: true,
      period: 1,
      djs: 2
    })
    expect(list[0].conflict_courses).toHaveLength(2)
  })

  it('部分重叠 A1-2 / B2-3：汇总卡只覆盖第 2 节，两侧非冲突段保留', () => {
    const data = buildWeekCoursesWithColors(1, {
      scheduleData: [
        course({ id: 'a', name: '高等数学', period: 1, djs: 2 }),
        course({ id: 'b', name: '大学物理', period: 2, djs: 2 })
      ]
    })
    const list = dayCourses(data)
    const conflicts = list.filter((item) => item.is_conflict)
    const real = list.filter((item) => !item.is_conflict)

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ period: 2, djs: 1 })
    expect(real).toHaveLength(2)

    const math = real.find((item) => item.name === '高等数学')
    const physics = real.find((item) => item.name === '大学物理')
    expect(math).toMatchObject({ period: 1, djs: 2, _displayStart: 1, _displaySpan: 1 })
    expect(physics).toMatchObject({ period: 2, djs: 2, _displayStart: 3, _displaySpan: 1 })
    // 原始 period/djs 不被切片改写，详情/编辑仍拿到完整课程
    expect(math.period).toBe(1)
    expect(math.djs).toBe(2)
    expect(physics.period).toBe(2)
    expect(physics.djs).toBe(2)
  })

  it('长课跨冲突（1-5 与 3-4）：保留 1-2 与第 5 节两个显示段', () => {
    const data = buildWeekCoursesWithColors(1, {
      scheduleData: [
        course({ id: 'long', name: '程序设计', period: 1, djs: 5 }),
        course({ id: 'short', name: '大学英语', period: 3, djs: 2 })
      ]
    })
    const list = dayCourses(data)
    const conflicts = list.filter((item) => item.is_conflict)
    const longSegments = list
      .filter((item) => !item.is_conflict && item.name === '程序设计')
      .sort((a, b) => a._displayStart - b._displayStart)

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ period: 3, djs: 2 })
    expect(longSegments).toHaveLength(2)
    expect(longSegments[0]).toMatchObject({ _displayStart: 1, _displaySpan: 2, period: 1, djs: 5 })
    expect(longSegments[1]).toMatchObject({ _displayStart: 5, _displaySpan: 1, period: 1, djs: 5 })
    expect(new Set(longSegments.map((item) => item._uid)).size).toBe(2)
    // 被完全覆盖的短课不再单独占卡
    expect(list.some((item) => !item.is_conflict && item.name === '大学英语')).toBe(false)
  })

  it('同名不同教师不会被误合并，冲突详情保留两门课', () => {
    const data = buildWeekCoursesWithColors(1, {
      scheduleData: [
        course({ id: 't1', name: '高等数学', teacher: '张老师', period: 1, djs: 2 }),
        course({ id: 't2', name: '高等数学', teacher: '李老师', period: 1, djs: 2 })
      ]
    })
    const list = dayCourses(data)
    expect(list).toHaveLength(1)
    expect(list[0].conflict_courses.map((item: any) => item.teacher).sort()).toEqual([
      '张老师',
      '李老师'
    ])
  })

  it('无冲突课程完全保持原对象语义（不注入显示区间）', () => {
    const data = buildWeekCoursesWithColors(1, {
      scheduleData: [course({ id: 'only', name: '线性代数', period: 1, djs: 2 })]
    })
    const list = dayCourses(data)
    expect(list).toHaveLength(1)
    expect(list[0]._displayStart).toBeUndefined()
    expect(list[0]._displaySpan).toBeUndefined()
    expect(list[0]).toMatchObject({ period: 1, djs: 2 })
  })
})

describe('#1115 side-by-side 冲突显示', () => {
  it('两门完全重叠：保留两门真实课程，不生成汇总卡', () => {
    const data = buildWeekCoursesWithColors(1, {
      conflictDisplay: 'side-by-side',
      scheduleData: [
        course({ id: 'a', name: '高等数学', period: 1, djs: 2 }),
        course({ id: 'b', name: '大学物理', period: 1, djs: 2 })
      ]
    })
    const list = dayCourses(data)
    expect(list).toHaveLength(2)
    expect(list.some((item) => item.is_conflict)).toBe(false)
    expect(list.map((item) => item.name).sort()).toEqual(['大学物理', '高等数学'])
  })

  it('4 门完全重叠：保留 4 门真实课程（lane 收敛由网格层处理）', () => {
    const data = buildWeekCoursesWithColors(1, {
      conflictDisplay: 'side-by-side',
      scheduleData: ['A', 'B', 'C', 'D'].map((name, index) =>
        course({ id: `c${index}`, name, period: 1, djs: 2 })
      )
    })
    const list = dayCourses(data)
    expect(list).toHaveLength(4)
    expect(list.every((item) => !item.is_conflict)).toBe(true)
  })
})

describe('#1115 显示区间在样式与真实时间中的使用', () => {
  it('getCourseStyle 使用 _displayStart/_displaySpan，不改变原字段', () => {
    const sliced = {
      ...course({ period: 2, djs: 3 }),
      _displayStart: 4,
      _displaySpan: 1
    }
    const style = getCourseStyle(sliced, 'modern')
    expect(style.gridRow).toBe('4 / span 1')
    expect(style['--course-span']).toBe('1')
    expect(sliced.period).toBe(2)
    expect(sliced.djs).toBe(3)
  })

  it('courseToTimelineItem 使用显示区间换算真实分钟', () => {
    const sliced = {
      ...course({ weekday: 1, period: 2, djs: 3 }),
      _displayStart: 5,
      _displaySpan: 1
    }
    const item = courseToTimelineItem(sliced, 1, 'official', timeSchedule)
    expect(item).not.toBeNull()
    expect(item!.startMinute).toBe(14 * 60)
    expect(item!.endMinute).toBe(14 * 60 + 45)
    expect(item!.raw).toBe(sliced)
  })
})

describe('#1115 冲突集合抽取', () => {
  it('collectPeriodConflicts 只在同一节次 ≥2 门课时产生记录', () => {
    const merged = [
      { ...course({ id: 'a', period: 1, djs: 2 }), _start: 1, _end: 2, _uid: 'a' },
      { ...course({ id: 'b', period: 2, djs: 2 }), _start: 2, _end: 3, _uid: 'b' }
    ]
    const conflicts = collectPeriodConflicts(merged)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].period).toBe(2)
    expect(conflicts[0].active).toHaveLength(2)
  })

  it('buildVisibleMergedCourses 对完全被覆盖的课程返回空集合', () => {
    const merged = [
      { ...course({ id: 'a', period: 1, djs: 2 }), _start: 1, _end: 2, _uid: 'a' },
      { ...course({ id: 'b', period: 1, djs: 2 }), _start: 1, _end: 2, _uid: 'b' }
    ]
    const conflicts = collectPeriodConflicts(merged)
    expect(buildVisibleMergedCourses(merged, conflicts)).toEqual([])
  })

  it('buildOverflowConflictCourse 汇总隐藏课程并覆盖其显示区间', () => {
    const a = { ...course({ id: 'a', name: '课程A', period: 1, djs: 2 }), _displayStart: 1, _displaySpan: 2 }
    const b = { ...course({ id: 'b', name: '课程B', period: 3, djs: 1 }), _displayStart: 3, _displaySpan: 1 }
    const synthetic = buildOverflowConflictCourse(
      {
        dayIndex: 2,
        items: [
          { kind: 'course', raw: a },
          { kind: 'event', raw: { id: 'e' } },
          { kind: 'course', raw: b }
        ]
      },
      '课程冲突（2门）',
      '点击查看冲突课程详情',
      5
    )
    expect(synthetic).toBeTruthy()
    expect(synthetic).toMatchObject({
      weekday: 2,
      period: 1,
      djs: 3,
      is_conflict: true,
      weeks: [5]
    })
    expect(synthetic.conflict_courses.map((item: any) => item.name)).toEqual(['课程A', '课程B'])
  })

  it('buildOverflowConflictCourse 纯日程溢出返回 null（沿用 #837 行为）', () => {
    expect(
      buildOverflowConflictCourse(
        { dayIndex: 1, items: [{ kind: 'event', raw: { id: 'e' } }] },
        'x',
        'y'
      )
    ).toBeNull()
  })
})
