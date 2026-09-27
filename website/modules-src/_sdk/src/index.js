/**
 * Mini HBUT Game Platform SDK —— 公共入口（#904）。
 *
 * 用法（推荐：先渲染、再 await）：
 *   import { MiniHBUTGame, createGameAdapter } from '../../../_sdk/src/index.js'
 *   const adapter = createGameAdapter({ gameId: 'hbut_stack', ... })
 *   const game = MiniHBUTGame.create({ gameId: 'hbut_stack', adapter })   // 同步，不阻塞渲染
 *   let run = game.startRun()
 *   ...
 *   await run.finish({ score: 1240, maxLevel: 26, moveCount: 26, endedReason: 'lost' })
 *   await game.leaderboard({ scope: 'class', limit: 20 })
 *
 * 或直接 await 模式判定：
 *   const game = await MiniHBUTGame.init({ gameId: 'hbut_stack', adapter })
 *
 * 公共 API 形态（#904 任务 1 契约）：
 *   MiniHBUTGame.init({ gameId, adapter, ... })           → Promise<GameHandle>
 *   MiniHBUTGame.create({ gameId, adapter, ... })         → GameHandle（同步）
 *   game.startRun({ runId?, startedAt? })                 → Run（同步）
 *   run.finish({ score, maxLevel, metricValue, moveCount, endedReason, extra, durationMs, requireRewards })
 *                                                         → Promise<FinishOutcome>
 *   game.leaderboard({ scope, limit, board, cursor })     → Promise<LeaderboardResult>
 */

import { createGame, createEngine, initGame } from './game.js'
import { createGameAdapter, ENDED_REASONS, METRIC_SEMANTICS, RESULT_LIMITS } from './adapters/adapter.js'
import { ERROR_CODES, ERROR_CODE_TABLE, GamePlatformError, isGamePlatformError, normalizeError, FORBIDDEN_ACTOR_FIELDS } from './errors.js'
import { HOST_MESSAGE_TYPES, MODES, PROTOCOL_VERSION, SDK_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TRUST_LEVELS } from './version.js'
import { clearLaunchTicketFromUrl, createHostOriginGuard, readLaunchTicket } from './host-bridge.js'
import {
  buildLegacySubmitBody,
  canSubmitLegacyRank,
  fetchLegacyLeaderboard,
  LEGACY_PROTOCOL,
  LEGACY_TRUST_LEVEL,
  normalizeLegacyRankApiBase,
  readLegacyModuleContext,
  resolveLegacyPlatformText,
  submitLegacyRank,
  writeLegacyModuleContext
} from './legacy/legacy-rank.js'
import {
  canSubmitJumpOutLegacy,
  createJumpOutLegacyAdapter,
  fetchJumpOutLegacyLeaderboard,
  readJumpOutLegacyContext,
  submitJumpOutLegacyRank
} from './legacy/legacy-jump-out.js'
import { createRun, finishPayloadSignature, RUN_STATUS } from './run.js'
import { assertNoForbiddenFields, createGamePlatformClient } from './platform/game-platform-client.js'
import { applyRegistryEntry, compareVersions, resolveRegistryEntry } from './platform/registry.js'
import { sanitizeTelemetryFields } from './telemetry.js'
import { canonicalJson, createRunId, safeText, stableStringify, utf8ByteLength } from './utils.js'
import { stripPiiFields } from './game.js'

/**
 * 对外门面。刻意保持极简：三个方法 + 版本/枚举/常量。
 */
export const MiniHBUTGame = {
  /** 等待模式判定（verified / compatibility / standalone）；任何失败都只降级，不抛错 */
  init: initGame,
  /** 同步创建句柄（模式判定后台进行）；适合「加载即开局」的游戏 */
  create: createGame,
  /** 底层引擎（高级用法：自定义 Run 编排、注入 transport/fetch） */
  createEngine,
  sdkVersion: SDK_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
  modes: MODES,
  trustLevels: TRUST_LEVELS,
  errorCodes: ERROR_CODES,
  errorCodeTable: ERROR_CODE_TABLE,
  hostMessageTypes: HOST_MESSAGE_TYPES,
  runStatus: RUN_STATUS,
  forBiddenActorFields: FORBIDDEN_ACTOR_FIELDS,
  createGameAdapter,
  /** 测试/诊断：来源校验器（wrong origin 判定复用同一实现） */
  createHostOriginGuard,
  /** 测试/诊断：读取 URL 中的 Launch Ticket */
  readLaunchTicket
}

export {
  createGame,
  createEngine,
  createGameAdapter,
  createHostOriginGuard,
  readLaunchTicket,
  clearLaunchTicketFromUrl,
  ERROR_CODES,
  ERROR_CODE_TABLE,
  FORBIDDEN_ACTOR_FIELDS,
  GamePlatformError,
  HOST_MESSAGE_TYPES,
  isGamePlatformError,
  MODES,
  normalizeError,
  PROTOCOL_VERSION,
  SDK_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  TRUST_LEVELS,
  ENDED_REASONS,
  METRIC_SEMANTICS,
  RESULT_LIMITS,
  RUN_STATUS,
  // 内部工具（供单测/诊断/迁移期复用；不属于游戏日常调用面）
  assertNoForbiddenFields,
  applyRegistryEntry,
  buildLegacySubmitBody,
  canonicalJson,
  canSubmitJumpOutLegacy,
  compareVersions,
  createGamePlatformClient,
  createRun,
  createRunId,
  fetchJumpOutLegacyLeaderboard,
  finishPayloadSignature,
  readJumpOutLegacyContext,
  resolveLegacyPlatformText,
  resolveRegistryEntry,
  safeText,
  sanitizeTelemetryFields,
  stableStringify,
  stripPiiFields,
  submitJumpOutLegacyRank,
  utf8ByteLength,
  writeLegacyModuleContext,
  // Legacy 通道（迁移期 fallback 与兼容性测试直接可用）
  LEGACY_PROTOCOL,
  LEGACY_TRUST_LEVEL,
  canSubmitLegacyRank,
  createJumpOutLegacyAdapter,
  fetchLegacyLeaderboard,
  normalizeLegacyRankApiBase,
  readLegacyModuleContext,
  submitLegacyRank
}

export default MiniHBUTGame
