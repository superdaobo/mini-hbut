/**
 * 课表考试叠加层数据：按学期拉取考试安排，并按当前浏览周过滤。
 *
 * 设计要点：
 * - **复用「考试安排」页的数据与缓存**：同一接口 `POST /v2/exams`、同一缓存 key
 *   `exams:{学号}:{学期}`，因此先看过考试页再进课表可秒开，离线也能渲染已有考试；
 * - **整学期只请求一次**：考试数量少（个位数到十几场），一次拉全学期，
 *   切周只在内存里按 `weekDates` 过滤，不再发请求；
 * - **失败不影响课表**：任何异常都静默降级为「本周无考试」，课表本身照常可用；
 * - **竞态丢弃**：切学生 / 切学期时用单调令牌 + 请求键双校验，旧慢响应不得回填。
 */
import { computed, ref, watch } from 'vue'
import axios from 'axios'

import { fetchWithCache } from '../../../utils/api.js'
import { normalizeScheduleExam, type ScheduleExam } from '../utils/examTypes'

export interface ScheduleExamDataOptions {
  props: any
  semester: any
}

export const useScheduleExamData = (options: ScheduleExamDataOptions) => {
  const { props, semester } = options
  const API_BASE = import.meta.env.VITE_API_BASE || '/api'

  /** 当前学期全部考试（camelCase 领域模型，已过滤非法记录） */
  const semesterExams = ref<ScheduleExam[]>([])
  const loadingExams = ref(false)

  /** 请求令牌：切学生 / 切学期时自增，响应回来时令牌已变则丢弃 */
  let requestToken = 0

  /** 当前浏览周的 ISO 日期（周一 → 周日），无法确定时为空数组 */
  const weekIsoDates = computed<string[]>(() => {
    const days = semester?.weekDates?.value
    if (!Array.isArray(days)) return []
    return days
      .map((day: any) => (typeof day?.iso === 'string' ? day.iso : ''))
      .filter((iso: string) => iso.length > 0)
  })

  /** 当前学期键（与考试页的 semester 参数同源） */
  const semesterKey = computed<string>(() =>
    String(semester?.semester?.value || semester?.semesterDraft?.value || '').trim()
  )

  /** 从响应中提取考试数组：兼容 `{ success, data: [] }` 与裸数组两种包装 */
  const extractExamList = (payload: any): any[] => {
    const body = payload?.data ?? payload
    return Array.isArray(body) ? body : []
  }

  /**
   * 加载当前学期考试。
   * forceRemote 与考试页保持一致：考试发布后进课表能立刻看到；
   * 网络异常时 fetchWithCache 会自动回退 stale 缓存（离线可用）。
   */
  const loadExams = async (): Promise<void> => {
    const token = requestToken + 1
    requestToken = token

    const studentId = String(props?.studentId || '').trim()
    const semesterValue = semesterKey.value
    if (!studentId) {
      semesterExams.value = []
      loadingExams.value = false
      return
    }

    loadingExams.value = true

    const requestKey = `${studentId}|${semesterValue}`
    const isCurrentRequest = () =>
      token === requestToken &&
      requestKey ===
        `${String(props?.studentId || '').trim()}|${semesterKey.value}`

    try {
      const cacheKey = `exams:${studentId}:${semesterValue || 'current'}`
      const result = await fetchWithCache(
        cacheKey,
        async () => {
          const response = await axios.post(`${API_BASE}/v2/exams`, {
            student_id: studentId,
            semester: semesterValue
          })
          return response.data
        },
        undefined,
        { forceRemote: true, priority: 'foreground' }
      )
      if (!isCurrentRequest()) return
      semesterExams.value = extractExamList(result?.data)
        .map((item: unknown) => normalizeScheduleExam(item))
        .filter((exam): exam is ScheduleExam => exam !== null)
    } catch {
      // 考试加载失败按「本学期无考试」处理，不阻断课表与其他功能
      if (!isCurrentRequest()) return
      semesterExams.value = []
    } finally {
      if (isCurrentRequest()) loadingExams.value = false
    }
  }

  /**
   * Grid 消费入口：某天（1..7，周一 = 1）的考试。
   * 只做日期比对，不重复解析时间——时间已在 normalizeScheduleExam 中归一。
   */
  const getExamsForDay = (dayIndex: number): ScheduleExam[] => {
    const index = Number(dayIndex) - 1
    if (!Number.isInteger(index) || index < 0 || index > 6) return []
    const iso = weekIsoDates.value[index]
    if (!iso) return []
    return semesterExams.value.filter((exam) => exam.date === iso)
  }

  /** 该天是否有考试（日期头红点用） */
  const hasExamOnDay = (dayIndex: number): boolean => getExamsForDay(dayIndex).length > 0

  // 学生或学期变化即重新加载；首次进入也会立即拉一次。
  // 注意：切周不在依赖里——整学期数据已在内存，按周过滤即可。
  watch(
    () => [String(props?.studentId || ''), semesterKey.value],
    () => {
      void loadExams()
    },
    { immediate: true }
  )

  return {
    semesterExams,
    loadingExams,
    weekIsoDates,
    getExamsForDay,
    hasExamOnDay,
    refreshExams: loadExams
  }
}

export type ScheduleExamData = ReturnType<typeof useScheduleExamData>
