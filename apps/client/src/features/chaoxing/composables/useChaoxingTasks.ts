// 学习通「作业 / 考试」只查不做清单（P4-B，#1343）
//
// 硬边界：这里只取「有哪些、什么时候截止/开考」，**不提供任何作答/提交/交卷入口**。
// 唯一动作是「打开学习通官方页」（应用内 WebView，已自动登录）。
//
// 数据来源：后端把 34 门课的 stat2 待办聚合后一次返回（60 秒内存缓存）。
// 作业与考试共用同一份聚合，因此这里先拉作业、再拉考试（第二次基本命中缓存）。
import { ref } from 'vue'
import type { ChaoxingHubCore } from './useChaoxingHubCore'

/** 一条待办（作业或考试） */
export interface ChaoxingTaskItem {
  id: string
  name: string
  course: string
  course_id: string
  clazz_id: string
  cpi: string
  semester: string
  /** work / exam */
  event_type: string
  deadline_ms: number | null
  deadline_text: string
  question_num: number | null
  avg_finish_rate: number | null
  /** 官方页直达链接（带 enc 票据，可能过期 → 点击时用 resolve 命令现取） */
  url: string
  finished: boolean
}

/** 清单统计 */
export interface ChaoxingTaskStats {
  pending_work: number
  pending_exam: number
  overdue: number
  due_within_3d: number
  finished_work: number
}

export interface ChaoxingTaskNearest {
  name: string
  course: string
  deadline_text: string
}

const emptyStats = (): ChaoxingTaskStats => ({
  pending_work: 0,
  pending_exam: 0,
  overdue: 0,
  due_within_3d: 0,
  finished_work: 0
})

export interface ChaoxingTasksApi {
  works: ReturnType<typeof ref<ChaoxingTaskItem[]>>
  exams: ReturnType<typeof ref<ChaoxingTaskItem[]>>
  workStats: ReturnType<typeof ref<ChaoxingTaskStats>>
  examStats: ReturnType<typeof ref<ChaoxingTaskStats>>
  nearestWork: ReturnType<typeof ref<ChaoxingTaskNearest | null>>
  nearestExam: ReturnType<typeof ref<ChaoxingTaskNearest | null>>
  tasksLoading: ReturnType<typeof ref<boolean>>
  tasksError: ReturnType<typeof ref<string>>
  tasksLoaded: ReturnType<typeof ref<boolean>>
  loadTasks: (options?: { force?: boolean }) => Promise<void>
  openWorkList: () => void
  openExamList: () => void
  resolveTaskUrl: (item: ChaoxingTaskItem) => Promise<string>
}

export const useChaoxingTasks = (core: ChaoxingHubCore): ChaoxingTasksApi => {
  const works = ref<ChaoxingTaskItem[]>([])
  const exams = ref<ChaoxingTaskItem[]>([])
  const workStats = ref<ChaoxingTaskStats>(emptyStats())
  const examStats = ref<ChaoxingTaskStats>(emptyStats())
  const nearestWork = ref<ChaoxingTaskNearest | null>(null)
  const nearestExam = ref<ChaoxingTaskNearest | null>(null)
  const tasksLoading = ref(false)
  const tasksError = ref('')
  const tasksLoaded = ref(false)

  /** 拉取聚合清单（作业 + 考试；第二次命中后端 60s 缓存） */
  const loadTasks = async ({ force = false } = {}) => {
    if (tasksLoading.value) return
    tasksLoading.value = true
    tasksError.value = ''
    try {
      const workRes = await core.cxInvoke('chaoxing_fetch_works_all_courses', { force })
      if (workRes?.success === false) throw new Error(workRes?.error || '作业清单加载失败')
      works.value = Array.isArray(workRes?.items) ? (workRes.items as ChaoxingTaskItem[]) : []
      workStats.value = { ...emptyStats(), ...((workRes?.stats as ChaoxingTaskStats) || {}) }
      nearestWork.value = (workRes?.nearest as ChaoxingTaskNearest) || null

      const examRes = await core.cxInvoke('chaoxing_fetch_exams_all_courses', { force })
      if (examRes?.success === false) throw new Error(examRes?.error || '考试清单加载失败')
      exams.value = Array.isArray(examRes?.items) ? (examRes.items as ChaoxingTaskItem[]) : []
      examStats.value = { ...emptyStats(), ...((examRes?.stats as ChaoxingTaskStats) || {}) }
      nearestExam.value = (examRes?.nearest as ChaoxingTaskNearest) || null

      tasksLoaded.value = true
    } catch (e) {
      tasksError.value = String((e as Error)?.message || e || '清单加载失败')
    } finally {
      tasksLoading.value = false
    }
  }

  const openWorkList = () => {
    core.push({ level: 'workList' })
    if (!tasksLoaded.value) void loadTasks()
  }

  const openExamList = () => {
    core.push({ level: 'examList' })
    if (!tasksLoaded.value) void loadTasks()
  }

  /**
   * 点击「打开学习通」时**实时**取直达链接。
   *
   * `enc` 是短时票据，聚合列表里的 URL 可能已过期；这里只对**单门课**重新拉一次待办，
   * 失败就回落到课程列表首页（不阻塞打开）。
   */
  const resolveTaskUrl = async (item: ChaoxingTaskItem): Promise<string> => {
    try {
      const res = await core.cxInvoke('chaoxing_resolve_task_url', {
        courseId: item.course_id,
        clazzId: item.clazz_id,
        cpi: item.cpi || '',
        name: item.course || '',
        semester: item.semester || '',
        taskId: item.id,
        eventType: item.event_type
      })
      if (res?.success && typeof res.url === 'string' && res.url) return res.url
    } catch {
      // 静默：回落到课程列表
    }
    return item.url || ''
  }

  return {
    works,
    exams,
    workStats,
    examStats,
    nearestWork,
    nearestExam,
    tasksLoading,
    tasksError,
    tasksLoaded,
    loadTasks,
    openWorkList,
    openExamList,
    resolveTaskUrl
  }
}
