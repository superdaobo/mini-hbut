import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const extractBlock = (source: string, marker: string, nextMarker: string) => {
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(nextMarker, start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('grade navigation contract', () => {
  it('enters the grades view before loading grade data', () => {
    const source = readSource('src/app/coordinators/NavigationCoordinator.ts')
    const block = extractBlock(
      source,
      'const handleNavigate = async (target: unknown) => {',
      'const handleBackToDashboard = () => {'
    )
    const navigationIndex = block.indexOf('const navigated = goToView(normalized.view)')
    const gradesIndex = block.indexOf("if (normalized.view === 'grades') {")
    const loadIndex = block.indexOf('void runtime.grade.loadGradesForCurrentView()', gradesIndex)

    expect(block).toContain('const navigated = goToView(normalized.view)')
    expect(navigationIndex).toBeGreaterThanOrEqual(0)
    expect(gradesIndex).toBeGreaterThan(navigationIndex)
    expect(loadIndex).toBeGreaterThan(gradesIndex)
    expect(block).not.toContain('await fetchGradesFromAPI')
    expect(block).not.toContain("goToView('me')")
  })

  it('does not redirect hash-restored grades routes away after a fetch failure', () => {
    const source = readSource('src/app/coordinators/NavigationCoordinator.ts')
    const block = extractBlock(
      source,
      'const syncFromHash = async () => {',
      'const normalizeNavigateTarget = (target: unknown) => {'
    )

    // hash 恢复经 resolvePolicySafeView 后用 safeView 加载成绩
    expect(block).toContain('resolvePolicySafeView')
    expect(block).toContain("if (safeView === 'grades' && state.gradeData.value.length === 0)")
    expect(block).toContain('void runtime.grade.loadGradesForCurrentView()')
    expect(block).not.toContain("applyViewState('me')")
    expect(block).not.toContain("replaceHistorySnapshot('me')")
  })
})
