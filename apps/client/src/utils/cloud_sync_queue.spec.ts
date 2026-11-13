// src/utils/cloud_sync_queue.spec.ts
//
// Epic #1243（G4-02 / mini-hbut#1260）契约测试：持久化待同步队列。
//
// 守的契约：
//   1. **同 key 单飞**：同 (学号, 域) 只保留一条，内容变化时替换而非堆积；
//   2. **同摘要不重复入队**（防写放大）；但手动刷新可**提升优先级**（不重置退避）；
//   3. **high 优先**：`pickNext` 先发 high，再按 nextAt 升序；
//   4. **失败不丢**：`markFailed` 只加 attempts 并按指数退避 + 抖动重排；
//   5. **429 不算失败**：`markBlocked` 按 Retry-After 延后且 attempts 不变；
//   6. **崩溃恢复**：`inflight` 复位为 `queued`；
//   7. **学号隔离**：`purgeSid` 只清指定学号；`summarize` 可按学号过滤；
//   8. 幂等键对同一 (学号,域,基础版本,摘要) 恒定。

import { describe, expect, it } from 'vitest'

import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  backoffDelay,
  enqueue,
  idempotencyKeyFor,
  isSendable,
  markAcked,
  markBlocked,
  markFailed,
  markInflight,
  pickNext,
  purgeSid,
  recoverInflight,
  summarize,
  withQueue
} from './cloud_sync_queue'
import type { QueueEntry } from './cloud_sync_queue'

const SID = 'T9000001'
const SID_B = 'T9000002'
const NOW = 1_760_000_000_000

const add = (
  entries: QueueEntry[],
  overrides: Partial<Parameters<typeof enqueue>[1]> = {}
): QueueEntry[] =>
  enqueue(entries, {
    sid: SID,
    domain: 'grades',
    contentHash: 'h1',
    baseVersion: 3,
    now: NOW,
    ...overrides
  })

describe('cloud_sync_queue', () => {
  it('首次入队 → queued 且立即可发', () => {
    const entries = add([])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      sid: SID,
      domain: 'grades',
      state: 'queued',
      priority: 'normal',
      attempts: 0,
      nextAt: 0,
      baseVersion: 3
    })
    expect(isSendable(entries[0], NOW)).toBe(true)
  })

  it('同 key 同摘要 → 不重复入队（防写放大）', () => {
    const first = add([])
    const second = add(first)
    expect(second).toHaveLength(1)
  })

  it('同 key 同摘要但手动刷新 → 提升为 high（且不重置退避）', () => {
    let entries = add([])
    entries = markFailed(entries, entries[0].idempotencyKey, NOW, { random: () => 0 })
    const failedAt = entries[0].nextAt
    const promoted = add(entries, { priority: 'high' })
    expect(promoted[0].priority).toBe('high')
    expect(promoted[0].attempts).toBe(1) // 退避未被清空
    expect(promoted[0].nextAt).toBe(failedAt)
  })

  it('同 key 摘要变化 → 替换为最新内容（单飞，不堆积）', () => {
    const first = add([])
    const second = add(first, { contentHash: 'h2', baseVersion: 4 })
    expect(second).toHaveLength(1)
    expect(second[0].contentHash).toBe('h2')
    expect(second[0].baseVersion).toBe(4)
    expect(second[0].attempts).toBe(0)
  })

  it('不同域/不同学号各自独立成条', () => {
    let entries = add([])
    entries = add(entries, { domain: 'schedule' })
    entries = add(entries, { sid: SID_B })
    expect(entries).toHaveLength(3)
  })

  it('pickNext：high 优先，其次 nextAt 升序', () => {
    let entries = add([])
    entries = add(entries, { domain: 'schedule', contentHash: 'h2' })
    entries = add(entries, { domain: 'exams', contentHash: 'h3', priority: 'high' })
    const next = pickNext(entries, NOW)
    expect(next?.domain).toBe('exams')
  })

  it('pickNext：未到点的 failed 条目不参与', () => {
    let entries = add([])
    entries = markFailed(entries, entries[0].idempotencyKey, NOW, { random: () => 0.5 })
    expect(pickNext(entries, NOW)).toBeNull()
    expect(pickNext(entries, entries[0].nextAt)).not.toBeNull()
  })

  it('pickNext：可按学号过滤（切号只处理当前学号）', () => {
    let entries = add([])
    entries = add(entries, { sid: SID_B, contentHash: 'hb' })
    expect(pickNext(entries, NOW, SID_B)?.sid).toBe(SID_B)
    expect(pickNext(entries, NOW, 'T9999999')).toBeNull()
  })

  it('markInflight / markAcked：成功后从队列移除', () => {
    let entries = add([])
    const key = entries[0].idempotencyKey
    entries = markInflight(entries, key, NOW)
    expect(entries[0].state).toBe('inflight')
    entries = markAcked(entries, key)
    expect(entries).toHaveLength(0)
  })

  it('markFailed：attempts+1、退避重排、**不丢条目**', () => {
    let entries = add([])
    const key = entries[0].idempotencyKey
    entries = markFailed(entries, key, NOW, { random: () => 0 })
    expect(entries).toHaveLength(1)
    expect(entries[0].state).toBe('failed')
    expect(entries[0].attempts).toBe(1)
    expect(entries[0].nextAt).toBeGreaterThan(NOW)
  })

  it('markBlocked：429 不算失败（attempts 不变）且按 Retry-After 延后', () => {
    let entries = add([])
    const key = entries[0].idempotencyKey
    entries = markBlocked(entries, key, NOW, 120_000)
    expect(entries[0].state).toBe('blocked')
    expect(entries[0].attempts).toBe(0)
    expect(entries[0].nextAt).toBe(NOW + 120_000)
    expect(isSendable(entries[0], NOW + 119_999)).toBe(false)
  })

  it('recoverInflight：崩溃后在途复位为 queued', () => {
    let entries = add([])
    entries = markInflight(entries, entries[0].idempotencyKey, NOW)
    entries = recoverInflight(entries, NOW + 1)
    expect(entries[0].state).toBe('queued')
    expect(isSendable(entries[0], NOW + 1)).toBe(true)
  })

  it('purgeSid：只清指定学号，其它学号保留', () => {
    let entries = add([])
    entries = add(entries, { sid: SID_B, contentHash: 'hb' })
    const purged = purgeSid(entries, SID)
    expect(purged).toHaveLength(1)
    expect(purged[0].sid).toBe(SID_B)
  })

  it('summarize：按状态统计 + pending 合计；可按学号过滤', () => {
    let entries = add([])
    entries = add(entries, { domain: 'schedule', contentHash: 'h2' })
    entries = add(entries, { sid: SID_B, contentHash: 'hb' })
    const all = summarize(entries)
    expect(all.queued).toBe(3)
    expect(all.pending).toBe(3)
    const mine = summarize(entries, SID)
    expect(mine.queued).toBe(2)
  })

  it('backoffDelay：指数增长、有上限、Retry-After 优先', () => {
    const noJitter = () => 0.5 // 抖动因子 = 1.0
    expect(backoffDelay(0, 0, noJitter)).toBe(BASE_BACKOFF_MS)
    expect(backoffDelay(3, 0, noJitter)).toBe(BASE_BACKOFF_MS * 8)
    expect(backoffDelay(30, 0, noJitter)).toBe(MAX_BACKOFF_MS)
    // 服务端要求更久 → 取服务端值
    expect(backoffDelay(0, 500_000, noJitter)).toBe(500_000)
    // 服务端要求更短 → 不得小于退避值（防被 0 绕过限流）
    expect(backoffDelay(5, 0, noJitter)).toBe(BASE_BACKOFF_MS * 32)
  })

  it('幂等键：同一 (学号,域,基础版本,摘要) 恒定，任一变化则不同', () => {
    const a = idempotencyKeyFor(SID, 'grades', 3, 'h1')
    expect(a).toBe(idempotencyKeyFor(SID, 'grades', 3, 'h1'))
    expect(a).not.toBe(idempotencyKeyFor(SID, 'grades', 4, 'h1'))
    expect(a).not.toBe(idempotencyKeyFor(SID, 'schedule', 3, 'h1'))
    expect(a).not.toBe(idempotencyKeyFor(SID_B, 'grades', 3, 'h1'))
  })

  it('withQueue：读-改-写封装会落盘', () => {
    let stored: QueueEntry[] = []
    const storage = {
      read: () => stored,
      write: (entries: QueueEntry[]) => {
        stored = entries
      }
    }
    const queue = withQueue(storage)
    queue.update((entries) => add(entries))
    expect(queue.all()).toHaveLength(1)
  })
})
