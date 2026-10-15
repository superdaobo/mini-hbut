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
import {
  buildTeacherSnapshotKey,
  clearTeacherSnapshotScope,
  readTeacherSnapshot,
  writeTeacherSnapshot
} from '../cache/teacherSnapshotStore'
import {
  isTeacherOffline,
  resolveTeacherSyncStatus,
  type TeacherSyncStatus
} from '../cache/teacher_sync_status'

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

  // #1065：快照元信息（跨页面/重启共享，供 #1066 同步时间栏消费）
  /** 最后一次**成功**同步时间（ISO）；空串 = 尚未成功同步。 */
  const lastSuccessfulSyncAt = ref('')
  /** 当前展示数据是否来自本地快照。 */
  const fromCache = ref(false)
  /** 当前快照是否已过期（可能过期）。 */
  const snapshotStale = ref(false)

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('teaching', accountId.value, semester.value)
  )

  /** 统一快照键：`teacher:{accountId}:{semester}:teaching`（身份/学期隔离）。 */
  const snapshotKey = computed(() =>
    buildTeacherSnapshotKey({
      resource: 'teaching',
      accountId: accountId.value,
      semester: semester.value
    })
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

  /** #1066：诚实同步状态（已同步/正在更新/已缓存/尚未同步/更新失败）。 */
  const syncStatus = computed<TeacherSyncStatus>(() =>
    resolveTeacherSyncStatus({
      phase: state.value.status,
      hasData: state.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: state.value.error?.kind ?? null
    })
  )

  /** 应用一条快照到视图状态（缓存优先渲染，不触发网络）。 */
  const applySnapshot = (snapshot: TeacherTeachingData, syncedAt: string, stale: boolean): void => {
    lastSuccessfulSyncAt.value = syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    // 缓存的空结果仍以 empty 状态呈现（空 ≠ 失败，但也不是 ready 有数据）。
    const empty = snapshot.tasks.length === 0 && snapshot.classes.length === 0
    state.value = empty
      ? { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
      : { status: 'ready', data: snapshot, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    // 保留已有数据，避免整页闪空（loading 期间仍显示上次内容）
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherTeaching(semester.value, { scope: account })
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (key) {
        writeTeacherSnapshot({
          scopeKey: key,
          accountId: account,
          semester: semester.value,
          resource: 'teaching',
          queryKey: '',
          data: result.data,
          lastSuccessfulSyncAt: syncedAt
        })
      }
      state.value = result
      return
    }

    if (result.status === 'empty') {
      // 成功空数组也缓存（空 ≠ 失败）；用空载荷写入，避免下次又整页加载。
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (key) {
        writeTeacherSnapshot({
          scopeKey: key,
          accountId: account,
          semester: semester.value,
          resource: 'teaching',
          queryKey: '',
          data: { tasks: [], classes: [] } satisfies TeacherTeachingData,
          lastSuccessfulSyncAt: syncedAt
        })
      }
      state.value = result
      return
    }

    // 失败：保留上次成功数据（若有），由 syncStatus 标记「已缓存/更新失败」。
    state.value = { status: 'error', data: state.value.data, error: result.error }
  }

  /**
   * 拉取当前学期数据。
   *
   * - 非 `force`：先读当前账号正确 scope 的快照立即渲染，TTL 内直接返回；
   *   过期则继续后台再验证（失败保留旧数据）；
   * - `force`：跳过缓存读取（手动刷新），仍走同一单飞去重与过期丢弃。
   */
  const load = async (opts: { force?: boolean } = {}): Promise<void> => {
    const scope = scopeKey.value
    const account = accountId.value
    const key = snapshotKey.value
    if (!opts.force && key) {
      const snapshot = readTeacherSnapshot<TeacherTeachingData>(key)
      if (snapshot) {
        applySnapshot(snapshot.data, snapshot.meta.lastSuccessfulSyncAt, snapshot.meta.stale)
        if (!snapshot.meta.stale) return
      }
    }
    await revalidate(scope, account, key)
  }

  /** 切换学期：仅接受合法学期键；标准化后清空当前数据并重新拉取。 */
  const setSemester = async (value: string): Promise<void> => {
    const next = normalizeSemester(value)
    if (!isValidTeachingSemester(next) || next === semester.value) return
    semester.value = next
    state.value = { status: 'idle', data: null, error: null }
    lastSuccessfulSyncAt.value = ''
    fromCache.value = false
    snapshotStale.value = false
    await load()
  }

  /** 重试当前学期（强制绕过缓存）。 */
  const retry = (): Promise<void> => load({ force: true })

  /** 清理**当前账号**作用域的快照（登出 / 账号切换时调用，杜绝跨账号残留）。 */
  const clearCache = (): void => {
    clearTeacherSnapshotScope(accountId.value)
  }

  return {
    semester,
    accountId,
    scopeKey,
    snapshotKey,
    state,
    tasks,
    classes,
    links,
    isLoading,
    isEmpty,
    isReady,
    isError,
    errorKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    setSemester,
    retry,
    clearCache
  }
}
