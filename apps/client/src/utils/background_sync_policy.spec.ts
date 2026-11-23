// src/utils/background_sync_policy.spec.ts
//
// Epic #1243（G4-06 / mini-hbut#1264）契约测试：三端后台能力矩阵 + 恢复前台补偿。
//
// 守的契约（Epic §10）：
//   1. **不伪承诺**：任何平台都不承诺「进程被杀后仍能采集」；iOS 不承诺固定周期；
//   2. Android 下限 15 分钟（WorkManager 最短周期），且**不承诺精确时刻**；
//   3. Windows 允许最小化后低频（进程未结束），彻底退出不建常驻；
//   4. Web 没有后台能力；
//   5. 恢复前台补偿：未查过/已到期 → 查；未到期 → 跳过并给出 `dueInMs`；会话失效不查；
//   6. 后台最短间隔 = max(前台周期, 平台下限)。

import { describe, expect, it } from 'vitest'

import {
  PLATFORM_POLICIES,
  decideResumeCompensation,
  detectPlatform,
  effectiveBackgroundInterval,
  promisesAfterTermination
} from './background_sync_policy'

const NOW = 1_760_000_000_000
const MIN = 60 * 1000
const HOUR = 60 * MIN

describe('background_sync_policy', () => {
  it('平台矩阵：Android 下限 15 分钟且不承诺精确时刻', () => {
    expect(PLATFORM_POLICIES.android.minIntervalMs).toBe(15 * MIN)
    expect(PLATFORM_POLICIES.android.exactTiming).toBe(false)
    expect(PLATFORM_POLICIES.android.backgroundAllowed).toBe(true)
  })

  it('平台矩阵：iOS 不承诺任何固定周期（minIntervalMs=null）', () => {
    expect(PLATFORM_POLICIES.ios.minIntervalMs).toBeNull()
    expect(PLATFORM_POLICIES.ios.exactTiming).toBe(false)
  })

  it('平台矩阵：Windows 允许最小化后低频', () => {
    expect(PLATFORM_POLICIES.windows.backgroundAllowed).toBe(true)
    expect(PLATFORM_POLICIES.windows.exactTiming).toBe(false)
  })

  it('平台矩阵：Web 没有后台能力', () => {
    expect(PLATFORM_POLICIES.web.backgroundAllowed).toBe(false)
  })

  it('任何平台都不承诺「进程被杀后仍采集」', () => {
    for (const platform of ['windows', 'android', 'ios', 'web'] as const) {
      expect(promisesAfterTermination(platform)).toBe(false)
    }
  })

  it('detectPlatform：按 UA 粗判', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('web')
    expect(detectPlatform('')).toBe('web')
  })

  it('恢复前台：从未查过 → poll/never_checked', () => {
    const d = decideResumeCompensation({
      platform: 'windows',
      lastCheckedAt: 0,
      now: NOW,
      intervalMs: 30 * MIN
    })
    expect(d).toEqual({ action: 'poll', reason: 'never_checked', dueInMs: 0 })
  })

  it('恢复前台：已过周期 → poll/due', () => {
    const d = decideResumeCompensation({
      platform: 'android',
      lastCheckedAt: NOW - 31 * MIN,
      now: NOW,
      intervalMs: 30 * MIN
    })
    expect(d).toEqual({ action: 'poll', reason: 'due', dueInMs: 0 })
  })

  it('恢复前台：未到周期 → skip/not_due + dueInMs', () => {
    const d = decideResumeCompensation({
      platform: 'ios',
      lastCheckedAt: NOW - 10 * MIN,
      now: NOW,
      intervalMs: 30 * MIN
    })
    expect(d.action).toBe('skip')
    expect(d.reason).toBe('not_due')
    expect(d.dueInMs).toBe(20 * MIN)
  })

  it('恢复前台：会话失效 → skip/session_invalid（即使已到期）', () => {
    const d = decideResumeCompensation({
      platform: 'windows',
      lastCheckedAt: NOW - 5 * HOUR,
      now: NOW,
      intervalMs: 30 * MIN,
      sessionValid: false
    })
    expect(d).toEqual({ action: 'skip', reason: 'session_invalid', dueInMs: 0 })
  })

  it('恢复前台：Web 平台 → skip/unsupported', () => {
    const d = decideResumeCompensation({
      platform: 'web',
      lastCheckedAt: 0,
      now: NOW,
      intervalMs: 30 * MIN
    })
    expect(d).toEqual({ action: 'skip', reason: 'unsupported', dueInMs: 0 })
  })

  it('未知平台按不支持处理（默认拒绝）', () => {
    const d = decideResumeCompensation({
      platform: 'symbian',
      lastCheckedAt: 0,
      now: NOW,
      intervalMs: 30 * MIN
    })
    expect(d.reason).toBe('unsupported')
  })

  it('effectiveBackgroundInterval：取前台周期与平台下限的较大者', () => {
    // 前台 5 分钟 < Android 下限 15 分钟 → 用 15 分钟
    expect(effectiveBackgroundInterval('android', 5 * MIN)).toBe(15 * MIN)
    // 前台 2 小时 > 下限 → 保持 2 小时
    expect(effectiveBackgroundInterval('android', 2 * HOUR)).toBe(2 * HOUR)
    // iOS 无下限 → 保持前台周期
    expect(effectiveBackgroundInterval('ios', 30 * MIN)).toBe(30 * MIN)
    // 未知平台 → 保持前台周期（不擅自放大）
    expect(effectiveBackgroundInterval('symbian', 30 * MIN)).toBe(30 * MIN)
  })
})
