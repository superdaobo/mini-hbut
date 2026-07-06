import { isTestAccountSession } from './test_account.js'
import { resolveTestAccountForumResponse } from './test_account_fixtures.js'

const DEFAULT_FORUM_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/forum'
const TOKEN_CACHE_KEY_PREFIX = 'hbu_forum_token:'
const PROFILE_CACHE_KEY_PREFIX = 'hbu_forum_profile:'

const toText = (value) => (value == null ? '' : String(value))
const encodeCachePart = (value) => encodeURIComponent(toText(value).trim())

export const normalizeForumEndpoint = (value) => {
  const text = toText(value).trim()
  if (!text) return DEFAULT_FORUM_ENDPOINT
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/forum$/i.test(normalized)) {
    return normalized
  }
  return `${normalized}/api/forum`
}

export const buildForumApiBase = (forumConfig = {}) => {
  if (forumConfig?.enabled === false) return ''
  return normalizeForumEndpoint(
    forumConfig?.api_base ||
      forumConfig?.apiBase ||
      forumConfig?.endpoint ||
      DEFAULT_FORUM_ENDPOINT
  )
}

const tokenCacheKey = (studentId, apiBase = '') => `${TOKEN_CACHE_KEY_PREFIX}${encodeCachePart(studentId)}:${encodeCachePart(apiBase)}`

const readCachedToken = (studentId, apiBase = '') => {
  if (!studentId || typeof localStorage === 'undefined') return ''
  try {
    const raw = localStorage.getItem(tokenCacheKey(studentId, apiBase))
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    if (!parsed?.token) return ''
    if (Number(parsed.expires_at || 0) * 1000 < Date.now() + 30 * 1000) return ''
    return parsed.token
  } catch {
    return ''
  }
}

const writeCachedToken = (studentId, apiBase, payload) => {
  if (!studentId || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(tokenCacheKey(studentId, apiBase), JSON.stringify(payload || {}))
  } catch {
    // ignore
  }
}

const clearCachedToken = (studentId, apiBase = '') => {
  if (!studentId || typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(tokenCacheKey(studentId, apiBase))
  } catch {
    // ignore
  }
}

export const readForumProfile = (studentId) => {
  const sid = toText(studentId).trim()
  if (!sid || typeof localStorage === 'undefined') {
    return { nickname: sid, avatar_url: '', bio: '', admin_secret: '' }
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PROFILE_CACHE_KEY_PREFIX}${sid}`) || '{}')
    return {
      nickname: toText(parsed.nickname || sid).trim() || sid,
      avatar_url: toText(parsed.avatar_url || parsed.avatarUrl || '').trim(),
      bio: toText(parsed.bio || '').trim(),
      admin_secret: toText(parsed.admin_secret || parsed.adminSecret || '').trim()
    }
  } catch {
    return { nickname: sid, avatar_url: '', bio: '', admin_secret: '' }
  }
}

export const writeForumProfile = (studentId, profile = {}) => {
  const sid = toText(studentId).trim()
  const normalized = {
    nickname: toText(profile.nickname || sid).trim() || sid,
    avatar_url: toText(profile.avatar_url || profile.avatarUrl || '').trim(),
    bio: toText(profile.bio || '').trim(),
    admin_secret: toText(profile.admin_secret || profile.adminSecret || '').trim()
  }
  if (!sid || typeof localStorage === 'undefined') return normalized
  try {
    localStorage.setItem(`${PROFILE_CACHE_KEY_PREFIX}${sid}`, JSON.stringify(normalized))
    const tokenPrefix = `${TOKEN_CACHE_KEY_PREFIX}${encodeCachePart(sid)}:`
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(tokenPrefix) || key === `${TOKEN_CACHE_KEY_PREFIX}${sid}`) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
  return normalized
}

const responseHeader = (response, name) => {
  try {
    return response?.headers?.get?.(name) || ''
  } catch {
    return ''
  }
}

const parseJsonResponse = async (response, { includeMeta = false, requestEtag = '' } = {}) => {
  const etag = responseHeader(response, 'ETag') || requestEtag || ''
  if (response.status === 304) {
    return includeMeta ? { value: undefined, etag, notModified: true } : { notModified: true }
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.detail || data?.message || data?.error || `HTTP ${response.status}`
    throw new Error(message)
  }
  return includeMeta ? { value: data, etag, notModified: false } : data
}

const appendQuery = (path, params = {}) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export const createForumApiClient = ({
  apiBase,
  studentId = '',
  nickname = '',
  avatarUrl = '',
  bio = '',
  adminSecret = '',
  fetcher = fetch
} = {}) => {
  const base = normalizeForumEndpoint(apiBase || DEFAULT_FORUM_ENDPOINT)
  const sid = toText(studentId).trim()
  let tokenPromise = null
  let memoryToken = ''

  const request = async (path, { method = 'GET', body, auth = false, headers = {}, etag = '', includeMeta = false } = {}) => {
    if (isTestAccountSession()) {
      const payload = resolveTestAccountForumResponse(path, {
        method,
        body,
        auth,
        headers,
        etag,
        studentId: sid
      })
      return includeMeta
        ? { value: payload, etag: 'test-account-forum', notModified: false }
        : payload
    }

    const createHeaders = async (forceTokenRefresh = false) => {
      const reqHeaders = { Accept: 'application/json', ...headers }
      if (body !== undefined && !(body instanceof FormData)) {
        reqHeaders['Content-Type'] = 'application/json'
      }
      if (etag) {
        reqHeaders['If-None-Match'] = etag
      }
      if (auth) {
        reqHeaders.Authorization = `Bearer ${await getToken(forceTokenRefresh)}`
      }
      return reqHeaders
    }
    const createBody = () => (body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body))
    const fetchRequest = async (forceTokenRefresh = false) => fetcher(`${base}${path}`, {
      method,
      headers: await createHeaders(forceTokenRefresh),
      body: createBody()
    })
    let response = await fetchRequest()
    if (auth && response.status === 401) {
      memoryToken = ''
      clearCachedToken(sid, base)
      response = await fetchRequest(true)
    }
    return parseJsonResponse(response, { includeMeta, requestEtag: etag })
  }

  const getToken = async (forceRefresh = false) => {
    if (!forceRefresh && memoryToken) return memoryToken
    if (!forceRefresh) {
      const cached = readCachedToken(sid, base)
      if (cached) {
        memoryToken = cached
        return cached
      }
    }
    if (forceRefresh) {
      memoryToken = ''
      clearCachedToken(sid, base)
    }
    if (tokenPromise) return tokenPromise
    tokenPromise = request('/auth/token', {
      method: 'POST',
      body: {
        student_id: sid,
        nickname: nickname || sid,
        avatar_url: avatarUrl,
        bio,
        admin_secret: adminSecret
      },
      auth: false
      })
      .then((payload) => {
        writeCachedToken(sid, base, payload)
        memoryToken = payload.token
        return payload.token
      })
      .finally(() => {
        tokenPromise = null
      })
    return tokenPromise
  }

  return {
    apiBase: base,
    getToken,
    listCategories: (_params = {}, options = {}) => request('/categories', options),
    createCategory: (payload) => request('/categories', { method: 'POST', body: payload, auth: true }),
    listThreads: (params = {}, options = {}) => {
      return request(appendQuery('/threads', {
        category_id: params.categoryId || params.category_id,
        limit: params.limit,
        offset: params.offset
      }), options)
    },
    listHotThreads: (limit = 20, options = {}) => request(`/threads/hot?limit=${encodeURIComponent(String(limit))}`, options),
    searchThreads: (params = {}, options = {}) => request(appendQuery('/search', {
      q: params.q || params.query,
      category_id: params.categoryId || params.category_id,
      limit: params.limit,
      offset: params.offset
    }), options),
    getThread: (threadId, options = {}) => request(`/threads/${encodeURIComponent(String(threadId))}`, options),
    createThread: (payload) => request('/threads', { method: 'POST', body: payload, auth: true }),
    createReply: (threadId, payload) =>
      request(`/threads/${encodeURIComponent(String(threadId))}/replies`, { method: 'POST', body: payload, auth: true }),
    reactToPost: (postId, reaction) =>
      request(`/posts/${encodeURIComponent(String(postId))}/reactions`, { method: 'POST', body: { reaction }, auth: true }),
    bookmarkThread: (threadId, active = true) =>
      request(`/threads/${encodeURIComponent(String(threadId))}/bookmark`, { method: 'POST', body: { active }, auth: true }),
    listPolls: (params = {}, options = {}) =>
      request(appendQuery('/polls', { limit: params.limit, offset: params.offset }), { ...options, auth: true }),
    createPoll: (payload) => request('/admin/polls', { method: 'POST', body: payload, auth: true }),
    votePoll: (pollId, optionId) =>
      request(`/polls/${encodeURIComponent(String(pollId))}/votes`, { method: 'POST', body: { option_id: optionId }, auth: true }),
    closePoll: (pollId) => request(`/admin/polls/${encodeURIComponent(String(pollId))}/close`, { method: 'POST', auth: true }),
    getMeSummary: (options = {}) => request('/me/summary', { ...options, auth: true }),
    listMyThreads: (params = {}, options = {}) => {
      const normalized = typeof params === 'number' ? { limit: params } : params
      return request(appendQuery('/me/threads', { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true })
    },
    listMyReplies: (params = {}, options = {}) => {
      const normalized = typeof params === 'number' ? { limit: params } : params
      return request(appendQuery('/me/replies', { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true })
    },
    listMyBookmarks: (params = {}, options = {}) => {
      const normalized = typeof params === 'number' ? { limit: params } : params
      return request(appendQuery('/me/bookmarks', { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true })
    },
    getUserProfile: (studentId, options = {}) => request(`/users/${encodeURIComponent(String(studentId))}`, options),
    followUser: (targetStudentId, active = true) =>
      request('/follows', { method: 'POST', body: { target_student_id: targetStudentId, active }, auth: true }),
    reportContent: (payload) => request('/reports', { method: 'POST', body: payload, auth: true }),
    listNotifications: (params = {}, options = {}) =>
      request(appendQuery('/notifications', { limit: params.limit, offset: params.offset }), { ...options, auth: true }),
    listMessages: (params = {}, options = {}) =>
      request(appendQuery('/messages', { limit: params.limit, offset: params.offset }), { ...options, auth: true }),
    sendMessage: (payload) => request('/messages', { method: 'POST', body: payload, auth: true }),
    checkIn: () => request('/checkins', { method: 'POST', auth: true }),
    listBadges: (options = {}) => request('/badges', { ...options, auth: true }),
    listBackups: (params = {}, options = {}) => request(appendQuery('/backups', { limit: params.limit, offset: params.offset }), options),
    listAdminReports: (params = 50, options = {}) => {
      const normalized = typeof params === 'number' ? { limit: params } : params
      return request(appendQuery('/admin/reports', { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true })
    },
    listAdminUsers: (params = '', optionsOrLimit, maybeOptions = {}) => {
      const normalized = typeof params === 'object'
        ? params
        : { query: params, limit: optionsOrLimit }
      const options = typeof params === 'object' ? optionsOrLimit || {} : maybeOptions
      return request(appendQuery('/admin/users', { query: normalized.query, limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true })
    },
    listAdminBackups: (params = 20, options = {}) => {
      const normalized = typeof params === 'number' ? { limit: params } : params
      return request(appendQuery('/admin/backups', { limit: normalized.limit, offset: normalized.offset }), { ...options, auth: true })
    },
    runBackup: () => request('/admin/backups/run', { method: 'POST', auth: true }),
    setUserBan: (payload) => request('/admin/bans', { method: 'POST', body: payload, auth: true }),
    grantBadge: (payload) => request('/admin/badges', { method: 'POST', body: payload, auth: true }),
    getAttachmentUrl: (attachmentIdOrUrl) => {
      const value = toText(attachmentIdOrUrl).trim()
      if (!value) return ''
      if (/^https?:\/\//i.test(value)) return value
      const normalized = value.startsWith('/api/forum/attachments/')
        ? value.replace(/^\/api\/forum/i, '')
        : `/attachments/${encodeURIComponent(value)}`
      return `${base}${normalized}`
    },
    uploadAttachment: (file) => {
      const form = new FormData()
      form.append('file', file)
      return request('/attachments', { method: 'POST', body: form, auth: true })
    }
  }
}
