/**
 * 生命周期 Coordinator（Phase 5：#574）
 *
 * 从 App.vue 迁出的应用 resume / visibility / viewport / DOM 健康检查 /
 * WebView paint nudge / iOS 软重挂与硬 reload 兜底逻辑（#451 / #453）。
 */
import { nextTick } from 'vue'
import type { AppRuntime, LifecycleCoordinator } from '../contracts/runtime'
import {
  IOS_RESUME_SOFT_REMOUNT_MS,
  IOS_RESUME_HARD_RELOAD_MS,
  IOS_RELOAD_MIN_INTERVAL_MS,
  IOS_HARD_RELOAD_MAX_PER_SESSION
} from '../state/constants'
import { runCampusNetworkAutoLogin } from '../../utils/campus_network_service'
import { isCapacitorRuntime, isTauriRuntime } from '../../platform/native'
import {
  isAndroidLike as detectAndroidLike,
  isDesktopLike as detectDesktopLike,
  isIOSLike as detectIOSLike
} from '../../platform/runtime'
import { normalizeViewName } from '../../navigation/app_navigation'

const VIEW_HEALTH_SELECTOR_MAP: Record<string, string> = Object.freeze({
  home: '.dashboard-root',
  schedule: '.schedule-view',
  classroom: '.classroom-view',
  chaoxing_hub: '.cx-hub',
  more_module_host: '.more-module-host-view',
  school_website: '.school-website-view',
  more: '.more-view',
  me: '.me-view'
})

export const createLifecycleCoordinator = (runtime: AppRuntime): LifecycleCoordinator => {
  const { state, stores } = runtime
  const isIOSLike = detectIOSLike()
  const isAndroidLike = detectAndroidLike()
  const isDesktopLike = detectDesktopLike()
  const hasTauri = isTauriRuntime()
  const isCapacitor = isCapacitorRuntime()

  const forceScrollTop = () => {
    try {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      if (state.appShellRef.value) {
        state.appShellRef.value.scrollTop = 0
      }
    } catch {
      // ignore
    }
  }

  const updateViewportUnit = () => {
    if (typeof window === 'undefined') return
    // 优先 clientHeight，避免地址栏/键盘/可视窗口瞬时波动导致“二次缩放”
    const viewportHeight =
      document.documentElement.clientHeight ||
      window.innerHeight ||
      window.visualViewport?.height
    if (!viewportHeight) return
    const nextVh = viewportHeight * 0.01
    const prevVh = Number.parseFloat(document.documentElement.style.getPropertyValue('--app-vh'))
    // 忽略小于约 10px 的抖动（0.1vh * 100），避免页面进入后瞬时缩放
    if (Number.isFinite(prevVh) && Math.abs(prevVh - nextVh) < 0.1) return
    document.documentElement.style.setProperty('--app-vh', `${nextVh}px`)
  }

  const readCssSafeAreaBottom = () => {
    if (typeof document === 'undefined' || !document.body) return 0
    const probe = document.createElement('div')
    probe.style.cssText = [
      'position:fixed',
      'visibility:hidden',
      'pointer-events:none',
      'padding-bottom:env(safe-area-inset-bottom, 0px)'
    ].join(';')
    document.body.appendChild(probe)
    const safeBottom = Number.parseFloat(window.getComputedStyle(probe).paddingBottom) || 0
    probe.remove()
    return safeBottom
  }

  const updateNativeSafeAreaFallback = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const root = document.documentElement
    const shouldUseNativeFallback = isIOSLike && (hasTauri || isCapacitor)
    if (!shouldUseNativeFallback || readCssSafeAreaBottom() > 0) {
      root.classList.remove('native-safe-area-fallback')
      return
    }
    root.classList.add('native-safe-area-fallback')
  }

  const recoverViewportAfterTransition = ({ scrollToTop = true, blurActive = true } = {}) => {
    const activeEl = document.activeElement as HTMLElement | null
    if (blurActive && activeEl && typeof activeEl.blur === 'function') {
      activeEl.blur()
    }
    updateViewportUnit()
    nextTick(() => {
      if (scrollToTop) {
        forceScrollTop()
      }
      requestAnimationFrame(() => {
        if (scrollToTop) {
          forceScrollTop()
        }
        updateViewportUnit()
      })
    })
  }

  const isCurrentViewDomHealthy = (view = state.currentView.value) => {
    try {
      const root = state.appShellRef.value || document.querySelector('.app-shell')
      if (!root) return false
      const transitionRoot = root.querySelector('.view-transition-root')
      if (!transitionRoot) return false

      // leave/enter 过渡中子树可能短暂为空，勿判死
      // 兼容三套过渡类：name 兜底（module-fade-*）、方向类（module-fade-fwd/back-*）、Vue 基础 v-*
      const leaving = transitionRoot.querySelector(
        '.v-leave-active, .v-enter-active, .module-fade-leave-active, .module-fade-enter-active, .module-fade-fwd-leave-active, .module-fade-fwd-enter-active, .module-fade-back-leave-active, .module-fade-back-enter-active'
      )
      if (leaving) return true

      const expectedSelector = VIEW_HEALTH_SELECTOR_MAP[normalizeViewName(view)]
      if (expectedSelector) {
        const el = transitionRoot.querySelector(expectedSelector)
        if (!el) return false
        // 有节点但完全无布局尺寸时仍可能是半死 WebView
        try {
          const rect = el.getBoundingClientRect()
          if (rect.width <= 0 && rect.height <= 0) return false
        } catch {
          // getBoundingClientRect 异常时保守认为「存在即可」
        }
        return true
      }
      return transitionRoot.childElementCount > 0
    } catch {
      // 健康检查自身绝不能抛出导致 resume 崩溃
      return true
    }
  }

  /**
   * #451：硬 reload 末级兜底，强节流 + 每会话上限，避免白屏循环。
   */
  const maybeHardReloadAfterResume = (targetView: string, { idleMs = 0 } = {}) => {
    if (!isIOSLike) return false
    if (state.mutable.iosHardReloadCount >= IOS_HARD_RELOAD_MAX_PER_SESSION) return false
    if (idleMs < IOS_RESUME_HARD_RELOAD_MS) return false
    if (isCurrentViewDomHealthy(targetView)) return false
    const now = Date.now()
    if (now - state.mutable.iosReloadFallbackAt < IOS_RELOAD_MIN_INTERVAL_MS) return false
    state.mutable.iosReloadFallbackAt = now
    state.mutable.iosHardReloadCount += 1
    try {
      console.warn('[Lifecycle#451] hard reload fallback', {
        view: targetView,
        idleMs,
        count: state.mutable.iosHardReloadCount
      })
    } catch {
      // ignore
    }
    try {
      window.location.reload()
    } catch {
      // ignore
    }
    return true
  }

  const nudgeWebViewPaint = (
    targetView = state.currentView.value,
    { verify = false, allowReload = false, idleMs = 0 } = {}
  ) => {
    const root = document.getElementById('app')
    if (!root) return
    try {
      root.style.opacity = '0.999'
      root.style.transform = 'translateZ(0)'
      requestAnimationFrame(() => {
        try {
          root.style.opacity = '1'
          root.style.transform = ''
        } catch {
          // ignore paint nudge failures
        }
      })
    } catch {
      // ignore
    }
    if (!verify) return
    // 仅在恢复场景下做健康检查；二次确认后再考虑硬 reload（#451）
    setTimeout(() => {
      if (isCurrentViewDomHealthy(targetView)) return
      // 再等一帧布局，减少误判
      setTimeout(() => {
        if (isCurrentViewDomHealthy(targetView)) return
        if (!allowReload) return
        maybeHardReloadAfterResume(targetView, { idleMs })
      }, 400)
    }, 800)
  }

  const scheduleViewportUpdate = () => {
    // 桌面端避免频繁重算 vh 导致“进入后瞬间缩放”；
    // 移动端仍保留实时同步（地址栏/刘海安全区会变化）。
    if (!isIOSLike && !isAndroidLike) {
      const hasVh = !!document.documentElement.style.getPropertyValue('--app-vh')
      updateNativeSafeAreaFallback()
      if (!hasVh) updateViewportUnit()
      return
    }
    updateNativeSafeAreaFallback()
    updateViewportUnit()
  }

  const markDesktopWindowResizing = () => {
    if (!isDesktopLike || typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.add('window-resizing')
    if (state.mutable.desktopResizePerfTimer) {
      window.clearTimeout(state.mutable.desktopResizePerfTimer)
    }
    state.mutable.desktopResizePerfTimer = window.setTimeout(() => {
      root.classList.remove('window-resizing')
      state.mutable.desktopResizePerfTimer = null
    }, 180)
  }

  const handleViewportResize = () => {
    markDesktopWindowResizing()
    if (state.mutable.viewportResizeRaf) return
    state.mutable.viewportResizeRaf = window.requestAnimationFrame(() => {
      state.mutable.viewportResizeRaf = 0
      scheduleViewportUpdate()
    })
  }

  const recoverEmbeddedWebAfterResume = async (targetView: string, idleMs = 0) => {
    try {
      const {
        recoverSchoolWebsiteBridgeOnResume,
        invokeEnsureHttpBridge
      } = await import('../../utils/school_website_embed.ts')
      // #453：resume 先 ensure bridge，再 remount 内嵌
      let ensureResult: Record<string, unknown> | null = null
      try {
        ensureResult = await invokeEnsureHttpBridge()
      } catch {
        ensureResult = null
      }
      const bridgeOk = await recoverSchoolWebsiteBridgeOnResume()
      // 挂后台超过 8s 或 bridge 曾不可达：对官网 / 模块宿主发自定义事件强制 remount
      if (idleMs >= 8000 || !bridgeOk || targetView === 'school_website' || targetView === 'more_module_host') {
        window.dispatchEvent(new CustomEvent('hbu-embed-resume', {
          detail: {
            view: targetView,
            bridgeOk,
            idleMs,
            source: 'app-resume',
            ensureStatus: ensureResult?.status || null,
            bridgeEnabled: ensureResult?.enabled !== false,
            // 明确降级信号：bridge 仍不可用时宿主应展示可操作 fallback（重试/外开）
            forceFallback: !bridgeOk && idleMs >= 8000
          }
        }))
      }
    } catch {
      // ignore resume recovery failures
    }
  }

  const handleAppResume = (source = 'visibilitychange') => {
    if (!state.mutable.appBootstrapped || document.hidden) return
    const now = Date.now()
    // 合并 visibility/pageshow/focus 连发，降低恢复路径重入
    if (now - state.mutable.lastResumeHandledAt < 320) return
    state.mutable.lastResumeHandledAt = now
    const idle = stores.lifecycle.consumeHiddenDuration(now)
    const snapshot = state.mutable.resumePendingSnapshot ||
      runtime.navigation.readWindowRouteSnapshot() ||
      runtime.navigation.collectCurrentViewSnapshot()
    state.mutable.resumePendingSnapshot = null
    scheduleViewportUpdate()
    const targetView = normalizeViewName(snapshot?.view || snapshot?.module || state.currentView.value)
    // #451：仅长后台 + DOM 明确不健康时 softRemount；硬 reload 另设更高 idle 门槛
    const softRemount =
      isIOSLike && idle >= IOS_RESUME_SOFT_REMOUNT_MS && !isCurrentViewDomHealthy(targetView)
    const allowHardReload = isIOSLike && idle >= IOS_RESUME_HARD_RELOAD_MS
    if (isIOSLike && !softRemount) {
      nudgeWebViewPaint(targetView, { verify: false, allowReload: false, idleMs: idle })
    }
    void runtime.navigation.restoreViewFromSnapshot(snapshot, {
      softRemount,
      allowHardReload,
      idleMs: idle,
      source
    })
    // 回前台：探测 loopback bridge，并通知内嵌页恢复（官网/模块）
    void recoverEmbeddedWebAfterResume(targetView, idle)
    // 回前台时重算跨天定时器剩余时间
    if (state.studentId.value) {
      runtime.notification.scheduleWidgetCrossDayTimer()
    }
    void runCampusNetworkAutoLogin({
      studentId: state.studentId.value,
      reason: source
    }).catch((error) => {
      console.warn('[CampusNetwork] auto login failed:', error)
    })
  }

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stores.lifecycle.markHidden(Date.now())
      state.mutable.resumePendingSnapshot =
        runtime.navigation.readWindowRouteSnapshot() ||
        runtime.navigation.collectCurrentViewSnapshot()
      return
    }
    handleAppResume('visibilitychange')
  }

  const handlePageShow = () => {
    handleAppResume('pageshow')
  }

  const handleWindowFocus = () => {
    handleAppResume('focus')
  }

  /** 注册视图 / 窗口级生命周期监听，返回统一清理函数 */
  const registerResumeListeners = () => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('resize', handleViewportResize)
    window.addEventListener('orientationchange', handleViewportResize)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('resize', handleViewportResize)
      window.removeEventListener('orientationchange', handleViewportResize)
    }
  }

  const installCapacitorStateListener = () => {
    if (!isCapacitor) return
    void import('@capacitor/app').then((mod) => {
      mod.App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          stores.lifecycle.markHidden(Date.now())
          state.mutable.resumePendingSnapshot =
            runtime.navigation.readWindowRouteSnapshot() ||
            runtime.navigation.collectCurrentViewSnapshot()
          return
        }
        handleAppResume('capacitor-appStateChange')
      }).then((handle) => {
        state.mutable.capacitorAppStateListener = handle
      }).catch(() => {})
    }).catch(() => {})
  }

  const dispose = () => {
    removeResumeListeners()
    if (state.mutable.viewportResizeRaf) {
      window.cancelAnimationFrame(state.mutable.viewportResizeRaf)
      state.mutable.viewportResizeRaf = 0
    }
    if (state.mutable.desktopResizePerfTimer) {
      window.clearTimeout(state.mutable.desktopResizePerfTimer)
      state.mutable.desktopResizePerfTimer = null
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('window-resizing')
    }
    if (state.mutable.capacitorAppStateListener) {
      state.mutable.capacitorAppStateListener.remove().catch(() => {})
      state.mutable.capacitorAppStateListener = null
    }
    if (typeof state.mutable.removeHomeLayoutDiagnosticsErrorCapture === 'function') {
      state.mutable.removeHomeLayoutDiagnosticsErrorCapture()
      state.mutable.removeHomeLayoutDiagnosticsErrorCapture = null
    }
  }

  let removeResumeListeners: () => void = () => {}

  return {
    handleAppResume,
    handleVisibilityChange,
    handlePageShow,
    handleWindowFocus,
    handleViewportResize,
    scheduleViewportUpdate,
    recoverViewportAfterTransition,
    isCurrentViewDomHealthy,
    nudgeWebViewPaint,
    installResumeListeners: () => {
      removeResumeListeners = registerResumeListeners()
    },
    installCapacitorStateListener,
    dispose
  }
}
