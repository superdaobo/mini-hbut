/**
 * Game Platform 客户端（#905）：只读查询 + Launch Ticket 签发。
 *
 * 关键决策：
 * 1. **HTTPS 优先**（Epic #900 兼容原则 + App Store remoteModules 策略）：
 *    所有 Game Platform / Game Rank 请求必须 HTTPS 或 loopback，否则直接拒绝，不降级到明文。
 * 2. **凭据不落盘、不回显、不入日志**：Identity AT / ticket 只在内存与请求头中传递；
 *    本文件不做任何 console / debug 输出（协议 §10 L1）。
 * 3. 错误统一映射为协议 §5 的 code（服务端 message 已是可直接展示的简体中文，客户端不二次映射）。
 * 4. 未交付能力（经济 / 赛季）由 feature flag 前置关闭，本文件的对应函数不会被调用。
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
}

/** 统一的 Game Platform 错误（code 取值见 protocol-v1.md §5） */
export class GamePlatformError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly httpStatus: number
  readonly requestId: string

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; httpStatus?: number; requestId?: string } = {}
  ) {
    super(message)
    this.name = 'GamePlatformError'
    this.code = code
    this.retryable = options.retryable === true
    this.httpStatus = Number(options.httpStatus || 0)
    this.requestId = String(options.requestId || '')
  }
}

/** 客户端本地失败码（非服务端错误码，用于 UI 区分「网络/配置」类降级） */
export const LOCAL_ERROR_CODES = Object.freeze({
  transportInsecure: 'LOCAL_TRANSPORT_INSECURE',
  transportFailed: 'LOCAL_TRANSPORT_FAILED',
  responseInvalid: 'LOCAL_RESPONSE_INVALID',
  authMissing: 'LOCAL_AUTH_MISSING'
})

const safeText = (value: unknown): string => String(value ?? '').trim()

/**
 * 解析 Game Platform API base：远程配置覆盖 → 云同步同源派生 → 默认值。
 * 只返回通过 HTTPS 校验的地址。
 */
export const resolveGamePlatformApiBase = (override?: unknown): string => {
  const explicit = safeText(override)
  if (isSecureGamePlatformUrl(explicit)) return explicit.replace(/\/+$/, '')
  return DEFAULT_GAME_PLATFORM_API_BASE
}

/**
 * 解析 Legacy Game Rank API base（与 MoreView 既有实现同源，避免两处默认值漂移）。
 */
export const resolveGameRankApiBase = (): string => {
  try {
    const runtime = getCloudSyncRuntimeConfig()
    const endpoint = safeText(runtime?.proxyEndpoint || runtime?.endpoint)
    if (endpoint) {
      const derived = endpoint.replace(/\/cloud-sync$/i, LEGACY_GAME_RANK_NAMESPACE)
      if (isSecureGamePlatformUrl(derived)) return derived
    }
  } catch {
    // 运行时配置读取失败：退回默认源
  }
  return DEFAULT_GAME_RANK_API
}

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
    const code = safeText(shaped.code)
    if (code) {
      return {
        code,
        message: safeText(shaped.message) || '游戏服务暂时不可用',
        retryable: shaped.retryable === true,
        request_id: safeText(shaped.request_id)
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
      requestId: shapedError.request_id
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

export interface GamePlatformMeta {
  protocolVersion: { min: number; max: number } | null
  serverVersion: string
  features: Record<string, unknown>
  registryGames: number
  raw: Record<string, unknown>
}

/** GET /meta：版本协商与能力清单（无认证） */
export const fetchGamePlatformMeta = async (
  apiBase?: string,
  timeoutMs = GAME_PLATFORM_REQUEST_TIMEOUT_MS
): Promise<GamePlatformMeta> => {
  const base = resolveGamePlatformApiBase(apiBase)
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
  return {
    protocolVersion: range
      ? { min: Number(range.min) || 0, max: Number(range.max) || 0 }
      : null,
    serverVersion: safeText(payload.server_version),
    features:
      payload.features && typeof payload.features === 'object'
        ? (payload.features as Record<string, unknown>)
        : {},
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
  const base = resolveGamePlatformApiBase(options.apiBase)
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
  const base = resolveGamePlatformApiBase(apiBase)
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
  const base = resolveGamePlatformApiBase(query.apiBase)
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
  const base = safeText(query.apiBase) || resolveGameRankApiBase()
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
  return requestGamePlatformJson<Record<string, unknown>>(
    `${isSecureGamePlatformUrl(base) ? base : resolveGameRankApiBase()}/leaderboard?${params.toString()}`,
    { timeoutMs: GAME_RANK_REQUEST_TIMEOUT_MS }
  )
}
