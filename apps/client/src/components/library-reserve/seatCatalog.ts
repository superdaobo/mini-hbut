/**
 * 图书馆预约 · 座位预约（seatengine）领域层（#1057）
 *
 * 只放「无副作用、可单测」的纯函数，供 `ReserveSeatPanel.vue` 复用；
 * 与静音仓 / 研讨室的 [`./catalog`]（#1056）平行，仅复用其中的通用时间工具。
 *
 * ## 契约来源
 *
 * Rust 命令 `library_reserve_seat_config`（#1054）返回：
 * `{ config, currentReservations, recentReservations, serverNow, serverNowSource, raw }`。
 * `config` 由 Rust 侧按 `seatengine/index` 实测表建模（放号 / 时长 / 限额 / 违约 /
 * 规则原文 / `onlySupportsApiSignIn` / `commonTimeConfig`），其余字段原样留在 `config.raw`。
 *
 * ## ⚠️ 时间必须用服务端时间
 *
 * 座位预约的开放判断在超星页面里用的是**服务端注入的时间**（防作弊设计），本地时间不可信。
 * 因此本模块把 `serverNow` 解析为「服务端墙上时间」（[`SeatClock`]）：
 * 优先取字符串里**自带的日期时间字面量**（即服务端本地时间，与运行设备时区无关）；
 * 只有在拿到 Unix 时间戳时才按固定 UTC+8 换算（超星服务端时区，勘察样本为 `+08:00`）。
 * 解析失败一律返回 `null` —— 调用方必须**放弃时间推断类文案**，绝不回落到本地时间。
 *
 * ## 契约不确定处（不猜测）
 *
 * `curReserves` / `nearReserves` 的元素字段名**未实测**（Rust 侧为 best-effort 提取），
 * 本模块同样只做宽松归一化；取不到的字段留空，由组件给 i18n 兜底文案。
 */

import { extractHm, sortKeyOf } from './catalog'

/** 宽松取对象（非对象一律回落空对象，避免上游形态变化直接抛错） */
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** 宽松取整（兼容数字字符串） */
const toInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** 宽松取字符串（null / undefined → 空串） */
const toStr = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim())

/** 宽松取布尔（兼容 "true" / 1 这类形态） */
const toBool = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

// ── 服务端时间 ──

/**
 * 超星服务端时区（分钟）。勘察样本 `serverNow` 带 `+08:00` 偏移；
 * 仅在拿到 Unix 时间戳（无偏移信息）时用于换算，属于显式默认假设。
 */
const SERVER_TZ_OFFSET_MINUTES = 8 * 60

/** 服务端墙上时间（**与运行设备时区无关**） */
export interface SeatClock {
  /** 服务端日期 `YYYY-MM-DD` */
  dateKey: string
  /** 服务端 `HH:mm` */
  clock: string
  /** 服务端当日分钟数（0–1439） */
  minutes: number
  /** 服务端星期索引：0 = 周日 … 6 = 周六（与 `Date.getUTCDay()` 同义） */
  weekday: number
}

/** 日期 + 时间字面量（ISO / `2026/10/15 23:31` 等形态） */
const DATE_TIME_PATTERN = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{1,2})/

/** 用「服务端本地」年月日时分构造时钟；越界返回 null（不猜、不纠正） */
const buildClock = (y: number, mo: number, d: number, h: number, mi: number): SeatClock | null => {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  // 用 UTC 构造仅为了取星期：结果不依赖运行设备时区
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  if (!Number.isFinite(weekday)) return null
  return {
    dateKey: `${y}-${pad2(mo)}-${pad2(d)}`,
    clock: `${pad2(h)}:${pad2(mi)}`,
    minutes: h * 60 + mi,
    weekday
  }
}

/**
 * 解析 Rust 侧透传的 `serverNow`。
 *
 * 支持：带日期时间的字符串（取其字面量 = 服务端墙上时间）、10 位秒 / 13 位毫秒时间戳。
 * **刻意拒绝** `08:00` 这类纯时段值（无日期且非 10 位以上纯数字）——
 * 它是座位配置里的常见字段，不能当「当前时间」用。
 */
export const parseSeatClock = (raw: unknown): SeatClock | null => {
  const text = toStr(raw)
  if (!text || !/\d/.test(text)) return null

  const matched = DATE_TIME_PATTERN.exec(text)
  if (matched) {
    return buildClock(
      Number(matched[1]),
      Number(matched[2]),
      Number(matched[3]),
      Number(matched[4]),
      Number(matched[5])
    )
  }

  if (/^\d{10,13}$/.test(text)) {
    const value = Number(text)
    const ms = text.length >= 13 ? value : value * 1000
    const shifted = new Date(ms + SERVER_TZ_OFFSET_MINUTES * 60_000)
    if (Number.isNaN(shifted.getTime())) return null
    return buildClock(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
      shifted.getUTCHours(),
      shifted.getUTCMinutes()
    )
  }

  return null
}

// ── 开放 / 放号状态（全部基于服务端时钟） ──

/** 开放时段（HH:mm；单侧可能缺失） */
export interface SeatDayRange {
  start: string
  end: string
}

/** 当日开放状态 */
export type SeatOpenState = 'open' | 'before' | 'after' | 'unknown'

/** `HH:mm` → 当日分钟数（非法 → null） */
const toMinutes = (hm: string): number | null => {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(extractHm(hm))
  if (!matched) return null
  const h = Number(matched[1])
  const m = Number(matched[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * 判断服务端当前时刻是否落在当日开放时段内。
 * 单侧缺失时按「该侧无限制」处理（缺起始 → 视为 00:00；缺结束 → 视为当日末）；
 * 两侧都缺 → `unknown`（不推断）。
 */
export const resolveOpenState = (clock: SeatClock | null, range: SeatDayRange | null): SeatOpenState => {
  if (!clock || !range) return 'unknown'
  const start = toMinutes(range.start)
  const end = toMinutes(range.end)
  if (start === null && end === null) return 'unknown'
  if (start !== null && clock.minutes < start) return 'before'
  if (end !== null && clock.minutes >= end) return 'after'
  return 'open'
}

/** 放号状态：`released` 今日号源已放出 / `pending` 尚未到放号时间 */
export type SeatReleaseState = 'released' | 'pending' | 'unknown'

/**
 * 判断今日号源是否已放出（`reserveBeforeTime` 实测为 `08:00`，即每天 08:00 放次日号）。
 * 放号时间缺失 / 非法 → `unknown`（不推断）。
 */
export const resolveReleaseState = (
  clock: SeatClock | null,
  releaseTime: string
): SeatReleaseState => {
  if (!clock) return 'unknown'
  const at = toMinutes(releaseTime)
  if (at === null) return 'unknown'
  return clock.minutes >= at ? 'released' : 'pending'
}

/** 星期前缀（索引 = `SeatClock.weekday`），与 Rust 侧 `commonTimeConfig` 的键名前缀一致 */
const DAY_PREFIXES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** 展示顺序：周一…周日（与 Rust 归一化 `days` 的顺序一致） */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** 每日开放时段展示行 */
export interface SeatOpenHourRow {
  /** 列表 key */
  key: string
  /** 星期索引（0 = 周日…6 = 周六）；为 `null` 时用 `label`（服务端归一化给出的星期名） */
  weekday: number | null
  /** 星期名原文（仅在 `weekday === null` 时使用） */
  label: string
  /** 起始 `HH:mm`（可能为空串） */
  start: string
  /** 结束 `HH:mm`（可能为空串） */
  end: string
}

/**
 * 生成「每日开放时段」展示行。
 *
 * 优先用 `commonTimeConfig.raw` 的英文星期前缀键（`monStartTime`…）——这样星期名可由前端本地化；
 * 拿不到前缀键时回落 Rust 归一化后的 `days`（星期名是服务端数据，原样展示）。
 */
export const resolveOpenHourRows = (config: SeatConfigView | null): SeatOpenHourRow[] => {
  const raw = config?.commonTimeConfig?.raw
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const rows = WEEKDAY_ORDER.map((weekday) => {
      const prefix = DAY_PREFIXES[weekday]
      return {
        key: prefix,
        weekday,
        label: '',
        start: extractHm(record[`${prefix}StartTime`]),
        end: extractHm(record[`${prefix}EndTime`])
      }
    }).filter((row) => row.start || row.end)
    if (rows.length) return rows
  }

  return (config?.commonTimeConfig?.days ?? []).map((day, index) => ({
    key: `day-${index}`,
    weekday: null,
    label: day.day,
    start: day.start,
    end: day.end
  }))
}

/**
 * 取**服务端当日**的开放时段。
 *
 * 优先级：
 * 1. `commonTimeConfig.raw` 里当日英文星期前缀键（`monStartTime` / `monEndTime`…）——最精确；
 * 2. 归一化后只有一条时段（如「每日 08:00–22:00」）→ 直接采用；
 * 3. 多条时段但起止完全一致 → 该值可安全代表今日；
 * 4. 各日时段不同且拿不到星期前缀键 → `null`（**不猜测**，调用方不展示推断文案）。
 */
export const resolveTodayOpenRange = (
  config: SeatConfigView | null,
  clock: SeatClock | null
): SeatDayRange | null => {
  if (!clock) return null
  const timeConfig = config?.commonTimeConfig ?? null

  const raw = timeConfig?.raw
  if (raw && typeof raw === 'object') {
    const prefix = DAY_PREFIXES[clock.weekday]
    const start = extractHm((raw as Record<string, unknown>)[`${prefix}StartTime`])
    const end = extractHm((raw as Record<string, unknown>)[`${prefix}EndTime`])
    if (start || end) return { start, end }
  }

  const days = timeConfig?.days ?? []
  if (!days.length) return null
  if (days.length === 1) return { start: days[0].start, end: days[0].end }

  const first = days[0]
  const uniform = days.every((day) => day.start === first.start && day.end === first.end)
  return uniform ? { start: first.start, end: first.end } : null
}

// ── 配置归一化 ──

/** 每日开放时段（Rust `commonTimeConfig.days` 元素） */
export interface SeatOpenDay {
  /** 星期名（服务端 / Rust 归一化给出的中文名，属数据而非 UI 文案） */
  day: string
  /** 起始 `HH:mm`（可能为空串） */
  start: string
  /** 结束 `HH:mm`（可能为空串） */
  end: string
}

/** 每日开放时段配置 */
export interface SeatTimeConfig {
  days: SeatOpenDay[]
  raw: unknown
}

/** 座位预约核心配置（归一化；缺失项一律 null / 空串，不编造默认值） */
export interface SeatConfigView {
  seatId: number | null
  deptId: number | null
  name: string
  /** 可提前预约天数（实测 1） */
  reserveBeforeDay: number | null
  /** 放号时间 `HH:mm`（实测 `08:00`） */
  reserveBeforeTime: string
  /** 单次预约时长（实测 4，单位**小时**） */
  reserveDuration: number | null
  /** 同时可持有的预约数上限（实测 1） */
  reserveNumLimit: number | null
  /** 时间粒度（实测 60，单位分钟） */
  timeUnit: number | null
  /**
   * 是否允许预约**当前时段**（`seatConfig.allowReserveNow`，本馆实测 `0` = 不允许；
   * 官方注释：不允许预约当前时段）。契约未建模该字段，故从 `config.raw` 兜底提取；
   * 取不到 → `null`（调用方**不启用**该规则，不猜测）。
   */
  allowReserveNow: number | null
  /** 违约次数阈值（实测 3） */
  violateTimes: number | null
  /** 违约统计窗口（实测 7，单位天） */
  violationLimitDay: number | null
  /** 违约停用时长（实测 3，单位天） */
  violationLimitDuration: number | null
  /** 规则名称（实测「试运规则说明」） */
  noticeName: string
  /** 规则原文（HTML） */
  noticeContent: string
  /** 签到是否只能走接口（实测 true：页面无签到按钮） */
  onlySupportsApiSignIn: boolean | null
  commonTimeConfig: SeatTimeConfig | null
}

/** 归一化 Rust 返回的 `config` */
export const normalizeSeatConfig = (raw: unknown): SeatConfigView => {
  const record = asRecord(raw)

  const timeConfigRaw = record.commonTimeConfig
  let commonTimeConfig: SeatTimeConfig | null = null
  if (timeConfigRaw && typeof timeConfigRaw === 'object') {
    const timeRecord = asRecord(timeConfigRaw)
    const days = Array.isArray(timeRecord.days)
      ? timeRecord.days.map((entry) => {
          const day = asRecord(entry)
          return {
            day: toStr(day.day),
            start: extractHm(day.start),
            end: extractHm(day.end)
          }
        })
      : []
    commonTimeConfig = { days, raw: timeRecord.raw }
  }

  return {
    seatId: toInt(record.seatId),
    deptId: toInt(record.deptId),
    name: toStr(record.name),
    reserveBeforeDay: toInt(record.reserveBeforeDay),
    reserveBeforeTime: extractHm(record.reserveBeforeTime),
    reserveDuration: toInt(record.reserveDuration),
    reserveNumLimit: toInt(record.reserveNumLimit),
    timeUnit: toInt(record.timeUnit),
    // allowReserveNow 未在 Rust 侧建模，只存在于透传的原始 `seatConfig`（`config.raw`）中；
    // 顶层同名键作为兜底（兼容后端后续把它提升为归一化字段）。
    allowReserveNow: toInt(asRecord(record.raw).allowReserveNow ?? record.allowReserveNow),
    violateTimes: toInt(record.violateTimes),
    violationLimitDay: toInt(record.violationLimitDay),
    violationLimitDuration: toInt(record.violationLimitDuration),
    noticeName: toStr(record.noticeName),
    noticeContent: toStr(record.noticeContent),
    onlySupportsApiSignIn: toBool(record.onlySupportsApiSignIn),
    commonTimeConfig
  }
}

// ── 预约记录归一化 ──

/** 归一化后的座位预约记录（字段名契约未实测，取不到的留空） */
export interface SeatReservationRow {
  key: string
  id: string
  seatNo: string
  roomName: string
  date: string
  start: string
  end: string
  statusName: string
}

/** 单条记录 → 渲染模型（`index` 仅用于兜底 key，避免 id 缺失时重复） */
export const normalizeSeatReservation = (raw: unknown, index: number): SeatReservationRow => {
  const record = asRecord(raw)
  const id = toStr(record.id)
  return {
    key: `seat-${id || 'row'}-${index}`,
    id,
    seatNo: toStr(record.seatNo),
    roomName: toStr(record.roomName),
    date: toStr(record.date),
    start: extractHm(record.startTime),
    end: extractHm(record.endTime),
    statusName: toStr(record.statusName)
  }
}

/** 记录列表归一化 + 按时间排序（缺失日期的排末尾，复用 #1056 的排序键） */
export const normalizeSeatReservations = (list: unknown): SeatReservationRow[] => {
  if (!Array.isArray(list)) return []
  return list
    .map((item, index) => normalizeSeatReservation(item, index))
    .sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b)))
}

/** 时段展示文案（`08:00-12:00` / 单侧 / 空串） */
export const seatReservationTime = (row: SeatReservationRow): string => {
  if (row.start && row.end) return `${row.start}-${row.end}`
  return row.start || row.end || ''
}

// ── 余量查询 / 快速预约（#1057 二轮：seatengine levels / getstartendtime / getseatinfo） ──

/** `HH:mm` → 当日分钟数（非法 → null） */
const hmToMinutes = (hm: string): number | null => {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? '').trim())
  if (!matched) return null
  const h = Number(matched[1])
  const m = Number(matched[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * Unix 毫秒 → 服务端（UTC+8）`HH:mm`。
 *
 * `getseatinfo` 返回的 `startTimeMs` / `endTimeMs` 是绝对时刻；超星服务端时区为 UTC+8，
 * 这里按同一偏移换算（与 {@link parseSeatClock} 的时间戳分支一致），保证展示时段与
 * 请求参数（`HH:mm`，服务端语义）对齐。非法值返回空串（不猜测）。
 */
export const seatMsToServerHm = (ms: unknown): string => {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const shifted = new Date(n + SERVER_TZ_OFFSET_MINUTES * 60_000)
  if (Number.isNaN(shifted.getTime())) return ''
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`
}

/**
 * `getstartendtime` 的 `startTime` / `endTime` → `HH:mm`。
 *
 * ⚠️ 这两个值是 **Unix 毫秒**，不是「当日毫秒偏移」：官方页面用 `moment(startTime)` 解析，
 * 所以 `0` → 本地(+08) `08:00`、`50400000` → `22:00`。
 * 实测佐证：官方快速预约页（`seatengine/live/select`）渲染出的时间片正是
 * `08:00-09:00 … 21:00-22:00`（14 片）。早期按「当日偏移」解析会得到 00:00–14:00 的错误时段。
 * 非法 / 负值返回空串。
 */
export const offsetMsToHm = (epochMs: unknown): string => {
  const n = Number(epochMs)
  if (!Number.isFinite(n) || n < 0) return ''
  const shifted = new Date(n + SERVER_TZ_OFFSET_MINUTES * 60_000)
  if (Number.isNaN(shifted.getTime())) return ''
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`
}

/** 可选时间切片（一个可选时刻点） */
export interface SeatTimeSlice {
  /** 当日毫秒偏移（原样回传，便于与后端语义对齐） */
  offsetMs: number
  /** `HH:mm` 展示值 */
  label: string
}

/**
 * 按 `timeUnit`（分钟）把 `[startOffsetMs, endOffsetMs]` 切成可选时刻点。
 * 契约来自 `seatengine/getstartendtime` + `seatConfig.timeUnit`（实测 60 分钟）。
 * `timeUnit` 非法时回落 60；区间非法时退化为单点，绝不返回空列表。
 */
export const buildSeatTimeSlices = (
  startOffsetMs: unknown,
  endOffsetMs: unknown,
  timeUnitMin: unknown
): SeatTimeSlice[] => {
  const unitRaw = Number(timeUnitMin)
  const unit = Number.isFinite(unitRaw) && unitRaw > 0 ? Math.floor(unitRaw) : 60
  const step = unit * 60_000
  const startRaw = Number(startOffsetMs)
  const start = Number.isFinite(startRaw) && startRaw >= 0 ? Math.floor(startRaw) : 0
  const endRaw = Number(endOffsetMs)
  const end = Number.isFinite(endRaw) && endRaw > start ? Math.floor(endRaw) : start

  const slices: SeatTimeSlice[] = []
  for (let offset = start; offset <= end; offset += step) {
    slices.push({ offsetMs: offset, label: offsetMsToHm(offset) })
  }
  if (!slices.length) slices.push({ offsetMs: start, label: offsetMsToHm(start) })
  return slices
}

/**
 * 归一化 `library_reserve_seat_levels` 的返回（`{ levels: [string], raw }`）。
 * 去空白、去空项、去重；非数组回落空列表（调用方据此隐藏该级筛选行）。
 */
export const normalizeSeatLevels = (raw: unknown): string[] => {
  const record = asRecord(raw)
  const list = Array.isArray(record.levels) ? record.levels : []
  const out: string[] = []
  for (const entry of list) {
    const text = toStr(entry)
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

/** 归一化后的空座位匹配结果（`getseatinfo` 的 `matchReserve`） */
export interface SeatMatchView {
  roomId: string
  /** 座位号（服务端为带前导零的字符串，如 `016`，原样保留） */
  seatNum: string
  firstLevelName: string
  secondLevelName: string
  thirdLevelName: string
  startTimeMs: number | null
  endTimeMs: number | null
  /** 时长（服务端字符串，如 `"2.0"`） */
  duration: string
}

/**
 * 归一化 `library_reserve_seat_match` 的返回（`{ match: {...}, raw }`）。
 * `match` 缺失 / 非对象时返回 `null`（无可用座位，调用方给出空态提示）。
 */
export const normalizeSeatMatch = (raw: unknown): SeatMatchView | null => {
  const record = asRecord(raw)
  const match = record.match
  if (!match || typeof match !== 'object' || Array.isArray(match)) return null
  const view = asRecord(match)
  return {
    roomId: toStr(view.roomId),
    seatNum: toStr(view.seatNum),
    firstLevelName: toStr(view.firstLevelName),
    secondLevelName: toStr(view.secondLevelName),
    thirdLevelName: toStr(view.thirdLevelName),
    startTimeMs: toInt(view.startTimeMs),
    endTimeMs: toInt(view.endTimeMs),
    duration: toStr(view.duration)
  }
}

/** 匹配结果的区域文案：一级 / 二级 / 三级（非空项按序用 `/` 连接） */
export const seatMatchAreaText = (match: SeatMatchView | null): string => {
  if (!match) return ''
  return [match.firstLevelName, match.secondLevelName, match.thirdLevelName]
    .filter((part) => part)
    .join(' / ')
}

/** 匹配结果的时段文案（服务端毫秒 → 服务端 `HH:mm`；单侧缺失用占位符） */
export const seatMatchTimeText = (match: SeatMatchView | null, placeholder = '--:--'): string => {
  if (!match) return ''
  const start = seatMsToServerHm(match.startTimeMs) || placeholder
  const end = seatMsToServerHm(match.endTimeMs) || placeholder
  return `${start}-${end}`
}

/**
 * Unix 毫秒 → 服务端（UTC+8）`YYYY-MM-DD`。
 *
 * 提交接口的 `day` 参数与 `startTime` 必须取自**同一时刻**（官方页用同一个
 * `matchReserve.startTime` 分别格式化 `HH:mm` 与 `YYYY-MM-DD`），故与
 * {@link seatMsToServerHm} 共用同一 UTC+8 偏移。非法值返回空串。
 */
export const seatMsToServerDate = (ms: unknown): string => {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const shifted = new Date(n + SERVER_TZ_OFFSET_MINUTES * 60_000)
  if (Number.isNaN(shifted.getTime())) return ''
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

// ── 时间片网格（#1081：可视化时间选择，替代下拉选起止） ──

/** 一个可点的时间片（相邻两个时刻点之间的一段） */
export interface SeatTimeCell {
  /** 起始时刻在切片数组中的下标 */
  startIndex: number
  /** 结束时刻下标（= `startIndex + 1`） */
  endIndex: number
  /** 起始 `HH:mm` */
  start: string
  /** 结束 `HH:mm` */
  end: string
  /** `08:00-09:00` */
  label: string
}

/**
 * 把时刻点切片两两组合成可点时间片。
 * 标签缺失（`HH:mm` 解析失败）的切片直接跳过，不产出无法展示 / 无法提交的格子。
 */
export const buildSeatTimeCells = (slices: SeatTimeSlice[]): SeatTimeCell[] => {
  const cells: SeatTimeCell[] = []
  for (let index = 0; index < slices.length - 1; index += 1) {
    const start = slices[index]
    const end = slices[index + 1]
    if (!start?.label || !end?.label) continue
    cells.push({
      startIndex: index,
      endIndex: index + 1,
      start: start.label,
      end: end.label,
      label: `${start.label}-${end.label}`
    })
  }
  return cells
}

/** 已选时间区间（切片下标；覆盖 `[startIndex, endIndex]`，即 `endIndex - startIndex` 个时间片） */
export interface SeatTimeSelection {
  startIndex: number
  endIndex: number
}

/**
 * 点击时间片后的新选择（纯函数，便于单测）。
 *
 * 交互契约（用户反馈：「做成像表一样，直接点选那一天的那个时间段」）：
 * - 未选择 → 以该格为起点（单格区间）；
 * - 点**已选起点** → 取消选择（返回 `null`）；
 * - 点**起点之前**的格子 → 重新以该格为起点（不反向延长，避免出现负数区间）；
 * - 点**终点或更后**的格子 → 延长到该格（连选成区间）；
 * - 点**区间内部**的格子 → 收缩终点到该格。
 * 任何情况下都保持 `startIndex < endIndex`，调用方无需再纠正。
 */
export const resolveSeatTimeCellClick = (
  current: SeatTimeSelection | null,
  cellIndex: number
): SeatTimeSelection | null => {
  const index = Math.trunc(Number(cellIndex))
  if (!Number.isFinite(index) || index < 0) return current
  if (!current) return { startIndex: index, endIndex: index + 1 }
  if (index === current.startIndex) return null
  if (index < current.startIndex) return { startIndex: index, endIndex: index + 1 }
  return { startIndex: current.startIndex, endIndex: index + 1 }
}

/** 时间片选中态：`anchor` 起点 / `on` 区间内 / `off` 未选中 */
export type SeatCellState = 'anchor' | 'on' | 'off'

/** 判断某时间片相对当前选择的选中态 */
export const seatCellState = (
  cell: SeatTimeCell,
  selection: SeatTimeSelection | null
): SeatCellState => {
  if (!selection) return 'off'
  if (cell.startIndex === selection.startIndex) return 'anchor'
  if (cell.startIndex > selection.startIndex && cell.startIndex < selection.endIndex) return 'on'
  return 'off'
}

/**
 * 已选区间文案（`09:00-11:00`）。
 * 越界 / 未选择 → 空串（调用方给出「未选择」提示，不编造时段）。
 */
export const seatSelectionRangeText = (
  slices: SeatTimeSlice[],
  selection: SeatTimeSelection | null
): string => {
  if (!selection) return ''
  const start = slices[selection.startIndex]?.label
  const end = slices[selection.endIndex]?.label
  if (!start || !end) return ''
  return `${start}-${end}`
}

// ── 已过去时间片（#1082：用服务端时间判定，服务端时间缺失则不禁用） ──

/**
 * 判断某时间片是否**已经过去**（应置灰不可点）。
 *
 * 规则（官方页 `noSelect` 同款 + 本馆实测 `allowReserveNow=0`）：
 * - `end <= 服务端当前时刻` → 已过去（官方页 `now.isAfter(slot.endTime)` 的保守写法，等号也置灰）；
 * - 另：`allowReserveNow === 0` 时，`start <= 服务端当前时刻` 的片也置灰（不允许预约当前时段）；
 *   `allowReserveNow` 为 `null`（取不到）→ **不启用**这条规则（不猜）。
 * - **服务端时钟缺失 → 一律返回 `false`**（不做任何本地时间推断，宁可不禁用也不猜）。
 *
 * `dateKey`（该网格所属日期，`YYYY-MM-DD`）用于跨天比较：早于服务端日期 → 全部过去，
 * 晚于 → 全部未过去；相等或缺失才按当日分钟比较。
 */
export const isSeatCellPast = (
  cell: SeatTimeCell,
  clock: SeatClock | null,
  allowReserveNow: number | null,
  dateKey = ''
): boolean => {
  if (!clock) return false
  if (dateKey) {
    if (dateKey < clock.dateKey) return true
    if (dateKey > clock.dateKey) return false
  }
  const start = hmToMinutes(cell.start)
  const end = hmToMinutes(cell.end)
  if (end !== null && end <= clock.minutes) return true
  if (allowReserveNow === 0 && start !== null && start <= clock.minutes) return true
  return false
}

/**
 * 默认时间窗口（考虑「已过去」时间片）：起点取**第一个未过去的可点时间片**，
 * 终点默认比起点晚 `minUnits` 个时间片并夹在区间内，始终保证 `startIndex < endIndex`。
 *
 * 全部时间片都已过去 → `null`（调用方给出「今日已无可约时段」提示，而不是选中一个死片）。
 * 服务端时间缺失时不禁用任何片（与 {@link isSeatCellPast} 一致），保持既有默认窗口行为。
 */
export const resolveSeatDefaultSelection = (
  cells: SeatTimeCell[],
  clock: SeatClock | null,
  allowReserveNow: number | null,
  dateKey = '',
  minUnits = 2
): SeatTimeSelection | null => {
  if (!cells.length) return null
  const first = cells.findIndex((cell) => !isSeatCellPast(cell, clock, allowReserveNow, dateKey))
  if (first < 0) return null
  const span = Math.max(1, Math.floor(minUnits))
  const lastIndex = Math.min(cells.length - 1, first + span - 1)
  return { startIndex: cells[first].startIndex, endIndex: cells[lastIndex].endIndex }
}

// ── 提交预约（#1081：本机提交，需验证码 + 客户端签名） ──

/**
 * 归一化 `library_reserve_seat_submit_prepare` 的返回
 * （`{ captchaUrl, submitEnc, raw }`）。
 *
 * - `captchaUrl`：验证码图片（实测为 base64 data URL，可直接 `<img :src>`）；
 * - `submitEnc`：**签名脚本的输入**，需写入 DOM 里 `#submit_enc` 的 `.value`（脚本只读该元素）；
 * - `wfwEngineEnc`：签名参数之一（官方页为入口链注入的 `wfwEnc`）。
 *   契约未把它列为顶层字段，故从 `raw` 里按候选键兜底提取；取不到用空串
 *   （`wyToken` 同理：风控关闭时官方页也传空串）。
 */
export interface SeatPrepareView {
  captchaUrl: string
  submitEnc: string
  wfwEngineEnc: string
  raw: Record<string, unknown>
}

/** `wfwEngineEnc` 的候选键（服务端字段名未定，按官方页命名 + 常见变体兜底） */
const WFW_ENC_KEYS = ['wfwEngineEnc', 'wfwEnc', 'wfw_engine_enc', 'wfwEngine']

export const normalizeSeatPrepare = (raw: unknown): SeatPrepareView => {
  const record = asRecord(raw)
  let wfwEngineEnc = ''
  for (const key of WFW_ENC_KEYS) {
    const value = toStr(record[key])
    if (value) {
      wfwEngineEnc = value
      break
    }
  }
  return {
    captchaUrl: toStr(record.captchaUrl),
    submitEnc: toStr(record.submitEnc),
    wfwEngineEnc,
    raw: record
  }
}

/** 提交接口所需参数（已按服务端语义格式化） */
export interface SeatSubmitParams {
  /**
   * 房间 ID（**数字**）。
   *
   * ⚠️ Rust 命令层 `LibraryReserveSeatSubmitRequest.room_id` 是 `i64`：
   * 传字符串会直接报 `invalid type: string "13248", expected i64`（实测踩过）。
   * 归一化视图 `SeatMatchView.roomId` 为字符串（便于展示/比较），这里必须转成数字。
   */
  roomId: number
  seatNum: string
  /** `HH:mm` */
  startTime: string
  /** `HH:mm` */
  endTime: string
  /** `YYYY-MM-DD` */
  day: string
}

/** 严格解析房间 ID：仅接受正整数（`"13248"` / `13248` 均可；`"abc"` / `"0"` / 小数 → null） */
const parseRoomId = (raw: unknown): number | null => {
  const text = toStr(raw).trim()
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * 由匹配结果构造提交参数。
 *
 * 优先级：匹配结果自带的服务端毫秒（`matchReserve.startTime/endTime`，与官方页
 * `doSubmit` 完全一致）→ 回落「用户所选时间片」（`fallbackStart` / `fallbackEnd`）。
 * `day` 优先取毫秒换算的服务端日期，其次回落 `ymd`（`getstartendtime` 的服务端日期）。
 * 关键字段（roomId / seatNum / 三个时间）任一缺失或非法即返回 `null` —— 宁可不提交，不猜。
 */
export const resolveSeatSubmitParams = (
  match: SeatMatchView | null,
  ymd: unknown,
  fallbackStart: string,
  fallbackEnd: string
): SeatSubmitParams | null => {
  if (!match || !match.seatNum) return null
  const roomId = parseRoomId(match.roomId)
  if (roomId === null) return null
  const startTime = seatMsToServerHm(match.startTimeMs) || toStr(fallbackStart)
  const endTime = seatMsToServerHm(match.endTimeMs) || toStr(fallbackEnd)
  const day = seatMsToServerDate(match.startTimeMs) || toStr(ymd)
  if (!startTime || !endTime || !day) return null
  return { roomId, seatNum: match.seatNum, startTime, endTime, day }
}
