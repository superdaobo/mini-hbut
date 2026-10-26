/**
 * grade_distribution_query.ts 纯函数契约（issue #1111）：
 * 双模式下请求体字段归属、空关键词、非法模式回退。
 */
import { describe, expect, it } from 'vitest'
import {
  buildGradeDistributionQuery,
  isGradeSearchActive,
  normalizeGradeSearchMode,
} from './grade_distribution_query'

describe('normalizeGradeSearchMode', () => {
  it('合法模式原样返回', () => {
    expect(normalizeGradeSearchMode('teacher')).toBe('teacher')
    expect(normalizeGradeSearchMode('course')).toBe('course')
  })

  it('非法 / 空 / 非字符串一律回退 teacher（默认模式）', () => {
    expect(normalizeGradeSearchMode('bogus')).toBe('teacher')
    expect(normalizeGradeSearchMode('Teacher')).toBe('teacher')
    expect(normalizeGradeSearchMode('')).toBe('teacher')
    expect(normalizeGradeSearchMode(undefined)).toBe('teacher')
    expect(normalizeGradeSearchMode(null)).toBe('teacher')
    expect(normalizeGradeSearchMode(1)).toBe('teacher')
    expect(normalizeGradeSearchMode({})).toBe('teacher')
  })
})

describe('isGradeSearchActive', () => {
  it('trim 后非空才视为有效查询', () => {
    expect(isGradeSearchActive('闵锐')).toBe(true)
    expect(isGradeSearchActive('  高等数学  ')).toBe(true)
  })

  it('空 / 纯空白 / null / undefined 均为无效（不触发查询）', () => {
    expect(isGradeSearchActive('')).toBe(false)
    expect(isGradeSearchActive('   ')).toBe(false)
    expect(isGradeSearchActive('\n\t ')).toBe(false)
    expect(isGradeSearchActive(null)).toBe(false)
    expect(isGradeSearchActive(undefined)).toBe(false)
  })
})

describe('buildGradeDistributionQuery', () => {
  it('teacher 模式：只传 teacher_name，course_name 恒为 null', () => {
    const q = buildGradeDistributionQuery('teacher', ' 闵锐 ', 1, 50)
    expect(q.teacher_name).toBe('闵锐')
    expect(q.course_name).toBeNull()
    expect(q.semester).toBeNull()
    expect(q.page).toBe(1)
    expect(q.page_size).toBe(50)
  })

  it('course 模式：只传 course_name，teacher_name 恒为 null', () => {
    const q = buildGradeDistributionQuery('course', ' 高等数学A ', 2, 50)
    expect(q.course_name).toBe('高等数学A')
    expect(q.teacher_name).toBeNull()
    expect(q.semester).toBeNull()
    expect(q.page).toBe(2)
    expect(q.page_size).toBe(50)
  })

  it('空 / 纯空白关键词：两个字段都为 null（不会发出脏字段）', () => {
    expect(buildGradeDistributionQuery('teacher', '', 1, 50).teacher_name).toBeNull()
    expect(buildGradeDistributionQuery('course', '   ', 1, 50).course_name).toBeNull()
    const q = buildGradeDistributionQuery('course', null, 1, 50)
    expect(q.course_name).toBeNull()
    expect(q.teacher_name).toBeNull()
  })

  it('非法模式回退 teacher：关键词落到 teacher_name', () => {
    const q = buildGradeDistributionQuery('bogus', '张三', 1, 50)
    expect(q.teacher_name).toBe('张三')
    expect(q.course_name).toBeNull()
  })

  it('page 收敛为正整数：0 / 负数 / NaN 回退 1；page_size 固定透传', () => {
    expect(buildGradeDistributionQuery('teacher', 'a', 0, 42).page).toBe(1)
    expect(buildGradeDistributionQuery('teacher', 'a', -3, 42).page).toBe(1)
    expect(buildGradeDistributionQuery('teacher', 'a', Number.NaN, 42).page).toBe(1)
    expect(buildGradeDistributionQuery('teacher', 'a', '3', 42).page).toBe(3)
    expect(buildGradeDistributionQuery('teacher', 'a', 3, 42).page_size).toBe(42)
  })
})
