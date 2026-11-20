// src/features/teacher/composables/useTeacherExamAffairs.ts
//
// Teacher Portal（goal-21 / T08）：教师「考试事务」（缓考 / 剩余试卷 / 评教）
// 数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherExamAffairs(semester)`，把
//      `{ deferred, remainingPapers, evalInfo, allEmpty }` 解析为视图模型；
//   2. 与 useTeacherAttendance 同构：作用域键隔离、过期响应丢弃、进程内快照
//      缓存（TTL 直读 + 过期后台再验证）、诚实同步状态；
//   3. **诚实渲染原则**：三列表是教务 jqGrid 原始记录（后端已剔除身份字段），
//      字段名按 recon `jwxt-teacher-probe.json` 的 queryFields 建候选链
//      （hkmdcxjg / ajaxSysj / xspjxxcx 三接口实测列名），取不到的字段显示「—」；
//   4. **allEmpty 压成一句话**：后端显式返回 `allEmpty` 时，视图只显示
//      「本学期暂无相关事项」，绝不堆三个空列表（15-teacher-ui-spec §九）。
//
// 只读：本文件不发起任何写型请求。

import { computed, ref } from 'vue'

import { fetchTeacherExamAffairs } from '../api/teacherApi'
import type {
  TeacherDataErrorKind,
  TeacherLoadState
} from '../types'
import { deriveSemesterByDate, readStoredSemester } from '../../schedule/utils/semester'
import {
  asArray,
  asRecord,
  asString,
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
export const teacherExamAffairsErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const EXAM_AFFAIRS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidExamAffairsSemester = (value: string): boolean =>
  EXAM_AFFAIRS_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialExamAffairsSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidExamAffairsSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidExamAffairsSemester(stored)) return stored
  return deriveSemesterByDate()
}

/** 考试事务页行卡片里的「标签: 值」明细对。 */
export interface ExamAffairDetail {
  key: string
  /** 短中文标签（由调用方 i18n 字典提供）。 */
  label: string
  value: string
}

/** 单条 jqGrid 记录的视图模型（三段共用，字段按段配置提取）。 */
export interface ExamAffairRow {
  key: string
  title: string
  subtitle: string
  /** 可选状态/标记（第一段非空候选值；未知语义原样中性展示）。 */
  status: string
  details: ExamAffairDetail[]
}

/** 考试事务页数据模型。 */
export interface TeacherExamAffairsData {
  deferred: ExamAffairRow[]
  remainingPapers: ExamAffairRow[]
  evalInfo: ExamAffairRow[]
  /** 三项全空（以后端标记为准；字段缺失时按三组全空推导）。 */
  allEmpty: boolean
}

/** 从 record 里按候选字段链取第一个非空字符串。 */
const firstNonEmpty = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = asString(record[key])
    if (value) return value
  }
  return ''
}

interface ExamAffairRowSpec {
  titleKeys: string[]
  subtitleKeys: string[]
  statusKeys: string[]
  /** 明细对：{ 字段候选链, i18n 标签 key（由视图层取词） }。 */
  detailSpecs: { keys: string[]; label: string }[]
}

/** 按段配置提取一行；detail 值全空时该明细对省略。 */
const normalizeExamRow = (
  value: unknown,
  index: number,
  spec: ExamAffairRowSpec
): ExamAffairRow => {
  const record = asRecord(value)
  const details: ExamAffairDetail[] = []
  for (const detailSpec of spec.detailSpecs) {
    const text = firstNonEmpty(record, detailSpec.keys)
    if (!text) continue
    details.push({ key: detailSpec.label, label: detailSpec.label, value: text })
  }
  return {
    key: asString(record.id) || `${spec.titleKeys[0] ?? 'row'}-${index}`,
    title: stripTeacherHtml(firstNonEmpty(record, spec.titleKeys)),
    subtitle: firstNonEmpty(record, spec.subtitleKeys),
    status: firstNonEmpty(record, spec.statusKeys),
    details
  }
}

// ── 三段字段候选链（来源：data/teacher-portal-recon-1120/raw/jwxt-teacher-probe.json）
//    缓考 hkmdcxjg：id,kkyx,kclb,kcmc,skyx,rkjs,cjlrjs,bjmc,xh,name,startTime,endTime,hmkyy,xdxz
//    剩余试卷 ajaxSysj：id,pcId,spindex,rwid,pcmc,kcmc,kcbh,rkjs,skbj,zrs,sjbh,zdsj,fzrxm
//    评教 xspjxxcx：id,bmmc,jsbh,jsxm,kcdm,kcmc,xnxq,sznj,yxmc,zymc,pyccdm,zcdm,zbmbmc,pjsj,kkyxmc,jxbmc,sksjdd,bz

const DEFERRED_SPEC: ExamAffairRowSpec = {
  titleKeys: ['kcmc'],
  subtitleKeys: ['bjmc'],
  statusKeys: [],
  detailSpecs: [
    { keys: ['kkyx'], label: 'teacher.examAffairs.deferred.field.college' },
    { keys: ['skyx'], label: 'teacher.examAffairs.deferred.field.applyCollege' },
    { keys: ['rkjs'], label: 'teacher.examAffairs.deferred.field.teacher' },
    { keys: ['cjlrjs'], label: 'teacher.examAffairs.deferred.field.recorder' },
    { keys: ['startTime'], label: 'teacher.examAffairs.deferred.field.startTime' },
    { keys: ['endTime'], label: 'teacher.examAffairs.deferred.field.endTime' },
    { keys: ['hmkyy'], label: 'teacher.examAffairs.deferred.field.reason' },
    { keys: ['xdxz'], label: 'teacher.examAffairs.deferred.field.limit' }
  ]
}

const PAPERS_SPEC: ExamAffairRowSpec = {
  titleKeys: ['kcmc'],
  subtitleKeys: ['pcmc'],
  statusKeys: [],
  detailSpecs: [
    { keys: ['kcbh'], label: 'teacher.examAffairs.papers.field.courseCode' },
    { keys: ['sjbh'], label: 'teacher.examAffairs.papers.field.paperNo' },
    { keys: ['rkjs'], label: 'teacher.examAffairs.papers.field.teacher' },
    { keys: ['skbj'], label: 'teacher.examAffairs.papers.field.class' },
    { keys: ['zrs'], label: 'teacher.examAffairs.papers.field.total' },
    { keys: ['zdsj'], label: 'teacher.examAffairs.papers.field.time' },
    { keys: ['fzrxm'], label: 'teacher.examAffairs.papers.field.owner' }
  ]
}

const EVAL_SPEC: ExamAffairRowSpec = {
  titleKeys: ['kcmc'],
  subtitleKeys: ['zbmbmc'],
  statusKeys: ['jsxm'],
  detailSpecs: [
    { keys: ['jxbmc'], label: 'teacher.examAffairs.eval.field.class' },
    { keys: ['pjsj'], label: 'teacher.examAffairs.eval.field.time' },
    { keys: ['bmmc'], label: 'teacher.examAffairs.eval.field.dept' },
    { keys: ['yxmc'], label: 'teacher.examAffairs.eval.field.college' },
    { keys: ['sksjdd'], label: 'teacher.examAffairs.eval.field.place' },
    { keys: ['bz'], label: 'teacher.examAffairs.eval.field.note' }
  ]
}

const normalizeExamRows = (list: unknown, spec: ExamAffairRowSpec): ExamAffairRow[] =>
  asArray(list).map((item, index) => normalizeExamRow(item, index, spec))

/** 解析冻结契约载荷 `{ deferred, remainingPapers, evalInfo, allEmpty }`。 */
export const normalizeExamAffairsPayload = (raw: unknown): TeacherExamAffairsData => {
  const payload = asRecord(raw)
  const deferred = normalizeExamRows(payload.deferred, DEFERRED_SPEC)
  const remainingPapers = normalizeExamRows(payload.remainingPapers, PAPERS_SPEC)
  const evalInfo = normalizeExamRows(payload.evalInfo, EVAL_SPEC)
  const allEmpty =
    payload.allEmpty === true ||
    (deferred.length === 0 && remainingPapers.length === 0 && evalInfo.length === 0)
  return { deferred, remainingPapers, evalInfo, allEmpty }
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface ExamAffairsSnapshot {
  syncedAt: string
  data: TeacherExamAffairsData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const EXAM_AFFAIRS_CACHE_TTL_MS = 5 * 60 * 1000

const examAffairsSnapshots = new Map<string, ExamAffairsSnapshot>()
const EXAM_AFFAIRS_SNAPSHOT_MAX_ENTRIES = 32

const readExamAffairsSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherExamAffairsData; syncedAt: string; stale: boolean } | null => {
  const snapshot = examAffairsSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > EXAM_AFFAIRS_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeExamAffairsSnapshot = (
  key: string,
  data: TeacherExamAffairsData,
  syncedAt: string
): void => {
  examAffairsSnapshots.set(key, { syncedAt, data })
  while (examAffairsSnapshots.size > EXAM_AFFAIRS_SNAPSHOT_MAX_ENTRIES) {
    const oldest = examAffairsSnapshots.keys().next().value
    if (oldest === undefined) break
    examAffairsSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherExamAffairsSnapshots = (): void => {
  examAffairsSnapshots.clear()
}

export interface UseTeacherExamAffairsOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

const emptyExamAffairsData = (): TeacherExamAffairsData => ({
  deferred: [],
  remainingPapers: [],
  evalInfo: [],
  allEmpty: true
})

export const useTeacherExamAffairs = (options: UseTeacherExamAffairsOptions = {}) => {
  const semester = ref(resolveInitialExamAffairsSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherExamAffairsData>>({
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
    buildTeacherScopedKey('examAffairs', accountId.value, semester.value)
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const data = computed<TeacherExamAffairsData | null>(() => state.value.data)
  const deferred = computed<ExamAffairRow[]>(() => data.value?.deferred ?? [])
  const remainingPapers = computed<ExamAffairRow[]>(() => data.value?.remainingPapers ?? [])
  const evalInfo = computed<ExamAffairRow[]>(() => data.value?.evalInfo ?? [])
  const allEmpty = computed(() => data.value?.allEmpty === true)
  /** 三宫格计数。 */
  const counts = computed(() => ({
    deferred: deferred.value.length,
    papers: remainingPapers.value.length,
    eval: evalInfo.value.length
  }))

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherExamAffairsErrorKey(state.value.error.kind) : ''
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
  const applySnapshot = (snapshot: ExamAffairsSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    state.value = { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    // 保留已有数据，避免整页闪空（loading 期间仍显示上次内容）
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherExamAffairs(semester.value, { scope: account })
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const normalized = normalizeExamAffairsPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (key) writeExamAffairsSnapshot(key, normalized, syncedAt)
      state.value = { status: 'ready', data: normalized, error: null }
      return
    }

    if (result.status === 'empty') {
      // 空结果是「本学期无相关事项」的真实状态：按 allEmpty=true 的 ready 渲染
      // （三宫格 0 + 一句话空态），不吞掉页头统计。
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      const normalized = emptyExamAffairsData()
      if (key) writeExamAffairsSnapshot(key, normalized, syncedAt)
      state.value = { status: 'ready', data: normalized, error: null }
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
      const snapshot = readExamAffairsSnapshot(key)
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
    if (!isValidExamAffairsSemester(next) || next === semester.value) return
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
    counts,
    deferred,
    remainingPapers,
    evalInfo,
    allEmpty,
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
