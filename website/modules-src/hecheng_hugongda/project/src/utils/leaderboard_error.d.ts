// 测试 fixture：合成湖工大 排行榜失败原因透出（与 utils/leaderboard_error.js 导出对齐）
export const LEADERBOARD_FALLBACK_TEXT: string
export const LEADERBOARD_ERROR_DETAIL_MAX_LENGTH: number
export function appendLeaderboardErrorDetail(
  fallbackText: string,
  error?: { message?: unknown; status?: unknown; httpStatus?: unknown } | null
): string
