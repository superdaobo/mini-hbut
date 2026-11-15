/**
 * 服务健康载荷形状判定与字段提取（#1313）。
 *
 * 背景：后端 P3-4 把 `/health` 拆成两个端点 ——
 * - `/health`：**零 IO 轻量存活探针**，只回 `{ ok, service, version, uptime_seconds, started_at }`；
 * - `/health/deps`：完整依赖聚合（`status` / `service{...}` / `daily_usage` / `cloud_sync` / `trend` …）。
 *
 * 客户端「服务统计」页需要的是**完整**载荷；若只拿到轻量载荷，页面会退化成
 * 「状态未知 + 全 0」。因此这里提供可单测的形状判定，让视图能：
 * 1. 优先 `/health/deps`；
 * 2. 回落到旧部署的完整 `/health`（HF 兜底域仍是这种形态）；
 * 3. 两者都只有轻量载荷时，至少把「运行状态 / 版本 / 运行时长」显示正确。
 */

export type HealthStatus = 'ok' | 'degraded' | 'unknown'

export interface HealthServiceFields {
  version: string
  started_at: string
  uptime_seconds: number
}

const asRecord = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null

/**
 * 是否完整依赖聚合载荷。
 *
 * 判据（任一命中即完整）：`status` 是字符串、`service` 是对象、或存在
 * `cloud_sync` / `daily_usage` / `trend` / `version_usage` 之一。
 * 轻量存活载荷只有顶层 `ok` + 顶层 `version`/`uptime_seconds`，不会命中。
 */
export const isRichHealthPayload = (raw: unknown): boolean => {
  const record = asRecord(raw)
  if (!record) return false
  if (typeof record.status === 'string' && record.status.trim()) return true
  if (asRecord(record.service)) return true
  return ['cloud_sync', 'daily_usage', 'trend', 'version_usage'].some((key) => key in record)
}

/**
 * 归一化状态：完整载荷优先 `status`；轻量载荷用 `ok` 布尔兜底。
 */
export const healthStatusOf = (raw: unknown): HealthStatus => {
  const record = asRecord(raw)
  if (!record) return 'unknown'
  const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : ''
  if (status === 'ok' || status === 'degraded') return status
  if (status) return 'unknown'
  if (record.ok === true) return 'ok'
  if (record.ok === false) return 'degraded'
  return 'unknown'
}

const toFiniteNumber = (value: unknown): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * 提取服务版本 / 启动时间 / 运行秒数，兼容两种形状：
 * - 完整：`service: { version, started_at, uptime_seconds }`
 * - 轻量：顶层 `version` / `started_at` / `uptime_seconds`
 */
export const healthServiceFields = (raw: unknown): HealthServiceFields => {
  const record = asRecord(raw)
  const service = asRecord(record?.service)
  const pickString = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return ''
  }
  return {
    version: pickString(service?.version, record?.version),
    started_at: pickString(service?.started_at, record?.started_at),
    uptime_seconds: toFiniteNumber(service?.uptime_seconds ?? record?.uptime_seconds)
  }
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/**
 * 缓存时间展示：当天只显示 `HH:MM`；跨天补上 `MM-DD`，避免把「昨天 01:25」
 * 误读成「刚才」。`now` 可注入，便于单测。
 */
export const formatHealthTimestamp = (timestampMs: number, now: Date = new Date()): string => {
  const at = Number(timestampMs)
  if (!Number.isFinite(at) || at <= 0) return ''
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  const sameDay =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  if (sameDay) return time
  const monthDay = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  const sameYear = date.getFullYear() === now.getFullYear()
  return sameYear ? `${monthDay} ${time}` : `${date.getFullYear()}-${monthDay} ${time}`
}
