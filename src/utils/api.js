const DEFAULT_TTL = 5 * 60 * 1000
const LONG_TTL = 3 * 24 * 60 * 60 * 1000
const EXTRA_LONG_TTL = 7 * 24 * 60 * 60 * 1000
const SHORT_TTL = 30 * 1000 // 30秒，用于需要频繁更新的数据

const memoryCache = new Map()

export function getCacheKey(key) {
  return `cache:${key}`
}

// 清除指定前缀的缓存
export function clearCacheByPrefix(prefix) {
  // 清除内存缓存
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key)
    }
  }
  // 清除 localStorage 缓存
  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(`cache:${prefix}`)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
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
  } catch (e) {
    return null
  }

  return null
}

export function setCachedData(key, data) {
  const payload = { data, timestamp: Date.now() }
  memoryCache.set(key, payload)
  localStorage.setItem(getCacheKey(key), JSON.stringify(payload))
}

export { DEFAULT_TTL, LONG_TTL, EXTRA_LONG_TTL, SHORT_TTL }

export async function fetchWithCache(key, fetcher, ttl = DEFAULT_TTL) {
  console.log('[Cache] Checking cache for key:', key)
  const cached = getCachedData(key, ttl)
  if (cached) {
    console.log('[Cache] Cache HIT for key:', key)
    return { ...cached, fromCache: true }
  }

  console.log('[Cache] Cache MISS for key:', key, '- fetching...')
  const data = await fetcher()
  console.log('[Cache] Fetched data for key:', key, '- success:', data?.success)
  if (data && data.success && !data.offline) {
    setCachedData(key, data)
  }

  return { data, fromCache: false, timestamp: Date.now() }
}
