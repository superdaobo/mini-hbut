/**
 * #818 智能配色（AI 推荐 / 均衡兜底 / 用户覆盖）—— 纯函数单测。
 *
 * 覆盖清单：
 *   AI 合法且在色板内 → 接受；AI 合法但越板 → warning + 兜底；AI 非法 → warning + 兜底；
 *   AI 无 color → 正常自动配色；同名多条始终同色；分布基本均衡；确定性可复现；
 *   用户 override 优先于 AI；改一条同名课程组内同步；自动配色绝不越板；
 *   existingColors 统计被正确考虑。
 */
import { describe, expect, it } from 'vitest'
import {
  IMPORT_COLOR_CODE_INVALID,
  IMPORT_COLOR_CODE_OUT_OF_PALETTE,
  assignImportColors,
  collectImportColorDiagnostics,
  resetImportColors,
  setCourseGroupColor,
  validateImportColor
} from './importColors'
import type { ParsedImportCourse } from './importTypes'
import { COURSE_COLOR_PRESETS, getPresetHexList } from '../../../utils/course_color'

const PRESET_HEXES = getPresetHexList().map((hex) => hex.toLowerCase())
/** 色板外但格式合法的 hex */
const OFF_PALETTE_HEX = '#123456'

/** 构造一条 ParsedImportCourse（默认值可按需覆盖） */
function makeCourse(overrides: Partial<ParsedImportCourse> = {}): ParsedImportCourse {
  return {
    name: '高等数学',
    teacher: '张三',
    room: 'A101',
    weekday: 1,
    period: 1,
    djs: 2,
    weeks: [1, 2, 3],
    sourceIndex: 0,
    diagnostics: [],
    ...overrides
  }
}

/** 把 sourceIndex → hex 映射转为可比较的有序数组 */
function entriesOf(map: Map<number, string>): Array<[number, string]> {
  return [...map.entries()].sort((a, b) => a[0] - b[0])
}

describe('validateImportColor（#818 候选色校验）', () => {
  it('合法且在色板内 → 返回规范小写 hex', () => {
    expect(validateImportColor(COURSE_COLOR_PRESETS[0].hex)).toBe(PRESET_HEXES[0])
    // 大写输入也应归一化后命中色板
    expect(validateImportColor(COURSE_COLOR_PRESETS[1].hex.toUpperCase())).toBe(PRESET_HEXES[1])
    expect(validateImportColor(` ${COURSE_COLOR_PRESETS[2].hex} `)).toBe(PRESET_HEXES[2])
  })

  it('合法但不在色板内 → null', () => {
    expect(validateImportColor(OFF_PALETTE_HEX)).toBeNull()
    expect(validateImportColor('#fff')).toBeNull()
  })

  it('非法格式 / 非字符串 → null', () => {
    expect(validateImportColor('not-a-color')).toBeNull()
    expect(validateImportColor('#12345')).toBeNull()
    expect(validateImportColor('')).toBeNull()
    expect(validateImportColor(undefined)).toBeNull()
    expect(validateImportColor(null)).toBeNull()
    expect(validateImportColor(123)).toBeNull()
  })
})

describe('assignImportColors（#818 分配优先级）', () => {
  it('AI 合法且在色板内 → 直接采用', () => {
    const courses = [makeCourse({ sourceIndex: 0, requestedColor: COURSE_COLOR_PRESETS[3].hex })]
    const colors = assignImportColors(courses)
    expect(colors.get(0)).toBe(PRESET_HEXES[3])
  })

  it('AI 合法但不在色板内 → 兜底为色板内颜色，且产生越板 warning', () => {
    const courses = [makeCourse({ sourceIndex: 0, requestedColor: OFF_PALETTE_HEX })]
    const colors = assignImportColors(courses)
    const assigned = colors.get(0)
    expect(assigned).toBeDefined()
    expect(PRESET_HEXES).toContain(assigned)
    expect(assigned).not.toBe(OFF_PALETTE_HEX)

    const diagnostics = collectImportColorDiagnostics(courses)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      level: 'warning',
      code: IMPORT_COLOR_CODE_OUT_OF_PALETTE,
      field: 'color',
      sourceIndex: 0
    })
  })

  it('AI 非法色 → 兜底为色板内颜色，且产生非法 warning', () => {
    const courses = [makeCourse({ sourceIndex: 0, requestedColor: 'rgb(1,2,3)' })]
    const colors = assignImportColors(courses)
    expect(PRESET_HEXES).toContain(colors.get(0))

    const diagnostics = collectImportColorDiagnostics(courses)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].level).toBe('warning')
    expect(diagnostics[0].code).toBe(IMPORT_COLOR_CODE_INVALID)
  })

  it('AI 未提供 color → 正常自动配色且无任何诊断', () => {
    const courses = [makeCourse({ sourceIndex: 0 })]
    const colors = assignImportColors(courses)
    expect(PRESET_HEXES).toContain(colors.get(0))
    expect(collectImportColorDiagnostics(courses)).toEqual([])
  })

  it('同名课程（标准化后）多条记录始终同色', () => {
    const courses = [
      makeCourse({ sourceIndex: 0, name: '线性代数' }),
      makeCourse({ sourceIndex: 1, name: ' 线性代数 ' }),
      makeCourse({ sourceIndex: 2, name: 'Data Structure' }),
      makeCourse({ sourceIndex: 3, name: 'data structure' })
    ]
    const colors = assignImportColors(courses)
    // 中文名 trim 归一化后同色
    expect(colors.get(1)).toBe(colors.get(0))
    // 英文名大小写折叠后同色
    expect(colors.get(3)).toBe(colors.get(2))
  })

  it('同名组内首个合法 AI 色生效，后续条目的 AI 色不覆盖', () => {
    const courses = [
      makeCourse({ sourceIndex: 0, name: '大学物理', requestedColor: OFF_PALETTE_HEX }),
      makeCourse({ sourceIndex: 1, name: '大学物理', requestedColor: COURSE_COLOR_PRESETS[5].hex }),
      makeCourse({ sourceIndex: 2, name: '大学物理', requestedColor: COURSE_COLOR_PRESETS[6].hex })
    ]
    const colors = assignImportColors(courses)
    expect(colors.get(0)).toBe(PRESET_HEXES[5])
    expect(colors.get(1)).toBe(PRESET_HEXES[5])
    expect(colors.get(2)).toBe(PRESET_HEXES[5])
  })

  it('不同课程颜色分布基本均衡（12 门课覆盖满色板）', () => {
    const courses = Array.from({ length: COURSE_COLOR_PRESETS.length }, (_, i) =>
      makeCourse({ sourceIndex: i, name: `课程-${i}` })
    )
    const colors = assignImportColors(courses)
    const used = new Set(colors.values())
    expect(used.size).toBe(COURSE_COLOR_PRESETS.length)
  })

  it('相同输入重复运行结果完全一致（确定性）', () => {
    const courses = Array.from({ length: 8 }, (_, i) =>
      makeCourse({ sourceIndex: i, name: `课程-${i}` })
    )
    const first = entriesOf(assignImportColors(courses))
    const second = entriesOf(assignImportColors(courses))
    expect(second).toEqual(first)
    expect(first).toHaveLength(courses.length)
  })

  it('自动配色绝不产生色板外颜色', () => {
    const courses = Array.from({ length: 30 }, (_, i) =>
      makeCourse({ sourceIndex: i, name: `课程-${i}` })
    )
    const colors = assignImportColors(courses)
    expect(colors.size).toBe(30)
    for (const hex of colors.values()) {
      expect(PRESET_HEXES).toContain(hex)
    }
  })

  it('existingColors 统计被正确考虑（已用色被降权）', () => {
    const courses = [makeCourse({ sourceIndex: 0, name: '唯一课程' })]
    const withoutExisting = assignImportColors(courses).get(0)
    // 把「不使用 existing 时会选中的颜色」标为已高频使用，应改为其它颜色
    const heavy = withoutExisting as string
    const colors = assignImportColors(courses, [heavy, heavy, heavy])
    expect(colors.get(0)).toBeDefined()
    expect(colors.get(0)).not.toBe(heavy)
    expect(PRESET_HEXES).toContain(colors.get(0))
  })

  it('existingColors 中的非色板/非法值被安全忽略', () => {
    const courses = [makeCourse({ sourceIndex: 0, name: '课程A' })]
    expect(() => assignImportColors(courses, ['#123456', 'oops', ''])).not.toThrow()
    expect(PRESET_HEXES).toContain(assignImportColors(courses, ['#123456']).get(0))
  })

  it('空输入 → 空 Map', () => {
    expect(assignImportColors([]).size).toBe(0)
  })
})

describe('setCourseGroupColor / resetImportColors（#818 用户覆盖）', () => {
  it('override 优先于 AI 推荐，且返回新 Map 不修改入参', () => {
    const courses = [makeCourse({ sourceIndex: 0, name: '数据结构', requestedColor: COURSE_COLOR_PRESETS[0].hex })]
    const base = assignImportColors(courses)
    expect(base.get(0)).toBe(PRESET_HEXES[0])

    const overridden = setCourseGroupColor(courses, base, '数据结构', COURSE_COLOR_PRESETS[7].hex)
    expect(overridden.get(0)).toBe(PRESET_HEXES[7])
    // 入参 Map 未被原地修改
    expect(base.get(0)).toBe(PRESET_HEXES[0])
    expect(overridden).not.toBe(base)
  })

  it('修改一条同名课程时组内全部条目同步', () => {
    const courses = [
      makeCourse({ sourceIndex: 0, name: '英语' }),
      makeCourse({ sourceIndex: 1, name: '英语' }),
      makeCourse({ sourceIndex: 2, name: '体育' })
    ]
    const base = assignImportColors(courses)
    const overridden = setCourseGroupColor(courses, base, '英语', COURSE_COLOR_PRESETS[4].hex)
    expect(overridden.get(0)).toBe(PRESET_HEXES[4])
    expect(overridden.get(1)).toBe(PRESET_HEXES[4])
    // 其它课程不受影响
    expect(overridden.get(2)).toBe(base.get(2))
  })

  it('override 非法颜色被忽略（保持原状）', () => {
    const courses = [makeCourse({ sourceIndex: 0, name: '体育' })]
    const base = assignImportColors(courses)
    const overridden = setCourseGroupColor(courses, base, '体育', 'not-a-color')
    expect(entriesOf(overridden)).toEqual(entriesOf(base))
  })

  it('resetImportColors 丢弃全部 override，回到初始策略', () => {
    const courses = [makeCourse({ sourceIndex: 0, name: '操作系统', requestedColor: COURSE_COLOR_PRESETS[2].hex })]
    const base = assignImportColors(courses)
    const overridden = setCourseGroupColor(courses, base, '操作系统', COURSE_COLOR_PRESETS[9].hex)
    expect(overridden.get(0)).toBe(PRESET_HEXES[9])

    const reset = resetImportColors(courses)
    expect(reset.get(0)).toBe(PRESET_HEXES[2])
    expect(entriesOf(reset)).toEqual(entriesOf(base))
  })
})

describe('collectImportColorDiagnostics（#818 诊断汇总）', () => {
  it('同名课程只报一次，且不阻断（全部为 warning）', () => {
    const courses = [
      makeCourse({ sourceIndex: 0, name: '算法', requestedColor: OFF_PALETTE_HEX }),
      makeCourse({ sourceIndex: 1, name: '算法', requestedColor: OFF_PALETTE_HEX })
    ]
    const diagnostics = collectImportColorDiagnostics(courses)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics.every((d) => d.level === 'warning')).toBe(true)
  })

  it('空白字符串视为未提供，不产生诊断', () => {
    const courses = [makeCourse({ sourceIndex: 0, requestedColor: '   ' })]
    expect(collectImportColorDiagnostics(courses)).toEqual([])
  })
})
