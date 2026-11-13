// src/utils/poll_downshift.ts
//
// Epic #1243（G7-02 / mini-hbut#1270）：**自动降频**（把「负载信号」翻译成「调度周期」）。
//
// ## 为什么单独一个模块
//
// `school_poll_schedule.ts` 只回答「现在该不该查」，不回答「被限流了怎么办」。
// 没有降频，一旦学校接口开始 429，所有客户端仍按原周期猛打 → 限流永不解除。
//
// 本模块把**负载信号**累积成**降频档位**，再由调用方把档位乘到周期上：
//
// | 档位 | 周期倍率 | 触发 |
// |---|---|---|
// | 0 | ×1 | 初始 / 连续成功 2 次后回落 |
// | 1 | ×2 | 1 次限流或服务繁忙 |
// | 2 | ×4 | 连续 2 次 |
// | 3（上限） | ×8 | 连续 3 次及以上 |
//
// ## 边界（刻意不做的）
//
// - **不持久化档位**：进程重启回到 0（服务端限流窗口通常几分钟，重启后重试一次无害）；
// - **不改周期常量**：只给倍率，周期仍由 `POLL_INTERVALS_MS` 决定（单一事实来源）；
// - **不因网络错误降频**：断网是客户端侧问题，降频无助于缓解学校压力
//   （但也不重置档位 —— 避免「断网把限流记忆冲掉」）。

export type LoadSignal = 'ok' | 'rate_limited' | 'server_busy' | 'network_error'

export interface DownshiftState {
  /** 当前降频档位（0 = 正常） */
  tier: number
  /** 连续「需要降频」的信号次数（成功会清零） */
  consecutivePressure: number
  /** 连续成功次数（用于回落） */
  consecutiveOk: number
}

export const MAX_DOWNSHIFT_TIER = 3

/** 档位 → 周期倍率（1 / 2 / 4 / 8） */
export const TIER_MULTIPLIERS: Readonly<Record<number, number>> = Object.freeze({
  0: 1,
  1: 2,
  2: 4,
  3: 8
})

export const initialDownshiftState = (): DownshiftState => ({
  tier: 0,
  consecutivePressure: 0,
  consecutiveOk: 0
})

/** 该信号是否表示「服务端压力」（需要降频）。 */
const isPressure = (signal: LoadSignal): boolean =>
  signal === 'rate_limited' || signal === 'server_busy'

/**
 * 吃进一个负载信号，返回**新的**档位状态（纯函数，不改入参）。
 *
 * 规则（冻结）：
 * - `rate_limited` / `server_busy`：`tier+1`（上限 3），`consecutiveOk` 清零；
 * - `ok`：`consecutiveOk+1`；**连续 2 次成功**才回落一档（避免抖动），回落时压力计数清零；
 * - `network_error`：**档位不变**（不降也不升），`consecutiveOk` 清零
 *   —— 断网既不能证明学校压力大，也不能证明已恢复。
 */
export const applyLoadSignal = (state: DownshiftState, signal: LoadSignal): DownshiftState => {
  const current = state || initialDownshiftState()
  if (isPressure(signal)) {
    return {
      tier: Math.min(MAX_DOWNSHIFT_TIER, current.tier + 1),
      consecutivePressure: current.consecutivePressure + 1,
      consecutiveOk: 0
    }
  }
  if (signal === 'ok') {
    const okCount = current.consecutiveOk + 1
    if (okCount >= 2 && current.tier > 0) {
      return { tier: current.tier - 1, consecutivePressure: 0, consecutiveOk: 0 }
    }
    return { tier: current.tier, consecutivePressure: 0, consecutiveOk: okCount }
  }
  // network_error：保持档位，清掉成功连击（不能把断网当"已恢复"）
  return { tier: current.tier, consecutivePressure: current.consecutivePressure, consecutiveOk: 0 }
}

/** 当前档位对应的周期倍率。 */
export const tierMultiplier = (state: DownshiftState): number =>
  TIER_MULTIPLIERS[Math.max(0, Math.min(MAX_DOWNSHIFT_TIER, state?.tier ?? 0))] ?? 1

/**
 * 把倍率乘到基础周期上（并夹到合理上下界）。
 *
 * 上限 24 小时：即使连续被限流，也不该「永不重试」（那等于静默放弃同步）。
 */
export const downshiftedInterval = (baseIntervalMs: number, state: DownshiftState): number => {
  const base = Math.max(1, Number(baseIntervalMs) || 1)
  const scaled = Math.round(base * tierMultiplier(state))
  return Math.min(24 * 60 * 60 * 1000, Math.max(base, scaled))
}
