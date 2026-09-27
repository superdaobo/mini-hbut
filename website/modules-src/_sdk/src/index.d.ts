/**
 * Mini HBUT Game Platform SDK 类型声明（SDK v1.0.0 / protocol v1）。
 *
 * 约定：SDK 源码是 ESM JavaScript（不在 apps/client 的 tsconfig include 内），
 * 这里提供与 `src/index.js` 导出**逐一对应**的公开类型；内部实现细节不在此列。
 * 游戏侧只应 import `_sdk/src/index.js` 与 `_sdk/src/adapters/adapter.js`。
 */

/** 游戏声明自己的语义（取值来源：docs/game-platform/game-registry.md §3/§4） */
export interface GameAdapterConfig {
  gameId: string
  displayName?: string
  resultSchemaVersion?: number
  capabilities?: {
    ranked?: boolean
    multiplayer?: boolean
    economyEligible?: boolean
    classicMirror?: boolean
    seasonEligible?: boolean
    legacyCompatible?: boolean
  }
  metric: { name: string; semantics?: string; max: number; label?: string }
  leaderboard?: { board?: string; order?: string }
  legacy?: {
    maxLevelRule?: string
    fromLegacyMaxLevel?: (maxLevel: number) => number
    toLegacyMaxLevel?: (metricValue: number) => number
    endedReasonMap?: Record<string, string>
    storageKeys?: string[]
  }
  result?: { scoreMax?: number; extraKeys?: string[] }
  [key: string]: unknown
}

export interface GameAdapter {
  gameId: string
  displayName: string
  resultSchemaVersion: number
  capabilities: {
    ranked: boolean
    multiplayer: boolean
    economyEligible: boolean
    classicMirror: boolean
    seasonEligible: boolean
    legacyCompatible: boolean
  }
  metric: { name: string; semantics: string; max: number; label: string }
  leaderboard: { board: string; order: string }
  legacy: { maxLevelRule: string; storageKeys: string[] }
  endedReasonMap: Record<string, string>
  extraKeys: string[] | null
  buildResult(input: Record<string, unknown>): {
    result: Record<string, unknown>
    durationMs: number
    diagnostics: Record<string, unknown>
  }
  toLegacyPayload(result: Record<string, unknown>): Record<string, unknown>
  normalizeEndedReason(value: unknown): { reason: string; mapped: boolean; raw: string }
  isValidRunId(runId: string): boolean
  describe(): Record<string, unknown>
  withOverrides(overrides: GameAdapterConfig): GameAdapter
}

/** 一次结算的归一化结果（三模式共用同一形状，UI 只需读 success/uploaded/message） */
export interface FinishOutcome {
  success: boolean
  mode: string
  trustLevel: string | null
  uploaded: boolean
  settled: boolean
  rewardStatus: string | null
  rewardsEnabled: boolean
  duplicate: boolean
  idempotentReplay: boolean
  recovered: boolean
  runStatus: string | null
  channel: string
  error: { code: string; message: string; retryable: boolean; requestId?: string } | null
  retryable: boolean
  message: string
  reason: string
  correlationId: string
  requestId: string
  recreatedRunId?: string
  raw?: unknown
  [key: string]: unknown
}

/** finish 输入（与既有游戏 payload 命名 1:1，去掉 runId） */
export interface FinishInput {
  score: number
  maxLevel?: number
  metricValue?: number
  moveCount?: number
  durationMs?: number
  endedReason?: string
  extra?: Record<string, unknown>
  requireRewards?: boolean
  finishedAt?: number
  legacy?: Record<string, unknown>
  [key: string]: unknown
}

export interface GameRun {
  readonly id: string
  readonly startedAt: number
  readonly finishedAt: number | null
  readonly status: string
  readonly attempts: number
  readonly error: unknown
  readonly result: Record<string, unknown> | null
  readonly signature: string
  readonly outcome: FinishOutcome | null
  readonly recreatedRunId: string
  readonly pendingPayload: { result: Record<string, unknown>; durationMs: number; requireRewards: boolean } | null
  ensureServerRun(): Promise<Record<string, unknown>>
  finish(input?: FinishInput, options?: Record<string, unknown>): Promise<FinishOutcome>
  retry(): Promise<FinishOutcome>
  abandon(reason?: string): boolean
  toJSON(): Record<string, unknown>
}

export interface LeaderboardResult {
  success: boolean
  mode: string
  source: string
  trustLevel?: string | null
  board?: string
  scopeApplied?: string
  metric?: Record<string, unknown> | null
  nextCursor?: string | null
  entries: Array<{
    rank: number
    display_name: string
    player_name: string
    class_name: string
    score: number
    total_score: number | null
    metric_value: number | null
    is_self: boolean
    updated_at: string
    ref: string
  }>
  message: string
  error?: unknown
  raw?: unknown
  [key: string]: unknown
}

/**
 * 服务端/宿主声明的**端点能力**（P1-1；与 `features.*` flag 的区别：flag 表达「想不想要」，
 * capability 表达「端点是否真的实现」）。
 *
 * 降级语义（fail closed）：拿不到 `/meta` 或字段缺失 → 一律 `false`（不得乐观假设可用）。
 * 消费建议：UI 用它做**前置隐藏**（例如榜单不可用时不渲染入口），而不是点击后 404。
 */
export interface ServiceCapabilities {
  /** V2 榜读取端点 `GET /leaderboards` */
  leaderboards: boolean
  /** 每日任务（flag `game_daily_tasks_enabled`） */
  daily_tasks: boolean
  /** 五子棋竞技（flag `gomoku_competitive_enabled`） */
  gomoku_competitive: boolean
  /** 可信结算发奖（flag `verified_reward_enabled`） */
  verified_reward: boolean
}

export interface DeclaredServiceCapabilities {
  /** 保守能力表（未知即 false） */
  values: ServiceCapabilities
  /** 被显式声明过的 canonical key（诊断用） */
  declared: string[]
  /** 最高优先级声明来源 */
  source: 'meta' | 'welcome' | 'none'
}

/** 游戏句柄的能力表（既有键语义不变 + `server` 服务端能力） */
export interface GameCapabilities {
  ranked: boolean
  multiplayer: boolean
  economyEligible: boolean
  classicMirror: boolean
  seasonEligible: boolean
  legacyCompatible: boolean
  canSubmitVerified: boolean
  canSubmitLegacy: boolean
  canSubmit: boolean
  leaderboard: boolean
  /** 服务端能力（保守；见 ServiceCapabilities） */
  server: ServiceCapabilities
  rewardsEnabled: boolean
  blocked: { code: string } | null
  /** 仅 preflight（ready 之前）存在 */
  pending?: boolean
  [key: string]: unknown
}

/** API base 决策结果（resolveApiBases 的返回值；legacy 为空串 = 未配置 = 不可提交） */
export interface ResolvedApiBases {
  v2Base: string
  v2Source: 'config' | 'host' | 'host_derived' | 'env_default'
  legacyBase: string
  legacySource: 'config' | 'host' | 'none'
  rankApiInjected: boolean
}

export interface GameHandle {
  readonly sdkVersion: string
  readonly protocolVersion: number
  readonly gameId: string
  readonly adapter: GameAdapter
  readonly ready: Promise<GameHandle>
  readonly mode: string
  readonly trustLevel: string | null
  readonly capabilities: GameCapabilities
  readonly features: Record<string, unknown>
  readonly limits: Record<string, unknown>
  readonly diagnostics: Record<string, any>
  readonly correlationId: string
  startRun(options?: { runId?: string; startedAt?: number; replaceActive?: boolean }): GameRun
  getActiveRun(): GameRun | null
  getRun(runId: string): GameRun | null
  leaderboard(options?: {
    board?: string
    scope?: string
    limit?: number
    cursor?: string
    [key: string]: unknown
  }): Promise<LeaderboardResult>
  onModeChange(listener: (snapshot: Record<string, unknown>) => void): () => void
  toJSON(): Record<string, unknown>
  dispose(): void
}

export const SDK_VERSION: string
export const PROTOCOL_VERSION: number
export const SUPPORTED_PROTOCOL_VERSIONS: { min: number; max: number }
export const MODES: { verified: 'verified'; compatibility: 'compatibility'; standalone: 'standalone' }
export const TRUST_LEVELS: {
  legacy: 'legacy'
  verifiedSession: 'verified_session'
  serverVerifiedMatch: 'server_verified_match'
}
export const RUN_STATUS: Record<string, string>
export const ERROR_CODES: Record<string, string>
export const ERROR_CODE_TABLE: Record<string, { http: number; retryable: boolean; message: string; clientAction: string }>
export const FORBIDDEN_ACTOR_FIELDS: readonly string[]
export const HOST_MESSAGE_TYPES: Record<string, string>
export const ENDED_REASONS: readonly string[]
export const METRIC_SEMANTICS: readonly string[]
export const RESULT_LIMITS: Record<string, number>
export const LEGACY_PROTOCOL: string
export const LEGACY_TRUST_LEVEL: string

export class GamePlatformError extends Error {
  code: string
  status: number
  retryable: boolean
  requestId: string
  details: Record<string, unknown>
  stage: string
  clientAction: string
  toReport(): { code: string; request_id: string; retryable: boolean; stage: string; http: number }
}

export function isGamePlatformError(value: unknown): boolean
export function normalizeError(error: unknown, options?: Record<string, unknown>): GamePlatformError
export function createGameAdapter(config: GameAdapterConfig): GameAdapter
export function createGame(config?: Record<string, any>): GameHandle
export function createEngine(config?: Record<string, any>): Record<string, any>
export function createHostOriginGuard(
  options?: Record<string, unknown>
): ((event: { origin?: string }) => { ok: boolean; reason: string }) & { allowList: string[] }
export function readLaunchTicket(options?: { params?: URLSearchParams }): { ticket: string; source: string; shape: string } | null
export function clearLaunchTicketFromUrl(options?: { history?: unknown; location?: unknown }): boolean
export function canSubmitLegacyRank(context: Record<string, unknown>, options?: Record<string, unknown>): boolean
export function createJumpOutLegacyAdapter(): Record<string, any>
export function fetchLegacyLeaderboard(params: Record<string, any>): Promise<Record<string, any>>
/**
 * Legacy API base 归一（补协议 / 去尾斜杠 / 补 `/api/game-rank`）。
 * **空值返回 `''`**（P1-5：不再回落到任何默认域；未配置 = 不可提交）。
 */
export function normalizeLegacyRankApiBase(value: string): string
/**
 * API base 单一决策出口（P1-5）：SDK 配置 > Host 注入（`gp_api` / `rank_api`）> 环境默认（仅 V2）。
 * Legacy 无环境默认：无显式注入即 `legacyBase === ''`（fail closed → standalone 纯本地）。
 */
export function resolveApiBases(config?: Record<string, unknown>, params?: URLSearchParams): ResolvedApiBases
/** 读取服务端/宿主能力声明（保守：未知即 false） */
export function readServiceCapabilities(sources?: { meta?: object; welcome?: object }): DeclaredServiceCapabilities
/** 服务端是否**显式**声明该能力不可用（运行时闸门；未知不算禁用） */
export function isCapabilityDisabled(capabilities: DeclaredServiceCapabilities, key: string): boolean
export function emptyServiceCapabilities(): ServiceCapabilities
export const SERVICE_CAPABILITY_KEYS: readonly string[]
export function readLegacyModuleContext(options?: Record<string, any>): Record<string, string>
export function submitLegacyRank(params: Record<string, any>): Promise<Record<string, any>>
export function resolveLegacyPlatformText(): string
export function buildLegacySubmitBody(params: Record<string, any>): Record<string, unknown>
export function writeLegacyModuleContext(context: Record<string, unknown>, options?: Record<string, unknown>): boolean
export function readJumpOutLegacyContext(options?: Record<string, any>): Record<string, string>
export function canSubmitJumpOutLegacy(context: Record<string, unknown>, options?: Record<string, unknown>): boolean
export function submitJumpOutLegacyRank(params: Record<string, any>): Promise<Record<string, any>>
export function fetchJumpOutLegacyLeaderboard(params: Record<string, any>): Promise<Record<string, any>>
export function canonicalJson(value: unknown): string
export function stableStringify(value: unknown): string
export function utf8ByteLength(value: unknown): number
export function safeText(value: unknown): string
export function createRunId(clock?: () => number): string
export function finishPayloadSignature(payload: {
  gameId: string
  runId: string
  durationMs: number
  result: unknown
  requireRewards: boolean
}): string
export function createRun(engine: Record<string, any>, options?: Record<string, any>): GameRun
export function createGamePlatformClient(options: Record<string, any>): Record<string, any>
export function assertNoForbiddenFields(payload: Record<string, unknown>): void
export function stripPiiFields(entry: Record<string, unknown>): Record<string, unknown>
export function sanitizeTelemetryFields(fields?: Record<string, unknown>): Record<string, unknown>
export function compareVersions(left: string, right: string): number
export function resolveRegistryEntry(params: Record<string, unknown>): { entry: Record<string, any> | null; source: string }
export function applyRegistryEntry(
  adapter: GameAdapter,
  entry: Record<string, any> | null,
  options?: Record<string, unknown>
): { adapter: GameAdapter; conflicts: string[]; blocked: { code: string; message: string } | null }

export const MiniHBUTGame: {
  init(config?: Record<string, any>): Promise<GameHandle>
  create(config?: Record<string, any>): GameHandle
  createEngine(config?: Record<string, any>): Record<string, any>
  sdkVersion: string
  protocolVersion: number
  supportedProtocolVersions: { min: number; max: number }
  modes: typeof MODES
  trustLevels: typeof TRUST_LEVELS
  errorCodes: Record<string, string>
  errorCodeTable: typeof ERROR_CODE_TABLE
  hostMessageTypes: Record<string, string>
  runStatus: Record<string, string>
  forBiddenActorFields: readonly string[]
  createGameAdapter(config: GameAdapterConfig): GameAdapter
  createHostOriginGuard: typeof createHostOriginGuard
  readLaunchTicket: typeof readLaunchTicket
}

export default MiniHBUTGame
