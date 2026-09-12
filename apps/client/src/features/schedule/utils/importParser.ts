/**
 * AI 课表导入 —— 容错 Parser（Epic #815 / #816）。
 *
 * 职责：把「外部 AI 产出的、格式不可信的文本 / JSON」转换成冻结契约
 * `ParseImportResult`（见 ./importTypes.ts）。本模块是纯函数，不依赖
 * Vue / 网络 / Tauri / DB / 浏览器 API。
 *
 * 设计原则（对应 #815）：
 *   - 标准输出严格，实际解析宽容；
 *   - AI 不得控制 semester / id / source_id（一律忽略，不进入结果）；
 *   - 单条字段非法 = hard error（该条不进入 courses），诊断带 sourceIndex 便于回溯；
 *   - teacher / room / color 缺失或异常 = warning，不阻断导入；
 *   - 无法安全确定唯一 JSON 主体时绝不猜测，直接整体失败。
 *
 * 周次归一化复用 ./weeks.ts 的 normalizeWeeks（只读引用，不修改该文件）。
 */

import {
  IMPORT_PERIOD_MAX,
  IMPORT_PERIOD_MIN,
  IMPORT_WEEKDAY_MAX,
  IMPORT_WEEKDAY_MIN,
  IMPORT_WEEKS_MAX,
  IMPORT_WEEKS_MIN,
  type ImportDiagnostic,
  type ImportDiagnosticLevel,
  type ParsedImportCourse,
  type ParseImportResult
} from './importTypes'
import { normalizeWeeks } from './weeks'

/* ------------------------------------------------------------------ */
/* 字段 alias（中文容错；canonical 仍为英文字段名）                     */
/* ------------------------------------------------------------------ */

/** canonical 字段 → 可接受的全部别名（canonical 排首位，优先级最高） */
const FIELD_ALIASES: Record<string, readonly string[]> = {
  name: ['name', '课程', '课程名', '课程名称'],
  teacher: ['teacher', '老师', '教师', '任课老师'],
  room: ['room', '地点', '教室', '上课地点'],
  weekday: ['weekday', '星期', '周几'],
  periods: ['periods', '节次', '上课节次'],
  weeks: ['weeks', '周次', '上课周次'],
  color: ['color', '颜色']
}

/** 除 canonical/alias 外，本模块能理解的附加键（periods 的内部形式） */
const EXTRA_RECOGNIZED_KEYS = new Set(['period', 'djs'])

/** AI 无权控制的外部字段：静默忽略，既不进入结果也不告警 */
const IGNORED_KEYS = new Set([
  'semester',
  'id',
  'source_id',
  'sourceId',
  'source',
  'sourceIndex',
  'term',
  'year'
])

/** 所有被识别为「已知字段」的键集合（用于未知字段告警判定） */
const RECOGNIZED_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(FIELD_ALIASES).flat(),
  ...EXTRA_RECOGNIZED_KEYS
])

/* ------------------------------------------------------------------ */
/* 诊断工具                                                            */
/* ------------------------------------------------------------------ */

const makeDiag = (
  level: ImportDiagnosticLevel,
  code: string,
  message: string,
  field?: string,
  sourceIndex?: number
): ImportDiagnostic => {
  const diag: ImportDiagnostic = { level, code, message }
  if (field !== undefined) diag.field = field
  if (sourceIndex !== undefined) diag.sourceIndex = sourceIndex
  return diag
}

const globalError = (code: string, message: string): ParseImportResult => ({
  ok: false,
  courses: [],
  diagnostics: [makeDiag('error', code, message)],
  rawCount: 0
})

/* ------------------------------------------------------------------ */
/* JSON 主体提取（纯 JSON / code fence / 少量说明文字）                */
/* ------------------------------------------------------------------ */

/** 从 `start`（必须是 `{` 或 `[`）起寻找配平结束下标；失败返回 -1 */
function matchBalanced(source: string, start: number): number {
  const open = source[start]
  if (open !== '{' && open !== '[') return -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (inString) {
      // JSON 字符串只使用双引号；反斜杠转义需跳过下一个字符
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      depth += 1
    } else if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** 扫描出全部顶层配平的 JSON 候选片段（忽略字符串内部的括号） */
function findBalancedCandidates(source: string): string[] {
  const candidates: string[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '{' || ch === '[') {
      const end = matchBalanced(source, i)
      if (end === -1) {
        // 无法配平：直接放弃该 opener，交由上层判定失败
        i += 1
        continue
      }
      candidates.push(source.slice(i, end))
      i = end
    } else {
      i += 1
    }
  }
  return candidates
}

type ExtractResult =
  | { ok: true; body: string; diagnostics: ImportDiagnostic[] }
  | { ok: false; diagnostics: ImportDiagnostic[] }

/** 从原始文本中安全定位唯一 JSON 主体 */
function extractJsonBody(rawText: string): ExtractResult {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return { ok: false, diagnostics: [makeDiag('error', 'empty_input', '输入为空，未找到课表数据')] }
  }

  const diagnostics: ImportDiagnostic[] = []

  // 1) Markdown code fence：剥离 ```json ... ```
  const fences = [...trimmed.matchAll(/```[ \t]*([a-zA-Z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)```/g)]
  let body = trimmed
  if (fences.length > 1) {
    return {
      ok: false,
      diagnostics: [makeDiag('error', 'multiple_json_bodies', '检测到多个代码块，无法安全确定唯一的课表 JSON')]
    }
  }
  if (fences.length === 1) {
    body = fences[0][2].trim()
    diagnostics.push(makeDiag('info', 'code_fence_stripped', '已自动剥离 Markdown 代码块包裹'))
    if (!body) {
      return { ok: false, diagnostics: [makeDiag('error', 'empty_input', '代码块内没有内容')] }
    }
  }

  // 2) 在（可能含说明文字的）文本中定位候选 JSON 主体
  const candidates = findBalancedCandidates(body)
  if (candidates.length === 0) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        makeDiag('error', 'json_body_not_found', '未找到可解析的 JSON 主体（可能括号未配平）')
      ]
    }
  }

  // 3) 仅接受「能成功 JSON.parse」的候选；多于一个可解析主体 → 拒绝猜测
  const valid = candidates.filter((candidate) => {
    try {
      JSON.parse(candidate)
      return true
    } catch {
      return false
    }
  })

  if (valid.length > 1) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        makeDiag('error', 'multiple_json_bodies', '检测到多个 JSON 主体，无法安全确定哪一个是课表数据')
      ]
    }
  }
  if (valid.length === 0) {
    return {
      ok: false,
      diagnostics: [...diagnostics, makeDiag('error', 'json_parse_failed', '定位到 JSON 主体但解析失败')]
    }
  }

  const picked = valid[0]
  if (picked !== body.trim()) {
    diagnostics.push(makeDiag('info', 'json_body_extracted', '已从说明文字中提取 JSON 主体'))
  }
  return { ok: true, body: picked, diagnostics }
}

/* ------------------------------------------------------------------ */
/* 基础类型工具                                                        */
/* ------------------------------------------------------------------ */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 从原始对象中按别名优先级取值（undefined/null 视为缺失，继续尝试别名） */
function pickField(
  raw: Record<string, unknown>,
  keys: readonly string[]
): { present: boolean; value: unknown; key: string } {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined && raw[key] !== null) {
      return { present: true, value: raw[key], key }
    }
  }
  return { present: false, value: undefined, key: keys[0] }
}

/** 宽松转数字：仅接受整数或纯数字字符串 */
function toInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return null
}

/** 可选文本字段：字符串 / 数字转字符串；其余返回 null（视为缺失） */
function toOptionalText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/* ------------------------------------------------------------------ */
/* weekday 解析：周二 / 星期二 / 礼拜二 / 2 / "2" / Tuesday → 1..7     */
/* ------------------------------------------------------------------ */

const CN_WEEKDAY: Record<string, number | undefined> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
  七: 7
}

const EN_WEEKDAY: Record<string, number | undefined> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7
}

/** 解析星期，失败或越界返回 null（调用方升级为 hard error） */
export function parseWeekday(value: unknown): number | null {
  const num = toInt(value)
  if (num !== null) {
    return num >= IMPORT_WEEKDAY_MIN && num <= IMPORT_WEEKDAY_MAX ? num : null
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null

  // 中文前缀：周 / 星期 / 礼拜 + 一..日|天|七|1..7
  const cnMatch = /^(?:周|星期|礼拜)([一二三四五六日天七]|\d)$/.exec(text)
  if (cnMatch) {
    const token = cnMatch[1]
    const weekday = /^\d$/.test(token) ? Number(token) : CN_WEEKDAY[token]
    if (weekday === undefined) return null
    return weekday >= IMPORT_WEEKDAY_MIN && weekday <= IMPORT_WEEKDAY_MAX ? weekday : null
  }

  const enWeekday = EN_WEEKDAY[text.toLowerCase()]
  if (enWeekday !== undefined) return enWeekday

  return null
}

/* ------------------------------------------------------------------ */
/* periods 解析：3-4 / 3-4节 / 第3-4节 / 3~4 / {period,djs}            */
/* ------------------------------------------------------------------ */

export interface ParsedPeriods {
  period: number
  djs: number
}

/** 校验节次范围：起始 >=1、跨度 >=1、末节 <= 上限 */
function validatePeriods(period: number, djs: number): ParsedPeriods | null {
  if (!Number.isInteger(period) || !Number.isInteger(djs)) return null
  if (period < IMPORT_PERIOD_MIN || djs < 1) return null
  if (period + djs - 1 > IMPORT_PERIOD_MAX) return null
  return { period, djs }
}

/** 解析节次，失败返回 null（调用方升级为 hard error） */
export function parsePeriods(value: unknown): ParsedPeriods | null {
  // 既有内部形式 { period, djs }
  if (isPlainObject(value)) {
    const period = toInt(value.period)
    if (period === null) return null
    const djs = value.djs === undefined || value.djs === null ? 1 : toInt(value.djs)
    if (djs === null) return null
    return validatePeriods(period, djs)
  }

  // 纯数字：单节
  const direct = toInt(value)
  if (direct !== null) return validatePeriods(direct, 1)

  if (typeof value !== 'string') return null

  // 归一化："第3-4节" → "3-4"；全角波浪号 → "-"
  const text = value
    .trim()
    .replace(/^第/, '')
    .replace(/节$/, '')
    .replace(/[~～—–]/g, '-')
    .trim()

  const range = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(text)
  if (range) {
    let start = Number(range[1])
    let end = Number(range[2])
    if (start > end) [start, end] = [end, start]
    return validatePeriods(start, end - start + 1)
  }
  if (/^\d{1,2}$/.test(text)) {
    return validatePeriods(Number(text), 1)
  }
  return null
}

/* ------------------------------------------------------------------ */
/* weeks 解析：1-16 / 1-15单 / 2-16双 / 1-4,6,8-12 / 1,3,5,7,9         */
/* ------------------------------------------------------------------ */

/** 校验并归一化周次数组（排序去重）；越界或空 → null */
function finalizeWeeks(values: number[]): number[] | null {
  if (!values.length) return null
  for (const week of values) {
    if (!Number.isInteger(week) || week < IMPORT_WEEKS_MIN || week > IMPORT_WEEKS_MAX) return null
  }
  return normalizeWeeks(values)
}

/** 解析单个周次 token（如 "1-15单" / "6" / "2-16双周"）；失败返回 null */
function parseWeekToken(token: string): number[] | null {
  let text = token.trim()
  if (!text) return []

  // 单双周后缀（"单周"/"单" / "双周"/"双"）
  let parity: 'odd' | 'even' | null = null
  if (/单周?$/.test(text)) {
    parity = 'odd'
    text = text.replace(/单周?$/, '')
  } else if (/双周?$/.test(text)) {
    parity = 'even'
    text = text.replace(/双周?$/, '')
  }
  // 剩余尾部单位 "周"
  text = text.replace(/周$/, '').trim()
  if (!text) return null

  let start: number
  let end: number
  const range = /^(\d{1,3})\s*[-~～—–]\s*(\d{1,3})$/.exec(text)
  if (range) {
    start = Number(range[1])
    end = Number(range[2])
    if (start > end) [start, end] = [end, start]
  } else if (/^\d{1,3}$/.test(text)) {
    start = Number(text)
    end = start
  } else {
    return null
  }

  if (start < IMPORT_WEEKS_MIN || end > IMPORT_WEEKS_MAX) return null

  const result: number[] = []
  for (let week = start; week <= end; week += 1) {
    if (parity === 'odd' && week % 2 === 0) continue
    if (parity === 'even' && week % 2 === 1) continue
    result.push(week)
  }
  return result
}

/** 解析周次，失败 / 为空 / 越界返回 null（调用方升级为 hard error） */
export function parseWeeks(value: unknown): number[] | null {
  // 数组形式：逐项严格校验（不允许静默丢弃非法项）
  if (Array.isArray(value)) {
    const values: number[] = []
    for (const item of value) {
      const week = toInt(item)
      if (week === null || week < IMPORT_WEEKS_MIN || week > IMPORT_WEEKS_MAX) return null
      values.push(week)
    }
    return finalizeWeeks(values)
  }

  // 纯数字：单周
  const direct = toInt(value)
  if (direct !== null) {
    return finalizeWeeks([direct])
  }

  if (typeof value !== 'string') return null

  const tokens = value.split(/[,，、;；]/)
  const collected: number[] = []
  for (const token of tokens) {
    if (!token.trim()) continue
    const parsed = parseWeekToken(token)
    if (parsed === null) return null
    collected.push(...parsed)
  }
  return finalizeWeeks(collected)
}

/* ------------------------------------------------------------------ */
/* color 基础识别（不做色板白名单校验，白名单由 importColors 负责）    */
/* ------------------------------------------------------------------ */

/** 基础判断「是否像颜色」：hex / rgb(a) / hsl(a) / 英文色名 / 中文色名 */
export function looksLikeColor(value: string): boolean {
  const text = value.trim()
  if (!text) return false
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return true
  if (/^(?:rgb|rgba|hsl|hsla)\(/i.test(text)) return true
  if (/^[a-z]{2,20}$/i.test(text)) return true
  if (/^[\u4e00-\u9fa5]{1,10}$/.test(text)) return true
  return false
}

/* ------------------------------------------------------------------ */
/* 单条课程解析                                                        */
/* ------------------------------------------------------------------ */

interface CourseParseOutcome {
  course?: ParsedImportCourse
  /** 该条的 error 诊断（hard error 时用于上抛到全局诊断） */
  errors: ImportDiagnostic[]
}

function parseCourse(rawItem: unknown, sourceIndex: number): CourseParseOutcome {
  const errors: ImportDiagnostic[] = []
  const diagnostics: ImportDiagnostic[] = []

  if (!isPlainObject(rawItem)) {
    return {
      errors: [
        makeDiag('error', 'invalid_course_entry', `第 ${sourceIndex + 1} 条不是合法的课程对象`, undefined, sourceIndex)
      ]
    }
  }

  const nameField = pickField(rawItem, FIELD_ALIASES.name)
  const nameText = toOptionalText(nameField.value)
  if (!nameField.present || !nameText) {
    return {
      errors: [makeDiag('error', 'missing_name', '缺少课程名称', nameField.key, sourceIndex)]
    }
  }

  const weekday = parseWeekday(pickField(rawItem, FIELD_ALIASES.weekday).value)
  if (weekday === null) {
    return {
      errors: [
        makeDiag(
          'error',
          'invalid_weekday',
          `星期无法解析或超出范围（应为 ${IMPORT_WEEKDAY_MIN}..${IMPORT_WEEKDAY_MAX}）`,
          'weekday',
          sourceIndex
        )
      ]
    }
  }

  // periods：canonical periods 优先，回退既有 { period, djs }
  const periodsField = pickField(rawItem, FIELD_ALIASES.periods)
  const periodsValue = periodsField.present
    ? periodsField.value
    : { period: rawItem.period, djs: rawItem.djs }
  const periods = parsePeriods(periodsValue)
  if (!periods) {
    return {
      errors: [
        makeDiag(
          'error',
          'invalid_periods',
          `节次无法解析或超出范围（起始 ${IMPORT_PERIOD_MIN}..${IMPORT_PERIOD_MAX}，末节不超过 ${IMPORT_PERIOD_MAX}）`,
          'periods',
          sourceIndex
        )
      ]
    }
  }

  const weeks = parseWeeks(pickField(rawItem, FIELD_ALIASES.weeks).value)
  if (!weeks) {
    return {
      errors: [
        makeDiag(
          'error',
          'invalid_weeks',
          `周次无法解析、为空或超出范围（应为 ${IMPORT_WEEKS_MIN}..${IMPORT_WEEKS_MAX}）`,
          'weeks',
          sourceIndex
        )
      ]
    }
  }

  // 可选字段：teacher / room 缺失或空串 → warning，不阻断
  const teacherField = pickField(rawItem, FIELD_ALIASES.teacher)
  const teacher = toOptionalText(teacherField.value) ?? ''
  if (!teacher) {
    diagnostics.push(makeDiag('warning', 'missing_teacher', '缺少教师信息', 'teacher', sourceIndex))
  }

  const roomField = pickField(rawItem, FIELD_ALIASES.room)
  const room = toOptionalText(roomField.value) ?? ''
  if (!room) {
    diagnostics.push(makeDiag('warning', 'missing_room', '缺少上课地点', 'room', sourceIndex))
  }

  // color：基础识别，不做色板校验
  let requestedColor: string | undefined
  const colorField = pickField(rawItem, FIELD_ALIASES.color)
  if (colorField.present) {
    const colorText = toOptionalText(colorField.value)
    if (colorText && looksLikeColor(colorText)) {
      requestedColor = colorText
    } else {
      diagnostics.push(
        makeDiag('warning', 'invalid_color', '颜色格式无法识别，已忽略该颜色', 'color', sourceIndex)
      )
    }
  }

  // 未知附加字段告警（semester / id / source_id 等外部字段静默忽略）
  for (const key of Object.keys(rawItem)) {
    if (RECOGNIZED_KEYS.has(key) || IGNORED_KEYS.has(key)) continue
    diagnostics.push(makeDiag('warning', 'unknown_field', `未识别的字段「${key}」已忽略`, key, sourceIndex))
  }

  const course: ParsedImportCourse = {
    name: nameText,
    teacher,
    room,
    weekday,
    period: periods.period,
    djs: periods.djs,
    weeks,
    sourceIndex,
    diagnostics
  }
  if (requestedColor !== undefined) course.requestedColor = requestedColor

  return { course, errors }
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

/**
 * 解析 AI 课表导入文本。
 *
 * @param text 原始输入（字符串；也容忍已解析的 JSON 对象 / 数组）
 * @returns 标准化结果；`ok=false` 表示没有可导入条目
 */
export function parseAiCourseImport(text: unknown): ParseImportResult {
  const globalDiagnostics: ImportDiagnostic[] = []
  let body: unknown

  if (typeof text === 'string') {
    const extracted = extractJsonBody(text)
    if (!extracted.ok) {
      return { ok: false, courses: [], diagnostics: extracted.diagnostics, rawCount: 0 }
    }
    globalDiagnostics.push(...extracted.diagnostics)
    try {
      body = JSON.parse(extracted.body)
    } catch {
      return globalError('json_parse_failed', 'JSON 主体解析失败')
    }
  } else if (isPlainObject(text) || Array.isArray(text)) {
    // 容忍调用方已解析好的对象 / 数组
    body = text
  } else {
    return globalError('invalid_input_type', '输入类型不受支持，应为文本或 JSON 对象 / 数组')
  }

  // 定位 courses 数组：顶层数组 / 顶层 { courses: [...] }
  let rawCourses: unknown[]
  if (Array.isArray(body)) {
    rawCourses = body
  } else if (isPlainObject(body) && Array.isArray(body.courses)) {
    rawCourses = body.courses
  } else {
    return {
      ok: false,
      courses: [],
      diagnostics: [
        ...globalDiagnostics,
        makeDiag('error', 'courses_not_found', '未找到课程数组（应为顶层数组或 { courses: [...] }）')
      ],
      rawCount: 0
    }
  }

  const courses: ParsedImportCourse[] = []
  for (let index = 0; index < rawCourses.length; index += 1) {
    // sourceIndex 始终使用原始数组下标，保证回溯正确
    const outcome = parseCourse(rawCourses[index], index)
    if (outcome.course) {
      courses.push(outcome.course)
    } else {
      globalDiagnostics.push(...outcome.errors)
    }
  }

  return {
    ok: courses.length > 0,
    courses,
    diagnostics: globalDiagnostics,
    rawCount: rawCourses.length
  }
}
