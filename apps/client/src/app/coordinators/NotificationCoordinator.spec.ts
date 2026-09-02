// src/app/coordinators/NotificationCoordinator.spec.ts
// #759：小组件跨天定时器单测
//
// 覆盖：
// 1. scheduleWidgetCrossDayTimer 按「下一个 00:01（Asia/Shanghai）」调度
// 2. 定时器触发时调用 tryWriteSnapshotFromCache（内部按当下重算 date/weekday/周次）
// 3. 触发后自动重排下一次（每 24h 持续触发）
// 4. stopWidgetCrossDayTimer 清理后不再触发
// 5. 未登录（studentId 为空）不调度

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('../../utils/widget_bridge', () => ({
  tryWriteSnapshotFromCache: vi.fn(async () => {})
}))

vi.mock('../../utils/test_account.js', () => ({
  isTestAccountSession: vi.fn(() => false)
}))

vi.mock('../../platform', () => ({
  platformBridge: {
    addNotificationActionListener: vi.fn(async () => () => {})
  }
}))

vi.mock('../../platform/deep_link', () => ({
  installMiniHbutDeepLinkListeners: vi.fn()
}))

vi.mock('../../platform/notification_actions', () => ({
  resolveNotificationActionTarget: vi.fn(() => ({ view: 'home' }))
}))

vi.mock('../../navigation/app_navigation', () => ({
  normalizeViewName: (view: unknown) => String(view || '')
}))

import { createNotificationCoordinator, msUntilNextDayCrossover } from './NotificationCoordinator'
import { tryWriteSnapshotFromCache } from '../../utils/widget_bridge'

const mockTryWrite = vi.mocked(tryWriteSnapshotFromCache)

const SID = '2510231106'

const makeRuntime = (studentId: string) => {
  const state = {
    studentId: ref(studentId),
    currentView: ref('home'),
    widgetDeeplinkDate: ref(''),
    widgetDeeplinkPeriod: ref(0),
    mutable: {
      appBootstrapped: true,
      widgetCrossDayTimer: null as number | null,
      removeNotificationActionListener: null as (() => void) | null
    }
  }
  const runtime = {
    state,
    navigation: { goToView: vi.fn() },
    identity: { submitIntent: vi.fn() }
  } as unknown as Parameters<typeof createNotificationCoordinator>[0]
  const coordinator = createNotificationCoordinator(runtime)
  return { state, coordinator }
}

beforeEach(() => {
  mockTryWrite.mockClear()
  vi.useFakeTimers()
  // node 环境无 window：与 globalThis 共享（fake timers 替换的是 globalThis 上的定时器）
  vi.stubGlobal('window', globalThis)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('#759 小组件跨天定时器', () => {
  it('按「下一个 00:01（Asia/Shanghai）」的剩余毫秒数调度', () => {
    const { coordinator } = makeRuntime(SID)
    coordinator.scheduleWidgetCrossDayTimer()
    const crossover = msUntilNextDayCrossover()
    expect(crossover).toBeGreaterThan(60 * 1000)
    expect(crossover).toBeLessThanOrEqual((24 * 3600 + 60) * 1000)
    // 定时器在 crossover 前不应触发
    vi.advanceTimersByTime(crossover - 1000)
    expect(mockTryWrite).not.toHaveBeenCalled()
  })

  it('触发时调用 tryWriteSnapshotFromCache 并自动重排下一次', () => {
    const { coordinator } = makeRuntime(SID)
    coordinator.scheduleWidgetCrossDayTimer()

    const firstDelay = msUntilNextDayCrossover()
    vi.advanceTimersByTime(firstDelay)
    expect(mockTryWrite).toHaveBeenCalledTimes(1)
    expect(mockTryWrite).toHaveBeenCalledWith(SID)

    // 重排后的 delay = 到下一个 00:01（推进后恰好处于 00:01:00 → 24h）
    vi.advanceTimersByTime(24 * 3600 * 1000 - 1000)
    expect(mockTryWrite).toHaveBeenCalledTimes(1) // 未到点不触发
    vi.advanceTimersByTime(1000)
    expect(mockTryWrite).toHaveBeenCalledTimes(2)
  })

  it('stopWidgetCrossDayTimer 清理后不再触发', () => {
    const { coordinator } = makeRuntime(SID)
    coordinator.scheduleWidgetCrossDayTimer()
    coordinator.stopWidgetCrossDayTimer()

    vi.advanceTimersByTime((24 * 3600 + 60) * 1000)
    expect(mockTryWrite).not.toHaveBeenCalled()
  })

  it('studentId 为空时不调度', () => {
    const { coordinator } = makeRuntime('')
    coordinator.scheduleWidgetCrossDayTimer()
    vi.advanceTimersByTime((24 * 3600 + 60) * 1000)
    expect(mockTryWrite).not.toHaveBeenCalled()
  })
})
