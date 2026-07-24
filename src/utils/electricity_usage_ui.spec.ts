import { describe, expect, it } from 'vitest'
import {
  hasUsageCurve,
  isUsageSnapshotOnly,
  resolveUsageEmptyText
} from './electricity_usage_ui'

describe('electricity_usage_ui (#488 empty / snapshot)', () => {
  it('hasUsageCurve detects week or month points', () => {
    expect(hasUsageCurve(null)).toBe(false)
    expect(hasUsageCurve({ points: [] })).toBe(false)
    expect(hasUsageCurve({ points: [{ value: 1 }] })).toBe(true)
    expect(hasUsageCurve({ month_points: [{ value: 2 }] })).toBe(true)
    expect(hasUsageCurve({ monthPoints: [{ value: 2 }] })).toBe(true)
  })

  it('isUsageSnapshotOnly when success with quantity and no curve', () => {
    expect(
      isUsageSnapshotOnly({
        success: true,
        points: [],
        month_points: [],
        quantity: '12.5',
        message: '智能水电未返回分日曲线，已显示该房间当前电量/余额快照'
      })
    ).toBe(true)
  })

  it('isUsageSnapshotOnly false on hard failure or when curve exists', () => {
    expect(
      isUsageSnapshotOnly({
        success: false,
        points: [],
        message: '电量趋势暂不可用'
      })
    ).toBe(false)
    expect(
      isUsageSnapshotOnly({
        success: true,
        points: [{ value: 1 }],
        quantity: '9'
      })
    ).toBe(false)
  })

  it('resolveUsageEmptyText distinguishes 未选房 vs 已选房无曲线', () => {
    expect(
      resolveUsageEmptyText({ hasSelectedRoom: false, stats: null })
    ).toBe('请先选择宿舍查看用电趋势')

    expect(
      resolveUsageEmptyText({
        hasSelectedRoom: true,
        stats: { success: true, points: [], message: '' }
      })
    ).toBe('该房间暂无分日/分月用电曲线，可查看上方电费余额')

    expect(
      resolveUsageEmptyText({
        hasSelectedRoom: true,
        stats: {
          message: '智能水电未返回分日曲线，已显示该房间当前电量/余额快照'
        }
      })
    ).toContain('智能水电未返回分日曲线')

    // 已选房时绝不展示误导的「请先选择宿舍」
    const misleading = resolveUsageEmptyText({
      hasSelectedRoom: true,
      stats: { message: '暂无用电数据，请先选择宿舍' }
    })
    expect(misleading).not.toMatch(/请先选择宿舍/)
    expect(misleading).toContain('该房间暂无')
  })
})
