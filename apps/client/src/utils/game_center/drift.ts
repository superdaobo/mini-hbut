/**
 * 漂流瓶（Drift Bottle，#910）客户端 API 访问层。
 *
 * 契约：CONTRACT-909-910 §2.5（端点 / 字段名 / 状态机冻结，客户端不得自行改形状）。
 *
 * 关键决策：
 * 1. **只经 `api.ts` 的传输层**：HTTPS/loopback 校验、超时、envelope→`GamePlatformError`
 *    归一化、`LOCAL_*` 本地码全部复用 `requestGamePlatformJson`，本文件不重复实现，
 *    也**不做任何 console / debug 输出**（与 api.ts 同一隐私约定）。
 * 2. **身份只来自 Identity AT 请求头**：UI 没有任何「输入用户 ID」的入口，
 *    请求体也绝不携带 sender / claimer 等身份字段（服务端 actor 只来自认证身份）。
 * 3. **前端校验只是体验层**：文本 1..500（按 Unicode code point 计，与 Python `len` 对齐）、
 *    红包金额为 1..10000 的整数（`0` = 文本瓶）。真正的约束在服务端，
 *    前端拦截只为少一次必然失败的往返，不参与安全判定。
 * 4. 空池（404 `DRIFT_POOL_EMPTY`）沿用服务端错误码不做特殊吞并 —— 由 UI 决定
 *    「这是正常状态而非故障」，避免两处对同一语义各写一套判定。
 */

import { getIdentityAccessToken } from '../identity_access_token'
import {
  GAME_PLATFORM_PROTOCOL_VERSION,
  GAME_PLATFORM_REQUEST_TIMEOUT_MS,
  GamePlatformError,
  LOCAL_ERROR_CODES,
  createIdempotencyKey,
  requestGamePlatformJson,
  resolveGamePlatformApiBase
} from './api'

/** 文本瓶内容长度上限（与契约 §2.5 / 服务端 `DRIFT_TEXT_INVALID` 一致） */
export const DRIFT_TEXT_MAX_LENGTH = 500

/** 文本瓶内容长度下限（空内容不允许投瓶） */
export const DRIFT_TEXT_MIN_LENGTH = 1

/** 单个红包金额上限（前端体验层；服务端仍会独立校验） */
export const DRIFT_COIN_AMOUNT_MAX = 10000

/** 举报补充说明长度上限（契约 §2.5 `detail<=200`） */
export const DRIFT_REPORT_DETAIL_MAX_LENGTH = 200

/** 举报原因白名单（契约冻结枚举，顺序即 UI 展示顺序） */
export const DRIFT_REPORT_REASONS = Object.freeze(['spam', 'abuse', 'fraud', 'other'] as const)

export type DriftReportReason = (typeof DRIFT_REPORT_REASONS)[number]

/** 契约 §2.5 已知错误码（UI 文案映射用；未列出的码回落服务端 message） */
export const DRIFT_ERROR_CODES = Object.freeze({
  poolEmpty: 'DRIFT_POOL_EMPTY',
  selfClaim: 'DRIFT_SELF_CLAIM',
  alreadyClaimed: 'DRIFT_ALREADY_CLAIMED',
  expired: 'DRIFT_EXPIRED',
  notFound: 'DRIFT_NOT_FOUND',
  textInvalid: 'DRIFT_TEXT_INVALID',
  rateLimited: 'RATE_LIMITED',
  dailyLimitExceeded: 'DAILY_LIMIT_EXCEEDED'
})

/**
 * 本层本地校验码（**不是**服务端码，形状同 `LOCAL_*` 约定）。
 * 正常 UI 流程会先过 `validate*`，这里只兜「绕过 UI 直接调用」的编程错误。
 */
export const DRIFT_LOCAL_ERROR_CODES = Object.freeze({
  invalidText: 'LOCAL_DRIFT_INVALID_TEXT',
  invalidAmount: 'LOCAL_DRIFT_INVALID_AMOUNT',
  invalidReason: 'LOCAL_DRIFT_INVALID_REASON'
})

export interface DriftBottle {
  bottleId: string
  text: string
  coinAmount: number
  status: string
  expiresAt: string
  /** 服务端给的展示名（匿名瓶为「匿名同学」或昵称），客户端不自行拼身份 */
  senderLabel: string
  isMine: boolean
}

export interface DriftPublishedBottle {
  bottleId: string
  status: string
  text: string
  coinAmount: number
  createdAt: string
  expiresAt: string
}

export interface DriftClaimResult {
  bottleId: string
  status: string
  coinAmount: number
  claimedAt: string
  /** true = 红包已入账（文本瓶恒 false） */
  credited: boolean
}

export interface DriftReportResult {
  reportId: string
  status: string
  bottleStatusAfter: string
}

export interface DriftHideResult {
  bottleId: string
  hiddenForMe: boolean
}

/** 文本校验结果：`reason` 为稳定枚举，由 UI 映射到三语文案（本层不产出面向用户的句子） */
export interface DriftTextValidation {
  ok: boolean
  /** 按 Unicode code point 计数（与 Python `len` 一致，emoji 记 1 个） */
  length: number
  reason: '' | 'empty' | 'tooLong'
}

/** 金额校验结果：`value` 仅在 `ok` 时有意义（空输入归一化为 0 = 文本瓶） */
export interface DriftCoinValidation {
  ok: boolean
  value: number
  reason: '' | 'notInteger' | 'notPositive' | 'tooLarge'
}

const safeText = (value: unknown): string => String(value ?? '').trim()

/** Unicode code point 计数（避免 JS UTF-16 把 emoji 记成 2 个，与后端 Python len 漂移） */
const countCodePoints = (value: string): number => Array.from(value).length

/**
 * 校验文本瓶内容（1..500，按 code point）。
 * 首尾空白不计入长度判断（提交时同样 trim），避免「看起来是空瓶但服务端放行」。
 */
export const validateDriftText = (raw: unknown): DriftTextValidation => {
  const text = safeText(raw)
  const length = countCodePoints(text)
  if (length < DRIFT_TEXT_MIN_LENGTH) return { ok: false, length, reason: 'empty' }
  if (length > DRIFT_TEXT_MAX_LENGTH) return { ok: false, length, reason: 'tooLong' }
  return { ok: true, length, reason: '' }
}

/** 提交用文本（与校验口径一致：trim 后发送） */
export const normalizeDriftText = (raw: unknown): string => safeText(raw)

/**
 * 校验 UI「红包模式」金额输入框：空输入 = 未填（返回 0）；显式 `0` 或更小视为
 * 「金额必须大于 0」；合法值必须是 1..10000 的整数。
 *
 * 只接受纯数字串（`/^\d+$/`）：`1.5` / `1e3` / `-1` / 全角数字一律判非法。
 * 投瓶 API 侧的 `coin_amount=0`（文本瓶）走 `parsePublishCoinAmount`，**不能**用本函数判定。
 */
export const validateDriftCoinAmount = (raw: unknown): DriftCoinValidation => {
  const text = safeText(raw)
  if (!text) return { ok: true, value: 0, reason: '' }
  if (!/^\d+$/.test(text)) return { ok: false, value: 0, reason: 'notInteger' }
  const value = Number(text)
  if (!Number.isSafeInteger(value)) return { ok: false, value: 0, reason: 'notInteger' }
  if (value < 1) return { ok: false, value: 0, reason: 'notPositive' }
  if (value > DRIFT_COIN_AMOUNT_MAX) return { ok: false, value: 0, reason: 'tooLarge' }
  return { ok: true, value, reason: '' }
}

/**
 * 投瓶路径的金额解析：`0` / 空 = 文本瓶（**合法**），非 0 必须是 1..10000 的整数。
 *
 * 与 `validateDriftCoinAmount` 的差异（有意为之）：后者服务 UI「红包模式」输入框
 * （用户显式填 0 应提示「必须大于 0」），而本函数服务 API 语义 —— `coin_amount=0`
 * 就是文本瓶，不能被当成非法输入拦掉。
 */
const parsePublishCoinAmount = (raw: unknown): number => {
  const text = safeText(raw)
  if (!text) return 0
  if (!/^\d+$/.test(text)) {
    throw new GamePlatformError(DRIFT_LOCAL_ERROR_CODES.invalidAmount, '红包金额必须是整数', {
      retryable: false
    })
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value < 0 || value > DRIFT_COIN_AMOUNT_MAX) {
    throw new GamePlatformError(
      DRIFT_LOCAL_ERROR_CODES.invalidAmount,
      `红包金额需在 0..${DRIFT_COIN_AMOUNT_MAX} 之间`,
      { retryable: false }
    )
  }
  return value
}

export interface DriftRequestOptions {
  /** 覆盖 API base（缺省走环境派生默认源） */
  apiBase?: string
  timeoutMs?: number
}

interface DriftAuthorizedOptions extends DriftRequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

/**
 * 解析 base：不可用即抛「配置缺失」本地码（fail closed，绝不发相对路径 / 明文请求）。
 * 复用 api.ts 导出的解析器（内部已含 HTTPS + 跨环境护栏）。
 */
const requireDriftBase = (apiBase?: string): string => {
  const base = resolveGamePlatformApiBase(apiBase)
  if (!base) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.configMissing, '游戏平台服务未配置，漂流瓶暂时不可用', {
      retryable: false
    })
  }
  return base
}

/**
 * 取 Identity AT 并组请求头；未登录 → 抛 `LOCAL_AUTH_MISSING`（UI 显示登录提示而非空白）。
 * AT 只在内存与请求头中出现，不落盘、不打印。
 */
const requireIdentityHeaders = async (): Promise<Record<string, string>> => {
  const token = await getIdentityAccessToken()
  if (!token) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.authMissing, '当前未登录，无法使用漂流瓶', {
      retryable: false
    })
  }
  return {
    Authorization: `Bearer ${token}`,
    'X-Game-Platform-Protocol': String(GAME_PLATFORM_PROTOCOL_VERSION)
  }
}

const authorizedDriftRequest = async <T = Record<string, unknown>>(
  path: string,
  options: DriftAuthorizedOptions = {}
): Promise<T> => {
  const base = requireDriftBase(options.apiBase)
  const headers = await requireIdentityHeaders()
  return requestGamePlatformJson<T>(`${base}${path}`, {
    method: options.method || 'GET',
    headers: { ...headers, ...(options.headers || {}) },
    body: options.body,
    timeoutMs: options.timeoutMs ?? GAME_PLATFORM_REQUEST_TIMEOUT_MS
  })
}

/** 响应体解包：契约是顶层平铺（`{"ok":true, ...}`），`data` 仅作容错兜底 */
const unwrapDriftPayload = (payload: unknown): Record<string, unknown> => {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const nested = body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : null
  return nested ? { ...nested, ...body } : body
}

const toSafeInt = (value: unknown, fallback = 0): number => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

const requireBottleId = (value: unknown): string => {
  const id = safeText(value)
  if (!id) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.responseInvalid, '漂流瓶数据异常，请稍后重试', {
      retryable: true
    })
  }
  return id
}

/** 归一化「捞到的瓶子」（契约字段；缺 `bottle_id` 视为服务端返回异常） */
export const normalizeDriftBottle = (payload: unknown): DriftBottle => {
  const body = unwrapDriftPayload(payload)
  const bottle =
    body.bottle && typeof body.bottle === 'object' ? (body.bottle as Record<string, unknown>) : body
  return {
    bottleId: requireBottleId(bottle.bottle_id),
    text: String(bottle.text ?? ''),
    coinAmount: toSafeInt(bottle.coin_amount, 0),
    status: safeText(bottle.status),
    expiresAt: safeText(bottle.expires_at),
    senderLabel: safeText(bottle.sender_label),
    isMine: bottle.is_mine === true
  }
}

/**
 * POST /drift-bottles —— 投瓶（文本瓶 `coinAmount=0`；红包瓶 1..10000）。
 *
 * `clientRequestId` 缺省自动生成；调用方在同一份内容重试时应复用同一个 id，
 * 让服务端的幂等键真正生效（网络超时重试不会二次扣款）。
 */
export const publishDriftBottle = async (input: {
  text: string
  coinAmount?: number
  clientRequestId?: string
  apiBase?: string
  timeoutMs?: number
}): Promise<DriftPublishedBottle> => {
  const text = normalizeDriftText(input.text)
  const textValidation = validateDriftText(text)
  if (!textValidation.ok) {
    throw new GamePlatformError(DRIFT_LOCAL_ERROR_CODES.invalidText, '漂流瓶内容不符合要求，请调整后再试', {
      retryable: false
    })
  }
  const coinAmount = parsePublishCoinAmount(input.coinAmount ?? 0)
  const clientRequestId = safeText(input.clientRequestId) || createIdempotencyKey()
  const payload = await authorizedDriftRequest<Record<string, unknown>>('/drift-bottles', {
    method: 'POST',
    apiBase: input.apiBase,
    timeoutMs: input.timeoutMs,
    body: {
      text,
      coin_amount: coinAmount,
      client_request_id: clientRequestId
    }
  })
  const body = unwrapDriftPayload(payload)
  return {
    bottleId: requireBottleId(body.bottle_id),
    status: safeText(body.status),
    text: String(body.text ?? text),
    coinAmount: toSafeInt(body.coin_amount, coinAmount),
    createdAt: safeText(body.created_at),
    expiresAt: safeText(body.expires_at)
  }
}

/**
 * GET /drift-bottles/random —— 捞一个瓶子。
 * 空池时服务端返回 404 `DRIFT_POOL_EMPTY`，本层原样抛出（不吞并、不伪造空瓶）。
 */
export const drawRandomDriftBottle = async (
  options: DriftRequestOptions & { excludeRecent?: boolean } = {}
): Promise<DriftBottle> => {
  const params = new URLSearchParams()
  params.set('exclude_recent', options.excludeRecent === false ? 'false' : 'true')
  const payload = await authorizedDriftRequest<Record<string, unknown>>(
    `/drift-bottles/random?${params.toString()}`,
    { apiBase: options.apiBase, timeoutMs: options.timeoutMs }
  )
  return normalizeDriftBottle(payload)
}

/** POST /drift-bottles/{id}/claim —— 领取（红包瓶走 escrow，并发单赢由服务端保证） */
export const claimDriftBottle = async (
  bottleId: string,
  options: DriftRequestOptions = {}
): Promise<DriftClaimResult> => {
  const id = requireBottleId(bottleId)
  const payload = await authorizedDriftRequest<Record<string, unknown>>(
    `/drift-bottles/${encodeURIComponent(id)}/claim`,
    // 契约未定义 claim body；显式空 JSON 让 Content-Type 与 body 都存在，
    // 避免服务端统一 `request.json()` 解析路径在「无 body 的 POST」上报错。
    { method: 'POST', body: {}, apiBase: options.apiBase, timeoutMs: options.timeoutMs }
  )
  const body = unwrapDriftPayload(payload)
  return {
    bottleId: requireBottleId(body.bottle_id ?? id),
    status: safeText(body.status),
    coinAmount: toSafeInt(body.coin_amount, 0),
    claimedAt: safeText(body.claimed_at),
    credited: body.credited === true
  }
}

/** POST /drift-bottles/{id}/report —— 举报（独立 moderation 维度，不影响领取状态机） */
export const reportDriftBottle = async (
  bottleId: string,
  input: { reason: DriftReportReason; detail?: string } & DriftRequestOptions
): Promise<DriftReportResult> => {
  const id = requireBottleId(bottleId)
  const reason = safeText(input.reason)
  if (!(DRIFT_REPORT_REASONS as readonly string[]).includes(reason)) {
    throw new GamePlatformError(DRIFT_LOCAL_ERROR_CODES.invalidReason, '举报原因无效', { retryable: false })
  }
  const detail = safeText(input.detail).slice(0, DRIFT_REPORT_DETAIL_MAX_LENGTH)
  const payload = await authorizedDriftRequest<Record<string, unknown>>(
    `/drift-bottles/${encodeURIComponent(id)}/report`,
    {
      method: 'POST',
      apiBase: input.apiBase,
      timeoutMs: input.timeoutMs,
      body: { reason, detail }
    }
  )
  const body = unwrapDriftPayload(payload)
  return {
    reportId: safeText(body.report_id),
    status: safeText(body.status),
    bottleStatusAfter: safeText(body.bottle_status_after)
  }
}

/** POST /drift-bottles/{id}/hide —— 隐藏（仅影响本人可见性，不改全局状态机） */
export const hideDriftBottle = async (
  bottleId: string,
  options: DriftRequestOptions = {}
): Promise<DriftHideResult> => {
  const id = requireBottleId(bottleId)
  const payload = await authorizedDriftRequest<Record<string, unknown>>(
    `/drift-bottles/${encodeURIComponent(id)}/hide`,
    // 同 claim：契约未定义 body，显式空 JSON 兼容服务端统一 body 解析路径。
    { method: 'POST', body: {}, apiBase: options.apiBase, timeoutMs: options.timeoutMs }
  )
  const body = unwrapDriftPayload(payload)
  return {
    bottleId: requireBottleId(body.bottle_id ?? id),
    hiddenForMe: body.hidden_for_me !== false
  }
}
