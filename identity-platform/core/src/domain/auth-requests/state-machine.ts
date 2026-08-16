/**
 * AuthRequest 状态机（#619 / #617 第 12 条信任边界）。
 *
 * 推荐状态链：
 *   CREATED → WAITING_APP → APP_OPENED → APPROVED → INTERACTION_FINISHED
 *     → CODE_ISSUED → CONSUMED
 * 异常终态：DENIED / EXPIRED / CANCELLED / FAILED
 *
 * 语义：
 * - CODE_ISSUED / CONSUMED 属于 oidc-provider 协议 artifact 的观测点，
 *   通过 audit 事件观测（不复制协议状态作为业务事实来源），
 *   但仍纳入状态机，供 #620/#621 精确驱动流程；
 * - 所有迁移必须经过本模块的 ALLOWED_TRANSITIONS 校验 + DB 原子条件更新；
 * - 终态（CONSUMED/DENIED/EXPIRED/CANCELLED/FAILED）不可再迁移。
 *
 * #621 消费合同（request_id 格式 / TTL）见 core/docs/contract.md。
 */

export const AUTH_REQUEST_STATUSES = [
  'CREATED',
  'WAITING_APP',
  'APP_OPENED',
  'APPROVED',
  'INTERACTION_FINISHED',
  'CODE_ISSUED',
  'CONSUMED',
  'DENIED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
] as const

export type AuthRequestStatus = (typeof AUTH_REQUEST_STATUSES)[number]

/** 合法迁移表：每个状态允许迁移到的目标状态 */
export const ALLOWED_TRANSITIONS: Readonly<Record<AuthRequestStatus, readonly AuthRequestStatus[]>> = {
  CREATED: ['WAITING_APP', 'CANCELLED', 'EXPIRED', 'FAILED'],
  WAITING_APP: ['APP_OPENED', 'APPROVED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED'],
  APP_OPENED: ['APPROVED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED'],
  APPROVED: ['INTERACTION_FINISHED', 'FAILED'],
  INTERACTION_FINISHED: ['CODE_ISSUED', 'FAILED'],
  CODE_ISSUED: ['CONSUMED', 'FAILED'],
  CONSUMED: [],
  DENIED: [],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: [],
}

const TERMINAL: ReadonlySet<AuthRequestStatus> = new Set<AuthRequestStatus>([
  'CONSUMED', 'DENIED', 'EXPIRED', 'CANCELLED', 'FAILED',
])

export function isTerminalStatus(status: AuthRequestStatus): boolean {
  return TERMINAL.has(status)
}

export function isAllowedTransition(from: AuthRequestStatus, to: AuthRequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** approve 允许的来源状态（App 可直接批准，不必先打 open 标记） */
export const APPROVE_FROM_STATUSES: readonly AuthRequestStatus[] = ['WAITING_APP', 'APP_OPENED']

/** deny 允许的来源状态 */
export const DENY_FROM_STATUSES: readonly AuthRequestStatus[] = ['WAITING_APP', 'APP_OPENED']

/** 任意非终态状态集合（用于懒过期） */
export function nonTerminalStatuses(): AuthRequestStatus[] {
  return AUTH_REQUEST_STATUSES.filter((s) => !TERMINAL.has(s))
}
