import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOME_MODULE_ORDER_DEFAULT } from '../config/ui_settings'
import { buildHomeSearchSections } from './home_search'

const read = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

describe('chaoxing_class home integration contract', () => {
  it('registers 资料分享 (chaoxing_class) module in layout, dashboard, app and icon map', () => {
    const dashboard = read('src/components/Dashboard.vue')
    const app = read('src/App.vue')
    const icon = read('src/components/icons/ThemeModuleIcon.vue')
    const view = read('src/components/ChaoxingClassView.vue')
    const rustMod = read('src-tauri/src/modules/mod.rs')
    const rustLib = read('src-tauri/src/lib.rs')
    const protocol = read('docs/chaoxing-protocol.md')

    expect(HOME_MODULE_ORDER_DEFAULT).toContain('chaoxing_class')
    expect(HOME_MODULE_ORDER_DEFAULT).toContain('chaoxing_hub')
    expect(dashboard).toContain("{ id: 'chaoxing_class', name: '资料分享'")
    expect(dashboard).toContain("title: '学习通'")
    expect(dashboard).toContain("'chaoxing_class'")
    expect(app).toContain("const loadChaoxingClassView = () => import('./components/ChaoxingClassView.vue')")
    expect(app).toContain('chaoxing_class: loadChaoxingClassView')
    expect(app).toContain("currentView === 'chaoxing_class'")
    expect(app).toContain("currentView === 'chaoxing_hub'")
    expect(icon).toContain("chaoxing_class: 'menu_book'")
    expect(view).toContain("chaoxing_class_ensure_sso")
    expect(view).toContain("chaoxing_class_preview_invite")
    expect(view).toContain("chaoxing_class_accept_invite")
    expect(view).toContain("chaoxing_class_list_resources")
    // #360：配置驱动邀请码；新人欢迎入班，仅退课历史才 needsRejoin
    expect(view).toContain('getChaoxingClassConfig')
    expect(view).toContain('fetchRemoteConfig')
    expect(view).toContain('enterNotJoinedState')
    expect(view).toContain('needsRejoin')
    expect(view).toContain('重新加入班级')
    expect(view).toContain('加入班级并查看资料')
    expect(view).toContain('是否加入班级')
    expect(view).toContain('rejoinOnNotJoined')
    expect(view).toContain("data-theme='graphite_night'")
    expect(view).toContain('html.dark')
    expect(view).toContain('门户 SSO')
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
    expect(classRs).toContain('membership')
    expect(classRs).toContain('infer_list_membership_from_html')
    expect(classRs).toContain('is_student_enrolled_in_clazz')
    expect(classRs).toContain('backclazzdata')
    expect(classRs).toContain('looks_like_not_joined_html')
    expect(classRs).toContain('resolve_membership')
    expect(view).toContain('loadSeq')
    expect(view).toContain('重试加载')
    // #351：热路径 last-class 秒开壳 + 并行 SSO；冷路径明确 loading；keep-alive 补票
    expect(view).toContain('ssoPromise')
    expect(view).toContain('正在加载资料')
    expect(view).toContain('首次进入需完成门户 SSO')
    expect(rustLib).toContain('keep-alive 学习通补票')
    expect(rustLib).toContain('spawn_chaoxing_sso_warmup')
    const remote = read('src/utils/remote_config.js')
    expect(remote).toContain('chaoxing_class')
    expect(remote).toContain('getChaoxingClassConfig')
    expect(remote).toContain("invite_code: '18853572'")
    expect(remote).toContain('persistChaoxingInviteCode')
    expect(remote).toContain('DEFAULT_CHAOXING_INVITE_CODE')
    const configEditor = read('src/components/ConfigEditor.vue')
    expect(configEditor).toContain('学习通资料库')
    expect(configEditor).toContain('chaoxing_class')
    expect(configEditor).toContain('invite_code')
    expect(configEditor).toContain('18853572')
    expect(classRs).toContain('fetch_datalist_student_or_teacher')
    expect(classRs).toContain('DEFAULT_INVITE_CODE')
    const ssoRs = read('src-tauri/src/modules/chaoxing_sso.rs')
    expect(ssoRs).toContain('60 * 60')
    expect(ssoRs).toContain('cookie_reuse')
    // #367：首页绿灯 ≠ 学习通 SSO；Web 备份密码注入 + cookie hydrate
    expect(view).toContain('loadPortalRememberedPassword')
    expect(view).toContain('ssoPayload')
    expect(view).toContain('portal_password')
    expect(view).toContain('教务会话可能仍可用')
    expect(rustLib).toContain('portal_password')
    expect(classRs).toContain('portal_password')
    expect(ssoRs).toContain('portal_password')
    expect(ssoRs).toContain('hydrate_session_cookies_from_store')
    expect(ssoRs).toContain('tgt_expired_no_password')
    // #375：禁止仅凭教务 jw 假复用；邀请码 HTML 响应重桥接
    expect(ssoRs).toContain('缺少学习通 UID')
    expect(classRs).toContain('looks_like_html_document')
    expect(classRs).toContain('is_invite_session_error_message')
    expect(classRs).toContain('force: true')
    expect(view).toContain('portal_password')
    // #376：FYSSO 后优先 mooc1 中间页，不依赖 i.chaoxing.com Web 会话
    expect(classRs).toContain('fetch_invite_via_mooc_middleview')
    expect(classRs).toContain('pcqrcodemiddleview')
    const sessionRs = read('src-tauri/src/http_client/session.rs')
    expect(sessionRs).toContain('勿假成功')
    // 详细错误日志
    expect(classRs).toContain('invite_err')
    expect(classRs).toContain('invite_session_diag')
    expect(classRs).toContain('邀请码/i站getInviteCode')
    expect(classRs).toContain('邀请码/双路径失败')
    expect(classRs).toContain('has_uid={} has_token={} has_jw={}')
    expect(view).toContain("pushDebugLog('ChaoxingInvite'")
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
