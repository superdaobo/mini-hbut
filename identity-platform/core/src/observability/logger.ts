/**
 * 最小可观测性层（#626 扩展：日志落盘前统一脱敏）。
 *
 * 约定（#626 Logging / Privacy）：
 * - 调用方只记录白名单字段（correlation_id/event_type/route/status_code/
 *   duration/client_id/内部 id 或哈希/error_code）；
 * - 兜底保险：message 与 fields 中所有 string 在落盘前过
 *   redactSensitiveText / redactLogFields，即使误传 Authorization、
 *   handoff、client_secret、完整学号等也会被替换为 [redacted]。
 */

import { redactLogFields, redactSensitiveText } from '../security/redact.js'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 生成请求 ID（骨架用随机 hex，后续可换 tracing 系统） */
export function requestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createLogger(scope: string) {
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    // 默认 stdout 单行 JSON，方便 Vercel 日志聚合；输出前统一脱敏
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      message: redactSensitiveText(message),
      ...redactLogFields(fields),
    })
    if (level === 'error') {
      console.error(line)
    } else {
      console.log(line)
    }
  }
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
  }
}

export type Logger = ReturnType<typeof createLogger>
