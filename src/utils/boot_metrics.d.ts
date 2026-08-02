export interface BootMetricRecord {
  name: string
  at: number
  elapsed_ms: number
  detail: Record<string, unknown>
  [key: string]: unknown
}

export interface BootMetricsSnapshot {
  boot_id: string
  started_at: number
  marks: Record<string, BootMetricRecord>
}

export function resetBootMetrics(context?: Record<string, unknown>): BootMetricsSnapshot
export function hasBootMetric(name: string): boolean
export function getBootMetricsSnapshot(): BootMetricsSnapshot
export function markBootMetric(
  name: string,
  detail?: Record<string, unknown>,
  options?: Record<string, unknown>
): BootMetricRecord | null
