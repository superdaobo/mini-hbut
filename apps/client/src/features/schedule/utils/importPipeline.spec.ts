/**
 * AI 课表导入 —— 端到端集成测试向量（Epic #815 / #822）。
 *
 * 本文件不测单个模块，而是把整条链路串起来验证：
 *   parseAiCourseImport → mergeImportCourses → detectImportDuplicates
 *   → detectImportConflicts → assignImportColors → buildPersistPayload
 *
 * 用例编号与 Epic #822 的「集成测试向量」一一对应：
 *   Case A 标准 AI JSON   Case B 常见 AI 包装   Case C 按周拆散
 *   Case D 脏数据         Case E 重复 / 冲突     Case F 配色
 *
 * 目的：确保 Parser / Merge / Conflict / Colors / Commit 组成的是
 * 一条稳定的生产链路，而不是多个各自通过的孤立模块。
 */
import { describe, expect, it } from 'vitest'

import { parseAiCourseImport } from './importParser'
import { mergeImportCourses, detectImportDuplicates } from './importMerge'
import { detectImportConflicts } from './importConflict'
import { assignImportColors, setCourseGroupColor, resetImportColors } from './importColors'
import { buildPersistPayload } from './importCommit'
import { COURSE_COLOR_PRESETS, findPresetByHex } from '../../../utils/course_color'
import type { ImportExistingCourse, ImportPreviewCourse } from './importTypes'

/** 合法色板色（湖蓝），用于断言 AI 推荐色被采用 */
const PALETTE_LAKE = COURSE_COLOR_PRESETS[0].hex
/** 合法 hex 但不在色板内，用于断言"越板色被拒" */
const OUT_OF_PALETTE = '#123456'

/**
 * 复刻 useScheduleImport 的编排顺序，得到预览态。
 * 与真实组合式函数保持同一调用序列，避免测试与实现漂移。
 */
const runPipeline = (text: string, existing: ImportExistingCourse[] = []) => {
  const parsed = parseAiCourseImport(text)
  const merged = mergeImportCourses(parsed.courses)
  const duplicates = detectImportDuplicates(merged.courses, existing)
  const conflicts = detectImportConflicts(merged.courses, existing)
  const colors = assignImportColors(merged.courses, [])

  const preview: ImportPreviewCourse[] = merged.courses.map((course, index) => {
    const duplicateKind = duplicates[index] || 'none'
    return {
      key: `import-${course.sourceIndex}`,
      course,
      selected: duplicateKind !== 'exact',
      duplicateKind,
      conflicts: conflicts[index] || [],
      diagnostics: course.diagnostics,
      colorOverride: colors.get(course.sourceIndex)
    }
  })

  return { parsed, merged, duplicates, conflicts, colors, preview }
}

/** 断言某颜色确实来自允许色板 */
const expectInPalette = (hex: string) => {
  expect(findPresetByHex(hex), `颜色 ${hex} 应属于允许色板`).not.toBeNull()
}

// ────────────────────────────────────────────────────────────
// Case A：标准 AI JSON
// ────────────────────────────────────────────────────────────
describe('Case A：标准 AI JSON', () => {
  const courses = [
    { name: '电路理论', teacher: '张老师', room: '实2-C301', weekday: '周二', periods: '3-4', weeks: '1-16', color: PALETTE_LAKE },
    { name: '大学物理', teacher: '李老师', room: '理-201', weekday: '周三', periods: '1-2', weeks: '1-16' },
    { name: '高等数学', teacher: '王老师', room: 'A-101', weekday: '周一', periods: '1-2', weeks: '1-18' },
    { name: '线性代数', teacher: '赵老师', room: 'A-102', weekday: '周一', periods: '3-4', weeks: '1-18' },
    { name: '程序设计', teacher: '孙老师', room: '机房-1', weekday: '周二', periods: '5-6', weeks: '2-16' },
    { name: '数据结构', teacher: '周老师', room: '机房-2', weekday: '周三', periods: '5-6', weeks: '2-16' },
    { name: '大学英语', teacher: '吴老师', room: 'B-301', weekday: '周四', periods: '1-2', weeks: '1-16' },
    { name: '体育', teacher: '郑老师', room: '西区操场', weekday: '周四', periods: '5-6', weeks: '1-15' },
    { name: '马克思主义原理', teacher: '冯老师', room: 'C-101', weekday: '周五', periods: '3-4', weeks: '1-16' },
    { name: '概率论', teacher: '陈老师', room: 'A-203', weekday: '周五', periods: '5-6', weeks: '1-16' },
    { name: '数字电路', teacher: '褚老师', room: '实2-C302', weekday: '周三', periods: '7-8', weeks: '1-16' },
    { name: '工程制图', teacher: '卫老师', room: 'D-105', weekday: '周五', periods: '7-8', weeks: '1-16' }
  ]

  const text = JSON.stringify({
    format: 'mini-hbut-course-import',
    version: 1,
    courses
  })

  it('解析出全部课程且无 hard error', () => {
    const { parsed } = runPipeline(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.rawCount).toBe(12)
    expect(parsed.courses).toHaveLength(12)
    expect(parsed.diagnostics.filter((d) => d.level === 'error')).toHaveLength(0)
  })

  it('weekday / periods / weeks 均被标准化', () => {
    const { parsed } = runPipeline(text)
    const circuit = parsed.courses.find((c) => c.name === '电路理论')
    expect(circuit?.weekday).toBe(2)
    expect(circuit?.period).toBe(3)
    expect(circuit?.djs).toBe(2)
    expect(circuit?.weeks).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
  })

  it('AI 提供的合法色板色被采用，其余自动配色且全部落在色板内', () => {
    const { colors } = runPipeline(text)
    expect(colors.get(0)).toBe(PALETTE_LAKE)
    for (const hex of colors.values()) expectInPalette(hex)
  })

  it('semester / id / source_id 不会进入持久化 payload', () => {
    const { preview } = runPipeline(text)
    const payload = buildPersistPayload(preview, '2024-2025-1')
    for (const item of payload) {
      expect(item.semester).toBe('2024-2025-1')
      expect(item).not.toHaveProperty('id')
      expect(item).not.toHaveProperty('source_id')
    }
  })
})

// ────────────────────────────────────────────────────────────
// Case B：常见 AI 包装
// ────────────────────────────────────────────────────────────
describe('Case B：常见 AI 包装（code fence / 中文别名 / 单双周）', () => {
  const raw = {
    courses: [
      { 课程名: '大学体育', 教师: '李老师', 教室: '西区操场', 星期: '星期二', 节次: '第3-4节', 周次: '1-15单' },
      { 课程名称: '形势与政策', 任课老师: '钱老师', 上课地点: 'C-201', 周几: '星期四', 上课节次: '5~6', 上课周次: '2-16双' },
      { 课程: '创新创业', 老师: '孙老师', 地点: 'D-301', 星期: '星期日', 节次: '7-8', 周次: '1-4,6,8-12' }
    ]
  }
  // 模拟外部 AI 最常见的输出形态：带解释文字 + Markdown 代码块
  const text = `好的，以下是根据截图识别出的课表：

\`\`\`json
${JSON.stringify(raw, null, 2)}
\`\`\`

请注意核对信息是否准确。`

  it('能穿透 Markdown code fence 与前后说明文字', () => {
    const { parsed } = runPipeline(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.courses).toHaveLength(3)
  })

  it('中文字段别名被正确映射', () => {
    const { parsed } = runPipeline(text)
    const pe = parsed.courses.find((c) => c.name === '大学体育')
    expect(pe).toMatchObject({ teacher: '李老师', room: '西区操场', weekday: 2, period: 3, djs: 2 })
  })

  it('单周 / 双周 / 不连续周被正确展开', () => {
    const { parsed } = runPipeline(text)
    expect(parsed.courses.find((c) => c.name === '大学体育')?.weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15])
    expect(parsed.courses.find((c) => c.name === '形势与政策')?.weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
    expect(parsed.courses.find((c) => c.name === '创新创业')?.weeks).toEqual([1, 2, 3, 4, 6, 8, 9, 10, 11, 12])
  })
})

// ────────────────────────────────────────────────────────────
// Case C：AI 按周拆散
// ────────────────────────────────────────────────────────────
describe('Case C：AI 按周拆散应自动合并', () => {
  const text = JSON.stringify({
    courses: [1, 2, 3, 4, 5, 6, 7, 8].map((week) => ({
      name: '电路理论',
      teacher: '张老师',
      room: '实2-C301',
      weekday: '周二',
      periods: '3-4',
      weeks: String(week)
    }))
  })

  it('一周一条收敛为单条逻辑课程', () => {
    const { parsed, merged } = runPipeline(text)
    expect(parsed.courses).toHaveLength(8)
    expect(merged.courses).toHaveLength(1)
    expect(merged.mergedCount).toBe(7)
    expect(merged.courses[0].weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('合并后仍只产生一条持久化记录', () => {
    const { preview } = runPipeline(text)
    expect(buildPersistPayload(preview, 'S1')).toHaveLength(1)
  })
})

// ────────────────────────────────────────────────────────────
// Case D：脏数据
// ────────────────────────────────────────────────────────────
describe('Case D：脏数据容错', () => {
  const text = JSON.stringify({
    courses: [
      { name: '缺老师课', room: 'A-1', weekday: '周一', periods: '1-2', weeks: '1-16' },
      { name: '缺地点课', teacher: '某老师', weekday: '周一', periods: '3-4', weeks: '1-16' },
      { name: '越板色课', teacher: '某老师', room: 'A-3', weekday: '周一', periods: '5-6', weeks: '1-16', color: OUT_OF_PALETTE },
      { name: '多余字段课', teacher: '某老师', room: 'A-4', weekday: '周一', periods: '7-8', weeks: '1-16', 备注: '无关字段' },
      { name: '非法星期课', teacher: '某老师', room: 'A-5', weekday: '周八', periods: '1-2', weeks: '1-16' },
      { name: '非法周次课', teacher: '某老师', room: 'A-6', weekday: '周一', periods: '1-2', weeks: 'abc' }
    ]
  })

  it('非法条目被 hard error 挡下，合法条目仍可导入', () => {
    const { parsed } = runPipeline(text)
    expect(parsed.rawCount).toBe(6)
    expect(parsed.courses).toHaveLength(4)
    expect(parsed.diagnostics.some((d) => d.level === 'error')).toBe(true)
    expect(parsed.courses.map((c) => c.name)).not.toContain('非法星期课')
    expect(parsed.courses.map((c) => c.name)).not.toContain('非法周次课')
  })

  it('缺 teacher / room 只产生 warning，不阻断导入', () => {
    const { parsed, preview } = runPipeline(text)
    const noTeacher = parsed.courses.find((c) => c.name === '缺老师课')
    expect(noTeacher?.teacher).toBe('')
    expect(noTeacher?.diagnostics.some((d) => d.level === 'warning')).toBe(true)
    expect(preview.find((p) => p.course.name === '缺老师课')?.selected).toBe(true)
  })

  it('越板色与非法格式色被拒绝并自动兜底为色板内颜色', () => {
    const { preview } = runPipeline(text)
    const item = preview.find((p) => p.course.name === '越板色课')
    expect(item?.colorOverride).not.toBe(OUT_OF_PALETTE)
    expectInPalette(String(item?.colorOverride))
  })

  it('未知附加字段不进入持久化 payload', () => {
    const { preview } = runPipeline(text)
    const payload = buildPersistPayload(preview, 'S1')
    for (const item of payload) {
      expect(Object.keys(item).sort()).toEqual(
        ['color', 'djs', 'name', 'period', 'room', 'semester', 'teacher', 'weekday', 'weeks'].sort()
      )
    }
  })
})

// ────────────────────────────────────────────────────────────
// Case E：重复 / 冲突
// ────────────────────────────────────────────────────────────
describe('Case E：重复检测与冲突分析', () => {
  const official: ImportExistingCourse = {
    id: 'official-1',
    name: '高等数学',
    teacher: '王老师',
    room: 'A-101',
    weekday: 1,
    period: 1,
    djs: 2,
    weeks: Array.from({ length: 16 }, (_, i) => i + 1),
    source: 'official'
  }
  const custom: ImportExistingCourse = {
    id: 'custom-1',
    name: '晚自习',
    teacher: '',
    room: '图书馆',
    weekday: 2,
    period: 9,
    djs: 2,
    weeks: [1, 2, 3, 4],
    source: 'custom'
  }
  const existing = [official, custom]

  it('与 official 完全重复 → exact，默认不勾选', () => {
    const text = JSON.stringify({
      courses: [{ name: '高等数学', teacher: '王老师', room: 'A-101', weekday: '周一', periods: '1-2', weeks: '1-16' }]
    })
    const { preview } = runPipeline(text, existing)
    expect(preview[0].duplicateKind).toBe('exact')
    expect(preview[0].selected).toBe(false)
    // 精确重复默认不勾选 ⇒ 本批次没有任何条目可提交。
    // （buildPersistPayload 是 1:1 映射不做筛选，真正的筛选在 commitImportCourses，
    //   其规则由 importCommit.spec.ts 覆盖。）
    expect(preview.filter((item) => item.selected && item.duplicateKind !== 'exact')).toHaveLength(0)
  })

  it('与 custom 完全重复 → exact', () => {
    const text = JSON.stringify({
      courses: [{ name: '晚自习', room: '图书馆', weekday: '周二', periods: '9-10', weeks: '1-4' }]
    })
    const { preview } = runPipeline(text, existing)
    expect(preview[0].duplicateKind).toBe('exact')
  })

  it('batch 内完全相同的两行会被自动合并，而不是重复写入', () => {
    const row = { name: '新课程', teacher: 'T', room: 'R', weekday: '周一', periods: '1-2', weeks: '1-8' }
    const { parsed, merged, preview } = runPipeline(JSON.stringify({ courses: [row, { ...row }] }))
    // 解析层仍是两条原始条目
    expect(parsed.courses).toHaveLength(2)
    // 归一化阶段收敛为一条，因此不会产生重复写入
    expect(merged.courses).toHaveLength(1)
    expect(merged.mergedCount).toBe(1)
    expect(preview).toHaveLength(1)
  })

  it('时间冲突（同星期 + 节次重叠 + 周次重叠）→ 产生 conflict 且带 overlapWeeks', () => {
    const text = JSON.stringify({
      courses: [{ name: '冲突课', teacher: 'T', room: 'R', weekday: '周一', periods: '2-3', weeks: '5-8' }]
    })
    const { preview } = runPipeline(text, existing)
    expect(preview[0].conflicts.length).toBeGreaterThan(0)
    const conflict = preview[0].conflicts[0]
    expect(conflict.source).toBe('official')
    expect(conflict.overlapWeeks).toEqual([5, 6, 7, 8])
  })

  it('冲突只是 warning：条目仍可勾选并进入 payload', () => {
    const text = JSON.stringify({
      courses: [{ name: '冲突课', teacher: 'T', room: 'R', weekday: '周一', periods: '2-3', weeks: '5-8' }]
    })
    const { preview } = runPipeline(text, existing)
    expect(preview[0].selected).toBe(true)
    expect(buildPersistPayload(preview, 'S1')).toHaveLength(1)
  })

  it('星期 / 节次 / 周次任一不重叠 → 无冲突', () => {
    const text = JSON.stringify({
      courses: [
        { name: '不同星期', weekday: '周三', periods: '1-2', weeks: '1-16' },
        { name: '节次不重叠', weekday: '周一', periods: '5-6', weeks: '1-16' },
        { name: '周次不重叠', weekday: '周一', periods: '1-2', weeks: '20-22' }
      ]
    })
    const { preview } = runPipeline(text, existing)
    expect(preview.every((item) => item.conflicts.length === 0)).toBe(true)
  })

  it('同名但地点不同 → possible 重复，仅提示不自动删除', () => {
    const text = JSON.stringify({
      courses: [{ name: '高等数学', teacher: '王老师', room: 'B-999', weekday: '周一', periods: '1-2', weeks: '1-16' }]
    })
    const { preview } = runPipeline(text, existing)
    expect(preview[0].duplicateKind).toBe('possible')
    expect(preview[0].selected).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// Case F：配色
// ────────────────────────────────────────────────────────────
describe('Case F：配色策略', () => {
  const names = ['课程甲', '课程乙', '课程丙', '课程丁', '课程戊']

  it('AI 全部不给 color → 全部由色板均衡分配', () => {
    const text = JSON.stringify({
      courses: names.map((name, i) => ({ name, weekday: '周一', periods: `${i + 1}-${i + 2}`, weeks: '1-8' }))
    })
    const { colors } = runPipeline(text)
    expect(colors.size).toBe(names.length)
    for (const hex of colors.values()) expectInPalette(hex)
  })

  it('同名多段课程颜色一致', () => {
    const text = JSON.stringify({
      courses: [
        { name: '电路理论', weekday: '周二', periods: '3-4', weeks: '1-8' },
        { name: '电路理论', weekday: '周五', periods: '5-6', weeks: '9-16' }
      ]
    })
    const { parsed, colors } = runPipeline(text)
    const first = colors.get(parsed.courses[0].sourceIndex)
    const second = colors.get(parsed.courses[1].sourceIndex)
    expect(first).toBe(second)
  })

  it('用户覆盖同名课程颜色时，组内同步更新', () => {
    const text = JSON.stringify({
      courses: [
        { name: '电路理论', weekday: '周二', periods: '3-4', weeks: '1-8' },
        { name: '电路理论', weekday: '周五', periods: '5-6', weeks: '9-16' },
        { name: '大学物理', weekday: '周三', periods: '1-2', weeks: '1-8' }
      ]
    })
    const { parsed, colors } = runPipeline(text)
    const target = COURSE_COLOR_PRESETS[5].hex
    const next = setCourseGroupColor(parsed.courses, colors, '电路理论', target)

    expect(next.get(parsed.courses[0].sourceIndex)).toBe(target)
    expect(next.get(parsed.courses[1].sourceIndex)).toBe(target)
    // 不同课程名不受影响
    expect(next.get(parsed.courses[2].sourceIndex)).toBe(colors.get(parsed.courses[2].sourceIndex))
  })

  it('重置配色回到初始策略（丢弃用户覆盖）', () => {
    const text = JSON.stringify({
      courses: [{ name: '电路理论', weekday: '周二', periods: '3-4', weeks: '1-8' }]
    })
    const { parsed, colors } = runPipeline(text)
    const original = colors.get(parsed.courses[0].sourceIndex)
    const overridden = setCourseGroupColor(parsed.courses, colors, '电路理论', COURSE_COLOR_PRESETS[7].hex)
    expect(overridden.get(parsed.courses[0].sourceIndex)).toBe(COURSE_COLOR_PRESETS[7].hex)

    const reset = resetImportColors(parsed.courses, [])
    expect(reset.get(parsed.courses[0].sourceIndex)).toBe(original)
  })

  it('配色结果确定性：相同输入重复运行结果完全一致', () => {
    const text = JSON.stringify({
      courses: names.map((name, i) => ({ name, weekday: '周一', periods: `${i + 1}-${i + 2}`, weeks: '1-8' }))
    })
    const a = runPipeline(text).colors
    const b = runPipeline(text).colors
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
  })
})
