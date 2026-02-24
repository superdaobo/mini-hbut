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
  'student_info:',
  'student_login_access:'
]

const memoryCache = new Map()

const isQuotaExceededError = (error) => {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('quota') ||
    message.includes('exceeded the quota') ||
    message.includes('domexception 22') ||
    message.includes('ns_error_dom_quota_reached')
  )
}

const shouldPersistToLocalStorage = (key, payloadText) => {
  const text = String(key || '')
  // 空教室已由后端 SQLite 缓存，前端不再落 localStorage，避免配额被高频查询打满。
  if (text.startsWith('classroom:')) return false
  if (!payloadText) return true
  return payloadText.length <= MAX_LOCAL_CACHE_VALUE_BYTES
}

const collectCacheEntries = () => {
  const entries = []
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

const trimLocalCacheStorage = (count = 24) => {
  const entries = collectCacheEntries()
  if (!entries.length) return
  const removeCount = Math.min(count, entries.length)
  for (let i = 0; i < removeCount; i += 1) {
    localStorage.removeItem(entries[i].storageKey)
  }
}

const enforceLocalCacheCountLimit = () => {
  const entries = collectCacheEntries()
  const overflow = entries.length - MAX_LOCAL_CACHE_ENTRIES
  if (overflow <= 0) return
  trimLocalCacheStorage(overflow)
}

export function getCacheKey(key) {
  return `cache:${key}`
}

// 清除指定前缀的缓存
export function clearCacheByPrefix(prefix) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key)
    }
  }

  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && key.startsWith(`cache:${prefix}`)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))
}

export function getCachedData(key, ttl = DEFAULT_TTL) {
  const now = Date.now()
  const inMemory = memoryCache.get(key)
  if (inMemory && now - inMemory.timestamp < ttl) {
    if (inMemory.data?.offline) {
      return null
    }
    return { data: inMemory.data, fromCache: true, timestamp: inMemory.timestamp }
  }

  const raw = localStorage.getItem(getCacheKey(key))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed && now - parsed.timestamp < ttl) {
      if (parsed.data?.offline) {
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

const getAnyCachedEntry = (key) => {
  const inMemory = memoryCache.get(key)
  if (inMemory?.data) {
    return { data: inMemory.data, timestamp: Number(inMemory.timestamp) || Date.now() }
  }

  const raw = localStorage.getItem(getCacheKey(key))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.data) return null
    return { data: parsed.data, timestamp: Number(parsed.timestamp) || Date.now() }
  } catch {
    return null
  }
}

const isScheduleSemesterScopedKey = (key) => {
  const text = String(key || '').trim()
  if (!text) return false
  return /^schedule:[^:]+:[^:]+$/.test(text)
}

const deriveFallbackPrefixes = (key) => {
  const text = String(key || '').trim()
  if (!text) return []
  // 学期维度课表缓存禁止跨前缀回退，避免切换学期时被其他学期缓存污染。
  if (isScheduleSemesterScopedKey(text)) {
    return [text]
  }
  const prefixes = new Set([text])

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

const getAnyCachedEntryByPrefix = (prefix) => {
  const pref = String(prefix || '').trim()
  if (!pref) return null
  let latest = null

  for (const [key, value] of memoryCache.entries()) {
    if (key === pref || key.startsWith(`${pref}:`)) {
      const timestamp = Number(value?.timestamp) || 0
      if (!latest || timestamp > latest.timestamp) {
        latest = {
          data: value?.data,
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
      const parsed = JSON.parse(raw)
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

const getBestCachedEntry = (key) => {
  const exact = getAnyCachedEntry(key)
  if (exact) return exact

  const prefixes = deriveFallbackPrefixes(key)
  for (const prefix of prefixes) {
    const hit = getAnyCachedEntryByPrefix(prefix)
    if (hit) return hit
  }

  return null
}

const withOfflineMeta = (data, timestamp) => {
  if (!data || typeof data !== 'object') {
    return {
      success: true,
      data,
      offline: true,
      sync_time: new Date(timestamp).toISOString()
    }
  }
  return {
    ...data,
    offline: true,
    sync_time: data.sync_time || new Date(timestamp).toISOString()
  }
}

export function setCachedData(key, data) {
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

const isJwxtCacheKey = (key) => {
  const text = String(key || '')
  return JWXT_KEY_PREFIXES.some((prefix) => text.startsWith(prefix))
}

const looksLikeMaintenanceIssue = (message) => {
  const text = String(message || '').toLowerCase()
  if (!text) return false
  // “无课表/假期”属于业务态，不应触发教务维护模式。
  const noScheduleHints = ['暂无可用课表', '暂无课表', '无课表', '假期', 'vacation', 'no schedule']
  if (noScheduleHints.some((hint) => text.includes(hint))) {
    return false
  }
  return (
    text.includes('error sending request for url') ||
    text.includes('connection refused') ||
    text.includes('timed out') ||
    text.includes('dns') ||
    text.includes('econn') ||
    text.includes('network') ||
    text.includes('维护') ||
    text.includes('暂不可用') ||
    text.includes('无法连接') ||
    text.includes('连接失败')
  )
}

const emitMaintenanceEvent = (active, hint = '') => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(JWXT_MAINTENANCE_EVENT, {
      detail: {
        active: !!active,
        hint: hint || '',
        at: Date.now()
      }
    })
  )
}

const setMaintenanceFlag = (hint = '') => {
  try {
    localStorage.setItem(JWXT_MAINTENANCE_KEY, '1')
    localStorage.setItem(JWXT_MAINTENANCE_TIME_KEY, String(Date.now()))
    if (hint) {
      localStorage.setItem(JWXT_MAINTENANCE_HINT_KEY, hint)
    }
  } catch {
    // ignore
  }
  emitMaintenanceEvent(true, hint || '教务系统正在维护或暂不可用，当前展示缓存数据。')
}

export { DEFAULT_TTL, LONG_TTL, EXTRA_LONG_TTL, SHORT_TTL }

export async function fetchWithCache(key, fetcher, ttl = DEFAULT_TTL) {
  console.log('[Cache] Checking cache for key:', key)
  const maintenanceMode = localStorage.getItem(JWXT_MAINTENANCE_KEY) === '1'
  const cached = getCachedData(key, ttl)

  if (cached) {
    console.log('[Cache] Cache HIT for key:', key)
    const data = maintenanceMode
      ? withOfflineMeta(cached.data, cached.timestamp)
      : cached.data
    return { ...cached, data, fromCache: true }
  }

  if (maintenanceMode) {
    const stale = getBestCachedEntry(key)
    if (stale) {
      console.log('[Cache] Maintenance mode stale HIT for key:', key)
      return {
        data: withOfflineMeta(stale.data, stale.timestamp),
        fromCache: true,
        timestamp: stale.timestamp,
        stale: true
      }
    }
  }

  console.log('[Cache] Cache MISS for key:', key, '- fetching...')
  try {
    const data = await fetcher()
    console.log('[Cache] Fetched data for key:', key, '- success:', data?.success)

    if (data && data.success && !data.offline) {
      setCachedData(key, data)
      return { data, fromCache: false, timestamp: Date.now() }
    }

    const stale = getBestCachedEntry(key)
    const message = String(data?.error || data?.msg || data?.message || '')
    const shouldFallback =
      !!stale &&
      (
        maintenanceMode ||
        (
          isJwxtCacheKey(key) &&
          looksLikeMaintenanceIssue(message)
        )
      )

    if (shouldFallback) {
      if (isJwxtCacheKey(key)) {
        setMaintenanceFlag(message)
      }
      return {
        data: withOfflineMeta(stale.data, stale.timestamp),
        fromCache: true,
        timestamp: stale.timestamp,
        stale: true
      }
    }

    return { data, fromCache: false, timestamp: Date.now() }
  } catch (error) {
    const stale = getBestCachedEntry(key)
    if (stale) {
      console.warn('[Cache] Fetch failed, fallback to stale cache:', key, error)
      if (isJwxtCacheKey(key)) {
        setMaintenanceFlag(String(error?.message || error || ''))
      }
      return {
        data: withOfflineMeta(stale.data, stale.timestamp),
        fromCache: true,
        timestamp: stale.timestamp,
        stale: true
      }
    }
    if (isJwxtCacheKey(key) && looksLikeMaintenanceIssue(error?.message || error)) {
      setMaintenanceFlag(String(error?.message || error || ''))
    }
    throw error
  }
}
