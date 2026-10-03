/**
 * 湖工游乐场（Game Center，#905）共享基座（叶子模块，**不得** import 其他 game_center 模块；
 * 唯一例外是同样无依赖的纯函数叶子 `canary.ts`，用于远程 `game_platform.canary` 归一化）。
 *
 * 收敛三件事，避免多处默认值 / 校验漂移：
 * 1. Game Platform / Legacy 命名空间与默认源（与既有 MoreView 的 game-rank 默认源一致）；
 * 2. 「HTTPS 优先」传输判定（HTTPS 或 loopback http）与 origin 归一化；
 * 3. `game_platform` 远程配置块的结构归一化 + 八个 feature flag 的默认值。
 *
 * #909/#910 集成追加第 4 件事：客户端本地错误码表 `LOCAL_ERROR_CODES`（叶子化，
 * 见其定义处的注释 —— 避免 api.ts ↔ points.ts / drift.ts 转接导出循环在模块
 * 初始化期读到未初始化绑定）。本文件仍是**零 game_center 内部依赖**的叶子。
 */

import { STATISTICS_SERVICE_BASE_URL, isStatisticsServiceUrlCompatible } from '../statistics_environment'
import { normalizeGamePlatformCanary, type GamePlatformCanary } from './canary'
import {
  DEFAULT_BACKEND_CHANNEL_PATHS,
  DEFAULT_BACKEND_GROUPS,
  deriveChannelUrl,
  normalizeBackendBase,
  normalizeBackendConfig,
  type BackendChannel,
  type BackendGroup
} from '../backend_endpoints'

/** Game Platform v1 命名空间（protocol-v1.md §1.1） */
export const GAME_PLATFORM_NAMESPACE = '/api/game-platform/v1'

/** Legacy 冻结命名空间（兼容契约 2，只读展示用） */
export const LEGACY_GAME_RANK_NAMESPACE = '/api/game-rank'

/** 五子棋 relay 命名空间 */
export const GOMOKU_RELAY_NAMESPACE = '/api/gomoku-relay'

/**
 * 服务默认源：**由构建档位决定**（release → 生产域，其余 → 测试域）。
 *
 * 单一权威是 `utils/statistics_environment.ts`：同一权威同时约束云同步与统计端点，
 * 且显式**拒绝跨环境 URL**（生产构建拒测试域、测试构建拒生产域）。
 *
 * #911 P1-⑤：此处**不得**再硬编码生产域。硬编码会让 beta / TestFlight 等非 release
 * 构建把 `rank_api` / `game_platform_api` / 五子棋 relay 指向生产域，而同一构建的 V2 base
 * 与 Game Session 却来自测试域 —— 测试期数据落进生产库，且席位凭证跨环境验签必失败。
 */
export const DEFAULT_GAME_SERVICE_ORIGIN = STATISTICS_SERVICE_BASE_URL

/** 默认 V2 API base */
export const DEFAULT_GAME_PLATFORM_API_BASE = `${DEFAULT_GAME_SERVICE_ORIGIN}${GAME_PLATFORM_NAMESPACE}`

/** 默认 Legacy API base */
export const DEFAULT_GAME_RANK_API = `${DEFAULT_GAME_SERVICE_ORIGIN}${LEGACY_GAME_RANK_NAMESPACE}`

/**
 * 默认五子棋 relay base。
 *
 * #911 P1-⑤：relay 目标**必须与 V2 同环境** —— 席位绑定凭证（`grb1.*`）由本环境 V2 用
 * `GAME_PLATFORM_SESSION_HASH_KEY` 签发，relay 用本环境密钥验签，跨环境必然 403
 * （五子棋联机不可用）。与 `DEFAULT_GAME_SERVICE_ORIGIN` **同源**，杜绝两者漂移。
 */
export const DEFAULT_GOMOKU_RELAY_API = `${DEFAULT_GAME_SERVICE_ORIGIN}${GOMOKU_RELAY_NAMESPACE}`

/** 协议版本（请求头 X-Game-Platform-Protocol 与 body.protocol_version） */
export const GAME_PLATFORM_PROTOCOL_VERSION = 1

/** 默认请求超时（沿用既有游戏 12s 约定） */
export const GAME_PLATFORM_REQUEST_TIMEOUT_MS = 12000

/** Legacy 排行榜查询超时（公开榜，读取更快失败更快） */
export const GAME_RANK_REQUEST_TIMEOUT_MS = 8000

// ---------------------------------------------------------------------------
// 错误模型：客户端本地失败码（#909/#910 Integration 下沉到叶子基座）
// ---------------------------------------------------------------------------

/**
 * 客户端本地失败码（非服务端错误码，用于 UI 区分「网络 / 配置 / 凭据」类降级）。
 *
 * **为什么定义在叶子基座而不是 `api.ts`**（#909/#910 集成实测结论，不是风格偏好）：
 * 各域访问层（`points.ts` / `drift.ts`）在**模块顶层**读本表（如
 * `POINTS_AUTH_ERROR_CODES` 取 `LOCAL_ERROR_CODES.authMissing`），而它们同时从 `api.ts`
 * 取传输层；`api.ts` 又要按「API 只经 api.ts」的惯例把两个域访问层的入口**转接导出**，
 * 于是形成 `api.ts ↔ points.ts` 循环。循环下模块求值顺序取决于「谁先被 import」，
 * 顶层读取会拿到 `undefined`（实测：`TypeError: Cannot access 'authMissing'`，整测试文件挂掉）。
 * 本表无任何依赖，放在叶子里即可保证**两种求值顺序下绑定都已初始化**。
 */
export const LOCAL_ERROR_CODES = Object.freeze({
  transportInsecure: 'LOCAL_TRANSPORT_INSECURE',
  transportFailed: 'LOCAL_TRANSPORT_FAILED',
  responseInvalid: 'LOCAL_RESPONSE_INVALID',
  authMissing: 'LOCAL_AUTH_MISSING',
  configMissing: 'LOCAL_CONFIG_MISSING'
})

/**
 * Production Readiness P1 收口（W3 接线完成）由服务端新增的三个 flag（客户端侧 key 单一来源）。
 *
 * 这三个开关**没有任何乐观默认值**（一律 false，fail closed）：
 * 远程配置下发 true **且** `/meta.capabilities` 显式声明对应端点已实现之前，
 * UI 必须把它们当作不可用并**前置隐藏**（见 `api.ts` 的 capabilities 与 `GameCenterView.vue`）。
 *
 * 接线状态（一次性机械改动，已完成）：
 * 1. 已由 `GAME_CENTER_FLAG_KEYS` 展开并入（追加在既有 5 个 key 之后，顺序零漂移）；
 * 2. 默认值已由 `DEFAULT_GAME_CENTER_FLAGS` 展开并入；
 * 3. `flags.ts` 的 `applyGameCenterPolicyClamp` 已按依赖关系夹紧
 *    （`game_daily_tasks_enabled` / `verified_reward_enabled` 依赖 V2 可信链路 →
 *    与 `game_economy_enabled` 同组；`gomoku_competitive_enabled` 依赖榜单策略）；
 * 4. 冻结清单契约测试（`game_center_flags.spec.ts` / `game_center_wiring_contract.spec.ts` /
 *    `_sdk_p1_contract.spec.ts`）已同步；
 * 5. 远程配置侧：`normalizeGamePlatformConfig` 按 GAME_CENTER_FLAG_KEYS 遍历，自动收录。
 */
export const RESERVED_GAME_CENTER_FLAG_KEYS = Object.freeze([
  /** 每日任务（服务端对应 capability `daily_tasks`） */
  'game_daily_tasks_enabled',
  /** 五子棋竞技（服务端对应 capability `gomoku_match` / `gomoku_competitive`） */
  'gomoku_competitive_enabled',
  /** 可信结算发奖（服务端对应 capability `verified_reward`） */
  'verified_reward_enabled'
] as const)

export type ReservedGameCenterFlagKey = (typeof RESERVED_GAME_CENTER_FLAG_KEYS)[number]

/** 三个新开关的默认值：**一律 false**（fail closed） */
export const RESERVED_GAME_CENTER_FLAG_DEFAULTS: Readonly<Record<ReservedGameCenterFlagKey, boolean>> = Object.freeze({
  game_daily_tasks_enabled: false,
  gomoku_competitive_enabled: false,
  verified_reward_enabled: false
})

/**
 * 八个独立开关（协议 §1.3 features + #905 feature gate 要求）。
 *
 * W3 接线：后三个 key 来自 `RESERVED_GAME_CENTER_FLAG_KEYS` 的展开 —— 追加在既有 5 个 key
 * **之后**，保证既有顺序与语义零漂移；三个新 key 的默认值同样由
 * `RESERVED_GAME_CENTER_FLAG_DEFAULTS` 展开（一律 false）。
 */
export const GAME_CENTER_FLAG_KEYS = Object.freeze([
  'game_center_enabled',
  'game_verified_session_enabled',
  'game_economy_enabled',
  'drift_bottle_enabled',
  'classic_game_entries_visible',
  ...RESERVED_GAME_CENTER_FLAG_KEYS
] as const)

export type GameCenterFlagKey = (typeof GAME_CENTER_FLAG_KEYS)[number]

/**
 * 默认值（远程配置不可达时的最终兜底）。
 *
 * - `game_center_enabled: false`（第十轮 Phase 0 契约 A）：**默认关闭**。
 *   包内兜底 `public/remote_config.json` 无 `game_platform` 块，远程拉取失败的用户
 *   一律看不到游乐场入口；开启由运维在配置仓显式下发 `enabled=true` +
 *   `flags.game_center_enabled=true` 完成（改配置无需发版；灰度见 `canary` 块）。
 *   安全姿态：宁可默认不可见，也不默认把游乐场暴露给未灰度的用户。
 * - `game_verified_session_enabled` / `game_economy_enabled`：依赖 #909（经济与赛季账本），
 *   未交付 → 默认关，UI 只展示占位且**不发起任何 V2 请求**。
 * - `drift_bottle_enabled`：依赖 #910（UGC 漂流瓶），未交付 → 默认关。
 * - `classic_game_entries_visible: true`：旧「更多」页 11 个游戏入口零破坏，默认继续可见
 *   （语义与本轮灰度无关，**不在**灰度 / 块级开关的坍缩范围内）。
 * - W3 三个新开关（每日任务 / 五子棋竞技 / 可信结算奖励）：服务端端点未验证 → 一律默认关，
 *   由 `RESERVED_GAME_CENTER_FLAG_DEFAULTS` 展开（保持「新 key 默认值」只有一处定义）。
 */
export const DEFAULT_GAME_CENTER_FLAGS: Readonly<Record<GameCenterFlagKey, boolean>> = Object.freeze({
  game_center_enabled: false,
  game_verified_session_enabled: false,
  game_economy_enabled: false,
  drift_bottle_enabled: false,
  classic_game_entries_visible: true,
  ...RESERVED_GAME_CENTER_FLAG_DEFAULTS
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
  /** 块级总开关（false 时等价于所有子开关关闭 + 清空 origin 白名单；紧急 kill switch 优先级最高） */
  enabled: boolean
  /** Game Platform v1 API base（必须 HTTPS 或 loopback，否则丢弃） */
  api_base: string
  /** 宿主允许的游戏 iframe origin 白名单（追加到 URL 推导白名单之后） */
  allowed_game_origins: string[]
  /** 业务开关（远程可平铺或嵌套在 flags 对象中） */
  flags: Record<string, unknown>
  /**
   * 灰度块（契约 A）：`null` = 字段缺省（不做灰度）；非法 = 全关哨兵。
   * 判定与生效见 `canary.ts` / `flags.ts`，此处只做结构归一化。
   */
  canary: GamePlatformCanary | null
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
 *
 * `canary`（契约 A）交 `normalizeGamePlatformCanary` 严格校验：
 * 字段缺省 → `null`（不做灰度）；存在但非法 → 全关哨兵（fail closed，绝不回落成"全量"）。
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
    flags: { ...nestedFlags, ...flatFlags },
    canary: normalizeGamePlatformCanary(block.canary)
  }
}

export { toFlagBoolean }

// ---------------------------------------------------------------------------
// 后端候选组解析（契约 docs/architecture/backend-endpoints-contract.md）
// ---------------------------------------------------------------------------

/**
 * 游戏后端候选：`apiBase`（V2）与 `rankApi`（Legacy）**同源同组**（契约 I1 —— 票据同源）。
 * 故障转移到哪一组，两个通道一起切，杜绝"票在 A 组签、游戏在 B 组验"。
 */
export interface GameBackendCandidate {
  groupId: string
  failoverKey: string
  origin: string
  apiBase: string
  rankApi: string
}

const safeText = (value: unknown): string => String(value ?? '').trim()

/**
 * 剥离云同步命名空间得到后端基址（保留部署子路径）。
 * 例：`https://x.com/sub/api/cloud-sync` → `https://x.com/sub`。
 */
export const stripCloudSyncNamespace = (endpoint: unknown): string => {
  const text = safeText(endpoint).replace(/\/+$/, '')
  if (!text) return ''
  return text.replace(/\/api\/cloud-sync$/i, '').replace(/\/cloud-sync$/i, '')
}

/**
 * 把显式 API base 折成"虚拟组"：**origin 作基址**、原 pathname 作 game_platform 路径。
 * 注意 base 必须是 origin（不含路径），否则派生时会与 paths 重复拼接
 * （曾出现 `…/api/game-platform/v1/api/game-platform/v1/…`）。
 */
const toVirtualGameGroup = (apiBase: string): BackendGroup | null => {
  if (!isSecureGamePlatformUrl(apiBase)) return null
  let origin = ''
  let path = GAME_PLATFORM_NAMESPACE
  try {
    const parsed = new URL(apiBase)
    origin = parsed.origin
    if (parsed.pathname && parsed.pathname !== '/') {
      path = parsed.pathname.replace(/\/+$/, '') || GAME_PLATFORM_NAMESPACE
    }
  } catch {
    return null
  }
  if (!origin) return null
  return { id: 'override', base: origin, enabled: true, paths: { game_platform: path } }
}

const toGameCandidate = (
  group: BackendGroup,
  paths: Record<BackendChannel, string>
): GameBackendCandidate | null => {
  const apiBase = deriveChannelUrl(group, 'game_platform', paths)
  const rankApi = deriveChannelUrl(group, 'game_rank', paths)
  if (!apiBase || !rankApi) return null
  if (!isSecureGamePlatformUrl(apiBase) || !isSecureGamePlatformUrl(rankApi)) return null
  // 跨环境候选一律不用（#911 P1-⑤：生产构建拒测试域，测试构建拒生产域）
  if (!isStatisticsServiceUrlCompatible(apiBase) || !isStatisticsServiceUrlCompatible(rankApi)) return null
  return {
    groupId: group.id,
    failoverKey: group.id,
    origin: normalizeBackendBase(group.base),
    apiBase,
    rankApi
  }
}

/**
 * 解析游戏后端候选（顺序即优先级，契约 §4）：
 *   ① 通道级显式覆盖 `game_platform.api_base`（与组首项不同时锁定为单候选）
 *   ② `backend.groups`；无组模型时用**云同步端点同源合成单组**（保证与云同步切到同一后端）
 *   ③ 内置默认：release 用组模型内置默认（生产主域 + 唯一兜底）；
 *      非 release 强制环境隔离域（dev/beta 不得打到生产）
 * `includeGroups=false`（`useRemoteConfig=false`）时跳过 ①②，直接用 ③。
 */
export const resolveGameBackendCandidates = (input: {
  backend?: unknown
  gamePlatformApiBase?: unknown
  includeGroups?: boolean
  /** 云同步主端点；用于无组模型时同源合成候选 */
  cloudSyncEndpoint?: unknown
}): GameBackendCandidate[] => {
  const includeRemote = input.includeGroups !== false
  const config = normalizeBackendConfig(includeRemote ? input.backend : undefined)
  let groups: BackendGroup[] = config.groups.filter((group) => group.enabled)

  if (includeRemote) {
    const explicit = safeText(input.gamePlatformApiBase)
    if (explicit && isSecureGamePlatformUrl(explicit) && isStatisticsServiceUrlCompatible(explicit)) {
      const normalized = explicit.replace(/\/+$/, '')
      const firstFromGroups =
        groups.length > 0 ? deriveChannelUrl(groups[0], 'game_platform', config.paths) : ''
      // 兼容镜像：显式值与组首项相同 → 忽略显式值走组模型（保留兜底）
      if (firstFromGroups !== normalized) {
        const virtual = toVirtualGameGroup(normalized)
        const candidate = virtual ? toGameCandidate(virtual, config.paths) : null
        return candidate ? [candidate] : []
      }
    }

    if (groups.length === 0) {
      const syncBase = stripCloudSyncNamespace(input.cloudSyncEndpoint)
      if (syncBase && isSecureGamePlatformUrl(syncBase)) {
        groups = [{ id: 'cloud-sync', base: syncBase, enabled: true, paths: {} }]
      }
    }
  }

  if (groups.length === 0) {
    // ③ 环境隔离：非 release 只用构建档位派生的环境域；release 用组模型内置默认
    const isReleaseBuild =
      String(import.meta.env.VITE_BUILD_PROFILE || '').trim().toLowerCase() === 'release'
    groups = isReleaseBuild
      ? DEFAULT_BACKEND_GROUPS.filter((group) => group.enabled).map((group) => ({ ...group }))
      : [{ id: 'environment', base: DEFAULT_GAME_SERVICE_ORIGIN, enabled: true, paths: {} }]
  }

  const candidates = groups
    .map((group) => toGameCandidate(group, config.paths))
    .filter((item): item is GameBackendCandidate => item !== null)
  if (candidates.length > 0) return candidates

  // 兜底：环境默认源单候选（standalone；仍受环境兼容过滤）
  const fallback = toGameCandidate(
    { id: 'environment', base: DEFAULT_GAME_SERVICE_ORIGIN, enabled: true, paths: {} },
    DEFAULT_BACKEND_CHANNEL_PATHS
  )
  return fallback ? [fallback] : []
}
