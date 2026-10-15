// src/features/teacher/cache/teacher_sync_status.ts
//
// Teacher Portal V2（#1066）：教师页面「上次成功同步」状态与时间格式化（纯函数）。
//
// 设计原则（诚实优先，绝不把「打开页面 / 读到缓存 / 刷新失败」当成功同步）：
//   - 只有**真实成功**的请求落地时刻（或后端可信 `sync_time`）才更新同步时间；
//   - 缓存命中且已过期 / 离线 → `cached`（时间 + 可能过期），不谎称实时；
//   - 刷新失败保留旧时间 → `failed`（离线/超时归入 `cached`，语义更贴近「缓存可用」）。
//
// 时间格式化输出 i18n key + 参数（由视图 `tf()` 消费），保证中/英/日一致且可测。

import type { TeacherDataErrorKind } from '../types'

/** 同步状态语义（跨教师页面统一）。 */
export type TeacherSyncStatus = 'synced' | 'updating' | 'cached' | 'never' | 'failed'

/** 视图加载阶段（与 `TeacherLoadState.status` 对齐）。 */
export type TeacherSyncPhase = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface TeacherSyncStatusInput {
  phase: TeacherSyncPhase
  /** 当前是否已有可展示数据（缓存或上次成功）。 */
  hasData: boolean
  /** 数据是否来自本地缓存（而非本次网络成功）。 */
  fromCache: boolean
  /** 缓存是否已过期。 */
  stale: boolean
  /** 是否存在最后一次成功同步时间。 */
  hasSyncTime: boolean
  /** 当前是否离线（`navigator.onLine === false`）。 */
  offline: boolean
  /** 最近一次错误类别（用于区分「离线缓存」与「更新失败」）。 */
  errorKind?: TeacherDataErrorKind | null
}

/**
 * 解析同步状态。
 *
 * - `updating`：有请求在飞（保留原时间）；
 * - `cached`：离线或超时导致的缓存回退（时间 + 可能过期）；
 * - `failed`：其它错误（权限 / 会话过期 / 错误页 / 未知），保留旧时间 + 错误提示；
 * - `never`：从未成功同步；
 * - `synced`：本次网络成功或新鲜缓存。
 */
export const resolveTeacherSyncStatus = (input: TeacherSyncStatusInput): TeacherSyncStatus => {
  if (input.phase === 'error') {
    if (!input.hasData) return 'failed'
    if (input.offline || input.errorKind === 'timeout') return 'cached'
    return 'failed'
  }
  if (input.phase === 'loading') {
    // 正在更新：有上次时间则保留展示，否则尚未同步。
    return input.hasSyncTime ? 'updating' : 'never'
  }
  // idle / ready / empty
  if (!input.hasSyncTime) return 'never'
  if (input.fromCache && (input.stale || input.offline)) return 'cached'
  return 'synced'
}

/** 是否离线（无 `navigator` 视为在线，避免误报）。 */
export const isTeacherOffline = (): boolean => {
  try {
    return globalThis.navigator?.onLine === false
  } catch {
    return false
  }
}

// ────────────────────────────────────────────────────────────────
// 时间格式化（输出 i18n key + 参数）
// ────────────────────────────────────────────────────────────────

export interface TeacherSyncTimeDescriptor {
  key: string
  params: Record<string, string>
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** 本地 HH:MM。 */
const formatClock = (date: Date): string => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`

/** 本地 YYYY-MM-DD。 */
const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

/** 同一本地自然日。 */
const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * 解析时间输入为 Date。
 *
 * - 支持 ISO 8601 与 `YYYY-MM-DD HH:MM(:SS)`（无时区按**本地时间**解析）；
 * - 空 / 非法返回 null（由调用方展示「尚未同步」）。
 */
export const parseTeacherSyncTime = (value: unknown): Date | null => {
  const text = String(value ?? '').trim()
  if (!text) return null
  // 无时区的「YYYY-MM-DD HH:MM(:SS)」在部分引擎被解析为 UTC，这里显式按本地时间构造。
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      match[6] ? Number(match[6]) : 0
    )
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed)
}

/**
 * 把「上次成功同步时间」描述为 i18n key + 参数。
 *
 * - 空 / 非法 → null（视图走「尚未同步」）；
 * - < 1 分钟 → `teacher.sync.justNow`；
 * - < 1 小时 → `teacher.sync.minutesAgo`；
 * - 同一天 → `teacher.sync.todayAt`（今天 HH:MM）；
 * - 昨天 → `teacher.sync.yesterdayAt`；
 * - 更早 / 时钟差（未来时间）→ `teacher.sync.at`（绝对日期 + 时间）。
 */
export const describeTeacherSyncTime = (
  value: unknown,
  now: number = Date.now()
): TeacherSyncTimeDescriptor | null => {
  const date = parseTeacherSyncTime(value)
  if (!date) return null
  const nowDate = new Date(now)
  const diff = now - date.getTime()
  // 时钟差（未来时间）：不显示负数相对时间，改用绝对时间，避免误导。
  if (diff < 0) {
    return { key: 'teacher.sync.at', params: { date: formatDate(date), time: formatClock(date) } }
  }
  if (diff < 60 * 1000) return { key: 'teacher.sync.justNow', params: {} }
  if (diff < 60 * 60 * 1000) {
    return { key: 'teacher.sync.minutesAgo', params: { n: String(Math.floor(diff / (60 * 1000))) } }
  }
  if (isSameDay(date, nowDate)) {
    return { key: 'teacher.sync.todayAt', params: { time: formatClock(date) } }
  }
  const yesterday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return { key: 'teacher.sync.yesterdayAt', params: { time: formatClock(date) } }
  }
  return { key: 'teacher.sync.at', params: { date: formatDate(date), time: formatClock(date) } }
}

/** 同步状态 → i18n key。 */
export const teacherSyncStatusKey = (status: TeacherSyncStatus): string =>
  `teacher.sync.status.${status}`
