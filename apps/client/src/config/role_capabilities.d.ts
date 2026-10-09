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

/** 底部主 Tab：任何身份都可访问。 */
export const MAIN_TAB_VIEW_IDS: Set<string>

/** 教师专属视图 id（E0 预注册）。 */
export const TEACHER_VIEW_IDS: Set<string>

/** E4 适配后对教师开放的共享视图 id。 */
export const TEACHER_SHARED_VIEW_IDS: Set<string>

/** 教师身份允许访问的 view id 全集。 */
export const TEACHER_ALLOWED_VIEW_IDS: Set<string>

/**
 * 路由级角色能力门禁：非教师身份一律放行（学生零回归）；
 * 教师身份仅放行登记在 TEACHER_ALLOWED_VIEW_IDS 的视图，未登记默认拒绝。
 */
export function isViewAllowedForRole(viewId: unknown, role: unknown): boolean
