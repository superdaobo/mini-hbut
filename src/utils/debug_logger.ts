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
  window.dispatchEvent(new CustomEvent(LOG_EVENT))
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

export const initDebugLogger = () => {
  if (initialized || typeof window === 'undefined') return
  records = loadStoredLogs()
  patchConsole()
  patchFetch()
  initialized = true
  pushRecord('info', ['[Bootstrap] 调试日志模块已初始化'])
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
