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
})
