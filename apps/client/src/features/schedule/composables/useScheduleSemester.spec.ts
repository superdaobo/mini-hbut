import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScheduleSemester } from './useScheduleSemester'

describe('课表「回到当前周」', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    scope = effectScope()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
    vi.setSystemTime(new Date('2026-10-03T12:00:00+08:00'))
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const createSemester = () => scope.run(() => useScheduleSemester({ isAnyOverlayOpen: () => false }))!

  it('学期内的假期周也可回到后端给出的当前周', () => {
    const data = createSemester()
    data.applyMeta({
      semester: '2026-2027-1',
      start_date: '2026-08-31',
      end_date: '2026-12-31',
      current_week: 5,
      total_weeks: 18,
      vacation_notice: '假期'
    })
    expect(data.canJumpToCurrentWeek()).toBe(false)
    data.selectedWeek.value = 6
    expect(data.canJumpToCurrentWeek()).toBe(true)
    data.jumpToCurrentWeek()
    expect(data.selectedWeek.value).toBe(5)
  })

  it('往期学期保留已有周次，调用跳转不会改变选中周', () => {
    const data = createSemester()
    data.applyMeta({
      semester: '2025-2026-2',
      start_date: '2026-03-02',
      end_date: '2026-07-05',
      current_week: 18,
      total_weeks: 18
    })
    data.selectedWeek.value = 3
    data.jumpToCurrentWeek()
    expect(data.selectedWeek.value).toBe(3)
    expect(data.currentWeek.value).toBe(18)
    expect(data.canJumpToCurrentWeek()).toBe(false)
  })

  it('换学期时不会使用旧学期的数据，跨日后重新检查实际日期', () => {
    const data = createSemester()
    data.applyMeta({
      semester: '2026-2027-1',
      start_date: '2026-08-31',
      end_date: '2026-10-03',
      current_week: 5,
      total_weeks: 5
    })
    data.selectedWeek.value = 4
    data.semester.value = '2025-2026-2'
    expect(data.canJumpToCurrentWeek()).toBe(false)
    data.jumpToCurrentWeek()
    expect(data.selectedWeek.value).toBe(4)

    data.semester.value = '2026-2027-1'
    expect(data.canJumpToCurrentWeek()).toBe(true)
    vi.setSystemTime(new Date('2026-10-04T00:00:00+08:00'))
    data.jumpToCurrentWeek()
    expect(data.canJumpToCurrentWeek()).toBe(false)
    expect(data.selectedWeek.value).toBe(4)
  })
})
