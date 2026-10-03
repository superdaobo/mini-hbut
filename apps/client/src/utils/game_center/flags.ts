/**
 * 湖工游乐场（Game Center，#905）feature flags 生效层。
 *
 * 关键决策（issue #905 + compatibility.md 契约 3 + 第十轮 Phase 0 契约 A）：
 * - flags **只走既有 remote_config 体系**（`game_platform` 块），不引入新的配置通道；
 *   远程改值即生效，无需发版，紧急回滚可用；
 * - 每个能力独立开关，未交付能力（#909 经济/赛季、#910 漂流瓶）默认关闭，
 *   由 UI **前置隐藏**（feature-gate），绝不出现「可见但必然报错」；
 * - 合规包（App Store / TestFlight）guest/demo 会话强制关闭远程游乐场与 UGC，
 *   与 app_store_policy 的 remoteModules / ranking / userGeneratedContent 保持一致。
 * - **灰度（canary，契约 A）**：`game_platform.canary` 未纳入的用户在本层被**坍缩**为
 *   块级关闭（等价 `enabled=false`，复用同一条坍缩分支，不新增第二套开关链路）；
 *   判定是纯同步的（见 `canary.ts`），分桶键 `hbu_game_install_id` 惰性生成
 *   （见 `install_id.ts`）；夹紧（applyGameCenterPolicyClamp）只会更严，不会把关打开。
 *
 * W3 接线：新增三个 flag（每日任务 / 五子棋竞技 / 可信结算奖励）与既有 flag 走**同一套**
 * 远程配置 + 合规夹紧，不引入第二通道；它们的默认值与 key 定义在 base.ts。
 * 注意 flag 只表达「产品想不想要」，端点是否实现由 capabilities（capability-driven UI）判定。
 */

import { getFeaturePolicy, type AppStoreFeaturePolicy } from '../../config/app_store_policy'
import { normalizeStudentId } from '../student_id.js'
import {
  DEFAULT_GAME_CENTER_FLAGS,
  DEFAULT_GAME_PLATFORM_API_BASE,
  GAME_CENTER_FLAG_KEYS,
  normalizeGamePlatformConfig,
  toFlagBoolean,
  type GameCenterFlagKey,
  type GamePlatformConfig
} from './base'
import { canaryRequiresBucket, evaluateGamePlatformCanary } from './canary'
import { getOrCreateGameInstallId } from './install_id'
// 统一解析入口：宿主 `api_base` 必须与游戏内 `rank_api` 同源同组（契约 I1，票据同源）
import { resolveGamePlatformApiBase } from './api'

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
  /**
   * #958 手误诊断：远程 `game_platform` 块里疑似 canary 键名手误的未知键
   * （原样罗列，如 `['canaries']`）。**只诊断、不参与判定**（判定语义不变）；
   * 无疑似键时不设置该字段。项目禁 console，故经此数据字段暴露给消费方 /
   * 诊断快照观测（详见 `base.ts#detectSuspectedCanaryTypoKeys`）。
   */
  canary_typo_keys?: readonly string[]
}

export interface GameCenterFlagSource {
  game_platform?: unknown
  [key: string]: unknown
}

/**
 * 灰度判定上下文（可选注入；缺省走生产默认读取，测试与未来接线显式传入）。
 * 三个字段都允许 `''`（显式表达「不可得」），与「未传」严格区分。
 */
export interface GameCenterCanaryContext {
  /** 客户端版本（默认取构建期 VITE_APP_VERSION） */
  appVersion?: string
  /** 当前会话学号（默认尽力读 `hbu_username`，仅合法学号采纳） */
  studentId?: string
  /** 安装 id（默认惰性生成 / 读取 `hbu_game_install_id`） */
  installId?: string
}

/**
 * 构建期注入的客户端版本（vite.config define；用于 allow/deny 版本匹配）。
 * 必须以 `import.meta.env.VITE_APP_VERSION` 精确形态书写，`?.` 之类的变体不会被 define 替换。
 */
const readGameClientVersion = (): string => {
  try {
    return String(import.meta.env.VITE_APP_VERSION || '')
      .trim()
      .replace(/^v/i, '')
  } catch {
    return ''
  }
}

/**
 * 读取当前会话学号（灰度 `allow_students` 匹配用）。
 *
 * 只认既有账号标记 `hbu_username` 且必须是合法学号（9/10 位数字，仓库 `student_id` 契约）；
 * 读不到 / 非学号 / 存储不可用 → `''`（不命中白名单，落回分桶），绝不猜测身份。
 */
const readCurrentCanaryStudentId = (): string => {
  try {
    return normalizeStudentId(globalThis.localStorage?.getItem('hbu_username'))
  } catch {
    return ''
  }
}

/**
 * 解析远程配置 → 生效 flags。
 * 远程块缺失 → 全部落到默认值（默认值本身即最安全形态：游乐场默认关）。
 *
 * 灰度（契约 A）：canary 未配置 = 不做灰度（由 enabled / flags 决定）；
 * canary 未纳入 ⇒ 与块级 `enabled=false` 走**同一条**坍缩分支（不新增开关链路）。
 */
export const resolveGameCenterFlags = (
  config?: GameCenterFlagSource | null,
  canaryContext?: GameCenterCanaryContext
): GameCenterFlags => {
  const block: GamePlatformConfig = normalizeGamePlatformConfig(config?.game_platform)
  const flags = {} as GameCenterFlags
  for (const key of GAME_CENTER_FLAG_KEYS) {
    flags[key] = toFlagBoolean(block.flags[key], DEFAULT_GAME_CENTER_FLAGS[key])
  }
  // 灰度判定：canary 缺省时不读版本 / 学号 / 安装 id（零副作用，保持既有纯解析语义）
  const canary = block.canary
  const appVersion = canaryContext?.appVersion ?? (canary !== null ? readGameClientVersion() : '')
  const studentId = canaryContext?.studentId ?? (canary !== null ? readCurrentCanaryStudentId() : '')
  const installId =
    canaryContext?.installId ??
    (canary !== null && canaryRequiresBucket(canary, appVersion, studentId)
      ? getOrCreateGameInstallId()
      : '')
  const canaryDecision = evaluateGamePlatformCanary({ canary, appVersion, studentId, installId })
  // 灰度未纳入 ⇒ 等价「块级关闭」：清空 origin 白名单 + 坍缩所有 V2 子 flag（同一条分支）
  const effectiveEnabled = block.enabled && canaryDecision.included

  // #958 手误诊断透传：疑似 canary 键名手误时把键名带到生效 flags 上（只诊断、不判定），
  // 让「以为配了灰度、实际键名写错（等价全量）」这类手误在诊断面可见。
  if (block.canary_typo_keys.length > 0) {
    flags.canary_typo_keys = [...block.canary_typo_keys]
  }

  // 与游戏内 rank_api 同源同组（契约 I1）：走统一候选解析，镜像写入的显式值不破坏兜底
  flags.api_base = resolveGamePlatformApiBase(block.api_base) || DEFAULT_GAME_PLATFORM_API_BASE
  flags.allowed_game_origins = effectiveEnabled ? [...block.allowed_game_origins] : []
  if (!effectiveEnabled) {
    // 块级总开关关闭 / 灰度未纳入 = 游乐场整体回滚（等价 game_center_enabled=false）；
    // 经典入口可见性保持远程/默认值，避免回滚误伤旧「更多」页。
    // W3 三个新开关同属 V2 能力面（每日任务 / 竞技 / 可信结算），一并回滚关闭。
    flags.game_center_enabled = false
    flags.game_verified_session_enabled = false
    flags.game_economy_enabled = false
    flags.drift_bottle_enabled = false
    flags.game_daily_tasks_enabled = false
    flags.gomoku_competitive_enabled = false
    flags.verified_reward_enabled = false
  }
  return flags
}

/**
 * 合规策略夹紧：与 app_store_policy 的能力矩阵对齐。
 * 只有「合规包 + guest/demo 会话」会收紧；真实登录与非合规构建保持原值。
 *
 * 注意：本函数**只关不开** —— 灰度未纳入（`game_center_enabled=false`）在夹紧前后
 * 都是关，夹紧不会把任何开关重新打开（契约 A 的「关就是关」）。
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
    // W3：竞技 / 每日任务 / 可信结算都依赖远程模块（V2 链路）执行，一并关闭（纵深防御）
    next.gomoku_competitive_enabled = false
    next.game_daily_tasks_enabled = false
    next.verified_reward_enabled = false
  }
  if (!policy.userGeneratedContent) {
    // UGC（漂流瓶）必须前置隐藏，而不是可见后 API 报错
    next.drift_bottle_enabled = false
  }
  if (!policy.ranking) {
    next.game_verified_session_enabled = false
    // 五子棋竞技依赖榜单策略（竞技成绩要可上榜、可结算）：无 ranking 策略即前置隐藏
    next.gomoku_competitive_enabled = false
  }
  if (!remoteModulesAllowed || !policy.userGeneratedContent || !policy.ranking) {
    // 经济结算依赖「远程可信链路 + 榜单 + UGC 策略」整体成立；任一不成立就不展示钱包/等级
    next.game_economy_enabled = false
    // W3：每日任务与可信结算发奖同样依赖 V2 可信链路（与 game_economy_enabled 同组夹紧）
    next.game_daily_tasks_enabled = false
    next.verified_reward_enabled = false
  }
  return next
}

/** 一站式：远程配置 + 灰度（契约 A）+ 合规夹紧 → 最终生效 flags */
export const resolveEffectiveGameCenterFlags = (
  config?: GameCenterFlagSource | null,
  policy: AppStoreFeaturePolicy = getFeaturePolicy(),
  canaryContext?: GameCenterCanaryContext
): GameCenterFlags =>
  applyGameCenterPolicyClamp(resolveGameCenterFlags(config, canaryContext), policy)
