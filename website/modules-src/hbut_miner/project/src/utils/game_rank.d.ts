// 测试 fixture：hbut_match3 排行榜模块类型声明（与 utils/game_rank.js 导出对齐）
export interface GameRankContext {
  gameId: string
  studentId?: string
  playerName?: string
  className?: string
  major?: string
  rankApi?: string
  [key: string]: unknown
}

export interface GameRankPayload {
  runId: string
  score: number
  maxLevel?: number
  durationMs?: number
  moveCount?: number
  endedReason?: string
  [key: string]: unknown
}

export interface GameRankSubmitResult {
  success: boolean
  error?: string
  runId?: string
  accepted?: boolean
  [key: string]: unknown
}

export function readGameModuleContext(): GameRankContext
export function canUseGameRank(context: GameRankContext): boolean
export function submitGameRank(
  context: GameRankContext,
  payload?: GameRankPayload,
  options?: Record<string, unknown>
): Promise<GameRankSubmitResult>
export function fetchGameLeaderboard(context: GameRankContext, options?: Record<string, unknown>): Promise<unknown>
export function createRunId(): string
export function resolveRankApiBase(value: unknown): string
