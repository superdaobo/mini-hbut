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
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.detail || data?.message || data?.error || `HTTP ${response.status}`
    throw new Error(message)
  }
  return data
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

  const request = async (path, { method = 'GET', body, auth = false, headers = {} } = {}) => {
    const reqHeaders = { Accept: 'application/json', ...headers }
    if (body !== undefined && !(body instanceof FormData)) {
      reqHeaders['Content-Type'] = 'application/json'
    }
    if (auth) {
      reqHeaders.Authorization = `Bearer ${await getToken()}`
    }
    const response = await fetcher(`${base}${path}`, {
      method,
      headers: reqHeaders,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
    })
    return parseJsonResponse(response)
  }

  const getToken = async () => {
    const cached = readCachedToken(sid)
    if (cached) return cached
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
      const query = new URLSearchParams()
      if (params.categoryId) query.set('category_id', String(params.categoryId))
      if (params.limit) query.set('limit', String(params.limit))
      const suffix = query.toString() ? `?${query.toString()}` : ''
      return request(`/threads${suffix}`)
    },
    listHotThreads: (limit = 20) => request(`/threads/hot?limit=${encodeURIComponent(String(limit))}`),
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
    followUser: (targetStudentId, active = true) =>
      request('/follows', { method: 'POST', body: { target_student_id: targetStudentId, active }, auth: true }),
    reportContent: (payload) => request('/reports', { method: 'POST', body: payload, auth: true }),
    listNotifications: () => request('/notifications', { auth: true }),
    listMessages: () => request('/messages', { auth: true }),
    sendMessage: (payload) => request('/messages', { method: 'POST', body: payload, auth: true }),
    checkIn: () => request('/checkins', { method: 'POST', auth: true }),
    listBadges: () => request('/badges', { auth: true }),
    uploadAttachment: (file) => {
      const form = new FormData()
      form.append('file', file)
      return request('/attachments', { method: 'POST', body: form, auth: true })
    }
  }
}
