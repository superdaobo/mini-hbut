// src/app/coordinators/LifecycleCoordinator.spec.ts
// #759：回前台（resume）时无条件补写小组件快照单测
//
// 背景：跨天定时器依赖 WebView 内存中的 setTimeout，WebView 冻结/进程被杀后失效，
// 小组件全天显示昨天。修复：handleAppResume 在登录态下无条件调用
// tryWriteSnapshotFromCache（与重排定时器并行，失败静默）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('../../platform/native', () => ({
  getCurrentNativeWindow: vi.fn(async () => null),
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

vi.mock('../../utils/debug_logger', () => ({
  pushDebugLog: vi.fn()
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
import { isIOSLike } from '../../platform/runtime'
import { getCurrentNativeWindow, isTauriRuntime } from '../../platform/native'

const mockTryWrite = vi.mocked(tryWriteSnapshotFromCache)
const mockIsIOSLike = vi.mocked(isIOSLike)
const mockIsTauriRuntime = vi.mocked(isTauriRuntime)
const mockGetCurrentNativeWindow = vi.mocked(getCurrentNativeWindow)

const SID = '2510231106'

const makeRuntime = (studentId: string, idleMs = 1000) => {
  const state = {
    studentId: ref(studentId),
    currentView: ref('home'),
    appShellRef: ref(null),
    homeScrollRestoring: ref(false),
    mutable: {
      appBootstrapped: true,
      lastResumeHandledAt: 0,
      resumePendingSnapshot: null,
      iosHardReloadCount: 0,
      iosReloadFallbackAt: 0,
      lastSoftRemountAt: 0,
      viewportResizeRaf: 0,
      desktopResizePerfTimer: null,
      capacitorAppStateListener: null,
      tauriWindowFocusUnlisten: null,
      removeHomeLayoutDiagnosticsErrorCapture: null
    }
  }
  const runtime = {
    state,
    stores: {
      lifecycle: {
        markHidden: vi.fn(),
        consumeHiddenDuration: vi.fn(() => idleMs)
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
  mockIsIOSLike.mockReturnValue(false)
  mockIsTauriRuntime.mockReturnValue(false)
  mockGetCurrentNativeWindow.mockResolvedValue(null)
  vi.stubGlobal(
    'document',
    {
      hidden: false,
      activeElement: null,
      documentElement: {
        clientHeight: 0,
        style: {
          setProperty: vi.fn(),
          getPropertyValue: () => ''
        },
        classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) }
      },
      body: null,
      querySelector: vi.fn(() => null),
      getElementById: vi.fn(() => null),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  )
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { callback(0); return 1 }),
    cancelAnimationFrame: vi.fn(),
    setTimeout,
    clearTimeout,
    innerHeight: 0,
    screen: { width: 0, height: 0 },
    location: { reload: vi.fn() },
    dispatchEvent: vi.fn()
  })
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

describe('#864 iOS 长后台恢复加固', () => {
  it('iOS 后台超过 10 分钟时即使 DOM 看似健康也强制 soft remount，并清除残留交互锁', () => {
    mockIsIOSLike.mockReturnValue(true)
    const { state, runtime, coordinator } = makeRuntime(SID, 11 * 60 * 1000)
    state.homeScrollRestoring.value = true

    coordinator.handleAppResume('visibilitychange')

    expect(runtime.navigation.restoreViewFromSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        softRemount: true,
        allowHardReload: false,
        idleMs: 11 * 60 * 1000
      })
    )
    expect(state.homeScrollRestoring.value).toBe(false)
  })

  it('原生 Tauri focus 信号可绕过冻结后 stale document.hidden，普通 WebView 信号仍会被拦截', () => {
    mockIsIOSLike.mockReturnValue(true)
    ;(document as any).hidden = true
    const { runtime, coordinator } = makeRuntime(SID)

    coordinator.handleAppResume('visibilitychange')
    expect(runtime.navigation.restoreViewFromSnapshot).not.toHaveBeenCalled()

    coordinator.handleAppResume('tauri-window-focus')
    expect(runtime.navigation.restoreViewFromSnapshot).toHaveBeenCalledTimes(1)
  })

  it('strict DOM health 不把冻结遗留的 transition active class 当成健康', () => {
    const transitionRoot = {
      matches: vi.fn(() => true),
      querySelector: vi.fn(() => null),
      classList: { contains: vi.fn(() => false) },
      childElementCount: 1
    }
    const shell = {
      querySelector: vi.fn((selector: string) =>
        selector === '.view-transition-root' ? transitionRoot : null
      )
    }
    const { state, coordinator } = makeRuntime(SID)
    ;(state.appShellRef as any).value = shell

    expect(coordinator.isCurrentViewDomHealthy('home')).toBe(true)
    expect(coordinator.isCurrentViewDomHealthy('home', { strict: true })).toBe(false)
  })

  it('Tauri iOS 注册原生 window focus 监听，并用它补齐 WebView 生命周期信号', async () => {
    mockIsIOSLike.mockReturnValue(true)
    mockIsTauriRuntime.mockReturnValue(true)
    const unlisten = vi.fn()
    const handlerRef: { current?: (event: { payload: boolean }) => void } = {}
    const onFocusChanged = vi.fn(async (handler: (event: { payload: boolean }) => void) => {
      handlerRef.current = handler
      return unlisten
    })
    mockGetCurrentNativeWindow.mockResolvedValue({ onFocusChanged } as any)
    const { runtime, coordinator } = makeRuntime(SID)

    coordinator.installResumeListeners()
    await vi.waitFor(() => expect(onFocusChanged).toHaveBeenCalledTimes(1))

    expect(handlerRef.current).toBeTypeOf('function')
    handlerRef.current!({ payload: false })
    expect(runtime.stores.lifecycle.markHidden).toHaveBeenCalledTimes(1)

    ;(document as any).hidden = true
    handlerRef.current!({ payload: true })
    expect(runtime.navigation.restoreViewFromSnapshot).toHaveBeenCalledTimes(1)

    coordinator.dispose()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })
})
