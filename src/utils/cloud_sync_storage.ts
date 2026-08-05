/**
 * cloud_sync 存储与基础工具模块：storage key、冷却/状态/元数据读写、
 * 设备 ID、缓存读取、稳定序列化与客户端快照。成绩/考试/课表快照在
 * ./cloud_sync_snapshot.ts，编排在 ./cloud_sync.ts。
 */
import axios from './axios_adapter.js'
import { normalizeSemesterList } from './semester.js'
import { getCurrentVersion } from './updater'
import { detectRuntime } from '../platform/runtime'
import {
  getLastNotifySnapshot,
  getNotificationMonitorSettings
} from './notify_center'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
export { API_BASE }
export const REMOTE_CONFIG_SNAPSHOT_KEY = 'hbu_remote_config_snapshot'
export const CLOUD_SYNC_DEVICE_ID_KEY = 'hbu_cloud_sync_device_id'
export const CLOUD_SYNC_LAST_SUCCESS_PREFIX = 'hbu_cloud_sync_last_success:'
export const CLOUD_SYNC_LAST_UPLOAD_SUCCESS_PREFIX = 'hbu_cloud_sync_last_upload_success:'
export const CLOUD_SYNC_LAST_DOWNLOAD_SUCCESS_PREFIX = 'hbu_cloud_sync_last_download_success:'
export const CLOUD_SYNC_BOOTSTRAP_PREFIX = 'hbu_cloud_sync_bootstrap_done:'
export const CLOUD_SYNC_STATUS_PREFIX = 'hbu_cloud_sync_status:'
export const CLOUD_SYNC_AUTO_UPLOAD_META_PREFIX = 'hbu_cloud_sync_auto_upload_meta:'
export const DEFAULT_TIMEOUT_MS = 12000
export const DEFAULT_COOLDOWN_SEC = 180
export const DEFAULT_UPLOAD_COOLDOWN_SEC = 120
export const DEFAULT_DOWNLOAD_COOLDOWN_SEC = 10
export const DEFAULT_SECRET_REF = 'kv1-main'
export const SYNC_SCHEMA_VERSION = 4
const STUDENT_ID_RE = /^\d{10}$/
export const CHALLENGE_SKEW_MS = 3000
export const CHALLENGE_FALLBACK_TTL_MS = 60 * 1000

export const safeParseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const toSafeText = (value: unknown): string => String(value || '').trim()
export const isValidStudentId = (value: unknown): boolean => STUDENT_ID_RE.test(toSafeText(value))

export const normalizeProxyEndpoint = (value: unknown): string => {
  const text = toSafeText(value)
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/cloud-sync$/i.test(normalized)) return normalized
  return `${normalized}/api/cloud-sync`
}

export const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

export const makeStudentKey = (prefix: string, studentId: unknown): string => {
  const sid = toSafeText(studentId)
  if (!sid) return ''
  return `${prefix}${sid}`
}

export interface CloudSyncStatusRecord extends Record<string, unknown> {
  studentId: string
  updatedAt: number
}

export const readCloudSyncStatusInternal = (studentId: unknown): CloudSyncStatusRecord | null => {
  const key = makeStudentKey(CLOUD_SYNC_STATUS_PREFIX, studentId)
  if (!key) return null
  const parsed = safeParseJson<unknown>(localStorage.getItem(key), null)
  return parsed && typeof parsed === 'object' ? (parsed as CloudSyncStatusRecord) : null
}

export const readAutoUploadMeta = (studentId: unknown): Record<string, unknown> => {
  const key = makeStudentKey(CLOUD_SYNC_AUTO_UPLOAD_META_PREFIX, studentId)
  if (!key) return {}
  const parsed = safeParseJson<unknown>(localStorage.getItem(key), {})
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
}

export const writeAutoUploadMeta = (
  studentId: unknown,
  patch: Record<string, unknown> = {}
): Record<string, unknown> => {
  const sid = toSafeText(studentId)
  const key = makeStudentKey(CLOUD_SYNC_AUTO_UPLOAD_META_PREFIX, sid)
  if (!key) return {}
  const prev = readAutoUploadMeta(sid)
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

export const writeCloudSyncStatus = (
  studentId: unknown,
  patch: Record<string, unknown> = {}
): CloudSyncStatusRecord | null => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const key = makeStudentKey(CLOUD_SYNC_STATUS_PREFIX, sid)
  if (!key) return null
  const prev = readCloudSyncStatusInternal(sid) || {}
  const next: CloudSyncStatusRecord = {
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

export const pruneValue = (value: unknown): unknown => {
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
    const next: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      const normalized = pruneValue(v)
      if (normalized !== undefined) {
        next[k] = normalized
      }
    })
    return Object.keys(next).length ? next : undefined
  }
  return value
}

export const stableStringify = (value: unknown): string => {
  const normalized = pruneValue(value)
  if (normalized === undefined) return ''
  const seen = new WeakSet<object>()
  const sortValue = (input: unknown): unknown => {
    if (!input || typeof input !== 'object') return input
    if (seen.has(input as object)) return '[Circular]'
    seen.add(input as object)
    if (Array.isArray(input)) {
      return input.map(sortValue)
    }
    const output: Record<string, unknown> = {}
    Object.keys(input as Record<string, unknown>).sort().forEach((key) => {
      const item = sortValue((input as Record<string, unknown>)[key])
      if (item !== undefined) output[key] = item
    })
    return output
  }
  return JSON.stringify(sortValue(normalized))
}

export const hashText = (value: unknown): string => {
  const text = String(value || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const buildClientSnapshot = async (): Promise<Record<string, unknown>> => {
  const runtime = detectRuntime()
  let currentVersion = ''
  try {
    currentVersion = toSafeText(await getCurrentVersion())
  } catch {
    currentVersion = ''
  }
  const clientPlatform =
    typeof navigator !== 'undefined'
      ? toSafeText(navigator.platform || navigator.userAgent || '')
      : ''
  return (pruneValue({
    version: currentVersion,
    platform: clientPlatform || runtime,
    runtime
  }) as Record<string, unknown>) || {}
}

export const buildNotifySnapshot = (studentId: unknown): Record<string, unknown> => {
  const sid = toSafeText(studentId)
  const snapshot = sid ? (getLastNotifySnapshot(sid) || {}) : {}
  const settings = getNotificationMonitorSettings() || {}
  return (pruneValue({
    snapshot,
    settings
  }) as Record<string, unknown>) || {}
}

export const buildSettingsSnapshot = (): Record<string, unknown> =>
  (pruneValue({
    app: safeParseJson<unknown>(localStorage.getItem('hbu_app_settings_v1'), {}),
    ui: safeParseJson<unknown>(localStorage.getItem('hbu_ui_settings_v2'), {}),
    font: safeParseJson<unknown>(localStorage.getItem('hbu_font_settings_v1'), {}),
    login: {
      mode: toSafeText(localStorage.getItem('hbu_login_entry_mode')),
      method: toSafeText(localStorage.getItem('hbu_login_method')),
      remember: toSafeText(localStorage.getItem('hbu_remember'))
    }
  }) as Record<string, unknown>) || {}

export const ensureDeviceId = (): string => {
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

export const getCooldownPrefixByAction = (action = 'manual'): string => {
  const normalized = toSafeText(action).toLowerCase()
  if (normalized === 'upload') return CLOUD_SYNC_LAST_UPLOAD_SUCCESS_PREFIX
  if (normalized === 'download') return CLOUD_SYNC_LAST_DOWNLOAD_SUCCESS_PREFIX
  return CLOUD_SYNC_LAST_SUCCESS_PREFIX
}

export const getLastSuccessTs = (studentId: unknown, action = ''): number => {
  const key = makeStudentKey(getCooldownPrefixByAction(action), studentId)
  if (!key) return 0
  return Number(localStorage.getItem(key) || 0) || 0
}

export const setLastSuccessTs = (studentId: unknown, action = '', ts = Date.now()): void => {
  const key = makeStudentKey(getCooldownPrefixByAction(action), studentId)
  if (!key) return
  localStorage.setItem(key, String(ts))
}

export const clearLastSuccessTs = (studentId: unknown, action = ''): void => {
  const key = makeStudentKey(getCooldownPrefixByAction(action), studentId)
  if (!key) return
  localStorage.removeItem(key)
}

export const discoverSemestersFromCache = (studentId: unknown): string[] => {
  const sid = toSafeText(studentId)
  const semesters = new Set<string>()
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
  const scheduleMeta = safeParseJson<Record<string, unknown>>(localStorage.getItem('hbu_schedule_meta'), {})
  const metaSemester = toSafeText(scheduleMeta?.semester)
  if (metaSemester) semesters.add(metaSemester)
  // semester.js 的 normalizeSemesterList 实际返回 string[]（d.ts 为历史 fixture 声明）
  return normalizeSemesterList([...semesters]).map((item) =>
    toSafeText(typeof item === 'string' ? item : (item as { value?: unknown })?.value)
  )
}

export const fetchSemestersForSync = async (studentId: unknown): Promise<string[]> => {
  const local = discoverSemestersFromCache(studentId)
  try {
    const res = await axios.get(`${API_BASE}/v2/semesters`)
    const resData = (res?.data && typeof res.data === 'object'
      ? (res.data as Record<string, unknown>)
      : {})
    const remote = normalizeSemesterList(
      (resData.semesters as unknown[] | undefined) || []
    ).map((item) => toSafeText(typeof item === 'string' ? item : (item as { value?: unknown })?.value))
    if (!remote.length) return local
    const merged = new Set([...local, ...remote])
    return normalizeSemesterList([...merged]).map((item) =>
      toSafeText(typeof item === 'string' ? item : (item as { value?: unknown })?.value)
    )
  } catch {
    return local
  }
}

export const fetchAllCustomCourses = async (studentId: unknown): Promise<Record<string, unknown[]>> => {
  const sid = toSafeText(studentId)
  if (!sid) return {}
  const semesters = await fetchSemestersForSync(sid)
  const output: Record<string, unknown[]> = {}
  for (const semester of semesters) {
    try {
      const res = await axios.post(`${API_BASE}/v2/schedule/custom/list`, {
        student_id: sid,
        semester
      })
      const resData = (res?.data && typeof res.data === 'object'
        ? (res.data as Record<string, unknown>)
        : {})
      if (!resData.success) continue
      const list = Array.isArray(resData.data) ? (resData.data as unknown[]) : []
      const normalized = list.map(normalizeCloudCourse).filter((item): item is Record<string, unknown> => item !== null)
      if (normalized.length > 0) {
        output[semester] = normalized
      }
    } catch {
      // ignore single-semester errors
    }
  }
  return output
}

export const extractDataArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (Array.isArray(obj.data)) return obj.data
  return []
}

export const isNonEmptyObject = (value: unknown): boolean =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0

export const toArrayOfObjects = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object'
  )
}

export const readCacheEntry = (key: unknown): { data: unknown; timestamp: number } | null => {
  const cacheKey = toSafeText(key)
  if (!cacheKey) return null
  const raw = localStorage.getItem(`cache:${cacheKey}`)
  if (!raw) return null
  const parsed = safeParseJson<unknown>(raw, null)
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  return {
    data: record?.data || null,
    timestamp: Number(record?.timestamp || 0) || 0
  }
}

export const readCachedEntriesByPrefix = (prefix: unknown): Array<{
  key: string
  data: unknown
  timestamp: number
}> => {
  const pref = toSafeText(prefix)
  if (!pref) return []
  const entries: Array<{ key: string; data: unknown; timestamp: number }> = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !storageKey.startsWith('cache:')) continue
    const cacheKey = storageKey.slice('cache:'.length)
    if (!(cacheKey === pref || cacheKey.startsWith(`${pref}:`))) continue
    const parsed = safeParseJson<unknown>(localStorage.getItem(storageKey), null)
    if (!parsed || typeof parsed !== 'object') continue
    const record = parsed as Record<string, unknown>
    entries.push({
      key: cacheKey,
      data: record?.data || null,
      timestamp: Number(record?.timestamp || 0) || 0
    })
  }
  entries.sort((a, b) => b.timestamp - a.timestamp)
  return entries
}

export const readLatestCacheObject = (prefix: unknown): unknown => {
  const pref = toSafeText(prefix)
  if (!pref) return null
  let latest: unknown = null
  let latestTs = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !storageKey.startsWith('cache:')) continue
    const cacheKey = storageKey.slice('cache:'.length)
    if (!(cacheKey === pref || cacheKey.startsWith(`${pref}:`))) continue
    const parsed = safeParseJson<unknown>(localStorage.getItem(storageKey), null)
    if (!parsed || typeof parsed !== 'object') continue
    const record = parsed as Record<string, unknown>
    const ts = Number(record?.timestamp || 0)
    if (ts >= latestTs) {
      latestTs = ts
      latest = record?.data || null
    }
  }
  return latest
}

export const extractSuffixFromKey = (key: unknown, prefix: unknown): string => {
  const full = toSafeText(key)
  const pref = toSafeText(prefix)
  if (!full || !pref) return ''
  if (full === pref) return ''
  if (!full.startsWith(`${pref}:`)) return ''
  return toSafeText(full.slice(pref.length + 1))
}

export const normalizeSemesterFromText = (value: unknown): string => {
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

/** 归一化自定义课程条目（用于上传/远端合并） */
export const normalizeCloudCourse = (raw: unknown): Record<string, unknown> | null => {
  const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const weeks = Array.isArray(item?.weeks)
    ? item.weeks
      .map((w) => Number(w))
      .filter((w) => Number.isFinite(w) && w > 0)
    : []
  const weekday = Number(item?.weekday || 0)
  const period = Number(item?.period || 0)
  const djs = Number(item?.djs || 0)
  const name = toSafeText(item?.name)
  if (!name || !weekday || !period || !djs || !weeks.length) return null
  return {
    course_id: toSafeText(item?.course_id || item?.courseId || item?.id || item?.source_id || item?.sourceId),
    source_id: toSafeText(item?.source_id || item?.sourceId || item?.id || item?.course_id || item?.courseId),
    name,
    teacher: toSafeText(item?.teacher),
    room: toSafeText(item?.room || item?.room_code),
    weekday,
    period,
    djs,
    weeks
  }
}
