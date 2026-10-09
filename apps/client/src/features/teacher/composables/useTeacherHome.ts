// src/features/teacher/composables/useTeacherHome.ts
//
// Teacher Portal V2（E1 #1021）：教师首页语义。
//
// 职责（只做「教师首页」这一件事，且**纯计算、无网络、无副作用**）：
//   1. 教师「所有功能」只呈现 `teacher_feature_catalog` 声明的两个一级分类
//      （教务系统 / 资源），空分类不显示；未登记 / 未放行的入口一律不出现。
//   2. 教师默认快捷入口（引用目录条目 id）与宫格图标叠加。
//   3. 今日安排的角色化文案 key：教师是「今日授课」，不得出现「去上课」等学生行动文案。
//
// 取数**不在本文件**：今日授课沿用 `/v2/schedule/query` → Rust `sync_schedule`
// 的教师分流链路（`application/schedule.rs`），本文件只负责语义与文案。

import { computed, type ComputedRef, type Ref } from 'vue'
import {
  TEACHER_DEFAULT_SHORTCUT_IDS,
  TEACHER_FEATURE_CATALOG,
  TEACHER_FEATURE_CATEGORIES,
  getTeacherFeaturesByCategory,
  type TeacherFeatureEntry
} from '../../../config/teacher_feature_catalog'
import { isTeacherRole, isViewAllowedForRole } from '../../../config/role_capabilities.js'
import {
  FEATURE_ICON_COLORS,
  FEATURE_ICONS,
  type QuickEntryMeta
} from '../../../config/dashboard_modules'

/** 首页快捷入口固定 5 格（与 Dashboard 编辑器约束一致）。 */
export const TEACHER_QUICK_ENTRY_SLOTS = 5

/** 教师首页宫格/导航用的模块视图对象（id = 视图 id）。 */
export interface TeacherHomeModule {
  id: string
  /** 名称 i18n key（`teacher.home.item.*`） */
  name: string
  desc: string
  iconKey: string
  color: string
  available: boolean
  requiresLogin: boolean
  /** 能力开关：false 时目标视图渲染「建设中」空态（E8 逐项置 true）。 */
  enabled: boolean
}

/** 教师首页一级分类（title 为 i18n key）。 */
export interface TeacherHomeCategory {
  title: string
  modules: TeacherHomeModule[]
}

/** 今日安排的角色化文案 key（学生用 `home.today.*`，教师用 `teacher.home.today.*`）。 */
export interface TodayPanelI18n {
  panelTitle: string
  blockTitle: string
  blockOngoing: string
  blockNext: string
  empty: string
  loading: string
  loadFailed: string
  loginRequired: string
  lessonsSuffix: string
  remaining: string
  /** 卡片行动按钮（学生：去上课 / 事件：查看课表） */
  goToClass: string
  viewSchedule: string
}

/** 教师首页专属入口的宫格图标（学生侧 FEATURE_ICONS 不含这些视图 id）。 */
const TEACHER_MODULE_ICONS: Record<string, string> = {
  teacherteaching: 'fa-chalkboard-teacher',
  teacherexams: 'fa-clipboard-check',
  teachernotifications: 'fa-envelope-open-text'
}

/** 教师首页专属入口的宫格底色。 */
const TEACHER_MODULE_ICON_COLORS: Record<string, string> = {
  teacherteaching: 'bg-blue-500',
  teacherexams: 'bg-teal-500',
  teachernotifications: 'bg-indigo-500'
}

/** 教师首页专属入口的快捷入口元数据（学生侧 QUICK_ENTRY_META 不含这些视图 id）。 */
export const TEACHER_QUICK_ENTRY_META: Record<string, QuickEntryMeta> = {
  teacherteaching: { name: 'teacher.home.item.teaching', icon: 'fa-chalkboard-teacher', color: 'bg-blue-50', iconColor: 'text-blue-600' },
  teacherexams: { name: 'teacher.home.item.exams', icon: 'fa-clipboard-check', color: 'bg-teal-50', iconColor: 'text-teal-600' },
  teachernotifications: { name: 'teacher.home.item.notifications', icon: 'fa-envelope-open-text', color: 'bg-indigo-50', iconColor: 'text-indigo-600' }
}

/** 学生今日安排文案（与 Dashboard 原有 key 完全一致，零回归）。 */
export const STUDENT_TODAY_I18N: TodayPanelI18n = {
  panelTitle: 'home.today.panelTitle',
  blockTitle: 'home.today.blockTitle',
  blockOngoing: 'home.today.blockOngoing',
  blockNext: 'home.today.blockNext',
  empty: 'home.today.empty',
  loading: 'home.today.loading',
  loadFailed: 'home.today.loadFailed',
  loginRequired: 'home.today.loginRequired',
  lessonsSuffix: 'home.today.lessonsSuffix',
  remaining: 'home.today.remaining',
  goToClass: 'home.today.goToClass',
  viewSchedule: 'home.today.viewSchedule'
}

/** 教师今日授课文案（三语字典 `teacher.home.today.*`，E1 追加）。 */
export const TEACHER_TODAY_I18N: TodayPanelI18n = {
  panelTitle: 'teacher.home.today.panelTitle',
  blockTitle: 'teacher.home.today.blockTitle',
  blockOngoing: 'teacher.home.today.blockOngoing',
  blockNext: 'teacher.home.today.blockNext',
  empty: 'teacher.home.today.empty',
  loading: 'teacher.home.today.loading',
  loadFailed: 'teacher.home.today.loadFailed',
  loginRequired: 'teacher.home.today.loginRequired',
  lessonsSuffix: 'teacher.home.today.lessonsSuffix',
  remaining: 'teacher.home.today.remaining',
  // 教师不出现「去上课」式学生行动文案：两种场景都落到「查看课表」
  goToClass: 'teacher.home.today.viewSchedule',
  viewSchedule: 'teacher.home.today.viewSchedule'
}

const toHomeModule = (entry: TeacherFeatureEntry): TeacherHomeModule => ({
  id: entry.viewId,
  name: entry.nameKey,
  desc: '',
  iconKey: entry.viewId,
  color: '#64748b',
  available: true,
  requiresLogin: true,
  enabled: entry.enabled
})

/**
 * 教师首页「所有功能」分类：只取目录声明的两个一级分类，
 * 且仅保留**路由级放行**（`isViewAllowedForRole`）的条目；空分类丢弃。
 * 非教师身份返回空数组（学生分类由 Dashboard 自行构建，互不干扰）。
 */
export const buildTeacherHomeCategories = (role: unknown): TeacherHomeCategory[] => {
  if (!isTeacherRole(role)) return []
  return TEACHER_FEATURE_CATEGORIES.map((category) => ({
    title: category.labelKey,
    modules: getTeacherFeaturesByCategory(category.id)
      .filter((entry) => isViewAllowedForRole(entry.viewId, role))
      .map(toHomeModule)
  })).filter((category) => category.modules.length > 0)
}

/** 教师首页模块全集（分类扁平化，供导航准入与首页搜索复用）。 */
export const buildTeacherHomeModules = (role: unknown): TeacherHomeModule[] =>
  buildTeacherHomeCategories(role).flatMap((category) => category.modules)

/**
 * 教师默认快捷入口（视图 id，顺序即展示顺序）。
 *
 * 目录默认只声明 4 项（`TEACHER_DEFAULT_SHORTCUT_IDS`），而首页快捷入口固定 5 格，
 * 因此按目录声明顺序补足到 5 项，保证教师快捷入口不为空、且全部为教师可用入口。
 * 非教师身份返回空数组。
 */
export const buildTeacherDefaultShortcutIds = (role: unknown): string[] => {
  if (!isTeacherRole(role)) return []
  const picked: string[] = []
  const push = (viewId: unknown) => {
    const id = String(viewId ?? '').trim()
    if (id && !picked.includes(id) && isViewAllowedForRole(id, role)) picked.push(id)
  }
  for (const entryId of TEACHER_DEFAULT_SHORTCUT_IDS) {
    push(TEACHER_FEATURE_CATALOG.find((entry) => entry.id === entryId)?.viewId)
  }
  for (const entry of TEACHER_FEATURE_CATALOG) {
    if (picked.length >= TEACHER_QUICK_ENTRY_SLOTS) break
    push(entry.viewId)
  }
  return picked.slice(0, TEACHER_QUICK_ENTRY_SLOTS)
}

/**
 * 教师首页组合函数。
 *
 * @param options.role 当前身份（`student` / `teacher`）的响应式来源
 */
export const useTeacherHome = (options: { role: Ref<string> | ComputedRef<string> }) => {
  const isTeacher = computed(() => isTeacherRole(options.role.value))
  const featureCategories = computed(() => buildTeacherHomeCategories(options.role.value))
  const homeModules = computed(() => buildTeacherHomeModules(options.role.value))
  const defaultShortcutIds = computed(() => buildTeacherDefaultShortcutIds(options.role.value))
  /** 教师专属快捷入口元数据（学生身份为空对象，学生侧元数据表零改动） */
  const quickEntryMeta = computed<Record<string, QuickEntryMeta>>(() =>
    isTeacher.value ? TEACHER_QUICK_ENTRY_META : {}
  )
  const featureIcons = computed<Record<string, string>>(() =>
    isTeacher.value ? { ...FEATURE_ICONS, ...TEACHER_MODULE_ICONS } : FEATURE_ICONS
  )
  const featureIconColors = computed<Record<string, string>>(() =>
    isTeacher.value ? { ...FEATURE_ICON_COLORS, ...TEACHER_MODULE_ICON_COLORS } : FEATURE_ICON_COLORS
  )
  const todayI18n = computed<TodayPanelI18n>(() =>
    isTeacher.value ? TEACHER_TODAY_I18N : STUDENT_TODAY_I18N
  )

  return {
    isTeacher,
    featureCategories,
    homeModules,
    defaultShortcutIds,
    quickEntryMeta,
    featureIcons,
    featureIconColors,
    todayI18n
  }
}
