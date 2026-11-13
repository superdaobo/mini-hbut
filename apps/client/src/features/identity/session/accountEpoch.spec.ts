// src/features/identity/session/accountEpoch.spec.ts
//
// Epic #1243（G1-05 / mini-hbut#1249）契约测试：账号代际是切号隔离的唯一事实源。
//
// 守的契约：
//   1. 初始代际为 0；`bumpAccountEpoch` 单调递增并返回新值；
//   2. bump 后旧代际 `isCurrentEpoch` 为 false、`discardIfStale` 为 true
//      （迟到结果必须被丢弃，这是「A 的结果不写进 B」的机制本体）；
//   3. bump 记录 reason 与时刻（审计），超长 reason 截断；
//   4. 订阅者收到通知；取消订阅后不再收到；
//   5. **监听器异常隔离**：一个监听器抛错不影响其它监听器，也不让 bump 抛错
//      （bump 的调用点在登录主流程里，抛错会打断登录）；
//   6. 多次 bump 严格单调（并发/重复调用不会回退）；
//   7. 时钟注入失败（now 抛错）不得让 bump 失败；
//   8. 非函数监听器被安全忽略；
//   9. 重置仅用于测试隔离。

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetAccountEpochForTests,
  bumpAccountEpoch,
  discardIfStale,
  getAccountEpoch,
  getAccountEpochInfo,
  isCurrentEpoch,
  subscribeAccountEpoch
} from './accountEpoch'

describe('accountEpoch', () => {
  beforeEach(() => {
    __resetAccountEpochForTests()
  })

  it('初始代际为 0，未推进过', () => {
    expect(getAccountEpoch()).toBe(0)
    expect(getAccountEpochInfo()).toEqual({ epoch: 0, reason: 'init', at: 0 })
  })

  it('bump 单调递增并返回新代际', () => {
    expect(bumpAccountEpoch('login')).toBe(1)
    expect(bumpAccountEpoch('logout')).toBe(2)
    expect(getAccountEpoch()).toBe(2)
  })

  it('bump 后旧代际被判定为过期（迟到结果必须丢弃）', () => {
    const stale = getAccountEpoch()
    bumpAccountEpoch('switch')
    expect(isCurrentEpoch(stale)).toBe(false)
    expect(discardIfStale(stale)).toBe(true)
    expect(isCurrentEpoch(getAccountEpoch())).toBe(true)
    expect(discardIfStale(getAccountEpoch())).toBe(false)
  })

  it('bump 记录原因与时刻，超长原因被截断', () => {
    const now = () => 1_760_000_000_000
    bumpAccountEpoch('x'.repeat(200), now)
    const info = getAccountEpochInfo()
    expect(info.reason).toHaveLength(64)
    expect(info.at).toBe(1_760_000_000_000)
  })

  it('订阅者收到通知；取消订阅后不再收到', () => {
    const seen: number[] = []
    const unsubscribe = subscribeAccountEpoch((info) => seen.push(info.epoch))
    bumpAccountEpoch('login')
    unsubscribe()
    bumpAccountEpoch('logout')
    expect(seen).toEqual([1])
  })

  it('监听器异常被隔离，不影响其它监听器与 bump 本身', () => {
    const good = vi.fn()
    subscribeAccountEpoch(() => {
      throw new Error('bad listener')
    })
    subscribeAccountEpoch(good)

    expect(() => bumpAccountEpoch('switch')).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(getAccountEpoch()).toBe(1) // 代际仍然推进成功
  })

  it('多次 bump 严格单调（不会回退）', () => {
    const seq = [1, 2, 3, 4, 5].map((n) => bumpAccountEpoch(`r${n}`))
    expect(seq).toEqual([1, 2, 3, 4, 5])
    for (let i = 1; i < seq.length; i += 1) {
      expect(seq[i]).toBeGreaterThan(seq[i - 1])
    }
  })

  it('时钟抛错时 bump 仍成功（at 退化为 0）', () => {
    const boom = () => {
      throw new Error('clock failed')
    }
    expect(bumpAccountEpoch('login', boom)).toBe(1)
    expect(getAccountEpochInfo().at).toBe(0)
  })

  it('非函数监听器被安全忽略', () => {
    // @ts-expect-error 故意传非法值
    const unsubscribe = subscribeAccountEpoch(null)
    expect(typeof unsubscribe).toBe('function')
    expect(() => bumpAccountEpoch('login')).not.toThrow()
  })

  it('空原因退化为 unknown（不留空字符串）', () => {
    bumpAccountEpoch('')
    expect(getAccountEpochInfo().reason).toBe('unknown')
  })
})
