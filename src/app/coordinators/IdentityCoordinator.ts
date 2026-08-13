// src/app/coordinators/IdentityCoordinator.ts
//
// #621：Identity 授权请求调度 Coordinator。
// OS 深链（minihbut://identity）与后续二维码扫描统一经 submitIntent 进入内存调度，
// #622（Device/Identity Client）/ #623（App Approval UX）通过本 Coordinator 与
// identityIntentStore 消费稳定的 IdentityIntent 合同。
// 本 Issue 不实现设备签名/最终 approve，也不建立任何后台实时连接：
// 只有收到深链/二维码/明确用户动作时才访问 Identity API（由 #622 承接 GET request detail）。

import type { AppRuntime, IdentityCoordinator } from '../contracts/runtime'
import {
  completeIdentityIntent,
  dismissIdentityIntent,
  enqueueIdentityIntent,
  getIdentityIntentSnapshot,
  resetIdentityIntentStore,
  setIdentityIntentPhase,
  subscribeIdentityIntentStore,
  type IdentityIntent,
  type IdentityIntentPhase
} from '../../features/identity/identityIntentStore'
import { showToast } from '../../utils/toast'

/** 本地 bootstrap 等待轮询：100ms 间隔、最多 5s（仅本地瞬态等待，不是网络轮询/常驻） */
const BOOT_WAIT_INTERVAL_MS = 100
const BOOT_WAIT_MAX_TICKS = 50

export const createIdentityCoordinator = (runtime: AppRuntime): IdentityCoordinator => {
  const { state } = runtime

  /** 冷启动缓冲：app shell 尚未 bootstrap 时收到的 Intent（仅内存，不持久化） */
  let pendingBuffer: IdentityIntent[] = []
  let bootWaitTimer: ReturnType<typeof setTimeout> | null = null

  const stopBootWait = (): void => {
    if (bootWaitTimer !== null) {
      clearTimeout(bootWaitTimer)
      bootWaitTimer = null
    }
  }

  const flushPendingIntents = (): void => {
    stopBootWait()
    if (pendingBuffer.length === 0) return
    const batch = pendingBuffer
    pendingBuffer = []
    for (const intent of batch) {
      const result = enqueueIdentityIntent(intent)
      if (!result.accepted) showToast(result.message, 'warning')
    }
  }

  const scheduleBootWait = (): void => {
    if (bootWaitTimer !== null || state.mutable.appBootstrapped) return
    let ticks = 0
    const tick = (): void => {
      if (state.mutable.appBootstrapped) {
        flushPendingIntents()
        return
      }
      ticks += 1
      if (ticks >= BOOT_WAIT_MAX_TICKS) {
        // 超时兜底：buffer 保留，等待 flushPendingIntents 显式冲刷（bootstrap 完成时必然调用）
        bootWaitTimer = null
        return
      }
      bootWaitTimer = setTimeout(tick, BOOT_WAIT_INTERVAL_MS)
    }
    bootWaitTimer = setTimeout(tick, BOOT_WAIT_INTERVAL_MS)
  }

  const submitIntent = (intent: IdentityIntent): void => {
    if (!intent || typeof intent.requestId !== 'string' || intent.requestId === '') return
    if (typeof intent.handoff !== 'string' || intent.handoff === '') return
    const normalized: IdentityIntent = {
      requestId: intent.requestId,
      handoff: intent.handoff,
      arrivedAt: typeof intent.arrivedAt === 'number' ? intent.arrivedAt : Date.now()
    }
    if (!state.mutable.appBootstrapped) {
      // 冷启动：shell 未就绪前只写入内存缓冲，不操作 UI；bootstrap 后统一入队
      pendingBuffer.push(normalized)
      scheduleBootWait()
      return
    }
    const result = enqueueIdentityIntent(normalized)
    if (!result.accepted) showToast(result.message, 'warning')
  }

  const dispose = (): void => {
    stopBootWait()
    pendingBuffer = []
  }

  return {
    submitIntent,
    flushPendingIntents,
    completeIntent: (requestId, status, error) => completeIdentityIntent(requestId, status, error),
    dismissIntent: (requestId) => dismissIdentityIntent(requestId),
    setPhase: (requestId, nextPhase: Exclude<IdentityIntentPhase, 'done' | 'error'> | 'error', options) =>
      setIdentityIntentPhase(requestId, nextPhase, options),
    reset: () => {
      dispose()
      resetIdentityIntentStore()
    },
    getSnapshot: () => getIdentityIntentSnapshot(),
    subscribe: (listener) => subscribeIdentityIntentStore(listener),
    dispose
  }
}
