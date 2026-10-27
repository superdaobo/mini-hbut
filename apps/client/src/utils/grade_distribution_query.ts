/**
 * 给分记录「按教师 / 按科目」双模式查询的纯函数层（issue #1111）。
 *
 * 设计要点：
 * - 组件层（GradeDistributionView.vue）只负责 UI 状态与请求编排，
 *   请求体的字段归属（teacher_name / course_name 二选一）统一收口到本模块，
 *   便于单测覆盖「只传当前模式字段、另一字段恒为 null」的契约；
 * - 不改动 grade_distribution.js 的 API 契约（fetchGradeDistribution 参数原样传入），
 *   不引入新的网络逻辑。
 */

/** 搜索模式：按教师查询（默认）/ 按科目查询 */
export type GradeSearchMode = 'teacher' | 'course'

const VALID_MODES: readonly GradeSearchMode[] = ['teacher', 'course']

/**
 * 归一化搜索模式：合法值原样返回；空 / 非法 / 损坏（含非字符串）一律回退 'teacher'。
 */
export function normalizeGradeSearchMode(value: unknown): GradeSearchMode {
  if (typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value)) {
    return value as GradeSearchMode
  }
  return 'teacher'
}

/**
 * 关键词是否构成有效查询：trim 后非空。
 * 空 / 纯空白 / 非字符串（null、undefined、数字等）一律视为无查询。
 */
export function isGradeSearchActive(keyword: unknown): boolean {
  if (keyword === null || keyword === undefined) return false
  return String(keyword).trim().length > 0
}

/** 双模式查询的请求体（字段归属由模式唯一决定）。 */
export interface GradeDistributionQuery {
  semester: null
  teacher_name: string | null
  course_name: string | null
  page: number
  page_size: number
}

/**
 * 按当前模式构造给分查询请求体：
 * - teacher 模式：只设置 teacher_name，course_name 恒为 null；
 * - course 模式：只设置 course_name，teacher_name 恒为 null；
 * - 关键词统一 trim；无效关键词（空 / 纯空白）两个字段都为 null（调用方应先判断，
 *   本函数保证即便误调也不会发出全库查询之外的脏字段）；
 * - page 收敛为正整数（0 / NaN / 负数 → 1）；page_size 固定透传。
 */
export function buildGradeDistributionQuery(
  mode: unknown,
  keyword: unknown,
  page: unknown,
  pageSize: number,
): GradeDistributionQuery {
  const normalizedMode = normalizeGradeSearchMode(mode)
  const active = isGradeSearchActive(keyword)
  const trimmed = active ? String(keyword).trim() : null
  const safePage = Math.floor(Number(page))
  return {
    semester: null,
    teacher_name: normalizedMode === 'teacher' ? trimmed : null,
    course_name: normalizedMode === 'course' ? trimmed : null,
    page: Number.isFinite(safePage) && safePage >= 1 ? safePage : 1,
    page_size: pageSize,
  }
}
