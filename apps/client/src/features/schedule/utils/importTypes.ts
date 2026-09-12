/**
 * 课表领域 - AI 课表导入（AI Course Import v1）领域类型与契约。
 *
 * 本文件是 Epic #815 的**冻结契约**（W0 产出）：
 *   - 协议版本与字段名固定，供 Parser / Merge / Color / UI / Persistence 共同消费；
 *   - 所有类型均为纯类型定义，不引入运行时依赖，不依赖 Vue / 网络 / Tauri / DB；
 *   - preview 态（selected / duplicateKind / conflicts 等）与最终持久化 payload **严格分离**，
 *     避免 UI 诊断字段被写入数据库。
 *
 * 设计原则（对应 #815）：
 *   - 标准输出严格，实际解析宽容；
 *   - AI 不得控制 semester / id / source_id；
 *   - conflict 是 warning，不是 hard block；
 *   - color 缺失或非法不阻断导入。
 *
 * 颜色单一来源：`apps/client/src/utils/course_color.ts` 的 COURSE_COLOR_PRESETS，
 * 本模块**不**维护第二份色板常量。
 */

/** 协议标识与版本：AI 输出顶层必须携带 */
export const AI_COURSE_IMPORT_FORMAT = 'mini-hbut-course-import'
export const AI_COURSE_IMPORT_VERSION = 1

/** 课表允许范围（与后端校验语义保持一致） */
export const IMPORT_WEEKDAY_MIN = 1
export const IMPORT_WEEKDAY_MAX = 7
/** 节次：起始节与跨度上限，遵循现有课表 1..11 节约束 */
export const IMPORT_PERIOD_MIN = 1
export const IMPORT_PERIOD_MAX = 11
/** 周次范围：沿用现有后端允许范围 1..60 */
export const IMPORT_WEEKS_MIN = 1
export const IMPORT_WEEKS_MAX = 60

/** 诊断等级：error 阻断单条导入；warning / info 不阻断 */
export type ImportDiagnosticLevel = 'error' | 'warning' | 'info'

/**
 * 结构化诊断项。
 * `field` 指向原始字段名（如 'weeks'），`sourceIndex` 指向原始数组下标，
 * 保证 UI 能把问题定位回用户可见的具体条目。
 */
export interface ImportDiagnostic {
  level: ImportDiagnosticLevel
  /** 稳定的机器可读编码，用于 i18n 取词，不直接展示 */
  code: string
  /** 兜底的人类可读说明（正常情况下由 i18n 根据 code 生成） */
  message: string
  /** 相关字段名，可选 */
  field?: string
  /** 原始输入数组下标，可选 */
  sourceIndex?: number
}

/**
 * 外部 AI 输出的原始单条课程：全部字段为 unknown，必须经过 Parser 校验后才能信任。
 * 兼容 canonical 字段（periods）与既有内部字段（period / djs）。
 */
export interface AiCourseImportRaw {
  name?: unknown
  teacher?: unknown
  room?: unknown
  weekday?: unknown
  periods?: unknown
  period?: unknown
  djs?: unknown
  weeks?: unknown
  color?: unknown
  [key: string]: unknown
}

/**
 * Parser 产出的标准化课程草稿。
 * 这是 Parser / Merge / Color / Persistence 之间的**唯一数据契约**。
 *
 * 注意：`requestedColor` 只是 AI 的原始候选值，尚未经过色板校验；
 * 真正的颜色决策由 importColors 负责，用户 override 状态另行维护。
 */
export interface ParsedImportCourse {
  name: string
  teacher: string
  room: string
  /** 1..7 */
  weekday: number
  /** 起始节次 */
  period: number
  /** 节次跨度（节数） */
  djs: number
  /** 已排序去重的周次 */
  weeks: number[]
  /** AI 候选颜色（未校验，可能为 undefined） */
  requestedColor?: string
  /** 原始输入数组下标，用于回溯 */
  sourceIndex: number
  /** 本条目相关的 warning / info（不含 error） */
  diagnostics: ImportDiagnostic[]
}

/** Parser 整体结果：ok=false 表示没有可导入条目 */
export interface ParseImportResult {
  ok: boolean
  /** 成功解析并通过 hard error 校验的课程草稿 */
  courses: ParsedImportCourse[]
  /** 全局级诊断（无法定位到单条，如 JSON 无法解析、多个 JSON 主体） */
  diagnostics: ImportDiagnostic[]
  /** 原始条目数（含解析失败项） */
  rawCount: number
}

/**
 * 既有课程（教务 official / 自定义 custom）的最小视图。
 * 用于重复检测与冲突分析；只取判定所需字段，避免耦合完整 Course 结构。
 */
export interface ImportExistingCourse {
  id?: string
  name?: string
  teacher?: string
  room?: string
  weekday?: number
  period?: number
  djs?: number
  weeks?: number[]
  /** 来源：official = 教务课表；custom = 自定义课程 */
  source?: 'official' | 'custom'
}

/** 重复类型：none 正常；exact 默认不勾选；possible 仅提示 */
export type ImportDuplicateKind = 'none' | 'exact' | 'possible'

/** 冲突来源 */
export type ImportConflictSource = 'import' | 'official' | 'custom'

/**
 * 时间冲突：same weekday + 节次范围重叠 + weeks 交集非空。
 * 语义与后端 build_custom_schedule_conflicts 保持一致。
 */
export interface ImportConflict {
  /** 冲突对端课程 id（existing 课程可能有；batch 内部项可为空） */
  withCourseId?: string
  /** 冲突对端课程名，用于展示 */
  withCourseName: string
  /** 重叠周次（升序） */
  overlapWeeks: number[]
  /** 重叠节次起 */
  overlapPeriodStart: number
  /** 重叠节次止 */
  overlapPeriodEnd: number
  source: ImportConflictSource
}

/**
 * 预览态课程：UI 唯一消费的展示模型。
 * `selected` / `duplicateKind` / `conflicts` 均为 UI 状态，**不得**写入数据库。
 */
export interface ImportPreviewCourse {
  /** 稳定的预览条目 id（由 sourceIndex 派生，便于 UI key 与回溯） */
  key: string
  course: ParsedImportCourse
  /** 是否勾选导入 */
  selected: boolean
  duplicateKind: ImportDuplicateKind
  conflicts: ImportConflict[]
  /** 展示用诊断（warning / info） */
  diagnostics: ImportDiagnostic[]
  /** 用户颜色覆盖（hex 小写）；undefined 表示未覆盖 */
  colorOverride?: string
}

/** 单条提交结果 */
export type ImportCommitStatus = 'added' | 'skipped' | 'failed'

export interface ImportCommitItemResult {
  /** 对应 ImportPreviewCourse.key */
  key: string
  /** 对应原始输入下标 */
  sourceIndex: number
  status: ImportCommitStatus
  /** 失败原因，可选 */
  error?: string
}

/** 批量提交汇总 */
export interface ImportCommitResult {
  ok: boolean
  added: number
  skipped: number
  failed: number
  items: ImportCommitItemResult[]
}

/** 写入 payload：只包含持久化所需字段，不含任何 preview-only 状态 */
export interface ImportPersistPayload {
  semester: string
  name: string
  teacher: string
  room: string
  weekday: number
  period: number
  djs: number
  weeks: number[]
  color: string
}
