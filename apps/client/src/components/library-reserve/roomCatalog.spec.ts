/**
 * 房间模式与「日期 × 时段」网格单测（#1081）
 *
 * 看守两件事：
 * 1. 房间列表的字段与按星期几的 `intervals` 归一化（缺失留空、非法丢弃，不编造）；
 * 2. 网格的**可用性完全来自服务端 intervals** —— 前端不再按日期过滤时段
 *    （用户上报的「每天都显示没有时段」根因），且星期值兼容 0 基 / 1 基两种约定。
 */
import { describe, expect, it } from 'vitest'
import { SEMINAR_RESOURCES, QUIET_RESOURCES } from './catalog'
import { parseSeatClock } from './seatCatalog'
import {
  buildRoomGrid,
  isRoomCellPast,
  normalizeRoomIntervalSlots,
  normalizeRoomItem,
  normalizeRoomList,
  normalizeRoomOccupancy,
  resolveAdvanceDays,
  resolveCatalogResource,
  resolveRoomDayInterval,
  resolveRoomGridDays,
  resolveRoomIntervalIds,
  resolveRoomServerClock,
  roomIndexFromName,
  roomOccupancyKey,
  roomOpenRange,
  weekdayKeyOfDate
} from './roomCatalog'

// ── #1081 房间模式（time_list 不传日期范围）+ 日期×时段网格 ──

/** 房间模式实测形态样本（camelCase 字段 + 按星期几的 intervals） */
const ROOM_RAW = {
  itemId: 24727,
  name: '静音仓 1 号',
  minUserNum: 2,
  maxUserNum: 6,
  formId: 'FORM-1',
  advanceDays: 2,
  timeUnit: 60,
  rangeStartMs: 1792100000000,
  rangeEndMs: 1792300000000,
  intervals: [
    { week: 1, available: 1, startTime: '08:00', endTime: '10:00' },
    { week: 2, available: 0, startTime: '08:00', endTime: '10:00' }
  ]
}

describe('#1081 normalizeRoomItem / normalizeRoomList（房间模式）', () => {
  it('解析房间字段与 intervals（available 显式 0 → 不可约）', () => {
    const room = normalizeRoomItem(ROOM_RAW, 0)
    expect(room.itemId).toBe('24727')
    expect(room.name).toBe('静音仓 1 号')
    expect(room.minUserNum).toBe(2)
    expect(room.maxUserNum).toBe(6)
    expect(room.formId).toBe('FORM-1')
    expect(room.advanceDays).toBe(2)
    expect(room.timeUnit).toBe(60)
    expect(room.key).toBe('room-24727-0')
    expect(room.intervals).toEqual([
      { week: 1, available: true, start: '08:00', end: '10:00' },
      { week: 2, available: false, start: '08:00', end: '10:00' }
    ])
  })

  it('兼容 snake_case / id 兜底；缺失字段留空不编造', () => {
    const room = normalizeRoomItem({ id: 9, item_name: 'X', min_user_num: '3' }, 1)
    expect(room.itemId).toBe('9')
    expect(room.name).toBe('X')
    expect(room.minUserNum).toBe(3)
    expect(room.maxUserNum).toBeNull()
    expect(room.formId).toBe('')
    expect(room.intervals).toEqual([])
    expect(room.key).toBe('room-9-1')
  })

  it('intervals 非数组 / 元素非法（无 week）一律丢弃，不抛错', () => {
    const room = normalizeRoomItem({ itemId: 1, intervals: 'oops' }, 0)
    expect(room.intervals).toEqual([])
    const partial = normalizeRoomItem({ itemId: 1, intervals: [{ available: 1 }, null, 5] }, 0)
    expect(partial.intervals).toEqual([])
    expect(normalizeRoomList('oops')).toEqual([])
    expect(normalizeRoomList(null)).toEqual([])
    expect(normalizeRoomList([ROOM_RAW])).toHaveLength(1)
  })

  it('resolveAdvanceDays：取首个合法值，非法 / 负数跳过，全缺失回落勘察值 3', () => {
    expect(resolveAdvanceDays(2, 5)).toBe(2)
    expect(resolveAdvanceDays(null, '3')).toBe(3)
    expect(resolveAdvanceDays(-1, 4)).toBe(4)
    expect(resolveAdvanceDays('oops', undefined)).toBe(3)
    expect(resolveAdvanceDays(0)).toBe(0)
  })
})

describe('#1081 buildRoomGrid（日期 × 时段网格，可用性来自服务端 intervals）', () => {
  // 2026-10-12 是周一（2026-10-15 为周四）
  const MONDAY = new Date(2026, 9, 12)
  const room = normalizeRoomItem(ROOM_RAW, 0)

  it('行 = 今天起 advanceDays+1 天；列 = 各星期几时段窗口的并集（按 timeUnit 切分）', () => {
    const grid = buildRoomGrid(room, 2, 60, MONDAY)
    expect(grid.columns.map((column) => column.label)).toEqual(['08:00-09:00', '09:00-10:00'])
    expect(grid.rows.map((row) => row.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
    expect(grid.rows.map((row) => row.weekday)).toEqual([1, 2, 3])
    expect(grid.rows.map((row) => row.offset)).toEqual([0, 1, 2])
  })

  it('可用性按行取该星期几的 interval：开放行可点、available=0 整行置灰、无配置整天不可约', () => {
    const grid = buildRoomGrid(room, 2, 60, MONDAY)
    // 周一：开放
    expect(grid.rows[0].disabled).toBe(false)
    expect(grid.rows[0].cells.every((cell) => cell.available)).toBe(true)
    // 周二：available=0 → 整行置灰
    expect(grid.rows[1].disabled).toBe(true)
    expect(grid.rows[1].cells.every((cell) => !cell.available)).toBe(true)
    // 周三：无配置 → 整天不可约
    expect(grid.rows[2].disabled).toBe(true)
  })

  it('单元格自带所属日期（选中态比较不依赖行上下文）', () => {
    const grid = buildRoomGrid(room, 2, 60, MONDAY)
    expect(grid.rows[0].cells[0]).toMatchObject({ date: '2026-10-12', start: '08:00', end: '09:00' })
    expect(grid.rows[1].cells[0].date).toBe('2026-10-13')
    expect(grid.rows[2].cells[1].date).toBe('2026-10-14')
  })

  it('星期值兼容 0 基与 1 基（week=7 → 周日）', () => {
    const sundayRoom = normalizeRoomItem(
      { itemId: 1, intervals: [{ week: 7, available: 1, startTime: '08:00', endTime: '09:00' }] },
      0
    )
    const sunday = new Date(2026, 9, 11) // 2026-10-11 是周日
    const grid = buildRoomGrid(sundayRoom, 0, 60, sunday)
    expect(grid.rows).toHaveLength(1)
    expect(grid.rows[0].weekday).toBe(0)
    expect(grid.rows[0].disabled).toBe(false)
    expect(grid.rows[0].cells[0].available).toBe(true)
  })

  it('不足一个单位的尾巴不产出格子（21:00-21:30 且粒度为 60 → 丢弃）', () => {
    const tailRoom = normalizeRoomItem(
      { itemId: 1, timeUnit: 60, intervals: [{ week: 1, available: 1, startTime: '08:00', endTime: '21:30' }] },
      0
    )
    const grid = buildRoomGrid(tailRoom, 0, 60, MONDAY)
    expect(grid.columns).toHaveLength(13) // 08:00-09:00 … 20:00-21:00
    expect(grid.columns[grid.columns.length - 1].label).toBe('20:00-21:00')
  })

  it('timeUnit 非法回落 60；无 intervals / 无房间 → 空网格（不伪造可点格子）', () => {
    const grid = buildRoomGrid(room, 1, null, MONDAY)
    expect(grid.columns[0].label).toBe('08:00-09:00')
    expect(buildRoomGrid(null, 3, 60, MONDAY)).toEqual({ columns: [], rows: [] })
    const noIntervals = normalizeRoomItem({ itemId: 1, intervals: [] }, 0)
    expect(buildRoomGrid(noIntervals, 3, 60, MONDAY)).toEqual({ columns: [], rows: [] })
  })

  it('resolveRoomDayInterval / roomOpenRange：按星期几取配置，开放区间取并集', () => {
    expect(resolveRoomDayInterval(room, 1)?.start).toBe('08:00')
    expect(resolveRoomDayInterval(room, 3)).toBeNull()
    expect(resolveRoomDayInterval(null, 1)).toBeNull()
    expect(roomOpenRange(room)).toEqual({ openFrom: '08:00', openTo: '10:00' })
    expect(roomOpenRange(null)).toEqual({ openFrom: '', openTo: '' })
  })

  it('roomIndexFromName / resolveCatalogResource：按房间名序号关联静态目录（取不到即省略）', () => {
    expect(roomIndexFromName('静音仓 1 号')).toBe(1)
    expect(roomIndexFromName('7号研讨室')).toBe(7)
    expect(roomIndexFromName('无名房间')).toBeNull()
    const quiet = normalizeRoomItem({ itemId: 1, name: '静音仓 1 号' }, 0)
    expect(resolveCatalogResource(QUIET_RESOURCES, quiet)?.index).toBe(1)
    const seminar = normalizeRoomItem({ itemId: 2, name: '研讨室 7 号' }, 0)
    expect(resolveCatalogResource(SEMINAR_RESOURCES, seminar)?.capacityMax).toBe(30)
    expect(resolveCatalogResource(QUIET_RESOURCES, null)).toBeNull()
  })
})

// ── #1082 已过去单元格（服务端时间判定；服务端时间缺失则不禁用） ──

describe('#1082 isRoomCellPast / buildRoomGrid（服务端时间置灰）', () => {
  const room = normalizeRoomItem(ROOM_RAW, 0)
  const MONDAY = new Date(2026, 9, 12) // 2026-10-12 周一
  const clockAt = (hm: string) => parseSeatClock(`2026-10-12T${hm}:00+08:00`)

  it('isRoomCellPast：当日 end <= 当前时刻 → 过去（等号也算）；服务端时间缺失 → 不判过去', () => {
    const clock = clockAt('09:30')
    expect(isRoomCellPast('2026-10-12', '09:00', clock)).toBe(true)
    expect(isRoomCellPast('2026-10-12', '09:30', clock)).toBe(true) // 等号也算已过去
    expect(isRoomCellPast('2026-10-12', '10:00', clock)).toBe(false)
    // 服务端时间缺失 / 日期缺失 → 一律不判过去
    expect(isRoomCellPast('2026-10-12', '09:00', null)).toBe(false)
    expect(isRoomCellPast('', '09:00', clock)).toBe(false)
  })

  it('isRoomCellPast：跨天 —— 早于服务端日期 → 过去；晚于 → 未过去', () => {
    const clock = clockAt('09:30')
    expect(isRoomCellPast('2026-10-11', '23:00', clock)).toBe(true)
    expect(isRoomCellPast('2026-10-13', '08:00', clock)).toBe(false)
  })

  it('buildRoomGrid：注入服务端时钟后当日已过去片置灰；无时钟 → 不禁用', () => {
    const grid = buildRoomGrid(room, 2, 60, MONDAY, clockAt('09:30'))
    // 周一 08:00-09:00 已过去（end 09:00 <= 09:30）
    expect(grid.rows[0].cells[0]).toMatchObject({ past: true, available: false })
    // 周一 09:00-10:00 未过去（end 10:00 > 09:30）
    expect(grid.rows[0].cells[1]).toMatchObject({ past: false, available: true })

    // 无服务端时钟 → 不置灰（保持既有行为）
    const plain = buildRoomGrid(room, 2, 60, MONDAY)
    expect(plain.rows[0].cells.every((cell) => cell.past === false)).toBe(true)
    expect(plain.rows[0].cells[0].available).toBe(true)
  })

  it('buildRoomGrid：行以服务端日期为基准（跨天/时区错位时不误判今天）', () => {
    const clock = parseSeatClock('2026-10-13T09:30:00+08:00')
    const grid = buildRoomGrid(room, 2, 60, MONDAY, clock)
    expect(grid.rows.map((row) => row.date)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15'])
  })

  it('resolveRoomServerClock：从响应顶层 / 嵌套 raw 提取；取不到 / 纯时段值 → null', () => {
    expect(resolveRoomServerClock({ serverNow: '2026-10-12T09:30+08:00' })?.clock).toBe('09:30')
    expect(resolveRoomServerClock({ raw: { serverNow: 1792149829247 } })).not.toBeNull()
    expect(resolveRoomServerClock({ raw: {} })).toBeNull()
    expect(resolveRoomServerClock(null)).toBeNull()
    // 纯时段值不能被当成当前时间（parseSeatClock 会拒绝）
    expect(resolveRoomServerClock({ serverNow: '08:00' })).toBeNull()
  })
})

// ── 真实时段 ID + 可约天数（2026-10-19 线上实测后新增） ──

describe('真实时段 ID（reserve/item/setting → commonIntervalMap）', () => {
  /** 实测形态：扁平化后的 intervals（week 1=周一） */
  const SLOTS = [
    { id: 2035233, week: 1, startTime: '08:00', endTime: '09:00', available: 1 },
    { id: 2035236, week: 1, startTime: '11:00', endTime: '12:00', available: 1 },
    { id: 2035237, week: 1, startTime: '12:00', endTime: '13:00', available: 0 },
    { id: 2035239, week: 1, startTime: '14:00', endTime: '15:00', available: 1 }
  ]

  it('normalizeRoomIntervalSlots：字段映射 / 缺失 week 丢弃 / available=0 置不可用', () => {
    // 额外塞一条「无 week」的脏数据，验证被丢弃
    const raw: unknown[] = [...SLOTS, { id: 1, startTime: '08:00' }]
    const slots = normalizeRoomIntervalSlots(raw)
    expect(slots).toHaveLength(4)
    expect(slots[0]).toEqual({
      id: 2035233,
      week: 1,
      start: '08:00',
      end: '09:00',
      available: true,
      userNum: 1
    })
    expect(slots.find((s) => s.id === 2035237)?.available).toBe(false)
    expect(normalizeRoomIntervalSlots('oops')).toEqual([])
    expect(normalizeRoomIntervalSlots(null)).toEqual([])
  })

  it('normalizeRoomIntervalSlots：容量 userNum 原样带出，缺失 / 非法回落 1', () => {
    // #1080：判定「已满」需要容量（`userNum <= 已占用`），绝不放大容量
    const slots = normalizeRoomIntervalSlots([
      { id: 1, week: 1, startTime: '08:00', endTime: '09:00', available: 1, userNum: 3 },
      { id: 2, week: 1, startTime: '09:00', endTime: '10:00', available: 1 },
      { id: 3, week: 1, startTime: '10:00', endTime: '11:00', available: 1, userNum: 0 },
      { id: 4, week: 1, startTime: '11:00', endTime: '12:00', available: 1, userNum: 'oops' }
    ])
    expect(slots.map((s) => s.userNum)).toEqual([3, 1, 1, 1])
  })

  it('resolveRoomIntervalIds：同星期几 + 完整落在区间内 + 仅可用', () => {
    const slots = normalizeRoomIntervalSlots(SLOTS)
    expect(resolveRoomIntervalIds(slots, 1, '11:00', '13:00')).toEqual([2035236])
    // 12:00-13:00 服务端 available=0 → 不得命中
    expect(resolveRoomIntervalIds(slots, 1, '12:00', '13:00')).toEqual([])
    // 连续区间按开始时间排序取多个 ID
    expect(resolveRoomIntervalIds(slots, 1, '08:00', '15:00')).toEqual([2035233, 2035236, 2035239])
    // 星期几不匹配 / 非法时间 / 空区间 → 空
    expect(resolveRoomIntervalIds(slots, 2, '11:00', '12:00')).toEqual([])
    expect(resolveRoomIntervalIds(slots, 1, '', '')).toEqual([])
    expect(resolveRoomIntervalIds(slots, 1, '13:00', '12:00')).toEqual([])
  })

  it('weekdayKeyOfDate：周日映射为 7，非法日期为 0', () => {
    // 2026-10-19 是周一
    expect(weekdayKeyOfDate('2026-10-19')).toBe(1)
    expect(weekdayKeyOfDate('2026-10-22')).toBe(4)
    // 2026-10-25 是周日
    expect(weekdayKeyOfDate('2026-10-25')).toBe(7)
    expect(weekdayKeyOfDate('')).toBe(0)
    expect(weekdayKeyOfDate('2026/10/19')).toBe(0)
  })
})

describe('resolveRoomGridDays：官方 advanceDays + 放号时间规则', () => {
  it('静音仓（00:00，已过）→ advanceDays + 1 天', () => {
    expect(resolveRoomGridDays(3, '00:00', new Date(2026, 9, 19, 10, 12))).toBe(4)
  })

  it('研讨室（22:00，未到）→ advanceDays 天；22:00 后 +1', () => {
    expect(resolveRoomGridDays(3, '22:00', new Date(2026, 9, 19, 10, 12))).toBe(3)
    expect(resolveRoomGridDays(3, '22:00', new Date(2026, 9, 19, 22, 1))).toBe(4)
  })

  it('advanceTime 缺失 / 非法 → 退回 advanceDays（不放大范围）', () => {
    expect(resolveRoomGridDays(3, null)).toBe(3)
    expect(resolveRoomGridDays(3, '')).toBe(3)
    expect(resolveRoomGridDays(3, 'oops')).toBe(3)
    expect(resolveRoomGridDays(0, '00:00')).toBe(1)
  })
})

describe('网格列必须用服务端真实时段（非整点档不能自己切分）', () => {
  // 实测（2026-10-19）：研讨室最后一档服务端配置为 20:00-21:30（1.5 小时）。
  // 若按 timeUnit=60 自己切分，会产出 20:00-21:00 → 提交被拒
  // （「预约时间段与系统设置时间段不一致，请重新选择」）。
  const ROOM = normalizeRoomItem(
    {
      itemId: 50941,
      name: '研讨室2',
      timeUnit: 60,
      intervals: [{ week: 1, available: 1, startTime: '08:00', endTime: '21:30' }]
    },
    0
  )
  const SLOTS = normalizeRoomIntervalSlots([
    { id: 1, week: 1, startTime: '08:00', endTime: '09:00', available: 1 },
    { id: 2, week: 1, startTime: '09:00', endTime: '10:00', available: 1 },
    { id: 3, week: 1, startTime: '20:00', endTime: '21:30', available: 1 }
  ])
  const MON = new Date(2026, 9, 19) // 2026-10-19 周一

  it('列取自 slots：保留 20:00-21:30，且不产生 20:00-21:00 幽灵格', () => {
    const grid = buildRoomGrid(ROOM, 0, 60, MON, null, SLOTS)
    expect(grid.columns.map((c) => c.label)).toEqual(['08:00-09:00', '09:00-10:00', '20:00-21:30'])
    expect(grid.columns.some((c) => c.label === '20:00-21:00')).toBe(false)
    expect(grid.columns.some((c) => c.label === '21:00-21:30')).toBe(false)
  })

  it('无 slots 时回落旧行为（按 timeUnit 切分）', () => {
    const grid = buildRoomGrid(ROOM, 0, 60, MON)
    expect(grid.columns.map((c) => c.label)).toContain('20:00-21:00')
    expect(grid.columns.map((c) => c.label)).not.toContain('20:00-21:30')
  })

  it('单元格可用性逐时段判定（未配置的时段不可点）', () => {
    const grid = buildRoomGrid(ROOM, 0, 60, MON, null, SLOTS)
    const cells = grid.rows[0].cells
    expect(cells.map((c) => c.available)).toEqual([true, true, true])
    // 10:00-11:00 未出现在 slots 中 → 没有该列（而不是可点的空格子）
    expect(cells.some((c) => c.start === '10:00')).toBe(false)
  })

  it('slots 中 available=0 的时段置灰', () => {
    const slots = normalizeRoomIntervalSlots([
      { id: 1, week: 1, startTime: '08:00', endTime: '09:00', available: 0 },
      { id: 2, week: 1, startTime: '09:00', endTime: '10:00', available: 1 }
    ])
    const grid = buildRoomGrid(ROOM, 0, 60, MON, null, slots)
    expect(grid.rows[0].cells.map((c) => c.available)).toEqual([false, true])
  })
})

// ── #1080 实时占用（reserve/item/user/list）：已满 → 不可点；未知 → 不显示为可约 ──

describe('#1080 normalizeRoomOccupancy（占用数据归一化 + 聚合）', () => {
  it('实测样本：按 intervalId_date 聚合 reserveNum，并解析服务端时间', () => {
    // 实测响应（2026-10-19，静音仓 1 号 49091）：同一笔预约跨 3 个时段 → 3 条记录
    const view = normalizeRoomOccupancy({
      success: true,
      records: [
        {
          id: 30031777,
          intervalId: 2035215,
          date: '2026-10-20',
          reserveNum: 1,
          uid: 360838955,
          userName: '廖宏伟'
        },
        {
          id: 30031777,
          intervalId: 2035216,
          date: '2026-10-20',
          reserveNum: 1,
          uid: 360838955,
          userName: '廖宏伟'
        },
        // 同一时段被两个人各占 1 份 → 聚合为 2
        {
          id: 30039465,
          intervalId: 2035215,
          date: '2026-10-20',
          reserveNum: 1,
          uid: 153521321,
          userName: '张舒婷'
        }
      ],
      serverNow: 1792405979859,
      unkeyed: 0
    })
    expect(view.records).toHaveLength(3)
    expect(view.used[roomOccupancyKey(2035215, '2026-10-20')]).toBe(2)
    expect(view.used[roomOccupancyKey(2035216, '2026-10-20')]).toBe(1)
    expect(view.used[roomOccupancyKey(2035215, '2026-10-21')]).toBeUndefined()
    expect(view.unkeyed).toBe(0)
    // serverNow 为 Unix 毫秒 → 服务端墙上时间（北京时间）
    expect(view.clock?.dateKey).toBe('2026-10-19')
    expect(view.clock?.clock).toBe('18:32')
  })

  it('字段缺失 / 非法一律丢弃或按官方兜底（reserveNum 缺失 → 1，绝不按 0 漏算）', () => {
    const view = normalizeRoomOccupancy({
      records: [
        { intervalId: 1, date: '2026-10-20' }, // reserveNum 缺失 → 1
        { intervalId: 2, date: '2026-10-20', reserveNum: 0 }, // 0 → 1（0 会漏算占用）
        { intervalId: 3, date: '2026/10/20' }, // 非法日期 → 丢弃
        { date: '2026-10-20' }, // 缺 intervalId → 丢弃
        null,
        'oops'
      ],
      serverNow: null,
      unkeyed: 2
    })
    expect(view.records.map((r) => r.intervalId)).toEqual([1, 2])
    expect(view.records.every((r) => r.reserveNum === 1)).toBe(true)
    expect(view.used[roomOccupancyKey(1, '2026-10-20')]).toBe(1)
    expect(view.unkeyed).toBe(2)
    // 无 serverNow → 时钟为 null（前端不得自行推断时间）
    expect(view.clock).toBeNull()
  })

  it('响应形态异常 / 缺失 → 空占用，不抛错', () => {
    expect(normalizeRoomOccupancy(null).used).toEqual({})
    expect(normalizeRoomOccupancy('oops').records).toEqual([])
    expect(normalizeRoomOccupancy({ records: 'oops' }).unkeyed).toBe(0)
  })
})

describe('#1080 buildRoomGrid（实时占用合入可用性判定）', () => {
  const MON = new Date(2026, 9, 19) // 2026-10-19 周一
  const ROOM = normalizeRoomItem(
    { itemId: 49091, name: '1号静音仓', intervals: [{ week: 1, available: 1, startTime: '08:00', endTime: '11:00' }] },
    0
  )
  const SLOTS = normalizeRoomIntervalSlots([
    { id: 2035233, week: 1, startTime: '08:00', endTime: '09:00', available: 1, userNum: 1 },
    { id: 2035234, week: 1, startTime: '09:00', endTime: '10:00', available: 1, userNum: 1 },
    { id: 2035235, week: 1, startTime: '10:00', endTime: '11:00', available: 1, userNum: 2 }
  ])

  it('已满 → 不可点（occupied）；容量未满 → 仍可约', () => {
    const grid = buildRoomGrid(ROOM, 0, 60, MON, null, SLOTS, {
      [roomOccupancyKey(2035233, '2026-10-19')]: 1,
      [roomOccupancyKey(2035235, '2026-10-19')]: 1
    })
    const cells = grid.rows[0].cells
    // 08:00-09:00 容量 1 已被占 1 份 → 已满
    expect(cells[0]).toMatchObject({ occupied: true, available: false, unknown: false })
    // 09:00-10:00 无人预约 → 可约
    expect(cells[1]).toMatchObject({ occupied: false, available: true })
    // 10:00-11:00 容量 2 仅占 1 份 → 仍可约
    expect(cells[2]).toMatchObject({ occupied: false, available: true })
    // 已满必须给出可点提示的语义：不是 unknown，也不是 past
    expect(cells[0].past).toBe(false)
  })

  it('容量 2 被占 2 份 → 已满；其它日期不受影响（按日期分别判定）', () => {
    const grid = buildRoomGrid(ROOM, 1, 60, MON, null, SLOTS, {
      [roomOccupancyKey(2035235, '2026-10-19')]: 2
    })
    expect(grid.rows[0].cells[2]).toMatchObject({ occupied: true, available: false })
    // 2026-10-20 是周二（无配置）→ 整行不可约，与占用无关
    expect(grid.rows[1].disabled).toBe(true)
  })

  it('占用未知（occupancyKnown=false）→ 一律不可点且标记 unknown（绝不显示为可约）', () => {
    const grid = buildRoomGrid(ROOM, 0, 60, MON, null, SLOTS, {}, false)
    expect(grid.rows[0].cells.every((cell) => cell.available === false)).toBe(true)
    expect(grid.rows[0].cells.every((cell) => cell.unknown === true)).toBe(true)
    expect(grid.rows[0].cells.every((cell) => cell.occupied === false)).toBe(true)
    expect(grid.rows[0].disabled).toBe(true)
  })

  it('未传占用（默认）保持既有行为：不引入「默认已满」回归', () => {
    const grid = buildRoomGrid(ROOM, 0, 60, MON, null, SLOTS)
    expect(grid.rows[0].cells.every((cell) => cell.available)).toBe(true)
    expect(grid.rows[0].cells.every((cell) => cell.unknown === false)).toBe(true)
  })
})
