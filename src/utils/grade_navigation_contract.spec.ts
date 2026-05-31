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
    const source = readSource('src/App.vue')
    const block = extractBlock(source, 'const handleNavigate = async (target) => {', '// 处理返回仪表盘')
    const gradesBranch = block.slice(
      block.indexOf("if (normalized.view === 'grades'"),
      block.indexOf('goToView(normalized.view)', block.indexOf("if (normalized.view === 'grades'"))
    )

    expect(block).toContain('const navigated = goToView(normalized.view)')
    expect(gradesBranch).toContain('void loadGradesForCurrentView()')
    expect(gradesBranch).not.toContain('await fetchGradesFromAPI')
    expect(gradesBranch).not.toContain("goToView('me')")
  })

  it('does not redirect hash-restored grades routes away after a fetch failure', () => {
    const source = readSource('src/App.vue')
    const block = extractBlock(source, 'const syncFromHash = async ({ scrollToTop = false } = {}) => {', 'const markLoginSessionToken = () => {')

    expect(block).toContain("if (route.view === 'grades' && gradeData.value.length === 0)")
    expect(block).toContain('void loadGradesForCurrentView()')
    expect(block).not.toContain("applyViewState('me')")
    expect(block).not.toContain("replaceHistorySnapshot('me')")
  })
})
