/**
 * 遥测与关联 id（protocol-v1.md §10）。
 *
 * 硬约束：
 * - 默认 sink 为空实现（**不打 console**）：SDK 自身绝不输出日志；
 * - 只允许白名单标签（§10 L4）：game_id / code / trust_level / platform / runtime / reason / board / scope / mode / attempt；
 * - 禁止 ticket / GS token / Authorization / 学号 / 姓名 / 班级 / player_ref 之外的任何主体标识；
 * - 错误上报只允许 code + request_id（§10 L5）。
 */

import { SDK_VERSION, PROTOCOL_VERSION } from './version.js'
import { createPrefixedId, safeText } from './utils.js'

/** 允许上报的字段白名单（§10 L4） */
export const TELEMETRY_FIELD_ALLOWLIST = Object.freeze([
  'game_id',
  'code',
  'trust_level',
  'platform',
  'runtime',
  'reason',
  'board',
  'scope',
  'mode',
  'attempt',
  'duration_ms',
  'sdk_version',
  'protocol_version',
  'stage',
  'request_id',
  'status',
  'correlation_id',
  'uploaded',
  'settled',
  'reward_status'
])

const ALLOWED = new Set(TELEMETRY_FIELD_ALLOWLIST)

/** 过滤事件字段：非白名单字段直接丢弃（防御性，杜绝凭据外泄） */
export const sanitizeTelemetryFields = (fields = {}) => {
  const safe = {}
  for (const [key, value] of Object.entries(fields || {})) {
    if (!ALLOWED.has(key)) continue
    if (value === null || value === undefined) continue
    if (typeof value === 'object') continue
    if (typeof value === 'string') {
      safe[key] = safeText(value).slice(0, 64)
      continue
    }
    safe[key] = value
  }
  return safe
}

/**
 * 创建遥测实例。
 * @param {object} [options]
 * @param {Function} [options.sink] 事件出口（默认空实现）
 * @param {string} [options.correlationId] 外部注入的关联 id
 */
export const createTelemetry = (options = {}) => {
  const sink = typeof options.sink === 'function' ? options.sink : null
  const correlationId = safeText(options.correlationId) || createPrefixedId('corr', Date.now(), '')
  const events = []

  const event = (name, fields = {}) => {
    const record = {
      name: safeText(name) || 'event',
      correlation_id: correlationId,
      sdk_version: SDK_VERSION,
      protocol_version: PROTOCOL_VERSION,
      ...sanitizeTelemetryFields(fields)
    }
    events.push(record)
    if (sink) {
      try {
        sink(record)
      } catch {
        // 遥测出口自身异常绝不能影响游戏主流程
      }
    }
    return record
  }

  return {
    correlationId,
    event,
    /** 返回事件快照（测试与诊断用；只读副本） */
    snapshot: () => events.map((item) => ({ ...item }))
  }
}
