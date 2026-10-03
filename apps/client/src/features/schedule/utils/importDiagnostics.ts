/**
 * 课表 AI 导入 —— 诊断文案组装（#827 / #819）。
 *
 * 职责：把结构化诊断（ImportDiagnostic）组装成一行用户可读文案，供 composable
 * 与 Dialog 共用，避免两处各写一份拼接逻辑而产生漂移。
 *
 * #819 补充：诊断不再直接展示 Parser 内置的中文兜底 message，而是优先按
 * `code` 从 i18n 字典取词（三语），message 仅作为未知 code 的兜底——
 * 这样 en/ja 用户看到的是翻译后的原因，而非硬编码中文。
 *
 * 结构化定位（sourceIndex / field / rawValue / courseName）仍由本模块组装：
 *   - sourceIndex 是 0 基下标，展示时统一 +1 成「第 N 条」；
 *   - 无 sourceIndex（全局诊断，如 JSON 无法解析）时跳过定位前缀。
 *
 * ⚠️ 响应式：内部走模块级 t()/tf()（非响应式）。在事件回调（解析动作）中调用时机天然正确；
 * 若在模板中调用，需调用方自行建立 locale 依赖，与 ./i18n_text.ts 的约定一致。
 */
import { t as appT } from '../../../utils/app_i18n'
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
 * 诊断 code → i18n key 映射（#819）。
 *
 * key 命名规则：`schedule.import.diag.code.<snake_case>`。
 * 文案与 Parser / Merge / Colors 的内置中文 message 逐字一致（zh-CN 侧），
 * 保证「按 code 取词」与「message 兜底」输出相同，不破坏既有测试向量。
 *
 * `params`：从诊断结构提取 i18n 占位符参数（{name} / {field} / {n} 等）；
 * 任一必需占位参数缺失时整体回退 message，避免输出残缺模板。
 */
const DIAG_CODE_I18N: Record<
  string,
  { key: string; params?: (d: ImportDiagnostic) => Record<string, string | number> | null }
> = {
  empty_input: { key: 'schedule.import.diag.code.empty_input' },
  multiple_json_bodies: { key: 'schedule.import.diag.code.multiple_json_bodies' },
  code_fence_stripped: { key: 'schedule.import.diag.code.code_fence_stripped' },
  json_body_not_found: { key: 'schedule.import.diag.code.json_body_not_found' },
  json_parse_failed: { key: 'schedule.import.diag.code.json_parse_failed' },
  json_body_extracted: { key: 'schedule.import.diag.code.json_body_extracted' },
  invalid_input_type: { key: 'schedule.import.diag.code.invalid_input_type' },
  courses_not_found: { key: 'schedule.import.diag.code.courses_not_found' },
  invalid_course_entry: { key: 'schedule.import.diag.code.invalid_course_entry' },
  missing_name: { key: 'schedule.import.diag.code.missing_name' },
  invalid_weekday: { key: 'schedule.import.diag.code.invalid_weekday' },
  invalid_periods: { key: 'schedule.import.diag.code.invalid_periods' },
  invalid_weeks: { key: 'schedule.import.diag.code.invalid_weeks' },
  missing_teacher: { key: 'schedule.import.diag.code.missing_teacher' },
  missing_room: { key: 'schedule.import.diag.code.missing_room' },
  invalid_color: { key: 'schedule.import.diag.code.invalid_color' },
  // 未识别字段：{field} 取原始字段键名（非课程名）
  unknown_field: {
    key: 'schedule.import.diag.code.unknown_field',
    params: (d) => {
      const field = String(d.field ?? '').trim()
      return field ? { field } : null
    }
  },
  // 合并诊断：{n} 合并条数 + {name} 课程名
  merged_duplicate_weeks: {
    key: 'schedule.import.diag.code.merged_duplicate_weeks',
    params: (d) => {
      const name = String(d.courseName ?? '').trim()
      const n = Number(d.mergedCount)
      return name && Number.isInteger(n) && n > 0 ? { n, name } : null
    }
  },
  // 颜色诊断：{name} 课程名
  'import.color.invalid': {
    key: 'schedule.import.diag.code.color_invalid',
    params: (d) => {
      const name = String(d.courseName ?? '').trim()
      return name ? { name } : null
    }
  },
  'import.color.out_of_palette': {
    key: 'schedule.import.diag.code.color_out_of_palette',
    params: (d) => {
      const name = String(d.courseName ?? '').trim()
      return name ? { name } : null
    }
  }
}

/** 严重度 → 徽标文案 key（#819：预览 UI 需要展示严重度） */
export const importDiagnosticLevelKey = (level: string): string =>
  `schedule.import.diag.level.${level}`

/**
 * 按 code 取 i18n 词；未收录的 code / 字典未命中 / 占位参数缺失时，
 * 回退到 Parser 内置 message（永不空白）。
 */
const messageByCode = (diagnostic: ImportDiagnostic): string => {
  const entry = DIAG_CODE_I18N[diagnostic.code]
  if (!entry) return diagnostic.message

  // appT 未命中字典时返回 key 本身，借此识别「字典缺词」并回退 message
  const text = appT(entry.key)
  if (text === entry.key) return diagnostic.message
  if (!entry.params) return text

  const params = entry.params(diagnostic)
  // 占位参数缺失 → 回退内置 message，绝不输出带 {name} 残缺模板的文案
  if (!params) return diagnostic.message
  return tf(entry.key, params)
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
 * 面向用户的完整诊断文案：定位前缀（可选）+ 按 code 本地化的原因。
 * 用于输入阶段的 parseError 与预览阶段的全局/条目级诊断列表。
 */
export const describeImportDiagnostic = (diagnostic: ImportDiagnostic): string => {
  const location = describeImportDiagnosticLocation(diagnostic)
  const message = messageByCode(diagnostic)
  return location ? `${location}${LOCATION_SEPARATOR}${message}` : message
}
