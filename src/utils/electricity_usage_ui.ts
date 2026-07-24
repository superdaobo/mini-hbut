/**
 * 电费「用电趋势」空态 / 快照展示纯逻辑（#488）
 *
 * 目标：
 * - 未选房 vs 已选房无曲线 文案可区分
 * - 成功但无分日/分月曲线时识别为「快照」而非「请先选择宿舍」
 */

export type UsageStatsLike = {
  success?: boolean
  points?: unknown
  month_points?: unknown
  monthPoints?: unknown
  message?: string | null
  hint?: string | null
  quantity?: string | number | null
  balance?: string | number | null
  today_use?: string | number | null
  todayUse?: string | number | null
  summary?: string | null
}

/** 是否已有可画柱图的日/月曲线 */
export function hasUsageCurve(stats: UsageStatsLike | null | undefined): boolean {
  if (!stats) return false
  const pts = stats.points
  const month = stats.month_points ?? stats.monthPoints
  return (
    (Array.isArray(pts) && pts.length > 0) ||
    (Array.isArray(month) && month.length > 0)
  )
}

/**
 * 智能水电未返回曲线，但有余额/余量/说明时的「快照」态。
 * 失败态（success===false）不算快照，交给错误行展示。
 */
export function isUsageSnapshotOnly(
  stats: UsageStatsLike | null | undefined
): boolean {
  if (!stats || hasUsageCurve(stats)) return false
  if (stats.success === false) return false
  const hasQty =
    stats.quantity != null && String(stats.quantity).trim() !== ''
  const hasBal =
    stats.balance != null && String(stats.balance).trim() !== ''
  const hasToday =
    (stats.today_use != null && String(stats.today_use).trim() !== '') ||
    (stats.todayUse != null && String(stats.todayUse).trim() !== '')
  const hasSummary = Boolean(String(stats.summary || '').trim())
  const hasMessage = Boolean(String(stats.message || '').trim())
  return hasQty || hasBal || hasToday || hasSummary || hasMessage
}

/**
 * 趋势区空态文案：
 * - 未选完整宿舍 → 引导选房
 * - 已选房 → 绝不回落「请先选择宿舍」
 */
export function resolveUsageEmptyText(opts: {
  hasSelectedRoom: boolean
  stats?: UsageStatsLike | null
}): string {
  if (!opts.hasSelectedRoom) {
    return '请先选择宿舍查看用电趋势'
  }
  const msg = String(opts.stats?.message || '').trim()
  // 后端偶发把引导文案塞进 message 时，前端仍按「已选房」语义改写
  if (msg && !/请先选择宿舍/.test(msg)) {
    return msg
  }
  return '该房间暂无分日/分月用电曲线，可查看上方电费余额'
}
