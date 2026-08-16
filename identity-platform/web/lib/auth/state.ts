/**
 * 授权接力页状态机（纯 reducer，可单测）。
 *
 * 页面状态流转：
 *   LOADING → WAITING_APP → APP_OPENED → APPROVED → REDIRECTING
 *   │            │             │           │
 *   └─ 任一网络失败 → NETWORK_ERROR（自动退避重试，非终态，恢复后回到原阶段）
 *   终态：REDIRECTING / DENIED / EXPIRED / INVALID / CLIENT_UNAVAILABLE
 *   APPROVED 是半终态：轮询停止，但允许 resume 相关事件（RESUME_OK/RESUME_ERROR/RETRY_RESUME）。
 *
 * 正确性约定（issue #630）：
 *  - 过期判断始终以 Core（expires_at/status）为准；本地倒计时只做展示与停止轮询；
 *  - 硬终态后任何事件都是 no-op（重复 resume / 重复 status 不产生任何副作用）；
 *  - 本状态机不含任何网络调用，便于纯函数测试。
 */
import type { CoreRequestStatus, RequestDetailDTO } from '@/lib/core-client/contract'

export type HandoffPhase =
  | 'LOADING'
  | 'WAITING_APP'
  | 'APP_OPENED'
  | 'APPROVED'
  | 'REDIRECTING'
  | 'DENIED'
  | 'EXPIRED'
  | 'INVALID'
  | 'CLIENT_UNAVAILABLE'
  | 'NETWORK_ERROR'

export type HandoffLastError =
  | 'missing_handoff'
  | 'invalid_handoff'
  | 'not_found'
  | 'expired'
  | 'client_unavailable'
  | 'network'
  | 'resume'
  | null

export interface HandoffState {
  phase: HandoffPhase
  detail: RequestDetailDTO | null
  /** resume 成功后由 Core 决定的回调（绝不来自 URL 参数） */
  redirectTo: string | null
  /** resume 重试计数（驱动 resume effect 重跑，保证同一轮只发起一次） */
  resumeAttempt: number
  lastError: HandoffLastError
}

export const INITIAL_HANDOFF_STATE: HandoffState = {
  phase: 'LOADING',
  detail: null,
  redirectTo: null,
  resumeAttempt: 0,
  lastError: null,
}

export type HandoffEvent =
  | { type: 'MISSING_HANDOFF' }
  | { type: 'DETAIL_OK'; detail: RequestDetailDTO }
  | { type: 'DETAIL_ERROR'; code: string }
  | { type: 'STATUS'; status: CoreRequestStatus }
  | { type: 'NETWORK_ERROR' }
  | { type: 'RETRY' }
  | { type: 'EXPIRE_LOCAL' }
  | { type: 'RESUME_OK'; redirectTo: string | null }
  | { type: 'RESUME_ERROR' }
  | { type: 'RETRY_RESUME' }

/** 硬终态：状态机不再接受任何事件 */
export const TERMINAL_PHASES: ReadonlySet<HandoffPhase> = new Set([
  'REDIRECTING',
  'DENIED',
  'EXPIRED',
  'INVALID',
  'CLIENT_UNAVAILABLE',
])

export function isTerminalPhase(phase: HandoffPhase): boolean {
  return TERMINAL_PHASES.has(phase)
}

/** 轮询终态：进入这些状态后立即停止轮询（APPROVED 也会停，resume 由单独 effect 驱动） */
export function isPollTerminalPhase(phase: HandoffPhase): boolean {
  return isTerminalPhase(phase) || phase === 'APPROVED'
}

/** 允许短轮询的阶段（等待/网络错误恢复） */
export function isPollablePhase(phase: HandoffPhase): boolean {
  return (
    phase === 'LOADING' ||
    phase === 'WAITING_APP' ||
    phase === 'APP_OPENED' ||
    phase === 'NETWORK_ERROR'
  )
}

export function handoffReducer(state: HandoffState, event: HandoffEvent): HandoffState {
  // 硬终态：任何事件都是 no-op（保证重复 resume / 重复 status 不产生副作用）
  if (isTerminalPhase(state.phase)) {
    return state
  }

  // APPROVED（半终态）：轮询已停，只接受 resume 相关事件
  if (state.phase === 'APPROVED') {
    switch (event.type) {
      case 'RESUME_OK':
        return { ...state, phase: 'REDIRECTING', redirectTo: event.redirectTo, lastError: null }
      case 'RESUME_ERROR':
        return { ...state, lastError: 'resume' }
      case 'RETRY_RESUME':
        return { ...state, resumeAttempt: state.resumeAttempt + 1 }
      default:
        return state
    }
  }

  switch (event.type) {
    case 'MISSING_HANDOFF':
      return { ...state, phase: 'INVALID', lastError: 'missing_handoff' }
    case 'DETAIL_OK':
      return { ...state, phase: 'WAITING_APP', detail: event.detail, lastError: null }
    case 'DETAIL_ERROR':
      return applyDetailError(state, event.code)
    case 'STATUS':
      return applyStatus(state, event.status)
    case 'NETWORK_ERROR':
      return { ...state, phase: 'NETWORK_ERROR', lastError: 'network' }
    case 'RETRY':
      // 网络错误恢复：详情未加载回 LOADING，否则回 WAITING_APP（轮询继续）
      return state.phase === 'NETWORK_ERROR'
        ? { ...state, phase: state.detail ? 'WAITING_APP' : 'LOADING', lastError: null }
        : state
    case 'EXPIRE_LOCAL':
      // 本地时间超过服务器 expires_at：停止等待（真正过期判断始终以 Core 为准）
      return state.detail ? { ...state, phase: 'EXPIRED', lastError: 'expired' } : state
    default:
      return state
  }
}

function applyDetailError(state: HandoffState, code: string): HandoffState {
  switch (code) {
    case 'expired':
      return { ...state, phase: 'EXPIRED', lastError: 'expired' }
    case 'client_unavailable':
      return { ...state, phase: 'CLIENT_UNAVAILABLE', lastError: 'client_unavailable' }
    case 'invalid_handoff':
    case 'missing_handoff':
      return { ...state, phase: 'INVALID', lastError: code }
    case 'not_found':
    case 'invalid_request':
      return { ...state, phase: 'INVALID', lastError: 'not_found' }
    default:
      // internal/未知：视为网络级错误，进入退避重试
      return { ...state, phase: 'NETWORK_ERROR', lastError: 'network' }
  }
}

function applyStatus(state: HandoffState, status: CoreRequestStatus): HandoffState {
  switch (status) {
    case 'waiting_app':
      return { ...state, phase: 'WAITING_APP', lastError: null }
    case 'app_opened':
      return { ...state, phase: 'APP_OPENED', lastError: null }
    case 'approved':
      return { ...state, phase: 'APPROVED', lastError: null }
    case 'denied':
      return { ...state, phase: 'DENIED', lastError: null }
    case 'expired':
      return { ...state, phase: 'EXPIRED', lastError: 'expired' }
    default:
      return state
  }
}
