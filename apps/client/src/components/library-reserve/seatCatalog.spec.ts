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
  normalizeSeatConfig,
  normalizeSeatReservation,
  normalizeSeatReservations,
  parseSeatClock,
  resolveOpenHourRows,
  resolveOpenState,
  resolveReleaseState,
  resolveTodayOpenRange,
  seatReservationTime
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
