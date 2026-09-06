import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./ClassroomView.vue', import.meta.url), 'utf8')

describe('ClassroomView display contract', () => {
  it('renders period buttons as single class periods instead of ranges', () => {
    const vue = source()

    expect(vue).toContain('{{ p.value }}')
    // i18n(#793)：节次 aria 标签经 tr() 取词（classroom.period.aria）
    expect(vue).toContain(":aria-label=\"tr('classroom.period.aria', { n: p.value })\"")
    expect(vue).not.toContain('{{ p.value }}-{{ p.value + 1')
  })

  it('shows the concrete query date near classroom results', () => {
    const vue = source()

    expect(vue).toContain('queryDateLabel')
    // i18n(#793)：日期前缀走 t('classroom.meta.datePrefix') 字典
    expect(vue).toContain("t('classroom.meta.datePrefix')")
    expect(vue).toContain('classroom-result-meta')
  })

  it('uses an explicit readable filter label color in light mode', () => {
    const vue = source()

    expect(vue).toContain('classroom-filter-label')
    expect(vue).toMatch(/\.classroom-filter-label\s*\{[^}]*color:\s*#334155;/s)
  })

  it('does not truncate selectable weeks to the first eight weeks', () => {
    const vue = source()

    expect(vue).toContain('const weekOptions = Array.from({ length: 25 }, (_, i) => i + 1)')
    expect(vue).toContain('v-for="w in weekOptions"')
    expect(vue).not.toContain('weekOptions.slice(0, 8)')
  })

  it('prefers local schedule meta for the current week instead of stale classroom meta', () => {
    const vue = source()

    expect(vue).toContain("localStorage.getItem('hbu_schedule_meta')")
    expect(vue).toContain('const getPreferredCurrentWeek = () =>')
    expect(vue).toContain('resolveClassroomMeta')
    expect(vue).toContain('const selectCurrentWeek = () =>')
  })

  it('groups period selectors into fixed morning afternoon and evening rows', () => {
    const vue = source()

    expect(vue).toContain('const periodGroups = [')
    // i18n(#793)：时段分组标题走 t() 字典（key：classroom.time.*）
    expect(vue).toContain("t('classroom.time.morning')")
    expect(vue).toContain("t('classroom.time.afternoon')")
    expect(vue).toContain("t('classroom.time.evening')")
    expect(vue).toContain('v-for="group in periodGroups"')
    expect(vue).toContain('classroom-period-row')
    expect(vue).not.toContain('v-for="p in periodOptions"')
  })

  it('uses wider fixed period buttons so selected check icons do not overflow', () => {
    const vue = source()

    expect(vue).toMatch(/\.classroom-period-button\s*\{[^}]*width:\s*42px;/s)
    expect(vue).toMatch(/\.classroom-period-button\s*\{[^}]*min-width:\s*42px;/s)
    expect(vue).toMatch(/\.classroom-period-row-buttons\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*42px\);/s)
  })

  it('displays buildings as 一教/二教… while keeping the original jxlmc query value (#753)', () => {
    const vue = source()

    // 显示：按钮文案经 displayBuildingName 映射（教务原文「N号教学楼」→「N教」）
    expect(vue).toContain('{{ displayBuildingName(b.name) }}')
    // 查询：filters.building 仍写入教务原始 name（jxlmc 语义不可变）
    expect(vue).toContain('filters.building = b.name')
    // 映射规则：数字转汉字 + 「教」后缀，兼容「N号教学楼/N号楼/N教」形态
    expect(vue).toContain('CN_DIGITS')
    expect(vue).toMatch(/\(\?:号教学\(\?:楼\)\?\|号楼\|教\)/)
  })
})
