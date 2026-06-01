import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('request performance and cache contract', () => {
  it('records fetchWithCache duration and cache state without logging payload data', () => {
    const apiSource = readSource('src/utils/api.js')

    expect(apiSource).toContain("import { pushDebugLog } from './debug_logger'")
    expect(apiSource).toContain('recordRequestMetric(')
    expect(apiSource).toContain('source: \'memory-cache\'')
    expect(apiSource).toContain('source: \'remote\'')
    expect(apiSource).toContain('duration_ms')
    expect(apiSource).not.toContain('details: data')
  })

  it('allows stale academic cache to be shown immediately while refresh continues', () => {
    const apiSource = readSource('src/utils/api.js')

    expect(apiSource).toContain('getStaleCachedData')
    expect(apiSource).toContain('staleWhileRevalidate')
    expect(apiSource).toContain('source: \'stale-cache\'')
  })

  it('clears the global academic maintenance flag after a successful foreground remote fetch', () => {
    const apiSource = readSource('src/utils/api.js')

    expect(apiSource).toContain('const clearMaintenanceFlag = () =>')
    expect(apiSource).toContain('localStorage.removeItem(JWXT_MAINTENANCE_KEY)')
    expect(apiSource).toContain('emitMaintenanceEvent(false)')
    expect(apiSource).toMatch(/if \(data && data\.success && !data\.offline\) \{[\s\S]{0,240}clearMaintenanceFlag\(\)/)
  })

  it('does not let cloud sync auto warmup query every semester ranking', () => {
    const cloudSource = readSource('src/utils/cloud_sync.js')

    expect(cloudSource).toContain('primeAcademicCaches')
    expect(cloudSource).toContain('skipSemesterRankingWarmup')
    expect(cloudSource).not.toMatch(/for\s*\(\s*const\s+semester\s+of\s+semesters\s*\)[\s\S]{0,420}\/v2\/ranking/)
  })

  it('delays notification launch checks and marks them as background work', () => {
    const notifySource = readSource('src/utils/notify_center.js')

    expect(notifySource).toContain('NOTIFY_LAUNCH_CHECK_DELAY_MS')
    expect(notifySource).toContain('window.setTimeout')
    expect(notifySource).toContain("priority: 'background'")
  })

  it('uses a timeout and stale cache for the HF service health request', () => {
    const statsSource = readSource('src/components/ServiceStatsView.vue')

    expect(statsSource).toContain('HEALTH_TIMEOUT_MS')
    expect(statsSource).toContain('HEALTH_CACHE_KEY')
    expect(statsSource).toContain('AbortSignal.timeout')
    expect(statsSource).toContain('readCachedHealth')
    expect(statsSource).toContain('writeCachedHealth')
  })
})
