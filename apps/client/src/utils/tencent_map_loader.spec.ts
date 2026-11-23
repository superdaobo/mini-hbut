import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// #1375：地图加载逻辑拆进 components/towergo/useTowerGoMap.ts，
// 契约改为覆盖「壳组件 + towergo 目录」全部源码
const source = () => {
  const componentsDir = new URL('../components/', import.meta.url)
  let combined = readFileSync(new URL('./TowerGoView.vue', componentsDir), 'utf8')
  try {
    const towerGoDir = new URL('./towergo/', componentsDir)
    for (const entry of readdirSync(towerGoDir)) {
      if (/\.(?:ts|vue)$/.test(entry)) {
        combined += '\n' + readFileSync(new URL(`./towergo/${entry}`, componentsDir), 'utf8')
      }
    }
  } catch {
    // 目录不存在时只用壳组件源码
  }
  return combined
}

describe('TowerGoView tencent map loader contract', () => {
  it('uses the shared tencent map loader instead of an inline script loader', () => {
    const vue = source()
    expect(vue).toContain("utils/tencent_map_loader")
    expect(vue).toContain('loadTencentMap(TOWERGO_CONFIG.qqMapKey)')
    expect(vue).not.toContain('data-towergo-map')
    expect(vue).not.toContain('script.dataset.towergoMap')
  })
})
