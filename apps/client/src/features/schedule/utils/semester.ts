/**
 * 课表领域 - 学期派生/存储纯函数。
 * 原内联于 ScheduleView.vue（deriveSemesterByDate/resolveDisplayStudentId/readStoredSemester）。
 */
import { SCHEDULE_META_KEY } from '../constants'

/** 按当前日期推算所在学期（9月=第一学期，3月/2月15日后=第二学期） */
export const deriveSemesterByDate = (date = new Date()): string => {
  const year = Number(date.getFullYear())
  const month = Number(date.getMonth()) + 1
  const day = Number(date.getDate())
  let academicYearStart = year - 1
  let term = 1
  if (month >= 9) {
    academicYearStart = year
    term = 1
  } else if (month >= 3) {
    academicYearStart = year - 1
    term = 2
  } else if (month === 2 && day >= 15) {
    academicYearStart = year - 1
    term = 2
  } else {
    academicYearStart = year - 1
    term = 1
  }
  return `${academicYearStart}-${academicYearStart + 1}-${term}`
}

/**
 * 解析展示用学号：优先 props.studentId；主动退出后不再回退 hbu_username；
 * 否则仅在 hbu_username 为 10 位数字时回退。
 */
export const resolveDisplayStudentId = (studentId: string): string => {
  const sid = String(studentId || '').trim()
  if (sid) return sid
  if (localStorage.getItem('hbu_manual_logout') === 'true') return ''
  const fallback = String(localStorage.getItem('hbu_username') || '').trim()
  return /^\d{10}$/.test(fallback) ? fallback : ''
}

/** 读取本地存储的学期元信息 */
export const readStoredSemester = (): string => {
  try {
    const raw = localStorage.getItem(SCHEDULE_META_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return String(parsed?.semester || '').trim()
  } catch {
    return ''
  }
}
