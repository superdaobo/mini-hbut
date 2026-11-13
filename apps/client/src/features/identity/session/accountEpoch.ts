// src/features/identity/session/accountEpoch.ts
//
// Epic #1243（G1-05 / mini-hbut#1249）：**账号代际（account epoch）**的唯一事实源。
//
// 为什么需要它：切号（A→B）或登出时，A 账号的异步任务（网络请求、iframe 票据、
// 桥响应、OIDC 回调、云同步队列）可能在 B 已经生效之后才返回。若这些迟到结果
// 被写进当前状态，就会出现「A 的成绩/会话/授权出现在 B 的界面里」——Epic §2.B.5
// 明确要求「切号必须使旧应用会话退出、隔离或不可继续使用旧身份」。
//
// 做法：每次「登录成功 / 登出 / 切号」都把代际 +1；任何异步任务在**发起时**抓一个
// 代际，在**落地前**用 `isCurrentEpoch(epoch)` 复核，不一致就丢弃结果。
//
// 边界（刻意保持极小）：
// - 不读 localStorage、不发请求、不 import 任何 coordinator（避免循环依赖）；
// - 只有内存态：进程重启后归零是**正确**的（重启后不存在「上一个账号的在途任务」）；
// - 监听器异常必须隔离（一个监听器抛错不能影响其它监听器，更不能影响 bump 本身）。

export interface AccountEpochInfo {
  /** 单调递增的代际；0 = 初始（尚未发生登录/登出/切号） */
  epoch: number
  /** 最近一次推进的原因（审计用，仅内部/日志，不含学号） */
  reason: string
  /** 最近一次推进的时刻（unix 毫秒；0 = 从未推进） */
  at: number
}

export type AccountEpochListener = (info: AccountEpochInfo) => void

let currentEpoch = 0
let currentReason = 'init'
let currentAt = 0
const listeners = new Set<AccountEpochListener>()

/** 当前代际（只读）。 */
export const getAccountEpoch = (): number => currentEpoch

/** 当前代际的完整信息（含原因与时刻）。 */
export const getAccountEpochInfo = (): AccountEpochInfo => ({
  epoch: currentEpoch,
  reason: currentReason,
  at: currentAt
})

/**
 * 推进代际并通知监听器，返回**新**代际。
 *
 * 调用时机（冻结）：学校登录成功、登出、切号。**不要**在普通页面切换/刷新时调用——
 * 那会让所有在途任务被无谓作废。
 */
export const bumpAccountEpoch = (
  reason: string,
  now: () => number = Date.now
): number => {
  currentEpoch += 1
  currentReason = String(reason || 'unknown').slice(0, 64)
  try {
    currentAt = Number(now()) || 0
  } catch {
    currentAt = 0
  }
  const info = getAccountEpochInfo()
  for (const listener of Array.from(listeners)) {
    try {
      listener(info)
    } catch {
      // 单个监听器异常不得影响其它监听器，也不得让 bump 抛错（调用点在登录主流程里）
    }
  }
  return currentEpoch
}

/** 该代际是否仍是当前代际（异步任务落地前的复核点）。 */
export const isCurrentEpoch = (candidate: number): boolean =>
  Number(candidate) === currentEpoch

/** 语义化的取反版本：`true` = 结果已过期，必须丢弃。 */
export const discardIfStale = (candidate: number): boolean =>
  !isCurrentEpoch(candidate)

/**
 * 订阅代际变化，返回取消订阅函数。
 *
 * 用途：协调器在切号时清理自己的在途状态（如停止轮询、清空队列、作废 iframe）。
 * 注意：监听器**同步**执行，不要在里面做重活（需要异步请自行 `queueMicrotask`）。
 */
export const subscribeAccountEpoch = (listener: AccountEpochListener): (() => void) => {
  if (typeof listener !== 'function') return () => undefined
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 仅供测试：重置到初始态（生产代码不应调用）。 */
export const __resetAccountEpochForTests = (): void => {
  currentEpoch = 0
  currentReason = 'init'
  currentAt = 0
  listeners.clear()
}
