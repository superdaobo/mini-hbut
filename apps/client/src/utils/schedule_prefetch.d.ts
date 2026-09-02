// 测试 fixture：schedule_prefetch 模块类型声明（与 schedule_prefetch.js 导出对齐）
export const SCHEDULE_POPUP_PENDING_KEY: string
export const SCHEDULE_SWITCH_PENDING_KEY: string

export function buildNearestSemesterOrder(
  semesterList: unknown,
  anchorSemester?: string
): string[]
export function updateStoredScheduleMeta(meta: unknown, fallbackSemester?: string): unknown
export function buildScheduleCacheKey(studentId: unknown, semester?: string): string
export function readScheduleRenderSnapshot(studentId: unknown, semester?: string): unknown
export function hasScheduleRenderSnapshot(studentId: unknown, semester?: string): boolean
export function writeScheduleRenderSnapshot(studentId: unknown, snapshot: unknown): unknown
export function clearScheduleRenderSnapshot(studentId?: string): unknown
export function isAutoScheduleLockReason(reason?: string): boolean
export function readScheduleLockDetail(studentId?: string): unknown
export function readScheduleLock(studentId?: string): string
export function clearScheduleLock(studentId?: string): boolean
export function writeScheduleLock(studentId: unknown, semester: unknown, reason?: string): unknown
export function markScheduleSwitchPending(studentId: unknown, semester: unknown, reason?: string): void
export function consumeScheduleSwitchPending(studentId?: string): string
export function queueScheduleSemesterPopup(
  studentId: unknown,
  semester: unknown,
  reason?: string
): void
export function getCachedScheduleSnapshot(studentId: unknown, semester?: string): unknown
export function readSemesterStartDates(): Record<string, string>
export function recordSemesterStartDate(semester: unknown, startDate: unknown): boolean
export function probeSemesterSchedule(
  studentId: unknown,
  semester?: string
): Promise<{
  ok: boolean
  semester: string
  published: boolean
  count: number
  startDate: string
  fromCache?: boolean
  stale?: boolean
  needLogin?: boolean
  payload?: unknown
}>
export function warmupScheduleForStudent(studentId: unknown, options?: Record<string, unknown>): Promise<unknown>
