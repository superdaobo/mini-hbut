/**
 * 周次纯函数：周次归一化、周次文本、卡片样式归一化。
 * 原内联于 ScheduleView.vue，拆分后保持行为一致。
 */

import type { ScheduleCourseCardStyle } from '../../../config/ui_settings'

/**
 * 归一化周次数组：过滤非法值、去重、升序排序。
 * 与原始 normalizeWeeks 完全一致。
 */
export const normalizeWeeks = (weeks: any): number[] => {
  if (!Array.isArray(weeks)) return []
  const normalized = weeks
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w > 0)
  return Array.from(new Set(normalized)).sort((a, b) => a - b)
}

/**
 * 周次文本：连续周合并为区间，如 [1,2,3,5] -> "1-3,5"。
 * 与原始 formatWeeksText 完全一致。
 */
export const formatWeeksText = (weeks: any): string => {
  const values = normalizeWeeks(weeks)
  if (!values.length) return ''
  const ranges: string[] = []
  let start = values[0]
  let prev = values[0]
  for (let i = 1; i < values.length; i += 1) {
    const current = values[i]
    if (current === prev + 1) {
      prev = current
      continue
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = current
    prev = current
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
  return ranges.join(',')
}

/**
 * 归一化课表卡片样式 key：仅接受 modern/traditional/class，否则回退 modern。
 * 与原始 normalizeCourseCardStyle 完全一致。
 */
export const normalizeCourseCardStyle = (value: any): ScheduleCourseCardStyle => {
  const key = String(value || '').trim().toLowerCase()
  return ['modern', 'traditional', 'class'].includes(key)
    ? (key as ScheduleCourseCardStyle)
    : 'modern'
}

/**
 * 今天在指定学期中的教学周次（1..totalWeeks）。
 * 今天早于开学日、晚于学期最后一天、或开学日/总周数非法时返回 0。
 * #1322：供「回到当前周」按钮门控——往期学期/未开学/已结束时返回 0。
 */
export const resolveWeekOfToday = (
  startDate: string,
  totalWeeks: number,
  today: Date = new Date()
): number => {
  // 手动按 ISO 拆分后按本地时区构造，避免 new Date('YYYY-MM-DD') 被按 UTC 解析导致时区差一天
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate ?? '').trim())
  if (!m) return 0
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const start = new Date(year, month - 1, day)
  // 防御 2026-02-31 这类溢出日期（构造后回滚到下一月）
  if (
    Number.isNaN(start.getTime()) ||
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    return 0
  }

  const safeTotal = Number(totalWeeks)
  if (!Number.isFinite(safeTotal) || safeTotal <= 0) return 0

  const safeToday = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date()
  // 归一化到「当地 00:00」再按天差计算；Math.round 抵御夏令时切换导致的天差 ±1 小时
  const normalizedToday = new Date(safeToday.getFullYear(), safeToday.getMonth(), safeToday.getDate())
  const diffDays = Math.round((normalizedToday.getTime() - start.getTime()) / 86400000)
  if (diffDays < 0) return 0
  const week = Math.floor(diffDays / 7) + 1
  return week >= 1 && week <= safeTotal ? week : 0
}

/** 全局唯一 ID 生成（轻量，避免引入依赖） */
let uidSeed = 0
export const nextUid = (): number => {
  uidSeed += 1
  return uidSeed
}
