import { describe, expect, it } from 'vitest'
import { normalizePortalAccountId } from './portal_account.js'
import { isValidStudentId } from './student_id.js'

describe('门户师生账号格式隔离', () => {
  it('教师允许已知的八位工号，不改变学生学号合法性', () => {
    expect(normalizePortalAccountId(' 20000000 ', 'teacher')).toBe('20000000')
    expect(normalizePortalAccountId('20000000', 'student')).toBe('')
    expect(isValidStudentId('20000000')).toBe(false)
  })

  it('原有研究生九位和本科生十位学号仍然有效', () => {
    for (const id of ['251023106', '2510231106']) {
      expect(normalizePortalAccountId(id, 'student')).toBe(id)
      expect(isValidStudentId(id)).toBe(true)
    }
  })

  it('只有后端角色 teacher 可放宽教师工号长度；非纯数字、过长值全部拒绝', () => {
    for (const raw of ['abc12345', '2000 0000', '1234567', '12345678901', '']) {
      expect(normalizePortalAccountId(raw, 'teacher')).toBe('')
    }
    expect(normalizePortalAccountId('20000000', 'js')).toBe('')
    expect(normalizePortalAccountId('20000000', undefined)).toBe('')
  })
})
