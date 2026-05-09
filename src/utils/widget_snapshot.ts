// src/utils/widget_snapshot.ts
// 纯函数：从 Schedule_Cache 派生 TodayCourseSnapshot，无 I/O、无副作用

import type { TodayCourseSnapshot, WidgetCourse } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'

/**
 * 节次 → 时间映射表（与 Dashboard / notify_center 保持一致）
 * 用于当 cache 条目缺少 time_start/time_end 时，从 period 推导
 */
const PERIOD_TIME_MAP: Record<number, { start: string; end: string }> = {
  1: { start: '08:20', end: '09:05' },
  2: { start: '09:10', end: '09:55' },
  3: { start: '10:15', end: '11:00' },
  4: { start: '11:05', end: '11:50' },
  5: { start: '14:00', end: '14:45' },
  6: { start: '14:50', end: '15:35' },
  7: { start: '15:55', end: '16:40' },
  8: { start: '16:45', end: '17:30' },
  9: { start: '18:30', end: '19:15' },
  10: { start: '19:20', end: '20:05' },
  11: { start: '20:10', end: '20:55' },
  12: { start: '21:00', end: '21:45' },
  13: { start: '21:50', end: '22:35' },
  14: { start: '22:40', end: '23:25' },
}

// ─── 辅助工具 ───────────────────────────────────────────────────────────────

const toSafeString = (v: unknown): string => String(v ?? '').trim()

const toPositiveInt = (v: unknown, fallback: number): number => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

/**
 * 判断字符串是否为合法 HH:mm 格式
 */
const isValidTimeStr = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{2}:\d{2}$/.test(s)

// ─── 导出的纯函数 ─────────────────────────────────────────────────────────────

/**
 * 返回 Asia/Shanghai 时区下的 "YYYY-MM-DD" 日期字符串
 * 使用 Intl.DateTimeFormat 固定时区，避免设备本地时区差异
 */
export function formatLocalDate(now: Date): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // zh-CN 格式为 "2024/01/15"，需要转换为 "2024-01-15"
  const parts = formatter.formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value ?? '1970'
  const month = parts.find(p => p.type === 'month')?.value ?? '01'
  const day = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

/**
 * 返回 Asia/Shanghai 时区下的 ISO weekday（1=周一 ... 7=周日）
 */
export function getIsoWeekday(now: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  })
  const weekdayStr = formatter.format(now)
  // en-US short weekday: Sun, Mon, Tue, Wed, Thu, Fri, Sat
  const map: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  }
  return map[weekdayStr] ?? 1
}

/**
 * 从 cache 数组中提取指定 weekIndex + weekday 的课程
 * - 按 week_index（或 weeks 数组）+ weekday 过滤
 * - 跨周重复实例去重（按 name+period_start+period_end+location 组合）
 * - 排序：time_start 升序，平局按 period_start 升序
 */
export function extractCoursesOfDay(
  cache: unknown[],
  weekIndex: number,
  weekday: number,
): WidgetCourse[] {
  if (!Array.isArray(cache) || cache.length === 0) return []

  const results: WidgetCourse[] = []

  for (const item of cache) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>

    // ── 匹配 weekday ──
    const itemWeekday = toPositiveInt(entry.weekday ?? entry.day, 0)
    if (itemWeekday !== weekday) continue

    // ── 匹配 week_index ──
    // 支持两种格式：
    //   1) entry.week_index === weekIndex（单值）
    //   2) entry.weeks 数组包含 weekIndex
    const hasWeekIndex = 'week_index' in entry
    const hasWeeks = 'weeks' in entry && Array.isArray(entry.weeks)

    if (hasWeekIndex) {
      if (toPositiveInt(entry.week_index, 0) !== weekIndex) continue
    } else if (hasWeeks) {
      const weeks = (entry.weeks as unknown[])
        .map(w => Number(w))
        .filter(w => Number.isFinite(w) && w > 0)
      if (!weeks.includes(weekIndex)) continue
    }
    // 如果既没有 week_index 也没有 weeks，仍然包含（防御性：可能是自定义课程无周次限制）

    // ── 提取字段 ──
    const name = toSafeString(entry.name)
    if (!name) continue // 无课程名则跳过

    const periodStart = toPositiveInt(
      entry.period_start ?? entry.period ?? entry.start_period,
      0,
    )
    if (periodStart < 1 || periodStart > 14) continue

    const periodEnd = resolvePeriodEnd(entry, periodStart)

    const timeStart = resolveTimeStart(entry, periodStart)
    const timeEnd = resolveTimeEnd(entry, periodEnd)

    const location = toSafeString(entry.location ?? entry.room_code ?? entry.room)
    const teacher = toSafeString(entry.teacher)
    const color = typeof entry.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(entry.color)
      ? entry.color
      : undefined

    // ── 去重：同名同地点的课程，如果节次有重叠则只保留第一个 ──
    const dedupeKey = `${name}|${location}`
    const existingIdx = results.findIndex(r =>
      r.name === name.slice(0, 80) &&
      r.location === location.slice(0, 80) &&
      // 节次有重叠
      periodStart <= r.period_end && periodEnd >= r.period_start
    )
    if (existingIdx >= 0) {
      // 合并：扩展已有条目的范围
      const existing = results[existingIdx]
      results[existingIdx] = {
        ...existing,
        period_start: Math.min(existing.period_start, periodStart),
        period_end: Math.max(existing.period_end, periodEnd),
        time_start: periodStart < existing.period_start ? timeStart : existing.time_start,
        time_end: periodEnd > existing.period_end ? timeEnd : existing.time_end,
      }
      continue
    }

    const course: WidgetCourse = {
      period_start: periodStart,
      period_end: periodEnd,
      time_start: timeStart,
      time_end: timeEnd,
      name: name.slice(0, 80),
      location: location.slice(0, 80),
      teacher: teacher.slice(0, 80),
    }
    if (color) course.color = color

    results.push(course)
  }

  // 排序：time_start 升序，平局按 period_start 升序
  results.sort((a, b) =>
    a.time_start.localeCompare(b.time_start) || a.period_start - b.period_start,
  )

  return results
}

/**
 * 主入口：构建 TodayCourseSnapshot 纯函数
 * - 不碰 I/O，不访问 localStorage / 网络
 * - cache 为空或缺失时返回 courses=[] 的合法 snapshot（R4.5）
 */
export function buildTodayCourseSnapshot(params: {
  cache: unknown[]
  studentId: string
  weekIndex: number
  now?: Date
}): TodayCourseSnapshot {
  const now = params.now ?? new Date()
  const cache = Array.isArray(params.cache) ? params.cache : []

  const date = formatLocalDate(now)
  const weekday = getIsoWeekday(now)
  const courses = extractCoursesOfDay(cache, params.weekIndex, weekday)

  return {
    version: 1,
    generated_at: now.toISOString(),
    date,
    student_id: params.studentId,
    week_index: params.weekIndex,
    weekday,
    courses,
  }
}

// ─── RenderKind 决策表 ─────────────────────────────────────────────────────

/**
 * Widget 渲染分支类型
 * - login：未登录或无快照
 * - dataError：快照数据异常（版本非法、关键字段缺失、反序列化失败）
 * - weekend：当日无课且为周末
 * - noCourse：当日无课且为工作日
 * - normal：正常渲染课程列表，staleHint 表示数据可能过期
 */
export type RenderKind =
  | { kind: 'login' }
  | { kind: 'dataError' }
  | { kind: 'weekend' }
  | { kind: 'noCourse' }
  | { kind: 'normal'; staleHint?: boolean }

/** 24 小时毫秒数 */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

/**
 * 根据 snapshot 状态与当前时间，决定 Widget 应渲染哪个分支
 * 纯函数，无 I/O、无副作用
 *
 * 优先级（从高到低）：
 * 1. snapshot 为空 / student_id 为空 → login
 * 2. 版本非法 / 关键字段缺失 → dataError
 * 3. courses 为空 + 周末 → weekend
 * 4. courses 为空 + 工作日 → noCourse
 * 5. 正常 → normal（附带 staleHint 如果 generated_at 超过 24h）
 */
export function resolveRenderKind(
  snapshot: TodayCourseSnapshot | null | undefined,
  now: Date,
): RenderKind {
  // ── 1. 无快照或 student_id 为空 → login ──
  if (!snapshot || !snapshot.student_id || snapshot.student_id.trim() === '') {
    return { kind: 'login' }
  }

  // ── 2. 基本合法性校验 → dataError ──
  if (!isSnapshotSane(snapshot)) {
    return { kind: 'dataError' }
  }

  // ── 3/4. courses 为空时按 weekday 区分 ──
  if (!Array.isArray(snapshot.courses) || snapshot.courses.length === 0) {
    if (snapshot.weekday === 6 || snapshot.weekday === 7) {
      return { kind: 'weekend' }
    }
    return { kind: 'noCourse' }
  }

  // ── 5. 正常分支，计算 staleHint ──
  const stale = isStale(snapshot.generated_at, now)
  if (stale) {
    return { kind: 'normal', staleHint: true }
  }
  return { kind: 'normal' }
}

/**
 * 快照基本合法性检查（不含 student_id，已在上层处理）
 * - version 必须 >= 1
 * - 必须有 date（非空字符串）
 * - 必须有 generated_at（非空字符串）
 * - weekday 必须在 1..7
 * - courses 必须是数组（可为空）
 */
function isSnapshotSane(s: TodayCourseSnapshot): boolean {
  if (typeof s.version !== 'number' || s.version < 1) return false
  if (typeof s.date !== 'string' || s.date.trim() === '') return false
  if (typeof s.generated_at !== 'string' || s.generated_at.trim() === '') return false
  if (typeof s.weekday !== 'number' || s.weekday < 1 || s.weekday > 7) return false
  if (!Array.isArray(s.courses)) return false
  return true
}

/**
 * 判断 generated_at 是否超过 24 小时
 * 防御性处理：无法解析时视为不过期（避免误报）
 */
function isStale(generatedAt: string, now: Date): boolean {
  const ts = Date.parse(generatedAt)
  if (!Number.isFinite(ts)) return false // 无法解析时不标记过期
  return now.getTime() - ts > STALE_THRESHOLD_MS
}

// ─── pickRows ─────────────────────────────────────────────────────────────────

/**
 * 从 snapshot 中按容量截取课程行，并计算溢出角标数字
 * - 纯函数，无副作用，幂等
 * - capacity === Infinity 或 capacity >= courses.length 时返回全部，overflowBadge = 0
 * - 否则返回前 capacity 条（已按 time_start 排序），overflowBadge = total - capacity
 */
export function pickRows(
  snapshot: TodayCourseSnapshot,
  capacity: number,
): { rows: WidgetCourse[]; overflowBadge: number } {
  const courses = snapshot.courses
  if (courses.length === 0) {
    return { rows: [], overflowBadge: 0 }
  }
  if (!Number.isFinite(capacity) || capacity >= courses.length) {
    return { rows: courses.slice(), overflowBadge: 0 }
  }
  const cap = Math.max(0, Math.floor(capacity))
  return { rows: courses.slice(0, cap), overflowBadge: courses.length - cap }
}

// ─── maskStudentId & a11yLabel ─────────────────────────────────────────────────

/**
 * 学号脱敏：保留前 2 位与后 2 位，中间用 ** 替代
 * - 长度 <= 4 时全部用 * 替代
 * - 空字符串返回空字符串
 * - 非字符串输入返回空字符串
 */
export function maskStudentId(s: string): string {
  if (typeof s !== 'string' || s === '') return ''
  if (s.length <= 4) return '*'.repeat(s.length)
  return s.slice(0, 2) + '**' + s.slice(-2)
}

/**
 * 生成课程行的无障碍标签
 * 格式："第 {period_start} 节 {time_start} 到 {time_end} {name} {location}"
 * 用于 Android contentDescription / iOS accessibilityLabel
 */
export function a11yLabel(course: WidgetCourse): string {
  const label = `第 ${course.period_start} 节 ${course.time_start} 到 ${course.time_end} ${course.name} ${course.location}`
  return label.trimEnd()
}

// ─── buildDeepLink ─────────────────────────────────────────────────────────────

/**
 * 构造 Widget 点击跳转的 deep link URL
 * - 基础：minihbut://schedule?date=YYYY-MM-DD&source=widget
 * - 若提供 row（具体课程行），追加 &period={period_start}
 * 纯字符串拼接，无 URL 编码（所有值均为简单字母数字/日期）
 */
export function buildDeepLink(
  snapshot: TodayCourseSnapshot,
  row?: WidgetCourse,
): string {
  let url = `minihbut://schedule?date=${snapshot.date}&source=widget`
  if (row != null && typeof row.period_start === 'number' && row.period_start >= 1) {
    url += `&period=${row.period_start}`
  }
  return url
}

// ─── renderFromBytes ──────────────────────────────────────────────────────────

/**
 * 从原始字节串（JSON 字符串）容错反序列化 snapshot，然后调用 resolveRenderKind
 * - 捕获一切异常（JSON.parse 失败、类型错误等），返回 { kind: 'dataError' }
 * - 空串/null/undefined 视为无快照，返回 { kind: 'login' }（通过 resolveRenderKind(null, now)）
 */
export function renderFromBytes(raw: string | null | undefined, now: Date): RenderKind {
  try {
    if (raw == null || raw === '') {
      return resolveRenderKind(null, now)
    }
    const parsed = JSON.parse(raw) as TodayCourseSnapshot
    return resolveRenderKind(parsed, now)
  } catch {
    return { kind: 'dataError' }
  }
}

// ─── 内部辅助 ─────────────────────────────────────────────────────────────────

/**
 * 解析 period_end，支持多种字段名与 duration/djs 推导
 */
function resolvePeriodEnd(entry: Record<string, unknown>, periodStart: number): number {
  const explicit = toPositiveInt(entry.period_end ?? entry.end_period, 0)
  if (explicit >= periodStart && explicit <= 14) return explicit

  // 从 duration / djs 推导
  const span = toPositiveInt(entry.duration ?? entry.djs, 1)
  const computed = periodStart + span - 1
  return Math.min(14, Math.max(periodStart, computed))
}

/**
 * 解析 time_start：优先使用条目自带值，否则从 PERIOD_TIME_MAP 推导
 */
function resolveTimeStart(entry: Record<string, unknown>, periodStart: number): string {
  if (isValidTimeStr(entry.time_start)) return entry.time_start
  return PERIOD_TIME_MAP[periodStart]?.start ?? '00:00'
}

/**
 * 解析 time_end：优先使用条目自带值，否则从 PERIOD_TIME_MAP 推导
 */
function resolveTimeEnd(entry: Record<string, unknown>, periodEnd: number): string {
  if (isValidTimeStr(entry.time_end)) return entry.time_end
  return PERIOD_TIME_MAP[periodEnd]?.end ?? '23:59'
}
