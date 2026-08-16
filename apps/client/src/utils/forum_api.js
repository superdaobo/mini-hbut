import { isTestAccountSession } from './test_account.js'
import { resolveTestAccountForumResponse } from './test_account_fixtures.js'
import { encryptData, decryptData } from './encryption.js'
import { getIdentityAccessToken } from './identity_access_token.js'

const DEFAULT_FORUM_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/forum'
const TOKEN_CACHE_KEY_PREFIX = 'hbu_forum_token:'
const PROFILE_CACHE_KEY_PREFIX = 'hbu_forum_profile:'
const ADMIN_SECRET_CACHE_KEY_PREFIX = 'hbu_forum_admin_secret:'

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

// #629 Phase C：token 不再落 localStorage 明文。
// - 读取路径完全移除（历史明文缓存不会再次被信任）；
// - 仅保留“清理历史明文”的写入路径：遇到旧版遗留的 token 条目时直接删除，
//   避免明文凭据在本地存储中继续残留（与旧 admin_secret 清理策略一致）。
const purgeLegacyTokenCache = (studentId, apiBase = '') => {
  if (!studentId || typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(tokenCacheKey(studentId, apiBase))
    const tokenPrefix = `${TOKEN_CACHE_KEY_PREFIX}${encodeCachePart(studentId)}:`
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(tokenPrefix)) {
        localStorage.removeItem(key)
      }
    }
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
    const storageKey = `${PROFILE_CACHE_KEY_PREFIX}${sid}`
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}')
    const normalized = {
      nickname: toText(parsed.nickname || sid).trim() || sid,
      avatar_url: toText(parsed.avatar_url || parsed.avatarUrl || '').trim(),
      bio: toText(parsed.bio || '').trim()
    }
    // 旧版本曾把 admin_secret 明文写入 profile。读取时立即重写为无口令结构，
    // 不尝试迁移旧明文，避免它在 localStorage 中继续残留。
    if (Object.prototype.hasOwnProperty.call(parsed, 'admin_secret')) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(normalized))
      } catch {
        // 存储不可写时仍返回已净化的内存对象；绝不把旧明文回传给调用方。
      }
    }
    return {
      ...normalized,
      // 管理员口令改由 loadForumAdminSecret 读取；该存储仅降低静态泄露风险，并非 XSS 安全边界。
      admin_secret: ''
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
    bio: toText(profile.bio || '').trim()
    // 不落明文 admin_secret：请使用 saveForumAdminSecret 加密保存
  }
  if (!sid || typeof localStorage === 'undefined') return normalized
  try {
    localStorage.setItem(`${PROFILE_CACHE_KEY_PREFIX}${sid}`, JSON.stringify(normalized))
    // 清理历史明文 token 缓存（#629：token 只驻留内存，不再持久化）
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

/**
 * 管理员口令加密持久化（设备本地密钥 AES-CBC，见 encryption.js）。
 * 空值清除密文；加密失败时宁可不落盘，也绝不回退明文。
 *
 * 安全边界说明：设备密钥与密文同存于 localStorage，本机制只降低静态
 * 备份/扫描泄露风险，不是 XSS 安全边界（页面内脚本仍可同时读取两者）。
 */
export const saveForumAdminSecret = async (studentId, secret) => {
  const sid = toText(studentId).trim()
  if (!sid || typeof localStorage === 'undefined') return
  const key = `${ADMIN_SECRET_CACHE_KEY_PREFIX}${encodeCachePart(sid)}`
  const value = toText(secret).trim()
  try {
    if (!value) {
      localStorage.removeItem(key)
      return
    }
    const encrypted = await encryptData({ admin_secret: value })
    localStorage.setItem(key, encrypted)
  } catch {
    // 加密失败不落盘：绝不回退明文（该存储仅降低静态泄露风险，非 XSS 安全边界）
  }
}

/** 读取加密存储的管理员口令；无密文或解密失败返回空串。 */
export const loadForumAdminSecret = async (studentId) => {
  const sid = toText(studentId).trim()
  if (!sid || typeof localStorage === 'undefined') return ''
  const key = `${ADMIN_SECRET_CACHE_KEY_PREFIX}${encodeCachePart(sid)}`
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return ''
    const decrypted = await decryptData(raw)
    return toText(decrypted?.admin_secret || '').trim()
  } catch {
    return ''
  }
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
      // #629：401 统一单次 refresh（identity 优先，失败回退 legacy 重取），不无限循环
      memoryToken = ''
      purgeLegacyTokenCache(sid, base)
      response = await fetchRequest(true)
    }
    return parseJsonResponse(response, { includeMeta, requestEtag: etag })
  }

  const getToken = async (forceRefresh = false) => {
    if (!forceRefresh && memoryToken) return memoryToken
    // #629 Phase C：first-party Identity access token 优先（内存/session 层，不落 localStorage）
    const identityToken = await getIdentityAccessToken(forceRefresh)
    if (identityToken) {
      memoryToken = identityToken
      return identityToken
    }
    // 双轨灰度：无 identity token 时回退 legacy（服务端 LEGACY_GRACE 期内兼容）
    if (forceRefresh) {
      memoryToken = ''
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
        // token 只驻留内存：不再写入 localStorage（#629 安全要求）
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
