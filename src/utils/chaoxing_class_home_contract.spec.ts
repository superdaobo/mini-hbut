import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOME_MODULE_ORDER_DEFAULT } from '../config/ui_settings'
import { buildHomeSearchSections } from './home_search'

const read = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

describe('chaoxing_class home integration contract', () => {
  it('registers 学习通 module in layout, dashboard, app and icon map', () => {
    const dashboard = read('src/components/Dashboard.vue')
    const app = read('src/App.vue')
    const icon = read('src/components/icons/ThemeModuleIcon.vue')
    const view = read('src/components/ChaoxingClassView.vue')
    const rustMod = read('src-tauri/src/modules/mod.rs')
    const rustLib = read('src-tauri/src/lib.rs')
    const protocol = read('docs/chaoxing-protocol.md')

    expect(HOME_MODULE_ORDER_DEFAULT).toContain('chaoxing_class')
    expect(dashboard).toContain("{ id: 'chaoxing_class', name: '学习通'")
    expect(dashboard).toContain("'chaoxing_class'")
    expect(app).toContain("const loadChaoxingClassView = () => import('./components/ChaoxingClassView.vue')")
    expect(app).toContain('chaoxing_class: loadChaoxingClassView')
    expect(app).toContain("currentView === 'chaoxing_class'")
    expect(icon).toContain("chaoxing_class: 'menu_book'")
    expect(view).toContain("chaoxing_class_ensure_sso")
    expect(view).toContain("chaoxing_class_preview_invite")
    expect(view).toContain("chaoxing_class_accept_invite")
    expect(view).toContain("chaoxing_class_list_resources")
    expect(view).toContain("FIXED_INVITE_CODE = '73202625'")
    expect(view).toContain('是否加入班级')
    expect(view).toContain('html.dark')
    expect(view).toContain('门户 SSO')
    expect(rustMod).toContain('pub mod chaoxing_class;')
    expect(rustLib).toContain('chaoxing_class_ensure_sso')
    expect(rustLib).toContain('chaoxing_class_accept_invite')
    expect(protocol).toContain('getInviteCode')
    expect(protocol).toContain('participateCls')
    expect(protocol).toContain('stu-datalist')
  })

  it('makes 学习通 searchable by invite-code keywords', () => {
    const sections = buildHomeSearchSections({
      query: '邀请码',
      modules: [
        {
          id: 'chaoxing_class',
          name: '学习通',
          desc: '邀请码入班与班级资料',
          iconKey: 'chaoxing_class',
          color: '#3b82f6'
        }
      ]
    })

    expect(sections[0]?.items[0]).toMatchObject({
      id: 'chaoxing_class',
      title: '学习通',
      target: 'chaoxing_class'
    })
  })
})
