// 测试 fixture：background_fetch 模块类型声明（与 background_fetch.js 导出对齐）
export interface BackgroundFetchSettings {
  enableBackground: boolean
  enableGradeNotice: boolean
  enableExamReminder: boolean
  enablePowerNotice: boolean
  enableClassReminder: boolean
  classLeadMinutes: number
  intervalMinutes: number
  [key: string]: unknown
}

export interface BackgroundFetchEventContext {
  taskId?: string
  studentId?: string
  reason?: string
}

export interface BackgroundFetchSyncContext {
  studentId?: string
  settings?: BackgroundFetchSettings
  dormSelection?: unknown[]
  schoolInboxState?: unknown[]
  loginMethod?: string
}

export interface BackgroundFetchRuntimeState {
  runtime: string
  supported: boolean
  configured: boolean
  available: boolean
  statusCode: number
  mode?: string
  lastRunAt?: string
  lastTaskId?: string
  lastError?: string
  reason?: string
}

export function syncBackgroundFetchContext(context?: BackgroundFetchSyncContext): Promise<void>
export function clearBackgroundFetchContext(): Promise<void>
export function initBackgroundFetchScheduler(
  onEvent?: (context: BackgroundFetchEventContext) => Promise<void> | void
): Promise<boolean>
export function getBackgroundFetchRuntimeState(): Promise<BackgroundFetchRuntimeState>
