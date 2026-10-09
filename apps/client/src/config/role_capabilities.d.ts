/**
 * 身份能力表（与 role_capabilities.js 真实导出对齐）。
 */

/** 教师模式下可见的模块 id 白名单（其余一律隐藏）。 */
export const TEACHER_VISIBLE_MODULE_IDS: Set<string>

/** 是否教师角色。 */
export function isTeacherRole(role: unknown): boolean

/** 判断某个模块在当前身份下是否可见。 */
export function isModuleVisibleForRole(moduleId: unknown, role: unknown): boolean

/** 按身份过滤模块列表（教师模式走白名单；学生模式原样返回）；非法入参返回空数组。 */
export function filterModulesForRole<T extends { id?: string }>(
  modules: T[] | null | undefined,
  role: unknown
): T[]
