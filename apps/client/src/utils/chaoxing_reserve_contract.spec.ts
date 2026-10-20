/**
 * 预约（`chaoxing_reserve`）· 内嵌官方页模块接线契约（A15）。
 *
 * 背景：仓库里同时存在两套**完全不同**的预约实现，本测试守住第二套不动摇：
 * - `library_reserve` = 原生逻辑（自实现 UI + 直接调接口）；
 * - `chaoxing_reserve` = 内嵌官方页（桌面子 WebView / iOS Bridge 代理 + iframe / 降级外开）。
 *
 * 把关四件事：
 * 1. **三个场景齐备**：座位 / 静音仓 / 研讨室都要能在本模块内预约（用户明确要求）；
 * 2. **入参正确**：座位走 `live` 深链，房间类只能走 `index` 落地页；
 * 3. **不与原生模块抢语义**：本模块不做「我的预约」，取消统一留在原生模块；
 * 4. **首页 / 路由 / i18n 全部登记**，避免新增模块在合入后才暴露。
 *
 * 仓库未引入 @vue/test-utils（vitest 主配置为 node 环境），故沿用既有
 * 「源码契约」测试风格（见 `reserve_panel_contract.spec.ts`）。
 */
import { describe, expect, it } from 'vitest'
import { readContractSource, readVueContractSource } from './contract_source_test'

const view = readVueContractSource('src/components/ChaoxingReserveView.vue')
const modules = readContractSource('src/config/dashboard_modules.ts')
const viewRegistry = readContractSource('src/app/viewRegistry.ts')
const app = readVueContractSource('src/App.vue')
const uiSettings = readContractSource('src/config/ui_settings.ts')

/** 三个语言的词条文件（模块名 / 描述必须三语齐备） */
const localeFiles = ['zh-CN', 'en', 'ja'].map((locale) => ({
  locale,
  source: readContractSource(`src/utils/i18n/messages/${locale}.ts`)
}))

describe('A15 预约模块 · 三场景 Tab', () => {
  it('TABS 覆盖座位 / 静音仓 / 研讨室', () => {
    const match = view.match(/const TABS\s*=\s*\[([\s\S]*?)\]/)
    expect(match, '未在 ChaoxingReserveView.vue 找到 TABS 定义').toBeTruthy()
    const tabs = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(tabs).toEqual(['seat', 'quiet', 'room'])
  })

  it('不提供「我的预约」（取消统一留在原生模块，避免两处语义重叠）', () => {
    // TABS 里不得出现 mine
    const match = view.match(/const TABS\s*=\s*\[([\s\S]*?)\]/)
    expect(match).toBeTruthy()
    expect(match![1]).not.toContain('mine')
    // 也不得挂载原生模块专用的「我的预约」面板
    expect(view).not.toContain('ReserveMinePanel')
  })
})

describe('A15 预约模块 · 内嵌组件入参', () => {
  it('复用 LibraryReserveEmbed（不复制内嵌实现）', () => {
    expect(view).toContain("import LibraryReserveEmbed from './library-reserve/LibraryReserveEmbed.vue'")
  })

  it('座位走 live 深链，静音仓 / 研讨室走 index 落地页', () => {
    // 只取真实的组件标签（注释里也写了 kind，直接全文计数会被注释干扰）
    const tags = [...view.matchAll(/<LibraryReserveEmbed\b[^>]*\/>/g)].map((m) => m[0])
    expect(tags, '应挂载三个内嵌组件').toHaveLength(3)

    /** 取某个标签的 prop 值 */
    const propOf = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]+)"`))?.[1]

    // 座位：官方快速预约页，有直达业务页的深链
    const seat = tags.find((tag) => propOf(tag, 'app') === 'seat')
    expect(seat, '缺少座位内嵌组件').toBeTruthy()
    expect(propOf(seat!, 'kind')).toBe('live')

    // 静音仓 / 研讨室：房间类没有 live 深链，只能给入口落地页
    for (const app of ['quiet_room', 'seminar_room']) {
      const tag = tags.find((item) => propOf(item, 'app') === app)
      expect(tag, `缺少 ${app} 内嵌组件`).toBeTruthy()
      expect(propOf(tag!, 'kind'), `${app} 应使用 index 落地页`).toBe('index')
    }
  })

  it('会话门禁与原生模块一致（缓存身份不得放行）', () => {
    expect(view).toContain('authStore.isLoggedIn && authStore.sessionVerified')
  })
})

describe('A15 预约模块 · 首页与路由登记', () => {
  it('BASE_MODULES 注册 chaoxing_reserve（依赖登录、可用）', () => {
    expect(modules).toContain("id: 'chaoxing_reserve'")
    expect(modules).toContain("name: 'home.module.chaoxing_reserve'")
    expect(modules).toContain("desc: 'home.module.chaoxing_reserve.desc'")
  })

  it('归入「学习通」分类，且与 library_reserve 并列（两套逻辑都在）', () => {
    const chaoxing = modules.match(/title: 'home\.cat\.chaoxing',\s*ids: \[([\s\S]*?)\]/)
    expect(chaoxing, '未找到 home.cat.chaoxing 分类定义').toBeTruthy()
    const ids = [...chaoxing![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(ids).toContain('library_reserve')
    expect(ids).toContain('chaoxing_reserve')
  })

  it('首页布局顺序表登记 chaoxing_reserve', () => {
    expect(uiSettings).toContain("'chaoxing_reserve'")
  })

  it('viewRegistry 懒加载 + 两条映射齐备', () => {
    expect(viewRegistry).toContain("import('../components/ChaoxingReserveView.vue')")
    expect(viewRegistry).toContain('chaoxing_reserve: createAsyncPage(loadChaoxingReserveView)')
    expect(viewRegistry).toContain('chaoxing_reserve: loadChaoxingReserveView')
  })

  it('App.vue 有渲染分支并透传 back / require-login', () => {
    const branch = app.match(/currentView === 'chaoxing_reserve'[\s\S]{0,240}?\/>/)
    expect(branch, 'App.vue 缺少 chaoxing_reserve 渲染分支').toBeTruthy()
    expect(branch![0]).toContain('@back="handleBackToDashboard"')
    expect(branch![0]).toContain('@require-login="handleRequireLogin"')
  })
})

describe('A15 预约模块 · 三语词条', () => {
  it('模块名与描述在 zh-CN / en / ja 全部存在', () => {
    for (const { locale, source } of localeFiles) {
      expect(source, `${locale} 缺少 home.module.chaoxing_reserve`).toContain(
        "'home.module.chaoxing_reserve'"
      )
      expect(source, `${locale} 缺少 home.module.chaoxing_reserve.desc`).toContain(
        "'home.module.chaoxing_reserve.desc'"
      )
    }
  })
})
