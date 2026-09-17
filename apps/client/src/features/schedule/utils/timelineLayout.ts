/**
 * #837 日程/课程 lane 布局（纯函数，无 DOM / Vue / CSS 依赖）。
 *
 * 职责：把「同一天的 TimelineItem（课程 + 日程）」在**一列宽度内**排布成互不遮挡的
 * 矩形块，输出的是**百分比**（占列宽 / 占网格总高），而不是像素——因此调用方无需
 * 读取任何 CSS 变量或测量 DOM：
 *
 * - 推荐调用方以 `slotHeight = 100 / MAX_PERIOD`（即 100/11）构建几何（timeGeometry），
 *   此时 `timeToGridY` 返回的 y 本身就是「占网格总高的百分比」；
 * - 本模块再统一除以 `geometry.totalHeight` 归一化，因此传入任意 slotHeight 也成立。
 *
 * 布局规则（与 issue #837 契约一一对应）：
 * 1. **确定性**：排序键 = startMinute → endMinute → kind（course 优先）→ id，
 *    全部使用稳定比较，同一输入任意顺序调用结果完全一致；
 * 2. **无重叠时占满整列**：`leftPercent = 0 / widthPercent = 100`；
 * 3. **课程 + 日程重叠**：课程占「主 lane 区」（更宽），日程侧挂在右侧；
 * 4. **日程 + 日程重叠**：并排平分；
 * 5. **超可读阈值**：同簇可见 lane 数不超过 `maxLanes`，且每个可见 lane 宽度不低于
 *    `MIN_LANE_WIDTH_PERCENT`；被挤出的条目进入 `overflowGroups`（渲染 `+N` 入口），
 *    绝不压成不可读细条。**课程 lane 优先保留**（课表以课程为主内容，隐藏课程会让
 *    用户丢失核心信息；日程 lane 先被聚合），这是对「保留前 maxLanes 个」的收窄实现；
 * 6. **重叠判定复用 `intervalsOverlap`**（#834 唯一真源），本模块不自建第二套算法；
 * 7. **超短事件不抬高高度**：`heightPercent` 严格由真实时间决定，视觉最小高度交给
 *    CSS `min-height`，否则会污染重叠判定；
 * 8. **可见区外不参与 lane 计算**：早于第一节 / 晚于最后一节的条目由 edge indicator
 *    单独承载（见 `splitOutOfRangeEvents`），避免被 clamp 后产生假重叠。
 *
 * 安全性：任何非法输入都不抛异常；几何不可用时返回空结果。
 */
import { getGridTotalHeight, intervalToGridRect, intervalsOverlap, timeToGridY } from './timeGeometry'
import type { ScheduleTimeGeometry, ScheduleTimelineItem } from './timelineTypes'

/** 默认可读并排上限（超过即聚合为 +N） */
export const DEFAULT_MAX_LANES = 3

/** 可见 lane 宽度下限（%）：低于此值不可点击、不可读，必须聚合而不是继续压窄 */
export const MIN_LANE_WIDTH_PERCENT = 20

/** 卡片降级为精简态（只显示色条 + 开始时间）的宽度阈值（%） */
export const COMPACT_WIDTH_PERCENT = 30

/**
 * 课程 lane 相对日程 lane 的宽度权重（1.6 → 课程 lane 宽度 = 1.6 × 日程 lane 宽度）。
 * 由公式 `courseRegion = 100 * w * c / (e + w * c)` 反解，保证「课程视觉权重大于单个日程」。
 */
const COURSE_LANE_WEIGHT = 1.6

/** 课程区最小宽度（%）：课程与日程共存时，课程区不得窄于该值 */
const MIN_COURSE_REGION_PERCENT = 50

/** 一个可见卡片（课程或日程）在列内的百分比矩形 */
export type ScheduleLayoutSlot = {
  item: ScheduleTimelineItem
  /** 占所在列宽度的百分比，0..100 */
  leftPercent: number
  widthPercent: number
  /** 占网格总高度的百分比，0..100 */
  topPercent: number
  heightPercent: number
  /** 宽度低于可读阈值（COMPACT_WIDTH_PERCENT）时为 true，卡片应降级为精简态 */
  collapsed: boolean
  /** 同簇被聚合隐藏的条目数（用于 `+N` 展示），未聚合为 0 */
  hiddenCount: number
}

export type ScheduleLayoutResult = {
  slots: ScheduleLayoutSlot[]
  /** 被聚合的组：用于渲染 `+N` 入口 */
  overflowGroups: Array<{
    dayIndex: number
    topPercent: number
    hiddenCount: number
    items: ScheduleTimelineItem[]
  }>
}

/** 参与布局的中间态：条目 + 已归一化的百分比矩形 */
type LayoutEntry = {
  item: ScheduleTimelineItem
  topPercent: number
  heightPercent: number
}

/** 重叠簇：由 `intervalsOverlap` 判定的连通区间集合 */
type LayoutCluster = {
  entries: LayoutEntry[]
  startMinute: number
  endMinute: number
}

/** 数值钳制到 [min, max]；入参非有限数时返回 min */
const clampNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * 确定性排序：startMinute → endMinute → kind（course 优先）→ id（码位比较，不依赖 locale）。
 * 这是「同一输入重复调用结果一致 + 打乱输入顺序结果一致」的唯一依据。
 */
const compareEntries = (a: ScheduleTimelineItem, b: ScheduleTimelineItem): number => {
  if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute
  if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute
  if (a.kind !== b.kind) return a.kind === 'course' ? -1 : 1
  const idA = String(a.id ?? '')
  const idB = String(b.id ?? '')
  if (idA < idB) return -1
  if (idA > idB) return 1
  return 0
}

/**
 * 判断条目是否落在可见区之外。
 * 复用 `timeToGridY` 的 edge 判定（几何真源），非有限时间 / 空几何统一按 `before` 处理。
 */
const isBeforeVisibleRange = (item: ScheduleTimelineItem, geometry: ScheduleTimeGeometry): boolean =>
  timeToGridY(item.startMinute, geometry).edge === 'before'

const isAfterVisibleRange = (item: ScheduleTimelineItem, geometry: ScheduleTimeGeometry): boolean =>
  timeToGridY(item.endMinute, geometry).edge === 'after'

/**
 * 一天内需要 edge indicator 承载的日程（早于第一节 / 晚于最后一节）。
 *
 * 同时早于第一节且晚于最后一节（跨越整个可见区）的条目归入 `before`，便于在列顶部
 * 用一条 indicator 表达；`inRange` 为可进入 lane 计算的条目。
 */
export function splitOutOfRangeEvents(
  items: ScheduleTimelineItem[],
  geometry: ScheduleTimeGeometry
): {
  before: ScheduleTimelineItem[]
  after: ScheduleTimelineItem[]
  inRange: ScheduleTimelineItem[]
} {
  const before: ScheduleTimelineItem[] = []
  const after: ScheduleTimelineItem[] = []
  const inRange: ScheduleTimelineItem[] = []
  const list = Array.isArray(items) ? items : []

  for (const item of list) {
    if (!item) continue
    if (isBeforeVisibleRange(item, geometry)) {
      before.push(item)
    } else if (isAfterVisibleRange(item, geometry)) {
      after.push(item)
    } else {
      inRange.push(item)
    }
  }

  return { before, after, inRange }
}

/**
 * 贪心 lane 分配（区间图着色）：按输入顺序把条目放进第一个「末位条目与它不重叠」的 lane。
 * 输入已按 startMinute 升序，因此只需与每条 lane 的最后一个条目比较即可判定。
 * 重叠判定复用 `intervalsOverlap`。
 */
const assignLanes = (entries: LayoutEntry[]): LayoutEntry[][] => {
  const lanes: LayoutEntry[][] = []

  for (const entry of entries) {
    let placed = false
    for (const lane of lanes) {
      const last = lane[lane.length - 1]
      if (
        !intervalsOverlap(
          last.item.startMinute,
          last.item.endMinute,
          entry.item.startMinute,
          entry.item.endMinute
        )
      ) {
        lane.push(entry)
        placed = true
        break
      }
    }
    if (!placed) lanes.push([entry])
  }

  return lanes
}

/**
 * 课程区宽度（%）。
 * - 无课程 → 0；无日程 → 100（课程独占整列）；
 * - 共存 → `100 * w * c / (e + w * c)`，使「课程 lane 宽度 = w × 日程 lane 宽度」，
 *   并夹到 [MIN_COURSE_REGION_PERCENT, 100] 保证课程区不会被日程区反超。
 */
const courseRegionPercent = (courseLanes: number, eventLanes: number): number => {
  if (courseLanes <= 0) return 0
  if (eventLanes <= 0) return 100
  const weighted = COURSE_LANE_WEIGHT * courseLanes
  const raw = (100 * weighted) / (eventLanes + weighted)
  return clampNumber(raw, MIN_COURSE_REGION_PERCENT, 100)
}

/**
 * 计算一天的 lane 布局。
 *
 * @param items 该天的 TimelineItem（课程 + 日程）；可见区外的条目会被本函数过滤
 * @param geometry 时间几何（由 buildScheduleTimeGeometry 构建）
 * @param options.maxLanes 可读的并排上限（默认 3）；非法值回退默认值，且至少为 1
 */
export function layoutTimelineItems(
  items: ScheduleTimelineItem[],
  geometry: ScheduleTimeGeometry,
  options?: { maxLanes?: number }
): ScheduleLayoutResult {
  const result: ScheduleLayoutResult = { slots: [], overflowGroups: [] }

  const list = Array.isArray(items) ? items.filter((item): item is ScheduleTimelineItem => !!item) : []
  if (list.length === 0) return result

  const totalHeight = getGridTotalHeight(geometry)
  if (!geometry?.valid || totalHeight <= 0) return result

  const rawMaxLanes = options?.maxLanes
  const laneLimit =
    typeof rawMaxLanes === 'number' && Number.isFinite(rawMaxLanes) && rawMaxLanes >= 1
      ? Math.trunc(rawMaxLanes)
      : DEFAULT_MAX_LANES

  // 1) 可见区外条目（早于第一节 / 晚于最后一节）不进入 lane 计算：
  //    它们被 clamp 到 0 / totalHeight 后会产生「假重叠」，改由 edge indicator 承载。
  const entries: LayoutEntry[] = []
  for (const item of list) {
    if (isBeforeVisibleRange(item, geometry) || isAfterVisibleRange(item, geometry)) continue
    const rect = intervalToGridRect(item.startMinute, item.endMinute, geometry)
    if (!rect) continue
    entries.push({
      item,
      topPercent: (rect.top / totalHeight) * 100,
      heightPercent: (rect.height / totalHeight) * 100
    })
  }
  if (entries.length === 0) return result

  // 2) 确定性排序后切分重叠簇（连通区间）
  entries.sort((a, b) => compareEntries(a.item, b.item))

  const clusters: LayoutCluster[] = []
  let current: LayoutCluster | null = null
  for (const entry of entries) {
    if (
      current &&
      !intervalsOverlap(
        entry.item.startMinute,
        entry.item.endMinute,
        current.startMinute,
        current.endMinute
      )
    ) {
      clusters.push(current)
      current = null
    }
    if (!current) {
      current = {
        entries: [],
        startMinute: entry.item.startMinute,
        endMinute: entry.item.endMinute
      }
    }
    current.entries.push(entry)
    current.endMinute = Math.max(current.endMinute, entry.item.endMinute)
  }
  if (current) clusters.push(current)

  // 3) 逐簇排布
  for (const cluster of clusters) {
    const courseLanes = assignLanes(cluster.entries.filter((entry) => entry.item.kind === 'course'))
    const eventLanes = assignLanes(cluster.entries.filter((entry) => entry.item.kind === 'event'))

    // 可见 lane 数：课程 lane 优先保留，日程 lane 先被聚合
    let visibleCourse = Math.min(courseLanes.length, laneLimit)
    let visibleEvent = Math.min(eventLanes.length, laneLimit - visibleCourse)

    // 可读下限收敛：任一可见 lane 窄于 MIN_LANE_WIDTH_PERCENT 时，
    // 先减日程 lane、再减课程 lane，直到全部达标（最坏收敛到 0，循环必然终止）
    while (visibleCourse + visibleEvent > 0) {
      const region = courseRegionPercent(visibleCourse, visibleEvent)
      const widths: number[] = []
      if (visibleCourse > 0) widths.push(region / visibleCourse)
      if (visibleEvent > 0) widths.push((100 - region) / visibleEvent)
      if (Math.min(...widths) >= MIN_LANE_WIDTH_PERCENT) break
      if (visibleEvent > 0) visibleEvent -= 1
      else visibleCourse -= 1
    }

    const region = courseRegionPercent(visibleCourse, visibleEvent)
    const courseWidth = visibleCourse > 0 ? region / visibleCourse : 0
    const eventWidth = visibleEvent > 0 ? (100 - region) / visibleEvent : 0

    const courseLaneIndex = new Map<LayoutEntry, number>()
    courseLanes.forEach((lane, index) => lane.forEach((entry) => courseLaneIndex.set(entry, index)))
    const eventLaneIndex = new Map<LayoutEntry, number>()
    eventLanes.forEach((lane, index) => lane.forEach((entry) => eventLaneIndex.set(entry, index)))

    // 课程 lane 靠左、日程 lane 紧随其后；同簇所有可见卡片共享 hiddenCount（用于 `+N`）
    const clusterSlotStart = result.slots.length
    const hiddenEntries: LayoutEntry[] = []
    for (const entry of cluster.entries) {
      const courseIndex = courseLaneIndex.get(entry)
      if (courseIndex !== undefined) {
        if (courseIndex >= visibleCourse) {
          hiddenEntries.push(entry)
          continue
        }
        result.slots.push({
          item: entry.item,
          leftPercent: courseIndex * courseWidth,
          widthPercent: courseWidth,
          topPercent: entry.topPercent,
          heightPercent: entry.heightPercent,
          collapsed: courseWidth < COMPACT_WIDTH_PERCENT,
          hiddenCount: 0
        })
        continue
      }

      const eventIndex = eventLaneIndex.get(entry)
      if (eventIndex === undefined || eventIndex >= visibleEvent) {
        hiddenEntries.push(entry)
        continue
      }
      result.slots.push({
        item: entry.item,
        leftPercent: region + eventIndex * eventWidth,
        widthPercent: eventWidth,
        topPercent: entry.topPercent,
        heightPercent: entry.heightPercent,
        collapsed: eventWidth < COMPACT_WIDTH_PERCENT,
        hiddenCount: 0
      })
    }

    if (hiddenEntries.length > 0) {
      // 聚合组内的可见卡片回填 hiddenCount，便于在卡片内渲染 `+N`
      for (let i = clusterSlotStart; i < result.slots.length; i += 1) {
        result.slots[i].hiddenCount = hiddenEntries.length
      }
      result.overflowGroups.push({
        dayIndex: hiddenEntries[0].item.dayIndex,
        topPercent: Math.min(...hiddenEntries.map((entry) => entry.topPercent)),
        hiddenCount: hiddenEntries.length,
        items: hiddenEntries.map((entry) => entry.item)
      })
    }
  }

  return result
}

/**
 * `timeToGridY` 的逆函数：网格 Y（px，与 geometry 同单位）→ 近似分钟。
 *
 * 用于空白点击创建日程时把点击位置反算成时间。返回的是**未取整**的浮点分钟
 * （调用方按需吸附到 5 分钟）；几何不可用或 y 非有限数 → null。
 * 结果严格落在 [firstMinute, lastMinute] 内。
 */
export function gridYToMinute(y: number, geometry: ScheduleTimeGeometry): number | null {
  if (!Number.isFinite(y)) return null
  const rows = geometry?.rows ?? []
  const totalHeight = getGridTotalHeight(geometry)
  if (!geometry?.valid || rows.length === 0 || totalHeight <= 0) return null

  const clampedY = clampNumber(y, 0, totalHeight)
  // 定位所在行：最后一个 rowTop <= y 的行（落在课间时归属前一行）
  let row = rows[0]
  for (let i = 0; i < rows.length; i += 1) {
    if (clampedY >= rows[i].rowTop) row = rows[i]
    else break
  }

  if (clampedY <= row.rowTop + row.periodBand) {
    const ratio = row.periodBand > 0 ? (clampedY - row.rowTop) / row.periodBand : 0
    return row.startMinute + clampNumber(ratio, 0, 1) * (row.endMinute - row.startMinute)
  }

  const gapRatio = row.gapBand > 0 ? (clampedY - row.rowTop - row.periodBand) / row.gapBand : 0
  return row.endMinute + clampNumber(gapRatio, 0, 1) * row.rawGapMinutes
}
