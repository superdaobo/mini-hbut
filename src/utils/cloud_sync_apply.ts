/**
 * cloud_sync_apply：将云端数据应用到本地——自定义课表替换、设置快照与学业缓存回写。
 */
import axios from './axios_adapter.js'
import { setCachedData } from './api.js'
import { applyAppSettingsSnapshot } from './app_settings'
import {
  deriveGradeSemester,
  extractRankingObject,
  makeGradeFingerprint,
  mergeCustomCourseSemesters,
  normalizePersonalInfoPayload,
  normalizeSchedulePayload,
  replaceAuthoritativeGradeCaches
} from './cloud_sync_snapshot.js'
import {
  API_BASE,
  fetchSemestersForSync,
  normalizeSemesterFromText,
  toArrayOfObjects,
  toSafeText
} from './cloud_sync_storage.js'
import { asRecord } from './cloud_sync_transport.js'
import { applyFontSettingsSnapshot } from './font_settings'
import { normalizeSemesterList } from './semester.js'
import { applyUiSettingsSnapshot } from './ui_settings'

export const replaceCustomCourses = async (
  studentId: unknown,
  bySemester: unknown
): Promise<{ deleted: number; added: number; semesters: number }> => {
  const sid = toSafeText(studentId)
  if (!sid) return { deleted: 0, added: 0, semesters: 0 }
  const nextMap = mergeCustomCourseSemesters(bySemester)
  const remoteSemesters = Object.keys(nextMap)
  const localSemesters = await fetchSemestersForSync(sid)
  const semesters = normalizeSemesterList([...new Set([...remoteSemesters, ...localSemesters])]).map(
    (item) => toSafeText(typeof item === 'string' ? item : (item as { value?: unknown })?.value)
  )

  let deleted = 0
  let added = 0
  for (const semester of semesters) {
    let existing: unknown[] = []
    try {
      const listRes = await axios.post(`${API_BASE}/v2/schedule/custom/list`, {
        student_id: sid,
        semester
      })
      const listData = asRecord(listRes?.data)
      if (listData.success) {
        existing = Array.isArray(listData.data) ? (listData.data as unknown[]) : []
      }
    } catch {
      existing = []
    }

    for (const item of existing) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const sourceId = toSafeText(raw?.source_id || raw?.id)
      if (!sourceId) continue
      try {
        const delRes = await axios.post(`${API_BASE}/v2/schedule/custom/delete`, {
          student_id: sid,
          semester,
          course_id: sourceId,
          mode: 'all'
        })
        if (asRecord(delRes?.data).success) {
          deleted += 1
        }
      } catch {
        // ignore single delete error
      }
    }

    const nextCourses = Array.isArray(nextMap[semester]) ? nextMap[semester] : []
    for (const item of nextCourses) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      try {
        const addRes = await axios.post(`${API_BASE}/v2/schedule/custom/add`, {
          student_id: sid,
          semester,
          name: raw.name,
          teacher: raw.teacher || '',
          room: raw.room || '',
          weekday: raw.weekday,
          period: raw.period,
          djs: raw.djs,
          weeks: raw.weeks
        })
        if (asRecord(addRes?.data).success) {
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

export const applySettingsFromCloud = async (
  settings: unknown
): Promise<{ app: boolean; ui: boolean; font: boolean }> => {
  const payload = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
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

export interface AcademicApplyResult {
  gradesCached: boolean
  rankingCached: boolean
  personalInfoCached: boolean
  scheduleMetaApplied: boolean
  scheduleCacheWrites: number
  scheduleSemesters: string[]
}

export const applyAcademicFromCloud = (
  studentId: unknown,
  academic: unknown
): AcademicApplyResult => {
  const sid = toSafeText(studentId)
  const empty = {
    gradesCached: false,
    rankingCached: false,
    personalInfoCached: false,
    scheduleMetaApplied: false,
    scheduleCacheWrites: 0,
    scheduleSemesters: [] as string[]
  }
  if (!sid || !academic || typeof academic !== 'object') {
    return empty
  }
  const data = academic as Record<string, unknown>

  let gradesCached = false
  let rankingCached = false
  let personalInfoCached = false
  let scheduleMetaApplied = false
  let scheduleCacheWrites = 0
  const scheduleSemesters: string[] = []
  const mergedGrades: Array<Record<string, unknown>> = []
  const gradeSeen = new Set<string>()
  const addGradeItems = (list: unknown[] = [], fallbackSemester = ''): void => {
    toArrayOfObjects(list).forEach((item) => {
      const sem = deriveGradeSemester(item, fallbackSemester)
      const fp = makeGradeFingerprint(item, sem)
      if (gradeSeen.has(fp)) return
      gradeSeen.add(fp)
      mergedGrades.push(item)
    })
  }

  const gradesBySemester = data?.grades_by_semester
  if (gradesBySemester && typeof gradesBySemester === 'object' && !Array.isArray(gradesBySemester)) {
    Object.entries(gradesBySemester as Record<string, unknown>).forEach(([semester, list]) => {
      const sem = normalizeSemesterFromText(semester)
      const gradeList = toArrayOfObjects(list)
      if (!sem || !gradeList.length) return
      addGradeItems(gradeList, sem)
      gradesCached = true
    })
  }

  const grades = Array.isArray(data?.grades)
    ? (data.grades as unknown[])
    : (Array.isArray(data?.grades_all) ? (data.grades_all as unknown[]) : [])
  addGradeItems(grades)
  // 云端学业含成绩字段时整表替换本地前缀：不与脏分片并集、也不残留已删除条目。
  // 后续 primeAcademicCaches 若拿到教务权威列表会再次覆盖。
  const hasCloudGradesPayload =
    Array.isArray(data?.grades) ||
    Array.isArray(data?.grades_all) ||
    (
      gradesBySemester &&
      typeof gradesBySemester === 'object' &&
      !Array.isArray(gradesBySemester) &&
      Object.keys(gradesBySemester as Record<string, unknown>).length > 0
    )
  if (hasCloudGradesPayload) {
    replaceAuthoritativeGradeCaches(sid, mergedGrades)
    gradesCached = true
  }

  const rankingBySemester = data?.ranking_by_semester
  if (rankingBySemester && typeof rankingBySemester === 'object' && !Array.isArray(rankingBySemester)) {
    Object.entries(rankingBySemester as Record<string, unknown>).forEach(([semester, payload]) => {
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

  const currentRanking = extractRankingObject(data?.ranking) || extractRankingObject(data?.ranking_all)
  if (currentRanking) {
    setCachedData(`ranking:${sid}`, { success: true, data: currentRanking })
    rankingCached = true
  }

  const personalInfo = normalizePersonalInfoPayload(data?.personal_info || data?.profile, sid)
  if (personalInfo) {
    const payload = { success: true, data: personalInfo }
    setCachedData(`studentinfo:${sid}`, payload)
    setCachedData(`student_info:${sid}`, payload)
    personalInfoCached = true
  }

  const scheduleMeta = data?.schedule_meta
  if (scheduleMeta && typeof scheduleMeta === 'object') {
    try {
      localStorage.setItem('hbu_schedule_meta', JSON.stringify(scheduleMeta))
      scheduleMetaApplied = true
    } catch {
      // ignore
    }
  }

  const bySemester = (data?.schedule as Record<string, unknown> | undefined)?.by_semester
  if (bySemester && typeof bySemester === 'object' && !Array.isArray(bySemester)) {
    for (const [semester, rawPayload] of Object.entries(bySemester as Record<string, unknown>)) {
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
    personalInfoCached,
    scheduleMetaApplied,
    scheduleCacheWrites,
    scheduleSemesters: normalizeSemesterList(scheduleSemesters).map((item) =>
      toSafeText(typeof item === 'string' ? item : (item as { value?: unknown })?.value)
    )
  }
}
