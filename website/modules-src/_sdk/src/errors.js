/**
 * 错误码归一化：**只允许** protocol-v1.md §5 冻结的 17 个错误码。
 *
 * 设计约束（#904 验收）：
 * - SDK 不得自造错误码；任何未知 code 一律归一为 INTERNAL_ERROR；
 * - 服务端 message 是可直接展示的简体中文，客户端不做二次映射（protocol-v1.md §5）；
 * - 本地失败（离线/超时/无凭据）复用协议码语义，不新增码；
 * - 错误对象**绝不携带** Authorization / ticket / GS token / payload 原文（§10 L1、L5）。
 */

import { safeText } from './utils.js'

/** 17 个协议错误码（与 schemas/error-codes.json 逐字一致） */
export const ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  GAME_SESSION_EXPIRED: 'GAME_SESSION_EXPIRED',
  TICKET_INVALID: 'TICKET_INVALID',
  TICKET_USED: 'TICKET_USED',
  RUN_ALREADY_FINISHED: 'RUN_ALREADY_FINISHED',
  RUN_INVALID: 'RUN_INVALID',
  REWARD_DISABLED: 'REWARD_DISABLED',
  GAME_DISABLED: 'GAME_DISABLED',
  RATE_LIMITED: 'RATE_LIMITED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  LEGACY_ONLY: 'LEGACY_ONLY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  PROTOCOL_VERSION_UNSUPPORTED: 'PROTOCOL_VERSION_UNSUPPORTED',
  CLIENT_VERSION_TOO_OLD: 'CLIENT_VERSION_TOO_OLD',
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  FORBIDDEN_ACTOR: 'FORBIDDEN_ACTOR'
})

/**
 * 码表：HTTP / retryable / 展示文案 / 客户端动作。
 * `clientAction` 逐条对齐 protocol-v1.md §5 的 client_action 列，供游戏 UI 与迁移 Agent 直接引用。
 */
export const ERROR_CODE_TABLE = Object.freeze({
  AUTH_REQUIRED: {
    http: 401,
    retryable: false,
    message: '登录状态不可用，请重新登录后再试',
    clientAction: '触发一次刷新华东身份凭据；仍失败则走 Legacy 提交，否则 standalone'
  },
  GAME_SESSION_EXPIRED: {
    http: 401,
    retryable: false,
    message: '游戏会话已过期，请重新进入游戏',
    clientAction: '用宿主重新换 ticket → session 后按幂等重试同一 run；两次失败降级 compatibility/standalone'
  },
  TICKET_INVALID: {
    http: 401,
    retryable: false,
    message: '凭据无效或已失效',
    clientAction: '重新走授权流程签发新 ticket；不重试同一 ticket'
  },
  TICKET_USED: {
    http: 409,
    retryable: false,
    message: '凭据无效或已失效',
    clientAction: '若本地已持有有效 session 则复用；否则向宿主申请新 ticket，禁止再次提交同一 ticket'
  },
  RUN_ALREADY_FINISHED: {
    http: 409,
    retryable: false,
    message: '该对局已提交过不同的结果',
    clientAction: '停止重试；本地结束该 run，重开新局（新 run_id）'
  },
  RUN_INVALID: {
    http: 400,
    retryable: false,
    message: '对局记录无效，请重开一局',
    clientAction: '新建 run（新 run_id）重试一次；再失败 → standalone'
  },
  REWARD_DISABLED: {
    http: 200,
    retryable: false,
    message: '本轮不计奖励（奖励功能未开放）',
    clientAction: '正常展示分数；隐藏奖励类 UI，不得重试期望拿到奖励'
  },
  GAME_DISABLED: {
    http: 404,
    retryable: false,
    message: '该游戏暂未开放排行',
    clientAction: '隐藏入口、不提交；已打开的 run 丢弃并本地提示'
  },
  RATE_LIMITED: {
    http: 429,
    retryable: true,
    message: '请求过于频繁，请稍后重试',
    clientAction: '指数退避（1200/2600/5200ms，最多 3 次）；仍失败保留 pending 并给出手动重试'
  },
  FEATURE_DISABLED: {
    http: 403,
    retryable: false,
    message: '游戏平台暂未开放',
    clientAction: '回退 Legacy /api/game-rank/*（若 legacy_compatible），否则 standalone；不重试'
  },
  LEGACY_ONLY: {
    http: 409,
    retryable: false,
    message: '该游戏尚未接入新版排行',
    clientAction: '走 Legacy 提交路径；不重试 V2'
  },
  INTERNAL_ERROR: {
    http: 500,
    retryable: true,
    message: '服务暂时不可用，请稍后重试',
    clientAction: '退避重试（最多 3 次）+ 保留 pending；仍失败 → Legacy 兜底或本地暂存'
  },
  PROTOCOL_VERSION_UNSUPPORTED: {
    http: 400,
    retryable: false,
    message: '客户端与服务端版本不兼容，请升级后重试',
    clientAction: '不重试；降级 Legacy/standalone；提示升级客户端'
  },
  CLIENT_VERSION_TOO_OLD: {
    http: 426,
    retryable: false,
    message: '当前版本过低，请升级 App 后再试',
    clientAction: '提示升级；降级 Legacy/standalone'
  },
  SCHEMA_INVALID: {
    http: 400,
    retryable: false,
    message: '成绩数据格式不合法，已结束本局',
    clientAction: '结束本地 run（不重试同 run）；上报诊断；不产生结算'
  },
  IDEMPOTENCY_CONFLICT: {
    http: 409,
    retryable: false,
    message: '请求重复冲突，请重开一局',
    clientAction: '生成新的 key（新 run / 新 ticket）；不得用旧 key 猜测既有结果'
  },
  FORBIDDEN_ACTOR: {
    http: 403,
    retryable: false,
    message: '身份校验失败，已停止提交',
    clientAction: '立即停止重试；记录安全事件；移除 actor 字段后才允许恢复'
  }
})

/** actor 类字段：V2 端点出现即 403 FORBIDDEN_ACTOR（protocol-v1.md §2.3） */
export const FORBIDDEN_ACTOR_FIELDS = Object.freeze(['student_id', 'player_id', 'user_id'])

/** 其他服务端权威字段：V2 端点出现即 400 SCHEMA_INVALID（protocol-v1.md §2.3） */
export const FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  'xp_amount',
  'coin_amount',
  'reward',
  'reward_amount',
  'season_id',
  'trust_level',
  'settled_at',
  'server_received_at'
])

/** 按协议码表推导 HTTP 状态 */
export const httpStatusForCode = (code) => Number(ERROR_CODE_TABLE[code]?.http || 500)

/** 按协议码表推导是否可重试（未知码按不可重试处理，避免抖动放大） */
export const isRetryableCode = (code) => !!ERROR_CODE_TABLE[code]?.retryable

/** 归一化任意 code 字符串到 17 码之一 */
export const normalizeErrorCode = (code, fallback = ERROR_CODES.INTERNAL_ERROR) => {
  const text = safeText(code).toUpperCase()
  return ERROR_CODE_TABLE[text] ? text : fallback
}

/** SDK 统一错误类型：只携带 code / status / retryable / requestId / details 与可展示中文 message */
export class GamePlatformError extends Error {
  constructor(code, options = {}) {
    const normalized = normalizeErrorCode(code)
    const table = ERROR_CODE_TABLE[normalized]
    const message = safeText(options.message) || table.message
    super(message)
    this.name = 'GamePlatformError'
    this.code = normalized
    this.status = Number(options.status || table.http || 0) || 0
    this.retryable = typeof options.retryable === 'boolean' ? options.retryable : !!table.retryable
    this.requestId = safeText(options.requestId)
    this.details = options.details && typeof options.details === 'object' ? { ...options.details } : {}
    this.stage = safeText(options.stage)
    this.clientAction = table.clientAction
    if (options.cause) this.cause = options.cause
  }

  /** 只上报 code + request_id（§10 L5：错误上报不得包含凭据/学号） */
  toReport() {
    return {
      code: this.code,
      request_id: this.requestId || '',
      retryable: this.retryable,
      stage: this.stage || '',
      http: this.status || 0
    }
  }
}

export const isGamePlatformError = (value) => value instanceof GamePlatformError

/** 构造统一错误（保留原始 cause 但不外泄其内容） */
export const createError = (code, options = {}) => new GamePlatformError(code, options)

/**
 * 把任意异常归一为 GamePlatformError。
 * - 已是 GamePlatformError → 原样返回；
 * - AbortError/timeout → INTERNAL_ERROR（网络超时，可重试，文案用中文）；
 * - 其他 → fallbackCode（默认 INTERNAL_ERROR），并带上 stage 便于诊断。
 */
export const normalizeError = (error, options = {}) => {
  if (isGamePlatformError(error)) {
    if (!error.stage && options.stage) error.stage = options.stage
    return error
  }
  const text = `${safeText(error?.name)} ${safeText(error?.message || error)}`.toLowerCase()
  const aborted =
    text.includes('abort') || text.includes('timeout') || text.includes('signal is aborted')
  const fallback = normalizeErrorCode(options.code)
  const message = aborted
    ? '网络请求超时，请稍后重试'
    : safeText(error?.message) || ERROR_CODE_TABLE[fallback].message
  return new GamePlatformError(fallback, {
    message,
    status: Number(error?.status || 0) || 0,
    retryable: aborted ? true : undefined,
    details: { network: aborted ? 'timeout' : 'error', ...(options.details || {}) },
    stage: options.stage,
    cause: error
  })
}

/** 本地参数校验失败（程序员错误，非服务端错误）用 TypeError，避免污染协议码语义 */
export const isAbortError = (error) => {
  const text = `${safeText(error?.name)} ${safeText(error?.message || error)}`.toLowerCase()
  return text.includes('abort') || text.includes('timeout') || text.includes('signal is aborted')
}

/** HTTP 状态 → 协议码（仅在服务端未返回标准 envelope 时兜底；§1.1 的 404 语义） */
export const codeFromHttpStatus = (status) => {
  const value = Number(status || 0)
  if (value === 401) return ERROR_CODES.AUTH_REQUIRED
  if (value === 403) return ERROR_CODES.FEATURE_DISABLED
  if (value === 404) return ERROR_CODES.FEATURE_DISABLED
  if (value === 409) return ERROR_CODES.IDEMPOTENCY_CONFLICT
  if (value === 413) return ERROR_CODES.SCHEMA_INVALID
  if (value === 426) return ERROR_CODES.CLIENT_VERSION_TOO_OLD
  if (value === 429) return ERROR_CODES.RATE_LIMITED
  if (value >= 500 && value <= 599) return ERROR_CODES.INTERNAL_ERROR
  if (value >= 400 && value <= 499) return ERROR_CODES.SCHEMA_INVALID
  return ERROR_CODES.INTERNAL_ERROR
}
