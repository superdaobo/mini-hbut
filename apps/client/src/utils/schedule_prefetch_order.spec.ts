/**
 * #745 开学季自动切换学期 —— 探测顺序契约测试。
 *
 * 回归点：warmupScheduleForStudent 曾因「anchor 学期有课即 break」而在
 * 开学窗口期（旧学期课表未下架、新学期已出课表）永远停在旧学期。
 * 本 spec 锁定探测候选顺序的关键不变量：
 * 1. 以 anchor 为中心先更新后更旧交叉展开；
 * 2. 新学期（anchor 的相邻更新学期）必须排在更旧学期之前；
 * 3. 全量覆盖无遗漏。
 */
import { describe, expect, it } from 'vitest'
import { buildNearestSemesterOrder } from './schedule_prefetch.js'

// 教务学期列表为降序（新在前）
const SEMESTERS = [
  '2027-2028-1',
  '2026-2027-1',
  '2025-2026-2',
  '2025-2026-1',
  '2024-2025-2'
]

describe('buildNearestSemesterOrder（#745 开学季探测顺序）', () => {
  it('以 anchor 为中心先更新后更旧交叉展开', () => {
    const order = buildNearestSemesterOrder(SEMESTERS, '2025-2026-2')
    expect(order[0]).toBe('2025-2026-2')
    // 更新学期紧邻其后（开学季最关键：新学期必须是第二个候选）
    expect(order[1]).toBe('2026-2027-1')
    expect(order[2]).toBe('2025-2026-1')
    expect(order[3]).toBe('2027-2028-1')
  })

  it('新学期排在所有更旧学期之前（探测优先级契约）', () => {
    const order = buildNearestSemesterOrder(SEMESTERS, '2025-2026-2')
    const nextIdx = order.indexOf('2026-2027-1')
    const olderIdx = order.indexOf('2025-2026-1')
    const oldestIdx = order.indexOf('2024-2025-2')
    expect(nextIdx).toBeGreaterThan(-1)
    expect(nextIdx).toBeLessThan(olderIdx)
    expect(nextIdx).toBeLessThan(oldestIdx)
  })

  it('anchor 不在列表时返回原列表（降序）', () => {
    const order = buildNearestSemesterOrder(SEMESTERS, '2099-2100-1')
    expect(order).toEqual(SEMESTERS)
  })

  it('列表全覆盖无遗漏', () => {
    const order = buildNearestSemesterOrder(SEMESTERS, '2025-2026-2')
    expect([...order].sort()).toEqual([...SEMESTERS].sort())
    expect(order.length).toBe(SEMESTERS.length)
  })
})