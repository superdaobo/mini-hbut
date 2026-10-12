import { describe, expect, it } from 'vitest'
import { teacherSemesterOptions } from './teacher_semesters'

describe('教师学期选择', () => {
  it('产生可选教务学期编码而不是让用户手输', () => {
    const options = teacherSemesterOptions('2026-2027-1', new Date(2026, 9, 12))
    expect(options).toContain('2026-2027-1')
    expect(options).toContain('2026-2027-2')
    expect(options).toContain('2025-2026-2')
    expect(options[0]).toBe('2026-2027-2')
  })
  it('保留已选历史学期且拒绝非法编码', () => {
    expect(teacherSemesterOptions('2019-2020-1', new Date(2026, 9, 12))).toContain('2019-2020-1')
    expect(teacherSemesterOptions('abc', new Date(2026, 9, 12))).not.toContain('abc')
  })
})
