import { describe, expect, it } from 'vitest'
import type { TodayCourseSnapshot } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'
import {
  buildTodayCourseSnapshot,
  buildWidgetScheduleIndex,
  resolveTodaySnapshotFromScheduleIndex,
  resolveWeekIndexFromBase
} from './widget_snapshot'

const course = (
  name: string,
  weekday: number,
  weeks: number[],
  periodStart = 1,
  periodEnd = 2
) => ({
  name,
  weekday,
  weeks,
  period_start: periodStart,
  period_end: periodEnd,
  location: '实训楼 A101',
  teacher: '教师',
  time_start: periodStart <= 2 ? '08:20' : '10:15',
  time_end: periodEnd <= 2 ? '09:55' : '11:50'
})

const withIndex = (
  cache: unknown[],
  now: Date,
  options: { startDate?: string; baseWeekIndex?: number; totalWeeks?: number } = {}
): TodayCourseSnapshot => {
  const baseWeekIndex = options.baseWeekIndex ?? 1
  const snapshot = buildTodayCourseSnapshot({
    cache,
    studentId: '2510231106',
    weekIndex: baseWeekIndex,
    now
  })
  snapshot.schedule_index = buildWidgetScheduleIndex({
    cache,
    baseWeekIndex,
    startDate: options.startDate,
    totalWeeks: options.totalWeeks ?? 20,
    now
  })
  return snapshot
}

describe('#881 widget semester schedule index', () => {
  it('precomputes only non-empty week/day entries from the effective schedule', () => {
    const now = new Date('2026-09-14T10:00:00+08:00')
    const index = buildWidgetScheduleIndex({
      cache: [
        course('高数', 1, [1, 2]),
        course('通信原理', 3, [2], 3, 4)
      ],
      baseWeekIndex: 1,
      startDate: '2026-09-14',
      totalWeeks: 3,
      now
    })

    expect(index.start_date).toBe('2026-09-14')
    expect(index.base_date).toBe('2026-09-14')
    expect(index.days).toHaveLength(3)
    expect(index.days).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ week_index: 1, weekday: 1 }),
        expect.objectContaining({ week_index: 2, weekday: 1 }),
        expect.objectContaining({ week_index: 2, weekday: 3 })
      ])
    )
  })

  it('expands total weeks when course data contains a later week than metadata', () => {
    const index = buildWidgetScheduleIndex({
      cache: [course('第26周课程', 1, [26])],
      baseWeekIndex: 1,
      startDate: '2026-09-14',
      totalWeeks: 20,
      now: new Date('2026-09-14T08:00:00+08:00')
    })

    expect(index.total_weeks).toBe(26)
    expect(index.days).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ week_index: 26, weekday: 1 })
      ])
    )
  })

  it('increments the fallback teaching week exactly at Sunday -> Monday', () => {
    expect(
      resolveWeekIndexFromBase(
        '2026-09-20',
        3,
        new Date('2026-09-20T23:59:00+08:00'),
        20
      )
    ).toBe(3)

    expect(
      resolveWeekIndexFromBase(
        '2026-09-20',
        3,
        new Date('2026-09-21T00:01:00+08:00'),
        20
      )
    ).toBe(4)
  })

  it('switches courses across midnight without asking the App to rewrite the snapshot', () => {
    const cache = [
      course('周日课程', 7, [1]),
      course('周一课程', 1, [2])
    ]
    const original = withIndex(
      cache,
      new Date('2026-09-20T23:50:00+08:00'),
      { startDate: '2026-09-14', baseWeekIndex: 1, totalWeeks: 20 }
    )

    const sunday = resolveTodaySnapshotFromScheduleIndex(
      original,
      new Date('2026-09-20T23:59:00+08:00')
    )
    expect(sunday.date).toBe('2026-09-20')
    expect(sunday.week_index).toBe(1)
    expect(sunday.weekday).toBe(7)
    expect(sunday.courses.map((item) => item.name)).toEqual(['周日课程'])

    // 模拟 App 已经被杀：仍使用完全相同的原始 snapshot，只改变原生端看到的“今天”。
    const monday = resolveTodaySnapshotFromScheduleIndex(
      original,
      new Date('2026-09-21T00:01:00+08:00')
    )
    expect(monday.date).toBe('2026-09-21')
    expect(monday.week_index).toBe(2)
    expect(monday.weekday).toBe(1)
    expect(monday.courses.map((item) => item.name)).toEqual(['周一课程'])
  })

  it('clears yesterday courses when the new day has no class', () => {
    const original = withIndex(
      [course('周日课程', 7, [1])],
      new Date('2026-09-20T22:00:00+08:00'),
      { startDate: '2026-09-14', baseWeekIndex: 1 }
    )

    const monday = resolveTodaySnapshotFromScheduleIndex(
      original,
      new Date('2026-09-21T08:00:00+08:00')
    )
    expect(monday.date).toBe('2026-09-21')
    expect(monday.weekday).toBe(1)
    expect(monday.week_index).toBe(2)
    expect(monday.courses).toEqual([])
  })

  it('does not leak first-week courses before the semester starts', () => {
    const original = withIndex(
      [course('第一周课程', 1, [1])],
      new Date('2026-09-14T08:00:00+08:00'),
      { startDate: '2026-09-14', baseWeekIndex: 1, totalWeeks: 20 }
    )

    const beforeStart = resolveTodaySnapshotFromScheduleIndex(
      original,
      new Date('2026-09-07T08:00:00+08:00')
    )
    expect(beforeStart.date).toBe('2026-09-07')
    expect(beforeStart.week_index).toBe(0)
    expect(beforeStart.courses).toEqual([])
  })

  it('does not leak last-week courses after the semester ends', () => {
    const original = withIndex(
      [course('最后一周课程', 1, [2])],
      new Date('2026-09-14T08:00:00+08:00'),
      { startDate: '2026-09-14', baseWeekIndex: 1, totalWeeks: 2 }
    )

    const afterEnd = resolveTodaySnapshotFromScheduleIndex(
      original,
      new Date('2026-09-28T08:00:00+08:00')
    )
    expect(afterEnd.date).toBe('2026-09-28')
    expect(afterEnd.week_index).toBe(0)
    expect(afterEnd.courses).toEqual([])
  })

  it('keeps legacy snapshots unchanged when schedule_index is absent', () => {
    const legacy = buildTodayCourseSnapshot({
      cache: [course('旧快照课程', 7, [1])],
      studentId: '2510231106',
      weekIndex: 1,
      now: new Date('2026-09-20T20:00:00+08:00')
    })
    expect(
      resolveTodaySnapshotFromScheduleIndex(
        legacy,
        new Date('2026-09-21T08:00:00+08:00')
      )
    ).toEqual(legacy)
  })
})
