/**
 * #827 解析诊断定位文案 —— 纯函数单测。
 *
 * 覆盖：第 N 条 / 课程名 / 字段 / 原始值的组装、缺失片段的降级、
 * 全局诊断（无 sourceIndex）不出现「第 NaN 条」、中英双语、
 * 以及「Parser 诊断 → 用户可见文案」的端到端契约。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../../../utils/app_i18n'
import { parseAiCourseImport } from './importParser'
import type { ImportDiagnostic } from './importTypes'
import { describeImportDiagnostic, describeImportDiagnosticLocation } from './importDiagnostics'

const PERIODS_MESSAGE = '节次无法解析或超出范围（起始 1..11，末节不超过 11）'

const makeDiag = (overrides: Partial<ImportDiagnostic> = {}): ImportDiagnostic => ({
  level: 'error',
  code: 'invalid_periods',
  message: PERIODS_MESSAGE,
  ...overrides
})

// 用例显式切换语言，跑完复位，避免污染其他 spec（t() 读模块级 locale）
afterEach(() => setLocale('zh-CN'))

describe('describeImportDiagnosticLocation（#827）', () => {
  it('课程名 + 字段 + 原始值齐全 → 完整定位', () => {
    const diag = makeDiag({
      field: 'periods',
      sourceIndex: 1,
      courseName: '大学物理',
      rawValue: '12\u201113'
    })
    expect(describeImportDiagnosticLocation(diag)).toBe('第 2 条「大学物理」 · 节次 · 原始值：12\u201113')
  })

  it('缺课程名 / 缺原始值时逐级降级，不出现空占位', () => {
    expect(
      describeImportDiagnosticLocation(makeDiag({ field: 'weeks', sourceIndex: 0 }))
    ).toBe('第 1 条 · 周次')

    expect(
      describeImportDiagnosticLocation(makeDiag({ sourceIndex: 4, rawValue: '周八' }))
    ).toBe('第 5 条 · 原始值：周八')
  })

  it('无 sourceIndex（全局诊断）→ 返回空串，由调用方退回只展示 message', () => {
    expect(describeImportDiagnosticLocation(makeDiag({ code: 'json_body_not_found' }))).toBe('')
  })

  it('sourceIndex 是 0 基下标，展示时统一 +1', () => {
    expect(describeImportDiagnosticLocation(makeDiag({ sourceIndex: 0 }))).toBe('第 1 条')
  })

  it('未收录的字段名原样展示（宁可难看也不隐藏信息）', () => {
    expect(describeImportDiagnosticLocation(makeDiag({ sourceIndex: 0, field: '课程名' }))).toBe(
      '第 1 条 · 课程名'
    )
  })

  it('英文语言下整行英文化', () => {
    setLocale('en')
    const diag = makeDiag({
      field: 'periods',
      sourceIndex: 1,
      courseName: '大学物理',
      rawValue: '12\u201113'
    })
    expect(describeImportDiagnosticLocation(diag)).toBe(
      'Entry 2 "大学物理" · periods · raw value: 12\u201113'
    )
  })
})

describe('describeImportDiagnostic（#827）', () => {
  it('有定位信息：定位在前、message 在后', () => {
    const diag = makeDiag({
      field: 'periods',
      sourceIndex: 1,
      courseName: '大学物理',
      rawValue: '12\u201113'
    })
    expect(describeImportDiagnostic(diag)).toBe(
      `第 2 条「大学物理」 · 节次 · 原始值：12\u201113 · ${PERIODS_MESSAGE}`
    )
  })

  it('无定位信息：与 message 等价（不产生多余分隔符）', () => {
    const message = '检测到多个 JSON 主体，无法安全确定哪一个是课表数据'
    expect(
      describeImportDiagnostic(makeDiag({ code: 'multiple_json_bodies', message }))
    ).toBe(message)
  })

  it('端到端：Parser 诊断 → 用户可见文案可定位到第几条与原始值', () => {
    const parsed = parseAiCourseImport(
      JSON.stringify([{ name: '大学物理', weekday: 3, periods: '12\u201113', weeks: '1-2' }])
    )
    const firstError = parsed.diagnostics.find((item) => item.level === 'error')
    expect(firstError).toBeDefined()
    expect(describeImportDiagnostic(firstError as ImportDiagnostic)).toBe(
      `第 1 条「大学物理」 · 节次 · 原始值：12\u201113 · ${PERIODS_MESSAGE}`
    )
  })

  it('端到端：视觉合法但码点异常的节次不再报错（#827 主场景）', () => {
    const parsed = parseAiCourseImport(
      JSON.stringify([{ name: '大学物理', weekday: 3, periods: '7\u20118', weeks: '1-2' }])
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.courses[0]).toMatchObject({ period: 7, djs: 2 })
  })
})

describe('describeImportDiagnostic（#819：按 code 取 i18n 词）', () => {
  it('zh-CN 下字典词与 Parser 内置 message 逐字一致（输出不变）', () => {
    const diag = makeDiag({ code: 'invalid_color', message: '颜色格式无法识别，已忽略该颜色' })
    expect(describeImportDiagnostic(diag)).toBe('颜色格式无法识别，已忽略该颜色')
  })

  it('en 语言下按 code 输出英文文案（不再透出硬编码中文）', () => {
    setLocale('en')
    const diag = makeDiag({ code: 'missing_teacher', message: '缺少教师信息' })
    expect(describeImportDiagnostic(diag)).toBe('Teacher information is missing')
  })

  it('带占位符的 code：unknown_field 按字段键名重建文案', () => {
    const diag = makeDiag({ code: 'unknown_field', field: 'foo', message: '兜底' })
    expect(describeImportDiagnostic(diag)).toBe('未识别的字段「foo」已忽略')
  })

  it('带占位符的 code：merged_duplicate_weeks 重建条数与课程名', () => {
    const diag = makeDiag({
      code: 'merged_duplicate_weeks',
      mergedCount: 3,
      courseName: '高等数学',
      message: '兜底'
    })
    expect(describeImportDiagnostic(diag)).toBe('已自动合并 3 条仅周次不同的重复记录（高等数学）')
  })

  it('占位参数缺失时回退内置 message（绝不输出残缺模板）', () => {
    const diag = makeDiag({ code: 'unknown_field', message: '未识别的字段已忽略' })
    expect(describeImportDiagnostic(diag)).toBe('未识别的字段已忽略')

    const merged = makeDiag({
      code: 'merged_duplicate_weeks',
      courseName: '高等数学',
      message: '合并兜底'
    })
    expect(describeImportDiagnostic(merged)).toBe('合并兜底')
  })

  it('未收录的 code 直接使用内置 message', () => {
    const diag = makeDiag({ code: 'future_unknown_code', message: '未知诊断' })
    expect(describeImportDiagnostic(diag)).toBe('未知诊断')
  })
})
