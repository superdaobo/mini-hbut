<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { fetchWithCache, getCachedData } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'

const props = defineProps({
  studentId: { type: String, default: '' },
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// 状态
const loading = ref(false)
const scheduleData = ref([])
const currentWeek = ref(0)
const selectedWeek = ref(0)
const hasPresetWeek = ref(false)
const semester = ref('')
const startDateStr = ref('') 
const errorMsg = ref('')
const showDetail = ref(false)
const selectedCourse = ref(null)
const offline = ref(false)
const syncTime = ref('')
const showMenu = ref(false)
const exporting = ref(false)
const exportingMode = ref('')
const exportUrl = ref('')
const exportError = ref('')
const exportCopied = ref(false)

const weekDays = ['1 周一', '2 周二', '3 周三', '4 周四', '5 周五', '6 周六', '7 周日']

// 更加精细的时间表
const timeSchedule = [
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

// 课表卡片配色：更高对比的雅致亮色，保证可读性与辨识度
const courseThemes = [
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
  { bg: '#fff2e2', text: '#b05c16', border: '#efb67f' }, // 暖杏
]

const weekDates = computed(() => {
  if (!startDateStr.value) return []
  
  const start = new Date(startDateStr.value)
  const daysToAdd = (selectedWeek.value - 1) * 7
  start.setDate(start.getDate() + daysToAdd)
  
  const dates = []
  const today = new Date()
  
  for (let i = 0; i < 7; i++) {
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
      dayLabel: weekDays[i],
      isToday: d.toDateString() === today.toDateString()
    })
  }
  return dates
})

const currentMonth = computed(() => {
  if (weekDates.value.length > 0) return weekDates.value[0].month
  return new Date().getMonth() + 1
})

const ensureStartDate = () => {
  if (startDateStr.value) return

  const today = new Date()
  const day = today.getDay() === 0 ? 7 : today.getDay() // 周日=7
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day - 1))

  const baseWeek = currentWeek.value > 0 ? currentWeek.value : 1
  const semesterStart = new Date(monday)
  semesterStart.setDate(monday.getDate() - (baseWeek - 1) * 7)

  const yyyy = semesterStart.getFullYear()
  const mm = String(semesterStart.getMonth() + 1).padStart(2, '0')
  const dd = String(semesterStart.getDate()).padStart(2, '0')
  startDateStr.value = `${yyyy}-${mm}-${dd}`
}



const applyCachedWeek = () => {
  if (!props.studentId) return
  const local = localStorage.getItem('hbu_schedule_meta')
  if (local) {
    try {
      const meta = JSON.parse(local)
      if (meta?.start_date) startDateStr.value = meta.start_date
      if (meta?.current_week) {
        currentWeek.value = meta.current_week
        selectedWeek.value = meta.current_week
        hasPresetWeek.value = true
      }
      semester.value = meta?.semester || semester.value
    } catch (e) {
      // ignore parse errors
    }
  }
  ensureStartDate()
  const cached = getCachedData(`schedule:${props.studentId}`)
  if (cached?.data?.meta) {
    const meta = cached.data.meta
    if (meta.start_date) startDateStr.value = meta.start_date
    if (meta.current_week) {
      currentWeek.value = meta.current_week
      selectedWeek.value = meta.current_week
      hasPresetWeek.value = true
    }
    semester.value = meta.semester || semester.value
  }
  ensureStartDate()
}

const fetchSchedule = async () => {
  loading.value = true
  try {
    applyCachedWeek()
    if (!props.studentId) {
      errorMsg.value = '请先在个人中心登录'
      return
    }
    const { data } = await fetchWithCache(`schedule:${props.studentId}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
        student_id: props.studentId
      })
      return res.data
    })

    if (data?.success) {
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
      // 处理数据：去重并合并连续课程
      const rawData = data.data
      scheduleData.value = processScheduleData(rawData)
      
      if (data.meta) {
        semester.value = data.meta.semester
        if (data.meta.start_date) startDateStr.value = data.meta.start_date
        if (!hasPresetWeek.value && data.meta.current_week) {
          currentWeek.value = data.meta.current_week
          selectedWeek.value = currentWeek.value
        }
        ensureStartDate()
        localStorage.setItem('hbu_schedule_meta', JSON.stringify({
          semester: data.meta.semester,
          start_date: data.meta.start_date,
          current_week: data.meta.current_week
        }))
      }
    } else {
      if (data?.need_login) {
        emit('logout')
        return
      }
      errorMsg.value = data?.error || '获取课表失败'
    }
  } catch (e) {
    console.error('获取课表异常', e)
  } finally {
    loading.value = false
  }
}

// 数据预处理：合并连续课程，去除重复
const processScheduleData = (courses) => {
  if (!courses || courses.length === 0) return []
  
  // 先按星期、节次排序
  courses.sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday
    return a.period - b.period
  })
  
  const processed = []
  // 使用 Map 按 (weekday, name) 分组处理，或者简单的线性扫描
  // 为了简单且准确处理跨周次的情况，我们需要对每一门课（在特定周次下）进行判断。
  // 但这里的数据是包含所有周次的。
  // 最好的策略是：先不合并weeks不同的，只合并完全相同的实例？
  // 不，前端每次渲染是基于 selectedWeek 过滤后的数据。
  // 所以合并逻辑应该放在 getCoursesForDay 里面做？或者在这里做全局合并？
  // 如果在这里做，需要考虑到weeks可能不一样。
  // 简单起见，我们保留原始数据，在 getCoursesForDay 里做“渲染级”合并。
  
  return courses
}

const hashText = (value) => {
  let hash = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

const periodsOverlap = (aStart, aEnd, bStart, bEnd) => {
  return !(aEnd < bStart || bEnd < aStart)
}

const areAdjacentCourses = (a, b) => {
  if (a._day === b._day) {
    // 同一天只处理上下相邻
    return a._end + 1 === b._start || b._end + 1 === a._start
  }
  if (Math.abs(a._day - b._day) === 1) {
    // 左右列在时间上有重叠即视为相邻
    return periodsOverlap(a._start, a._end, b._start, b._end)
  }
  return false
}

const mergeDailyCourses = (dailyCourses) => {
  if (!dailyCourses.length) return []
  const merged = []
  let i = 0

  while (i < dailyCourses.length) {
    const current = dailyCourses[i]
    const startPeriod = current.period
    let endPeriod = current.period

    let j = i + 1
    while (j < dailyCourses.length) {
      const next = dailyCourses[j]
      if (next.name === current.name && next.period <= endPeriod + 1) {
        endPeriod = Math.max(endPeriod, next.period)
        j++
      } else {
        break
      }
    }

    const span = endPeriod - startPeriod + 1
    merged.push({
      ...current,
      djs: span
    })
    i = j
  }
  return merged
}

const buildWeekCoursesWithColors = (weekNumber) => {
  const byDay = {}
  const nodes = []

  for (let day = 1; day <= 7; day += 1) {
    const dailyCourses = scheduleData.value
      .filter(course => course.weekday === day && course.weeks.includes(weekNumber))
      .sort((a, b) => a.period - b.period)

    const merged = mergeDailyCourses(dailyCourses).map((course, index) => {
      const span = course.djs || 1
      const start = Number(course.period)
      const end = start + span - 1
      return {
        ...course,
        _day: day,
        _start: start,
        _end: end,
        _uid: `${day}-${start}-${end}-${course.name}-${index}`
      }
    })

    byDay[day] = merged
    nodes.push(...merged)
  }

  if (!nodes.length) return byDay

  const neighbors = new Map(nodes.map(node => [node._uid, new Set()]))
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      if (areAdjacentCourses(a, b)) {
        neighbors.get(a._uid).add(b._uid)
        neighbors.get(b._uid).add(a._uid)
      }
    }
  }

  const ordered = [...nodes].sort((a, b) => {
    const degreeDiff = neighbors.get(b._uid).size - neighbors.get(a._uid).size
    if (degreeDiff !== 0) return degreeDiff
    if (a._start !== b._start) return a._start - b._start
    return a._day - b._day
  })

  const colorMap = new Map()
  ordered.forEach(node => {
    const used = new Set()
    neighbors.get(node._uid).forEach(id => {
      if (colorMap.has(id)) used.add(colorMap.get(id))
    })

    const seed = hashText(`${node.name}-${node._day}-${node._start}`) % courseThemes.length
    let chosen = seed
    for (let offset = 0; offset < courseThemes.length; offset += 1) {
      const candidate = (seed + offset) % courseThemes.length
      if (!used.has(candidate)) {
        chosen = candidate
        break
      }
    }
    colorMap.set(node._uid, chosen)
  })

  for (let day = 1; day <= 7; day += 1) {
    byDay[day] = (byDay[day] || []).map(course => ({
      ...course,
      colorIndex: colorMap.get(course._uid) ?? 0
    }))
  }

  return byDay
}

const weekCoursesWithColor = computed(() => {
  const week = Number(selectedWeek.value)
  if (!Number.isFinite(week) || week <= 0) return {}
  return buildWeekCoursesWithColors(week)
})

// 获取某一天的所有课程（并在此处合并）
const getCoursesForDay = (dayIndex) => {
  return weekCoursesWithColor.value[dayIndex] || []
}

const getCoursesForDayAndWeek = (dayIndex, weekNumber) => {
  const dailyCourses = scheduleData.value.filter(course => {
    return course.weekday === dayIndex && course.weeks.includes(weekNumber)
  })
  dailyCourses.sort((a, b) => a.period - b.period)
  return mergeDailyCourses(dailyCourses)
}

const getDateForWeekDay = (weekNumber, weekday) => {
  if (!startDateStr.value) return null
  const base = new Date(startDateStr.value)
  base.setDate(base.getDate() + (weekNumber - 1) * 7 + (weekday - 1))
  const yyyy = base.getFullYear()
  const mm = String(base.getMonth() + 1).padStart(2, '0')
  const dd = String(base.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const getCourseStyle = (course) => {
  if (!course) return {}
  
  // 使用预计算的 index，或者 fallback 到哈希
  let index = 0
  if (course.colorIndex !== undefined) {
      index = course.colorIndex
  } else {
    // Fallback logic
    let hash = 0
    for (let i = 0; i < course.name.length; i++) {
        hash = course.name.charCodeAt(i) + ((hash << 5) - hash)
    }
    index = Math.abs(hash) % courseThemes.length
  }

  const theme = courseThemes[index]
  const span = course.djs || 1
  
  return {
    '--course-bg': theme.bg,
    '--course-text': theme.text,
    '--course-border': theme.border || '#cbd5e1',
    gridRow: `${course.period} / span ${span}`,
    gridColumn: '1',
    zIndex: 1,
    // 增加间隔 (或者通过 margin 在 css 控制)
  }
}

const openDetail = (course) => {
  selectedCourse.value = course
  showDetail.value = true
}

// 滑动翻页
let touchStartX = 0
let touchEndX = 0

const handleTouchStart = (e) => {
  touchStartX = e.changedTouches[0].screenX
}

const handleTouchEnd = (e) => {
  touchEndX = e.changedTouches[0].screenX
  handleSwipe()
}

const handleSwipe = () => {
  const diff = touchStartX - touchEndX
  const threshold = 50 // 最小滑动距离
  
  if (Math.abs(diff) > threshold) {
    if (diff > 0 && selectedWeek.value < 25) {
      // 向左滑 -> 下一周
      selectedWeek.value++
    } else if (diff < 0 && selectedWeek.value > 1) {
      // 向右滑 -> 上一周
      selectedWeek.value--
    }
  }
}

const handleBack = () => emit('back')
const jumpToCurrentWeek = () => {
  if (currentWeek.value) {
    selectedWeek.value = currentWeek.value
  }
}

const toggleMenu = () => {
  showMenu.value = !showMenu.value
  if (!showMenu.value) {
    exportCopied.value = false
  }
}

const buildExportEventsForWeek = (weekNumber) => {
  const events = []
  if (!startDateStr.value) return events

  for (let day = 1; day <= 7; day++) {
    const iso = getDateForWeekDay(weekNumber, day)
    if (!iso) continue
    const courses = getCoursesForDayAndWeek(day, weekNumber)
    courses.forEach(course => {
      const startPeriod = course.period
      const span = course.djs || 1
      const endPeriod = startPeriod + span - 1
      const startSlot = timeSchedule.find(t => t.p === startPeriod)
      const endSlot = timeSchedule.find(t => t.p === endPeriod)
      if (!startSlot || !endSlot) return

      const start = `${iso}T${startSlot.start}:00`
      const end = `${iso}T${endSlot.end}:00`
      const room = course.room_code || course.room || ''
      const location = [course.building, room].filter(Boolean).join(' ')
      const timeLabel = `第${weekNumber}周 周${day} 第${startPeriod}-${endPeriod}节 ${startSlot.start}-${endSlot.end}`
      const description = `时间: ${timeLabel}\n地点: ${location || '未标注'}`

      events.push({
        summary: course.name,
        description,
        location: location || undefined,
        start,
        end
      })
    })
  }
  return events
}

const buildExportEventsForSemester = () => {
  const events = []
  if (!startDateStr.value) return events
  const maxWeek = scheduleData.value.reduce((acc, course) => {
    const maxCourseWeek = Array.isArray(course.weeks) ? Math.max(...course.weeks) : 0
    return Math.max(acc, maxCourseWeek)
  }, 0)
  const totalWeeks = maxWeek || 25
  const seen = new Set()

  for (let week = 1; week <= totalWeeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const iso = getDateForWeekDay(week, day)
      if (!iso) continue
      const courses = getCoursesForDayAndWeek(day, week)
      courses.forEach(course => {
        const startPeriod = course.period
        const span = course.djs || 1
        const endPeriod = startPeriod + span - 1
        const startSlot = timeSchedule.find(t => t.p === startPeriod)
        const endSlot = timeSchedule.find(t => t.p === endPeriod)
        if (!startSlot || !endSlot) return
        const start = `${iso}T${startSlot.start}:00`
        const end = `${iso}T${endSlot.end}:00`
        const room = course.room_code || course.room || ''
        const location = [course.building, room].filter(Boolean).join(' ')
        const timeLabel = `第${week}周 周${day} 第${startPeriod}-${endPeriod}节 ${startSlot.start}-${endSlot.end}`
        const description = `时间: ${timeLabel}\n地点: ${location || '未标注'}`
        const key = `${course.name}|${start}|${end}|${location}`
        if (seen.has(key)) return
        seen.add(key)
        events.push({
          summary: course.name,
          description,
          location: location || undefined,
          start,
          end
        })
      })
    }
  }
  return events
}

const exportCalendar = async (mode = 'week') => {
  exportError.value = ''
  exportUrl.value = ''
  exportCopied.value = false
  if (exporting.value) return
  if (!props.studentId) {
    exportError.value = '请先登录后再导出'
    return
  }
  if (!startDateStr.value) {
    exportError.value = '缺少学期开始日期，暂无法导出'
    return
  }
  exportingMode.value = mode
  const events = mode === 'semester'
    ? buildExportEventsForSemester()
    : buildExportEventsForWeek(selectedWeek.value)
  if (!events.length) {
    exportError.value = '当前周暂无可导出的课表数据'
    return
  }
  exporting.value = true
  try {
    const res = await axios.post(`${API_BASE}/v2/schedule/export_calendar`, {
      student_id: props.studentId,
      semester: semester.value,
      week: selectedWeek.value,
      events
    })
    if (res.data?.success) {
      exportUrl.value = res.data.url || ''
      if (!exportUrl.value) {
        exportError.value = '导出成功但未返回链接'
      }
    } else {
      exportError.value = res.data?.error || '导出失败'
    }
  } catch (e) {
    exportError.value = e.response?.data?.error || e.message || '导出失败'
  } finally {
    exporting.value = false
    exportingMode.value = ''
  }
}

const copyExportUrl = async () => {
  if (!exportUrl.value) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(exportUrl.value)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = exportUrl.value
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    exportCopied.value = true
    setTimeout(() => { exportCopied.value = false }, 2000)
  } catch (e) {
    exportError.value = '复制失败，请手动复制'
  }
}

onMounted(() => {
  applyCachedWeek()
  fetchSchedule()
})
</script>

<template>
  <div class="schedule-view" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <!-- 头部导航 -->
    <div class="schedule-topbar">
      <button class="menu-btn btn-ripple" @click="toggleMenu" aria-label="打开课表菜单">
        <span class="menu-bar"></span>
        <span class="menu-bar"></span>
        <span class="menu-bar"></span>
      </button>
      <div class="week-selector">
        <select v-model="selectedWeek">
          <option disabled value="0">请选择周次</option>
          <option v-for="w in 25" :key="w" :value="w">第{{ w }}周</option>
        </select>
        <span class="arrow">▼</span>
      </div>
    </div>

    <Transition name="drawer-fade">
      <div v-if="showMenu" class="drawer-overlay" @click="showMenu = false"></div>
    </Transition>
    <Transition name="drawer-slide">
      <aside v-if="showMenu" class="drawer-panel" @click.stop>
        <div class="drawer-title">课表工具</div>
        <div class="drawer-actions">
          <button class="drawer-action" :disabled="exporting" @click="exportCalendar('week')">
            {{ exporting && exportingMode === 'week' ? '正在生成...' : '导出本周' }}
          </button>
          <button class="drawer-action ghost" :disabled="exporting" @click="exportCalendar('semester')">
            {{ exporting && exportingMode === 'semester' ? '正在生成...' : '导出本学期' }}
          </button>
        </div>
        <div class="drawer-tip">生成后复制链接，用浏览器打开即可导入手机日历</div>

        <div v-if="exportUrl" class="export-result">
          <div class="export-label">本地导入链接</div>
          <div class="export-row">
            <input class="export-input" type="text" :value="exportUrl" readonly />
            <button class="export-copy" @click="copyExportUrl">复制</button>
          </div>
          <div v-if="exportCopied" class="export-copied">已复制链接</div>
        </div>

        <div v-if="exportError" class="export-error">{{ exportError }}</div>
      </aside>
    </Transition>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <div v-if="errorMsg" class="error-banner">
      {{ errorMsg }}
    </div>

    <button
      v-if="currentWeek && selectedWeek && selectedWeek !== currentWeek"
      class="jump-current-btn"
      @click="jumpToCurrentWeek"
      title="跳转到当前周"
    >
      回到当前周
    </button>

    <!-- 课表主体容器 -->
    <div class="timetable-container">
      
      <!-- 头部日期 -->
      <div class="date-header">
        <div class="month-col">
          <span class="month-num">{{ currentMonth }}</span>
          <span class="month-label">月</span>
        </div>
        
        <div class="days-row">
            <div 
              v-for="(d, index) in weekDates" 
              :key="index" 
              class="day-col"
              :class="{ 'is-today': d.isToday }"
            >
              <div class="day-num">{{ d.date }}</div>
              <div class="day-label">{{ d.dayLabel }}</div>
            </div>
        </div>
      </div>
      
      <!-- 滚动区域 -->
      <div class="grid-body">
        <!-- 左侧时间轴 -->
        <div class="time-axis">
           <div v-for="t in timeSchedule" :key="t.p" class="time-slot">
              <span class="time-start">{{ t.start }}</span>
              <span class="period-num">{{ t.p }}</span>
              <span class="time-end">{{ t.end }}</span>
           </div>
        </div>
        
        <!-- 课程网格 -->
        <div class="courses-grid">
           <!-- 背景线 -->
           <div class="grid-lines">
               <div v-for="i in 11" :key="i" class="line-row"></div>
           </div>
           
           <!-- 每天一列 -->
           <div v-for="day in 7" :key="day" class="day-column">
               <div 
                  v-for="course in getCoursesForDay(day)" 
                  :key="course.id"
                  class="course-card"
                  :style="getCourseStyle(course)"
                  @click="openDetail(course)"
               >
                  <div class="course-name">{{ course.name }}</div>
                  <div class="course-room">{{ course.room_code || course.room }}</div>
               </div>
           </div>
        </div>
      </div>
      
    </div>

    <!-- 详情弹窗 -->
    <Transition name="fade">
      <div v-if="showDetail" class="modal-overlay" @click="showDetail = false">
        <div class="modal-content glass" @click.stop>
          <div class="modal-header">
            <h3>{{ selectedCourse.name }}</h3>
            <button class="close-btn" @click="showDetail = false">×</button>
          </div>
          <div class="modal-body">
            <div class="info-row">
              <span class="label">教师</span>
              <span class="value">{{ selectedCourse.teacher }}</span>
            </div>
            <div class="info-row">
              <span class="label">教室</span>
              <span class="value">{{ selectedCourse.room }} ({{ selectedCourse.building }})</span>
            </div>
            <div class="info-row">
              <span class="label">时间</span>
              <span class="value">周{{ selectedCourse.weekday }} 第{{ selectedCourse.period }}-{{ selectedCourse.period + (selectedCourse.djs || 1) - 1 }}节</span>
            </div>
            <div class="info-row">
              <span class="label">周次</span>
              <span class="value">{{ selectedCourse.weeks_text }}周</span>
            </div>
            <div class="info-row">
              <span class="label">学分</span>
              <span class="value">{{ selectedCourse.credit }}</span>
            </div>
             <div class="info-row">
              <span class="label">教学班</span>
              <span class="value">{{ selectedCourse.class_name }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.schedule-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-gradient);
  font-family: var(--ui-font-family);
  overflow: hidden;
}

.schedule-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-surface-border);
}

.schedule-topbar .menu-btn {
  width: 36px;
  height: 32px;
  border: 1px solid var(--ui-surface-border);
  border-radius: 10px;
  background: var(--ui-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  box-shadow: var(--ui-shadow-soft);
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
}

.schedule-topbar .menu-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--ui-shadow-strong);
}

.menu-bar {
  width: 16px;
  height: 2px;
  background: var(--ui-text);
  border-radius: 2px;
}

.week-selector {
  position: relative;
  background: var(--ui-surface);
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border);
}

.week-selector select {
  appearance: none;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
  padding-right: 16px;
  outline: none;
  cursor: pointer;
}

.week-selector select option {
  color: #1f2937;
}

.week-selector .arrow {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--ui-muted);
  pointer-events: none;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(2px);
  z-index: 40;
}

.drawer-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: min(78vw, 320px);
  height: 100vh;
  background: var(--ui-surface);
  border-right: 1px solid var(--ui-surface-border);
  padding: 18px 16px;
  box-shadow: 12px 0 24px rgba(15, 23, 42, 0.16);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.drawer-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
}

.drawer-action {
  padding: 10px 14px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, var(--ui-primary), #22d3ee);
  color: white;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.22);
}

.drawer-actions {
  display: grid;
  gap: 10px;
}

.drawer-action.ghost {
  background: #111827;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.2);
}

.drawer-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.drawer-tip {
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.5;
}

.export-result {
  padding: 10px;
  background: rgba(248, 250, 252, 0.85);
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border);
}

.export-label {
  font-size: 12px;
  color: var(--ui-muted);
  margin-bottom: 6px;
}

.export-row {
  display: flex;
  gap: 8px;
}

.export-input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--ui-surface-border);
  font-size: 12px;
  color: var(--ui-text);
  background: white;
}

.export-copy {
  padding: 8px 10px;
  border-radius: 10px;
  border: none;
  background: #111827;
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.export-copied {
  margin-top: 6px;
  font-size: 12px;
  color: #059669;
  font-weight: 600;
}

.export-error {
  font-size: 12px;
  color: #dc2626;
  background: #fff1f2;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #fecdd3;
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.25s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(-100%);
}

/* 日期头 */
.date-header {
  height: 50px;
  display: flex;
  border-bottom: 1px solid #f3f4f6;
  background: white;
  flex-shrink: 0;
}

.month-col {
  width: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #1f2937;
  font-size: 14px;
}
.month-label {
  font-size: 10px;
  font-weight: normal;
  color: #6b7280;
}

.days-row {
  flex: 1;
  display: flex;
}

.day-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.day-col.is-today {
  background: #eff6ff;
  border-radius: 0 0 12px 12px;
}

.day-col.is-today .day-num {
  color: #2563eb;
  font-weight: 700;
}

.day-num {
  font-size: 14px;
  color: #1f2937;
  font-weight: 600;
}

.day-label {
  font-size: 10px;
  color: #6b7280;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

/* 课表主体 */
.timetable-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.grid-body {
  flex: 1;
  display: flex;
  overflow-y: auto;
  position: relative;
  /* 隐藏滚动条 */
  scrollbar-width: none; 
}
.grid-body::-webkit-scrollbar {
  display: none;
}

.time-axis {
  width: 40px;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.time-slot {
  height: 65px; /* 增加高度 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #9ca3af;
}

.period-num {
  font-size: 14px;
  font-weight: 700;
  color: #374151;
  margin: 2px 0;
}

.courses-grid {
  flex: 1;
  display: flex;
  position: relative;
}

.grid-lines {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.line-row {
  height: 65px; /* 匹配行高 */
  border-bottom: 1px dashed #f3f4f6;
  box-sizing: border-box;
}

.day-column {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(11, 65px); /* Grid 行定义 */
  grid-template-columns: 1fr; /* 强制单列 */
  padding: 0 2px;
  position: relative;
}

.course-card {
  margin: 2px;
  border-radius: 12px;
  padding: 7px 5px;
  background: var(--course-bg, rgba(255, 255, 255, 0.92)) !important;
  color: var(--course-text, #0f172a) !important;
  border-color: var(--course-border, rgba(148, 163, 184, 0.55)) !important;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-size: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  box-shadow: 0 6px 14px rgba(71, 85, 105, 0.16);
  border: 1px solid var(--course-border, rgba(148, 163, 184, 0.55));
}

.course-card:active {
  transform: scale(0.98);
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.1);
}

.course-name {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 4px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3; /* 标准属性 */
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-room {
  font-size: 11px;
  opacity: 0.88;
  font-weight: 500;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top:0; left:0; right:0; bottom:0;
  background: rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: white;
  width: 80%;
  max-width: 320px;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.modal-header h3 {
  font-size: 18px;
  color: #111827;
  margin: 0;
  line-height: 1.4;
}

.close-btn {
  background: #f3f4f6;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #6b7280;
  font-size: 16px;
  cursor: pointer;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  border-bottom: 1px solid #f9fafb;
  padding-bottom: 8px;
}

.info-row:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.info-row .label {
  color: #9ca3af;
  font-size: 13px;
}

.info-row .value {
  color: #374151;
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  max-width: 70%;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.offline-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}

.error-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(234, 88, 12, 0.12);
  border: 1px solid rgba(234, 88, 12, 0.3);
  color: #9a3412;
  border-radius: 12px;
  font-weight: 600;
}

.jump-current-btn {
  position: fixed;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  padding: 10px 12px;
  border-radius: 14px;
  border: none;
  background: rgba(59, 130, 246, 0.85);
  color: white;
  font-weight: 600;
  font-size: 12px;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.3);
  cursor: pointer;
  z-index: 12;
}

@media (max-width: 768px) {
  .schedule-topbar {
    padding: 10px 12px;
  }

  .week-selector {
    padding: 4px 10px;
  }

  .week-selector select {
    font-size: 12px;
  }

  .date-header {
    height: 44px;
  }

  .month-col {
    width: 32px;
  }

  .time-axis {
    width: 32px;
  }

  .time-slot {
    height: 48px;
    font-size: 9px;
  }

  .period-num {
    font-size: 12px;
  }

  .day-column {
    grid-template-rows: repeat(11, 48px);
  }

  .line-row {
    height: 48px;
  }

  .course-card {
    padding: 4px 2px;
    font-size: 10px;
  }

  .course-name {
    font-size: 10px;
  }

  .course-room {
    font-size: 9px;
  }
}
</style>





