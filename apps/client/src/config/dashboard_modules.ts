// src/config/dashboard_modules.ts
//
// 首页（Dashboard）**学生侧**模块/分类/快捷入口元数据。
//
// 抽取动机（Teacher Portal V2 / E1 #1021）：`components/Dashboard.vue` 已超
// god-file 上限，本次把「模块表 / 分类表 / 快捷入口元数据 / 宫格图标表」搬出，
// 由 Dashboard 消费。**抽取为零行为变化**：数据逐条原样迁移，消费方式不变。
//
// 边界：本文件只放**学生首页的静态展示元数据**（无取数、无网络、无角色判断）。
// 教师首页的功能目录在 `teacher_feature_catalog.ts`，其首页语义在
// `features/teacher/composables/useTeacherHome.ts`（教师业务只允许在 features/teacher 内）。

/** 首页模块条目（宫格/搜索/导航共用）。 */
export interface DashboardModule {
  id: string
  /** 名称 i18n key（`home.module.*`） */
  name: string
  iconKey: string
  color: string
  /** 描述 i18n key（`home.module.*.desc`） */
  desc: string
  available: boolean
  requiresLogin: boolean
}

/** 首页「所有功能」一级分类（title 为 i18n key；ids 为该分类包含的模块 id）。 */
export interface ModuleCategoryDef {
  title: string
  ids: ReadonlyArray<string>
}

/** 快捷入口展示元数据（name 存 i18n key，渲染时经 t() 取词）。 */
export interface QuickEntryMeta {
  name: string
  icon: string
  color: string
  iconColor: string
}

/** 首页模块清单（顺序即默认展示顺序；`role_capabilities.spec.ts` 的 ALL_MODULE_IDS 与此对齐）。 */
export const BASE_MODULES: DashboardModule[] = [
  { id: 'grades', name: 'home.module.grades', iconKey: 'grades', color: '#667eea', desc: 'home.module.grades.desc', available: true, requiresLogin: true },
  { id: 'classroom', name: 'home.module.classroom', iconKey: 'classroom', color: '#ed8936', desc: 'home.module.classroom.desc', available: true, requiresLogin: true },
  { id: 'electricity', name: 'home.module.electricity', iconKey: 'electricity', color: '#e53e3e', desc: 'home.module.electricity.desc', available: true, requiresLogin: true },
  { id: 'transactions', name: 'home.module.transactions', iconKey: 'transactions', color: '#F56C6C', desc: 'home.module.transactions.desc', available: true, requiresLogin: true },
  { id: 'exams', name: 'home.module.exams', iconKey: 'exams', color: '#38b2ac', desc: 'home.module.exams.desc', available: true, requiresLogin: true },
  { id: 'ranking', name: 'home.module.ranking', iconKey: 'ranking', color: '#f6ad55', desc: 'home.module.ranking.desc', available: true, requiresLogin: true },
  { id: 'campus_code', name: 'home.module.campus_code', iconKey: 'campus_code', color: '#0f766e', desc: 'home.module.campus_code.desc', available: true, requiresLogin: true },
  { id: 'calendar', name: 'home.module.calendar', iconKey: 'calendar', color: '#3b82f6', desc: 'home.module.calendar.desc', available: true, requiresLogin: true },
  { id: 'school_inbox', name: 'home.module.school_inbox', iconKey: 'school_inbox', color: '#6366f1', desc: 'home.module.school_inbox.desc', available: true, requiresLogin: true },
  { id: 'academic', name: 'home.module.academic', iconKey: 'academic', color: '#10b981', desc: 'home.module.academic.desc', available: true, requiresLogin: true },
  { id: 'qxzkb', name: 'home.module.qxzkb', iconKey: 'qxzkb', color: '#6366f1', desc: 'home.module.qxzkb.desc', available: true, requiresLogin: true },
  { id: 'course_selection', name: 'home.module.course_selection', iconKey: 'course_selection', color: '#f59e0b', desc: 'home.module.course_selection.desc', available: true, requiresLogin: true },
  { id: 'training', name: 'home.module.training', iconKey: 'training', color: '#0ea5e9', desc: 'home.module.training.desc', available: true, requiresLogin: true },
  { id: 'teaching_eval', name: 'home.module.teaching_eval', iconKey: 'teaching_eval', color: '#a855f7', desc: 'home.module.teaching_eval.desc', available: true, requiresLogin: true },
  { id: 'chaoxing_hub', name: 'home.module.chaoxing_hub', iconKey: 'chaoxing_hub', color: '#2563eb', desc: 'home.module.chaoxing_hub.desc', available: true, requiresLogin: true },
  { id: 'chaoxing_inbox', name: 'home.module.chaoxing_inbox', iconKey: 'chaoxing_inbox', color: '#4f46e5', desc: 'home.module.chaoxing_inbox.desc', available: true, requiresLogin: true },
  { id: 'chaoxing_class', name: 'home.module.chaoxing_class', iconKey: 'chaoxing_class', color: '#3b82f6', desc: 'home.module.chaoxing_class.desc', available: true, requiresLogin: true },
  { id: 'broadband', name: 'home.module.broadband', iconKey: 'broadband', color: '#0891b2', desc: 'home.module.broadband.desc', available: true, requiresLogin: true },
  // 场馆依赖 172.16.54.20 校园网 + accessToken；外网/无校园网时 third/open 无法落地，暂禁用避免死入口
  { id: 'sports_venue', name: 'home.module.sports_venue', iconKey: 'sports_venue', color: '#16a34a', desc: 'home.module.sports_venue.desc', available: false, requiresLogin: true },
  { id: 'library', name: 'home.module.library', iconKey: 'library', color: '#0f766e', desc: 'home.module.library.desc', available: true, requiresLogin: false },
  { id: 'campus_map', name: 'home.module.campus_map', iconKey: 'campus_map', color: '#14b8a6', desc: 'home.module.campus_map.desc', available: true, requiresLogin: false },
  { id: 'resource_share', name: 'home.module.resource_share', iconKey: 'resource_share', color: '#0ea5e9', desc: 'home.module.resource_share.desc', available: true, requiresLogin: false },
  { id: 'towergo', name: 'home.module.towergo', iconKey: 'towergo', color: '#22c55e', desc: 'home.module.towergo.desc', available: true, requiresLogin: false },
  { id: 'ai', name: 'home.module.ai', iconKey: 'ai', color: '#94a3b8', desc: 'home.module.ai.desc', available: true, requiresLogin: true }
]

/** 「所有功能」分类定义（顺序即 tab 顺序；空分类由调用方过滤后不渲染）。 */
export const MODULE_CATEGORY_DEFS: ModuleCategoryDef[] = [
  {
    title: 'home.cat.academic',
    ids: [
      'grades',
      'exams',
      'ranking',
      'academic',
      'qxzkb',
      'course_selection',
      'training',
      'teaching_eval',
      'classroom',
      'calendar',
      'school_inbox'
    ]
  },
  {
    title: 'home.cat.chaoxing',
    ids: ['chaoxing_hub', 'chaoxing_inbox', 'chaoxing_class']
  },
  {
    title: 'home.cat.yimatong',
    ids: ['campus_code', 'electricity', 'transactions', 'broadband', 'sports_venue']
  },
  {
    title: 'home.cat.resource',
    ids: ['library', 'campus_map', 'resource_share', 'towergo', 'ai']
  }
]

/**
 * 按分类定义把模块列表切分为分类（保持模块列表自身顺序，与抽取前一致）。
 *
 * @param modules 已按身份/策略过滤过的模块列表
 */
export const buildModuleCategories = <T extends { id?: string }>(
  modules: ReadonlyArray<T> | null | undefined
): Array<{ title: string; modules: T[] }> => {
  const list = Array.isArray(modules) ? modules : []
  return MODULE_CATEGORY_DEFS.map((def) => ({
    title: def.title,
    modules: list.filter((module) => def.ids.includes(String(module?.id || '')))
  }))
}

/** 快捷入口的图标/颜色映射（含 schedule）；name 仅存 i18n key，渲染时取词。 */
export const QUICK_ENTRY_META: Record<string, QuickEntryMeta> = {
  grades: { name: 'home.module.grades', icon: 'fa-award', color: 'bg-blue-50', iconColor: 'text-blue-500' },
  schedule: { name: 'home.module.schedule', icon: 'fa-calendar-check', color: 'bg-orange-50', iconColor: 'text-orange-500' },
  classroom: { name: 'home.module.classroom', icon: 'fa-door-open', color: 'bg-green-50', iconColor: 'text-green-500' },
  electricity: { name: 'home.module.electricity', icon: 'fa-bolt', color: 'bg-red-50', iconColor: 'text-red-500' },
  ranking: { name: 'home.module.ranking', icon: 'fa-chart-bar', color: 'bg-yellow-50', iconColor: 'text-yellow-500' },
  exams: { name: 'home.module.exams', icon: 'fa-file-alt', color: 'bg-teal-50', iconColor: 'text-teal-500' },
  calendar: { name: 'home.module.calendar', icon: 'fa-calendar-alt', color: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  school_inbox: { name: 'home.module.school_inbox', icon: 'fa-envelope', color: 'bg-indigo-50', iconColor: 'text-indigo-600' },
  academic: { name: 'home.module.academic', icon: 'fa-chart-line', color: 'bg-emerald-50', iconColor: 'text-emerald-500' },
  campus_code: { name: 'home.module.campus_code', icon: 'fa-qrcode', color: 'bg-cyan-50', iconColor: 'text-cyan-500' },
  transactions: { name: 'home.module.transactions', icon: 'fa-wallet', color: 'bg-pink-50', iconColor: 'text-pink-500' },
  qxzkb: { name: 'home.module.qxzkb', icon: 'fa-table', color: 'bg-violet-50', iconColor: 'text-violet-500' },
  course_selection: { name: 'home.module.course_selection', icon: 'fa-tasks', color: 'bg-amber-50', iconColor: 'text-amber-500' },
  training: { name: 'home.module.training', icon: 'fa-sitemap', color: 'bg-sky-50', iconColor: 'text-sky-500' },
  teaching_eval: { name: 'home.module.teaching_eval', icon: 'fa-star', color: 'bg-purple-50', iconColor: 'text-purple-500' },
  chaoxing_hub: { name: 'home.module.chaoxing_hub', icon: 'fa-graduation-cap', color: 'bg-blue-50', iconColor: 'text-blue-600' },
  chaoxing_inbox: { name: 'home.module.chaoxing_inbox', icon: 'fa-inbox', color: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  chaoxing_class: { name: 'home.module.chaoxing_class', icon: 'fa-folder-open', color: 'bg-sky-50', iconColor: 'text-sky-600' },
  broadband: { name: 'home.module.broadband', icon: 'fa-wifi', color: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  sports_venue: { name: 'home.module.sports_venue', icon: 'fa-futbol', color: 'bg-green-50', iconColor: 'text-green-600' },
  library: { name: 'home.module.library', icon: 'fa-book', color: 'bg-lime-50', iconColor: 'text-lime-600' },
  resource_share: { name: 'home.module.resource_share', icon: 'fa-cloud', color: 'bg-blue-50', iconColor: 'text-blue-500' },
  campus_map: { name: 'home.module.campus_map', icon: 'fa-map-marked-alt', color: 'bg-teal-50', iconColor: 'text-teal-600' },
  towergo: { name: 'home.module.towergo', icon: 'fa-bicycle', color: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  ai: { name: 'home.module.ai', icon: 'fa-robot', color: 'bg-gray-50', iconColor: 'text-gray-500' }
}

/** 「所有功能」宫格图标底色（键为模块 id）。 */
export const FEATURE_ICON_COLORS: Record<string, string> = {
  grades: 'bg-blue-500', classroom: 'bg-orange-400', exams: 'bg-teal-500',
  ranking: 'bg-yellow-500', calendar: 'bg-blue-500', school_inbox: 'bg-indigo-500', academic: 'bg-green-500',
  qxzkb: 'bg-indigo-500', course_selection: 'bg-orange-500', training: 'bg-sky-400', teaching_eval: 'bg-purple-500',
  campus_code: 'bg-teal-600', electricity: 'bg-red-500', transactions: 'bg-pink-500',
  chaoxing_hub: 'bg-blue-600', chaoxing_inbox: 'bg-indigo-600', chaoxing_class: 'bg-sky-500',
  broadband: 'bg-cyan-600', sports_venue: 'bg-green-600',
  library: 'bg-emerald-600', campus_map: 'bg-teal-500', resource_share: 'bg-blue-500',
  towergo: 'bg-emerald-500',
  ai: 'bg-gray-400'
}

/** 「所有功能」宫格 FontAwesome 图标（键为模块 id）。 */
export const FEATURE_ICONS: Record<string, string> = {
  grades: 'fa-graduation-cap', classroom: 'fa-door-open', exams: 'fa-calendar-check',
  ranking: 'fa-chart-bar', calendar: 'fa-calendar-alt', school_inbox: 'fa-envelope', academic: 'fa-chart-line',
  qxzkb: 'fa-table', course_selection: 'fa-tasks', training: 'fa-sitemap', teaching_eval: 'fa-star',
  campus_code: 'fa-qrcode', electricity: 'fa-bolt', transactions: 'fa-wallet',
  chaoxing_hub: 'fa-graduation-cap', chaoxing_inbox: 'fa-inbox', chaoxing_class: 'fa-folder-open',
  broadband: 'fa-wifi', sports_venue: 'fa-futbol',
  library: 'fa-book', campus_map: 'fa-map-marked-alt', resource_share: 'fa-cloud',
  towergo: 'fa-bicycle',
  ai: 'fa-robot'
}
