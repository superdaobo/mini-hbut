const CACHE_PREFIX = 'hbu_forum_cache'
const DEFAULT_TTL_MS = 60_000

const toText = (value) => (value == null ? '' : String(value))

const encodePart = (value) => encodeURIComponent(toText(value).trim())

export const makeForumCacheKey = ({ studentId = 'guest', apiBase = '', scope = '' } = {}) =>
  `${CACHE_PREFIX}:${encodePart(studentId || 'guest')}:${encodePart(apiBase)}:${encodePart(scope)}`

const canUseStorage = () => typeof localStorage !== 'undefined'

const listStorageKeys = () => {
  if (!canUseStorage()) return []
  const keys = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key) keys.push(key)
  }
  return keys
}

export const createForumCache = ({
  studentId = 'guest',
  apiBase = '',
  now = () => Date.now()
} = {}) => {
  const context = {
    studentId: toText(studentId).trim() || 'guest',
    apiBase: toText(apiBase).trim(),
    now
  }

  const keyFor = (scope) => makeForumCacheKey({ ...context, scope })
  const prefixFor = (scopePrefix = '') => makeForumCacheKey({ ...context, scope: scopePrefix })

  return {
    keyFor,
    read(scope) {
      if (!canUseStorage()) return null
      try {
        const raw = localStorage.getItem(keyFor(scope))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return {
          value: parsed?.value,
          savedAt: Number(parsed?.savedAt || 0),
          expiresAt: Number(parsed?.expiresAt || 0),
          etag: toText(parsed?.etag || '')
        }
      } catch {
        return null
      }
    },
    write(scope, value, { ttlMs = DEFAULT_TTL_MS, etag = '' } = {}) {
      if (!canUseStorage()) return value
      const savedAt = Number(context.now())
      try {
        localStorage.setItem(keyFor(scope), JSON.stringify({
          value,
          savedAt,
          expiresAt: savedAt + Math.max(0, Number(ttlMs || DEFAULT_TTL_MS)),
          etag: toText(etag)
        }))
      } catch {
        // 本地缓存失败不影响主流程。
      }
      return value
    },
    remove(scope) {
      if (!canUseStorage()) return
      try {
        localStorage.removeItem(keyFor(scope))
      } catch {
        // ignore
      }
    },
    clear(scopePrefixes = ['']) {
      if (!canUseStorage()) return
      const prefixes = (Array.isArray(scopePrefixes) ? scopePrefixes : [scopePrefixes])
        .map((scope) => prefixFor(scope))
      for (const key of listStorageKeys()) {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
          try {
            localStorage.removeItem(key)
          } catch {
            // ignore
          }
        }
      }
    },
    isFresh(entry) {
      return !!entry && Number(entry.expiresAt || 0) > Number(context.now())
    }
  }
}

export const clearForumCache = (cache, scopePrefixes = ['']) => {
  cache?.clear?.(scopePrefixes)
}

export const withForumCache = async (cache, scope, fetcher, { ttlMs = DEFAULT_TTL_MS } = {}) => {
  const cached = cache?.read?.(scope)
  if (cache?.isFresh?.(cached)) {
    return cached.value
  }
  try {
    const payload = await fetcher({ etag: cached?.etag || '', cached })
    if (payload?.notModified && cached) {
      cache?.write?.(scope, cached.value, { ttlMs, etag: payload.etag || cached.etag || '' })
      return cached.value
    }
    const hasMeta = payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'value')
    const value = hasMeta ? payload.value : payload
    cache?.write?.(scope, value, { ttlMs, etag: hasMeta ? payload.etag || cached?.etag || '' : cached?.etag || '' })
    return value
  } catch (error) {
    if (cached) return cached.value
    throw error
  }
}

export const createForumPendingActions = ({ notify, onChange } = {}) => {
  const pending = new Set()
  const emitChange = () => onChange?.(new Set(pending))
  return {
    isPending(key) {
      return pending.has(toText(key))
    },
    async run(key, task, { duplicateMessage = '正在处理，请勿重复点击', duplicateType = 'info' } = {}) {
      const normalizedKey = toText(key)
      if (pending.has(normalizedKey)) {
        notify?.(duplicateMessage, duplicateType)
        return null
      }
      pending.add(normalizedKey)
      emitChange()
      try {
        return await task()
      } finally {
        pending.delete(normalizedKey)
        emitChange()
      }
    }
  }
}
