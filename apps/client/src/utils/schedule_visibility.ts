/**
 * 教务课程可见性（Issue #867）。
 *
 * 这里保存的是“Mini-HBUT 是否展示某门教务课程”的用户偏好，不修改教务系统
 * 原始课表，也不删除 schedule cache。所有需要“有效课表”的消费者都应复用
 * filterVisibleOfficialCourses()，避免课表、首页、Widget、导出、提醒各自实现一套规则。
 */

export const SCHEDULE_VISIBILITY_STORAGE_PREFIX = 'hbu_schedule_visibility_v1:'
export const SCHEDULE_VISIBILITY_CHANGED_EVENT = 'hbu:schedule-visibility-changed'
export const SCHEDULE_VISIBILITY_VERSION = 2

export interface OfficialCourseSnapshot {
  id: string
  source_id: string
  raw_course_id: string
  course_code: string
  name: string
  teacher: string
  room: string
  room_code: string
  building: string
  weekday: number
  period: number
  djs: number
  weeks: number[]
  weeks_text: string
  credit: string
  class_name: string
  semester: string
}

export interface RemovedOfficialCourseRecord {
  key: string
  source_ids: string[]
  representative: OfficialCourseSnapshot
  instances: OfficialCourseSnapshot[]
  removed_at: number
}

export interface RemovedOfficialCourseWeekRecord extends RemovedOfficialCourseRecord {
  removed_weeks: number[]
}

export interface ScheduleVisibilitySnapshot {
  version: number
  updated_at: number
  by_semester: Record<string, RemovedOfficialCourseRecord[]>
  by_semester_weeks: Record<string, RemovedOfficialCourseWeekRecord[]>
}

const text = (value: unknown): string => String(value ?? '').trim()
const canonicalText = (value: unknown): string =>
  text(value).replace(/\s+/g, ' ').toLocaleLowerCase()

const toPositiveInt = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

const normalizeWeeks = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0))]
    .sort((a, b) => a - b)
}

const formatWeeksText = (weeks: unknown): string => {
  const values = normalizeWeeks(weeks)
  if (!values.length) return ''
  const ranges: string[] = []
  let start = values[0]
  let prev = values[0]
  for (let i = 1; i < values.length; i += 1) {
    const current = values[i]
    if (current === prev + 1) {
      prev = current
      continue
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = current
    prev = current
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
  return `${ranges.join(',')}周`
}

const pickSourceId = (course: any): string => text(
  course?.raw_course_id ||
  course?.rawCourseId ||
  course?.course_id ||
  course?.courseId ||
  course?.source_id ||
  course?.sourceId ||
  course?.id
)

const pickCourseCode = (course: any): string => text(
  course?.course_code ||
  course?.courseCode ||
  course?.kcbh ||
  course?.kch ||
  course?.course_no ||
  course?.courseNo
)

const pickClassName = (course: any): string => text(
  course?.class_name ||
  course?.className ||
  course?.jxbzc
)

/**
 * 整门教务课程身份。
 *
 * 教务接口中的 id 可能是某个排课条目的 id，因此不能只依赖 id，否则同一课程在
 * 周二/周四两个时段会被当成两门课。优先使用课程号 + 教学班；没有课程号时使用
 * 教学班 + 课程名；老数据再退化到课程名 + 教师 + 学分，并把 source id 作为额外
 * 匹配兜底。
 */
export const buildOfficialCourseIdentityKey = (course: any): string => {
  if (!course || typeof course !== 'object') return ''
  const code = canonicalText(pickCourseCode(course))
  const className = canonicalText(pickClassName(course))
  const name = canonicalText(course?.name || course?.course_name || course?.kcmc)
  const teacher = canonicalText(course?.teacher || course?.teacher_name || course?.tmc || course?.xm)
  const credit = canonicalText(course?.credit || course?.xf)
  const sourceId = canonicalText(pickSourceId(course))

  if (code) return `code:${code}|class:${className}|name:${name}`
  if (className) return `class:${className}|name:${name}`
  if (name && (teacher || credit)) return `name:${name}|teacher:${teacher}|credit:${credit}`
  if (name && sourceId) return `name:${name}|source:${sourceId}`
  return sourceId ? `source:${sourceId}` : ''
}

export const normalizeOfficialCourseSnapshot = (
  course: any,
  semester = ''
): OfficialCourseSnapshot | null => {
  if (!course || typeof course !== 'object' || course?.is_custom) return null
  const name = text(course?.name || course?.course_name || course?.kcmc)
  if (!name) return null
  const sourceId = pickSourceId(course)
  return {
    id: text(course?.id || sourceId),
    source_id: text(course?.source_id || course?.sourceId || sourceId),
    raw_course_id: text(course?.raw_course_id || course?.rawCourseId || sourceId),
    course_code: pickCourseCode(course),
    name,
    teacher: text(course?.teacher || course?.teacher_name || course?.tmc || course?.xm),
    room: text(course?.room || course?.location || course?.room_code),
    room_code: text(course?.room_code || course?.roomCode || course?.room),
    building: text(course?.building),
    weekday: toPositiveInt(course?.weekday, 1),
    period: toPositiveInt(course?.period, 1),
    djs: toPositiveInt(course?.djs || course?.periods, 1),
    weeks: normalizeWeeks(course?.weeks),
    weeks_text: text(course?.weeks_text),
    credit: text(course?.credit || course?.xf),
    class_name: pickClassName(course),
    semester: text(course?.semester || semester)
  }
}

const emptySnapshot = (): ScheduleVisibilitySnapshot => ({
  version: SCHEDULE_VISIBILITY_VERSION,
  updated_at: 0,
  by_semester: {},
  by_semester_weeks: {}
})

const normalizeRecord = (
  raw: unknown,
  semester: string
): RemovedOfficialCourseRecord | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const item = raw as Record<string, unknown>
  const representative = normalizeOfficialCourseSnapshot(item.representative, semester)
  if (!representative) return null
  const key = text(item.key) || buildOfficialCourseIdentityKey(representative)
  if (!key) return null

  const instances = Array.isArray(item.instances)
    ? item.instances
      .map((course) => normalizeOfficialCourseSnapshot(course, semester))
      .filter((course): course is OfficialCourseSnapshot => !!course)
    : []
  const instanceList = instances.length ? instances : [representative]
  const sourceIds = new Set<string>()
  if (Array.isArray(item.source_ids)) {
    item.source_ids.forEach((id) => {
      const normalized = text(id)
      if (normalized) sourceIds.add(normalized)
    })
  }
  instanceList.forEach((course) => {
    const id = pickSourceId(course)
    if (id) sourceIds.add(id)
  })
  const removedAt = Number(item.removed_at)

  return {
    key,
    source_ids: [...sourceIds],
    representative,
    instances: instanceList,
    removed_at: Number.isFinite(removedAt) && removedAt > 0 ? removedAt : 0
  }
}

const normalizeWeekRecord = (
  raw: unknown,
  semester: string
): RemovedOfficialCourseWeekRecord | null => {
  const base = normalizeRecord(raw, semester)
  if (!base || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const removedWeeks = normalizeWeeks((raw as Record<string, unknown>).removed_weeks)
  if (!removedWeeks.length) return null
  return {
    ...base,
    removed_weeks: removedWeeks
  }
}

export const normalizeScheduleVisibilitySnapshot = (
  raw: unknown
): ScheduleVisibilitySnapshot | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const data = raw as Record<string, unknown>
  const rawBySemester = data.by_semester
  if (!rawBySemester || typeof rawBySemester !== 'object' || Array.isArray(rawBySemester)) {
    return null
  }

  const bySemester: Record<string, RemovedOfficialCourseRecord[]> = {}
  for (const [semesterRaw, recordsRaw] of Object.entries(rawBySemester as Record<string, unknown>)) {
    const semester = text(semesterRaw)
    if (!semester || !Array.isArray(recordsRaw)) continue
    const dedup = new Map<string, RemovedOfficialCourseRecord>()
    recordsRaw.forEach((item) => {
      const record = normalizeRecord(item, semester)
      if (record) dedup.set(record.key, record)
    })
    bySemester[semester] = [...dedup.values()]
  }

  const bySemesterWeeks: Record<string, RemovedOfficialCourseWeekRecord[]> = {}
  const rawBySemesterWeeks = data.by_semester_weeks
  if (rawBySemesterWeeks && typeof rawBySemesterWeeks === 'object' && !Array.isArray(rawBySemesterWeeks)) {
    for (const [semesterRaw, recordsRaw] of Object.entries(rawBySemesterWeeks as Record<string, unknown>)) {
      const semester = text(semesterRaw)
      if (!semester || !Array.isArray(recordsRaw)) continue
      const dedup = new Map<string, RemovedOfficialCourseWeekRecord>()
      recordsRaw.forEach((item) => {
        const record = normalizeWeekRecord(item, semester)
        if (record) dedup.set(record.key, record)
      })
      bySemesterWeeks[semester] = [...dedup.values()]
    }
  }

  const updatedAt = Number(data.updated_at)
  return {
    version: SCHEDULE_VISIBILITY_VERSION,
    updated_at: Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
    by_semester: bySemester,
    by_semester_weeks: bySemesterWeeks
  }
}

const storageKey = (studentId: unknown): string => {
  const sid = text(studentId)
  return sid ? `${SCHEDULE_VISIBILITY_STORAGE_PREFIX}${sid}` : ''
}

export const readScheduleVisibilitySnapshot = (
  studentId: unknown
): ScheduleVisibilitySnapshot => {
  const key = storageKey(studentId)
  if (!key || typeof localStorage === 'undefined') return emptySnapshot()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return emptySnapshot()
    return normalizeScheduleVisibilitySnapshot(JSON.parse(raw)) || emptySnapshot()
  } catch {
    return emptySnapshot()
  }
}

const emitVisibilityChanged = (
  studentId: unknown,
  semester: unknown,
  action: 'remove' | 'restore' | 'replace'
): void => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(SCHEDULE_VISIBILITY_CHANGED_EVENT, {
      detail: {
        studentId: text(studentId),
        semester: text(semester),
        action
      }
    }))
  } catch {
    // 非浏览器测试环境中静默降级。
  }
}

const writeScheduleVisibilitySnapshot = (
  studentId: unknown,
  snapshot: ScheduleVisibilitySnapshot,
  action: 'remove' | 'restore' | 'replace',
  semester = ''
): ScheduleVisibilitySnapshot => {
  const key = storageKey(studentId)
  const normalized = normalizeScheduleVisibilitySnapshot(snapshot) || emptySnapshot()
  normalized.updated_at = Date.now()
  if (key && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(normalized))
  }
  emitVisibilityChanged(studentId, semester, action)
  return normalized
}

const listFullyRemovedOfficialCourses = (
  studentId: unknown,
  semester = ''
): RemovedOfficialCourseRecord[] => {
  const snapshot = readScheduleVisibilitySnapshot(studentId)
  const sem = text(semester)
  if (sem) return [...(snapshot.by_semester[sem] || [])]
  return Object.values(snapshot.by_semester).flatMap((records) => records || [])
}

const listWeekRemovedOfficialCourses = (
  studentId: unknown,
  semester = ''
): RemovedOfficialCourseWeekRecord[] => {
  const snapshot = readScheduleVisibilitySnapshot(studentId)
  const sem = text(semester)
  if (sem) return [...(snapshot.by_semester_weeks[sem] || [])]
  return Object.values(snapshot.by_semester_weeks).flatMap((records) => records || [])
}

export const listRemovedOfficialCourses = (
  studentId: unknown,
  semester = ''
): Array<RemovedOfficialCourseRecord | RemovedOfficialCourseWeekRecord> => [
  ...listFullyRemovedOfficialCourses(studentId, semester),
  ...listWeekRemovedOfficialCourses(studentId, semester)
]

const recordMatchesCourse = (
  record: RemovedOfficialCourseRecord,
  course: any
): boolean => {
  const identity = buildOfficialCourseIdentityKey(course)
  if (identity && record.key === identity) return true
  const sourceId = pickSourceId(course)
  return !!sourceId && record.source_ids.includes(sourceId)
}

export const isOfficialCourseRemoved = (
  studentId: unknown,
  semester: unknown,
  course: any
): boolean => {
  if (!course || course?.is_custom) return false
  const sem = text(semester)
  // 学期未知时宁可暂时显示，也不能跨学期用相同课程身份误隐藏。
  if (!sem) return false
  const records = listFullyRemovedOfficialCourses(studentId, sem)
  return records.some((record) => recordMatchesCourse(record, course))
}

export const filterVisibleOfficialCourses = <T = any>(
  studentId: unknown,
  semester: unknown,
  courses: T[]
): T[] => {
  const source = Array.isArray(courses) ? courses : []
  const sem = text(semester)
  if (!sem) return source.slice()
  const fullRecords = listFullyRemovedOfficialCourses(studentId, sem)
  const weekRecords = listWeekRemovedOfficialCourses(studentId, sem)
  if (!fullRecords.length && !weekRecords.length) return source.slice()

  return source.flatMap((course: any) => {
    if (course?.is_custom) return [course as T]
    if (fullRecords.some((record) => recordMatchesCourse(record, course))) return []

    const removedWeeks = new Set(
      weekRecords
        .filter((record) => recordMatchesCourse(record, course))
        .flatMap((record) => record.removed_weeks)
    )
    if (!removedWeeks.size) return [course as T]

    const weeks = normalizeWeeks(course?.weeks)
    if (!weeks.length) return [course as T]
    const visibleWeeks = weeks.filter((week) => !removedWeeks.has(week))
    if (visibleWeeks.length === weeks.length) return [course as T]
    if (!visibleWeeks.length) return []

    return [{
      ...course,
      weeks: visibleWeeks,
      weeks_text: formatWeeksText(visibleWeeks)
    } as T]
  })
}

export const removeOfficialCourseFromSchedule = (
  studentId: unknown,
  semester: unknown,
  selectedCourse: any,
  officialCourses: any[] = [],
  options: { mode?: 'all' | 'current_week'; currentWeek?: unknown } = {}
): RemovedOfficialCourseRecord | RemovedOfficialCourseWeekRecord | null => {
  const sid = text(studentId)
  const sem = text(semester)
  const selected = normalizeOfficialCourseSnapshot(selectedCourse, sem)
  const key = buildOfficialCourseIdentityKey(selectedCourse)
  if (!sid || !sem || !selected || !key) return null

  const source = Array.isArray(officialCourses) ? officialCourses : []
  const matched = source
    .filter((course) => !course?.is_custom && buildOfficialCourseIdentityKey(course) === key)
    .map((course) => normalizeOfficialCourseSnapshot(course, sem))
    .filter((course): course is OfficialCourseSnapshot => !!course)
  const instances = matched.length ? matched : [selected]
  const sourceIds = [...new Set(instances.map((course) => pickSourceId(course)).filter(Boolean))]
  const record: RemovedOfficialCourseRecord = {
    key,
    source_ids: sourceIds,
    representative: selected,
    instances,
    removed_at: Date.now()
  }

  const snapshot = readScheduleVisibilitySnapshot(sid)
  const mode = options.mode === 'current_week' ? 'current_week' : 'all'

  if (mode === 'current_week') {
    const currentWeek = toPositiveInt(options.currentWeek)
    if (!currentWeek) return null
    const courseWeeks = new Set(instances.flatMap((course) => normalizeWeeks(course.weeks)))
    if (!courseWeeks.has(currentWeek)) return null
    if ((snapshot.by_semester[sem] || []).some((item) => item.key === key)) return null

    const current = snapshot.by_semester_weeks[sem] || []
    const existing = current.find((item) => item.key === key)
    const weekRecord: RemovedOfficialCourseWeekRecord = {
      ...record,
      removed_weeks: normalizeWeeks([...(existing?.removed_weeks || []), currentWeek])
    }
    snapshot.by_semester_weeks[sem] = [
      ...current.filter((item) => item.key !== key),
      weekRecord
    ]
    writeScheduleVisibilitySnapshot(sid, snapshot, 'remove', sem)
    return weekRecord
  }

  const current = snapshot.by_semester[sem] || []
  snapshot.by_semester[sem] = [
    ...current.filter((item) => item.key !== key),
    record
  ]
  const weekCurrent = snapshot.by_semester_weeks[sem] || []
  const weekNext = weekCurrent.filter((item) => item.key !== key)
  if (weekNext.length) snapshot.by_semester_weeks[sem] = weekNext
  else delete snapshot.by_semester_weeks[sem]
  writeScheduleVisibilitySnapshot(sid, snapshot, 'remove', sem)
  return record
}

export const restoreOfficialCourseToSchedule = (
  studentId: unknown,
  semester: unknown,
  recordOrKey: RemovedOfficialCourseRecord | RemovedOfficialCourseWeekRecord | string
): boolean => {
  const sid = text(studentId)
  const sem = text(semester)
  const key = typeof recordOrKey === 'string' ? text(recordOrKey) : text(recordOrKey?.key)
  if (!sid || !sem || !key) return false

  const snapshot = readScheduleVisibilitySnapshot(sid)
  const isWeekRecord = typeof recordOrKey !== 'string' &&
    Array.isArray((recordOrKey as RemovedOfficialCourseWeekRecord)?.removed_weeks)

  if (isWeekRecord) {
    const current = snapshot.by_semester_weeks[sem] || []
    const next = current.filter((record) => record.key !== key)
    if (next.length === current.length) return false
    if (next.length) snapshot.by_semester_weeks[sem] = next
    else delete snapshot.by_semester_weeks[sem]
    writeScheduleVisibilitySnapshot(sid, snapshot, 'restore', sem)
    return true
  }

  const current = snapshot.by_semester[sem] || []
  const next = current.filter((record) => record.key !== key)
  if (next.length === current.length) return false
  if (next.length) snapshot.by_semester[sem] = next
  else delete snapshot.by_semester[sem]
  writeScheduleVisibilitySnapshot(sid, snapshot, 'restore', sem)
  return true
}

/**
 * 云同步读取：显式返回空 by_semester，空集合代表用户当前没有隐藏课程。
 */
export const buildScheduleVisibilityCloudSnapshot = (
  studentId: unknown
): ScheduleVisibilitySnapshot => {
  return readScheduleVisibilitySnapshot(studentId)
}

/**
 * 云同步应用：字段缺失由调用方决定“保留本地”；一旦调用到这里，必须是完整替换。
 * 格式损坏返回 false，不允许把损坏数据解释为空集合后误清本地状态。
 */
export const replaceScheduleVisibilityFromCloud = (
  studentId: unknown,
  raw: unknown
): boolean => {
  const normalized = normalizeScheduleVisibilitySnapshot(raw)
  if (!normalized) return false

  // 旧客户端上传的 v1 snapshot 没有按周字段。此时保留本地按周隐藏偏好；
  // 新客户端显式上传 by_semester_weeks（即使为空对象）才视为完整替换。
  const hasWeekSection = !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.prototype.hasOwnProperty.call(raw, 'by_semester_weeks')
  if (!hasWeekSection) {
    normalized.by_semester_weeks = readScheduleVisibilitySnapshot(studentId).by_semester_weeks
  }

  writeScheduleVisibilitySnapshot(studentId, normalized, 'replace')
  return true
}

export const buildEffectiveSchedule = <T = any>(
  studentId: unknown,
  semester: unknown,
  officialCourses: T[],
  customCourses: T[] = []
): T[] => {
  return [
    ...filterVisibleOfficialCourses(studentId, semester, officialCourses),
    ...(Array.isArray(customCourses) ? customCourses : [])
  ]
}
