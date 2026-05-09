// src/utils/widget_bridge.ts
// 门面汇总：封装 Widget 上层 API，供 App 集成层调用
// 对齐 design §9.2 — afterScheduleRefresh / tryWriteSnapshotFromCache / clearWidgetForLogout
//
// 注意：本文件不得从 schedule_prefetch.js 导入，避免循环依赖。
// schedule_prefetch.js 导入了本文件的 afterScheduleRefresh。

import { buildTodayCourseSnapshot } from './widget_snapshot'
import { writeSnapshotWithRetry, clearSnapshot } from '@/platform/capacitor/widget'
import { pushDebugLog } from './debug_logger'
import { getCacheKey } from './api.js'
import { isTauriRuntime, invokeNative } from '@/platform/native'

// ─── 内联的缓存读取逻辑（避免循环依赖 schedule_prefetch ↔ widget_bridge） ───

const SCHEDULE_LOCK_KEY = 'hbu_schedule_lock'

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function toSafeText(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * 读取课表锁定的学期（内联版，不依赖 schedule_prefetch）
 */
function readScheduleLockInline(studentId: string): string {
  const record = readJson(SCHEDULE_LOCK_KEY) as Record<string, unknown> | null
  if (!record) return ''
  const sid = toSafeText(studentId)
  const recordSid = toSafeText(record.student_id)
  if (sid && recordSid && sid !== recordSid) return ''
  return toSafeText(record.semester)
}

/**
 * 从 localStorage 读取课表缓存快照（内联版，不依赖 schedule_prefetch）
 */
function getCachedScheduleSnapshotInline(studentId: string, semester: string): { data: { data?: unknown[] } } | null {
  const sid = toSafeText(studentId)
  if (!sid) return null

  const buildKey = (s: string, sem?: string) => sem ? `schedule:${s}:${sem}` : `schedule:${s}`

  const tryParse = (cacheKey: string) => {
    try {
      const raw = localStorage.getItem(getCacheKey(cacheKey))
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed?.data) return null
      return { data: parsed.data }
    } catch {
      return null
    }
  }

  const sem = toSafeText(semester)
  if (sem) {
    const scoped = tryParse(buildKey(sid, sem))
    if (scoped) return scoped
  }

  return tryParse(buildKey(sid))
}

// ─── 公开 API ───

/**
 * 从 schedule meta（localStorage）读取 current_week
 * 防御性：解析失败返回 1
 */
function readCurrentWeekFromMeta(): number {
  try {
    const raw = localStorage.getItem('hbu_schedule_meta')
    if (!raw) return 1
    const parsed = JSON.parse(raw)
    const week = Number(parsed?.current_week)
    return Number.isFinite(week) && week >= 1 ? Math.floor(week) : 1
  } catch {
    return 1
  }
}

/**
 * 课表刷新成功后写入 Widget 快照
 * - 由 schedule_prefetch / ScheduleView 手动刷新成功分支调用
 * - 内部构建 snapshot + 带重试写入
 *
 * @param sid 学号
 * @param payload 课表 API 返回的完整 payload（含 data 数组）
 * @param opts.selectedWeek 当前选中周次
 */
export async function afterScheduleRefresh(
  sid: string,
  payload: unknown,
  opts: { selectedWeek: number }
): Promise<void> {
  try {
    const cache = (payload as { data?: unknown[] })?.data
    if (!Array.isArray(cache)) return

    const snapshot = buildTodayCourseSnapshot({
      cache,
      studentId: sid,
      weekIndex: opts.selectedWeek
    })

    await writeSnapshotWithRetry(snapshot)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[widget] afterScheduleRefresh failed: ${message}`)
    pushDebugLog('widget', 'widget_write_failed', 'warn', { code, source: 'afterScheduleRefresh' })
  }
}

/**
 * 从现有缓存构建并写入 Widget 快照
 * - 启动恢复 / 跨天触发时调用
 * - 读取 localStorage 中的课表缓存 + meta，构建 snapshot 后写入
 *
 * @param sid 学号
 */
export async function tryWriteSnapshotFromCache(sid: string): Promise<void> {
  try {
    if (!sid) return

    const lockedSemester = readScheduleLockInline(sid)
    const cached = getCachedScheduleSnapshotInline(sid, lockedSemester)
    const cache = cached?.data?.data
    if (!Array.isArray(cache)) return

    const weekIndex = readCurrentWeekFromMeta()

    const snapshot = buildTodayCourseSnapshot({
      cache,
      studentId: sid,
      weekIndex
    })

    await writeSnapshotWithRetry(snapshot)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[widget] tryWriteSnapshotFromCache failed: ${message}`)
    pushDebugLog('widget', 'widget_write_failed', 'warn', { code, source: 'tryWriteSnapshotFromCache' })
  }
}

/**
 * 登出时清空 Widget 快照
 * - 在登出流程的 finally 块调用
 * - 静默捕获所有错误，确保不影响登出流程
 */
export async function clearWidgetForLogout(): Promise<void> {
  try {
    await clearSnapshot()
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[widget] clearWidgetForLogout failed: ${message}`)
    pushDebugLog('widget', 'widget_write_failed', 'warn', { code, source: 'clearWidgetForLogout' })
  }
}

/**
 * 调试：获取 widget 路径信息（仅 Tauri Android 可用）
 */
export async function debugWidgetPaths(): Promise<unknown> {
  try {
    if (!isTauriRuntime()) return { error: 'not tauri runtime' }
    return await invokeNative('debug_widget_paths')
  } catch (err: unknown) {
    return { error: String(err) }
  }
}

/**
 * 写入电费数据到小组件
 */
export async function writeElectricityToWidget(data: {
  quantity: number
  room?: string
  acQuantity?: number
  isLow?: boolean
}): Promise<void> {
  try {
    if (!isTauriRuntime()) return
    const ua = String(globalThis?.navigator?.userAgent || '').toLowerCase()
    if (!ua.includes('android')) return
    const json = JSON.stringify(data)
    await invokeNative('write_electricity_snapshot', { json })
  } catch (err: unknown) {
    console.warn('[widget] writeElectricityToWidget failed:', err)
  }
}

/**
 * 写入考试数据到小组件
 */
export async function writeExamToWidget(data: {
  exams: Array<{ course_name: string; exam_date: string; exam_time: string; location: string }>
  days_left?: number
}): Promise<void> {
  try {
    if (!isTauriRuntime()) return
    const ua = String(globalThis?.navigator?.userAgent || '').toLowerCase()
    if (!ua.includes('android')) return
    const json = JSON.stringify(data)
    await invokeNative('write_exam_snapshot', { json })
  } catch (err: unknown) {
    console.warn('[widget] writeExamToWidget failed:', err)
  }
}
