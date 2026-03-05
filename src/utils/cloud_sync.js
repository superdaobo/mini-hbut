import axios from 'axios'
import { DEFAULT_CLOUD_SYNC_ENDPOINT, applyAppSettingsSnapshot, useAppSettings } from './app_settings'
import { applyUiSettingsSnapshot } from './ui_settings'
import { applyFontSettingsSnapshot } from './font_settings'
import { normalizeSemesterList } from './semester'
import { pushDebugLog } from './debug_logger'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const REMOTE_CONFIG_SNAPSHOT_KEY = 'hbu_remote_config_snapshot'
const CLOUD_SYNC_DEVICE_ID_KEY = 'hbu_cloud_sync_device_id'
const CLOUD_SYNC_LAST_SUCCESS_PREFIX = 'hbu_cloud_sync_last_success:'
const CLOUD_SYNC_BOOTSTRAP_PREFIX = 'hbu_cloud_sync_bootstrap_done:'
const DEFAULT_TIMEOUT_MS = 12000
const DEFAULT_COOLDOWN_SEC = 180
const DEFAULT_SECRET_REF = 'kv1-main'
const SYNC_SCHEMA_VERSION = 2
const STUDENT_ID_RE = /^\d{10}$/
const CHALLENGE_SKEW_MS = 3000
const CHALLENGE_FALLBACK_TTL_MS = 60 * 1000
const challengeState = {
  token: '',
  expiresAt: 0,
  endpoint: ''
}

const safeParseJson = (raw, fallback = null) => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const toSafeText = (value) => String(value || '').trim()
const isValidStudentId = (value) => STUDENT_ID_RE.test(toSafeText(value))

const normalizeProxyEndpoint = (value) => {
  const text = toSafeText(value)
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/cloud-sync$/i.test(normalized)) return normalized
  return `${normalized}/api/cloud-sync`
}

const clampNumber = (value, min, max, fallback) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

const makeStudentKey = (prefix, studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) return ''
  return `${prefix}${sid}`
}

const pruneValue = (value) => {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? text : undefined
  }
  if (Array.isArray(value)) {
    const arr = value.map(pruneValue).filter((item) => item !== undefined)
    return arr.length ? arr : undefined
  }
  if (typeof value === 'object') {
    const next = {}
    Object.entries(value).forEach(([k, v]) => {
      const normalized = pruneValue(v)
      if (normalized !== undefined) {
        next[k] = normalized
      }
    })
    return Object.keys(next).length ? next : undefined
  }
  return value
}

const normalizeCloudCourse = (raw) => {
  const weeks = Array.isArray(raw?.weeks)
    ? raw.weeks
      .map((w) => Number(w))
      .filter((w) => Number.isFinite(w) && w > 0)
    : []
  const weekday = Number(raw?.weekday || 0)
  const period = Number(raw?.period || 0)
  const djs = Number(raw?.djs || 0)
  const name = toSafeText(raw?.name)
  if (!name || !weekday || !period || !djs || !weeks.length) return null
  return {
    name,
    teacher: toSafeText(raw?.teacher),
    room: toSafeText(raw?.room || raw?.room_code),
    weekday,
    period,
    djs,
    weeks
  }
}

const readRemoteCloudSync = () => {
  const snapshot = safeParseJson(localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY), {})
  const cfg = snapshot?.cloud_sync || {}
  return {
    enabled: cfg?.enabled !== false,
    mode: toSafeText(cfg?.mode || snapshot?.cloud_sync_mode || 'proxy') || 'proxy',
    proxyEndpoint: normalizeProxyEndpoint(
      cfg?.proxy_endpoint ||
      cfg?.proxyEndpoint ||
      cfg?.endpoint ||
      snapshot?.cloud_sync_proxy_endpoint ||
      snapshot?.cloud_sync_endpoint
    ),
    secretRef: toSafeText(
      cfg?.secret_ref ||
      cfg?.secretRef ||
      snapshot?.cloud_sync_secret_ref ||
      DEFAULT_SECRET_REF
    ),
    timeoutMs: clampNumber(cfg?.timeout_ms || cfg?.timeoutMs, 3000, 45000, DEFAULT_TIMEOUT_MS),
    cooldownSec: clampNumber(
      cfg?.cooldown_seconds || cfg?.cooldownSeconds,
      30,
      3600,
      DEFAULT_COOLDOWN_SEC
    )
  }
}

export const getCloudSyncRuntimeConfig = () => {
  const backend = useAppSettings()?.backend || {}
  const moduleParams = backend?.moduleParams || {}
  const remote = readRemoteCloudSync()
  const useRemoteConfig = backend?.useRemoteConfig !== false
  const localEndpoint = normalizeProxyEndpoint(backend?.cloudSyncEndpoint)
  const localSecretRef = toSafeText(backend?.cloudSyncSecretRef)
  const defaultEndpoint = normalizeProxyEndpoint(DEFAULT_CLOUD_SYNC_ENDPOINT)

  const proxyEndpoint = useRemoteConfig
    ? (localEndpoint || remote.proxyEndpoint || defaultEndpoint)
    : (localEndpoint || defaultEndpoint)

  const secretRef = useRemoteConfig
    ? (localSecretRef || remote.secretRef || DEFAULT_SECRET_REF)
    : (localSecretRef || DEFAULT_SECRET_REF)

  const cooldownSec = clampNumber(
    moduleParams?.cloudSyncCooldownSec || remote.cooldownSec,
    30,
    3600,
    DEFAULT_COOLDOWN_SEC
  )
  const timeoutMs = clampNumber(
    moduleParams?.requestTimeoutMs || remote.timeoutMs,
    3000,
    45000,
    DEFAULT_TIMEOUT_MS
  )
  const enabled = Boolean(proxyEndpoint) && (useRemoteConfig ? (remote.enabled || !!localEndpoint) : true)

  return {
    enabled,
    mode: 'proxy',
    endpoint: proxyEndpoint,
    proxyEndpoint,
    secretRef,
    cooldownSec,
    timeoutMs,
    useRemoteConfig
  }
}

const ensureDeviceId = () => {
  let id = toSafeText(localStorage.getItem(CLOUD_SYNC_DEVICE_ID_KEY))
  if (id) return id
  try {
    id = (crypto?.randomUUID?.() || '').trim()
  } catch {
    id = ''
  }
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
  localStorage.setItem(CLOUD_SYNC_DEVICE_ID_KEY, id)
  return id
}

const getLastSuccessTs = (studentId) => {
  const key = makeStudentKey(CLOUD_SYNC_LAST_SUCCESS_PREFIX, studentId)
  if (!key) return 0
  return Number(localStorage.getItem(key) || 0) || 0
}

const setLastSuccessTs = (studentId, ts = Date.now()) => {
  const key = makeStudentKey(CLOUD_SYNC_LAST_SUCCESS_PREFIX, studentId)
  if (!key) return
  localStorage.setItem(key, String(ts))
}

export const getCloudSyncCooldownState = (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { blocked: true, remainingMs: 0, cooldownMs: 0, reason: 'missing-student' }
  }
  if (!isValidStudentId(sid)) {
    return { blocked: true, remainingMs: 0, cooldownMs: 0, reason: 'invalid-student' }
  }
  const cfg = getCloudSyncRuntimeConfig()
  const cooldownMs = Math.max(0, Number(cfg.cooldownSec || 0) * 1000)
  const lastTs = getLastSuccessTs(sid)
  const remainingMs = Math.max(0, cooldownMs - (Date.now() - lastTs))
  return {
    blocked: remainingMs > 0,
    remainingMs,
    cooldownMs
  }
}

const discoverSemestersFromCache = (studentId) => {
  const sid = toSafeText(studentId)
  const semesters = new Set()
  if (!sid) return []
  const pattern = new RegExp(`^cache:schedule:${sid}:(.+)$`)
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    const match = key.match(pattern)
    if (!match) continue
    const semester = toSafeText(match[1])
    if (semester) semesters.add(semester)
  }
  const scheduleMeta = safeParseJson(localStorage.getItem('hbu_schedule_meta'), {})
  const metaSemester = toSafeText(scheduleMeta?.semester)
  if (metaSemester) semesters.add(metaSemester)
  return normalizeSemesterList([...semesters])
}

const fetchSemestersForSync = async (studentId) => {
  const local = discoverSemestersFromCache(studentId)
  try {
    const res = await axios.get(`${API_BASE}/v2/semesters`)
    const remote = normalizeSemesterList(res?.data?.semesters || [])
    if (!remote.length) return local
    const merged = new Set([...local, ...remote])
    return normalizeSemesterList([...merged])
  } catch {
    return local
  }
}

const fetchAllCustomCourses = async (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) return {}
  const semesters = await fetchSemestersForSync(sid)
  const output = {}
  for (const semester of semesters) {
    try {
      const res = await axios.post(`${API_BASE}/v2/schedule/custom/list`, {
        student_id: sid,
        semester
      })
      if (!res?.data?.success) continue
      const list = Array.isArray(res.data?.data) ? res.data.data : []
      const normalized = list.map(normalizeCloudCourse).filter(Boolean)
      if (normalized.length > 0) {
        output[semester] = normalized
      }
    } catch {
      // ignore single-semester errors
    }
  }
  return output
}

const extractDataArray = (value) => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const readLatestCacheObject = (prefix) => {
  const pref = toSafeText(prefix)
  if (!pref) return null
  let latest = null
  let latestTs = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !storageKey.startsWith('cache:')) continue
    const cacheKey = storageKey.slice('cache:'.length)
    if (!(cacheKey === pref || cacheKey.startsWith(`${pref}:`))) continue
    const parsed = safeParseJson(localStorage.getItem(storageKey), null)
    if (!parsed || typeof parsed !== 'object') continue
    const ts = Number(parsed?.timestamp || 0)
    if (ts >= latestTs) {
      latestTs = ts
      latest = parsed?.data || null
    }
  }
  return latest
}

const buildAcademicSnapshot = (studentId, latestGrades = []) => {
  const sid = toSafeText(studentId)
  const grades = Array.isArray(latestGrades) && latestGrades.length > 0
    ? latestGrades
    : extractDataArray(readLatestCacheObject(`grades:${sid}`))
  const ranking = extractDataArray(readLatestCacheObject(`ranking:${sid}`))
  const scheduleMeta = safeParseJson(localStorage.getItem('hbu_schedule_meta'), {})
  return {
    grades,
    ranking,
    schedule_meta: scheduleMeta && typeof scheduleMeta === 'object' ? scheduleMeta : {}
  }
}

const buildSyncPayload = async (studentId, options = {}) => {
  const sid = toSafeText(studentId)
  const settingsSnapshot = pruneValue({
    app: safeParseJson(localStorage.getItem('hbu_app_settings_v1'), {}),
    ui: safeParseJson(localStorage.getItem('hbu_ui_settings_v2'), {}),
    font: safeParseJson(localStorage.getItem('hbu_font_settings_v1'), {}),
    login: {
      mode: toSafeText(localStorage.getItem('hbu_login_entry_mode')),
      method: toSafeText(localStorage.getItem('hbu_login_method')),
      remember: toSafeText(localStorage.getItem('hbu_remember'))
    }
  }) || {}
  const bySemester = await fetchAllCustomCourses(sid)
  const courses = pruneValue({ by_semester: bySemester }) || { by_semester: {} }
  const academic = pruneValue(buildAcademicSnapshot(sid, options?.latestGrades)) || {}
  const deviceId = ensureDeviceId()
  return {
    v: SYNC_SCHEMA_VERSION,
    sid,
    ts: Date.now(),
    did: deviceId,
    settings: settingsSnapshot,
    courses,
    academic
  }
}

const primeAcademicCaches = async (studentId, seedGrades = []) => {
  const sid = toSafeText(studentId)
  let grades = Array.isArray(seedGrades) ? seedGrades : []
  if (!sid) return grades
  try {
    if (!grades.length) {
      const gradeRes = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid })
      if (gradeRes?.data?.success && Array.isArray(gradeRes?.data?.data)) {
        grades = gradeRes.data.data
      }
    }
  } catch {
    // ignore
  }
  try {
    await axios.post(`${API_BASE}/v2/schedule/query`, { student_id: sid })
  } catch {
    // ignore
  }
  try {
    await axios.post(`${API_BASE}/v2/ranking`, { student_id: sid, semester: '' })
  } catch {
    // ignore
  }
  return grades
}

const shouldAttachChallenge = (path) => {
  const normalized = toSafeText(path).toLowerCase()
  return normalized.startsWith('/upload') || normalized.startsWith('/download')
}

const canReuseChallenge = (config) => {
  const endpoint = toSafeText(config?.proxyEndpoint || config?.endpoint)
  if (!endpoint) return false
  if (challengeState.endpoint !== endpoint) return false
  if (!challengeState.token) return false
  return challengeState.expiresAt > Date.now() + CHALLENGE_SKEW_MS
}

const loadCloudSyncChallenge = async (config, force = false) => {
  if (!force && canReuseChallenge(config)) {
    return challengeState.token
  }
  const secretRef = toSafeText(config?.secretRef) || DEFAULT_SECRET_REF
  const query = new URLSearchParams({ secret_ref: secretRef }).toString()
  const res = await requestCloudSync(`/ping?${query}`, {
    method: 'GET',
    config,
    skipChallenge: true,
    allowRetry: false
  })
  const token = toSafeText(res?.challenge)
  if (!token) {
    throw new Error('云同步鉴权挑战获取失败')
  }
  const ttlSec = Number(res?.challenge_expires_in || 0)
  const ttlMs = Number.isFinite(ttlSec) && ttlSec > 0
    ? Math.max(10_000, Math.round(ttlSec * 1000))
    : CHALLENGE_FALLBACK_TTL_MS
  challengeState.token = token
  challengeState.endpoint = toSafeText(config?.proxyEndpoint || config?.endpoint)
  challengeState.expiresAt = Date.now() + ttlMs
  return token
}

const requestCloudSync = async (
  path,
  { method = 'GET', body, config, skipChallenge = false, allowRetry = true } = {}
) => {
  const endpoint = toSafeText(config?.proxyEndpoint || config?.endpoint)
  if (!endpoint) {
    throw new Error('云同步中转地址未配置')
  }
  const url = `${endpoint.replace(/\/+$/, '')}${path}`
  const timeoutMs = Math.max(3000, Number(config?.timeoutMs || DEFAULT_TIMEOUT_MS))
  const makeController = () => (typeof AbortController !== 'undefined' ? new AbortController() : null)

  const sendOnce = async (challengeToken = '') => {
    const controller = makeController()
    const timer = window.setTimeout(() => {
      controller?.abort?.()
    }, timeoutMs)
    try {
      const headers = {
        Accept: 'application/json'
      }
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
      }
      if (challengeToken) {
        headers['x-cloud-sync-challenge'] = challengeToken
      }
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller?.signal
      })
      const text = await response.text()
      const parsed = safeParseJson(text, null)
      return { response, parsed, text }
    } finally {
      window.clearTimeout(timer)
    }
  }

  let challengeToken = ''
  if (!skipChallenge && shouldAttachChallenge(path)) {
    challengeToken = await loadCloudSyncChallenge(config, false)
  }

  let { response, parsed, text } = await sendOnce(challengeToken)
  if (
    !response.ok &&
    allowRetry &&
    !skipChallenge &&
    shouldAttachChallenge(path) &&
    response.status === 401
  ) {
    challengeState.token = ''
    challengeState.expiresAt = 0
    challengeToken = await loadCloudSyncChallenge(config, true)
    ;({ response, parsed, text } = await sendOnce(challengeToken))
  }

  if (!response.ok) {
    const errText = toSafeText(parsed?.error || parsed?.message || text || `HTTP ${response.status}`)
    const error = new Error(errText || `HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('云同步服务返回了无效响应')
  }
  if (parsed.success === false) {
    throw new Error(toSafeText(parsed.error || parsed.message) || '云同步服务返回失败')
  }
  return parsed
}

const mergeCustomCourseSemesters = (customCourses) => {
  if (!customCourses || typeof customCourses !== 'object' || Array.isArray(customCourses)) {
    return {}
  }
  const output = {}
  for (const [semester, list] of Object.entries(customCourses)) {
    const sem = toSafeText(semester)
    if (!sem || !Array.isArray(list)) continue
    const normalized = list.map(normalizeCloudCourse).filter(Boolean)
    if (normalized.length > 0) {
      output[sem] = normalized
    }
  }
  return output
}

const replaceCustomCourses = async (studentId, bySemester) => {
  const sid = toSafeText(studentId)
  if (!sid) return { deleted: 0, added: 0, semesters: 0 }
  const nextMap = mergeCustomCourseSemesters(bySemester)
  const remoteSemesters = Object.keys(nextMap)
  const localSemesters = await fetchSemestersForSync(sid)
  const semesters = normalizeSemesterList([...new Set([...remoteSemesters, ...localSemesters])])

  let deleted = 0
  let added = 0
  for (const semester of semesters) {
    let existing = []
    try {
      const listRes = await axios.post(`${API_BASE}/v2/schedule/custom/list`, {
        student_id: sid,
        semester
      })
      if (listRes?.data?.success) {
        existing = Array.isArray(listRes.data?.data) ? listRes.data.data : []
      }
    } catch {
      existing = []
    }

    for (const item of existing) {
      const sourceId = toSafeText(item?.source_id || item?.id)
      if (!sourceId) continue
      try {
        const delRes = await axios.post(`${API_BASE}/v2/schedule/custom/delete`, {
          student_id: sid,
          semester,
          course_id: sourceId,
          mode: 'all'
        })
        if (delRes?.data?.success) {
          deleted += 1
        }
      } catch {
        // ignore single delete error
      }
    }

    const nextCourses = Array.isArray(nextMap[semester]) ? nextMap[semester] : []
    for (const item of nextCourses) {
      try {
        const addRes = await axios.post(`${API_BASE}/v2/schedule/custom/add`, {
          student_id: sid,
          semester,
          name: item.name,
          teacher: item.teacher || '',
          room: item.room || '',
          weekday: item.weekday,
          period: item.period,
          djs: item.djs,
          weeks: item.weeks
        })
        if (addRes?.data?.success) {
          added += 1
        }
      } catch {
        // ignore single add error
      }
    }
  }

  return {
    deleted,
    added,
    semesters: semesters.length
  }
}

const applySettingsFromCloud = async (settings) => {
  const payload = settings && typeof settings === 'object' ? settings : {}
  const appSettingsRaw = payload?.app
  const uiSettingsRaw = payload?.ui
  const fontSettingsRaw = payload?.font
  if (appSettingsRaw && typeof appSettingsRaw === 'object') {
    applyAppSettingsSnapshot(appSettingsRaw)
  }
  if (uiSettingsRaw && typeof uiSettingsRaw === 'object') {
    applyUiSettingsSnapshot(uiSettingsRaw)
  }
  if (fontSettingsRaw && typeof fontSettingsRaw === 'object') {
    await applyFontSettingsSnapshot(fontSettingsRaw)
  }
  return {
    app: !!appSettingsRaw,
    ui: !!uiSettingsRaw,
    font: !!fontSettingsRaw
  }
}

const extractCloudData = (response) => {
  if (!response || typeof response !== 'object') return null
  if (response?.data && typeof response.data === 'object') return response.data
  return response
}

export const runCloudSyncUpload = async ({
  studentId,
  reason = 'manual',
  force = false,
  latestGrades = []
} = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { success: false, error: '学号为空，无法上传云同步' }
  }
  if (!isValidStudentId(sid)) {
    return { success: false, error: '云同步仅支持 10 位学号账号' }
  }
  const cfg = getCloudSyncRuntimeConfig()
  if (!cfg.enabled) {
    return { success: false, error: '云同步未启用或未配置服务地址' }
  }

  if (!force) {
    const cooldown = getCloudSyncCooldownState(sid)
    if (cooldown.blocked) {
      return {
        success: false,
        cooldown: true,
        remainingMs: cooldown.remainingMs,
        error: '同步冷却中'
      }
    }
  }

  pushDebugLog('CloudSync', `开始上传 student=${sid} reason=${reason}`, 'info')
  const payload = await buildSyncPayload(sid, { latestGrades })
  const body = {
    student_id: sid,
    device_id: ensureDeviceId(),
    reason: toSafeText(reason) || 'manual',
    payload,
    client_time: Date.now(),
    secret_ref: cfg.secretRef
  }
  const response = await requestCloudSync('/upload', {
    method: 'POST',
    body,
    config: cfg
  })
  setLastSuccessTs(sid)
  pushDebugLog('CloudSync', `上传成功 student=${sid}`, 'info')
  return {
    success: true,
    response,
    uploadedAt: Date.now()
  }
}

export const runCloudSyncDownload = async ({
  studentId,
  reason = 'manual',
  force = false,
  applySettings = true,
  applyCustomCourses = true
} = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { success: false, error: '学号为空，无法下载云同步' }
  }
  if (!isValidStudentId(sid)) {
    return { success: false, error: '云同步仅支持 10 位学号账号' }
  }
  const cfg = getCloudSyncRuntimeConfig()
  if (!cfg.enabled) {
    return { success: false, error: '云同步未启用或未配置服务地址' }
  }

  if (!force) {
    const cooldown = getCloudSyncCooldownState(sid)
    if (cooldown.blocked) {
      return {
        success: false,
        cooldown: true,
        remainingMs: cooldown.remainingMs,
        error: '同步冷却中'
      }
    }
  }

  pushDebugLog('CloudSync', `开始下载 student=${sid} reason=${reason}`, 'info')
  const query = new URLSearchParams({
    student_id: sid,
    reason: toSafeText(reason) || 'manual',
    device_id: ensureDeviceId(),
    secret_ref: cfg.secretRef
  }).toString()
  const response = await requestCloudSync(`/download?${query}`, {
    method: 'GET',
    config: cfg
  })
  const data = extractCloudData(response)
  if (!data) {
    setLastSuccessTs(sid)
    const bootstrapKey = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, sid)
    if (bootstrapKey) {
      localStorage.setItem(bootstrapKey, String(Date.now()))
    }
    pushDebugLog('CloudSync', `下载成功但云端为空 student=${sid}`, 'info')
    return {
      success: true,
      empty: true,
      response
    }
  }

  let settingResult = { app: false, ui: false, font: false }
  let customResult = { deleted: 0, added: 0, semesters: 0 }
  if (applySettings) {
    settingResult = await applySettingsFromCloud(data?.settings)
  }
  if (applyCustomCourses) {
    customResult = await replaceCustomCourses(sid, data?.courses?.by_semester)
  }

  setLastSuccessTs(sid)
  const bootstrapKey = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, sid)
  if (bootstrapKey) {
    localStorage.setItem(bootstrapKey, String(Date.now()))
  }
  pushDebugLog(
    'CloudSync',
    `下载成功 student=${sid} add=${customResult.added} del=${customResult.deleted}`,
    'info'
  )
  return {
    success: true,
    response,
    settingsApplied: settingResult,
    customCoursesApplied: customResult
  }
}

const hasBootstrapDone = (studentId) => {
  const key = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, studentId)
  if (!key) return true
  return !!toSafeText(localStorage.getItem(key))
}

export const runAutoCloudSyncAfterLogin = async ({ studentId, latestGrades = [] } = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) return { success: false, reason: 'missing-student' }
  if (!isValidStudentId(sid)) {
    pushDebugLog('CloudSync', `跳过自动云同步：非 10 位学号 sid=${sid}`, 'warn')
    return { success: false, reason: 'invalid-student' }
  }

  const summary = {
    download: null,
    upload: null
  }

  try {
    if (!hasBootstrapDone(sid)) {
      summary.download = await runCloudSyncDownload({
        studentId: sid,
        reason: 'auto-new-device',
        force: true,
        applySettings: true,
        applyCustomCourses: true
      })
    }
  } catch (error) {
    summary.download = { success: false, error: String(error?.message || error) }
    pushDebugLog('CloudSync', `自动下载失败 student=${sid}`, 'warn', error)
  }

  try {
    const syncedGrades = await primeAcademicCaches(sid, latestGrades)
    summary.upload = await runCloudSyncUpload({
      studentId: sid,
      reason: 'auto-login',
      force: true,
      latestGrades: syncedGrades
    })
  } catch (error) {
    summary.upload = { success: false, error: String(error?.message || error) }
    pushDebugLog('CloudSync', `自动上传失败 student=${sid}`, 'warn', error)
  }

  return {
    success: !!summary.upload?.success || !!summary.download?.success,
    ...summary
  }
}
