/**
 * 图书馆预约（#1055–#1057）首页 / 路由 / Tauri 命令注册契约（#1058 收口）。
 *
 * 把关三件事，避免新增模块在合入后才暴露：
 * 1. **首页模块注册**：`dashboard_modules.ts` 的 BASE_MODULES / 分类表，与
 *    `role_capabilities.spec.ts` 的 ALL_MODULE_IDS、`HOME_MODULE_ORDER_DEFAULT` 对齐；
 * 2. **视图与命令注册**：`viewRegistry.ts` 懒加载、`App.vue` 渲染分支、
 *    Rust 命令层定义与 `lib.rs` 的 `generate_handler!` 一一对应；
 * 3. **i18n 三语齐备**：视图 / Tab / 模块词条在 zh-CN / en / ja 全部存在。
 */
import { describe, expect, it } from 'vitest'
import { BASE_MODULES, MODULE_CATEGORY_DEFS } from '../config/dashboard_modules'
import {
  TEACHER_VISIBLE_MODULE_IDS,
  isModuleVisibleForRole,
  isViewAllowedForRole
} from '../config/role_capabilities'
import { HOME_MODULE_ORDER_DEFAULT } from '../config/ui_settings'
import { ensureLocaleMessages, messages } from './app_i18n'
import {
  readAppContractSources,
  readContractSource,
  readVueContractSource
} from './contract_source_test'

const read = readContractSource

describe('图书馆预约 · 首页模块注册（#1055）', () => {
  const moduleIds = BASE_MODULES.map((m) => m.id)

  it('BASE_MODULES 注册 library_reserve（i18n 名称 + 依赖登录）', () => {
    const mod = BASE_MODULES.find((m) => m.id === 'library_reserve')
    expect(mod).toBeTruthy()
    expect(mod).toMatchObject({
      name: 'home.module.library_reserve',
      desc: 'home.module.library_reserve.desc',
      iconKey: 'library_reserve',
      available: true,
      requiresLogin: true
    })
  })

  it('归入「学习通」分类，与 Dashboard 契约一致', () => {
    const chaoxing = MODULE_CATEGORY_DEFS.find((c) => c.title === 'home.cat.chaoxing')
    expect(chaoxing?.ids).toEqual([
      'chaoxing_hub',
      'chaoxing_inbox',
      'chaoxing_class',
      'library_reserve'
    ])
  })

  it('BASE_MODULES 与 role_capabilities.spec.ts 的 ALL_MODULE_IDS 完全对齐', () => {
    const spec = read('src/config/role_capabilities.spec.ts')
    const match = spec.match(/const ALL_MODULE_IDS\s*=\s*\[([\s\S]*?)\]/)
    expect(match, '未在 role_capabilities.spec.ts 找到 ALL_MODULE_IDS').toBeTruthy()
    const declared = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    // 双向一致：模块表新增项必须同步进契约测试清单，反之亦然
    expect(new Set(declared)).toEqual(new Set(moduleIds))
    expect(declared).toContain('library_reserve')
  })

  it('首页模块顺序表覆盖全部 BASE_MODULES（新增模块不得漏登记）', () => {
    for (const id of moduleIds) {
      expect(HOME_MODULE_ORDER_DEFAULT, `HOME_MODULE_ORDER_DEFAULT 缺少 ${id}`).toContain(id)
    }
  })

  it('教师身份隐藏 library_reserve（学生专属，白名单默认拒绝）', () => {
    expect(TEACHER_VISIBLE_MODULE_IDS.has('library_reserve')).toBe(false)
    expect(isModuleVisibleForRole('library_reserve', 'teacher')).toBe(false)
    expect(isModuleVisibleForRole('library_reserve', 'student')).toBe(true)
    expect(isViewAllowedForRole('library_reserve', 'teacher')).toBe(false)
  })
})

describe('图书馆预约 · 视图与命令注册（#1055–#1057）', () => {
  it('viewRegistry 注册懒加载 + 组件映射', () => {
    const registry = read('src/app/viewRegistry.ts')
    expect(registry).toContain(
      "const loadLibraryReserveView: Loader = () => import('../components/LibraryReserveView.vue')"
    )
    expect(registry).toContain('library_reserve: createAsyncPage(loadLibraryReserveView)')
    expect(registry).toContain('library_reserve: loadLibraryReserveView')
  })

  it('App.vue 渲染 library_reserve 分支', () => {
    const app = readAppContractSources()
    expect(app).toContain("currentView === 'library_reserve'")
    expect(app).toContain('VIEW_COMPONENTS.library_reserve')
  })

  it('Tauri 命令层定义与 lib.rs 注册一一对应（25 条）', () => {
    const transport = read('src-tauri/src/transport/tauri/library_reserve.rs')
    const lib = read('src-tauri/src/lib.rs')
    const defined = [...transport.matchAll(/pub\(crate\) async fn (library_reserve_[a-z0-9_]+)/g)].map(
      (m) => m[1]
    )
    const registered = [
      ...lib.matchAll(/library_reserve::(library_reserve_[a-z0-9_]+)/g)
    ].map((m) => m[1])
    // 18 条（#1052–#1057）+ 4 条座位余量查询 + 2 条本机提交（prepare / submit，2026-10-16）
    // + 1 条预约对象时段设置（item_setting，2026-10-19 实测：提交 intervalIds 必需）
    expect(defined).toHaveLength(25)
    expect(new Set(registered)).toEqual(new Set(defined))
  })

  it('应用内命令不进入 capabilities ACL（仅插件命令需要声明）', () => {
    // 应用自身命令由 generate_handler! 注册，Tauri v2 不要求 capabilities 声明；
    // capabilities/main.json 只登记 core / 插件权限。锁住该边界，防止误加条目。
    const capability = read('src-tauri/capabilities/main.json')
    expect(capability).not.toContain('library_reserve')
  })
})

describe('图书馆预约 · 官方页面内嵌（2026-10-19，座位 cxCaptcha 需要）', () => {
  const embedRust = read('src-tauri/src/modules/library_reserve_embed.rs')
  const lib = read('src-tauri/src/lib.rs')

  it('模块存在且三条命令都在 lib.rs 注册', () => {
    for (const command of [
      'library_reserve_embed_open',
      'library_reserve_embed_resize',
      'library_reserve_embed_close'
    ]) {
      expect(embedRust, `模块缺少 ${command}`).toContain(command)
      expect(lib, `lib.rs 未注册 ${command}`).toContain(
        `modules::library_reserve_embed::${command}`
      )
    }
  })

  it('必须注入 cookie 才能带会话落地（否则 302 登录页）', () => {
    expect(embedRust).toContain('set_cookie')
    expect(embedRust).toContain('export_cookie_pairs_for_origins')
    // 自检：回读目标域 cookie 数（0 说明注入没生效，不用再猜「服务端不认」）
    expect(embedRust).toContain('cookies_for_url')
  })

  it('两个实测坑必须保留修复：域不能带前导点 + 注入后等提交完成', () => {
    // 坑 1：domain(".chaoxing.com") 会被 WebView2 忽略 → 必须用无点域
    expect(embedRust).not.toContain('.domain(".chaoxing.com")')
    expect(embedRust).toContain('trim_start_matches(\'.\')')
    // 坑 2：set_cookie 异步提交，紧接着 navigate 会抢跑 → 必须 sleep
    expect(embedRust).toMatch(/set_cookie[\s\S]*sleep\(std::time::Duration::from_millis\(700\)\)/)
  })

  it('内嵌白名单只放行超星系与学校门户，其它外链走外部浏览器', () => {
    expect(embedRust).toContain('is_embeddable_embed_host')
    expect(embedRust).toContain('chaoxing.com')
    expect(embedRust).toContain('hbut.edu.cn')
    expect(embedRust).toContain('open_external')
  })

  it('座位 live 页由入口 URL 派生且保留凭证 query', () => {
    expect(embedRust).toContain('/front/apps/seatengine/live/select')
    expect(embedRust).toContain('resolve_embed_target_url')
  })

  it('子 WebView 存在时调试桥仍能定位主 WebView（截图 / frontend-eval）', () => {
    // 实测：get_webview_window("main") 在子 WebView 存在时返回 None
    const bridge = read('src-tauri/src/debug_bridge.rs')
    const debugRoutes = read('src-tauri/src/http_server/routes/debug.rs')
    // 截图改为按窗口 HWND 取（`get_window` + `app.windows()` 兜底）
    expect(bridge).toContain('.get_window("main")')
    expect(bridge).toContain('app.windows().into_values()')
    // 旧写法（webview_windows 兜底）不得回归 —— 注释里提到旧 API 名是允许的，故只锁调用形态
    expect(bridge).not.toContain('app.webview_windows().into_values()')
    // frontend-eval 改为按 webview 注册表取（`Webview` 没有 title，标题另取窗口）
    expect(debugRoutes).toContain('.get_webview("main")')
    expect(debugRoutes).not.toContain('.get_webview_window("main")')
  })
})

describe('图书馆预约 · i18n 三语齐备（#1055–#1057）', () => {
  it('视图 / Tab / 模块词条在 zh-CN / en / ja 全部存在', async () => {
    // en / ja 为按需加载字典，断言前显式预热
    await ensureLocaleMessages('en')
    await ensureLocaleMessages('ja')
    const keys = [
      'home.module.library_reserve',
      'home.module.library_reserve.desc',
      'home.cat.chaoxing',
      'library.reserve.title',
      'library.reserve.tab.seat',
      'library.reserve.tab.quiet',
      'library.reserve.tab.room',
      'library.reserve.tab.mine',
      'library.reserve.login.title',
      'library.reserve.login.desc',
      'library.reserve.login.action'
    ]
    for (const locale of ['zh-CN', 'en', 'ja'] as const) {
      for (const key of keys) {
        expect(messages[locale][key], `${locale} 缺少词条 ${key}`).toBeTruthy()
      }
    }
  })

  it('LibraryReserveView 四个 Tab 与 i18n 后缀一致', () => {
    const view = readVueContractSource('src/components/LibraryReserveView.vue')
    expect(view).toContain("const TABS = ['seat', 'quiet', 'room', 'mine']")
    expect(view).toContain('t(`library.reserve.tab.${tabKey}`)')
  })
})
