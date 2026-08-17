import { describe, expect, it } from 'vitest'
import { validateSnapshot } from './widget_snapshot_schema'

const validSnapshot = () => ({
  version: 1,
  generated_at: '2026-08-03T22:30:00+08:00',
  date: '2026-08-03',
  student_id: 'student',
  week_index: 0,
  weekday: 1,
  courses: [
    {
      period_start: 1,
      period_end: 2,
      time_start: '08:00',
      time_end: '09:35',
      name: '通信原理',
      location: '教学楼',
      teacher: '教师',
      color: '#2563EB',
    },
  ],
})

describe('strict-CSP-safe widget snapshot validator', () => {
  it('accepts the tracked snapshot contract and clears prior errors', () => {
    expect(validateSnapshot(validSnapshot())).toBe(true)
    expect(validateSnapshot.errors).toBeNull()
  })

  it('reports required, additional-property and nested range errors without throwing', () => {
    const invalid = validSnapshot() as Record<string, unknown>
    delete invalid.date
    invalid.unexpected = true
    invalid.courses = [
      {
        period_start: 0,
        period_end: 15,
        time_start: '8:00',
        time_end: '09:00',
        name: '',
        location: 'A'.repeat(81),
        teacher: '',
        color: 'blue',
        extra: true,
      },
    ]

    expect(validateSnapshot(invalid)).toBe(false)
    expect(validateSnapshot.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: 'required', params: { missingProperty: 'date' } }),
        expect.objectContaining({ keyword: 'additionalProperties', params: { additionalProperty: 'unexpected' } }),
        expect.objectContaining({ instancePath: '/courses/0/period_start', keyword: 'minimum' }),
        expect.objectContaining({ instancePath: '/courses/0/period_end', keyword: 'maximum' }),
        expect.objectContaining({ instancePath: '/courses/0/color', keyword: 'pattern' }),
      ]),
    )
  })

  it('rejects malformed root values and more than fourteen courses', () => {
    expect(validateSnapshot(null)).toBe(false)
    expect(validateSnapshot.errors?.[0]).toMatchObject({ instancePath: '', keyword: 'type' })

    const oversized = validSnapshot()
    oversized.courses = Array.from({ length: 15 }, () => ({ ...validSnapshot().courses[0] }))
    expect(validateSnapshot(oversized)).toBe(false)
    expect(validateSnapshot.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ instancePath: '/courses', keyword: 'maxItems' })]),
    )
  })

  it('contains no runtime compiler dependency or dynamic evaluation primitive', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('./widget_snapshot_schema.ts', import.meta.url), 'utf8'))
    expect(source).not.toMatch(/from\s+['"]ajv|new\s+Function|\beval\s*\(/)
  })
})
