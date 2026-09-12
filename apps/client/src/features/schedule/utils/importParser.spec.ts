/**
 * #816 AI 课表导入容错 Parser —— 纯函数单测。
 *
 * 覆盖 #816 测试清单：
 *   canonical JSON / 顶层 {courses:[]} / 顶层数组 / Markdown code fence /
 *   中文字段 alias / weekday 多写法 / periods 多写法 / weeks 多写法（含单双周）/
 *   非法星期 / 非法节次 / 非法周次 / teacher·room 缺失 / 多个 JSON 主体安全失败 /
 *   semester·source_id 不进入结果。
 */
import { describe, expect, it } from 'vitest'
import { parseAiCourseImport } from './importParser'
import type { ImportDiagnostic } from './importTypes'

/** 取诊断 code 列表，便于断言 */
const codesOf = (diagnostics: ImportDiagnostic[]): string[] => diagnostics.map((d) => d.code)

describe('parseAiCourseImport（#816 主入口）', () => {
  it('canonical JSON：顶层 { courses: [...] } + 英文字段', () => {
    const text = JSON.stringify({
      courses: [
        { name: '高等数学', teacher: '张三', room: 'A101', weekday: 2, periods: '3-4', weeks: '1-16' }
      ]
    })
    const result = parseAiCourseImport(text)
    expect(result.ok).toBe(true)
    expect(result.rawCount).toBe(1)
    expect(result.courses).toHaveLength(1)
    expect(result.courses[0]).toMatchObject({
      name: '高等数学',
      teacher: '张三',
      room: 'A101',
      weekday: 2,
      period: 3,
      djs: 2,
      sourceIndex: 0
    })
    expect(result.courses[0].weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  })

  it('顶层 { courses: [] } 空数组：ok=false，rawCount=0', () => {
    const result = parseAiCourseImport('{"courses": []}')
    expect(result.ok).toBe(false)
    expect(result.courses).toEqual([])
    expect(result.rawCount).toBe(0)
  })

  it('顶层直接数组（兼容）', () => {
    const result = parseAiCourseImport(
      '[{"name":"英语","weekday":"周一","periods":"1-2","weeks":"1-8"}]'
    )
    expect(result.ok).toBe(true)
    expect(result.courses[0].name).toBe('英语')
    expect(result.courses[0].weekday).toBe(1)
  })

  it('Markdown code fence：自动剥离并产出 info 诊断', () => {
    const text = ['下面是课表：', '```json', '[{"name":"物理","weekday":3,"periods":"5-6","weeks":"1-4"}]', '```', '请导入。'].join(
      '\n'
    )
    const result = parseAiCourseImport(text)
    expect(result.ok).toBe(true)
    expect(result.courses[0].name).toBe('物理')
    expect(codesOf(result.diagnostics)).toContain('code_fence_stripped')
  })

  it('首尾说明文字 + 唯一 JSON 主体：可提取', () => {
    const text = '这是解析结果 [{"name":"化学","weekday":4,"periods":"7-8","weeks":"1-6"}] 谢谢'
    const result = parseAiCourseImport(text)
    expect(result.ok).toBe(true)
    expect(result.courses[0].name).toBe('化学')
    expect(codesOf(result.diagnostics)).toContain('json_body_extracted')
  })

  it('中文字段 alias：课程名/老师/教室/星期/节次/周次/颜色', () => {
    const text = JSON.stringify([
      {
        课程名: '数据结构',
        任课老师: '李四',
        上课地点: 'B203',
        星期: '周三',
        上课节次: '3-4节',
        上课周次: '1-8',
        颜色: '#3b82f6'
      }
    ])
    const result = parseAiCourseImport(text)
    expect(result.ok).toBe(true)
    expect(result.courses[0]).toMatchObject({
      name: '数据结构',
      teacher: '李四',
      room: 'B203',
      weekday: 3,
      period: 3,
      djs: 2,
      requestedColor: '#3b82f6'
    })
    expect(result.courses[0].weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('既有内部形式 { period, djs } 兼容', () => {
    const result = parseAiCourseImport(
      '[{"name":"算法","weekday":5,"period":9,"djs":2,"weeks":[1,3,5]}]'
    )
    expect(result.ok).toBe(true)
    expect(result.courses[0]).toMatchObject({ period: 9, djs: 2, weeks: [1, 3, 5] })
  })
})

describe('weekday 解析', () => {
  it.each([
    ['周二', 2],
    ['星期二', 2],
    ['礼拜二', 2],
    [2, 2],
    ['2', 2],
    ['Tuesday', 2],
    ['周日', 7],
    ['星期天', 7]
  ])('%s → %i', (input, expected) => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: input, periods: '1-2', weeks: '1-2' }])
    )
    expect(result.ok).toBe(true)
    expect(result.courses[0].weekday).toBe(expected)
  })

  it.each([['周八'], ['星期九'], ['abc'], [0], [8], ['0']])('非法星期 %s → hard error 且不进入 courses', (input) => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: input, periods: '1-2', weeks: '1-2' }])
    )
    expect(result.ok).toBe(false)
    expect(result.courses).toHaveLength(0)
    expect(codesOf(result.diagnostics)).toContain('invalid_weekday')
    expect(result.diagnostics[0].sourceIndex).toBe(0)
  })
})

describe('periods 解析', () => {
  it.each([
    ['3-4', 3, 2],
    ['3-4节', 3, 2],
    ['第3-4节', 3, 2],
    ['3~4', 3, 2],
    ['第1-2节', 1, 2],
    ['5', 5, 1]
  ])('%s → period=%i djs=%i', (input, period, djs) => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: input, weeks: '1-2' }])
    )
    expect(result.ok).toBe(true)
    expect(result.courses[0]).toMatchObject({ period, djs })
  })

  it.each([['10-12'], ['0-1'], ['abc'], ['']])('非法节次 %s → hard error', (input) => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: input, weeks: '1-2' }])
    )
    expect(result.ok).toBe(false)
    expect(codesOf(result.diagnostics)).toContain('invalid_periods')
  })
})

describe('weeks 解析', () => {
  it('1-16 → 连续周', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1-16' }])
    )
    expect(result.courses[0].weeks).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
  })

  it('1-15单 → 奇数周', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1-15单' }])
    )
    expect(result.courses[0].weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15])
  })

  it('1-15单周 与 1-15单 等价', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1-15单周' }])
    )
    expect(result.courses[0].weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15])
  })

  it('2-16双 → 偶数周', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '2-16双' }])
    )
    expect(result.courses[0].weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
  })

  it('2-16双周 → 偶数周', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '2-16双周' }])
    )
    expect(result.courses[0].weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
  })

  it('1-4,6,8-12 → 混合区间并排序去重', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1-4,6,8-12' }])
    )
    expect(result.courses[0].weeks).toEqual([1, 2, 3, 4, 6, 8, 9, 10, 11, 12])
  })

  it('1,3,5,7,9 → 离散周并排序去重', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1,3,5,7,9' }])
    )
    expect(result.courses[0].weeks).toEqual([1, 3, 5, 7, 9])
  })

  it('1-16周 带单位后缀', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1-16周' }])
    )
    expect(result.courses[0].weeks).toHaveLength(16)
  })

  it.each([['0-5'], ['1-61'], ['abc'], [''], [[1, 0]], [[1, 99]]])('非法周次 %s → hard error', (input) => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: input }])
    )
    expect(result.ok).toBe(false)
    expect(result.courses).toHaveLength(0)
    expect(codesOf(result.diagnostics)).toContain('invalid_weeks')
  })
})

describe('可选字段与容错', () => {
  it('teacher / room 缺失 → warning 不阻断，值为空串', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '自习', weekday: 1, periods: '1-2', weeks: '1-2' }])
    )
    expect(result.ok).toBe(true)
    expect(result.courses[0].teacher).toBe('')
    expect(result.courses[0].room).toBe('')
    const codes = codesOf(result.courses[0].diagnostics)
    expect(codes).toContain('missing_teacher')
    expect(codes).toContain('missing_room')
  })

  it('teacher / room 为空字符串 → 同样给 warning', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '自习', teacher: '', room: '  ', weekday: 1, periods: '1-2', weeks: '1-2' }])
    )
    expect(result.ok).toBe(true)
    const codes = codesOf(result.courses[0].diagnostics)
    expect(codes).toContain('missing_teacher')
    expect(codes).toContain('missing_room')
  })

  it('非法颜色 → warning 且不阻断，requestedColor 丢弃', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1-2', color: '!!!not-color!!!' }])
    )
    expect(result.ok).toBe(true)
    expect(result.courses[0].requestedColor).toBeUndefined()
    expect(codesOf(result.courses[0].diagnostics)).toContain('invalid_color')
  })

  it('未识别附加字段 → warning', () => {
    const result = parseAiCourseImport(
      JSON.stringify([{ name: '课', weekday: 1, periods: '1-2', weeks: '1-2', remark: '备注' }])
    )
    expect(result.ok).toBe(true)
    expect(codesOf(result.courses[0].diagnostics)).toContain('unknown_field')
  })
})

describe('安全失败与字段隔离', () => {
  it('多个 JSON 主体 → ok=false + 全局 error，绝不猜测', () => {
    const text = '[{"name":"A","weekday":1,"periods":"1-2","weeks":"1-2"}] 以及 [{"name":"B","weekday":2,"periods":"3-4","weeks":"3-4"}]'
    const result = parseAiCourseImport(text)
    expect(result.ok).toBe(false)
    expect(result.courses).toEqual([])
    expect(codesOf(result.diagnostics)).toContain('multiple_json_bodies')
  })

  it('括号无法配平 → ok=false', () => {
    const result = parseAiCourseImport('[{"name":"A","weekday":1')
    expect(result.ok).toBe(false)
    expect(result.courses).toEqual([])
  })

  it('semester / id / source_id 不进入结果，也不产生未知字段告警', () => {
    const result = parseAiCourseImport(
      JSON.stringify([
        {
          name: '课',
          weekday: 1,
          periods: '1-2',
          weeks: '1-2',
          semester: '2025-2026-1',
          id: 'ext-1',
          source_id: 'ext-2'
        }
      ])
    )
    expect(result.ok).toBe(true)
    const course = result.courses[0] as unknown as Record<string, unknown>
    expect(course.semester).toBeUndefined()
    expect(course.id).toBeUndefined()
    expect(course.source_id).toBeUndefined()
    expect(codesOf(result.courses[0].diagnostics)).not.toContain('unknown_field')
  })

  it('sourceIndex 保留原始数组下标（含被过滤项）', () => {
    const result = parseAiCourseImport(
      JSON.stringify([
        { name: 'A', weekday: 1, periods: '1-2', weeks: '1-2' },
        { name: 'B', weekday: '周八', periods: '1-2', weeks: '1-2' },
        { name: 'C', weekday: 3, periods: '3-4', weeks: '3-4' }
      ])
    )
    expect(result.rawCount).toBe(3)
    expect(result.courses.map((c) => c.sourceIndex)).toEqual([0, 2])
    expect(result.courses.map((c) => c.name)).toEqual(['A', 'C'])
    const weekdayError = result.diagnostics.find((d) => d.code === 'invalid_weekday')
    expect(weekdayError?.sourceIndex).toBe(1)
  })

  it('非文本 / 空输入 → ok=false 全局 error', () => {
    expect(parseAiCourseImport('').ok).toBe(false)
    expect(parseAiCourseImport(null).ok).toBe(false)
    expect(parseAiCourseImport(123).ok).toBe(false)
    expect(parseAiCourseImport('这里没有任何 JSON').ok).toBe(false)
  })
})
