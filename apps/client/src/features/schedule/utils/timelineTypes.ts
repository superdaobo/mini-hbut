/**
 * #834 统一时间画布契约（Epic #833）。
 *
 * 定位：本文件只定义「渲染输入 + 几何输出」的类型契约，不含任何逻辑，
 * 也不代表持久化模型。持久化模型仍是课程记录（Course）与个人日程记录。
 *
 * 设计背景：
 * - 现有课表不是 24 小时线性日历，而是 11 个等高课节行（见 constants.ts::timeSchedule）；
 * - 个人日程是真实钟表时间，需要一层「真实时间 → 课表 Y 坐标」的近似映射；
 * - 该映射只产出坐标，不改变现有课表的 11 节等高视觉。
 *
 * 后续 Agent（lane 分配 / 视图渲染）必须依赖本文件的类型与 timeGeometry.ts
 * 的函数签名，不得自行改动命名。
 */

/** 统一渲染输入（不是持久化模型） */
export type ScheduleTimelineItem = {
  id: string
  kind: 'course' | 'event'
  /** 1..7（周一 = 1） */
  dayIndex: number
  /** 距 00:00 的分钟数 */
  startMinute: number
  endMinute: number
  title: string
  subtitle?: string
  color?: string
  source: 'official' | 'custom-course' | 'personal-event'
  /** 原始记录引用，便于详情弹窗/调试回溯 */
  raw: unknown
}

/**
 * 时间映射到可见区的位置状态：
 * - before：早于第一节开始（坐标被 clamp 到网格顶部）
 * - inside：落在第一节开始 ~ 最后一节结束之间
 * - after：晚于最后一节结束（坐标被 clamp 到网格底部）
 */
export type ScheduleEdgeState = 'before' | 'inside' | 'after'

/** 单个时间点映射结果 */
export type ScheduleTimePosition = {
  /** 像素（相对课程网格顶部），已被 clamp 到可见区 */
  y: number
  edge: ScheduleEdgeState
}

/** 时间区间映射结果 */
export type ScheduleGridRect = {
  top: number
  /** 保证 >= 0 */
  height: number
  startEdge: ScheduleEdgeState
  endEdge: ScheduleEdgeState
}

/** 课节时间槽（与 constants.ts::timeSchedule 元素结构一致） */
export type ScheduleTimeSlot = { p: number; start: string; end: string }

/**
 * 几何模型中的单行（1 个课节行 = 1 个等高网格行）。
 *
 * 行内切分（自上而下）：
 * ```
 * [ 课节段 periodBand ][ 课间段 gapBand ]
 *   ↑ rowTop             ↑ rowTop + periodBand
 * ```
 * 不变量：第 i 节开始时间精确落在第 i 行顶部 rowTop = (i-1) * rowHeight，
 * 从而与 `grid-row: period / span djs` 的课程卡视觉对齐。
 */
export type ScheduleTimeGeometryRow = {
  /** 节次序号（1-based，取自 ScheduleTimeSlot.p） */
  period: number
  /** 行顶部 Y（= 之前所有行高之和） */
  rowTop: number
  /** 行高（= 构建时传入的 slotHeight） */
  rowHeight: number
  /** 本节开始时间（分钟） */
  startMinute: number
  /** 本节结束时间（分钟） */
  endMinute: number
  /** 本节时长 p_i（分钟） */
  durationMinutes: number
  /** 本节结束到下一节开始的原始课间 g_i（分钟）；最后一节为 0 */
  rawGapMinutes: number
  /** 参与压缩的课间 effGap_i = min(g_i, maxGapMinutes) */
  effGapMinutes: number
  /** 课节段像素高度 */
  periodBand: number
  /** 课间段像素高度（= rowHeight - periodBand，恒 >= 0） */
  gapBand: number
}

/**
 * 时间几何模型。由 buildScheduleTimeGeometry 产出，
 * 可被 timeToGridY / intervalToGridRect / getGridTotalHeight 消费。
 */
export type ScheduleTimeGeometry = {
  /** 每节课行高（px） */
  slotHeight: number
  /** 有效行数（正常为 11；时间表非法时为 0） */
  rowCount: number
  /** 网格总高度（= rowCount * slotHeight，保证 >= 0） */
  totalHeight: number
  /** 实际生效的课间压缩上限（分钟） */
  maxGapMinutes: number
  rows: ScheduleTimeGeometryRow[]
  /** 第一节开始时间（分钟） */
  firstMinute: number
  /** 最后一节结束时间（分钟） */
  lastMinute: number
  /** 时间表是否可用；false 时所有坐标退化为 0，绝不外泄 NaN */
  valid: boolean
}
