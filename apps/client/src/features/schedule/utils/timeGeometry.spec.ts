/**
 * #834 时间画布契约与「真实时间 → 课表 Y 坐标」几何映射 —— 纯函数单测。
 *
 * 覆盖重点：
 * 1. 钟点解析（含全部非法形态安全失败）；
 * 2. 第 i 节开始时间精确落在第 i 行顶部（与 grid-row 课程卡对齐的不变量）；
 * 3. 行内二段切分：课节段 + 课间段；长午休（130min）被压缩但保持单调可区分；
 * 4. edge 状态（before / inside / after）与越界 clamp；
 * 5. 跨节次取末节 end（不按时长累加）；
 * 6. 半开区间 overlap 真源与边界；
 * 7. 适配器字段归一与「不属于本周 → null」；
 * 8. 全区间扫描无 NaN / Infinity；几何层无 DOM / Vue / CSS 运行时依赖。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_PERIOD, timeSchedule } from '../constants'
import { courseToTimelineItem, eventToTimelineItem } from './timelineAdapters'
import {
  DEFAULT_MAX_GAP_MINUTES,
  MINUTES_PER_DAY,
  buildScheduleTimeGeometry,
  getCourseRealInterval,
  getGridTotalHeight,
  intervalToGridRect,
  intervalsOverlap,
  parseClockToMinute,
  timeToGridY
} from './timeGeometry'

const SLOT_HEIGHT = 60
const geometry = buildScheduleTimeGeometry(timeSchedule, SLOT_HEIGHT)
/** 各行的期望像素高度：与 constants.ts 的真实时间表一一对应 */
const ROW_HEIGHT = SLOT_HEIGHT

/** 真实时间表对应的行内课节段/课间段（由几何模型产出，供 band 断言使用） */
const row = (period: number) => geometry.rows[period - 1]

/** 第 i 节行顶：几何映射的核心不变量目标 */
const rowTopOf = (period: number) => (period - 1) * ROW_HEIGHT

/** 本周（周一..周日）日期，用于个人日程归属判定 */
const WEEK_DATES = [
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06'
]

describe('#834 parseClockToMinute（钟点 → 分钟）', () => {
  it('1. 合法钟点解析为距 00:00 的分钟数', () => {
    expect(parseClockToMinute('08:20')).toBe(500)
    expect(parseClockToMinute('14:30')).toBe(870)
    expect(parseClockToMinute('00:00')).toBe(0)
    expect(parseClockToMinute('23:59')).toBe(1439)
    expect(MINUTES_PER_DAY).toBe(1440)
  })

  it('2. 非法输入一律返回 null（不抛异常、不返回 NaN）', () => {
    const illegal = ['', '8:2', '24:00', '12:60', 'abc', '-1:00', '08:20:00', '0820', '  ']
    for (const input of illegal) {
      expect(parseClockToMinute(input)).toBeNull()
    }
    // 非字符串入参同样安全失败（运行时可能来自损坏的持久化数据）
    expect(parseClockToMinute(undefined as unknown as string)).toBeNull()
    expect(parseClockToMinute(null as unknown as string)).toBeNull()
  })
})

describe('#834 buildScheduleTimeGeometry（几何模型）', () => {
  it('3. 11 节 × 60px → 总高 660', () => {
    expect(timeSchedule.length).toBe(MAX_PERIOD)
    expect(geometry.valid).toBe(true)
    expect(geometry.rowCount).toBe(11)
    expect(geometry.totalHeight).toBe(660)
    expect(getGridTotalHeight(geometry)).toBe(660)
    expect(DEFAULT_MAX_GAP_MINUTES).toBe(30)
  })

  it('不变量：第 i 节开始时间精确落在第 i 行顶部', () => {
    for (let period = 1; period <= 11; period += 1) {
      const startMinute = parseClockToMinute(timeSchedule[period - 1].start)!
      const position = timeToGridY(startMinute, geometry)
      expect(position.y).toBeCloseTo(rowTopOf(period), 6)
      expect(position.edge).toBe('inside')
    }
  })

  it('每行 band 之和恒等于行高，且 band 非负', () => {
    for (const item of geometry.rows) {
      expect(item.periodBand + item.gapBand).toBeCloseTo(ROW_HEIGHT, 6)
      expect(item.periodBand).toBeGreaterThan(0)
      expect(item.gapBand).toBeGreaterThanOrEqual(0)
      expect(item.rowTop).toBeCloseTo(rowTopOf(item.period), 6)
    }
  })

  it('课程卡对齐不变量：period/djs 的真实区间必须落在 grid-row 跨越的像素带内', () => {
    for (let period = 1; period <= 11; period += 1) {
      for (const djs of [1, 2, 3]) {
        const span = Math.min(djs, 12 - period)
        const interval = getCourseRealInterval(period, span, timeSchedule)!
        const rect = intervalToGridRect(interval.startMinute, interval.endMinute, geometry)!
        const gridTop = rowTopOf(period)
        const gridBottom = rowTopOf(period + span)
        expect(rect.top).toBeGreaterThanOrEqual(gridTop - 1e-9)
        expect(rect.top + rect.height).toBeLessThanOrEqual(gridBottom + 1e-9)
      }
    }
  })

  it('非法时间表 / 非法行高 → valid:false 且总高为 0（不产生 NaN）', () => {
    expect(buildScheduleTimeGeometry([], SLOT_HEIGHT).valid).toBe(false)
    expect(buildScheduleTimeGeometry([], SLOT_HEIGHT).totalHeight).toBe(0)
    expect(buildScheduleTimeGeometry(timeSchedule, 0).valid).toBe(false)
    expect(buildScheduleTimeGeometry(timeSchedule, NaN).valid).toBe(false)
    const broken = buildScheduleTimeGeometry(
      [{ p: 1, start: '08:20', end: 'abc' }],
      SLOT_HEIGHT
    )
    expect(broken.valid).toBe(false)
    expect(getGridTotalHeight(broken)).toBe(0)
  })

  it('maxGapMinutes 可覆盖：gap 上限调小后课间段更窄但仍为正', () => {
    const tight = buildScheduleTimeGeometry(timeSchedule, SLOT_HEIGHT, { maxGapMinutes: 10 })
    // 第 4 行（130 分钟午休）effGap 被压到 10 → periodBand = 60*45/55
    expect(tight.rows[3].effGapMinutes).toBe(10)
    expect(tight.rows[3].periodBand).toBeCloseTo((60 * 45) / 55, 6)
    expect(tight.rows[3].gapBand).toBeGreaterThan(0)
    // 第 1 行 gap = 5 < 10，不受上限影响
    expect(tight.rows[0].effGapMinutes).toBe(5)
    expect(tight.totalHeight).toBe(660)
  })
})

describe('#834 timeToGridY（时间点 → 网格 Y）', () => {
  it('4. 08:20（第 1 节顶部）→ y ≈ 0 且 inside', () => {
    const position = timeToGridY(500, geometry)
    expect(position.y).toBeCloseTo(0, 6)
    expect(position.edge).toBe('inside')
  })

  it('5. 09:05（第 1 节结束）→ 落在第 1 节课节段底部', () => {
    const position = timeToGridY(545, geometry)
    expect(position.y).toBeCloseTo(row(1).periodBand, 6)
    expect(position.y).toBeLessThan(ROW_HEIGHT)
    expect(position.edge).toBe('inside')
  })

  it('6. 09:10（第 2 节顶部）→ y ≈ 60，精确等于 rowHeight', () => {
    const position = timeToGridY(550, geometry)
    expect(position.y).toBeCloseTo(ROW_HEIGHT, 6)
    expect(position.y).toBeCloseTo(rowTopOf(2), 6)
  })

  it('7. 14:00（第 5 节顶部）→ y ≈ 4 * 60 = 240', () => {
    expect(timeToGridY(840, geometry).y).toBeCloseTo(240, 6)
  })

  it('8. 14:22 位于第 5 节课节段内部（240 < y < 240 + periodBand_5）', () => {
    const position = timeToGridY(862, geometry)
    const top = rowTopOf(5)
    expect(position.y).toBeGreaterThan(top)
    expect(position.y).toBeLessThan(top + row(5).periodBand)
    expect(position.edge).toBe('inside')
  })

  it('9. 午休内 12:30 / 13:30 均得到有限坐标且 13:30 严格更大', () => {
    const noon = timeToGridY(750, geometry)
    const afternoon = timeToGridY(810, geometry)
    expect(Number.isFinite(noon.y)).toBe(true)
    expect(Number.isFinite(afternoon.y)).toBe(true)
    expect(noon.edge).toBe('inside')
    expect(afternoon.edge).toBe('inside')
    expect(afternoon.y).toBeGreaterThan(noon.y)
    // 午休整体被压缩进第 4 行的课间段内
    const row4 = row(4)
    expect(noon.y).toBeGreaterThan(row4.rowTop + row4.periodBand - 1e-9)
    expect(afternoon.y).toBeLessThan(row4.rowTop + row4.rowHeight + 1e-9)
  })

  it('10. 08:20 → 20:55 按 1 分钟步进采样，y 非递减', () => {
    let previous = Number.NEGATIVE_INFINITY
    for (let minute = 500; minute <= 1255; minute += 1) {
      const current = timeToGridY(minute, geometry)
      expect(current.y).toBeGreaterThanOrEqual(previous)
      previous = current.y
    }
    // 末节结束精确落在网格底部
    expect(previous).toBeCloseTo(660, 6)
  })

  it('11. 5 / 20 / 130 分钟 gap 都有正 band，且 130 分钟 gap 的 band 不超过行高一半', () => {
    const gap5 = row(1)
    const gap20 = row(2)
    const gap130 = row(4)
    expect(gap5.rawGapMinutes).toBe(5)
    expect(gap20.rawGapMinutes).toBe(20)
    expect(gap130.rawGapMinutes).toBe(130)
    for (const item of [gap5, gap20, gap130]) {
      expect(item.gapBand).toBeGreaterThan(0)
      expect(item.gapBand).toBeLessThan(item.rowHeight)
    }
    expect(gap130.effGapMinutes).toBe(DEFAULT_MAX_GAP_MINUTES)
    expect(gap130.gapBand).toBeLessThanOrEqual(ROW_HEIGHT * 0.5)
  })

  it('12. 可见区外：07:30 → before/0；22:00 → after/总高', () => {
    const before = timeToGridY(450, geometry)
    expect(before.edge).toBe('before')
    expect(before.y).toBe(0)

    const after = timeToGridY(1320, geometry)
    expect(after.edge).toBe('after')
    expect(after.y).toBe(11 * ROW_HEIGHT)
    expect(after.y).toBe(getGridTotalHeight(geometry))
  })

  it('13. 全区间扫描（含越界与非法入参）无 NaN / Infinity', () => {
    for (let minute = -100; minute <= 1600; minute += 1) {
      const position = timeToGridY(minute, geometry)
      expect(Number.isFinite(position.y)).toBe(true)
      expect(position.y).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeLessThanOrEqual(660)
      expect(['before', 'inside', 'after']).toContain(position.edge)
    }
    for (const illegal of [NaN, Infinity, -Infinity]) {
      const position = timeToGridY(illegal, geometry)
      expect(Number.isFinite(position.y)).toBe(true)
      expect(position.y).toBe(0)
      expect(position.edge).toBe('before')
    }
    // 空几何模型同样安全
    const empty = buildScheduleTimeGeometry([], SLOT_HEIGHT)
    expect(timeToGridY(870, empty)).toEqual({ y: 0, edge: 'before' })
  })
})

describe('#834 getCourseRealInterval（节次 → 真实起止分钟）', () => {
  it('14. (5, 2) → 14:00 ~ 15:35（取末节 end，而非 14:00 + 90min）', () => {
    expect(getCourseRealInterval(5, 2, timeSchedule)).toEqual({
      startMinute: 840,
      endMinute: 935
    })
  })

  it('15. (11, 1) → 20:10 ~ 20:55；越界安全钳制 / 非法返回 null', () => {
    expect(getCourseRealInterval(11, 1, timeSchedule)).toEqual({
      startMinute: 1210,
      endMinute: 1255
    })
    // period 越界钳制到 [1, 11]，djs 越界钳制到最后一节
    expect(getCourseRealInterval(0, 1, timeSchedule)).toEqual({
      startMinute: 500,
      endMinute: 545
    })
    expect(getCourseRealInterval(99, 1, timeSchedule)).toEqual({
      startMinute: 1210,
      endMinute: 1255
    })
    expect(getCourseRealInterval(10, 99, timeSchedule)).toEqual({
      startMinute: 1160,
      endMinute: 1255
    })
    expect(getCourseRealInterval(1, 0, timeSchedule)).toEqual({
      startMinute: 500,
      endMinute: 545
    })
    // 非法入参
    expect(getCourseRealInterval(NaN, 1, timeSchedule)).toBeNull()
    expect(getCourseRealInterval(1, NaN, timeSchedule)).toBeNull()
    expect(getCourseRealInterval(1, 1, [])).toBeNull()
    expect(
      getCourseRealInterval(1, 1, [{ p: 1, start: 'bad', end: '09:05' }])
    ).toBeNull()
    expect(
      getCourseRealInterval(1, 1, [{ p: 1, start: '09:05', end: '08:20' }])
    ).toBeNull()
  })
})

describe('#834 intervalToGridRect（区间 → 网格矩形）', () => {
  it('16. (870, 940) 得到正高度；(940, 940) 与 (940, 870) 返回 null', () => {
    const rect = intervalToGridRect(870, 940, geometry)
    expect(rect).not.toBeNull()
    expect(rect!.height).toBeGreaterThan(0)
    expect(rect!.top).toBeGreaterThan(240)
    expect(rect!.startEdge).toBe('inside')
    expect(rect!.endEdge).toBe('inside')

    expect(intervalToGridRect(940, 940, geometry)).toBeNull()
    expect(intervalToGridRect(940, 870, geometry)).toBeNull()
    expect(intervalToGridRect(NaN, 940, geometry)).toBeNull()
    expect(intervalToGridRect(870, Infinity, geometry)).toBeNull()
  })

  it('跨行区间高度等于两端 y 之差；越界端被 clamp 到网格边界', () => {
    const rect = intervalToGridRect(840, 935, geometry)!
    expect(rect.top).toBeCloseTo(240, 6)
    expect(rect.height).toBeCloseTo(timeToGridY(935, geometry).y - 240, 6)

    const early = intervalToGridRect(400, 500, geometry)!
    expect(early.startEdge).toBe('before')
    expect(early.top).toBe(0)
    expect(early.height).toBe(0)
    expect(early.endEdge).toBe('inside')

    const late = intervalToGridRect(1255, 1400, geometry)!
    expect(late.endEdge).toBe('after')
    expect(late.top + late.height).toBeCloseTo(660, 6)
  })
})

describe('#834 intervalsOverlap（半开区间重叠真源）', () => {
  it('17. 首尾相接不算重叠；交叉算重叠', () => {
    expect(intervalsOverlap(0, 10, 10, 20)).toBe(false)
    expect(intervalsOverlap(0, 10, 9, 20)).toBe(true)
    expect(intervalsOverlap(870, 935, 890, 920)).toBe(true)
    expect(intervalsOverlap(10, 20, 0, 10)).toBe(false)
    expect(intervalsOverlap(0, 10, 11, 20)).toBe(false)
    expect(intervalsOverlap(0, 10, 0, 10)).toBe(true)
    // 非法入参安全失败
    expect(intervalsOverlap(NaN, 10, 0, 20)).toBe(false)
    expect(intervalsOverlap(0, 10, 0, Infinity)).toBe(false)
  })
})

describe('#834 timelineAdapters（领域记录 → 统一渲染输入）', () => {
  it('18. courseToTimelineItem：source / dayIndex 正确，跨节次 endMinute 取末节 end', () => {
    const official = courseToTimelineItem(
      {
        id: 'c-1',
        name: '高等数学',
        teacher: '张老师',
        room_code: 'A101',
        period: 5,
        djs: 2,
        color: '#123456'
      },
      3,
      'official',
      timeSchedule
    )!
    expect(official).not.toBeNull()
    expect(official.kind).toBe('course')
    expect(official.source).toBe('official')
    expect(official.dayIndex).toBe(3)
    expect(official.startMinute).toBe(840)
    expect(official.endMinute).toBe(935)
    expect(official.title).toBe('高等数学')
    expect(official.subtitle).toBe('张老师 · A101')
    expect(official.color).toBe('#123456')

    const custom = courseToTimelineItem(
      { id: 'c-2', name: '自习', period: 11, djs: 1, is_custom: true },
      7,
      'custom-course',
      timeSchedule
    )!
    expect(custom.source).toBe('custom-course')
    expect(custom.dayIndex).toBe(7)
    expect(custom.startMinute).toBe(1210)
    expect(custom.endMinute).toBe(1255)
    expect(custom.color).toBeUndefined()

    // 非法记录 / 非法星期 → null
    expect(courseToTimelineItem(null, 1, 'official', timeSchedule)).toBeNull()
    expect(
      courseToTimelineItem({ name: 'x', period: 1, djs: 1 }, 0, 'official', timeSchedule)
    ).toBeNull()
    expect(courseToTimelineItem({ name: 'x', period: 1, djs: 1 }, 1, 'official', [])).toBeNull()
  })

  it('19. eventToTimelineItem：命中 weekDates 时 dayIndex 正确（周一 = 1），不命中返回 null', () => {
    const monday = eventToTimelineItem(
      {
        id: 'e-1',
        title: '组会',
        date: '2026-08-31',
        startTime: '09:00',
        endTime: '10:30',
        location: '教三 201',
        color: '#ff8800'
      },
      WEEK_DATES
    )!
    expect(monday).not.toBeNull()
    expect(monday.kind).toBe('event')
    expect(monday.source).toBe('personal-event')
    expect(monday.dayIndex).toBe(1)
    expect(monday.startMinute).toBe(540)
    expect(monday.endMinute).toBe(630)
    expect(monday.subtitle).toBe('教三 201')
    expect(monday.color).toBe('#ff8800')

    const wednesday = eventToTimelineItem(
      { id: 'e-2', title: '值班', date: '2026-09-02', startTime: '14:00', endTime: '15:35' },
      WEEK_DATES
    )!
    expect(wednesday.dayIndex).toBe(3)

    // 下一周 / 非本周日期 → 不进入当前周渲染
    expect(
      eventToTimelineItem(
        { id: 'e-3', title: '下周活动', date: '2026-09-07', startTime: '09:00', endTime: '10:00' },
        WEEK_DATES
      )
    ).toBeNull()
    expect(
      eventToTimelineItem(
        { id: 'e-4', title: '无日期', date: '', startTime: '09:00', endTime: '10:00' },
        WEEK_DATES
      )
    ).toBeNull()

    // weekDates 不可用时才回退 dayIndexHint
    expect(
      eventToTimelineItem(
        { id: 'e-5', title: '单日视图', date: '', startTime: '09:00', endTime: '10:00' },
        [],
        5
      )!.dayIndex
    ).toBe(5)
    expect(
      eventToTimelineItem(
        { id: 'e-6', title: '单日视图越界', date: '', startTime: '09:00', endTime: '10:00' },
        [],
        9
      )
    ).toBeNull()
  })

  it('20. 起止倒置 / 相等 / 非法时间 → null', () => {
    const base = { id: 'e', title: 'x', date: '2026-08-31' }
    expect(
      eventToTimelineItem({ ...base, startTime: '15:00', endTime: '14:00' }, WEEK_DATES)
    ).toBeNull()
    expect(
      eventToTimelineItem({ ...base, startTime: '15:00', endTime: '15:00' }, WEEK_DATES)
    ).toBeNull()
    expect(
      eventToTimelineItem({ ...base, startTime: 'abc', endTime: '14:00' }, WEEK_DATES)
    ).toBeNull()
    expect(eventToTimelineItem({ ...base, startTime: '14:00', endTime: '' }, WEEK_DATES)).toBeNull()
    expect(
      eventToTimelineItem({ ...base, startTime: '25:00', endTime: '26:00' }, WEEK_DATES)
    ).toBeNull()
  })
})

describe('#834 纯函数约束（无 DOM / Vue / CSS 运行时依赖）', () => {
  it('21. 三个交付模块不引用 DOM / Vue / CSS 运行时', () => {
    const sources = ['./timelineTypes.ts', './timeGeometry.ts', './timelineAdapters.ts'].map(
      (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')
    )
    for (const source of sources) {
      expect(source).not.toMatch(/from\s+['"]vue['"]/)
      expect(source).not.toMatch(/\bdocument\b/)
      expect(source).not.toMatch(/\bwindow\b/)
      expect(source).not.toMatch(/getComputedStyle/)
      expect(source).not.toMatch(/\.vue['"]/)
    }
  })

  it('几何模型可在无 DOM 环境直接构建并断言（纯数据进出）', () => {
    const plain = buildScheduleTimeGeometry(
      [{ p: 1, start: '08:00', end: '09:00' }],
      100
    )
    expect(plain.valid).toBe(true)
    expect(plain.totalHeight).toBe(100)
    // 单节无后续课节 → gap 为 0 → 整行都是课节段
    expect(plain.rows[0].periodBand).toBe(100)
    expect(plain.rows[0].gapBand).toBe(0)
    expect(timeToGridY(540, plain)).toEqual({ y: 100, edge: 'inside' })
    expect(intervalToGridRect(480, 540, plain)!.height).toBe(100)
  })
})
