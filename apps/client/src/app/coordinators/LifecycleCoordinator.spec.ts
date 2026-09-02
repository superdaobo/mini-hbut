// src/app/coordinators/LifecycleCoordinator.spec.ts
// #759：回前台（resume）时无条件补写小组件快照单测
//
// 背景：跨天定时器依赖 WebView 内存中的 setTimeout，WebView 冻结/进程被杀后失效，
// 小组件全天显示昨天。修复：handleAppResume 在登录态下无条件调用
// tryWriteSnapshotFromCache（与重排定时器并行，失败静默）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('../../platform/native', () => ({
  isCapacitorRuntime: vi.fn(() => false),
  isTauriRuntime: vi.fn(() => false)
}))

vi.mock('../../platform/runtime', () => ({
  isAndroidLike: vi.fn(() => false),
  isDesktopLike: vi.fn(() => false),
  isIOSLike: vi.fn(() => false)
}))

vi.mock('../../utils/campus_network_service', () => ({
  runCampusNetworkAutoLogin: vi.fn(() => Promise.resolve())
}))

vi.mock('../../navigation/app_navigation', () => ({
  normalizeViewName: (view: unknown) => String(view || 'home')
}))

vi.mock('../../utils/widget_bridge', () => ({
  tryWriteSnapshotFromCache: vi.fn(async () => {})
}))

vi.mock('../../utils/local_reminder_scheduler', () => ({
  reconcileLocalReminders: vi.fn(() => Promise.resolve())
}))

vi.mock('../../utils/background_notification', () => ({
  consumeBackgroundEventsOnce: vi.fn(() => Promise.resolve())
}))

vi.mock('../../utils/school_website_embed.ts', () => ({
  recoverSchoolWebsiteBridgeOnResume: vi.fn(() => Promise.resolve(true)),
  invokeEnsureHttpBridge: vi.fn(() => Promise.resolve({ status: 'ok' }))
}))

import { createLifecycleCoordinator } from './LifecycleCoordinator'
import { tryWriteSnapshotFromCache } from '../../utils/widget_bridge'

const mockTryWrite = vi.mocked(tryWriteSnapshotFromCache)

const SID = '2510231106'

const makeRuntime = (studentId: string) => {
  const state = {
    studentId: ref(studentId),
    currentView: ref('home'),
    appShellRef: ref(null),
    mutable: {
      appBootstrapped: true,
      lastResumeHandledAt: 0,
      resumePendingSnapshot: null,
      iosHardReloadCount: 0,
      iosReloadFallbackAt: 0,
      viewportResizeRaf: 0,
      desktopResizePerfTimer: null,
      capacitorAppStateListener: null,
      removeHomeLayoutDiagnosticsErrorCapture: null
    }
  }
  const runtime = {
    state,
    stores: {
      lifecycle: {
        markHidden: vi.fn(),
        consumeHiddenDuration: vi.fn(() => 1000)
      }
    },
    navigation: {
      readWindowRouteSnapshot: vi.fn(() => ({ view: 'home' })),
      collectCurrentViewSnapshot: vi.fn(() => ({ view: 'home' })),
      restoreViewFromSnapshot: vi.fn(async () => {}),
      forceScrollTop: vi.fn(),
      goToView: vi.fn()
    },
    notification: {
      scheduleWidgetCrossDayTimer: vi.fn(),
      stopWidgetCrossDayTimer: vi.fn()
    }
  } as unknown as Parameters<typeof createLifecycleCoordinator>[0]
  const coordinator = createLifecycleCoordinator(runtime)
  return { state, runtime, coordinator }
}

/** 排空微任务队列；动态 import() 模块加载链较深，轮询等待是唯一可靠方式 */
const flushAsync = async (times = 12) => {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

/** 等待异步补写链（动态 import → then → async mock）执行完成 */
const waitForTryWrite = async (times: number) => {
  await vi.waitFor(() => expect(mockTryWrite).toHaveBeenCalledTimes(times), { timeout: 2000 })
}

beforeEach(() => {
  mockTryWrite.mockClear()
  vi.stubGlobal(
    'document',
    {
      hidden: false,
      documentElement: {
        clientHeight: 0,
        style: {
          setProperty: vi.fn(),
          getPropertyValue: () => ''
        },
        classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) }
      },
      body: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  )
  vi.stubGlobal('window', globalThis)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('#759 回前台补写小组件快照', () => {
  it('登录态回前台：无条件调用 tryWriteSnapshotFromCache 并重排跨天定时器', async () => {
    const { runtime, coordinator } = makeRuntime(SID)
    coordinator.handleAppResume('visibilitychange')
    await waitForTryWrite(1)

    expect(mockTryWrite).toHaveBeenCalledWith(SID)
    expect(runtime.notification.scheduleWidgetCrossDayTimer).toHaveBeenCalledTimes(1)
  })

  it('resume 连发（visibility/pageshow/focus）被 320ms 节流合并，只补写一次', async () => {
    const { coordinator } = makeRuntime(SID)
    coordinator.handleAppResume('visibilitychange')
    coordinator.handleAppResume('pageshow')
    coordinator.handleAppResume('focus')
    await waitForTryWrite(1)
    await flushAsync()

    expect(mockTryWrite).toHaveBeenCalledTimes(1)
  })

  it('未登录（studentId 为空）：不补写快照、不重排定时器', async () => {
    const { runtime, coordinator } = makeRuntime('')
    coordinator.handleAppResume('visibilitychange')
    await flushAsync()

    expect(mockTryWrite).not.toHaveBeenCalled()
    expect(runtime.notification.scheduleWidgetCrossDayTimer).not.toHaveBeenCalled()
  })

  it('补写失败被静默吞掉，不影响 resume 主流程', async () => {
    mockTryWrite.mockRejectedValueOnce(new Error('bridge down'))
    const { coordinator } = makeRuntime(SID)
    expect(() => coordinator.handleAppResume('visibilitychange')).not.toThrow()
    await waitForTryWrite(1)
  })
})
