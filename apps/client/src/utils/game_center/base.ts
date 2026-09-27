/**
 * 湖工游乐场（Game Center，#905）共享基座（叶子模块，**不得** import 其他 game_center 模块）。
 *
 * 收敛三件事，避免多处默认值 / 校验漂移：
 * 1. Game Platform / Legacy 命名空间与默认源（与既有 MoreView 的 game-rank 默认源一致）；
 * 2. 「HTTPS 优先」传输判定（HTTPS 或 loopback http）与 origin 归一化；
 * 3. `game_platform` 远程配置块的结构归一化 + 五个 feature flag 的默认值。
 */

/** Game Platform v1 命名空间（protocol-v1.md §1.1） */
export const GAME_PLATFORM_NAMESPACE = '/api/game-platform/v1'

/** Legacy 冻结命名空间（兼容契约 2，只读展示用） */
export const LEGACY_GAME_RANK_NAMESPACE = '/api/game-rank'

/** 生产服务默认源（与 MoreView 既有 game-rank 默认保持一致，不新增第二默认值） */
export const DEFAULT_GAME_SERVICE_ORIGIN = 'https://mini-hbut-ocr-service.hf.space'

/** 默认 V2 API base */
export const DEFAULT_GAME_PLATFORM_API_BASE = `${DEFAULT_GAME_SERVICE_ORIGIN}${GAME_PLATFORM_NAMESPACE}`

/** 默认 Legacy API base */
export const DEFAULT_GAME_RANK_API = `${DEFAULT_GAME_SERVICE_ORIGIN}${LEGACY_GAME_RANK_NAMESPACE}`

/** 协议版本（请求头 X-Game-Platform-Protocol 与 body.protocol_version） */
export const GAME_PLATFORM_PROTOCOL_VERSION = 1

/** 默认请求超时（沿用既有游戏 12s 约定） */
export const GAME_PLATFORM_REQUEST_TIMEOUT_MS = 12000

/** Legacy 排行榜查询超时（公开榜，读取更快失败更快） */
export const GAME_RANK_REQUEST_TIMEOUT_MS = 8000

/** 五个独立开关（协议 §1.3 features + #905 feature gate 要求） */
export const GAME_CENTER_FLAG_KEYS = Object.freeze([
  'game_center_enabled',
  'game_verified_session_enabled',
  'game_economy_enabled',
  'drift_bottle_enabled',
  'classic_game_entries_visible'
] as const)

export type GameCenterFlagKey = (typeof GAME_CENTER_FLAG_KEYS)[number]

/**
 * **预留**：Production Readiness P1 收口由服务端新增的三个 flag（客户端侧 key 单一来源）。
 *
 * 为什么先「预留」而不直接并入 `GAME_CENTER_FLAG_KEYS`：
 * - 这三个开关**尚无消费方**（W3 客户端接线 + 远程配置下发是本轮之后的工作）；
 * - 并入 `GAME_CENTER_FLAG_KEYS` 会改变两个**冻结清单**契约测试
 *   （`game_center_flags.spec.ts` / `game_center_wiring_contract.spec.ts` 断言恰好 5 个 key）
 *   并要求 `flags.ts` 出现对应字面量（合规夹紧）。为避免在 SDK 契约轮次里改动
 *   flag 生效层（flags.ts）与两个契约测试，这里先以**独立预留表**交付 key 与默认值。
 *
 * W3 接线步骤（一次性、机械改动）：
 * 1. 把这 3 个 key 追加进 `GAME_CENTER_FLAG_KEYS`（保持本表作为唯一 key 来源）；
 * 2. 把默认值并入 `DEFAULT_GAME_CENTER_FLAGS`；
 * 3. 在 `flags.ts` 的 `applyGameCenterPolicyClamp` 里按依赖关系夹紧
 *    （`game_daily_tasks_enabled` / `verified_reward_enabled` 依赖 V2 可信链路 →
 *    与 `game_economy_enabled` 同组；`gomoku_competitive_enabled` 依赖榜单策略）；
 * 4. 同步更新那两个 spec 的冻结清单断言；
 * 5. 远程配置侧：`normalizeGamePlatformConfig` 会自动收录（它按 GAME_CENTER_FLAG_KEYS 遍历）。
 */
export const RESERVED_GAME_CENTER_FLAG_KEYS = Object.freeze([
  /** 每日任务（服务端对应 capability `daily_tasks`） */
  'game_daily_tasks_enabled',
  /** 五子棋竞技（服务端对应 capability `gomoku_competitive`） */
  'gomoku_competitive_enabled',
  /** 可信结算发奖（服务端对应 capability `verified_reward`） */
  'verified_reward_enabled'
] as const)

export type ReservedGameCenterFlagKey = (typeof RESERVED_GAME_CENTER_FLAG_KEYS)[number]

/**
 * 预留开关的默认值：**一律 false**（fail closed）。
 * 未交付/未验证的服务端能力绝不乐观开启：远程配置下发 true 之前，UI 必须当作关闭。
 */
export const RESERVED_GAME_CENTER_FLAG_DEFAULTS: Readonly<Record<ReservedGameCenterFlagKey, boolean>> = Object.freeze({
  game_daily_tasks_enabled: false,
  gomoku_competitive_enabled: false,
  verified_reward_enabled: false
})

/**
 * 默认值（远程配置不可达时的最终兜底）。
 *
 * - `game_center_enabled: true`：游乐场入口本身不依赖后端（经典游戏 + 本地数据）即可用；
 *   紧急回滚由远程配置置 false 完成，**无需发版**。
 * - `game_verified_session_enabled` / `game_economy_enabled`：依赖 #909（经济与赛季账本），
 *   未交付 → 默认关，UI 只展示占位且**不发起任何 V2 请求**。
 * - `drift_bottle_enabled`：依赖 #910（UGC 漂流瓶），未交付 → 默认关。
 * - `classic_game_entries_visible: true`：旧「更多」页 11 个游戏入口零破坏，默认继续可见。
 */
export const DEFAULT_GAME_CENTER_FLAGS: Readonly<Record<GameCenterFlagKey, boolean>> = Object.freeze({
  game_center_enabled: true,
  game_verified_session_enabled: false,
  game_economy_enabled: false,
  drift_bottle_enabled: false,
  classic_game_entries_visible: true
})

/** 允许 http 的 loopback 主机（本地联调；生产必须 HTTPS） */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** 判定 URL 是否满足「HTTPS 优先」传输约束（HTTPS 或 loopback http） */
export const isSecureGamePlatformUrl = (value: unknown): boolean => {
  const text = String(value ?? '').trim()
  if (!text) return false
  try {
    const url = new URL(text)
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/**
 * 归一化 origin / URL → 可比较的 origin 字符串。拒绝 `'*'`、`'null'`、`data:`、`blob:`、`javascript:`。
 *
 * 关键决策：除 http(s) 外，**必须兼容原生外壳的自定义 scheme**
 * （Capacitor iOS 的 `capacitor://localhost/...`、Tauri 的 `tauri://localhost/...`）：
 * 这些 URL 的 `new URL(...).origin` 是字符串 `"null"`（非特殊 scheme），
 * 若直接丢弃会让本地包 iframe 的高度上报/握手全部被误拒（真实回归）。
 * 因此自定义 scheme 按 `${protocol}//${host}` 归一化 —— 与 WebView 实际上报的 `event.origin` 一致。
 */
export const normalizeGameOrigin = (value: unknown): string => {
  const text = String(value ?? '').trim()
  if (!text || text === '*' || text === 'null') return ''
  try {
    const url = new URL(text)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin
    // 自定义 scheme（capacitor: / tauri: / asset: ...）：必须有 host 才可作为 origin 比较
    if (!url.host) return ''
    if (!/^[a-z][a-z0-9+.-]*:$/i.test(url.protocol)) return ''
    return `${url.protocol}//${url.host}`
  } catch {
    return ''
  }
}

export interface GamePlatformConfig {
  /** 块级总开关（false 时等价于所有子开关关闭 + 清空 origin 白名单） */
  enabled: boolean
  /** Game Platform v1 API base（必须 HTTPS 或 loopback，否则丢弃） */
  api_base: string
  /** 宿主允许的游戏 iframe origin 白名单（追加到 URL 推导白名单之后） */
  allowed_game_origins: string[]
  /** 五个业务开关（远程可平铺或嵌套在 flags 对象中） */
  flags: Record<string, unknown>
}

const toFlagBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  if (text === 'true' || text === 'on' || text === 'enabled' || text === 'yes') return true
  if (text === 'false' || text === 'off' || text === 'disabled' || text === 'no') return false
  return fallback
}

/**
 * 归一化远程 `game_platform` 配置块（容忍 flags 平铺 / 嵌套两种写法）。
 * 纯函数，无副作用；远端下发非法值时一律丢弃（安全默认）。
 */
export const normalizeGamePlatformConfig = (raw: unknown): GamePlatformConfig => {
  const block = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const nestedFlags =
    block.flags && typeof block.flags === 'object' ? (block.flags as Record<string, unknown>) : {}
  const flatFlags: Record<string, unknown> = {}
  for (const key of GAME_CENTER_FLAG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(block, key)) flatFlags[key] = block[key]
  }
  const apiBase = String(block.api_base ?? block.apiBase ?? '').trim()
  const rawOrigins = Array.isArray(block.allowed_game_origins)
    ? block.allowed_game_origins
    : Array.isArray(block.allowedGameOrigins)
      ? block.allowedGameOrigins
      : []
  return {
    enabled: toFlagBoolean(block.enabled, true),
    api_base: isSecureGamePlatformUrl(apiBase) ? apiBase.replace(/\/+$/, '') : '',
    allowed_game_origins: [...new Set(rawOrigins.map(normalizeGameOrigin).filter(Boolean))],
    flags: { ...nestedFlags, ...flatFlags }
  }
}

export { toFlagBoolean }
