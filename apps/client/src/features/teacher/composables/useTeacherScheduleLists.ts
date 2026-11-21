// src/features/teacher/composables/useTeacherScheduleLists.ts
//
// Teacher Portal（goal-21 / T12）：教师「班级课表 / 教室课表」查询入口数据编排。
//
// 硬限制（Lead 实测，两个页面共用）：
//   1. 教务课表 `ckbjkb` 是**服务端渲染 HTML**（课表直接渲进 <td> 网格，含
//      rowspan，页内 kbjcObj 为空对象）——**没有 JSON 课表数据**；
//   2. App 没有通用 WebView 命令（school_website_embed_open 硬编码官网首页），
//      课表页只能经 `openExternal` 在系统浏览器打开。
//   → 因此本 composable 只编排「班级列表 / 教室列表」两个**入口清单**，
//     绝不产出课表网格所需的任何结构，绝不编造课程数据。
//
// 职责：
//   1. `fetchTeacherScheduleLists` → `{ classes[], classTotal, rooms[],
//      roomTotal, scheduleSource }`，归一化为已核实字段的视图模型；
//   2. 语义与 useTeacherAttendance / useTeacherRoster 同构：作用域键隔离账号+学期、
//      请求序号丢弃过期响应、进程级快照缓存（TTL 内直读、过期后台再验证）、
//      诚实同步状态；
//   3. `keyword` 走接口参数（300ms 防抖在视图层）；教室的楼栋筛选是**本地**
//      精确匹配（buildingName），不发请求；
//   4. 「最近查看的班级」仅记**班级编号+名称**（无个人信息），按教师作用域
//      写入 localStorage；账号未知时 fail-closed 不落盘。
//
// 只读：本文件不发起任何写型请求。

import { computed, ref } from 'vue'

import { fetchTeacherScheduleLists } from '../api/teacherApi'
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
export const teacherScheduleListsErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const SCHEDULE_LISTS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidScheduleListsSemester = (value: string): boolean =>
  SCHEDULE_LISTS_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialScheduleListsSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidScheduleListsSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidScheduleListsSemester(stored)) return stored
  return deriveSemesterByDate()
}

// ────────────────────────────────────────────────────────────────
// 视图模型（只取后端契约字段，不臆造）
// ────────────────────────────────────────────────────────────────

/** 班级入口（`classes[]` 归一化字段）。 */
export interface TeacherScheduleClass {
  key: string
  /** 班级编号（bjbh，如 `wbj001-3`）。 */
  classNo: string
  /** 班级名称（bjmc，如 `12机自_机设2`）。 */
  className: string
  /** 班级人数（bjrs）。 */
  studentCount: number | null
  /** 入学年份（rxnf，如 `2025`）。 */
  enrollYear: string
  /** 校区代码（xqdm）。 */
  campusId: string
  /** 院系名称（yxmc）。 */
  departmentName: string
  /** 专业名称（zymc）。 */
  majorName: string
  /** 加密班级 ID（课表页跳转参数之一；不参与 UI）。 */
  encodeId: string
  /** 学期（xnxq）。 */
  semester: string
  /**
   * 后端已拼好的完整课表页 URL（encodeId/classNo/campusId/semester 四参数齐全）。
   * **可能为空**：任一参数缺失时后端不生成——此时卡片不可点，
   * 视图必须呈现「该班级缺少课表参数」。
   */
  scheduleUrl: string
}

/** 教室入口（`rooms[]` 归一化字段）。 */
export interface TeacherScheduleRoom {
  key: string
  /** 教室编号（jsbh）。 */
  roomNo: string
  /** 教室名称（jsmc，如 `3号-305`）。 */
  roomName: string
  /** 教学楼代码（jxldm）。 */
  buildingId: string
  /** 教学楼名称（jxlmc，如 `3号`；楼栋筛选胶囊即按它去重）。 */
  buildingName: string
  /** 校区名称（xqmc，如 `本部`）。 */
  campusName: string
  /** 教室类型编码（jslx；语义未验证，仅原样展示）。 */
  roomType: string
  /** 座位容量（zdskrnrs）。 */
  capacity: number | null
    /** 加密 ID（goal-22：教室课表查询必须要它）。 */
    encodeId: string
    /** 学期（xnxq）。 */
    semester: string
    /** 校区代码（xqdm）。 */
    campusId: string
}

/** 课表来源说明（后端 `scheduleSource`；`reason` 可直接展示）。 */
export interface TeacherScheduleSource {
  kind: string
  pagePath: string
  /** 后端写的说明文案（服务端渲染 HTML 的原因），可直接展示。 */
  reason: string
  /** 打开课表页所需参数名清单。 */
  requiresParams: string[]
}

/** 整份清单载荷（班级 + 教室 + 来源说明，同一次请求返回）。 */
export interface TeacherScheduleListsData {
  classes: TeacherScheduleClass[]
  classTotal: number
  rooms: TeacherScheduleRoom[]
  roomTotal: number
  scheduleSource: TeacherScheduleSource
}

// ────────────────────────────────────────────────────────────────
// 归一化
// ────────────────────────────────────────────────────────────────

/** 归一化一个班级入口（`classes[]` 元素）。 */
export const normalizeScheduleClass = (
  value: unknown,
  index: number
): TeacherScheduleClass => {
  const record = asRecord(value)
  const classNo = asString(record.classNo ?? record.bjbh)
  const className = stripTeacherHtml(record.className ?? record.bjmc)
  const encodeId = asString(record.encodeId)
  const semester = normalizeSemester(record.semester ?? record.xnxq)
  return {
    key: buildStableKey([encodeId, classNo, className, semester, index]),
    classNo,
    className,
    studentCount: asNumber(record.studentCount ?? record.bjrs) ?? null,
    enrollYear: asString(record.enrollYear ?? record.rxnf),
    campusId: asString(record.campusId ?? record.xqdm),
    departmentName: stripTeacherHtml(record.departmentName ?? record.yxmc),
    majorName: stripTeacherHtml(record.majorName ?? record.zymc),
    encodeId,
    semester,
    scheduleUrl: asString(record.scheduleUrl)
  }
}

/** 归一化一个教室入口（`rooms[]` 元素）。 */
export const normalizeScheduleRoom = (
  value: unknown,
  index: number
): TeacherScheduleRoom => {
  const record = asRecord(value)
  const roomNo = asString(record.roomNo ?? record.jsbh)
  const roomName = stripTeacherHtml(record.roomName ?? record.jsmc)
  const buildingName = stripTeacherHtml(record.buildingName ?? record.jxlmc)
  return {
    key: buildStableKey([roomNo, roomName, buildingName, index]),
    roomNo,
    roomName,
    buildingId: asString(record.buildingId ?? record.jxldm),
    buildingName,
    campusName: stripTeacherHtml(record.campusName ?? record.xqmc),
    roomType: asString(record.roomType ?? record.jslx),
    capacity: asNumber(record.capacity ?? record.zdskrnrs) ?? null,
    encodeId: asString(record.encodeId),
    semester: asString(record.semester ?? record.xnxq),
    campusId: asString(record.campusId ?? record.xqdm),
  }
}

/** 解析冻结契约载荷；空数组保持为空数组（视图渲染分页空态，不整体转 empty）。 */
export const normalizeScheduleListsPayload = (raw: unknown): TeacherScheduleListsData => {
  const payload = asRecord(raw)
  const classes = dedupeByStableKey(
    asArray(payload.classes).map(normalizeScheduleClass),
    (item) => item.key
  )
  const rooms = dedupeByStableKey(
    asArray(payload.rooms).map(normalizeScheduleRoom),
    (item) => item.key
  )
  const sourceRecord = asRecord(payload.scheduleSource)
  return {
    classes,
    classTotal: asNumber(payload.classTotal) ?? classes.length,
    rooms,
    roomTotal: asNumber(payload.roomTotal) ?? rooms.length,
    scheduleSource: {
      kind: asString(sourceRecord.kind),
      pagePath: asString(sourceRecord.pagePath),
      reason: stripTeacherHtml(sourceRecord.reason),
      requiresParams: asArray(sourceRecord.requiresParams).map((item) => asString(item))
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface ScheduleListsSnapshot {
  syncedAt: string
  data: TeacherScheduleListsData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const SCHEDULE_LISTS_CACHE_TTL_MS = 5 * 60 * 1000

const scheduleListsSnapshots = new Map<string, ScheduleListsSnapshot>()
const SCHEDULE_LISTS_SNAPSHOT_MAX_ENTRIES = 32

const readScheduleListsSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherScheduleListsData; syncedAt: string; stale: boolean } | null => {
  const snapshot = scheduleListsSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > SCHEDULE_LISTS_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeScheduleListsSnapshot = (
  key: string,
  data: TeacherScheduleListsData,
  syncedAt: string
): void => {
  scheduleListsSnapshots.set(key, { syncedAt, data })
  while (scheduleListsSnapshots.size > SCHEDULE_LISTS_SNAPSHOT_MAX_ENTRIES) {
    const oldest = scheduleListsSnapshots.keys().next().value
    if (oldest === undefined) break
    scheduleListsSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherScheduleListsSnapshots = (): void => {
  scheduleListsSnapshots.clear()
}

// ────────────────────────────────────────────────────────────────
// 最近查看的班级（localStorage，按教师作用域隔离；仅班级编号+名称，无个人信息）
// ────────────────────────────────────────────────────────────────

/** 最多保留的最近班级数（设计规格：横滑胶囊展示最近 3 个）。 */
export const SCHEDULE_RECENT_CLASS_LIMIT = 3

const SCHEDULE_RECENT_STORAGE_PREFIX = 'hbu_teacher_schedule_recent_classes'

/** 最近班级存储键：`teacher:{accountId}:scheduleRecent`（账号缺失 → '' 不落盘）。 */
const recentStorageKey = (accountId: string): string => {
  const account = normalizeScopeAccountId(accountId)
  if (!account) return ''
  return `${SCHEDULE_RECENT_STORAGE_PREFIX}:${buildTeacherScopedKey(
    'scheduleRecent',
    account,
    '_'
  )}`
}

/** 读最近班级（损坏 JSON / 非数组 → 空；只保留仍在当前列表语义内的轻量记录）。 */
const readRecentClasses = (key: string): TeacherScheduleClass[] => {
  if (!key) return []
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, index) => normalizeScheduleClass(item, index))
      .filter((item) => item.classNo || item.className)
      .slice(0, SCHEDULE_RECENT_CLASS_LIMIT)
  } catch {
    return []
  }
}

const writeRecentClasses = (key: string, items: TeacherScheduleClass[]): void => {
  if (!key) return
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(items))
  } catch {
    // localStorage 不可用：静默降级为「不记忆」，不影响主流程
  }
}

/** 空态错误对象（`status === 'empty'` 的等价错误表示）。 */
const scheduleListsEmptyError = (): TeacherDataError => ({ kind: 'empty', message: '' })

export interface UseTeacherScheduleListsOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存与在途去重。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

export const useTeacherScheduleLists = (options: UseTeacherScheduleListsOptions = {}) => {
  const semester = ref(resolveInitialScheduleListsSemester(options.initialSemester))
  /** 搜索关键词（trim 后参与请求；空串 = 不传 keyword）。 */
  const keyword = ref('')
  const state = ref<TeacherLoadState<TeacherScheduleListsData>>({
    status: 'idle',
    data: null,
    error: null
  })

  /** 请求序号：仅最新一次请求的结果可落地（丢弃过期响应，防串号/串词）。 */
  const requestSeq = ref(0)
  const lastSuccessfulSyncAt = ref('')
  const fromCache = ref(false)
  const snapshotStale = ref(false)

  /** 楼栋筛选（**本地**精确匹配 buildingName；'' = 全部）。 */
  const buildingFilter = ref('')
  /** 最近查看的班级（localStorage，最多 3 个）。 */
  const recentClasses = ref<TeacherScheduleClass[]>([])

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('scheduleLists', accountId.value, semester.value)
  )
  /** 进程内快照键（不带 keyword——缓存只记「未过滤」首屏，防搜索缓存穿透）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const classes = computed<TeacherScheduleClass[]>(() => state.value.data?.classes ?? [])
  const classTotal = computed(() => state.value.data?.classTotal ?? 0)
  const rooms = computed<TeacherScheduleRoom[]>(() => {
    const list = state.value.data?.rooms ?? []
    const filter = buildingFilter.value
    // goal-22：教室列表**不支持服务端搜索**（实测 jsmc 精确匹配返 0、query.jsmc|| 无效），
    // 所以 keyword 由前端本地匹配（教室名 / 编号）。
    const kw = keyword.value.trim().toLowerCase()
    let out = list
    if (kw) {
      out = out.filter(
        (item) =>
          item.roomName.toLowerCase().includes(kw) ||
          item.roomNo.toLowerCase().includes(kw)
      )
    }
    if (filter) {
      out = out.filter((item) => item.buildingName === filter)
    }
    return out
  })
  /** 未过滤的教室全量（楼栋胶囊据此去重；过滤本身只影响渲染列表）。 */
  const allRooms = computed<TeacherScheduleRoom[]>(() => state.value.data?.rooms ?? [])
  const roomTotal = computed(() => state.value.data?.roomTotal ?? 0)
  const scheduleSource = computed<TeacherScheduleSource | null>(
    () => state.value.data?.scheduleSource ?? null
  )

  /** 楼栋筛选胶囊：buildingName 去重，按覆盖教室数降序（设计规格）。 */
  const buildingChips = computed<Array<{ name: string; count: number }>>(() => {
    const counter = new Map<string, number>()
    for (const room of allRooms.value) {
      if (!room.buildingName) continue
      counter.set(room.buildingName, (counter.get(room.buildingName) ?? 0) + 1)
    }
    return [...counter.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  })

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherScheduleListsErrorKey(state.value.error.kind) : ''
  )

  /** #1066 同款诚实同步状态。 */
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
  const applySnapshot = (snapshot: ScheduleListsSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    const empty =
      snapshot.data.classes.length === 0 && snapshot.data.rooms.length === 0
    state.value = empty
      ? { status: 'empty', data: null, error: scheduleListsEmptyError() }
      : { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    const kw = keyword.value.trim()
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherScheduleLists(
      { semester: semester.value, keyword: kw || undefined },
      { scope: account }
    )
    // 过期响应（已切学期/账号/关键词，或已有更新请求在飞）一律丢弃。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return
    if (kw !== keyword.value.trim()) return

    if (result.status === 'ready' && result.data) {
      const data = normalizeScheduleListsPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      // 带关键词的过滤结果不写「未过滤」快照（防缓存穿透到下次首屏）。
      if (key && !kw) writeScheduleListsSnapshot(key, data, syncedAt)
      if (data.classes.length === 0 && data.rooms.length === 0) {
        state.value = { status: 'empty', data: null, error: scheduleListsEmptyError() }
        return
      }
      state.value = { status: 'ready', data, error: null }
      return
    }

    if (result.status === 'empty') {
      lastSuccessfulSyncAt.value = new Date().toISOString()
      fromCache.value = false
      snapshotStale.value = false
      state.value = { status: 'empty', data: null, error: scheduleListsEmptyError() }
      return
    }

    // 失败：保留上次成功数据（若有），由 syncStatus 标记「已缓存/更新失败」。
    state.value = { status: 'error', data: state.value.data, error: result.error }
  }

  /**
   * 拉取当前学期 + 关键词下的清单。
   *
   * - 非 `force` 且**无关键词**：先读当前账号正确 scope 的快照立即渲染，
   *   TTL 内直接返回；过期则继续后台再验证；
   * - `force` / 带关键词：跳过缓存读取（手动刷新 / 服务端过滤），
   *   仍走同一单飞去重与过期丢弃。
   */
  const load = async (opts: { force?: boolean } = {}): Promise<void> => {
    const scope = scopeKey.value
    const account = accountId.value
    const key = snapshotKey.value
    if (!opts.force && !keyword.value.trim() && key) {
      const snapshot = readScheduleListsSnapshot(key)
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale)
        if (!snapshot.stale) return
      }
    }
    await revalidate(scope, account, key)
  }

  /** 切换学期：仅接受合法学期键；清空当前数据并重新拉取。 */
  const setSemester = async (value: string): Promise<void> => {
    const next = normalizeSemester(value)
    if (!isValidScheduleListsSemester(next) || next === semester.value) return
    semester.value = next
    state.value = { status: 'idle', data: null, error: null }
    lastSuccessfulSyncAt.value = ''
    fromCache.value = false
    snapshotStale.value = false
    buildingFilter.value = ''
    await load()
  }

  /** 搜索词更新（视图 300ms 防抖后调用）：走接口 keyword 参数重新拉取。 */
  const setKeyword = async (value: string): Promise<void> => {
    const next = value.trim()
    if (next === keyword.value) return
    keyword.value = next
    await load()
  }

  /** 重试当前学期 + 关键词（强制绕过缓存）。 */
  const retry = (): Promise<void> => load({ force: true })

  // ── 楼栋筛选（本地，不发请求）──

  /** 切换楼栋筛选：重复点击同楼栋 → 还原全部。 */
  const setBuildingFilter = (name: string): void => {
    const next = name.trim()
    buildingFilter.value = buildingFilter.value === next ? '' : next
  }

  // ── 最近查看的班级（仅班级编号+名称）──

  /** 初始化读取最近班级（账号缺失 → 空，不写不读）。 */
  const loadRecentClasses = (): void => {
    recentClasses.value = readRecentClasses(recentStorageKey(accountId.value))
  }

  /**
   * 把一个班级记入「最近查看」（去重置顶，最多 3 个）。
   * 视图在成功打开课表页（或发起打开）后调用。
   */
  const recordRecentClass = (item: TeacherScheduleClass): void => {
    const entry: TeacherScheduleClass = { ...item }
    const rest = recentClasses.value.filter(
      (old) => !(old.classNo === entry.classNo && old.className === entry.className)
    )
    recentClasses.value = [entry, ...rest].slice(0, SCHEDULE_RECENT_CLASS_LIMIT)
    writeRecentClasses(recentStorageKey(accountId.value), recentClasses.value)
  }

  return {
    semester,
    keyword,
    accountId,
    scopeKey,
    state,
    classes,
    classTotal,
    rooms,
    allRooms,
    roomTotal,
    scheduleSource,
    buildingChips,
    buildingFilter,
    recentClasses,
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
    setKeyword,
    setBuildingFilter,
    retry,
    loadRecentClasses,
    recordRecentClass
  }
}
