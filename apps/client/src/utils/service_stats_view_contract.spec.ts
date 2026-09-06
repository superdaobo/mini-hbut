import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readAppContractSources } from './contract_source_test'

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
    // #794 文案 t() 化后锚点同步更新为 i18n key
    expect(source).toContain("t('me.grid.serviceStats')")
    // App Store 策略：showServiceStats = isLoggedIn && isViewAllowed('service_stats')
    expect(source).toContain('showServiceStats')
    expect(source).toMatch(
      /<button\s+v-if="showServiceStats"[\s\S]*?@click="handleOpenServiceStats"[\s\S]*?me\.grid\.serviceStats[\s\S]*?<\/button>/
    )
  })

  it('registers service_stats as a Me sub view in App.vue', () => {
    const appSource = readAppContractSources()
    const navSource = readSource('src/navigation/app_navigation.ts')

    expect(appSource).toContain("const loadServiceStatsView: Loader = () => import('../components/ServiceStatsView.vue')")
    expect(appSource).toContain('service_stats: createAsyncPage(loadServiceStatsView)')
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
    expect(source).toContain("t('stats.section.versionUsers')")
    expect(source).toContain("t('stats.trend.empty')")
    expect(source).toContain("t('stats.error.readFailed')")
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
    expect(source).toContain("tf('stats.version', { version: displayClientVersion || t('common.unknown') })")
    expect(source).not.toContain('health.service.version')
  })

  it('labels latest-version trend series with version axis instead of date-only labels', () => {
    const source = readSource('src/components/ServiceStatsView.vue')

    expect(source).toContain("label: t('stats.metric.latestVersionUsers')")
    expect(source).toContain("axisLabelKey: 'latest_version'")
    expect(source).toContain('formatAxisVersion')
    expect(source).toContain("axisLabelKey === 'latest_version'")
  })

  it('shows personal and global client usage sections', () => {
    const source = readSource('src/components/ServiceStatsView.vue')

    expect(source).toContain("t('stats.section.mine')")
    expect(source).toContain("t('stats.section.global')")
    expect(source).toContain('client_usage')
    expect(source).toContain('fetchPersonalUsageSummary')
    expect(source).toContain('fetchRemotePersonalUsageSummary')
    expect(source).toContain('studentId')
  })
})
