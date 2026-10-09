/**
 * 登录身份（学生端 / 教师端）本地事实源的读写入口（与 login_role.js 真实导出对齐）。
 */

export type LoginRole = 'student' | 'teacher'

export const LOGIN_ROLE_KEY: string

/** 规范化角色取值：只有 `teacher` 视为教师，其余一律学生。 */
export function normalizeLoginRole(value: unknown): LoginRole

/** 读取本地角色；缺失/异常按学生端。 */
export function readLoginRole(): LoginRole

/** 写入本地角色，返回规范化后的值。 */
export function writeLoginRole(value: unknown): LoginRole

/** 清除本地角色（登出：回到学生端默认形态）。 */
export function clearLoginRole(): void

/** 是否教师角色。 */
export function isTeacherRoleValue(value: unknown): boolean

/** 表单账号存储键前缀。 */
export const LOGIN_FORM_ACCOUNT_KEY: string

/** 该身份对应的表单账号存储键。 */
export function loginFormAccountKey(role: unknown): string

/** 读取该身份上次登录用的账号（学生端回落旧键 hbu_username）。 */
export function readLoginFormAccount(role: unknown): string

/** 记住该身份本次登录用的账号。 */
export function writeLoginFormAccount(role: unknown, accountId: unknown): void
