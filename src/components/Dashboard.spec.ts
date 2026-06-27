import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./Dashboard.vue', import.meta.url), 'utf8')

describe('Dashboard quick entry defaults', () => {
  it('uses exams instead of schedule in the default quick entries', () => {
    const vue = source()

    expect(vue).toContain("const defaultQuickEntries = ['grades', 'exams', 'classroom', 'electricity', 'ranking']")
    expect(vue).not.toContain("const defaultQuickEntries = ['grades', 'schedule', 'classroom', 'electricity', 'ranking']")
    expect(vue).toContain("exams: { name: '考试安排'")
    expect(vue).toContain("schedule: { name: '课表'")
  })

  it('uses unified black quick-entry icon surfaces in dark mode', () => {
    const vue = source()
    const darkCss = readFileSync(new URL('../styles/dark-mode.css', import.meta.url), 'utf8')

    expect(vue).toContain('class="quick-entry-icon w-12 h-12')
    expect(vue).toContain(':data-module="item.id"')
    expect(vue).toContain('class="quick-entry-icon w-10 h-10')
    expect(vue).toContain(':data-module="id"')
    expect(darkCss).toContain('html.dark .dashboard-root .quick-entry-icon')
    expect(darkCss).toContain('background: #000 !important')
  })
})
