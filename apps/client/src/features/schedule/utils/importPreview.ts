/**
 * AI 课表导入 —— 课表布局预览纯函数（Epic #815 / #821）。
 *
 * 职责：把「预览态」(`ImportPreviewCourse[]`) 与「学期元信息」转换为
 * ScheduleGrid 可直接渲染的数据，全程**纯计算、不依赖 Vue / 网络 / Tauri / DB**：
 *   - `buildPreviewWeekDates`：依据开学日与预览周推导 7 天日期头，
 *     结构与 `useScheduleSemester.weekDates` 保持一致；
 *   - `isWeekActive`：判断某课程的 weeks 是否覆盖目标周；
 *   - `toPreviewGridCourse` / `buildPreviewGridCourses`：把预览条目转成网格课程节点，
 *     并挂载 `_uid` / `_preview` / `is_conflict` 等**仅存在于内存**的临时字段。
 *
 * 关键约束：
 *   - 预览课程绝不写入数据库，本模块只产出内存对象；
 *   - 颜色单一来源：预览课程颜色取 `ImportPreviewCourse.colorOverride`；
 *   - 日期推导逻辑与 `useScheduleSemester.weekDates` 逐行对齐，**不修改**后者。
 */
import { DEFAULT_COURSE_COLOR } from '../../../utils/course_color'
import { normalizeWeeks } from './weeks'
import type { ImportPreviewCourse } from './importTypes'

/** 预览日期头单天结构（与 useScheduleSemester.weekDates 元素结构一致） */
export interface PreviewWeekDate {
  year: number
  month: number
  date: number
  iso: string
  dayLabel: string
  isToday: boolean
}

export interface BuildPreviewWeekDatesOptions {
  /** 7 天标签（周一..周日）；由调用方注入以保持本函数纯函数、可单测 */
  dayLabels?: string[]
  /** 判定 isToday 的基准时间；测试可注入固定值 */
  today?: Date
}

/**
 * 推导指定周的 7 天日期头。
 *
 * 与 `useScheduleSemester.weekDates`（L37-L62）保持完全一致的日期推进方式：
 * 以开学日为锚点，按 `(week - 1) * 7` 天整体偏移，再逐天复制。
 *
 * @param startDateStr 学期开学日（形如 '2024-09-02'）
 * @param week 目标周次（1-based）
 */
export const buildPreviewWeekDates = (
  startDateStr: string,
  week: number,
  options: BuildPreviewWeekDatesOptions = {}
): PreviewWeekDate[] => {
  const startText = String(startDateStr || '').trim()
  if (!startText) return []

  const start = new Date(startText)
  if (Number.isNaN(start.getTime())) return []

  const parsedWeek = Number(week)
  const safeWeek = Number.isFinite(parsedWeek) && parsedWeek > 0 ? Math.round(parsedWeek) : 1
  start.setDate(start.getDate() + (safeWeek - 1) * 7)

  const dayLabels = Array.isArray(options.dayLabels) ? options.dayLabels : []
  const today = options.today instanceof Date ? options.today : new Date()

  const dates: PreviewWeekDate[] = []
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    dates.push({
      year: yyyy,
      month: d.getMonth() + 1,
      date: d.getDate(),
      iso: `${yyyy}-${mm}-${dd}`,
      dayLabel: dayLabels[i] || '',
      isToday: d.toDateString() === today.toDateString()
    })
  }
  return dates
}

/** 课程 weeks 是否覆盖目标周（归一化后判断，容忍非法输入） */
export const isWeekActive = (weeks: unknown, week: number): boolean => {
  const target = Number(week)
  if (!Number.isFinite(target)) return false
  return normalizeWeeks(weeks).includes(target)
}

/**
 * 预览课程在网格中的渲染节点。
 * `_uid` / `_preview` / `is_conflict` 为渲染期临时字段，仅存在于内存。
 */
export interface PreviewGridCourse {
  _uid: string
  _preview: true
  id: string
  name: string
  teacher: string
  room: string
  room_code: string
  period: number
  djs: number
  weekday: number
  weeks: number[]
  color: string
  is_custom: boolean
  is_conflict: boolean
}

/**
 * 把单条预览条目转成 ScheduleGrid 可渲染的课程节点。
 *
 * 以下情况返回 null（不参与网格渲染）：
 *   - 未勾选（`selected === false`）；
 *   - 精确重复（`duplicateKind === 'exact'`，与默认不勾选策略一致）。
 *
 * 颜色取 `colorOverride`；为保证用户选色在卡片上真正生效，
 * 节点按「自定义课程」渲染（`is_custom`），与导入后落库为 custom 课程的语义一致。
 */
export const toPreviewGridCourse = (item: ImportPreviewCourse): PreviewGridCourse | null => {
  if (!item || !item.selected) return null
  if (item.duplicateKind === 'exact') return null

  const course = item.course
  const color = String(item.colorOverride || DEFAULT_COURSE_COLOR || '').trim()
  const uid = `import-${course.sourceIndex}`

  return {
    _uid: uid,
    _preview: true,
    id: uid,
    name: course.name,
    teacher: course.teacher,
    room: course.room,
    room_code: course.room,
    period: course.period,
    djs: course.djs,
    weekday: course.weekday,
    weeks: Array.isArray(course.weeks) ? [...course.weeks] : [],
    color,
    is_custom: !!color,
    // 冲突可视化复用 ScheduleGrid 内置能力：is_conflict 为真即渲染冲突卡片
    is_conflict: item.conflicts.length > 0
  }
}

/** 批量转换预览条目，过滤掉不可渲染项（未勾选 / 精确重复） */
export const buildPreviewGridCourses = (items: ImportPreviewCourse[]): PreviewGridCourse[] => {
  if (!Array.isArray(items)) return []
  const nodes: PreviewGridCourse[] = []
  for (const item of items) {
    const node = toPreviewGridCourse(item)
    if (node) nodes.push(node)
  }
  return nodes
}
