// 测试 fixture：jump_out_hbut 旧协议排行榜模块类型声明（与 utils/game_rank.js 导出对齐）
// 注意：该游戏是异构旧协议（snake_case 上下文、失败不 throw、无默认 API base）。
export interface JumpOutGameRankContext {
  student_id: string
  player_name: string
  class_name: string
  rank_api: string
  [key: string]: unknown
}

export interface JumpOutGameRankPayload {
  score: number
  max_level: number
  duration_ms: number
  move_count: number
  run_id: string
  ended_reason?: string
  [key: string]: unknown
}

export function readGameModuleContext(): JumpOutGameRankContext
export function createRunId(): string
export function submitGameRank(
  payload: JumpOutGameRankPayload,
  options?: Record<string, unknown>
): Promise<Record<string, unknown>>
export function fetchGameLeaderboard(options?: {
  scope?: 'class' | 'school' | 'class_total'
  limit?: number
}): Promise<Record<string, unknown>>
