/**
 * Legacy Adapter —— `jump_out_hbut` 旧协议独立适配层（#904 任务 3）。
 *
 * 为什么必须独立：该游戏的 `project/src/utils/game_rank.js` 与其余 10 个**语义不兼容**：
 * - `readGameModuleContext()` 返回 snake_case（`student_id` / `rank_api`），不是 camelCase；
 * - `submitGameRank(payload)` 单参数、**失败不 throw**，返回 `{success:false,error}`（`game_rank.js:133-135`）；
 * - 无 `canUseGameRank` / `resolveRankApiBase`，**没有默认 API base**，缺 `rank_api` 直接返回 `{success:false,error:'no_api'}`；
 * - `createRunId()` 无 `run_` 前缀（`game_rank.js:100-102`）；
 * - `fetchGameLeaderboard({scope,limit})` 返回 `{success,data}`，不抛错。
 *
 * 因此这里**不复用** legacy-rank.js 的调用约定，而是把旧协议原样重实现为同一个对外契约：
 * `{ readContext, canSubmit, submit, leaderboard }` + `trustLevel='legacy'`。
 */

import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_RETRY_DELAYS_MS } from '../version.js'
import { ERROR_CODES, GamePlatformError, normalizeError } from '../errors.js'
import { getLocalStorage, readSearchParams } from '../env.js'
import { safeText } from '../utils.js'

export const JUMP_OUT_LEGACY_PROTOCOL = 'snake_case_legacy_v0'
export const JUMP_OUT_CHANNEL_CODE = 'legacy_rank_api_old'

/** 旧协议：无默认 base；`rank_api` 缺失即不可用 */
export const normalizeJumpOutRankApiBase = (value) => safeText(value).replace(/\/+$/, '')

/** 旧协议上下文：snake_case 字段 + 无 API base 默认值 */
export const readJumpOutLegacyContext = (options = {}) => {
  const params = options.params || readSearchParams()
  const storage = options.storage || getLocalStorage()
  const getStorage = (key) => {
    if (!storage || typeof storage.getItem !== 'function') return ''
    try {
      return safeText(storage.getItem(key))
    } catch {
      return ''
    }
  }
  return {
    gameId: safeText(options.gameId) || 'jump_out_hbut',
    student_id: safeText(params.get('student_id')) || getStorage('student_id'),
    player_name: safeText(params.get('player_name')) || getStorage('player_name') || '匿名玩家',
    class_name: safeText(params.get('class_name')) || getStorage('class_name'),
    rank_api: normalizeJumpOutRankApiBase(safeText(params.get('rank_api')) || getStorage('rank_api'))
  }
}

/** 旧协议可用性：必须有 `rank_api`（无默认 base，找不到就 standalone） */
export const canSubmitJumpOutLegacy = (context, options = {}) => {
  if (options.legacyCompatible === false) return false
  return !!normalizeJumpOutRankApiBase(context?.rank_api)
}

/** 旧协议 run_id：无 `run_` 前缀（保持历史行为，不得改） */
export const createJumpOutRunId = (clock = () => Date.now()) =>
  `${clock()}_${Math.random().toString(36).substring(2, 10)}`

/**
 * 旧协议提交：**失败不 throw**，统一转换为 SDK 结果对象（含协议码信息）。
 * @param {object} params
 * @param {object} params.context 旧协议上下文
 * @param {object} params.payload snake_case payload（score / max_level / duration_ms / move_count / run_id / ended_reason）
 */
export const submitJumpOutLegacyRank = async ({ context, payload, transport, timeoutMs }) => {
  if (!transport) throw new TypeError('submitJumpOutLegacyRank 需要 transport')
  const base = normalizeJumpOutRankApiBase(context?.rank_api)
  if (!base) {
    return {
      success: false,
      error: 'no_api',
      message: '当前没有可用的经典排行榜通道',
      code: ERROR_CODES.FEATURE_DISABLED,
      retryable: false
    }
  }
  const body = {
    ...payload,
    game_id: safeText(context.gameId) || 'jump_out_hbut',
    student_id: safeText(context.student_id),
    player_name: safeText(context.player_name),
    class_name: safeText(context.class_name)
  }
  try {
    const { data, status } = await transport.requestJsonWithRetry(
      {
        url: `${base}/submit`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeoutMs: Number(timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS)
      },
      { retryDelaysMs: DEFAULT_RETRY_DELAYS_MS }
    )
    return { success: true, trustLevel: 'legacy', channel: JUMP_OUT_CHANNEL_CODE, protocol: JUMP_OUT_LEGACY_PROTOCOL, raw: data, status }
  } catch (error) {
    // 旧协议把异常吞掉并返回错误对象；SDK 保留 code 供上层判定（不抛错，保持调用方语义）
    const normalized = normalizeError(error, { stage: 'legacy_old' })
    return {
      success: false,
      error: normalized.message,
      message: normalized.message,
      code: normalized.code,
      retryable: normalized.retryable,
      cause: normalized
    }
  }
}

/** 旧协议排行榜：返回 {success, data}（不抛错） */
export const fetchJumpOutLegacyLeaderboard = async ({ context, scope = 'class', limit = 20, transport }) => {
  if (!transport) throw new TypeError('fetchJumpOutLegacyLeaderboard 需要 transport')
  const base = normalizeJumpOutRankApiBase(context?.rank_api)
  if (!base) {
    return { success: false, error: 'no_api', message: '当前没有可用的经典排行榜通道', list: [] }
  }
  try {
    const params = new URLSearchParams({
      game_id: safeText(context.gameId) || 'jump_out_hbut',
      scope: safeText(scope) || 'class',
      limit: String(Number(limit || 20) || 20)
    })
    if (safeText(context.student_id)) params.set('student_id', context.student_id)
    if (safeText(context.class_name)) params.set('class_name', context.class_name)
    params.set('school_name', '湖北工业大学')
    const { data, status } = await transport.requestJson({
      url: `${base}/leaderboard?${params.toString()}`,
      method: 'GET',
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
    })
    const list = Array.isArray(data.leaderboard) ? data.leaderboard : Array.isArray(data.data) ? data.data : []
    return { success: true, trustLevel: 'legacy', channel: JUMP_OUT_CHANNEL_CODE, list, raw: data, status }
  } catch (error) {
    const normalized = normalizeError(error, { stage: 'legacy_old' })
    return { success: false, error: normalized.message, message: normalized.message, code: normalized.code, list: [] }
  }
}

/** 统一封装：与 template_v1 通道同构的对外接口 */
export const createJumpOutLegacyAdapter = () => ({
  protocol: JUMP_OUT_LEGACY_PROTOCOL,
  channel: JUMP_OUT_CHANNEL_CODE,
  trustLevel: 'legacy',
  readContext: readJumpOutLegacyContext,
  canSubmit: canSubmitJumpOutLegacy,
  createRunId: createJumpOutRunId,
  submit: submitJumpOutLegacyRank,
  leaderboard: fetchJumpOutLegacyLeaderboard,
  /**
   * 旧协议 payload 使用 snake_case（不能复用 template 的 camelCase 输入）。
   *
   * #907 修复两处与旧实现（`game_rank.js` 的 `submitGameRank`）的字段保真差异：
   * 1. **补 `run_id`**：旧实现的 body 是 `{...payload, game_id, student_id, ...}`，而
   *    `payload.run_id` 由调用方提供（JSDoc 明确「本局唯一 ID」）；Legacy 表存在
   *    唯一键 `uk_game_rank_runs_run_id`，缺它可能导致提交被拒或历史行为不一致。
   * 2. `ended_reason` 用**未归一化**的原始值（`rawEndedReason`，由 run.js 从
   *    `diagnostics.endedReasonRaw` 透传）—— 归一化属 V2 语义，经典榜要存原值。
   */
  toLegacyPayload: ({ result, durationMs, runId, rawEndedReason }) => ({
    run_id: safeText(runId),
    score: Number(result?.score) || 0,
    max_level: Number(result?.metric?.value) || 0,
    duration_ms: Number(durationMs) || 0,
    move_count: Number(result?.moves) || 0,
    ended_reason: safeText(rawEndedReason) || safeText(result?.ended_reason) || 'unknown',
    payload: result?.extra && typeof result.extra === 'object' ? { ...result.extra } : {}
  })
})
