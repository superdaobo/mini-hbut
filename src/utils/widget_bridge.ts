// src/utils/widget_bridge.ts
// 门面汇总：封装 Widget 上层 API，供 App 集成层调用
// 对齐 design §9.2 — afterScheduleRefresh / tryWriteSnapshotFromCache / clearWidgetForLogout

import { buildTodayCourseSnapshot } from './widget_snapshot'
import { writeSnapshotWithRetry, clearSnapshot } from '@/platform/capacitor/widget'
import { pushDebugLog } from './debug_logger'
import {
  getCachedScheduleSnapshot,
  readScheduleLock
} from './schedule_prefetch.js'

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

    const lockedSemester = readScheduleLock(sid)
    const cached = getCachedScheduleSnapshot(sid, lockedSemester)
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
