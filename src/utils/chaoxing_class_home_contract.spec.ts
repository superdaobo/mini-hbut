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
    expect(view).toContain('FIXED_CLASS_META')
    expect(view).toContain('是否加入班级')
    expect(view).toContain('html.dark')
    expect(view).toContain('门户 SSO')
    expect(view).toContain('进入路径简化')
    expect(view).toContain('handleOpenFolder')
    expect(view).toContain('showPreviewModal')
    expect(view).not.toContain('get-preview-url') // 前端不直连
    expect(view).toContain('官方预览')
    expect(view).toContain('cx-nimbus-head')
    expect(view).toContain('filterChip')
    expect(view).toContain('thumbnail_url')
    expect(view).toContain('previewModalMode')
    expect(view).toContain('cx-preview-image')
    expect(view).toContain('切换打开方式')
    expect(view).toContain('previewOpenMethods')
    expect(view).toContain('handlePreviewDownload')
    expect(rustMod).toContain('pub mod chaoxing_class;')
    expect(rustMod).toContain('pub mod chaoxing_sso;')
    expect(rustLib).toContain('chaoxing_class_ensure_sso')
    expect(rustLib).toContain('chaoxing_class_accept_invite')
    expect(rustLib).toContain('spawn_chaoxing_sso_warmup')
    expect(rustLib).toContain('chaoxing_sso_get_diag')
    const classRs = read('src-tauri/src/modules/chaoxing_class.rs')
    expect(classRs).toContain('get-preview-url')
    expect(classRs).toContain('tch-courseware')
    expect(classRs).toContain('getStudentCourseWareList')
    expect(classRs).toContain('thumbnail_url')
    expect(classRs).toContain('try_fetch_image_data_url')
    expect(classRs).toContain('preview_mode')
    expect(classRs).toContain('150_150c')
    expect(classRs).toContain('get_text_with_retry')
    expect(classRs).toContain('is_transient_reqwest_error')
    expect(view).toContain('loadSeq')
    expect(view).toContain('重试加载')
    const ssoRs = read('src-tauri/src/modules/chaoxing_sso.rs')
    expect(ssoRs).toContain('60 * 60')
    expect(ssoRs).toContain('cookie_reuse')
    expect(protocol).toContain('getInviteCode')
    expect(protocol).toContain('participateCls')
    expect(protocol).toContain('stu-datalist')
    expect(protocol).toContain('objectshowpreview')
    expect(protocol).toContain('150_150c')
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
