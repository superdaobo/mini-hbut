/**
 * 课表领域 - 学期弹窗展示状态存储。
 * 原内联于 ScheduleView.vue（popup shown key 与 pending popup 消费）。
 */
import { SCHEDULE_POPUP_PENDING_KEY } from '../../../utils/schedule_prefetch.js'
import { LOGIN_SESSION_TOKEN_KEY } from '../constants'

/** 弹窗展示记录 key：hbu_schedule_popup_shown:{sid}:{sessionToken} */
export const buildPopupShownKey = (studentId: string): string => {
  const sid = String(studentId || '').trim()
  const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || '').trim()
  if (!sid || !sessionToken) return ''
  return `hbu_schedule_popup_shown:${sid}:${sessionToken}`
}

/** 标记弹窗已展示 */
export const markPopupShown = (studentId: string): void => {
  const key = buildPopupShownKey(studentId)
  if (!key) return
  localStorage.setItem(key, '1')
}

/** 弹窗是否已展示过（无有效 key 视为已展示） */
export const isPopupShown = (studentId: string): boolean => {
  const key = buildPopupShownKey(studentId)
  if (!key) return true
  return localStorage.getItem(key) === '1'
}

/** 消费待展示的学期弹窗（schedule_prefetch 写入），返回目标学期或空串 */
export const consumePendingSemesterPopup = (studentId: string): string => {
  try {
    const raw = localStorage.getItem(SCHEDULE_POPUP_PENDING_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    const targetSid = String(parsed?.student_id || '').trim()
    const sem = String(parsed?.semester || '').trim()
    if (targetSid && targetSid !== String(studentId || '').trim()) {
      return ''
    }
    localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY)
    return sem
  } catch {
    localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY)
    return ''
  }
}
