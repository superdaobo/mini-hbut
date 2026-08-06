/**
 * App 应用壳运行时契约（Phase 5：#574）
 *
 * 定义 coordinator 之间的显式接口，避免 App.vue 内部闭包相互引用。
 * 各 coordinator 通过 AppRuntime 互访；共享响应式状态集中在 AppState。
 */
import type {
  useAuthStore,
  useGradeStore,
  useLifecycleStore,
  useNavigationStore,
  useUpdateStore
} from '../../stores'
import type { AppState } from '../state/appState'

export type AuthStore = ReturnType<typeof useAuthStore>
export type NavigationStore = ReturnType<typeof useNavigationStore>
export type LifecycleStore = ReturnType<typeof useLifecycleStore>
export type GradeStore = ReturnType<typeof useGradeStore>
export type UpdateStore = ReturnType<typeof useUpdateStore>

export interface AppStores {
  auth: AuthStore
  navigation: NavigationStore
  lifecycle: LifecycleStore
  grade: GradeStore
  update: UpdateStore
}

export interface GoToViewOptions {
  push?: boolean
  restoreScroll?: boolean
  scrollToTop?: boolean
  direction?: 'forward' | 'back' | 'none'
}

export interface NavigationCoordinator {
  goToView(view: string, options?: GoToViewOptions): boolean
  goToViewInternal(
    view: string,
    options?: GoToViewOptions & { scrollToTop?: boolean }
  ): void
  applyViewState(view: string): void
  replaceHistorySnapshot(view?: string): void
  pushHistorySnapshot(view?: string): void
  goToParentView(): boolean
  handleNavigate(target: unknown): Promise<void>
  handleBackToDashboard(): void
  handleBackToMe(): void
  handleBackToMoreCenter(): void
  handleTabChange(tab: string): void
  handleOpenOfficial(): void
  handleOpenFeedback(): void
  handleOpenConfig(): void
  handleOpenSettings(): void
  handlePopState(): Promise<void>
  installCloseInterceptor(): Promise<void>
  cancelExitDialog(): void
  confirmExitDialog(): Promise<void>
  closeDailyAccessDialog(): void
  handleDailyAccessInput(event: unknown): void
  submitDailyAccessKey(): void
  syncFromHash(options?: { scrollToTop?: boolean }): Promise<void>
  restoreViewFromSnapshot(
    snapshot: Record<string, unknown> | null,
    options?: { softRemount?: boolean; allowHardReload?: boolean; idleMs?: number; source?: string }
  ): Promise<void>
  forceScrollTop(): void
  ensureLoginRequiredViewAccess(view: string): boolean
  ensureProtectedViewAccess(
    view: string,
    options?: { push?: boolean; redirectToFallback?: boolean; fallbackView?: string }
  ): boolean
  // ── bootstrap / boot 辅助（由 createAppRuntime 编排时调用） ──────────
  readWindowRouteSnapshot(): Record<string, unknown> | null
  prefetchViewComponent(view: string): void
  persistModuleHostSession(payload: Record<string, unknown>): Record<string, unknown>
  repairModuleHostSession(payload: Record<string, unknown>): Promise<Record<string, unknown>>
  readModuleHostSession(): Record<string, unknown>
  collectCurrentViewSnapshot(): Record<string, unknown>
  handleViewChanged(view: string, prev: string): void
  restoreHomeScrollPosition(): void
  resetBootMetrics(context?: Record<string, unknown>): void
  hasBootMetric(name: string): boolean
  markBootMetric(name: string, detail?: Record<string, unknown>): void
  readStartupSnapshot(): StartupSnapshot
  clearScheduleSnapshot(sid: string): void
  scheduleKeys: { SCHEDULE_POPUP_PENDING_KEY: string; SCHEDULE_SWITCH_PENDING_KEY: string }
}

export interface StartupSnapshot {
  snapshot: Record<string, unknown> | null
  startupPageSetting: string
  initialView: string
  initialTab: string
  initialModule: string
  bootStudentIdHint: string
  bootScheduleSnapshot: Record<string, unknown> | null
  skipSplashForFastScheduleBoot: boolean
}

export interface SessionCoordinator {
  restoreCachedIdentityFromLocal(): Promise<boolean>
  tryRestoreSession(): Promise<boolean>
  tryRestoreLatestSession(): Promise<boolean>
  attemptAutoRelogin(): Promise<boolean>
  attemptOnlineRecovery(options?: { silent?: boolean }): Promise<boolean>
  refreshSessionSilently(): Promise<void>
  persistSessionCookies(): Promise<void>
  startSessionKeepAlive(): void
  stopSessionKeepAlive(): void
  startElectricityKeepAlive(): void
  stopElectricityKeepAlive(): void
  markLoginSessionToken(): void
  isTemporaryLoginSession(): boolean
  isManualLogout(): boolean
  restoreTestAccountSession(): boolean
  ensureConfigAccess(): void
  startJwxtRecoveryPolling(): void
  stopJwxtRecoveryPolling(): void
  markJwxtMaintenance(hint?: string, options?: Record<string, unknown>): void
  clearJwxtMaintenance(): void
  syncJwxtMaintenanceFromStorage(): void
  handleJwxtMaintenanceEvent(event: unknown): void
  handleRetrySessionRecovery(): Promise<void>
  notifySessionOnline(source?: string): void
  formatSessionError(err: unknown): string
}

export interface AuthCoordinator {
  handleLoginSuccess(data: unknown): void
  handleLogout(options?: Record<string, unknown>): Promise<void>
  handleSwitchLoginMode(mode: string): void
  handleRequireLogin(): void
}

export interface LifecycleCoordinator {
  handleAppResume(source?: string): void
  handleVisibilityChange(): void
  handlePageShow(): void
  handleWindowFocus(): void
  handleViewportResize(): void
  scheduleViewportUpdate(): void
  recoverViewportAfterTransition(options?: { scrollToTop?: boolean; blurActive?: boolean }): void
  isCurrentViewDomHealthy(view?: string): boolean
  nudgeWebViewPaint(
    view?: string,
    options?: { verify?: boolean; allowReload?: boolean; idleMs?: number }
  ): void
  installResumeListeners(): void
  installCapacitorStateListener(): void
  dispose(): void
}

export interface UpdateCoordinator {
  autoCheckUpdate(): Promise<void>
  handleCheckUpdate(): void
  handleForceUpdate(): Promise<void>
}

export interface RemoteConfigCoordinator {
  applyRemoteConfig(): Promise<void>
  startRemoteConfigRefresh(): void
  stopRemoteConfigRefresh(): void
  handleRemoteConfigModeChanged(): void
  handleRemoteConfigUpdated(): void
  primeOcrEndpointFromCache(): Promise<void>
  openAnnouncement(item: unknown): void
  closeAnnouncement(): void
  confirmBlockingAnnouncement(): void
  findNextBlockingAnnouncement(): void
  handleContentClick(e: unknown): Promise<void>
  handleExternalOpen(url: string, e?: unknown): Promise<void>
}

export interface NotificationCoordinator {
  installNotificationActionListener(): Promise<void>
  installWidgetDeeplinkListeners(): void
  scheduleWidgetCrossDayTimer(): void
  stopWidgetCrossDayTimer(): void
  handleWidgetDeeplinkPayload(payload: Record<string, unknown>): void
}

export interface GradeCoordinator {
  loadGradesForCurrentView(options?: Record<string, unknown>): Promise<boolean>
  fetchGradesFromAPI(
    sid: string,
    options?: { force?: boolean; teacherCurrentOnly?: boolean; silent?: boolean }
  ): Promise<boolean>
  handleRefreshGrades(): Promise<void>
  refreshGradeTeacherCache(options?: { currentOnly?: boolean }): Promise<unknown>
  scheduleGradeRealtimeRetry(): void
  clearGradeRealtimeRetry(): void
}

/** 模板事件处理器集合（App.vue / shell 组件统一取用） */
export interface AppHandlers {
  handleNavigate: (target: unknown) => Promise<void>
  handleLogout: (options?: Record<string, unknown>) => Promise<void>
  handleRequireLogin: () => void
  handleRetrySessionRecovery: () => Promise<void>
  handleLoginSuccess: (data: unknown) => void
  handleSwitchLoginMode: (mode: string) => void
  handleCheckUpdate: () => void
  handleOpenOfficial: () => void
  handleOpenFeedback: () => void
  handleOpenConfig: () => void
  handleOpenSettings: () => void
  handleBackToDashboard: () => void
  handleBackToMe: () => void
  handleBackToMoreCenter: () => void
  handleRefreshGrades: () => Promise<void>
  handleTabChange: (tab: string) => void
  handleSplashDismissed: () => void
  handleForceUpdate: () => Promise<void>
  openAnnouncement: (item: unknown) => void
  openWorkspaceLayoutEditor: (tab?: string) => void
  closeWorkspaceLayoutEditor: () => void
  closeAnnouncement: () => void
  confirmBlockingAnnouncement: () => void
  handleContentClick: (e: unknown) => Promise<void>
  handleExternalOpen: (url: string, e?: unknown) => Promise<void>
  hideHomeLayoutDebug: () => void
  copyHomeLayoutDebugReport: () => Promise<void>
  toggleHomeLayoutDebugReport: () => void
  closeDailyAccessDialog: () => void
  handleDailyAccessInput: (event: unknown) => void
  submitDailyAccessKey: () => void
  cancelExitDialog: () => void
  confirmExitDialog: () => Promise<void>
}

export interface AppRuntime {
  state: AppState
  stores: AppStores
  navigation: NavigationCoordinator
  session: SessionCoordinator
  auth: AuthCoordinator
  lifecycle: LifecycleCoordinator
  update: UpdateCoordinator
  remoteConfig: RemoteConfigCoordinator
  notification: NotificationCoordinator
  grade: GradeCoordinator
  handlers: AppHandlers
}
