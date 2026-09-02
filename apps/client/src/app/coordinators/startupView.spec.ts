// src/app/coordinators/startupView.spec.ts
//
// GitHub #761：开屏页选择「课表」后启动仍显示首页——启动视图决策测试。
//
// 根因回顾：
// - setup 阶段 readStartupSnapshot() 正确按 startupPage 设置得到 initialView='schedule'；
// - 但 onMounted 的 syncFromHash() 在冷启动无 hash 路由时无条件 applyViewState('home')，
//   把启动页设置结果抹掉；
// - 次要隐患：readStartupSnapshot 中 `snapshot?.view || startupPageSetting` 让 WebView
//   会话残留的 history 快照优先级高于启动页设置。
//
// 修复语义：
// ①冷启动（无 hash 深链）：startupPage 设置优先，残留 history 快照不覆盖；
// ②带 `#/学号/视图` 显式视图的 hash 深链：hash 优先（深链行为不受破坏）；
// ③syncFromHash 无 hash 路由时保留 setup 阶段的 currentView，不再强制回 home。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createNavigationCoordinator } from './NavigationCoordinator'
import type { AppRuntime } from '../contracts/runtime'

// ─── 模块 mock（NavigationCoordinator 的全部带副作用依赖） ─────────────────

// 启动页设置可变：测试内通过 setStartupPage 切换
let startupPageSetting = 'home'

vi.mock('../../utils/ui_settings', () => ({
  useUiSettings: () => ({ startupPage: startupPageSetting })
}))

vi.mock('../viewRegistry', () => ({
  VIEW_PREFETCHERS: {}
}))

vi.mock('../../config/app_store_policy', () => ({
  isViewAllowed: vi.fn(() => true)
}))

vi.mock('../../utils/moduleAccess', () => ({
  canOpenModule: vi.fn(() => ({ ok: true }))
}))

vi.mock('../../utils/toast', () => ({
  showToast: vi.fn()
}))

vi.mock('../../utils/remembered_username', () => ({
  saveRememberedUsername: vi.fn()
}))

vi.mock('../../utils/schedule_prefetch.js', () => ({
  readScheduleRenderSnapshot: vi.fn(() => null),
  clearScheduleRenderSnapshot: vi.fn(),
  SCHEDULE_POPUP_PENDING_KEY: 'hbu_schedule_popup_pending',
  SCHEDULE_SWITCH_PENDING_KEY: 'hbu_schedule_switch_pending'
}))

vi.mock('../../utils/usage_tracker.js', () => ({
  trackViewNavigation: vi.fn()
}))

vi.mock('../../utils/daily_access_key.js', () => ({
  isProtectedView: vi.fn(() => false),
  hasDailyAccessGrant: vi.fn(() => true),
  markDailyAccessGranted: vi.fn(),
  sanitizeDailyAccessInput: (value: unknown) => String(value ?? ''),
  verifyDailyAccessKey: vi.fn(() => false)
}))

vi.mock('../../utils/more_modules', () => ({
  canUseLocalModuleBridgePreview: vi.fn(() => false),
  isLocalModuleBridgePreviewUrl: vi.fn(() => false),
  normalizeModuleHostSessionPayload: vi.fn(async (payload) => payload || {}),
  resolveModuleHostPreviewSource: vi.fn(() => ({
    resolvedPreviewUrl: '',
    sourceKind: '',
    localPreviewUrl: '',
    packageUrls: null
  }))
}))

vi.mock('../../platform/native', () => ({
  exitNativeApp: vi.fn(),
  getCurrentNativeWindow: vi.fn(),
  isTauriRuntime: vi.fn(() => false)
}))

vi.mock('../../platform/runtime', () => ({
  isDesktopLike: vi.fn(() => false),
  isIOSLike: vi.fn(() => false)
}))

vi.mock('../../utils/boot_metrics', () => ({
  resetBootMetrics: vi.fn(),
  hasBootMetric: vi.fn(() => false),
  markBootMetric: vi.fn()
}))

// ─── 测试基建 ───────────────────────────────────────────────────────────────

type WindowRoute = { historyState?: Record<string, unknown> | null; hash?: string }

const setWindowRoute = ({ historyState = null, hash = '' }: WindowRoute = {}) => {
  ;(globalThis as unknown as { window: unknown }).window = {
    history: { state: historyState, replaceState: vi.fn(), pushState: vi.fn(), length: 2 },
    location: { hash }
  }
}

const makeCoordinator = () => {
  const state = {
    studentId: ref(''),
    currentView: ref('home'),
    activeTab: ref('home'),
    currentModule: ref(''),
    navDirection: ref('none'),
    moduleHostSession: ref({ module_id: '' }),
    pendingProtectedView: ref(null as unknown),
    dailyAccessInput: ref(''),
    dailyAccessError: ref(''),
    showDailyAccessDialog: ref(false),
    showExitDialog: ref(false),
    exitingApp: ref(false),
    viewRenderNonce: ref(0),
    gradeData: ref<unknown[]>([]),
    appShellRef: ref(null),
    homeScrollSnapshot: ref(0),
    homeScrollRestoring: ref(false),
    isLoggedIn: ref(true),
    mutable: { lastSoftRemountAt: 0 }
  }
  const runtime = {
    state,
    auth: { handleRequireLogin: vi.fn() },
    grade: { loadGradesForCurrentView: vi.fn() },
    lifecycle: {
      recoverViewportAfterTransition: vi.fn(),
      isCurrentViewDomHealthy: vi.fn(() => true),
      nudgeWebViewPaint: vi.fn()
    }
  } as unknown as AppRuntime
  return { state, coordinator: createNavigationCoordinator(runtime) }
}

describe('启动视图决策（#761）', () => {
  beforeEach(() => {
    startupPageSetting = 'home'
  })

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window
  })

  it('①冷启动 + 启动页为课表：initialView 为 schedule，且 syncFromHash 后不被抹回 home', async () => {
    startupPageSetting = 'schedule'
    setWindowRoute({ historyState: null, hash: '' })

    const { state, coordinator } = makeCoordinator()
    const startup = coordinator.readStartupSnapshot()

    expect(startup.initialView).toBe('schedule')
    expect(startup.startupPageSetting).toBe('schedule')

    // 复刻 useAppRuntime setup 的赋值 + onMounted 的 syncFromHash
    state.currentView.value = startup.initialView
    await coordinator.syncFromHash()

    expect(state.currentView.value).toBe('schedule')
  })

  it('②冷启动 + 未设置启动页：回退 home，syncFromHash 后仍为 home', async () => {
    startupPageSetting = 'home'
    setWindowRoute({ historyState: null, hash: '' })

    const { state, coordinator } = makeCoordinator()
    const startup = coordinator.readStartupSnapshot()

    expect(startup.initialView).toBe('home')
    state.currentView.value = startup.initialView
    await coordinator.syncFromHash()

    expect(state.currentView.value).toBe('home')
  })

  it('③带 #/学号/视图 的 hash 深链：按深链路由并同步学号，不受启动页设置影响', async () => {
    startupPageSetting = 'home'
    setWindowRoute({ historyState: null, hash: '#/1234567890/grades' })

    const { state, coordinator } = makeCoordinator()
    const startup = coordinator.readStartupSnapshot()

    expect(startup.initialView).toBe('grades')
    state.currentView.value = startup.initialView
    await coordinator.syncFromHash()

    expect(state.studentId.value).toBe('1234567890')
    expect(state.currentView.value).toBe('grades')
    // grades 非主 tab 也非「我的」子页 → tab 回退 home，module 记为视图名
    expect(state.activeTab.value).toBe('home')
    expect(state.currentModule.value).toBe('grades')
  })

  it('次要隐患：残留 history 快照（view=schedule）不覆盖「首页」启动页设置', () => {
    startupPageSetting = 'home'
    setWindowRoute({
      historyState: { __hbu: true, sid: '1234567890', view: 'schedule', tab: 'schedule', module: '' },
      hash: ''
    })

    const { coordinator } = makeCoordinator()
    const startup = coordinator.readStartupSnapshot()

    // 冷启动（无显式视图深链）→ 启动页设置优先
    expect(startup.initialView).toBe('home')
    expect(startup.initialTab).toBe('home')
  })

  it('冷启动 + 启动页为课表 + 残留 history 快照：initialView 为 schedule 且保留学号 hint', () => {
    startupPageSetting = 'schedule'
    setWindowRoute({
      historyState: { __hbu: true, sid: '1234567890', view: 'home', tab: 'home', module: '' },
      hash: ''
    })

    const { coordinator } = makeCoordinator()
    const startup = coordinator.readStartupSnapshot()

    // 启动页设置生效；学号 hint 保留供快速课表启动复用
    expect(startup.initialView).toBe('schedule')
    expect(startup.bootStudentIdHint).toBe('1234567890')
    expect(startup.initialTab).toBe('schedule')
  })

  it('#/学号（无显式视图）的 hash 视为冷启动：启动页设置优先，学号 hint 来自 hash', () => {
    startupPageSetting = 'schedule'
    setWindowRoute({ historyState: null, hash: '#/1234567890' })

    const { coordinator } = makeCoordinator()
    const startup = coordinator.readStartupSnapshot()

    expect(startup.initialView).toBe('schedule')
    expect(startup.bootStudentIdHint).toBe('1234567890')
  })
})
