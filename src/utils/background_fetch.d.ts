export interface BackgroundFetchEventContext {
  taskId?: string
  studentId?: string
  reason?: string
}

export interface BackgroundFetchSyncContext {
  studentId?: string
  settings?: Record<string, unknown>
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
