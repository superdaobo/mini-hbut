const DEFAULT_FORUM_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/forum'
const TOKEN_CACHE_KEY_PREFIX = 'hbu_forum_token:'
const PROFILE_CACHE_KEY_PREFIX = 'hbu_forum_profile:'

const toText = (value) => (value == null ? '' : String(value))

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

const readCachedToken = (studentId) => {
  if (!studentId || typeof localStorage === 'undefined') return ''
  try {
    const raw = localStorage.getItem(`${TOKEN_CACHE_KEY_PREFIX}${studentId}`)
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    if (!parsed?.token) return ''
    if (Number(parsed.expires_at || 0) * 1000 < Date.now() + 30 * 1000) return ''
    return parsed.token
  } catch {
    return ''
  }
}

const writeCachedToken = (studentId, payload) => {
  if (!studentId || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${TOKEN_CACHE_KEY_PREFIX}${studentId}`, JSON.stringify(payload || {}))
  } catch {
    // ignore
  }
}

const clearCachedToken = (studentId) => {
  if (!studentId || typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(`${TOKEN_CACHE_KEY_PREFIX}${studentId}`)
  } catch {
    // ignore
  }
}

export const readForumProfile = (studentId) => {
  const sid = toText(studentId).trim()
  if (!sid || typeof localStorage === 'undefined') {
    return { nickname: sid, avatar_url: '', bio: '' }
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PROFILE_CACHE_KEY_PREFIX}${sid}`) || '{}')
    return {
      nickname: toText(parsed.nickname || sid).trim() || sid,
      avatar_url: toText(parsed.avatar_url || parsed.avatarUrl || '').trim(),
      bio: toText(parsed.bio || '').trim()
    }
  } catch {
    return { nickname: sid, avatar_url: '', bio: '' }
  }
}

export const writeForumProfile = (studentId, profile = {}) => {
  const sid = toText(studentId).trim()
  const normalized = {
    nickname: toText(profile.nickname || sid).trim() || sid,
    avatar_url: toText(profile.avatar_url || profile.avatarUrl || '').trim(),
    bio: toText(profile.bio || '').trim()
  }
  if (!sid || typeof localStorage === 'undefined') return normalized
  try {
    localStorage.setItem(`${PROFILE_CACHE_KEY_PREFIX}${sid}`, JSON.stringify(normalized))
    localStorage.removeItem(`${TOKEN_CACHE_KEY_PREFIX}${sid}`)
  } catch {
    // ignore
  }
  return normalized
}

const parseJsonResponse = async (response) => {
  if (response.status === 304) return { notModified: true }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.detail || data?.message || data?.error || `HTTP ${response.status}`
    throw new Error(message)
  }
  return data
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
  fetcher = fetch
} = {}) => {
  const base = normalizeForumEndpoint(apiBase || DEFAULT_FORUM_ENDPOINT)
  const sid = toText(studentId).trim()
  let tokenPromise = null
  let memoryToken = ''

  const request = async (path, { method = 'GET', body, auth = false, headers = {} } = {}) => {
    const createHeaders = async (forceTokenRefresh = false) => {
      const reqHeaders = { Accept: 'application/json', ...headers }
      if (body !== undefined && !(body instanceof FormData)) {
        reqHeaders['Content-Type'] = 'application/json'
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
      clearCachedToken(sid)
      response = await fetchRequest(true)
    }
    return parseJsonResponse(response)
  }

  const getToken = async (forceRefresh = false) => {
    if (!forceRefresh && memoryToken) return memoryToken
    if (!forceRefresh) {
      const cached = readCachedToken(sid)
      if (cached) {
        memoryToken = cached
        return cached
      }
    }
    if (forceRefresh) {
      memoryToken = ''
      clearCachedToken(sid)
    }
    if (tokenPromise) return tokenPromise
    tokenPromise = request('/auth/token', {
      method: 'POST',
      body: {
        student_id: sid,
        nickname: nickname || sid,
        avatar_url: avatarUrl,
        bio
      },
      auth: false
      })
      .then((payload) => {
        writeCachedToken(sid, payload)
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
    listCategories: () => request('/categories'),
    createCategory: (payload) => request('/categories', { method: 'POST', body: payload, auth: true }),
    listThreads: (params = {}) => {
      return request(appendQuery('/threads', {
        category_id: params.categoryId || params.category_id,
        limit: params.limit
      }))
    },
    listHotThreads: (limit = 20) => request(`/threads/hot?limit=${encodeURIComponent(String(limit))}`),
    searchThreads: (params = {}) => request(appendQuery('/search', {
      q: params.q || params.query,
      category_id: params.categoryId || params.category_id,
      limit: params.limit
    })),
    getThread: (threadId) => request(`/threads/${encodeURIComponent(String(threadId))}`),
    createThread: (payload) => request('/threads', { method: 'POST', body: payload, auth: true }),
    createReply: (threadId, payload) =>
      request(`/threads/${encodeURIComponent(String(threadId))}/replies`, { method: 'POST', body: payload, auth: true }),
    reactToPost: (postId, reaction) =>
      request(`/posts/${encodeURIComponent(String(postId))}/reactions`, { method: 'POST', body: { reaction }, auth: true }),
    scoreThread: (threadId, score) =>
      request(`/threads/${encodeURIComponent(String(threadId))}/scores`, { method: 'POST', body: { score }, auth: true }),
    bookmarkThread: (threadId, active = true) =>
      request(`/threads/${encodeURIComponent(String(threadId))}/bookmark`, { method: 'POST', body: { active }, auth: true }),
    getMeSummary: () => request('/me/summary', { auth: true }),
    listMyThreads: (limit) => request(appendQuery('/me/threads', { limit }), { auth: true }),
    listMyReplies: (limit) => request(appendQuery('/me/replies', { limit }), { auth: true }),
    listMyBookmarks: (limit) => request(appendQuery('/me/bookmarks', { limit }), { auth: true }),
    getUserProfile: (studentId) => request(`/users/${encodeURIComponent(String(studentId))}`),
    followUser: (targetStudentId, active = true) =>
      request('/follows', { method: 'POST', body: { target_student_id: targetStudentId, active }, auth: true }),
    reportContent: (payload) => request('/reports', { method: 'POST', body: payload, auth: true }),
    listNotifications: () => request('/notifications', { auth: true }),
    listMessages: () => request('/messages', { auth: true }),
    sendMessage: (payload) => request('/messages', { method: 'POST', body: payload, auth: true }),
    checkIn: () => request('/checkins', { method: 'POST', auth: true }),
    listBadges: () => request('/badges', { auth: true }),
    listAdminReports: (limit = 50) => request(appendQuery('/admin/reports', { limit }), { auth: true }),
    listAdminUsers: (query = '', limit) => request(appendQuery('/admin/users', { query, limit }), { auth: true }),
    listAdminBackups: (limit = 20) => request(appendQuery('/admin/backups', { limit }), { auth: true }),
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
