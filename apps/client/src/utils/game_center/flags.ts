/**
 * 湖工游乐场（Game Center，#905）feature flags 生效层。
 *
 * 关键决策（issue #905 + compatibility.md 契约 3）：
 * - flags **只走既有 remote_config 体系**（`game_platform` 块），不引入新的配置通道；
 *   远程改值即生效，无需发版，紧急回滚可用；
 * - 每个能力独立开关，未交付能力（#909 经济/赛季、#910 漂流瓶）默认关闭，
 *   由 UI **前置隐藏**（feature-gate），绝不出现「可见但必然报错」；
 * - 合规包（App Store / TestFlight）guest/demo 会话强制关闭远程游乐场与 UGC，
 *   与 app_store_policy 的 remoteModules / ranking / userGeneratedContent 保持一致。
 */

import { getFeaturePolicy, type AppStoreFeaturePolicy } from '../../config/app_store_policy'
import {
  DEFAULT_GAME_CENTER_FLAGS,
  DEFAULT_GAME_PLATFORM_API_BASE,
  GAME_CENTER_FLAG_KEYS,
  normalizeGamePlatformConfig,
  toFlagBoolean,
  type GameCenterFlagKey,
  type GamePlatformConfig
} from './base'

export {
  DEFAULT_GAME_CENTER_FLAGS,
  DEFAULT_GAME_PLATFORM_API_BASE,
  GAME_CENTER_FLAG_KEYS,
  isSecureGamePlatformUrl,
  normalizeGameOrigin,
  normalizeGamePlatformConfig,
  toFlagBoolean
} from './base'
export type { GameCenterFlagKey, GamePlatformConfig } from './base'

export interface GameCenterFlags extends Record<GameCenterFlagKey, boolean> {
  /** 归一化后的 API base（HTTPS-only） */
  api_base: string
  /** 归一化后的额外允许 origin（HTTPS-only，且不含 'null'/'*'） */
  allowed_game_origins: string[]
}

export interface GameCenterFlagSource {
  game_platform?: unknown
  [key: string]: unknown
}

/**
 * 解析远程配置 → 生效 flags。
 * 远程块缺失 → 全部落到默认值（默认值本身即最安全形态）。
 */
export const resolveGameCenterFlags = (config?: GameCenterFlagSource | null): GameCenterFlags => {
  const block: GamePlatformConfig = normalizeGamePlatformConfig(config?.game_platform)
  const flags = {} as GameCenterFlags
  for (const key of GAME_CENTER_FLAG_KEYS) {
    flags[key] = toFlagBoolean(block.flags[key], DEFAULT_GAME_CENTER_FLAGS[key])
  }
  flags.api_base = block.api_base || DEFAULT_GAME_PLATFORM_API_BASE
  flags.allowed_game_origins = block.enabled ? [...block.allowed_game_origins] : []
  if (!block.enabled) {
    // 块级总开关关闭 = 游乐场整体回滚（等价 game_center_enabled=false）；
    // 经典入口可见性保持远程/默认值，避免回滚误伤旧「更多」页。
    flags.game_center_enabled = false
    flags.game_verified_session_enabled = false
    flags.game_economy_enabled = false
    flags.drift_bottle_enabled = false
  }
  return flags
}

/**
 * 合规策略夹紧：与 app_store_policy 的能力矩阵对齐。
 * 只有「合规包 + guest/demo 会话」会收紧；真实登录与非合规构建保持原值。
 */
export const applyGameCenterPolicyClamp = (
  flags: GameCenterFlags,
  policy: AppStoreFeaturePolicy = getFeaturePolicy()
): GameCenterFlags => {
  const next: GameCenterFlags = { ...flags }
  const remoteModulesAllowed = policy.remoteCode || policy.remoteModules
  if (!remoteModulesAllowed) {
    // 远程可执行内容全禁：游乐场与经典远程模块入口都不可用
    next.game_center_enabled = false
    next.game_verified_session_enabled = false
    next.classic_game_entries_visible = false
  }
  if (!policy.userGeneratedContent) {
    // UGC（漂流瓶）必须前置隐藏，而不是可见后 API 报错
    next.drift_bottle_enabled = false
  }
  if (!policy.ranking) {
    next.game_verified_session_enabled = false
  }
  if (!remoteModulesAllowed || !policy.userGeneratedContent || !policy.ranking) {
    // 经济结算依赖「远程可信链路 + 榜单 + UGC 策略」整体成立；任一不成立就不展示钱包/等级
    next.game_economy_enabled = false
  }
  return next
}

/** 一站式：远程配置 + 合规夹紧 → 最终生效 flags */
export const resolveEffectiveGameCenterFlags = (
  config?: GameCenterFlagSource | null,
  policy: AppStoreFeaturePolicy = getFeaturePolicy()
): GameCenterFlags => applyGameCenterPolicyClamp(resolveGameCenterFlags(config), policy)
