/**
 * #909 积分中心 + 总排行榜客户端访问层（Worker C 独占；契约 §2.1 / §2.3 / §2.4）。
 *
 * 职责边界（为什么单独一层）：
 * 1. **唯一网络入口**：积分中心（钱包 / 每日任务 / 账本）与总排行榜的一切请求都从这里走，
 *    组件不直接 import api.ts —— 同一端点不允许出现第二种解析 / 降级 / 错误映射逻辑；
 * 2. **复用而非重造**：传输层直接走 api.ts 的 `requestGamePlatformJson`
 *    （HTTPS / loopback 强制校验 + 超时 + ErrorEnvelope 归一化），base 解析复用
 *    api.ts 的 `pickEnvironmentCompatibleBase` 与 base.ts 的
 *    `isSecureGamePlatformUrl` / `DEFAULT_GAME_PLATFORM_API_BASE`；
 * 3. **白名单展示模型**：归一化只挑出契约字段（player_ref / display_name / xp_total /
 *    level / rank / 金额 / 任务进度 / 时间戳），服务端多返回的 student_id / sub /
 *    user_id / idempotency_key 等一律不进模型（协议 §9.3 PII 硬约束，
 *    与 `leaderboard.ts` 的白名单策略一致）；`ref_id` 同样不进入展示模型；
 * 4. **凭据不落日志**：Identity AT 只在请求头传递，本文件**不做任何 console / debug 输出**。
 *
 * 降级：所有失败统一抛 `GamePlatformError`（code / retryable / httpStatus 齐全），
 * 由组件渲染「中文提示 + 重试按钮」，绝不白屏、绝不抛未捕获异常。
 * 能力关闭（404 `FEATURE_DISABLED`）不是异常路径：调用方按 `code` 分支渲染占位文案。
 */

import { getIdentityAccessToken } from '../identity_access_token'
import {
  DEFAULT_GAME_PLATFORM_API_BASE,
  GAME_PLATFORM_PROTOCOL_VERSION,
  // 集成裁决：LOCAL_ERROR_CODES 从叶子 base.ts 取，**不能**从 api.ts 取 ——
  // api.ts 要按「API 只经 api.ts」转接导出本文件（api.ts → points.ts），
  // 而本文件在**模块顶层**读该表（POINTS_AUTH_ERROR_CODES）。若从 api.ts 取，
  // 循环下顶层读取会拿到 undefined（实测 TypeError: Cannot access 'authMissing'）。
  LOCAL_ERROR_CODES,
  isSecureGamePlatformUrl
} from './base'
import { GamePlatformError, pickEnvironmentCompatibleBase, requestGamePlatformJson } from './api'
import { UNKNOWN_PLAYER_NAME } from './leaderboard'

/** 服务端「能力关闭」语义码（与既有灰度语义一致，不是错误，是前置隐藏的兜底） */
export const FEATURE_DISABLED_CODE = 'FEATURE_DISABLED'

/** 总榜适配的 board 值（契约 §2.3：本轮只支持 global_xp） */
export const GLOBAL_XP_BOARD = 'global_xp'

/** 账本默认 / 最大分页（契约 §2.1：默认 20，上限 100，超出夹紧不报错） */
export const LEDGER_DEFAULT_LIMIT = 20

/** 总榜默认 / 最大分页（契约 §2.3：默认 50，上限 100） */
export const GLOBAL_RANK_DEFAULT_LIMIT = 50

const MAX_PAGE_LIMIT = 100

const safeText = (value: unknown): string => String(value ?? '').trim()

const safeInt = (value: unknown): number => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : 0
}

/** 非负整数（负数 / NaN 一律 0；XP / 湖工币 / 名次都不允许出现负展示值） */
const safeNonNegativeInt = (value: unknown): number => Math.max(0, safeInt(value))

/** 可空整数（契约里 `*_cap` 允许 null = 不限） */
const safeNullableInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : null
}

/** 分页 limit 夹紧：非法 / 缺省回落默认值，越界夹到 [1, 100]（契约要求「夹紧不报错」） */
export const clampPageLimit = (value: unknown, fallback: number): number => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    const fallbackNum = Number(fallback)
    if (!Number.isFinite(fallbackNum) || fallbackNum <= 0) return LEDGER_DEFAULT_LIMIT
    return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(fallbackNum)))
  }
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(num)))
}

// ---------------------------------------------------------------------------
// 请求（网络层）
// ---------------------------------------------------------------------------

export interface PointsRequestOptions {
  /** 覆盖 API base（Integration 传远程配置下发的 api_base；缺省走环境默认源） */
  apiBase?: string
  /** 覆盖超时（缺省沿用既有游戏 12s 约定） */
  timeoutMs?: number
}

/**
 * 解析积分服务 base：显式覆盖 → 环境默认源；候选必须是 loopback 或 HTTPS
 * 且与本构建环境兼容。都不可用 → 抛可读的本地错误（防御性守卫，fail closed）。
 *
 * 这里显式再调一次 `isSecureGamePlatformUrl`：`pickEnvironmentCompatibleBase` 内部已含
 * 该判定，此处保留为**独立断言**（单测可直接锁定「明文地址必须被拒」的契约）。
 */
export const requirePointsBase = (override?: unknown): string => {
  const base = pickEnvironmentCompatibleBase([safeText(override), DEFAULT_GAME_PLATFORM_API_BASE])
  if (!base || !isSecureGamePlatformUrl(base)) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.configMissing, '积分服务地址未配置（无环境兼容的 API 地址）', {
      retryable: false
    })
  }
  return base
}

/**
 * 取 Identity AT；provider 抛错按「未登录」降级（不把底层异常泄漏给 UI）。
 * 未登录不是网络故障：`retryable=false`，组件只提示登录而不展示重试按钮。
 */
const resolveAccessToken = async (): Promise<string> => {
  try {
    return safeText(await getIdentityAccessToken())
  } catch {
    return ''
  }
}

const pointsHeaders = (accessToken: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'X-Game-Platform-Protocol': String(GAME_PLATFORM_PROTOCOL_VERSION)
  }
  // 凭据只进请求头，不落盘、不回显、不入日志
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return headers
}

/**
 * 带凭据 GET（钱包 / 每日任务 / 账本）：未登录直接抛 `LOCAL_AUTH_MISSING`。
 */
const authorizedPointsGet = async <T>(path: string, options: PointsRequestOptions = {}): Promise<T> => {
  const base = requirePointsBase(options.apiBase)
  const accessToken = await resolveAccessToken()
  if (!accessToken) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.authMissing, '当前未登录，无法读取积分数据', {
      retryable: false
    })
  }
  return requestGamePlatformJson<T>(`${base}${path}`, {
    headers: pointsHeaders(accessToken),
    timeoutMs: options.timeoutMs
  })
}

/**
 * 公开 GET（总榜）：认证**可选** —— 未登录也能看榜（`me` 为 null），
 * 有凭据则带上以获取本人排名（服务端验签失败会 401，绝不静默降级为匿名，故此处不做重试）。
 */
const publicPointsGet = async <T>(path: string, options: PointsRequestOptions = {}): Promise<T> => {
  const base = requirePointsBase(options.apiBase)
  const accessToken = await resolveAccessToken()
  return requestGamePlatformJson<T>(`${base}${path}`, {
    headers: pointsHeaders(accessToken),
    timeoutMs: options.timeoutMs
  })
}

// ---------------------------------------------------------------------------
// 展示模型（白名单归一化）
// ---------------------------------------------------------------------------

/** 钱包快照（契约 §2.1 GET /me/wallet 的白名单投影） */
export interface PointsWallet {
  playerRef: string
  xpTotal: number
  level: number
  levelCurve: {
    /** 当前等级内已积累 XP */
    xpIntoLevel: number
    /** 距下一级还差多少 XP（满级为 0） */
    xpForNext: number
    /** 当前等级完整跨度（满级为 0） */
    xpSpan: number
  }
  coinBalance: number
  today: {
    date: string
    xpGained: number
    coinGained: number
    runCount: number
  }
  dailyCaps: {
    xpCap: number | null
    coinCap: number | null
    runCap: number | null
  }
  ruleVersion: string
  economyEnabled: boolean
}

/** 每日任务项（契约 §2.4；`title` 为服务端兜底文案，已知 task_id 由本地 i18n 覆盖） */
export interface PointsDailyTask {
  taskId: string
  title: string
  target: number
  progress: number
  completed: boolean
  rewardXp: number
  rewardCoin: number
  rewardStatus: string
}

export interface PointsDailyTasksSnapshot {
  date: string
  tasks: PointsDailyTask[]
  ruleVersion: string
  everydayResetAt: string
}

/** 账本条目（契约 §2.1 ledger item 的白名单投影；`ref_id` 不进入展示模型） */
export interface PointsLedgerEntry {
  key: string
  entryType: string
  reasonCode: string
  xpDelta: number
  coinDelta: number
  createdAt: string
}

export interface PointsLedgerPage {
  items: PointsLedgerEntry[]
  nextCursor: string
  ruleVersion: string
}

/** 总榜行（契约 §2.3；`player_ref` / `display_name` 是唯一允许的身份字段） */
export interface GlobalRankRow {
  rank: number
  playerRef: string
  displayName: string
  xpTotal: number
  level: number
  isSelf: boolean
}

export interface GlobalXpBoard {
  board: string
  seasonId: string
  items: GlobalRankRow[]
  /** 本人摘要；未登录 / 服务端未返回时为 null（不是错误） */
  me: GlobalRankRow | null
  nextCursor: string
  ruleVersion: string
  generatedAt: string
}

/** `payload.wallet` / `payload.data` 包装形态（历史兼容）统一解包 */
const unwrapBody = (payload: unknown, keys: readonly string[] = []): Record<string, unknown> => {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  for (const key of keys) {
    const candidate = body[key]
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>
    }
  }
  const data = body.data
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return body
}

/** 安全取对象：非对象（含 null / 数组元素非法）一律视为空对象 → 调用方回落安全默认值 */
const pickRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/**
 * GET /me/wallet 归一化：只保留契约字段。
 * 任何字段缺失 / 类型非法都回落 0 / '' / null（不抛错、不猜值）。
 */
export const normalizePointsWallet = (payload: unknown): PointsWallet => {
  const body = unwrapBody(payload, ['wallet'])
  const curve = pickRecord(body.level_curve ?? body.levelCurve)
  const today = pickRecord(body.today)
  const dailyCaps = pickRecord(body.daily_caps ?? body.dailyCaps)
  return {
    playerRef: safeText(body.player_ref ?? body.playerRef),
    xpTotal: safeNonNegativeInt(body.xp_total ?? body.xpTotal ?? body.xp),
    level: safeNonNegativeInt(body.level ?? curve.level),
    levelCurve: {
      xpIntoLevel: safeNonNegativeInt(curve.xp_into_level ?? curve.xpIntoLevel),
      xpForNext: safeNonNegativeInt(curve.xp_for_next ?? curve.xpForNext),
      xpSpan: safeNonNegativeInt(curve.xp_span ?? curve.xpSpan)
    },
    coinBalance: safeNonNegativeInt(body.coin_balance ?? body.coinBalance ?? body.coins),
    today: {
      date: safeText(today.date),
      xpGained: safeNonNegativeInt(today.xp_gained ?? today.xpGained),
      coinGained: safeNonNegativeInt(today.coin_gained ?? today.coinGained),
      runCount: safeNonNegativeInt(today.run_count ?? today.runCount)
    },
    dailyCaps: {
      xpCap: safeNullableInt(dailyCaps.xp_cap ?? dailyCaps.xpCap),
      coinCap: safeNullableInt(dailyCaps.coin_cap ?? dailyCaps.coinCap),
      runCap: safeNullableInt(dailyCaps.run_cap ?? dailyCaps.runCap)
    },
    ruleVersion: safeText(body.rule_version ?? body.ruleVersion),
    economyEnabled: body.economy_enabled === true || body.economyEnabled === true
  }
}

/** 升级进度百分比（0..100 整数；满级 / 跨度非法时为 0，避免除零与 NaN） */
export const levelProgressPercent = (curve: PointsWallet['levelCurve']): number => {
  const span = safeNonNegativeInt(curve?.xpSpan)
  if (span <= 0) return 0
  const into = safeNonNegativeInt(curve?.xpIntoLevel)
  return Math.min(100, Math.max(0, Math.round((into / span) * 100)))
}

/** 任务进度百分比（0..100 整数；target<=0 时 0） */
export const taskProgressPercent = (progress: unknown, target: unknown): number => {
  const targetNum = safeNonNegativeInt(target)
  if (targetNum <= 0) return 0
  const progressNum = safeNonNegativeInt(progress)
  return Math.min(100, Math.max(0, Math.round((progressNum / targetNum) * 100)))
}

/** GET /me/daily-tasks 归一化（任务数组只保留契约字段；非法项直接丢弃） */
export const normalizePointsDailyTasks = (payload: unknown): PointsDailyTasksSnapshot => {
  const body = unwrapBody(payload, ['daily_tasks'])
  const rawTasks = Array.isArray(body.tasks) ? body.tasks : []
  const tasks: PointsDailyTask[] = []
  for (const raw of rawTasks) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const taskId = safeText(item.task_id ?? item.taskId)
    if (!taskId) continue
    tasks.push({
      taskId,
      title: safeText(item.title),
      target: safeNonNegativeInt(item.target),
      progress: safeNonNegativeInt(item.progress),
      completed: item.completed === true,
      rewardXp: safeNonNegativeInt(item.reward_xp ?? item.rewardXp),
      rewardCoin: safeNonNegativeInt(item.reward_coin ?? item.rewardCoin),
      rewardStatus: safeText(item.reward_status ?? item.rewardStatus)
    })
  }
  return {
    date: safeText(body.date),
    tasks,
    ruleVersion: safeText(body.rule_version ?? body.ruleVersion),
    everydayResetAt: safeText(body.everyday_reset_at ?? body.everydayResetAt)
  }
}

/** 账本条目稳定 key：entry_id 优先，缺失时用「原因码 + 时间 + 序号」占位（绝不用 player_id） */
const ledgerEntryKey = (item: Record<string, unknown>, index: number): string => {
  const entryId = safeText(item.entry_id ?? item.entryId)
  if (entryId) return entryId
  const reason = safeText(item.reason_code ?? item.reasonCode) || 'entry'
  const createdAt = safeText(item.created_at ?? item.createdAt) || 'unknown'
  return `seq:${reason}:${createdAt}:${index}`
}

/** GET /me/wallet/ledger 归一化（白名单：丢弃 ref_id / idempotency_key 等非展示字段） */
export const normalizePointsLedger = (payload: unknown): PointsLedgerPage => {
  const body = unwrapBody(payload, ['ledger'])
  const rawItems = Array.isArray(body.items) ? body.items : []
  const items: PointsLedgerEntry[] = []
  rawItems.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const item = raw as Record<string, unknown>
    items.push({
      key: ledgerEntryKey(item, index),
      entryType: safeText(item.entry_type ?? item.entryType),
      reasonCode: safeText(item.reason_code ?? item.reasonCode),
      xpDelta: safeInt(item.xp_delta ?? item.xpDelta),
      coinDelta: safeInt(item.coin_delta ?? item.coinDelta),
      createdAt: safeText(item.created_at ?? item.createdAt)
    })
  })
  return {
    items,
    nextCursor: safeText(body.next_cursor ?? body.nextCursor),
    ruleVersion: safeText(body.rule_version ?? body.ruleVersion)
  }
}

/** 榜单单行归一化（契约 §2.3 白名单；昵称缺失回落脱敏占位，绝不用学号） */
const normalizeRankRow = (raw: unknown, fallbackRank: number, selfRef: string): GlobalRankRow | null => {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const playerRef = safeText(item.player_ref ?? item.playerRef)
  const displayName = safeText(item.display_name ?? item.displayName) || UNKNOWN_PLAYER_NAME
  return {
    rank: safeNonNegativeInt(item.rank) || safeNonNegativeInt(fallbackRank),
    playerRef,
    displayName,
    xpTotal: safeNonNegativeInt(item.xp_total ?? item.xpTotal),
    level: safeNonNegativeInt(item.level),
    isSelf: !!selfRef && !!playerRef && playerRef === selfRef
  }
}

/** GET /leaderboards?board=global_xp 归一化（`me` 必填语义：未登录时为 null，不算失败） */
export const normalizeGlobalXpBoard = (payload: unknown): GlobalXpBoard => {
  const body = unwrapBody(payload, ['leaderboard'])
  const rawItems = Array.isArray(body.items) ? body.items : []
  const rawMe = body.me ?? null
  const meShape = rawMe && typeof rawMe === 'object' ? (rawMe as Record<string, unknown>) : null
  const selfRef = meShape ? safeText(meShape.player_ref ?? meShape.playerRef) : ''
  const items: GlobalRankRow[] = []
  rawItems.forEach((raw, index) => {
    const row = normalizeRankRow(raw, index + 1, selfRef)
    if (row) items.push(row)
  })
  return {
    board: safeText(body.board) || GLOBAL_XP_BOARD,
    seasonId: safeText(body.season_id ?? body.seasonId),
    items,
    me: normalizeRankRow(rawMe, 0, selfRef),
    nextCursor: safeText(body.next_cursor ?? body.nextCursor),
    ruleVersion: safeText(body.rule_version ?? body.ruleVersion),
    generatedAt: safeText(body.generated_at ?? body.generatedAt)
  }
}

/** 追加页合并（cursor 分页防重）：以 `playerRef` 为稳定键，缺 ref 的行用 `rank` 兜底 */
export const mergeGlobalRankRows = (
  existing: readonly GlobalRankRow[],
  incoming: readonly GlobalRankRow[]
): GlobalRankRow[] => {
  const seen = new Set<string>()
  const output: GlobalRankRow[] = []
  for (const row of [...existing, ...incoming]) {
    const key = row.playerRef || `rank:${row.rank}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(row)
  }
  return output
}

/** 账本追加页合并（同上，以 `key` 去重，防止重复 cursor 导致重复行） */
export const mergeLedgerEntries = (
  existing: readonly PointsLedgerEntry[],
  incoming: readonly PointsLedgerEntry[]
): PointsLedgerEntry[] => {
  const seen = new Set<string>()
  const output: PointsLedgerEntry[] = []
  for (const entry of [...existing, ...incoming]) {
    if (seen.has(entry.key)) continue
    seen.add(entry.key)
    output.push(entry)
  }
  return output
}

// ---------------------------------------------------------------------------
// 文案映射（i18n key；组件用 t()/tf() 渲染，未知码回落通用文案）
// ---------------------------------------------------------------------------

/**
 * 账本 `reason_code` → i18n key（服务端 `errors.LEDGER_REASON_CODES` 冻结枚举）。
 * 未知码由调用方回落 `...reason.unknown`（不展示原始码可避免文案穿插英文机器码）。
 */
export const LEDGER_REASON_I18N_KEYS: Readonly<Record<string, string>> = Object.freeze({
  run_settled: 'gameCenter.points.reason.runSettled',
  daily_cap_applied: 'gameCenter.points.reason.dailyCapApplied',
  reward_disabled: 'gameCenter.points.reason.rewardDisabled',
  bottle_create: 'gameCenter.points.reason.bottleCreate',
  bottle_claim: 'gameCenter.points.reason.bottleClaim',
  bottle_expired: 'gameCenter.points.reason.bottleExpired',
  bottle_self_claim_rejected: 'gameCenter.points.reason.bottleSelfClaimRejected',
  season_finalized: 'gameCenter.points.reason.seasonFinalized',
  admin_manual: 'gameCenter.points.reason.adminManual'
})

/** 账本 `entry_type` → i18n key（服务端 `errors.LEDGER_ENTRY_TYPES` 冻结枚举） */
export const LEDGER_ENTRY_TYPE_I18N_KEYS: Readonly<Record<string, string>> = Object.freeze({
  reward: 'gameCenter.points.entryType.reward',
  quest_reward: 'gameCenter.points.entryType.questReward',
  season_reward: 'gameCenter.points.entryType.seasonReward',
  escrow_hold: 'gameCenter.points.entryType.escrowHold',
  escrow_release: 'gameCenter.points.entryType.escrowRelease',
  escrow_refund: 'gameCenter.points.entryType.escrowRefund',
  penalty: 'gameCenter.points.entryType.penalty',
  admin_adjust: 'gameCenter.points.entryType.adminAdjust'
})

/** 每日任务 `task_id` → i18n key（V1 三个任务；未知 task_id 回落服务端 title） */
export const DAILY_TASK_TITLE_I18N_KEYS: Readonly<Record<string, string>> = Object.freeze({
  daily_play_1: 'gameCenter.points.task.dailyPlay1',
  daily_play_3: 'gameCenter.points.task.dailyPlay3',
  daily_play_distinct_3: 'gameCenter.points.task.dailyDistinct3'
})

/** 任务 `reward_status` → i18n key（granted / capped / disabled / none / zero） */
export const REWARD_STATUS_I18N_KEYS: Readonly<Record<string, string>> = Object.freeze({
  granted: 'gameCenter.points.rewardGranted',
  capped: 'gameCenter.points.rewardCapped',
  disabled: 'gameCenter.points.rewardDisabled',
  none: 'gameCenter.points.rewardNone',
  zero: 'gameCenter.points.rewardZero'
})

/**
 * 认证类错误码（本地 + 服务端）：组件据此显示「登录后可用」而不是「重试」。
 * - `LOCAL_AUTH_MISSING`：客户端拿不到 Identity AT（未登录）；
 * - `AUTH_REQUIRED`：服务端 401（缺 Bearer / 形状非法 / 验签失败，fail closed）；
 * - `GAME_SESSION_EXPIRED`：游戏会话过期（需重新授权）；
 * - `UNAUTHORIZED`：兜底大类码。
 */
export const POINTS_AUTH_ERROR_CODES: readonly string[] = Object.freeze([
  LOCAL_ERROR_CODES.authMissing,
  'AUTH_REQUIRED',
  'GAME_SESSION_EXPIRED',
  'UNAUTHORIZED'
])

/** 是否为认证类失败（未登录 / 需重新授权）：UI 不展示重试按钮，提示登录即可 */
export const isPointsAuthError = (error: unknown): boolean =>
  POINTS_AUTH_ERROR_CODES.includes(safeText((error as { code?: unknown } | null)?.code))

/** 是否为「能力关闭」语义（服务端 404 FEATURE_DISABLED）：UI 展示占位文案而非错误 */
export const isPointsFeatureDisabled = (error: unknown): boolean =>
  safeText((error as { code?: unknown } | null)?.code) === FEATURE_DISABLED_CODE

/** 任意枚举码 → i18n key（命中返回映射值，未命中返回 `''` 由调用方兜底） */
const i18nKeyFor = (table: Readonly<Record<string, string>>, code: unknown): string =>
  table[safeText(code)] || ''

export const ledgerReasonI18nKey = (reasonCode: unknown): string =>
  i18nKeyFor(LEDGER_REASON_I18N_KEYS, reasonCode)

export const ledgerEntryTypeI18nKey = (entryType: unknown): string =>
  i18nKeyFor(LEDGER_ENTRY_TYPE_I18N_KEYS, entryType)

export const dailyTaskTitleI18nKey = (taskId: unknown): string =>
  i18nKeyFor(DAILY_TASK_TITLE_I18N_KEYS, taskId)

export const rewardStatusI18nKey = (rewardStatus: unknown): string =>
  i18nKeyFor(REWARD_STATUS_I18N_KEYS, rewardStatus)

/**
 * 时间戳格式化（`YYYY-MM-DD HH:mm`，浏览器本地时区）。
 * 空值 → `''`；非法值 → 原样返回（宁可显示原始文本，也不显示 `Invalid Date`）。
 */
export const formatPointsTimestamp = (value: unknown): string => {
  const text = safeText(value)
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const pad = (num: number): string => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 金额差值展示：正数带 `+`，0 与负数原样（`+12` / `0` / `-5`） */
export const formatDelta = (value: unknown): string => {
  const num = safeInt(value)
  return num > 0 ? `+${num}` : String(num)
}

// ---------------------------------------------------------------------------
// 端点封装
// ---------------------------------------------------------------------------

/** GET /me/wallet：等级 / XP / 湖工币 / 今日进度 / 每日上限（必须已登录） */
export const fetchPointsWallet = async (options: PointsRequestOptions = {}): Promise<PointsWallet> =>
  normalizePointsWallet(await authorizedPointsGet<Record<string, unknown>>('/me/wallet', options))

/** GET /me/daily-tasks：每日任务进度与发放状态（必须已登录；能力关闭时服务端 404） */
export const fetchPointsDailyTasks = async (
  options: PointsRequestOptions = {}
): Promise<PointsDailyTasksSnapshot> =>
  normalizePointsDailyTasks(await authorizedPointsGet<Record<string, unknown>>('/me/daily-tasks', options))

export interface LedgerRequestOptions extends PointsRequestOptions {
  limit?: number
  /** 不透明游标（服务端加密封装；客户端不解析、不拼接） */
  cursor?: string
}

/** GET /me/wallet/ledger：账本分页（必须已登录；limit 夹紧到 [1,100]，默认 20） */
export const fetchPointsLedger = async (options: LedgerRequestOptions = {}): Promise<PointsLedgerPage> => {
  const params = new URLSearchParams()
  params.set('limit', String(clampPageLimit(options.limit, LEDGER_DEFAULT_LIMIT)))
  const cursor = safeText(options.cursor)
  if (cursor) params.set('cursor', cursor)
  return normalizePointsLedger(
    await authorizedPointsGet<Record<string, unknown>>(`/me/wallet/ledger?${params.toString()}`, options)
  )
}

export interface GlobalRankRequestOptions extends LedgerRequestOptions {}

/**
 * GET /leaderboards?board=global_xp：总排行榜（认证可选）。
 * 不要求用户先选游戏 —— 不带 `game_id`，一次请求拿到全局榜与本人排名。
 */
export const fetchGlobalXpLeaderboard = async (
  options: GlobalRankRequestOptions = {}
): Promise<GlobalXpBoard> => {
  const params = new URLSearchParams()
  params.set('board', GLOBAL_XP_BOARD)
  params.set('limit', String(clampPageLimit(options.limit, GLOBAL_RANK_DEFAULT_LIMIT)))
  const cursor = safeText(options.cursor)
  if (cursor) params.set('cursor', cursor)
  return normalizeGlobalXpBoard(
    await publicPointsGet<Record<string, unknown>>(`/leaderboards?${params.toString()}`, options)
  )
}
