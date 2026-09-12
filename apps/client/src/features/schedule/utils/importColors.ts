/**
 * 课表领域 - AI 导入：智能配色（AI 推荐 / 均衡兜底 / 用户覆盖）。
 *
 * 职责边界（对应 Epic #815 / #818）：
 *   - 只消费冻结契约 `ParsedImportCourse` / `ImportDiagnostic`，不修改契约；
 *   - 颜色唯一来源是 `apps/client/src/utils/course_color.ts` 的 COURSE_COLOR_PRESETS，
 *     本模块**不**维护第二套色板常量；
 *   - 颜色问题**绝不**是 hard error，最多产出 warning。
 *
 * 优先级（固定）：
 *   用户预览阶段手动选择（override） > AI 返回的合法允许色 > Mini-HBT 均衡自动配色
 *
 * 本模块为纯函数：不依赖 Vue / axios / Tauri / DB，且自动配色全程确定性（禁止随机）。
 */
import type { ImportDiagnostic, ParsedImportCourse } from './importTypes'
import {
  COURSE_COLOR_PRESETS,
  findPresetByHex,
  normalizeHexColor
} from '../../../utils/course_color'
import { hashText, pickBestThemeCandidate } from './colors'

/** 诊断编码：AI 颜色格式非法 */
export const IMPORT_COLOR_CODE_INVALID = 'import.color.invalid'
/** 诊断编码：AI 颜色合法但不在允许色板内 */
export const IMPORT_COLOR_CODE_OUT_OF_PALETTE = 'import.color.out_of_palette'

/** 色板全部索引，作为自动配色的候选全集（顺序即色板顺序，保证确定性） */
const PRESET_INDICES: number[] = COURSE_COLOR_PRESETS.map((_, index) => index)

/**
 * 标准化课程名：trim + 折叠大小写。
 * 业务直觉上「高数」与「高数 」或「DataStruct」与「datastruct」视为同一门课，必须同色。
 */
function normalizeCourseName(name: unknown): string {
  return String(name ?? '').trim().toLowerCase()
}

/** hex → 色板索引；不在色板内返回 -1 */
function presetIndexOfHex(hex: string): number {
  const preset = findPresetByHex(hex)
  return preset ? COURSE_COLOR_PRESETS.indexOf(preset) : -1
}

/**
 * 校验 AI 候选颜色：合法 `#RRGGBB` 且在允许色板内 → 返回规范小写 hex；否则返回 null。
 * 覆盖 #RGB / #RRGGBBAA 等可归一化输入，但最终必须命中预设色板。
 */
export function validateImportColor(value: unknown): string | null {
  const normalized = normalizeHexColor(value)
  if (!normalized) return null
  const preset = findPresetByHex(normalized)
  return preset ? preset.hex.toLowerCase() : null
}

/**
 * 为一批课程分配颜色。
 *
 * 优先级：
 *   1. AI 返回的合法且属于允许色板的颜色（同一课程组内取第一个可用值）
 *   2. 均衡自动配色兜底（确定性，仅使用色板内颜色）
 *
 * 同一课程名（标准化后）必然得到同一颜色。
 * 返回 sourceIndex → hex（小写）的映射。
 */
export function assignImportColors(
  courses: ParsedImportCourse[],
  existingColors: string[] = []
): Map<number, string> {
  const result = new Map<number, string>()
  if (courses.length === 0) return result

  // 1) 按标准化课程名形成逻辑课程组，保持首次出现顺序（顺序决定兜底配色的确定性）
  const groupOrder: string[] = []
  const groupsByKey = new Map<string, ParsedImportCourse[]>()
  for (const course of courses) {
    const key = normalizeCourseName(course.name)
    const bucket = groupsByKey.get(key)
    if (bucket) {
      bucket.push(course)
    } else {
      groupsByKey.set(key, [course])
      groupOrder.push(key)
    }
  }

  // 2) 统计既有颜色频次（映射到色板索引）；非色板颜色不参与均衡统计
  const usage = new Array<number>(COURSE_COLOR_PRESETS.length).fill(0)
  for (const hex of existingColors) {
    const index = presetIndexOfHex(String(hex ?? ''))
    if (index >= 0) usage[index] += 1
  }

  // 3) 先落地 AI 推荐色：组内第一个合法且属于色板的候选生效，并计入频次以参与后续均衡
  const groupColor = new Map<string, string>()
  for (const key of groupOrder) {
    for (const course of groupsByKey.get(key) ?? []) {
      const accepted = validateImportColor(course.requestedColor)
      if (!accepted) continue
      groupColor.set(key, accepted)
      const index = presetIndexOfHex(accepted)
      if (index >= 0) usage[index] += 1
      break
    }
  }

  // 4) 兜底自动配色：对未定色课程组，从「使用次数最少」的候选索引中按 seed 择优
  let previousIndex: number | null = null
  for (const key of groupOrder) {
    let hex = groupColor.get(key)
    if (!hex) {
      const minUsage = Math.min(...usage)
      const candidates = PRESET_INDICES.filter((index) => usage[index] === minUsage)
      // 邻接对比参考上一个已定色课程组，全局对比参考当前全部在用颜色
      const neighborColors = previousIndex === null ? [] : [previousIndex]
      const globalColors = PRESET_INDICES.filter((index) => usage[index] > 0)
      const picked = pickBestThemeCandidate(candidates, hashText(key), neighborColors, globalColors)
      const chosen = picked ?? candidates[0]
      hex = COURSE_COLOR_PRESETS[chosen].hex.toLowerCase()
      usage[chosen] += 1
      groupColor.set(key, hex)
    }
    previousIndex = presetIndexOfHex(hex)
    // 同组全部条目共享同一颜色
    for (const course of groupsByKey.get(key) ?? []) {
      result.set(course.sourceIndex, hex)
    }
  }

  return result
}

/**
 * 同名课程组统一改色：把该课程名的所有条目设为 color（用户 override，优先级最高）。
 * 返回**新的 Map**，不修改传入的 Map；非法颜色直接忽略（保持原状）。
 * override 仅存在于颜色映射中，不回写 course 对象。
 */
export function setCourseGroupColor(
  courses: ParsedImportCourse[],
  colors: Map<number, string>,
  courseName: string,
  color: string
): Map<number, string> {
  const next = new Map(colors)
  const normalized = normalizeHexColor(color)
  if (!normalized) return next
  const targetKey = normalizeCourseName(courseName)
  for (const course of courses) {
    if (normalizeCourseName(course.name) === targetKey) {
      next.set(course.sourceIndex, normalized)
    }
  }
  return next
}

/**
 * 重置为初始策略（AI 推荐优先 + 均衡兜底），丢弃全部用户 override。
 */
export function resetImportColors(
  courses: ParsedImportCourse[],
  existingColors: string[] = []
): Map<number, string> {
  return assignImportColors(courses, existingColors)
}

/**
 * 汇总颜色相关诊断：AI 色非法 / 越板 → warning（不阻断导入）。
 * - 未提供颜色（undefined / null / 空白字符串）→ 不产生诊断；
 * - 同一课程名只报一次，避免同名多条记录造成噪声。
 */
export function collectImportColorDiagnostics(
  courses: ParsedImportCourse[]
): ImportDiagnostic[] {
  const diagnostics: ImportDiagnostic[] = []
  const reported = new Set<string>()

  for (const course of courses) {
    const raw = course.requestedColor
    if (raw === undefined || raw === null) continue
    if (typeof raw === 'string' && raw.trim() === '') continue

    const normalized = normalizeHexColor(raw)
    const code = !normalized
      ? IMPORT_COLOR_CODE_INVALID
      : findPresetByHex(normalized)
        ? null
        : IMPORT_COLOR_CODE_OUT_OF_PALETTE
    if (!code) continue

    const key = normalizeCourseName(course.name)
    if (reported.has(key)) continue
    reported.add(key)

    diagnostics.push({
      level: 'warning',
      code,
      message:
        code === IMPORT_COLOR_CODE_INVALID
          ? `课程「${course.name}」的 AI 颜色格式非法，已改用自动配色`
          : `课程「${course.name}」的 AI 颜色不在允许色板内，已改用自动配色`,
      field: 'color',
      sourceIndex: course.sourceIndex
    })
  }

  return diagnostics
}
