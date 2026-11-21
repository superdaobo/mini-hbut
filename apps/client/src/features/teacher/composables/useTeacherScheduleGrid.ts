// goal-22 / T04：班级/教室课表的应用内渲染数据层。
//
// 把后端 `teacher_class_schedule_fetch` / `teacher_room_schedule_fetch` 返回的
// 归一化条目，转换成学生课表网格（`ScheduleGrid`）能直接消费的课程对象，
// 从而**完全在应用内**渲染，不再 `openExternal` 跳浏览器。
//
// 课程对象契约来自 `features/schedule/utils/course.ts` 的 `normalizeCustomCourse`：
//   { id, name, teacher, room, room_code, building,
//     weekday(1-7), period(1-11), djs(跨度), weeks[], weeks_text,
//     credit, class_name, semester, source_id }
import { computed, ref } from 'vue'
import { fetchTeacherClassSchedule, fetchTeacherRoomSchedule } from '../api/teacherApi'
import { getCourseStyle } from '../../schedule/utils/layout'

/** 后端返回的课表条目（`class_schedule.rs` 归一化后）。 */
export interface TeacherScheduleEntry {
  courseName?: string | null
  teacherName?: string | null
  roomName?: string | null
  roomNames?: string[] | null
  buildingName?: string | null
  weekday?: number | null
  startSection?: number | null
  spanSections?: number | null
  weeks?: number[] | null
  weekText?: string | null
  classNo?: string | null
  credits?: number | null
  hours?: number | null
  courseType?: string | null
  campus?: string | null
}

/** 网格课程对象（与 `normalizeCustomCourse` 对齐）。 */
export interface GridCourse {
  id: string
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
  source_id: string
  /** 同节多教室时的完整列表（网格里显示第一个 + 等 N 间） */
  roomNames: string[]
  courseType: string
}

/** 条目 → 网格课程。 */
export const toGridCourse = (
  entry: TeacherScheduleEntry,
  semester: string,
  index: number
): GridCourse => {
  const rooms = Array.isArray(entry.roomNames) ? entry.roomNames.filter(Boolean) : []
  const primaryRoom = entry.roomName || rooms[0] || ''
  // 多教室（同课不同教学班分班上课）时，卡片上只显示首个 + 「等 N 间」，
  // 避免两个块并排挤在同一时段（用户反馈「排布太丑」）。
  const roomLabel =
    rooms.length > 1 ? `${primaryRoom} 等${rooms.length}间` : primaryRoom
  const weekday = Number(entry.weekday) || 1
  const period = Math.min(Math.max(Number(entry.startSection) || 1, 1), 11)
  const span = Math.max(1, Number(entry.spanSections) || 1)
  return {
    id: `${entry.classNo || 'x'}-${weekday}-${period}-${index}`,
    name: entry.courseName || '',
    teacher: entry.teacherName || '',
    room: roomLabel,
    room_code: roomLabel,
    building: entry.buildingName || '',
    weekday,
    period,
    djs: span,
    weeks: Array.isArray(entry.weeks) ? entry.weeks : [],
    weeks_text: entry.weekText || '',
    credit: entry.credits != null ? String(entry.credits) : '',
    class_name: entry.classNo || '',
    semester,
    source_id: entry.classNo || '',
    roomNames: rooms.length > 0 ? rooms : primaryRoom ? [primaryRoom] : [],
    courseType: entry.courseType || ''
  }
}

/** 当前周的 7 天（周一起），供网格表头显示日期。 */
export const buildWeekDates = (anchor: Date = new Date()) => {
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const dow = base.getDay() === 0 ? 7 : base.getDay()
  const monday = new Date(base)
  monday.setDate(base.getDate() - (dow - 1))
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + index)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    return {
      iso,
      date: String(d.getDate()),
      month: d.getMonth() + 1,
      dayOfWeek: index + 1,
      label: labels[index]
    }
  })
}

export type TeacherScheduleKind = 'class' | 'room'

/**
 * 班级/教室课表数据源。
 *
 * - `kind` 决定调哪个命令
 * - `load(encodeId, semester, campusId)` 拉取并转成网格课程
 * - 空数组是**正常结果**（该班级/教室本学期没课），不是错误
 */
export const useTeacherScheduleGrid = () => {
  const kind = ref<TeacherScheduleKind>('class')
  const loading = ref(false)
  const error = ref('')
  const entries = ref<TeacherScheduleEntry[]>([])
  const semester = ref('')
  const selectedName = ref('')
  const lastLoadedAt = ref('')

  const courses = computed<GridCourse[]>(() =>
    entries.value.map((entry, index) => toGridCourse(entry, semester.value, index))
  )

  /** 按星期分组（1-7 → 该天课程），供 `ScheduleGrid` 的 `getCoursesForDay`。 */
  const coursesByDay = computed<Record<number, GridCourse[]>>(() => {
    const map: Record<number, GridCourse[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
    for (const course of courses.value) {
      const day = course.weekday >= 1 && course.weekday <= 7 ? course.weekday : 1
      map[day].push(course)
    }
    for (const day of Object.keys(map)) {
      map[Number(day)].sort((a, b) => a.period - b.period)
    }
    return map
  })

  const getCoursesForDay = (dayIndex: number | string): GridCourse[] => {
    const day = Number(dayIndex)
    return coursesByDay.value[day] || []
  }

  const getCourseStyleFor = (course: GridCourse): Record<string, unknown> =>
    getCourseStyle(course, 'modern')

  const load = async (params: {
    kind: TeacherScheduleKind
    encodeId: string
    semester?: string | null
    campusId?: string | null
    displayName?: string
  }): Promise<void> => {
    kind.value = params.kind
    if (!params.encodeId) {
      error.value = ''
      entries.value = []
      return
    }
    loading.value = true
    error.value = ''
    semester.value = params.semester || ''
    selectedName.value = params.displayName || ''
    try {
      const state =
        params.kind === 'class'
          ? await fetchTeacherClassSchedule({
              encodeId: params.encodeId,
              semester: params.semester || undefined,
              campusId: params.campusId || undefined
            })
          : await fetchTeacherRoomSchedule({
              encodeId: params.encodeId,
              semester: params.semester || undefined,
              campusId: params.campusId || undefined
            })
      if (state.error) {
        error.value = state.error.message || '加载失败'
        entries.value = []
        return
      }
      const payload = (state.data || {}) as Record<string, unknown>
      entries.value = Array.isArray(payload.entries)
        ? (payload.entries as TeacherScheduleEntry[])
        : []
      semester.value = String(payload.semester || semester.value || '')
      lastLoadedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      entries.value = []
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    entries.value = []
    error.value = ''
    selectedName.value = ''
    lastLoadedAt.value = ''
  }

  return {
    kind,
    loading,
    error,
    entries,
    courses,
    coursesByDay,
    semester,
    selectedName,
    lastLoadedAt,
    getCoursesForDay,
    getCourseStyleFor,
    load,
    reset
  }
}
