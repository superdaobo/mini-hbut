import { pushDebugLog } from './debug_logger'
import { isTestAccountSession } from './test_account.js'
import { resolveTestAccountCachePayload } from './test_account_fixtures.js'
import { withTimeout } from './fetch_timeout.js'


export interface CacheEnvelope<T = unknown> {
  data: T
  timestamp: number
}

export interface CacheResult<T = unknown> {
  data: T
  fromCache: boolean
  timestamp: number
  stale?: boolean
  demo?: boolean
}

export interface FetchWithCacheOptions {
  staleWhileRevalidate?: boolean
  priority?: string
  forceRemote?: boolean
  timeoutMs?: number
  cacheOfflinePayload?: boolean
}

export interface ApiPayload extends Record<string, unknown> {
  success?: boolean
  offline?: boolean
  error?: unknown
  msg?: unknown
  message?: unknown
  sync_time?: unknown
}

interface InvalidationPayload {
  id?: string
  prefixes?: string[]
  at?: number
}

interface RequestMetricOptions {
  source?: string
  start?: number
  stale?: boolean
  priority?: string
  error?: unknown
}

interface MaintenanceEventExtra {
  detail?: string
  phase?: string
  error?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return String(error ?? '')
}

const asApiPayload = (value: unknown): ApiPayload => (isRecord(value) ? value : {})

const DEFAULT_TTL = 5 * 60 * 1000
const LONG_TTL = 3 * 24 * 60 * 60 * 1000
const EXTRA_LONG_TTL = 7 * 24 * 60 * 60 * 1000
const SHORT_TTL = 30 * 1000 // 30秒，用于需要频繁更新的数据
const MAX_LOCAL_CACHE_ENTRIES = 220
const MAX_LOCAL_CACHE_VALUE_BYTES = 180 * 1024

const JWXT_MAINTENANCE_KEY = 'hbu_jwxt_maintenance'
const JWXT_MAINTENANCE_TIME_KEY = 'hbu_jwxt_maintenance_time'
const JWXT_MAINTENANCE_HINT_KEY = 'hbu_jwxt_maintenance_hint'
const JWXT_MAINTENANCE_EVENT = 'hbu-jwxt-maintenance'
// 连续失败达到该阈值才置位维护模式，避免单次抖动误报“教务维护”。
const MAINTENANCE_FAILURE_THRESHOLD = 2
// 失败计数滑动窗口：超过该时长未再失败则重新计数。
const MAINTENANCE_FAILURE_WINDOW_MS = 60 * 1000
// 维护模式置位后的后台刷新退避窗口：窗口内不再对后端发起静默请求，窗口外允许重试一次。
const MAINTENANCE_BACKOFF_MS = 60 * 1000
const JWXT_MAINTENANCE_FAIL_COUNT_KEY = 'hbu_jwxt_maintenance_fail_count'
const JWXT_MAINTENANCE_FAIL_TIME_KEY = 'hbu_jwxt_maintenance_fail_time'
// 缓存失效广播：同实例用 CustomEvent，跨实例（多标签页）用 localStorage storage 事件。
const CACHE_INVALIDATION_EVENT = 'hbu-cache-invalidation'
const CACHE_INVALIDATION_STORAGE_KEY = 'hbu_cache_invalidation_broadcast'

const JWXT_KEY_PREFIXES = [
  'schedule:',
  'grades:',
  'semesters',
  'classroom:',
  'exams:',
  'ranking:',
  'calendar:',
  'academic:',
  'training:',
  'studentinfo:',
  'student_info:',
  'student_login_access:'
]

const memoryCache = new Map<string, CacheEnvelope<unknown>>()

const isQuotaExceededError = (error: unknown): boolean => {
  const message = errorMessage(error).toLowerCase()
  return (
    message.includes('quota') ||
    message.includes('exceeded the quota') ||
    message.includes('domexception 22') ||
    message.includes('ns_error_dom_quota_reached')
  )
}

const shouldPersistToLocalStorage = (key: unknown, payloadText: string): boolean => {
  const text = String(key || '')
  // 空教室已由后端 SQLite 缓存，前端不再落 localStorage，避免配额被高频查询打满。
  if (text.startsWith('classroom:')) return false
  // 远程静态资源体积较大，但数量极少，允许单条缓存放宽到 2.5MB。
  if (text.startsWith('static_resource:')) {
    return payloadText.length <= 2.5 * 1024 * 1024
  }
  if (!payloadText) return true
  return payloadText.length <= MAX_LOCAL_CACHE_VALUE_BYTES
}

const shouldPersistTestAccountPayload = (key: unknown): boolean => {
  const text = String(key || '').trim()
  if (text === 'semesters') return false
  if (text.startsWith('classroom:')) return false
  return true
}

const collectCacheEntries = (): Array<{ storageKey: string; timestamp: number }> => {
  const entries: Array<{ storageKey: string; timestamp: number }> = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !storageKey.startsWith('cache:')) continue
    const raw = localStorage.getItem(storageKey)
    if (!raw) continue
    let timestamp = 0
    try {
      const parsed = JSON.parse(raw)
      timestamp = Number(parsed?.timestamp) || 0
    } catch {
      timestamp = 0
    }
    entries.push({ storageKey, timestamp })
  }
  entries.sort((a, b) => a.timestamp - b.timestamp)
  return entries
}

const trimLocalCacheStorage = (count = 24): void => {
  const entries = collectCacheEntries()
  if (!entries.length) return
  const removeCount = Math.min(count, entries.length)
  for (let i = 0; i < removeCount; i += 1) {
    const storageKey = entries[i].storageKey
    // 仅淘汰 cache: 前缀条目，会话键（hbu_session_cookies 等）不在此列。
    if (!storageKey.startsWith('cache:')) continue
    localStorage.removeItem(storageKey)
  }
}

const enforceLocalCacheCountLimit = (): void => {
  const entries = collectCacheEntries()
  const overflow = entries.length - MAX_LOCAL_CACHE_ENTRIES
  if (overflow <= 0) return
  trimLocalCacheStorage(overflow)
}

export function getCacheKey(key: unknown): string {
  return `cache:${key}`
}

// 仅清理本实例缓存（内存 + localStorage），不触发广播；广播统一走 broadcastCacheInvalidation。
const clearLocalCacheByPrefix = (prefix: unknown): void => {
  const pref = String(prefix || '')
  if (!pref) return
  for (const key of memoryCache.keys()) {
    if (key.startsWith(pref)) {
      memoryCache.delete(key)
    }
  }

  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && key.startsWith(`cache:${pref}`)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))
}

// —— 跨实例缓存失效广播 ——
// 同一源下的多标签页共享 localStorage：写入哨兵键会触发其他标签页的 storage 事件；
// 同实例内用 CustomEvent 通知。监听方只清理内存缓存、绝不回写存储，天然避免广播循环。
let invalidationListenerInstalled = false
const recentInvalidationIds = new Set<string>()
const MAX_RECENT_INVALIDATION_IDS = 64

const createInvalidationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const pruneRecentInvalidationIds = (): void => {
  while (recentInvalidationIds.size > MAX_RECENT_INVALIDATION_IDS) {
    const oldest = recentInvalidationIds.values().next().value
    if (oldest) recentInvalidationIds.delete(oldest)
  }
}

const applyInvalidationPayload = (payload: unknown): void => {
  if (!isRecord(payload)) return
  if (!payload || !Array.isArray(payload?.prefixes)) return
  const id = String(payload?.id || '')
  if (id) {
    // 同一广播（storage + CustomEvent 双通道）只处理一次，防止重复清理与事件循环。
    if (recentInvalidationIds.has(id)) return
    recentInvalidationIds.add(id)
    pruneRecentInvalidationIds()
  }
  for (const prefix of payload.prefixes) {
    if (typeof prefix !== 'string' || !prefix) continue
    clearLocalCacheByPrefix(prefix)
  }
}

const handleInvalidationStorageEvent = (event: StorageEvent): void => {
  if (!event || event.key !== CACHE_INVALIDATION_STORAGE_KEY) return
  try {
    applyInvalidationPayload(JSON.parse(event.newValue || 'null'))
  } catch {
    // 非法载荷直接忽略
  }
}

const ensureInvalidationListener = (): void => {
  if (invalidationListenerInstalled || typeof window === 'undefined') return
  invalidationListenerInstalled = true
  window.addEventListener('storage', handleInvalidationStorageEvent)
  window.addEventListener(CACHE_INVALIDATION_EVENT, (event: Event) => {
    applyInvalidationPayload((event as CustomEvent<InvalidationPayload>).detail)
  })
}

// 模块加载即监听跨实例失效广播，确保任何实例（即使从未主动清理过）都能收到其他标签页的清理事件。
ensureInvalidationListener()

const broadcastCacheInvalidation = (prefixes: readonly string[]): void => {
  ensureInvalidationListener()
  const uniquePrefixes = [...new Set(prefixes.map(String).filter(Boolean))]
  if (!uniquePrefixes.length) return
  const payload = { id: createInvalidationId(), prefixes: uniquePrefixes, at: Date.now() }
  try {
    // 跨实例广播：写哨兵键触发其他标签页的 storage 事件；本页面自身不会收到该事件。
    localStorage.setItem(CACHE_INVALIDATION_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 隐私模式等写入失败场景忽略广播。
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(CACHE_INVALIDATION_EVENT, { detail: payload }))
    } catch {
      // ignore
    }
  }
}

// 清除指定前缀的缓存（本地清理 + 跨实例广播）
export function clearCacheByPrefix(prefix: unknown): void {
  const pref = String(prefix || '')
  if (!pref) return
  clearLocalCacheByPrefix(pref)
  broadcastCacheInvalidation([pref])
}

/**
 * 清除指定学号的教务/课表等用户级缓存（退出登录时调用）。
 */
export function clearUserScopedCaches(studentId: unknown): void {
  const sid = String(studentId || '').trim()
  if (!sid) return

  const prefixes: string[] = []
  for (const prefix of JWXT_KEY_PREFIXES) {
    if (prefix === 'semesters') continue
    prefixes.push(`${prefix}${sid}`)
  }
  prefixes.push(`grade_teachers:${sid}`)
  prefixes.push(`training:options:${sid}`)
  prefixes.push(`training:jys:${sid}`)

  for (const prefix of prefixes) {
    clearLocalCacheByPrefix(prefix)
  }
  // 批量前缀一次性广播，避免逐条广播造成 storage 事件风暴。
  broadcastCacheInvalidation(prefixes)
}

export function getCachedData<T = unknown>(key: string, ttl = DEFAULT_TTL): CacheResult<T> | null {
  const now = Date.now()
  const inMemory = memoryCache.get(key) as CacheEnvelope<T> | undefined
  if (inMemory && now - inMemory.timestamp < ttl) {
    if (asApiPayload(inMemory.data).offline) {
      return null
    }
    return { data: inMemory.data, fromCache: true, timestamp: inMemory.timestamp }
  }

  const raw = localStorage.getItem(getCacheKey(key))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (parsed && now - parsed.timestamp < ttl) {
      if (asApiPayload(parsed.data).offline) {
        return null
      }
      memoryCache.set(key, parsed)
      return { data: parsed.data, fromCache: true, timestamp: parsed.timestamp }
    }
  } catch {
    return null
  }

  return null
}

const getAnyCachedEntry = <T = unknown>(key: string): CacheEnvelope<T> | null => {
  const inMemory = memoryCache.get(key) as CacheEnvelope<T> | undefined
  if (inMemory?.data) {
    return { data: inMemory.data, timestamp: Number(inMemory.timestamp) || Date.now() }
  }

  const raw = localStorage.getItem(getCacheKey(key))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (!parsed?.data) return null
    return { data: parsed.data, timestamp: Number(parsed.timestamp) || Date.now() }
  } catch {
    return null
  }
}

const isScheduleSemesterScopedKey = (key: unknown): boolean => {
  const text = String(key || '').trim()
  if (!text) return false
  return /^schedule:[^:]+:[^:]+$/.test(text)
}

const deriveFallbackPrefixes = (key: unknown): string[] => {
  const text = String(key || '').trim()
  if (!text) return []
  // 学期维度课表缓存禁止跨前缀回退，避免切换学期时被其他学期缓存污染。
  if (isScheduleSemesterScopedKey(text)) {
    return [text]
  }
  const prefixes = new Set<string>([text])

  const jsonIndex = text.indexOf(':{')
  if (jsonIndex > 0) {
    prefixes.add(text.slice(0, jsonIndex))
  }

  const parts = text.split(':')
  while (parts.length > 2) {
    parts.pop()
    prefixes.add(parts.join(':'))
  }

  return [...prefixes]
}

const getAnyCachedEntryByPrefix = <T = unknown>(prefix: unknown): CacheEnvelope<T> | null => {
  const pref = String(prefix || '').trim()
  if (!pref) return null
  let latest: CacheEnvelope<T> | null = null

  for (const [key, value] of memoryCache.entries()) {
    if (key === pref || key.startsWith(`${pref}:`)) {
      const timestamp = Number(value?.timestamp) || 0
      if (!latest || timestamp > latest.timestamp) {
        latest = {
          data: value?.data as T,
          timestamp: timestamp || Date.now()
        }
      }
    }
  }

  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !storageKey.startsWith('cache:')) continue

    const rawKey = storageKey.slice(6)
    if (!(rawKey === pref || rawKey.startsWith(`${pref}:`))) continue

    const raw = localStorage.getItem(storageKey)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as CacheEnvelope<T>
      if (!parsed?.data) continue
      const timestamp = Number(parsed.timestamp) || 0
      if (!latest || timestamp > latest.timestamp) {
        latest = {
          data: parsed.data,
          timestamp: timestamp || Date.now()
        }
      }
    } catch {
      // ignore parse error
    }
  }

  return latest
}

const getBestCachedEntry = <T = unknown>(key: string): CacheEnvelope<T> | null => {
  const exact = getAnyCachedEntry<T>(key)
  if (exact) return exact

  const prefixes = deriveFallbackPrefixes(key)
  for (const prefix of prefixes) {
    const hit = getAnyCachedEntryByPrefix<T>(prefix)
    if (hit) return hit
  }

  return null
}

export function getStaleCachedData<T = unknown>(key: string): CacheResult<T> | null {
  const stale = getBestCachedEntry<T>(key)
  if (!stale) return null
  return {
    data: withOfflineMeta(stale.data, stale.timestamp),
    fromCache: true,
    timestamp: stale.timestamp,
    stale: true
  }
}

const withOfflineMeta = <T>(data: T, timestamp: number): T => {
  if (!data || typeof data !== 'object') {
    return {
      success: true,
      data,
      offline: true,
      sync_time: new Date(timestamp).toISOString()
    } as unknown as T
  }
  const record = data as T & Record<string, unknown>
  return {
    ...record,
    offline: true,
    sync_time: record.sync_time || new Date(timestamp).toISOString()
  } as T
}

export function setCachedData<T>(key: string, data: T): void {
  const payload = { data, timestamp: Date.now() }
  memoryCache.set(key, payload)
  let payloadText = ''
  try {
    payloadText = JSON.stringify(payload)
  } catch {
    return
  }

  if (!shouldPersistToLocalStorage(key, payloadText)) {
    return
  }

  const storageKey = getCacheKey(key)
  try {
    localStorage.setItem(storageKey, payloadText)
    enforceLocalCacheCountLimit()
    return
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn('[Cache] localStorage set failed:', error)
      return
    }
  }

  // 第一次配额失败后尝试清理旧缓存再写一次，仍失败则仅保留内存缓存。
  try {
    trimLocalCacheStorage(40)
    localStorage.setItem(storageKey, payloadText)
    enforceLocalCacheCountLimit()
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn('[Cache] localStorage retry set failed:', error)
    }
  }
}

const isJwxtCacheKey = (key: unknown): boolean => {
  const text = String(key || '')
  return JWXT_KEY_PREFIXES.some((prefix) => text.startsWith(prefix))
}

// 网络/DNS/连接类错误：本地网络问题，≠ 学校维护（#587）
const looksLikeNetworkIssue = (message: unknown): boolean => {
  const text = String(message || '').toLowerCase()
  if (!text) return false
  return (
    text.includes('error sending request for url') ||
    text.includes('connection refused') ||
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network error') ||
    text.includes('dns') ||
    text.includes('econn') ||
    text.includes('network') ||
    text.includes('socket') ||
    text.includes('eof') ||
    text.includes('broken pipe')
  )
}

const looksLikeMaintenanceIssue = (message: unknown): boolean => {
  const text = String(message || '').toLowerCase()
  if (!text) return false
  // “无课表/假期”属于业务态，不应触发教务维护模式。
  const noScheduleHints = ['暂无可用课表', '暂无课表', '无课表', '假期', 'vacation', 'no schedule']
  if (noScheduleHints.some((hint) => text.includes(hint))) {
    return false
  }
  // #587：网络/DNS 错误 ≠ 学校维护（由 looksLikeNetworkIssue 单独识别），
  // 仅保留学校侧维护/不可用特征，避免断网/换代理时误报「教务系统正在维护」。
  return (
    text.includes('维护') ||
    text.includes('暂不可用') ||
    text.includes('无法连接') ||
    text.includes('连接失败')
  )
}

// 401/403 或会话失效类错误：不判维护、不回退缓存，直接交给上层处理登录态。
const isSessionInvalidError = (error: unknown): boolean => {
  const record = isRecord(error) ? error : {}
  const response = isRecord(record.response) ? record.response : {}
  const status = Number(response.status ?? record.status ?? record.statusCode ?? 0)
  if (status === 401 || status === 403) return true
  const text = errorMessage(error).toLowerCase()
  if (!text) return false
  if (/(^|\D)(401|403)(\D|$)/.test(text)) return true
  return /(未登录|登录((已)?过期|超时)|会话((已)?过期|超时|失效)|登录失效|凭证(失效|过期)|token.*(失效|过期|invalid)|session\s+(timed out|timeout|expired|invalid)|unauthorized|forbidden)/.test(
    text
  )
}

const emitMaintenanceEvent = (active: unknown, hint = '', extra: MaintenanceEventExtra = {}): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(JWXT_MAINTENANCE_EVENT, {
      detail: {
        active: !!active,
        hint: hint || '',
        detail: extra.detail || '',
        phase: extra.phase || (active ? 'maintenance' : 'idle'),
        error: extra.error || extra.detail || '',
        at: Date.now()
      }
    })
  )
}

// 读取当前连续失败计数（滑动窗口：超过窗口时长未再失败则视为重新计数）。
const readFailureState = (): number => {
  let count = 0
  let lastFailAt = 0
  try {
    count = Number(localStorage.getItem(JWXT_MAINTENANCE_FAIL_COUNT_KEY)) || 0
    lastFailAt = Number(localStorage.getItem(JWXT_MAINTENANCE_FAIL_TIME_KEY)) || 0
  } catch {
    // ignore
  }
  if (Date.now() - lastFailAt > MAINTENANCE_FAILURE_WINDOW_MS) count = 0
  return count
}

const persistFailureState = (count: number): void => {
  try {
    localStorage.setItem(JWXT_MAINTENANCE_FAIL_COUNT_KEY, String(count))
    localStorage.setItem(JWXT_MAINTENANCE_FAIL_TIME_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

// 记录一次教务请求失败：达到连续失败阈值才置位维护模式；返回是否已进入维护模式。
const recordJwxtFailure = (error: unknown, hint = ''): boolean => {
  // #587：网络/DNS 错误是本地网络问题，不置位「教务维护」横幅（缓存回退仍生效）
  if (looksLikeNetworkIssue(errorMessage(error))) return false
  const next = readFailureState() + 1
  persistFailureState(next)
  if (next >= MAINTENANCE_FAILURE_THRESHOLD) {
    setMaintenanceFlag(hint || String(errorMessage(error) || ''))
    return true
  }
  return false
}

// 维护模式退避：置位后 MAINTENANCE_BACKOFF_MS 内不再发起后台静默刷新，避免持续打后端。
const isMaintenanceBackoffActive = (): boolean => {
  try {
    if (localStorage.getItem(JWXT_MAINTENANCE_KEY) !== '1') return false
    const lastFailAt = Number(localStorage.getItem(JWXT_MAINTENANCE_FAIL_TIME_KEY)) || 0
    return Date.now() - lastFailAt < MAINTENANCE_BACKOFF_MS
  } catch {
    return false
  }
}

const setMaintenanceFlag = (hint = '', extra: MaintenanceEventExtra = {}): void => {
  try {
    localStorage.setItem(JWXT_MAINTENANCE_KEY, '1')
    localStorage.setItem(JWXT_MAINTENANCE_TIME_KEY, String(Date.now()))
    if (hint) {
      localStorage.setItem(JWXT_MAINTENANCE_HINT_KEY, hint)
    }
  } catch {
    // ignore
  }
  emitMaintenanceEvent(
    true,
    hint || '教务系统正在维护或暂不可用，当前展示缓存数据。',
    { phase: extra.phase || 'maintenance', detail: extra.detail || extra.error || '' }
  )
}

const clearMaintenanceFlag = (): void => {
  try {
    localStorage.removeItem(JWXT_MAINTENANCE_KEY)
    localStorage.removeItem(JWXT_MAINTENANCE_TIME_KEY)
    localStorage.removeItem(JWXT_MAINTENANCE_HINT_KEY)
    // 任意教务请求成功即清除维护状态，同时重置连续失败计数。
    localStorage.removeItem(JWXT_MAINTENANCE_FAIL_COUNT_KEY)
    localStorage.removeItem(JWXT_MAINTENANCE_FAIL_TIME_KEY)
  } catch {
    // ignore
  }
  emitMaintenanceEvent(false)
}

export { DEFAULT_TTL, LONG_TTL, EXTRA_LONG_TTL, SHORT_TTL }

export const DEFAULT_SWR_OPTIONS = {
  staleWhileRevalidate: true,
  priority: 'foreground'
}

const backgroundRefreshInflight = new Map<string, Promise<void>>()

const recordRequestMetric = (key: string, { source = 'unknown', start = Date.now(), stale = false, priority = 'foreground', error = '' }: RequestMetricOptions = {}): void => {
  try {
    pushDebugLog('Cache', `请求缓存指标 key=${key} source=${source}`, 'debug', {
      key: String(key || ''),
      source,
      duration_ms: Math.max(0, Date.now() - (Number(start) || Date.now())),
      stale: !!stale,
      priority: String(priority || 'foreground'),
      error: error ? String(error).slice(0, 160) : ''
    })
  } catch {
    // 调试日志不可影响业务请求。
  }
}

const refreshCacheInBackground = async <T extends ApiPayload>(key: string, fetcher: () => Promise<T>, priority: string): Promise<void> => {
  if (backgroundRefreshInflight.has(key)) {
    return backgroundRefreshInflight.get(key)
  }
  const task = (async () => {
    const start = Date.now()
    try {
      const data = await fetcher()
      if (data && data.success && !data.offline) {
        setCachedData(key, data)
        if (isJwxtCacheKey(key)) {
          clearMaintenanceFlag()
        }
        recordRequestMetric(key, { source: 'remote', start, priority })
      } else {
        recordRequestMetric(key, {
          source: 'remote',
          start,
          priority,
          error: asApiPayload(data).error || asApiPayload(data).msg || asApiPayload(data).message || 'unsuccessful-response'
        })
      }
    } catch (error) {
      recordRequestMetric(key, {
        source: 'remote',
        start,
        priority,
        error: errorMessage(error)
      })
    }
  })().finally(() => {
    backgroundRefreshInflight.delete(key)
  })
  backgroundRefreshInflight.set(key, task)
  return task
}

const cacheDebug = (message: unknown, detail?: unknown): void => {
  if (import.meta.env?.DEV) {
    console.log(message, detail ?? '')
  }
}

export async function fetchWithCache<T extends ApiPayload>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number | FetchWithCacheOptions = DEFAULT_TTL,
  options: FetchWithCacheOptions = {}
): Promise<CacheResult<T>> {
  cacheDebug('[Cache] Checking cache for key:', key)
  if (ttl && typeof ttl === 'object') {
    options = ttl
    ttl = DEFAULT_TTL
  }
  const requestOptions: FetchWithCacheOptions = options || {}
  const priority = requestOptions.priority || 'foreground'
  const staleWhileRevalidate = !!requestOptions.staleWhileRevalidate
  const forceRemote = !!requestOptions.forceRemote
  // 可选统一超时：requestOptions.timeoutMs > 0 时用 withTimeout 包装 fetcher，
  // 超时抛 TimeoutError（语义与 fetchWithTimeout 一致），随后走 stale 回退/维护模式兜底。
  // 未配置时保持原 fetcher 引用，兼容现有调用方签名与行为。
  const timeoutMs = Number(requestOptions.timeoutMs)
  const remoteFetcher: () => Promise<T> =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? withTimeout(fetcher, timeoutMs, `fetchWithCache:${key}`)
      : fetcher
  const testAccountPayload = isTestAccountSession()
    ? resolveTestAccountCachePayload(key)
    : null
  if (testAccountPayload) {
    if (shouldPersistTestAccountPayload(key)) {
      setCachedData(key, testAccountPayload)
    }
    recordRequestMetric(key, { source: 'test-account-cache', start: Date.now(), priority })
    return {
      data: testAccountPayload as T,
      fromCache: true,
      timestamp: Date.now(),
      demo: true
    }
  }
  const maintenanceMode = localStorage.getItem(JWXT_MAINTENANCE_KEY) === '1'
  const cached = forceRemote ? null : getCachedData<T>(key, Number(ttl))

  if (cached) {
    cacheDebug('[Cache] Cache HIT for key:', key)
    const data = maintenanceMode
      ? withOfflineMeta(cached.data, cached.timestamp)
      : cached.data
    recordRequestMetric(key, { source: 'memory-cache', start: Date.now(), priority })
    // maintenanceMode 粘滞修复：缓存命中且标志为 true 时，后台静默尝试请求后端，
    // 成功则 refreshCacheInBackground 内部会清除 maintenanceFlag 并更新缓存，
    // 避免标志永久粘滞导致每次都显示离线；退避窗口内跳过，防止持续打后端。
    if (maintenanceMode && !forceRemote && isJwxtCacheKey(key) && !isMaintenanceBackoffActive()) {
      refreshCacheInBackground(key, remoteFetcher, 'background').catch(() => {})
    }
    return { ...cached, data, fromCache: true }
  }

  if (!forceRemote && maintenanceMode) {
    const stale = getBestCachedEntry<T>(key)
    if (stale) {
      cacheDebug('[Cache] Maintenance mode stale HIT for key:', key)
      recordRequestMetric(key, { source: 'stale-cache', start: Date.now(), stale: true, priority })
      return {
        data: withOfflineMeta(stale.data, stale.timestamp),
        fromCache: true,
        timestamp: stale.timestamp,
        stale: true
      }
    }
  }

  if (staleWhileRevalidate) {
    const stale = getStaleCachedData<T>(key)
    if (stale) {
      cacheDebug('[Cache] Stale HIT for key:', key)
      recordRequestMetric(key, { source: 'stale-cache', start: Date.now(), stale: true, priority })
      // 维护退避窗口内跳过后台刷新，避免弱网/故障期持续打后端；窗口外允许重试一次。
      if (!isJwxtCacheKey(key) || !isMaintenanceBackoffActive()) {
        refreshCacheInBackground(key, remoteFetcher, 'background').catch(() => {})
      }
      return stale
    }
  }

  cacheDebug('[Cache] Cache MISS for key:', key)
  const remoteStart = Date.now()
  try {
    const data = await remoteFetcher()
    cacheDebug('[Cache] Fetched data for key:', `${key} success=${data?.success}`)

    if (data && data.success && !data.offline) {
      setCachedData(key, data)
      if (isJwxtCacheKey(key)) {
        clearMaintenanceFlag()
      }
      recordRequestMetric(key, { source: 'remote', start: remoteStart, priority })
      return { data, fromCache: false, timestamp: Date.now() }
    }

    // 离线回退数据（Rust 端网络失败时返回的缓存快照）：结构有效且带真实 sync_time，
    // 允许写入本地缓存（剥离 offline 标记），避免每次进入页面都重新请求并重复失败。
    if (data && data.success && data.offline && requestOptions.cacheOfflinePayload) {
      const { offline: _drop, ...cacheable } = data
      setCachedData(key, cacheable)
      recordRequestMetric(key, {
        source: 'remote-offline',
        start: remoteStart,
        priority,
        error: asApiPayload(data).error || asApiPayload(data).msg || asApiPayload(data).message || 'offline-payload'
      })
      return { data, fromCache: false, timestamp: Date.now() }
    }

    const stale = getBestCachedEntry<T>(key)
    const message = String(asApiPayload(data).error || asApiPayload(data).msg || asApiPayload(data).message || '')
    // 401/403/会话失效不判维护、不回退缓存，交由上层处理登录态。
    const sessionInvalid = isSessionInvalidError({ message })
    const shouldFallback =
      !!stale &&
      !sessionInvalid &&
      (
        maintenanceMode ||
        (
          isJwxtCacheKey(key) &&
          // 学校维护或网络异常均回退缓存展示（#587：网络错误不置维护横幅，但保留离线兜底）
          (looksLikeMaintenanceIssue(message) || looksLikeNetworkIssue(message))
        )
      )

    if (shouldFallback) {
      if (isJwxtCacheKey(key)) {
        // 连续失败达到阈值才置位维护模式。
        recordJwxtFailure(message, message)
      }
      recordRequestMetric(key, {
        source: 'stale-cache',
        start: remoteStart,
        stale: true,
        priority,
        error: message
      })
      return {
        data: withOfflineMeta(stale.data, stale.timestamp),
        fromCache: true,
        timestamp: stale.timestamp,
        stale: true
      }
    }

    recordRequestMetric(key, { source: 'remote', start: remoteStart, priority, error: message })
    return { data, fromCache: false, timestamp: Date.now() }
  } catch (error) {
    const stale = getBestCachedEntry<T>(key)
    // 401/403/会话失效不判维护、不回退缓存，交由上层处理登录态。
    const sessionInvalid = isSessionInvalidError(error)
    if (stale && !sessionInvalid) {
      console.warn('[Cache] Fetch failed, fallback to stale cache:', key, error)
      if (isJwxtCacheKey(key)) {
        // 连续失败达到阈值才置位维护模式。
        recordJwxtFailure(error, String(errorMessage(error) || ''))
      }
      recordRequestMetric(key, {
        source: 'stale-cache',
        start: remoteStart,
        stale: true,
        priority,
        error: errorMessage(error)
      })
      return {
        data: withOfflineMeta(stale.data, stale.timestamp),
        fromCache: true,
        timestamp: stale.timestamp,
        stale: true
      }
    }
    if (
      !sessionInvalid &&
      isJwxtCacheKey(key) &&
      looksLikeMaintenanceIssue(errorMessage(error))
    ) {
      recordJwxtFailure(error, String(errorMessage(error) || ''))
    }
    recordRequestMetric(key, {
      source: 'remote',
      start: remoteStart,
      priority,
      error: errorMessage(error)
    })
    throw error
  }
}
