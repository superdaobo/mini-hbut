/**
 * Game Platform 客户端（#905）：只读查询 + Launch Ticket 签发。
 *
 * 关键决策：
 * 1. **HTTPS 优先**（Epic #900 兼容原则 + App Store remoteModules 策略）：
 *    所有 Game Platform / Game Rank 请求必须 HTTPS 或 loopback，否则直接拒绝，不降级到明文。
 * 2. **凭据不落盘、不回显、不入日志**：Identity AT / ticket 只在内存与请求头中传递；
 *    本文件不做任何 console / debug 输出（协议 §10 L1）。
 * 3. 错误统一映射为协议 §5 的 code（服务端 message 已是可直接展示的简体中文，客户端不二次映射）。
 * 4. 未交付能力由 **feature flag + capability 双层闸门**前置关闭（P1-1）：
 *    flag 表达「产品想不想要」，`/meta.capabilities` 表达「端点是否真的实现」；
 *    两者都成立 UI 才渲染入口（`fetchGamePlatformMeta` 透出保守能力表，见其文档）。
 */

import { getCloudSyncRuntimeConfig } from '../cloud_sync.js'
import { getIdentityAccessToken } from '../identity_access_token'
import {
  DEFAULT_GAME_PLATFORM_API_BASE,
  DEFAULT_GAME_RANK_API,
  GAME_PLATFORM_PROTOCOL_VERSION,
  GAME_PLATFORM_REQUEST_TIMEOUT_MS,
  GAME_RANK_REQUEST_TIMEOUT_MS,
  LEGACY_GAME_RANK_NAMESPACE,
  isSecureGamePlatformUrl
} from './base'
import { isStatisticsServiceUrlCompatible } from '../statistics_environment'

export {
  DEFAULT_GAME_PLATFORM_API_BASE,
  DEFAULT_GAME_RANK_API,
  DEFAULT_GAME_SERVICE_ORIGIN,
  GAME_PLATFORM_NAMESPACE,
  GAME_PLATFORM_PROTOCOL_VERSION,
  GAME_PLATFORM_REQUEST_TIMEOUT_MS,
  GAME_RANK_REQUEST_TIMEOUT_MS,
  LEGACY_GAME_RANK_NAMESPACE
} from './base'

export interface GamePlatformErrorShape {
  code: string
  message: string
  retryable: boolean
  request_id?: string
  /** 顶层 `error.code`（大类，如 FORBIDDEN_ACTOR）；`code` 取细粒度码时用于诊断 */
  envelope_code?: string
}

/** 统一的 Game Platform 错误（code 取值见 protocol-v1.md §5） */
export class GamePlatformError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly httpStatus: number
  readonly requestId: string
  /**
   * S2：服务端顶层 `error.code`（大类）。当细粒度机器码 `error.details.error_code`
   * 存在时 `code` 取细粒度码，本字段保留顶层码供诊断（不丢信息）。
   */
  readonly envelopeCode: string

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; httpStatus?: number; requestId?: string; envelopeCode?: string } = {}
  ) {
    super(message)
    this.name = 'GamePlatformError'
    this.code = code
    this.retryable = options.retryable === true
    this.httpStatus = Number(options.httpStatus || 0)
    this.requestId = String(options.requestId || '')
    this.envelopeCode = String(options.envelopeCode || '')
  }
}

/** 客户端本地失败码（非服务端错误码，用于 UI 区分「网络/配置」类降级） */
export const LOCAL_ERROR_CODES = Object.freeze({
  transportInsecure: 'LOCAL_TRANSPORT_INSECURE',
  transportFailed: 'LOCAL_TRANSPORT_FAILED',
  responseInvalid: 'LOCAL_RESPONSE_INVALID',
  authMissing: 'LOCAL_AUTH_MISSING',
  configMissing: 'LOCAL_CONFIG_MISSING'
})

const safeText = (value: unknown): string => String(value ?? '').trim()

/**
 * 从候选里挑第一个「传输安全（HTTPS / loopback）且**环境兼容**」的 base；都不合格返回 `''`。
 *
 * #911 P1-⑤ 运行期护栏：`statistics_environment` 的跨环境拒绝过去只在**构建期**由
 * `VITE_BUILD_PROFILE` 把关。一旦构建漏传该变量，或运行期配置被写到另一端环境，
 * 宿主就会把跨环境 base 注入游戏 iframe —— 生产库被写测试数据 / 测试客户端打生产库。
 * 这里把同一约束提升为**运行期**判定：不合格候选一律不用。
 *
 * 自定义域与 loopback 在两端环境都放行（只有「另一端环境」的已知域被拒），
 * 因此本地联调地址不会被误杀。导出于 `game_center_service_origin.spec.ts` 直接验证契约。
 */
export const pickEnvironmentCompatibleBase = (candidates: readonly unknown[]): string => {
  for (const candidate of candidates) {
    const text = safeText(candidate).replace(/\/+$/, '')
    if (!text) continue
    if (!isSecureGamePlatformUrl(text)) continue
    if (!isStatisticsServiceUrlCompatible(text)) continue
    return text
  }
  return ''
}

/**
 * 请求前取 base：不可用即抛出可读错误。
 *
 * 不变量：候选里总含「由构建档位派生的环境默认源」，它对本环境必然兼容，
 * 因此正常情况下不会走到抛错分支 —— 这是**防御性守卫**，用于防止将来有人把默认源
 * 改成空值（fail closed）时静默发出一个相对路径请求。
 */
const requireBase = (candidates: readonly unknown[], label: string): string => {
  const base = pickEnvironmentCompatibleBase(candidates)
  if (!base) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.configMissing, `${label}未配置（无环境兼容的 API 地址）`, {
      retryable: false
    })
  }
  return base
}

/**
 * 解析 Game Platform API base：显式覆盖 → 环境默认源。只返回通过 HTTPS 校验的地址。
 * 不可用时返回 `''`（请求前请用 `requireGamePlatformBase`）。
 */
export const resolveGamePlatformApiBase = (override?: unknown): string =>
  pickEnvironmentCompatibleBase([override, DEFAULT_GAME_PLATFORM_API_BASE])

/** 同 `resolveGamePlatformApiBase`，但不可用时抛错（供实际发起请求处使用） */
const requireGamePlatformBase = (override?: unknown): string =>
  requireBase([override, DEFAULT_GAME_PLATFORM_API_BASE], '游戏平台服务')

/**
 * 从云同步端点派生 Legacy 排行榜 base。
 *
 * 必须**先剥掉云同步命名空间再拼**：云同步端点是 `…/api/cloud-sync`，若直接做
 * `replace('/cloud-sync', '/api/game-rank')` 会得到 `…/api/api/game-rank`（双 `/api`）——
 * 该路径在服务端不存在（实测 `/api/game-rank/ping` = 200 而 `/api/api/game-rank/ping` = 404），
 * 于是宿主注入 iframe 的 `rank_api`、经典榜请求全部 404（旧实现长期存在此缺陷）。
 *
 * 保留部署子路径：`…/sub/api/cloud-sync` → `…/sub/api/game-rank`。
 */
export const deriveLegacyRankBaseFromCloudSync = (endpoint: unknown): string => {
  const text = safeText(endpoint).replace(/\/+$/, '')
  if (!text) return ''
  const stripped = text.replace(/\/api\/cloud-sync$/i, '').replace(/\/cloud-sync$/i, '')
  return `${stripped}${LEGACY_GAME_RANK_NAMESPACE}`
}

/**
 * 解析 Legacy Game Rank API base：云同步同源派生 → 环境默认源。
 *
 * 跨环境候选（release 构建里的测试域 / 测试构建里的生产域）**一律不采用**：
 * 前者会把真实成绩写进测试库，后者会让测试数据污染生产榜。
 * 都不可用时返回 `''` = 未配置（standalone，不远程提交）。
 */
export const resolveGameRankApiBase = (): string => {
  const candidates: unknown[] = []
  try {
    const runtime = getCloudSyncRuntimeConfig()
    const endpoint = safeText(runtime?.proxyEndpoint || runtime?.endpoint)
    if (endpoint) candidates.push(deriveLegacyRankBaseFromCloudSync(endpoint))
  } catch {
    // 运行时配置读取失败：交给环境默认源
  }
  candidates.push(DEFAULT_GAME_RANK_API)
  return pickEnvironmentCompatibleBase(candidates)
}

/** 同 `resolveGameRankApiBase`，但不可用时抛错（供实际发起请求处使用） */
const requireGameRankBase = (override?: unknown): string =>
  requireBase([safeText(override), resolveGameRankApiBase()], '经典排行榜服务')

interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  timeoutMs?: number
}

const buildTimeoutSignal = (
  timeoutMs: number
): { signal: AbortSignal | undefined; clear: () => void } => {
  if (typeof AbortController !== 'function') return { signal: undefined, clear: () => {} }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

const parseEnvelopeError = (payload: unknown, httpStatus: number): GamePlatformErrorShape | null => {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const error = body.error
  if (error && typeof error === 'object') {
    const shaped = error as Record<string, unknown>
    const details =
      shaped.details && typeof shaped.details === 'object'
        ? (shaped.details as Record<string, unknown>)
        : {}
    const envelopeCode = safeText(shaped.code)
    // S2：服务端把**细粒度机器码**放在 `error.details.error_code`（顶层 `error.code` 只是大类，
    // 例如席位所有权不足时顶层是 `FORBIDDEN_ACTOR`）。细粒度码优先作为 `code`，否则调用方的
    // 自愈 / 文案分支永远只能拿到大类、永不触发；顶层码保留在 `envelope_code` 供诊断。
    // F3：只有**字符串**才算有效机器码 —— 数字 / 布尔 / 对象一律视为缺失并回落顶层码
    // （等效修复前行为），绝不把 `42` / `[object Object]` 强转进 code。
    const detailCode = typeof details.error_code === 'string' ? safeText(details.error_code) : ''
    const code = detailCode || envelopeCode
    if (code) {
      return {
        code,
        message: safeText(shaped.message) || '游戏服务暂时不可用',
        retryable: shaped.retryable === true,
        request_id: safeText(shaped.request_id),
        envelope_code: envelopeCode
      }
    }
  }
  // Legacy 形状：{"success": false, "error": "文本"}（契约 2 冻结，不得改变解析方式）
  if (typeof error === 'string' && error) {
    return { code: `HTTP_${httpStatus}`, message: error, retryable: httpStatus >= 500 }
  }
  return null
}

/**
 * 执行一次 JSON 请求。
 * - 传输层强制 HTTPS（loopback 例外）；
 * - 非 2xx 但带协议 envelope 时抛服务端 code；
 * - 其它失败统一抛 LOCAL_* 本地码，调用方据此降级。
 */
export const requestGamePlatformJson = async <T = Record<string, unknown>>(
  url: string,
  options: RequestOptions = {}
): Promise<T> => {
  const target = safeText(url)
  if (!isSecureGamePlatformUrl(target)) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.transportInsecure, '游戏服务地址不安全，已拒绝连接', {
      retryable: false
    })
  }
  const { signal, clear } = buildTimeoutSignal(options.timeoutMs || GAME_PLATFORM_REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(target, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal
    })
  } catch (error) {
    const aborted = (error as { name?: string } | undefined)?.name === 'AbortError'
    throw new GamePlatformError(
      LOCAL_ERROR_CODES.transportFailed,
      aborted ? '游戏服务请求超时，请稍后重试' : '游戏服务连接失败，请检查网络',
      { retryable: true }
    )
  } finally {
    clear()
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const shapedError = parseEnvelopeError(payload, response.status)
  if (shapedError) {
    throw new GamePlatformError(shapedError.code, shapedError.message, {
      retryable: shapedError.retryable,
      httpStatus: response.status,
      requestId: shapedError.request_id,
      envelopeCode: shapedError.envelope_code
    })
  }
  if (!response.ok) {
    throw new GamePlatformError(`HTTP_${response.status}`, '游戏服务暂时不可用', {
      retryable: response.status >= 500,
      httpStatus: response.status
    })
  }
  if (!payload || typeof payload !== 'object') {
    throw new GamePlatformError(LOCAL_ERROR_CODES.responseInvalid, '游戏服务返回内容异常', {
      retryable: false,
      httpStatus: response.status
    })
  }
  return payload as T
}

const gamePlatformHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  'X-Game-Platform-Protocol': String(GAME_PLATFORM_PROTOCOL_VERSION),
  ...extra
})

/**
 * 宿主 UI 认识的服务端能力 key（canonical）。
 *
 * 语义（与 feature flag 的本质区别，P1-1）：
 * - `features.*`（flag）＝「产品想不想要」；
 * - `capabilities.*`＝「**端点是否真的实现**」。
 * flag 打开但端点未实现时，UI 必须靠 capabilities **前置隐藏**，而不是点击后 404。
 */
export const GAME_PLATFORM_CAPABILITY_KEYS = Object.freeze([
  /** V2 榜读取端点 `GET /leaderboards`（Verified 赛季榜） */
  'leaderboards',
  /** `GET /me/wallet` 钱包流水（等级 / XP / 湖工币） */
  'wallet',
  /** 每日任务（对应 flag `game_daily_tasks_enabled`） */
  'daily_tasks',
  /** 五子棋竞技（对应 flag `gomoku_competitive_enabled`） */
  'gomoku_match',
  /** 漂流瓶 UGC（对应 flag `drift_bottle_enabled`） */
  'drift_bottle',
  /** 可信结算发奖（对应 flag `verified_reward_enabled`） */
  'verified_reward'
] as const)

export type GamePlatformCapabilityKey = (typeof GAME_PLATFORM_CAPABILITY_KEYS)[number]

/** 保守能力表：值 false ＝ 不可用（未声明 / 类型非法 / 拿不到 /meta 都落在这里） */
export type GamePlatformCapabilities = Readonly<Record<GamePlatformCapabilityKey, boolean>>

/** 未拿到 `/meta` 时的唯一合法初值：全部 false → UI 一律前置隐藏 */
export const EMPTY_GAME_PLATFORM_CAPABILITIES: GamePlatformCapabilities = Object.freeze({
  leaderboards: false,
  wallet: false,
  daily_tasks: false,
  gomoku_match: false,
  drift_bottle: false,
  verified_reward: false
})

/**
 * 别名表（只读兼容，不改变优先级与保守默认）：
 * canonical 与服务端字段名可能略有差异（服务端样本用 `gomoku_match`，
 * 而 SDK / flag 侧沿用 `gomoku_competitive`），两种都接受；
 * **任何未识别命名一律按 false**（未声明即未知，未知即不可用）。
 */
const GAME_PLATFORM_CAPABILITY_ALIASES: Readonly<Record<GamePlatformCapabilityKey, readonly string[]>> =
  Object.freeze({
    leaderboards: ['leaderboards', 'leaderboard', 'leaderboards_enabled'],
    wallet: ['wallet', 'me_wallet', 'wallet_enabled'],
    daily_tasks: ['daily_tasks', 'dailyTasks', 'daily_tasks_enabled', 'game_daily_tasks'],
    gomoku_match: [
      'gomoku_match',
      'gomokuMatch',
      'gomoku_competitive',
      'gomokuCompetitive',
      'gomoku_competitive_enabled',
      'competitive_gomoku'
    ],
    drift_bottle: ['drift_bottle', 'driftBottle', 'drift_bottle_enabled'],
    verified_reward: ['verified_reward', 'verifiedReward', 'verified_rewards', 'verified_reward_enabled']
  })

/** 能力值解析：无法识别的类型返回 null（＝未声明，不得当作 true） */
const toCapabilityBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    const text = safeText(value).toLowerCase()
    if (['true', 'on', 'enabled', 'yes', 'available', 'implemented'].includes(text)) return true
    if (['false', 'off', 'disabled', 'no', 'unavailable', 'not_implemented', 'missing'].includes(text)) {
      return false
    }
  }
  return null
}

export interface NormalizedGamePlatformCapabilities {
  /** 保守能力表（未知即 false）：UI 直接用它做前置隐藏 */
  values: GamePlatformCapabilities
  /** 被显式声明过的 key（诊断用；可区分「服务端说没有」与「还没说」） */
  declared: GamePlatformCapabilityKey[]
}

/**
 * 读取 `/meta.capabilities`（**只看 capabilities 作用域**）。
 *
 * 与 SDK（`_sdk/src/capabilities.js`）的差异（有意为之，方向更保守）：
 * SDK 额外接受 `meta.features.<纯能力名>` 作为过渡形态；宿主 UI **不读 features**——
 * `features` 表达的是「想不想要」，把它读成「端点已实现」正是 P1-1 的成因
 * （flag=true + 端点缺失 → 渲染后 404）。UI 前置隐藏必须 fail closed，不得乐观放行。
 */
export const readGamePlatformCapabilities = (meta: unknown): NormalizedGamePlatformCapabilities => {
  const payload = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {}
  const scope =
    payload.capabilities && typeof payload.capabilities === 'object'
      ? (payload.capabilities as Record<string, unknown>)
      : null
  const values = { ...EMPTY_GAME_PLATFORM_CAPABILITIES } as Record<GamePlatformCapabilityKey, boolean>
  const declared: GamePlatformCapabilityKey[] = []
  if (!scope) return { values, declared }
  for (const key of GAME_PLATFORM_CAPABILITY_KEYS) {
    for (const alias of GAME_PLATFORM_CAPABILITY_ALIASES[key]) {
      if (!Object.prototype.hasOwnProperty.call(scope, alias)) continue
      const parsed = toCapabilityBoolean(scope[alias])
      if (parsed === null) continue
      values[key] = parsed
      declared.push(key)
      break
    }
  }
  return { values, declared }
}

export interface GamePlatformMeta {
  protocolVersion: { min: number; max: number } | null
  serverVersion: string
  features: Record<string, unknown>
  /**
   * 服务端能力声明（**保守**：未声明 / 类型非法 / 拿不到就一律 false）。
   * UI 前置隐藏的唯一依据：capability=false 时不渲染入口、不发请求。
   */
  capabilities: GamePlatformCapabilities
  /** 被 `/meta` 显式声明过的能力 key（诊断用，便于区分「服务端说没有」与「还没说」） */
  capabilitiesDeclared: GamePlatformCapabilityKey[]
  registryGames: number
  raw: Record<string, unknown>
}

/** GET /meta：版本协商与能力清单（无认证） */
export const fetchGamePlatformMeta = async (
  apiBase?: string,
  timeoutMs = GAME_PLATFORM_REQUEST_TIMEOUT_MS
): Promise<GamePlatformMeta> => {
  const base = requireGamePlatformBase(apiBase)
  const payload = await requestGamePlatformJson<Record<string, unknown>>(`${base}/meta`, {
    headers: gamePlatformHeaders(),
    timeoutMs
  })
  const range =
    payload.protocol_version && typeof payload.protocol_version === 'object'
      ? (payload.protocol_version as Record<string, unknown>)
      : null
  const registry =
    payload.registry && typeof payload.registry === 'object'
      ? (payload.registry as Record<string, unknown>)
      : null
  // 能力声明：缺失 / 非法 / 未识别命名一律保守 false（UI 据此前置隐藏，不发出必然 404 的请求）
  const capabilities = readGamePlatformCapabilities(payload)
  return {
    protocolVersion: range
      ? { min: Number(range.min) || 0, max: Number(range.max) || 0 }
      : null,
    serverVersion: safeText(payload.server_version),
    features:
      payload.features && typeof payload.features === 'object'
        ? (payload.features as Record<string, unknown>)
        : {},
    capabilities: capabilities.values,
    capabilitiesDeclared: capabilities.declared,
    registryGames: Number(registry?.games) || 0,
    raw: payload
  }
}

export interface LaunchTicketResult {
  ticket: string
  expiresAt: string
  error?: GamePlatformError
}

/**
 * POST /tickets：用 Identity AT 换一次性 Launch Ticket（协议 §6.2.1）。
 * - 无 Identity provider / 未登录 → 直接返回失败（调用方降级 compatibility/standalone）；
 * - ticket 只返回给调用方用于拼 iframe URL，不落盘、不打印。
 */
export const fetchGameLaunchTicket = async (options: {
  gameId: string
  apiBase?: string
  idempotencyKey?: string
  timeoutMs?: number
}): Promise<LaunchTicketResult> => {
  const base = requireGamePlatformBase(options.apiBase)
  const accessToken = await getIdentityAccessToken()
  if (!accessToken) {
    return {
      ticket: '',
      expiresAt: '',
      error: new GamePlatformError(LOCAL_ERROR_CODES.authMissing, '当前未登录，无法领取游戏凭据', {
        retryable: false
      })
    }
  }
  const idempotencyKey = safeText(options.idempotencyKey) || createIdempotencyKey()
  try {
    const payload = await requestGamePlatformJson<Record<string, unknown>>(`${base}/tickets`, {
      method: 'POST',
      headers: gamePlatformHeaders({
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': idempotencyKey
      }),
      body: {
        protocol_version: GAME_PLATFORM_PROTOCOL_VERSION,
        game_id: safeText(options.gameId)
      },
      timeoutMs: options.timeoutMs
    })
    return {
      ticket: safeText(payload.ticket),
      expiresAt: safeText(payload.expires_at)
    }
  } catch (error) {
    return {
      ticket: '',
      expiresAt: '',
      error:
        error instanceof GamePlatformError
          ? error
          : new GamePlatformError(LOCAL_ERROR_CODES.transportFailed, '游戏凭据领取失败', {
              retryable: true
            })
    }
  }
}

/** idempotency_key 格式：`^[A-Za-z0-9_-]{16,128}$`（§6.2.4） */
export const createIdempotencyKey = (): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(24)
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    cryptoRef.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  let output = ''
  for (const byte of bytes) output += alphabet[byte % alphabet.length]
  return `idem-${Date.now().toString(36)}-${output}`
}

const authorizedGet = async <T = Record<string, unknown>>(
  path: string,
  apiBase?: string,
  timeoutMs = GAME_PLATFORM_REQUEST_TIMEOUT_MS
): Promise<T> => {
  const base = requireGamePlatformBase(apiBase)
  const accessToken = await getIdentityAccessToken()
  if (!accessToken) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.authMissing, '当前未登录，无法读取游戏数据', {
      retryable: false
    })
  }
  return requestGamePlatformJson<T>(`${base}${path}`, {
    headers: gamePlatformHeaders({ Authorization: `Bearer ${accessToken}` }),
    timeoutMs
  })
}

/** GET /me/profile：玩家展示快照（#903；未交付时由 feature flag 前置关闭） */
export const fetchGamePlayerProfile = async (apiBase?: string): Promise<Record<string, unknown>> =>
  authorizedGet('/me/profile', apiBase)

/** GET /me/wallet：XP / 湖工币 / 每日进度（#909；未交付时由 game_economy_enabled 前置关闭） */
export const fetchGamePlayerWallet = async (apiBase?: string): Promise<Record<string, unknown>> =>
  authorizedGet('/me/wallet', apiBase)

export interface LeaderboardQuery {
  gameId: string
  board?: 'classic' | 'verified' | 'season'
  scope?: 'school' | 'class' | 'class_total'
  limit?: number
  cursor?: string
  apiBase?: string
}

/** GET /leaderboards：V2 榜读取（§9；仅 public 形态，不带凭据以免污染公开缓存） */
export const fetchGameLeaderboards = async (
  query: LeaderboardQuery
): Promise<Record<string, unknown>> => {
  const base = requireGamePlatformBase(query.apiBase)
  const params = new URLSearchParams()
  params.set('game_id', safeText(query.gameId))
  params.set('board', safeText(query.board || 'classic'))
  params.set('scope', safeText(query.scope || 'school'))
  params.set('limit', String(Math.min(Math.max(Number(query.limit) || 20, 1), 100)))
  if (safeText(query.cursor)) params.set('cursor', safeText(query.cursor))
  return requestGamePlatformJson<Record<string, unknown>>(`${base}/leaderboards?${params.toString()}`, {
    headers: gamePlatformHeaders(),
    timeoutMs: GAME_PLATFORM_REQUEST_TIMEOUT_MS
  })
}

export interface ClassicLeaderboardQuery {
  gameId: string
  /** class（默认，与游戏内一致）或 school */
  scope?: 'class' | 'school' | 'class_total'
  studentId?: string
  className?: string
  schoolName?: string
  limit?: number
  /** 覆盖 API base（远程配置下发时使用） */
  apiBase?: string
}

/**
 * Legacy `/api/game-rank/leaderboard` 只读（兼容契约 2：请求/响应形状逐字段冻结）。
 *
 * 注意：Legacy 响应**含 student_id**（冻结行为，仅展示用途），
 * 因此调用方必须经 `leaderboard.ts` 的白名单归一化后才可渲染。
 */
export const fetchClassicLeaderboard = async (
  query: ClassicLeaderboardQuery
): Promise<Record<string, unknown>> => {
  const base = requireGameRankBase(query.apiBase)
  const params = new URLSearchParams({
    game_id: safeText(query.gameId),
    scope: safeText(query.scope || 'class') || 'class',
    limit: String(Math.min(Math.max(Number(query.limit) || 20, 1), 100))
  })
  const studentId = safeText(query.studentId)
  const className = safeText(query.className)
  const schoolName = safeText(query.schoolName)
  if (studentId) params.set('student_id', studentId)
  if (className) params.set('class_name', className)
  if (schoolName) params.set('school_name', schoolName)
  return requestGamePlatformJson<Record<string, unknown>>(`${base}/leaderboard?${params.toString()}`, {
    timeoutMs: GAME_RANK_REQUEST_TIMEOUT_MS
  })
}
