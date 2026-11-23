// src/features/teacher/composables/useTeacherWorkflow.ts
//
// Teacher Portal（goal-21 / T08）：教师「只读工作流」数据编排组合函数。
//
// 职责：
//   1. 调用冻结契约 `fetchTeacherWorkflow(semester)`，把
//      `{ myApply, myHandled, myTodo }` 三组 jqGrid 记录解析为视图模型；
//   2. 与 useTeacherAttendance / useTeacherWorkload 同构：作用域键隔离账号/学期、
//      请求序号丢弃过期响应、进程内快照缓存（TTL 直读 + 过期后台再验证）、
//      诚实同步状态；
//   3. **诚实渲染原则**：后端只返回单个 `status` 字段（`checkstatus`/`shzt`
//      三者并存且语义未验证），**没有步骤节点明细**——本页只渲染
//      状态徽章 + 时间跨度 + 可选处理意见，绝不臆造「提交→审核→审批」步骤条；
//   4. `queryprotype` / `sproleqf` / `version` 等内部字段**不展示**；
//      `processInstanceIdEnc` 保留在模型里（网页端跳转详情需要，App 内无入口）。
//
// 只读：本文件不发起任何写型请求。

import { computed, ref } from 'vue'

import { fetchTeacherWorkflow } from '../api/teacherApi'
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
export const teacherWorkflowErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

/** 学期键格式：`2026-2027-1`（与教务实测形态一致）。 */
export const WORKFLOW_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/

/** 学期键是否合法（非法输入不切换，避免把垃圾值发给接口）。 */
export const isValidWorkflowSemester = (value: string): boolean =>
  WORKFLOW_SEMESTER_PATTERN.test(value)

/** 解析初始学期：显式入参 → 本地存储 → 按日期推算（仅接受合法学期键）。 */
export const resolveInitialWorkflowSemester = (explicit?: string): string => {
  const normalized = normalizeSemester(explicit ?? '')
  if (isValidWorkflowSemester(normalized)) return normalized
  const stored = normalizeSemester(readStoredSemester())
  if (isValidWorkflowSemester(stored)) return stored
  return deriveSemesterByDate()
}

/** 三分段胶囊的三个标签页。 */
export type WorkflowTab = 'apply' | 'todo' | 'handled'

/**
 * 状态徽章色调（按 status 文本映射；未知值一律 neutral 灰底原样显示）。
 *
 * 判定顺序（**先驳回后完成再办理中**，「办理」同时含「办」与「结」字时必须保持中立）：
 * - 含「驳回/退回/拒绝」→ rejected（红）
 * - 含「完成/办结/通过」→ done（蓝）
 * - 含「中/审/办」等办理中字样 → pending（橙）
 * - 其它 / 空 → neutral（灰）
 */
export type WorkflowStatusTone = 'done' | 'rejected' | 'pending' | 'neutral'

const WORKFLOW_STATUS_REJECT_KEYWORDS = ['驳回', '退回', '拒绝']
const WORKFLOW_STATUS_DONE_KEYWORDS = ['完成', '办结', '通过']
const WORKFLOW_STATUS_PENDING_KEYWORDS = ['中', '审', '办']

/** status / checkstatus / shzt 三个字段都可能携带状态值且语义未验证：按序取第一个非空。 */
export const resolveWorkflowStatus = (record: Record<string, unknown>): string =>
  asString(record.status) || asString(record.checkstatus) || asString(record.shzt)

/** 状态文本 → 徽章色调（未知值原样展示且不落任何颜色）。 */
export const workflowStatusTone = (status: string): WorkflowStatusTone => {
  const text = status.trim()
  if (!text) return 'neutral'
  if (WORKFLOW_STATUS_REJECT_KEYWORDS.some((word) => text.includes(word))) return 'rejected'
  if (WORKFLOW_STATUS_DONE_KEYWORDS.some((word) => text.includes(word))) return 'done'
  if (WORKFLOW_STATUS_PENDING_KEYWORDS.some((word) => text.includes(word))) return 'pending'
  return 'neutral'
}

/** 「2025-06-30 09:12:03」→「2025-06-30」（只保留日期部分；无法识别时原样返回）。 */
export const workflowDate = (value: string): string => {
  const text = value.trim()
  if (!text) return ''
  const date = text.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : text
}

/** 单条流程实例的视图模型（仅取已核实字段，文本已清洗）。 */
export interface WorkflowRowView {
  /** 稳定 key：优先流程实例 ID，其次行号。 */
  key: string
  /** 流程实例 ID（`id` 或 `processInstanceId`）。 */
  processInstanceId: string
  /** 加密 ID：网页端跳详情用；App 内**不提供**跳转（无该页面）。 */
  processInstanceIdEnc: string
  /** 流程名（`definitionName`，如「调停补申请」）。 */
  title: string
  /** 提交时间（`createTime`，已截到日期）。 */
  createTime: string
  /** 结束时间（`endTime`；未结束为空串）。 */
  endTime: string
  /** 状态原值（status/checkstatus/shzt 第一个非空；全空为 ''）。 */
  status: string
  /** 徽章色调（见 workflowStatusTone）。 */
  tone: WorkflowStatusTone
  /** 处理意见（`clyj`；空串不渲染）。 */
  opinion: string
}

/** 工作流页数据模型：三组列表 + 数量。 */
export interface TeacherWorkflowData {
  counts: Record<WorkflowTab, number>
  apply: WorkflowRowView[]
  todo: WorkflowRowView[]
  handled: WorkflowRowView[]
}

/**
 * 内部字段黑名单（文档级清单）：`queryprotype` / `sproleqf` / `version` 绝不进入
 * 展示面——视图模型按需取字段，天然不会泄露；该集合仅作契约说明供维护者核对。
 */
export const WORKFLOW_HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'queryprotype',
  'sproleqf',
  'version'
])

/** 单条 jqGrid 记录 → 视图模型（只认已核实字段，身份字段后端已剔除）。 */
export const normalizeWorkflowRow = (value: unknown, index: number): WorkflowRowView => {
  const record = asRecord(value)
  const processInstanceId =
    asString(record.processInstanceId) || asString(record.id) || `workflow-row-${index}`
  const status = resolveWorkflowStatus(record)
  return {
    key: processInstanceId,
    processInstanceId,
    processInstanceIdEnc: asString(record.processInstanceIdEnc),
    title: stripTeacherHtml(record.definitionName),
    createTime: workflowDate(asString(record.createTime)),
    endTime: workflowDate(asString(record.endTime)),
    status,
    tone: workflowStatusTone(status),
    opinion: stripTeacherHtml(record.clyj)
  }
}

/** 解析冻结契约载荷 `{ myApply, myHandled, myTodo }`；三组全空时 counts 全 0。 */
export const normalizeWorkflowPayload = (raw: unknown): TeacherWorkflowData => {
  const payload = asRecord(raw)
  const apply = asArray(payload.myApply).map(normalizeWorkflowRow)
  const handled = asArray(payload.myHandled).map(normalizeWorkflowRow)
  const todo = asArray(payload.myTodo).map(normalizeWorkflowRow)
  return {
    counts: { apply: apply.length, todo: todo.length, handled: handled.length },
    apply,
    todo,
    handled
  }
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface WorkflowSnapshot {
  syncedAt: string
  data: TeacherWorkflowData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const WORKFLOW_CACHE_TTL_MS = 5 * 60 * 1000

const workflowSnapshots = new Map<string, WorkflowSnapshot>()
const WORKFLOW_SNAPSHOT_MAX_ENTRIES = 32

const readWorkflowSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherWorkflowData; syncedAt: string; stale: boolean } | null => {
  const snapshot = workflowSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > WORKFLOW_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writeWorkflowSnapshot = (key: string, data: TeacherWorkflowData, syncedAt: string): void => {
  workflowSnapshots.set(key, { syncedAt, data })
  while (workflowSnapshots.size > WORKFLOW_SNAPSHOT_MAX_ENTRIES) {
    const oldest = workflowSnapshots.keys().next().value
    if (oldest === undefined) break
    workflowSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherWorkflowSnapshots = (): void => {
  workflowSnapshots.clear()
}

export interface UseTeacherWorkflowOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
  /** 初始学期；缺省用本地存储的学期，再退回按日期推算。 */
  initialSemester?: string
}

const emptyWorkflowData = (): TeacherWorkflowData => ({
  counts: { apply: 0, todo: 0, handled: 0 },
  apply: [],
  todo: [],
  handled: []
})

export const useTeacherWorkflow = (options: UseTeacherWorkflowOptions = {}) => {
  const semester = ref(resolveInitialWorkflowSemester(options.initialSemester))
  const state = ref<TeacherLoadState<TeacherWorkflowData>>({
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
    buildTeacherScopedKey('workflow', accountId.value, semester.value)
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const data = computed<TeacherWorkflowData | null>(() => state.value.data)
  const counts = computed(() => data.value?.counts ?? { apply: 0, todo: 0, handled: 0 })
  /** 各标签页行列表（无数据时为空数组）。 */
  const rows = computed<Record<WorkflowTab, WorkflowRowView[]>>(() => ({
    apply: data.value?.apply ?? [],
    todo: data.value?.todo ?? [],
    handled: data.value?.handled ?? []
  }))
  const todoCount = computed(() => counts.value.todo)
  /** 三分段是否显示全部空态数据（三组均无记录）。 */
  const allEmpty = computed(
    () => counts.value.apply + counts.value.todo + counts.value.handled === 0
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKey = computed(() =>
    state.value.error ? teacherWorkflowErrorKey(state.value.error.kind) : ''
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
  const applySnapshot = (snapshot: WorkflowSnapshot, stale: boolean): void => {
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
    const result = await fetchTeacherWorkflow(semester.value, { scope: account })
    // 过期响应（已切学期 / 已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const normalized = normalizeWorkflowPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (key) writeWorkflowSnapshot(key, normalized, syncedAt)
      state.value = { status: 'ready', data: normalized, error: null }
      return
    }

    if (result.status === 'empty') {
      // 三段全空是**真实状态**：按 ready + 全零数据渲染，避免整页空态吞掉分段胶囊。
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      const normalized = emptyWorkflowData()
      if (key) writeWorkflowSnapshot(key, normalized, syncedAt)
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
      const snapshot = readWorkflowSnapshot(key)
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
    if (!isValidWorkflowSemester(next) || next === semester.value) return
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
    rows,
    todoCount,
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
