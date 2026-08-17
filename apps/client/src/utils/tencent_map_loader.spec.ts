import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('../components/TowerGoView.vue', import.meta.url), 'utf8')

describe('TowerGoView tencent map loader contract', () => {
  it('uses the shared tencent map loader instead of an inline script loader', () => {
    const vue = source()
    expect(vue).toContain("from '../utils/tencent_map_loader'")
    expect(vue).toContain('loadTencentMap(TOWERGO_CONFIG.qqMapKey)')
    expect(vue).not.toContain('data-towergo-map')
    expect(vue).not.toContain('script.dataset.towergoMap')
  })
})
