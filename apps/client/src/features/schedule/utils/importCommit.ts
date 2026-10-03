/**
 * 课表领域 - AI 课表导入的持久化提交层（Epic #815 / #820）。
 *
 * 职责边界：
 *   - `buildPersistPayload`：纯函数，把预览态（ImportPreviewCourse[]）转换成写入 payload，
 *     只保留持久化字段，剥离全部 preview-only 状态（selected / duplicateKind / conflicts /
 *     diagnostics / key / sourceIndex / colorOverride）。
 *   - `validateBatchBeforeCommit`：导入前全量复用校验（#820），前置于任何写入：
 *     字段级硬校验（semester/name/weekday/period/djs/weeks/color）+ 与既有
 *     official/custom 课表的 exact duplicate 复检。
 *   - `commitImportCourses`：唯一带 I/O 的函数，受控并发（受限并发 + 单条失败
 *     不中断）逐条写入既有 custom/add 链路，返回 added / skipped / failed 汇总。
 *   - `summarizeCommitItems`：把逐条结果收敛成汇总（重试合并后复用）。
 *
 * 事务语义（#820）：
 *   - 校验阶段 atomic：任一待提交条目硬校验失败 → 整批不写入（不发任何请求）；
 *   - 写入阶段 controlled partial commit：服务端 batch/事务端点不在本仓
 *     （ocr-service 仓，跨仓待办：/v2/schedule/custom/batch-import 原子批量导入），
 *     客户端以受限并发逐条提交 + 逐条结果收集兜底，保证每条失败可定位、可重试，
 *     绝不静默半成功。
 *
 * 约束（对应 #815 设计原则）：
 *   - semester 只能来自调用方 ctx，绝不被 AI payload 覆盖；
 *   - 颜色缺失或非法不阻断导入，回退到 DEFAULT_COURSE_COLOR；
 *   - 复用既有 custom course 存储，不新增平行课程表。
 */
import axios from 'axios'
import { DEFAULT_COURSE_COLOR, normalizeHexColor } from '../../../utils/course_color'
import { normalizeWeeks } from './weeks'
import { detectImportDuplicates } from './importMerge'
import {
  IMPORT_PERIOD_MAX,
  IMPORT_PERIOD_MIN,
  IMPORT_WEEKDAY_MAX,
  IMPORT_WEEKDAY_MIN,
  IMPORT_WEEKS_MAX,
  IMPORT_WEEKS_MIN
} from './importTypes'
import type {
  ImportCommitItemResult,
  ImportCommitResult,
  ImportDiagnostic,
  ImportExistingCourse,
  ImportPersistPayload,
  ImportPreviewCourse
} from './importTypes'

/** 提交上下文：由 UI 层提供，AI 无法覆盖 */
export interface ImportCommitContext {
  /** 例如 import.meta.env.VITE_API_BASE || '/api' */
  apiBase: string
  /** 当前登录学号 */
  studentId: string
  /** 目标学期，由 UI 决定，绝不接受 AI payload 覆盖 */
  semester: string
  /**
   * 既有课程（official + custom，#820）：提供时在写入前做 exact duplicate 复检，
   * 防止「导入成功后重复点击/重试」造成重复写入。时间冲突不拦截（warning 语义）。
   */
  existingCourses?: ImportExistingCourse[]
}

/** 提交选项 */
export interface ImportCommitOptions {
  /**
   * 只提交这些 key 对应的条目（#820 重试失败项场景）。
   * 缺省提交全部符合筛选规则的条目。
   */
  onlyKeys?: readonly string[]
}

/** custom/add 的最小响应结构：只取判定所需字段，避免 any */
interface CustomAddResponseData {
  success?: boolean
  error?: string
}

/** 写入阶段受限并发：平衡总耗时与对后端/网络的冲击（#820 受控写入） */
const WRITE_CONCURRENCY = 3

/**
 * 校验阶段单条错误：field/code 可定位到具体字段，index/key/sourceIndex
 * 可回溯到原 preview 条目（#820 验收：任一失败都能定位到原 preview 条目）。
 */
export interface ImportBatchValidationError {
  index: number
  key: string
  sourceIndex: number
  field: string
  code: string
  message: string
}

/**
 * 解析单条课程最终写入颜色。
 * 三级回退：colorOverride > course.requestedColor > DEFAULT_COURSE_COLOR。
 * 任一来源非法（normalizeHexColor 返回 null）都视为「未提供」，继续向后回退。
 */
function resolvePersistColor(item: ImportPreviewCourse): string {
  const override = normalizeHexColor(item.colorOverride)
  if (override) return override
  const requested = normalizeHexColor(item.course.requestedColor)
  if (requested) return requested
  return DEFAULT_COURSE_COLOR
}

/**
 * 纯函数：把预览态转换成写入 payload。
 * 只保留持久化字段；必须剥离 selected / duplicateKind / conflicts / diagnostics /
 * key / sourceIndex / colorOverride 等 preview-only 字段。
 *
 * ⚠️ 本函数是**按 preview 下标 1:1 对齐的映射**，不做任何筛选：
 * 输出长度恒等于输入长度，`output[i]` 对应 `input[i]`。
 * 是否提交某条由 `commitImportCourses` 的 `shouldCommit()` 判定
 * （selected / 非 exact duplicate / 无 hard error）。
 * 切勿在此处加入过滤，否则会破坏调用方的下标对齐。
 */
export function buildPersistPayload(
  preview: ImportPreviewCourse[],
  semester: string
): ImportPersistPayload[] {
  return preview.map((item) => {
    const course = item.course
    // 显式逐字段构造新对象：从结构上杜绝 preview-only 字段泄漏进 payload
    return {
      semester,
      name: course.name,
      teacher: course.teacher,
      room: course.room,
      weekday: course.weekday,
      period: course.period,
      djs: course.djs,
      weeks: normalizeWeeks(course.weeks),
      color: resolvePersistColor(item)
    }
  })
}

/** 判断某条目是否含 hard error 诊断（阻断该条导入） */
function hasHardError(item: ImportPreviewCourse): boolean {
  const all: ImportDiagnostic[] = [...item.diagnostics, ...item.course.diagnostics]
  return all.some((d) => d.level === 'error')
}

/**
 * 提交筛选规则：仅当以下条件全部满足时才提交。
 *   - selected === true
 *   - duplicateKind !== 'exact'
 *   - 无 level === 'error' 的诊断
 */
function shouldCommit(item: ImportPreviewCourse): boolean {
  if (item.selected !== true) return false
  if (item.duplicateKind === 'exact') return false
  return !hasHardError(item)
}

/** 从异常中提取可读错误信息（不引入 any） */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return '提交失败'
}

/** 单条 payload 的整数范围校验（语义与后端 custom/add 校验保持一致） */
function validatePersistPayload(
  payload: ImportPersistPayload,
  locator: { index: number; key: string; sourceIndex: number }
): ImportBatchValidationError | null {
  const fail = (field: string, code: string, message: string): ImportBatchValidationError => ({
    ...locator,
    field,
    code,
    message
  })

  if (!payload.semester.trim()) return fail('semester', 'invalid_semester', '缺少目标学期')
  if (!payload.name.trim()) return fail('name', 'missing_name', '缺少课程名称')

  if (
    !Number.isInteger(payload.weekday) ||
    payload.weekday < IMPORT_WEEKDAY_MIN ||
    payload.weekday > IMPORT_WEEKDAY_MAX
  ) {
    return fail('weekday', 'invalid_weekday', `星期超出范围（应为 ${IMPORT_WEEKDAY_MIN}..${IMPORT_WEEKDAY_MAX}）`)
  }

  if (
    !Number.isInteger(payload.period) ||
    payload.period < IMPORT_PERIOD_MIN ||
    payload.period > IMPORT_PERIOD_MAX
  ) {
    return fail('period', 'invalid_period', `起始节次超出范围（应为 ${IMPORT_PERIOD_MIN}..${IMPORT_PERIOD_MAX}）`)
  }

  if (!Number.isInteger(payload.djs) || payload.djs < 1) {
    return fail('djs', 'invalid_djs', '节次跨度必须为正整数')
  }
  if (payload.period + payload.djs - 1 > IMPORT_PERIOD_MAX) {
    return fail('djs', 'invalid_djs', `末节超出范围（不超过 ${IMPORT_PERIOD_MAX} 节）`)
  }

  const weeks = payload.weeks
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return fail('weeks', 'invalid_weeks', '周次为空')
  }
  for (const week of weeks) {
    if (!Number.isInteger(week) || week < IMPORT_WEEKS_MIN || week > IMPORT_WEEKS_MAX) {
      return fail('weeks', 'invalid_weeks', `周次超出范围（应为 ${IMPORT_WEEKS_MIN}..${IMPORT_WEEKS_MAX}）`)
    }
  }

  // color 允许为空串（现有 custom course 业务语义：无色 = 跟随默认显示，
  // DEFAULT_COURSE_COLOR 即空串）；非空时必须满足 #RRGGBB 持久化格式。
  if (payload.color && !/^#[0-9a-fA-F]{6}$/.test(payload.color)) {
    return fail('color', 'invalid_color', '颜色格式非法（应为 #RRGGBB）')
  }

  return null
}

/** 计算条目在 batch 内与既有课程的 exact duplicate（#820 复检） */
function isExactDuplicateOfExisting(
  item: ImportPreviewCourse,
  existing: ImportExistingCourse[]
): boolean {
  if (!existing.length) return false
  const kinds = detectImportDuplicates([item.course], existing)
  return kinds[0] === 'exact'
}

/**
 * 提交导入（#820 生产级批量写入编排）：
 *
 * 1. 只提交 selected && 无 hard error && 非 exact duplicate 的条目
 *    （`onlyKeys` 提供时进一步限定为重试集）；
 * 2. 与既有课表做 exact duplicate 复检（防重复点击/重试造成重复写入）；
 * 3. 全量硬校验前置于任何写入：任一待提交条目校验失败 → 整批拦截（零请求）；
 * 4. 写入阶段受控并发（WRITE_CONCURRENCY）+ 单条失败不中断、逐条结果收集；
 * 5. 返回 added / skipped / failed 汇总，items 恒按 preview 下标排列、可回溯。
 */
export async function commitImportCourses(
  preview: ImportPreviewCourse[],
  ctx: ImportCommitContext,
  options: ImportCommitOptions = {}
): Promise<ImportCommitResult> {
  // 先一次性构建 payload（纯函数，按 preview 下标对齐），保证与筛选结果一致
  const payloads = buildPersistPayload(preview, ctx.semester)
  const onlyKeys = options.onlyKeys ? new Set(options.onlyKeys) : null

  // items 按 preview 下标对齐：skipped 条目即时填入；待提交条目先占位（null），
  // 校验拦截 / 写入完成后按 slot 回填，保证 items[i] 恒对应 preview[i]
  // （#820 验收：任一失败都能定位到原 preview 条目）。
  const items: Array<ImportCommitItemResult | null> = []
  const pending: Array<{
    /** 在 items 中的槽位，写入完成后按此回填 */
    slot: number
    index: number
    item: ImportPreviewCourse
    payload: ImportPersistPayload
    /** 可回溯到原 preview 条目的定位信息（index 已单独存于上方字段） */
    locator: { key: string; sourceIndex: number }
  }> = []

  let skipped = 0

  // 第一遍：筛选 + exact duplicate 复检，产出待提交清单
  for (let index = 0; index < preview.length; index += 1) {
    const item = preview[index]
    const payload = payloads[index]
    // 可回溯到原 preview 的定位信息
    const locator = { key: item.key, sourceIndex: item.course.sourceIndex }

    const baseSkip = (): boolean => {
      if (!shouldCommit(item)) return true
      if (onlyKeys && !onlyKeys.has(item.key)) return true
      return false
    }

    if (baseSkip()) {
      skipped += 1
      items.push({ ...locator, status: 'skipped' })
      continue
    }

    // 与既有 official/custom 课表复检：导入成功后重复点击/重试不再重复写入
    if (ctx.existingCourses && isExactDuplicateOfExisting(item, ctx.existingCourses)) {
      skipped += 1
      items.push({ ...locator, status: 'skipped' })
      continue
    }

    items.push(null)
    pending.push({ slot: items.length - 1, index, item, payload, locator })
  }

  // 第二遍：全量硬校验，前置于任何写入（校验阶段 atomic）
  const validationErrors: ImportBatchValidationError[] = []
  for (const entry of pending) {
    const error = validatePersistPayload(entry.payload, {
      index: entry.index,
      key: entry.item.key,
      sourceIndex: entry.item.course.sourceIndex
    })
    if (error) validationErrors.push(error)
  }

  if (validationErrors.length > 0) {
    // 整批拦截：一条都不写库，全部待提交条目收敛为 failed（含字段级原因）
    for (const entry of pending) {
      const error =
        validationErrors.find(
          (e) => e.index === entry.index
        ) || null
      items[entry.slot] = {
        ...entry.locator,
        status: 'failed',
        error: error
          ? `${error.message}（字段：${error.field}）`
          : '同批其他条目校验失败，本条未提交'
      }
    }
    // blocked='validation'：UI 据此识别「零写入」的拦截态，留在预览阶段
    return {
      ok: false,
      added: 0,
      skipped,
      failed: pending.length,
      items: items as ImportCommitItemResult[],
      blocked: 'validation'
    }
  }

  // 第三遍：受控并发写入，单条失败不中断
  const results: ImportCommitItemResult[] = new Array(pending.length)
  let cursor = 0
  const workerCount = Math.min(WRITE_CONCURRENCY, pending.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < pending.length) {
      const slot = cursor
      cursor += 1
      const entry = pending[slot]
      results[slot] = await commitOne(entry.payload, entry.locator, ctx)
    }
  })
  await Promise.all(workers)

  let added = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'added') added += 1
    else failed += 1
  }

  // 按槽位回填：写入结果与 pending 的 preview 下标一一对应
  for (let i = 0; i < pending.length; i += 1) {
    items[pending[i].slot] = results[i]
  }

  return {
    ok: failed === 0,
    added,
    skipped,
    failed,
    items: items as ImportCommitItemResult[]
  }
}

/** 单条写入：调用既有 custom/add 链路（与 useScheduleIO 的 add 调用方式保持一致） */
async function commitOne(
  payload: ImportPersistPayload,
  locator: { key: string; sourceIndex: number },
  ctx: ImportCommitContext
): Promise<ImportCommitItemResult> {
  try {
    const res = await axios.post<CustomAddResponseData>(
      `${ctx.apiBase}/v2/schedule/custom/add`,
      {
        student_id: ctx.studentId,
        semester: payload.semester,
        name: payload.name,
        teacher: payload.teacher,
        room: payload.room,
        weekday: payload.weekday,
        period: payload.period,
        djs: payload.djs,
        weeks: payload.weeks,
        color: payload.color
      }
    )

    if (res.data?.success) {
      return { ...locator, status: 'added' }
    }
    return { ...locator, status: 'failed', error: res.data?.error || '新增失败' }
  } catch (error) {
    // 网络/适配器异常同样收敛为该条 failed，绝不中断整批
    return { ...locator, status: 'failed', error: extractErrorMessage(error) }
  }
}

/**
 * 把逐条结果收敛成汇总（#820）：重试合并后复用。
 * items 为最终态的逐条结果，本函数只负责重新统计。
 */
export function summarizeCommitItems(items: ImportCommitItemResult[]): ImportCommitResult {
  let added = 0
  let skipped = 0
  let failed = 0
  for (const item of items) {
    if (item.status === 'added') added += 1
    else if (item.status === 'skipped') skipped += 1
    else failed += 1
  }
  return { ok: failed === 0, added, skipped, failed, items }
}
