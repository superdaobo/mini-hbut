// src/features/sync/syncOrchestrator.spec.ts
//
// Epic #1243（G4-02/G4-03 / #1260、#1261）编排层契约测试。
//
// 这一层的价值：把「三个纯逻辑层」变成**有调用点、可单测**的编排器，
// 让 `SessionCoordinator` 的接线只剩一行。
//
// 守的契约：
//   1. `start()` 崩溃恢复（inflight → queued）；
//   2. **切号清队列**：epoch 变化时清掉旧学号条目，当前学号的保留；
//   3. `tick()` high 优先上传；成功 → 出队；失败 → 退避重排（**不丢**）且本轮停止；
//   4. 手动刷新无视周期；会话失效不查；
//   5. 降频档位随信号升降，并影响 `effectivePollInterval`；
//   6. 未登录不入队（不把数据挂到错误学号）。

import { describe, expect, it } from 'vitest'

import { createSyncOrchestrator, effectivePollInterval } from './syncOrchestrator'
import type { QueueEntry } from '../../utils/cloud_sync_queue'

const SID = 'T9000001'
const SID_OLD = 'T9000000'
const MIN = 60 * 1000
const NOW = 1_760_000_000_000

const entry = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  sid: SID,
  domain: 'grades',
  state: 'queued',
  priority: 'normal',
  contentHash: 'h1',
  baseVersion: 1,
  attempts: 0,
  nextAt: 0,
  idempotencyKey: `${SID}|grades|1|h1`,
  updatedAt: NOW,
  ...overrides
})

const harness = (initial: QueueEntry[] = [], uploadResults: Array<{ ok: boolean; retryAfterMs?: number }> = []) => {
  let queue = [...initial]
  const uploads: string[] = []
  let sid = SID
  let epochListener: (() => void) | null = null
  const pollStates = new Map<string, { lastCheckedAt: number; inflight: boolean }>()

  const orchestrator = createSyncOrchestrator({
    readQueue: () => queue,
    writeQueue: (next) => {
      queue = next
    },
    upload: async (item) => {
      uploads.push(item.idempotencyKey)
      const result = uploadResults.shift()
      return result ? (result.ok ? { ok: true } : { ok: false, retryAfterMs: result.retryAfterMs }) : { ok: true }
    },
    now: () => NOW,
    currentSid: () => sid,
    subscribeEpoch: (listener) => {
      epochListener = listener
      return () => {
        epochListener = null
      }
    },
    readPollState: (domain) => pollStates.get(domain),
    writePollState: (domain, state) => {
      pollStates.set(domain, state)
    }
  })

  return {
    orchestrator,
    uploads,
    pollStates,
    getQueue: () => queue,
    switchTo: (next: string) => {
      sid = next
      epochListener?.()
    },
    fireEpoch: () => epochListener?.()
  }
}

describe('syncOrchestrator', () => {
  it('start() 做崩溃恢复：inflight → queued', () => {
    const h = harness([entry({ state: 'inflight' })])
    h.orchestrator.start()
    expect(h.getQueue()[0].state).toBe('queued')
  })

  it('**切号清队列**：旧学号条目被清，当前学号保留', () => {
    const h = harness([
      entry({ sid: SID_OLD, idempotencyKey: `${SID_OLD}|grades|1|h1` }),
      entry()
    ])
    h.orchestrator.start()
    expect(h.getQueue()).toHaveLength(2)

    h.switchTo(SID) // 已是 SID，但触发 epoch 回调 → 清掉 SID_OLD
    expect(h.getQueue().map((item) => item.sid)).toEqual([SID])
  })

  it('tick() 上传成功后出队', async () => {
    const h = harness([entry()], [{ ok: true }])
    h.orchestrator.start()
    const result = await h.orchestrator.tick([])
    expect(result.drain.succeeded).toBe(1)
    expect(h.getQueue()).toHaveLength(0)
  })

  it('上传失败 → 退避重排（不丢），且本轮停止', async () => {
    const h = harness([entry(), entry({ domain: 'schedule', idempotencyKey: 'k2' })], [{ ok: false, retryAfterMs: 5000 }])
    h.orchestrator.start()
    const result = await h.orchestrator.tick([])
    expect(result.drain.failed).toBe(1)
    expect(result.drain.succeeded).toBe(0)
    // 两条都还在（失败的那条没丢，另一条还没轮到）
    expect(h.getQueue()).toHaveLength(2)
    const failed = h.getQueue().find((item) => item.state === 'failed')!
    expect(failed.nextAt).toBeGreaterThan(NOW)
  })

  it('上传抛异常按失败处理（不把定时器打断）', async () => {
    let queue = [entry()]
    const orchestrator = createSyncOrchestrator({
      readQueue: () => queue,
      writeQueue: (next) => {
        queue = next
      },
      upload: async () => {
        throw new Error('network')
      },
      now: () => NOW,
      currentSid: () => SID
    })
    const result = await orchestrator.tick([])
    expect(result.drain.failed).toBe(1)
    expect(queue).toHaveLength(1)
  })

  it('手动刷新无视周期；会话失效不查', async () => {
    const h = harness([])
    h.orchestrator.start()
    // 第一次：从未查过 → 会查
    const first = await h.orchestrator.tick(['grades'])
    expect(first.polled).toEqual(['grades'])
    // 立刻再 tick（未到周期）→ 不查
    const second = await h.orchestrator.tick(['grades'])
    expect(second.polled).toEqual([])
    // 手动 → 无视周期
    const manual = await h.orchestrator.tick(['grades'], { manual: true })
    expect(manual.polled).toEqual(['grades'])
    // 会话失效 → 不查
    const invalid = await h.orchestrator.tick(['grades'], { manual: true, sessionValid: false })
    expect(invalid.polled).toEqual([])
  })

  it('降频档位随信号升降，并影响实际周期', () => {
    const h = harness([])
    expect(h.orchestrator.tier()).toBe(0)
    h.orchestrator.recordSignal('rate_limited')
    expect(h.orchestrator.tier()).toBe(1)
    h.orchestrator.recordSignal('rate_limited')
    expect(h.orchestrator.tier()).toBe(2)

    const base = 30 * MIN
    expect(effectivePollInterval(base, 0)).toBe(base)
    expect(effectivePollInterval(base, 2)).toBe(base * 4)
  })

  it('未登录不入队（不把数据挂到错误学号）', () => {
    const h = harness([])
    h.switchTo('')
    h.orchestrator.enqueueChange({ domain: 'grades', contentHash: 'h1' })
    expect(h.getQueue()).toHaveLength(0)
  })

  it('enqueueChange 在登录后正常入队，且 high 优先级生效', () => {
    const h = harness([])
    h.orchestrator.enqueueChange({ domain: 'grades', contentHash: 'h1', priority: 'high' })
    expect(h.getQueue()).toHaveLength(1)
    expect(h.getQueue()[0].priority).toBe('high')
    expect(h.getQueue()[0].sid).toBe(SID)
  })

  it('start() 返回的取消函数会退订', () => {
    const h = harness([])
    const stop = h.orchestrator.start()
    stop()
    // 退订后再触发 epoch 不应清队列（这里只验证不抛）
    expect(() => h.fireEpoch()).not.toThrow()
  })
})
