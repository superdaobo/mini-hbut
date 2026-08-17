/**
 * cloud_sync_payload：自动上传签名、同步负载构建与学业缓存预热。
 */
import axios from './axios_adapter.js'
import { setCachedData } from './api.js'
import {
  buildAcademicSnapshot,
  buildGradeSnapshot,
  hasNonEmptyCourseMap,
  replaceAuthoritativeGradeCaches
} from './cloud_sync_snapshot.js'
import {
  API_BASE,
  SYNC_SCHEMA_VERSION,
  buildClientSnapshot,
  buildNotifySnapshot,
  buildSettingsSnapshot,
  ensureDeviceId,
  fetchAllCustomCourses,
  fetchSemestersForSync,
  hashText,
  pruneValue,
  stableStringify,
  toSafeText
} from './cloud_sync_storage.js'
import { asRecord } from './cloud_sync_transport.js'
import { pushDebugLog } from './debug_logger'

export const buildAutoUploadSignature = async (
  studentId: unknown,
  latestGrades: unknown = []
): Promise<{ version: string; signature: string; payload: Record<string, unknown> }> => {
  const sid = toSafeText(studentId)
  const clientSnapshot = await buildClientSnapshot()
  const signaturePayload = {
    schema: SYNC_SCHEMA_VERSION,
    sid,
    client: clientSnapshot,
    settings: buildSettingsSnapshot(),
    notify: buildNotifySnapshot(sid),
    academic: buildAcademicSnapshot(sid, latestGrades)
  }
  const stable = stableStringify(signaturePayload)
  return {
    version: toSafeText(clientSnapshot?.version),
    signature: `${stable.length}:${hashText(stable)}`,
    payload: signaturePayload
  }
}

export const resolveAutoUploadReason = (
  meta: Record<string, unknown> = {},
  signature: Record<string, unknown> = {},
  preferredReason = 'auto-login'
): { reason: string; recentReason: string } => {
  const currentVersion = toSafeText(signature?.version)
  const currentSignature = toSafeText(signature?.signature)
  const lastUploadVersion = toSafeText(meta?.lastUploadVersion)
  const lastUploadSignature = toSafeText(meta?.lastUploadSignature)
  if (currentVersion && lastUploadVersion && currentVersion !== lastUploadVersion) {
    return { reason: 'auto-version-change', recentReason: 'version-change' }
  }
  if (currentSignature && lastUploadSignature && currentSignature !== lastUploadSignature) {
    return { reason: 'auto-signature-change', recentReason: 'signature-change' }
  }
  return {
    reason: toSafeText(preferredReason) || 'auto-login',
    recentReason: toSafeText(preferredReason) || 'auto-login'
  }
}

export const buildSyncPayload = async (
  studentId: unknown,
  options: {
    latestGrades?: unknown
    includeCustomCourses?: boolean
    includeAcademic?: boolean
    includeSettings?: boolean
  } = {}
): Promise<{ payload: Record<string, unknown>; hasCustomCourseData: boolean }> => {
  const sid = toSafeText(studentId)
  const includeCustomCourses = options?.includeCustomCourses !== false
  const includeAcademic = options?.includeAcademic !== false
  const includeSettings = options?.includeSettings !== false
  const clientSnapshot = await buildClientSnapshot()
  const notifySnapshot = buildNotifySnapshot(sid)
  const settingsSnapshot = buildSettingsSnapshot()
  const bySemester = includeCustomCourses ? await fetchAllCustomCourses(sid) : {}
  const hasCustomCourseData = includeCustomCourses && hasNonEmptyCourseMap(bySemester)
  const courses = hasCustomCourseData ? (pruneValue({ by_semester: bySemester }) || undefined) : undefined
  const academic = includeAcademic ? (pruneValue(buildAcademicSnapshot(sid, options?.latestGrades)) || {}) : undefined
  const deviceId = ensureDeviceId()
  const payload: Record<string, unknown> = {
    v: SYNC_SCHEMA_VERSION,
    sid,
    ts: Date.now(),
    did: deviceId
  }
  if (includeSettings) payload.settings = settingsSnapshot
  if (courses) payload.courses = courses
  payload.client = clientSnapshot
  payload.notify = notifySnapshot
  if (includeAcademic) payload.academic = academic || {}
  return {
    payload,
    hasCustomCourseData
  }
}

export const primeAcademicCaches = async (
  studentId: unknown,
  seedGrades: unknown[] = [],
  options: { skipSemesterRankingWarmup?: boolean } = {}
): Promise<unknown[]> => {
  const sid = toSafeText(studentId)
  let grades = Array.isArray(seedGrades) ? seedGrades : []
  if (!sid) return grades
  const skipSemesterRankingWarmup = options?.skipSemesterRankingWarmup !== false
  const semesters = skipSemesterRankingWarmup ? [] : await fetchSemestersForSync(sid)
  let authoritativeGrades: unknown[] | null = null
  try {
    if (!grades.length) {
      const gradeRes = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid })
      const gradeData = asRecord(gradeRes?.data)
      if (gradeData.success && Array.isArray(gradeData.data)) {
        grades = gradeData.data as unknown[]
        authoritativeGrades = grades
      }
    } else {
      authoritativeGrades = grades
    }
  } catch {
    // ignore
  }
  try {
    const studentInfoRes = await axios.post(`${API_BASE}/v2/student_info`, { student_id: sid })
    if (asRecord(studentInfoRes?.data).success) {
      setCachedData(`studentinfo:${sid}`, studentInfoRes.data)
      setCachedData(`student_info:${sid}`, studentInfoRes.data)
    }
  } catch {
    // ignore
  }
  try {
    const scheduleRes = await axios.post(`${API_BASE}/v2/schedule/query`, { student_id: sid })
    const scheduleData = asRecord(scheduleRes?.data)
    if (scheduleData.success) {
      setCachedData(`schedule:${sid}`, scheduleRes.data)
      const sem = toSafeText(asRecord(scheduleData.meta).semester)
      if (sem) {
        setCachedData(`schedule:${sid}:${sem}`, scheduleRes.data)
      }
    }
  } catch {
    // ignore
  }
  try {
    const examRes = await axios.post(`${API_BASE}/v2/exams`, { student_id: sid, semester: '' })
    if (asRecord(examRes?.data).success) {
      setCachedData(`exams:${sid}:current`, examRes.data)
    }
  } catch {
    // ignore
  }
  try {
    const allRankingRes = await axios.post(`${API_BASE}/v2/ranking`, { student_id: sid, semester: '' })
    if (asRecord(allRankingRes?.data).success) {
      setCachedData(`ranking:${sid}`, allRankingRes.data)
      setCachedData(`ranking:${sid}:all`, allRankingRes.data)
    }
    if (skipSemesterRankingWarmup) {
      pushDebugLog('CloudSync', `跳过分学期排名预热 student=${sid} semesters=${semesters.length}`, 'debug')
    }
  } catch {
    // ignore
  }
  // 有教务权威列表（含空数组）时整表替换；否则仅用本地缓存拼快照（离线）。
  // 必须用 != null 判断：[] 为 truthy 但 empty authority 也应 clear，不能走并集回退。
  const gradesSnapshot = authoritativeGrades != null
    ? replaceAuthoritativeGradeCaches(sid, authoritativeGrades)
    : buildGradeSnapshot(sid)
  pushDebugLog(
    'CloudSync',
    `学业缓存预热完成 student=${sid} semesters=${semesters.length} grades=${gradesSnapshot.all.length} authoritative=${authoritativeGrades != null ? 1 : 0}`,
    'debug'
  )
  return authoritativeGrades != null ? authoritativeGrades : (gradesSnapshot.all || grades)
}
