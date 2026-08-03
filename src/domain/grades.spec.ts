/**
 * grade domain 单元测试：outcome 解析、绩点规则（官方优先/数字与定性估算）、
 * 字段别名兼容、标签派生、排序分数与边界输入。
 */
import { describe, expect, it } from 'vitest'
import {
  GradeOutcome,
  estimateGradePoint,
  formatPointNumber,
  normalizeCourseName,
  normalizeCourseNature,
  normalizeGradeRecord,
  normalizeGradeRecords,
  parseScoreNumber,
  resolveOutcome,
  resolveSortScore
} from './grades.js'
import { batchFixtureInputs, edgeCaseFixtures, gradeFixtures } from './grades.fixtures.js'

describe('normalizeGradeRecord（fixtures 全量断言）', () => {
  for (const fixture of gradeFixtures) {
    it(fixture.name, () => {
      const view = normalizeGradeRecord(fixture.raw, 7)
      const { expect: expected } = fixture

      expect(view.originIndex).toBe(7)
      expect(view.outcome).toBe(expected.outcome)

      if (expected.scoreNumber !== undefined) expect(view.scoreNumber).toBe(expected.scoreNumber)
      if (expected.gradePoint !== undefined) expect(view.gradePoint).toBe(expected.gradePoint)
      if (expected.gradePointEstimated !== undefined) {
        expect(view.gradePointEstimated).toBe(expected.gradePointEstimated)
      }
      if (expected.creditGradePoint !== undefined) expect(view.creditGradePoint).toBe(expected.creditGradePoint)
      if (expected.isPass !== undefined) expect(view.isPass).toBe(expected.isPass)
      if (expected.isFailed !== undefined) expect(view.isFailed).toBe(expected.isFailed)
      if (expected.isMakeup !== undefined) expect(view.isMakeup).toBe(expected.isMakeup)
      if (expected.isDeferred !== undefined) expect(view.isDeferred).toBe(expected.isDeferred)
      if (expected.isExempt !== undefined) expect(view.isExempt).toBe(expected.isExempt)
      if (expected.sortScore !== undefined) expect(view.sortScore).toBe(expected.sortScore)
      if (expected.term !== undefined) expect(view.term).toBe(expected.term)
      if (expected.course_name !== undefined) expect(view.course_name).toBe(expected.course_name)
      if (expected.course_credit !== undefined) expect(view.course_credit).toBe(expected.course_credit)
      if (expected.teacher !== undefined) expect(view.teacher).toBe(expected.teacher)
      if (expected.entryTeacher !== undefined) expect(view.entryTeacher).toBe(expected.entryTeacher)
      if (expected.courseTeacher !== undefined) expect(view.courseTeacher).toBe(expected.courseTeacher)
      if (expected.course_nature !== undefined) expect(view.course_nature).toBe(expected.course_nature)

      if (expected.tagKeys !== undefined) {
        expect(view.statusTags.map((tag) => tag.key)).toEqual(expected.tagKeys)
      }
    })
  }
})

describe('绩点规则', () => {
  it('官方绩点字段优先且不标记估算', () => {
    const view = normalizeGradeRecord({ final_score: '92', xfjd: '4.20' })
    expect(view.gradePoint).toBe(4.2)
    expect(view.gradePointEstimated).toBe(false)
    expect(view.creditGradePoint).toBe('4.2')
  })

  it('无官方绩点时数字成绩估算并标记 estimated', () => {
    const view = normalizeGradeRecord({ final_score: '88' })
    expect(view.gradePoint).toBe(3.8)
    expect(view.gradePointEstimated).toBe(true)
    expect(view.creditGradePoint).toBe('-')
  })

  it('官方 xfjd="0" 是有效官方绩点，不得回退估算', () => {
    const view = normalizeGradeRecord({ final_score: '60', xfjd: '0' })
    expect(view.gradePoint).toBe(0)
    expect(view.gradePointEstimated).toBe(false)
    expect(view.creditGradePoint).toBe('0')
  })

  it('定性成绩按 Rust 参考分数估算绩点，特殊状态不估算', () => {
    const expected = new Map([
      ['优秀', 4.5], ['良好', 3], ['中等', 3], ['合格', 1], ['通过', 1], ['不合格', 0], ['未通过', 0]
    ])
    for (const [text, point] of expected) {
      const view = normalizeGradeRecord({ final_score: text })
      expect(view.gradePoint, text).toBe(point)
      expect(view.gradePointEstimated, text).toBe(true)
    }
    for (const text of ['缺考', '缓考', '免修', '免考', '待录入']) {
      const view = normalizeGradeRecord({ final_score: text })
      expect(view.gradePoint, text).toBeNull()
      expect(view.gradePointEstimated, text).toBe(false)
    }
  })

  it('官方字段优先级 xfjd > fxcj > creditPoint > gpa', () => {
    expect(normalizeGradeRecord({ final_score: '90', xfjd: '4.0', fxcj: '3.0' }).gradePoint).toBe(4)
    expect(normalizeGradeRecord({ final_score: '90', fxcj: '3.0', creditPoint: '2.0' }).gradePoint).toBe(3)
    expect(normalizeGradeRecord({ final_score: '90', creditPoint: '2.0', gpa: '1.0' }).gradePoint).toBe(2)
    expect(normalizeGradeRecord({ final_score: '90', gpa: '1.0' }).gradePoint).toBe(1)
  })

  it('官方绩点估算互斥：有官方值时绝不估算', () => {
    const view = normalizeGradeRecord({ final_score: '95', xfjd: '4.50' })
    expect(view.gradePointEstimated).toBe(false)
  })

  it('estimateGradePoint 仅对数字成绩返回数值', () => {
    expect(estimateGradePoint(92)).toBe(4.2)
    expect(estimateGradePoint(55)).toBe(0.5)
    expect(estimateGradePoint(null)).toBeNull()
  })

  it('formatPointNumber 去除多余尾零', () => {
    expect(formatPointNumber(4.2)).toBe('4.2')
    expect(formatPointNumber(4)).toBe('4')
    expect(formatPointNumber(0)).toBe('0')
    expect(formatPointNumber(null)).toBe('-')
  })
})

describe('resolveOutcome 文本匹配', () => {
  it('普通数字成绩归一化为 numeric', () => {
    expect(resolveOutcome('92', {})).toBe(GradeOutcome.NUMERIC)
  })

  it('特殊状态优先于混合文本中的数字', () => {
    expect(resolveOutcome('缺考 0', {})).toBe(GradeOutcome.ABSENT)
    expect(resolveOutcome('补考 88', {})).toBe(GradeOutcome.RETAKE)
  })

  it('“不合格”不误判为“合格”', () => {
    expect(resolveOutcome('不合格', {})).toBe(GradeOutcome.UNQUALIFIED)
  })

  it('“未通过”不误判为“通过”', () => {
    expect(resolveOutcome('未通过', {})).toBe(GradeOutcome.FAILED)
  })

  it('“及格”兼容映射为合格', () => {
    expect(resolveOutcome('及格', {})).toBe(GradeOutcome.QUALIFIED)
  })

  it('cjbj/sfsq 字段标记推导特殊状态', () => {
    expect(resolveOutcome('', { cjbj: '2' })).toBe(GradeOutcome.DEFERRED)
    expect(resolveOutcome('', { sfsq: '1' })).toBe(GradeOutcome.DEFERRED)
    expect(resolveOutcome('', { cjbj: '3' })).toBe(GradeOutcome.EXEMPT)
    expect(resolveOutcome('60', { sfbk: '1' })).toBe(GradeOutcome.RETAKE)
    expect(resolveOutcome('60', { cjbj: '1' })).toBe(GradeOutcome.RETAKE)
  })

  it('空文本且无标记 → 待录入', () => {
    expect(resolveOutcome('', {})).toBe(GradeOutcome.PENDING)
  })
})

describe('字段别名兼容（Rust 响应与历史字段）', () => {
  it('标准字段与旧别名字段均可归一化', () => {
    const rust = normalizeGradeRecord({
      term: '2024-2025-1',
      course_name: '课程A',
      course_credit: '2',
      final_score: '90'
    })
    const legacy = normalizeGradeRecord({
      xnxq: '2024-2025-1',
      kcmc: '课程A',
      xf: '2',
      zhcj: '90'
    })
    expect(rust.term).toBe(legacy.term)
    expect(rust.course_name).toBe(legacy.course_name)
    expect(rust.course_credit).toBe(legacy.course_credit)
    expect(rust.final_score).toBe(legacy.final_score)
  })

  it('录入教师别名 cjlrjsxm/jsxm 与 teacher 优先级', () => {
    expect(normalizeGradeRecord({ teacher: 'A', cjlrjsxm: 'B' }).entryTeacher).toBe('A')
    expect(normalizeGradeRecord({ cjlrjsxm: 'B', jsxm: 'C' }).entryTeacher).toBe('B')
    expect(normalizeGradeRecord({ jsxm: 'C' }).entryTeacher).toBe('C')
  })

  it('课程教师别名 course_teacher/courseTeacher', () => {
    expect(normalizeGradeRecord({ course_teacher: 'X' }).courseTeacher).toBe('X')
    expect(normalizeGradeRecord({ courseTeacher: 'Y' }).courseTeacher).toBe('Y')
  })

  it('获得学分别名 hdxf/jd', () => {
    expect(normalizeGradeRecord({ hdxf: '3.0' }).earned_credit).toBe('3.0')
    expect(normalizeGradeRecord({ jd: '3.0' }).earned_credit).toBe('3.0')
  })

  it('yscj 作为最终成绩回退字段', () => {
    expect(normalizeGradeRecord({ yscj: '85' }).final_score).toBe('85')
  })
})

describe('课程名与课程性质', () => {
  it('normalizeCourseName 去除 [xxx] 前缀', () => {
    expect(normalizeCourseName('[TZ2024]高等数学 A')).toBe('高等数学 A')
    expect(normalizeCourseName('高等数学 A')).toBe('高等数学 A')
    expect(normalizeCourseName('')).toBe('')
  })

  it('normalizeCourseNature 代码映射与文本回退', () => {
    expect(normalizeCourseNature({ kcxz: '31' })).toBe('学科基础')
    expect(normalizeCourseNature({ course_nature_code: '99' })).toBe('公共选修')
    expect(normalizeCourseNature({ kcxzmc: '专业任选' })).toBe('专业任选')
    expect(normalizeCourseNature({})).toBe('')
  })
})

describe('排序分数', () => {
  it('按 outcome 档位派生', () => {
    expect(resolveSortScore(GradeOutcome.NUMERIC, 88)).toBe(88)
    expect(resolveSortScore(GradeOutcome.EXCELLENT, null)).toBe(95)
    expect(resolveSortScore(GradeOutcome.GOOD, null)).toBe(80)
    expect(resolveSortScore(GradeOutcome.MEDIUM, null)).toBe(80)
    expect(resolveSortScore(GradeOutcome.QUALIFIED, null)).toBe(60)
    expect(resolveSortScore(GradeOutcome.PASS, null)).toBe(60)
    expect(resolveSortScore(GradeOutcome.UNQUALIFIED, null)).toBe(0)
    expect(resolveSortScore(GradeOutcome.FAILED, null)).toBe(0)
    expect(resolveSortScore(GradeOutcome.ABSENT, null)).toBe(0)
    expect(resolveSortScore(GradeOutcome.RETAKE, 88)).toBe(88)
    expect(resolveSortScore(GradeOutcome.DEFERRED, null)).toBe(-1)
    expect(resolveSortScore(GradeOutcome.EXEMPT, null)).toBe(-1)
    expect(resolveSortScore(GradeOutcome.UNKNOWN, null)).toBe(-1)
  })
})

describe('边界输入', () => {
  for (const edge of edgeCaseFixtures) {
    it(`${edge.name} 不抛异常且产出 unknown 记录`, () => {
      const view = normalizeGradeRecord(edge.input)
      expect(view.outcome).toBe(GradeOutcome.UNKNOWN)
      expect(view.course_name).toBe('')
      expect(view.final_score).toBe('-')
      expect(view.isPass).toBe(false)
      expect(view.isFailed).toBe(false)
      expect(view.gradePointEstimated).toBe(false)
    })
  }
})

describe('normalizeGradeRecords 批量', () => {
  it('保留原始下标并跳过非数组输入', () => {
    const views = normalizeGradeRecords(batchFixtureInputs)
    expect(views).toHaveLength(4)
    expect(views[0].originIndex).toBe(0)
    expect(views[0].outcome).toBe(GradeOutcome.NUMERIC)
    expect(views[1].outcome).toBe(GradeOutcome.UNQUALIFIED)
    expect(views[2].outcome).toBe(GradeOutcome.UNKNOWN)
    expect(views[3].outcome).toBe(GradeOutcome.DEFERRED)

    expect(normalizeGradeRecords(null)).toEqual([])
    expect(normalizeGradeRecords(undefined)).toEqual([])
    expect(normalizeGradeRecords('nope')).toEqual([])
  })

  it('parseScoreNumber 解析字符串数字', () => {
    expect(parseScoreNumber('92')).toBe(92)
    expect(parseScoreNumber('92.5')).toBe(92.5)
    expect(parseScoreNumber('优秀')).toBeNull()
    expect(parseScoreNumber('')).toBeNull()
    expect(parseScoreNumber(null)).toBeNull()
  })
})
