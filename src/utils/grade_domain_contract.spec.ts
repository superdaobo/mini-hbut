/**
 * grade domain 消费契约：GradeView 统一从 normalizer 消费 view-model，
 * 不再散落兼容 kcmc/xf/zhcj 等历史字段；筛选/排序/标签/失败统计全部使用 outcome
 * 派生字段；绩点官方优先、数字才估算、定性不估算。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GradeOutcome } from '../domain/grades.js'
import { gradeFixtures } from '../domain/grades.fixtures.js'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('grade domain contract', () => {
  it('GradeView 统一从 normalizer 消费，不再散落兼容旧字段', () => {
    const source = readText('src/components/GradeView.vue')

    expect(source).toContain("import { normalizeGradeRecords } from '../domain/grades.ts'")
    expect(source).toContain('const normalizedGrades = computed(() => normalizeGradeRecords(props.grades))')

    // 历史字段兼容必须收敛进 domain，GradeView 内不再出现
    for (const legacy of ['kcmc', 'zhcj', 'xnxq', 'cjlrjsxm', 'jsxm', 'yscj']) {
      expect(source).not.toContain(legacy)
    }
    // 旧散落实现函数/常量不再存在于组件内
    for (const legacy of ['CJBJ_STATUS_MAP', 'COURSE_NATURE_LABEL_MAP', 'resolveStatusTags', 'normalizePointText', 'parseScoreNumber', 'resolveSortScore']) {
      expect(source).not.toContain(legacy)
    }
  })

  it('筛选/排序/标签/失败统计全部使用 outcome 派生字段', () => {
    const source = readText('src/components/GradeView.vue')

    // 筛选：不合格只看 isFailed（由 outcome 判定）
    expect(source).toContain("filterPass.value === 'fail' && !grade.isFailed")
    // 排序：使用 normalizer 派生的 sortScore
    expect(source).toContain('a.sortScore - b.sortScore')
    // 标签：使用 normalizer 派生的 statusTags
    expect(source).toContain('grade.statusTags')
    // 失败统计：使用 isFailed
    expect(source).toContain('filter(g => g.isFailed).length')
  })

  it('GradeOutcome 覆盖全部成绩状态（数字 + 13 种定性）', () => {
    const domain = readText('src/domain/grades.ts')
    const expectedKeys = [
      'NUMERIC', 'EXCELLENT', 'GOOD', 'MEDIUM', 'QUALIFIED', 'PASS',
      'UNQUALIFIED', 'FAILED', 'ABSENT', 'DEFERRED', 'EXEMPT',
      'EXEMPTED_EXAM', 'PENDING', 'UNKNOWN'
    ]
    for (const key of expectedKeys) {
      expect(domain).toContain(`${key}: `)
    }
  })

  it('绩点规则：官方字段优先、仅数字成绩估算并标记 estimated、定性不估算', () => {
    const domain = readText('src/domain/grades.ts')

    expect(domain).toContain('gradePointEstimated')
    expect(domain).toContain('if (officialPoint !== null)')
    expect(domain).toContain('outcome === GradeOutcome.NUMERIC')
    // 官方字段清单必须包含 Rust 响应字段 xfjd
    expect(domain).toMatch(/OFFICIAL_GRADE_POINT_KEYS\s*=.*'xfjd'/)
  })

  it('fixtures 覆盖全部 outcome（行为契约）', () => {
    const covered = new Set(gradeFixtures.map((f) => f.expect.outcome))
    for (const value of Object.values(GradeOutcome)) {
      expect(covered.has(value), `outcome ${value} 缺少 fixture 覆盖`).toBe(true)
    }
  })
})
