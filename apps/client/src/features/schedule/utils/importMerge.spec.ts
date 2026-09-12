/**
 * #817 AI 课表导入归一化合并与重复检测 —— 纯函数单测。
 *
 * 覆盖：同课程不同 weeks 正确 union / 一周一条可合并 / weeks 去重排序 /
 *   不同 room·teacher·weekday·period·djs 不误合并 / batch 内完全重复 /
 *   与 existing custom·official 完全重复 / exact 判定 / 疑似重复只 warning。
 */
import { describe, expect, it } from 'vitest'
import { detectImportDuplicates, mergeImportCourses } from './importMerge'
import type { ImportExistingCourse, ParsedImportCourse } from './importTypes'

/** 构造 ParsedImportCourse，默认值可被覆盖 */
const makeCourse = (over: Partial<ParsedImportCourse> = {}): ParsedImportCourse => ({
  name: '高等数学',
  teacher: '张三',
  room: 'A101',
  weekday: 1,
  period: 1,
  djs: 2,
  weeks: [1],
  sourceIndex: 0,
  diagnostics: [],
  ...over
})

describe('mergeImportCourses（自动合并）', () => {
  it('同课程不同 weeks：合并为一条并取并集', () => {
    const result = mergeImportCourses([
      makeCourse({ weeks: [1, 2], sourceIndex: 0 }),
      makeCourse({ weeks: [3, 4], sourceIndex: 1 })
    ])
    expect(result.courses).toHaveLength(1)
    expect(result.courses[0].weeks).toEqual([1, 2, 3, 4])
    expect(result.mergedCount).toBe(1)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({ level: 'info', code: 'merged_duplicate_weeks' })
  })

  it('一周一条（1..16）收敛为一条 1-16，mergedCount=15', () => {
    const courses = Array.from({ length: 16 }, (_, i) =>
      makeCourse({ weeks: [i + 1], sourceIndex: i })
    )
    const result = mergeImportCourses(courses)
    expect(result.courses).toHaveLength(1)
    expect(result.courses[0].weeks).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
    ])
    expect(result.mergedCount).toBe(15)
  })

  it('weeks 合并后去重并升序排序', () => {
    const result = mergeImportCourses([
      makeCourse({ weeks: [3, 1, 2, 2], sourceIndex: 0 }),
      makeCourse({ weeks: [2, 4], sourceIndex: 1 })
    ])
    expect(result.courses).toHaveLength(1)
    expect(result.courses[0].weeks).toEqual([1, 2, 3, 4])
  })

  it('sourceIndex 取组内最小值、diagnostics 合并去重', () => {
    const diag = { level: 'warning' as const, code: 'missing_room', message: '缺少上课地点' }
    const result = mergeImportCourses([
      makeCourse({ weeks: [1], sourceIndex: 5, diagnostics: [diag] }),
      makeCourse({ weeks: [2], sourceIndex: 2, diagnostics: [diag] })
    ])
    expect(result.courses).toHaveLength(1)
    expect(result.courses[0].sourceIndex).toBe(2)
    expect(result.courses[0].diagnostics).toHaveLength(1)
  })

  it('不同 room 不误合并', () => {
    const result = mergeImportCourses([
      makeCourse({ room: 'A101', weeks: [1] }),
      makeCourse({ room: 'B202', weeks: [2] })
    ])
    expect(result.courses).toHaveLength(2)
    expect(result.mergedCount).toBe(0)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('不同 teacher 不误合并', () => {
    const result = mergeImportCourses([
      makeCourse({ teacher: '张三', weeks: [1] }),
      makeCourse({ teacher: '李四', weeks: [2] })
    ])
    expect(result.courses).toHaveLength(2)
  })

  it('不同 weekday 不误合并', () => {
    const result = mergeImportCourses([
      makeCourse({ weekday: 1, weeks: [1] }),
      makeCourse({ weekday: 2, weeks: [2] })
    ])
    expect(result.courses).toHaveLength(2)
  })

  it('不同 period 不误合并', () => {
    const result = mergeImportCourses([
      makeCourse({ period: 1, weeks: [1] }),
      makeCourse({ period: 3, weeks: [2] })
    ])
    expect(result.courses).toHaveLength(2)
  })

  it('不同 djs 不误合并', () => {
    const result = mergeImportCourses([
      makeCourse({ djs: 2, weeks: [1] }),
      makeCourse({ djs: 3, weeks: [2] })
    ])
    expect(result.courses).toHaveLength(2)
  })

  it('空输入返回空结果', () => {
    const result = mergeImportCourses([])
    expect(result.courses).toEqual([])
    expect(result.mergedCount).toBe(0)
    expect(result.diagnostics).toEqual([])
  })
})

describe('detectImportDuplicates（重复检测）', () => {
  it('batch 内完全重复 → exact', () => {
    const kinds = detectImportDuplicates(
      [makeCourse({ weeks: [1, 2], sourceIndex: 0 }), makeCourse({ weeks: [2, 1], sourceIndex: 1 })],
      []
    )
    expect(kinds).toEqual(['exact', 'exact'])
  })

  it('与 existing custom 完全重复 → exact', () => {
    const existing: ImportExistingCourse[] = [
      {
        id: 'c1',
        name: '高等数学',
        teacher: '张三',
        room: 'A101',
        weekday: 1,
        period: 1,
        djs: 2,
        weeks: [1, 2],
        source: 'custom'
      }
    ]
    const kinds = detectImportDuplicates([makeCourse({ weeks: [2, 1] })], existing)
    expect(kinds).toEqual(['exact'])
  })

  it('与 existing official 完全重复 → exact', () => {
    const existing: ImportExistingCourse[] = [
      {
        id: 'o1',
        name: '高等数学',
        teacher: '张三',
        room: 'A101',
        weekday: 1,
        period: 1,
        djs: 2,
        weeks: [1, 2],
        source: 'official'
      }
    ]
    const kinds = detectImportDuplicates([makeCourse({ weeks: [1, 2] })], existing)
    expect(kinds).toEqual(['exact'])
  })

  it('weeks 不同（无交集且不全等）→ 非 exact', () => {
    const existing: ImportExistingCourse[] = [
      {
        name: '高等数学',
        teacher: '张三',
        room: 'A101',
        weekday: 1,
        period: 1,
        djs: 2,
        weeks: [3, 4],
        source: 'custom'
      }
    ]
    const kinds = detectImportDuplicates([makeCourse({ weeks: [1, 2] })], existing)
    expect(kinds).toEqual(['none'])
  })

  it('疑似重复：同名同 weekday 同 period、weeks 有交集但 teacher 不同 → possible', () => {
    const existing: ImportExistingCourse[] = [
      {
        name: '高等数学',
        teacher: '李四',
        room: 'A101',
        weekday: 1,
        period: 1,
        djs: 2,
        weeks: [1, 2, 3],
        source: 'official'
      }
    ]
    const courses = [makeCourse({ teacher: '张三', weeks: [2, 3, 4] })]
    const kinds = detectImportDuplicates(courses, existing)
    expect(kinds).toEqual(['possible'])
    // 只提示，不自动删除：输入数组不被修改
    expect(courses).toHaveLength(1)
  })

  it('疑似重复：room 不同同样判定为 possible', () => {
    const existing: ImportExistingCourse[] = [
      {
        name: '高等数学',
        teacher: '张三',
        room: 'B202',
        weekday: 1,
        period: 1,
        djs: 2,
        weeks: [1, 2],
        source: 'custom'
      }
    ]
    const kinds = detectImportDuplicates([makeCourse({ room: 'A101', weeks: [1, 2] })], existing)
    expect(kinds).toEqual(['possible'])
  })

  it('exact 优先于 possible', () => {
    const existing: ImportExistingCourse[] = [
      // possible 对端
      {
        name: '高等数学',
        teacher: '李四',
        room: 'A101',
        weekday: 1,
        period: 1,
        djs: 2,
        weeks: [1, 2],
        source: 'official'
      },
      // exact 对端
      {
        name: '高等数学',
        teacher: '张三',
        room: 'A101',
        weekday: 1,
        period: 1,
        djs: 2,
        weeks: [1, 2],
        source: 'custom'
      }
    ]
    const kinds = detectImportDuplicates([makeCourse({ teacher: '张三', weeks: [1, 2] })], existing)
    expect(kinds).toEqual(['exact'])
  })

  it('无匹配 → none', () => {
    const kinds = detectImportDuplicates([makeCourse()], [])
    expect(kinds).toEqual(['none'])
  })
})
