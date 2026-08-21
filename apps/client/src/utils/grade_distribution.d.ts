/** grade_distribution.js 的类型声明（供 spec/业务 TS 引用）。 */

export interface GradeDistributionItem {
  id: number
  semester: string
  course_name: string
  teacher_name: string
  max_score: number | null
  min_score: number | null
  avg_score: number | null
  median_score: number | null
  sample_count: number
  score_segments: Record<string, number>
}

export interface GradeDistributionResult {
  total: number
  page: number
  page_size: number
  items: GradeDistributionItem[]
}

export function fetchGradeDistributionSemesters(): Promise<string[]>

export function fetchGradeDistribution(params?: {
  semester?: string | null
  course_name?: string | null
  teacher_name?: string | null
  page?: number
  page_size?: number
}): Promise<GradeDistributionResult>

/** 内部 helper（导出仅便于单测）；业务代码使用默认超时。 */
export function requestJson(
  url: string,
  options?: Record<string, unknown>,
  timeoutMs?: number
): Promise<Record<string, unknown>>
