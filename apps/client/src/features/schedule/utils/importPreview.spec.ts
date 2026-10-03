/**
 * #821 AI 课表导入「真实课表布局预览」—— 纯函数单测。
 *
 * 覆盖：日期头推导（结构与 useScheduleSemester.weekDates 对齐、周偏移、isToday 注入）、
 *   周次过滤 isWeekActive、预览课程构造（勾选/精确重复过滤、颜色取 colorOverride、
 *   冲突标记 is_conflict、_uid/_preview 临时字段）。
 */
import { describe, expect, it } from 'vitest'
import {
  buildPreviewGridCourses,
  buildPreviewWeekDates,
  isWeekActive,
  toPreviewGridCourse
} from './importPreview'
import type { ImportConflict, ImportPreviewCourse, ParsedImportCourse } from './importTypes'

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const makeCourse = (over: Partial<ParsedImportCourse> = {}): ParsedImportCourse => ({
  name: '高等数学',
  teacher: '张三',
  room: 'A101',
  weekday: 1,
  period: 1,
  djs: 2,
  weeks: [1, 2, 3],
  sourceIndex: 0,
  diagnostics: [],
  ...over
})

const makeConflict = (over: Partial<ImportConflict> = {}): ImportConflict => ({
  withCourseName: '大学英语',
  overlapWeeks: [1, 2],
  overlapPeriodStart: 1,
  overlapPeriodEnd: 2,
  source: 'official',
  ...over
})

const makeItem = (over: Partial<ImportPreviewCourse> = {}): ImportPreviewCourse => ({
  key: 'import-0',
  course: makeCourse(),
  selected: true,
  duplicateKind: 'none',
  conflicts: [],
  diagnostics: [],
  colorOverride: '#336699',
  ...over
})

describe('buildPreviewWeekDates（预览日期头推导）', () => {
  it('开学日为空或非法时返回空数组', () => {
    expect(buildPreviewWeekDates('', 1)).toEqual([])
    expect(buildPreviewWeekDates('   ', 1)).toEqual([])
    expect(buildPreviewWeekDates('not-a-date', 1)).toEqual([])
  })

  it('返回 7 天，结构与 weekDates 一致（含 year/month/date/iso/dayLabel/isToday）', () => {
    const dates = buildPreviewWeekDates('2024-09-02', 1, { dayLabels: DAY_LABELS })
    expect(dates).toHaveLength(7)
    for (const day of dates) {
      expect(typeof day.year).toBe('number')
      expect(day.month).toBeGreaterThanOrEqual(1)
      expect(day.month).toBeLessThanOrEqual(12)
      expect(day.date).toBeGreaterThanOrEqual(1)
      expect(day.date).toBeLessThanOrEqual(31)
      expect(day.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof day.isToday).toBe('boolean')
    }
    expect(dates.map((d) => d.dayLabel)).toEqual(DAY_LABELS)
    // 同周内相邻两天相差恰好 1 天
    const first = new Date(dates[0].iso).getTime()
    const second = new Date(dates[1].iso).getTime()
    expect(second - first).toBe(24 * 60 * 60 * 1000)
  })

  it('第 2 周相对第 1 周整体后移 7 天', () => {
    const week1 = buildPreviewWeekDates('2024-09-02', 1, { dayLabels: DAY_LABELS })
    const week2 = buildPreviewWeekDates('2024-09-02', 2, { dayLabels: DAY_LABELS })
    const delta = new Date(week2[0].iso).getTime() - new Date(week1[0].iso).getTime()
    expect(delta).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('isToday 以注入的基准时间判定', () => {
    const week1 = buildPreviewWeekDates('2024-09-02', 1, { dayLabels: DAY_LABELS })
    const anchor = week1[0]
    const today = new Date(anchor.year, anchor.month - 1, anchor.date)
    const dates = buildPreviewWeekDates('2024-09-02', 1, { dayLabels: DAY_LABELS, today })
    expect(dates[0].isToday).toBe(true)
    expect(dates[1].isToday).toBe(false)
  })

  it('未提供 dayLabels 时 dayLabel 为空串（不抛错）', () => {
    const dates = buildPreviewWeekDates('2024-09-02', 1)
    expect(dates).toHaveLength(7)
    expect(dates[0].dayLabel).toBe('')
  })
})

describe('isWeekActive（周次过滤）', () => {
  it('weeks 包含目标周返回 true', () => {
    expect(isWeekActive([1, 2, 3], 2)).toBe(true)
  })

  it('weeks 不含目标周返回 false', () => {
    expect(isWeekActive([1, 2, 3], 5)).toBe(false)
  })

  it('非法输入安全返回 false', () => {
    expect(isWeekActive(null, 1)).toBe(false)
    expect(isWeekActive([], 1)).toBe(false)
    expect(isWeekActive([1, 2], Number.NaN)).toBe(false)
  })
})

describe('toPreviewGridCourse（预览课程构造）', () => {
  it('未勾选返回 null', () => {
    expect(toPreviewGridCourse(makeItem({ selected: false }))).toBeNull()
  })

  it('精确重复返回 null', () => {
    expect(toPreviewGridCourse(makeItem({ duplicateKind: 'exact' }))).toBeNull()
  })

  it('映射为网格节点并附带 _uid / _preview / 颜色 / 冲突标记', () => {
    const node = toPreviewGridCourse(
      makeItem({
        key: 'import-3',
        course: makeCourse({ sourceIndex: 3, name: '线性代数', weekday: 4, period: 5, djs: 3 }),
        colorOverride: '#aabbcc',
        conflicts: [makeConflict()]
      })
    )
    expect(node).not.toBeNull()
    expect(node).toMatchObject({
      _uid: 'import-3',
      _preview: true,
      id: 'import-3',
      name: '线性代数',
      weekday: 4,
      period: 5,
      djs: 3,
      color: '#aabbcc',
      is_conflict: true
    })
    expect(node?.weeks).toEqual([1, 2, 3])
  })

  it('无冲突时 is_conflict 为 false', () => {
    const node = toPreviewGridCourse(makeItem({ conflicts: [] }))
    expect(node?.is_conflict).toBe(false)
  })

  it('weeks 被拷贝，不与原数组共享引用', () => {
    const weeks = [1, 2, 3]
    const node = toPreviewGridCourse(makeItem({ course: makeCourse({ weeks }) }))
    expect(node?.weeks).toEqual(weeks)
    expect(node?.weeks).not.toBe(weeks)
  })
})

describe('buildPreviewGridCourses（批量构造）', () => {
  it('过滤未勾选与精确重复，保留其余', () => {
    const nodes = buildPreviewGridCourses([
      makeItem({ key: 'import-0', course: makeCourse({ sourceIndex: 0 }) }),
      makeItem({ key: 'import-1', course: makeCourse({ sourceIndex: 1 }), selected: false }),
      makeItem({ key: 'import-2', course: makeCourse({ sourceIndex: 2 }), duplicateKind: 'exact' }),
      makeItem({ key: 'import-3', course: makeCourse({ sourceIndex: 3 }) })
    ])
    expect(nodes.map((node) => node._uid)).toEqual(['import-0', 'import-3'])
  })

  it('空数组安全返回空数组', () => {
    expect(buildPreviewGridCourses([])).toEqual([])
  })
})

describe('预览周过滤（#821：预览课程必须按预览周过滤）', () => {
  it('week 在课程 weeks 内 → 保留；不在 → null', () => {
    const item = makeItem({ course: makeCourse({ weeks: [1, 2, 3] }) })
    expect(toPreviewGridCourse(item, 2)).not.toBeNull()
    expect(toPreviewGridCourse(item, 5)).toBeNull()
  })

  it('不提供 week 时保持旧行为（不过滤周次）', () => {
    const item = makeItem({ course: makeCourse({ weeks: [1, 2, 3] }) })
    expect(toPreviewGridCourse(item)).not.toBeNull()
  })

  it('单双周课程在不同周正确显隐', () => {
    const oddItem = makeItem({
      key: 'import-0',
      course: makeCourse({ sourceIndex: 0, name: '单周课', weeks: [1, 3, 5, 7, 9, 11, 13, 15] })
    })
    const evenItem = makeItem({
      key: 'import-1',
      course: makeCourse({ sourceIndex: 1, name: '双周课', weeks: [2, 4, 6, 8, 10, 12, 14, 16] })
    })

    // 单周：奇数周只显示单周课
    const week3 = buildPreviewGridCourses([oddItem, evenItem], 3)
    expect(week3.map((node) => node.name)).toEqual(['单周课'])

    // 双周：偶数周只显示双周课
    const week4 = buildPreviewGridCourses([oddItem, evenItem], 4)
    expect(week4.map((node) => node.name)).toEqual(['双周课'])
  })

  it('区间周课程在区间外周不渲染', () => {
    const item = makeItem({ course: makeCourse({ weeks: [5, 6, 7, 8] }) })
    expect(toPreviewGridCourse(item, 4)).toBeNull()
    expect(toPreviewGridCourse(item, 9)).toBeNull()
    expect(toPreviewGridCourse(item, 6)).not.toBeNull()
  })

  it('批量构造按周过滤后，未勾选 / 精确重复 / 非本周三者同时生效', () => {
    const nodes = buildPreviewGridCourses(
      [
        makeItem({ key: 'import-0', course: makeCourse({ sourceIndex: 0, weeks: [1] }) }),
        makeItem({ key: 'import-1', course: makeCourse({ sourceIndex: 1, weeks: [2] }) }),
        makeItem({
          key: 'import-2',
          course: makeCourse({ sourceIndex: 2, weeks: [2] }),
          selected: false
        }),
        makeItem({
          key: 'import-3',
          course: makeCourse({ sourceIndex: 3, weeks: [2] }),
          duplicateKind: 'exact'
        })
      ],
      2
    )
    // 第 2 周：import-1 生效；import-0 非本周、import-2 未勾选、import-3 精确重复均排除
    expect(nodes.map((node) => node._uid)).toEqual(['import-1'])
  })

  it('按周过滤后冲突标记仍来自 #817 共享结果（不受过滤影响）', () => {
    const item = makeItem({
      course: makeCourse({ weeks: [2] }),
      conflicts: [makeConflict({ overlapWeeks: [2] })]
    })
    const week2 = toPreviewGridCourse(item, 2)
    expect(week2?.is_conflict).toBe(true)
    // 非冲突周被过滤后自然不渲染，无需伪造 is_conflict=false
    expect(toPreviewGridCourse(item, 3)).toBeNull()
  })
})
