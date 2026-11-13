// src/utils/poll_downshift.spec.ts
//
// Epic #1243（G7-02 / mini-hbut#1270）契约测试：自动降频。
//
// 守的契约：
//   1. 限流/繁忙 → 档位递增（上限 3 → 倍率 8）；
//   2. **连续 2 次成功才回落一档**（防抖动）；
//   3. **网络错误不降也不升**，且清掉成功连击（不能把断网当已恢复）；
//   4. 纯函数（不改入参）；
//   5. 周期有上限（24h），不会「永不重试」。

import { describe, expect, it } from 'vitest'

import {
  MAX_DOWNSHIFT_TIER,
  applyLoadSignal,
  downshiftedInterval,
  initialDownshiftState,
  tierMultiplier
} from './poll_downshift'

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

describe('poll_downshift', () => {
  it('初始档位 0 → 倍率 1', () => {
    const state = initialDownshiftState()
    expect(state.tier).toBe(0)
    expect(tierMultiplier(state)).toBe(1)
  })

  it('限流 → 逐级升档，上限 3（倍率 8）', () => {
    let state = initialDownshiftState()
    const tiers: number[] = []
    for (let i = 0; i < 5; i += 1) {
      state = applyLoadSignal(state, 'rate_limited')
      tiers.push(state.tier)
    }
    expect(tiers).toEqual([1, 2, 3, 3, 3])
    expect(tierMultiplier(state)).toBe(8)
    expect(state.tier).toBe(MAX_DOWNSHIFT_TIER)
  })

  it('服务繁忙同样升档', () => {
    const state = applyLoadSignal(initialDownshiftState(), 'server_busy')
    expect(state.tier).toBe(1)
  })

  it('连续 2 次成功才回落一档', () => {
    let state = applyLoadSignal(initialDownshiftState(), 'rate_limited') // tier 1
    state = applyLoadSignal(state, 'ok')
    expect(state.tier).toBe(1) // 只成功 1 次 → 不回落
    state = applyLoadSignal(state, 'ok')
    expect(state.tier).toBe(0) // 连续 2 次 → 回落
    expect(state.consecutiveOk).toBe(0)
  })

  it('成功一次后又被限流 → 成功连击清零', () => {
    let state = applyLoadSignal(initialDownshiftState(), 'rate_limited')
    state = applyLoadSignal(state, 'ok')
    expect(state.consecutiveOk).toBe(1)
    state = applyLoadSignal(state, 'rate_limited')
    expect(state.consecutiveOk).toBe(0)
    expect(state.tier).toBe(2)
  })

  it('网络错误：档位不变，且清掉成功连击', () => {
    let state = applyLoadSignal(initialDownshiftState(), 'rate_limited')
    state = applyLoadSignal(state, 'ok')
    const before = state.tier
    state = applyLoadSignal(state, 'network_error')
    expect(state.tier).toBe(before)
    expect(state.consecutiveOk).toBe(0)
  })

  it('档位 0 时成功不会变成负数', () => {
    let state = initialDownshiftState()
    for (let i = 0; i < 5; i += 1) state = applyLoadSignal(state, 'ok')
    expect(state.tier).toBe(0)
  })

  it('纯函数：不改入参', () => {
    const state = { tier: 1, consecutivePressure: 1, consecutiveOk: 0 }
    const snapshot = { ...state }
    applyLoadSignal(state, 'rate_limited')
    expect(state).toEqual(snapshot)
  })

  it('周期按倍率放大', () => {
    const base = 30 * MIN
    expect(downshiftedInterval(base, { tier: 0, consecutivePressure: 0, consecutiveOk: 0 })).toBe(base)
    expect(downshiftedInterval(base, { tier: 1, consecutivePressure: 1, consecutiveOk: 0 })).toBe(base * 2)
    expect(downshiftedInterval(base, { tier: 3, consecutivePressure: 3, consecutiveOk: 0 })).toBe(base * 8)
  })

  it('周期上限 24 小时（不会永不重试）', () => {
    const base = 12 * HOUR // rank 的周期
    const interval = downshiftedInterval(base, { tier: 3, consecutivePressure: 3, consecutiveOk: 0 })
    expect(interval).toBe(24 * HOUR)
  })
})
