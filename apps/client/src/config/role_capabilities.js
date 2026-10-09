/**
 * 身份能力表：按登录身份（学生 / 教师）控制功能可见性。
 *
 * ## 为什么用「白名单 + 默认拒绝」
 *
 * 本 App 的绝大多数功能都构建在**学生专属的教务接口**上（`/admin/xsd/**`、
 * 学生学籍、成绩、考试、学习通等）。教师账号访问这些接口会被教务直接拒绝
 * （例如 `/admin/xsd/xsjbxx/xskp` 返回「登录用户所属身份类型不是学生」），
 * 因此教师模式下必须隐藏，否则用户点进去只能看到报错。
 *
 * 用白名单而不是黑名单：新增模块时**默认对学生开放、对教师隐藏**，
 * 不会因为忘记登记而让教师看到不可用的入口。
 *
 * ## 教师端可用的模块
 *
 * 只保留与身份无关（或教师同样可用）的能力：
 * - `calendar` 校历 —— 已实测教师账号可访问 `/admin/xsd/jcsj/xlgl/getData/{学期}`
 * - `school_inbox` 学校消息、`library` 图书馆、`campus_map` 校园地图、
 *   `resource_share` 资源共享、`towergo`、`ai` 助手 —— 均为身份无关能力
 * - `qxzkb` 全校课表 —— 教师视角的公共查询
 *
 * 课表（`schedule`）是底部主 Tab，不受本表控制。
 */

/** 教师模式下可见的模块 id 白名单（其余一律隐藏）。 */
export const TEACHER_VISIBLE_MODULE_IDS = new Set([
  'calendar',
  'school_inbox',
  'qxzkb',
  'library',
  'campus_map',
  'resource_share',
  'towergo',
  'ai'
])

/** 教师模式下需要隐藏的快捷入口（首页快捷入口与模块清单是两份数据）。 */
export const isTeacherRole = (role) => String(role ?? '').trim().toLowerCase() === 'teacher'

/**
 * 判断某个模块在当前身份下是否可见。
 *
 * @param {string} moduleId 模块 id（如 `grades` / `exams` / `chaoxing_hub`）
 * @param {string} role 当前身份（`student` / `teacher`）
 * @returns {boolean}
 */
export const isModuleVisibleForRole = (moduleId, role) => {
  if (!isTeacherRole(role)) return true
  return TEACHER_VISIBLE_MODULE_IDS.has(String(moduleId ?? ''))
}

/**
 * 按身份过滤模块列表（教师模式走白名单；学生模式原样返回）。
 *
 * @template {{ id?: string }} T
 * @param {T[]} modules
 * @param {string} role
 * @returns {T[]}
 */
export const filterModulesForRole = (modules, role) => {
  if (!Array.isArray(modules)) return []
  if (!isTeacherRole(role)) return modules
  return modules.filter((module) => TEACHER_VISIBLE_MODULE_IDS.has(String(module?.id ?? '')))
}

// ────────────────────────────────────────────────────────────────────────────
// 路由级角色门禁（Teacher Portal V2 / #1019）
//
// 与「模块可见性」（isModuleVisibleForRole，控制首页宫格）不同：
// 这里控制的是**路由能力** —— 深链、直达、启动快照都必须经此判断，
// 避免「首页隐藏了图标，但教师仍能直接跳到学生专属路由」。
//
// 原则：**默认拒绝**。教师身份只允许访问显式登记在 TEACHER_ALLOWED_VIEW_IDS 的视图；
// 新增教师模块必须先登记，否则一律拦截。学生/未知身份原样放行（学生端零回归）。
// ────────────────────────────────────────────────────────────────────────────

/** 底部主 Tab：任何身份都可访问（同一 App 四 Tab 体验）。 */
export const MAIN_TAB_VIEW_IDS = new Set(['home', 'schedule', 'notifications', 'me'])

/** 教师专属视图 id（E0 预注册，与 app/viewRegistry.ts 的 key 一一对应）。 */
export const TEACHER_VIEW_IDS = new Set([
  'teacherprofile',
  'teacherteaching',
  'teacherexams',
  'teachernotifications',
  'teacherworkflow'
])

/**
 * 教师身份可访问的**共享视图**（同一份学生组件，不复制教师版）。
 *
 * 两类：
 * 1. E4（#1024）按真实身份分流后对教师开放的教务查询视图（`classroom` 空教室）；
 * 2. 身份无关的通用应用界面（设置 / 反馈 / 隐私数据 / 授权记录 / 官网 / 快捷链接 /
 *    校园网 / 更多中心）—— plan-teacher-portal-v2.md §1 要求「原样共用」。
 *
 * 因 E4 与各业务 Agent 无权修改本文件，故 E0 在此预置路由放行。
 */
export const TEACHER_SHARED_VIEW_IDS = new Set([
  // E4 共享适配视图
  'classroom',
  // 通用应用界面（身份无关）
  'settings',
  'official',
  'feedback',
  'privacy_data',
  'identity_auth_history',
  'school_website',
  'quick_links',
  'campus_network',
  'more',
  'more_module_host',
  'config'
])

/** 教师身份允许访问的 view id 全集（主 Tab + 模块白名单 + 教师专属 + 共享适配视图）。 */
export const TEACHER_ALLOWED_VIEW_IDS = new Set([
  ...MAIN_TAB_VIEW_IDS,
  ...TEACHER_VISIBLE_MODULE_IDS,
  ...TEACHER_VIEW_IDS,
  ...TEACHER_SHARED_VIEW_IDS
])

/**
 * 路由级角色能力门禁。
 *
 * - 非教师身份（学生 / 未知 / 空）：返回 `true`，完全交给既有策略层
 *   （`isViewAllowed` / 每日秘钥 / 登录门禁），**学生行为零回归**。
 * - 教师身份：仅当 viewId 登记在 [`TEACHER_ALLOWED_VIEW_IDS`] 时放行；
 *   未登记的新视图默认拒绝。
 *
 * @param {string} viewId 视图 id（如 `grades` / `teacherteaching`）
 * @param {string} role 当前身份（`student` / `teacher`）
 * @returns {boolean}
 */
export const isViewAllowedForRole = (viewId, role) => {
  if (!isTeacherRole(role)) return true
  const id = String(viewId ?? '').trim()
  if (!id) return false
  return TEACHER_ALLOWED_VIEW_IDS.has(id)
}
