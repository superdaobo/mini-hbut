// src/utils/widget_snapshot_week_anchor.spec.ts
// #759：resolveWeekIndexFromAnchor（开学日期锚点推算当前周次）纯函数单测
//
// 语义约定（与课表 week_index 契约一致）：
// - 第 1 周 = start_date 起始的 7 天
// - 今天早于开学日（未开学）→ 0（调用方回退缓存周次）
// - 结果钳制到 [1, totalWeeks]

import { describe, expect, it } from 'vitest'
import { resolveWeekIndexFromAnchor } from './widget_snapshot'

/** 构造一个 Asia/Shanghai 下确定日期的时刻（避免测试机器本地时区影响） */
const sh = (isoCst: string): Date => new Date(isoCst)

describe('resolveWeekIndexFromAnchor', () => {
  it('开学当天 → 第 1 周', () => {
    const now = sh('2026-03-02T08:00:00+08:00') // 2026-03-02（周一）开学日当天
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 25)).toBe(1)
  })

  it('开学后第 6 天（第 1 周内）→ 第 1 周', () => {
    const now = sh('2026-03-08T23:30:00+08:00')
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 25)).toBe(1)
  })

  it('开学后第 7 天（新一周开始）→ 第 2 周', () => {
    const now = sh('2026-03-09T00:01:00+08:00')
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 25)).toBe(2)
  })

  it('#759 跨天定时器场景：周一凌晨 00:01 周次从 N 推进到 N+1', () => {
    // 第 5 周周日 23:59 仍是第 5 周；00:01 进入第 6 周
    const start = '2026-02-23'
    expect(resolveWeekIndexFromAnchor(start, sh('2026-03-29T23:59:00+08:00'), 25)).toBe(5)
    expect(resolveWeekIndexFromAnchor(start, sh('2026-03-30T00:01:00+08:00'), 25)).toBe(6)
  })

  it('多周跨度推算正确（手机长期未打开 App 后）', () => {
    const now = sh('2026-05-04T12:00:00+08:00') // 开学后 63 天 = 第 10 周
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 25)).toBe(10)
  })

  it('未开学（今天早于开学日）→ 0，由调用方回退', () => {
    const now = sh('2026-02-20T12:00:00+08:00')
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 25)).toBe(0)
  })

  it('超过 totalWeeks 时钳制到上限', () => {
    const now = sh('2026-12-01T12:00:00+08:00') // 远超 25 周
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 25)).toBe(25)
  })

  it('start_date 非法（空串/格式错误）→ 0', () => {
    const now = sh('2026-03-05T12:00:00+08:00')
    expect(resolveWeekIndexFromAnchor('', now, 25)).toBe(0)
    expect(resolveWeekIndexFromAnchor('2026/03/02', now, 25)).toBe(0)
    expect(resolveWeekIndexFromAnchor('not-a-date', now, 25)).toBe(0)
  })

  it('totalWeeks 缺省/非法时按 25 处理', () => {
    const now = sh('2026-05-04T12:00:00+08:00') // 第 10 周
    expect(resolveWeekIndexFromAnchor('2026-03-02', now)).toBe(10)
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, Number.NaN)).toBe(10)
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 0)).toBe(10)
  })

  it('now 的 Asia/Shanghai 日期与本地时区无关（UTC+8 换日边界）', () => {
    // 同一时刻：UTC 2026-03-08T16:01:00Z = 上海 2026-03-09T00:01:00 → 第 2 周；
    // 若误用 UTC 日期（03-08）会得到第 1 周
    const now = sh('2026-03-08T16:01:00Z')
    expect(resolveWeekIndexFromAnchor('2026-03-02', now, 25)).toBe(2)
  })
})
