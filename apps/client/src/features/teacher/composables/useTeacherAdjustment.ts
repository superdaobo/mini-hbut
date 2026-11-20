// src/features/teacher/composables/useTeacherAdjustment.ts
//
// Teacher Portal（goal-21 / T09）：教师「调停补申请」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherAdjustment(semester)`，把 `TeacherLoadState`
//      （载荷为 `Record<string, unknown>`）解析为**已核实字段**的视图模型；
//   2. 与 useTeacherAttendance 同构：作用域键隔离账号/学期、请求序号丢弃过期
//      响应、进程级快照缓存（TTL 内直读、过期后台再验证）、诚实同步状态；
//   3. **只读红线**：`pk/pkttbgl/*` 提交/撤回/审批类路径属写型，本页不接；
//      UI 不出现任何「提交申请」入口，只提示「申请需在网页端提交」；
//   4. **诚实渲染原则**：`myApply` 实测 0 条且字段未实测，因此只按候选键
//      原样提取已知字段，取不到不臆造（其余原始字段以「字段名: 值」兜底）。
//
// 只读：本文件不发起任何写型请求。
//
// ⚠️ 未复用 teacherSnapshotStore：`TeacherSnapshotResource` 枚举冻结且不含
//    adjustment，新增枚举属于 Lead（T13）范围；这里用进程内快照，重启不持久化。

import { computed, ref } from 'vue'

import { fetchTeacherAdjustment } from '../api/teacherApi'
import type {
  TeacherDataErrorKind,
  TeacherLoadState
} from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  buildStableKey,
  dedupeByStableKey,
  normalizeSemester,
  normalizeTeacherText
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
export const teacherAdjustmentErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const ADJUSTMENT_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidAdjustmentSemester = (value: string): boolean =>
  ADJUSTMENT_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialAdjustmentSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidAdjustmentSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidAdjustmentSemester(stored)) return stored
  return deriveSemesterByDate()
}

// ────────────────────────────────────────────────────────────────
// 视图模型（只取后端契约字段，不臆造）
// ────────────────────────────────────────────────────────────────

/** 可申请调停补的教学班（`queryJsPkxx` 归一化字段）。 */
export interface TeacherAdjustmentCourse {
  key: string
  /** 课程名称（kcmc）。 */
  courseName: string
  /** 教学班名称（jxbmc）。 */
  className: string
  /** 教学班编号（jxbbh）。 */
  classNo: string
  /** 周学时（zsqs；null → 不渲染该片段）。 */
  weeklyHours: number | null
  /** 总学时（tzzxs；null → 不渲染该片段）。 */
  totalHours: number | null
  /** 是否叶子节点（leaf；语义后端未标注，仅透传不展示）。 */
  isLeaf: boolean | null
}

/**
 * 「我的申请」条目（`queryTtbxxList` 实测 total=0，**字段未实测**）。
 *
 * 因此只按候选键原样提取；取不到标题/状态/时间时不臆造，
 * 其余原始字段经 `extras` 以「字段名: 值」兜底展示（原始字段名不加语义）。
 */
export interface TeacherAdjustmentApply {
  key: string
  /** 条目主标题（课程/教学班/类型等候选键原样提取；可能为空）。 */
  title: string
  /** 状态原文（shzt/dqspzt 等候选键；可能为空）。 */
  status: string
  /** 时间原文（createTime/sqsj 等候选键；可能为空）。 */
  time: string
  /** 其余可展示的原始字段（字段名原样，不加语义标签；最多 4 个）。 */
  extras: Array<{ key: string; value: string }>
}

/** 调停补申请页数据模型。 */
export interface TeacherAdjustmentData {
  myApply: TeacherAdjustmentApply[]
  applicable: TeacherAdjustmentCourse[]
}

/** 归一化可申请教学班（驼峰契约优先，教务原字段兜底）。 */
const normalizeAdjustmentCourse = (value: unknown, index: number): TeacherAdjustmentCourse => {
  const record = asRecord(value)
  const courseName = normalizeTeacherText(record.courseName ?? record.kcmc)
  const className = normalizeTeacherText(record.className ?? record.jxbmc)
  const classNo = asString(record.classNo ?? record.jxbbh)
  return {
    key: buildStableKey([classNo, courseName, className, index]),
    courseName,
    className,
    classNo,
    weeklyHours: asNumber(record.weeklyHours ?? record.zsqs) ?? null,
    totalHours: asNumber(record.totalHours ?? record.tzzxs) ?? null,
    isLeaf:
      typeof record.isLeaf === 'boolean'
        ? record.isLeaf
        : typeof record.leaf === 'boolean'
          ? record.leaf
          : null
  }
}

// ── 「我的申请」候选键（字段未实测：按常见教务命名链提取，全空 → '—'）──

const APPLY_TITLE_KEYS = [
  'kcmc', 'courseName', 'jxbmc', 'className', 'sqxx', 'definitionName',
  'busiType', 'title', 'bt', 'name'
] as const
const APPLY_STATUS_KEYS = ['shzt', 'dqspzt', 'status', 'sqzt', 'zt', 'dqstatus', 'spzt'] as const
const APPLY_TIME_KEYS = [
  'createTime', 'sqsj', 'sqrq', 'djtime', 'endTime', 'time', 'date', 'ksrq'
] as const
/** extras 里不重复展示的键（已用于标题/状态/时间）。 */
const APPLY_USED_KEYS: ReadonlySet<string> = new Set([
  ...APPLY_TITLE_KEYS,
  ...APPLY_STATUS_KEYS,
  ...APPLY_TIME_KEYS
])
/** extras 里排除的内部/注入键（身份注入与疑似内部编码，不展示）。 */
const APPLY_SKIP_KEYS = /^(id|.*_id|.*id|encodeid|processinstanceidenc|new)$/i
const APPLY_EXTRAS_MAX = 4

const pickFirstText = (
  record: Record<string, unknown>,
  keys: readonly string[]
): string => {
  for (const key of keys) {
    const text = normalizeTeacherText(record[key])
    if (text) return text
  }
  return ''
}

/** 归一化一条「我的申请」记录（字段未实测 → 候选键原样提取 + extras 兜底）。 */
const normalizeAdjustmentApply = (value: unknown, index: number): TeacherAdjustmentApply => {
  const record = asRecord(value)
  const title = pickFirstText(record, APPLY_TITLE_KEYS)
  const status = pickFirstText(record, APPLY_STATUS_KEYS)
  const time = pickFirstText(record, APPLY_TIME_KEYS)
  const extras: Array<{ key: string; value: string }> = []
  for (const [fieldKey, fieldValue] of Object.entries(record)) {
    if (extras.length >= APPLY_EXTRAS_MAX) break
    if (APPLY_USED_KEYS.has(fieldKey)) continue
    if (APPLY_SKIP_KEYS.test(fieldKey)) continue
    // 只兜底原始类型的可展示字段（对象/数组不臆造结构）
    const text = asString(fieldValue)
    if (!text || text.length > 40) continue
    extras.push({ key: fieldKey, value: text })
  }
  return {
    key: buildStableKey([asString(record.id), title, time, index]),
    title,
    status,
    time,
    extras
  }
}

/** 解析冻结契约载荷 `{ myApply, applicable }`；按稳定键去重保序。 */
export const normalizeAdjustmentPayload = (raw: unknown): TeacherAdjustmentData => {
  const payload = asRecord(raw)
  const myApply = dedupeByStableKey(
    asArray(payload.myApply).map(normalizeAdjustmentApply),
    (item) => item.key
  )
  const applicable = dedupeByStableKey(
    asArray(payload.applicable).map(normalizeAdjustmentCourse),
    (item) => item.key
  )
  return { myApply, applicable }
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface AdjustmentSnapshot {
  syncedAt: string
  data: TeacherAdjustmentData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const ADJUSTMENT_CACHE_TTL_MS = 5 * 60 * 1000

const adjustmentSnapshots = new Map<string, AdjustmentSnapshot>()
const ADJUSTMENT_SNAPSHOT_MAX_ENTRIES = 32

const readAdjustmentSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherAdjustmentData; syncedAt: string; stale: boolean } | null => {
  const snapshot = adjustmentSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > ADJUSTMENT_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeAdjustmentSnapshot = (key: string, data: TeacherAdjustmentData, syncedAt: string): void => {
  adjustmentSnapshots.set(key, { syncedAt, data })
  while (adjustmentSnapshots.size > ADJUSTMENT_SNAPSHOT_MAX_ENTRIES) {
    const oldest = adjustmentSnapshots.keys().next().value
    if (oldest === undefined) break
    adjustmentSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherAdjustmentSnapshots = (): void => {
  adjustmentSnapshots.clear()
}

export interface UseTeacherAdjustmentOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherAdjustment = (options: UseTeacherAdjustmentOptions = {}) => {
  const semester = ref(resolveInitialAdjustmentSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherAdjustmentData>>({
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
    buildTeacherScopedKey('adjustment', accountId.value, semester.value)
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const data = computed<TeacherAdjustmentData | null>(() => state.value.data)
  const myApply = computed<TeacherAdjustmentApply[]>(() => state.value.data?.myApply ?? [])
  const applicable = computed<TeacherAdjustmentCourse[]>(
    () => state.value.data?.applicable ?? []
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherAdjustmentErrorKey(state.value.error.kind) : ''
  )

  /** #1066 同款诚实同步状态（已同步/正在更新/已缓存/尚未同步/更新失败）。 */
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
  const applySnapshot = (snapshot: AdjustmentSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    const empty = snapshot.data.myApply.length === 0 && snapshot.data.applicable.length === 0
    state.value = empty
      ? { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
      : { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    // 保留已有数据，避免整页闪空（loading 期间仍显示上次内容）
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherAdjustment(semester.value, { scope: account })
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const normalized = normalizeAdjustmentPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (normalized.myApply.length === 0 && normalized.applicable.length === 0) {
        state.value = { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
        return
      }
      if (key) writeAdjustmentSnapshot(key, normalized, syncedAt)
      state.value = { status: 'ready', data: normalized, error: null }
      return
    }

    if (result.status === 'empty') {
      lastSuccessfulSyncAt.value = new Date().toISOString()
      fromCache.value = false
      snapshotStale.value = false
      state.value = { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
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
      const snapshot = readAdjustmentSnapshot(key)
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
    if (!isValidAdjustmentSemester(next) || next === semester.value) return
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
    data,
    myApply,
    applicable,
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
