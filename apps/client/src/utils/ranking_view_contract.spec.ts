import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('ranking view contract', () => {
  it('shows the GPA ceiling as 5.0 instead of 4.0', () => {
    const source = readSource('src/components/RankingView.vue')

    expect(source).toContain('<span class="text-sm text-on-primary/80">/ 5.0</span>')
    expect(source).not.toContain('<span class="text-sm text-on-primary/80">/ 4.0</span>')
  })

  it('uses stale cache only as a temporary placeholder and always foreground refreshes ranking', () => {
    const source = readSource('src/components/RankingView.vue')
    const fetchBlock = source.match(/const fetchRanking = async \(options = \{\}\) => \{[\s\S]*?const handleSemesterChange/s)?.[0] || ''

    expect(source).toContain("import { fetchWithCache, getStaleCachedData, setCachedData } from '../utils/api.js'")
    expect(source).toContain('const refreshing = ref(false)')
    expect(source).toContain('const applyStaleRankingSnapshot = (cacheKey) =>')
    expect(source).toContain('getStaleCachedData(cacheKey)')
    expect(fetchBlock).toContain('const staleApplied = applyStaleRankingSnapshot(cacheKey)')
    expect(fetchBlock).toContain('forceRemote: true')
    expect(fetchBlock).not.toContain('staleWhileRevalidate: true')
    expect(source).toContain('setCachedData(cacheKey, data)')
    expect(source).toContain(':class="{ spinning: refreshing || loading || offline }"')
  })
})
