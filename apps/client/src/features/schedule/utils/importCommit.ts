/**
 * 课表领域 - AI 课表导入的持久化提交层（Epic #815 / #820 Phase-1）。
 *
 * 职责边界：
 *   - `buildPersistPayload`：纯函数，把预览态（ImportPreviewCourse[]）转换成写入 payload，
 *     只保留持久化字段，剥离全部 preview-only 状态（selected / duplicateKind / conflicts /
 *     diagnostics / key / sourceIndex / colorOverride）。
 *   - `commitImportCourses`：唯一带 I/O 的函数，逐条调用既有 custom/add 接口，
 *     单条失败不影响其他条目，返回 added / skipped / failed 汇总。
 *
 * 约束（对应 #815 设计原则）：
 *   - semester 只能来自调用方 ctx，绝不被 AI payload 覆盖；
 *   - 颜色缺失或非法不阻断导入，回退到 DEFAULT_COURSE_COLOR；
 *   - 复用既有 custom course 存储，不新增平行课程表。
 */
import axios from 'axios'
import { DEFAULT_COURSE_COLOR, normalizeHexColor } from '../../../utils/course_color'
import { normalizeWeeks } from './weeks'
import type {
  ImportCommitItemResult,
  ImportCommitResult,
  ImportDiagnostic,
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
}

/** custom/add 的最小响应结构：只取判定所需字段，避免 any */
interface CustomAddResponseData {
  success?: boolean
  error?: string
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

/**
 * 提交导入：只提交 selected && 无 hard error && 非 exact duplicate 的条目。
 * 逐条调用 custom/add，单条失败不影响其他条目。
 * 返回 added / skipped / failed 汇总与逐条结果。
 */
export async function commitImportCourses(
  preview: ImportPreviewCourse[],
  ctx: ImportCommitContext
): Promise<ImportCommitResult> {
  // 先一次性构建 payload（纯函数，按 preview 下标对齐），保证与筛选结果一致
  const payloads = buildPersistPayload(preview, ctx.semester)

  const items: ImportCommitItemResult[] = []
  let added = 0
  let skipped = 0
  let failed = 0

  for (let index = 0; index < preview.length; index += 1) {
    const item = preview[index]
    const payload = payloads[index]
    // 可回溯到原 preview 的定位信息
    const locator = { key: item.key, sourceIndex: item.course.sourceIndex }

    // 被跳过的条目：记录 skipped，不发起请求
    if (!shouldCommit(item)) {
      skipped += 1
      items.push({ ...locator, status: 'skipped' })
      continue
    }

    try {
      // 与 useScheduleIO.importCustomCoursesFromText 的 add 调用方式保持一致
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
        added += 1
        items.push({ ...locator, status: 'added' })
      } else {
        failed += 1
        items.push({ ...locator, status: 'failed', error: res.data?.error || '新增失败' })
      }
    } catch (error) {
      // 网络/适配器异常同样收敛为该条 failed，绝不中断整批
      failed += 1
      items.push({ ...locator, status: 'failed', error: extractErrorMessage(error) })
    }
  }

  return {
    ok: failed === 0,
    added,
    skipped,
    failed,
    items
  }
}
