/**
 * #840 周/学期 ICS 导出纳入个人日程 —— 纯函数单测。
 *
 * 覆盖契约：
 * - 周导出只含当前 weekDates 范围内的日程；学期导出只含学期日期范围内的日程；
 *   远离学期范围的日程绝不能被全量导出（防「因无 semester 字段就全导」回归哨兵）。
 * - 中文标题 / 含 `,` `;` `\` 的地点 / 含换行的备注原样进入 summary/location/description
 *   （ICS 文本转义由 Rust utils/ics.rs 负责，前端只保证不丢字符）。
 * - 个人日程与课程同时段二者共存；同一日程不重复生成；结果按开始时间升序；
 *   无 reminder_minutes 仍可导出；不属于 custom course 也不漏。
 * - 取日程失败时课程导出不受影响（注入 reject 的 fetch）。
 * - 课程 ICS 输出无回归：既有 buildExportEventsFor* 的 summary/start/end/location/description 与基线逐字段一致。
 */
import { describe, expect, it } from 'vitest'
import {
  buildExportEventsForSemester,
  buildExportEventsForWeek,
  resolveSemesterTotalWeeks
} from './calendar'
import {
  buildPersonalEventExportItem,
  buildPersonalExportEvents,
  mergePersonalEventsIntoExport,
  resolveSemesterDateRange,
  resolveWeekDateRange
} from './calendarEvents'

/** 学期开学日：2026-08-31（周一） */
const START_DATE = '2026-08-31'
/** 第 1 周 7 天（2026-08-31 ~ 2026-09-06） */
const WEEK_ONE_ISOS = [
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06'
]
const weekDates = WEEK_ONE_ISOS.map((iso) => ({ iso }))

/** 课程夹具：周一第 1 节，1-16 周 → 学期范围 2026-08-31 ~ 2026-12-20 */
const courseFixture = () => ({
  id: 'c1',
  name: '高等数学',
  teacher: '张老师',
  weekday: 1,
  period: 1,
  djs: 1,
  weeks: Array.from({ length: 16 }, (_, i) => i + 1),
  building: '教学楼A',
  room_code: '101'
})

const personalEvent = (overrides: Record<string, any> = {}) => ({
  id: 'e1',
  title: '蓝电技术部开会',
  date: '2026-09-02',
  start_time: '10:00',
  end_time: '11:30',
  location: '实验楼B,301;东侧\\入口',
  note: '带笔记本电脑\n讨论下周排期',
  color: '#3b82f6',
  reminder_minutes: null,
  ...overrides
})

describe('#840 导出日期范围推导', () => {
  it('学期范围 = 开学日 ~ 第 totalWeeks 周周日（与课程导出同一套周数推导）', () => {
    const scheduleData = [courseFixture()]
    expect(resolveSemesterTotalWeeks(scheduleData)).toBe(16)
    expect(resolveSemesterDateRange(START_DATE, scheduleData)).toEqual({
      startDate: '2026-08-31',
      endDate: '2026-12-20'
    })
  })

  it('无有效周次时沿用 25 周兜底，范围随之为 25 周', () => {
    expect(resolveSemesterTotalWeeks([{ name: 'x', weeks: [] }])).toBe(25)
    expect(resolveSemesterDateRange(START_DATE, [{ name: 'x', weeks: [] }])).toEqual({
      startDate: '2026-08-31',
      endDate: '2027-02-21'
    })
  })

  it('开学日缺失/非法 → null（不做任何范围推断）', () => {
    expect(resolveSemesterDateRange('', [courseFixture()])).toBeNull()
    expect(resolveSemesterDateRange('2026/08/31', [courseFixture()])).toBeNull()
  })

  it('周范围优先取当前 weekDates 的首尾', () => {
    expect(resolveWeekDateRange({ weekDates, startDateStr: START_DATE, weekNumber: 1 })).toEqual({
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
  })

  it('weekDates 乱序/缺失时仍能得到正确周范围（缺失则按开学日 + 周次推算）', () => {
    const shuffled = [weekDates[3], weekDates[0], weekDates[6]]
    expect(resolveWeekDateRange({ weekDates: shuffled, startDateStr: START_DATE, weekNumber: 1 })).toEqual({
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(resolveWeekDateRange({ weekDates: [], startDateStr: START_DATE, weekNumber: 2 })).toEqual({
      startDate: '2026-09-07',
      endDate: '2026-09-13'
    })
    expect(resolveWeekDateRange({ weekDates: [], startDateStr: '', weekNumber: 1 })).toBeNull()
  })
})

describe('#840 单条日程 → 导出事件映射', () => {
  it('字段映射与课程事件形状一致：title/date+start_time/date+end_time/location/note', () => {
    expect(buildPersonalEventExportItem(personalEvent())).toEqual({
      summary: '蓝电技术部开会',
      start: '2026-09-02T10:00:00',
      end: '2026-09-02T11:30:00',
      location: '实验楼B,301;东侧\\入口',
      description: '带笔记本电脑\n讨论下周排期'
    })
  })

  it('地点/备注为空 → 省略对应字段（与课程导出一致，行为稳定）', () => {
    const item = buildPersonalEventExportItem(personalEvent({ location: '', note: '   ' }))
    expect(item).not.toBeNull()
    expect(item!.location).toBeUndefined()
    expect(item!.description).toBeUndefined()
  })

  it('标题为空 / 日期非法 / 时间非法 → 跳过（返回 null）', () => {
    expect(buildPersonalEventExportItem(personalEvent({ title: '   ' }))).toBeNull()
    expect(buildPersonalEventExportItem(personalEvent({ date: '2026/09/02' }))).toBeNull()
    expect(buildPersonalEventExportItem(personalEvent({ start_time: '25:00' }))).toBeNull()
    expect(buildPersonalEventExportItem(personalEvent({ end_time: '10:0' }))).toBeNull()
    expect(buildPersonalEventExportItem(null)).toBeNull()
  })

  it('无 reminder_minutes 不影响导出', () => {
    expect(buildPersonalEventExportItem(personalEvent({ reminder_minutes: null }))).not.toBeNull()
    expect(buildPersonalEventExportItem(personalEvent({ reminder_minutes: undefined }))).not.toBeNull()
  })
})

describe('#840 范围过滤（周 / 学期）', () => {
  it('周导出包含范围内日程（weekDates 命中）', () => {
    const result = buildPersonalExportEvents({
      events: [personalEvent({ date: '2026-09-02' })],
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result).toHaveLength(1)
    expect(result[0].summary).toBe('蓝电技术部开会')
  })

  it('周导出排除范围外日程（下一周周一）', () => {
    const result = buildPersonalExportEvents({
      events: [personalEvent({ date: '2026-09-07' })],
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result).toHaveLength(0)
  })

  it('学期导出包含学期范围内日程（含首日与末日边界）', () => {
    const result = buildPersonalExportEvents({
      events: [
        personalEvent({ id: 'a', date: '2026-08-31' }),
        personalEvent({ id: 'b', date: '2026-10-15' }),
        personalEvent({ id: 'c', date: '2026-12-20' })
      ],
      startDate: '2026-08-31',
      endDate: '2026-12-20'
    })
    expect(result.map((item) => item.start.slice(0, 10))).toEqual([
      '2026-08-31',
      '2026-10-15',
      '2026-12-20'
    ])
  })

  it('学期导出排除学期范围外日程（开学前 / 学期末之后）', () => {
    const result = buildPersonalExportEvents({
      events: [
        personalEvent({ id: 'a', date: '2026-08-30' }),
        personalEvent({ id: 'b', date: '2026-12-21' })
      ],
      startDate: '2026-08-31',
      endDate: '2026-12-20'
    })
    expect(result).toHaveLength(0)
  })

  it('防全量误导出：远离学期范围的日程不得进入学期导出结果', () => {
    const scheduleData = [courseFixture()]
    const range = resolveSemesterDateRange(START_DATE, scheduleData)!
    const result = buildPersonalExportEvents({
      events: [
        personalEvent({ id: 'in', date: '2026-09-02' }),
        personalEvent({ id: 'far', date: '2027-03-01', title: '寒假集训' }),
        personalEvent({ id: 'far-past', date: '2025-01-01', title: '高中同学聚会' })
      ],
      startDate: range.startDate,
      endDate: range.endDate
    })
    expect(result).toHaveLength(1)
    expect(result[0].summary).toBe('蓝电技术部开会')
  })
})

describe('#840 字符与排序契约', () => {
  it('中文标题原样进入 summary，不被截断', () => {
    const title = '蓝电技术部开会：讨论 2026 秋季纳新与设备采购清单'
    const result = buildPersonalExportEvents({
      events: [personalEvent({ title })],
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result[0].summary).toBe(title)
  })

  it('含 , ; \\ 的地点原样进入 location（转义交给 Rust 侧）', () => {
    const location = '实验楼B,301;东侧\\入口'
    const result = buildPersonalExportEvents({
      events: [personalEvent({ location })],
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result[0].location).toBe(location)
  })

  it('含换行的 note 原样进入 description', () => {
    const note = '第一行\n第二行, 带分号; 与反斜杠\\'
    const result = buildPersonalExportEvents({
      events: [personalEvent({ note })],
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result[0].description).toBe(note)
  })

  it('同一日程（同 id）不重复生成', () => {
    const duplicated = [
      personalEvent({ id: 'dup' }),
      personalEvent({ id: 'dup' }),
      personalEvent({ id: 'dup' })
    ]
    const result = buildPersonalExportEvents({
      events: duplicated,
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result).toHaveLength(1)
  })

  it('结果按开始时间升序', () => {
    const result = buildPersonalExportEvents({
      events: [
        personalEvent({ id: 'late', date: '2026-09-04', start_time: '19:00', end_time: '20:00' }),
        personalEvent({ id: 'early', date: '2026-09-01', start_time: '08:30', end_time: '09:00' }),
        personalEvent({ id: 'mid', date: '2026-09-02', start_time: '10:00', end_time: '11:30' })
      ],
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result.map((item) => item.start)).toEqual([
      '2026-09-01T08:30:00',
      '2026-09-02T10:00:00',
      '2026-09-04T19:00:00'
    ])
  })

  it('个人日程不依赖 custom course 结构（无 semester/weeks/is_custom 也能导出）', () => {
    const result = buildPersonalExportEvents({
      events: [personalEvent({ id: 'plain' })],
      startDate: '2026-08-31',
      endDate: '2026-09-06'
    })
    expect(result).toHaveLength(1)
    expect(result[0].summary).toBe('蓝电技术部开会')
  })
})

describe('#840 与课程事件合并', () => {
  it('同时段的课程与日程二者都保留（互不删除）', () => {
    const courseEvents = buildExportEventsForWeek(1, {
      startDateStr: START_DATE,
      scheduleData: [courseFixture()]
    })
    // 与课程同一时段（周一 08:20-09:05）
    const sameSlot = personalEvent({
      id: 'same-slot',
      title: '蓝电技术部开会',
      date: '2026-08-31',
      start_time: '08:20',
      end_time: '09:05'
    })
    return mergePersonalEventsIntoExport({
      courseEvents,
      range: resolveWeekDateRange({ weekDates, startDateStr: START_DATE, weekNumber: 1 }),
      fetchEvents: async () => [sameSlot]
    }).then((merged) => {
      expect(merged.personalEventCount).toBe(1)
      expect(merged.events).toHaveLength(courseEvents.length + 1)
      expect(merged.events.map((item) => item.summary)).toContain('高等数学')
      expect(merged.events.map((item) => item.summary)).toContain('蓝电技术部开会')
    })
  })

  it('合并结果按开始时间升序（课程事件相对顺序不变）', async () => {
    const courseEvents = buildExportEventsForWeek(1, {
      startDateStr: START_DATE,
      scheduleData: [courseFixture()]
    })
    const merged = await mergePersonalEventsIntoExport({
      courseEvents,
      range: resolveWeekDateRange({ weekDates, startDateStr: START_DATE, weekNumber: 1 }),
      fetchEvents: async () => [
        personalEvent({ id: 'w1', date: '2026-09-02', start_time: '10:00', end_time: '11:30' }),
        personalEvent({ id: 'w2', date: '2026-09-01', start_time: '08:30', end_time: '09:00' })
      ]
    })
    const starts = merged.events.map((item) => item.start)
    expect(starts).toEqual([...starts].sort())
    expect(starts).toEqual([
      '2026-08-31T08:20:00',
      '2026-09-01T08:30:00',
      '2026-09-02T10:00:00'
    ])
  })

  it('fetch 返回范围外日程时被过滤（不因 fetch 结果宽泛而越界导出）', async () => {
    const merged = await mergePersonalEventsIntoExport({
      courseEvents: [],
      range: { startDate: '2026-08-31', endDate: '2026-09-06' },
      fetchEvents: async () => [
        personalEvent({ id: 'in', date: '2026-09-02' }),
        personalEvent({ id: 'out', date: '2026-11-02', title: '范围外' })
      ]
    })
    expect(merged.events).toHaveLength(1)
    expect(merged.events[0].summary).toBe('蓝电技术部开会')
  })

  it('取日程失败不影响课程导出（注入 reject 的 fetch）', async () => {
    const courseEvents = buildExportEventsForWeek(1, {
      startDateStr: START_DATE,
      scheduleData: [courseFixture()]
    })
    const merged = await mergePersonalEventsIntoExport({
      courseEvents,
      range: resolveWeekDateRange({ weekDates, startDateStr: START_DATE, weekNumber: 1 }),
      fetchEvents: async () => {
        throw new Error('list-range 不可用')
      }
    })
    expect(merged.personalEventsFailed).toBe(true)
    expect(merged.personalEventCount).toBe(0)
    expect(merged.events).toEqual(courseEvents)
  })

  it('无 range 或无 fetchEvents 时原样返回课程事件', async () => {
    const courseEvents = buildExportEventsForWeek(1, {
      startDateStr: START_DATE,
      scheduleData: [courseFixture()]
    })
    const noRange = await mergePersonalEventsIntoExport({ courseEvents, range: null, fetchEvents: async () => [] })
    expect(noRange).toEqual({ events: courseEvents, personalEventCount: 0, personalEventsFailed: false })
    const noFetcher = await mergePersonalEventsIntoExport({ courseEvents, range: { startDate: '2026-08-31', endDate: '2026-09-06' } })
    expect(noFetcher).toEqual({ events: courseEvents, personalEventCount: 0, personalEventsFailed: false })
  })
})

describe('#840 课程 ICS 输出无回归（基线快照）', () => {
  it('周导出：summary/start/end/location/description 与改动前一致', () => {
    const events = buildExportEventsForWeek(1, {
      startDateStr: START_DATE,
      scheduleData: [courseFixture()]
    })
    expect(events).toEqual([
      {
        summary: '高等数学',
        description: '时间: 第1周 周1 第1-1节 08:20-09:05\n地点: 教学楼A 101',
        location: '教学楼A 101',
        start: '2026-08-31T08:20:00',
        end: '2026-08-31T09:05:00'
      }
    ])
  })

  it('学期导出：每周一条、字段与改动前一致，周数推导仍取课程最大周', () => {
    const events = buildExportEventsForSemester({
      startDateStr: START_DATE,
      scheduleData: [courseFixture()]
    })
    expect(events).toHaveLength(16)
    expect(events[0]).toEqual({
      summary: '高等数学',
      description: '时间: 第1周 周1 第1-1节 08:20-09:05\n地点: 教学楼A 101',
      location: '教学楼A 101',
      start: '2026-08-31T08:20:00',
      end: '2026-08-31T09:05:00'
    })
    expect(events[15].start).toBe('2026-12-14T08:20:00')
    expect(events[15].end).toBe('2026-12-14T09:05:00')
  })

  it('合并个人日程后课程事件字段逐字段不变', async () => {
    const baseline = buildExportEventsForWeek(1, {
      startDateStr: START_DATE,
      scheduleData: [courseFixture()]
    })
    const merged = await mergePersonalEventsIntoExport({
      courseEvents: baseline,
      range: resolveWeekDateRange({ weekDates, startDateStr: START_DATE, weekNumber: 1 }),
      fetchEvents: async () => [personalEvent({ id: 'extra', date: '2026-09-03', start_time: '14:00', end_time: '15:00' })]
    })
    expect(merged.events[0]).toEqual(baseline[0])
    expect(merged.events).toHaveLength(2)
  })
})
