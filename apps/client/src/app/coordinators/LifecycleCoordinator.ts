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
import { getCurrentNativeWindow, isCapacitorRuntime, isTauriRuntime } from '../../platform/native'
import { pushDebugLog } from '../../utils/debug_logger'
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

/** 原生生命周期信号比 WKWebView 的 document.hidden 更可信，可用于修复长冻结后的 stale hidden。 */
const NATIVE_RESUME_SOURCES = new Set(['tauri-window-focus', 'capacitor-appStateChange'])

export const createLifecycleCoordinator = (runtime: AppRuntime): LifecycleCoordinator => {
  const { state, stores } = runtime
  const isIOSLike = detectIOSLike()
  const isAndroidLike = detectAndroidLike()
  const isDesktopLike = detectDesktopLike()
  const hasTauri = isTauriRuntime()
  const isCapacitor = isCapacitorRuntime()

  // #681：回顶实现唯一收敛在 navigation.forceScrollTop，此处不得再保留重复副本
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
      root.style.setProperty('--app-safe-bottom-fallback', '0px')
      return
    }

    const screenWidth = Math.min(window.screen?.width || 0, window.screen?.height || 0)
    const screenHeight = Math.max(window.screen?.width || 0, window.screen?.height || 0)
    const portraitFallback = screenWidth >= 744 && screenHeight >= 1024 ? 20 : 34
    const fallback = screenHeight >= 812 ? portraitFallback : 0
    root.style.setProperty('--app-safe-bottom-fallback', `${fallback}px`)
  }

  const recoverViewportAfterTransition = ({ scrollToTop = true, blurActive = true } = {}) => {
    const activeEl = document.activeElement as HTMLElement | null
    if (blurActive && activeEl && typeof activeEl.blur === 'function') {
      activeEl.blur()
    }
    updateViewportUnit()
    nextTick(() => {
      if (scrollToTop) {
        runtime.navigation.forceScrollTop()
      }
      requestAnimationFrame(() => {
        if (scrollToTop) {
          runtime.navigation.forceScrollTop()
        }
        updateViewportUnit()
      })
    })
  }

  const isCurrentViewDomHealthy = (
    view = state.currentView.value,
    { strict = false }: { strict?: boolean } = {}
  ) => {
    try {
      const root = state.appShellRef.value || document.querySelector('.app-shell')
      if (!root) return false
      const transitionRoot = root.querySelector('.view-transition-root')
      if (!transitionRoot) return false

      // leave/enter 过渡中子树可能短暂为空，常规检查勿判死；
      // 但长后台恢复的 strict 检查不能把冻结遗留的 transition class 永久当成“健康”。
      // 兼容三套过渡类：name 兜底（module-fade-*）、方向类（module-fade-fwd/back-*）、Vue 基础 v-*
      const transitionActiveSelector =
        '.v-leave-active, .v-enter-active, .module-fade-leave-active, .module-fade-enter-active, .module-fade-fwd-leave-active, .module-fade-fwd-enter-active, .module-fade-back-leave-active, .module-fade-back-enter-active'
      // Vue Transition 的 active class 通常挂在 transitionRoot 自身；同时保留后代检查，
      // 兼容未来容器层级变化，避免只 querySelector() 后代而漏掉根节点本身。
      const leaving =
        transitionRoot.matches?.(transitionActiveSelector) ||
        transitionRoot.querySelector(transitionActiveSelector)
      if (leaving) return !strict
      if (strict && transitionRoot.classList.contains('home-scroll-restoring')) return false

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
    if (isCurrentViewDomHealthy(targetView, { strict: true })) return false
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
    // 仅在恢复场景下做健康检查；长后台使用 strict 模式，防止冻结的 transition class 误报健康。
    const strict = idleMs >= IOS_RESUME_SOFT_REMOUNT_MS
    setTimeout(() => {
      if (isCurrentViewDomHealthy(targetView, { strict })) return
      // 再等一帧布局，减少误判
      setTimeout(() => {
        if (isCurrentViewDomHealthy(targetView, { strict })) return
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

  const markAppHidden = (source: string) => {
    const hiddenAt = Date.now()
    stores.lifecycle.markHidden(hiddenAt)
    state.mutable.resumePendingSnapshot =
      runtime.navigation.readWindowRouteSnapshot() ||
      runtime.navigation.collectCurrentViewSnapshot()
    pushDebugLog('LifecycleResume', 'app hidden', 'info', {
      source,
      hiddenAt,
      view: state.currentView.value
    })
  }

  const handleAppResume = (source = 'visibilitychange') => {
    const nativeResumeSignal = NATIVE_RESUME_SOURCES.has(source)
    if (!state.mutable.appBootstrapped || (document.hidden && !nativeResumeSignal)) return
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
    // #864：iOS 长后台一律软重挂当前视图，不再依赖 DOM“看起来健康”。
    // WKWebView 可能保留完整 DOM，却丢失可交互状态；仅做节点/尺寸检查无法识别这种半死状态。
    const softRemount = isIOSLike && idle >= IOS_RESUME_SOFT_REMOUNT_MS
    const allowHardReload = isIOSLike && idle >= IOS_RESUME_HARD_RELOAD_MS
    if (softRemount && state.homeScrollRestoring.value) {
      // WebView 冻结时 900ms 兜底 timer 可能不再执行，遗留该状态会让整个视图 pointer-events:none。
      state.homeScrollRestoring.value = false
    }
    pushDebugLog('LifecycleResume', 'resume decision', 'info', {
      source,
      idleMs: idle,
      targetView,
      documentHidden: document.hidden,
      nativeResumeSignal,
      softRemount,
      allowHardReload
    })
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
    // 回前台：重算跨天定时器剩余时间；并无条件补写小组件快照（#759）
    if (state.studentId.value) {
      runtime.notification.scheduleWidgetCrossDayTimer()
      // #759：跨天定时器在 WebView 冻结/进程被杀后会失效，导致小组件全天显示昨天。
      // 回前台时无条件用缓存重写一次快照（date/weekday/周次按当下重算），
      // 与定时器重排并行执行；内部已全静默捕获，失败不影响 resume 主流程。
      void import('../../utils/widget_bridge')
        .then((mod) => mod.tryWriteSnapshotFromCache(state.studentId.value))
        .catch(() => {})
      // #610：resume/跨天后第一次活跃 → 触发系统预调度 reconcile
      // （窗口随"今天"滚动，跨天自然重算；幂等 diff 保证无变化时零系统调用）
      void import('../../utils/local_reminder_scheduler').then((mod) =>
        mod.reconcileLocalReminders({
          studentId: state.studentId.value,
          reason: 'resume'
        }).catch(() => {})
      ).catch(() => {})
      // #614：resume/launch → 消费 native background event inbox。
      // 聚合同域事件 → 每域一次 Rust 完整同步 → 写通知去重 ledger → ack；
      // 模块内 single-flight 与 320ms 重入节流共同保证连发不并发重复同步。
      void import('../../utils/background_notification').then((mod) =>
        mod.consumeBackgroundEventsOnce({
          studentId: state.studentId.value,
          reason: source
        }).catch((error) => {
          console.warn('[BackgroundInbox] consume failed:', error)
        })
      ).catch(() => {})
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
      markAppHidden('visibilitychange')
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
          markAppHidden('capacitor-appStateChange')
          return
        }
        handleAppResume('capacitor-appStateChange')
      }).then((handle) => {
        state.mutable.capacitorAppStateListener = handle
      }).catch(() => {})
    }).catch(() => {})
  }

  /**
   * #864：Tauri iOS 没有 Capacitor appStateChange，不能只依赖 WKWebView 的
   * visibility/pageshow/focus。原生窗口 focus 作为额外权威信号，长冻结后即使
   * document.hidden 尚未刷新，也允许进入恢复链。
   */
  const installTauriWindowFocusListener = () => {
    if (!hasTauri || !isIOSLike || state.mutable.tauriWindowFocusUnlisten) return
    void getCurrentNativeWindow()
      .then(async (nativeWindow) => {
        if (!nativeWindow || typeof nativeWindow.onFocusChanged !== 'function') return
        const unlisten = await nativeWindow.onFocusChanged(({ payload: focused }) => {
          if (!focused) {
            markAppHidden('tauri-window-focus')
            return
          }
          handleAppResume('tauri-window-focus')
        })
        state.mutable.tauriWindowFocusUnlisten = unlisten
      })
      .catch((error) => {
        pushDebugLog('LifecycleResume', 'install tauri focus listener failed', 'warn', String(error || ''))
      })
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
    if (state.mutable.tauriWindowFocusUnlisten) {
      try {
        state.mutable.tauriWindowFocusUnlisten()
      } catch {
        // ignore native listener cleanup failures
      }
      state.mutable.tauriWindowFocusUnlisten = null
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
      installTauriWindowFocusListener()
    },
    installCapacitorStateListener,
    dispose
  }
}
