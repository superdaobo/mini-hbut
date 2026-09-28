/**
 * standalone 边界「单一前置判定」（第十轮 Phase 0 契约 C）。
 *
 * 契约 C 的四个场景（必须严格按此实现；判定**前置**，不得「先发请求再吞 403」）：
 * 1. 浏览器直开（无 Host）→ 本地游玩 + 本地成绩；禁止 Identity AT / Game Session / 任何写；
 * 2. Host + 白名单 origin + 合法 Session → 全链路 verified；
 * 3. Host 但 origin 不在白名单 → 降级 compatibility/standalone（可玩）；禁止 verified、任何 V2 写；
 * 4. Host + 白名单 origin 但 Session 非法/过期 → 可玩 + 本地成绩；禁止任何 V2 写。
 *
 * 本模块把三条前提收敛为**唯一**的显式判定（禁止在多处各写一遍）：
 *   ① 有可信 Host 握手（本视图正在用真实 iframe 承载游戏：桥有 frameWindow 且来源白名单非空）；
 *   ② 握手来源 origin 在**显式白名单**（远程配置 `allowed_game_origins`）内；
 *   ③ 会话已确认（`sessionVerified`，由认证状态层提供 —— 见 `useAppRuntime.ts` 的
 *      `sessionRestoreVerified` 语义；identity-guest 任务把事实源统一到认证层后，
 *      接线点读取同一导出即可，本模块的判定结构不变）。
 *
 * 额外前提（既有事实，显式纳入判定）：
 *   - 产品开关 `game_verified_session_enabled` 打开；
 *   - 宿主具备签发渠道（`requestTicket` 已接线）——否则不得向游戏声明可领票。
 *
 * 纯函数模块：不做网络请求、不读写存储、不打日志。宿主侧「取票」必须经
 * `createGatedTicketRequest`（判定不通过时**零请求**直接返回 null）。
 */

import { normalizeGameOrigin } from './base'
import type { HostBridgeFeatures } from './host_bridge'

/** 判定不通过的原因码（诊断 / 测试锚点；不得随意改名） */
export const GAME_TRUST_REASONS = Object.freeze({
  /** ① 没有可信 Host 握手（浏览器直开 / 桥未就绪 / iframe 未加载） */
  handshakeUntrusted: 'host_handshake_untrusted',
  /** ② 握手来源 origin 缺失或不可比较（`'null'` / `'*'` / 非法值） */
  originMissing: 'origin_missing',
  /** ② 显式白名单为空（未配置 = 不授予 verified，fail closed） */
  allowlistEmpty: 'origin_whitelist_empty',
  /** ② 握手来源 origin 不在显式白名单内 */
  originNotWhitelisted: 'origin_not_whitelisted',
  /** ③ 会话未确认（游客态 / 仅缓存身份 / 恢复未完成 / 已登出） */
  sessionUnverified: 'session_unverified',
  /** 产品开关未打开 */
  verifiedDisabled: 'verified_flag_disabled',
  /** 宿主未接线取票渠道 */
  ticketSourceMissing: 'ticket_source_missing'
})

export type GameTrustReason = (typeof GAME_TRUST_REASONS)[keyof typeof GAME_TRUST_REASONS]

export interface GameTrustPolicyInput {
  /** ① 有可信 Host 握手（桥已就绪：有 iframe contentWindow 且来源白名单非空） */
  handshakeTrusted: boolean
  /** ② 握手来源（iframe 的 URL 或 origin；内部按 normalizeGameOrigin 归一） */
  origin: unknown
  /** ② verified 的**显式** origin 白名单（远程配置 `allowed_game_origins`） */
  allowedOrigins?: readonly unknown[]
  /** ③ 会话已确认（认证状态层事实源；缺省 false = 游客态） */
  sessionVerified: boolean
  /** 产品开关 `game_verified_session_enabled` */
  verifiedFeatureEnabled: boolean
  /** 宿主是否具备取票渠道（requestTicket 已接线） */
  ticketSourceAvailable: boolean
  /** 对游戏声明的其余开关（未授予 verified 时按保守值兜底） */
  baseFeatures?: Partial<HostBridgeFeatures>
}

export interface GameTrustPolicy {
  /** **唯一**结论：true 才允许进入 verified（声明 verified 能力 / 下发 ticket） */
  verifiedEligible: boolean
  /** 全部不满足项（诊断用；空数组 = 判定通过） */
  reasons: GameTrustReason[]
  /** 归一化后的握手来源 origin（诊断用；非法为 ''） */
  origin: string
  /** 归一化后的显式白名单（诊断用；绝不含 `*` / `null`） */
  allowlist: string[]
  /** 是否允许向游戏声明可领票（= verifiedEligible；独立字段便于宿主侧显式读取） */
  launchTicketAllowed: boolean
  /**
   * 对游戏声明的 features（供 welcome.features）。
   * 判定不通过 → `game_verified_session_enabled` / `game_economy_enabled` /
   * `drift_bottle_enabled` 一律保守 false（这些能力只能经由 V2 可信链路交付）；
   * `game_center_enabled` 保持原值（standalone 仍可玩，零回归）。
   */
  features: HostBridgeFeatures
}

/** 归一化显式白名单：去重 + 丢弃 `*` / `'null'` / 非法值（fail closed） */
export const normalizeVerifiedOrigins = (origins: readonly unknown[] | undefined): string[] => {
  const list = Array.isArray(origins) ? origins : []
  return [...new Set(list.map((item) => normalizeGameOrigin(item)).filter(Boolean))]
}

/**
 * 契约 C 的单一前置判定。
 *
 * 判定链（全部满足才 `verifiedEligible: true`；只读、无副作用）：
 *   可信握手 → origin 有效 → 白名单非空 → origin 在白名单 → 会话已确认
 *   → 产品开关打开 → 取票渠道就绪
 */
export const resolveGameTrustPolicy = (input: GameTrustPolicyInput): GameTrustPolicy => {
  const origin = normalizeGameOrigin(input.origin)
  const allowlist = normalizeVerifiedOrigins(input.allowedOrigins)
  const reasons: GameTrustReason[] = []

  // ① 可信 Host 握手
  if (input.handshakeTrusted !== true) reasons.push(GAME_TRUST_REASONS.handshakeUntrusted)
  // ② origin 在白名单（显式白名单为空 = 不授予 verified）
  if (!origin) {
    reasons.push(GAME_TRUST_REASONS.originMissing)
  } else if (!allowlist.length) {
    reasons.push(GAME_TRUST_REASONS.allowlistEmpty)
  } else if (!allowlist.includes(origin)) {
    reasons.push(GAME_TRUST_REASONS.originNotWhitelisted)
  }
  // ③ 会话已确认
  if (input.sessionVerified !== true) reasons.push(GAME_TRUST_REASONS.sessionUnverified)
  // 既有前提：产品开关 + 取票渠道
  if (input.verifiedFeatureEnabled !== true) reasons.push(GAME_TRUST_REASONS.verifiedDisabled)
  if (input.ticketSourceAvailable !== true) reasons.push(GAME_TRUST_REASONS.ticketSourceMissing)

  const verifiedEligible = reasons.length === 0
  const base: HostBridgeFeatures = {
    game_center_enabled: false,
    game_verified_session_enabled: false,
    game_economy_enabled: false,
    drift_bottle_enabled: false,
    ...(input.baseFeatures || {})
  }

  return {
    verifiedEligible,
    reasons,
    origin,
    allowlist,
    launchTicketAllowed: verifiedEligible,
    features: {
      // 游玩入口不受 verified 影响（standalone / compatibility 仍可玩）
      game_center_enabled: base.game_center_enabled === true,
      // 以下三项只能经 V2 可信链路交付：判定不通过一律保守 false
      game_verified_session_enabled: verifiedEligible && base.game_verified_session_enabled === true,
      game_economy_enabled: verifiedEligible && base.game_economy_enabled === true,
      drift_bottle_enabled: verifiedEligible && base.drift_bottle_enabled === true
    }
  }
}

export interface GameTicketGrantLike {
  ticket: string
  expiresAt?: string
}

export interface GatedTicketRequestOptions {
  /** 取当前判定（每次调用都重新求值，避免使用过期快照） */
  resolvePolicy: () => GameTrustPolicy
  /** 真正取票的实现（由宿主接线到 `fetchGameLaunchTicket`） */
  requestTicket: (input: { reason: string; requestId: string }) => Promise<GameTicketGrantLike | null>
  /** 判定不通过时的观测回调（可选；不得抛错） */
  onDenied?: (reason: string) => void
}

/**
 * 取票前置门（宿主 `requestTicket` 的唯一入口）。
 *
 * 契约 C：判定不通过 → **零请求**直接返回 null（不得先打 `/tickets` 再吞 403）；
 * 判定通过才落到真实取票实现（真实失败仍由实现自身降级为空 ticket）。
 */
export const createGatedTicketRequest = (
  options: GatedTicketRequestOptions
): ((input: { reason: string; requestId: string }) => Promise<GameTicketGrantLike | null>) => {
  return async (input) => {
    let policy: GameTrustPolicy
    try {
      policy = options.resolvePolicy()
    } catch {
      // 判定本身异常 → fail closed（不发请求）
      options.onDenied?.(GAME_TRUST_REASONS.handshakeUntrusted)
      return null
    }
    if (!policy.verifiedEligible || !policy.launchTicketAllowed) {
      options.onDenied?.(policy.reasons[0] || GAME_TRUST_REASONS.handshakeUntrusted)
      return null
    }
    return options.requestTicket(input)
  }
}
