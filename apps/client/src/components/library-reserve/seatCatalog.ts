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
