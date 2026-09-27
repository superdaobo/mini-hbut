/**
 * 排行榜展示归一化与 PII 过滤（#905）。
 *
 * 依据 protocol-v1.md §9.3「PII 硬约束」：
 * - **禁止返回** hbut_student_id / student_id / player_id / user_id / Identity sub；
 * - 专业、学院等身份字段默认不展示；
 * - `player_name` 缺失时使用脱敏占位（如「湖工学子」），**不得**回退成学号。
 *
 * 关键决策：客户端采用**白名单映射**（只挑出允许展示的字段），而不是黑名单删除 ——
 * 这样即使服务端（含 Legacy 冻结通道）多返回了敏感字段，也不会出现在 DOM 与埋点里。
 */

/** 禁止出现在展示层的敏感字段（用于负向断言） */
export const FORBIDDEN_LEADERBOARD_KEYS = Object.freeze([
  'student_id',
  'studentId',
  'hbut_student_id',
  'hbutStudentId',
  'xh',
  'XH',
  'player_id',
  'playerId',
  'user_id',
  'userId',
  'sub',
  'major',
  'college',
  'academy'
])

/** 玩家昵称缺失时的脱敏占位（不得用学号兜底） */
export const UNKNOWN_PLAYER_NAME = '湖工学子'

export interface LeaderboardEntry {
  key: string
  rank: number
  playerRef: string
  playerName: string
  score: number
  maxLevel: number
  metricLabel: string
  isSelf: boolean
  updatedAt: string
}

export interface NormalizedLeaderboard {
  board: 'classic' | 'verified' | 'season'
  gameId: string
  scopeApplied: string
  entries: LeaderboardEntry[]
  /** 本人最好成绩（无则 null）；同样已过滤 PII */
  self: (LeaderboardEntry & { classRank: number; schoolRank: number }) | null
  metricLabel: string
  refreshedAt: string
  nextCursor?: string
}

const safeText = (value: unknown): string => String(value ?? '').trim()
const safeNumber = (value: unknown): number => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = safeText(value)
    if (text) return text
  }
  return ''
}

/**
 * 派生稳定的列表 key：
 * 优先服务端 `player_ref`（不可逆短 id），其次用名次占位。
 * **绝不**使用学号/玩家 id。
 */
const resolveEntryKey = (raw: Record<string, unknown>, rank: number): string => {
  const ref = safeText(raw.player_ref || raw.playerRef)
  if (ref) return ref
  const name = safeText(raw.player_name || raw.playerName)
  return name ? `n:${name}:${rank}` : `rank:${rank}`
}

const normalizeEntry = (
  raw: unknown,
  rank: number,
  options: { selfStudentId?: string; selfPlayerName?: string } = {}
): LeaderboardEntry | null => {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const score = safeNumber(item.score ?? item.best_score ?? item.bestScore)
  const maxLevel = safeNumber(item.max_level ?? item.maxLevel ?? item.best_max_level)
  const selfStudentId = safeText(options.selfStudentId)
  // is_self 由本地身份比对推导（V2 服务端也返回，但不作为唯一来源）
  const rawStudentId = safeText(item.student_id || item.studentId)
  const isSelf =
    item.is_self === true ||
    item.isSelf === true ||
    (!!selfStudentId && !!rawStudentId && rawStudentId === selfStudentId)
  const playerName =
    firstText(item.player_name, item.playerName, isSelf ? options.selfPlayerName : '') ||
    UNKNOWN_PLAYER_NAME
  return {
    key: resolveEntryKey(item, rank),
    rank: safeNumber(item.rank) || rank,
    playerRef: safeText(item.player_ref || item.playerRef),
    playerName,
    score,
    maxLevel,
    metricLabel: firstText(item.metric_label, item.metricLabel),
    isSelf,
    updatedAt: firstText(item.updated_at, item.updatedAt, item.refreshed_at, item.refreshedAt)
  }
}

/** 白名单映射数组；任何非法项直接丢弃（不猜测、不兜底出现敏感字段） */
export const sanitizeLeaderboardEntries = (
  rawEntries: unknown,
  options: { selfStudentId?: string; selfPlayerName?: string } = {}
): LeaderboardEntry[] => {
  const list = Array.isArray(rawEntries) ? rawEntries : []
  const output: LeaderboardEntry[] = []
  list.forEach((item, index) => {
    const entry = normalizeEntry(item, index + 1, options)
    if (entry) output.push(entry)
  })
  return output
}

/** 供契约测试使用的负向断言：任意层级的 JSON 序列化结果都不得含敏感字段名 */
export const containsForbiddenLeaderboardKey = (value: unknown): boolean => {
  try {
    const serialized = JSON.stringify(value ?? null)
    if (!serialized) return false
    return FORBIDDEN_LEADERBOARD_KEYS.some((key) => serialized.includes(`"${key}"`))
  } catch {
    return false
  }
}

/**
 * Legacy `/api/game-rank/leaderboard` 响应归一化。
 * Legacy 响应**含 student_id**（契约 2 冻结，仅展示用途），因此这里必须显式白名单过滤。
 */
export const normalizeLegacyLeaderboard = (
  payload: unknown,
  options: { gameId?: string; selfStudentId?: string; selfPlayerName?: string } = {}
): NormalizedLeaderboard => {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const entries = sanitizeLeaderboardEntries(body.leaderboard, options)
  const selfEntry = normalizeEntry(body.player, 0, options)
  const player = body.player && typeof body.player === 'object'
    ? (body.player as Record<string, unknown>)
    : {}
  return {
    board: 'classic',
    gameId: firstText(body.game_id, options.gameId),
    scopeApplied: firstText(body.scope, 'class'),
    entries,
    self: selfEntry
      ? {
          ...selfEntry,
          rank: selfEntry.rank || 0,
          classRank: safeNumber(player.class_rank),
          schoolRank: safeNumber(player.school_rank)
        }
      : null,
    metricLabel: firstText(player.metric_label),
    refreshedAt: firstText(body.refreshed_at)
  }
}

/** V2 `/api/game-platform/v1/leaderboards` 响应归一化（#909 交付后启用） */
export const normalizeGamePlatformLeaderboard = (
  payload: unknown,
  options: { gameId?: string; board?: 'classic' | 'verified' | 'season'; selfStudentId?: string } = {}
): NormalizedLeaderboard => {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const metric =
    body.metric && typeof body.metric === 'object' ? (body.metric as Record<string, unknown>) : {}
  const entries = sanitizeLeaderboardEntries(body.entries, options).map((entry, index) => ({
    ...entry,
    rank: entry.rank || index + 1
  }))
  return {
    board: options.board || 'classic',
    gameId: firstText(body.game_id, options.gameId),
    scopeApplied: firstText(body.scope_applied, body.scope),
    entries,
    self: null,
    metricLabel: firstText(metric.label),
    refreshedAt: firstText(body.generated_at),
    nextCursor: safeText(body.next_cursor)
  }
}
