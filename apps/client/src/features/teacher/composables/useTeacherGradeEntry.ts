// src/features/teacher/composables/useTeacherGradeEntry.ts
//
// Teacher Portal（goal-21 / T10）：教师「成绩录入进度」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherGradeEntry(semester)`，把 `TeacherLoadState`
//      （载荷为 `Record<string, unknown>`）解析为**已核实字段**的视图模型；
//   2. 与 useTeacherAttendance 同构：作用域键隔离账号/学期、请求序号丢弃过期
//      响应、进程级快照缓存（TTL 内直读、过期后台再验证）、诚实同步状态；
//   3. **关联红线**：`progress[]`（录入配置）与 `teachingClasses[]`（教学班）
//      粒度不同——前者实测 8 条、后者 4 条——**严禁按数组下标拼接**，
//      只能按 `classId`（jxbid）精确匹配；匹配不到就单独展示，不编造关联；
//   4. **状态映射收敛**：`publishStatus`（cjfbzt）只有 `"1"` 映射「已发布」；
//      其余值/空值一律中性灰底原样展示（不猜语义）；`confirmStatus` 同理。
//
// 只读：本文件不发起任何写型请求（createXscjData / submit / deleteCjxgsq
//    均不在 allowlist，本页不提供任何录入/提交入口）。
//
// ⚠️ 未复用 teacherSnapshotStore：`TeacherSnapshotResource` 枚举冻结且不含
//    gradeEntry，新增枚举属于 Lead（T13）范围；这里用进程内快照，重启不持久化。

import { computed, ref } from 'vue'

import { fetchTeacherGradeEntry } from '../api/teacherApi'
import type { TeacherDataError, TeacherDataErrorKind, TeacherLoadState } from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  buildStableKey,
  dedupeByStableKey,
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
export const teacherGradeEntryErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const GRADE_ENTRY_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidGradeEntrySemester = (value: string): boolean =>
  GRADE_ENTRY_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialGradeEntrySemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidGradeEntrySemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidGradeEntrySemester(stored)) return stored
  return deriveSemesterByDate()
}

// ────────────────────────────────────────────────────────────────
// 视图模型（只取后端契约字段，不臆造）
// ────────────────────────────────────────────────────────────────

/** 录入进度条目（`queryCjlrsz` 归一化契约）。 */
export interface TeacherGradeProgressItem {
  key: string
  /** 教学班 id（jxbid）——与 teachingClasses 关联的唯一合法键。 */
  classId: string
  /** 课程 id（kcid）。 */
  courseId: string
  /** 教学班编号（jxbbh）。 */
  classNo: string
  /** 补考标记原文（bkbj；命名推断，后端只做透传）。 */
  className: string
  /** 确认状态原文（cjtjqrzt；未知值中性展示，不猜）。 */
  confirmStatus: string
  /** 录入开始时间原文（cjfxlrqssj）。 */
  entryStartAt: string
  /** 录入截止时间原文（cjfxlrjzsj）。 */
  entryEndAt: string
  /** 应录人数（sdsycj；教务下发放的是字符串，已转 number|null）。 */
  shouldEnter: number | null
  /** 必录人数（sdbyscj；同上）。 */
  mustEnter: number | null
  /** 流程 id（cjtjprocessid；不回显 UI）。 */
  processId: string
}

/** 教学班条目（`jsdQueryJxbList` 归一化契约）。 */
export interface TeacherGradeTeachingClass {
  key: string
  /** 课程名称（kcmc）。 */
  courseName: string
  /** 教学班 id（jxbid）——关联唯一合法键。 */
  classId: string
  /** 教学班组成/周次原文（jxbzc，如 `2-13:2`；仅原样展示）。 */
  classWeek: string
  /** 班级人数（bjrs；null → 该片段不渲染）。 */
  studentCount: number | null
  /** 学分（xf；null → 该片段不渲染）。 */
  credits: number | null
  /** 成绩发布状态原文（cjfbzt；仅 `"1"` 映射已发布，其余中性展示）。 */
  publishStatus: string
  /** 考试形式编码（ksxs；语义 recon 未记录，仅透传）。 */
  classType: string
}

/** 成绩录入页数据模型。 */
export interface TeacherGradeEntryData {
  progress: TeacherGradeProgressItem[]
  teachingClasses: TeacherGradeTeachingClass[]
}

/** `progress` 条目与其**严格按 `classId` 匹配**到的教学班（可为 null）。 */
export interface TeacherGradeEntryLink {
  item: TeacherGradeProgressItem
  /** 同 `classId` 的教学班；无匹配为 null（**不会**错配到别的班）。 */
  linkedClass: TeacherGradeTeachingClass | null
}

/** 归一化一条录入进度（`shouldEnter`/`mustEnter` 按 number 解析，失败 → null）。 */
export const normalizeGradeProgressItem = (
  value: unknown,
  index: number
): TeacherGradeProgressItem => {
  const record = asRecord(value)
  const classId = asString(record.classId)
  const classNo = asString(record.classNo)
  const className = asString(record.className)
  const courseId = asString(record.courseId)
  return {
    key: buildStableKey([classId, courseId, classNo, index]),
    classId,
    courseId,
    classNo,
    className,
    confirmStatus: asString(record.confirmStatus),
    entryStartAt: asString(record.entryStartAt),
    entryEndAt: asString(record.entryEndAt),
    shouldEnter: asNumber(record.shouldEnter) ?? null,
    mustEnter: asNumber(record.mustEnter) ?? null,
    processId: asString(record.processId)
  }
}

/** 归一化一条教学班（文本走单一清洗入口防 HTML）。 */
export const normalizeGradeTeachingClass = (
  value: unknown,
  index: number
): TeacherGradeTeachingClass => {
  const record = asRecord(value)
  const classId = asString(record.classId)
  return {
    key: buildStableKey([classId, asString(record.courseName), index]),
    courseName: stripTeacherHtml(record.courseName),
    classId,
    classWeek: asString(record.classWeek),
    studentCount: asNumber(record.studentCount) ?? null,
    credits: asNumber(record.credits) ?? null,
    publishStatus: asString(record.publishStatus),
    classType: asString(record.classType)
  }
}

/** 解析冻结契约载荷 `{ progress, teachingClasses }`；按稳定键去重保序。 */
export const normalizeGradeEntryPayload = (raw: unknown): TeacherGradeEntryData => {
  const payload = asRecord(raw)
  return {
    progress: dedupeByStableKey(
      asArray(payload.progress).map(normalizeGradeProgressItem),
      (item) => item.key
    ),
    teachingClasses: dedupeByStableKey(
      asArray(payload.teachingClasses).map(normalizeGradeTeachingClass),
      (item) => item.key
    )
  }
}

/**
 * `progress` ↔ `teachingClasses` 关联（**只按 `classId` 精确匹配**）。
 *
 * 硬约束：输出长度恒等于 `progress.length`；teachingClasses 仅经同 `classId`
 * 命中，**绝不按数组下标对齐**（实测 8 对 4，按下标必然错配）。
 */
export const linkGradeEntryData = (data: TeacherGradeEntryData): TeacherGradeEntryLink[] => {
  const classIndex = new Map<string, TeacherGradeTeachingClass>()
  for (const cls of data.teachingClasses) {
    const classId = cls.classId.trim()
    if (classId && !classIndex.has(classId)) classIndex.set(classId, cls)
  }
  return data.progress.map((item) => {
    const classId = item.classId.trim()
    return { item, linkedClass: classId ? classIndex.get(classId) ?? null : null }
  })
}

/** 未匹配到任何 `progress` 的教学班（列表单独呈现，不塞进进度环）。 */
export const unmatchedTeachingClasses = (
  data: TeacherGradeEntryData
): TeacherGradeTeachingClass[] => {
  const used = new Set(data.progress.map((item) => item.classId.trim()).filter(Boolean))
  return data.teachingClasses.filter((cls) => cls.classId.trim() && !used.has(cls.classId.trim()))
}

// ────────────────────────────────────────────────────────────────
// 进度环 / 状态映射（纯函数；未知值一律中性，不猜语义）
// ────────────────────────────────────────────────────────────────

/**
 * 录入进度的 `{entered, total}` 计数对（用于环与文案）。
 *
 * 规则：`shouldEnter`（应录）优先作分母，缺失/0 时退到 `mustEnter`（必录）；
 * 分子对应取 `mustEnter`/`shouldEnter`——两个字段语义 recon 未完全验证，
 * 只能表达「录 / 应录」的相对进度。任一为空或分母 ≤ 0 返回 null。
 */
export const entryCounts = (
  item: TeacherGradeProgressItem
): { entered: number; total: number } | null => {
  const should = item.shouldEnter
  const must = item.mustEnter
  const total = should !== null && should > 0 ? should : must !== null && must > 0 ? must : null
  if (total === null || total <= 0) return null
  const entered = total === should ? must ?? 0 : should ?? 0
  return { entered, total }
}

/**
 * 录入完成度（0–100 整数百分比）；计数不可算返回 null（**绝不画 0% 的环**）。
 * 分子 > 分母时夹到 100（不显示 103%）。
 */
export const entryRingPercent = (item: TeacherGradeProgressItem): number | null => {
  const counts = entryCounts(item)
  if (!counts) return null
  const raw = (counts.entered / counts.total) * 100
  if (!Number.isFinite(raw)) return null
  return Math.max(0, Math.min(100, Math.round(raw)))
}

/** 录入进度文案 `{entered}/{total}`；不可算返回 '—'（**绝不显示 0/0 或 NaN**）。 */
export const entryProgressText = (item: TeacherGradeProgressItem): string => {
  const counts = entryCounts(item)
  return counts ? `${counts.entered}/${counts.total}` : '—'
}

/**
 * 发布状态映射：`"1"` → published（蓝）；其余值/空 → neutral（灰）。
 * 未知值**原样透传**给视图，不在本层翻译成猜测文案。
 */
export const publishBadgeTone = (publishStatus: string): 'published' | 'neutral' =>
  publishStatus.trim() === '1' ? 'published' : 'neutral'

/** 确认状态映射：`"1"` → confirmed；其余/空 → neutral（原样透传）。 */
export const confirmBadgeTone = (confirmStatus: string): 'confirmed' | 'neutral' =>
  confirmStatus.trim() === '1' ? 'confirmed' : 'neutral'

/** 录入窗口展示（`entryStartAt ~ entryEndAt`；只拼已有片段，不臆造）。 */
export const entryWindowText = (item: TeacherGradeProgressItem): string => {
  const parts: string[] = []
  if (item.entryStartAt) parts.push(item.entryStartAt)
  if (item.entryEndAt) parts.push(item.entryEndAt)
  return parts.join(' ~ ')
}

/** 汇总：应录总数（progress 行 `shouldEnter` 求和，忽略 null）。 */
export const totalShouldEnter = (data: TeacherGradeEntryData): number | null => {
  const values = data.progress.map((item) => item.shouldEnter).filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0)
}

/** 汇总：已录总数（`mustEnter` 求和；全 null → null）。 */
export const totalMustEnter = (data: TeacherGradeEntryData): number | null => {
  const values = data.progress.map((item) => item.mustEnter).filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0)
}

/** 汇总：已完成录入的班数（ring = 100）。 */
export const completedProgressCount = (data: TeacherGradeEntryData): number =>
  data.progress.filter((item) => entryRingPercent(item) === 100).length

/** 汇总：已发布教学班数（`publishStatus === "1"`）。 */
export const publishedClassCount = (data: TeacherGradeEntryData): number =>
  data.teachingClasses.filter((cls) => publishBadgeTone(cls.publishStatus) === 'published').length

/** 录入截止时间汇总：取最晚的有效 `entryEndAt` 原文（无 → ''）。 */
export const latestEntryDeadline = (data: TeacherGradeEntryData): string => {
  let best = ''
  for (const item of data.progress) {
    if (!item.entryEndAt) continue
    if (!best || item.entryEndAt > best) best = item.entryEndAt
  }
  return best
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface GradeEntrySnapshot {
  syncedAt: string
  data: TeacherGradeEntryData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const GRADE_ENTRY_CACHE_TTL_MS = 5 * 60 * 1000

const gradeEntrySnapshots = new Map<string, GradeEntrySnapshot>()
const GRADE_ENTRY_SNAPSHOT_MAX_ENTRIES = 32

const readGradeEntrySnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherGradeEntryData; syncedAt: string; stale: boolean } | null => {
  const snapshot = gradeEntrySnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > GRADE_ENTRY_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeGradeEntrySnapshot = (key: string, data: TeacherGradeEntryData, syncedAt: string): void => {
  gradeEntrySnapshots.set(key, { syncedAt, data })
  while (gradeEntrySnapshots.size > GRADE_ENTRY_SNAPSHOT_MAX_ENTRIES) {
    const oldest = gradeEntrySnapshots.keys().next().value
    if (oldest === undefined) break
    gradeEntrySnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherGradeEntrySnapshots = (): void => {
  gradeEntrySnapshots.clear()
}

/** 空态错误对象（`status === 'empty'` 的等价错误表示）。 */
const gradeEntryEmptyError = (): TeacherDataError => ({ kind: 'empty', message: '' })

export interface UseTeacherGradeEntryOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherGradeEntry = (options: UseTeacherGradeEntryOptions = {}) => {
  const semester = ref(resolveInitialGradeEntrySemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherGradeEntryData>>({
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
    buildTeacherScopedKey('gradeEntry', accountId.value, semester.value)
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const data = computed<TeacherGradeEntryData | null>(() => state.value.data)
  const progress = computed<TeacherGradeProgressItem[]>(() => state.value.data?.progress ?? [])
  const teachingClasses = computed<TeacherGradeTeachingClass[]>(
    () => state.value.data?.teachingClasses ?? []
  )
  /** 严格 classId 关联（progress 一条不丢，教学班可为 null）。 */
  const links = computed<TeacherGradeEntryLink[]>(() =>
    linkGradeEntryData(state.value.data ?? { progress: [], teachingClasses: [] })
  )
  /** 无 progress 匹配的教学班（单独区域展示）。 */
  const orphanClasses = computed<TeacherGradeTeachingClass[]>(() =>
    unmatchedTeachingClasses(state.value.data ?? { progress: [], teachingClasses: [] })
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherGradeEntryErrorKey(state.value.error.kind) : ''
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
  const applySnapshot = (snapshot: GradeEntrySnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    const empty =
      snapshot.data.progress.length === 0 && snapshot.data.teachingClasses.length === 0
    state.value = empty
      ? { status: 'empty', data: null, error: gradeEntryEmptyError() }
      : { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    // 保留已有数据，避免整页闪空（loading 期间仍显示上次内容）
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherGradeEntry(semester.value, { scope: account })
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const normalized = normalizeGradeEntryPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (normalized.progress.length === 0 && normalized.teachingClasses.length === 0) {
        state.value = { status: 'empty', data: null, error: gradeEntryEmptyError() }
        return
      }
      if (key) writeGradeEntrySnapshot(key, normalized, syncedAt)
      state.value = { status: 'ready', data: normalized, error: null }
      return
    }

    if (result.status === 'empty') {
      lastSuccessfulSyncAt.value = new Date().toISOString()
      fromCache.value = false
      snapshotStale.value = false
      state.value = { status: 'empty', data: null, error: gradeEntryEmptyError() }
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
      const snapshot = readGradeEntrySnapshot(key)
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
    if (!isValidGradeEntrySemester(next) || next === semester.value) return
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
    progress,
    teachingClasses,
    links,
    orphanClasses,
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
