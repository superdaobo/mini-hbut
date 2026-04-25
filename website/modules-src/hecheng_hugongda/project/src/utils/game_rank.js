const DEFAULT_GAME_ID = 'hecheng_hugongda'
const DEFAULT_GAME_RANK_API = 'https://mini-hbut-testocr1.hf.space/api/game-rank'
const REQUEST_TIMEOUT_MS = 12000
const MODULE_CONTEXT_STORAGE_KEY = 'hbut_game_rank_context_v1'

const safeText = (value) => String(value ?? '').trim()

const safeParseJson = (raw, fallback = null) => {
  try {
    return JSON.parse(raw || '')
  } catch {
    return fallback
  }
}

const normalizeApiBase = (value) => {
  const text = safeText(value)
  if (!text) return DEFAULT_GAME_RANK_API
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/game-rank$/i.test(normalized)) return normalized
  if (/\/api$/i.test(normalized)) return `${normalized}/game-rank`
  return `${normalized}/api/game-rank`
}

const withTimeout = async (executor, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer = null
  try {
    if (controller) {
      timer = window.setTimeout(() => controller.abort(), timeoutMs)
    }
    return await executor(controller?.signal)
  } finally {
    if (timer) window.clearTimeout(timer)
  }
}

const requestJson = async (url, init = {}) => {
  const response = await withTimeout((signal) =>
    fetch(url, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {})
      }
    })
  )
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text || '{}')
  } catch {
    parsed = null
  }
  if (!response.ok) {
    throw new Error(safeText(parsed?.error || parsed?.message || text) || `HTTP ${response.status}`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('排行榜服务返回了无效响应')
  }
  if (parsed.success === false) {
    throw new Error(safeText(parsed.error || parsed.message) || '排行榜服务返回失败')
  }
  return parsed
}

const readStoredContext = () => {
  const stored = safeParseJson(localStorage.getItem(MODULE_CONTEXT_STORAGE_KEY), null)
  return stored && typeof stored === 'object' ? stored : {}
}

const writeStoredContext = (context) => {
  const next = context && typeof context === 'object' ? context : {}
  if (
    !safeText(next.studentId) &&
    !safeText(next.playerName) &&
    !safeText(next.className) &&
    !safeText(next.major)
  ) {
    return
  }
  // URL 参数优先，剩余字段落本地，避免重新进入模块时班级信息丢失。
  localStorage.setItem(
    MODULE_CONTEXT_STORAGE_KEY,
    JSON.stringify({
      gameId: safeText(next.gameId || DEFAULT_GAME_ID),
      studentId: safeText(next.studentId),
      playerName: safeText(next.playerName),
      className: safeText(next.className),
      schoolName: safeText(next.schoolName || '湖北工业大学'),
      major: safeText(next.major),
      runtime: safeText(next.runtime),
      appVersion: safeText(next.appVersion),
      from: safeText(next.from),
      rankApiBase: safeText(next.rankApiBase || DEFAULT_GAME_RANK_API)
    })
  )
}

const pickText = (...values) => {
  for (const value of values) {
    const text = safeText(value)
    if (text) return text
  }
  return ''
}

export const readGameModuleContext = () => {
  const params = new URLSearchParams(window.location.search || '')
  const stored = readStoredContext()
  const context = {
    gameId: pickText(params.get('game_id'), stored.gameId) || DEFAULT_GAME_ID,
    studentId: pickText(params.get('student_id'), stored.studentId),
    playerName: pickText(params.get('player_name'), stored.playerName),
    className: pickText(params.get('class_name'), stored.className),
    schoolName: pickText(params.get('school_name'), stored.schoolName) || '湖北工业大学',
    major: pickText(params.get('major'), stored.major),
    runtime: pickText(params.get('runtime'), stored.runtime) || 'module-web',
    appVersion: pickText(params.get('app_version'), stored.appVersion),
    from: pickText(params.get('from'), stored.from),
    rankApiBase: normalizeApiBase(pickText(params.get('rank_api'), stored.rankApiBase))
  }
  writeStoredContext(context)
  return context
}

export const canUseGameRank = (context) => {
  const profile = context && typeof context === 'object' ? context : {}
  return !!safeText(profile.studentId) && !!normalizeApiBase(profile.rankApiBase)
}

export const submitGameRank = async (context, payload = {}) => {
  const profile = context && typeof context === 'object' ? context : readGameModuleContext()
  const body = {
    game_id: safeText(payload.gameId || profile.gameId || DEFAULT_GAME_ID),
    run_id: safeText(payload.runId),
    student_id: safeText(profile.studentId),
    player_name: safeText(payload.playerName || profile.playerName || profile.studentId),
    class_name: safeText(payload.className || profile.className),
    school_name: safeText(payload.schoolName || profile.schoolName || '湖北工业大学'),
    major: safeText(payload.major || profile.major),
    score: Number(payload.score || 0) || 0,
    max_level: Number(payload.maxLevel || 0) || 0,
    duration_ms: Number(payload.durationMs || 0) || 0,
    move_count: Number(payload.moveCount || 0) || 0,
    ended_reason: safeText(payload.endedReason || 'finished'),
    client_version: safeText(payload.clientVersion || profile.appVersion),
    platform: safeText(payload.platform || navigator.platform),
    runtime: safeText(payload.runtime || profile.runtime),
    payload: payload.extra && typeof payload.extra === 'object' ? payload.extra : {}
  }
  return requestJson(`${normalizeApiBase(profile.rankApiBase)}/submit`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export const fetchGameLeaderboard = async (context, options = {}) => {
  const profile = context && typeof context === 'object' ? context : readGameModuleContext()
  const scope = safeText(options.scope || 'class') || 'class'
  const query = new URLSearchParams({
    game_id: safeText(options.gameId || profile.gameId || DEFAULT_GAME_ID),
    scope,
    limit: String(Number(options.limit || 20) || 20)
  })
  const studentId = safeText(options.studentId || profile.studentId)
  const className = safeText(options.className || profile.className)
  const schoolName = safeText(options.schoolName || profile.schoolName)
  if (studentId) query.set('student_id', studentId)
  if (className) query.set('class_name', className)
  if (schoolName) query.set('school_name', schoolName)
  return requestJson(`${normalizeApiBase(profile.rankApiBase)}/leaderboard?${query.toString()}`)
}

export const createRunId = () => {
  const random = Math.random().toString(36).slice(2, 10)
  return `run_${Date.now()}_${random}`
}

export const resolveRankApiBase = normalizeApiBase
