/**
 * AI 课表导入 —— 归一化合并与重复检测（Epic #815 / #817）。
 *
 * 职责：
 *   1. `mergeImportCourses`：把「除 weeks 外完全相同」的多条记录收敛为一条，
 *      weeks 取并集并去重排序（典型场景：AI 按第 1、2、3… 周逐条输出同一门课）；
 *   2. `detectImportDuplicates`：与既有课程（official / custom，以及调用方传入的
 *      batch 内其他项）比对，标记 exact（完全等价）或 possible（疑似重复）。
 *
 * 设计原则（对应 #815）：
 *   - 纯函数：不依赖 Vue / 网络 / Tauri / DB / 浏览器 API；
 *   - 合并判定必须**严格**：teacher / room / weekday / period / djs 任一不同即视为不同课程，
 *     绝不误合并；
 *   - 重复检测保持轻量、可解释，不引入模糊字符串算法；
 *   - possible 只是提示，**不自动删除**任何条目（删除决策由 UI 负责）。
 *
 * 周次归一化复用 ./weeks.ts 的 normalizeWeeks（只读引用，不修改该文件）。
 */

import { normalizeWeeks } from './weeks'
import type {
  ImportDiagnostic,
  ImportDuplicateKind,
  ImportExistingCourse,
  ParsedImportCourse
} from './importTypes'

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

/**
 * 合并分组键：name / teacher / room / weekday / period / djs 六项全等才归为一组。
 * 使用 JSON.stringify 避免分隔符与字段内容冲突（如名称中恰好含分隔符）。
 */
const mergeKeyOf = (course: ParsedImportCourse): string =>
  JSON.stringify([course.name, course.teacher, course.room, course.weekday, course.period, course.djs])

/** 诊断去重键：五元组全等视为同一条诊断 */
const diagnosticKeyOf = (diag: ImportDiagnostic): string =>
  JSON.stringify([diag.level, diag.code, diag.message, diag.field ?? null, diag.sourceIndex ?? null])

/** 周次集合是否相等（内部先归一化排序去重） */
const isSameWeeks = (left: number[], right: number[]): boolean => {
  const a = normalizeWeeks(left)
  const b = normalizeWeeks(right)
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** 周次是否有交集 */
const hasWeeksOverlap = (left: number[], right: number[]): boolean => {
  const rightSet = new Set(normalizeWeeks(right))
  return normalizeWeeks(left).some((week) => rightSet.has(week))
}

/* ------------------------------------------------------------------ */
/* 自动合并                                                            */
/* ------------------------------------------------------------------ */

export interface MergeImportCoursesResult {
  courses: ParsedImportCourse[]
  /** 被合并掉的记录条数（原始条数 - 合并后条数） */
  mergedCount: number
  /** 合并过程产生的 info 诊断（每个合并分组一条） */
  diagnostics: ImportDiagnostic[]
}

/**
 * 自动合并：name / teacher / room / weekday / period / djs 完全一致、仅 weeks 不同时，
 * 合并为一条，weeks 取并集并去重排序。
 *
 * 合并后条目：`sourceIndex` 取组内最小值；`diagnostics` 合并去重；
 * `requestedColor` 取组内首个非空候选值。
 *
 * @param courses Parser 产出的课程草稿（保持原始先后顺序）
 */
export function mergeImportCourses(courses: ParsedImportCourse[]): MergeImportCoursesResult {
  // 按首次出现顺序记录分组键，保证输出顺序稳定
  const order: string[] = []
  const groups = new Map<string, ParsedImportCourse[]>()

  for (const course of courses) {
    const key = mergeKeyOf(course)
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(course)
    } else {
      groups.set(key, [course])
      order.push(key)
    }
  }

  const mergedCourses: ParsedImportCourse[] = []
  const diagnostics: ImportDiagnostic[] = []
  let mergedCount = 0

  for (const key of order) {
    const group = groups.get(key)
    if (!group || group.length === 0) continue

    const first = group[0]

    // weeks：组内并集，去重升序
    const weeks = normalizeWeeks(group.flatMap((course) => course.weeks))

    // sourceIndex：组内最小值，保证回溯到最早的原始条目
    let sourceIndex = first.sourceIndex
    for (const course of group) {
      if (course.sourceIndex < sourceIndex) sourceIndex = course.sourceIndex
    }

    // diagnostics：合并去重
    const seenDiag = new Set<string>()
    const groupDiagnostics: ImportDiagnostic[] = []
    for (const course of group) {
      for (const diag of course.diagnostics) {
        const diagKey = diagnosticKeyOf(diag)
        if (seenDiag.has(diagKey)) continue
        seenDiag.add(diagKey)
        groupDiagnostics.push(diag)
      }
    }

    // requestedColor：取组内首个非空候选，避免丢失用户可见颜色
    let requestedColor: string | undefined
    for (const course of group) {
      if (course.requestedColor !== undefined) {
        requestedColor = course.requestedColor
        break
      }
    }

    const mergedCourse: ParsedImportCourse = {
      name: first.name,
      teacher: first.teacher,
      room: first.room,
      weekday: first.weekday,
      period: first.period,
      djs: first.djs,
      weeks,
      sourceIndex,
      diagnostics: groupDiagnostics
    }
    if (requestedColor !== undefined) mergedCourse.requestedColor = requestedColor
    mergedCourses.push(mergedCourse)

    // 组内多于一条时记录合并诊断
    if (group.length > 1) {
      const removed = group.length - 1
      mergedCount += removed
      diagnostics.push({
        level: 'info',
        code: 'merged_duplicate_weeks',
        message: `已自动合并 ${removed} 条仅周次不同的重复记录（${first.name}）`,
        sourceIndex
      })
    }
  }

  return { courses: mergedCourses, mergedCount, diagnostics }
}

/* ------------------------------------------------------------------ */
/* 重复检测                                                            */
/* ------------------------------------------------------------------ */

/** 既有课程归一化视图：可选字段统一补齐，避免判定分支散落 */
interface ExistingView {
  name: string
  teacher: string
  room: string
  weekday?: number
  period?: number
  djs?: number
  weeks: number[]
}

const toExistingView = (existing: ImportExistingCourse): ExistingView => {
  const view: ExistingView = {
    name: existing.name ?? '',
    teacher: existing.teacher ?? '',
    room: existing.room ?? '',
    weeks: normalizeWeeks(existing.weeks ?? [])
  }
  if (existing.weekday !== undefined) view.weekday = existing.weekday
  if (existing.period !== undefined) view.period = existing.period
  if (existing.djs !== undefined) view.djs = existing.djs
  return view
}

/** 完全等价：六项字段全等 + weeks 集合相等 */
const isExactWithExisting = (course: ParsedImportCourse, view: ExistingView): boolean =>
  view.weekday !== undefined &&
  view.period !== undefined &&
  view.djs !== undefined &&
  course.name === view.name &&
  course.teacher === view.teacher &&
  course.room === view.room &&
  course.weekday === view.weekday &&
  course.period === view.period &&
  course.djs === view.djs &&
  isSameWeeks(course.weeks, view.weeks)

/** 完全等价（batch 内两条 ParsedImportCourse 之间） */
const isExactBetweenCourses = (left: ParsedImportCourse, right: ParsedImportCourse): boolean =>
  left.name === right.name &&
  left.teacher === right.teacher &&
  left.room === right.room &&
  left.weekday === right.weekday &&
  left.period === right.period &&
  left.djs === right.djs &&
  isSameWeeks(left.weeks, right.weeks)

/** 疑似重复：同名 + 同 weekday + 同 period + weeks 有交集，但 teacher 或 room 不同 */
const isPossibleWithExisting = (course: ParsedImportCourse, view: ExistingView): boolean =>
  view.weekday !== undefined &&
  view.period !== undefined &&
  course.name === view.name &&
  course.weekday === view.weekday &&
  course.period === view.period &&
  hasWeeksOverlap(course.weeks, view.weeks) &&
  (course.teacher !== view.teacher || course.room !== view.room)

/** 疑似重复（batch 内两条 ParsedImportCourse 之间） */
const isPossibleBetweenCourses = (left: ParsedImportCourse, right: ParsedImportCourse): boolean =>
  left.name === right.name &&
  left.weekday === right.weekday &&
  left.period === right.period &&
  hasWeeksOverlap(left.weeks, right.weeks) &&
  (left.teacher !== right.teacher || left.room !== right.room)

/**
 * 精确 / 疑似重复检测，返回与 `courses` 同序的 `duplicateKind` 数组。
 *
 * - exact：与既有课程或 batch 内其他项完全等价（weeks 按集合相等比较）；
 * - possible：同名 + 同 weekday + 同 period + weeks 有交集，但 teacher 或 room 不同；
 * - 优先级：exact 优先于 possible；两者都不满足时为 none。
 *
 * @param courses  待导入课程草稿
 * @param existing 既有课程视图（调用方会把 official + custom + batch 内其他项都传入）
 */
export function detectImportDuplicates(
  courses: ParsedImportCourse[],
  existing: ImportExistingCourse[]
): ImportDuplicateKind[] {
  const existingViews = existing.map(toExistingView)

  return courses.map((course, index) => {
    // 第一轮：寻找 exact（batch 内其他项 + existing）
    for (let j = 0; j < courses.length; j += 1) {
      if (j === index) continue
      if (isExactBetweenCourses(course, courses[j])) return 'exact'
    }
    for (const view of existingViews) {
      if (isExactWithExisting(course, view)) return 'exact'
    }

    // 第二轮：寻找 possible
    for (let j = 0; j < courses.length; j += 1) {
      if (j === index) continue
      if (isPossibleBetweenCourses(course, courses[j])) return 'possible'
    }
    for (const view of existingViews) {
      if (isPossibleWithExisting(course, view)) return 'possible'
    }

    return 'none'
  })
}
