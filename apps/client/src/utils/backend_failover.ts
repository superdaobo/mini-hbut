/**
 * backend_failover：后端端点组故障转移状态机（契约 §6）。
 *
 * 策略（v1，2026-10-02 冻结）：**主组优先，冷却跳过**。
 * - 请求按「未冷却组，数组原顺序」尝试，最多 `failover.maxAttemptsPerRequest` 个；
 * - 失败（网络错误 / 超时 / 5xx，由调用方判定）→ 记入冷却表（localStorage 持久化，跨重启有效）；
 * - 成功 → 清除该组冷却；若成功的组与上次不同则广播 `hbu-backend-endpoints-updated`；
 * - 4xx / 业务错误不触发切换（调用方不调用 markGroupFailed 即可）。
 *
 * 冷却表持久化的意义：主组长时间不可用时，冷启动直接走兜底，不用每次都撞超时；
 * 冷却到期后主组自动回到候选序列（无需后台轮询），保证主域名恢复后自动回归。
 *
 * 本文件是叶子模块：只依赖 backend_endpoints 的类型与常量。
 */
import {
  DEFAULT_BACKEND_FAILOVER,
  type BackendFailoverConfig,
  type BackendGroup
} from './backend_endpoints'

/** 冷却表与最后成功组的持久化键（契约 §6.3） */
export const BACKEND_FAILED_GROUPS_KEY = 'hbu_backend_failed_groups_v1'
/** 生效组变化事件（UI / 诊断可监听） */
export const BACKEND_ENDPOINTS_UPDATED_EVENT = 'hbu-backend-endpoints-updated'

/** 陈旧冷却记录的清理阈值（避免无限增长） */
const STALE_RECORD_MS = 24 * 60 * 60 * 1000

export interface BackendFailoverSnapshot {
  /** groupId -> 冷却截止时间戳（ms） */
  failedUntil: Record<string, number>
  /** 最近一次成功的组 id（全冷却时的优先候选） */
  lastSucceededGroupId: string
}

/**
 * 空快照工厂：必须每次返回**全新对象**。
 * 历史缺陷：曾用模块级常量 + 浅冻结，`failedUntil` 被写入方原地修改后永久污染，
 * 导致空读取带回旧失败记录（冷却状态清不掉）。禁止改回共享常量。
 */
const createEmptySnapshot = (): BackendFailoverSnapshot => ({
  failedUntil: {},
  lastSucceededGroupId: ''
})

const safeText = (value: unknown): string => String(value ?? '').trim()

const safeStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const sanitizeSnapshot = (raw: unknown, now: number): BackendFailoverSnapshot => {
  const block = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawFailed =
    block.failedUntil && typeof block.failedUntil === 'object'
      ? (block.failedUntil as Record<string, unknown>)
      : {}
  const failedUntil: Record<string, number> = {}
  for (const [key, value] of Object.entries(rawFailed)) {
    const id = safeText(key)
    const until = Number(value)
    if (!id || !Number.isFinite(until) || until <= 0) continue
    if (until < now - STALE_RECORD_MS) continue
    failedUntil[id] = until
  }
  return { failedUntil, lastSucceededGroupId: safeText(block.lastSucceededGroupId) }
}

export const readFailoverSnapshot = (now = Date.now()): BackendFailoverSnapshot => {
  const storage = safeStorage()
  if (!storage) return createEmptySnapshot()
  try {
    const raw = storage.getItem(BACKEND_FAILED_GROUPS_KEY)
    if (!raw) return createEmptySnapshot()
    return sanitizeSnapshot(JSON.parse(raw), now)
  } catch {
    return createEmptySnapshot()
  }
}

export const writeFailoverSnapshot = (snapshot: BackendFailoverSnapshot, now = Date.now()): void => {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(BACKEND_FAILED_GROUPS_KEY, JSON.stringify(sanitizeSnapshot(snapshot, now)))
  } catch {
    // 存储不可用（隐私模式/配额）时静默降级为内存态
  }
}

export const resetBackendFailover = (): void => {
  const storage = safeStorage()
  try {
    storage?.removeItem(BACKEND_FAILED_GROUPS_KEY)
  } catch {
    // ignore
  }
}

/** 某组当前是否处于冷却期 */
export const isGroupCooling = (groupId: string, now = Date.now()): boolean => {
  const id = safeText(groupId)
  if (!id) return false
  const snapshot = readFailoverSnapshot(now)
  return (snapshot.failedUntil[id] || 0) > now
}

/**
 * 通用候选排序（契约 §6.3）：与 `planAttemptOrder` 同一策略，
 * 供「端点条目」等非 BackendGroup 结构复用（云同步/OCR 等多端点通道）。
 * - `failover.enabled=false` → 只返回首项；
 * - 正常态 → 「未冷却项」按原顺序，最多 `maxAttemptsPerRequest` 个；
 * - 全部冷却 → 优先"上次成功的项"，否则首项（保证至少尝试一次）。
 */
export const orderCandidatesById = <T>(
  items: readonly T[],
  getId: (item: T) => string,
  failover?: BackendFailoverConfig | null,
  now = Date.now()
): T[] => {
  const config = failover || DEFAULT_BACKEND_FAILOVER
  if (!items || items.length === 0) return []
  if (!config.enabled) return items.slice(0, 1)
  const snapshot = readFailoverSnapshot(now)
  const available = items.filter((item) => (snapshot.failedUntil[getId(item)] || 0) <= now)
  if (available.length > 0) {
    return available.slice(0, Math.max(1, config.maxAttemptsPerRequest))
  }
  const fallbackPick =
    items.find((item) => getId(item) === snapshot.lastSucceededGroupId) || items[0]
  return [fallbackPick]
}

/**
 * 规划一次请求的组尝试顺序（契约 §6.3）：
 * - `failover.enabled=false` → 只返回首组（等价旧单端点行为）；
 * - 正常态 → 「未冷却组」按原顺序，最多 `maxAttemptsPerRequest` 个；
 * - 全部处于冷却期 → 优先"上次成功的组"，否则首组（保证至少尝试一次）。
 */
export const planAttemptOrder = (input: {
  groups: readonly BackendGroup[]
  failover?: BackendFailoverConfig | null
  now?: number
}): BackendGroup[] => {
  const enabled = (input.groups || []).filter((group) => group && group.enabled)
  return orderCandidatesById(enabled, (group) => group.id, input.failover, input.now)
}

/** 标记组失败：写入冷却截止时间（默认 failureTtlSeconds 秒） */
export const markGroupFailed = (
  groupId: string,
  failover?: BackendFailoverConfig | null,
  now = Date.now()
): void => {
  const id = safeText(groupId)
  if (!id) return
  const ttlSeconds = Math.max(
    30,
    Number(failover?.failureTtlSeconds) || DEFAULT_BACKEND_FAILOVER.failureTtlSeconds
  )
  const snapshot = readFailoverSnapshot(now)
  const next: BackendFailoverSnapshot = {
    failedUntil: { ...snapshot.failedUntil, [id]: now + ttlSeconds * 1000 },
    lastSucceededGroupId: snapshot.lastSucceededGroupId
  }
  writeFailoverSnapshot(next, now)
}

/**
 * 标记组成功：清除该组冷却、记录为最后成功组；组发生变化时广播事件。
 * 返回 `{ changed }`——本次成功的组是否与上次不同（供调用方决定 UI 提示）。
 */
export const markGroupSucceeded = (groupId: string, now = Date.now()): { changed: boolean } => {
  const id = safeText(groupId)
  if (!id) return { changed: false }
  const snapshot = readFailoverSnapshot(now)
  const changed = snapshot.lastSucceededGroupId !== id
  const failedUntil = { ...snapshot.failedUntil }
  delete failedUntil[id]
  writeFailoverSnapshot({ failedUntil, lastSucceededGroupId: id }, now)
  if (changed && typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    try {
      globalThis.dispatchEvent(
        new CustomEvent(BACKEND_ENDPOINTS_UPDATED_EVENT, { detail: { groupId: id } })
      )
    } catch {
      // ignore：事件仅用于提示，失败不影响状态
    }
  }
  return { changed }
}
