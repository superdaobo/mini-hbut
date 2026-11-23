// src/utils/background_sync_policy.ts
//
// Epic #1243（G4-06 / mini-hbut#1264）：**三端后台能力矩阵 + 恢复前台补偿**的纯策略层。
//
// 为什么需要它：Epic 明确要求「不伪承诺」——
// - Windows：进程未结束时可低频调度；**彻底退出后不建常驻进程**；
// - Android：WorkManager 周期任务最短 15 分钟且会被 Doze 延迟，**不能承诺精确时刻**；
// - iOS：BGAppRefreshTask 由系统决定何时运行，**不能固定 15/30 分钟**；
// - Web/浏览器预览：没有后台能力。
//
// 所以「后台多久跑一次」不是常量，而是**平台能力 × 系统策略**的函数；本模块把这个
// 矩阵写成数据，并提供「恢复前台该不该补查」的判定，避免各处硬编码。

export type RuntimePlatform = 'windows' | 'android' | 'ios' | 'web'

export interface PlatformBackgroundPolicy {
  platform: RuntimePlatform
  /** 最小化/后台时是否允许继续调度 */
  backgroundAllowed: boolean
  /**
   * 系统允许的最短周期（ms）；`null` = **系统决定**，我们不做任何时间承诺。
   */
  minIntervalMs: number | null
  /** 是否可能按精确时刻触发（false = 只能"尽力"） */
  exactTiming: boolean
  /** 面向用户/文档的说明（可直接进状态页文案） */
  note: string
}

/** 三端后台能力矩阵（冻结；与 Epic §10 的官方依据一致） */
export const PLATFORM_POLICIES: Readonly<Record<RuntimePlatform, PlatformBackgroundPolicy>> =
  Object.freeze({
    windows: {
      platform: 'windows',
      backgroundAllowed: true,
      // 最小化后建议按前台的 2–4 倍周期；这里给下限 2 倍，具体倍率由调用方决定
      minIntervalMs: 15 * 60 * 1000,
      exactTiming: false,
      note: '窗口最小化但进程未结束时可低频更新；彻底退出后不保留后台进程。'
    },
    android: {
      platform: 'android',
      backgroundAllowed: true,
      // WorkManager 周期任务最短 15 分钟，且 Doze 可能进一步延迟
      minIntervalMs: 15 * 60 * 1000,
      exactTiming: false,
      note: '由系统调度（最短约 15 分钟，可能被省电策略延迟），优先补传已有待同步数据。'
    },
    ios: {
      platform: 'ios',
      backgroundAllowed: true,
      // BGAppRefreshTask 时机由系统决定 → 不做任何时间承诺
      minIntervalMs: null,
      exactTiming: false,
      note: '后台运行时机由系统决定，无法承诺固定周期；恢复前台后补偿。'
    },
    web: {
      platform: 'web',
      backgroundAllowed: false,
      minIntervalMs: null,
      exactTiming: false,
      note: '浏览器预览没有后台能力，仅前台运行。'
    }
  })

/** 根据 `navigator.userAgent` 粗判平台（仅用于策略选择，不做能力探测）。 */
export const detectPlatform = (userAgent?: string): RuntimePlatform => {
  const ua = String(userAgent ?? '').toLowerCase()
  if (!ua) return 'web'
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios'
  if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) return 'windows'
  return 'web'
}

export type ResumeAction = 'poll' | 'skip'

export type ResumeReason =
  | 'due'
  | 'not_due'
  | 'unsupported'
  | 'session_invalid'
  | 'never_checked'

export interface ResumeDecision {
  action: ResumeAction
  reason: ResumeReason
  /** 距下次到期还有多久（ms；`action='poll'` 或无法计算时为 0） */
  dueInMs: number
}

export interface DecideResumeInput {
  platform: RuntimePlatform | string
  /** 该域上次**成功**查询的时刻（unix ms；0 = 从未） */
  lastCheckedAt: number
  now: number
  /** 前台周期（ms） */
  intervalMs: number
  /** 学校会话是否有效 */
  sessionValid?: boolean
}

/**
 * 恢复前台（或系统给了后台机会）时该不该补查。
 *
 * 判定顺序（冻结）：
 * 1. 平台不支持后台（web）→ `skip/unsupported`
 * 2. 会话失效 → `skip/session_invalid`（不制造无效重试）
 * 3. 从未查过 → `poll/never_checked`
 * 4. 已过前台周期 → `poll/due`；否则 `skip/not_due`（带 `dueInMs`）
 *
 * 注意：这里用**前台周期**做判定——后台被延迟不改变「该不该查」，只影响「什么时候真的跑」。
 */
export const decideResumeCompensation = (input: DecideResumeInput): ResumeDecision => {
  const platform = String(input.platform || '').toLowerCase() as RuntimePlatform
  const policy = PLATFORM_POLICIES[platform]
  if (!policy || !policy.backgroundAllowed) {
    return { action: 'skip', reason: 'unsupported', dueInMs: 0 }
  }
  if (input.sessionValid === false) {
    return { action: 'skip', reason: 'session_invalid', dueInMs: 0 }
  }
  const now = Number(input.now) || 0
  const last = Number(input.lastCheckedAt) || 0
  const interval = Math.max(1, Number(input.intervalMs) || 1)
  if (last <= 0) {
    return { action: 'poll', reason: 'never_checked', dueInMs: 0 }
  }
  const elapsed = now - last
  if (elapsed >= interval) {
    return { action: 'poll', reason: 'due', dueInMs: 0 }
  }
  return { action: 'skip', reason: 'not_due', dueInMs: interval - elapsed }
}

/**
 * 后台实际可用的最短间隔：取「前台周期」与「平台下限」的较大者。
 *
 * iOS 的 `minIntervalMs` 是 `null`（系统决定）→ 返回前台周期作为**建议值**，
 * 并保证调用方拿到的是「不会比平台下限更激进」的数字。
 */
export const effectiveBackgroundInterval = (
  platform: RuntimePlatform | string,
  foregroundIntervalMs: number
): number => {
  const policy = PLATFORM_POLICIES[String(platform || '').toLowerCase() as RuntimePlatform]
  const foreground = Math.max(1, Number(foregroundIntervalMs) || 1)
  if (!policy) return foreground
  if (policy.minIntervalMs === null) return foreground
  return Math.max(foreground, policy.minIntervalMs)
}

/** 平台是否承诺「进程被系统杀死后仍能采集学校数据」——永远 false（不伪承诺）。 */
export const promisesAfterTermination = (_platform: RuntimePlatform | string): boolean => false
