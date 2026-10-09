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
