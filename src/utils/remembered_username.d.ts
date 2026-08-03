/**
 * 「记住用户名」的单一读写入口（与 remembered_username.js 真实导出对齐）。
 */

export function isLikelyStudentId(value: unknown): boolean

export function getRememberedUsername(): string

/** 保存学号；空值等价于清除。返回实际保存（规范化后）的值。 */
export function saveRememberedUsername(value: unknown): string

export function clearRememberedUsername(): void
