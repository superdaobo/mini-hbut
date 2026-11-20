// src/features/teacher/composables/useTeacherAttendance.ts
//
// Teacher Portal（goal-21 / T07）：教师「学生考勤」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherAttendance(semester)`，把 `TeacherLoadState`
//      （载荷为 `Record<string, unknown>`）解析为**已核实字段**的视图模型；
//   2. 与 useTeacherTeaching 同构：作用域键隔离账号/学期、请求序号丢弃过期响应、
//      进程级快照缓存（TTL 内直读、过期后台再验证）、诚实同步状态；
//   3. **不臆造出勤率**：后端 `attendance.rs` 明确 `cqzt1..20` 非零值语义未验证，
//      只能表达「该周考勤已录入」。因此本页全部指标都是「录入覆盖率」，
//      `weeks[]` 仅按「非空且非 "0" = 已录入」两态渲染热力矩阵。
//
// 只读：本文件不发起任何写型请求。
//
// ⚠️ 未复用 teacherSnapshotStore：`TeacherSnapshotResource` 枚举冻结且不含
//    attendance/workload，新增枚举属于 Lead（T13）范围；这里用进程内快照，
//    重启不持久化，语义与快照契约一致（账号+学期+资源三重隔离、TTL 过期）。

import { computed, ref } from 'vue'

import { fetchTeacherAttendance } from '../api/teacherApi'
import type {
  TeacherDataErrorKind,
  TeacherLoadState
} from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  asArray,
  asNumber,
  asRecord,
  normalizeSemester,
  stripTeacherHtml
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
export const teacherAttendanceErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const ATTENDANCE_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidAttendanceSemester = (value: string): boolean =>
  ATTENDANCE_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialAttendanceSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidAttendanceSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidAttendanceSemester(stored)) return stored
  return deriveSemesterByDate()
}

/** 教务固定考勤周列数（`cqzt1..20`）。 */
export const ATTENDANCE_WEEK_COUNT = 20

/** 考勤页顶部汇总（后端 `attendance.rs` 归一化契约）。 */
export interface TeacherAttendanceSummary {
  classCount: number
  studentTotal: number
  recordedClassCount: number
  weeks: number
}

/** 单个教学班的考勤视图模型（仅取已核实字段，文本已清洗）。 */
export interface TeacherAttendanceClass {
  key: string
  courseCode: string
  courseName: string
  classId: string
  className: string
  classNo: string
  studentCount: number | null
  totalHours: number | null
  weeklyHours: number | null
  weekRange: string
  confirmed: string
  /** 长度恒为 20；"0" 或 "" = 未录入，其余 = 已录入（非零值语义后端未验证）。 */
  weeks: string[]
  recordedWeeks: number
}

/** 考勤页数据模型。 */
export interface TeacherAttendanceData {
  summary: TeacherAttendanceSummary
  classes: TeacherAttendanceClass[]
}

/** 周状态是否视为「已录入考勤」（与后端 `recorded_week_count` 同规则）。 */
export const isRecordedWeek = (status: unknown): boolean => {
  const text = typeof status === 'string' ? status.trim() : String(status ?? '').trim()
  return text !== '' && text !== '0'
}

/** 把后端原始 `classes[]` 元素归一为视图模型（长度不足 20 的 weeks 补 "0"）。 */
export const normalizeAttendanceClass = (
  value: unknown,
  index: number
): TeacherAttendanceClass => {
  const record = asRecord(value)
  const rawWeeks = asArray(record.weeks).map((item) =>
    typeof item === 'string' ? item.trim() : String(item ?? '')
  )
  const weeks = Array.from({ length: ATTENDANCE_WEEK_COUNT }, (_, i) => rawWeeks[i] ?? '')
  const recordedWeeks =
    asNumber(record.recordedWeeks) ?? weeks.filter(isRecordedWeek).length
  const className = stripTeacherHtml(record.className)
  const courseName = stripTeacherHtml(record.courseName)
  const classId = String(record.classId ?? '').trim()
  return {
    key: classId || `attendance-class-${index}`,
    courseCode: stripTeacherHtml(record.courseCode),
    courseName,
    classId,
    className,
    classNo: String(record.classNo ?? ''),
    studentCount: asNumber(record.studentCount) ?? null,
    totalHours: asNumber(record.totalHours) ?? null,
    weeklyHours: asNumber(record.weeklyHours) ?? null,
    weekRange: stripTeacherHtml(record.weekRange),
    confirmed: String(record.confirmed ?? ''),
    weeks,
    recordedWeeks
  }
}

/** 解析冻结契约载荷 `{ summary, classes }`；无班级时返回空数据。 */
export const normalizeAttendancePayload = (raw: unknown): TeacherAttendanceData => {
  const payload = asRecord(raw)
  const summaryRecord = asRecord(payload.summary)
  const classes = asArray(payload.classes).map(normalizeAttendanceClass)
  return {
    summary: {
      classCount: asNumber(summaryRecord.classCount) ?? classes.length,
      studentTotal: asNumber(summaryRecord.studentTotal) ?? 0,
      recordedClassCount:
        asNumber(summaryRecord.recordedClassCount) ??
        classes.filter((item) => item.recordedWeeks > 0).length,
      weeks: asNumber(summaryRecord.weeks) ?? ATTENDANCE_WEEK_COUNT
    },
    classes
  }
}

/** 单班录入覆盖率（百分比，0-100）；未录入任何周返回 null（**绝不显示 0%**）。 */
export const classCoveragePercent = (item: TeacherAttendanceClass): number | null => {
  if (item.recordedWeeks <= 0) return null
  return Math.min(100, (item.recordedWeeks / ATTENDANCE_WEEK_COUNT) * 100)
}

/** 全学期录入覆盖率（总已录入周 / 班级数×20）；无任何录入返回 null。 */
export const overallCoveragePercent = (data: TeacherAttendanceData): number | null => {
  const totalRecorded = data.classes.reduce((sum, item) => sum + item.recordedWeeks, 0)
  if (totalRecorded <= 0 || data.classes.length === 0) return null
  const denominator = data.classes.length * ATTENDANCE_WEEK_COUNT
  return Math.min(100, (totalRecorded / denominator) * 100)
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface AttendanceSnapshot {
  syncedAt: string
  data: TeacherAttendanceData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const ATTENDANCE_CACHE_TTL_MS = 5 * 60 * 1000

const attendanceSnapshots = new Map<string, AttendanceSnapshot>()
const ATTENDANCE_SNAPSHOT_MAX_ENTRIES = 32

const readAttendanceSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherAttendanceData; syncedAt: string; stale: boolean } | null => {
  const snapshot = attendanceSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > ATTENDANCE_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeAttendanceSnapshot = (key: string, data: TeacherAttendanceData, syncedAt: string): void => {
  attendanceSnapshots.set(key, { syncedAt, data })
  // 容量上限：超出按写入顺序淘汰最旧项（Map 迭代即插入序）。
  while (attendanceSnapshots.size > ATTENDANCE_SNAPSHOT_MAX_ENTRIES) {
    const oldest = attendanceSnapshots.keys().next().value
    if (oldest === undefined) break
    attendanceSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherAttendanceSnapshots = (): void => {
  attendanceSnapshots.clear()
}

export interface UseTeacherAttendanceOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherAttendance = (options: UseTeacherAttendanceOptions = {}) => {
  const semester = ref(resolveInitialAttendanceSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherAttendanceData>>({
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
    buildTeacherScopedKey('attendance', accountId.value, semester.value)
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const classes = computed<TeacherAttendanceClass[]>(() => state.value.data?.classes ?? [])
  const summary = computed<TeacherAttendanceSummary | null>(() => state.value.data?.summary ?? null)
  const totalRecordedWeeks = computed(() =>
    classes.value.reduce((sum, item) => sum + item.recordedWeeks, 0)
  )
  const hasRecorded = computed(() => totalRecordedWeeks.value > 0)
  const coveragePercent = computed<number | null>(() =>
    state.value.data ? overallCoveragePercent(state.value.data) : null
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherAttendanceErrorKey(state.value.error.kind) : ''
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
  const applySnapshot = (snapshot: AttendanceSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    const empty = snapshot.data.classes.length === 0
    state.value = empty
      ? { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
      : { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    // 保留已有数据，避免整页闪空（loading 期间仍显示上次内容）
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherAttendance(semester.value, { scope: account })
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const data = normalizeAttendancePayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (data.classes.length === 0) {
        // 有 summary 但无班级：等价空态，按 empty 呈现。
        state.value = { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
        return
      }
      if (key) writeAttendanceSnapshot(key, data, syncedAt)
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
      const snapshot = readAttendanceSnapshot(key)
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
    if (!isValidAttendanceSemester(next) || next === semester.value) return
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
    classes,
    summary,
    totalRecordedWeeks,
    hasRecorded,
    coveragePercent,
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
