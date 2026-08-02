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

export function syncBackgroundFetchContext(options: {
  studentId: string
  settings: BackgroundFetchSettings
  dormSelection?: string[]
}): Promise<unknown>

export function clearBackgroundFetchContext(): Promise<unknown>

export function initBackgroundFetchScheduler(onEvent?: (event: unknown) => void): Promise<boolean>

export function getBackgroundFetchRuntimeState(): Promise<unknown>
