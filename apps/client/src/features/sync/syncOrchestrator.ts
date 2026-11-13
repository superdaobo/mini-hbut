// src/features/sync/syncOrchestrator.ts
//
// Epic #1243（G4-02/G4-03 / mini-hbut#1260、#1261）：**编排层** —— 把三个纯逻辑层
// （持久队列 / 调度判定 / 自动降频）与账号代际串起来，并**注入**所有 IO。
//
// ## 为什么需要这一层
//
// T10 交付了 `cloud_sync_queue` 与 `school_poll_schedule`，T17 又加了 `poll_downshift`，
// 但三者**没有调用点**：`subscribeAccountEpoch` 的订阅者仍为空，切号不会清队列。
// 本层把它们组合成一个可单测的编排器，接线到 `SessionCoordinator` 只需一行 `createSyncOrchestrator(...)`。
//
// ## 设计约束
//
// - **不 import 任何 Vue / Tauri / 网络模块**：所有副作用通过依赖注入；
// - **不 import 具体 store**：队列、时钟、上传函数全部注入（便于穷举测试）；
// - **切号即清队列**：订阅账号代际，epoch 变化时 `purgeSid` 旧学号；
// - **同域单飞**：`decidePoll` 已保证，本层不再重复加锁；
// - **失败不吞**：上传失败交给队列的 `markFailed`（退避重排），本层只统计。

import { applyLoadSignal, downshiftedInterval, initialDownshiftState, type DownshiftState, type LoadSignal } from '../../utils/poll_downshift'
import {
  enqueue,
  markAcked,
  markFailed,
  markInflight,
  pickNext,
  purgeSid,
  recoverInflight,
  type QueueEntry
} from '../../utils/cloud_sync_queue'
import {
  decidePoll,
  markChecked,
  markInflight as markPollInflight,
  type PollDomain,
  type PollState
} from '../../utils/school_poll_schedule'

/** 上传一次的结果（由调用方把 HTTP 结果翻译成这个）。 */
export type UploadOutcome = { ok: true } | { ok: false; retryAfterMs?: number }

export interface SyncOrchestratorDeps {
  /** 读当前队列（通常是持久化存储） */
  readQueue: () => QueueEntry[]
  /** 写回队列 */
  writeQueue: (entries: QueueEntry[]) => void
  /** 执行一次上传（幂等键作为入参，便于服务端去重） */
  upload: (entry: QueueEntry) => Promise<UploadOutcome>
  /** 时钟（unix ms） */
  now: () => number
  /** 当前学号（切号时变化；空串 = 未登录） */
  currentSid: () => string
  /** 订阅账号代际（切号/登出时回调）；返回取消订阅函数 */
  subscribeEpoch?: (listener: () => void) => () => void
  /** 每域的调度状态（由调用方持久化；本层只读改） */
  readPollState?: (domain: string) => PollState | undefined
  writePollState?: (domain: string, state: PollState) => void
}

export interface DrainResult {
  attempted: number
  succeeded: number
  failed: number
  /** 是否因「没有可发条目」而提前结束 */
  idle: boolean
}

export interface TickResult {
  /** 本轮该查的域（按周期从短到长） */
  polled: PollDomain[]
  /** 本轮上传统计 */
  drain: DrainResult
  /** 当前降频档位 */
  tier: number
}

export interface SyncOrchestrator {
  /** 启动：崩溃恢复 + 订阅切号清理 */
  start: () => () => void
  /** 一次调度 tick：先上传队列，再判定该查哪些域 */
  tick: (domains: readonly string[], options?: { manual?: boolean; sessionValid?: boolean }) => Promise<TickResult>
  /** 记录一次学校查询结果（成功/限流/繁忙/网络错误）→ 影响降频档位 */
  recordSignal: (signal: LoadSignal) => void
  /** 入队一次本地变更（手动刷新时 priority='high'） */
  enqueueChange: (input: { domain: string; contentHash: string; baseVersion?: number; priority?: 'high' | 'normal' }) => void
  /** 当前降频档位 */
  tier: () => number
}

/**
 * 创建编排器。
 *
 * 关键行为（都有测试）：
 * 1. `start()` 把在途条目复位（崩溃恢复）并订阅切号 → **切号时清旧学号队列**；
 * 2. `tick()` 先按 high 优先上传，直到无可发条目；失败走 `markFailed`（退避，不丢）；
 * 3. 上传成功 → `markAcked`（从队列移除）；
 * 4. 学校查询周期受**降频档位**影响（`downshiftedInterval`），且**手动刷新无视周期**；
 * 5. 任何一步失败都**不抛**（返回统计），避免把定时器打断。
 */
export const createSyncOrchestrator = (deps: SyncOrchestratorDeps): SyncOrchestrator => {
  let downshift: DownshiftState = initialDownshiftState()
  let unsubscribe: (() => void) | null = null

  const start = (): (() => void) => {
    // 崩溃恢复：在途状态不可信 → 复位为 queued
    const recovered = recoverInflight(deps.readQueue(), deps.now())
    deps.writeQueue(recovered)

    if (deps.subscribeEpoch) {
      unsubscribe = deps.subscribeEpoch(() => {
        const sid = String(deps.currentSid() || '').trim()
        // 切号：清掉**旧**学号的残留。当前学号的条目保留（它们仍属于这个人）。
        const entries = deps.readQueue()
        const stale = new Set(entries.map((entry) => entry.sid).filter((value) => value && value !== sid))
        let next = entries
        for (const oldSid of stale) next = purgeSid(next, oldSid)
        deps.writeQueue(next)
      })
    }
    return () => {
      if (unsubscribe) unsubscribe()
      unsubscribe = null
    }
  }

  const drain = async (): Promise<DrainResult> => {
    let attempted = 0
    let succeeded = 0
    let failed = 0
    const sid = String(deps.currentSid() || '').trim()

    for (;;) {
      const now = deps.now()
      const entry = pickNext(deps.readQueue(), now, sid || undefined)
      if (!entry) return { attempted, succeeded, failed, idle: true }

      attempted += 1
      deps.writeQueue(markInflight(deps.readQueue(), entry.idempotencyKey, now))
      let outcome: UploadOutcome
      try {
        outcome = await deps.upload(entry)
      } catch {
        outcome = { ok: false }
      }
      if (outcome.ok) {
        succeeded += 1
        deps.writeQueue(markAcked(deps.readQueue(), entry.idempotencyKey))
        continue
      }
      failed += 1
      deps.writeQueue(
        markFailed(deps.readQueue(), entry.idempotencyKey, deps.now(), {
          retryAfterMs: outcome.retryAfterMs
        })
      )
      // 一条失败就结束本轮（避免对同一后端连续打）
      return { attempted, succeeded, failed, idle: false }
    }
  }

  const tick: SyncOrchestrator['tick'] = async (domains, options = {}) => {
    const drainResult = await drain()
    const now = deps.now()
    const polled: PollDomain[] = []

    for (const raw of Array.isArray(domains) ? domains : []) {
      const domain = String(raw || '').trim()
      if (!domain) continue
      const state = deps.readPollState?.(domain) || { lastCheckedAt: 0, inflight: false }
      const decision = decidePoll({
        domain,
        state,
        now,
        manual: options.manual,
        sessionValid: options.sessionValid
      })
      if (decision.action !== 'poll') continue
      polled.push(domain as PollDomain)
      // 记录在途 + 成功时刻（这里把「已发起」当作已检查：真正的失败由 recordSignal 降频）
      const nextState = markChecked(markPollInflight(state), now)
      deps.writePollState?.(domain, nextState)
    }

    return { polled, drain: drainResult, tier: downshift.tier }
  }

  const recordSignal = (signal: LoadSignal): void => {
    downshift = applyLoadSignal(downshift, signal)
  }

  const enqueueChange: SyncOrchestrator['enqueueChange'] = (input) => {
    const sid = String(deps.currentSid() || '').trim()
    if (!sid) return // 未登录不入队（避免把数据挂到错误的学号上）
    deps.writeQueue(
      enqueue(deps.readQueue(), {
        sid,
        domain: input.domain,
        contentHash: input.contentHash,
        baseVersion: input.baseVersion,
        priority: input.priority,
        now: deps.now()
      })
    )
  }

  return {
    start,
    tick,
    recordSignal,
    enqueueChange,
    tier: () => downshift.tier
  }
}

/** 当前档位下某域的实际周期（供调用方排定时器）。 */
export const effectivePollInterval = (
  baseIntervalMs: number,
  tier: number
): number => downshiftedInterval(baseIntervalMs, { tier, consecutivePressure: tier, consecutiveOk: 0 })
