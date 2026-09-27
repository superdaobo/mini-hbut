/**
 * SDK 版本与协议版本常量。
 *
 * 关键决策（protocol-v1.md §1.1/§1.3）：
 * - SDK 自带版本号（独立版本化），但**只支持 protocol v1**；服务端 meta 声明的区间必须包含 1。
 * - V2 命名空间唯一落点 `/api/game-platform/v1/*`；Legacy `/api/game-rank/*` 冻结为兼容通道。
 * - 生产 API 地址**只在 SDK 一处默认**，游戏源码不得各自硬编码（#904 验收项）。
 */

/** SDK 自身版本（与 package.json version 必须一致，见 _sdk_version.spec.ts 断言） */
export const SDK_VERSION = '1.0.0'

/** 协议版本：请求体 protocol_version 与请求头 X-Game-Platform-Protocol 的取值 */
export const PROTOCOL_VERSION = 1

/** 本 SDK 支持的协议区间（protocol-v1.md §1.3 的 [min,max]） */
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze({ min: 1, max: 1 })

/** V2 命名空间（禁止在 /api/game-rank/* 上叠加新经济语义） */
export const GAME_PLATFORM_API_NAMESPACE = '/api/game-platform/v1'

/** Legacy 冻结命名空间 */
export const LEGACY_RANK_API_NAMESPACE = '/api/game-rank'

/** 生产服务默认源（唯一默认值，游戏不得硬编码） */
export const DEFAULT_SERVICE_ORIGIN = 'https://mini-hbut-testocr1.hf.space'

/** 默认 V2 API base */
export const DEFAULT_GAME_PLATFORM_API_BASE = `${DEFAULT_SERVICE_ORIGIN}${GAME_PLATFORM_API_NAMESPACE}`

/** 默认 Legacy API base */
export const DEFAULT_LEGACY_RANK_API_BASE = `${DEFAULT_SERVICE_ORIGIN}${LEGACY_RANK_API_NAMESPACE}`

/** 请求超时（沿用既有游戏 12s 约定：website/modules-src/hbut_stack/project/src/utils/game_rank.js:3） */
export const DEFAULT_REQUEST_TIMEOUT_MS = 12000

/** 仅 submit / finish 走重试的退避序列（protocol-v1.md §3.3「沿用既有策略」） */
export const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1200, 2600, 5200])

/** 排行榜查询超时的中文可展示文案（既有游戏 UI 依赖该文案） */
export const LEADERBOARD_TIMEOUT_MESSAGE = '排行榜请求超时，请稍后重试'

/** Host 握手消息类型（宿主侧由 #905 实现，SDK 侧为唯一约定来源） */
export const HOST_MESSAGE_TYPES = Object.freeze({
  /** 游戏 → 宿主：握手请求（能力、feature flags、可选 ticket） */
  hello: 'mini-hbut:game-sdk:hello',
  /** 宿主 → 游戏：握手响应 */
  welcome: 'mini-hbut:game-sdk:welcome',
  /** 游戏 → 宿主：申请新的 Launch Ticket（会话过期/兑换失败后的恢复路径） */
  ticketRequest: 'mini-hbut:game-sdk:request-ticket',
  /** 宿主 → 游戏：新 ticket 响应 */
  ticketResponse: 'mini-hbut:game-sdk:ticket',
  /** 游戏 → 宿主：SDK 已就绪/降级通知（宿主可据此展示角标） */
  mode: 'mini-hbut:game-sdk:mode'
})

/** ticket 在 iframe URL 中的参数名（protocol-v1.md §6.2.3 / §10 L3） */
export const LAUNCH_TICKET_QUERY_KEYS = Object.freeze(['gpt', 'ticket'])

/** 信任级别命名（trust-model.md §2.1：三档逐字一致） */
export const TRUST_LEVELS = Object.freeze({
  legacy: 'legacy',
  verifiedSession: 'verified_session',
  serverVerifiedMatch: 'server_verified_match'
})

/** SDK 对外暴露的三种运行模式（trust-model.md §2 与 SDK 三模式的对应关系） */
export const MODES = Object.freeze({
  /** 有合法 Game Session，可进 V2 settlement */
  verified: 'verified',
  /** Game Platform 不可用但 Legacy Rank 可用：可玩、可上经典榜，不发新资产 */
  compatibility: 'compatibility',
  /** 直接浏览器打开 / 无任何可信凭据：纯本地游玩 */
  standalone: 'standalone'
})

/** verified 模式对应的 legacy 通道标识（Legacy Adapter 显式标注用） */
export const LEGACY_CHANNEL = 'legacy'

/** 判断服务端声明的协议区间是否包含本 SDK 支持的版本 */
export const isProtocolVersionSupported = (version) => {
  const value = Number(version)
  return Number.isInteger(value) && value >= SUPPORTED_PROTOCOL_VERSIONS.min && value <= SUPPORTED_PROTOCOL_VERSIONS.max
}

/** 判断服务端 meta 声明的区间是否与本 SDK 兼容 */
export const isProtocolRangeCompatible = (range) => {
  if (!range || typeof range !== 'object') return true
  const min = Number(range.min)
  const max = Number(range.max)
  if (!Number.isInteger(min) || !Number.isInteger(max)) return true
  return !(SUPPORTED_PROTOCOL_VERSIONS.max < min || SUPPORTED_PROTOCOL_VERSIONS.min > max)
}
