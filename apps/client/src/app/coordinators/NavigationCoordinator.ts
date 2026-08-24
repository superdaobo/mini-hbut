/**
 * 导航 Coordinator（Phase 5：#574）
 *
 * 从 App.vue 迁出的视图切换、history/hash 同步、滚动恢复、
 * popstate、关闭拦截、每日访问门禁、prefetch 与 module host 会话逻辑。
 */
import { nextTick } from 'vue'
import type { AppRuntime, GoToViewOptions, NavigationCoordinator } from '../contracts/runtime'
import { VIEW_PREFETCHERS } from '../viewRegistry'
import {
  MAIN_TABS,
  ME_SUB_VIEWS,
  HIERARCHICAL_PARENT_VIEW_MAP,
  isLoginRequiredView,
  normalizeViewName
} from '../../navigation/app_navigation'
import { resolvePolicySafeSnapshotView, resolvePolicySafeView } from '../../config/accessible_view'
import { isViewAllowed } from '../../config/app_store_policy'
import { canOpenModule } from '../../utils/moduleAccess'
import { showToast } from '../../utils/toast'
import { saveRememberedUsername } from '../../utils/remembered_username'
import {
  readScheduleRenderSnapshot,
  clearScheduleRenderSnapshot,
  SCHEDULE_POPUP_PENDING_KEY,
  SCHEDULE_SWITCH_PENDING_KEY
} from '../../utils/schedule_prefetch.js'
import { trackViewNavigation } from '../../utils/usage_tracker.js'
import { isProtectedView, hasDailyAccessGrant, markDailyAccessGranted, sanitizeDailyAccessInput, verifyDailyAccessKey } from '../../utils/daily_access_key.js'
import {
  canUseLocalModuleBridgePreview,
  isLocalModuleBridgePreviewUrl,
  normalizeModuleHostSessionPayload,
  resolveModuleHostPreviewSource
} from '../../utils/more_modules'
import { exitNativeApp, getCurrentNativeWindow, isTauriRuntime } from '../../platform/native'
import { isDesktopLike as detectDesktopLike, isIOSLike as detectIOSLike } from '../../platform/runtime'
import { MODULE_HOST_SESSION_KEY, HOME_SCROLL_STORAGE_KEY } from '../state/constants'
import { useUiSettings } from '../../utils/ui_settings'
import { resetBootMetrics, hasBootMetric, markBootMetric } from '../../utils/boot_metrics'

export const createNavigationCoordinator = (runtime: AppRuntime): NavigationCoordinator => {
  const { state } = runtime
  const isIOSLike = detectIOSLike()
  const isDesktopLike = detectDesktopLike()
  const hasTauri = isTauriRuntime()

  const prefetchViewComponent = (view: string) => {
    const name = normalizeViewName(view)
    if (!Object.prototype.hasOwnProperty.call(VIEW_PREFETCHERS, name)) return
    const loader = VIEW_PREFETCHERS[name]
    if (typeof loader === 'function') {
      void loader()
    }
  }

  // ── module host session 序列化（行为与 App.vue 原实现一致） ───────────
  const buildModuleHostSession = (payload: Record<string, unknown> = {}) => {
    const raw = payload && typeof payload === 'object' ? payload : {}
    const resolved = resolveModuleHostPreviewSource(raw)
    const rawPreviewUrl = String(raw.preview_url || raw.previewUrl || '').trim()
    const rawPreviewMode = String(raw.preview_mode || raw.previewMode || '').trim()
    const sanitizedPreviewUrl =
      !canUseLocalModuleBridgePreview() && isLocalModuleBridgePreviewUrl(resolved.resolvedPreviewUrl)
        ? ''
        : String(resolved.resolvedPreviewUrl || '').trim()
    const sanitizedLocalPreviewUrl =
      !canUseLocalModuleBridgePreview() &&
      isLocalModuleBridgePreviewUrl(String(raw.local_preview_url || raw.localPreviewUrl || resolved.localPreviewUrl || '').trim())
        ? ''
        : String(raw.local_preview_url || raw.localPreviewUrl || resolved.localPreviewUrl || '').trim()
    const bridgeBlocked =
      !canUseLocalModuleBridgePreview() && (isLocalModuleBridgePreviewUrl(rawPreviewUrl) || rawPreviewMode === 'tauri-local')
    const normalizedPreviewMode =
      String(resolved.sourceKind || '').trim() || (bridgeBlocked ? '' : rawPreviewMode)
    const normalizedInvalidReason = String(
      raw.invalid_reason || raw.invalidReason || (!sanitizedPreviewUrl && bridgeBlocked ? 'tauri-bridge-blocked' : '')
    ).trim()
    return {
      module_id: String(raw.module_id || raw.moduleId || '').trim(),
      module_name: String(raw.module_name || raw.moduleName || '').trim(),
      preview_url: sanitizedPreviewUrl,
      version: String(raw.version || '').trim(),
      min_compatible_version: String(raw.min_compatible_version || raw.minCompatibleVersion || '').trim(),
      channel: String(raw.channel || 'main').trim() || 'main',
      local_ready: !!sanitizedPreviewUrl && raw.local_ready !== false,
      source: String(raw.source || '').trim(),
      preview_mode: normalizedPreviewMode,
      invalid_reason: normalizedInvalidReason,
      open_url: String(raw.open_url || raw.openUrl || resolved.openUrl || '').trim(),
      package_url: String(raw.package_url || raw.packageUrl || resolved.packageUrl || '').trim(),
      package_urls: Array.isArray(raw.package_urls)
        ? raw.package_urls
        : Array.isArray(raw.packageUrls)
          ? raw.packageUrls
          : resolved.packageUrls,
      entry_path: String(raw.entry_path || raw.entryPath || resolved.entryPath || '').trim(),
      resolved_entry_path: String(
        raw.resolved_entry_path || raw.resolvedEntryPath || resolved.resolvedEntryPath || ''
      ).trim(),
      local_preview_url: sanitizedLocalPreviewUrl,
      site_root_path: String(raw.site_root_path || raw.siteRootPath || resolved.siteRootPath || '').trim(),
      bundle_zip_path: String(
        raw.bundle_zip_path || raw.bundleZipPath || resolved.bundleZipPath || ''
      ).trim(),
      cache_dir: String(raw.cache_dir || '').trim(),
      bundle_path: String(raw.bundle_path || '').trim(),
      manifest_url: String(raw.manifest_url || raw.manifestUrl || resolved.manifestUrl || '').trim(),
      manifest_checked_at: String(raw.manifest_checked_at || raw.manifestCheckedAt || '').trim()
    }
  }

  const writeModuleHostSessionStorage = (payload: Record<string, unknown>) => {
    try {
      localStorage.setItem(MODULE_HOST_SESSION_KEY, JSON.stringify(payload))
    } catch {
      // ignore storage failure
    }
  }

  const readModuleHostSession = () => {
    try {
      const raw = localStorage.getItem(MODULE_HOST_SESSION_KEY)
      if (!raw) return buildModuleHostSession()
      return buildModuleHostSession(JSON.parse(raw) as Record<string, unknown>)
    } catch {
      return buildModuleHostSession()
    }
  }

  const persistModuleHostSession = (payload: Record<string, unknown>) => {
    const normalized = buildModuleHostSession(payload)
    writeModuleHostSessionStorage(normalized)
    return normalized
  }

  const repairModuleHostSession = async (payload: Record<string, unknown>) => {
    try {
      const repaired = await normalizeModuleHostSessionPayload(payload || {})
      const normalized = buildModuleHostSession(repaired as Record<string, unknown>)
      writeModuleHostSessionStorage(normalized)
      return normalized
    } catch {
      const fallback = buildModuleHostSession(payload)
      writeModuleHostSessionStorage(fallback)
      return fallback
    }
  }

  // ── 滚动恢复 ──────────────────────────────────────────────────────────
  const getAppShellScrollTop = () => {
    const shell = state.appShellRef.value
    if (shell && typeof shell.scrollTop === 'number' && Number.isFinite(shell.scrollTop)) {
      return Math.max(0, shell.scrollTop)
    }
    const windowTop = Number(
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
    )
    return Number.isFinite(windowTop) ? Math.max(0, windowTop) : 0
  }

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

  const rememberHomeScrollPosition = () => {
    if (state.currentView.value !== 'home') return
    const top = getAppShellScrollTop()
    state.homeScrollSnapshot.value = top
    try {
      sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, String(top))
    } catch {
      // ignore
    }
  }

  const readStoredHomeScrollTop = () => {
    const mem = Math.max(0, Number(state.homeScrollSnapshot.value || 0))
    if (mem > 0) return mem
    try {
      const stored = Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0)
      return Number.isFinite(stored) ? Math.max(0, stored) : 0
    } catch {
      return 0
    }
  }

  const restoreHomeScrollPosition = () => {
    const targetTop = readStoredHomeScrollTop()
    if (targetTop <= 0) return
    // 恢复滚动期间隐藏视图，避免"先顶部后闪现底部"
    state.homeScrollRestoring.value = true
    let tries = 0
    const maxTries = 24
    let finished = false
    const finishRestoring = () => {
      if (finished) return
      finished = true
      state.homeScrollRestoring.value = false
      cleanup()
    }
    // 用户主动滚动（滚轮/触摸）：立即取消恢复并解除隐藏，尊重用户意图，不再强制拽回
    const onUserScrollInput = () => {
      if (finished) return
      finishRestoring()
    }
    const cleanup = () => {
      window.removeEventListener('wheel', onUserScrollInput, { capture: true } as EventListenerOptions)
      window.removeEventListener('touchstart', onUserScrollInput, { capture: true } as EventListenerOptions)
    }
    window.addEventListener('wheel', onUserScrollInput, { passive: true, capture: true })
    window.addEventListener('touchstart', onUserScrollInput, { passive: true, capture: true })
    const applyScroll = () => {
      if (finished) return
      if (state.currentView.value !== 'home') {
        finishRestoring()
        return
      }
      try {
        if (state.appShellRef.value) {
          state.appShellRef.value.scrollTop = targetTop
        }
        window.scrollTo(0, targetTop)
        document.documentElement.scrollTop = targetTop
        document.body.scrollTop = targetTop
      } catch {
        // ignore
      }
      const current = getAppShellScrollTop()
      // 恢复到位才解除隐藏；未到位（内容未撑开被 clamp）继续重试
      if (Math.abs(current - targetTop) <= 4) {
        finishRestoring()
        return
      }
      tries += 1
      if (tries < maxTries) {
        requestAnimationFrame(applyScroll)
      }
    }
    nextTick(() => {
      applyScroll()
      requestAnimationFrame(applyScroll)
      ;[50, 120, 200, 320, 480, 700].forEach((ms) => {
        window.setTimeout(applyScroll, ms)
      })
      // 兜底：最迟 900ms 后解除隐藏，避免异常时首页一直不可见
      window.setTimeout(finishRestoring, 900)
    })
  }

  // ── history / hash ────────────────────────────────────────────────────
  const resolveHash = (sid: string, view: string) => {
    if (!sid) return '#/'
    if (!view || view === 'home') return `#/${sid}`
    return `#/${sid}/${view}`
  }

  const replaceHistorySnapshot = (view = state.currentView.value) => {
    const sid = state.studentId.value || ''
    const snap = {
      __hbu: true,
      sid,
      view,
      tab: state.activeTab.value,
      module:
        view === 'more_module_host'
          ? String(state.moduleHostSession.value?.module_id || '').trim()
          : state.currentModule.value
    }
    window.history.replaceState(snap, '', resolveHash(sid, view))
  }

  const pushHistorySnapshot = (view = state.currentView.value) => {
    const sid = state.studentId.value || ''
    const snap = {
      __hbu: true,
      sid,
      view,
      tab: state.activeTab.value,
      module:
        view === 'more_module_host'
          ? String(state.moduleHostSession.value?.module_id || '').trim()
          : state.currentModule.value
    }
    window.history.pushState(snap, '', resolveHash(sid, view))
  }

  const applyViewState = (view: string) => {
    state.currentView.value = view
    if ((MAIN_TABS as readonly string[]).includes(view)) {
      state.activeTab.value = view
      state.currentModule.value = ''
      return
    }
    if ((ME_SUB_VIEWS as readonly string[]).includes(view)) {
      state.activeTab.value = 'me'
    }
    state.currentModule.value =
      view === 'more_module_host'
        ? String(state.moduleHostSession.value?.module_id || 'more_module_host').trim()
        : view
  }

  const readWindowRouteSnapshot = () => {
    if (typeof window === 'undefined') return null
    const historyState = window.history?.state as Record<string, unknown> | null
    if (historyState && historyState.__hbu) {
      return {
        sid: String(historyState.sid || '').trim(),
        view: normalizeViewName(historyState.view || historyState.module || historyState.tab),
        tab: String(historyState.tab || '').trim(),
        module: String(historyState.module || '').trim()
      }
    }
    const hash = window.location.hash || '#/'
    const match = hash.match(/^#\/(\d{10})(?:\/(\w+))?$/)
    if (!match) return null
    return {
      sid: match[1],
      view: normalizeViewName(match[2] || 'home'),
      tab: '',
      module: ''
    }
  }

  const resolveAccessFallbackView = (view = 'home') => {
    const normalized = normalizeViewName(view)
    if (!normalized || normalized === 'home') return 'home'
    if (isProtectedView(normalized)) return 'home'
    return normalized
  }

  const queueProtectedViewPrompt = (view: string, { push = true } = {}) => {
    state.pendingProtectedView.value = { view: normalizeViewName(view), push: push !== false }
    state.dailyAccessInput.value = ''
    state.dailyAccessError.value = ''
    state.showDailyAccessDialog.value = true
  }

  const ensureProtectedViewAccess = (
    view: string,
    { push = true, redirectToFallback = false, fallbackView = state.currentView.value } = {}
  ) => {
    const normalized = normalizeViewName(view)
    if (!isProtectedView(normalized) || hasDailyAccessGrant()) return true
    if (redirectToFallback) {
      const fallback = resolveAccessFallbackView(fallbackView)
      applyViewState(fallback)
      replaceHistorySnapshot(fallback)
    }
    queueProtectedViewPrompt(normalized, { push })
    return false
  }

  const ensureLoginRequiredViewAccess = (view: string) => {
    const normalized = normalizeViewName(view)
    if (!isLoginRequiredView(normalized) || state.isLoggedIn.value) return true
    runtime.auth.handleRequireLogin()
    return false
  }

  const goToViewInternal = (
    view: string,
    { push = true, restoreScroll = false, scrollToTop, direction }: GoToViewOptions & { scrollToTop?: boolean } = {}
  ) => {
    const normalized = normalizeViewName(view)
    const fromView = state.currentView.value
    state.navDirection.value = direction || (push ? 'forward' : 'none')
    if (fromView === 'home' && normalized !== 'home') {
      rememberHomeScrollPosition()
      state.homeScrollRestoring.value = false
    }
    const returningHome = normalized === 'home' && fromView !== 'home'
    const shouldRestoreHomeScroll =
      normalized === 'home' &&
      scrollToTop !== true &&
      (restoreScroll || returningHome)
    applyViewState(normalized)
    if (push) {
      pushHistorySnapshot(normalized)
    } else {
      replaceHistorySnapshot(normalized)
    }
    if (shouldRestoreHomeScroll) {
      runtime.lifecycle.recoverViewportAfterTransition({ scrollToTop: false, blurActive: true })
      restoreHomeScrollPosition()
    } else {
      runtime.lifecycle.recoverViewportAfterTransition({ scrollToTop: true, blurActive: true })
    }
    void trackViewNavigation(fromView, normalized)
  }

  const goToView = (view: string, { push = true, restoreScroll = false, direction }: GoToViewOptions = {}) => {
    const normalized = normalizeViewName(view)
    if (!isViewAllowed(normalized)) {
      showToast('当前版本不可用该功能')
      if (normalized !== 'home' && isViewAllowed('home')) {
        goToViewInternal('home', { push: false, restoreScroll: true })
      }
      return false
    }
    const access = canOpenModule(
      { id: normalized, requiresLogin: false },
      { isLoggedIn: state.isLoggedIn.value }
    )
    if (!access.ok && access.reason && !access.needLogin) {
      showToast(access.reason)
      if (normalized !== 'home' && isViewAllowed('home')) {
        goToViewInternal('home', { push: false, restoreScroll: true })
      }
      return false
    }
    if (!ensureLoginRequiredViewAccess(normalized)) return false
    if (!ensureProtectedViewAccess(normalized, { push, fallbackView: state.currentView.value })) {
      return false
    }
    goToViewInternal(normalized, { push, restoreScroll, direction })
    return true
  }

  const resolveParentView = (view: string) => {
    const normalized = normalizeViewName(view)
    if (!normalized || normalized === 'home') return ''
    if (HIERARCHICAL_PARENT_VIEW_MAP[normalized]) {
      return HIERARCHICAL_PARENT_VIEW_MAP[normalized]
    }
    return 'home'
  }

  const goToParentView = () => {
    const parentView = resolveParentView(state.currentView.value)
    if (!parentView) return false
    goToViewInternal(parentView, {
      push: false,
      restoreScroll: parentView === 'home',
      direction: 'back'
    })
    return true
  }

  const parseHashRoute = () => {
    const snapshot = readWindowRouteSnapshot()
    if (!snapshot?.sid) return null
    return { sid: snapshot.sid, view: normalizeViewName(snapshot.view) }
  }

  const syncFromHash = async () => {
    const route = parseHashRoute()
    if (!route) {
      if (state.currentView.value !== 'home') {
        applyViewState('home')
      }
      return
    }
    state.studentId.value = route.sid
    saveRememberedUsername(route.sid)
    const safeView = resolvePolicySafeView(route.view, 'home')
    if (!ensureProtectedViewAccess(safeView, {
      push: false,
      redirectToFallback: true,
      fallbackView: 'home'
    })) {
      return
    }
    applyViewState(safeView)
    if (safeView === 'grades' && state.gradeData.value.length === 0) {
      void runtime.grade.loadGradesForCurrentView()
    }
  }

  const normalizeNavigateTarget = (target: unknown) => {
    if (typeof target === 'string') {
      return { view: normalizeViewName(target), payload: null }
    }
    if (target && typeof target === 'object') {
      const t = target as Record<string, unknown>
      return {
        view: normalizeViewName(t.view || t.route || t.moduleId || t.module_id),
        payload: t.payload && typeof t.payload === 'object' ? t.payload : null
      }
    }
    return { view: 'home', payload: null }
  }

  const handleNavigate = async (target: unknown) => {
    const normalized = normalizeNavigateTarget(target)
    if (normalized.view === 'more_module_host') {
      const session = persistModuleHostSession((normalized.payload as Record<string, unknown>) || {})
      const repairedSession = await repairModuleHostSession(session)
      state.moduleHostSession.value = repairedSession
      if (!repairedSession.preview_url) {
        goToView('more')
        return
      }
    }
    const navigated = goToView(normalized.view)
    if (!navigated) return
    if (normalized.view === 'grades') {
      void runtime.grade.loadGradesForCurrentView()
    }
  }

  const handleBackToDashboard = () => {
    goToView('home', { restoreScroll: true, direction: 'back' })
  }

  const handleBackToMe = () => {
    if (state.currentView.value === 'school_website') {
      void import('../../utils/school_website_embed').then((mod) => {
        void mod.forceCloseSchoolWebsiteEmbed?.()
      }).catch(() => {})
    }
    goToView('me')
  }

  const handleBackToMoreCenter = () => {
    goToView('more')
  }

  const handleTabChange = (tab: string) => {
    goToView(tab)
  }

  const handleOpenOfficial = () => goToView('official')
  const handleOpenFeedback = () => goToView('feedback')
  const handleOpenConfig = () => goToView('config')
  const handleOpenSettings = () => goToView('settings')

  const handlePopState = async () => {
    if (!isDesktopLike) {
      const fromView = state.currentView.value
      const handled = goToParentView()
      if (!handled) {
        goToViewInternal('home', { push: false, restoreScroll: true, direction: 'back' })
        return
      }
      if (state.currentView.value === 'home' || fromView !== 'home') {
        if (state.currentView.value !== 'home') {
          runtime.lifecycle.recoverViewportAfterTransition({ scrollToTop: true, blurActive: true })
        } else {
          runtime.lifecycle.recoverViewportAfterTransition({ scrollToTop: false, blurActive: true })
          restoreHomeScrollPosition()
        }
      }
      return
    }
    const prev = state.currentView.value
    state.navDirection.value = 'back'
    await syncFromHash()
    if (state.currentView.value === 'home' && prev !== 'home') {
      runtime.lifecycle.recoverViewportAfterTransition({ scrollToTop: false, blurActive: true })
      restoreHomeScrollPosition()
    } else {
      runtime.lifecycle.recoverViewportAfterTransition({ scrollToTop: true, blurActive: true })
    }
  }

  const installCloseInterceptor = async () => {
    if (!hasTauri) return
    try {
      const appWindow = await getCurrentNativeWindow()
      if (!appWindow) return
      state.mutable.unlistenCloseRequested = await appWindow.onCloseRequested(async (event: { preventDefault: () => void }) => {
        if (state.mutable.isClosingByUser) return
        if (state.currentView.value !== 'home') {
          event.preventDefault()
          if ((window.history.length > 1) && (window.location.hash || '#/') !== '#/') {
            state.navDirection.value = 'back'
            window.history.back()
          } else {
            goToView('home', { restoreScroll: true, direction: 'back' })
          }
          return
        }
        event.preventDefault()
        state.showExitDialog.value = true
        replaceHistorySnapshot('home')
      })
    } catch (e) {
      console.warn('[Navigation] 安装关闭拦截失败:', e)
    }
  }

  const cancelExitDialog = () => {
    state.showExitDialog.value = false
  }

  const confirmExitDialog = async () => {
    if (state.exitingApp.value) return
    state.exitingApp.value = true
    state.mutable.isClosingByUser = true
    try {
      await exitNativeApp()
    } catch (e) {
      console.warn('[Navigation] 退出应用失败:', e)
      try {
        const appWindow = await getCurrentNativeWindow()
        if (appWindow) {
          await appWindow.destroy()
        }
      } catch (fallbackErr) {
        console.warn('[Navigation] destroy 回退失败:', fallbackErr)
      }
    } finally {
      state.showExitDialog.value = false
      state.exitingApp.value = false
      state.mutable.isClosingByUser = false
    }
  }

  const closeDailyAccessDialog = () => {
    state.showDailyAccessDialog.value = false
    state.dailyAccessInput.value = ''
    state.dailyAccessError.value = ''
    state.pendingProtectedView.value = null
  }

  const handleDailyAccessInput = (event: unknown) => {
    const el = (event as { target?: { value?: string } })?.target
    state.dailyAccessInput.value = sanitizeDailyAccessInput(el?.value || '')
    if (state.dailyAccessError.value) {
      state.dailyAccessError.value = ''
    }
  }

  const submitDailyAccessKey = () => {
    const normalized = sanitizeDailyAccessInput(state.dailyAccessInput.value)
    state.dailyAccessInput.value = normalized
    if (!verifyDailyAccessKey(normalized)) {
      state.dailyAccessError.value = '今日秘钥不正确，请重新输入。'
      return
    }
    const targetView = normalizeViewName(state.pendingProtectedView.value?.view || 'home')
    const push = state.pendingProtectedView.value?.push !== false
    markDailyAccessGranted()
    state.showDailyAccessDialog.value = false
    state.dailyAccessError.value = ''
    state.pendingProtectedView.value = null
    goToViewInternal(targetView, { push })
  }

  const collectCurrentViewSnapshot = () => ({
    sid: String(state.studentId.value || '').trim(),
    view: normalizeViewName(state.currentView.value),
    tab: String(state.activeTab.value || '').trim(),
    module:
      state.currentView.value === 'more_module_host'
        ? String(state.moduleHostSession.value?.module_id || '').trim()
        : String(state.currentModule.value || '').trim()
  })

  const restoreViewFromSnapshot = async (
    snapshot: Record<string, unknown> | null,
    { softRemount = false, allowHardReload = false, idleMs = 0 } = {}
  ) => {
    const resolved = snapshot || collectCurrentViewSnapshot()
    let targetViewRaw = resolvePolicySafeSnapshotView(resolved, state.currentView.value, 'home')
    if (targetViewRaw === 'more_module_host') {
      state.moduleHostSession.value = await repairModuleHostSession(readModuleHostSession())
    }
    let targetView =
      targetViewRaw === 'more_module_host' && !state.moduleHostSession.value.preview_url
        ? resolvePolicySafeView('more', 'home')
        : targetViewRaw
    targetView = resolvePolicySafeView(targetView, 'home')
    if (resolved?.sid) {
      state.studentId.value = String(resolved.sid || '').trim()
      try {
        saveRememberedUsername(state.studentId.value)
      } catch {
        // ignore storage failure on resume
      }
    }
    if (!ensureProtectedViewAccess(targetView, {
      push: false,
      redirectToFallback: true,
      fallbackView: 'home'
    })) {
      return
    }
    applyViewState(targetView)
    replaceHistorySnapshot(targetView)
    let didSoftRemount = false
    if (softRemount) {
      const now = Date.now()
      if (now - state.mutable.lastSoftRemountAt >= 30 * 1000) {
        state.mutable.lastSoftRemountAt = now
        state.viewRenderNonce.value += 1
        didSoftRemount = true
      }
    }
    await nextTick()
    runtime.lifecycle.recoverViewportAfterTransition({ scrollToTop: false, blurActive: false })
    if (isIOSLike && (didSoftRemount || !runtime.lifecycle.isCurrentViewDomHealthy(targetView))) {
      requestAnimationFrame(() => {
        runtime.lifecycle.nudgeWebViewPaint(targetView, {
          verify: true,
          allowReload: didSoftRemount && allowHardReload,
          idleMs
        })
      })
    }
  }

  // 视图切换 watch 辅助：prefetch + 学校官网离开时关闭内嵌
  const handleViewChanged = (view: string, prev: string) => {
    prefetchViewComponent(view)
    if (prev === 'school_website' && view !== 'school_website') {
      void import('../../utils/school_website_embed').then((mod) => {
        void mod.forceCloseSchoolWebsiteEmbed?.()
      }).catch(() => {})
    }
  }

  return {
    goToView,
    goToViewInternal,
    applyViewState,
    replaceHistorySnapshot,
    pushHistorySnapshot,
    goToParentView,
    handleNavigate,
    handleBackToDashboard,
    handleBackToMe,
    handleBackToMoreCenter,
    handleTabChange,
    handleOpenOfficial,
    handleOpenFeedback,
    handleOpenConfig,
    handleOpenSettings,
    handlePopState,
    installCloseInterceptor,
    cancelExitDialog,
    confirmExitDialog,
    closeDailyAccessDialog,
    handleDailyAccessInput,
    submitDailyAccessKey,
    syncFromHash,
    restoreViewFromSnapshot,
    forceScrollTop,
    ensureLoginRequiredViewAccess,
    ensureProtectedViewAccess,
    // bootstrap / boot 辅助
    readWindowRouteSnapshot,
    prefetchViewComponent,
    persistModuleHostSession,
    repairModuleHostSession,
    readModuleHostSession,
    collectCurrentViewSnapshot,
    handleViewChanged,
    restoreHomeScrollPosition,
    resetBootMetrics: (context?: Record<string, unknown>) => resetBootMetrics(context),
    hasBootMetric,
    markBootMetric: (name: string, detail?: Record<string, unknown>) => {
      markBootMetric(name, detail)
    },
    readStartupSnapshot: () => {
      const snapshot = readWindowRouteSnapshot()
      const startupPageSetting = useUiSettings().startupPage || 'home'
      const startupView = resolvePolicySafeView(snapshot?.view || startupPageSetting, 'home')
      const initialView = isProtectedView(startupView) && !hasDailyAccessGrant() ? 'home' : startupView
      const initialTab = String(
        snapshot?.tab ||
          ((MAIN_TABS as readonly string[]).includes(initialView) ? initialView : (ME_SUB_VIEWS as readonly string[]).includes(initialView) ? 'me' : 'home')
      ).trim() || 'home'
      const initialModule = String(
        snapshot?.module ||
          ((MAIN_TABS as readonly string[]).includes(initialView) ? '' : initialView === 'home' ? '' : initialView)
      ).trim()
      const bootStudentIdHint = String(snapshot?.sid || '').trim()
      const bootScheduleSnapshot =
        initialView === 'schedule' && bootStudentIdHint
          ? (readScheduleRenderSnapshot(bootStudentIdHint) as Record<string, unknown> | null)
          : null
      return {
        snapshot,
        startupPageSetting,
        initialView,
        initialTab,
        initialModule,
        bootStudentIdHint,
        bootScheduleSnapshot,
        skipSplashForFastScheduleBoot: !!bootScheduleSnapshot
      }
    },
    clearScheduleSnapshot: (sid: string) => clearScheduleRenderSnapshot(sid),
    scheduleKeys: { SCHEDULE_POPUP_PENDING_KEY, SCHEDULE_SWITCH_PENDING_KEY }
  }
}
