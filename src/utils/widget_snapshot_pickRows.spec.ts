// Unit tests for pickRows — verifies capacity slicing and overflow badge calculation
import { describe, it, expect } from 'vitest'
import { pickRows, buildTodayCourseSnapshot } from './widget_snapshot'
import type { TodayCourseSnapshot, WidgetCourse } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'

/** Helper: build a minimal valid snapshot with N courses */
function makeSnapshot(n: number): TodayCourseSnapshot {
  const courses: WidgetCourse[] = Array.from({ length: n }, (_, i) => ({
    period_start: i + 1,
    period_end: i + 1,
    time_start: `${String(8 + i).padStart(2, '0')}:00`,
    time_end: `${String(8 + i).padStart(2, '0')}:45`,
    name: `Course${i + 1}`,
    location: `Room${i + 1}`,
    teacher: `Teacher${i + 1}`,
  }))
  return {
    version: 1,
    generated_at: '2024-03-11T10:00:00.000Z',
    date: '2024-03-11',
    student_id: '2021001',
    week_index: 3,
    weekday: 1,
    courses,
  }
}

describe('pickRows', () => {
  it('returns empty rows and overflowBadge=0 when courses is empty', () => {
    const snapshot = makeSnapshot(0)
    const result = pickRows(snapshot, 3)
    expect(result.rows).toEqual([])
    expect(result.overflowBadge).toBe(0)
  })

  it('returns all courses and overflowBadge=0 when capacity === Infinity', () => {
    const snapshot = makeSnapshot(5)
    const result = pickRows(snapshot, Infinity)
    expect(result.rows).toHaveLength(5)
    expect(result.overflowBadge).toBe(0)
  })

  it('returns all courses and overflowBadge=0 when capacity >= courses.length', () => {
    const snapshot = makeSnapshot(3)
    const result = pickRows(snapshot, 5)
    expect(result.rows).toHaveLength(3)
    expect(result.overflowBadge).toBe(0)
  })

  it('returns all courses and overflowBadge=0 when capacity === courses.length', () => {
    const snapshot = makeSnapshot(3)
    const result = pickRows(snapshot, 3)
    expect(result.rows).toHaveLength(3)
    expect(result.overflowBadge).toBe(0)
  })

  it('slices to first capacity courses and computes overflowBadge', () => {
    const snapshot = makeSnapshot(7)
    const result = pickRows(snapshot, 3)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].name).toBe('Course1')
    expect(result.rows[2].name).toBe('Course3')
    expect(result.overflowBadge).toBe(4) // 7 - 3
  })

  it('is idempotent — same input gives same output', () => {
    const snapshot = makeSnapshot(5)
    const r1 = pickRows(snapshot, 3)
    const r2 = pickRows(snapshot, 3)
    expect(r1).toEqual(r2)
  })

  it('does not mutate the original snapshot courses array', () => {
    const snapshot = makeSnapshot(5)
    const originalLength = snapshot.courses.length
    pickRows(snapshot, 2)
    expect(snapshot.courses).toHaveLength(originalLength)
  })

  it('handles capacity=0 gracefully', () => {
    const snapshot = makeSnapshot(3)
    const result = pickRows(snapshot, 0)
    expect(result.rows).toEqual([])
    expect(result.overflowBadge).toBe(3)
  })

  it('handles capacity=1 correctly', () => {
    const snapshot = makeSnapshot(5)
    const result = pickRows(snapshot, 1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Course1')
    expect(result.overflowBadge).toBe(4)
  })
})
