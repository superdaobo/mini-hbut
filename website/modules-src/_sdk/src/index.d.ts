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

export interface GameHandle {
  readonly sdkVersion: string
  readonly protocolVersion: number
  readonly gameId: string
  readonly adapter: GameAdapter
  readonly ready: Promise<GameHandle>
  readonly mode: string
  readonly trustLevel: string | null
  readonly capabilities: Record<string, unknown>
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
export function normalizeLegacyRankApiBase(value: string): string
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
