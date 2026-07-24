import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOME_MODULE_ORDER_DEFAULT } from '../config/ui_settings'
import { buildHomeSearchSections } from './home_search'

const read = (relativePath: string) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

describe('towergo home integration contract', () => {
  it('registers towergo as a resource module in home layout, dashboard and search', () => {
    const dashboard = read('src/components/Dashboard.vue')
    const app = read('src/App.vue')
    const icon = read('src/components/icons/ThemeModuleIcon.vue')

    expect(HOME_MODULE_ORDER_DEFAULT).toContain('towergo')
    expect(dashboard).toContain("{ id: 'towergo', name: '小塔出行'")
    // 资料分享 (chaoxing_class) 归入「学习通」分类；资源区含网盘 / 小塔 / 智慧迎新 / AI（#481）
    expect(dashboard).toContain(
      "['library', 'campus_map', 'resource_share', 'towergo', 'smart_orientation', 'ai']"
    )
    expect(dashboard).toContain("id: 'smart_orientation'")
    expect(dashboard).toContain("id: 'towergo'")
    expect(dashboard).toContain("['chaoxing_hub', 'chaoxing_inbox', 'chaoxing_class']")
    expect(app).toContain("const loadTowerGoView = () => import('./components/TowerGoView.vue')")
    expect(app).toContain("towergo: loadTowerGoView")
    expect(app).toContain("currentView === 'towergo'")
    expect(icon).toContain("towergo: 'electric_bike'")
  })

  it('makes 小塔出行 searchable by towergo and bike keywords', () => {
    const sections = buildHomeSearchSections({
      query: '骑车',
      modules: [
        { id: 'towergo', name: '小塔出行', desc: '校园电单车与骑行服务', iconKey: 'towergo', color: '#22c55e' }
      ]
    })

    expect(sections[0]?.items[0]).toMatchObject({
      id: 'towergo',
      title: '小塔出行',
      target: 'towergo'
    })
  })
})
