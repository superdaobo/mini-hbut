// src/features/teacher/composables/useTeacherExams.ts
//
// Teacher Portal V2（E6 #1026）：教师「考试与监考」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherExams(semester)`，把 `TeacherLoadState` 映射为视图状态；
//   2. 双标签数据：监考安排（`invigilations`）/ 教学班考试（`exams`）；
//   3. 展示前清洗可能含 HTML 的教务字段（复用 normalizeTeacherData 的单一清洗入口）；
//   4. 把监考数据规范化为**教师作用域**本地提醒事件（见 teacherExamReminders.ts），
//      与学生考试提醒**完全隔离**；
//   5. 以 `teacher_scope.ts` 的作用域键隔离「不同教师账号 / 不同学期」，
//      并对过期响应做丢弃，**绝不串号**。
//
// 只读：本文件不发起任何写型请求；不写回教务。

import { computed, ref } from 'vue'

import { fetchTeacherExams } from '../api/teacherApi'
import type {
  Invigilation,
  TeacherDataErrorKind,
  TeacherExam,
  TeacherExamData,
  TeacherLoadState
} from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  normalizeDate,
  normalizeSemester,
  stripTeacherHtml
} from '../utils/normalizeTeacherData'
import { buildTeacherScopedKey, normalizeScopeAccountId } from '../utils/teacher_scope'
import {
  buildTeacherInvigilationReminderEvents,
  type TeacherInvigilationReminderEvent
} from '../utils/teacherExamReminders'

/** 时间轴筛选：全部 / 未开始 / 已结束。 */
export type TeacherExamFilter = 'all' | 'upcoming' | 'past'

/** 错误 kind → i18n key（视图按 key 取词，**不直接展示 error.message**）。 */
export const teacherExamsErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 清洗监考记录中可能含 HTML 的文本字段。 */
export const sanitizeInvigilation = (item: Invigilation): Invigilation => {
  const cleaned: Invigilation = {
    ...item,
    kcmc: stripTeacherHtml(item.kcmc)
  }
  if (item.jsmc !== undefined) cleaned.jsmc = stripTeacherHtml(item.jsmc)
  if (item.zjk !== undefined) cleaned.zjk = stripTeacherHtml(item.zjk)
  if (item.xqmc !== undefined) cleaned.xqmc = stripTeacherHtml(item.xqmc)
  if (item.kscc !== undefined) cleaned.kscc = stripTeacherHtml(item.kscc)
  if (item.kspcmc !== undefined) cleaned.kspcmc = stripTeacherHtml(item.kspcmc)
  if (item.ksfs !== undefined) cleaned.ksfs = stripTeacherHtml(item.ksfs)
  if (item.jkjsxm !== undefined) cleaned.jkjsxm = stripTeacherHtml(item.jkjsxm)
  if (item.kkyx !== undefined) cleaned.kkyx = stripTeacherHtml(item.kkyx)
  if (item.ksbj !== undefined) cleaned.ksbj = stripTeacherHtml(item.ksbj)
  return cleaned
}

/** 清洗任课班考试记录中可能含 HTML 的文本字段。 */
export const sanitizeTeacherExam = (exam: TeacherExam): TeacherExam => {
  const cleaned: TeacherExam = {
    ...exam,
    kcmc: stripTeacherHtml(exam.kcmc)
  }
  if (exam.jsmc !== undefined) cleaned.jsmc = stripTeacherHtml(exam.jsmc)
  if (exam.jkjs !== undefined) cleaned.jkjs = stripTeacherHtml(exam.jkjs)
  if (exam.jxbmc !== undefined) cleaned.jxbmc = stripTeacherHtml(exam.jxbmc)
  if (exam.bjmc !== undefined) cleaned.bjmc = stripTeacherHtml(exam.bjmc)
  if (exam.jsname !== undefined) cleaned.jsname = stripTeacherHtml(exam.jsname)
  if (exam.kkyx !== undefined) cleaned.kkyx = stripTeacherHtml(exam.kkyx)
  if (exam.kspcmc !== undefined) cleaned.kspcmc = stripTeacherHtml(exam.kspcmc)
  return cleaned
}

/** 取当天 00:00 的本地时间戳（用于「已结束」判定，避免时区偏移）。 */
const startOfToday = (today: Date): number =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

/** 日期是否已过去（无有效日期视为未过去）。 */
export const isExamPast = (dateKey: string, today: Date = new Date()): boolean => {
  const normalized = normalizeDate(dateKey)
  if (!normalized) return false
  const [year, month, day] = normalized.split('-').map((part) => Number(part))
  const date = new Date(year, month - 1, day).getTime()
  return date < startOfToday(today)
}

/** 按筛选条件过滤（保持原顺序）。 */
export const filterByTimeline = <T>(
  items: readonly T[],
  filter: TeacherExamFilter,
  dateOf: (item: T) => string,
  today: Date = new Date()
): T[] => {
  if (filter === 'all') return items.slice()
  return items.filter((item) => {
    const past = isExamPast(dateOf(item), today)
    return filter === 'past' ? past : !past
  })
}

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const EXAMS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidExamsSemester = (value: string): boolean =>
  EXAMS_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialExamsSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidExamsSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidExamsSemester(stored)) return stored
  return deriveSemesterByDate()
}

export interface UseTeacherExamsOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherExams = (options: UseTeacherExamsOptions = {}) => {
  const semester = ref(resolveInitialExamsSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherExamData>>({
    status: 'idle',
    data: null,
    error: null
  })

  /** 请求序号：仅最新一次请求的结果可落地（丢弃切换学期/账号后的过期响应）。 */
  const requestSeq = ref(0)
  /** 作用域内存缓存：键为 `teacher:{accountId}:{semester}:exams`，跨账号/学期永不命中。 */
  const memoryCache = new Map<string, TeacherExamData>()

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('exams', accountId.value, semester.value)
  )

  const invigilations = computed<Invigilation[]>(() =>
    (state.value.data?.invigilations ?? []).map(sanitizeInvigilation)
  )
  const exams = computed<TeacherExam[]>(() =>
    (state.value.data?.exams ?? []).map(sanitizeTeacherExam)
  )

  /** 监考 → 教师作用域本地提醒事件（去重、按触发时刻升序）。 */
  const reminderEvents = computed<TeacherInvigilationReminderEvent[]>(() =>
    buildTeacherInvigilationReminderEvents({
      accountId: accountId.value,
      semester: semester.value,
      invigilations: invigilations.value
    })
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherExamsErrorKey(state.value.error.kind) : ''
  )

  /** 拉取当前学期数据；`force` 为 true 时跳过内存缓存。 */
  const load = async (opts: { force?: boolean } = {}): Promise<void> => {
    const scope = scopeKey.value
    if (!opts.force) {
      const cached = memoryCache.get(scope)
      if (cached) {
        state.value = { status: 'ready', data: cached, error: null }
        return
      }
    }
    const seq = ++requestSeq.value
    state.value = { status: 'loading', data: null, error: null }
    const result = await fetchTeacherExams(semester.value)
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return
    if (result.status === 'ready' && result.data) {
      memoryCache.set(scope, result.data)
    }
    state.value = result
  }

  /** 切换学期：仅接受合法学期键；标准化后清空当前数据并重新拉取。 */
  const setSemester = async (value: string): Promise<void> => {
    const next = normalizeSemester(value)
    if (!isValidExamsSemester(next) || next === semester.value) return
    semester.value = next
    state.value = { status: 'idle', data: null, error: null }
    await load()
  }

  /** 重试当前学期（强制绕过缓存）。 */
  const retry = (): Promise<void> => load({ force: true })

  /** 清空内存缓存（登出 / 账号切换时调用，避免跨账号残留）。 */
  const clearCache = (): void => {
    memoryCache.clear()
  }

  return {
    semester,
    accountId,
    scopeKey,
    state,
    invigilations,
    exams,
    reminderEvents,
    isLoading,
    isEmpty,
    isReady,
    isError,
    errorKey,
    load,
    setSemester,
    retry,
    clearCache
  }
}
