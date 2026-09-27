// 测试 fixture：hbut_2048 排行榜模块类型声明（与 utils/game_rank.js 导出对齐）
export interface GameRankContext {
  gameId: string
  studentId?: string
  playerName?: string
  className?: string
  major?: string
  schoolName?: string
  runtime?: string
  appVersion?: string
  from?: string
  rankApiBase?: string
  [key: string]: unknown
}

export interface GameRankPayload {
  runId: string
  score: number
  maxLevel?: number
  durationMs?: number
  moveCount?: number
  endedReason?: string
  extra?: Record<string, unknown>
  [key: string]: unknown
}

export function readGameModuleContext(): GameRankContext
export function canUseGameRank(context: GameRankContext): boolean
export function submitGameRank(
  context: GameRankContext,
  payload?: GameRankPayload,
  options?: Record<string, unknown>
): Promise<Record<string, unknown>>
export function fetchGameLeaderboard(context: GameRankContext, options?: Record<string, unknown>): Promise<unknown>
export function createRunId(): string
export function resolveRankApiBase(value: unknown): string
