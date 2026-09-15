/**
 * AI 课表导入 —— 诊断文案组装（#827）。
 *
 * Parser 的诊断本身带有 sourceIndex / field / courseName / rawValue，但输入阶段 UI
 * 过去只展示第一条 error 的 message（如「节次无法解析或超出范围」），用户既不知道
 * 是第几条数据出问题，也看不到原始值，只能靠肉眼在几十条 JSON 里猜（#827）。
 *
 * 本模块把结构化定位信息组装成一行可读文案，供 composable 与 Dialog 共用，
 * 避免两处各写一份拼接逻辑而产生漂移。
 *
 * ⚠️ 响应式：内部走模块级 t()/tf()（非响应式）。在事件回调（解析动作）中调用时机天然正确；
 * 若在模板中调用，需调用方自行建立 locale 依赖，与 ./i18n_text.ts 的约定一致。
 */
import { tf } from './i18n_text'
import type { ImportDiagnostic } from './importTypes'

/** 定位片段之间的分隔符（纯视觉分隔，无语言语义） */
const LOCATION_SEPARATOR = ' · '

/**
 * 字段名 → 本地化标签 key。
 * 只收录可能出现在 hard error 里的 canonical 字段名；alias 命中的原始键名走原样兜底。
 */
const FIELD_LABEL_KEYS: Record<string, string> = {
  name: 'schedule.import.field.name',
  weekday: 'schedule.import.field.weekday',
  periods: 'schedule.import.field.periods',
  weeks: 'schedule.import.field.weeks'
}

/** 字段标签：命中字典走本地化，未收录的字段名原样展示（宁可难看也不隐藏信息） */
const fieldLabel = (field: string): string => {
  const key = FIELD_LABEL_KEYS[field]
  return key ? tf(key, {}) : field
}

/**
 * 组装诊断的定位前缀，形如 `第 3 条「高等数学」· 节次 · 原始值：7-8`。
 *
 * - sourceIndex 是 0 基下标，展示给用户时统一 +1 成「第 N 条」；
 * - 无 sourceIndex（全局诊断，如 JSON 无法解析 / 多个 JSON 主体）时返回空串，
 *   由调用方退回只展示 message，避免出现「第 NaN 条」。
 */
export const describeImportDiagnosticLocation = (diagnostic: ImportDiagnostic): string => {
  const sourceIndex = diagnostic.sourceIndex
  if (sourceIndex === undefined || sourceIndex === null) return ''

  const parts: string[] = []
  const courseName = String(diagnostic.courseName ?? '').trim()
  parts.push(
    courseName
      ? tf('schedule.import.diag.locationNamed', { n: sourceIndex + 1, name: courseName })
      : tf('schedule.import.diag.location', { n: sourceIndex + 1 })
  )

  if (diagnostic.field) parts.push(fieldLabel(diagnostic.field))

  const rawValue = String(diagnostic.rawValue ?? '').trim()
  if (rawValue) parts.push(tf('schedule.import.diag.rawValue', { raw: rawValue }))

  return parts.join(LOCATION_SEPARATOR)
}

/**
 * 面向用户的完整诊断文案：有定位信息时前缀定位，否则与 message 等价。
 * 用于输入阶段的 parseError 与预览阶段的全局诊断列表。
 */
export const describeImportDiagnostic = (diagnostic: ImportDiagnostic): string => {
  const location = describeImportDiagnosticLocation(diagnostic)
  return location ? `${location}${LOCATION_SEPARATOR}${diagnostic.message}` : diagnostic.message
}
