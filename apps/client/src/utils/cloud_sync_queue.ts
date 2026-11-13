// src/utils/cloud_sync_queue.ts
//
// Epic #1243（G4-02 / mini-hbut#1260）：**持久化待同步队列**（按学号 × 数据域）。
//
// ## 为什么需要它
//
// 现有云同步是「登录时上传一次 + 少数事件触发」（`cloud_sync.ts:425+`）：断网、切号、
// 进程被杀都会丢掉本地变更；也无法表达「手动刷新得到的变更优先上传」。
//
// 本模块只做**队列语义**（纯函数 + 可注入存储），不碰网络：
// - key = `学号 × 数据域`，同 key **单飞**（同一时刻只有一条在途）；
// - 内容摘要相同 → 不重复入队（防写放大）；
// - 手动刷新写入 `priority='high'`，调度时优先；
// - 失败按「指数退避 + 抖动 + Retry-After」重排，**不丢变更**；
// - 学号隔离：切号只处理当前学号，`purgeSid` 可清掉旧学号的残留。
//
// ## 边界（刻意不做的）
//
// - **不做网络**：谁来发、发什么由调用方决定（`cloud_sync.ts` / Tauri 侧）；
// - **不做加密**：队列里只放**元数据**（域、摘要、版本、优先级），不放业务数据本身
//   —— 业务数据仍在既有缓存里，队列只记「哪个域脏了、要基于哪个版本传」；
// - **不做时钟同步**：`nextAt` 用本地时钟，服务端 429 的 `Retry-After` 由调用方折算后传入。

export type QueueState = 'dirty' | 'queued' | 'inflight' | 'acked' | 'failed' | 'blocked'

export type QueuePriority = 'high' | 'normal'

export interface QueueEntry {
  /** 学号（队列按学号隔离） */
  sid: string
  /** 数据域（与契约 §3.3 一致：profile/schedule/grades/exams/rank/custom_courses/personal_events） */
  domain: string
  state: QueueState
  priority: QueuePriority
  /** 内容摘要（由调用方算好；相同 → 不重复入队） */
  contentHash: string
  /** 本次上传基于的服务端版本（CAS 用） */
  baseVersion: number
  /** 已尝试次数（0 = 从未尝试） */
  attempts: number
  /** 最早可发送时刻（unix ms；0 = 立即可发） */
  nextAt: number
  /** 幂等键：同一 (学号,域,基础版本,摘要) 恒定，重放无害 */
  idempotencyKey: string
  /** 最近一次状态变更时刻（unix ms） */
  updatedAt: number
}

export interface QueueStorage {
  read(): QueueEntry[]
  write(entries: QueueEntry[]): void
}

export interface EnqueueInput {
  sid: string
  domain: string
  contentHash: string
  baseVersion?: number
  /** 手动刷新 / 用户主动操作 → high */
  priority?: QueuePriority
  /** 注入时钟（测试用） */
  now?: number
}

/** 退避上限（1 小时）；超过就按 1 小时重试，避免「越失败越久」导致永不重试 */
export const MAX_BACKOFF_MS = 60 * 60 * 1000

/** 基础退避（1 秒），实际为 `base * 2^attempts` 并加抖动 */
export const BASE_BACKOFF_MS = 1000

const safeText = (value: unknown): string => String(value ?? '').trim()

/**
 * 幂等键：`(学号, 域, 基础版本, 内容摘要)` 的确定性拼接。
 *
 * 为什么不用 hash：客户端不需要抗碰撞的密码学摘要（这里只是去重键），
 * 直接拼接可读、可调试、无异步 crypto 依赖。真要去重强度由服务端 content_hash 兜底。
 */
export const idempotencyKeyFor = (
  sid: string,
  domain: string,
  baseVersion: number,
  contentHash: string
): string =>
  `${safeText(sid)}|${safeText(domain)}|${Number(baseVersion) || 0}|${safeText(contentHash)}`

/**
 * 指数退避 + 抖动。`attempts` 从 0 开始：
 * 第 1 次失败 → 约 1s；第 2 次 → 约 2s；… 上限 `MAX_BACKOFF_MS`。
 *
 * `retryAfterMs`（服务端 `Retry-After` 折算值）优先：服务端说等多久就等多久，
 * 但不得小于退避值（防止被响应头里的 0 绕过限流）。
 */
export const backoffDelay = (
  attempts: number,
  retryAfterMs = 0,
  random: () => number = Math.random
): number => {
  const n = Math.max(0, Math.floor(Number(attempts) || 0))
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, n))
  // 抖动 ±20%：避免大量客户端同时重试形成风暴
  const jitter = 0.8 + Math.max(0, Math.min(1, Number(random()) || 0)) * 0.4
  const withJitter = Math.round(exp * jitter)
  const serverWait = Math.max(0, Math.floor(Number(retryAfterMs) || 0))
  return Math.min(MAX_BACKOFF_MS, Math.max(withJitter, serverWait))
}

/**
 * 该条目是否可立即发送。
 *
 * `queued` / `failed` / **`blocked`** 三种状态在到点后都可重试：
 * - `failed`：失败退避到期 → 重试；
 * - `blocked`：429 冷却到期 → 重试。
 *
 * **`blocked` 必须包含在内**：否则被限流的条目会永久卡死（既不被选中、也不失败），
 * 等于任务无声丢失（审查 PR #1280 指出的真实缺陷）。
 */
export const isSendable = (entry: QueueEntry, now: number): boolean =>
  (entry.state === 'queued' || entry.state === 'failed' || entry.state === 'blocked') &&
  entry.nextAt <= now

/**
 * 入队（幂等 + 优先级提升）。
 *
 * 规则：
 * - 同 `(sid, domain)` 已存在且 `contentHash` 相同 → **不新建**（防写放大），
 *   但若本次是 `high` 而队列里是 `normal` → 提升优先级（用户手动刷新应插队）；
 * - 已存在但摘要不同 → **替换**（同 key 单飞：只保留最新内容）；
 * - 新条目 → `queued`，`nextAt=0`（立即可发）。
 */
export const enqueue = (entries: QueueEntry[], input: EnqueueInput): QueueEntry[] => {
  const sid = safeText(input.sid)
  const domain = safeText(input.domain)
  if (!sid || !domain) return entries
  const contentHash = safeText(input.contentHash)
  const baseVersion = Number(input.baseVersion) || 0
  const priority: QueuePriority = input.priority === 'high' ? 'high' : 'normal'
  const now = Number(input.now) || 0
  const key = `${sid}|${domain}`

  const next: QueueEntry[] = []
  let replaced = false
  for (const entry of entries) {
    if (`${entry.sid}|${entry.domain}` !== key) {
      next.push(entry)
      continue
    }
    replaced = true
    if (entry.contentHash === contentHash) {
      // 内容没变：只在需要时提升优先级，不重置 attempts/nextAt（否则会把退避清空）
      next.push(
        priority === 'high' && entry.priority !== 'high'
          ? { ...entry, priority: 'high', updatedAt: now }
          : entry
      )
      continue
    }
    next.push({
      sid,
      domain,
      state: 'queued',
      priority: priority === 'high' ? 'high' : entry.priority,
      contentHash,
      baseVersion,
      attempts: 0,
      nextAt: 0,
      idempotencyKey: idempotencyKeyFor(sid, domain, baseVersion, contentHash),
      updatedAt: now
    })
  }
  if (!replaced) {
    next.push({
      sid,
      domain,
      state: 'queued',
      priority,
      contentHash,
      baseVersion,
      attempts: 0,
      nextAt: 0,
      idempotencyKey: idempotencyKeyFor(sid, domain, baseVersion, contentHash),
      updatedAt: now
    })
  }
  return next
}

/** 取下一个应发送的条目：**high 优先**，同优先级按 `nextAt` 升序（先到先发）。 */
export const pickNext = (
  entries: QueueEntry[],
  now: number,
  sid?: string
): QueueEntry | null => {
  const wantedSid = sid === undefined ? '' : safeText(sid)
  const candidates = entries.filter(
    (entry) =>
      isSendable(entry, now) && (wantedSid ? entry.sid === wantedSid : true)
  )
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1
    if (a.nextAt !== b.nextAt) return a.nextAt - b.nextAt
    return a.updatedAt - b.updatedAt
  })
  return candidates[0]
}

/** 标记在途（同 key 单飞：调用方应保证同一时刻只对一条 inflight）。 */
export const markInflight = (entries: QueueEntry[], key: string, now: number): QueueEntry[] =>
  entries.map((entry) =>
    entry.idempotencyKey === key ? { ...entry, state: 'inflight', updatedAt: now } : entry
  )

/** 标记成功：从队列移除（已确认写入云端，无需保留）。 */
export const markAcked = (entries: QueueEntry[], key: string): QueueEntry[] =>
  entries.filter((entry) => entry.idempotencyKey !== key)

/** 标记失败：`attempts+1`，按退避重排；**不丢条目**。 */
export const markFailed = (
  entries: QueueEntry[],
  key: string,
  now: number,
  options: { retryAfterMs?: number; random?: () => number } = {}
): QueueEntry[] =>
  entries.map((entry) => {
    if (entry.idempotencyKey !== key) return entry
    const attempts = entry.attempts + 1
    const delay = backoffDelay(attempts, options.retryAfterMs || 0, options.random || Math.random)
    return { ...entry, state: 'failed', attempts, nextAt: now + delay, updatedAt: now }
  })

/** 标记限流（429）：保持 `blocked` 直到 `retryAfterMs` 之后，attempts 不加（不是失败） */
export const markBlocked = (
  entries: QueueEntry[],
  key: string,
  now: number,
  retryAfterMs: number
): QueueEntry[] =>
  entries.map((entry) =>
    entry.idempotencyKey === key
      ? {
          ...entry,
          state: 'blocked',
          nextAt: now + Math.max(0, Math.floor(Number(retryAfterMs) || 0)),
          updatedAt: now
        }
      : entry
  )

/** 把 `inflight` 复位为 `queued`（进程重启/崩溃恢复：在途状态不可信）。 */
export const recoverInflight = (entries: QueueEntry[], now: number): QueueEntry[] =>
  entries.map((entry) =>
    entry.state === 'inflight' ? { ...entry, state: 'queued', updatedAt: now } : entry
  )

/** 清掉指定学号的条目（切号/登出时用；其它学号的条目保留）。 */
export const purgeSid = (entries: QueueEntry[], sid: string): QueueEntry[] => {
  const target = safeText(sid)
  if (!target) return entries
  return entries.filter((entry) => entry.sid !== target)
}

/** 统计（状态页用）：按学号过滤后的各状态数量 + 待同步总数。 */
export const summarize = (
  entries: QueueEntry[],
  sid?: string
): Record<QueueState | 'pending', number> => {
  const wantedSid = sid === undefined ? '' : safeText(sid)
  const scoped = wantedSid ? entries.filter((entry) => entry.sid === wantedSid) : entries
  const result: Record<QueueState | 'pending', number> = {
    dirty: 0,
    queued: 0,
    inflight: 0,
    acked: 0,
    failed: 0,
    blocked: 0,
    pending: 0
  }
  for (const entry of scoped) {
    result[entry.state] += 1
  }
  result.pending = result.queued + result.inflight + result.failed + result.blocked + result.dirty
  return result
}

/** 便捷封装：把「读-改-写」包一层，调用方不必关心存储细节。 */
export const withQueue = (storage: QueueStorage) => ({
  all: (): QueueEntry[] => storage.read(),
  update: (fn: (entries: QueueEntry[]) => QueueEntry[]): QueueEntry[] => {
    const next = fn(storage.read())
    storage.write(next)
    return next
  }
})
