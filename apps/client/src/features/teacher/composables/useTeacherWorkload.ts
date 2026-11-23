// src/features/teacher/composables/useTeacherWorkload.ts
//
// Teacher Portal（goal-21 / T07）：教师「工作量」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherWorkload(semester)`，把 `TeacherLoadState`
//      （载荷为 `{ available, raw }`）解析为视图模型；
//   2. 与 useTeacherTeaching / useTeacherAttendance 同构：作用域隔离、过期响应
//      丢弃、进程内快照缓存（TTL 直读 + 过期再验证）、诚实同步状态；
//   3. **诚实渲染原则**：`/twork` 微服务本学期实测 5 个工作量字段全为 null，
//      `available` 为 false；此时视图必须显示「—」而不是 0，`jsRzGzlList`
//      为 null 时绝不画假柱状图。
//
// 只读：本文件不发起任何写型请求。

import { computed, ref } from 'vue'

import { fetchTeacherWorkload } from '../api/teacherApi'
import type {
  TeacherDataErrorKind,
  TeacherLoadState
} from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  asArray,
  asNumber,
  asRecord,
  normalizeSemester
} from '../utils/normalizeTeacherData'
import {
  buildTeacherScopedKey,
  canPersistTeacherState,
  normalizeScopeAccountId
} from '../utils/teacher_scope'
import {
  isTeacherOffline,
  resolveTeacherSyncStatus,
  type TeacherSyncStatus
} from '../cache/teacher_sync_status'

/** 错误 kind → i18n key（视图按 key 取词，**不直接展示 error.message**）。 */
export const teacherWorkloadErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const WORKLOAD_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidWorkloadSemester = (value: string): boolean =>
  WORKLOAD_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialWorkloadSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidWorkloadSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidWorkloadSemester(stored)) return stored
  return deriveSemesterByDate()
}

/**
 * `/twork` 微服务归一化后的工作量明细字段（全部可能为 null）。
 *
 * ⚠️ null ≠ 0：null 表示学校尚未生成该字段，UI 必须显示「—」。
 */
export interface TeacherWorkloadFields {
  /** 工作量总计（gzlSum）。 */
  gzlSum: number | null
  /** 教师任职工作量合计（jsRzGzlSum）。 */
  jsRzGzlSum: number | null
  /** 基础工作量合计（baseGzlSum）。 */
  baseGzlSum: number | null
  /** 额外工作量合计（edGzlSum）。 */
  edGzlSum: number | null
  /** 每周工作负荷列表（周分布；无数据为 null）。 */
  jsRzGzlList: unknown | null
}

/** 工作量页数据模型。 */
export interface TeacherWorkloadData {
  /** 后端是否认为数据可用；false 时**全部字段视为不可用**，UI 一律「—」。 */
  available: boolean
  fields: TeacherWorkloadFields
  /** 字段层级的可用性（available 为 true 时仍可能单字段为 null）。 */
  hasAnyValue: boolean
}

/** 周分布柱状图的单点（高度值；null 表示该周无数据）。 */
export type WorkloadWeeklyValue = number | null

/** 从列表元素里提取一个数字：元素本身为数字 / 含常见数值字段。 */
const extractWeeklyNumber = (item: unknown): number | null => {
  const direct = asNumber(item)
  if (direct !== undefined) return direct
  const record = asRecord(item)
  for (const key of ['gzl', 'value', 'hours', 'workload', 'total']) {
    const value = asNumber(record[key])
    if (value !== undefined) return value
  }
  return null
}

/**
 * 解析每周负荷列表为数字序列。
 *
 * - `jsRzGzlList` 不是数组或元素无法取值 → 返回 null（视图走「暂无周分布数据」）；
 * - 数组内**可解析**的元素保底不少于 1 个，全数组按列渲染（解析失败的位为 null）。
 */
export const normalizeWeeklyValues = (value: unknown): WorkloadWeeklyValue[] | null => {
  const list = asArray(value)
  if (list.length === 0) return null
  const values = list.map(extractWeeklyNumber)
  return values.some((item) => item !== null) ? values : null
}

/** 解析冻结契约载荷 `{ available, raw }`；`raw` 缺失/非法时字段全 null。 */
export const normalizeWorkloadPayload = (raw: unknown): TeacherWorkloadData => {
  const payload = asRecord(raw)
  const fields = asRecord(payload.raw)
  const normalized: TeacherWorkloadFields = {
    gzlSum: asNumber(fields.gzlSum) ?? null,
    jsRzGzlSum: asNumber(fields.jsRzGzlSum) ?? null,
    baseGzlSum: asNumber(fields.baseGzlSum) ?? null,
    edGzlSum: asNumber(fields.edGzlSum) ?? null,
    jsRzGzlList: fields.jsRzGzlList ?? null
  }
  // 后端把「学期有数据」标为 available；字段全 null 时视作无数据（真实语义保留 null）。
  const available = payload.available === true
  const hasAnyValue =
    normalized.gzlSum !== null ||
    normalized.jsRzGzlSum !== null ||
    normalized.baseGzlSum !== null ||
    normalized.edGzlSum !== null ||
    normalized.jsRzGzlList !== null
  return { available, fields: normalized, hasAnyValue }
}

/** 数值 → 展示文本（null/undefined → '—'；保留后端精度，不做格式化裁剪）。 */
export const workloadValueText = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : String(value)

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface WorkloadSnapshot {
  syncedAt: string
  data: TeacherWorkloadData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const WORKLOAD_CACHE_TTL_MS = 5 * 60 * 1000

const workloadSnapshots = new Map<string, WorkloadSnapshot>()
const WORKLOAD_SNAPSHOT_MAX_ENTRIES = 32

const readWorkloadSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherWorkloadData; syncedAt: string; stale: boolean } | null => {
  const snapshot = workloadSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > WORKLOAD_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeWorkloadSnapshot = (key: string, data: TeacherWorkloadData, syncedAt: string): void => {
  workloadSnapshots.set(key, { syncedAt, data })
  while (workloadSnapshots.size > WORKLOAD_SNAPSHOT_MAX_ENTRIES) {
    const oldest = workloadSnapshots.keys().next().value
    if (oldest === undefined) break
    workloadSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherWorkloadSnapshots = (): void => {
  workloadSnapshots.clear()
}

export interface UseTeacherWorkloadOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherWorkload = (options: UseTeacherWorkloadOptions = {}) => {
  const semester = ref(resolveInitialWorkloadSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherWorkloadData>>({
    status: 'idle',
    data: null,
    error: null
  })

  /** 请求序号：仅最新一次请求的结果可落地（丢弃切换学期/账号后的过期响应）。 */
  const requestSeq = ref(0)

  /** 最后一次**成功**同步时间（ISO）；空串 = 尚未成功同步。 */
  const lastSuccessfulSyncAt = ref('')
  /** 当前展示数据是否来自本地快照。 */
  const fromCache = ref(false)
  /** 当前快照是否已过期（可能过期）。 */
  const snapshotStale = ref(false)

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('workload', accountId.value, semester.value)
  )
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const fields = computed<TeacherWorkloadFields>(() =>
    state.value.data?.fields ?? {
      gzlSum: null,
      jsRzGzlSum: null,
      baseGzlSum: null,
      edGzlSum: null,
      jsRzGzlList: null
    }
  )
  /** 后端标记可用且字段至少有值；否则一律展示「—」。 */
  const isAvailable = computed(
    () => state.value.data?.available === true && state.value.data?.hasAnyValue === true
  )
  const weeklyValues = computed<WorkloadWeeklyValue[] | null>(() =>
    normalizeWeeklyValues(fields.value.jsRzGzlList)
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherWorkloadErrorKey(state.value.error.kind) : ''
  )

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
  const applySnapshot = (snapshot: WorkloadSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    state.value = { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherWorkload(semester.value, { scope: account })
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const data = normalizeWorkloadPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      // 「available:false 且全字段 null」是**真实的本学期状态**而非空态错误：
      // 仍按 ready 呈现（UI 显示 — 与「数据尚未生成」说明），并允许缓存。
      if (key) writeWorkloadSnapshot(key, data, syncedAt)
      state.value = { status: 'ready', data, error: null }
      return
    }

    if (result.status === 'empty') {
      lastSuccessfulSyncAt.value = new Date().toISOString()
      fromCache.value = false
      snapshotStale.value = false
      state.value = { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
      return
    }

    state.value = { status: 'error', data: state.value.data, error: result.error }
  }

  const load = async (opts: { force?: boolean } = {}): Promise<void> => {
    const scope = scopeKey.value
    const account = accountId.value
    const key = snapshotKey.value
    if (!opts.force && key) {
      const snapshot = readWorkloadSnapshot(key)
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale)
        if (!snapshot.stale) return
      }
    }
    await revalidate(scope, account, key)
  }

  /** 切换学期：仅接受合法学期键；标准化后清空当前数据并重新拉取。 */
  const setSemester = async (value: string): Promise<void> => {
    const next = normalizeSemester(value)
    if (!isValidWorkloadSemester(next) || next === semester.value) return
    semester.value = next
    state.value = { status: 'idle', data: null, error: null }
    lastSuccessfulSyncAt.value = ''
    fromCache.value = false
    snapshotStale.value = false
    await load()
  }

  /** 重试当前学期（强制绕过缓存）。 */
  const retry = (): Promise<void> => load({ force: true })

  return {
    semester,
    accountId,
    scopeKey,
    state,
    fields,
    isAvailable,
    weeklyValues,
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
    retry
  }
}
