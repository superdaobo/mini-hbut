/**
 * #1322 resolveWeekOfToday 纯函数回归：
 * 学期内周次计算 / 开学前后边界 / 非法开学日 / 非法总周数。
 */
import { describe, expect, it } from 'vitest'
import { resolveWeekOfToday } from './weeks'

/** 本地时区构造日期（避免 ISO 字符串的 UTC 解析歧义） */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d)

const START = '2026-09-02'

describe('resolveWeekOfToday', () => {
  it('开学第 1 天 = 1', () => {
    expect(resolveWeekOfToday(START, 20, at(2026, 9, 2))).toBe(1)
  })

  it('开学第 7 天（同一教学周最后一天）= 1', () => {
    expect(resolveWeekOfToday(START, 20, at(2026, 9, 8))).toBe(1)
  })

  it('开学第 8 天 = 2', () => {
    expect(resolveWeekOfToday(START, 20, at(2026, 9, 9))).toBe(2)
  })

  it('开学前一天 = 0', () => {
    expect(resolveWeekOfToday(START, 20, at(2026, 9, 1))).toBe(0)
  })

  it('学期最后一天 = totalWeeks，再下一天 = 0', () => {
    // 2026-09-02 + 139 天 = 第 140 天 = 第 20 周最后一天
    expect(resolveWeekOfToday(START, 20, at(2027, 1, 19))).toBe(20)
    // 超过 totalWeeks（第 141 天，第 21 周）
    expect(resolveWeekOfToday(START, 20, at(2027, 1, 20))).toBe(0)
  })

  it('开学日非法（空串 / 非补零格式 / 乱码）= 0', () => {
    expect(resolveWeekOfToday('', 20, at(2026, 9, 2))).toBe(0)
    expect(resolveWeekOfToday('2026-9-2', 20, at(2026, 9, 2))).toBe(0)
    expect(resolveWeekOfToday('abc', 20, at(2026, 9, 2))).toBe(0)
  })

  it('溢出日期（2026-02-31）= 0', () => {
    expect(resolveWeekOfToday('2026-02-31', 20, at(2026, 3, 3))).toBe(0)
  })

  it('totalWeeks 非法（0 / 非有限数）= 0', () => {
    expect(resolveWeekOfToday(START, 0, at(2026, 9, 2))).toBe(0)
    expect(resolveWeekOfToday(START, Number.NaN, at(2026, 9, 2))).toBe(0)
  })

  it('today 带时分秒时归一到当地 00:00，结果不受影响', () => {
    expect(resolveWeekOfToday(START, 20, new Date(2026, 8, 9, 23, 59, 59))).toBe(2)
    expect(resolveWeekOfToday(START, 20, new Date(2026, 8, 8, 0, 0, 1))).toBe(1)
  })
})
