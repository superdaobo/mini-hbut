// src/config/teacher_feature_catalog.ts
//
// Teacher Portal V2（#1019）：教师首页功能目录与能力开关。
//
// 约束（Epic #1018）：
//   - 教师首页**仅「教务系统」「资源」两个一级分类**，空分类不显示；
//   - 每个功能带 `flagKey` + `enabled`，**默认全部 false**（fail-closed）；
//     E8（#1028）只对**已验证通过**的功能逐项置 true；
//   - 本目录只描述「有哪些入口、归哪个分类、是否开放」，**不含任何取数逻辑**；
//   - 路由可达性由 `config/role_capabilities.js` 的 `isViewAllowedForRole` 负责，
//     隐藏图标**不承担**访问控制。
//
// 消费方：E1（#1021）Dashboard 教师分类/快捷入口；E2–E6 读取自身 flag 决定空态。

/** 教师首页一级分类（只允许这两个）。 */
export type TeacherFeatureCategory = 'academic' | 'resource'

/** 教师首页功能条目。 */
export interface TeacherFeatureEntry {
  /** 条目 id（稳定标识，用于快捷入口引用）。 */
  id: string
  /** 目标视图 id（必须在 `role_capabilities.js` 的 TEACHER_ALLOWED_VIEW_IDS 内）。 */
  viewId: string
  /** 所属一级分类。 */
  category: TeacherFeatureCategory
  /** 能力开关 key（`teacher.feature.*`）。 */
  flagKey: string
  /** 是否开放（**默认 false**；仅 E8 对验证通过项置 true）。 */
  enabled: boolean
  /** 名称 i18n key（`teacher.home.item.*`）。 */
  nameKey: string
}

/** 一级分类定义（labelKey 指向 `teacher.category.*`）。 */
export const TEACHER_FEATURE_CATEGORIES: ReadonlyArray<{
  id: TeacherFeatureCategory
  labelKey: string
}> = Object.freeze([
  { id: 'academic', labelKey: 'teacher.category.academic' },
  { id: 'resource', labelKey: 'teacher.category.resource' }
])

/**
 * 教师首页功能目录（全部默认关闭）。
 *
 * - `academic` 教务系统：我的教学 / 考试与监考 / 教务通知 / 全校课表 / 空教室 / 校历
 * - `resource` 资源：图书馆 / 校园地图 / 资源共享
 *
 * ⚠️ 未验证教师权限的模块（校园卡 / 学习通 / 校园网 / 游戏积分）**不登记**，默认拒绝。
 */
export const TEACHER_FEATURE_CATALOG: ReadonlyArray<TeacherFeatureEntry> = Object.freeze([
  // ── 教务系统 ────────────────────────────────────────────────
  {
    id: 'teacher_teaching',
    viewId: 'teacherteaching',
    category: 'academic',
    flagKey: 'teacher.feature.teaching',
    enabled: false,
    nameKey: 'teacher.home.item.teaching'
  },
  {
    id: 'teacher_exams',
    viewId: 'teacherexams',
    category: 'academic',
    flagKey: 'teacher.feature.exams',
    enabled: false,
    nameKey: 'teacher.home.item.exams'
  },
  {
    id: 'teacher_notifications',
    viewId: 'teachernotifications',
    category: 'academic',
    flagKey: 'teacher.feature.notifications',
    enabled: false,
    nameKey: 'teacher.home.item.notifications'
  },
  {
    id: 'qxzkb',
    viewId: 'qxzkb',
    category: 'academic',
    flagKey: 'teacher.feature.qxzkb',
    enabled: false,
    nameKey: 'teacher.home.item.qxzkb'
  },
  {
    id: 'classroom',
    viewId: 'classroom',
    category: 'academic',
    flagKey: 'teacher.feature.classroom',
    enabled: false,
    nameKey: 'teacher.home.item.classroom'
  },
  {
    id: 'calendar',
    viewId: 'calendar',
    category: 'academic',
    flagKey: 'teacher.feature.calendar',
    enabled: false,
    nameKey: 'teacher.home.item.calendar'
  },
  // ── 资源 ────────────────────────────────────────────────────
  {
    id: 'library',
    viewId: 'library',
    category: 'resource',
    flagKey: 'teacher.feature.library',
    enabled: false,
    nameKey: 'teacher.home.item.library'
  },
  {
    id: 'campus_map',
    viewId: 'campus_map',
    category: 'resource',
    flagKey: 'teacher.feature.campus_map',
    enabled: false,
    nameKey: 'teacher.home.item.campusMap'
  },
  {
    id: 'resource_share',
    viewId: 'resource_share',
    category: 'resource',
    flagKey: 'teacher.feature.resource_share',
    enabled: false,
    nameKey: 'teacher.home.item.resourceShare'
  }
])

/** 教师默认快捷入口（引用目录条目 id，顺序即展示顺序）。 */
export const TEACHER_DEFAULT_SHORTCUT_IDS: ReadonlyArray<string> = Object.freeze([
  'teacher_teaching',
  'teacher_exams',
  'teacher_notifications',
  'qxzkb'
])

/** flagKey → enabled 快照（只读；E8 通过修改目录 enabled 后由本表重算）。 */
export const TEACHER_FEATURE_FLAGS: Readonly<Record<string, boolean>> = Object.freeze(
  Object.fromEntries(TEACHER_FEATURE_CATALOG.map((entry) => [entry.flagKey, entry.enabled]))
)

/** 查询某个能力开关是否已开放（未知 flag 一律 false，fail-closed）。 */
export const isTeacherFeatureEnabled = (flagKey: unknown): boolean =>
  TEACHER_FEATURE_FLAGS[String(flagKey ?? '')] === true

/** 按一级分类取条目（顺序保持目录声明顺序）。 */
export const getTeacherFeaturesByCategory = (
  category: TeacherFeatureCategory
): TeacherFeatureEntry[] => TEACHER_FEATURE_CATALOG.filter((entry) => entry.category === category)

/** 当前已开放（enabled=true）的条目；E0 阶段为空数组。 */
export const listEnabledTeacherFeatures = (): TeacherFeatureEntry[] =>
  TEACHER_FEATURE_CATALOG.filter((entry) => entry.enabled)

/** 当前已开放的默认快捷入口；E0 阶段为空数组。 */
export const listEnabledTeacherShortcuts = (): TeacherFeatureEntry[] =>
  TEACHER_DEFAULT_SHORTCUT_IDS.map((id) =>
    TEACHER_FEATURE_CATALOG.find((entry) => entry.id === id)
  ).filter((entry): entry is TeacherFeatureEntry => entry !== undefined && entry.enabled === true)
