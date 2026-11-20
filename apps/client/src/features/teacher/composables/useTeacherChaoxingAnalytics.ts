// src/features/teacher/composables/useTeacherChaoxingAnalytics.ts
//
// Teacher Portal（goal-21 / T11）：教师「学习通学情」数据编排组合函数。
//
// 职责：
//   1. `fetchTeacherChaoxingCourses` → 我教课程（9 门，role=1 主讲 / 2 协作）
//      + 教学班频道（roletype=3）；选中课程后用其 courseId/classId/cpi 调
//      `fetchTeacherChaoxingAnalytics`（6 维度）与 `fetchTeacherChaoxingMonitor`
//      （学习监控 studyList 人数）。
//   2. 与 useTeacherAttendance 同构：作用域键隔离账号、请求序号丢弃过期响应、
//      进程级快照缓存（TTL 内直读、过期后台再验证）、诚实同步状态。
//   3. **诚实渲染原则（硬性约束）**：
//      - 维度字段结构只实测到 worknum（avg_finish/total/submit/finishWorkPer…），
//        其余维度（examnum/sign/score/pv/monitor）按 stat2 字段清单做**防御式取值**：
//        先在载荷本体查 → 再 `.data` → 再 `.result`，任一找不到一律展示 `—`，
//        **绝不编造百分比/人数**；
//      - `fetchTeacherChaoxingScores` 返回 60+ 字段学生明细（含 userid 等个人
//        标识），本页只消费聚合维度，**不调明细、不落学生数据**；
//      - 学习监控只显示异常**人数**，不渲染名单（隐私约束）。
//   4. **禁止任何持久化存储**（localStorage/sessionStorage/indexedDB）：
//      快照全部在进程内 Map，重启即失。
//
// 只读：本文件不发起任何写型请求。

import { computed, ref } from 'vue'

import {
  fetchTeacherChaoxingAnalytics,
  fetchTeacherChaoxingCourses,
  fetchTeacherChaoxingMonitor
} from '../api/teacherApi'
import type {
  TeacherDataErrorKind,
  TeacherLoadState
} from '../types'
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  buildStableKey,
  dedupeByStableKey,
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
export const teacherChaoxingErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

// ────────────────────────────────────────────────────────────────
// 视图模型（只取后端契约字段，不臆造）
// ────────────────────────────────────────────────────────────────

/** 一门「我教」课程（`getMyCourseJson` 归一化）。 */
export interface TeacherChaoxingCourse {
  /** 稳定渲染键（courseId+classId+cpi，缺字段按索引兜底）。 */
  key: string
  /** 课程 id（analytics 参数 courseid；可能为空串）。 */
  courseId: string
  courseName: string
  /** 教学班 id（analytics 参数 clazzid；可能为空串）。 */
  classId: string
  className: string
  /** 角色：`'1'` 主讲 / `'2'` 协作 / 其他原样保留。 */
  role: string
  /** cpi（analytics 参数；缺则不能查学情）。 */
  cpi: string
  studentCount: number | null
}

/** 一个教学班频道（`backclazzdata` 过滤 roletype=3 后的条目）。 */
export interface TeacherChaoxingChannel {
  key: string
  className: string
  studentCount: number | null
  clazzId: string
  cpi: string
  roletype: number | null
}

/** 课程页数据模型。 */
export interface TeacherChaoxingCoursesData {
  courses: TeacherChaoxingCourse[]
  channels: TeacherChaoxingChannel[]
}

/** stat2 六个维度名（与后端 `ANALYTICS_DIMENSIONS` 一一对应）。 */
export const CHAOXING_DIMENSIONS = [
  'worknum',
  'examnum',
  'sign',
  'score',
  'pv',
  'monitor'
] as const

export type ChaoxingDimensionKey = (typeof CHAOXING_DIMENSIONS)[number]

/** 六个维度的原始载荷（单维度失败为 null；结构未完全实测 → `unknown`）。 */
export type ChaoxingDimensions = Record<ChaoxingDimensionKey, unknown | null>

/** 学情页数据模型：维度原始载荷 + 监控人数（聚合值，无学生明细）。 */
export interface TeacherChaoxingAnalyticsData {
  dimensions: ChaoxingDimensions
  /** `study-monitor/v2/studyList` 的 count；接口失败为 null（视图显示 `—`）。 */
  monitorCount: number | null
}

/** 归一化单门课程。 */
export const normalizeChaoxingCourse = (
  value: unknown,
  index: number
): TeacherChaoxingCourse => {
  const record = asRecord(value)
  const courseId = asString(record.courseId)
  const classId = asString(record.classId)
  const cpi = asString(record.cpi)
  return {
    key:
      buildStableKey([courseId, classId, cpi]) ||
      `chaoxing-course-${index}`,
    courseId,
    courseName: normalizeTeacherText(record.courseName),
    classId,
    className: normalizeTeacherText(record.className),
    role: asString(record.role),
    cpi,
    studentCount: asNumber(record.studentCount) ?? null
  }
}

/** 归一化教学班频道。 */
export const normalizeChaoxingChannel = (
  value: unknown,
  index: number
): TeacherChaoxingChannel => {
  const record = asRecord(value)
  return {
    key:
      buildStableKey([asString(record.clazzId), asString(record.cpi)]) ||
      `chaoxing-channel-${index}`,
    className: normalizeTeacherText(record.className),
    studentCount: asNumber(record.studentCount) ?? null,
    clazzId: asString(record.clazzId),
    cpi: asString(record.cpi),
    roletype: asNumber(record.roletype) ?? null
  }
}

/** 解析冻结契约载荷 `{ courses, channels }`；按稳定键去重保序。 */
export const normalizeChaoxingCoursesPayload = (raw: unknown): TeacherChaoxingCoursesData => {
  const payload = asRecord(raw)
  return {
    courses: dedupeByStableKey(
      asArray(payload.courses).map(normalizeChaoxingCourse),
      (item) => item.key
    ),
    channels: dedupeByStableKey(
      asArray(payload.channels).map(normalizeChaoxingChannel),
      (item) => item.key
    )
  }
}

/** 解析 `{ dimensions: {...} }`：六个维度键齐全，缺失/单维失败 → null。 */
export const normalizeChaoxingDimensions = (raw: unknown): ChaoxingDimensions => {
  const record = asRecord(asRecord(raw).dimensions)
  const out = {} as ChaoxingDimensions
  for (const key of CHAOXING_DIMENSIONS) {
    const value = record[key]
    out[key] = value === undefined ? null : value
  }
  return out
}

// ────────────────────────────────────────────────────────────────
// 防御式指标提取（维度结构只实测到 worknum；找不到一律返回 null → 视图 `—`）
// ────────────────────────────────────────────────────────────────

/**
 * 维度载荷的候选对象：本体 → `.data` → `.result`。
 * chaoxing stat2 常见两种包裹形态（裸对象 / `{data:{…}}`），逐层兜底。
 */
const dimCandidates = (dim: unknown): Record<string, unknown>[] => {
  const root = asRecord(dim)
  const out: Record<string, unknown>[] = [root]
  const data = asRecord(root.data)
  if (Object.keys(data).length > 0) out.push(data)
  const result = asRecord(root.result)
  if (Object.keys(result).length > 0) out.push(result)
  return out
}

/** 按路径（`a.b.c`）在候选对象中取数字；全部缺失返回 null。 */
const digNumber = (dim: unknown, paths: readonly string[]): number | null => {
  for (const candidate of dimCandidates(dim)) {
    for (const path of paths) {
      let cursor: unknown = candidate
      for (const part of path.split('.')) {
        cursor = asRecord(cursor)[part]
      }
      const parsed = asNumber(cursor)
      if (parsed !== undefined) return parsed
    }
  }
  return null
}

/**
 * 比例归一到 0–100：
 * - `0 < v ≤ 1` 视为小数比例 → ×100；
 * - `v > 1` 视为百分数 → 直接裁剪到 100；
 * - `v ≤ 0` → 0（0% 是诚实值）。
 * 字段 scale 未实测，这条启发式对两种形态都成立。
 */
export const normalizeChaoxingPercent = (value: number | null): number | null => {
  if (value === null || !Number.isFinite(value)) return null
  if (value <= 0) return 0
  const percent = value <= 1 ? value * 100 : value
  return Math.min(100, percent)
}

/** 签到率（sign）：`totalRate` → `avg`。 */
export const chaoxingSignRate = (dim: unknown): number | null =>
  normalizeChaoxingPercent(digNumber(dim, ['totalRate', 'avg']))

/** 作业完成率（worknum）：`finishWorkPer` → `avg_finish` → `submit/total`。 */
export const chaoxingWorkRate = (dim: unknown): number | null => {
  const direct = normalizeChaoxingPercent(digNumber(dim, ['finishWorkPer', 'avg_finish']))
  if (direct !== null) return direct
  const submit = chaoxingWorkSubmit(dim)
  const total = chaoxingWorkTotal(dim)
  if (submit === null || total === null || total <= 0) return null
  return Math.min(100, (submit / total) * 100)
}

/** 已交作业数（worknum.submit）。 */
export const chaoxingWorkSubmit = (dim: unknown): number | null =>
  digNumber(dim, ['submit'])

/** 布置作业总数（worknum.total → totalShow）。 */
export const chaoxingWorkTotal = (dim: unknown): number | null =>
  digNumber(dim, ['total', 'totalShow'])

/**
 * 待批作业数（worknum）：字段未实测，枚举常见命名；
 * **全部缺失返回 null → 视图显示 `—`，绝不臆造**。
 */
export const chaoxingWorkPending = (dim: unknown): number | null =>
  digNumber(dim, [
    'unGradeNum',
    'waitGradeNum',
    'unmarkNum',
    'unMarkNum',
    'notMarkNum',
    'unCorrectNum',
    'unCorrectedNum',
    'stayNum',
    'pendingNum',
    'unreadNum'
  ])

/** 考试场次（examnum）：`numObj.total` → `totalShow` → `count` → `total`。 */
export const chaoxingExamCount = (dim: unknown): number | null =>
  digNumber(dim, ['numObj.total', 'totalShow', 'count', 'total'])

/** 考试平均分（examnum.scoreObj.avg）；>100 视为非法返回 null。 */
export const chaoxingExamAvgScore = (dim: unknown): number | null => {
  const value = digNumber(dim, ['scoreObj.avg', 'avg'])
  return value !== null && value >= 0 && value <= 100 ? value : null
}

/** 综合成绩平均分（score.avg）。 */
export const chaoxingScoreAvg = (dim: unknown): number | null =>
  digNumber(dim, ['avg', 'scoreObj.avg'])

/** 累计访问量（pv.pvTotal）。 */
export const chaoxingPvTotal = (dim: unknown): number | null =>
  digNumber(dim, ['pvTotal', 'total'])

/** 本周活跃人数（monitor.thisWeek.personTotal → personTotal）。 */
export const chaoxingWeekActive = (dim: unknown): number | null =>
  digNumber(dim, ['thisWeek.personTotal', 'personTotal'])

/** 课程是否具备发起学情查询的必要参数（courseid + cpi）。 */
export const chaoxingCourseQueryable = (course: TeacherChaoxingCourse): boolean =>
  course.courseId !== '' && course.cpi !== ''

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface ChaoxingCoursesSnapshot {
  syncedAt: string
  data: TeacherChaoxingCoursesData
}

interface ChaoxingAnalyticsSnapshot {
  syncedAt: string
  data: TeacherChaoxingAnalyticsData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const CHAOXING_CACHE_TTL_MS = 5 * 60 * 1000

const coursesSnapshots = new Map<string, ChaoxingCoursesSnapshot>()
const analyticsSnapshots = new Map<string, ChaoxingAnalyticsSnapshot>()
const CHAOXING_SNAPSHOT_MAX_ENTRIES = 32

const readSnapshot = <S extends { syncedAt: string }>(
  store: Map<string, S>,
  key: string,
  now: number = Date.now()
): { snapshot: S; stale: boolean } | null => {
  const snapshot = store.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > CHAOXING_CACHE_TTL_MS
  return { snapshot, stale }
}

const writeSnapshot = <S extends { syncedAt: string }>(
  store: Map<string, S>,
  key: string,
  data: S
): void => {
  store.set(key, data)
  while (store.size > CHAOXING_SNAPSHOT_MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherChaoxingSnapshots = (): void => {
  coursesSnapshots.clear()
  analyticsSnapshots.clear()
}

export interface UseTeacherChaoxingAnalyticsOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
}

export const useTeacherChaoxingAnalytics = (
  options: UseTeacherChaoxingAnalyticsOptions = {}
) => {
  const coursesState = ref<TeacherLoadState<TeacherChaoxingCoursesData>>({
    status: 'idle',
    data: null,
    error: null
  })
  const analyticsState = ref<TeacherLoadState<TeacherChaoxingAnalyticsData>>({
    status: 'idle',
    data: null,
    error: null
  })

  /** 当前选中课程的稳定键。 */
  const selectedCourseKey = ref('')

  /** 请求序号：仅最新一次请求的结果可落地（丢弃切课/切账号后的过期响应）。 */
  const coursesSeq = ref(0)
  const analyticsSeq = ref(0)

  /** 最后一次**成功**同步时间（ISO）；空串 = 尚未成功同步。 */
  const lastSuccessfulSyncAt = ref('')
  const fromCache = ref(false)
  const snapshotStale = ref(false)

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('chaoxing-courses', accountId.value, 'all')
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  /** 选中课程的学情快照键（账号 + 课程三元组隔离）。 */
  const analyticsSnapshotKey = computed(() => {
    if (!canPersistTeacherState(accountId.value) || !selectedCourseKey.value) return ''
    return `${scopeKey.value}|${selectedCourseKey.value}`
  })

  const courses = computed<TeacherChaoxingCourse[]>(
    () => coursesState.value.data?.courses ?? []
  )
  const channels = computed<TeacherChaoxingChannel[]>(
    () => coursesState.value.data?.channels ?? []
  )
  const selectedCourse = computed<TeacherChaoxingCourse | null>(
    () => courses.value.find((item) => item.key === selectedCourseKey.value) ?? null
  )

  const dimensions = computed<ChaoxingDimensions | null>(
    () => analyticsState.value.data?.dimensions ?? null
  )
  const monitorCount = computed<number | null>(
    () => analyticsState.value.data?.monitorCount ?? null
  )
  /** 监控接口单独失败时：有维度数据但 monitorCount 为 null → 视图显示 `—`。 */

  const isCoursesLoading = computed(() => coursesState.value.status === 'loading')
  const isCoursesError = computed(() => coursesState.value.status === 'error')
  const coursesErrorKey = computed(() =>
    coursesState.value.error ? teacherChaoxingErrorKey(coursesState.value.error.kind) : ''
  )
  const isAnalyticsLoading = computed(() => analyticsState.value.status === 'loading')
  const isAnalyticsError = computed(() => analyticsState.value.status === 'error')
  const analyticsErrorKey = computed(() =>
    analyticsState.value.error ? teacherChaoxingErrorKey(analyticsState.value.error.kind) : ''
  )

  /** #1066 同款诚实同步状态（以课程列表为主资源）。 */
  const syncStatus = computed<TeacherSyncStatus>(() =>
    resolveTeacherSyncStatus({
      phase: coursesState.value.status,
      hasData: coursesState.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: coursesState.value.error?.kind ?? null
    })
  )

  /** 后台再验证学情 + 监控（同一课程的两路请求一起刷新）。 */
  const revalidateAnalytics = async (
    course: TeacherChaoxingCourse,
    scope: string,
    account: string,
    key: string
  ): Promise<void> => {
    const seq = ++analyticsSeq.value
    analyticsState.value = {
      status: 'loading',
      data: analyticsState.value.data,
      error: null
    }

    // 参数不全（缺 courseid/cpi）不发请求：维度全空但保留课程信息。
    if (!chaoxingCourseQueryable(course)) {
      analyticsState.value = {
        status: 'ready',
        data: {
          dimensions: normalizeChaoxingDimensions(null),
          monitorCount: null
        },
        error: null
      }
      return
    }

    const params = { courseid: course.courseId, clazzid: course.classId, cpi: course.cpi }
    // 两路并行：监控失败只影响 monitorCount（null → `—`），不拖垮维度。
    const [analyticsResult, monitorResult] = await Promise.all([
      fetchTeacherChaoxingAnalytics(params, { scope: account }),
      fetchTeacherChaoxingMonitor(params, { scope: account })
    ])
    // 过期响应（已切课 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== analyticsSeq.value || scope !== scopeKey.value) return

    const monitorCount =
      monitorResult.status === 'ready' && monitorResult.data
        ? asNumber(asRecord(monitorResult.data).count) ?? null
        : null

    if (analyticsResult.status === 'ready' && analyticsResult.data) {
      const data: TeacherChaoxingAnalyticsData = {
        dimensions: normalizeChaoxingDimensions(analyticsResult.data),
        monitorCount
      }
      const syncedAt = new Date().toISOString()
      if (key) writeSnapshot(analyticsSnapshots, key, { syncedAt, data })
      analyticsState.value = { status: 'ready', data, error: null }
      return
    }

    if (analyticsResult.status === 'empty') {
      analyticsState.value = {
        status: 'empty',
        data: null,
        error: { kind: 'empty', message: '' }
      }
      return
    }

    // 维度整体失败：保留上次成功数据（若有）。
    analyticsState.value = {
      status: 'error',
      data: analyticsState.value.data,
      error: analyticsResult.error
    }
  }

  /** 选中一门课程并拉取其学情（TTL 内走快照）。 */
  const selectCourse = async (
    course: TeacherChaoxingCourse,
    opts: { force?: boolean } = {}
  ): Promise<void> => {
    const keyChanged = selectedCourseKey.value !== course.key
    selectedCourseKey.value = course.key
    const scope = scopeKey.value
    const account = accountId.value
    const key = analyticsSnapshotKey.value
    if (keyChanged) {
      analyticsState.value = { status: 'idle', data: null, error: null }
    }
    if (!opts.force && key) {
      const hit = readSnapshot(analyticsSnapshots, key)
      if (hit) {
        analyticsState.value = { status: 'ready', data: hit.snapshot.data, error: null }
        if (!hit.stale) return
      }
    }
    await revalidateAnalytics(course, scope, account, key)
  }

  /** 后台再验证课程列表；成功后自动选中首门可查课程。 */
  const revalidateCourses = async (
    scope: string,
    account: string,
    key: string
  ): Promise<void> => {
    const seq = ++coursesSeq.value
    coursesState.value = {
      status: 'loading',
      data: coursesState.value.data,
      error: null
    }
    const result = await fetchTeacherChaoxingCourses({ scope: account })
    if (seq !== coursesSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const data = normalizeChaoxingCoursesPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (data.courses.length === 0 && data.channels.length === 0) {
        coursesState.value = {
          status: 'empty',
          data: null,
          error: { kind: 'empty', message: '' }
        }
        return
      }
      if (key) writeSnapshot(coursesSnapshots, key, { syncedAt, data })
      coursesState.value = { status: 'ready', data, error: null }
      // 自动选中：优先保留已选课程，否则首门可查课程。
      const still = data.courses.find((item) => item.key === selectedCourseKey.value)
      const first = still ?? data.courses.find(chaoxingCourseQueryable) ?? data.courses[0]
      if (first) await selectCourse(first)
      return
    }

    if (result.status === 'empty') {
      lastSuccessfulSyncAt.value = new Date().toISOString()
      fromCache.value = false
      snapshotStale.value = false
      coursesState.value = {
        status: 'empty',
        data: null,
        error: { kind: 'empty', message: '' }
      }
      return
    }

    coursesState.value = {
      status: 'error',
      data: coursesState.value.data,
      error: result.error
    }
  }

  const applyCoursesSnapshot = (
    snapshot: { syncedAt: string; data: TeacherChaoxingCoursesData },
    stale: boolean
  ): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    const empty =
      snapshot.data.courses.length === 0 && snapshot.data.channels.length === 0
    coursesState.value = empty
      ? { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
      : { status: 'ready', data: snapshot.data, error: null }
  }

  /**
   * 拉取课程列表。
   *
   * - 非 `force`：先读当前账号正确 scope 的快照立即渲染，TTL 内直接返回；
   *   过期则继续后台再验证（失败保留旧数据）；
   * - `force`：跳过缓存读取（手动刷新）。
   */
  const load = async (opts: { force?: boolean } = {}): Promise<void> => {
    const scope = scopeKey.value
    const account = accountId.value
    const key = snapshotKey.value
    if (!opts.force && key) {
      const hit = readSnapshot(coursesSnapshots, key)
      if (hit) {
        applyCoursesSnapshot(
          { syncedAt: hit.snapshot.syncedAt, data: hit.snapshot.data },
          hit.stale
        )
        // 快照命中也要确保有选中课程的学情（首次进入页面）。
        if (coursesState.value.status === 'ready' && !selectedCourse.value) {
          const first =
            courses.value.find(chaoxingCourseQueryable) ?? courses.value[0]
          if (first) await selectCourse(first)
        }
        if (!hit.stale) return
      }
    }
    await revalidateCourses(scope, account, key)
  }

  /** 重试课程列表（强制绕过缓存）。 */
  const retry = (): Promise<void> => load({ force: true })

  /** 重试当前课程的学情（强制绕过缓存）。 */
  const retryAnalytics = async (): Promise<void> => {
    const course = selectedCourse.value
    if (!course) return
    await selectCourse(course, { force: true })
  }

  return {
    accountId,
    scopeKey,
    coursesState,
    analyticsState,
    courses,
    channels,
    selectedCourse,
    selectedCourseKey,
    dimensions,
    monitorCount,
    isCoursesLoading,
    isCoursesError,
    coursesErrorKey,
    isAnalyticsLoading,
    isAnalyticsError,
    analyticsErrorKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    selectCourse,
    retry,
    retryAnalytics
  }
}
