/**
 * 短轮询策略测试（#630：可见 1s / 隐藏 5s / 失败退避 / 终态停 / 超时停 / 倒计时）。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POLLING_CONFIG,
  formatCountdown,
  nextPollDelayMs,
  remainingMs,
  shouldStopPolling,
} from '../lib/auth/polling'

describe('轮询间隔', () => {
  it('可见约 1s 一次，隐藏降到约 5s', () => {
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 0 })).toBe(1000)
    expect(nextPollDelayMs({ visible: false, consecutiveFailures: 0 })).toBe(5000)
  })

  it('网络失败指数退避：1s → 2s → 4s → 8s → 16s → 30s 封顶', () => {
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 1 })).toBe(1000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 2 })).toBe(2000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 3 })).toBe(4000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 4 })).toBe(8000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 5 })).toBe(16000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 6 })).toBe(30000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 10 })).toBe(30000)
  })

  it('隐藏时退避不短于隐藏间隔（禁止隐藏高频重试）', () => {
    expect(nextPollDelayMs({ visible: false, consecutiveFailures: 1 })).toBe(5000)
    expect(nextPollDelayMs({ visible: false, consecutiveFailures: 3 })).toBe(5000)
    expect(nextPollDelayMs({ visible: false, consecutiveFailures: 4 })).toBe(8000)
  })

  it('自定义配置生效', () => {
    const cfg = { visibleIntervalMs: 2000, hiddenIntervalMs: 8000, backoffBaseMs: 2000, backoffMaxMs: 6000 }
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 0 }, cfg)).toBe(2000)
    expect(nextPollDelayMs({ visible: false, consecutiveFailures: 0 }, cfg)).toBe(8000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 2 }, cfg)).toBe(4000)
    expect(nextPollDelayMs({ visible: true, consecutiveFailures: 5 }, cfg)).toBe(6000)
  })

  it('默认配置常量符合 issue 建议', () => {
    expect(DEFAULT_POLLING_CONFIG).toEqual({
      visibleIntervalMs: 1000,
      hiddenIntervalMs: 5000,
      backoffBaseMs: 1000,
      backoffMaxMs: 30000,
    })
  })
})

describe('停止条件', () => {
  const expiresAtMs = 1_000_000

  it('等待阶段未过期时继续轮询', () => {
    expect(shouldStopPolling({ phase: 'WAITING_APP', nowMs: 999_000, expiresAtMs })).toBe(false)
    expect(shouldStopPolling({ phase: 'APP_OPENED', nowMs: 999_000, expiresAtMs })).toBe(false)
    expect(shouldStopPolling({ phase: 'NETWORK_ERROR', nowMs: 999_000, expiresAtMs })).toBe(false)
  })

  it('进入（轮询）终态立即停止', () => {
    for (const phase of ['APPROVED', 'REDIRECTING', 'DENIED', 'EXPIRED', 'INVALID', 'CLIENT_UNAVAILABLE'] as const) {
      expect(shouldStopPolling({ phase, nowMs: 0, expiresAtMs })).toBe(true)
    }
  })

  it('本地时间超过服务器 expires_at 停止（真正过期判断仍以 Core 为准）', () => {
    expect(shouldStopPolling({ phase: 'WAITING_APP', nowMs: 1_000_000, expiresAtMs })).toBe(true)
    expect(shouldStopPolling({ phase: 'WAITING_APP', nowMs: 1_000_001, expiresAtMs })).toBe(true)
  })

  it('expires_at 未知（详情未加载）时只按阶段判断', () => {
    expect(shouldStopPolling({ phase: 'LOADING', nowMs: 9_999_999, expiresAtMs: null })).toBe(false)
  })
})

describe('倒计时', () => {
  it('remainingMs 不低于 0', () => {
    expect(remainingMs(5_000, 1_000)).toBe(4_000)
    expect(remainingMs(1_000, 1_000)).toBe(0)
    expect(remainingMs(500, 1_000)).toBe(0)
  })

  it('formatCountdown 文案', () => {
    expect(formatCountdown(0)).toBe('0 秒')
    expect(formatCountdown(999)).toBe('1 秒')
    expect(formatCountdown(59_000)).toBe('59 秒')
    expect(formatCountdown(60_000)).toBe('1 分 00 秒')
    expect(formatCountdown(61_000)).toBe('1 分 01 秒')
    expect(formatCountdown(90_000)).toBe('1 分 30 秒')
    expect(formatCountdown(-5)).toBe('0 秒')
  })
})
