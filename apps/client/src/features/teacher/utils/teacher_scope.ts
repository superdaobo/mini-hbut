// src/features/teacher/utils/teacher_scope.ts
//
// Teacher Portal V2（#1019）：教师缓存 / 本地提醒作用域键。
//
// 目的：教师缓存、提醒快照、本地已读标记必须按
//   **真实身份 + 账号 + 业务学期** 隔离，
// 防止「同工号不同角色」「不同账号」「不同学期」之间串号
// （Epic #1018 验收：学生/教师、不同账号/学期缓存及本地提醒不会相互串用）。
//
// 作用域键格式（冻结契约，E3/E5/E6 不得更改）：
//   `teacher:{accountId}:{semester}`
// 例如：`teacher:2024000000:2026-2027-1`
//
// ⚠️ 该键只用于**本地隔离**（localStorage / 提醒去重），不含任何凭据；
//    教务 Cookie / 会话仍由原生层持有，前端不得读写。

import { normalizeSemester, normalizeTeacherText } from './normalizeTeacherData'

/** 作用域前缀：教师域。 */
export const TEACHER_SCOPE_PREFIX = 'teacher'

/** 学生域前缀（仅用于隔离断言：教师键永远不得等于学生键）。 */
export const STUDENT_SCOPE_PREFIX = 'student'

/** 未知账号 / 学期的占位（不可作为真实会话身份，仅避免空键）。 */
export const UNKNOWN_SCOPE_PART = '_'

/** 归一化作用域里的账号标识（工号 / 学号）。 */
export const normalizeScopeAccountId = (accountId: unknown): string =>
  normalizeTeacherText(accountId)

/**
 * 构造教师作用域键：`teacher:{accountId}:{semester}`。
 *
 * - accountId / semester 缺失时退化为 `_`，但**绝不**回落到学生域；
 * - semester 经 normalizeSemester 标准化，避免 `2026-2027-01` 与 `2026-2027-1` 分裂成两个作用域。
 */
export const buildTeacherScopeKey = (accountId: unknown, semester: unknown): string => {
  const account = normalizeScopeAccountId(accountId) || UNKNOWN_SCOPE_PART
  const term = normalizeSemester(semester) || UNKNOWN_SCOPE_PART
  return `${TEACHER_SCOPE_PREFIX}:${account}:${term}`
}

/**
 * 构造带业务类别的教师作用域键：`teacher:{accountId}:{semester}:{kind}`。
 *
 * 用于同一作用域下区分「提醒快照 / 已读标记 / 数据缓存」等不同存储用途。
 */
export const buildTeacherScopedKey = (
  kind: string,
  accountId: unknown,
  semester: unknown
): string => `${buildTeacherScopeKey(accountId, semester)}:${normalizeTeacherText(kind) || UNKNOWN_SCOPE_PART}`

/** 判断键是否属于教师作用域。 */
export const isTeacherScopeKey = (key: unknown): boolean =>
  typeof key === 'string' && key.startsWith(`${TEACHER_SCOPE_PREFIX}:`)

/** 判断键是否属于学生作用域。 */
export const isStudentScopeKey = (key: unknown): boolean =>
  typeof key === 'string' && key.startsWith(`${STUDENT_SCOPE_PREFIX}:`)

/** 解析教师作用域键；非法键返回 null。 */
export const parseTeacherScopeKey = (
  key: unknown
): { accountId: string; semester: string } | null => {
  if (typeof key !== 'string') return null
  const parts = key.split(':')
  if (parts.length < 3 || parts[0] !== TEACHER_SCOPE_PREFIX) return null
  return { accountId: parts[1], semester: parts.slice(2).join(':') }
}

/**
 * 两个账号在同一学期下是否属于不同作用域（防串号断言用）。
 * 相同账号 + 相同学期 → false（同作用域）。
 */
export const isDifferentTeacherScope = (
  left: { accountId: unknown; semester: unknown },
  right: { accountId: unknown; semester: unknown }
): boolean =>
  buildTeacherScopeKey(left.accountId, left.semester) !==
  buildTeacherScopeKey(right.accountId, right.semester)
