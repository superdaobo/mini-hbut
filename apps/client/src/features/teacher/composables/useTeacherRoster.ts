// src/features/teacher/composables/useTeacherRoster.ts
//
// Teacher Portal（goal-21 / T10）：教师「学生名册」数据编排组合函数。
//
// 职责：
//   1. 班级候选：`fetchTeacherScheduleLists` → `{ classes[], … }`（qryBjxx）；
//   2. 名册分页：`fetchTeacherRoster({ bjid, page, pageSize:20, keyword })`；
//   3. 隐私硬约束（最高优先级，与 roster.rs 同规则）：
//      - **未选班级绝不发名册请求**（后端缺 bjid 会直接拒绝，防全校 56957 条）；
//      - 学生列表**只进内存态**，localStorage / sessionStorage / IndexedDB
//        一律不碰，连进程内 Map 快照也不留（退出即清）；
//      - 只渲染后端契约已返回的字段，绝不拼接姓名以外的个人信息；
//   4. 班级列表（不含个人信息）才允许进程内 TTL 快照，语义与
//      useTeacherAttendance 一致（账号+学期隔离、TTL 过期后台再验证）。
//
// 只读：本文件不发起任何写型请求。

import { computed, ref } from 'vue'

import { fetchTeacherRoster, fetchTeacherScheduleLists , fetchTeacherRosterByClass, fetchTeacherGradeEntry } from '../api/teacherApi'
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
export const teacherRosterErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const ROSTER_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidRosterSemester = (value: string): boolean =>
  ROSTER_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialRosterSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidRosterSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidRosterSemester(stored)) return stored
  return deriveSemesterByDate()
}

/** 每页条数：后端夹在 1..=20，前端固定传 20（绝不传更大的值）。 */
export const ROSTER_PAGE_SIZE = 20

// ────────────────────────────────────────────────────────────────
// 视图模型（只取后端契约字段，不臆造）
// ────────────────────────────────────────────────────────────────

/**
 * 班级候选（`schedule-lists` 的 `classes[]` 归一化字段）。
 *
 * ⚠️ `rosterId` 的取值链：`bjid` → `id` → `classNo`（= `bjbh`）。
 *   `xsxxcx` 学生记录里的 `bjdm` 实测形如 `wbj226`，与 `qryBjxx` 的 `bjbh`
 *   同为班级代码；后端名册请求发的是 `query.bjid||`，教务 `bjid` 在这些
 *   jqGrid 页面即班级代码/编号。后端 normalize_class 未保留原始 `id`，
 *   因而 `classNo` 是当前契约下最可信的 `bjid` 值。
 */
export interface TeacherRosterClass {
  key: string
  /** 传给 `fetchTeacherRoster` 的 `bjid`；空串 → 胶囊禁用（绝不裸发请求）。 */
  rosterId: string
  /** 班级编号（bjbh）。 */
  classNo: string
  /** 班级名称（bjmc，展示用）。 */
  className: string
  /** 班级人数（bjrs；null → 徽标不渲染）。 */
  studentCount: number | null
  /** 院系名称（yxmc；仅 tooltip 候选，不主显）。 */
  departmentName: string
  /** 专业名称（zymc；仅 tooltip 候选）。 */
  majorName: string
  /** 入学年份（rxnf）。 */
  enrollYear: string
}

/** 学生名册条目（roster.rs 归一化契约，7 个字段 + key，其余一律不渲染）。 */
export interface TeacherRosterStudent {
  key: string
  /** 学号（xh）。 */
  studentId: string
  /** 姓名（xm，后端已做隐私过滤；教师对自己学生有权可见）。 */
  name: string
  /** 班级代码（bjdm，不回显 UI）。 */
  classId: string
  /** 班级名称（bjmc）。 */
  className: string
  /** 专业名称（zymc）。 */
  majorName: string
  /** 院系代码（yxdm，不回显 UI）。 */
  departmentId: string
  /** 所在年级（sznj）。 */
  grade: string
}

/** 一页名册响应。 */
export interface TeacherRosterPage {
  students: TeacherRosterStudent[]
  total: number
  page: number
  pageSize: number
  /** 后端回显的班级标识（== 发出的 bjid）。 */
  classId: string
}

/** 院系/专业文本：教务字段可能带 HTML，统一走单一清洗入口。 */
const cleanRosterText = (value: unknown): string => stripTeacherHtml(value)

/** 归一化班级候选（`classes[]` 元素）。 */
export const normalizeRosterClass = (value: unknown, index: number): TeacherRosterClass => {
  const record = asRecord(value)
  const classNo = asString(record.classNo ?? record.bjbh)
  // bjid 候选链：显式 bjid/id（后端未来补齐时兼容）→ classNo（班级代码）。
  const rosterId =
    asString(record.bjid ?? record.id) || classNo
  const className = cleanRosterText(record.className ?? record.bjmc)
  return {
    key: buildStableKey([rosterId, classNo, className, index]),
    rosterId,
    classNo,
    className,
    studentCount: asNumber(record.studentCount ?? record.bjrs) ?? null,
    departmentName: cleanRosterText(record.departmentName ?? record.yxmc),
    majorName: cleanRosterText(record.majorName ?? record.zymc),
    enrollYear: asString(record.enrollYear ?? record.rxnf)
  }
}

/** 归一化一名学生（roster.rs 契约字段；其余字段**绝不读取**）。 */
export const normalizeRosterStudent = (
  value: unknown,
  index: number
): TeacherRosterStudent => {
  const record = asRecord(value)
  const studentId = asString(record.studentId ?? record.xh)
  return {
    key: buildStableKey([studentId, asString(record.classId ?? record.bjdm), index]),
    studentId,
    name: stripTeacherHtml(record.name ?? record.xm),
    classId: asString(record.classId ?? record.bjdm),
    className: stripTeacherHtml(record.className ?? record.bjmc),
    majorName: stripTeacherHtml(record.majorName ?? record.zymc),
    departmentId: asString(record.departmentId ?? record.yxdm),
    grade: asString(record.grade ?? record.sznj)
  }
}

/** 解析名册载荷 `{ students, total, page, pageSize, classId }`。 */
export const normalizeRosterPayload = (raw: unknown): TeacherRosterPage => {
  const payload = asRecord(raw)
  const students = dedupeByStableKey(
    asArray(payload.students).map(normalizeRosterStudent),
    (item) => item.key
  )
  return {
    students,
    total: asNumber(payload.total) ?? students.length,
    page: asNumber(payload.page) ?? 1,
    pageSize: asNumber(payload.pageSize) ?? ROSTER_PAGE_SIZE,
    classId: asString(payload.classId)
  }
}

/** 解析班级候选载荷（`{ classes, classTotal, rooms, … }`，只用 classes）。 */
export const normalizeRosterClassList = (raw: unknown): TeacherRosterClass[] =>
  dedupeByStableKey(
    asArray(asRecord(raw).classes).map(normalizeRosterClass),
    (item) => item.key
  )

// ────────────────────────────────────────────────────────────────
// 进程内快照：仅缓存「班级候选」（无个人信息）；学生名册不落地。
// ────────────────────────────────────────────────────────────────

interface RosterClassesSnapshot {
  syncedAt: string
  data: TeacherRosterClass[]
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const ROSTER_CLASSES_CACHE_TTL_MS = 5 * 60 * 1000

const rosterClassesSnapshots = new Map<string, RosterClassesSnapshot>()
const ROSTER_CLASSES_SNAPSHOT_MAX_ENTRIES = 32

const readClassesSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherRosterClass[]; syncedAt: string; stale: boolean } | null => {
  const snapshot = rosterClassesSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > ROSTER_CLASSES_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeClassesSnapshot = (key: string, data: TeacherRosterClass[], syncedAt: string): void => {
  rosterClassesSnapshots.set(key, { syncedAt, data })
  while (rosterClassesSnapshots.size > ROSTER_CLASSES_SNAPSHOT_MAX_ENTRIES) {
    const oldest = rosterClassesSnapshots.keys().next().value
    if (oldest === undefined) break
    rosterClassesSnapshots.delete(oldest)
  }
}

/** 清空班级候选进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherRosterClassSnapshots = (): void => {
  rosterClassesSnapshots.clear()
}

/** 空态错误对象（`status === 'empty'` 的等价错误表示）。 */
const rosterEmptyError = (): TeacherDataError => ({ kind: 'empty', message: '' })

export interface UseTeacherRosterOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存与在途去重。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherRoster = (options: UseTeacherRosterOptions = {}) => {
  const semester = ref(resolveInitialRosterSemester(options.initialSemester))

  // ── 班级候选状态 ──
  const classesState = ref<TeacherLoadState<TeacherRosterClass[]>>({
    status: 'idle',
    data: null,
    error: null
  })
  const classesSeq = ref(0)
  const lastSuccessfulSyncAt = ref('')
  const fromCache = ref(false)
  const snapshotStale = ref(false)

  // ── 名册状态（**仅内存**：班级切换 / 词条变化即整页重置） ──
  const rosterState = ref<TeacherLoadState<TeacherRosterStudent[]>>({
    status: 'idle',
    data: null,
    error: null
  })
  const rosterSeq = ref(0)
  /** 当前选中的班级标识（== bjid）；空串 = 未选，**不发任何名册请求**。 */
  const selectedClassId = ref('')
  const keyword = ref('')

  // goal-22：按教学班列学生（唯一能按班列学生的接口）
  const teachingClasses = ref<Array<{ classId: string; courseName: string; studentCount: number | null }>>([])
  const teachingClassesLoading = ref(false)
  const selectedJxbid = ref('')

  /** 加载教师的教学班列表（复用成绩录入的接口）。 */
  const loadTeachingClasses = async (): Promise<void> => {
    teachingClassesLoading.value = true
    try {
      const state = await fetchTeacherGradeEntry(semester.value || undefined)
      const payload = (state.data || {}) as Record<string, unknown>
      const list = Array.isArray(payload.teachingClasses)
        ? (payload.teachingClasses as Array<Record<string, unknown>>)
        : []
      teachingClasses.value = list
        .map((item) => ({
          classId: String(item.classId || '').trim(),
          courseName: String(item.courseName || '').trim(),
          studentCount: typeof item.studentCount === 'number' ? item.studentCount : null
        }))
        .filter((item) => item.classId)
    } catch {
      teachingClasses.value = []
    } finally {
      teachingClassesLoading.value = false
    }
  }

  /** 选中教学班 → 拉该班学生（含 20 周考勤）。 */
  const selectTeachingClass = async (jxbid: string): Promise<void> => {
    const next = jxbid.trim()
    selectedJxbid.value = next
    if (!next) {
      rosterState.value = { status: 'ready', data: [], error: null }
      total.value = 0
      return
    }
    rosterState.value = { status: 'loading', data: [], error: null }
    try {
      const state = await fetchTeacherRosterByClass({ jxbid: next, page: 1, pageSize: ROSTER_PAGE_SIZE })
      const payload = (state.data || {}) as Record<string, unknown>
      const students = Array.isArray(payload.students)
        ? (payload.students as Array<Record<string, unknown>>)
        : []
      rosterState.value = {
        status: 'ready',
        error: null,
        data: students.map((item, index) => ({
          key: String(item.studentId || index),
          studentId: String(item.studentId || ''),
          name: String(item.name || ''),
          classId: String(item.classId || ''),
          className: String(item.className || ''),
          majorName: String(item.majorName || ''),
          departmentId: String(item.departmentName || ''),
          grade: String(item.grade || ''),
          courseName: String(item.courseName || ''),
          weeks: Array.isArray(item.weeks) ? (item.weeks as string[]) : [],
          recordedWeeks: typeof item.recordedWeeks === 'number' ? item.recordedWeeks : 0
        }))
      }
      total.value = typeof payload.total === 'number' ? payload.total : students.length
    } catch (err) {
      rosterState.value = {
        status: 'error',
        data: [],
        error: { kind: 'unknown', message: err instanceof Error ? err.message : String(err) }
      }
    }
  }
  /** 后端回显的总数（该班级总学生数）；-1 = 尚未拉到。 */
  const total = ref(-1)
  /** 是否还有下一页（students.length < total）。 */
  const hasMore = ref(false)
  /** 累积分页时上次失败停在哪页（-1 = 无历史失败）。 */
  const lastLoadedPage = ref(0)

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('roster', accountId.value, semester.value)
  )
  /** 进程内快照键（仅班级候选用）；账号缺失时为空串（fail-closed）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const classes = computed<TeacherRosterClass[]>(() => classesState.value.data ?? [])
  const students = computed<TeacherRosterStudent[]>(() => rosterState.value.data ?? [])
  const selectedClass = computed<TeacherRosterClass | null>(
    () => classes.value.find((item) => item.rosterId === selectedClassId.value) ?? null
  )
  const loadedCount = computed(() => students.value.length)

  const classesLoading = computed(() => classesState.value.status === 'loading')
  const classesError = computed(() => classesState.value.status === 'error')
  const classesErrorKey = computed(() =>
    classesState.value.error ? teacherRosterErrorKey(classesState.value.error.kind) : ''
  )
  const classesEmpty = computed(
    () => classesState.value.status === 'empty' || classes.value.length === 0
  )

  const rosterLoading = computed(() => rosterState.value.status === 'loading')
  const rosterError = computed(() => rosterState.value.status === 'error')
  const rosterReady = computed(() => rosterState.value.status === 'ready')
  const rosterErrorKey = computed(() =>
    rosterState.value.error ? teacherRosterErrorKey(rosterState.value.error.kind) : ''
  )
  const hasStudents = computed(() => students.value.length > 0)

  /** #1066 同款诚实同步状态（仅描述「班级候选」这一路）。 */
  const syncStatus = computed<TeacherSyncStatus>(() =>
    resolveTeacherSyncStatus({
      phase: classesState.value.status,
      hasData: classesState.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: classesState.value.error?.kind ?? null
    })
  )

  // ── 名册拉取（隐私硬约束的落点）──────────────────────────────

  /** 清空名册内存态（切班级 / 切学期 / 清空搜索词时调用）。 */
  const resetRoster = (): void => {
    rosterSeq.value += 1
    rosterState.value = { status: 'idle', data: null, error: null }
    total.value = -1
    hasMore.value = false
    lastLoadedPage.value = 0
  }

  /**
   * 拉取一页名册。**未选班级 / rosterId 为空 → 直接返回，一个字节都不发。**
   *
   * - `page` 从 1 开始；`page > 1` 为累积追加；
   * - 过期响应（已换班 / 已有更新请求）一律丢弃。
   */
  const fetchRosterPage = async (page: number): Promise<void> => {
    // 🔴 隐私红线（goal-22 实测修正）：该接口**只支持按姓名过滤**
    // （xm 裸参数有效，bjid/bjbh/bjdm/xh 全部无效，恒返全校 56957 条），
    // 所以姓名必填，不填绝不发请求。
    const kw = keyword.value.trim()
    if (!kw) return
    const seq = ++rosterSeq.value
    const scope = scopeKey.value
    const account = accountId.value
    const term = semester.value
    
    rosterState.value = {
      status: 'loading',
      data: rosterState.value.data,
      error: null
    }
    const result = await fetchTeacherRoster(
      { bjid: '', page, pageSize: ROSTER_PAGE_SIZE, keyword: kw },
      { scope: account }
    )
    // 过期丢弃：换了班级 / 学期 / 关键词 / 账号，或已有更新的请求在飞。
    if (seq !== rosterSeq.value) return
    if (scope !== scopeKey.value || term !== semester.value) return
    if (kw !== keyword.value.trim()) return

    if (result.status === 'ready' && result.data) {
      const parsed = normalizeRosterPayload(result.data)
      total.value = parsed.total
      lastLoadedPage.value = parsed.page
      const merged = page > 1
        ? dedupeByStableKey([...(rosterState.value.data ?? []), ...parsed.students], (item) => item.key)
        : parsed.students
      hasMore.value = merged.length < parsed.total
      rosterState.value =
        merged.length === 0
          ? { status: 'empty', data: null, error: rosterEmptyError() }
          : { status: 'ready', data: merged, error: null }
      return
    }

    if (result.status === 'empty') {
      total.value = page > 1 ? total.value : 0
      lastLoadedPage.value = page
      const previous = page > 1 ? (rosterState.value.data ?? []) : []
      hasMore.value = previous.length < Math.max(total.value, 0)
      rosterState.value =
        previous.length === 0
          ? { status: 'empty', data: null, error: rosterEmptyError() }
          : { status: 'ready', data: previous, error: null }
      return
    }

    // 失败：保留已拉到的学生，错误态由视图分「整页错误 / 翻页错误」渲染。
    rosterState.value = { status: 'error', data: rosterState.value.data, error: result.error }
  }

  /**
   * 选中班级（隐私收口点）：`rosterId` 为空拒绝选中；
   * 选中后重置名册并拉第 1 页。**classId 传空只清空，不发请求。**
   */
  const selectClass = async (rosterId: string): Promise<void> => {
    const next = rosterId.trim()
    if (!next) {
      selectedClassId.value = ''
      resetRoster()
      return
    }
    if (next === selectedClassId.value) return
    selectedClassId.value = next
    resetRoster()
    await fetchRosterPage(1)
  }

  /** 搜索词更新（视图 300ms 防抖后调用）：重置并从第 1 页重拉。 */
  const setKeyword = async (value: string): Promise<void> => {
    const next = value.trim()
    if (next === keyword.value) return
    keyword.value = next
    if (!selectedClassId.value.trim()) return
    resetRoster()
    await fetchRosterPage(1)
  }

  /** 滚动到底追加下一页（无更多 / 在飞 / 未就绪时 no-op）。 */
  const loadMore = async (): Promise<void> => {
    if (!selectedClassId.value.trim()) return
    if (!hasMore.value || rosterLoading.value) return
    await fetchRosterPage(lastLoadedPage.value + 1)
  }

  /** 名册重试：已有数据 → 续拉下一页；无数据 → 重拉第 1 页。 */
  const retryRoster = async (): Promise<void> => {
    if (!selectedClassId.value.trim()) return
    if (rosterState.value.data && rosterState.value.data.length > 0) {
      await fetchRosterPage(lastLoadedPage.value + 1)
      return
    }
    await fetchRosterPage(1)
  }

  // ── 班级候选拉取 ──

  const applyClassesSnapshot = (snapshot: RosterClassesSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    classesState.value =
      snapshot.data.length === 0
        ? { status: 'empty', data: null, error: rosterEmptyError() }
        : { status: 'ready', data: snapshot.data, error: null }
  }

  const revalidateClasses = async (account: string, key: string): Promise<void> => {
    const seq = ++classesSeq.value
    const scope = scopeKey.value
    classesState.value = { status: 'loading', data: classesState.value.data, error: null }
    const result = await fetchTeacherScheduleLists(
      { semester: semester.value },
      { scope: account }
    )
    if (seq !== classesSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const list = normalizeRosterClassList(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (list.length === 0) {
        classesState.value = { status: 'empty', data: null, error: rosterEmptyError() }
        return
      }
      if (key) writeClassesSnapshot(key, list, syncedAt)
      classesState.value = { status: 'ready', data: list, error: null }
      return
    }

    if (result.status === 'empty') {
      lastSuccessfulSyncAt.value = new Date().toISOString()
      fromCache.value = false
      snapshotStale.value = false
      classesState.value = { status: 'empty', data: null, error: rosterEmptyError() }
      return
    }

    classesState.value = {
      status: 'error',
      data: classesState.value.data,
      error: result.error
    }
  }

  /** 拉取班级候选（TTL 内直读快照；过期后台再验证；force 跳过缓存）。 */
  const loadClasses = async (opts: { force?: boolean } = {}): Promise<void> => {
    const account = accountId.value
    const key = snapshotKey.value
    if (!opts.force && key) {
      const snapshot = readClassesSnapshot(key)
      if (snapshot) {
        applyClassesSnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale)
        if (!snapshot.stale) return
      }
    }
    await revalidateClasses(account, key)
  }

  /** 初始化：拉班级候选（不会顺带拉名册——名册必须等用户选班）。 */
  const load = async (): Promise<void> => {
    await loadClasses()
  }

  /** 切换学期：清候选 + 清选中 + 清名册，重新拉班级。 */
  const setSemester = async (value: string): Promise<void> => {
    const next = normalizeSemester(value)
    if (!isValidRosterSemester(next) || next === semester.value) return
    semester.value = next
    classesState.value = { status: 'idle', data: null, error: null }
    lastSuccessfulSyncAt.value = ''
    fromCache.value = false
    snapshotStale.value = false
    selectedClassId.value = ''
    keyword.value = ''
    resetRoster()
    await loadClasses()
  }

  /** 班级候选重试（强制绕过缓存）。 */
  const retryClasses = (): Promise<void> => loadClasses({ force: true })

  /** 离开页面时清空名册内存态（PII 不残留）。 */
  const clearRoster = (): void => {
    selectedClassId.value = ''
    keyword.value = ''
    resetRoster()
  }

  return {
    semester,
    accountId,
    scopeKey,
    // 班级候选
    classesState,
    classes,
    classesLoading,
    classesError,
    classesErrorKey,
    classesEmpty,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    // 名册（内存态）
    rosterState,
    students,
    selectedClassId,
    selectedClass,
    keyword,
    total,
    hasMore,
    loadedCount,
    lastLoadedPage,
    rosterLoading,
    rosterError,
    rosterReady,
    rosterErrorKey,
    hasStudents,
    // 行为
    load,
    loadClasses,
    selectClass,
    setKeyword,
    loadMore,
    retryRoster,
    retryClasses,
    setSemester,
    clearRoster,
    teachingClasses,
    teachingClassesLoading,
    selectedJxbid,
    loadTeachingClasses,
    selectTeachingClass
  }
}
