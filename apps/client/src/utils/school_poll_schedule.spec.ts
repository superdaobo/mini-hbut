// src/utils/school_poll_schedule.spec.ts
//
// Epic #1243（G4-03 / mini-hbut#1261）契约测试：学校查询调度的纯决策层。
//
// 守的契约（契约 §8.1）：
//   1. 周期基线：schedule 30min / grades 2h / exams 2h / rank 12h / profile 24h；
//   2. **手动刷新无视周期**（但仍在途复用、会话无效时不查）；
//   3. 同域**单飞**：在途 → skip/inflight；
//   4. 会话失效 → skip/session_invalid（不制造无效重试）；
//   5. 未知域 → skip/domain_unknown（默认拒绝，不猜周期）；
//   6. `dueInMs` 给出「距下次到期」，供调度器排下一次；
//   7. 失败**不更新** `lastCheckedAt`（不把失败当成功）；
//   8. 批量决策按周期从短到长排序。

import { describe, expect, it } from 'vitest'

import {
  POLL_INTERVALS_MS,
  decidePoll,
  decidePollBatch,
  isDue,
  markChecked,
  markInflight,
  markInflightDone
} from './school_poll_schedule'

const NOW = 1_760_000_000_000
const MIN = 60 * 1000
const HOUR = 60 * MIN

describe('school_poll_schedule', () => {
  it('周期基线与契约 §8.1 一致', () => {
    expect(POLL_INTERVALS_MS.schedule).toBe(30 * MIN)
    expect(POLL_INTERVALS_MS.grades).toBe(2 * HOUR)
    expect(POLL_INTERVALS_MS.exams).toBe(2 * HOUR)
    expect(POLL_INTERVALS_MS.rank).toBe(12 * HOUR)
    expect(POLL_INTERVALS_MS.profile).toBe(24 * HOUR)
  })

  it('从未查过 → due', () => {
    const d = decidePoll({ domain: 'grades', state: { lastCheckedAt: 0, inflight: false }, now: NOW })
    expect(d).toEqual({ action: 'poll', reason: 'due', dueInMs: 0 })
  })

  it('未到周期 → not_due + dueInMs', () => {
    const d = decidePoll({
      domain: 'grades',
      state: { lastCheckedAt: NOW - 30 * MIN, inflight: false },
      now: NOW
    })
    expect(d.action).toBe('skip')
    expect(d.reason).toBe('not_due')
    expect(d.dueInMs).toBe(2 * HOUR - 30 * MIN)
  })

  it('边界：正好到周期 → due', () => {
    const d = decidePoll({
      domain: 'schedule',
      state: { lastCheckedAt: NOW - 30 * MIN, inflight: false },
      now: NOW
    })
    expect(d.reason).toBe('due')
  })

  it('手动刷新无视周期 → poll/manual', () => {
    const d = decidePoll({
      domain: 'rank',
      state: { lastCheckedAt: NOW - 1 * MIN, inflight: false },
      now: NOW,
      manual: true
    })
    expect(d).toEqual({ action: 'poll', reason: 'manual', dueInMs: 0 })
  })

  it('在途 → skip/inflight（手动也复用，不重复拉）', () => {
    const manual = decidePoll({
      domain: 'grades',
      state: { lastCheckedAt: 0, inflight: true },
      now: NOW,
      manual: true
    })
    expect(manual.reason).toBe('inflight')
  })

  it('会话失效 → skip/session_invalid（即使手动/到点）', () => {
    for (const manual of [false, true]) {
      const d = decidePoll({
        domain: 'grades',
        state: { lastCheckedAt: 0, inflight: false },
        now: NOW,
        manual,
        sessionValid: false
      })
      expect(d).toEqual({ action: 'skip', reason: 'session_invalid', dueInMs: 0 })
    }
  })

  it('未知域 → skip/domain_unknown（默认拒绝）', () => {
    const d = decidePoll({ domain: 'not_a_domain', state: { lastCheckedAt: 0, inflight: false }, now: NOW })
    expect(d).toEqual({ action: 'skip', reason: 'domain_unknown', dueInMs: 0 })
  })

  it('isDue 与 decidePoll 口径一致', () => {
    const state = { lastCheckedAt: NOW - 31 * MIN, inflight: false }
    expect(isDue('schedule', state, NOW)).toBe(true)
    expect(isDue('grades', state, NOW)).toBe(false)
  })

  it('markChecked 记录成功时间并清在途；markInflightDone 不清成功时间（失败不算成功）', () => {
    const inflight = markInflight({ lastCheckedAt: 100, inflight: false })
    expect(inflight.inflight).toBe(true)
    const failed = markInflightDone(inflight)
    expect(failed).toEqual({ lastCheckedAt: 100, inflight: false })
    const ok = markChecked(inflight, NOW)
    expect(ok).toEqual({ lastCheckedAt: NOW, inflight: false })
  })

  it('decidePollBatch：只返回该查的域，并按周期从短到长排序', () => {
    const states = {
      schedule: { lastCheckedAt: 0, inflight: false },
      grades: { lastCheckedAt: 0, inflight: false },
      rank: { lastCheckedAt: 0, inflight: false },
      profile: { lastCheckedAt: NOW, inflight: false } // 未到期
    }
    const wanted = decidePollBatch(['rank', 'profile', 'grades', 'schedule'], states, NOW)
    expect(wanted).toEqual(['schedule', 'grades', 'rank'])
  })

  it('decidePollBatch：会话失效时一个都不查', () => {
    const states = { grades: { lastCheckedAt: 0, inflight: false } }
    expect(decidePollBatch(['grades'], states, NOW, { sessionValid: false })).toEqual([])
  })
})
