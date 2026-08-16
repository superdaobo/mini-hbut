/**
 * 短轮询策略（纯函数，可单测）。
 *
 * 规则（issue #630）：
 *  - 页面可见约 1s 一次；页面隐藏降到约 5s（V1 选择降频而非暂停，保证状态新鲜度）；
 *  - 网络失败指数退避：1s → 2s → 4s …，上限 30s；
 *  - 进入（轮询）终态立即停止；本地时间超过服务器 expires_at 停止（真正过期判断始终由 Core 决定）；
 *  - 页面卸载清理 timer；每次请求使用独立 AbortController（组件层落实）。
 */
import { isPollTerminalPhase, type HandoffPhase } from './state'

export interface PollingConfig {
  visibleIntervalMs?: number
  hiddenIntervalMs?: number
  backoffBaseMs?: number
  backoffMaxMs?: number
}

export const DEFAULT_POLLING_CONFIG: Required<PollingConfig> = {
  visibleIntervalMs: 1000,
  hiddenIntervalMs: 5000,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
}

export interface PollDelayInput {
  visible: boolean
  consecutiveFailures: number
}

/** 下一次轮询的延迟（毫秒） */
export function nextPollDelayMs(input: PollDelayInput, config: PollingConfig = {}): number {
  const cfg = { ...DEFAULT_POLLING_CONFIG, ...config }
  const interval = input.visible ? cfg.visibleIntervalMs : cfg.hiddenIntervalMs
  if (input.consecutiveFailures <= 0) {
    return interval
  }
  // 指数退避：1s → 2s → 4s …，上限 30s
  const backoff = Math.min(
    cfg.backoffBaseMs * 2 ** (input.consecutiveFailures - 1),
    cfg.backoffMaxMs,
  )
  // 退避不得短于当前可见性对应的基准间隔（隐藏时禁止高频重试）
  return Math.max(backoff, interval)
}

export interface StopPollingInput {
  phase: HandoffPhase
  nowMs: number
  /** 服务器 expires_at（毫秒）；详情未加载（未知）时传 null 跳过过期检查 */
  expiresAtMs: number | null
}

/** 是否应停止轮询（轮询终态 / 本地时间超过服务器 expires_at） */
export function shouldStopPolling(input: StopPollingInput): boolean {
  if (isPollTerminalPhase(input.phase)) {
    return true
  }
  if (input.expiresAtMs !== null && input.nowMs >= input.expiresAtMs) {
    return true
  }
  return false
}

/** 距过期剩余毫秒（不低于 0） */
export function remainingMs(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, expiresAtMs - nowMs)
}

/** 倒计时文案（"X 分 YY 秒" / "N 秒"） */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) {
    return `${seconds} 秒`
  }
  return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 秒`
}
