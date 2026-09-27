/**
 * Game Adapter 机制（#904 任务 2）。
 *
 * 设计约束（game-registry.md §6「SDK 不得自带第二份 id 表」）：
 * - SDK **不维护 game_id 清单**：每个游戏通过 `createGameAdapter({...})` 声明自己的 adapter；
 * - 取值语义来自 `game-registry.md` §3/§4（metric.name / semantics / max / legacy_max_level_rule / ended_reason_map）；
 * - 服务端 registry 快照（宿主握手透传或 /meta）是权威值：存在冲突时以服务端为准并记诊断；
 * - adapter 负责「Legacy 输入 → V2 result envelope」与「V2 envelope → Legacy 字段」的双向换算，
 *   换算规则**只声明一次、只执行一次**（protocol-v1.md §4.4 末注）。
 */

import { ERROR_CODES, GamePlatformError } from '../errors.js'
import { isPlainObject, normalizeNfc, safeText, toIntegerOrNull, utf8ByteLength } from '../utils.js'

/** metric.semantics 枚举（game-registry.md §2） */
export const METRIC_SEMANTICS = Object.freeze(['progress_index', 'count', 'value', 'historical_best', 'none'])

/** ended_reason 枚举（protocol-v1.md §4.1） */
export const ENDED_REASONS = Object.freeze([
  'won',
  'lost',
  'cleared',
  'failed',
  'timeout',
  'abandoned',
  'draw',
  'collision',
  'game_over',
  'restart',
  'unknown'
])

/** 排行榜排序语义 */
export const LEADERBOARD_ORDERS = Object.freeze(['score_desc', 'score_then_metric_desc', 'metric_desc'])

const GAME_ID_RE = /^[a-z0-9_]{3,64}$/
const METRIC_NAME_RE = /^[a-z][a-z0-9_]{1,31}$/
const RUN_ID_RE = /^[A-Za-z0-9_-]{8,128}$/

export const RESULT_LIMITS = Object.freeze({
  maxResultBytes: 8192,
  maxExtraBytes: 6144,
  maxScore: 1000000000,
  maxMoves: 1000000,
  maxDurationMs: 86400000,
  maxExtraKeys: 32,
  maxExtraStringLength: 512
})

const invalidResult = (message, details) =>
  new GamePlatformError(ERROR_CODES.SCHEMA_INVALID, { message, details, stage: 'adapter' })

const normalizeCapabilities = (raw = {}) => ({
  ranked: raw.ranked === true,
  multiplayer: raw.multiplayer === true,
  economyEligible: raw.economyEligible === true,
  classicMirror: raw.classicMirror !== false,
  seasonEligible: raw.seasonEligible === true,
  // legacy_compatible=false 时，V2 不可用只能 standalone，不得回落 Legacy（game-registry.md §2）
  legacyCompatible: raw.legacyCompatible !== false
})

/** extra 值只允许标量：string(≤512, NFC) / integer / boolean / null（protocol-v1.md §4.1） */
const normalizeExtraValue = (value) => {
  if (value === null) return { value: null, dropped: false }
  if (typeof value === 'boolean') return { value, dropped: false }
  if (typeof value === 'string') {
    const text = normalizeNfc(value)
    return { value: text.length > RESULT_LIMITS.maxExtraStringLength ? text.slice(0, RESULT_LIMITS.maxExtraStringLength) : text, dropped: false }
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return { value: null, dropped: true }
    return { value, dropped: false }
  }
  return { value: null, dropped: true }
}

/**
 * 创建并校验一个游戏 adapter。
 * @param {object} config
 * @param {string} config.gameId 必填，`^[a-z0-9_]{3,64}$`
 * @param {string} [config.displayName] 中文展示名（与 module_center.js 一致）
 * @param {number} [config.resultSchemaVersion] per-game extra schema 版本（默认 1）
 * @param {object} [config.capabilities] {ranked, multiplayer, economyEligible, classicMirror, seasonEligible, legacyCompatible}
 * @param {object} config.metric {name, semantics, max, label}
 * @param {object} [config.leaderboard] {board, order}
 * @param {object} [config.legacy] {maxLevelRule, toLegacyMaxLevel, fromLegacyMaxLevel, endedReasonMap, storageKeys, extraPayloadKeys}
 * @param {object} [config.result] {scoreMax, extraKeys, endedReasons}
 */
export const createGameAdapter = (config = {}) => {
  const gameId = safeText(config.gameId)
  if (!GAME_ID_RE.test(gameId)) {
    throw new TypeError(`createGameAdapter: gameId 非法（需匹配 ${GAME_ID_RE}）: ${gameId || '(空)'}`)
  }
  const metricConfig = isPlainObject(config.metric) ? config.metric : {}
  const metricName = safeText(metricConfig.name)
  if (!METRIC_NAME_RE.test(metricName)) {
    throw new TypeError(`createGameAdapter(${gameId}): metric.name 非法: ${metricName || '(空)'}`)
  }
  const metricSemantics = safeText(metricConfig.semantics) || 'value'
  if (!METRIC_SEMANTICS.includes(metricSemantics)) {
    throw new TypeError(`createGameAdapter(${gameId}): metric.semantics 非法: ${metricSemantics}`)
  }
  const metricMax = toIntegerOrNull(metricConfig.max)
  if (metricMax === null || metricMax < 0) {
    throw new TypeError(`createGameAdapter(${gameId}): metric.max 必须是非负整数`)
  }
  const legacyConfig = isPlainObject(config.legacy) ? config.legacy : {}
  const resultConfig = isPlainObject(config.result) ? config.result : {}
  const endedReasonMap = isPlainObject(legacyConfig.endedReasonMap) ? { ...legacyConfig.endedReasonMap } : {}
  const extraKeys = Array.isArray(resultConfig.extraKeys) ? resultConfig.extraKeys.map((item) => safeText(item)).filter(Boolean) : null
  const legacyStorageKeys = Array.isArray(legacyConfig.storageKeys)
    ? legacyConfig.storageKeys.map((item) => safeText(item)).filter(Boolean)
    : [`${gameId}_rank_context_v1`]

  const toLegacyMaxLevel =
    typeof legacyConfig.toLegacyMaxLevel === 'function' ? legacyConfig.toLegacyMaxLevel : (value) => value
  const fromLegacyMaxLevel =
    typeof legacyConfig.fromLegacyMaxLevel === 'function' ? legacyConfig.fromLegacyMaxLevel : (value) => value

  /** 归一化 ended_reason：未声明取值 → unknown + 诊断，绝不拒绝（game-registry.md §5） */
  const normalizeEndedReason = (value) => {
    const raw = safeText(value)
    if (!raw) return { reason: 'unknown', mapped: false, raw }
    const mapped = safeText(endedReasonMap[raw]) || raw
    if (ENDED_REASONS.includes(mapped)) return { reason: mapped, mapped: mapped !== raw, raw }
    return { reason: 'unknown', mapped: false, raw }
  }

  const filterExtra = (extra) => {    const source = isPlainObject(extra) ? extra : {}
    const droppedKeys = []
    const result = {}
    for (const [rawKey, rawValue] of Object.entries(source)) {
      if (!/^[a-z][A-Za-z0-9_]{0,31}$/.test(rawKey)) {
        droppedKeys.push(rawKey)
        continue
      }
      if (extraKeys && !extraKeys.includes(rawKey)) {
        droppedKeys.push(rawKey)
        continue
      }
      const normalized = normalizeExtraValue(rawValue)
      if (normalized.dropped) {
        droppedKeys.push(rawKey)
        continue
      }
      result[rawKey] = normalized.value
      if (Object.keys(result).length >= RESULT_LIMITS.maxExtraKeys) break
    }
    return { extra: result, droppedKeys }
  }

  /**
   * 可选整数字段：缺省 → 0；**出现但非整数** → SCHEMA_INVALID（程序员错误必须显式暴露）
   */
  const optionalInteger = (value, { field, max }) => {
    if (value === undefined || value === null || value === '') return 0
    const parsed = toIntegerOrNull(value)
    if (parsed === null || parsed < 0 || parsed > max) {
      throw invalidResult('数值不合法', { field })
    }
    return parsed
  }

  /**
   * 构造 V2 result envelope（protocol-v1.md §4.1）。
   * 输入兼容既有游戏的 payload 命名（maxLevel / moveCount / endedReason / extra），
   * 使迁移只需替换调用点、不需要改游戏内部数值语义。
   */
  const buildResult = (input = {}) => {
    const score = toIntegerOrNull(input.score)
    if (score === null || score < 0 || score > (toIntegerOrNull(resultConfig.scoreMax) ?? RESULT_LIMITS.maxScore)) {
      throw invalidResult('成绩数值不合法', { field: 'score' })
    }
    const durationMs = optionalInteger(input.durationMs, { field: 'duration_ms', max: RESULT_LIMITS.maxDurationMs })
    const moves = optionalInteger(input.moveCount ?? input.moves, { field: 'moves', max: RESULT_LIMITS.maxMoves })
    const explicitMetric =
      input.metricValue === undefined || input.metricValue === null ? null : toIntegerOrNull(input.metricValue)
    if (input.metricValue !== undefined && input.metricValue !== null && explicitMetric === null) {
      throw invalidResult('指标数值不合法', { field: 'metric.value' })
    }
    const legacyMetric = toIntegerOrNull(fromLegacyMaxLevel(input.maxLevel))
    const metricValue = explicitMetric !== null ? explicitMetric : legacyMetric === null ? 0 : legacyMetric
    if (metricValue < 0 || metricValue > metricMax) {
      throw invalidResult('指标数值超出该游戏上限', { field: 'metric.value', max: metricMax })
    }
    const { reason, mapped, raw } = normalizeEndedReason(input.endedReason)
    const { extra, droppedKeys } = filterExtra(input.extra)
    if (utf8ByteLength(extra) > RESULT_LIMITS.maxExtraBytes) {
      throw invalidResult('附加数据过大', { field: 'extra' })
    }
    const result = {
      schema_version: toIntegerOrNull(config.resultSchemaVersion) ?? 1,
      score,
      metric: { name: metricName, value: metricValue },
      moves,
      ended_reason: reason,
      extra
    }
    if (utf8ByteLength(result) > RESULT_LIMITS.maxResultBytes) {
      throw invalidResult('成绩数据过大', { field: 'result' })
    }
    return {
      result,
      durationMs,
      diagnostics: {
        endedReasonRaw: raw,
        endedReasonMapped: mapped,
        droppedExtraKeys: droppedKeys
      }
    }
  }

  /**
   * V2 envelope → Legacy 字段（dual-write 反算；max_level 逐游戏不同，见 game-registry.md §4）。
   *
   * `rawEndedReason` 是**未归一化**的原始 ended_reason（由 run.js 从
   * `buildResult().diagnostics.endedReasonRaw` 透传）。Legacy 经典榜是历史数据，
   * 必须存原值（registry §5 / compatibility.md）—— 归一化只属 V2 语义。
   * 未提供时回落到 envelope 的归一值，保证向后兼容（不会静默变成 'unknown'）。
   */
  const toLegacyPayload = ({ result = {}, durationMs = 0, rawEndedReason } = {}) => {
    const envelope = isPlainObject(result.result) ? result.result : result
    const metricValue = toIntegerOrNull(envelope?.metric?.value) ?? 0
    return {
      score: toIntegerOrNull(envelope?.score) ?? 0,
      max_level: toIntegerOrNull(toLegacyMaxLevel(metricValue)) ?? 0,
      move_count: toIntegerOrNull(envelope?.moves) ?? 0,
      ended_reason: safeText(rawEndedReason) || safeText(envelope?.ended_reason) || 'unknown',
      duration_ms: toIntegerOrNull(durationMs) ?? 0,
      payload: isPlainObject(envelope?.extra) ? { ...envelope.extra } : {}
    }
  }

  /** run_id 形状校验（协议 §2.2） */
  const isValidRunId = (runId) => RUN_ID_RE.test(safeText(runId))

  const adapter = {
    gameId,
    displayName: safeText(config.displayName) || gameId,
    resultSchemaVersion: toIntegerOrNull(config.resultSchemaVersion) ?? 1,
    capabilities: normalizeCapabilities(config.capabilities),
    metric: { name: metricName, semantics: metricSemantics, max: metricMax, label: safeText(metricConfig.label) || metricName },
    leaderboard: {
      board: safeText(config.leaderboard?.board) || 'classic',
      order: LEADERBOARD_ORDERS.includes(safeText(config.leaderboard?.order)) ? safeText(config.leaderboard.order) : 'score_desc'
    },
    legacy: { maxLevelRule: safeText(legacyConfig.maxLevelRule) || '1:1', storageKeys: legacyStorageKeys },
    endedReasonMap,
    extraKeys,
    buildResult,
    toLegacyPayload,
    normalizeEndedReason,
    isValidRunId,
    /** 诊断用（不含任何主体身份） */
    describe: () => ({
      game_id: gameId,
      metric: metricName,
      semantics: metricSemantics,
      result_schema_version: adapter.resultSchemaVersion,
      capabilities: { ...adapter.capabilities }
    }),
    /** 允许上层（含服务端 registry 快照）覆盖关键语义；只接受更严格/更权威的值 */
    withOverrides(overrides = {}) {
      if (!isPlainObject(overrides) || !Object.keys(overrides).length) return adapter
      return createGameAdapter({
        ...config,
        ...overrides,
        metric: { ...metricConfig, ...(overrides.metric || {}) },
        capabilities: { ...config.capabilities, ...(overrides.capabilities || {}) },
        legacy: { ...legacyConfig, ...(overrides.legacy || {}) },
        result: { ...resultConfig, ...(overrides.result || {}) }
      })
    }
  }
  return adapter
}

/** 默认 leaderboard scope（§9.1：无 class 上下文时服务端自动降级为 school） */
export const DEFAULT_LEADERBOARD_SCOPES = Object.freeze(['class', 'school', 'class_total'])
