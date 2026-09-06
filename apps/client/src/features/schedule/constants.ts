/**
 * 课表领域常量：周次、节次、时间表、主题配色、样式选项。
 * 原内联于 ScheduleView.vue，拆分后统一收敛至此。
 *
 * #788 i18n：含文案的常量改为 getter 函数（内部经 t() 取词），
 * 保证语言切换后取词即时生效；调用方每次渲染/调用时重新调用 getter 即可。
 * 时间表/主题配色等纯数据常量不受语言影响，保持原样导出。
 */

import { t } from '../../utils/app_i18n'

/**
 * 一周七天标签（含序号前缀，用于日期头展示）。
 * #788：由常量改为函数——weekDates 在 computed 中逐次调用，
 * 语言切换重渲染时自然取到新语言标签。
 */
export const getWeekDays = (): string[] =>
  [1, 2, 3, 4, 5, 6, 7].map((i) => t(`schedule.weekdayLong.${i}`))

/**
 * 一周七天短标签（周一..周日 / Mon..Sun）。
 * #788：由常量 weekDayLabels 改为函数。使用点（ScheduleAddCourseDialog /
 * ScheduleManageCoursesDialog / useScheduleEditor 确认行）均在 computed 或
 * 事件回调中取值，改为函数后语义不变、随语言切换生效。
 */
export const getWeekDayLabels = (): string[] =>
  [1, 2, 3, 4, 5, 6, 7].map((i) => t(`schedule.weekday.${i}`))

/** 每日最大节次数 */
export const MAX_PERIOD = 11

/** 可选节次 1..11 */
export const periodOptions = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1)

/**
 * 课表卡片样式选项（抽屉「课程样式」）。
 * #788：label 经 t() 取词（schedule.style.*），key 为持久化标识不翻译。
 */
export const getCourseCardStyleOptions = (): { key: string; label: string }[] => [
  { key: 'modern', label: t('schedule.style.modern') },
  { key: 'traditional', label: t('schedule.style.traditional') },
  { key: 'class', label: t('schedule.style.class') }
]

/** 节次时间表（第 1-11 节起止时间） */
export const timeSchedule = [
  { p: 1, start: '08:20', end: '09:05' },
  { p: 2, start: '09:10', end: '09:55' },
  { p: 3, start: '10:15', end: '11:00' },
  { p: 4, start: '11:05', end: '11:50' },
  { p: 5, start: '14:00', end: '14:45' },
  { p: 6, start: '14:50', end: '15:35' },
  { p: 7, start: '15:55', end: '16:40' },
  { p: 8, start: '16:45', end: '17:30' },
  { p: 9, start: '18:30', end: '19:15' },
  { p: 10, start: '19:20', end: '20:05' },
  { p: 11, start: '20:10', end: '20:55' }
]

/** 课表卡片主题配色（沿用 v1.2.5 风格） */
export const courseThemes = [
  { bg: '#e7f4ff', text: '#0f5da8', border: '#72b9ff' }, // 湖蓝
  { bg: '#fff0e8', text: '#cb4f2f', border: '#ffb390' }, // 珊瑚橘
  { bg: '#efe9ff', text: '#5f52cf', border: '#b8aaff' }, // 紫藤
  { bg: '#fff4db', text: '#be7a07', border: '#efc465' }, // 琥珀
  { bg: '#ffeaf2', text: '#c33f73', border: '#f3a8c4' }, // 玫瑰
  { bg: '#e8faf5', text: '#117f67', border: '#8adcc4' }, // 青绿
  { bg: '#e8efff', text: '#335ccb', border: '#9eb4ff' }, // 靛蓝
  { bg: '#fff1f5', text: '#b63f58', border: '#f0acbb' }, // 浅莓
  { bg: '#edf8ef', text: '#2f8c3d', border: '#9dd7a7' }, // 春绿
  { bg: '#e8f9ff', text: '#007893', border: '#84d6ec' }, // 青空
  { bg: '#f4edff', text: '#7548c1', border: '#c6adf1' }, // 兰紫
  { bg: '#fff2e2', text: '#b05c16', border: '#efb67f' } // 暖杏
]

/** 登录会话 token storage key */
export const LOGIN_SESSION_TOKEN_KEY = 'hbu_login_session_token'

/** 学期元信息 storage key */
export const SCHEDULE_META_KEY = 'hbu_schedule_meta'
