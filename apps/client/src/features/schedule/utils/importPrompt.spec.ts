/**
 * #827 AI 提示词契约 —— 提示词与 Parser 必须保持一致。
 *
 * 提示词是「标准输出严格」的落点：外部 AI 只有拿到明确的分隔符要求，
 * 才不会产出非 ASCII 横杠。因此这里把提示词里的写法当成契约来钉：
 *   - periods 必须明确要求半角 ASCII 连字符；
 *   - 提示词中给出的 periods 示例必须真的能被 Parser 解析（防两侧漂移）；
 *   - 「格式示例」JSON 必须端到端可解析。
 */
import { describe, expect, it } from 'vitest'
import { buildAiCourseImportExample, buildAiCourseImportPrompt } from './importPrompt'
import { parseAiCourseImport } from './importParser'

describe('buildAiCourseImportPrompt（#827）', () => {
  it('明确要求 periods 只用半角 ASCII 连字符', () => {
    const prompt = buildAiCourseImportPrompt()
    expect(prompt).toContain('连字符只能是 ASCII 的「-」')
    expect(prompt).toContain('不要使用波浪号')
  })

  it('回归哨兵：不再保留「periods：节次，使用「3-4」这种起止格式」的模糊描述', () => {
    expect(buildAiCourseImportPrompt()).not.toContain('periods：节次，使用「3-4」这种起止格式')
  })

  it('weeks 也声明统一使用半角连字符', () => {
    expect(buildAiCourseImportPrompt()).toContain('连字符同样只用半角「-」')
  })

  it('提示词里出现的 periods 示例全部可被 Parser 解析（防提示词与实现漂移）', () => {
    const prompt = buildAiCourseImportPrompt()
    const samples = [...prompt.matchAll(/「(\d+-\d+)」/g)].map((match) => match[1])
    // 提示词里应当给出具体示例，而不是只有抽象描述
    expect(samples.length).toBeGreaterThan(0)

    for (const sample of samples) {
      const parsed = parseAiCourseImport(
        JSON.stringify([{ name: '课', weekday: 1, periods: sample, weeks: '1-2' }])
      )
      expect(parsed.ok, `提示词示例 ${sample} 应可解析`).toBe(true)
    }
  })
})

describe('buildAiCourseImportExample（#827）', () => {
  it('格式示例可被 Parser 直接解析（示例即契约）', () => {
    const parsed = parseAiCourseImport(buildAiCourseImportExample())
    expect(parsed.ok).toBe(true)
    expect(parsed.courses).toHaveLength(2)
    expect(parsed.courses[0]).toMatchObject({
      name: '电路理论',
      weekday: 2,
      period: 3,
      djs: 2
    })
    expect(parsed.courses[1]).toMatchObject({
      name: '大学体育',
      weekday: 4,
      period: 5,
      djs: 2
    })
    expect(parsed.courses[1].weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15])
    expect(parsed.diagnostics.filter((d) => d.level === 'error')).toEqual([])
  })

  it('示例中的节次全部是 ASCII 半角写法', () => {
    const example = buildAiCourseImportExample()
    expect(example).toContain('"periods": "3-4"')
    expect(example).toContain('"periods": "5-6"')
  })
})
