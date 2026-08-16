/**
 * 课表领域 - 自定义课程规范化纯函数。
 * 原内联于 ScheduleView.vue（normalizeCustomCourse），拆分后行为一致。
 */
import { DEFAULT_COURSE_COLOR, normalizeOptionalCourseColor } from '../../../utils/course_color'
import { formatWeeksText, normalizeWeeks } from './weeks'

/**
 * 规范化自定义课程记录：补全默认字段、归一化周次与颜色。
 * fallbackSemester 用于课程缺少 semester 时的兜底。
 */
export const normalizeCustomCourse = (raw: any, fallbackSemester = ''): any => {
  if (!raw || typeof raw !== 'object') return null
  const weeks = normalizeWeeks(raw.weeks)
  const colorNorm = normalizeOptionalCourseColor(raw.color)
  return {
    id: String(raw.id || raw.source_id || ''),
    name: String(raw.name || '').trim(),
    teacher: String(raw.teacher || '').trim(),
    room: String(raw.room || raw.room_code || '').trim(),
    room_code: String(raw.room_code || raw.room || '').trim(),
    building: String(raw.building || '自定义').trim(),
    weekday: Number(raw.weekday || 1),
    period: Number(raw.period || 1),
    djs: Number(raw.djs || 1),
    weeks,
    weeks_text: String(raw.weeks_text || formatWeeksText(weeks)),
    credit: String(raw.credit || ''),
    class_name: String(raw.class_name || '自定义课程'),
    semester: String(raw.semester || fallbackSemester || ''),
    source_id: String(raw.source_id || raw.id || ''),
    created_at: String(raw.created_at || ''),
    updated_at: String(raw.updated_at || ''),
    // 可选用户色；#469 本地表单用，#470 持久化后由后端下发
    color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm,
    is_custom: true
  }
}
