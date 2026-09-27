/**
 * Legacy Adapter（兼容通道，`/api/game-rank/*` 冻结契约）。
 *
 * 适用范围：10 个使用同模板 `project/src/utils/game_rank.js` 的游戏
 * （8 个字节级相同：只差 DEFAULT_GAME_ID 与 MODULE_CONTEXT_STORAGE_KEY）。
 *
 * 硬约束：
 * - **显式标注 `trust_level = legacy`**：Legacy 通道永不产生 XP / 湖工币 / Season 排名（compatibility.md §2）；
 * - actor 自报（`student_id`）**只允许**出现在 Legacy 请求体里，绝不进入 V2 路径（trust-model.md §3）；
 * - 请求体字段名与响应处理逐字节对齐既有实现（`game_rank.js:186-208`），保证老服务端行为不变；
 * - 超时 12s、重试 `[1200,2600,5200]`、仅 submit 重试（沿用既有约定）。
 */

import {
  DEFAULT_LEGACY_RANK_API_BASE,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_DELAYS_MS,
  LEADERBOARD_TIMEOUT_MESSAGE
} from '../version.js'
import { ERROR_CODES, GamePlatformError } from '../errors.js'
import { getLocalStorage, getNavigator, readSearchParams } from '../env.js'
import { safeParseJson, safeText } from '../utils.js'
import { buildUrl } from '../transport.js'

export const LEGACY_TRUST_LEVEL = 'legacy'
export const LEGACY_PROTOCOL = 'template_v1'
/** Legacy 通道标识（诊断用） */
export const LEGACY_CHANNEL_CODE = 'legacy_rank_api'

/** API base 归一（与既有 normalizeApiBase 行为一致：补协议、去尾斜杠、补 /api/game-rank） */
export const normalizeLegacyRankApiBase = (value) => {
  const text = safeText(value)
  if (!text) return DEFAULT_LEGACY_RANK_API_BASE
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/game-rank$/i.test(normalized)) return normalized
  if (/\/api$/i.test(normalized)) return `${normalized}/game-rank`
  return `${normalized}/api/game-rank`
}

const pickText = (...values) => {
  for (const value of values) {
    const text = safeText(value)
    if (text) return text
  }
  return ''
}

const readStoredContext = (storage, keys) => {
  if (!storage || typeof storage.getItem !== 'function') return {}
  for (const key of keys) {
    const parsed = safeParseJson(storage.getItem(key), null)
    if (parsed && typeof parsed === 'object') return parsed
  }
  return {}
}

/** 存储字段同时兼容 camelCase / snake_case（既有实现 pickStoredText 行为） */
const pickStoredText = (stored, camelKey, snakeKey) => pickText(stored?.[camelKey], stored?.[snakeKey])

/**
 * 读取 Legacy 上下文（URL 参数优先，其次 localStorage）。
 * @param {object} options
 * @param {string} options.gameId
 * @param {string[]} [options.storageKeys] 读取顺序（写入只写第一个，避免跨模块串味）
 */
export const readLegacyModuleContext = (options = {}) => {
  const gameId = safeText(options.gameId)
  const storageKeys = Array.isArray(options.storageKeys) && options.storageKeys.length
    ? options.storageKeys.slice()
    : [`${gameId}_rank_context_v1`]
  const params = options.params || readSearchParams()
  const storage = options.storage || getLocalStorage()
  const stored = readStoredContext(storage, storageKeys)
  const context = {
    gameId,
    // 注意：该字段**只**用于 Legacy 通道；V2 actor 永远来自服务端 principal
    legacyStudentId: pickText(params.get('student_id'), pickStoredText(stored, 'studentId', 'student_id')),
    playerName: pickText(params.get('player_name'), pickStoredText(stored, 'playerName', 'player_name')),
    className: pickText(params.get('class_name'), pickStoredText(stored, 'className', 'class_name')),
    schoolName:
      pickText(params.get('school_name'), pickStoredText(stored, 'schoolName', 'school_name')) || '湖北工业大学',
    major: pickText(params.get('major'), stored.major),
    runtime: pickText(params.get('runtime'), stored.runtime) || 'module-web',
    appVersion: pickText(params.get('app_version'), pickStoredText(stored, 'appVersion', 'app_version')),
    from: pickText(params.get('from'), stored.from),
    rankApiBase: normalizeLegacyRankApiBase(
      pickText(params.get('rank_api'), pickStoredText(stored, 'rankApiBase', 'rank_api'))
    )
  }
  return context
}

/** 写回模块私有 key（只有存在可展示身份信息时才写，行为对齐既有实现） */
export const writeLegacyModuleContext = (context, options = {}) => {
  const storage = options.storage || getLocalStorage()
  if (!storage || typeof storage.setItem !== 'function') return false
  const next = context && typeof context === 'object' ? context : {}
  if (!safeText(next.legacyStudentId) && !safeText(next.playerName) && !safeText(next.className) && !safeText(next.major)) {
    return false
  }
  const key =
    Array.isArray(options.storageKeys) && options.storageKeys.length
      ? options.storageKeys[0]
      : `${safeText(next.gameId)}_rank_context_v1`
  try {
    storage.setItem(
      key,
      JSON.stringify({
        gameId: safeText(next.gameId),
        studentId: safeText(next.legacyStudentId),
        playerName: safeText(next.playerName),
        className: safeText(next.className),
        schoolName: safeText(next.schoolName || '湖北工业大学'),
        major: safeText(next.major),
        runtime: safeText(next.runtime),
        appVersion: safeText(next.appVersion),
        from: safeText(next.from),
        rankApiBase: safeText(next.rankApiBase || DEFAULT_LEGACY_RANK_API_BASE)
      })
    )
    return true
  } catch {
    return false
  }
}

/** Legacy 通道可用性：需要自报身份 + 可解析的 API base（对齐既有 canUseGameRank） */
export const canSubmitLegacyRank = (context, options = {}) => {
  if (options.legacyCompatible === false) return false
  const profile = context && typeof context === 'object' ? context : {}
  return !!safeText(profile.legacyStudentId) && !!normalizeLegacyRankApiBase(profile.rankApiBase)
}

/**
 * Legacy 的 platform 字段保持**自由文本原样**（protocol-v1.md §7.3：归一化结果只写 V2 表）。
 * 对齐既有实现 `game_rank.js:200`：`platform: payload.platform || navigator.platform`。
 */
export const resolveLegacyPlatformText = () => safeText(getNavigator()?.platform)

/** 构造 Legacy submit body（字段名逐字对齐既有实现） */
export const buildLegacySubmitBody = ({ gameId, context, legacy }) => ({
  game_id: safeText(gameId),
  run_id: safeText(legacy.runId),
  student_id: safeText(context.legacyStudentId),
  player_name: safeText(legacy.playerName || context.playerName || context.legacyStudentId),
  class_name: safeText(legacy.className || context.className),
  school_name: safeText(legacy.schoolName || context.schoolName || '湖北工业大学'),
  major: safeText(legacy.major || context.major),
  score: Number(legacy.score || 0) || 0,
  max_level: Number(legacy.maxLevel || 0) || 0,
  duration_ms: Number(legacy.durationMs || 0) || 0,
  move_count: Number(legacy.moveCount || 0) || 0,
  ended_reason: safeText(legacy.endedReason || 'finished'),
  client_version: safeText(legacy.clientVersion || context.appVersion),
  platform: safeText(legacy.platform || resolveLegacyPlatformText()),
  runtime: safeText(legacy.runtime || context.runtime),
  payload: legacy.payload && typeof legacy.payload === 'object' ? legacy.payload : {}
})

/**
 * Legacy 提交（仅 submit 重试；失败抛 GamePlatformError，由上层决定 UI）。
 * @returns {Promise<{ success: boolean, trustLevel: string, channel: string, raw: object }>}
 */
export const submitLegacyRank = async ({ gameId, context, legacy, transport, retryDelaysMs }) => {
  if (!transport) throw new TypeError('submitLegacyRank 需要 transport')
  if (!canSubmitLegacyRank(context)) {
    throw new GamePlatformError(ERROR_CODES.FEATURE_DISABLED, {
      message: '当前没有可用的经典排行榜通道',
      details: { channel: LEGACY_CHANNEL_CODE },
      stage: 'legacy'
    })
  }
  const body = buildLegacySubmitBody({ gameId, context, legacy })
  const { data, status } = await transport.requestJsonWithRetry({
    url: `${normalizeLegacyRankApiBase(context.rankApiBase)}/submit`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
  }, { retryDelaysMs: retryDelaysMs || DEFAULT_RETRY_DELAYS_MS })
  return { success: true, trustLevel: LEGACY_TRUST_LEVEL, channel: LEGACY_CHANNEL_CODE, protocol: LEGACY_PROTOCOL, raw: data, status }
}

/** Legacy 排行榜（不重试，失败抛错；超时文案与既有实现一致） */
export const fetchLegacyLeaderboard = async ({ gameId, context, scope = 'class', limit = 20, transport }) => {
  if (!transport) throw new TypeError('fetchLegacyLeaderboard 需要 transport')
  if (!canSubmitLegacyRank(context)) {
    throw new GamePlatformError(ERROR_CODES.FEATURE_DISABLED, {
      message: '当前没有可用的经典排行榜通道',
      details: { channel: LEGACY_CHANNEL_CODE }
    })
  }
  const query = {
    game_id: safeText(gameId),
    scope: safeText(scope) || 'class',
    limit: String(Number(limit || 20) || 20)
  }
  if (safeText(context.legacyStudentId)) query.student_id = context.legacyStudentId
  if (safeText(context.className)) query.class_name = context.className
  if (safeText(context.schoolName)) query.school_name = context.schoolName
  const { data, status } = await transport.requestJson({
    url: buildUrl(`${normalizeLegacyRankApiBase(context.rankApiBase)}/leaderboard`, '', query),
    method: 'GET',
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
  })
  const list = Array.isArray(data.leaderboard) ? data.leaderboard : Array.isArray(data.data) ? data.data : []
  return { success: true, trustLevel: LEGACY_TRUST_LEVEL, channel: LEGACY_CHANNEL_CODE, list, raw: data, status }
}

export { LEADERBOARD_TIMEOUT_MESSAGE }
