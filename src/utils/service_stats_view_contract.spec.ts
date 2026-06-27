import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourcePath = (path: string) => resolve(process.cwd(), path)
const readSource = (path: string) => {
  const resolved = sourcePath(path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

describe('service stats frontend contract', () => {
  it('adds a logged-in Me page entry that navigates to service_stats', () => {
    const source = readSource('src/components/MeView.vue')

    expect(source).toContain("const handleOpenServiceStats = () => emit('navigate', 'service_stats')")
    expect(source).toContain('@click="handleOpenServiceStats"')
    expect(source).toContain('服务统计')
    expect(source).toMatch(
      /<button\s+v-if="isLoggedIn"[\s\S]*?@click="handleOpenServiceStats"[\s\S]*?服务统计[\s\S]*?<\/button>/
    )
  })

  it('registers service_stats as a Me sub view in App.vue', () => {
    const appSource = readSource('src/App.vue')
    const navSource = readSource('src/navigation/app_navigation.ts')

    expect(appSource).toContain("const loadServiceStatsView = () => import('./components/ServiceStatsView.vue')")
    expect(appSource).toContain('const ServiceStatsView = createAsyncPage(loadServiceStatsView)')
    expect(navSource).toMatch(/ME_SUB_VIEWS\s*=\s*\[[\s\S]*'service_stats'/)
    expect(navSource).toMatch(/HIERARCHICAL_PARENT_VIEW_MAP[\s\S]*service_stats:\s*'me'/)
    expect(appSource).toMatch(/VIEW_PREFETCHERS[\s\S]*service_stats:\s*loadServiceStatsView/)
    expect(appSource).toContain('v-else-if="currentView === \'service_stats\'"')
    expect(appSource).toContain('<ServiceStatsView')
    expect(appSource).toContain('@back="handleBackToMe"')
  })

  it('provides a service stats page that tolerates old /health responses', () => {
    const viewPath = 'src/components/ServiceStatsView.vue'
    const source = readSource(viewPath)

    expect(existsSync(sourcePath(viewPath))).toBe(true)
    expect(source).toContain("const HEALTH_URL = 'https://mini-hbut-ocr-service.hf.space/health'")
    expect(source).toContain('normalizeServiceHealth')
    expect(source).toContain('trend?.last_7_days')
    expect(source).toContain('version_user_counts')
    expect(source).toContain('各版本人数')
    expect(source).toContain('趋势数据暂不可用')
    expect(source).toContain('读取服务状态失败')
    expect(source).toContain('setInterval')
    expect(source).toMatch(/60\s*\*\s*1000|60000|60_000/)
  })

  it('hides archive status from the user-facing service stats page', () => {
    const source = readSource('src/components/ServiceStatsView.vue')

    expect(source).not.toContain('归档状态')
    expect(source).not.toContain('archive-card')
    expect(source).not.toContain('archiveItems')
  })

  it('renders scaled trend axes with animated lines', () => {
    const source = readSource('src/components/ServiceStatsView.vue')

    expect(source).toContain('buildTrendChart')
    expect(source).toContain('axisTicks')
    expect(source).toContain('trend-axis-label')
    expect(source).toContain('trend-grid-line')
    expect(source).toContain('stroke-dasharray')
    expect(source).toContain('drawTrendLine')
  })

  it('shows the latest client version instead of the OCR service implementation version', () => {
    const source = readSource('src/components/ServiceStatsView.vue')

    expect(source).toContain('displayClientVersion')
    expect(source).toContain("health.value.cloud_sync.latest_version || ''")
    expect(source).toContain("版本 {{ displayClientVersion || '未知' }}")
    expect(source).not.toContain("版本 {{ health.service.version || '未知' }}")
  })

  it('labels latest-version trend series with version axis instead of date-only labels', () => {
    const source = readSource('src/components/ServiceStatsView.vue')

    expect(source).toContain("label: '最新版本人数'")
    expect(source).toContain("axisLabelKey: 'latest_version'")
    expect(source).toContain('formatAxisVersion')
    expect(source).toContain("axisLabelKey === 'latest_version'")
  })
})
