/**
 * 无类型 JS 工具模块的本地声明（Phase 5：#574）
 *
 * 这些模块尚未迁移到 TypeScript，为让 src/app/** 的 coordinator
 * 通过 typecheck，声明其实际使用的导出签名。签名取自各自模块源码。
 */

/**
 * vite alias 将 'axios' 指向 src/utils/axios_adapter.ts（本地 HTTP 适配器），
 * 不安装 npm 依赖。此处声明其实际使用的导出形态（default export）。
 */
declare module 'axios' {
  export interface AxiosRequestConfig {
    [key: string]: unknown
  }
  export interface AxiosResponse<T = any> {
    data: T
    status: number
    statusText: string
    headers: Record<string, unknown>
    config: Record<string, unknown>
  }
  export interface AxiosInstance {
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>
    post<T = any>(
      url: string,
      data?: unknown,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>>
    create(config?: AxiosRequestConfig): AxiosInstance
    interceptors: {
      request: { use: (fn: unknown) => void; eject: (fn: unknown) => void }
      response: { use: (fn: unknown) => void; eject: (fn: unknown) => void }
    }
    defaults: Record<string, unknown>
  }
  const axios: AxiosInstance
  export default axios
}

declare module '*/time.js' {
  export function formatRelativeTime(value?: string | number | Date | null): string
  export function formatDateTime(value?: string | number | Date | null): string
}

declare module '*/daily_access_key.js' {
  export const PROTECTED_VIEWS: readonly string[]
  export function getDailyDateStamp(value?: Date): string
  export function generateDailyAccessKey(value?: Date): string
  export function sanitizeDailyAccessInput(value?: string): string
  export function verifyDailyAccessKey(value: unknown, date?: Date): boolean
  export function isProtectedView(view: unknown): boolean
  export function getProtectedViewLabel(view: unknown): string
  export function hasDailyAccessGrant(date?: Date): boolean
  export function markDailyAccessGranted(date?: Date): void
  export function clearDailyAccessGrant(): void
}

declare module '*/schedule_prefetch.js' {
  export const SCHEDULE_POPUP_PENDING_KEY: string
  export const SCHEDULE_SWITCH_PENDING_KEY: string
  export function readScheduleRenderSnapshot(
    studentId: string,
    semester?: string
  ): Record<string, unknown> | null
  export function clearScheduleRenderSnapshot(studentId?: string): void
  export function updateStoredScheduleMeta(
    meta: Record<string, unknown>,
    fallbackSemester?: string
  ): void
  export function buildScheduleCacheKey(studentId: string, semester?: string): string
  export function hasScheduleRenderSnapshot(studentId: string, semester?: string): boolean
  export function writeScheduleRenderSnapshot(
    studentId: string,
    snapshot: Record<string, unknown>
  ): { semester?: string; [key: string]: any } | null
  export function isAutoScheduleLockReason(reason?: string): boolean
  export function readScheduleLockDetail(studentId?: string): {
    student_id?: string
    semester?: string
    reason?: string
    at?: number
  } | null
  export function readScheduleLock(studentId?: string): string
  export function clearScheduleLock(studentId?: string): void
  export function writeScheduleLock(
    studentId: string,
    semester: string,
    reason?: string
  ): void
  export function markScheduleSwitchPending(
    studentId: string,
    semester: string,
    reason?: string
  ): void
  export function consumeScheduleSwitchPending(studentId?: string): string
  export function queueScheduleSemesterPopup(
    studentId: string,
    semester: string,
    reason?: string
  ): void
  export function getCachedScheduleSnapshot(
    studentId: string,
    semester?: string
  ): { data?: any; timestamp?: string | number; [key: string]: any } | null
  export function warmupScheduleForStudent(
    studentId: string,
    options?: Record<string, unknown>
  ): Promise<{
    success: boolean
    semester?: string
    payload?: any
    error?: string
    need_login?: boolean
    [key: string]: any
  }>
}

declare module '*/usage_tracker.js' {
  export function setUsageTrackingStudentId(studentId: string): void
  export function trackViewNavigation(fromView: string, toView: string): Promise<unknown>
  export function trackModuleOpen(input: Record<string, unknown>): Promise<unknown>
  export function trackAppForeground(): Promise<unknown>
  export function trackAppBackground(): Promise<unknown>
  export function initUsageTracker(options?: { studentId?: string }): void
  export function getWebUsagePendingQueues(): Record<string, unknown>
  export function clearWebUsagePendingQueues(input: Record<string, unknown>): void
  export function fetchPersonalUsageSummary(studentId: string): Promise<unknown>
  export function getUsageStatsRuntimeConfig(): Record<string, unknown>
  export function runUsageStatsUpload(input: Record<string, unknown>): Promise<unknown>
  export function fetchRemotePersonalUsageSummary(studentId: string): Promise<unknown>
  export function scheduleUsageUpload(input: {
    studentId: string
    reason?: string
    force?: boolean
  }): unknown
}

declare module '*/usage_uploader.js' {
  export function scheduleUsageUpload(input: {
    studentId: string
    reason?: string
    force?: boolean
  }): unknown
  export function startUsageUploadScheduler(getStudentId: () => string): unknown
  export function stopUsageUploadScheduler(): void
}

declare module '*/useSessionCredentials.js' {
  export function loadPortalStoredPassword(): Promise<Record<string, unknown> | null>
  export function loadChaoxingStoredPassword(): Promise<Record<string, unknown> | null>
}
