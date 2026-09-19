import { describe, expect, it } from 'vitest'
import {
  buildBlankTimeSelection,
  courseBlockToGridRect,
  isSameBlankTimeSelection,
  resolveClickedPeriod,
  resolveCourseBlock
} from './blankSelection'
import { parseClockToMinute } from './timeGeometry'

const minute = (clock: string) => {
  const value = parseClockToMinute(clock)
  if (value === null) throw new Error(`invalid clock ${clock}`)
  return value
}

describe('#857 blank time selection', () => {
  it.each([
    ['08:20', 1],
    ['09:05', 1],
    ['09:07', 2],
    ['09:12', 2],
    ['10:00', 3],
    ['12:30', 5],
    ['15:45', 7],
    ['17:45', 9],
    ['20:07', 11],
    ['22:00', 11]
  ])('点击 %s 映射到第 %i 节', (clock, expected) => {
    expect(resolveClickedPeriod(minute(clock))).toBe(expected)
  })

  it.each([
    [1, { startPeriod: 1, endPeriod: 2, span: 2 }],
    [2, { startPeriod: 1, endPeriod: 2, span: 2 }],
    [3, { startPeriod: 3, endPeriod: 4, span: 2 }],
    [4, { startPeriod: 3, endPeriod: 4, span: 2 }],
    [5, { startPeriod: 5, endPeriod: 6, span: 2 }],
    [6, { startPeriod: 5, endPeriod: 6, span: 2 }],
    [7, { startPeriod: 7, endPeriod: 8, span: 2 }],
    [8, { startPeriod: 7, endPeriod: 8, span: 2 }],
    [9, { startPeriod: 9, endPeriod: 10, span: 2 }],
    [10, { startPeriod: 9, endPeriod: 10, span: 2 }],
    [11, { startPeriod: 11, endPeriod: 11, span: 1 }]
  ])('第 %i 节按双节块吸附', (period, expected) => {
    expect(resolveCourseBlock(period)).toEqual(expected)
  })

  it('构造 Course/Event 共用的日期、节次与真实时间预填', () => {
    expect(buildBlankTimeSelection(minute('10:30'), 3, '2026-09-23')).toEqual({
      dayIndex: 3,
      date: '2026-09-23',
      startPeriod: 3,
      endPeriod: 4,
      span: 2,
      startMinute: minute('10:15'),
      endMinute: minute('11:50'),
      startTime: '10:15',
      endTime: '11:50'
    })
  })

  it('第 11 节是单节范围', () => {
    expect(buildBlankTimeSelection(minute('20:20'), 5, '2026-09-25')).toEqual(
      expect.objectContaining({
        dayIndex: 5,
        startPeriod: 11,
        endPeriod: 11,
        span: 1,
        startTime: '20:10',
        endTime: '20:55'
      })
    )
  })

  it('待选框按完整课节行绘制，5–6 节正好占两行', () => {
    expect(courseBlockToGridRect(5, 6, 11)).toEqual({
      top: (4 / 11) * 100,
      height: (2 / 11) * 100
    })
    expect(courseBlockToGridRect(11, 11, 11)).toEqual({
      top: (10 / 11) * 100,
      height: (1 / 11) * 100
    })
  })

  it('同一天同一双节块视为二次确认；换位置则不是', () => {
    const first = buildBlankTimeSelection(minute('10:20'), 2, '2026-09-22')
    const sameBlock = buildBlankTimeSelection(minute('11:20'), 2, '2026-09-22')
    const anotherBlock = buildBlankTimeSelection(minute('14:20'), 2, '2026-09-22')
    expect(isSameBlankTimeSelection(first, sameBlock)).toBe(true)
    expect(isSameBlankTimeSelection(first, anotherBlock)).toBe(false)
  })

  it('非法输入安全返回 null', () => {
    expect(resolveClickedPeriod(Number.NaN)).toBeNull()
    expect(resolveCourseBlock(0)).toBeNull()
    expect(courseBlockToGridRect(6, 5, 11)).toBeNull()
    expect(buildBlankTimeSelection(minute('10:20'), 8, '2026-09-22')).toBeNull()
  })
})
