/**
 * 课表领域常量：周次、节次、时间表、主题配色、样式选项。
 * 原内联于 ScheduleView.vue，拆分后统一收敛至此。
 */

/** 一周七天标签（含序号前缀，用于日期头展示） */
export const weekDays = ['1 周一', '2 周二', '3 周三', '4 周四', '5 周五', '6 周六', '7 周日']

/** 一周七天短标签 */
export const weekDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 每日最大节次数 */
export const MAX_PERIOD = 11

/** 可选节次 1..11 */
export const periodOptions = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1)

/** 课表卡片样式选项（抽屉「课程样式」） */
export const courseCardStyleOptions = [
  { key: 'modern', label: '现代' },
  { key: 'traditional', label: '传统' },
  { key: 'class', label: '标准' }
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
