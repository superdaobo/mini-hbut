const DEFAULT_GAME_ID = 'hecheng_hugongda'
const DEFAULT_GAME_RANK_API = 'https://mini-hbut-testocr1.hf.space/api/game-rank'
const REQUEST_TIMEOUT_MS = 12000

const safeText = (value) => String(value ?? '').trim()

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

export const readGameModuleContext = () => {
  const params = new URLSearchParams(window.location.search || '')
  return {
    gameId: safeText(params.get('game_id')) || DEFAULT_GAME_ID,
    studentId: safeText(params.get('student_id')),
    playerName: safeText(params.get('player_name')),
    className: safeText(params.get('class_name')),
    schoolName: safeText(params.get('school_name')) || '湖北工业大学',
    major: safeText(params.get('major')),
    runtime: safeText(params.get('runtime')) || 'module-web',
    appVersion: safeText(params.get('app_version')),
    from: safeText(params.get('from')),
    rankApiBase: normalizeApiBase(params.get('rank_api'))
  }
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
