import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./ClassroomView.vue', import.meta.url), 'utf8')

describe('ClassroomView display contract', () => {
  it('renders period buttons as single class periods instead of ranges', () => {
    const vue = source()

    expect(vue).toContain('{{ p.value }}')
    expect(vue).toContain(":aria-label=\"`第${p.value}节`\"")
    expect(vue).not.toContain('{{ p.value }}-{{ p.value + 1')
  })

  it('shows the concrete query date near classroom results', () => {
    const vue = source()

    expect(vue).toContain('queryDateLabel')
    expect(vue).toContain('查询日期')
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
    expect(vue).toContain("label: '上午'")
    expect(vue).toContain("label: '下午'")
    expect(vue).toContain("label: '晚上'")
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
})
