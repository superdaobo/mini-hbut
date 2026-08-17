// Unit tests for maskStudentId and a11yLabel
import { describe, it, expect } from 'vitest'
import { maskStudentId, a11yLabel } from './widget_snapshot'
import type { WidgetCourse } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'

describe('maskStudentId', () => {
  it('returns empty string for empty input', () => {
    expect(maskStudentId('')).toBe('')
  })

  it('returns empty string for non-string input', () => {
    expect(maskStudentId(undefined as any)).toBe('')
    expect(maskStudentId(null as any)).toBe('')
    expect(maskStudentId(123 as any)).toBe('')
  })

  it('returns all * for 1-character string', () => {
    expect(maskStudentId('A')).toBe('*')
  })

  it('returns all * for 4-character string', () => {
    expect(maskStudentId('1234')).toBe('****')
  })

  it('masks 5-character string: keep first 2 and last 2', () => {
    expect(maskStudentId('12345')).toBe('12**45')
  })

  it('masks typical student ID (10 digits)', () => {
    expect(maskStudentId('2021114001')).toBe('20**01')
  })

  it('masks long string correctly', () => {
    expect(maskStudentId('ABCDEFGHIJ')).toBe('AB**IJ')
  })
})

describe('a11yLabel', () => {
  it('generates correct accessibility label with location', () => {
    const course: WidgetCourse = {
      period_start: 1,
      period_end: 2,
      time_start: '08:20',
      time_end: '09:55',
      name: '高等数学',
      location: 'A101',
      teacher: '张老师',
    }
    expect(a11yLabel(course)).toBe('第 1 节 08:20 到 09:55 高等数学 A101')
  })

  it('trims trailing whitespace when location is empty', () => {
    const course: WidgetCourse = {
      period_start: 3,
      period_end: 4,
      time_start: '10:15',
      time_end: '11:50',
      name: '英语',
      location: '',
      teacher: '李老师',
    }
    const label = a11yLabel(course)
    expect(label).toBe('第 3 节 10:15 到 11:50 英语')
    expect(label).not.toMatch(/\s$/)
  })

  it('includes all required substrings', () => {
    const course: WidgetCourse = {
      period_start: 5,
      period_end: 6,
      time_start: '14:00',
      time_end: '15:35',
      name: '物理实验',
      location: 'C303',
      teacher: '王老师',
    }
    const label = a11yLabel(course)
    expect(label).toContain('5')
    expect(label).toContain('14:00')
    expect(label).toContain('15:35')
    expect(label).toContain('物理实验')
    expect(label).toContain('C303')
  })
})
