import axios from 'axios'
import { DEFAULT_CLOUD_SYNC_ENDPOINT, applyAppSettingsSnapshot, useAppSettings } from './app_settings'
import { applyUiSettingsSnapshot } from './ui_settings'
import { applyFontSettingsSnapshot } from './font_settings'
import { normalizeSemesterList } from './semester'
import { pushDebugLog } from './debug_logger'
import { setCachedData } from './api.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const REMOTE_CONFIG_SNAPSHOT_KEY = 'hbu_remote_config_snapshot'
const CLOUD_SYNC_DEVICE_ID_KEY = 'hbu_cloud_sync_device_id'
const CLOUD_SYNC_LAST_SUCCESS_PREFIX = 'hbu_cloud_sync_last_success:'
const CLOUD_SYNC_BOOTSTRAP_PREFIX = 'hbu_cloud_sync_bootstrap_done:'
const CLOUD_SYNC_STATUS_PREFIX = 'hbu_cloud_sync_status:'
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

export const CLOUD_SYNC_UPDATED_EVENT = 'hbu-cloud-sync-updated'

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

const readCloudSyncStatusInternal = (studentId) => {
  const key = makeStudentKey(CLOUD_SYNC_STATUS_PREFIX, studentId)
  if (!key) return null
  return safeParseJson(localStorage.getItem(key), null)
}

const writeCloudSyncStatus = (studentId, patch = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const key = makeStudentKey(CLOUD_SYNC_STATUS_PREFIX, sid)
  if (!key) return null
  const prev = readCloudSyncStatusInternal(sid) || {}
  const next = {
    studentId: sid,
    updatedAt: Date.now(),
    ...prev,
    ...(patch && typeof patch === 'object' ? patch : {})
  }
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // ignore write errors
  }
  return next
}

const dispatchCloudSyncEvent = (detail = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(CLOUD_SYNC_UPDATED_EVENT, { detail }))
}

const commitCloudSyncResult = (studentId, action, detail = {}) => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const payload = detail && typeof detail === 'object' ? detail : {}
  const now = Date.now()
  const result = {
    action: toSafeText(action),
    reason: toSafeText(payload.reason),
    success: !!payload.success,
    cooldown: !!payload.cooldown,
    error: toSafeText(payload.error),
    source: toSafeText(payload.source || 'runtime'),
    updatedAt: now
  }
  const patch = {}
  if (result.action === 'upload') {
    patch.lastUploadAt = now
    patch.lastUploadOk = result.success
    patch.lastUploadReason = result.reason
    patch.lastUploadError = result.success ? '' : result.error
    if ('includeCustomCourses' in payload) {
      patch.lastUploadIncludeCustomCourses = payload.includeCustomCourses === true
    }
  } else if (result.action === 'download') {
    patch.lastDownloadAt = now
    patch.lastDownloadOk = result.success
    patch.lastDownloadReason = result.reason
    patch.lastDownloadError = result.success ? '' : result.error
    if ('applyCustomCourses' in payload) {
      patch.lastDownloadApplyCustomCourses = payload.applyCustomCourses === true
    }
  }
  patch.lastAction = result.action
  patch.lastActionOk = result.success
  patch.lastActionError = result.success ? '' : result.error
  patch.lastActionReason = result.reason
  patch.lastActionSource = result.source
  patch.lastCooldown = result.cooldown
  const saved = writeCloudSyncStatus(sid, patch)
  dispatchCloudSyncEvent({
    ...(saved || {}),
    ...result,
    studentId: sid,
    ...(payload && typeof payload === 'object' ? payload : {})
  })
  return saved
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

export const getCloudSyncLocalStatus = (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const parsed = readCloudSyncStatusInternal(sid)
  if (!parsed || typeof parsed !== 'object') return null
  return {
    studentId: sid,
    ...parsed
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

const isNonEmptyObject = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0

const toArrayOfObjects = (value) => {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object')
}

const readCacheEntry = (key) => {
  const cacheKey = toSafeText(key)
  if (!cacheKey) return null
  const raw = localStorage.getItem(`cache:${cacheKey}`)
  if (!raw) return null
  const parsed = safeParseJson(raw, null)
  if (!parsed || typeof parsed !== 'object') return null
  return {
    data: parsed?.data || null,
    timestamp: Number(parsed?.timestamp || 0) || 0
  }
}

const readCachedEntriesByPrefix = (prefix) => {
  const pref = toSafeText(prefix)
  if (!pref) return []
  const entries = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !storageKey.startsWith('cache:')) continue
    const cacheKey = storageKey.slice('cache:'.length)
    if (!(cacheKey === pref || cacheKey.startsWith(`${pref}:`))) continue
    const parsed = safeParseJson(localStorage.getItem(storageKey), null)
    if (!parsed || typeof parsed !== 'object') continue
    entries.push({
      key: cacheKey,
      data: parsed?.data || null,
      timestamp: Number(parsed?.timestamp || 0) || 0
    })
  }
  entries.sort((a, b) => b.timestamp - a.timestamp)
  return entries
}

const extractSuffixFromKey = (key, prefix) => {
  const full = toSafeText(key)
  const pref = toSafeText(prefix)
  if (!full || !pref) return ''
  if (full === pref) return ''
  if (!full.startsWith(`${pref}:`)) return ''
  return toSafeText(full.slice(pref.length + 1))
}

const normalizeSemesterFromText = (value) => {
  const text = toSafeText(value)
  if (!text) return ''
  const direct = text.match(/(\d{4}-\d{4}-[12])/)
  if (direct) return direct[1]
  const loose = text.match(/(\d{4})\D+(\d{4})\D*([12一二])/)
  if (!loose) return ''
  const termRaw = loose[3]
  const term = termRaw === '二' ? '2' : termRaw === '一' ? '1' : termRaw
  return `${loose[1]}-${loose[2]}-${term}`
}

const deriveGradeSemester = (item, fallback = '') => {
  if (!item || typeof item !== 'object') return toSafeText(fallback)
  const direct = normalizeSemesterFromText(item?.semester || item?.xnxq || item?.term || item?.xq)
  if (direct) return direct
  const xn = toSafeText(item?.xnmmc || item?.school_year)
  const xq = toSafeText(item?.xqmmc || item?.term_name || item?.semester_name)
  const merged = normalizeSemesterFromText(`${xn}-${xq}`)
  return merged || toSafeText(fallback)
}

const makeGradeFingerprint = (item, semester = '') => {
  const sem = toSafeText(semester) || deriveGradeSemester(item)
  const name = toSafeText(item?.course_name || item?.name || item?.kcmc)
  const score = toSafeText(item?.score || item?.final_score || item?.zcj || item?.cj)
  const credit = toSafeText(item?.credit || item?.xf || item?.course_credit)
  const code = toSafeText(item?.course_code || item?.kch || item?.id)
  return `${sem}|${code}|${name}|${score}|${credit}`
}

const buildGradeSnapshot = (studentId, latestGrades = []) => {
  const sid = toSafeText(studentId)
  const prefix = `grades:${sid}`
  const sourceEntries = []
  if (Array.isArray(latestGrades) && latestGrades.length > 0) {
    sourceEntries.push({
      semester: '',
      list: toArrayOfObjects(latestGrades)
    })
  }
  readCachedEntriesByPrefix(prefix).forEach((entry) => {
    sourceEntries.push({
      semester: normalizeSemesterFromText(extractSuffixFromKey(entry.key, prefix)),
      list: toArrayOfObjects(extractDataArray(entry.data))
    })
  })
  const all = []
  const bySemester = {}
  const seen = new Set()
  sourceEntries.forEach(({ semester, list }) => {
    list.forEach((item) => {
      const sem = deriveGradeSemester(item, semester)
      const fp = makeGradeFingerprint(item, sem)
      if (seen.has(fp)) return
      seen.add(fp)
      all.push(item)
      if (sem) {
        if (!Array.isArray(bySemester[sem])) {
          bySemester[sem] = []
        }
        bySemester[sem].push(item)
      }
    })
  })
  return {
    all,
    bySemester
  }
}

const extractRankingObject = (value) => {
  if (!value || typeof value !== 'object') return null
  if (isNonEmptyObject(value?.data)) return value.data
  if (isNonEmptyObject(value)) return value
  return null
}

const buildRankingSnapshot = (studentId) => {
  const sid = toSafeText(studentId)
  const prefix = `ranking:${sid}`
  const bySemester = {}
  readCachedEntriesByPrefix(prefix).forEach((entry) => {
    const fromKey = normalizeSemesterFromText(extractSuffixFromKey(entry.key, prefix))
    const rankingObj = extractRankingObject(entry.data)
    if (!rankingObj) return
    const sem = normalizeSemesterFromText(rankingObj?.semester || fromKey) || (fromKey || 'all')
    if (!isNonEmptyObject(bySemester[sem])) {
      bySemester[sem] = rankingObj
    }
  })
  const latest = extractRankingObject(readLatestCacheObject(prefix))
  const current = isNonEmptyObject(bySemester.all)
    ? bySemester.all
    : (latest || Object.values(bySemester)[0] || null)
  return {
    current,
    bySemester
  }
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

const normalizeSchedulePayload = (rawPayload, semester = '') => {
  if (!rawPayload || typeof rawPayload !== 'object') return null
  const data = Array.isArray(rawPayload?.data) ? rawPayload.data : []
  const rawMeta = rawPayload?.meta && typeof rawPayload.meta === 'object' ? rawPayload.meta : {}
  const sem = toSafeText(rawMeta?.semester || semester)
  const meta = pruneValue({
    ...rawMeta,
    semester: sem || toSafeText(rawMeta?.semester)
  }) || {}
  return {
    success: true,
    data,
    meta,
    offline: !!rawPayload?.offline,
    sync_time: toSafeText(rawPayload?.sync_time) || new Date().toISOString()
  }
}

const buildScheduleSnapshot = (studentId) => {
  const sid = toSafeText(studentId)
  if (!sid) return { by_semester: {} }
  const semesters = discoverSemestersFromCache(sid)
  const bySemester = {}
  for (const semester of semesters) {
    const entry = readCacheEntry(`schedule:${sid}:${semester}`)
    const payload = normalizeSchedulePayload(entry?.data, semester)
    if (!payload) continue
    bySemester[semester] = payload
  }
  return {
    by_semester: bySemester
  }
}

const buildAcademicSnapshot = (studentId, latestGrades = []) => {
  const sid = toSafeText(studentId)
  const gradesSnapshot = buildGradeSnapshot(sid, latestGrades)
  const rankingSnapshot = buildRankingSnapshot(sid)
  const scheduleMeta = safeParseJson(localStorage.getItem('hbu_schedule_meta'), {})
  return {
    grades: gradesSnapshot.all,
    grades_by_semester: gradesSnapshot.bySemester,
    ranking: rankingSnapshot.current || {},
    ranking_by_semester: rankingSnapshot.bySemester,
    schedule_meta: scheduleMeta && typeof scheduleMeta === 'object' ? scheduleMeta : {},
    schedule: buildScheduleSnapshot(sid)
  }
}

const buildSyncPayload = async (studentId, options = {}) => {
  const sid = toSafeText(studentId)
  const includeCustomCourses = options?.includeCustomCourses !== false
  const includeAcademic = options?.includeAcademic !== false
  const includeSettings = options?.includeSettings !== false
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
  const bySemester = includeCustomCourses ? await fetchAllCustomCourses(sid) : {}
  const courses = pruneValue({ by_semester: bySemester }) || { by_semester: {} }
  const academic = includeAcademic ? (pruneValue(buildAcademicSnapshot(sid, options?.latestGrades)) || {}) : {}
  const deviceId = ensureDeviceId()
  return {
    v: SYNC_SCHEMA_VERSION,
    sid,
    ts: Date.now(),
    did: deviceId,
    settings: includeSettings ? settingsSnapshot : {},
    courses,
    academic
  }
}

const primeAcademicCaches = async (studentId, seedGrades = []) => {
  const sid = toSafeText(studentId)
  let grades = Array.isArray(seedGrades) ? seedGrades : []
  if (!sid) return grades
  const semesters = await fetchSemestersForSync(sid)
  try {
    if (!grades.length) {
      const gradeRes = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid })
      if (gradeRes?.data?.success && Array.isArray(gradeRes?.data?.data)) {
        grades = gradeRes.data.data
      }
      if (gradeRes?.data?.success) {
        setCachedData(`grades:${sid}`, gradeRes.data)
      }
    } else {
      setCachedData(`grades:${sid}`, { success: true, data: grades })
    }
  } catch {
    // ignore
  }
  try {
    const scheduleRes = await axios.post(`${API_BASE}/v2/schedule/query`, { student_id: sid })
    if (scheduleRes?.data?.success) {
      setCachedData(`schedule:${sid}`, scheduleRes.data)
      const sem = toSafeText(scheduleRes?.data?.meta?.semester)
      if (sem) {
        setCachedData(`schedule:${sid}:${sem}`, scheduleRes.data)
      }
    }
  } catch {
    // ignore
  }
  try {
    const allRankingRes = await axios.post(`${API_BASE}/v2/ranking`, { student_id: sid, semester: '' })
    if (allRankingRes?.data?.success) {
      setCachedData(`ranking:${sid}`, allRankingRes.data)
      setCachedData(`ranking:${sid}:all`, allRankingRes.data)
    }
    for (const semester of semesters) {
      const sem = toSafeText(semester)
      if (!sem) continue
      try {
        const semRankingRes = await axios.post(`${API_BASE}/v2/ranking`, {
          student_id: sid,
          semester: sem
        })
        if (semRankingRes?.data?.success) {
          setCachedData(`ranking:${sid}:${sem}`, semRankingRes.data)
        }
      } catch {
        // ignore single-semester ranking error
      }
    }
  } catch {
    // ignore
  }
  const gradesSnapshot = buildGradeSnapshot(sid, grades)
  if (gradesSnapshot.all.length > 0) {
    setCachedData(`grades:${sid}`, { success: true, data: gradesSnapshot.all })
    Object.entries(gradesSnapshot.bySemester).forEach(([semester, list]) => {
      const sem = normalizeSemesterFromText(semester)
      const gradeList = toArrayOfObjects(list)
      if (!sem || !gradeList.length) return
      setCachedData(`grades:${sid}:${sem}`, { success: true, data: gradeList })
    })
  }
  pushDebugLog(
    'CloudSync',
    `学业缓存预热完成 student=${sid} semesters=${semesters.length} grades=${gradesSnapshot.all.length}`,
    'debug'
  )
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

const applyAcademicFromCloud = (studentId, academic) => {
  const sid = toSafeText(studentId)
  if (!sid || !academic || typeof academic !== 'object') {
    return {
      gradesCached: false,
      rankingCached: false,
      scheduleMetaApplied: false,
      scheduleCacheWrites: 0,
      scheduleSemesters: []
    }
  }

  let gradesCached = false
  let rankingCached = false
  let scheduleMetaApplied = false
  let scheduleCacheWrites = 0
  const scheduleSemesters = []
  const mergedGrades = []
  const gradeSeen = new Set()
  const addGradeItems = (list = [], fallbackSemester = '') => {
    toArrayOfObjects(list).forEach((item) => {
      const sem = deriveGradeSemester(item, fallbackSemester)
      const fp = makeGradeFingerprint(item, sem)
      if (gradeSeen.has(fp)) return
      gradeSeen.add(fp)
      mergedGrades.push(item)
    })
  }

  const gradesBySemester = academic?.grades_by_semester
  if (gradesBySemester && typeof gradesBySemester === 'object' && !Array.isArray(gradesBySemester)) {
    Object.entries(gradesBySemester).forEach(([semester, list]) => {
      const sem = normalizeSemesterFromText(semester)
      const gradeList = toArrayOfObjects(list)
      if (!sem || !gradeList.length) return
      setCachedData(`grades:${sid}:${sem}`, { success: true, data: gradeList })
      addGradeItems(gradeList, sem)
      gradesCached = true
    })
  }

  const grades = Array.isArray(academic?.grades)
    ? academic.grades
    : (Array.isArray(academic?.grades_all) ? academic.grades_all : [])
  addGradeItems(grades)
  if (mergedGrades.length > 0) {
    setCachedData(`grades:${sid}`, { success: true, data: mergedGrades })
    gradesCached = true
  }

  const rankingBySemester = academic?.ranking_by_semester
  if (rankingBySemester && typeof rankingBySemester === 'object' && !Array.isArray(rankingBySemester)) {
    Object.entries(rankingBySemester).forEach(([semester, payload]) => {
      const sem = normalizeSemesterFromText(semester) || (toSafeText(semester) || 'all')
      const rankingObj = extractRankingObject(payload)
      if (!sem || !rankingObj) return
      setCachedData(`ranking:${sid}:${sem}`, { success: true, data: rankingObj })
      if (sem === 'all') {
        setCachedData(`ranking:${sid}`, { success: true, data: rankingObj })
      }
      rankingCached = true
    })
  }

  const currentRanking = extractRankingObject(academic?.ranking) || extractRankingObject(academic?.ranking_all)
  if (currentRanking) {
    setCachedData(`ranking:${sid}`, { success: true, data: currentRanking })
    rankingCached = true
  }

  const scheduleMeta = academic?.schedule_meta
  if (scheduleMeta && typeof scheduleMeta === 'object') {
    try {
      localStorage.setItem('hbu_schedule_meta', JSON.stringify(scheduleMeta))
      scheduleMetaApplied = true
    } catch {
      // ignore
    }
  }

  const bySemester = academic?.schedule?.by_semester
  if (bySemester && typeof bySemester === 'object' && !Array.isArray(bySemester)) {
    for (const [semester, rawPayload] of Object.entries(bySemester)) {
      const sem = toSafeText(semester)
      if (!sem) continue
      const normalized = normalizeSchedulePayload(rawPayload, sem)
      if (!normalized) continue
      setCachedData(`schedule:${sid}:${sem}`, normalized)
      scheduleCacheWrites += 1
      scheduleSemesters.push(sem)
    }
  }

  return {
    gradesCached,
    rankingCached,
    scheduleMetaApplied,
    scheduleCacheWrites,
    scheduleSemesters: normalizeSemesterList(scheduleSemesters)
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
  latestGrades = [],
  includeCustomCourses = true,
  includeAcademic = true,
  includeSettings = true
} = {}) => {
  const sid = toSafeText(studentId)
  const safeReason = toSafeText(reason) || 'manual'
  if (!sid) {
    const output = { success: false, error: '学号为空，无法上传云同步' }
    commitCloudSyncResult(studentId, 'upload', { ...output, reason: safeReason })
    return output
  }
  if (!isValidStudentId(sid)) {
    const output = { success: false, error: '云同步仅支持 10 位学号账号' }
    commitCloudSyncResult(sid, 'upload', { ...output, reason: safeReason })
    return output
  }
  const cfg = getCloudSyncRuntimeConfig()
  if (!cfg.enabled) {
    const output = { success: false, error: '云同步未启用或未配置服务地址' }
    commitCloudSyncResult(sid, 'upload', { ...output, reason: safeReason })
    return output
  }

  if (!force) {
    const cooldown = getCloudSyncCooldownState(sid)
    if (cooldown.blocked) {
      const output = {
        success: false,
        cooldown: true,
        remainingMs: cooldown.remainingMs,
        error: '同步冷却中'
      }
      commitCloudSyncResult(sid, 'upload', { ...output, reason: safeReason })
      return output
    }
  }

  pushDebugLog('CloudSync', `开始上传 student=${sid} reason=${safeReason}`, 'info')
  try {
    pushDebugLog(
      'CloudSync',
      `上传内容 settings=${includeSettings ? 1 : 0} academic=${includeAcademic ? 1 : 0} custom=${includeCustomCourses ? 1 : 0}`,
      'debug'
    )
    const payload = await buildSyncPayload(sid, {
      latestGrades,
      includeCustomCourses,
      includeAcademic,
      includeSettings
    })
    const body = {
      student_id: sid,
      device_id: ensureDeviceId(),
      reason: safeReason,
      payload,
      client_time: Date.now(),
      secret_ref: cfg.secretRef
    }
    const response = await requestCloudSync('/upload', {
      method: 'POST',
      body,
      config: cfg
    })
    const uploadedAt = Date.now()
    setLastSuccessTs(sid, uploadedAt)
    pushDebugLog('CloudSync', `上传成功 student=${sid}`, 'info')
    const output = {
      success: true,
      response,
      uploadedAt
    }
    commitCloudSyncResult(sid, 'upload', {
      ...output,
      reason: safeReason,
      includeCustomCourses
    })
    return output
  } catch (error) {
    const errorText = String(error?.message || error || '云上传失败')
    commitCloudSyncResult(sid, 'upload', {
      success: false,
      reason: safeReason,
      error: errorText,
      includeCustomCourses
    })
    pushDebugLog('CloudSync', `上传失败 student=${sid}`, 'warn', error)
    throw error
  }
}

export const runCloudSyncDownload = async ({
  studentId,
  reason = 'manual',
  force = false,
  applySettings = true,
  applyCustomCourses = true,
  applyAcademic = true
} = {}) => {
  const sid = toSafeText(studentId)
  const safeReason = toSafeText(reason) || 'manual'
  if (!sid) {
    const output = { success: false, error: '学号为空，无法下载云同步' }
    commitCloudSyncResult(studentId, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  }
  if (!isValidStudentId(sid)) {
    const output = { success: false, error: '云同步仅支持 10 位学号账号' }
    commitCloudSyncResult(sid, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  }
  const cfg = getCloudSyncRuntimeConfig()
  if (!cfg.enabled) {
    const output = { success: false, error: '云同步未启用或未配置服务地址' }
    commitCloudSyncResult(sid, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  }

  if (!force) {
    const cooldown = getCloudSyncCooldownState(sid)
    if (cooldown.blocked) {
      const output = {
        success: false,
        cooldown: true,
        remainingMs: cooldown.remainingMs,
        error: '同步冷却中'
      }
      commitCloudSyncResult(sid, 'download', {
        ...output,
        reason: safeReason,
        applyCustomCourses
      })
      return output
    }
  }

  pushDebugLog('CloudSync', `开始下载 student=${sid} reason=${safeReason}`, 'info')
  try {
    const query = new URLSearchParams({
      student_id: sid,
      reason: safeReason,
      device_id: ensureDeviceId(),
      secret_ref: cfg.secretRef
    }).toString()
    const response = await requestCloudSync(`/download?${query}`, {
      method: 'GET',
      config: cfg
    })
    const data = extractCloudData(response)
    if (!data) {
      const now = Date.now()
      setLastSuccessTs(sid, now)
      const bootstrapKey = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, sid)
      if (bootstrapKey) {
        localStorage.setItem(bootstrapKey, String(now))
      }
      pushDebugLog('CloudSync', `下载成功但云端为空 student=${sid}`, 'info')
      const output = {
        success: true,
        empty: true,
        response
      }
      commitCloudSyncResult(sid, 'download', {
        ...output,
        reason: safeReason,
        applyCustomCourses
      })
      return output
    }

    let settingResult = { app: false, ui: false, font: false }
    let customResult = { deleted: 0, added: 0, semesters: 0 }
    let academicResult = {
      gradesCached: false,
      rankingCached: false,
      scheduleMetaApplied: false,
      scheduleCacheWrites: 0,
      scheduleSemesters: []
    }
    if (applySettings) {
      settingResult = await applySettingsFromCloud(data?.settings)
    }
    if (applyCustomCourses) {
      customResult = await replaceCustomCourses(sid, data?.courses?.by_semester)
    }
    if (applyAcademic) {
      academicResult = applyAcademicFromCloud(sid, data?.academic)
    }

    const successAt = Date.now()
    setLastSuccessTs(sid, successAt)
    const bootstrapKey = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, sid)
    if (bootstrapKey) {
      localStorage.setItem(bootstrapKey, String(successAt))
    }
    pushDebugLog(
      'CloudSync',
      `下载成功 student=${sid} add=${customResult.added} del=${customResult.deleted} schedule=${academicResult.scheduleCacheWrites}`,
      'info'
    )
    const output = {
      success: true,
      response,
      settingsApplied: settingResult,
      customCoursesApplied: customResult,
      academicApplied: academicResult
    }
    commitCloudSyncResult(sid, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  } catch (error) {
    const errorText = String(error?.message || error || '云下载失败')
    commitCloudSyncResult(sid, 'download', {
      success: false,
      reason: safeReason,
      error: errorText,
      applyCustomCourses
    })
    pushDebugLog('CloudSync', `下载失败 student=${sid}`, 'warn', error)
    throw error
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
    summary.download = await runCloudSyncDownload({
      studentId: sid,
      reason: hasBootstrapDone(sid) ? 'auto-login-settings' : 'auto-new-device-settings',
      force: true,
      applySettings: true,
      applyCustomCourses: false,
      applyAcademic: true
    })
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
      latestGrades: syncedGrades,
      includeCustomCourses: false,
      includeAcademic: true,
      includeSettings: true
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
