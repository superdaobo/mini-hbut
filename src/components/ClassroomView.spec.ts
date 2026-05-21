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
})
