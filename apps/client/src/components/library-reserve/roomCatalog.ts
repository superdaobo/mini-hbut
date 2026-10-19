/**
 * 图书馆预约 · 房间模式与「日期 × 时段」网格领域层（#1081）
 *
 * 从 [`./catalog`]（静音仓 / 研讨室共享领域层）拆出的独立模块 —— 保持单一职责，
 * 同时避免 `catalog.ts` 膨胀成 god file（仓库有 1000 行上限的架构守卫）。
 *
 * 背景（用户反馈）：静音仓 / 研讨室「每天都显示没有时段」。根因是前端把**日期范围**
 * 当作 `start_time` / `end_time` 下发给接口，服务端按日期过滤后返回 0 条。
 * 正确契约（Rust 侧已冻结）：`library_reserve_time_list` **不传** `start_time/end_time`
 * 时进入「房间列表」模式，每个 `item` 是一个**房间**，自带按星期几的可用时段 `intervals`。
 *
 * 因此本模块把「房间」与「日期×时段网格」都做成纯函数：
 * 网格的可用性**完全来自服务端 intervals**，前端不再按日期过滤时段（消灭假空态）。
 */

import {
  FALLBACK_ADVANCE_DAYS,
  asRecord,
  buildDateOptions,
  extractHm,
  pad2,
  toInt
} from './catalog'
import type { ReserveResource } from './catalog'
// 服务端时钟复用座位域的解析器（`parseSeatClock` 拒绝纯时段值，只认真实墙上时间），
// 避免在房间域自造第二套时间解析。
import { parseSeatClock } from './seatCatalog'
import type { SeatClock } from './seatCatalog'

/** 房间按星期几的可用时段（来自 `reserveIntervalList`） */
export interface RoomInterval {
  /** 原始星期值（0 基 / 1 基未知，匹配时统一 `% 7` 归一，见 {@link weekdayOfWeek}） */
  week: number
  /** 该星期几是否开放（`available !== 0`） */
  available: boolean
  /** 起始 `HH:mm`（可能为空串） */
  start: string
  /** 结束 `HH:mm`（可能为空串） */
  end: string
}

/** 归一化后的房间（房间模式 `items[]` 元素） */
export interface ReserveRoomView {
  /** 列表 key（`itemId` 优先，缺失用序号） */
  key: string
  /** 预约项 ID（提交时需要） */
  itemId: string
  /** 房间名（服务端原值） */
  name: string
  /** 使用人数下限（服务端 `minUserNum`） */
  minUserNum: number | null
  /** 使用人数上限（服务端 `maxUserNum`） */
  maxUserNum: number | null
  /** 动态表单 ID（服务端 `formId`） */
  formId: string
  /** 可提前预约天数（服务端 `advanceDays`） */
  advanceDays: number | null
  /** 时间粒度（分钟，服务端 `timeUnit`） */
  timeUnit: number | null
  /** 可预约范围起始（Unix 毫秒，服务端 `rangeStartMs`；仅记录，不参与网格） */
  rangeStartMs: number | null
  /** 可预约范围结束（Unix 毫秒，服务端 `rangeEndMs`） */
  rangeEndMs: number | null
  intervals: RoomInterval[]
  /** 原始条目（透传字段兜底用） */
  raw: Record<string, unknown>
}

/** 星期值归一：兼容 0 基（0=周日）与 1 基（1=周一…7=周日）两种约定 */
const weekdayOfWeek = (week: unknown): number | null => {
  const n = toInt(week)
  if (n === null) return null
  return ((n % 7) + 7) % 7
}

/** `HH:mm` → 当日分钟数（非法 → null） */
const hmToMinutes = (hm: unknown): number | null => {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(extractHm(hm))
  if (!matched) return null
  const h = Number(matched[1])
  const m = Number(matched[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** 当日分钟数 → `HH:mm`（越界返回空串） */
const minutesToHm = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) return ''
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
}

/** 归一化单条 `intervals` 元素 */
const normalizeRoomInterval = (raw: unknown): RoomInterval | null => {
  const record = asRecord(raw)
  const week = weekdayOfWeek(record.week)
  if (week === null) return null
  // available 缺失时按「开放」处理（交由服务端最终裁决），显式 0 / false 才置灰
  const availableRaw = record.available
  const available = !(availableRaw === 0 || availableRaw === false || availableRaw === '0')
  return {
    week,
    available,
    start: extractHm(record.startTime),
    end: extractHm(record.endTime)
  }
}

/** 归一化房间条目（宽松取字段：兼容 camelCase / snake_case，缺失留空不编造） */
export const normalizeRoomItem = (raw: unknown, index: number): ReserveRoomView => {
  const record = asRecord(raw)
  const itemId = String(record.itemId ?? record.item_id ?? record.id ?? '').trim()
  const intervalsRaw = Array.isArray(record.intervals) ? record.intervals : []
  const intervals = intervalsRaw
    .map((entry) => normalizeRoomInterval(entry))
    .filter((entry): entry is RoomInterval => entry !== null)
  return {
    key: `room-${itemId || 'row'}-${index}`,
    itemId,
    name: String(record.name ?? record.itemName ?? record.item_name ?? '').trim(),
    minUserNum: toInt(record.minUserNum ?? record.min_user_num),
    maxUserNum: toInt(record.maxUserNum ?? record.max_user_num),
    formId: String(record.formId ?? record.form_id ?? '').trim(),
    advanceDays: toInt(record.advanceDays ?? record.advance_days),
    timeUnit: toInt(record.timeUnit ?? record.time_unit),
    rangeStartMs: toInt(record.rangeStartMs ?? record.range_start_ms),
    rangeEndMs: toInt(record.rangeEndMs ?? record.range_end_ms),
    intervals,
    raw: record
  }
}

/** 房间列表归一化（非数组回落空列表） */
export const normalizeRoomList = (list: unknown): ReserveRoomView[] => {
  if (!Array.isArray(list)) return []
  return list.map((item, index) => normalizeRoomItem(item, index))
}

/**
 * 可提前天数：按「房间自身 → 响应顶层 → 预约项详情 → 勘察回落值」依次取首个合法值。
 * 非法 / 负数一律跳过（不放大可约范围）。
 */
export const resolveAdvanceDays = (...candidates: unknown[]): number => {
  for (const candidate of candidates) {
    const n = toInt(candidate)
    if (n !== null && n >= 0) return n
  }
  return FALLBACK_ADVANCE_DAYS
}

/** 取某房间在指定星期几的时段配置（无该星期几配置 → null = 不可约） */
export const resolveRoomDayInterval = (
  room: ReserveRoomView | null,
  weekday: number
): RoomInterval | null => {
  if (!room) return null
  return room.intervals.find((interval) => interval.week === weekday) || null
}

// ── 真实时段 ID（`reserve/item/setting`，2026-10-19 实测） ──

/**
 * 服务端下发的真实可预约时段（`reserve/item/setting` → `commonIntervalMap` 扁平化）。
 *
 * 提交 `reserve/multiple/submit` 时，`reserveUsers[].intervalIds` **必须**用这里的 `id`；
 * 仅靠 `reserveIntervalList`（按星期几的开放窗口）无法得到 ID。
 */
export interface RoomIntervalSlot {
  /** 时段 ID（提交 `intervalIds` 用） */
  id: number
  /** 星期几（1=周一 … 7=周日） */
  week: number
  /** 起始 `HH:mm` */
  start: string
  /** 结束 `HH:mm` */
  end: string
  /** 是否开放（服务端 `available != 0`） */
  available: boolean
}

/** 归一化后端 `library_reserve_item_setting` 下发的 `intervals`（非数组 → 空） */
export const normalizeRoomIntervalSlots = (raw: unknown): RoomIntervalSlot[] => {
  if (!Array.isArray(raw)) return []
  const out: RoomIntervalSlot[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    const id = toInt(record.id)
    const week = toInt(record.week)
    if (id === null || week === null) continue
    out.push({
      id,
      week,
      start: extractHm(record.startTime ?? record.start),
      end: extractHm(record.endTime ?? record.end),
      available: !(record.available === 0 || record.available === false || record.available === '0')
    })
  }
  return out.sort((a, b) => a.week - b.week || a.start.localeCompare(b.start))
}

/** `YYYY-MM-DD` → 星期键（1=周一 … 7=周日；非法日期返回 0） */
export const weekdayKeyOfDate = (dateKey: string): number => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey ?? '').trim())
  if (!matched) return 0
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
  if (Number.isNaN(date.getTime())) return 0
  const day = date.getDay()
  return day === 0 ? 7 : day
}

/**
 * 把「日期 + 起止时间」映射为服务端真实时段 ID 列表。
 *
 * 匹配规则：同星期几、`available`、且服务端时段**完整落在**所选区间内（按开始时间排序）。
 * 匹配不到 → 空数组（调用方**不得**盲目提交，否则服务端会按无时段处理）。
 */
export const resolveRoomIntervalIds = (
  slots: RoomIntervalSlot[],
  weekday: number,
  start: string,
  end: string
): number[] => {
  const from = hmToMinutes(start)
  const to = hmToMinutes(end)
  if (from === null || to === null || to <= from) return []
  return slots
    .filter((slot) => slot.week === weekday && slot.available)
    .filter((slot) => {
      const slotFrom = hmToMinutes(slot.start)
      const slotTo = hmToMinutes(slot.end)
      return slotFrom !== null && slotTo !== null && slotFrom >= from && slotTo <= to
    })
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((slot) => slot.id)
}

/**
 * 「日期 × 时段」网格应展示的天数（**含今天**）。
 *
 * 官方页面逻辑（实测 2026-10-19）：`advanceDays` 为基准，若当前时刻**晚于**
 * `advanceTime`（放号时间）则多给一天。例如：
 * - 静音仓 `advanceTime=00:00` → 任何时刻都已过 → `advanceDays + 1` 天；
 * - 研讨室 `advanceTime=22:00` → 22:00 前为 `advanceDays` 天，之后 +1。
 *
 * `advanceTime` 缺失 / 非法时退回 `advanceDays`（不放大可约范围）。
 */
export const resolveRoomGridDays = (
  advanceDays: unknown,
  advanceTime: unknown,
  now: Date = new Date()
): number => {
  const base = Math.max(0, toInt(advanceDays) ?? FALLBACK_ADVANCE_DAYS)
  const matched = /^(\d{1,2}):(\d{2})$/.exec(String(advanceTime ?? '').trim())
  if (!matched) return base
  const config = Number(matched[1]) * 60 + Number(matched[2])
  if (!Number.isFinite(config)) return base
  const current = now.getHours() * 60 + now.getMinutes()
  return current > config ? base + 1 : base
}

/** 房间开放区间（所有星期几时段窗口的并集，`HH:mm`；无配置返回空串） */
export const roomOpenRange = (room: ReserveRoomView | null): { openFrom: string; openTo: string } => {
  if (!room) return { openFrom: '', openTo: '' }
  let from: number | null = null
  let to: number | null = null
  for (const interval of room.intervals) {
    if (!interval.available) continue
    const start = hmToMinutes(interval.start)
    const end = hmToMinutes(interval.end)
    if (start === null || end === null || end <= start) continue
    from = from === null ? start : Math.min(from, start)
    to = to === null ? end : Math.max(to, end)
  }
  return {
    openFrom: from === null ? '' : minutesToHm(from),
    openTo: to === null ? '' : minutesToHm(to)
  }
}

/** 网格列（一个 60 分钟量级的可约时段） */
export interface RoomGridColumn {
  key: string
  /** 起始 `HH:mm` */
  start: string
  /** 结束 `HH:mm` */
  end: string
  /** `08:00-09:00` */
  label: string
}

/** 网格单元格 */
export interface RoomGridCell extends RoomGridColumn {
  /** 该单元格所属日期 `YYYY-MM-DD`（自包含，选中态比较不必再带行上下文） */
  date: string
  /** 该日期该时段是否可约（服务端 intervals 判定 + 未过去） */
  available: boolean
  /** 该日期+时段是否已过去（服务端时间判定；服务端时间缺失时恒为 false） */
  past: boolean
}

/** 网格行（一天） */
export interface RoomGridRow {
  key: string
  /** `YYYY-MM-DD` */
  date: string
  /** 星期索引（0 = 周日…6 = 周六，与 `Date.getDay()` 一致） */
  weekday: number
  /** 相对今天的天数（0 = 今天，1 = 明天） */
  offset: number
  /** 整天不可约（该星期几无配置或 `available=0`） */
  disabled: boolean
  cells: RoomGridCell[]
}

/** 日期 × 时段网格 */
export interface RoomGrid {
  columns: RoomGridColumn[]
  rows: RoomGridRow[]
}

/**
 * 把一段开放区间按 `timeUnit` 切成等长时段。
 * 不足一个单位的尾巴（如 21:00–21:30 且粒度为 60）**不产出**格子 —— 系统按整单位预约。
 */
const splitIntervalByUnit = (
  start: string,
  end: string,
  unitMin: number
): Array<{ start: string; end: string }> => {
  const from = hmToMinutes(start)
  const to = hmToMinutes(end)
  if (from === null || to === null || to <= from) return []
  const unit = Number.isFinite(unitMin) && unitMin > 0 ? Math.floor(unitMin) : 60
  const out: Array<{ start: string; end: string }> = []
  for (let cursor = from; cursor + unit <= to; cursor += unit) {
    out.push({ start: minutesToHm(cursor), end: minutesToHm(cursor + unit) })
  }
  return out
}

/**
 * 服务端时间候选键（与 Rust 侧 `library_reserve_seat::SERVER_TIME_KEYS` 保持同一集合）。
 *
 * ⚠️ 房间接口（`reserve/item/list/time` / `reserve/item/info`）的契约**未列出**服务端时间字段，
 * 故这里按「越具体越靠前」的候选集合 best-effort 提取；取不到一律返回 `null`
 * （调用方**不做任何本地时间推断**，宁可不禁用也不猜）。
 */
const ROOM_SERVER_TIME_KEYS = [
  'serverNow',
  'serverTime',
  'currentServerTime',
  'currentTime',
  'nowTime',
  'sysTime',
  'systemTime',
  'timestamp',
  'serverTimestamp'
]

/**
 * 从房间接口响应里 best-effort 提取服务端时钟（顶层键 + 嵌套 `raw` 键）。
 * `parseSeatClock` 会拒绝 `08:00` 这类纯时段值，因此误取到时段字段也不会被当成当前时间。
 */
export const resolveRoomServerClock = (raw: unknown): SeatClock | null => {
  const record = asRecord(raw)
  const nested = asRecord(record.raw)
  for (const key of ROOM_SERVER_TIME_KEYS) {
    const clock = parseSeatClock(record[key]) ?? parseSeatClock(nested[key])
    if (clock) return clock
  }
  return null
}

/** 服务端日期 `YYYY-MM-DD` → 仅日粒度有效的 Date（构造用本地字段，不参与时区换算） */
const dateFromClock = (clock: SeatClock): Date => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clock.dateKey)
  if (!matched) return new Date()
  return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
}

/**
 * 判断某单元格（日期 + 时段）是否**已经过去**（应置灰不可点）。
 *
 * - `dateKey` 早于服务端日期 → 已过去；晚于 → 未过去；相等才按当日结束分钟比较；
 * - 当日：`end <= 服务端当前时刻` → 已过去；
 * - **服务端时钟缺失 / 日期缺失 → 一律 `false`**（不做本地时间推断）。
 */
export const isRoomCellPast = (dateKey: string, end: string, clock: SeatClock | null): boolean => {
  if (!clock || !dateKey) return false
  if (dateKey < clock.dateKey) return true
  if (dateKey > clock.dateKey) return false
  const endMinutes = hmToMinutes(end)
  return endMinutes !== null && endMinutes <= clock.minutes
}

/**
 * 构建「日期 × 时段」网格。
 *
 * - **行**：今天起共 `advanceDays + 1` 天（与既有日期条一致）；
 * - **列**：优先用 `slots`（`reserve/item/setting` 的**真实时段**，见 {@link RoomIntervalSlot}）——
 *   因为服务端的时段并不都是整点整小时（实测研讨室最后一档是 `20:00-21:30`），
 *   若前端按 `timeUnit` 自己切分，会产出与配置不一致的时段，提交必被拒绝
 *   （实测报错：`预约时间段与系统设置时间段不一致，请重新选择`）；
 *   `slots` 为空时回落到「按 `timeUnit` 切分 `intervals` 窗口」的旧行为（离线/降级）；
 * - **单元格可用性**：该行星期几开放且该时段可用（有 `slots` 时逐时段判定），且该日期+时段未过去；
 *   `available=0` 的星期几整行 `disabled`。
 *
 * `clock` 为服务端时钟（来自 {@link resolveRoomServerClock}）：
 * - 提供时：行以**服务端日期**为基准（今天 = 服务端今天），当日已过去的片置灰；
 * - 缺失时：行以本地 `now` 为基准，**不做任何时间置灰**（宁可不禁用也不猜）。
 *
 * 房间为空 / 无任何可用时段 → 返回空网格（调用方给出「未获取到时段配置」提示，
 * 而不是伪造一排可点格子）。
 */
export const buildRoomGrid = (
  room: ReserveRoomView | null,
  advanceDays: number,
  timeUnitMin: number | null,
  now: Date = new Date(),
  clock: SeatClock | null = null,
  slots: RoomIntervalSlot[] = []
): RoomGrid => {
  if (!room) return { columns: [], rows: [] }

  const unit = Number.isFinite(Number(timeUnitMin)) && Number(timeUnitMin) > 0
    ? Math.floor(Number(timeUnitMin))
    : 60

  const byStart = (a: RoomGridColumn, b: RoomGridColumn) => {
    const diff = (hmToMinutes(a.start) ?? 0) - (hmToMinutes(b.start) ?? 0)
    return diff !== 0 ? diff : a.end.localeCompare(b.end)
  }

  // 列：优先服务端真实时段（保证与提交校验一致）；否则回落到按粒度切分窗口
  let columns: RoomGridColumn[]
  if (slots.length) {
    const map = new Map<string, RoomGridColumn>()
    for (const slot of slots) {
      if (!slot.start || !slot.end) continue
      const key = `${slot.start}-${slot.end}`
      if (!map.has(key)) map.set(key, { key, start: slot.start, end: slot.end, label: key })
    }
    columns = [...map.values()].sort(byStart)
  } else {
    const map = new Map<string, RoomGridColumn>()
    for (const interval of room.intervals) {
      for (const slot of splitIntervalByUnit(interval.start, interval.end, unit)) {
        const key = `${slot.start}-${slot.end}`
        if (!map.has(key)) {
          map.set(key, { key, start: slot.start, end: slot.end, label: key })
        }
      }
    }
    columns = [...map.values()].sort(byStart)
  }
  if (!columns.length) return { columns: [], rows: [] }

  // 行基准日：有服务端时钟时以服务端「今天」为准（跨天/时区错位时不至于把本地今天当成今天）
  const base = clock ? dateFromClock(clock) : now
  const rows: RoomGridRow[] = buildDateOptions(advanceDays, base).map((option) => {
    const weekday = option.date.getDay()
    const interval = resolveRoomDayInterval(room, weekday)
    const startMinutes = interval ? hmToMinutes(interval.start) : null
    const endMinutes = interval ? hmToMinutes(interval.end) : null
    // slots 的 week 约定为 1=周一…7=周日（与 weekdayKeyOfDate 一致）
    const weekdayKey = weekday === 0 ? 7 : weekday
    const daySlots = slots.filter((slot) => slot.week === weekdayKey)
    const rowDisabled = !interval || !interval.available
    const cells: RoomGridCell[] = columns.map((column) => {
      const past = isRoomCellPast(option.value, column.end, clock)
      let open: boolean
      if (slots.length) {
        // 逐时段判定：必须存在同起止且可用的真实时段
        open = daySlots.some(
          (slot) => slot.start === column.start && slot.end === column.end && slot.available
        )
      } else {
        const cellStart = hmToMinutes(column.start)
        const cellEnd = hmToMinutes(column.end)
        open =
          startMinutes !== null &&
          endMinutes !== null &&
          cellStart !== null &&
          cellEnd !== null &&
          cellStart >= startMinutes &&
          cellEnd <= endMinutes
      }
      return { ...column, date: option.value, available: !rowDisabled && open && !past, past }
    })
    return {
      key: option.value,
      date: option.value,
      weekday,
      offset: option.offset,
      disabled: rowDisabled || cells.every((cell) => !cell.available),
      cells
    }
  })

  return { columns, rows }
}

/** 从房间名里提取房间序号（用于关联静态目录的地点 / 提示等展示属性） */
export const roomIndexFromName = (name: string): number | null => {
  const matched = String(name ?? '').match(/\d+/)
  if (!matched) return null
  const value = Number(matched[0])
  return Number.isFinite(value) && value > 0 ? value : null
}

/** 按房间序号关联静态目录条目（取不到 → null，由调用方省略该行展示） */
export const resolveCatalogResource = (
  catalog: ReserveResource[],
  room: ReserveRoomView | null
): ReserveResource | null => {
  if (!room) return null
  const index = roomIndexFromName(room.name)
  if (index === null) return null
  return catalog.find((item) => item.index === index) || null
}
