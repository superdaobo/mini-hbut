/**
 * #837 lane 布局契约测试（纯函数，无 DOM）。
 *
 * 覆盖 issue 列出的 10 条硬要求：无重叠占满、课程主 lane、日程并排、
 * 确定性、超阈值 +N 聚合、超短事件不抬高高度、可见区外不参与 lane、几何联动、
 * 首尾相接不算重叠；并额外覆盖适配器链路与 `gridYToMinute` 逆映射。
 */
import { describe, expect, it } from 'vitest'
import { MAX_PERIOD, timeSchedule } from '../constants'
import { buildScheduleTimeGeometry, getGridTotalHeight, intervalToGridRect, parseClockToMinute } from './timeGeometry'
import { courseToTimelineItem, eventToTimelineItem } from './timelineAdapters'
import {
  COMPACT_WIDTH_PERCENT,
  MIN_LANE_WIDTH_PERCENT,
  gridYToMinute,
  layoutTimelineItems,
  splitOutOfRangeEvents
} from './timelineLayout'
import type { ScheduleTimelineItem } from './timelineTypes'

/** 推荐做法：slotHeight = 100 / MAX_PERIOD → 几何的 y 单位就是「占网格总高的百分比」 */
const PERCENT_SLOT_HEIGHT = 100 / MAX_PERIOD
const geometry = buildScheduleTimeGeometry(timeSchedule, PERCENT_SLOT_HEIGHT)

/** 测试内固定合法时钟串 → 分钟 */
const minute = (clock: string): number => {
  const parsed = parseClockToMinute(clock)
  if (parsed === null) throw new Error(`测试用例时钟串非法: ${clock}`)
  return parsed
}

const event = (id: string, start: string, end: string, dayIndex = 1): ScheduleTimelineItem => ({
  id,
  kind: 'event',
  dayIndex,
  startMinute: minute(start),
  endMinute: minute(end),
  title: id,
  source: 'personal-event',
  raw: { id, start, end }
})

const layout = (items: ScheduleTimelineItem[], options?: { maxLanes?: number }) =>
  layoutTimelineItems(items, geometry, options)

const slotsOf = (items: ScheduleTimelineItem[], options?: { maxLanes?: number }) =>
  layout(items, options).slots

describe('timelineLayout (#837)', () => {
  it('1. 无重叠：单个日程占满整列宽', () => {
    const slots = slotsOf([event('solo', '14:00', '15:00')])

    expect(slots).toHaveLength(1)
    expect(slots[0].leftPercent).toBe(0)
    expect(slots[0].widthPercent).toBe(100)
    expect(slots[0].hiddenCount).toBe(0)
    expect(slots[0].collapsed).toBe(false)
  })

  it('2. 课程 + 日程重叠：课程占主 lane，宽度大于单个日程', () => {
    const course = courseToTimelineItem(
      { period: 5, djs: 2, name: '高等数学', _uid: 'course-1' },
      1,
      'official',
      timeSchedule
    )
    expect(course).not.toBeNull()

    const slots = slotsOf([course as ScheduleTimelineItem, event('event-1', '14:30', '15:00')])
    expect(slots).toHaveLength(2)

    const courseSlot = slots.find((slot) => slot.item.kind === 'course')
    const eventSlot = slots.find((slot) => slot.item.kind === 'event')
    expect(courseSlot).toBeDefined()
    expect(eventSlot).toBeDefined()

    expect(courseSlot!.widthPercent).toBeGreaterThan(eventSlot!.widthPercent)
    expect(courseSlot!.leftPercent).toBe(0)
    // 日程紧贴课程区右侧，二者横向不重叠
    expect(eventSlot!.leftPercent).toBeCloseTo(courseSlot!.widthPercent, 10)
    expect(courseSlot!.leftPercent + courseSlot!.widthPercent).toBeLessThanOrEqual(eventSlot!.leftPercent)
  })

  it('3. 日程 + 日程重叠：并排平分且横向互不重叠', () => {
    const slots = slotsOf([event('a', '14:00', '15:00'), event('b', '14:30', '16:00')])

    expect(slots).toHaveLength(2)
    const [first, second] = slots
    expect(first.widthPercent).toBeCloseTo(50, 10)
    expect(second.widthPercent).toBeCloseTo(50, 10)
    expect(first.leftPercent).toBe(0)
    expect(second.leftPercent).toBeCloseTo(50, 10)
    expect(first.leftPercent + first.widthPercent).toBeLessThanOrEqual(second.leftPercent)
    // 宽度充足时不进入精简态
    expect(first.collapsed).toBe(false)
    expect(first.widthPercent).toBeGreaterThanOrEqual(COMPACT_WIDTH_PERCENT)
  })

  it('4. 确定性：重复调用与打乱输入顺序结果完全一致', () => {
    const course = courseToTimelineItem(
      { period: 5, djs: 2, name: '线性代数', _uid: 'course-x' },
      1,
      'official',
      timeSchedule
    ) as ScheduleTimelineItem

    const items = [
      course,
      event('e1', '14:10', '14:50'),
      event('e2', '14:20', '15:00'),
      event('e3', '14:40', '15:20'),
      event('e4', '16:00', '16:30'),
      event('e5', '16:10', '17:00'),
      event('e6', '18:40', '19:30')
    ]

    const baseline = layout(items)
    expect(layout(items)).toEqual(baseline)
    expect(layout(items)).toEqual(baseline)

    const shuffled = [items[3], items[0], items[5], items[2], items[6], items[1], items[4]]
    expect(layout(shuffled)).toEqual(baseline)
  })

  it('5. 三重重叠 + maxLanes = 3：3 个可见、无聚合', () => {
    const items = [event('a', '14:00', '15:00'), event('b', '14:10', '15:10'), event('c', '14:20', '15:20')]
    const result = layout(items, { maxLanes: 3 })

    expect(result.slots).toHaveLength(3)
    expect(result.overflowGroups).toHaveLength(0)
    expect(result.slots.every((slot) => slot.hiddenCount === 0)).toBe(true)
    result.slots.forEach((slot) => expect(slot.widthPercent).toBeCloseTo(100 / 3, 10))
  })

  it('6. 四重重叠 + maxLanes = 3：3 可见 + 1 隐藏，且可见宽度不低于可点击下限', () => {
    const items = [
      event('a', '14:00', '15:00'),
      event('b', '14:05', '15:05'),
      event('c', '14:10', '15:10'),
      event('d', '14:15', '15:15')
    ]
    const result = layout(items, { maxLanes: 3 })

    expect(result.slots).toHaveLength(3)
    expect(result.overflowGroups).toHaveLength(1)
    expect(result.overflowGroups[0].hiddenCount).toBe(1)
    expect(result.overflowGroups[0].items.map((item) => item.id)).toEqual(['d'])
    // 被聚合的可见卡片回填 hiddenCount，用于卡片内 `+N`
    expect(result.slots.every((slot) => slot.hiddenCount === 1)).toBe(true)

    result.slots.forEach((slot) => {
      expect(slot.widthPercent).toBeGreaterThanOrEqual(MIN_LANE_WIDTH_PERCENT)
      expect(slot.leftPercent).toBeGreaterThanOrEqual(0)
      expect(slot.leftPercent + slot.widthPercent).toBeLessThanOrEqual(100)
    })
  })

  it('7. 超短事件（10 分钟）：高度等于真实几何高度，不被抬高，也不污染重叠判定', () => {
    const rect = intervalToGridRect(minute('14:00'), minute('14:10'), geometry)
    expect(rect).not.toBeNull()
    const expectedHeightPercent = (rect!.height / getGridTotalHeight(geometry)) * 100

    const slots = slotsOf([event('short', '14:00', '14:10')])
    expect(slots).toHaveLength(1)
    expect(slots[0].heightPercent).toBeCloseTo(expectedHeightPercent, 10)
    // 真实高度极小（远小于一行），说明没有被视觉补偿抬高
    expect(slots[0].heightPercent).toBeLessThan(100 / MAX_PERIOD / 2)

    // 紧邻的 10:10 事件与它首尾相接，不应因视觉补偿被判为重叠
    const adjacent = slotsOf([event('short', '14:00', '14:10'), event('next', '14:10', '14:30')])
    expect(adjacent).toHaveLength(2)
    adjacent.forEach((slot) => {
      expect(slot.leftPercent).toBe(0)
      expect(slot.widthPercent).toBe(100)
    })
  })

  it('8. 可见区外事件：正确分到 before / after，且不参与 lane 计算', () => {
    const early = event('early', '07:00', '07:30')
    const late = event('late', '21:30', '22:30')
    const inside = event('inside', '14:00', '15:00')

    const split = splitOutOfRangeEvents([late, inside, early], geometry)
    expect(split.before.map((item) => item.id)).toEqual(['early'])
    expect(split.after.map((item) => item.id)).toEqual(['late'])
    expect(split.inRange.map((item) => item.id)).toEqual(['inside'])

    const result = layout([late, inside, early])
    expect(result.slots.map((slot) => slot.item.id)).toEqual(['inside'])
    expect(result.slots[0].widthPercent).toBe(100)
    expect(result.overflowGroups).toHaveLength(0)

    // 边界：恰好等于第一节开始 / 最后一节结束的日程仍属于可见区
    const boundary = splitOutOfRangeEvents([event('edge', '08:20', '20:55')], geometry)
    expect(boundary.inRange).toHaveLength(1)
  })

  it('8b. 部分越界仍渲染可见部分：跨上边界、跨下边界、跨整个网格都进入 lane', () => {
    const crossesBefore = event('cross-before', '08:00', '08:30')
    const crossesAfter = event('cross-after', '19:00', '21:00')
    const spansAll = event('span-all', '07:00', '22:00')
    const endsAtStart = event('ends-at-start', '07:30', '08:20')
    const startsAtEnd = event('starts-at-end', '20:55', '21:30')

    const split = splitOutOfRangeEvents(
      [crossesBefore, crossesAfter, spansAll, endsAtStart, startsAtEnd],
      geometry
    )

    expect(split.before.map((item) => item.id)).toEqual(['ends-at-start'])
    expect(split.after.map((item) => item.id)).toEqual(['starts-at-end'])
    expect(split.inRange.map((item) => item.id)).toEqual([
      'cross-before',
      'cross-after',
      'span-all'
    ])

    const result = layout([crossesBefore, crossesAfter, spansAll])
    expect(result.slots.map((slot) => slot.item.id).sort()).toEqual([
      'cross-after',
      'cross-before',
      'span-all'
    ])
    expect(result.slots.every((slot) => slot.heightPercent > 0)).toBe(true)
  })

  it('9. 几何联动：14:00 的事件顶部落在第 5 节行顶（400/11 %）', () => {
    const slots = slotsOf([event('noon', '14:00', '15:00')])

    expect(slots).toHaveLength(1)
    expect(slots[0].topPercent).toBeCloseTo(400 / 11, 6)
    // 百分比单位与几何单位一致时，逆映射应还原 14:00 = 840 分钟
    expect(gridYToMinute(slots[0].topPercent, geometry)).toBeCloseTo(840, 6)
  })

  it('10. 复用 intervalsOverlap：首尾相接（aEnd === bStart）不算重叠', () => {
    const slots = slotsOf([event('a', '14:00', '15:00'), event('b', '15:00', '16:00')])

    expect(slots).toHaveLength(2)
    slots.forEach((slot) => {
      expect(slot.leftPercent).toBe(0)
      expect(slot.widthPercent).toBe(100)
    })
    expect(layout([event('a', '14:00', '15:00'), event('b', '15:00', '16:00')]).overflowGroups).toHaveLength(0)
  })

  it('11. 课程 + 多个日程重叠：课程仍为最宽，日程降级为精简态并受可读下限保护', () => {
    const course = courseToTimelineItem(
      { period: 5, djs: 2, name: '大学物理', _uid: 'course-y' },
      1,
      'official',
      timeSchedule
    ) as ScheduleTimelineItem

    const slots = slotsOf([course, event('e1', '14:05', '14:30'), event('e2', '14:20', '14:50')])
    const courseSlot = slots.find((slot) => slot.item.kind === 'course')!
    const eventSlots = slots.filter((slot) => slot.item.kind === 'event')

    expect(eventSlots).toHaveLength(2)
    eventSlots.forEach((slot) => {
      expect(courseSlot.widthPercent).toBeGreaterThan(slot.widthPercent)
      expect(slot.widthPercent).toBeGreaterThanOrEqual(MIN_LANE_WIDTH_PERCENT)
      expect(slot.collapsed).toBe(slot.widthPercent < COMPACT_WIDTH_PERCENT)
    })
  })

  it('12. 适配器链路：eventToTimelineItem 命中的日程可进入 lane 布局', () => {
    const weekDates = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']
    const item = eventToTimelineItem(
      {
        id: 'evt-1',
        title: '例会',
        date: '2026-09-02',
        startTime: '14:00',
        endTime: '15:00',
        location: 'A-101'
      },
      weekDates
    )

    expect(item).not.toBeNull()
    expect(item!.dayIndex).toBe(3)
    const slots = slotsOf([item as ScheduleTimelineItem])
    expect(slots).toHaveLength(1)
    expect(slots[0].item.subtitle).toBe('A-101')
  })
})
