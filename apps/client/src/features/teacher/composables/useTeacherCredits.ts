// src/features/teacher/composables/useTeacherCredits.ts
//
// Teacher Portal（goal-21 / T09）：教师「学分统计」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherCredits(semester)`，把 `TeacherLoadState`
//      （载荷为 `Record<string, unknown>`）解析为**已核实字段**的视图模型；
//   2. 与 useTeacherAttendance 同构：作用域键隔离账号/学期、请求序号丢弃过期
//      响应、进程级快照缓存（TTL 内直读、过期后台再验证）、诚实同步状态；
//   3. **诚实渲染原则（硬性约束）**：
//      - `getxftjlist` 返回的是**学生个人明细**（每行一个学生），不是班级汇总；
//      - `cells[].key` 是**学分档位编号**（实测 21 个，语义学校未给映射表），
//        因此**绝不给档位起名字**（不写「必修课/选修课」之类），表头只显示
//        编号本身；页面底部固定一行小字「档位编号含义以学校系统为准」；
//      - 展示学号（教师有权看自己学生学号），**后端不提供姓名，绝不臆造**。
//
// 只读：本文件不发起任何写型请求。
//
// ⚠️ 未复用 teacherSnapshotStore：`TeacherSnapshotResource` 枚举冻结且不含
//    credits，新增枚举属于 Lead（T13）范围；这里用进程内快照，重启不持久化。

import { computed, ref } from 'vue'

import { fetchTeacherCredits } from '../api/teacherApi'
import type {
  TeacherDataErrorKind,
  TeacherLoadState
} from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  asArray,
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
export const teacherCreditsErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const CREDITS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidCreditsSemester = (value: string): boolean =>
  CREDITS_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialCreditsSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidCreditsSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidCreditsSemester(stored)) return stored
  return deriveSemesterByDate()
}

// ────────────────────────────────────────────────────────────────
// 视图模型（只取后端契约字段，不臆造）
// ────────────────────────────────────────────────────────────────

/** 单个学分档位格：`key` 为档位编号（语义未知），`value` 为「已修/应修」原文。 */
export interface TeacherCreditCell {
  /** 档位编号原文（如 '11' / '90'），**表头直接展示编号，不加名称**。 */
  key: string
  /** 档位值原文（如 '0.0/0.0'）。 */
  value: string
}

/** 一名学生的学分明细行（后端隐私过滤后的已核实字段）。 */
export interface TeacherCreditRow {
  /** 稳定渲染键（学号 + 班级 + 序号；不依赖时间戳）。 */
  key: string
  /** 学号（可能为空串；教师有权查看自己学生学号，直接展示）。 */
  studentId: string
  /** 专业名称（null → 不渲染该片段）。 */
  majorName: string | null
  /** 班级名称（null → 不渲染该片段）。 */
  className: string | null
  /** 学分档位明细（按档位编号数值升序）。 */
  cells: TeacherCreditCell[]
}

/** 不及格课程条目（`getBjgKcxx` 归一化字段）。 */
export interface TeacherFailedCourse {
  key: string
  /** 课程名称（kcmc）。 */
  courseName: string
  /** 课程代码（kcdm）。 */
  courseCode: string
  /** 课程编号（kcbh）。 */
  courseNo: string
  /** 学分原文（xf，字符串原样展示）。 */
  credit: string
  /** 成绩原文（cj，字符串原样展示）。 */
  grade: string
}

/** 学分统计页数据模型。 */
export interface TeacherCreditsData {
  rows: TeacherCreditRow[]
  failedCourses: TeacherFailedCourse[]
}

/** 档位编号的排序键：可转数字按数值升序，否则按文本序兜底（不丢数据）。 */
const tierSortKey = (key: string): { numeric: boolean; value: number; text: string } => {
  const parsed = Number(key)
  return Number.isFinite(parsed)
    ? { numeric: true, value: parsed, text: key }
    : { numeric: false, value: 0, text: key }
}

/** 比较两个档位编号（数值优先，文本兜底）。 */
const compareTierKeys = (a: string, b: string): number => {
  const ka = tierSortKey(a)
  const kb = tierSortKey(b)
  if (ka.numeric && kb.numeric) return ka.value - kb.value
  if (ka.numeric !== kb.numeric) return ka.numeric ? -1 : 1
  return ka.text.localeCompare(kb.text)
}

/** 归一化单个档位格（key/value 统一为字符串；空 key 的行丢弃）。 */
const normalizeCreditCell = (value: unknown): TeacherCreditCell | null => {
  const record = asRecord(value)
  const key = normalizeTeacherText(record.key)
  if (!key) return null
  return { key, value: asString(record.value) }
}

/** 归一化一名学生的学分明细行（cells 按档位编号排序）。 */
const normalizeCreditRow = (value: unknown, index: number): TeacherCreditRow => {
  const record = asRecord(value)
  const studentId = asString(record.studentId)
  const majorName = normalizeTeacherText(record.majorName) || null
  const className = normalizeTeacherText(record.className) || null
  const cells = asArray(record.cells)
    .map(normalizeCreditCell)
    .filter((cell): cell is TeacherCreditCell => cell !== null)
    .sort((a, b) => compareTierKeys(a.key, b.key))
  return {
    key: buildStableKey([studentId || 'unknown', className, index]),
    studentId,
    majorName,
    className,
    cells
  }
}

/** 归一化不及格课程（kcmc/kcdm/kcbh/xf/cj 原文保留，其他键忽略）。 */
const normalizeFailedCourse = (value: unknown, index: number): TeacherFailedCourse => {
  const record = asRecord(value)
  const courseName = normalizeTeacherText(record.kcmc)
  const courseCode = asString(record.kcdm)
  const courseNo = asString(record.kcbh)
  return {
    key: buildStableKey([courseNo || courseCode || courseName, index]),
    courseName,
    courseCode,
    courseNo,
    credit: asString(record.xf),
    grade: asString(record.cj)
  }
}

/** 解析冻结契约载荷 `{ rows, failedCourses }`；行按稳定键去重保序。 */
export const normalizeCreditsPayload = (raw: unknown): TeacherCreditsData => {
  const payload = asRecord(raw)
  const rows = dedupeByStableKey(
    asArray(payload.rows).map(normalizeCreditRow),
    (item) => item.key
  )
  const failedCourses = dedupeByStableKey(
    asArray(payload.failedCourses).map(normalizeFailedCourse),
    (item) => item.key
  )
  return { rows, failedCourses }
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface CreditsSnapshot {
  syncedAt: string
  data: TeacherCreditsData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const CREDITS_CACHE_TTL_MS = 5 * 60 * 1000

const creditsSnapshots = new Map<string, CreditsSnapshot>()
const CREDITS_SNAPSHOT_MAX_ENTRIES = 32

const readCreditsSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherCreditsData; syncedAt: string; stale: boolean } | null => {
  const snapshot = creditsSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > CREDITS_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeCreditsSnapshot = (key: string, data: TeacherCreditsData, syncedAt: string): void => {
  creditsSnapshots.set(key, { syncedAt, data })
  while (creditsSnapshots.size > CREDITS_SNAPSHOT_MAX_ENTRIES) {
    const oldest = creditsSnapshots.keys().next().value
    if (oldest === undefined) break
    creditsSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherCreditsSnapshots = (): void => {
  creditsSnapshots.clear()
}

export interface UseTeacherCreditsOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherCredits = (options: UseTeacherCreditsOptions = {}) => {
  const semester = ref(resolveInitialCreditsSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherCreditsData>>({
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
    buildTeacherScopedKey('credits', accountId.value, semester.value)
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const data = computed<TeacherCreditsData | null>(() => state.value.data)
  const rows = computed<TeacherCreditRow[]>(() => state.value.data?.rows ?? [])
  const failedCourses = computed<TeacherFailedCourse[]>(
    () => state.value.data?.failedCourses ?? []
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherCreditsErrorKey(state.value.error.kind) : ''
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
  const applySnapshot = (snapshot: CreditsSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    const empty = snapshot.data.rows.length === 0 && snapshot.data.failedCourses.length === 0
    state.value = empty
      ? { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
      : { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    // 保留已有数据，避免整页闪空（loading 期间仍显示上次内容）
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherCredits(semester.value, { scope: account })
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const normalized = normalizeCreditsPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (normalized.rows.length === 0 && normalized.failedCourses.length === 0) {
        state.value = { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
        return
      }
      if (key) writeCreditsSnapshot(key, normalized, syncedAt)
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
      const snapshot = readCreditsSnapshot(key)
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
    if (!isValidCreditsSemester(next) || next === semester.value) return
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
    rows,
    failedCourses,
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
