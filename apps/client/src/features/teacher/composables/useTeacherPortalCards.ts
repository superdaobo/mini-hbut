// src/features/teacher/composables/useTeacherPortalCards.ts
//
// Teacher Portal（goal-21 / T11）：融合门户「办事大厅」数据编排组合函数。
//
// 职责：
//   1. `fetchTeacherPortalCards` → `{ cards[] }`（cardWid/cardId/cardName/
//      cardType/markNumber），归一化为视图模型并按 cardId 归类；
//   2. 与 useTeacherAttendance 同构：作用域键隔离账号、请求序号丢弃过期响应、
//      进程级快照缓存（TTL 内直读、过期后台再验证）、诚实同步状态；
//   3. **诚实渲染原则（硬性约束）**：
//      - 门户可能整体失败（网关会话 10 分钟过期、errcode=999 且 CASTGC 已失效
//        无法静默恢复 → 后端返回明确错误文案）。此时视图必须显示错误态，
//        **不得**伪造卡片 / 显示空白页；
//      - 卡片只渲染后端给的，**不硬编码**「待办/已办/我的任务/抄送我的」等
//        8 张已知卡——后端返回空 cards 即空态；
//      - `markNumber` 为 null 或 0 → 不显示角标，也不显示假数字。
//
// 只读：本文件不发起任何写型请求。禁止任何持久化存储
//   （localStorage/sessionStorage/indexedDB）；快照全部在进程内 Map。

import { computed, ref } from 'vue'

import { fetchTeacherPortalCards } from '../api/teacherApi'
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
export const teacherPortalErrorKey = (kind: TeacherDataErrorKind): string =>
  `teacher.error.${kind}`

// ────────────────────────────────────────────────────────────────
// 视图模型（只取后端契约字段，不臆造）
// ────────────────────────────────────────────────────────────────

/** 门户任务卡类别（cardId 片段 → 语义；实测 4 张任务卡）。 */
export type PortalTaskKind = 'todo' | 'done' | 'mine' | 'copy'

/** 单张门户卡片。 */
export interface TeacherPortalCard {
  /** 稳定渲染键（cardWid + cardId，缺失按索引兜底）。 */
  key: string
  cardWid: string
  cardId: string
  /** 卡片名称（cardName；可能为空串，视图按 cardId 兜底显示）。 */
  cardName: string
  cardType: string
  /** 角标数字；null/0 → 不显示角标。 */
  markNumber: number | null
  /** 任务卡类别；非任务卡为 null（进「全部服务」宫格）。 */
  taskKind: PortalTaskKind | null
}

/** 办事大厅数据模型。 */
export interface TeacherPortalCardsData {
  cards: TeacherPortalCard[]
}

/** cardId 是否含指定片段（大小写不敏感，防御大小写漂移）。 */
const cardIdContains = (cardId: string, needle: string): boolean =>
  cardId.toUpperCase().includes(needle)

/** cardId → 任务卡类别；非任务卡返回 null。 */
export const classifyPortalCardKind = (cardId: string): PortalTaskKind | null => {
  if (cardIdContains(cardId, 'TODOTASK')) return 'todo'
  if (cardIdContains(cardId, 'DONETASK')) return 'done'
  if (cardIdContains(cardId, 'MYTASK')) return 'mine'
  if (cardIdContains(cardId, 'COPYME')) return 'copy'
  return null
}

/** 归一化单张卡片（markNumber 兼容数字/数字字符串；非法 → null）。 */
export const normalizePortalCard = (value: unknown, index: number): TeacherPortalCard => {
  const record = asRecord(value)
  const cardId = asString(record.cardId)
  const cardWid = asString(record.cardWid)
  return {
    key: buildStableKey([cardWid, cardId]) || `portal-card-${index}`,
    cardWid,
    cardId,
    cardName: normalizeTeacherText(record.cardName),
    cardType: asString(record.cardType),
    markNumber: asNumber(record.markNumber) ?? null,
    taskKind: classifyPortalCardKind(cardId)
  }
}

/** 解析冻结契约载荷 `{ cards }`；按稳定键去重保序，**不补任何假卡片**。 */
export const normalizePortalCardsPayload = (raw: unknown): TeacherPortalCardsData => ({
  cards: dedupeByStableKey(
    asArray(asRecord(raw).cards).map(normalizePortalCard),
    (item) => item.key
  )
})

/** 角标是否可见（null/0/负数一律不显示）。 */
export const portalBadgeVisible = (card: TeacherPortalCard): boolean =>
  card.markNumber !== null && card.markNumber > 0

/** 角标文本（>99 收敛为 `99+`）。 */
export const portalBadgeText = (card: TeacherPortalCard): string => {
  if (!portalBadgeVisible(card)) return ''
  const value = Math.floor(card.markNumber ?? 0)
  return value > 99 ? '99+' : String(value)
}

// ────────────────────────────────────────────────────────────────
// 进程内快照缓存（TTL 内直读；过期先渲染后后台再验证）
// ────────────────────────────────────────────────────────────────

interface PortalCardsSnapshot {
  syncedAt: string
  data: TeacherPortalCardsData
}

/** TTL：与 teacherSnapshotStore 的 teaching 资源一致（5 分钟）。 */
export const PORTAL_CACHE_TTL_MS = 5 * 60 * 1000

const portalSnapshots = new Map<string, PortalCardsSnapshot>()
const PORTAL_SNAPSHOT_MAX_ENTRIES = 32

const readPortalSnapshot = (
  key: string,
  now: number = Date.now()
): { data: TeacherPortalCardsData; syncedAt: string; stale: boolean } | null => {
  const snapshot = portalSnapshots.get(key)
  if (!snapshot) return null
  const syncedAtMs = Date.parse(snapshot.syncedAt)
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > PORTAL_CACHE_TTL_MS
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale }
}

const writePortalSnapshot = (key: string, data: TeacherPortalCardsData, syncedAt: string): void => {
  portalSnapshots.set(key, { syncedAt, data })
  while (portalSnapshots.size > PORTAL_SNAPSHOT_MAX_ENTRIES) {
    const oldest = portalSnapshots.keys().next().value
    if (oldest === undefined) break
    portalSnapshots.delete(oldest)
  }
}

/** 清空本资源全部进程内快照（账号切换 / 登出时调用）。 */
export const clearTeacherPortalCardsSnapshots = (): void => {
  portalSnapshots.clear()
}

export interface UseTeacherPortalCardsOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。 */
  accountId?: () => string
}

export const useTeacherPortalCards = (options: UseTeacherPortalCardsOptions = {}) => {
  const state = ref<TeacherLoadState<TeacherPortalCardsData>>({
    status: 'idle',
    data: null,
    error: null
  })

  /** 请求序号：仅最新一次请求的结果可落地。 */
  const requestSeq = ref(0)

  /** 最后一次**成功**同步时间（ISO）；空串 = 尚未成功同步。 */
  const lastSuccessfulSyncAt = ref('')
  const fromCache = ref(false)
  const snapshotStale = ref(false)

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  const scopeKey = computed(() =>
    buildTeacherScopedKey('portal-cards', accountId.value, 'all')
  )
  /** 进程内快照键；账号缺失时为空串（fail-closed，不落缓存防串号）。 */
  const snapshotKey = computed(() =>
    canPersistTeacherState(accountId.value) ? scopeKey.value : ''
  )

  const cards = computed<TeacherPortalCard[]>(() => state.value.data?.cards ?? [])
  /** 4 张任务卡（todo/done/mine/copy）；实际张数可能不足 4，按契约顺序排序。 */
  const taskCards = computed<TeacherPortalCard[]>(() => {
    const order: PortalTaskKind[] = ['todo', 'done', 'mine', 'copy']
    return cards.value
      .filter((item) => item.taskKind !== null)
      .sort((a, b) => order.indexOf(a.taskKind as PortalTaskKind) - order.indexOf(b.taskKind as PortalTaskKind))
  })
  /** 其余卡进「全部服务」宫格。 */
  const serviceCards = computed<TeacherPortalCard[]>(() =>
    cards.value.filter((item) => item.taskKind === null)
  )

  const isLoading = computed(() => state.value.status === 'loading')
  const isEmpty = computed(() => state.value.status === 'empty')
  const isReady = computed(() => state.value.status === 'ready')
  const isError = computed(() => state.value.status === 'error')
  const errorKind = computed<TeacherDataErrorKind | null>(
    () => state.value.error?.kind ?? null
  )
  const errorKey = computed(() =>
    state.value.error ? teacherPortalErrorKey(state.value.error.kind) : ''
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
      errorKind: errorKind.value
    })
  )

  /** 应用一条快照到视图状态（缓存优先渲染，不触发网络）。 */
  const applySnapshot = (snapshot: PortalCardsSnapshot, stale: boolean): void => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt
    fromCache.value = true
    snapshotStale.value = stale
    const empty = snapshot.data.cards.length === 0
    state.value = empty
      ? { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
      : { status: 'ready', data: snapshot.data, error: null }
  }

  /** 后台再验证（可取消 / 单飞由 teacherApi 层保证）。 */
  const revalidate = async (scope: string, account: string, key: string): Promise<void> => {
    const seq = ++requestSeq.value
    state.value = { status: 'loading', data: state.value.data, error: null }
    const result = await fetchTeacherPortalCards({ scope: account })
    // 过期响应（已切账号 / 已有更新请求）一律丢弃，防止串号。
    if (seq !== requestSeq.value || scope !== scopeKey.value) return

    if (result.status === 'ready' && result.data) {
      const data = normalizePortalCardsPayload(result.data)
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (data.cards.length === 0) {
        // 网关 200 但卡片布局为空：按空态呈现（**不补假卡**）。
        state.value = { status: 'empty', data: null, error: { kind: 'empty', message: '' } }
        return
      }
      if (key) writePortalSnapshot(key, data, syncedAt)
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

    // 失败（含网关会话失效）：保留上次成功数据（若有）。
    state.value = { status: 'error', data: state.value.data, error: result.error }
  }

  /**
   * 拉取卡片布局。
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
      const snapshot = readPortalSnapshot(key)
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale)
        if (!snapshot.stale) return
      }
    }
    await revalidate(scope, account, key)
  }

  /** 重试（强制绕过缓存）。 */
  const retry = (): Promise<void> => load({ force: true })

  return {
    accountId,
    scopeKey,
    state,
    cards,
    taskCards,
    serviceCards,
    isLoading,
    isEmpty,
    isReady,
    isError,
    errorKind,
    errorKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    retry
  }
}
