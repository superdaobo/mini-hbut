/**
 * #817 AI 课表导入冲突分析 —— 纯函数单测。
 *
 * 覆盖：同星期 + 节次重叠 + 周次重叠 → conflict / 星期不同 → no conflict /
 *   节次不重叠 → no conflict / 周次不重叠 → no conflict /
 *   部分周次交集返回准确 overlapWeeks / batch 内冲突 / vs official / vs custom。
 */
import { describe, expect, it } from 'vitest'
import { detectImportConflicts } from './importConflict'
import type { ImportExistingCourse, ParsedImportCourse } from './importTypes'

/** 构造 ParsedImportCourse，默认值可被覆盖 */
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

describe('detectImportConflicts（冲突检测）', () => {
  it('同星期 + 节次重叠 + 周次重叠 → conflict', () => {
    const result = detectImportConflicts(
      [makeCourse({ name: '高等数学' }), makeCourse({ name: '大学英语' })],
      []
    )
    expect(result[0]).toHaveLength(1)
    expect(result[1]).toHaveLength(1)
    expect(result[0][0]).toMatchObject({
      withCourseName: '大学英语',
      overlapPeriodStart: 1,
      overlapPeriodEnd: 2,
      overlapWeeks: [1, 2, 3],
      source: 'import'
    })
  })

  it('星期不同 → no conflict', () => {
    const result = detectImportConflicts(
      [makeCourse({ name: 'A', weekday: 1 }), makeCourse({ name: 'B', weekday: 2 })],
      []
    )
    expect(result).toEqual([[], []])
  })

  it('节次不重叠 → no conflict', () => {
    const result = detectImportConflicts(
      [makeCourse({ name: 'A', period: 1, djs: 2 }), makeCourse({ name: 'B', period: 5, djs: 2 })],
      []
    )
    expect(result).toEqual([[], []])
  })

  it('周次不重叠 → no conflict', () => {
    const result = detectImportConflicts(
      [makeCourse({ name: 'A', weeks: [1, 2] }), makeCourse({ name: 'B', weeks: [3, 4] })],
      []
    )
    expect(result).toEqual([[], []])
  })

  it('部分周次交集：返回准确 overlapWeeks 与节次区间', () => {
    const result = detectImportConflicts(
      [
        makeCourse({ name: 'A', period: 3, djs: 2, weeks: [1, 2, 3, 4] }),
        makeCourse({ name: 'B', period: 4, djs: 2, weeks: [3, 4, 5] })
      ],
      []
    )
    expect(result[0]).toHaveLength(1)
    expect(result[0][0].overlapWeeks).toEqual([3, 4])
    expect(result[0][0].overlapPeriodStart).toBe(4)
    expect(result[0][0].overlapPeriodEnd).toBe(4)
  })

  it('batch 内冲突：source=import，无 id', () => {
    const result = detectImportConflicts(
      [makeCourse({ name: 'A' }), makeCourse({ name: 'B' })],
      []
    )
    expect(result[0][0].source).toBe('import')
    expect(result[0][0].withCourseId).toBeUndefined()
  })

  it('vs official 冲突：source=official，带 id', () => {
    const existing: ImportExistingCourse[] = [
      {
        id: 'o1',
        name: '大学物理',
        teacher: '王五',
        room: 'C303',
        weekday: 1,
        period: 2,
        djs: 2,
        weeks: [2, 3, 4],
        source: 'official'
      }
    ]
    const result = detectImportConflicts([makeCourse({ name: '高等数学', period: 1, djs: 2 })], existing)
    expect(result[0]).toHaveLength(1)
    expect(result[0][0]).toMatchObject({
      withCourseName: '大学物理',
      withCourseId: 'o1',
      overlapWeeks: [2, 3],
      overlapPeriodStart: 2,
      overlapPeriodEnd: 2,
      source: 'official'
    })
  })

  it('vs custom 冲突：source=custom', () => {
    const existing: ImportExistingCourse[] = [
      {
        id: 'c1',
        name: '选修课',
        teacher: '赵六',
        room: 'D404',
        weekday: 1,
        period: 1,
        djs: 1,
        weeks: [1, 2],
        source: 'custom'
      }
    ]
    const result = detectImportConflicts([makeCourse({ name: '高等数学', period: 1, djs: 2 })], existing)
    expect(result[0]).toHaveLength(1)
    expect(result[0][0].source).toBe('custom')
    expect(result[0][0].overlapWeeks).toEqual([1, 2])
  })

  it('existing 缺少 weekday/period 时忽略该对端', () => {
    const existing: ImportExistingCourse[] = [{ name: '缺字段课程', source: 'official' }]
    const result = detectImportConflicts([makeCourse()], existing)
    expect(result[0]).toEqual([])
  })

  it('同一对课程只报告一次（不重复）', () => {
    const result = detectImportConflicts(
      [makeCourse({ name: 'A' }), makeCourse({ name: 'B' })],
      []
    )
    expect(result[0]).toHaveLength(1)
    expect(result[1]).toHaveLength(1)
  })

  it('空输入返回空数组', () => {
    expect(detectImportConflicts([], [])).toEqual([])
  })
})
