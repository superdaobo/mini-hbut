// src/features/identity/identityIntentStore.spec.ts
//
// #621 Lifecycle 关键路径：状态机 / 去重 / 并发队列 / 终态推进 / 重置。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeIdentityIntent,
  dismissIdentityIntent,
  enqueueIdentityIntent,
  getIdentityIntentSnapshot,
  IDENTITY_QUEUE_FULL_MESSAGE,
  IDENTITY_QUEUE_MAX,
  resetIdentityIntentStore,
  setIdentityIntentPhase,
  subscribeIdentityIntentStore
} from './identityIntentStore'

const makeIntent = (requestId: string, handoff = 'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9') => ({
  requestId,
  handoff,
  arrivedAt: Date.now()
})

beforeEach(() => {
  resetIdentityIntentStore()
  vi.restoreAllMocks()
})

describe('identityIntentStore: 状态机与调度', () => {
  it('初始状态 idle，无活跃/队列', () => {
    const snap = getIdentityIntentSnapshot()
    expect(snap.phase).toBe('idle')
    expect(snap.active).toBeNull()
    expect(snap.queue).toEqual([])
    expect(snap.lastCompleted).toBeNull()
  })

  it('首个 intent 立即成为 active（received），phase 流转 idle -> received', () => {
    const result = enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    expect(result).toEqual({ accepted: true })
    const snap = getIdentityIntentSnapshot()
    expect(snap.phase).toBe('received')
    expect(snap.active?.requestId).toBe('ar_1111111111111111')
    expect(snap.active?.handoff).toBe('Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9')
    expect(snap.active?.arrivedAt).toBeTypeOf('number')
  })

  it('状态推进：received -> loading -> ready -> awaiting_local_login -> approving', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    setIdentityIntentPhase('ar_1111111111111111', 'loading')
    expect(getIdentityIntentSnapshot().active?.phase).toBe('loading')
    setIdentityIntentPhase('ar_1111111111111111', 'ready', { detail: { client_name: 'demo' } })
    expect(getIdentityIntentSnapshot().active?.phase).toBe('ready')
    expect(getIdentityIntentSnapshot().active?.detail).toEqual({ client_name: 'demo' })
    setIdentityIntentPhase('ar_1111111111111111', 'awaiting_local_login')
    expect(getIdentityIntentSnapshot().active?.phase).toBe('awaiting_local_login')
    setIdentityIntentPhase('ar_1111111111111111', 'approving')
    expect(getIdentityIntentSnapshot().active?.phase).toBe('approving')
  })

  it('仅活跃请求可推进状态；未知 requestId 忽略', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    setIdentityIntentPhase('ar_2222222222222222', 'loading')
    // 队列中的请求不可推进（只有 active 可流转）
    expect(getIdentityIntentSnapshot().queue[0].phase).toBe('received')
    setIdentityIntentPhase('ar_unknown0000000', 'loading')
    expect(getIdentityIntentSnapshot().active?.phase).toBe('received')
  })

  it('phase -> error 携带通用错误说明', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    setIdentityIntentPhase('ar_1111111111111111', 'error', { error: '请求已过期' })
    const snap = getIdentityIntentSnapshot()
    expect(snap.active?.phase).toBe('error')
    expect(snap.active?.error).toBe('请求已过期')
  })

  it('complete(done/error) 后自动推进队列下一个', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    enqueueIdentityIntent(makeIntent('ar_3333333333333333'))

    completeIdentityIntent('ar_1111111111111111', 'done')
    let snap = getIdentityIntentSnapshot()
    expect(snap.lastCompleted?.requestId).toBe('ar_1111111111111111')
    expect(snap.lastCompleted?.phase).toBe('done')
    expect(snap.active?.requestId).toBe('ar_2222222222222222')
    expect(snap.queue.map((q) => q.requestId)).toEqual(['ar_3333333333333333'])

    completeIdentityIntent('ar_2222222222222222', 'error', '用户拒绝')
    snap = getIdentityIntentSnapshot()
    expect(snap.active?.requestId).toBe('ar_3333333333333333')
    expect(snap.lastCompleted?.phase).toBe('error')
    expect(snap.lastCompleted?.error).toBe('用户拒绝')

    completeIdentityIntent('ar_3333333333333333', 'done')
    snap = getIdentityIntentSnapshot()
    expect(snap.phase).toBe('idle')
    expect(snap.active).toBeNull()
    expect(snap.queue).toEqual([])
  })

  it('complete 不匹配活跃请求时无副作用', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    completeIdentityIntent('ar_9999999999999999', 'done')
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
  })

  it('dismiss 丢弃队列中的请求（不影响 active）', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    dismissIdentityIntent('ar_2222222222222222')
    const snap = getIdentityIntentSnapshot()
    expect(snap.active?.requestId).toBe('ar_1111111111111111')
    expect(snap.queue).toEqual([])
  })

  it('dismiss 丢弃活跃请求并推进下一个', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    dismissIdentityIntent('ar_1111111111111111')
    const snap = getIdentityIntentSnapshot()
    expect(snap.active?.requestId).toBe('ar_2222222222222222')
    expect(snap.queue).toEqual([])
  })

  it('reset 清空全部状态', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    completeIdentityIntent('ar_1111111111111111', 'done')
    resetIdentityIntentStore()
    const snap = getIdentityIntentSnapshot()
    expect(snap.phase).toBe('idle')
    expect(snap.active).toBeNull()
    expect(snap.queue).toEqual([])
    expect(snap.lastCompleted).toBeNull()
  })
})

describe('identityIntentStore: 并发与去重（V1 确定行为）', () => {
  it('同 request_id 去重（活跃 + 队列均拒绝，不静默替换）', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    const dupActive = enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    expect(dupActive.accepted).toBe(false)
    if (!dupActive.accepted) expect(dupActive.reason).toBe('duplicate')

    enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    const dupQueued = enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    expect(dupQueued.accepted).toBe(false)
    if (!dupQueued.accepted) expect(dupQueued.reason).toBe('duplicate')
    // 队列只保留合法的新请求，重复请求不污染队列
    expect(getIdentityIntentSnapshot().queue.map((q) => q.requestId)).toEqual([
      'ar_2222222222222222'
    ])
  })

  it('队列上限：active + 3 个排队后拒绝第 4 个并返回超限提示', () => {
    enqueueIdentityIntent(makeIntent('ar_0000000000000000'))
    for (let i = 1; i <= IDENTITY_QUEUE_MAX; i += 1) {
      const result = enqueueIdentityIntent(makeIntent(`ar_${String(i).padStart(16, '0')}`))
      expect(result.accepted).toBe(true)
    }
    const full = enqueueIdentityIntent(makeIntent('ar_9999999999999999'))
    expect(full.accepted).toBe(false)
    if (!full.accepted) {
      expect(full.reason).toBe('queue-full')
      expect(full.message).toBe(IDENTITY_QUEUE_FULL_MESSAGE)
    }
    expect(getIdentityIntentSnapshot().queue).toHaveLength(IDENTITY_QUEUE_MAX)
  })

  it('一个请求终态后，队列中的下一个自动补位（后来请求不替换正在看的请求）', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    enqueueIdentityIntent(makeIntent('ar_2222222222222222'))
    enqueueIdentityIntent(makeIntent('ar_3333333333333333'))
    // 后到的请求进入队尾，不挤占当前
    enqueueIdentityIntent(makeIntent('ar_4444444444444444'))
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
    completeIdentityIntent('ar_1111111111111111', 'done')
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_2222222222222222')
    expect(getIdentityIntentSnapshot().queue.map((q) => q.requestId)).toEqual([
      'ar_3333333333333333',
      'ar_4444444444444444'
    ])
  })
})

describe('identityIntentStore: 订阅与 handoff 内存边界', () => {
  it('订阅者收到状态变更通知，退订后不再通知', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeIdentityIntentStore(listener)
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    expect(listener).toHaveBeenCalledTimes(1)
    completeIdentityIntent('ar_1111111111111111', 'done')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    resetIdentityIntentStore()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('快照返回副本：外部修改不影响内部状态', () => {
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    const snap = getIdentityIntentSnapshot()
    if (snap.active) snap.active.handoff = 'tampered'
    expect(getIdentityIntentSnapshot().active?.handoff).toBe(
      'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9'
    )
  })

  it('handoff 仅内存：store 不接受任何持久化目标参数（合同静态约束）', () => {
    // 合同层面：PendingExternalIntent 只有内存字段；本测试作为回归守卫，
    // 断言快照中不出现 storage/disk 相关字段。
    enqueueIdentityIntent(makeIntent('ar_1111111111111111'))
    const snap = getIdentityIntentSnapshot()
    for (const item of [snap.active, ...snap.queue, snap.lastCompleted]) {
      if (!item) continue
      expect(Object.keys(item).sort()).toEqual([
        'arrivedAt',
        'handoff',
        'phase',
        'requestId'
      ])
    }
  })
})
