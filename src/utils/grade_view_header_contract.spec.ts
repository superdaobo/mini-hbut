import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('grade view header contract', () => {
  it('keeps a visible gap between the page title and grade tabs', () => {
    const source = readText('src/components/GradeView.vue')

    const tabBarStyle = source.match(/\.grade-tab-bar\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(tabBarStyle).toMatch(/margin:\s*14px\s+0\s+14px/)
  })

  it('shows a top-right refresh action that asks App.vue to reload grades', () => {
    const gradeSource = readText('src/components/GradeView.vue')
    const appSource = readText('src/App.vue')

    expect(gradeSource).toContain("defineEmits(['back', 'logout', 'refresh'])")
    expect(gradeSource).toContain('<template #actions>')
    expect(gradeSource).toContain('class="grade-refresh-btn"')
    expect(gradeSource).toContain("@click=\"handleRefresh\"")
    expect(gradeSource).toContain("const handleRefresh = () => emit('refresh')")
    expect(appSource).toContain('@refresh="handleRefreshGrades"')
    expect(appSource).toContain('const handleRefreshGrades = async () =>')
    expect(appSource).toContain('fetchGradesFromAPI(studentId.value, { force: true, teacherCurrentOnly: true })')
    expect(appSource).toContain('const fetchGradesFromAPI = async (sid, { force = false, teacherCurrentOnly = false } = {})')
    expect(appSource).toContain('if (force) {')
    expect(appSource).toContain('setCachedData(`grades:${sid}`, data)')
  })
})
