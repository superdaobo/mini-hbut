/**
 * Run 生命周期与提交分发（#904 任务 1 的核心）。
 *
 * 幂等语义（protocol-v1.md §3.3，SDK 侧配套）：
 * - **同一 run 的 finish 重试必须字节级同 payload**：首次 finish 时冻结 payload，
 *   之后 `retry()` 复用同一 payload（本地签名 = canonical_json 的稳定序列化），保证服务端 content_hash 稳定；
 * - 同 run 重复 finish：终态后再次调用**不发第二次请求**，直接返回首次结果并标记 `duplicate:true`；
 * - 同 run 但调用方输入不同 → 本地判定 `RUN_ALREADY_FINISHED`（语义冲突，非抖动），不发请求；
 * - 200 + `idempotent_replay:true` / `recovered:true` 视为成功；409 一律停止重试。
 *
 * 降级矩阵（protocol-v1.md §5 的 client_action 列）：
 * - `FEATURE_DISABLED` / `PROTOCOL_VERSION_UNSUPPORTED` / `CLIENT_VERSION_TOO_OLD` / `LEGACY_ONLY`
 *   → 不重试，**回退 Legacy**（若 legacy_compatible），否则 standalone；
 * - `GAME_SESSION_EXPIRED` / `AUTH_REQUIRED` → 向宿主申请新 ticket → 重建 session → 幂等重试一次；
 * - `RUN_INVALID` → 用**新 run_id** 重建一次；再失败 → standalone；
 * - `RATE_LIMITED` / `INTERNAL_ERROR` / 网络超时 → 保留 pending，交由 `retry()`；
 * - `RUN_ALREADY_FINISHED` / `SCHEMA_INVALID` / `FORBIDDEN_ACTOR` / `GAME_DISABLED` / `IDEMPOTENCY_CONFLICT`
 *   → 终态，不重试。
 */

import { ERROR_CODES, GamePlatformError, normalizeError } from './errors.js'
import { MODES, TRUST_LEVELS } from './version.js'
import { canonicalJson, createRunId, safeText, stableStringify, toIsoString } from './utils.js'

/** run 状态：终态 = finished / rejected / abandoned */
export const RUN_STATUS = Object.freeze({
  created: 'created',
  finishing: 'finishing',
  finished: 'finished',
  rejected: 'rejected',
  failed: 'failed',
  abandoned: 'abandoned'
})

/** 触发「V2 不可用 → 回退 Legacy/standalone」的确定性失败码 */
const DEGRADE_TO_FALLBACK_CODES = Object.freeze([
  ERROR_CODES.FEATURE_DISABLED,
  ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED,
  ERROR_CODES.CLIENT_VERSION_TOO_OLD,
  ERROR_CODES.LEGACY_ONLY
])

/** 会话类失败码：可尝试重新取 ticket 恢复一次 */
const SESSION_RECOVERY_CODES = Object.freeze([ERROR_CODES.GAME_SESSION_EXPIRED, ERROR_CODES.AUTH_REQUIRED])

/** finish 请求体五个字段的稳定签名（对齐 §3.3.1 的 content_hash 输入集合） */
export const finishPayloadSignature = ({ gameId, runId, durationMs, result, requireRewards }) =>
  canonicalJson({
    game_id: safeText(gameId),
    run_id: safeText(runId),
    duration_ms: Number(durationMs) || 0,
    result,
    require_rewards: requireRewards === true
  })

/**
 * 创建 Run。
 * @param {object} engine 内部引擎（见 game.js 的 createEngine）
 * @param {object} [options] { runId, startedAt }
 */
export const createRun = (engine, options = {}) => {
  const runId = safeText(options.runId) || createRunId(engine.clock)
  const startedAt = Number.isFinite(options.startedAt) ? Number(options.startedAt) : engine.clock()
  const telemetry = engine.telemetry

  let status = RUN_STATUS.created
  let signature = ''
  let inputFingerprint = ''
  let prepared = null
  let outcome = null
  let inflight = null
  let serverRunReady = false
  let serverCreatePromise = null
  let attempts = 0
  let finishedAt = null
  let lastError = null
  let recreatedRunId = ''

  const isTerminal = () => status === RUN_STATUS.finished || status === RUN_STATUS.rejected || status === RUN_STATUS.abandoned

  const trustLevelForMode = () => {
    const mode = engine.getMode()
    if (mode === MODES.verified) return TRUST_LEVELS.verifiedSession
    if (mode === MODES.compatibility) return TRUST_LEVELS.legacy
    return null
  }

  const baseOutcome = (extra = {}) => ({
    success: false,
    mode: engine.getMode(),
    trustLevel: trustLevelForMode(),
    uploaded: false,
    settled: false,
    rewardStatus: null,
    rewardsEnabled: false,
    duplicate: false,
    idempotentReplay: false,
    recovered: false,
    runStatus: null,
    channel: '',
    error: null,
    retryable: false,
    message: '',
    reason: '',
    correlationId: telemetry?.correlationId || '',
    requestId: '',
    ...extra
  })

  const localOutcome = (message, extra = {}) =>
    baseOutcome({ success: true, uploaded: false, trustLevel: null, mode: MODES.standalone, message, ...extra })

  const failureOutcome = (error, extra = {}) =>
    baseOutcome({
      success: false,
      error,
      retryable: error?.retryable === true,
      message: safeText(error?.message),
      ...extra
    })

  /** 保证服务端已创建 run（T1）；失败不抛错，由 finish/retry 再次尝试 */
  const ensureServerRun = () => {
    if (serverRunReady) return Promise.resolve({ ok: true })
    if (serverCreatePromise) return serverCreatePromise
    if (engine.getMode() !== MODES.verified || !engine.client) return Promise.resolve({ ok: false, reason: 'not_verified' })
    serverCreatePromise = (async () => {
      try {
        const created = await engine.client.createRun({
          runId,
          sessionId: engine.client.session?.sessionId,
          clientVersion: engine.clientVersion(),
          platform: engine.platformContext().platform,
          runtime: engine.platformContext().runtime,
          startedAt: toIsoString(startedAt)
        })
        serverRunReady = true
        return { ok: true, idempotentReplay: created.idempotentReplay }
      } catch (error) {
        const normalized = normalizeError(error, { stage: 'create_run' })
        lastError = normalized
        serverCreatePromise = null
        return { ok: false, error: normalized }
      }
    })()
    return serverCreatePromise
  }

  /** Legacy 通道提交（compatibility 模式与 V2 确定性降级共用） */
  const submitViaLegacy = async (reason) => {
    if (!engine.legacy || !engine.legacy.canSubmit()) {
      return localOutcome('本轮为本地游玩，成绩未上传', {
        reason: reason || 'legacy_unavailable'
      })
    }
    try {
      const legacyPayload =
        typeof engine.legacy.toLegacyPayload === 'function'
          ? engine.legacy.toLegacyPayload({ result: prepared.result, durationMs: prepared.durationMs, runId })
          : engine.adapter.toLegacyPayload({ result: prepared.result, durationMs: prepared.durationMs })
      const response = await engine.legacy.submit({
        runId,
        payload: legacyPayload,
        result: prepared.result,
        durationMs: prepared.durationMs,
        overrides: prepared.legacyOverrides
      })
      if (response?.success !== true) {
        const error = new GamePlatformError(safeText(response?.code) || ERROR_CODES.INTERNAL_ERROR, {
          message: safeText(response?.message || response?.error),
          retryable: response?.retryable === true,
          stage: 'legacy'
        })
        return failureOutcome(error, { reason: reason || '' })
      }
      return baseOutcome({
        success: true,
        uploaded: true,
        mode: MODES.compatibility,
        trustLevel: TRUST_LEVELS.legacy,
        channel: response.channel || engine.legacy.channel || 'legacy_rank_api',
        message: '成绩已上传到经典榜（本轮不计奖励）',
        reason: reason || '',
        raw: response.raw
      })
    } catch (error) {
      return failureOutcome(normalizeError(error, { stage: 'legacy' }), { reason: reason || '' })
    }
  }

  /** V2 提交（verified 模式） */
  const submitViaVerified = async () => {
    const client = engine.client
    if (!client || !client.hasSession()) {
      return { ok: false, error: new GamePlatformError(ERROR_CODES.AUTH_REQUIRED, { stage: 'finish' }) }
    }
    const created = await ensureServerRun()
    if (!created.ok) {
      return {
        ok: false,
        error: created.error || new GamePlatformError(ERROR_CODES.RUN_INVALID, { stage: 'create_run' })
      }
    }
    try {
      const response = await client.finishRun({
        runId,
        sessionId: client.session?.sessionId,
        clientVersion: engine.clientVersion(),
        platform: engine.platformContext().platform,
        runtime: engine.platformContext().runtime,
        startedAt: toIsoString(startedAt),
        finishedAt: toIsoString(prepared.finishedAt),
        durationMs: prepared.durationMs,
        result: prepared.result,
        requireRewards: prepared.requireRewards
      })
      attempts += Number(response.attempts || 1)
      const rewardStatus = response.settlement?.rewardStatus || (response.rewardDisabled ? 'disabled' : null)
      const settled = response.settlement?.state === 'applied' || response.runStatus === 'SETTLED'
      return {
        ok: true,
        outcome: baseOutcome({
          success: true,
          uploaded: true,
          mode: MODES.verified,
          trustLevel: TRUST_LEVELS.verifiedSession,
          settled,
          rewardStatus,
          rewardsEnabled: rewardStatus === 'granted',
          idempotentReplay: response.idempotentReplay,
          recovered: response.recovered,
          runStatus: response.runStatus,
          requestId: response.requestId,
          message: response.rewardDisabled ? '成绩已上传（本轮不计奖励）' : settled ? '成绩已上传' : '成绩已上传，结算处理中',
          raw: response.raw
        })
      }
    } catch (error) {
      attempts += 1
      return { ok: false, error: normalizeError(error, { stage: 'finish' }) }
    }
  }

  /** 一次完整投递（含会话恢复 / 新 run 重建 / Legacy 回退） */
  const deliverOnce = async ({ allowRecreate }) => {
    await engine.ready
    const mode = engine.getMode()
    if (mode === MODES.standalone) return localOutcome('本轮为本地游玩，成绩未上传')
    if (mode === MODES.compatibility) return submitViaLegacy('mode_compatibility')

    let result = await submitViaVerified()
    if (result.ok) return result.outcome

    let error = result.error
    // 会话类失败：向宿主申请新 ticket → 重建 session → 幂等重试同一 payload（§5 码 2）
    if (SESSION_RECOVERY_CODES.includes(error.code)) {
      const recovered = await engine.recoverSession(error.code)
      if (recovered) {
        result = await submitViaVerified()
        if (result.ok) return result.outcome
        error = result.error
      }
    }
    // V2 确定性不可用：降级模式并回退 Legacy（若可用），否则 standalone
    if (DEGRADE_TO_FALLBACK_CODES.includes(error.code)) {
      engine.downgradeTo(
        engine.legacy && engine.legacy.canSubmit() ? MODES.compatibility : MODES.standalone,
        `finish_${String(error.code).toLowerCase()}`
      )
      return submitViaLegacy(`v2_${error.code}`)
    }
    // RUN_INVALID：用新 run_id 重建一次（§5 码 6）
    if (error.code === ERROR_CODES.RUN_INVALID && allowRecreate) {
      const nextRun = engine.recreateRun(runId)
      if (nextRun) {
        const retryOutcome = await nextRun.finish(prepared.input, { internal: true })
        recreatedRunId = nextRun.id
        return { ...retryOutcome, reason: 'run_invalid_recreated', recreatedRunId }
      }
      engine.downgradeTo(MODES.standalone, 'run_invalid_recreate_failed')
      return localOutcome('本局成绩仅本地保留（排行服务暂时不可用）', { reason: 'run_invalid' })
    }
    // RATE_LIMITED / INTERNAL_ERROR / 网络：保留 pending，可重试
    return failureOutcome(error)
  }

  /** 冻结 payload（只做一次，保证重试字节级一致） */
  const prepare = (input = {}) => {
    const built = engine.adapter.buildResult(input)
    const requireRewards = input.requireRewards === true && engine.features().economy === true
    const durationMs =
      input.durationMs === undefined || input.durationMs === null
        ? Math.max(0, (input.finishedAt ? Number(input.finishedAt) : engine.clock()) - startedAt)
        : built.durationMs
    const finishedAtMs = Number(input.finishedAt) || engine.clock()
    const next = {
      input: { ...input, durationMs },
      result: built.result,
      durationMs,
      requireRewards,
      finishedAt: finishedAtMs,
      // Legacy 通道字段覆盖（仅影响经典榜提交，不影响 V2 envelope）
      legacyOverrides: input.legacy && typeof input.legacy === 'object' ? { ...input.legacy } : {},
      diagnostics: built.diagnostics
    }
    next.signature = finishPayloadSignature({
      gameId: engine.gameId,
      runId,
      durationMs,
      result: next.result,
      requireRewards
    })
    return next
  }

  const run = {
    get id() {
      return runId
    },
    get startedAt() {
      return startedAt
    },
    get finishedAt() {
      return finishedAt
    },
    get status() {
      return status
    },
    get attempts() {
      return attempts
    },
    get error() {
      return lastError
    },
    get result() {
      return prepared?.result || null
    },
    get signature() {
      return signature
    },
    get outcome() {
      return outcome
    },
    get recreatedRunId() {
      return recreatedRunId
    },
    /** pending payload（不含任何凭据，可供 UI 做本地暂存展示） */
    get pendingPayload() {
      return prepared
        ? { result: prepared.result, durationMs: prepared.durationMs, requireRewards: prepared.requireRewards }
        : null
    },
    ensureServerRun,

    /**
     * 结束本局并提交。可重复安全调用（幂等）。
     * @param {object} input { score, maxLevel, metricValue, moveCount, endedReason, extra, durationMs, requireRewards, finishedAt }
     * @param {object} [options] { internal } 内部重试标记
     */
    async finish(input = {}, options = {}) {
      // A. 终态幂等短路：不再发任何请求
      if (isTerminal() && outcome) {
        if (options.internal === true || !input || Object.keys(input).length === 0) {
          return { ...outcome, duplicate: true }
        }
        if (stableStringify(input) === inputFingerprint) return { ...outcome, duplicate: true }
        return failureOutcome(
          new GamePlatformError(ERROR_CODES.RUN_ALREADY_FINISHED, {
            message: '该对局已提交过不同的结果，请重开一局',
            details: { local_conflict: true },
            stage: 'finish'
          }),
          { duplicate: true }
        )
      }
      // B. 进行中：复用同一次 in-flight 请求（含「重复 finish 不重复提交」）
      if (status === RUN_STATUS.finishing && inflight) return inflight
      // C. 冻结 / 校验 payload（同一 run 只允许一份 payload）
      if (prepared) {
        if (options.internal !== true && stableStringify(input) !== inputFingerprint) {
          return failureOutcome(
            new GamePlatformError(ERROR_CODES.RUN_ALREADY_FINISHED, {
              message: '该对局已提交过不同的结果，请重开一局',
              details: { local_conflict: true },
              stage: 'finish'
            })
          )
        }
      } else {
        try {
          prepared = prepare(input)
          inputFingerprint = stableStringify(input)
          signature = prepared.signature
        } catch (error) {
          const normalized = normalizeError(error, { stage: 'adapter' })
          status = RUN_STATUS.rejected
          lastError = normalized
          outcome = failureOutcome(normalized)
          telemetry?.event('run.finish.rejected', {
            game_id: engine.gameId,
            code: normalized.code,
            reason: 'local_validation'
          })
          return outcome
        }
      }

      // D. 提交
      status = RUN_STATUS.finishing
      inflight = (async () => {
        try {
          const result = await deliverOnce({ allowRecreate: options.internal !== true })
          outcome = result
          // 服务端确定性拒绝（不可重试）也视为「本 run 已结束」，避免游戏无限重试同一 payload
          status = result.success || result.error?.retryable === false ? RUN_STATUS.finished : RUN_STATUS.failed
          if (result.success) finishedAt = prepared.finishedAt
          if (result.error) lastError = result.error
          telemetry?.event('run.finish', {
            game_id: engine.gameId,
            mode: result.mode,
            trust_level: result.trustLevel || '',
            code: result.error?.code || '',
            uploaded: result.uploaded,
            settled: result.settled,
            reward_status: result.rewardStatus || '',
            attempt: attempts
          })
          return result
        } finally {
          inflight = null
        }
      })()
      return inflight
    },

    /** 失败后手动重试：复用**同一** payload（保证 content_hash 稳定） */
    async retry() {
      if (!prepared) {
        return failureOutcome(new GamePlatformError(ERROR_CODES.RUN_INVALID, { message: '本局还没有可重试的成绩' }))
      }
      if (isTerminal() && outcome) return { ...outcome, duplicate: true }
      status = RUN_STATUS.failed
      if (!serverRunReady) serverCreatePromise = null
      return run.finish(prepared.input, { internal: true })
    },

    /** 放弃本局（不提交） */
    abandon(reason = 'abandoned') {
      if (isTerminal()) return false
      status = RUN_STATUS.abandoned
      prepared = null
      signature = ''
      inputFingerprint = ''
      telemetry?.event('run.abandon', { game_id: engine.gameId, reason })
      return true
    },

    toJSON() {
      return {
        run_id: runId,
        status,
        started_at: toIsoString(startedAt),
        finished_at: finishedAt ? toIsoString(finishedAt) : null,
        duration_ms: prepared?.durationMs ?? null,
        ended_reason: prepared?.result?.ended_reason || null,
        attempts,
        recreated_run_id: recreatedRunId || null
      }
    }
  }
  return run
}
