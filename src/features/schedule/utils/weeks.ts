/**
 * 周次纯函数：周次归一化、周次文本、卡片样式归一化。
 * 原内联于 ScheduleView.vue，拆分后保持行为一致。
 */

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
export const normalizeCourseCardStyle = (value: any): string => {
  const key = String(value || '').trim().toLowerCase()
  return ['modern', 'traditional', 'class'].includes(key) ? key : 'modern'
}

/** 全局唯一 ID 生成（轻量，避免引入依赖） */
let uidSeed = 0
export const nextUid = (): number => {
  uidSeed += 1
  return uidSeed
}
