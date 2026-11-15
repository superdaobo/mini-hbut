import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildRollingMonthLabels,
  currentYearMonth,
  formatYearMonth,
  normalizeMonthSeries,
  parseYearMonth
} from './electricity_month_series'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('electricity month series (#1310)', () => {
  it('解析常见年月标签，拒绝非法值', () => {
    expect(parseYearMonth('2024.08')).toEqual({ year: 2024, month: 8 })
    expect(parseYearMonth('2024-8')).toEqual({ year: 2024, month: 8 })
    expect(parseYearMonth('2024/12')).toEqual({ year: 2024, month: 12 })
    expect(parseYearMonth('202411')).toEqual({ year: 2024, month: 11 })
    expect(parseYearMonth('2024年8月')).toEqual({ year: 2024, month: 8 })
    expect(parseYearMonth('2024.13')).toBeNull()
    expect(parseYearMonth('1999.12')).toBeNull()
    expect(parseYearMonth('')).toBeNull()
    expect(parseYearMonth(null)).toBeNull()
    expect(formatYearMonth(2026, 6)).toBe('2026.06')
  })

  it('去重、升序，并按当前自然月标记', () => {
    const now = new Date(2026, 10, 15) // 2026-11
    const { points, currentMonthPoint, hadDuplicateMonths } = normalizeMonthSeries(
      [
        { label: '2026.11', value: 78.9 },
        { label: '2026.09', value: 69 },
        { label: '2024.12', value: 78.9 },
        { label: '2026.11', value: 80.1 }
      ],
      now
    )
    expect(points.map((p) => p.label)).toEqual(['2024.12', '2026.09', '2026.11'])
    // 同月重复保留最后一条
    expect(points[2].value).toBe(80.1)
    expect(hadDuplicateMonths).toBe(true)
    expect(currentMonthPoint?.label).toBe('2026.11')
    expect(points.filter((p) => p.isCurrentMonth)).toHaveLength(1)
  })

  it('当前月缺失时不伪造「本月」', () => {
    const now = new Date(2026, 10, 15)
    const { points, currentMonthPoint } = normalizeMonthSeries(
      [
        { label: '2024.08', value: 3.2 },
        { label: '2024.08', value: 0 },
        { label: '2024.09', value: 126.9 },
        { label: '2024.10', value: 69 },
        { label: '2024.11', value: 66.9 },
        { label: '2024.12', value: 78.9 }
      ],
      now
    )
    expect(points.map((p) => p.label)).toEqual([
      '2024.08',
      '2024.09',
      '2024.10',
      '2024.11',
      '2024.12'
    ])
    expect(currentMonthPoint).toBeNull()
  })

  it('丢弃无法解析的标签并给出标记', () => {
    const now = new Date(2026, 10, 15)
    const { points, hadInvalidLabels } = normalizeMonthSeries(
      [{ label: '—', value: 1 }, { label: '2026.10', value: 2 }, { fullLabel: '2026.11', value: 3 }],
      now
    )
    expect(points.map((p) => p.label)).toEqual(['2026.10', '2026.11'])
    expect(hadInvalidLabels).toBe(true)
  })

  it('滚动窗口标签以当前月结尾，供后端派生使用', () => {
    const now = new Date(2026, 10, 15)
    expect(buildRollingMonthLabels(6, now)).toEqual([
      '2026.06',
      '2026.07',
      '2026.08',
      '2026.09',
      '2026.10',
      '2026.11'
    ])
    expect(currentYearMonth(now)).toBe('2026.11')
  })

  it('ElectricityView 使用归一化序列与当前月索引（源码契约）', () => {
    const source = read('src/components/ElectricityView.vue')
    expect(source).toContain("from '../utils/electricity_month_series'")
    expect(source).toContain('normalizeMonthSeries(')
    expect(source).toContain('monthMissingCurrent')
    expect(source).toContain('activePointIndex')
    expect(source).toContain("tLocale('electricity.usage.monthMissingCurrent')")
    // 不再按字符串直接排序月标签
    expect(source).not.toContain(
      "mapPoints(usageStats.value?.month_points || usageStats.value?.monthPoints, false)"
    )
  })

  it('三语都提供「本月暂无数据」文案', () => {
    for (const lang of ['zh-CN', 'en', 'ja']) {
      const source = read(`src/utils/i18n/messages/${lang}.ts`)
      expect(source, lang).toContain("'electricity.usage.monthMissingCurrent'")
    }
  })
})
