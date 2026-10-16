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

  it('Tauri 命令层定义与 lib.rs 注册一一对应（18 条）', () => {
    const transport = read('src-tauri/src/transport/tauri/library_reserve.rs')
    const lib = read('src-tauri/src/lib.rs')
    const defined = [...transport.matchAll(/pub\(crate\) async fn (library_reserve_[a-z0-9_]+)/g)].map(
      (m) => m[1]
    )
    const registered = [
      ...lib.matchAll(/library_reserve::(library_reserve_[a-z0-9_]+)/g)
    ].map((m) => m[1])
    expect(defined).toHaveLength(18)
    expect(new Set(registered)).toEqual(new Set(defined))
  })

  it('应用内命令不进入 capabilities ACL（仅插件命令需要声明）', () => {
    // 应用自身命令由 generate_handler! 注册，Tauri v2 不要求 capabilities 声明；
    // capabilities/main.json 只登记 core / 插件权限。锁住该边界，防止误加条目。
    const capability = read('src-tauri/capabilities/main.json')
    expect(capability).not.toContain('library_reserve')
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
