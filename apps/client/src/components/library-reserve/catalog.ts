/**
 * 图书馆预约 · 静音仓 / 研讨室 共享领域层（#1056）
 *
 * 只放「无副作用、可单测」的数据与纯函数，供视图组件复用：
 *
 * - **资源目录**：房间清单（名称 / 开放时间 / 地点 / 容纳人数）取自 #1052 实测勘察
 *   （`data/library-reserve-recon/01-api-contract.md`）。后端 `reserve/item/list/time`
 *   只返回时段，不暴露「地点 / 容纳人数」等静态属性，故这部分以勘察事实为准，
 *   待接口补齐静态资源属性后可替换为服务端数据。
 * - **时段可用性判定**：把后端条目归一化为 free / taken / closed 三态。
 * - **动态表单**：`customFormConfig` 字段归一化（控件类型 / 选项 / 校验）与本地校验。
 * - **错误映射**：把 Rust 命令返回的结构化错误（`kind`）映射为可读 i18n 文案，
 *   并区分业务失败与网络 / 运行时失败。
 *
 * ⚠️ 契约不确定处（`customFormConfig` → 提交体映射、取消接口路径等）见 issue #1053，
 * 本模块按已知形态实现并显式标注，不猜测后伪装成已确定。
 */

/** 本模块支持的两套预约应用标识（与 Rust 命令层 `parse_pc_app` 的取值一致） */
export type ReserveApp = 'quiet_room' | 'seminar_room'

/** 单个可预约资源（房间） */
export interface ReserveResource {
  /** 稳定标识（app + 序号） */
  id: string
  app: ReserveApp
  /** 房间序号（从 1 起） */
  index: number
  /** 名称 i18n key（含 {n} 占位） */
  nameKey: string
  /** 地点 i18n key */
  locationKey: string
  /** 开放起始 HH:mm */
  openFrom: string
  /** 开放结束 HH:mm */
  openTo: string
  /** 容纳人数下限 */
  capacityMin: number
  /** 容纳人数上限 */
  capacityMax: number
  /** 附加提示 i18n key（可选） */
  noteKey?: string
}

/** 静音仓（1–5 号）：图书馆四楼，08:00–21:30，容纳 2–6 人 */
export const QUIET_RESOURCES: ReserveResource[] = Array.from({ length: 5 }, (_, i) => {
  const index = i + 1
  return {
    id: `quiet_room-${index}`,
    app: 'quiet_room' as const,
    index,
    nameKey: 'library.reserve.resource.quiet.name',
    locationKey: 'library.reserve.resource.quiet.location',
    openFrom: '08:00',
    openTo: '21:30',
    capacityMin: 2,
    capacityMax: 6,
    noteKey: 'library.reserve.resource.quiet.note'
  }
})

/** 研讨室（1–7 号）：图书馆 4 楼 D 区，08:00–21:00，容纳 2–8 人（7 号为 6–30 人） */
export const SEMINAR_RESOURCES: ReserveResource[] = Array.from({ length: 7 }, (_, i) => {
  const index = i + 1
  const large = index === 7
  return {
    id: `seminar_room-${index}`,
    app: 'seminar_room' as const,
    index,
    nameKey: 'library.reserve.resource.seminar.name',
    locationKey: 'library.reserve.resource.seminar.location',
    openFrom: '08:00',
    openTo: '21:00',
    capacityMin: large ? 6 : 2,
    capacityMax: large ? 30 : 8
  }
})

/** 资源目录（按应用标识索引） */
export const RESOURCE_CATALOG: Record<ReserveApp, ReserveResource[]> = {
  quiet_room: QUIET_RESOURCES,
  seminar_room: SEMINAR_RESOURCES
}

/**
 * `advanceDays` 的勘察回落值（实测 = 3）。
 * 仅在后端 `reserve/info` 不可用时用于渲染日期条，避免因单次请求失败导致整个日期选择失效。
 */
export const FALLBACK_ADVANCE_DAYS = 3

/** 星期短名 i18n key（索引 = `Date.getDay()`） */
export const WEEKDAY_KEYS: string[] = [
  'library.reserve.weekday.0',
  'library.reserve.weekday.1',
  'library.reserve.weekday.2',
  'library.reserve.weekday.3',
  'library.reserve.weekday.4',
  'library.reserve.weekday.5',
  'library.reserve.weekday.6'
]

// ── 日期 / 时间 ──

/** 可选日期项 */
export interface DateOption {
  /** `YYYY-MM-DD` */
  value: string
  /** 本地 Date（仅日粒度有效） */
  date: Date
  /** 相对今天的天数（0 = 今天） */
  offset: number
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 本地日期 → `YYYY-MM-DD`（不使用 UTC，避免时区错位） */
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

/** 当日本地零点 */
const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

/**
 * 生成可选日期：今天起、共 `advanceDays + 1` 天（含今天）。
 * `advanceDays` 缺失 / 非法时回落为 0（仅今天可约），不放大可约范围。
 */
export const buildDateOptions = (advanceDays: number, now: Date = new Date()): DateOption[] => {
  const extra = Math.max(0, Math.floor(Number(advanceDays) || 0))
  const base = startOfDay(now)
  return Array.from({ length: extra + 1 }, (_, offset) => {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset)
    return { value: toDateKey(date), date, offset }
  })
}

/** 从各种时间字符串里抽取 `HH:mm`（兼容 `08:00` / `08:00:00` / `2026-10-16 08:00:00`） */
export const extractHm = (raw: unknown): string => {
  const matched = String(raw ?? '').match(/(\d{1,2}):(\d{2})/)
  if (!matched) return ''
  return `${pad2(Number(matched[1]))}:${matched[2]}`
}

/**
 * 判断后端条目的日期字段是否命中目标日期。
 * 后端日期形态可能是 `2026-10-16` / `2026/10/16` / `10-16`，统一按数字后缀比对。
 */
export const matchesDate = (raw: unknown, dateKey: string): boolean => {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return false
  const target = dateKey.replace(/\D/g, '')
  if (digits.length >= 8) return digits.slice(-8) === target
  if (digits.length >= 4) return digits.slice(-4) === target.slice(-4)
  return false
}

// ── 时段 ──

/** 时段可约状态 */
export type SlotState = 'free' | 'taken' | 'closed'

/** 归一化后的时段条目 */
export interface NormalizedSlot {
  /** 唯一键（列表 key） */
  id: string
  /** 审批 / 预约项 ID（提交与取消的核心标识，可能缺失） */
  aprvId: number | null
  /** 资源 / 房间名（后端可能返回） */
  itemName: string
  /** 展示日期（后端原值，可能为空） */
  date: string
  /** 起始 HH:mm */
  start: string
  /** 结束 HH:mm */
  end: string
  state: SlotState
  capacity: number | null
  remaining: number | null
  /** 动态表单字段（归一化） */
  fields: FormField[]
  /** 表单定义是否成功解析（false 时字段为空且需提示） */
  formParsed: boolean
  /** 原始条目（透传字段兜底用） */
  raw: Record<string, unknown>
}

/** 安全取对象（非对象一律回落空对象，避免上游形态变化直接抛错） */
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** 宽松取整（兼容数字字符串） */
const toInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/**
 * 判定时段可约状态。
 *
 * 依据（best-effort，契约见 #1053）：
 * - `status === 1` 或 `remaining <= 0` → 已被占用；
 * - 起止时间越出资源开放时段 → 不在开放时段；
 * - 其余非 0 `status` → 不可约；
 * - 未知（缺失）→ 视为可约，交由服务端最终裁决。
 */
const resolveSlotState = (
  item: Record<string, unknown>,
  openFrom: string,
  openTo: string
): SlotState => {
  const status = toInt(item.status)
  if (status === 1) return 'taken'

  const remaining = toInt(item.remaining)
  if (remaining !== null && remaining <= 0) return 'taken'

  const start = extractHm(item.startTime)
  const end = extractHm(item.endTime)
  if (start && openFrom && start < openFrom) return 'closed'
  if (end && openTo && end > openTo) return 'closed'

  if (status !== null && status !== 0) return 'closed'
  return 'free'
}

// ── 动态表单（customFormConfig） ──

/** 表单控件类型（归一化后的渲染维度） */
export type FormControl = 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'time'

/** 归一化后的表单字段 */
export interface FormField {
  /** 提交时的字段名（对应 form_data 的 key） */
  key: string
  /** 展示标题 */
  label: string
  control: FormControl
  required: boolean
  placeholder: string
  options: Array<{ label: string; value: string }>
  /** 数字下限 / 上限（来自 raw 的 min / max） */
  min: number | null
  max: number | null
  /** 正则格式（来自 raw 的 pattern / regex，非法则忽略） */
  pattern: string
  /** 文本格式校验（从字段类型推断） */
  format: '' | 'email' | 'phone'
  /** 默认值（字符串化） */
  defaultValue: string
}

/** 按字段类型推断控件（顺序敏感：textarea / checkbox 需先于 text 判定） */
const resolveControl = (fieldType: string): FormControl => {
  const t = fieldType.toLowerCase()
  if (/textarea|multi.?line|remark|comment/.test(t)) return 'textarea'
  if (/radio/.test(t)) return 'radio'
  if (/checkbox|multi.?select|tags/.test(t)) return 'checkbox'
  if (/select|dropdown|combo|choose|enum/.test(t)) return 'select'
  if (/number|int|digit|count|num|amount|people/.test(t)) return 'number'
  if (/date/.test(t)) return 'date'
  if (/time/.test(t)) return 'time'
  return 'text'
}

/** 从字段类型推断文本格式校验 */
const resolveFormat = (fieldType: string): FormField['format'] => {
  const t = fieldType.toLowerCase()
  if (/mail/.test(t)) return 'email'
  if (/phone|mobile|tel/.test(t)) return 'phone'
  return ''
}

/** 选项归一化（兼容字符串数组与对象数组的多种键名） */
const normalizeOptions = (raw: unknown): Array<{ label: string; value: string }> => {
  if (!Array.isArray(raw)) return []
  const out: Array<{ label: string; value: string }> = []
  for (const entry of raw) {
    if (entry === null || entry === undefined) continue
    if (typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      const value = obj.value ?? obj.id ?? obj.key ?? obj.code ?? obj.fieldValue ?? obj.label ?? obj.name
      if (value === null || value === undefined || String(value).trim() === '') continue
      const label = obj.label ?? obj.name ?? obj.text ?? obj.title ?? obj.value ?? value
      out.push({ value: String(value), label: String(label) })
    } else {
      out.push({ value: String(entry), label: String(entry) })
    }
  }
  return out
}

/** 把后端 best-effort 解析出的字段定义归一化为可渲染字段（跳过无 key 的字段） */
export const normalizeFormFields = (config: unknown): { fields: FormField[]; parsed: boolean } => {
  const cfg = asRecord(config)
  const parsed = cfg.parsed === true
  const rawFields = Array.isArray(cfg.fields) ? cfg.fields : []
  const fields: FormField[] = []

  for (const entry of rawFields) {
    const raw = asRecord(entry)
    const key = String(raw.key ?? '').trim()
    if (!key) continue // 无字段名无法映射提交体，跳过而非猜测
    const fieldType = String(raw.fieldType ?? '')
    const options = normalizeOptions(raw.options)
    const control = resolveControl(fieldType)
    // 有选项但类型未识别为下拉 / 单选：按单选渲染更贴近实际（避免退化成自由文本）
    const resolved: FormControl = options.length > 0 && control === 'text' ? 'radio' : control
    const defaultValue = raw.defaultValue
    fields.push({
      key,
      label: String(raw.label ?? '').trim() || key,
      control: resolved,
      required: raw.required === true,
      placeholder: String(raw.placeholder ?? '').trim(),
      options,
      min: toInt(asRecord(raw.raw).min ?? raw.min),
      max: toInt(asRecord(raw.raw).max ?? raw.max),
      pattern: String(asRecord(raw.raw).pattern ?? raw.pattern ?? '').trim(),
      format: resolveFormat(fieldType),
      defaultValue:
        defaultValue === null || defaultValue === undefined
          ? ''
          : Array.isArray(defaultValue)
            ? defaultValue.map((v) => String(v)).join(',')
            : String(defaultValue)
    })
  }

  return { fields, parsed }
}

/** 表单值（checkbox 为多值） */
export type FormValues = Record<string, string | string[]>

/** 按字段定义生成初始值（默认值 + 空值兜底） */
export const buildInitialValues = (fields: FormField[]): FormValues => {
  const values: FormValues = {}
  for (const field of fields) {
    values[field.key] = field.control === 'checkbox'
      ? (field.defaultValue ? field.defaultValue.split(',').filter(Boolean) : [])
      : field.defaultValue
  }
  return values
}

/** 校验结果：errors 的值为 i18n key，空对象表示通过 */
export interface FormValidation {
  valid: boolean
  errors: Record<string, string>
}

/** 单值字符串化（多值以逗号连接，与提交体一致） */
export const stringifyValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value.join(',') : String(value ?? '').trim()

/** 编译 raw 里的正则（非法则返回 null，不阻断提交） */
const compilePattern = (pattern: string): RegExp | null => {
  if (!pattern) return null
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/**
 * 本地表单校验（必填 / 数字 / 格式 / 上下限）。
 * 校验文案一律返回 i18n key，由组件侧取词，保证多语言一致。
 */
export const validateFormValues = (fields: FormField[], values: FormValues): FormValidation => {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const value = values[field.key]
    const text = stringifyValue(value)

    if (!text) {
      if (field.required) errors[field.key] = 'library.reserve.form.required'
      continue
    }

    if (field.control === 'number') {
      const n = Number(text)
      if (!Number.isFinite(n)) {
        errors[field.key] = 'library.reserve.form.number'
        continue
      }
      if (field.min !== null && n < field.min) {
        errors[field.key] = 'library.reserve.form.min'
        continue
      }
      if (field.max !== null && n > field.max) {
        errors[field.key] = 'library.reserve.form.max'
        continue
      }
    }

    if (field.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      errors[field.key] = 'library.reserve.form.email'
      continue
    }
    if (field.format === 'phone' && !/^[0-9+\-() ]{6,20}$/.test(text)) {
      errors[field.key] = 'library.reserve.form.phone'
      continue
    }

    const pattern = compilePattern(field.pattern)
    if (pattern && !pattern.test(text)) {
      errors[field.key] = 'library.reserve.form.format'
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/** 归一化表单值 → 提交体（`form_data`，字符串键值） */
export const toFormData = (fields: FormField[], values: FormValues): Record<string, string> => {
  const data: Record<string, string> = {}
  for (const field of fields) {
    const text = stringifyValue(values[field.key])
    if (text) data[field.key] = text
  }
  return data
}

/** 表单值摘要（确认弹窗展示用，跳过空值） */
export const summarizeFormValues = (
  fields: FormField[],
  values: FormValues
): Array<{ label: string; value: string }> =>
  fields
    .map((field) => ({ label: field.label, value: stringifyValue(values[field.key]) }))
    .filter((row) => row.value !== '')

// ── 时段列表归一化 ──

/**
 * 把后端时段条目归一化为渲染用模型。
 * `itemName` 命中房间序号时用于展示，不作为过滤条件（避免契约未定时误隐藏数据）。
 */
export const normalizeSlot = (
  item: unknown,
  index: number,
  resource: ReserveResource
): NormalizedSlot => {
  const raw = asRecord(item)
  // 区分「无表单配置」与「配置存在但无法解析」：前者无需填写，后者需给出降级提示
  const hasFormConfig = raw.customFormConfig !== null && raw.customFormConfig !== undefined
  const form = hasFormConfig
    ? normalizeFormFields(raw.customFormConfig)
    : { fields: [] as FormField[], parsed: true }
  const start = extractHm(raw.startTime)
  const end = extractHm(raw.endTime)
  return {
    id: `${raw.aprvId ?? raw.itemId ?? 'slot'}-${index}`,
    aprvId: toInt(raw.aprvId),
    itemName: String(raw.itemName ?? '').trim(),
    date: String(raw.date ?? '').trim(),
    start,
    end,
    state: resolveSlotState(raw, resource.openFrom, resource.openTo),
    capacity: toInt(raw.capacity),
    remaining: toInt(raw.remaining),
    fields: form.fields,
    formParsed: form.parsed,
    raw
  }
}

/** 判断「我的预约」条目是否属于给定日期之后（用于排序，缺失日期时排在末尾） */
export const sortKeyOf = (value: { date: string; start: string }): string =>
  value.date ? `${value.date} ${value.start || '00:00'}` : '9999-99-99 99:99'

// ── 透传字段提取（契约未定，best-effort） ──

/** 从原始条目里按候选键取非空字符串（用于 aprvStatusTypeId / formUserId 等透传字段） */
export const pickRawString = (raw: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = raw[key]
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return undefined
}

// ── 错误映射 ──

/** Rust 命令层业务失败 kind → i18n 文案 key */
export const RESERVE_ERROR_MESSAGE_KEYS: Record<string, string> = {
  chaoxing_not_logged_in: 'library.reserve.error.notLoggedIn',
  no_permission: 'library.reserve.error.noPermission',
  network_unreachable: 'library.reserve.error.network',
  slot_unavailable: 'library.reserve.error.slotUnavailable',
  reserve_limit_exceeded: 'library.reserve.error.limit',
  reserve_suspended: 'library.reserve.error.suspended',
  business_rejected: 'library.reserve.error.business',
  invalid_params: 'library.reserve.error.invalidParams',
  invalid_app: 'library.reserve.error.business',
  unexpected_response: 'library.reserve.error.unknown'
}

/** 归一化后的失败信息 */
export interface ReserveFailure {
  /** 机器可判别类型（未知为空串） */
  kind: string
  /** 已知 kind 的 i18n 文案 key（未知为空串） */
  messageKey: string
  /** 后端 / 运行时原始说明（可能为空） */
  detail: string
  /** 是否属网络 / 运行时不可用类失败 */
  network: boolean
}

/**
 * 解析 Tauri 命令错误。
 *
 * Rust 侧错误类型 `LibraryReserveError` 实现 `Serialize`，invoke 失败时前端拿到的
 * 即 `{ kind, message, canRelogin }` 结构体；非结构化异常（运行时不可用等）回落为通用失败。
 */
export const parseReserveFailure = (error: unknown): ReserveFailure => {
  const record = asRecord(error)
  const kind = typeof record.kind === 'string' ? record.kind : ''
  const detail =
    typeof record.message === 'string' && record.message.trim()
      ? record.message.trim()
      : error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : ''
  return {
    kind,
    messageKey: RESERVE_ERROR_MESSAGE_KEYS[kind] ?? '',
    detail,
    network: kind === 'network_unreachable'
  }
}

/** 去掉后端富文本里的 HTML 标签（`dialogContent` 为 HTML，按纯文本安全展示，避免 XSS） */
export const stripHtml = (raw: unknown): string =>
  String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
