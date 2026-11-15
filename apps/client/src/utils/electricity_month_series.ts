/**
 * 电费「用电趋势 · 月」序列归一化（#1310）
 *
 * 服务端的 `monthuselist[].yearmonth` 存在两类问题：
 * 1. 标签重复（实测首项 2024.08 出现两次）；
 * 2. 标签可能整体滞后于当前月，甚至重复项之间存在缺月。
 *
 * 这里只做**可确定性**的处理：解析 / 丢弃非法 / 同月去重 / 按真实年月升序 /
 * 标出当前月。是否要把“滚动窗口标签异常”的列表按位置重标为当前月，
 * 由后端决定（`month_label_source`），前端不臆造月份。
 */

export interface RawMonthPoint {
  label?: unknown
  fullLabel?: unknown
  date?: unknown
  value?: unknown
  dayuse?: unknown
  unit?: unknown
}

export interface MonthPoint {
  /** 归一化后的 `YYYY.MM`，用于显示与排序 */
  label: string
  /** 完整标签（与 label 相同，保留给现有模板/测试） */
  fullLabel: string
  value: number
  unit: string
  year: number
  month: number
  isCurrentMonth: boolean
}

export interface NormalizedMonthSeries {
  points: MonthPoint[]
  currentMonthPoint: MonthPoint | null
  /** 输入中存在同一自然月的多条记录（已保留最后一条） */
  hadDuplicateMonths: boolean
  /** 输入中存在无法解析的标签（已丢弃） */
  hadInvalidLabels: boolean
}

/** 支持 `2024.08` / `2024-8` / `2024/08` / `202408` / `2024年8月` */
const MONTH_PATTERNS: RegExp[] = [
  /^(\d{4})[.\-/](\d{1,2})$/,
  /^(\d{4})(\d{2})$/,
  /^(\d{4})年(\d{1,2})月$/
]

export const parseYearMonth = (input: unknown): { year: number; month: number } | null => {
  if (typeof input !== 'string') return null
  const text = input.trim()
  if (!text) return null
  for (const pattern of MONTH_PATTERNS) {
    const match = pattern.exec(text)
    if (!match) continue
    const year = Number(match[1])
    const month = Number(match[2])
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null
    // 防御异常数据：只接受 2000–2100 的 1–12 月
    if (year < 2000 || year > 2100 || month < 1 || month > 12) return null
    return { year, month }
  }
  return null
}

export const formatYearMonth = (year: number, month: number): string =>
  `${year}.${String(month).padStart(2, '0')}`

/** 生成「近 count 个月、以当前月结尾」的标签序列 */
export const buildRollingMonthLabels = (count: number, now: Date = new Date()): string[] => {
  const safeCount = Math.max(0, Math.floor(count))
  const labels: string[] = []
  for (let offset = safeCount - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    labels.push(formatYearMonth(cursor.getFullYear(), cursor.getMonth() + 1))
  }
  return labels
}

const pointValue = (p: RawMonthPoint): number => {
  const raw = p?.value ?? p?.dayuse
  const num = Number(raw)
  return Number.isFinite(num) ? num : 0
}

const pointLabelSource = (p: RawMonthPoint): string => {
  const raw = p?.fullLabel ?? p?.label ?? p?.date
  return typeof raw === 'string' ? raw : ''
}

/**
 * 归一化月度序列：解析 → 去非法 → 同月保留最后一条 → 升序 → 标当前月。
 */
export const normalizeMonthSeries = (
  raw: unknown,
  now: Date = new Date()
): NormalizedMonthSeries => {
  const empty: NormalizedMonthSeries = {
    points: [],
    currentMonthPoint: null,
    hadDuplicateMonths: false,
    hadInvalidLabels: false
  }
  if (!Array.isArray(raw)) return empty

  let hadInvalidLabels = false
  let hadDuplicateMonths = false
  const byMonth = new Map<string, MonthPoint>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      hadInvalidLabels = true
      continue
    }
    const point = item as RawMonthPoint
    const parsed = parseYearMonth(pointLabelSource(point))
    if (!parsed) {
      hadInvalidLabels = true
      continue
    }
    const key = `${parsed.year}-${parsed.month}`
    if (byMonth.has(key)) hadDuplicateMonths = true
    // 同月重复时保留最后一条（服务端按时间顺序返回，后面的更新）
    byMonth.set(key, {
      label: formatYearMonth(parsed.year, parsed.month),
      fullLabel: formatYearMonth(parsed.year, parsed.month),
      value: pointValue(point),
      unit: typeof point.unit === 'string' && point.unit ? point.unit : '',
      year: parsed.year,
      month: parsed.month,
      isCurrentMonth: parsed.year === now.getFullYear() && parsed.month === now.getMonth() + 1
    })
  }

  const points = [...byMonth.values()].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
  )
  const currentMonthPoint = points.find((p) => p.isCurrentMonth) ?? null
  return { points, currentMonthPoint, hadDuplicateMonths, hadInvalidLabels }
}

/** 当前自然月的 `YYYY.MM`（供后端/UI 对齐口径） */
export const currentYearMonth = (now: Date = new Date()): string =>
  formatYearMonth(now.getFullYear(), now.getMonth() + 1)
