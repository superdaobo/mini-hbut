/**
 * 给分记录（grade_distribution）独立首页模块（#1110）契约。
 *
 * 把关五件事，避免新模块合入后才暴露：
 * 1. **首页模块注册**：`dashboard_modules.ts` 的 BASE_MODULES / 分类表 / 快捷入口 /
 *    宫格图标，与 `HOME_MODULE_ORDER_DEFAULT`、`role_capabilities.spec.ts` 对齐；
 * 2. **布局迁移**：升级用户的旧 `moduleOrder` 缺少新 id 时，`normalizeWorkspaceLayout`
 *    必须把 `grade_distribution` 插到 `grades` 之后，其余相对顺序保持、不重复、不丢模块；
 * 3. **视图与导航**：`viewRegistry.ts` 懒加载、`App.vue` 渲染分支、
 *    `HIERARCHICAL_PARENT_VIEW_MAP` 父视图为 home；
 * 4. **策略**：与 grades 同级只读查询 —— App Store guest/demo 白名单允许、
 *    黑名单不含；教师角色默认白名单拒绝（学生专属）；
 * 5. **i18n 三语齐备** + 旧「成绩查询 → 给分记录」Tab 源码契约（两入口同一视图）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  BASE_MODULES,
  FEATURE_ICONS,
  FEATURE_ICON_COLORS,
  MODULE_CATEGORY_DEFS,
  QUICK_ENTRY_META
} from '../config/dashboard_modules'
import {
  APP_STORE_BLOCKED_MODULE_IDS,
  isDeepLinkAllowed,
  isModuleAllowed,
  isViewAllowed,
  setAppStoreBuildOverrideForTests,
  setAppStoreSessionOverrideForTests
} from '../config/app_store_policy'
import { resolvePolicySafeView } from '../config/accessible_view'
import { TEACHER_VISIBLE_MODULE_IDS, isModuleVisibleForRole } from '../config/role_capabilities'
import { HOME_MODULE_ORDER_DEFAULT } from '../config/ui_settings'
import { HIERARCHICAL_PARENT_VIEW_MAP } from '../navigation/app_navigation'
import { ensureLocaleMessages, messages } from './app_i18n'
import { normalizeSettings, normalizeWorkspaceLayout } from './ui_settings'
import { readAppContractSources, readContractSource, readVueContractSource } from './contract_source_test'

const read = readContractSource

const MODULE_ID = 'grade_distribution'

describe('给分记录 · 首页模块注册（#1110）', () => {
  const moduleIds = BASE_MODULES.map((m) => m.id)

  it('BASE_MODULES 注册 grade_distribution（i18n 名称 + 依赖登录 + 可用）', () => {
    const mod = BASE_MODULES.find((m) => m.id === MODULE_ID)
    expect(mod).toBeTruthy()
    expect(mod).toMatchObject({
      name: 'home.module.grade_distribution',
      desc: 'home.module.grade_distribution.desc',
      iconKey: MODULE_ID,
      available: true,
      requiresLogin: true
    })
  })

  it('归入「教务服务」（home.cat.academic）分类且紧跟「成绩查询」', () => {
    const academic = MODULE_CATEGORY_DEFS.find((c) => c.title === 'home.cat.academic')
    expect(academic, '缺少教务服务分类').toBeTruthy()
    const ids = academic!.ids
    expect(ids).toContain(MODULE_ID)
    expect(ids[ids.indexOf('grades') + 1]).toBe(MODULE_ID)
  })

  it('默认模块顺序表 HOME_MODULE_ORDER_DEFAULT 紧跟 grades 之后', () => {
    expect(HOME_MODULE_ORDER_DEFAULT).toContain(MODULE_ID)
    expect(HOME_MODULE_ORDER_DEFAULT[HOME_MODULE_ORDER_DEFAULT.indexOf('grades') + 1]).toBe(MODULE_ID)
    // 无重复
    expect(new Set(HOME_MODULE_ORDER_DEFAULT).size).toBe(HOME_MODULE_ORDER_DEFAULT.length)
  })

  it('快捷入口元数据 / 宫格图标 / 图标底色齐备（快捷入口可选）', () => {
    expect(QUICK_ENTRY_META[MODULE_ID]).toBeTruthy()
    expect(QUICK_ENTRY_META[MODULE_ID]!.name).toBe('home.module.grade_distribution')
    expect(FEATURE_ICONS[MODULE_ID]).toBeTruthy()
    expect(FEATURE_ICON_COLORS[MODULE_ID]).toBeTruthy()
  })

  it('BASE_MODULES 与 role_capabilities.spec.ts 的 ALL_MODULE_IDS 完全对齐（含新模块）', () => {
    const spec = read('src/config/role_capabilities.spec.ts')
    const match = spec.match(/const ALL_MODULE_IDS\s*=\s*\[([\s\S]*?)\]/)
    expect(match, '未在 role_capabilities.spec.ts 找到 ALL_MODULE_IDS').toBeTruthy()
    const declared = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    // 双向一致：模块表新增项必须同步进契约测试清单，反之亦然
    expect(new Set(declared)).toEqual(new Set(moduleIds))
    expect(declared).toContain(MODULE_ID)
  })

  it('首页模块顺序表覆盖全部 BASE_MODULES（新增模块不得漏登记）', () => {
    for (const id of moduleIds) {
      expect(HOME_MODULE_ORDER_DEFAULT, `HOME_MODULE_ORDER_DEFAULT 缺少 ${id}`).toContain(id)
    }
  })

  it('WorkspaceLayoutEditor 的 homeModuleMeta 登记中文标题（硬编码映射）', () => {
    const editor = readVueContractSource('src/components/WorkspaceLayoutEditor.vue')
    expect(editor).toContain('grade_distribution: \'给分记录\'')
  })
})

describe('给分记录 · 旧布局迁移（#1110，升级用户 moduleOrder 缺新 id）', () => {
  it('旧顺序缺 grade_distribution：插入到 grades 之后，其余相对顺序保持', () => {
    const layout = normalizeWorkspaceLayout({
      version: 1,
      home: {
        widgetsOrder: ['module_grid', 'today_panel'],
        // 模拟 #1110 之前保存的自定义顺序（顺序被打乱过）
        moduleOrder: ['classroom', 'grades', 'electricity', 'campus_map', 'ai']
      },
      notifications: { cardsOrder: ['class_reminder', 'grades'] }
    })
    const order = layout.home.moduleOrder
    expect(order[order.indexOf('grades') + 1]).toBe(MODULE_ID)
    // 其余模块相对顺序保持不变：classroom < electricity < campus_map < ai
    // 注：filter 的 k !== MODULE_ID 会把元素类型收窄为 Exclude<HomeModuleKey, MODULE_ID>，
    // 这里显式恢复为完整 HomeModuleKey[]，便于用统一索引函数比较相对位置。
    const rest = order.filter((k) => k !== MODULE_ID) as (typeof order)
    const restIdx = (id: (typeof order)[number]) => rest.indexOf(id)
    expect(restIdx('classroom')).toBeLessThan(restIdx('electricity'))
    expect(restIdx('electricity')).toBeLessThan(restIdx('campus_map'))
    expect(restIdx('campus_map')).toBeLessThan(restIdx('ai'))
    // 无重复、无丢失：与默认全集一一对应
    expect(new Set(order).size).toBe(order.length)
    expect(new Set(order)).toEqual(new Set(HOME_MODULE_ORDER_DEFAULT))
  })

  it('grades 在首位的老布局：grade_distribution 落到第 2 位', () => {
    const layout = normalizeWorkspaceLayout({
      home: { moduleOrder: ['grades', 'classroom', 'exams'] }
    })
    expect(layout.home.moduleOrder.slice(0, 2)).toEqual(['grades', MODULE_ID])
  })

  it('旧顺序缺 grades 时不强行插首，交给默认合并兜底（仍不丢模块）', () => {
    const layout = normalizeWorkspaceLayout({
      home: { moduleOrder: ['exams', 'classroom'] }
    })
    const order = layout.home.moduleOrder
    expect(order[0]).toBe('exams')
    expect(order).toContain(MODULE_ID)
    expect(new Set(order)).toEqual(new Set(HOME_MODULE_ORDER_DEFAULT))
  })

  it('已含 grade_distribution 的布局（新版本已保存）：迁移幂等，位置不动', () => {
    const layout = normalizeWorkspaceLayout({
      home: { moduleOrder: [MODULE_ID, 'grades', 'classroom'] }
    })
    expect(layout.home.moduleOrder.slice(0, 2)).toEqual([MODULE_ID, 'grades'])
  })

  it('全新安装 / 空布局：走默认顺序（grade_distribution 紧跟 grades）', () => {
    for (const raw of [null, undefined, {}, { home: {} }, { home: { moduleOrder: null } }]) {
      const layout = normalizeWorkspaceLayout(raw)
      expect(layout.home.moduleOrder).toEqual([...HOME_MODULE_ORDER_DEFAULT])
    }
  })

  it('normalizeSettings 入口同样完成迁移（设置读取链路）', () => {
    const settings = normalizeSettings({
      workspaceLayout: { home: { moduleOrder: ['grades', 'ranking', 'ai'] } }
    })
    const order = settings.workspaceLayout.home.moduleOrder
    expect(order[order.indexOf('grades') + 1]).toBe(MODULE_ID)
    expect(new Set(order)).toEqual(new Set(HOME_MODULE_ORDER_DEFAULT))
  })
})

describe('给分记录 · 视图与导航注册（#1110）', () => {
  it('viewRegistry 注册懒加载 + 组件映射 + prefetch', () => {
    const registry = read('src/app/viewRegistry.ts')
    expect(registry).toContain(
      "const loadGradeDistributionPageView: Loader = () => import('../components/GradeDistributionPage.vue')"
    )
    expect(registry).toContain('grade_distribution: createAsyncPage(loadGradeDistributionPageView)')
    expect(registry).toContain('grade_distribution: loadGradeDistributionPageView')
  })

  it('App.vue 解构并渲染 grade_distribution 分支（返回回仪表盘）', () => {
    const app = readAppContractSources()
    expect(app).toContain('grade_distribution: GradeDistributionPage')
    expect(app).toContain("currentView === 'grade_distribution'")
  })

  it('独立页 = TPageHeader + 复用 GradeDistributionView，emit back', () => {
    const page = readVueContractSource('src/components/GradeDistributionPage.vue')
    expect(page).toContain('TPageHeader')
    expect(page).toContain("t('grade.dist.title')")
    expect(page).toContain('GradeDistributionView')
    expect(page).toContain("import GradeDistributionView from './GradeDistributionView.vue'")
    expect(page).toContain("defineEmits(['back'])")
    // 独立页不接收成绩查询的刷新/滚动 props（零 props 传递）
    expect(page).not.toContain(':refreshing=')
    expect(page).not.toContain(':offline=')
  })

  it('旧「成绩查询 → 给分记录」Tab 完整保留，且与独立页复用同一视图', () => {
    const gradeView = readVueContractSource('src/components/GradeView.vue')
    expect(gradeView).toContain("import GradeDistributionView from './GradeDistributionView.vue'")
    expect(gradeView).toContain("v-if=\"activeGradeTab === 'distribution'\"")
    expect(gradeView).toContain("t('grade.tab.distribution')")
  })

  it('父视图映射为 home（返回层级）', () => {
    expect(HIERARCHICAL_PARENT_VIEW_MAP[MODULE_ID]).toBe('home')
  })
})

describe('给分记录 · App Store 策略与角色（#1110）', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
    setAppStoreSessionOverrideForTests(null)
  })

  it('与 grades 同级只读查询：白名单允许、黑名单不含', () => {
    expect(APP_STORE_BLOCKED_MODULE_IDS.has(MODULE_ID)).toBe(false)
  })

  it('合规构建 guest 会话：模块 / 视图 / 深链全部放行', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: false, isDemoSession: false })
    expect(isModuleAllowed(MODULE_ID)).toBe(true)
    expect(isViewAllowed(MODULE_ID)).toBe(true)
    expect(isDeepLinkAllowed(MODULE_ID)).toBe(true)
    // 深链/恢复路径同样放行（对照 grades 的行为）
    expect(resolvePolicySafeView(MODULE_ID)).toBe(MODULE_ID)
    expect(resolvePolicySafeView('grades')).toBe('grades')
  })

  it('合规构建 demo 会话：同样放行（只读查询，与 grades 一致）', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: true, isDemoSession: true })
    expect(isModuleAllowed(MODULE_ID)).toBe(true)
    expect(isViewAllowed(MODULE_ID)).toBe(true)
  })

  it('教师角色不可见（学生教务模块，默认白名单拒绝）', () => {
    expect(TEACHER_VISIBLE_MODULE_IDS.has(MODULE_ID)).toBe(false)
    expect(isModuleVisibleForRole(MODULE_ID, 'teacher')).toBe(false)
    expect(isModuleVisibleForRole(MODULE_ID, 'student')).toBe(true)
  })
})

describe('给分记录 · i18n 三语齐备（#1110）', () => {
  it('模块名称 / 描述 / 页面标题在 zh-CN / en / ja 全部存在', async () => {
    // en / ja 为按需加载字典，断言前显式预热
    await ensureLocaleMessages('en')
    await ensureLocaleMessages('ja')
    const keys = [
      'home.module.grade_distribution',
      'home.module.grade_distribution.desc',
      'grade.dist.title'
    ]
    for (const locale of ['zh-CN', 'en', 'ja'] as const) {
      for (const key of keys) {
        expect(messages[locale][key], `${locale} 缺少词条 ${key}`).toBeTruthy()
      }
    }
  })
})
