/**
 * AI 课表导入 —— 时间冲突分析（Epic #815 / #817）。
 *
 * 判定语义与后端 Rust 实现严格对齐
 * （`apps/client/src-tauri/src/http_server/routes/schedule.rs` 的
 *  `build_custom_schedule_conflicts` / `schedule_ranges_overlap` / `weeks_intersection`）：
 *
 *   same weekday
 *   AND 节次范围重叠（[period, period+djs-1] 与 [other.period, other.period+other.djs-1] 有交集）
 *   AND weeks 交集非空
 *
 * 检查两类对端：
 *   1. 本次待导入课程之间（source = 'import'）；
 *   2. 待导入课程 vs existing（按 existing[].source 映射为 'official' / 'custom'）。
 *
 * 冲突仅作 warning，**不阻断导入**；本模块只负责产出冲突数据，不做任何过滤或删除。
 * 纯函数：不依赖 Vue / 网络 / Tauri / DB。
 */

import { normalizeWeeks } from './weeks'
import type {
  ImportConflict,
  ImportConflictSource,
  ImportExistingCourse,
  ParsedImportCourse
} from './importTypes'

/* ------------------------------------------------------------------ */
/* 冲突判定原语                                                        */
/* ------------------------------------------------------------------ */

/** 节次范围是否重叠：与后端 schedule_ranges_overlap 完全一致 */
const rangesOverlap = (
  leftPeriod: number,
  leftSpan: number,
  rightPeriod: number,
  rightSpan: number
): boolean => {
  const leftEnd = leftPeriod + leftSpan - 1
  const rightEnd = rightPeriod + rightSpan - 1
  return leftPeriod <= rightEnd && rightPeriod <= leftEnd
}

/** 周次交集（升序）：与后端 weeks_intersection 语义一致 */
const intersectWeeks = (left: number[], right: number[]): number[] => {
  const rightSet = new Set(normalizeWeeks(right))
  // normalizeWeeks 已升序去重，filter 后仍保持升序
  return normalizeWeeks(left).filter((week) => rightSet.has(week))
}

/* ------------------------------------------------------------------ */
/* 冲突对端视图                                                        */
/* ------------------------------------------------------------------ */

interface ConflictTarget {
  id?: string
  name: string
  weekday: number
  period: number
  djs: number
  weeks: number[]
  source: ImportConflictSource
}

/** batch 内其他课程 → 对端视图（source = 'import'） */
const toBatchTarget = (course: ParsedImportCourse): ConflictTarget => ({
  name: course.name,
  weekday: course.weekday,
  period: course.period,
  djs: course.djs,
  weeks: course.weeks,
  source: 'import'
})

/** 既有课程 → 对端视图；缺少 weekday / period 时无法参与冲突判定，返回 null */
const toExistingTarget = (existing: ImportExistingCourse): ConflictTarget | null => {
  if (existing.weekday === undefined || existing.period === undefined) return null
  const target: ConflictTarget = {
    name: existing.name ?? '',
    weekday: existing.weekday,
    period: existing.period,
    djs: existing.djs === undefined || existing.djs < 1 ? 1 : existing.djs,
    weeks: normalizeWeeks(existing.weeks ?? []),
    // 未标注来源时按教务课表处理
    source: existing.source === 'custom' ? 'custom' : 'official'
  }
  if (existing.id !== undefined) target.id = existing.id
  return target
}

/**
 * 构造单侧冲突；不满足「同星期 + 节次重叠 + 周次交集非空」时返回 null。
 * `course` 为待导入课程，`target` 为对端。
 */
const buildConflict = (course: ParsedImportCourse, target: ConflictTarget): ImportConflict | null => {
  if (course.weekday !== target.weekday) return null
  if (!rangesOverlap(course.period, course.djs, target.period, target.djs)) return null

  const overlapWeeks = intersectWeeks(course.weeks, target.weeks)
  if (overlapWeeks.length === 0) return null

  const overlapPeriodStart = Math.max(course.period, target.period)
  const overlapPeriodEnd = Math.min(
    course.period + course.djs - 1,
    target.period + target.djs - 1
  )

  const conflict: ImportConflict = {
    withCourseName: target.name,
    overlapWeeks,
    overlapPeriodStart,
    overlapPeriodEnd,
    source: target.source
  }
  if (target.id !== undefined) conflict.withCourseId = target.id
  return conflict
}

/** 冲突去重键：同一对端 + 同一重叠区间视为重复报告 */
const conflictKeyOf = (conflict: ImportConflict): string =>
  JSON.stringify([
    conflict.source,
    conflict.withCourseId ?? null,
    conflict.withCourseName,
    conflict.overlapPeriodStart,
    conflict.overlapPeriodEnd,
    conflict.overlapWeeks
  ])

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

/**
 * 冲突检测，返回与 `courses` 同序的冲突列表。
 *
 * 同一对课程只在各自列表中各报告一次，避免重复；冲突不阻断导入。
 *
 * @param courses  待导入课程草稿
 * @param existing 既有课程视图（official / custom）
 */
export function detectImportConflicts(
  courses: ParsedImportCourse[],
  existing: ImportExistingCourse[]
): ImportConflict[][] {
  const result: ImportConflict[][] = courses.map(() => [])

  // 1) batch 内部两两比较：同一对课程分别写入两侧列表（各一条）
  for (let i = 0; i < courses.length; i += 1) {
    for (let j = i + 1; j < courses.length; j += 1) {
      const left = courses[i]
      const right = courses[j]

      const leftConflict = buildConflict(left, toBatchTarget(right))
      if (leftConflict) result[i].push(leftConflict)

      const rightConflict = buildConflict(right, toBatchTarget(left))
      if (rightConflict) result[j].push(rightConflict)
    }
  }

  // 2) 待导入课程 vs existing
  const existingTargets: ConflictTarget[] = []
  for (const item of existing) {
    const target = toExistingTarget(item)
    if (target) existingTargets.push(target)
  }

  for (let i = 0; i < courses.length; i += 1) {
    for (const target of existingTargets) {
      const conflict = buildConflict(courses[i], target)
      if (conflict) result[i].push(conflict)
    }
  }

  // 3) 逐条去重，保证同一对课程不被重复报告
  return result.map((conflicts) => {
    const seen = new Set<string>()
    const deduped: ImportConflict[] = []
    for (const conflict of conflicts) {
      const key = conflictKeyOf(conflict)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(conflict)
    }
    return deduped
  })
}
