/**
 * 「记住用户名」的单一读写入口（与 remembered_username.js 真实导出对齐）。
 */

export function isLikelyStudentId(value: unknown): boolean

export function getRememberedUsername(): string

/** 保存后端认证角色对应的学号/工号；空值等价于清除。 */
export function saveRememberedUsername(value: unknown, role?: unknown): string

export function clearRememberedUsername(): void
