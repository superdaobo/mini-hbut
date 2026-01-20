<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { fetchWithCache, getCachedData } from '../utils/api.js'

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

// 丰富的莫兰迪/糖果色系
const courseThemes = [
  { bg: '#dbeafe', text: '#1e40af' }, // 蓝
  { bg: '#dcfce7', text: '#166534' }, // 绿
  { bg: '#f3e8ff', text: '#6b21a8' }, // 紫
  { bg: '#ffedd5', text: '#9a3412' }, // 橙
  { bg: '#fae8ff', text: '#86198f' }, // 粉紫
  { bg: '#ccfbf1', text: '#115e59' }, // 青
  { bg: '#fee2e2', text: '#991b1b' }, // 红
  { bg: '#fef9c3', text: '#854d0e' }, // 黄
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
    dates.push({
      month: d.getMonth() + 1,
      date: d.getDate(),
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

// 获取某一天的所有课程（并在此处合并）
const getCoursesForDay = (dayIndex) => { 
  // 1. 过滤出本周课程
  const dailyCourses = scheduleData.value.filter(course => {
     return course.weekday === dayIndex && 
            course.weeks.includes(selectedWeek.value)
  })
  
  // 2. 排序（按节次）
  dailyCourses.sort((a, b) => a.period - b.period)
  
  // 3. 新的合并逻辑：完全忽略 API 的 djs，通过统计连续记录计算实际跨度
  const merged = []
  let i = 0
  
  while (i < dailyCourses.length) {
    const current = dailyCourses[i]
    const startPeriod = current.period
    let endPeriod = current.period
    
    // 查找同一门课的所有连续记录
    let j = i + 1
    while (j < dailyCourses.length) {
      const next = dailyCourses[j]
      // 同一门课（名字相同）且节次连续（差1）或重叠
      if (next.name === current.name && next.period <= endPeriod + 1) {
        endPeriod = Math.max(endPeriod, next.period)
        j++
      } else {
        break
      }
    }
    
    // 计算实际跨度
    const span = endPeriod - startPeriod + 1
    
    merged.push({
      ...current,
      djs: span // 使用计算的跨度，而非 API 的 djs
    })
    
    i = j // 跳过已处理的记录
  }
  
  // 4. 分配颜色：确保相邻课程颜色不同
  let lastColorIndex = -1
  
  merged.forEach(course => {
    let hash = 0
    for (let k = 0; k < course.name.length; k++) {
        hash = course.name.charCodeAt(k) + ((hash << 5) - hash)
    }
    let colorIndex = Math.abs(hash) % courseThemes.length
    
    if (colorIndex === lastColorIndex) {
        colorIndex = (colorIndex + 1) % courseThemes.length
    }
    
    course.colorIndex = colorIndex
    lastColorIndex = colorIndex
  })
  
  return merged
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
    backgroundColor: theme.bg,
    color: theme.text,
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

onMounted(() => {
  applyCachedWeek()
  fetchSchedule()
})
</script>

<template>
  <div class="schedule-view" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <!-- 头部导航 -->
    <header class="schedule-header">
      <button class="back-btn" @click="handleBack">← 返回</button>
      <div class="title">
        <span class="icon">📅</span>
        <span>课程表</span>
      </div>
      <div class="week-selector">
        <select v-model="selectedWeek">
          <option disabled value="0">请选择周次</option>
          <option v-for="w in 25" :key="w" :value="w">第{{ w }}周</option>
        </select>
        <span class="arrow">▼</span>
      </div>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，同步时间：{{ syncTime || '未知' }}
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
  background: white;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}

.schedule-header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  flex-shrink: 0;
}

.back-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.schedule-header .title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
}

.schedule-header .icon {
  font-size: 18px;
}

.week-selector {
  position: relative;
  background: rgba(255, 255, 255, 0.2);
  padding: 6px 12px;
  border-radius: 12px;
}

.week-selector select {
  appearance: none;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: white;
  padding-right: 16px;
  outline: none;
  cursor: pointer;
}

.week-selector select option {
  color: #333;
}

.week-selector .arrow {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  pointer-events: none;
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
  border-radius: 6px;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-size: 12px; /* 放大字体 */
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  /* 质感：轻微阴影 + 半透明边框 */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.course-card:active {
  transform: scale(0.98);
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.1);
}

.course-name {
  font-weight: 600;
  font-size: 12px; /* 放大课程名 */
  margin-bottom: 4px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3; /* 标准属性 */
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-room {
  font-size: 11px; /* 放大教室号 */
  opacity: 0.85;
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
</style>
