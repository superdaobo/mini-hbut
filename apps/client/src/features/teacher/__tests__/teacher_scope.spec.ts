// Teacher Portal V2（#1019）：教师作用域隔离契约测试。
//
// 目标（Epic #1018 验收）：教师 / 学生、不同账号、不同学期之间，
// 缓存与本地提醒作用域**不得串号**。fixture 全部脱敏（无真实工号/学号/姓名）。

import { describe, expect, it } from 'vitest'
import {
  STUDENT_SCOPE_PREFIX,
  TEACHER_SCOPE_PREFIX,
  UNKNOWN_SCOPE_PART,
  buildTeacherScopeKey,
  buildTeacherScopedKey,
  isDifferentTeacherScope,
  isStudentScopeKey,
  isTeacherScopeKey,
  parseTeacherScopeKey
} from '../utils/teacher_scope'

describe('teacher_scope（教师作用域隔离）', () => {
  it('作用域键格式固定为 teacher:{accountId}:{semester}', () => {
    expect(buildTeacherScopeKey('T0001', '2026-2027-1')).toBe('teacher:T0001:2026-2027-1')
    expect(buildTeacherScopeKey('T0001', '2026-2027-1').startsWith(`${TEACHER_SCOPE_PREFIX}:`)).toBe(
      true
    )
  })

  it('学期标准化：01 与 1 不分裂成两个作用域', () => {
    expect(buildTeacherScopeKey('T0001', '2026-2027-01')).toBe(
      buildTeacherScopeKey('T0001', '2026-2027-1')
    )
    expect(buildTeacherScopeKey('T0001', ' 2026-2027-1 ')).toBe(
      buildTeacherScopeKey('T0001', '2026-2027-1')
    )
  })

  it('不同账号不串号（同学期）', () => {
    expect(isDifferentTeacherScope(
      { accountId: 'T0001', semester: '2026-2027-1' },
      { accountId: 'T0002', semester: '2026-2027-1' }
    )).toBe(true)
  })

  it('不同学期不串号（同账号）', () => {
    expect(isDifferentTeacherScope(
      { accountId: 'T0001', semester: '2026-2027-1' },
      { accountId: 'T0001', semester: '2026-2027-2' }
    )).toBe(true)
  })

  it('相同账号 + 相同学期视为同一作用域', () => {
    expect(isDifferentTeacherScope(
      { accountId: 'T0001', semester: '2026-2027-1' },
      { accountId: 'T0001', semester: '2026-2027-1' }
    )).toBe(false)
  })

  it('教师键永远不会等于学生键（即使 accountId/semester 相同）', () => {
    const teacherKey = buildTeacherScopeKey('1000000001', '2026-2027-1')
    const studentKey = `${STUDENT_SCOPE_PREFIX}:1000000001:2026-2027-1`
    expect(teacherKey).not.toBe(studentKey)
    expect(isTeacherScopeKey(teacherKey)).toBe(true)
    expect(isTeacherScopeKey(studentKey)).toBe(false)
    expect(isStudentScopeKey(studentKey)).toBe(true)
    expect(isStudentScopeKey(teacherKey)).toBe(false)
  })

  it('缺失账号 / 学期退化为占位，绝不回落学生域', () => {
    const key = buildTeacherScopeKey('', '')
    expect(key).toBe(`teacher:${UNKNOWN_SCOPE_PART}:${UNKNOWN_SCOPE_PART}`)
    expect(isTeacherScopeKey(key)).toBe(true)
    expect(isStudentScopeKey(key)).toBe(false)
  })

  it('业务类别键在同一作用域下相互隔离', () => {
    const reminders = buildTeacherScopedKey('reminders', 'T0001', '2026-2027-1')
    const readMarks = buildTeacherScopedKey('read', 'T0001', '2026-2027-1')
    expect(reminders).toBe('teacher:T0001:2026-2027-1:reminders')
    expect(readMarks).toBe('teacher:T0001:2026-2027-1:read')
    expect(reminders).not.toBe(readMarks)
  })

  it('parseTeacherScopeKey 可逆解析，非法键返回 null', () => {
    expect(parseTeacherScopeKey('teacher:T0001:2026-2027-1')).toEqual({
      accountId: 'T0001',
      semester: '2026-2027-1'
    })
    expect(parseTeacherScopeKey('student:T0001:2026-2027-1')).toBeNull()
    expect(parseTeacherScopeKey('teacher:T0001')).toBeNull()
    expect(parseTeacherScopeKey('')).toBeNull()
    expect(parseTeacherScopeKey(null)).toBeNull()
  })
})
