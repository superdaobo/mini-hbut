import { describe, expect, it } from 'vitest'
import { readContractSource } from '../utils/contract_source_test'

const shellCss = () => readContractSource('src/styles/views/App.scoped.css')
const dashboardCss = () => readContractSource('src/styles/views/Dashboard.scoped.css')

/**
 * #714 宽屏外壳契约：
 * - 二级页批量限宽兜底必须存在且豁免首页双栏根节点；
 * - 首页双栏声明不得被误删；
 * - 除 .app-shell 外禁止新增纵向滚动容器。
 */
describe('wide screen shell contract', () => {
  it('keeps the batched max-width fallback for secondary views across three tiers', () => {
    const css = shellCss()
    expect(css).toContain('@media (min-width: 600px)')
    expect(css).toContain('@media (min-width: 768px)')
    expect(css).toContain('@media (min-width: 1024px)')
    expect(css).toContain('.view-transition-root > *:not(.dashboard-root)')
    expect(css).toContain('max-width: 640px')
    expect(css).toContain('max-width: 720px')
    expect(css).toContain('max-width: 896px')
  })

  it('keeps the dashboard two-column grid alive at the tablet breakpoint', () => {
    const css = dashboardCss()
    expect(css).toContain('@media (min-width: 768px)')
    expect(css).toContain('.dashboard-main')
    expect(css).toContain('grid-template-columns: minmax(0, 5fr) minmax(0, 7fr)')
    // 宽屏功能宫格扩列（与 Dashboard.vue featureGridCols 的宽屏值一致）
    expect(css).toContain('repeat(6, minmax(0, 1fr))')
  })

  it('never turns home columns or the shell fallback into extra scroll containers', () => {
    const colBlocks = dashboardCss().match(/\.home-col-[a-z][^{]*\{[^}]*\}/g) || []
    expect(colBlocks.length).toBeGreaterThan(0)
    for (const block of colBlocks) {
      expect(block).not.toContain('overflow')
    }
  })
})
