/**
 * 座位预约领域层单测（#1057）
 *
 * 重点看守两件事：
 * 1. **服务端时间解析与运行设备时区无关**（否则开放判断会错位）；
 * 2. 契约未实测处（预约条目字段名、各日时段不一致）必须**留空 / 返回 unknown**，
 *    不得编造推断结果。
 */
import { describe, expect, it } from 'vitest'
import {
  buildSeatTimeCells,
  buildSeatTimeSlices,
  isSeatCellPast,
  normalizeSeatConfig,
  normalizeSeatLevels,
  normalizeSeatMatch,
  normalizeSeatPrepare,
  normalizeSeatReservation,
  normalizeSeatReservations,
  offsetMsToHm,
  parseSeatClock,
  resolveOpenHourRows,
  resolveOpenState,
  resolveReleaseState,
  resolveSeatDefaultSelection,
  resolveSeatSubmitParams,
  resolveSeatTimeCellClick,
  resolveTodayOpenRange,
  seatCellState,
  seatMatchAreaText,
  seatMatchTimeText,
  seatMsToServerDate,
  seatMsToServerHm,
  seatReservationTime,
  seatSelectionRangeText
} from './seatCatalog'

/** 勘察实测样本（`seatengine/index` 摘要，issue #1054 实测表） */
const RECON_CONFIG = {
  seatId: 3597,
  deptId: 25285,
  name: '座位预约',
  reserveBeforeDay: 1,
  reserveBeforeTime: '08:00',
  reserveDuration: 4,
  reserveNumLimit: 1,
  timeUnit: 60,
  violateTimes: 3,
  violationLimitDay: 7,
  violationLimitDuration: 3,
  noticeName: '试运规则说明',
  noticeContent: '<p>1. 按预约的座位号就坐和使用。</p>',
  onlySupportsApiSignIn: true,
  commonTimeConfig: {
    days: [
      { day: '周一', start: '08:00', end: '22:00' },
      { day: '周二', start: '08:00', end: '22:00' }
    ],
    raw: {
      monStartTime: '08:00',
      monEndTime: '22:00',
      tueStartTime: '08:00',
      tueEndTime: '22:00'
    }
  }
}

describe('parseSeatClock（服务端时间，与设备时区无关）', () => {
  it('按字符串自带字面量取服务端墙上时间', () => {
    // 勘察原文：serverNow = new Date('2026-10-15T23:31:03.073+08:00')
    const clock = parseSeatClock('2026-10-15T23:31:03.073+08:00')
    expect(clock).toEqual({
      dateKey: '2026-10-15',
      clock: '23:31',
      minutes: 23 * 60 + 31,
      weekday: 4 // 2026-10-15 是周四
    })
  })

  it('兼容空格分隔与斜杠日期形态', () => {
    expect(parseSeatClock('2026-10-15 08:05')?.clock).toBe('08:05')
    expect(parseSeatClock('2026/10/15 08:05')?.clock).toBe('08:05')
    expect(parseSeatClock('2026/10/15 08:05')?.dateKey).toBe('2026-10-15')
  })

  it('Unix 时间戳按服务端 UTC+8 换算', () => {
    // 1792078263 = 2026-10-15T15:31:03Z = 服务端（+08:00）2026-10-15 23:31
    expect(parseSeatClock('1792078263')).toEqual({
      dateKey: '2026-10-15',
      clock: '23:31',
      minutes: 23 * 60 + 31,
      weekday: 4
    })
    // 毫秒形态结果一致
    expect(parseSeatClock('1792078263000')?.clock).toBe('23:31')
  })

  it('拒绝时段值 / 空值 / 越界值（宁可不说，不要说错）', () => {
    expect(parseSeatClock('08:00')).toBeNull() // 时段字段，不是当前时间
    expect(parseSeatClock('22:00')).toBeNull()
    expect(parseSeatClock('')).toBeNull()
    expect(parseSeatClock(null)).toBeNull()
    expect(parseSeatClock(undefined)).toBeNull()
    expect(parseSeatClock('123')).toBeNull()
    expect(parseSeatClock('TEST')).toBeNull()
    // 越界：不纠正、不猜测
    expect(parseSeatClock('2026-13-45 08:00')).toBeNull()
    expect(parseSeatClock('2026-10-15 25:00')).toBeNull()
  })
})

describe('开放 / 放号状态（全部基于服务端时钟）', () => {
  const range = { start: '08:00', end: '22:00' }

  it('开放状态三态 + 未知', () => {
    expect(resolveOpenState(parseSeatClock('2026-10-15T07:59+08:00'), range)).toBe('before')
    expect(resolveOpenState(parseSeatClock('2026-10-15T08:00+08:00'), range)).toBe('open')
    expect(resolveOpenState(parseSeatClock('2026-10-15T21:59+08:00'), range)).toBe('open')
    // 到达结束时刻即视为已闭馆
    expect(resolveOpenState(parseSeatClock('2026-10-15T22:00+08:00'), range)).toBe('after')
    // 服务端时间缺失 / 时段缺失 → unknown，绝不回落到本地时间
    expect(resolveOpenState(null, range)).toBe('unknown')
    expect(resolveOpenState(parseSeatClock('2026-10-15T09:00+08:00'), null)).toBe('unknown')
    expect(resolveOpenState(parseSeatClock('2026-10-15T09:00+08:00'), { start: '', end: '' })).toBe(
      'unknown'
    )
  })

  it('单侧缺失时按该侧无限制处理', () => {
    expect(resolveOpenState(parseSeatClock('2026-10-15T06:00+08:00'), { start: '', end: '22:00' })).toBe(
      'open'
    )
    expect(resolveOpenState(parseSeatClock('2026-10-15T23:00+08:00'), { start: '08:00', end: '' })).toBe(
      'open'
    )
  })

  it('放号状态：08:00 前未放号、08:00 起已放号', () => {
    expect(resolveReleaseState(parseSeatClock('2026-10-15T07:59+08:00'), '08:00')).toBe('pending')
    expect(resolveReleaseState(parseSeatClock('2026-10-15T08:00+08:00'), '08:00')).toBe('released')
    expect(resolveReleaseState(parseSeatClock('2026-10-15T23:31+08:00'), '08:00')).toBe('released')
    // 放号时间缺失 / 服务端时间缺失 → unknown
    expect(resolveReleaseState(parseSeatClock('2026-10-15T23:31+08:00'), '')).toBe('unknown')
    expect(resolveReleaseState(null, '08:00')).toBe('unknown')
  })
})

describe('resolveTodayOpenRange（今日开放时段）', () => {
  const config = normalizeSeatConfig(RECON_CONFIG)

  it('优先取 commonTimeConfig.raw 的当日星期前缀键', () => {
    // 2026-10-15 是周四 → thu 前缀
    const raw = {
      monStartTime: '08:00',
      monEndTime: '21:00',
      thuStartTime: '09:00',
      thuEndTime: '18:00'
    }
    const clock = parseSeatClock('2026-10-15T23:31+08:00')
    expect(resolveTodayOpenRange({ ...config, commonTimeConfig: { days: [], raw } }, clock)).toEqual({
      start: '09:00',
      end: '18:00'
    })
  })

  it('只有单一时段（每日）时直接采用', () => {
    const single = { days: [{ day: '每日', start: '08:00', end: '21:00' }], raw: {} }
    const clock = parseSeatClock('2026-10-15T09:00+08:00')
    expect(resolveTodayOpenRange({ ...config, commonTimeConfig: single }, clock)).toEqual({
      start: '08:00',
      end: '21:00'
    })
  })

  it('多日时段一致时采用；不一致且无前缀键 → null（不猜测）', () => {
    const clock = parseSeatClock('2026-10-15T09:00+08:00')
    const uniform = {
      days: [
        { day: '周一', start: '08:00', end: '22:00' },
        { day: '周二', start: '08:00', end: '22:00' }
      ],
      raw: {}
    }
    expect(resolveTodayOpenRange({ ...config, commonTimeConfig: uniform }, clock)).toEqual({
      start: '08:00',
      end: '22:00'
    })

    const varied = {
      days: [
        { day: '周一', start: '08:00', end: '22:00' },
        { day: '周六', start: '10:00', end: '16:00' }
      ],
      raw: {}
    }
    expect(resolveTodayOpenRange({ ...config, commonTimeConfig: varied }, clock)).toBeNull()
  })

  it('缺服务端时间 / 缺时段配置 → null', () => {
    expect(resolveTodayOpenRange(config, null)).toBeNull()
    expect(
      resolveTodayOpenRange({ ...config, commonTimeConfig: null }, parseSeatClock('2026-10-15T09:00+08:00'))
    ).toBeNull()
  })
})

describe('normalizeSeatConfig', () => {
  it('解析勘察实测字段', () => {
    const config = normalizeSeatConfig(RECON_CONFIG)
    expect(config.seatId).toBe(3597)
    expect(config.reserveBeforeDay).toBe(1)
    expect(config.reserveBeforeTime).toBe('08:00')
    expect(config.reserveDuration).toBe(4)
    expect(config.reserveNumLimit).toBe(1)
    expect(config.timeUnit).toBe(60)
    expect(config.violateTimes).toBe(3)
    expect(config.violationLimitDay).toBe(7)
    expect(config.violationLimitDuration).toBe(3)
    expect(config.onlySupportsApiSignIn).toBe(true)
    expect(config.noticeName).toBe('试运规则说明')
    expect(config.noticeContent).toContain('座位号')
    expect(config.commonTimeConfig?.days).toEqual([
      { day: '周一', start: '08:00', end: '22:00' },
      { day: '周二', start: '08:00', end: '22:00' }
    ])
  })

  it('兼容数字 / 布尔字符串，缺失字段一律留空', () => {
    const config = normalizeSeatConfig({
      reserveBeforeDay: '1',
      reserveDuration: '4',
      onlySupportsApiSignIn: 'true'
    })
    expect(config.reserveBeforeDay).toBe(1)
    expect(config.reserveDuration).toBe(4)
    expect(config.onlySupportsApiSignIn).toBe(true)
    expect(config.reserveNumLimit).toBeNull()
    expect(config.reserveBeforeTime).toBe('')
    expect(config.commonTimeConfig).toBeNull()
  })

  it('#1082 allowReserveNow：从透传的 config.raw 提取（本馆实测 0）；缺失 → null（不猜）', () => {
    // 0 是有效值（不允许预约当前时段），不得被 ?? 当空值吞掉
    expect(normalizeSeatConfig({ raw: { allowReserveNow: 0 } }).allowReserveNow).toBe(0)
    // 兼容后端后续提升为归一化字段（顶层同名键兜底）
    expect(normalizeSeatConfig({ allowReserveNow: '1' }).allowReserveNow).toBe(1)
    expect(normalizeSeatConfig({}).allowReserveNow).toBeNull()
    expect(normalizeSeatConfig(RECON_CONFIG).allowReserveNow).toBeNull()
  })

  it('异常形态不抛错', () => {
    for (const input of [null, undefined, 'x', 42, []]) {
      const config = normalizeSeatConfig(input)
      expect(config.seatId).toBeNull()
      expect(config.noticeContent).toBe('')
      expect(config.commonTimeConfig).toBeNull()
    }
    // days 非数组 / 元素非对象：降级为空列表而不是崩溃
    const config = normalizeSeatConfig({ commonTimeConfig: { days: 'oops', raw: null } })
    expect(config.commonTimeConfig?.days).toEqual([])
  })
})

describe('resolveOpenHourRows（每日开放时段展示行）', () => {
  it('优先用英文星期前缀键，并按周一…周日排序', () => {
    const config = normalizeSeatConfig({
      commonTimeConfig: {
        days: [],
        raw: {
          sunStartTime: '10:00',
          sunEndTime: '16:00',
          monStartTime: '08:00',
          monEndTime: '22:00'
        }
      }
    })
    const rows = resolveOpenHourRows(config)
    // 周一（1）在周日（0）之前；weekday 交由组件映射 i18n 星期名
    expect(rows.map((row) => [row.weekday, row.start, row.end])).toEqual([
      [1, '08:00', '22:00'],
      [0, '10:00', '16:00']
    ])
    expect(rows.every((row) => row.label === '')).toBe(true)
  })

  it('无星期前缀键时回落服务端归一化的 days（保留原文星期名）', () => {
    const config = normalizeSeatConfig({
      commonTimeConfig: {
        days: [{ day: '每日', start: '08:00', end: '21:00' }],
        raw: { startTime: '08:00', endTime: '21:00' }
      }
    })
    expect(resolveOpenHourRows(config)).toEqual([
      { key: 'day-0', weekday: null, label: '每日', start: '08:00', end: '21:00' }
    ])
  })

  it('两类来源都缺失 → 空数组（组件据此不展示该行）', () => {
    expect(resolveOpenHourRows(null)).toEqual([])
    expect(resolveOpenHourRows(normalizeSeatConfig({}))).toEqual([])
    expect(
      resolveOpenHourRows(normalizeSeatConfig({ commonTimeConfig: { days: [], raw: {} } }))
    ).toEqual([])
  })
})

describe('预约记录归一化', () => {
  it('按 Rust 侧字段名解析（best-effort）', () => {
    const row = normalizeSeatReservation(
      {
        id: 1,
        seatNo: 'A-01',
        roomName: '四楼东区',
        date: '2026-10-16',
        startTime: '08:00',
        endTime: '12:00',
        statusName: '已预约'
      },
      0
    )
    expect(row).toMatchObject({
      id: '1',
      seatNo: 'A-01',
      roomName: '四楼东区',
      date: '2026-10-16',
      start: '08:00',
      end: '12:00',
      statusName: '已预约'
    })
    expect(seatReservationTime(row)).toBe('08:00-12:00')
  })

  it('字段缺失时留空（不编造）', () => {
    const row = normalizeSeatReservation({}, 3)
    expect(row.id).toBe('')
    expect(row.seatNo).toBe('')
    expect(row.roomName).toBe('')
    expect(row.date).toBe('')
    expect(seatReservationTime(row)).toBe('')
    expect(row.key).toBe('seat-row-3')
  })

  it('列表排序：缺失日期排末尾，非数组回落空列表', () => {
    const rows = normalizeSeatReservations([
      { id: 2, date: '2026-10-17', startTime: '13:00' },
      { id: 1, date: '2026-10-16', startTime: '08:00' },
      { id: 3 }
    ])
    expect(rows.map((row) => row.id)).toEqual(['1', '2', '3'])
    expect(normalizeSeatReservations('oops')).toEqual([])
    expect(normalizeSeatReservations(null)).toEqual([])
  })
})

describe('#1080 余量查询领域层（levels / 时间切片 / 座位匹配）', () => {
  it('offsetMsToHm：Unix 毫秒按 +08 换算（官方页实测 0→08:00 / 50400000→22:00）', () => {
    expect(offsetMsToHm(0)).toBe('08:00')
    expect(offsetMsToHm(50400000)).toBe('22:00')
    expect(offsetMsToHm(3600000)).toBe('09:00')
    expect(offsetMsToHm(-1)).toBe('')
    expect(offsetMsToHm('oops')).toBe('')
  })

  it('seatMsToServerHm：Unix 毫秒按服务端 UTC+8 换算（实测样本）', () => {
    // 1792112400000 = 2026-10-16 09:00（UTC+8）
    expect(seatMsToServerHm(1792112400000)).toBe('09:00')
    // 1792152000000 = 2026-10-16 20:00（UTC+8）
    expect(seatMsToServerHm(1792152000000)).toBe('20:00')
    expect(seatMsToServerHm(0)).toBe('')
    expect(seatMsToServerHm(null)).toBe('')
    expect(seatMsToServerHm('oops')).toBe('')
  })

  it('buildSeatTimeSlices：按 timeUnit 切片；timeUnit / 区间非法时安全降级', () => {
    const slices = buildSeatTimeSlices(0, 50400000, 60)
    expect(slices).toHaveLength(15) // 08:00 … 22:00，每小时一片（= 官方页 14 个时段）
    expect(slices[0]).toEqual({ offsetMs: 0, label: '08:00' })
    expect(slices[slices.length - 1]).toEqual({ offsetMs: 50400000, label: '22:00' })
    // timeUnit 非法 → 回落 60
    expect(buildSeatTimeSlices(0, 3600000, 0)).toHaveLength(2)
    // 区间非法 → 单点，绝不返回空列表
    expect(buildSeatTimeSlices(0, -5, 60)).toEqual([{ offsetMs: 0, label: '08:00' }])
  })

  it('resolveSeatDefaultSelection：跳过已过去时间片，始终 start < end', () => {
    const slices = buildSeatTimeSlices(0, 50400000, 60) // 08:00 … 22:00
    const cells = buildSeatTimeCells(slices)
    const DAY = '2026-10-15'
    const clockAt = (hm: string) => parseSeatClock(`${DAY}T${hm}:00+08:00`)

    // 09:30 时：09:00-10:00（end 10:00 > 09:30）为第一个可点片 → 起点；默认跨 2 片
    const selection = resolveSeatDefaultSelection(cells, clockAt('09:30'), null, DAY)
    expect(seatSelectionRangeText(slices, selection)).toBe('09:00-11:00')
    expect(selection?.startIndex ?? -1).toBeLessThan(selection?.endIndex ?? 0)

    // 全部时间片都已过去 → null（调用方给出「今日已无可约时段」提示）
    expect(resolveSeatDefaultSelection(cells, clockAt('23:00'), null, DAY)).toBeNull()

    // 无服务端时钟 → 不禁用任何片，与既有默认窗口一致（08:00-10:00）
    expect(
      seatSelectionRangeText(slices, resolveSeatDefaultSelection(cells, null, null, DAY))
    ).toBe('08:00-10:00')

    // 无时间片 → null
    expect(resolveSeatDefaultSelection([], clockAt('09:30'), null, DAY)).toBeNull()
  })

  it('#1082 已过去时间片：end <= 当前时刻（等号也置灰）；allowReserveNow=0 时起点 <= 当前时刻也置灰', () => {
    const cells = buildSeatTimeCells(buildSeatTimeSlices(0, 50400000, 60))
    const DAY = '2026-10-15'
    const clockAt = (hm: string) => parseSeatClock(`${DAY}T${hm}:00+08:00`)

    // 10:00 时：08:00-09:00 / 09:00-10:00（end == now）都置灰；10:00-11:00 可点
    const clock = clockAt('10:00')
    expect(isSeatCellPast(cells[0], clock, null, DAY)).toBe(true)
    expect(isSeatCellPast(cells[1], clock, null, DAY)).toBe(true)
    expect(isSeatCellPast(cells[2], clock, null, DAY)).toBe(false)

    // allowReserveNow=0：10:30 时 10:00-11:00 起点已到 → 置灰；取不到（null）则不启用该规则
    const half = clockAt('10:30')
    expect(isSeatCellPast(cells[2], half, 0, DAY)).toBe(true)
    expect(isSeatCellPast(cells[2], half, null, DAY)).toBe(false)
    expect(isSeatCellPast(cells[2], half, 1, DAY)).toBe(false)
    // 未来片任何情况下都未过去
    expect(isSeatCellPast(cells[3], half, 0, DAY)).toBe(false)
  })

  it('#1082 服务端时间缺失 → 一律未过去（不猜本地时间）；跨天按日期比较', () => {
    const cells = buildSeatTimeCells(buildSeatTimeSlices(0, 50400000, 60))
    const clock = parseSeatClock('2026-10-15T10:00:00+08:00')

    // 服务端时间缺失：即使 allowReserveNow=0 也不禁用
    expect(isSeatCellPast(cells[0], null, 0, '2026-10-15')).toBe(false)

    // 跨天：网格日期早于服务端日期 → 全部过去；晚于 → 全部未过去
    expect(isSeatCellPast(cells[2], clock, null, '2026-10-14')).toBe(true)
    expect(isSeatCellPast(cells[2], clock, null, '2026-10-16')).toBe(false)
    // 日期缺失 → 退化为按当日分钟比较
    expect(isSeatCellPast(cells[0], clock, null, '')).toBe(true)
  })

  it('normalizeSeatLevels：去空白 / 去空项 / 去重，非数组回落空列表', () => {
    expect(normalizeSeatLevels({ levels: [' 四楼D区 ', '', '四楼D区', '二楼A区'] })).toEqual([
      '四楼D区',
      '二楼A区'
    ])
    expect(normalizeSeatLevels(null)).toEqual([])
    expect(normalizeSeatLevels({ levels: 'oops' })).toEqual([])
  })

  it('normalizeSeatMatch：解析 match（区域 / 座位号 / 时段）；缺失回落 null', () => {
    const match = normalizeSeatMatch({
      match: {
        roomId: 10892,
        seatNum: '016',
        firstLevelName: '四楼D区（有插座）',
        startTimeMs: 1792152000000,
        endTimeMs: 1792155600000,
        duration: '1.0'
      }
    })
    expect(match).not.toBeNull()
    expect(match?.roomId).toBe('10892')
    expect(match?.seatNum).toBe('016')
    expect(match?.duration).toBe('1.0')
    expect(seatMatchAreaText(match)).toBe('四楼D区（有插座）')
    expect(seatMatchTimeText(match)).toBe('20:00-21:00')
    // 无可用座位：match 缺失 / 非对象
    expect(normalizeSeatMatch({})).toBeNull()
    expect(normalizeSeatMatch(null)).toBeNull()
    expect(normalizeSeatMatch({ match: 'oops' })).toBeNull()
    expect(seatMatchAreaText(null)).toBe('')
  })
})

describe('#1081 可视化时间片网格（替代下拉选起止）', () => {
  const slices = buildSeatTimeSlices(0, 50400000, 60) // 08:00 … 22:00

  it('buildSeatTimeCells：相邻时刻点两两成格（08:00-09:00 … 21:00-22:00）', () => {
    const cells = buildSeatTimeCells(slices)
    expect(cells).toHaveLength(14) // 15 个时刻点 → 14 个时间片（= 官方页时段数）
    expect(cells[0]).toEqual({
      startIndex: 0,
      endIndex: 1,
      start: '08:00',
      end: '09:00',
      label: '08:00-09:00'
    })
    expect(cells[cells.length - 1].label).toBe('21:00-22:00')
    // 标签缺失的切片不产出无法展示 / 无法提交的格子
    expect(buildSeatTimeCells([{ offsetMs: 0, label: '' }, { offsetMs: 1, label: '09:00' }])).toEqual([])
    expect(buildSeatTimeCells([])).toEqual([])
  })

  it('resolveSeatTimeCellClick：起点 → 终点 → 再点起点取消', () => {
    // 未选择 → 以该格为起点（单格区间）
    const first = resolveSeatTimeCellClick(null, 2)
    expect(first).toEqual({ startIndex: 2, endIndex: 3 })
    // 点后面的格子 → 连选成区间
    expect(resolveSeatTimeCellClick(first, 5)).toEqual({ startIndex: 2, endIndex: 6 })
    // 点区间内部的格子 → 收缩终点
    expect(resolveSeatTimeCellClick({ startIndex: 2, endIndex: 6 }, 3)).toEqual({
      startIndex: 2,
      endIndex: 4
    })
    // 点起点之前的格子 → 重新起锚（不反向延长）
    expect(resolveSeatTimeCellClick({ startIndex: 2, endIndex: 6 }, 0)).toEqual({
      startIndex: 0,
      endIndex: 1
    })
    // 点已选起点 → 取消
    expect(resolveSeatTimeCellClick({ startIndex: 2, endIndex: 6 }, 2)).toBeNull()
    // 非法下标 → 保持原选择（不抛错、不产生空区间）
    expect(resolveSeatTimeCellClick(first, Number.NaN)).toEqual(first)
    expect(resolveSeatTimeCellClick(first, -1)).toEqual(first)
  })

  it('选中态：anchor 起点 / on 区间内 / off 未选中；区间文案取切片标签', () => {
    const cells = buildSeatTimeCells(slices)
    const selection = { startIndex: 1, endIndex: 3 }
    expect(seatCellState(cells[1], selection)).toBe('anchor')
    expect(seatCellState(cells[2], selection)).toBe('on')
    expect(seatCellState(cells[3], selection)).toBe('off')
    expect(seatCellState(cells[1], null)).toBe('off')
    expect(seatSelectionRangeText(slices, selection)).toBe('09:00-11:00')
    expect(seatSelectionRangeText(slices, null)).toBe('')
    // 越界不编造
    expect(seatSelectionRangeText(slices, { startIndex: 0, endIndex: 99 })).toBe('')
  })
})

describe('#1081 本机提交参数与 prepare 归一化', () => {
  it('seatMsToServerDate：按服务端 UTC+8 取日期（与 seatMsToServerHm 同源）', () => {
    // 1792112400000 = 2026-10-16 09:00（UTC+8）
    expect(seatMsToServerDate(1792112400000)).toBe('2026-10-16')
    expect(seatMsToServerDate(0)).toBe('')
    expect(seatMsToServerDate(null)).toBe('')
    expect(seatMsToServerDate('oops')).toBe('')
  })

  it('normalizeSeatPrepare：验证码图 + submitEnc + wfwEngineEnc（从 raw 兜底提取）', () => {
    const view = normalizeSeatPrepare({
      captchaUrl: 'data:image/png;base64,AAA',
      submitEnc: 'ENC-1',
      wfwEngineEnc: 'WFW-1'
    })
    expect(view.captchaUrl).toBe('data:image/png;base64,AAA')
    expect(view.submitEnc).toBe('ENC-1')
    expect(view.wfwEngineEnc).toBe('WFW-1')

    // 官方页命名变体（wfwEnc）也能取到
    expect(normalizeSeatPrepare({ wfwEnc: 'WFW-2' }).wfwEngineEnc).toBe('WFW-2')
    // 缺失一律空串（风控关闭时官方页同样传空串），不抛错
    const empty = normalizeSeatPrepare(null)
    expect(empty).toEqual({ captchaUrl: '', submitEnc: '', wfwEngineEnc: '', raw: {} })
  })

  it('resolveSeatSubmitParams：优先取匹配结果的服务端毫秒（与官方 doSubmit 一致）', () => {
    const match = normalizeSeatMatch({
      match: { roomId: 10892, seatNum: '016', startTimeMs: 1792152000000, endTimeMs: 1792155600000 }
    })
    expect(resolveSeatSubmitParams(match, '2026-10-16', '20:00', '21:00')).toEqual({
      roomId: 10892,
      seatNum: '016',
      startTime: '20:00',
      endTime: '21:00',
      day: '2026-10-16'
    })
  })

  it('resolveSeatSubmitParams：roomId 必须是数字（字符串会被 Rust i64 拒绝）', () => {
    // 实测报错：invalid type: string "13248", expected i64
    const match = normalizeSeatMatch({ match: { roomId: 13248, seatNum: '238' } })
    const params = resolveSeatSubmitParams(match, '2026-10-19', '12:00', '14:00')
    expect(params).not.toBeNull()
    expect(typeof params?.roomId).toBe('number')
    expect(params?.roomId).toBe(13248)
  })

  it('resolveSeatSubmitParams：roomId 非法（非数字 / 0 / 负数 / 小数）→ null', () => {
    for (const bad of ['abc', '', '0', '-1', '12.5', null, undefined]) {
      const match = normalizeSeatMatch({ match: { roomId: bad, seatNum: '016' } })
      expect(resolveSeatSubmitParams(match, '2026-10-16', '09:00', '11:00'), String(bad)).toBeNull()
    }
  })

  it('resolveSeatSubmitParams：毫秒缺失时回落所选时间片 + ymd', () => {
    const match = normalizeSeatMatch({ match: { roomId: 10892, seatNum: '016' } })
    expect(resolveSeatSubmitParams(match, '2026-10-16', '09:00', '11:00')).toEqual({
      roomId: 10892,
      seatNum: '016',
      startTime: '09:00',
      endTime: '11:00',
      day: '2026-10-16'
    })
  })

  it('resolveSeatSubmitParams：关键字段缺失 → null（宁可不提交，不猜）', () => {
    expect(resolveSeatSubmitParams(null, '2026-10-16', '09:00', '11:00')).toBeNull()
    // 无座位号
    const noSeat = normalizeSeatMatch({ match: { roomId: 10892 } })
    expect(resolveSeatSubmitParams(noSeat, '2026-10-16', '09:00', '11:00')).toBeNull()
    // 无 roomId
    const noRoom = normalizeSeatMatch({ match: { seatNum: '016' } })
    expect(resolveSeatSubmitParams(noRoom, '2026-10-16', '09:00', '11:00')).toBeNull()
    // 时间 / 日期都取不到
    const bare = normalizeSeatMatch({ match: { roomId: 10892, seatNum: '016' } })
    expect(resolveSeatSubmitParams(bare, '', '', '')).toBeNull()
  })
})
