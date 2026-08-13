// src/features/identity/identityIntentStore.ts
//
// #621：Identity 授权请求意图（Pending External Intent）内存 store。
//
// 只负责“外部意图 → 短期内存调度”，不建立任何后台实时连接：
//   - 状态机：idle / received / loading / ready / awaiting_local_login / approving / done / error；
//   - 并发策略：同时只有一个 active 授权请求，其余进入内存队列（上限 3）；
//   - 同 request_id 去重；队列超限返回明确提示文案；
//   - 一个请求完成/拒绝/过期后再自动推进下一个。
//
// 安全红线：handoff secret 仅存于内存（本模块闭包内），
// 禁止写入 localStorage / IndexedDB / SQLite / debug logs / crash report metadata。

export type IdentityIntentPhase =
  | 'idle'
  | 'received'
  | 'loading'
  | 'ready'
  | 'awaiting_local_login'
  | 'approving'
  | 'done'
  | 'error'

/**
 * 外部授权意图合同（供 #622/#623 消费的稳定入口类型）。
 * 仅内存：requestId + handoff 不持久化、不打印。
 */
export interface IdentityIntent {
  requestId: string
  /** 短期 handoff secret（仅内存） */
  handoff: string
  /** 到达时间戳（ms） */
  arrivedAt: number
}

/** 队列中/活跃中的授权请求（Intent + 运行时状态） */
export interface PendingExternalIntent extends IdentityIntent {
  phase: IdentityIntentPhase
  /** 请求详情（短期内存，由后续 Identity Client 的 GET request detail 填充，#622） */
  detail?: unknown
  /** 错误说明（通用文案，不含 handoff） */
  error?: string
}

export interface IdentityIntentSnapshot {
  phase: IdentityIntentPhase
  active: PendingExternalIntent | null
  queue: PendingExternalIntent[]
  /** 最近一个已终态请求（UI 完成反馈用），无则 null */
  lastCompleted: PendingExternalIntent | null
}

export type IdentityEnqueueResult =
  | { accepted: true }
  | { accepted: false; reason: 'duplicate' | 'queue-full'; message: string }

/** 内存队列上限：并发待处理授权请求不超过 3 个 */
export const IDENTITY_QUEUE_MAX = 3

/** 队列超限提示（issue #621 指定文案） */
export const IDENTITY_QUEUE_FULL_MESSAGE = '已有多个待处理授权，请先完成当前请求'

const DUPLICATE_MESSAGE = '该授权请求已存在，请先完成当前请求'

// ─── 模块级内存状态（单一实例，不持久化） ────────────────────────────────────

let phase: IdentityIntentPhase = 'idle'
let activeIntent: PendingExternalIntent | null = null
const queue: PendingExternalIntent[] = []
let lastCompleted: PendingExternalIntent | null = null

type StoreListener = () => void
const listeners = new Set<StoreListener>()

const notify = (): void => {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // 单个订阅者异常不阻断其他订阅者
    }
  }
}

const toPending = (intent: IdentityIntent): PendingExternalIntent => ({
  requestId: intent.requestId,
  handoff: intent.handoff,
  arrivedAt: intent.arrivedAt,
  phase: 'received'
})

const promoteNext = (): void => {
  activeIntent = queue.shift() ?? null
  phase = activeIntent ? 'received' : 'idle'
}

// ─── 对外只读快照 / 订阅 ─────────────────────────────────────────────────────

export const getIdentityIntentSnapshot = (): IdentityIntentSnapshot => ({
  phase,
  active: activeIntent ? { ...activeIntent } : null,
  queue: queue.map((item) => ({ ...item })),
  lastCompleted: lastCompleted ? { ...lastCompleted } : null
})

export const subscribeIdentityIntentStore = (listener: StoreListener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ─── 写操作 ───────────────────────────────────────────────────────────────────

/**
 * 提交外部授权意图（深链 / 后续二维码扫描的统一入口）。
 * - 同 request_id 去重（活跃 + 队列）；
 * - 队列超限（>3）时拒绝并返回提示；
 * - 无活跃请求时立即成为 active。
 */
export const enqueueIdentityIntent = (intent: IdentityIntent): IdentityEnqueueResult => {
  const exists =
    (activeIntent !== null && activeIntent.requestId === intent.requestId) ||
    queue.some((item) => item.requestId === intent.requestId)
  if (exists) {
    return { accepted: false, reason: 'duplicate', message: DUPLICATE_MESSAGE }
  }
  if (queue.length >= IDENTITY_QUEUE_MAX) {
    return { accepted: false, reason: 'queue-full', message: IDENTITY_QUEUE_FULL_MESSAGE }
  }
  queue.push(toPending(intent))
  if (activeIntent === null) promoteNext()
  notify()
  return { accepted: true }
}

/**
 * 推进活跃请求状态（#622 GET request detail 后调用）：
 * received -> loading -> ready -> awaiting_local_login -> approving；任何状态可 -> error。
 */
export const setIdentityIntentPhase = (
  requestId: string,
  nextPhase: Exclude<IdentityIntentPhase, 'done' | 'error'> | 'error',
  options: { detail?: unknown; error?: string } = {}
): void => {
  if (activeIntent === null || activeIntent.requestId !== requestId) return
  activeIntent.phase = nextPhase
  if (options.detail !== undefined) activeIntent.detail = options.detail
  if (nextPhase === 'error') activeIntent.error = options.error || '授权请求处理失败'
  notify()
}

/**
 * 完成/拒绝/过期当前请求：标记终态（done/error）后自动推进队列中的下一个。
 */
export const completeIdentityIntent = (
  requestId: string,
  status: 'done' | 'error',
  error?: string
): void => {
  if (activeIntent === null || activeIntent.requestId !== requestId) return
  activeIntent.phase = status
  if (status === 'error') activeIntent.error = error || '授权请求处理失败'
  lastCompleted = { ...activeIntent }
  activeIntent = queue.shift() ?? null
  phase = activeIntent ? 'received' : 'idle'
  notify()
}

/** 主动丢弃某个等待中的请求（队列内或活跃），例如用户取消/请求过期 */
export const dismissIdentityIntent = (requestId: string): void => {
  let changed = false
  if (activeIntent !== null && activeIntent.requestId === requestId) {
    activeIntent = queue.shift() ?? null
    phase = activeIntent ? 'received' : 'idle'
    changed = true
  } else {
    const index = queue.findIndex((item) => item.requestId === requestId)
    if (index >= 0) {
      queue.splice(index, 1)
      changed = true
    }
  }
  if (changed) notify()
}

/** 清空全部意图与终态记录（登出/测试重置用） */
export const resetIdentityIntentStore = (): void => {
  queue.length = 0
  activeIntent = null
  lastCompleted = null
  phase = 'idle'
  notify()
}
