import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildEffectiveSchedule,
  buildOfficialCourseIdentityKey,
  buildScheduleVisibilityCloudSnapshot,
  filterVisibleOfficialCourses,
  listRemovedOfficialCourses,
  removeOfficialCourseFromSchedule,
  replaceScheduleVisibilityFromCloud,
  restoreOfficialCourseToSchedule
} from './schedule_visibility'

const studentId = '2025100001'
const semester = '2026-2027-1'

const createStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, String(value)) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }),
    clear: vi.fn(() => data.clear()),
    key: vi.fn((index: number) => [...data.keys()][index] ?? null),
    get length() { return data.size }
  }
}

const official = (overrides: Record<string, unknown> = {}) => ({
  id: 'slot-a',
  name: '通信原理',
  teacher: '张老师',
  class_name: '通信2501-教学班',
  credit: '3.0',
  weekday: 2,
  period: 1,
  djs: 2,
  weeks: [1, 2, 3],
  weeks_text: '1-3周',
  room: '一教101',
  ...overrides
})

describe('schedule visibility domain (#867)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('groups multiple schedule slots of the same official course but not same-name different classes', () => {
    const first = official({ id: 'slot-a', weekday: 2, period: 1 })
    const second = official({ id: 'slot-b', weekday: 4, period: 3 })
    const otherClass = official({ id: 'slot-c', class_name: '通信2502-教学班' })

    expect(buildOfficialCourseIdentityKey(first)).toBe(buildOfficialCourseIdentityKey(second))
    expect(buildOfficialCourseIdentityKey(first)).not.toBe(buildOfficialCourseIdentityKey(otherClass))
  })

  it('removes all instances of one official course without mutating custom courses or same-name other classes', () => {
    const first = official({ id: 'slot-a', weekday: 2, period: 1 })
    const second = official({ id: 'slot-b', weekday: 4, period: 3 })
    const otherClass = official({ id: 'slot-c', class_name: '通信2502-教学班', weekday: 5 })
    const custom = {
      id: 'custom:1',
      source_id: '1',
      name: '通信原理',
      teacher: '',
      class_name: '自定义课程',
      credit: '',
      weeks_text: '1周',
      room: '',
      is_custom: true,
      semester,
      weekday: 6,
      period: 1,
      djs: 2,
      weeks: [1]
    }

    const record = removeOfficialCourseFromSchedule(
      studentId,
      semester,
      first,
      [first, second, otherClass]
    )

    expect(record).not.toBeNull()
    expect(record?.instances).toHaveLength(2)
    expect(filterVisibleOfficialCourses(studentId, semester, [first, second, otherClass]))
      .toEqual([otherClass])
    expect(buildEffectiveSchedule(studentId, semester, [first, second, otherClass], [custom]))
      .toEqual([otherClass, custom])
  })

  it('removes only the selected week while keeping other weeks visible', () => {
    const course = official({ weeks: [1, 2, 3], weeks_text: '1-3周' })
    const record = removeOfficialCourseFromSchedule(
      studentId,
      semester,
      course,
      [course],
      { mode: 'current_week', currentWeek: 2 }
    )

    expect(record).not.toBeNull()
    expect((record as any)?.removed_weeks).toEqual([2])
    expect(filterVisibleOfficialCourses(studentId, semester, [course])).toEqual([
      expect.objectContaining({
        weeks: [1, 3],
        weeks_text: '1,3周'
      })
    ])
  })

  it('merges repeated week removals without duplicates', () => {
    const course = official({ weeks: [1, 2, 3, 4] })
    removeOfficialCourseFromSchedule(studentId, semester, course, [course], {
      mode: 'current_week',
      currentWeek: 1
    })
    removeOfficialCourseFromSchedule(studentId, semester, course, [course], {
      mode: 'current_week',
      currentWeek: 3
    })
    removeOfficialCourseFromSchedule(studentId, semester, course, [course], {
      mode: 'current_week',
      currentWeek: 3
    })

    const records = listRemovedOfficialCourses(studentId, semester)
    expect(records).toHaveLength(1)
    expect((records[0] as any).removed_weeks).toEqual([1, 3])
    expect(filterVisibleOfficialCourses(studentId, semester, [course])[0]).toEqual(
      expect.objectContaining({ weeks: [2, 4] })
    )
  })

  it('full-semester removal supersedes previous week-scoped removals', () => {
    const course = official({ weeks: [1, 2, 3] })
    removeOfficialCourseFromSchedule(studentId, semester, course, [course], {
      mode: 'current_week',
      currentWeek: 2
    })
    removeOfficialCourseFromSchedule(studentId, semester, course, [course])

    const records = listRemovedOfficialCourses(studentId, semester)
    expect(records).toHaveLength(1)
    expect((records[0] as any).removed_weeks).toBeUndefined()
    expect(filterVisibleOfficialCourses(studentId, semester, [course])).toEqual([])
  })

  it('restores a week-scoped removal without changing the official source course', () => {
    const course = official({ weeks: [1, 2, 3] })
    const record = removeOfficialCourseFromSchedule(studentId, semester, course, [course], {
      mode: 'current_week',
      currentWeek: 2
    })
    expect(record).not.toBeNull()
    expect(filterVisibleOfficialCourses(studentId, semester, [course])[0]).toEqual(
      expect.objectContaining({ weeks: [1, 3] })
    )

    expect(restoreOfficialCourseToSchedule(studentId, semester, record!)).toBe(true)
    expect(filterVisibleOfficialCourses(studentId, semester, [course])).toEqual([course])
  })

  it('restores a removed official course and keeps visibility scoped by semester', () => {
    const course = official()
    const record = removeOfficialCourseFromSchedule(studentId, semester, course, [course])
    expect(record).not.toBeNull()
    expect(filterVisibleOfficialCourses(studentId, semester, [course])).toEqual([])
    expect(filterVisibleOfficialCourses(studentId, '2025-2026-2', [course])).toEqual([course])

    expect(restoreOfficialCourseToSchedule(studentId, semester, record!)).toBe(true)
    expect(filterVisibleOfficialCourses(studentId, semester, [course])).toEqual([course])
    expect(listRemovedOfficialCourses(studentId, semester)).toEqual([])
  })

  it('cloud snapshot preserves explicit empty state and rejects malformed replacement', () => {
    const course = official()
    removeOfficialCourseFromSchedule(studentId, semester, course, [course])
    const snapshot = buildScheduleVisibilityCloudSnapshot(studentId)
    expect(snapshot.by_semester[semester]).toHaveLength(1)

    expect(replaceScheduleVisibilityFromCloud(studentId, { broken: true })).toBe(false)
    expect(listRemovedOfficialCourses(studentId, semester)).toHaveLength(1)

    expect(replaceScheduleVisibilityFromCloud(studentId, {
      version: 1,
      updated_at: Date.now(),
      by_semester: {}
    })).toBe(true)
    expect(listRemovedOfficialCourses(studentId, semester)).toEqual([])
  })

  it('preserves local week removals when applying a legacy cloud snapshot', () => {
    const course = official({ weeks: [1, 2, 3] })
    removeOfficialCourseFromSchedule(studentId, semester, course, [course], {
      mode: 'current_week',
      currentWeek: 2
    })

    expect(replaceScheduleVisibilityFromCloud(studentId, {
      version: 1,
      updated_at: Date.now(),
      by_semester: {}
    })).toBe(true)
    expect((listRemovedOfficialCourses(studentId, semester)[0] as any).removed_weeks).toEqual([2])

    expect(replaceScheduleVisibilityFromCloud(studentId, {
      version: 2,
      updated_at: Date.now(),
      by_semester: {},
      by_semester_weeks: {}
    })).toBe(true)
    expect(listRemovedOfficialCourses(studentId, semester)).toEqual([])
  })

  it('does not match across all semesters when the consumer cannot resolve a semester', () => {
    const course = official()
    removeOfficialCourseFromSchedule(studentId, semester, course, [course])
    expect(filterVisibleOfficialCourses(studentId, '', [course])).toEqual([course])
  })
})
