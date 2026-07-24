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

  it('keeps per-module tinted quick-entry icon surfaces in dark mode', () => {
    const vue = source()
    const darkCss = readFileSync(new URL('../styles/dark-mode.css', import.meta.url), 'utf8')

    expect(vue).toContain('class="quick-entry-icon w-12 h-12')
    expect(vue).toContain(':data-module="item.id"')
    expect(vue).toContain('class="quick-entry-icon w-10 h-10')
    expect(vue).toContain(':data-module="id"')
    expect(vue).toContain('quick-entry-editor-item')
    expect(darkCss).not.toContain('html.dark .quick-entry-icon {\n  background: #000')
    expect(darkCss).toContain('html.dark .bg-blue-50')
    expect(darkCss).toContain('html.dark .quick-entry-editor-item--selected')
  })

  it('App Store guest/demo: drops empty feature categories and filters quick entries', () => {
    const vue = source()
    // 空分组（学习通/一码通被滤空后）不得残留 tab 标题
    expect(vue).toContain('return cats.filter((c) => Array.isArray(c.modules) && c.modules.length > 0)')
    // 快捷入口与编辑器均走 isModuleAllowed
    expect(vue).toContain('isModuleAllowed(item.id, appStoreSessionOpts())')
    expect(vue).toContain('editableQuickEntryMeta')
    expect(vue).toContain('v-for="(meta, id) in editableQuickEntryMeta"')
  })
})
