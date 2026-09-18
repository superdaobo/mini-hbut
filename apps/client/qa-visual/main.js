/**
 * Epic #833 视觉回归 harness（仅用于 QA 截图，不进入产品构建）。
 *
 * 直接挂载真实的 ScheduleGrid 组件，用固定假数据渲染 8 组场景；
 * 通过 window.__setScenario(name) 切换场景，供 CDP 脚本逐组截图。
 */
import { createApp, h, ref, computed } from 'vue'

import ScheduleGrid from '../src/features/schedule/components/ScheduleGrid.vue'
import { getCourseStyle } from '../src/features/schedule/utils/layout'
import '../src/index.css'

/** 固定一周（2026-09-14 周一 ~ 09-20 周日），保证截图可复现 */
const WEEK_DATES = [
  { year: 2026, month: 9, date: 14, iso: '2026-09-14', dayLabel: '周一', isToday: false },
  { year: 2026, month: 9, date: 15, iso: '2026-09-15', dayLabel: '周二', isToday: false },
  { year: 2026, month: 9, date: 16, iso: '2026-09-16', dayLabel: '周三', isToday: false },
  { year: 2026, month: 9, date: 17, iso: '2026-09-17', dayLabel: '周四', isToday: true },
  { year: 2026, month: 9, date: 18, iso: '2026-09-18', dayLabel: '周五', isToday: false },
  { year: 2026, month: 9, date: 19, iso: '2026-09-19', dayLabel: '周六', isToday: false },
  { year: 2026, month: 9, date: 20, iso: '2026-09-20', dayLabel: '周日', isToday: false }
]

const ALL_WEEKS = Array.from({ length: 20 }, (_, i) => i + 1)

/** 基础课程（周四 = weekday 4）：第 5-6 节 通信原理，用于与日程做重叠对照 */
const baseCourses = [
  { id: 'c1', name: '通信原理', room_code: '电气楼 302', teacher: '张老师', weekday: 4, period: 5, djs: 2, weeks: ALL_WEEKS },
  { id: 'c2', name: '高等数学', room_code: '教一 101', teacher: '李老师', weekday: 4, period: 1, djs: 2, weeks: ALL_WEEKS },
  { id: 'c3', name: '大学物理', room_code: '教二 205', teacher: '王老师', weekday: 2, period: 3, djs: 2, weeks: ALL_WEEKS }
]

const ev = (id, title, date, startTime, endTime, location, color) => ({
  id,
  title,
  date,
  startTime,
  endTime,
  location: location || '',
  note: '',
  color: color || '#2f6fed',
  reminderMinutes: null,
  createdAt: '',
  updatedAt: ''
})

/** 8 组场景（键与 docs 中的编号一致） */
const SCENARIOS = {
  '01-none': { label: '① 无 Event', events: [] },
  '02-single': {
    label: '② 1 个普通 Event',
    events: [ev('e1', '蓝电技术部开会', '2026-09-18', '19:00', '21:00', '电气楼 402')]
  },
  '03-cross-dashed': {
    label: '③ Event 跨节次虚线（09:50-10:30 横跨第 2/3 节边界）',
    events: [ev('e1', '实验室例会', '2026-09-18', '09:50', '10:30', '实验楼 A201')]
  },
  '04-overlap-course': {
    label: '④ Event 与 Course overlap（通信原理 14:00-15:35 vs 实验 14:30-15:20）',
    events: [ev('e1', '电赛实验', '2026-09-17', '14:30', '15:20', '电气楼 402', '#e8722c')]
  },
  '05-overlap-two': {
    label: '⑤ 两个 Event overlap（19:00-20:00 与 19:30-20:30）',
    events: [
      ev('e1', '学生会例会', '2026-09-18', '19:00', '20:00', '团委 201', '#2f6fed'),
      ev('e2', '社团排练', '2026-09-18', '19:30', '20:30', '活动中心', '#12a37a')
    ]
  },
  '06-overlap-many': {
    label: '⑥ 四个 Event overlap（触发 +N 聚合）',
    events: [
      ev('e1', '安排 A', '2026-09-18', '19:00', '21:00', '', '#2f6fed'),
      ev('e2', '安排 B', '2026-09-18', '19:10', '21:00', '', '#e8722c'),
      ev('e3', '安排 C', '2026-09-18', '19:20', '21:00', '', '#12a37a'),
      ev('e4', '安排 D', '2026-09-18', '19:30', '21:00', '', '#8b5cf6')
    ]
  },
  '07-short': {
    label: '⑦ 超短 Event（14:30-14:40 取快递）',
    events: [ev('e1', '取快递', '2026-09-18', '14:30', '14:40', '菜鸟驿站', '#8b5cf6')]
  },
  '08-out-of-range': {
    label: '⑧ 早于第一节（07:30）与晚于最后一节（22:00）',
    events: [
      ev('e1', '晨跑', '2026-09-18', '07:30', '08:00', '操场', '#12a37a'),
      ev('e2', '夜谈', '2026-09-18', '22:00', '22:40', '宿舍', '#2f6fed')
    ]
  }
}

const scenarioKey = ref('01-none')

const eventsForDay = (day) => {
  const iso = WEEK_DATES[day - 1]?.iso
  return (SCENARIOS[scenarioKey.value]?.events || []).filter((e) => e.date === iso)
}

const coursesForDay = (day) => baseCourses.filter((c) => Number(c.weekday) === Number(day))

const App = {
  setup() {
    return () =>
      h(
        'div',
        {
          class: 'schedule-view qa-root',
          style: {
            '--time-axis-width': '40px',
            '--topbar-height': '44px',
            '--date-header-height': '50px',
            '--schedule-bottom-gap': '108px',
            '--slot-height': 'clamp(46px, calc((100vh - 44px - 50px - 108px) / 11), 70px)'
          }
        },
        [
          h('div', { class: 'qa-badge', 'data-qa-scenario': scenarioKey.value }, SCENARIOS[scenarioKey.value].label),
          h(ScheduleGrid, {
            weekDates: WEEK_DATES,
            currentMonth: 9,
            selectedWeek: 3,
            weekTransitionName: 'week-slide-left',
            scheduleCourseCardStyle: 'modern',
            courseCardRefreshNonce: 0,
            getCoursesForDay: coursesForDay,
            getCourseStyle: (course) => getCourseStyle(course, 'modern'),
            getEventsForDay: eventsForDay,
            isWidgetHighlighted: () => false,
            enableBlankCreate: true
          })
        ]
      )
  }
}

createApp(App).mount('#app')

// QA 脚本入口：切换场景（同步刷新，无需重新导航）
window.__setScenario = (name) => {
  if (!SCENARIOS[name]) return false
  scenarioKey.value = name
  return true
}
window.__scenarios = Object.keys(SCENARIOS)
window.__currentScenario = () => scenarioKey.value
