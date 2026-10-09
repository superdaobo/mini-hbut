// src/features/teacher/composables/useTeacherTeaching.ts
//
// Teacher Portal V2（E5 #1025）：教师「我的教学」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherTeaching(semester)`，把 `TeacherLoadState` 映射为视图状态；
//   2. **按 `jxbid` 关联**教学任务与教学班（两者粒度不同，**禁止按数组索引拼接**）；
//   3. 展示前清洗可能含 HTML 的教务字段（复用 normalizeTeacherData 的单一清洗入口）；
//   4. 以 `teacher_scope.ts` 的作用域键隔离「不同教师账号 / 不同学期」，
//      并对过期响应做丢弃，**绝不串号**。
//
// 只读：本文件不发起任何写型请求；与学生选课 / 成绩提交 / 课程删除完全隔离。

import { computed, ref } from 'vue'

import { fetchTeacherTeaching } from '../api/teacherApi'
import type {
  TeacherDataErrorKind,
  TeacherLoadState,
  TeacherTeachingData,
  TeachingClass,
  TeachingTask
} from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  normalizeSemester,
  stripTeacherHtml
} from '../utils/normalizeTeacherData'
import { buildTeacherScopedKey, normalizeScopeAccountId } from '../utils/teacher_scope'

/** 教学任务 ↔ 教学班关联项（按 `jxbid` 精确关联；任务列表一条都不会丢）。 */
export interface TeacherTeachingLink {
  task: TeachingTask
  /** 关联到的教学班；无同 `jxbid` 教学班时为 `null`（**不会**错配到别的班）。 */
  linkedClass: TeachingClass | null
}

/** 错误 kind → i18n key（视图按 key 取词，**不直接展示 error.message**）。 */
export const teacherTeachingErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 清洗教学任务文本字段（教务 `kcmc` / `name` 等可能含 HTML）。 */
export const sanitizeTeachingTask = (task: TeachingTask): TeachingTask => {
  const cleaned: TeachingTask = {
    ...task,
    kcmc: stripTeacherHtml(task.kcmc),
    name: stripTeacherHtml(task.name)
  }
  if (task.jxbzc !== undefined) cleaned.jxbzc = stripTeacherHtml(task.jxbzc)
  if (task.ksxsname !== undefined) cleaned.ksxsname = stripTeacherHtml(task.ksxsname)
  return cleaned
}

/** 清洗教学班文本字段（教务 `kcmc` / `name` / `kkyxmc` 等可能含 HTML）。 */
export const sanitizeTeachingClass = (cls: TeachingClass): TeachingClass => {
  const cleaned: TeachingClass = {
    ...cls,
    kcmc: stripTeacherHtml(cls.kcmc),
    name: stripTeacherHtml(cls.name)
  }
  if (cls.jxbzc !== undefined) cleaned.jxbzc = stripTeacherHtml(cls.jxbzc)
  if (cls.kkyxmc !== undefined) cleaned.kkyxmc = stripTeacherHtml(cls.kkyxmc)
  return cleaned
}

/**
 * 按 `jxbid` 关联教学任务与教学班。
 *
 * 硬约束：**输出长度恒等于教学任务数**（6 条任务 → 6 个关联项，一条不丢），
 * 教学班仅通过同 `jxbid` 命中，**绝不按数组索引对齐**（6 对 4 会错配）。
 */
export const linkTeachingData = (data: TeacherTeachingData): TeacherTeachingLink[] => {
  const classIndex = new Map<string, TeachingClass>()
  for (const cls of data.classes) {
    const jxbid = String(cls.jxbid ?? '').trim()
    if (jxbid && !classIndex.has(jxbid)) classIndex.set(jxbid, cls)
  }
  return data.tasks.map((task) => {
    const jxbid = String(task.jxbid ?? '').trim()
    return { task, linkedClass: jxbid ? classIndex.get(jxbid) ?? null : null }
  })
}

export interface UseTeacherTeachingOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const TEACHING_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidTeachingSemester = (value: string): boolean =>
  TEACHING_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialTeachingSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidTeachingSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidTeachingSemester(stored)) return stored
  return deriveSemesterByDate()
}

export const useTeacherTeaching = (options: UseTeacherTeachingOptions = {}) => {
  const semester = ref(resolveInitialTeachingSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherTeachingData>>({
    status: 'idle',
    data: null,
    error: null
  })

  /** 请求序号：仅最新一次请求的结果可落地（丢弃切换学期/账号后的过期响应）。 */
  const requestSeq = ref(0)
  /** 作用域内存缓存：键为 `teacher:{accountId}:{semester}:teaching`，跨账号/学期永不命中。 */
  const memoryCache = new Map<string, TeacherTeachingData>()

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('teaching', accountId.value, semester.value)
  )

  const tasks = computed<TeachingTask[]>(() => state.value.data?.tasks ?? [])
  const classes = computed<TeachingClass[]>(() => state.value.data?.classes ?? [])
  const links = computed<TeacherTeachingLink[]>(() =>
    linkTeachingData(state.value.data ?? { tasks: [], classes: [] })
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherTeachingErrorKey(state.value.error.kind) : ''
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
    const result = await fetchTeacherTeaching(semester.value)
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
    if (!isValidTeachingSemester(next) || next === semester.value) return
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
    tasks,
    classes,
    links,
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
