/**
 * #834 时间几何：真实钟表时间 → 现有课表 Y 坐标的近似映射（纯函数，无 DOM / Vue / CSS 依赖）。
 *
 * 核心问题：
 * 现有课表是 11 个**等高**课节行（不是 24 小时线性日历），而真实时间的课间
 * gap 长短悬殊（5 / 20 / 130 / 5 / 5 / 20 / 5 / 60 / 5 / 5 分钟）。若直接按
 * 真实分钟线性铺开，11 行会严重不等高，破坏现有视觉。
 *
 * 解决方案（行内二段切分 + 课间压缩）：
 * ```
 * 第 i 行（高度 rowHeight，顶部 rowTop = (i-1) * rowHeight）
 * ┌────────────── 课节段 periodBand_i ──────────────┬── 课间段 gapBand_i ──┐
 * │ start_i ──线性──> end_i                          │ end_i ──线性──> start_{i+1}
 * └─────────────────────────────────────────────────┴──────────────────────┘
 * ```
 * - 课节段：`start_i..end_i` 线性映射到 `[rowTop, rowTop + periodBand_i]`；
 * - 课间段：用**原始** gap 做线性插值（保证 12:30 / 13:30 这类长午休内的
 *   时刻仍可区分且严格单调），但压缩进有限的 `gapBand_i`；
 * - 压缩上限 `maxGapMinutes` 默认 30，仅影响 band 高度分配，不影响插值分母。
 *
 * 关键不变量：**第 i 节开始时间精确落在第 i 行顶部**，从而与
 * `grid-row: period / span djs` 占满整行的课程卡视觉对齐。
 *
 * 安全性：任何非法输入都不得抛异常、不得外泄 NaN / Infinity。
 */
import type {
  ScheduleGridRect,
  ScheduleTimeGeometry,
  ScheduleTimeGeometryRow,
  ScheduleTimePosition,
  ScheduleTimeSlot
} from './timelineTypes'

/** 一天的分钟数 */
export const MINUTES_PER_DAY = 1440

/** 课间压缩上限默认值（分钟） */
export const DEFAULT_MAX_GAP_MINUTES = 30

/** 严格 `HH:MM`（两位时 + 两位分）；'8:2' / '-1:00' 均不匹配 */
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/

/** 数值钳制到 [min, max]；入参非有限数时返回 min */
const clampNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * '14:30' → 870（距 00:00 的分钟数）。
 * 非法输入返回 null（不得抛异常、不得返回 NaN）。
 * 合法范围：00:00 ~ 23:59；允许首尾空白。
 */
export function parseClockToMinute(clock: string): number | null {
  if (typeof clock !== 'string') return null
  const matched = CLOCK_PATTERN.exec(clock.trim())
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * period/djs → 真实起止分钟。
 *
 * 语义要点：跨节次时 end 取**末节**的 end，而不是 `start + 节数 * 时长` 累加
 * （中间夹着不等长课间，累加会得到错误的钟点）。
 * 例：`(5, 2)` → 14:00 ~ 15:35（第 6 节 15:35 结束），而非 14:00 + 90min。
 *
 * 越界钳制：period 钳制到 [1, 节数]，djs 至少为 1，末节钳制到最后一节。
 * 时间表为空 / 元素时间非法 / 起止倒置 → null。
 */
export function getCourseRealInterval(
  period: number,
  djs: number,
  timeSchedule: ScheduleTimeSlot[]
): { startMinute: number; endMinute: number } | null {
  if (!Array.isArray(timeSchedule) || timeSchedule.length === 0) return null
  if (!Number.isFinite(period) || !Number.isFinite(djs)) return null

  const total = timeSchedule.length
  const startIndex = clampNumber(Math.trunc(period), 1, total)
  const span = Math.max(1, Math.trunc(djs) || 1)
  const endIndex = Math.min(total, startIndex + span - 1)

  const startMinute = parseClockToMinute(timeSchedule[startIndex - 1]?.start ?? '')
  const endMinute = parseClockToMinute(timeSchedule[endIndex - 1]?.end ?? '')
  if (startMinute === null || endMinute === null || endMinute <= startMinute) return null

  return { startMinute, endMinute }
}

/**
 * 构建几何模型。
 *
 * @param timeSchedule 按节次升序排列的课节时间表（通常为 constants.ts::timeSchedule）
 * @param slotHeight   每节课行高（px），对应 CSS 变量 --slot-height
 * @param options.maxGapMinutes 课间压缩上限（分钟），默认 30
 *
 * 时间表为空 / 任一节时间非法 / 起止倒置 / slotHeight 非正数 → 返回 `valid: false`
 * 的空模型（行数为 0，总高为 0），保证下游所有坐标计算安全退化。
 */
export function buildScheduleTimeGeometry(
  timeSchedule: ScheduleTimeSlot[],
  slotHeight: number,
  options?: { maxGapMinutes?: number }
): ScheduleTimeGeometry {
  const rawMaxGap = options?.maxGapMinutes
  const maxGapMinutes =
    typeof rawMaxGap === 'number' && Number.isFinite(rawMaxGap) && rawMaxGap >= 0
      ? rawMaxGap
      : DEFAULT_MAX_GAP_MINUTES
  const rowHeight = Number.isFinite(slotHeight) && slotHeight > 0 ? slotHeight : 0

  const emptyGeometry: ScheduleTimeGeometry = {
    slotHeight: rowHeight,
    rowCount: 0,
    totalHeight: 0,
    maxGapMinutes,
    rows: [],
    firstMinute: 0,
    lastMinute: 0,
    valid: false
  }

  if (!Array.isArray(timeSchedule) || timeSchedule.length === 0 || rowHeight === 0) {
    return emptyGeometry
  }

  // 先整表解析：任一节非法即整体判不可用，避免「半可用」几何产出错误坐标
  const parsed: { period: number; startMinute: number; endMinute: number }[] = []
  for (const slot of timeSchedule) {
    const startMinute = parseClockToMinute(slot?.start ?? '')
    const endMinute = parseClockToMinute(slot?.end ?? '')
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      return emptyGeometry
    }
    parsed.push({
      period: Number.isFinite(Number(slot?.p)) ? Number(slot.p) : parsed.length + 1,
      startMinute,
      endMinute
    })
  }

  const rows: ScheduleTimeGeometryRow[] = []
  let totalHeight = 0

  for (let i = 0; i < parsed.length; i += 1) {
    const current = parsed[i]
    const durationMinutes = current.endMinute - current.startMinute
    // 最后一节没有后续课节，gap 记为 0 → 整行都是课节段
    const rawGapMinutes =
      i + 1 < parsed.length
        ? Math.max(0, parsed[i + 1].startMinute - current.endMinute)
        : 0
    // 压缩后的 gap 只用于分配 band 高度；插值分母仍用原始 gap
    const effGapMinutes = Math.min(rawGapMinutes, maxGapMinutes)
    const denominator = durationMinutes + effGapMinutes
    const periodBand =
      denominator > 0 ? (rowHeight * durationMinutes) / denominator : rowHeight
    const rowTop = totalHeight

    rows.push({
      period: current.period,
      rowTop,
      rowHeight,
      startMinute: current.startMinute,
      endMinute: current.endMinute,
      durationMinutes,
      rawGapMinutes,
      effGapMinutes,
      periodBand,
      gapBand: rowHeight - periodBand
    })

    // 每行等高推进：保证 rowTop_i === (i-1) * rowHeight
    totalHeight += rowHeight
  }

  return {
    slotHeight: rowHeight,
    rowCount: rows.length,
    totalHeight,
    maxGapMinutes,
    rows,
    firstMinute: rows[0].startMinute,
    lastMinute: rows[rows.length - 1].endMinute,
    valid: true
  }
}

/**
 * 分钟 → 网格 Y。
 *
 * - 早于第一节开始：`{ y: 0, edge: 'before' }`
 * - 晚于最后一节结束：`{ y: totalHeight, edge: 'after' }`
 * - 其余：落在所属行的课节段或课间段内，`edge: 'inside'`
 *
 * 非有限 minute（NaN / Infinity）按「可见区之前」处理，绝不外泄 NaN。
 */
export function timeToGridY(minute: number, geometry: ScheduleTimeGeometry): ScheduleTimePosition {
  const rows = geometry?.rows ?? []
  const totalHeight =
    Number.isFinite(geometry?.totalHeight) && geometry.totalHeight > 0 ? geometry.totalHeight : 0

  if (!Number.isFinite(minute)) return { y: 0, edge: 'before' }
  if (rows.length === 0) return { y: 0, edge: 'before' }

  const firstMinute = rows[0].startMinute
  const lastMinute = rows[rows.length - 1].endMinute
  if (minute < firstMinute) return { y: 0, edge: 'before' }
  if (minute > lastMinute) return { y: totalHeight, edge: 'after' }

  // 定位所在行：最后一个 startMinute <= minute 的行（落在课间时归属前一行）
  let row = rows[0]
  for (let i = 0; i < rows.length; i += 1) {
    if (minute >= rows[i].startMinute) row = rows[i]
    else break
  }

  let y: number
  if (minute <= row.endMinute) {
    // 课节段：start..end 线性映射到 [rowTop, rowTop + periodBand]
    const span = row.endMinute - row.startMinute
    const ratio = span > 0 ? (minute - row.startMinute) / span : 0
    y = row.rowTop + clampNumber(ratio, 0, 1) * row.periodBand
  } else {
    // 课间段：用原始 gap 做插值（保持单调可区分），压缩进 gapBand
    const gap = row.rawGapMinutes
    const ratio = gap > 0 ? (minute - row.endMinute) / gap : 1
    y = row.rowTop + row.periodBand + clampNumber(ratio, 0, 1) * row.gapBand
  }

  return { y: clampNumber(y, 0, totalHeight), edge: 'inside' }
}

/**
 * 区间 → 网格矩形。
 * `endMinute <= startMinute` 或任一端点非有限数 → null。
 * 返回的 height 保证 >= 0；起点在可见区外时 top 已被 clamp。
 */
export function intervalToGridRect(
  startMinute: number,
  endMinute: number,
  geometry: ScheduleTimeGeometry
): ScheduleGridRect | null {
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) return null
  if (endMinute <= startMinute) return null

  const start = timeToGridY(startMinute, geometry)
  const end = timeToGridY(endMinute, geometry)

  return {
    top: Math.min(start.y, end.y),
    height: Math.max(0, Math.abs(end.y - start.y)),
    startEdge: start.edge,
    endEdge: end.edge
  }
}

/**
 * 半开区间重叠判定：`aStart < bEnd && bStart < aEnd`。
 * 这是全局唯一的 overlap 真源——首尾相接（aEnd === bStart）不算重叠。
 * 任一入参非有限数 → false（安全失败）。
 */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    return false
  }
  return aStart < bEnd && bStart < aEnd
}

/** 整个网格的总高度（= rowCount * slotHeight，即常规 11 行时的 11 * slotHeight） */
export function getGridTotalHeight(geometry: ScheduleTimeGeometry): number {
  const totalHeight = geometry?.totalHeight
  return Number.isFinite(totalHeight) && totalHeight > 0 ? totalHeight : 0
}
