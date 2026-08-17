/**
 * cloud_sync 学业快照构建模块：成绩 / 考试 / 课表 / 排名 / 个人信息快照的
 * 归一化与缓存读写。存储工具在 ./cloud_sync_storage.ts，编排在 ./cloud_sync.ts。
 */
import { clearCacheByPrefix, setCachedData } from './api.js'
import {
  extractDataArray,
  extractSuffixFromKey,
  isNonEmptyObject,
  normalizeSemesterFromText,
  pruneValue,
  readCacheEntry,
  readCachedEntriesByPrefix,
  readLatestCacheObject,
  safeParseJson,
  stableStringify,
  toArrayOfObjects,
  toSafeText,
  discoverSemestersFromCache
} from './cloud_sync_storage.js'

const pickCourseId = (item: Record<string, unknown>): string => toSafeText(
  item?.course_id ||
  item?.courseId ||
  item?.kcid ||
  item?.kch_id ||
  item?.kch ||
  item?.course_code ||
  item?.courseCode ||
  item?.source_id ||
  item?.sourceId ||
  item?.id
)

const pickCourseCode = (item: Record<string, unknown>): string => toSafeText(
  item?.course_code ||
  item?.courseCode ||
  item?.kcbh ||
  item?.kch ||
  item?.course_no ||
  item?.courseNo
)

const deriveGradeSemester = (item: Record<string, unknown> | null | undefined, fallback = ''): string => {
  if (!item || typeof item !== 'object') return toSafeText(fallback)
  const direct = normalizeSemesterFromText(item?.semester || item?.xnxq || item?.term || item?.xq)
  if (direct) return direct
  const xn = toSafeText(item?.xnmmc || item?.school_year)
  const xq = toSafeText(item?.xqmmc || item?.term_name || item?.semester_name)
  const merged = normalizeSemesterFromText(`${xn}-${xq}`)
  return merged || toSafeText(fallback)
}

const normalizeGradeItem = (
  item: unknown,
  fallbackSemester = ''
): Record<string, unknown> | null => {
  const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
  if (!raw) return null
  const term = deriveGradeSemester(raw, fallbackSemester)
  const courseName = toSafeText(raw?.course_name || raw?.name || raw?.kcmc)
  if (!courseName) return null
  return pruneValue({
    ...raw,
    term,
    course_name: courseName,
    grade_id: toSafeText(raw?.grade_id || raw?.gradeId || raw?.id),
    course_id: toSafeText(raw?.course_id || raw?.courseId || raw?.kcid || raw?.kch_id || raw?.kch),
    course_code: toSafeText(raw?.course_code || raw?.courseCode || raw?.kcbh || raw?.kch),
    course_nature: toSafeText(raw?.course_nature || raw?.courseNature || raw?.kcxzmc || raw?.kcxz),
    course_nature_code: toSafeText(raw?.course_nature_code || raw?.courseNatureCode || raw?.kcxz),
    course_credit: toSafeText(raw?.course_credit || raw?.courseCredit || raw?.xf),
    final_score: toSafeText(raw?.final_score || raw?.finalScore || raw?.score || raw?.zhcj || raw?.cj),
    earned_credit: toSafeText(raw?.earned_credit || raw?.earnedCredit || raw?.hdxf || raw?.jd),
    xfjd: toSafeText(raw?.xfjd || raw?.creditGradePoint || raw?.gpa || raw?.fxcj),
    sfbk: toSafeText(raw?.sfbk),
    sfsq: toSafeText(raw?.sfsq),
    cjbj: toSafeText(raw?.cjbj),
    course_teacher: toSafeText(raw?.course_teacher || raw?.courseTeacher || raw?.rkjs),
    teacher: toSafeText(raw?.teacher || raw?.teacher_name || raw?.jsxm || raw?.cjlrjsxm)
  }) as Record<string, unknown> | null
}

const makeGradeFingerprint = (item: Record<string, unknown>, semester = ''): string => {
  const sem = toSafeText(semester) || deriveGradeSemester(item)
  const name = toSafeText(item?.course_name || item?.name || item?.kcmc)
  const score = toSafeText(item?.score || item?.final_score || item?.zcj || item?.cj)
  const credit = toSafeText(item?.credit || item?.xf || item?.course_credit)
  const gradeId = toSafeText(item?.grade_id || item?.gradeId || item?.id)
  const code = toSafeText(item?.course_code || item?.courseCode || item?.kch)
  return `${sem}|${gradeId}|${code}|${name}|${score}|${credit}`
}

interface GradeSnapshot {
  all: Array<Record<string, unknown>>
  bySemester: Record<string, Array<Record<string, unknown>>>
}

const accumulateGradeSnapshot = (
  sourceEntries: Array<{ semester: string; list: Array<Record<string, unknown>> }>
): GradeSnapshot => {
  const all: Array<Record<string, unknown>> = []
  const bySemester: Record<string, Array<Record<string, unknown>>> = {}
  const seen = new Set<string>()
  sourceEntries.forEach(({ semester, list }) => {
    list.forEach((item) => {
      const normalized = normalizeGradeItem(item, semester)
      if (!normalized) return
      const sem = deriveGradeSemester(normalized, semester)
      const fp = makeGradeFingerprint(normalized, sem)
      if (seen.has(fp)) return
      seen.add(fp)
      all.push(normalized)
      if (sem) {
        if (!Array.isArray(bySemester[sem])) {
          bySemester[sem] = []
        }
        bySemester[sem].push(normalized)
      }
    })
  })
  return {
    all,
    bySemester
  }
}

/**
 * 构建成绩快照。
 * 三态语义：
 * - latestGrades 为 Array（含空数组 []）：视作教务完整权威列表，仅基于它构建，不并本地缓存
 * - latestGrades 为 undefined/null/非数组：无权威列表，回退本地 grades:{sid}* 拼快照（离线上传）
 * 注意：默认参数不能是 []，否则会把「未提供」误判为「权威为空」。
 */
const buildGradeSnapshot = (
  studentId: unknown,
  latestGrades: unknown = undefined
): GradeSnapshot => {
  const sid = toSafeText(studentId)
  const prefix = `grades:${sid}`
  const hasAuthoritativeList = Array.isArray(latestGrades)
  const sourceEntries: Array<{ semester: string; list: Array<Record<string, unknown>> }> = []
  if (hasAuthoritativeList) {
    sourceEntries.push({
      semester: '',
      list: toArrayOfObjects(latestGrades)
    })
    return accumulateGradeSnapshot(sourceEntries)
  }
  readCachedEntriesByPrefix(prefix).forEach((entry) => {
    sourceEntries.push({
      semester: normalizeSemesterFromText(extractSuffixFromKey(entry.key, prefix)),
      list: toArrayOfObjects(extractDataArray(entry.data))
    })
  })
  return accumulateGradeSnapshot(sourceEntries)
}

/** 用权威成绩列表整表替换本地 grades 缓存（含学期分片），清除陈旧 key。允许空数组清空。 */
const replaceAuthoritativeGradeCaches = (
  studentId: unknown,
  grades: unknown = []
): GradeSnapshot => {
  const sid = toSafeText(studentId)
  if (!sid) return { all: [], bySemester: {} }
  const list = toArrayOfObjects(grades)
  // 直接按权威列表累积，避免再走「无列表回退本地」分支。
  const gradesSnapshot = accumulateGradeSnapshot([{ semester: '', list }])
  // 先清掉同前缀分片，避免教务已删除学期/成绩残留。
  clearCacheByPrefix(`grades:${sid}`)
  setCachedData(`grades:${sid}`, { success: true, data: gradesSnapshot.all })
  Object.entries(gradesSnapshot.bySemester).forEach(([semester, semesterList]) => {
    const sem = normalizeSemesterFromText(semester)
    const gradeList = toArrayOfObjects(semesterList)
    if (!sem || !gradeList.length) return
    setCachedData(`grades:${sid}:${sem}`, { success: true, data: gradeList })
  })
  return gradesSnapshot
}

const normalizePersonalInfoPayload = (
  payload: unknown,
  fallbackStudentId = ''
): Record<string, unknown> | null => {
  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const source =
    raw?.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : raw
  if (!source || typeof source !== 'object') return null
  const normalized = pruneValue({
    student_id: toSafeText(source?.student_id || source?.studentId || fallbackStudentId),
    name: toSafeText(source?.name || source?.student_name || source?.studentName),
    gender: toSafeText(source?.gender),
    birth_date: toSafeText(source?.birth_date || source?.birthDate),
    ethnicity: toSafeText(source?.ethnicity),
    college: toSafeText(source?.college),
    major: toSafeText(source?.major),
    class_name: toSafeText(source?.class_name || source?.className),
    grade: toSafeText(source?.grade || source?.grade_year || source?.gradeYear),
    duration: toSafeText(source?.duration),
    enrollment_date: toSafeText(source?.enrollment_date || source?.enrollmentDate)
  })
  if (!normalized || typeof normalized !== 'object') return null
  const record = normalized as Record<string, unknown>
  if (!record.student_id && !record.name) return null
  return record
}

const buildPersonalInfoSnapshot = (studentId: unknown): Record<string, unknown> => {
  const sid = toSafeText(studentId)
  const direct = readCacheEntry(`studentinfo:${sid}`)?.data
  const legacy = readCacheEntry(`student_info:${sid}`)?.data
  return normalizePersonalInfoPayload(direct, sid) || normalizePersonalInfoPayload(legacy, sid) || {}
}

const extractRankingObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (isNonEmptyObject(raw?.data)) return raw.data as Record<string, unknown>
  if (isNonEmptyObject(raw)) return raw
  return null
}

const buildRankingSnapshot = (studentId: unknown): {
  current: Record<string, unknown> | null
  bySemester: Record<string, Record<string, unknown>>
} => {
  const sid = toSafeText(studentId)
  const prefix = `ranking:${sid}`
  const bySemester: Record<string, Record<string, unknown>> = {}
  readCachedEntriesByPrefix(prefix).forEach((entry) => {
    const fromKey = normalizeSemesterFromText(extractSuffixFromKey(entry.key, prefix))
    const rankingObj = extractRankingObject(entry.data)
    if (!rankingObj) return
    const sem = normalizeSemesterFromText(rankingObj?.semester) || (fromKey || 'all')
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

const normalizeScheduleCourseItem = (item: unknown): Record<string, unknown> | null => {
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, unknown>
  return pruneValue({
    ...raw,
    course_id: toSafeText(raw?.course_id || raw?.courseId || raw?.id || raw?.source_id || raw?.sourceId),
    source_id: toSafeText(raw?.source_id || raw?.sourceId || raw?.id || raw?.course_id || raw?.courseId),
    raw_course_id: toSafeText(
      raw?.raw_course_id ||
      raw?.rawCourseId ||
      raw?.course_id ||
      raw?.courseId ||
      raw?.source_id ||
      raw?.sourceId ||
      raw?.id
    )
  }) as Record<string, unknown> | null
}

const normalizeSchedulePayload = (
  rawPayload: unknown,
  semester = ''
): {
  success: boolean
  data: Array<Record<string, unknown>>
  meta: Record<string, unknown>
  offline: boolean
  sync_time: string
} | null => {
  if (!rawPayload || typeof rawPayload !== 'object') return null
  const raw = rawPayload as Record<string, unknown>
  const data = Array.isArray(raw?.data)
    ? raw.data
      .map((item) => normalizeScheduleCourseItem({
        ...(item as Record<string, unknown>),
        course_id: (item as Record<string, unknown>)?.course_id || (item as Record<string, unknown>)?.courseId || (item as Record<string, unknown>)?.id,
        source_id: (item as Record<string, unknown>)?.source_id || (item as Record<string, unknown>)?.sourceId || (item as Record<string, unknown>)?.id,
        raw_course_id: (item as Record<string, unknown>)?.raw_course_id || (item as Record<string, unknown>)?.rawCourseId || (item as Record<string, unknown>)?.course_id || (item as Record<string, unknown>)?.source_id || (item as Record<string, unknown>)?.id
      }))
      .filter((item): item is Record<string, unknown> => item !== null)
    : []
  const rawMeta = raw?.meta && typeof raw.meta === 'object' ? (raw.meta as Record<string, unknown>) : {}
  const sem = toSafeText(rawMeta?.semester || semester)
  const meta = (pruneValue({
    ...rawMeta,
    semester: sem || toSafeText(rawMeta?.semester)
  }) as Record<string, unknown>) || {}
  return {
    success: true,
    data,
    meta,
    offline: !!raw?.offline,
    sync_time: toSafeText(raw?.sync_time) || new Date().toISOString()
  }
}

const buildScheduleSnapshot = (studentId: unknown): {
  by_semester: Record<string, ReturnType<typeof normalizeSchedulePayload>>
} => {
  const sid = toSafeText(studentId)
  if (!sid) return { by_semester: {} }
  const semesters = discoverSemestersFromCache(sid)
  const bySemester: Record<string, ReturnType<typeof normalizeSchedulePayload>> = {}
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

const normalizeExamItem = (
  item: unknown,
  fallbackSemester = ''
): Record<string, unknown> | null => {
  const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
  if (!raw) return null
  const courseName = toSafeText(raw?.course_name || raw?.courseName || raw?.name || raw?.kcmc)
  const examDate = toSafeText(raw?.exam_date || raw?.examDate || raw?.date || raw?.kssj)
  const examTime = toSafeText(raw?.exam_time || raw?.examTime || raw?.time || raw?.kssjd)
  const location = toSafeText(raw?.location || raw?.room || raw?.exam_room || raw?.ksdd)
  const courseId = pickCourseId(raw)
  const courseCode = pickCourseCode(raw)
  if (!courseName && !examDate && !location) return null
  return pruneValue({
    ...raw,
    semester: normalizeSemesterFromText(raw?.semester || raw?.xnxq || fallbackSemester) || toSafeText(fallbackSemester),
    course_id: courseId,
    course_code: courseCode,
    course_name: courseName,
    exam_type: toSafeText(raw?.exam_type || raw?.examType || raw?.ksxz),
    exam_date: examDate,
    exam_time: examTime,
    location,
    seat_no: toSafeText(raw?.seat_no || raw?.seatNo || raw?.zwh),
    missing_course_id: !courseId
  }) as Record<string, unknown> | null
}

const buildExamSnapshot = (studentId: unknown): {
  all: Array<Record<string, unknown>>
  by_semester: Record<string, Array<Record<string, unknown>>>
} => {
  const sid = toSafeText(studentId)
  const prefix = `exams:${sid}`
  const entries: Array<{
    key: string
    semester: string
    data: unknown
    timestamp: number
  }> = []
  const current = readCacheEntry(`exams:${sid}:current`)
  if (current) {
    entries.push({
      key: `exams:${sid}:current`,
      semester: 'current',
      data: current.data,
      timestamp: current.timestamp
    })
  }
  readCachedEntriesByPrefix(prefix).forEach((entry) => {
    if (entry.key === `exams:${sid}:current`) return
    entries.push({
      ...entry,
      semester: normalizeSemesterFromText(extractSuffixFromKey(entry.key, prefix)) || extractSuffixFromKey(entry.key, prefix)
    })
  })
  const bySemester: Record<string, Array<Record<string, unknown>>> = {}
  const all: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  entries.forEach((entry) => {
    const sem = toSafeText(entry.semester) || 'current'
    const list = toArrayOfObjects(extractDataArray(entry.data))
    const normalized = list.map((item) => normalizeExamItem(item, sem)).filter((item): item is Record<string, unknown> => item !== null)
    if (!normalized.length) return
    bySemester[sem] = normalized
    normalized.forEach((item) => {
      const fp = stableStringify({
        semester: sem,
        course_id: item.course_id,
        course_code: item.course_code,
        course_name: item.course_name,
        exam_date: item.exam_date,
        exam_time: item.exam_time,
        location: item.location
      })
      if (seen.has(fp)) return
      seen.add(fp)
      all.push(item)
    })
  })
  return (pruneValue({
    all,
    by_semester: bySemester
  }) as { all: Array<Record<string, unknown>>; by_semester: Record<string, Array<Record<string, unknown>>> }) || { all: [], by_semester: {} }
}

const buildAcademicSnapshot = (studentId: unknown, latestGrades: unknown = []): Record<string, unknown> => {
  const sid = toSafeText(studentId)
  const gradesSnapshot = buildGradeSnapshot(sid, latestGrades)
  const rankingSnapshot = buildRankingSnapshot(sid)
  const examSnapshot = buildExamSnapshot(sid)
  const scheduleMeta = safeParseJson<Record<string, unknown>>(localStorage.getItem('hbu_schedule_meta'), {})
  return {
    grades: gradesSnapshot.all,
    grades_by_semester: gradesSnapshot.bySemester,
    ranking: rankingSnapshot.current || {},
    ranking_by_semester: rankingSnapshot.bySemester,
    exams: examSnapshot,
    personal_info: buildPersonalInfoSnapshot(sid),
    schedule_meta: scheduleMeta && typeof scheduleMeta === 'object' ? scheduleMeta : {},
    schedule: buildScheduleSnapshot(sid)
  }
}

const hasNonEmptyCourseMap = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).some((list) => Array.isArray(list) && list.length > 0)
}

const mergeCustomCourseSemesters = (customCourses: unknown): Record<string, unknown[]> => {
  if (!customCourses || typeof customCourses !== 'object' || Array.isArray(customCourses)) {
    return {}
  }
  const output: Record<string, unknown[]> = {}
  for (const [semester, list] of Object.entries(customCourses as Record<string, unknown>)) {
    const sem = toSafeText(semester)
    if (!sem || !Array.isArray(list)) continue
    const normalized = normalizeCloudCourseList(list)
    if (normalized.length > 0) {
      output[sem] = normalized
    }
  }
  return output
}

const normalizeCloudCourseList = (list: unknown[]): Array<Record<string, unknown>> => {
  return list
    .map((item) => normalizeCloudCourseItem(item))
    .filter((item): item is Record<string, unknown> => item !== null)
}

const normalizeCloudCourseItem = (raw: unknown): Record<string, unknown> | null => {
  const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!item) return null
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

export {
  buildAcademicSnapshot,
  buildGradeSnapshot,
  buildScheduleSnapshot,
  buildExamSnapshot,
  buildPersonalInfoSnapshot,
  buildRankingSnapshot,
  deriveGradeSemester,
  makeGradeFingerprint,
  hasNonEmptyCourseMap,
  mergeCustomCourseSemesters,
  normalizeGradeItem,
  normalizePersonalInfoPayload,
  normalizeSchedulePayload,
  normalizeExamItem,
  replaceAuthoritativeGradeCaches,
  pickCourseId,
  pickCourseCode,
  extractRankingObject
}
