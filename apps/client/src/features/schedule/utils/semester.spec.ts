/**
 * #750 开学日期驱动应选学期 —— 纯函数单测。
 *
 * 覆盖 resolveSemesterByStartDate 的产品语义：
 * 「应显示学期」= 学期列表中 start_date <= 今天 + 3 天 的最近一个。
 * - start−3 当天（应切）/ start−4（不切）/ start 当天（应切）
 * - 多学期序列取最近（start_date 最大者）
 * - 无 start_date / 空列表 → null（调用方回退 deriveSemesterByDate 推算链）
 * - 非法/溢出日期忽略；并列 start_date 取列表靠前
 */
import { describe, expect, it } from 'vitest'
import {
  SEMESTER_SWITCH_LEAD_DAYS,
  getNextSemesterString,
  isSemesterStartWithinLeadWindow,
  parseSemesterLocalDate,
  resolveSemesterByStartDate
} from './semester'

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0)

describe('SEMESTER_SWITCH_LEAD_DAYS（#750 提前量契约）', () => {
  it('提前量为 3 天', () => {
    expect(SEMESTER_SWITCH_LEAD_DAYS).toBe(3)
  })
})

describe('parseSemesterLocalDate（YYYY-MM-DD → 本地当日 00:00）', () => {
  it('解析为本地时区当日零点（规避 UTC 解析偏移）', () => {
    const d = parseSemesterLocalDate('2026-08-31')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(31)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })

  it('非法输入返回 null', () => {
    expect(parseSemesterLocalDate('')).toBeNull()
    expect(parseSemesterLocalDate('2026/08/31')).toBeNull()
    expect(parseSemesterLocalDate('2026-13-01')).toBeNull()
    expect(parseSemesterLocalDate('2026-02-31')).toBeNull() // 溢出日期拒绝
    expect(parseSemesterLocalDate(null)).toBeNull()
  })
})

describe('resolveSemesterByStartDate（#750 应选学期）', () => {
  it('start−3 当天应切（提前窗口边界）', () => {
    const entries = [{ semester: '2026-2027-1', start_date: '2026-08-31' }]
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 28))).toBe('2026-2027-1')
  })

  it('start−4 不切：无其他合格学期 → null（回退推算链）', () => {
    const entries = [{ semester: '2026-2027-1', start_date: '2026-08-31' }]
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 27))).toBeNull()
  })

  it('start−4 不切：存在旧学期时保持旧学期', () => {
    const entries = [
      { semester: '2026-2027-1', start_date: '2026-08-31' },
      { semester: '2025-2026-2', start_date: '2026-03-02' }
    ]
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 27))).toBe('2025-2026-2')
  })

  it('start 当天应切', () => {
    const entries = [{ semester: '2026-2027-1', start_date: '2026-08-31' }]
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 31))).toBe('2026-2027-1')
  })

  it('多学期序列取最近（start_date 最大的合格学期）', () => {
    const entries = [
      { semester: '2026-2027-1', start_date: '2026-08-31' },
      { semester: '2025-2026-2', start_date: '2026-03-02' },
      { semester: '2025-2026-1', start_date: '2025-09-01' }
    ]
    // 提前窗口内（cutoff=9/1）：新学期（8/31）与旧学期（3/2）都合格 → 取最近的新学期
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 29))).toBe('2026-2027-1')
    // 暑假深处（7/15）：新学期未进窗口 → 最近合格者为 2025-2026-2
    expect(resolveSemesterByStartDate(entries, at(2026, 7, 15))).toBe('2025-2026-2')
    // 学期中：只有 2025-2026-2 合格
    expect(resolveSemesterByStartDate(entries, at(2026, 5, 10))).toBe('2025-2026-2')
    // 上学年期中：2025-2026-1 合格（2025-2026-2 尚未进窗口）
    expect(resolveSemesterByStartDate(entries, at(2025, 10, 20))).toBe('2025-2026-1')
  })

  it('无 start_date（全部缺失/非法）→ null', () => {
    expect(
      resolveSemesterByStartDate([
        { semester: '2026-2027-1' },
        { semester: '2025-2026-2', start_date: '' },
        { semester: '2025-2026-1', start_date: null },
        { semester: '2024-2025-2', start_date: 'not-a-date' }
      ], at(2026, 8, 30))
    ).toBeNull()
  })

  it('空列表 → null', () => {
    expect(resolveSemesterByStartDate([], at(2026, 8, 30))).toBeNull()
  })

  it('非法条目（semester 为空）被忽略', () => {
    const entries = [
      { semester: '', start_date: '2026-08-31' },
      { semester: '2026-2027-1', start_date: '2026-08-31' }
    ]
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 30))).toBe('2026-2027-1')
  })

  it('并列 start_date 取列表靠前（约定新学期在前）', () => {
    const entries = [
      { semester: '2026-2027-1', start_date: '2026-08-31' },
      { semester: '2025-2026-2', start_date: '2026-08-31' }
    ]
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 30))).toBe('2026-2027-1')
  })

  it('跨年边界：寒假期间未进窗口保持第一学期', () => {
    const entries = [
      { semester: '2025-2026-2', start_date: '2026-02-23' },
      { semester: '2025-2026-1', start_date: '2025-09-01' }
    ]
    expect(resolveSemesterByStartDate(entries, at(2026, 1, 10))).toBe('2025-2026-1')
    // 2/20（start−3）进入窗口 → 切第二学期
    expect(resolveSemesterByStartDate(entries, at(2026, 2, 20))).toBe('2025-2026-2')
  })

  it('自定义提前量生效（leadDays=0 即开学当天才切）', () => {
    const entries = [{ semester: '2026-2027-1', start_date: '2026-08-31' }]
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 30), 0)).toBeNull()
    expect(resolveSemesterByStartDate(entries, at(2026, 8, 31), 0)).toBe('2026-2027-1')
  })
})

describe('isSemesterStartWithinLeadWindow（#750 窗口判定）', () => {
  it('窗口内/外/非法', () => {
    expect(isSemesterStartWithinLeadWindow('2026-08-31', at(2026, 8, 28))).toBe(true)
    expect(isSemesterStartWithinLeadWindow('2026-08-31', at(2026, 8, 27))).toBe(false)
    expect(isSemesterStartWithinLeadWindow('bad-date', at(2026, 8, 28))).toBe(false)
    expect(isSemesterStartWithinLeadWindow('', at(2026, 8, 28))).toBe(false)
  })
})

describe('getNextSemesterString（#750 发现型探测候选推算）', () => {
  it('term1 → 同学年 term2', () => {
    expect(getNextSemesterString('2025-2026-1')).toBe('2025-2026-2')
  })

  it('term2 → 下一学年 term1', () => {
    expect(getNextSemesterString('2025-2026-2')).toBe('2026-2027-1')
  })

  it('非法格式/学年不连续返回空串', () => {
    expect(getNextSemesterString('2025-2025-1')).toBe('')
    expect(getNextSemesterString('abc')).toBe('')
    expect(getNextSemesterString('')).toBe('')
  })
})
