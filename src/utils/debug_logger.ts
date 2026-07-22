const STORAGE_KEY = 'hbu_debug_logs_v1'
const MAX_MEMORY_LOGS = 1200
const MAX_PERSIST_LOGS = 800
const LOG_EVENT = 'hbu-debug-log-updated'

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error' | 'log'

export type DebugLogItem = {
  id: string
  ts: number
  level: DebugLevel
  scope: string
  message: string
  details: string
}

type Listener = (logs: DebugLogItem[]) => void

let initialized = false
let seq = 0
let records: DebugLogItem[] = []
let patchedFetch = false
const listeners = new Set<Listener>()
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console)
}

const asText = (input: unknown) => {
  if (typeof input === 'string') return input
  if (typeof input === 'number' || typeof input === 'boolean') return String(input)
  if (input === null) return 'null'
  if (input === undefined) return 'undefined'
  if (input instanceof Error) {
    const stack = String(input.stack || '').trim()
    return stack || input.message || 'Error'
  }
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

const parseScope = (text: string) => {
  const match = String(text || '').trim().match(/^\[([^\]]{1,40})\]/)
  return match?.[1] || 'APP'
}

const normalizeMessage = (args: unknown[]) => {
  if (!Array.isArray(args) || args.length === 0) {
    return { scope: 'APP', message: '', details: '' }
  }
  const values = args.map((item) => asText(item))
  const first = values[0] || ''
  const scope = parseScope(first)
  const message = values.join(' ').replace(/\s+/g, ' ').trim()
  const details = values.join('\n')
  return { scope, message, details }
}

const persistLogs = () => {
  try {
    const toSave = records.slice(-MAX_PERSIST_LOGS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    // ignore
  }
}

const notifyListeners = () => {
  const snapshot = records.slice()
  listeners.forEach((cb) => {
    try {
      cb(snapshot)
    } catch {
      // ignore
    }
  })
  // Node/Vitest 无 window（#370 定位日志在单测中调用）
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(LOG_EVENT))
    } catch {
      // ignore
    }
  }
}

const pushRecord = (level: DebugLevel, args: unknown[]) => {
  const { scope, message, details } = normalizeMessage(args)
  if (!message) return

  const record: DebugLogItem = {
    id: `${Date.now()}-${seq += 1}`,
    ts: Date.now(),
    level,
    scope,
    message,
    details
  }
  records.push(record)
  if (records.length > MAX_MEMORY_LOGS) {
    records = records.slice(records.length - MAX_MEMORY_LOGS)
  }
  persistLogs()
  notifyListeners()
}

const patchConsole = () => {
  const wrap = (level: DebugLevel, fn: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      fn(...args)
      pushRecord(level, args)
    }
  }
  console.log = wrap('log', originalConsole.log)
  console.info = wrap('info', originalConsole.info)
  console.warn = wrap('warn', originalConsole.warn)
  console.error = wrap('error', originalConsole.error)
  console.debug = wrap('debug', originalConsole.debug)
}

const extractFetchMeta = (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request)?.url || ''
  const method = String(
    init?.method || ((input as Request)?.method ?? 'GET')
  ).toUpperCase()
  return { url, method }
}

const patchFetch = () => {
  if (patchedFetch || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, method } = extractFetchMeta(input, init)
    const start = Date.now()
    pushRecord('debug', [`[HTTP] 请求开始 ${method} ${url}`])
    try {
      const response = await nativeFetch(input, init)
      pushRecord('info', [
        `[HTTP] 请求完成 ${method} ${url} -> ${response.status} (${Date.now() - start}ms)`
      ])
      return response
    } catch (error) {
      pushRecord('error', [
        `[HTTP] 请求失败 ${method} ${url} (${Date.now() - start}ms)`,
        error
      ])
      throw error
    }
  }
  patchedFetch = true
}

const loadStoredLogs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: String(item.id || ''),
        ts: Number(item.ts) || Date.now(),
        level: (item.level || 'log') as DebugLevel,
        scope: String(item.scope || 'APP'),
        message: String(item.message || ''),
        details: String(item.details || item.message || '')
      }))
      .filter((item) => !!item.message)
      .slice(-MAX_MEMORY_LOGS)
  } catch {
    return []
  }
}

let rustPollTimer: ReturnType<typeof setInterval> | null = null
let lastRustLogId = 0
/** 防止 pushDebugLog ↔ invoke 互相调用导致栈溢出白屏 */
let rustBridgeBusy = false

const isTauriWindow = () =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__

/** 静默 invoke：不走 invokeNative，避免再打 pushDebugLog 形成死循环 */
const invokeSilent = async <T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T | null> => {
  if (!isTauriWindow()) return null
  try {
    const core = await import('@tauri-apps/api/core')
    return await core.invoke<T>(command, args)
  } catch {
    return null
  }
}

/** 拉取 Rust runtime_log，合并进前端调试窗 */
export const pullRuntimeLogsFromRust = async () => {
  if (typeof window === 'undefined' || rustBridgeBusy) return
  rustBridgeBusy = true
  try {
    const res = (await invokeSilent('get_runtime_logs', {
      limit: 200,
      sinceId: lastRustLogId || undefined,
      since_id: lastRustLogId || undefined
    })) as {
      logs?: Array<{
        id?: number
        ts?: number
        level?: string
        scope?: string
        message?: string
        details?: unknown
      }>
    } | null
    if (!res) return
    const logs = Array.isArray(res?.logs) ? res.logs : []
    for (const item of logs) {
      const id = Number(item.id || 0)
      if (id > lastRustLogId) lastRustLogId = id
      const level = (item.level || 'info') as DebugLevel
      const scope = String(item.scope || 'Rust')
      const message = String(item.message || '')
      if (!message) continue
      // 直接写入 records，避免再 echo 回 Rust
      const record: DebugLogItem = {
        id: `rust-${id || Date.now()}-${seq += 1}`,
        ts: Number(item.ts) || Date.now(),
        level: ['debug', 'info', 'warn', 'error', 'log'].includes(level) ? level : 'info',
        scope,
        message: `[${scope}] ${message}`,
        details:
          item.details !== undefined
            ? asText(item.details)
            : `[${scope}] ${message}`
      }
      records.push(record)
    }
    if (logs.length) {
      if (records.length > MAX_MEMORY_LOGS) {
        records = records.slice(records.length - MAX_MEMORY_LOGS)
      }
      persistLogs()
      notifyListeners()
    }
  } catch {
    // 非 Tauri / 命令未就绪时忽略
  } finally {
    rustBridgeBusy = false
  }
}

export const initDebugLogger = () => {
  if (initialized || typeof window === 'undefined') return
  records = loadStoredLogs()
  patchConsole()
  patchFetch()
  initialized = true
  pushRecord('info', ['[Bootstrap] 调试日志模块已初始化'])
  // 周期性同步 Rust 侧 runtime_log（含重登 / 课程中心 / 收件箱计时）
  void pullRuntimeLogsFromRust()
  if (rustPollTimer) clearInterval(rustPollTimer)
  rustPollTimer = setInterval(() => {
    void pullRuntimeLogsFromRust()
  }, 2000)
}

export const pushDebugLog = (
  scope: string,
  message: string,
  level: DebugLevel = 'info',
  details?: unknown
) => {
  const prefix = `[${scope || 'APP'}] ${message || ''}`.trim()
  const payload = details === undefined ? [prefix] : [prefix, details]
  pushRecord(level, payload)

  // 静默写入 Rust，禁止再走 invokeNative/pushDebugLog（否则会栈溢出白屏）
  if (typeof window === 'undefined') return
  if (rustBridgeBusy) return
  // Native 管道日志不回传，避免环与噪音
  if (String(scope || '') === 'Native') return

  void (async () => {
    try {
      await invokeSilent('push_runtime_log', {
        scope: scope || 'Frontend',
        message: message || '',
        level,
        details: details === undefined ? null : details
      })
    } catch {
      // ignore
    }
  })()
}

export const getDebugLogs = (limit = MAX_MEMORY_LOGS) => {
  const max = Math.max(1, Number(limit) || MAX_MEMORY_LOGS)
  return records.slice(-max)
}

export const clearDebugLogs = () => {
  records = []
  persistLogs()
  notifyListeners()
}

export const subscribeDebugLogs = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getDebugLogEventName = () => LOG_EVENT

export const formatDebugTime = (timestamp: number) => {
  const date = new Date(Number(timestamp) || Date.now())
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}
