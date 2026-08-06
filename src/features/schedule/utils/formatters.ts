/**
 * 课表领域 - 展示文本/剪贴板纯函数。
 * 原内联于 ScheduleView.vue（格式化倒计时/地点/时间/详情文本/复制兜底）。
 */
import { getCourseEndPeriod } from './layout'

/** 同步冷却倒计时文本；ms<=0 时返回「可立即同步」 */
export const formatCooldownText = (value: any): string => {
  const ms = Number(value || 0)
  if (ms <= 0) return '可立即同步'
  const sec = Math.ceil(ms / 1000)
  if (sec < 60) return `${sec} 秒后可再次同步`
  const min = Math.floor(sec / 60)
  const remain = sec % 60
  return remain > 0 ? `${min}分${remain}秒后可再次同步` : `${min} 分钟后可再次同步`
}

/** 课程地点文本：校区 + 教室，空则「未填写」 */
export const buildLocationText = (course: any): string => {
  const building = String(course?.building || '').trim()
  const room = String(course?.room_code || course?.room || '').trim()
  return [building, room].filter(Boolean).join(' ') || '未填写'
}

/** 课程时间文本：周X 第a-b节 */
export const buildCourseTimeText = (course: any): string => {
  const weekday = Number(course?.weekday || 0)
  const period = Number(course?.period || 0)
  if (!weekday || !period) return '未填写'
  const endPeriod = getCourseEndPeriod(course)
  return `周${weekday} 第${period}-${endPeriod}节`
}

/** 单门课程详情文本（多行） */
export const buildSingleCourseDetailText = (course: any): string => {
  const lines = [
    `课程名称：${String(course?.name || '').trim() || '未填写'}`,
    `课程类型：${course?.is_custom ? '自定义课程' : '教务课程'}`,
    `教师：${String(course?.teacher || '').trim() || '未填写'}`,
    `地点：${buildLocationText(course)}`,
    `时间：${buildCourseTimeText(course)}`,
    `周次：${String(course?.weeks_text || '').trim() ? `${String(course?.weeks_text || '').trim()}周` : '未填写'}`,
    `学分：${String(course?.credit || '').trim() || '无'}`,
    `教学班：${String(course?.class_name || '').trim() || '无'}`
  ]
  if (course?.semester) {
    lines.push(`学期：${String(course.semester).trim()}`)
  }
  return lines.join('\n')
}

/** 冲突课程详情文本（多行） */
export const buildConflictDetailText = (course: any): string => {
  const conflicts = Array.isArray(course?.conflict_courses) ? course.conflict_courses : []
  if (!conflicts.length) {
    return `课程名称：${String(course?.name || '').trim() || '未填写'}\n冲突详情：无`
  }
  const lines = ['冲突课程详情：']
  conflicts.forEach((item: any, idx: number) => {
    lines.push(`${idx + 1}. ${String(item?.name || '').trim() || '未命名课程'}`)
    lines.push(`   类型：${item?.is_custom ? '自定义课程' : '教务课程'}`)
    lines.push(`   教师：${String(item?.teacher || '').trim() || '未填写'}`)
    lines.push(`   地点：${buildLocationText(item)}`)
    lines.push(`   时间：${buildCourseTimeText(item)}`)
    lines.push(`   周次：${String(item?.weeks_text || '').trim() ? `${String(item.weeks_text).trim()}周` : '未填写'}`)
  })
  return lines.join('\n')
}

/** 课程详情文本统一入口：冲突课程走冲突模板，否则走单门模板 */
export const buildCourseDetailText = (course: any): string => {
  if (!course) return ''
  if (course.is_conflict) {
    return buildConflictDetailText(course)
  }
  return buildSingleCourseDetailText(course)
}

/** 复制文本：优先 Clipboard API，回退 textarea + execCommand */
export const copyTextWithFallback = async (text: any): Promise<boolean> => {
  const content = String(text || '').trim()
  if (!content) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content)
      return true
    }
  } catch {
    // ignore
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    return true
  } catch {
    return false
  }
}
