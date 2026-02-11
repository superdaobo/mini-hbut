<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache, LONG_TTL, SHORT_TTL, DEFAULT_TTL } from '../utils/api.js'
import { useAppSettings } from '../utils/app_settings'
import { formatRelativeTime } from '../utils/time.js'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const appSettings = useAppSettings()
const maxRetry = computed(() => appSettings.retry.classroom)
const retryDelayMs = computed(() => appSettings.retryDelayMs)

// 状态
const loading = ref(false)
const buildings = ref([])
const classrooms = ref([])
const errorMsg = ref('')
const offline = ref(false)
const syncTime = ref('')
const currentMeta = ref({
  date_str: '',
  week: '',
  weekday_name: '',
  semester: ''
})

// 筛选条件
const filters = ref({
  week: '',
  weekday: '',
  periods: [], // 选中的节次
  building: '',
  minSeats: '',
  maxSeats: ''
})

// 选项数据
const weekOptions = Array.from({ length: 25 }, (_, i) => i + 1)
const weekdayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' }
]
const periodOptions = [
  { value: 1, label: '第1节 (08:00-08:45)' },
  { value: 2, label: '第2节 (08:55-09:40)' },
  { value: 3, label: '第3节 (10:10-10:55)' },
  { value: 4, label: '第4节 (11:05-11:50)' },
  { value: 5, label: '第5节 (14:00-14:45)' },
  { value: 6, label: '第6节 (14:55-15:40)' },
  { value: 7, label: '第7节 (16:10-16:55)' },
  { value: 8, label: '第8节 (17:05-17:50)' },
  { value: 9, label: '第9节 (19:00-19:45)' },
  { value: 10, label: '第10节 (19:55-20:40)' },
  { value: 11, label: '第11节 (20:50-21:35)' }
]

// 获取教学楼列表
const fetchBuildings = async () => {
  try {
    console.log('[Classroom] Fetching buildings...')
    const { data } = await fetchWithCache('classroom:buildings', async () => {
      const res = await axios.get(`${API_BASE}/v2/classroom/buildings`)
      console.log('[Classroom] Buildings API response:', res.data)
      return res.data
    }, LONG_TTL)
    console.log('[Classroom] Buildings data:', data)
    if (data?.success) {
      buildings.value = data.data
      console.log('[Classroom] Buildings loaded:', buildings.value.length)
    } else {
      console.error('[Classroom] Buildings failed:', data)
    }
  } catch (e) {
    console.error('获取教学楼失败', e)
  }
}

// 节次时间表 (与 Python classroom.py 一致)
const CLASS_SCHEDULE = [
  [8, 0, 8, 45],    // 第1节: 8:00-8:45
  [8, 55, 9, 40],   // 第2节: 8:55-9:40
  [10, 10, 10, 55], // 第3节: 10:10-10:55
  [11, 5, 11, 50],  // 第4节: 11:05-11:50
  [14, 0, 14, 45],  // 第5节: 14:00-14:45
  [14, 55, 15, 40], // 第6节: 14:55-15:40
  [16, 10, 16, 55], // 第7节: 16:10-16:55
  [17, 5, 17, 50],  // 第8节: 17:05-17:50
  [19, 0, 19, 45],  // 第9节: 19:00-19:45
  [19, 55, 20, 40], // 第10节: 19:55-20:40
  [20, 50, 21, 35], // 第11节: 20:50-21:35
]

// 根据当前时间获取推荐的节次 (与 Python classroom.py 一致)
const getCurrentClassPeriods = () => {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  
  const periods = []
  for (let i = 0; i < CLASS_SCHEDULE.length; i++) {
    const [sh, sm] = CLASS_SCHEDULE[i]
    const startMinutes = sh * 60 + sm
    // 如果当前时间在这节课之前或正在上课，则包含这节课
    if (currentMinutes < startMinutes + 45) {
      periods.push(i + 1)
    }
  }
  
  // 如果没有剩余节次（太晚了），返回第 9-11 节（晚上）
  if (periods.length === 0) {
    return [9, 10, 11]
  }
  
  return periods
}

// 获取本地时间作为默认值 (防止接口慢导致 UI 空白)
const initLocalMeta = () => {
  const now = new Date()
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dayIndex = now.getDay()
  
  // 简单估算开学时间 (仅作为占位符，避免UI空白)
  // 假设 9月1日 或 2月20日 开学
  // 这里其实只需要显示日期和星期几即可
  currentMeta.value = {
    date_str: now.toLocaleDateString(),
    week: '?', // 无法本地准确计算校历周次
    weekday_name: days[dayIndex],
    semester: '加载中...'
  }
  
  // 默认选中今天
  if (!filters.value.weekday) {
    // 转换为 API 格式 (1-7, 7是周日)
    filters.value.weekday = dayIndex === 0 ? 7 : dayIndex
  }
  
  // 根据当前时间自动选择节次
  if (filters.value.periods.length === 0) {
    filters.value.periods = getCurrentClassPeriods()
  }
}

// 查询空教室
const queryClassrooms = async (retryCount = 0) => {
  loading.value = true
  if (retryCount === 0) errorMsg.value = ''
  classrooms.value = []
  
  try {
    const payload = {
      student_id: props.studentId,
      week: filters.value.week ? parseInt(filters.value.week) : null,
      weekday: filters.value.weekday ? parseInt(filters.value.weekday) : null,
      periods: filters.value.periods.map(p => parseInt(p)),
      building: filters.value.building,
      min_seats: filters.value.minSeats ? parseInt(filters.value.minSeats) : null,
      max_seats: filters.value.maxSeats ? parseInt(filters.value.maxSeats) : null
    }
    
    // 如果没有手动选时间，传 null 让后端自动计算
    if (!payload.week) delete payload.week
    if (!payload.weekday) delete payload.weekday
    if (payload.periods.length === 0) delete payload.periods

    console.log('[Classroom] queryClassrooms called with payload:', JSON.stringify(payload))
    const cacheKey = `classroom:${props.studentId}:${JSON.stringify(payload)}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      console.log('[Classroom] Making API call for classrooms')
      const res = await axios.post(`${API_BASE}/v2/classroom/query`, payload)
      console.log('[Classroom] API response:', res.data)
      return res.data
    }, SHORT_TTL) // 使用 SHORT_TTL 因为空教室数据变化频繁
    
    if (data?.success) {
      classrooms.value = data.data
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
      // 更新元数据
      if (data.meta) {
        currentMeta.value = data.meta
        
        // 同步筛选器
        if (!filters.value.week) filters.value.week = data.meta.week
        if (!filters.value.weekday) filters.value.weekday = data.meta.weekday
        if (filters.value.periods.length === 0 && data.meta.periods) {
          filters.value.periods = data.meta.periods
        }
      }
    } else {
      if (data?.need_login) {
        emit('logout')
        return
      }
      errorMsg.value = data?.error || '查询失败'
    }
  } catch (e) {
    console.error('查询异常', e)
    
    // 自动重试逻辑
    if ((e.response && (e.response.status === 502 || e.response.status === 504)) || e.message.includes('Network Error')) {
      if (retryCount < maxRetry.value) {
        // 使用本地数据填充部分 UI，避免完全空白
        if (retryCount === 0 && !currentMeta.value.date_str) initLocalMeta()
        
        errorMsg.value = `系统预热中，自动重试 (${retryCount + 1}/${maxRetry.value})...`
        setTimeout(() => {
          queryClassrooms(retryCount + 1)
        }, retryDelayMs.value)
        return
      } else {
        errorMsg.value = '服务器响应超时，请手动刷新'
      }
    } else {
      errorMsg.value = '连接服务器失败'
    }
  } finally {
    if (!errorMsg.value.includes('自动重试')) {
      loading.value = false
    }
  }
}

// 切换节次选择
const togglePeriod = (p) => {
  const index = filters.value.periods.indexOf(p)
  if (index > -1) {
    filters.value.periods.splice(index, 1)
  } else {
    filters.value.periods.push(p)
    filters.value.periods.sort((a, b) => a - b)
  }
}

// 快速选择时间段
const selectTimeRange = (type) => {
  if (type === 'morning') filters.value.periods = [1, 2, 3, 4]
  else if (type === 'afternoon') filters.value.periods = [5, 6, 7, 8]
  else if (type === 'evening') filters.value.periods = [9, 10, 11]
  else if (type === 'clear') filters.value.periods = []
}

onMounted(async () => {
  initLocalMeta() // 先初始化本地时间显示，包括自动选择节次
  await fetchBuildings()
  // 默认自动查询一次
  queryClassrooms()
})
</script>

<template>
  <div class="classroom-view">
    <!-- 头部 -->
    <header class="app-header">
      <button class="back-btn" @click="$emit('back')">← 返回</button>
      <div class="title">
        <span class="icon">🏫</span>
        <span>空教室查询</span>
      </div>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <div class="content-container">
      <!-- 筛选区 -->
      <div class="filter-card">
        <div class="filter-row">
          <div class="filter-item">
            <label>教学楼</label>
            <select v-model="filters.building">
              <option value="">全部教学楼</option>
              <option v-for="b in buildings.filter(b => b.code)" :key="b.code" :value="b.name">{{ b.name }}</option>
            </select>
          </div>
          
          <div class="filter-item">
            <label>周次</label>
            <select v-model="filters.week">
              <option value="">自动(当前周)</option>
              <option v-for="w in weekOptions" :key="w" :value="w">第{{ w }}周</option>
            </select>
          </div>
          
          <div class="filter-item">
            <label>星期</label>
            <select v-model="filters.weekday">
              <option value="">自动(今天)</option>
              <option v-for="w in weekdayOptions" :key="w.value" :value="w.value">{{ w.label }}</option>
            </select>
          </div>
        </div>

        <div class="filter-row periods-row">
          <div class="periods-label">
            <label>节次选择</label>
            <div class="quick-actions">
              <span @click="selectTimeRange('morning')">上午</span>
              <span @click="selectTimeRange('afternoon')">下午</span>
              <span @click="selectTimeRange('evening')">晚上</span>
              <span @click="selectTimeRange('clear')">清空</span>
            </div>
          </div>
          <div class="periods-grid">
            <div 
              v-for="p in periodOptions" 
              :key="p.value"
              class="period-tag"
              :class="{ active: filters.periods.includes(p.value) }"
              @click="togglePeriod(p.value)"
            >
              {{ p.value }}
            </div>
          </div>
        </div>
        
        <div class="filter-row" style="margin-top: 12px;">
          <div class="filter-item seats-input">
             <label>座位</label>
             <div class="input-group">
               <input v-model="filters.minSeats" type="number" placeholder="最小" />
               <span>-</span>
               <input v-model="filters.maxSeats" type="number" placeholder="最大" />
             </div>
          </div>
          <button class="query-btn" @click="queryClassrooms" :disabled="loading">
            {{ loading ? '查询中...' : '查询空教室' }}
          </button>
        </div>
      </div>

      <!-- 结果列表 -->
      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
      
      <div class="results-info" v-if="classrooms.length > 0">
        <div class="date-container">
          <div class="week-row">
            <span class="week-info">第{{ currentMeta.week }}周</span>
            <span class="weekday">{{ currentMeta.weekday_name }}</span>
          </div>
          <div class="date-row">{{ currentMeta.date_str }}</div>
        </div>
        <div class="semester-info">{{ currentMeta.semester }} 学期</div>
      </div>

      <div class="classroom-list">
        <div v-for="room in classrooms" :key="room.id" class="room-card">
          <div class="card-top">
            <span class="room-seats">{{ room.seats }}座</span>
            <span class="room-type">{{ room.type }}</span>
          </div>
          <div class="room-main">
            <div class="room-name">{{ room.name }}</div>
            <div class="room-building">{{ room.campus }} {{ room.building ? room.building : '' }}</div>
          </div>
          <div class="card-bottom">
            <div class="floor-tag">{{ room.floor }}层</div>
            <div class="status-tag available">空闲</div>
          </div>
        </div>
        
        <div v-if="!loading && classrooms.length === 0 && !errorMsg" class="empty-state">
          <div class="emoji">🏢</div>
          <p>当前条件下没有找到空教室</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.classroom-view {
  min-height: 100vh;
  background: #f0f2f5;
  padding-bottom: 20px;
}

/* ... headers ... */
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}

.back-btn, .logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.back-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.logout-btn {
  background: rgba(255, 255, 255, 0.9);
  color: #059669;
  font-weight: 600;
}

.content-container {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.filter-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin-bottom: 16px;
}

.filter-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.filter-item {
  flex: 1;
  min-width: 100px;
}

.filter-item label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

select, input {
  width: 100%;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.periods-row {
  margin-top: 12px;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.periods-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.periods-label label {
  font-size: 12px;
  color: #6b7280;
}

.quick-actions span {
  font-size: 12px;
  color: #10b981;
  margin-left: 12px;
  cursor: pointer;
}

.periods-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.period-tag {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.period-tag.active {
  background: #10b981;
  color: white;
  border-color: #10b981;
}

.seats-input {
  flex: 2;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-group input {
  text-align: center;
}

.query-btn {
  flex: 1;
  min-width: 120px;
  padding: 10px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  height: 40px; /* Match input height */
}

.query-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px;
  color: #9ca3af;
}

.empty-state .emoji {
  font-size: 48px;
  margin-bottom: 12px;
}

.error-msg {
  background: #fee2e2;
  color: #dc2626;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  text-align: center;
  font-size: 14px;
}

.results-info {
  margin: 16px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}

.date-container {
  display: flex;
  flex-direction: column;
}

.week-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 2px;
}

.week-info {
  font-weight: 600;
  color: #374151;
}

.weekday {
  font-weight: 600;
  color: #10b981;
}

.date-row {
  font-size: 13px;
  color: #6b7280;
}

.semester-info {
  font-size: 12px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 6px;
}

.classroom-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); /* 更小的卡片，展示更多 */
  gap: 16px;
}

.room-card {
  background: white;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  justify-content: height;
  position: relative;
  overflow: hidden;
  border: 1px solid #f0fdf4;
  transition: transform 0.2s;
}

.room-card:active {
  transform: scale(0.98);
}

.room-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 100%;
  background: #10b981;
}

.card-top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.room-seats {
  font-size: 14px;
  font-weight: 700;
  color: #059669;
  background: #ecfdf5;
  padding: 2px 6px;
  border-radius: 6px;
}

.room-type {
  font-size: 10px;
  color: #9ca3af;
  border: 1px solid #e5e7eb;
  padding: 1px 4px;
  border-radius: 4px;
}

.room-main {
  margin: 8px 0;
}

.room-name {
  font-size: 18px;
  font-weight: 800;
  color: #1f2937;
  line-height: 1.2;
}

.room-building {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: auto;
}

.floor-tag {
  font-size: 12px;
  color: #9ca3af;
  background: #f9fafb;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-tag {
  font-size: 12px;
  font-weight: 600;
}

.status-tag.available {
  color: #10b981;
}

.offline-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}
</style>
