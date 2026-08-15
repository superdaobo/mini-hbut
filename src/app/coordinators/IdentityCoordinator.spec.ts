// src/app/coordinators/IdentityCoordinator.spec.ts
//
// #621 Lifecycle 关键路径（调度侧）：冷启动缓冲 / 热启动直通 / 去重与超限提示。
// #623 扩展后：收到请求会自动启动加载流程（fetchRequestDetail 被 mock 为挂起状态，
// 使本文件聚焦 #621 调度合同；#623 流程细节见 identityCoordinatorFlow.spec.ts）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdentityCoordinator } from './IdentityCoordinator'
import { getIdentityIntentSnapshot, resetIdentityIntentStore } from '../../features/identity/identityIntentStore'
import { resetIdentityUiState } from '../../features/identity/identityStore'

vi.mock('../../utils/toast', () => ({
  showToast: vi.fn()
}))

// #623 流程依赖：挂起（never resolve），避免加载流程干扰 #621 调度断言
vi.mock('../../features/identity/identityService', () => ({
  fetchRequestDetail: vi.fn(() => new Promise(() => {})),
  fetchEnrollmentChallenge: vi.fn(() => new Promise(() => {})),
  submitApprove: vi.fn(() => new Promise(() => {})),
  submitTerminalAction: vi.fn(() => new Promise(() => {})),
  getIdentityBffBaseUrl: vi.fn(() => 'https://auth.example.test'),
  getIdentityCoreBaseUrl: vi.fn(() => 'https://core.example.test'),
  isTestAccountBlocked: vi.fn(() => false),
  createServiceError: vi.fn(() => new Error('mocked'))
}))

import { showToast } from '../../utils/toast'

const makeRuntime = (appBootstrapped: boolean) =>
  ({
    state: { mutable: { appBootstrapped } }
  }) as Parameters<typeof createIdentityCoordinator>[0]

const makeIntent = (requestId: string) => ({
  requestId,
  handoff: 'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9',
  arrivedAt: Date.now()
})

beforeEach(() => {
  resetIdentityIntentStore()
  resetIdentityUiState()
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('IdentityCoordinator: 冷启动 / 热启动调度', () => {
  it('cold start：bootstrap 前收到链接不丢（内存缓冲），flush 后进入队列', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(false))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    // 未 bootstrap：不进入 store，也不丢
    expect(getIdentityIntentSnapshot().active).toBeNull()
    expect(showToast).not.toHaveBeenCalled()
    // bootstrap 完成（useAppRuntime 调用）
    coordinator.flushPendingIntents()
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
  })

  it('cold start：bootstrap 完成瞬间的轮询兜底也会冲刷缓冲', () => {
    const runtime = makeRuntime(false)
    const coordinator = createIdentityCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    // bootstrap 完成，轮询 tick 触发自动 flush
    runtime.state.mutable.appBootstrapped = true
    vi.advanceTimersByTime(100)
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
  })

  it('warm start：已 bootstrap 时直接进入队列并成为 active（#623 自动进入加载）', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(true))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
    // #623：提交后自动推进 received -> loading（挂起在 fetchRequestDetail）。
    // 注意顶层 phase 属于 #621 调度状态（active 变更时重置为 received），
    // 请求自身的状态机看 active.phase。
    expect(getIdentityIntentSnapshot().active?.phase).toBe('loading')
  })

  it('warm start：多个并发链接进入队列，后来的请求不替换当前', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(true))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    coordinator.submitIntent(makeIntent('ar_2222222222222222'))
    coordinator.submitIntent(makeIntent('ar_3333333333333333'))
    const snap = getIdentityIntentSnapshot()
    expect(snap.active?.requestId).toBe('ar_1111111111111111')
    expect(snap.queue.map((q) => q.requestId)).toEqual([
      'ar_2222222222222222',
      'ar_3333333333333333'
    ])
  })

  it('duplicate 链接去重并提示（不覆盖当前请求）', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(true))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
    expect(getIdentityIntentSnapshot().queue).toEqual([])
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('队列超限提示（active + 最多 3 个排队，第 5 个拒绝）', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(true))
    coordinator.submitIntent(makeIntent('ar_0000000000000000'))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    coordinator.submitIntent(makeIntent('ar_2222222222222222'))
    coordinator.submitIntent(makeIntent('ar_3333333333333333'))
    // 前 4 个全部接受（1 active + 3 排队）
    expect(getIdentityIntentSnapshot().queue).toHaveLength(3)
    expect(showToast).not.toHaveBeenCalled()
    coordinator.submitIntent(makeIntent('ar_4444444444444444'))
    expect(getIdentityIntentSnapshot().queue).toHaveLength(3)
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('已有多个待处理授权，请先完成当前请求', 'warning')
  })

  it('无效 intent（空 requestId/handoff）静默忽略', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(true))
    coordinator.submitIntent({ requestId: '', handoff: '', arrivedAt: 0 })
    coordinator.submitIntent({ requestId: 'ar_1111111111111111', handoff: '', arrivedAt: 0 })
    expect(getIdentityIntentSnapshot().active).toBeNull()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('completeIntent 终态后自动推进下一个；reset 清空', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(true))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    coordinator.submitIntent(makeIntent('ar_2222222222222222'))
    coordinator.completeIntent('ar_1111111111111111', 'done')
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_2222222222222222')
    coordinator.reset()
    expect(getIdentityIntentSnapshot().phase).toBe('idle')
    expect(getIdentityIntentSnapshot().active).toBeNull()
  })

  it('dispose 停止缓冲等待；后续 flush 不处理已清空缓冲', () => {
    const coordinator = createIdentityCoordinator(makeRuntime(false))
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    coordinator.dispose()
    coordinator.flushPendingIntents()
    expect(getIdentityIntentSnapshot().active).toBeNull()
  })
})
