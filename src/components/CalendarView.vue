<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache, EXTRA_LONG_TTL } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const loading = ref(false)
const error = ref('')
const semesters = ref([])
const selectedSemester = ref('')
const calendarData = ref([])
const offline = ref(false)
const syncTime = ref('')
const meta = ref({
  semester: '',
  start_date: '',
  current_week: '',
  current_weekday: '',
  total_weeks: '',
  today: ''
})

const normalizeRemark = (text) => {
  if (!text) return ''
  const cleaned = String(text).trim()
  if (cleaned === '无备注信息') return ''
  return cleaned
}

const isHolidayRemark = (text) => {
  if (!text) return false
  return /(节|假|休|放假)/.test(text)
}

const getDayRemark = (item, dayKey) => {
  const candidates = [
    `${dayKey}remark`,
    `${dayKey}Remark`,
    `${dayKey}_remark`,
    `${dayKey}bz`,
    `${dayKey}Bz`,
    `${dayKey}_bz`,
    `${dayKey}jr`,
    `${dayKey}jrxx`,
    `${dayKey}holiday`
  ]
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      const value = normalizeRemark(item[key])
      if (value) return value
    }
  }
  return ''
}

const getWeekRemark = (item, dayRemarks) => {
  const directKeys = ['remark', 'weekremark', 'weekRemark', 'bz', 'weekbz', 'weekBz']
  for (const key of directKeys) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      const value = normalizeRemark(item[key])
      if (value) return value
    }
  }
  return Array.from(new Set(dayRemarks.filter(Boolean))).join(' / ')
}

const getMonthRemark = (item) => {
  const keys = ['monthremark', 'monthRemark', 'ybz', 'yremark']
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      const value = normalizeRemark(item[key])
      if (value) return value
    }
  }
  return ''
}

const calendarRows = computed(() => {
  const rows = (calendarData.value || []).map((item) => {
    const days = [
      { date: item.monday, remark: getDayRemark(item, 'monday') },
      { date: item.tuesday, remark: getDayRemark(item, 'tuesday') },
      { date: item.wednesday, remark: getDayRemark(item, 'wednesday') },
      { date: item.thursday, remark: getDayRemark(item, 'thursday') },
      { date: item.friday, remark: getDayRemark(item, 'friday') },
      { date: item.saturday, remark: getDayRemark(item, 'saturday') },
      { date: item.sunday, remark: getDayRemark(item, 'sunday') }
    ].map((day) => ({
      ...day,
      isHoliday: isHolidayRemark(day.remark)
    }))

    const weekRemark = getWeekRemark(item, days.map(d => d.remark))
    const monthRemark = getMonthRemark(item)

    return {
      ny: item.ny,
      zc: item.zc,
      days,
      weekRemark,
      monthRemark,
      isCurrentWeek: String(item.zc) === String(meta.value.current_week)
    }
  })

  const monthSpanMap = {}
  rows.forEach(r => {
    monthSpanMap[r.ny] = (monthSpanMap[r.ny] || 0) + 1
  })

  const seen = new Set()
  return rows.map(r => {
    if (!seen.has(r.ny)) {
      seen.add(r.ny)
      return { ...r, showMonth: true, monthSpan: monthSpanMap[r.ny] }
    }
    return { ...r, showMonth: false, monthSpan: 0 }
  })
})

const fetchSemesters = async () => {
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    }, EXTRA_LONG_TTL)
    if (data?.success) {
      semesters.value = data.semesters || []
      if (semesters.value.length > 0) {
        selectedSemester.value = semesters.value[0]
      }
    }
  } catch (e) {
    console.error('获取学期失败', e)
  }
}

const fetchCalendar = async () => {
  loading.value = true
  error.value = ''
  try {
    const cacheKey = `calendar:${props.studentId}:${selectedSemester.value || 'current'}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/calendar`, {
        student_id: props.studentId,
        semester: selectedSemester.value
      })
      return res.data
    }, EXTRA_LONG_TTL)

    if (data?.success) {
      calendarData.value = data.data || []
      meta.value = data.meta || meta.value
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
    } else {
      if (data?.need_login) {
        emit('logout')
        return
      }
      error.value = data?.error || '获取校历失败'
    }
  } catch (e) {
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    loading.value = false
  }
}

const handleSemesterChange = () => {
  fetchCalendar()
}

onMounted(async () => {
  await fetchSemesters()
  await fetchCalendar()
})
</script>

<template>
  <div class="calendar-view">
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>📘 校历信息</h1>
      <button class="logout-btn" @click="emit('logout')">退出</button>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <div class="controls">
      <select v-model="selectedSemester" @change="handleSemesterChange">
        <option v-for="s in semesters" :key="s" :value="s">{{ s }}</option>
      </select>
      <div class="meta">
        <span>当前周：第{{ meta.current_week }}周</span>
        <span>学期开始：{{ meta.start_date || '-' }}</span>
        <span>总周数：{{ meta.total_weeks || '-' }}</span>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="calendar-table-wrapper">
      <table class="calendar-table">
        <thead>
          <tr>
            <th class="month-col">月份</th>
            <th class="week-col">教学周</th>
            <th>星期一</th>
            <th>星期二</th>
            <th>星期三</th>
            <th>星期四</th>
            <th>星期五</th>
            <th>星期六</th>
            <th>星期日</th>
            <th class="remark-col">周备注</th>
            <th class="remark-col">月备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in calendarRows" :key="index" :class="{ 'is-current': row.isCurrentWeek }">
            <td v-if="row.showMonth" :rowspan="row.monthSpan" class="month-cell">{{ row.ny }}</td>
            <td class="week-cell">{{ row.zc }}</td>
            <td v-for="(day, dIndex) in row.days" :key="dIndex" class="day-cell">
              <div class="day-num">{{ day.date }}</div>
              <div v-if="day.remark" class="day-remark" :class="{ holiday: day.isHoliday }">{{ day.remark }}</div>
            </td>
            <td class="remark-cell">{{ row.weekRemark || '-' }}</td>
            <td class="remark-cell">{{ row.monthRemark || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.calendar-view {
  min-height: 100vh;
  background: #f5f7fa;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #6366f1 0%, #3b82f6 100%);
  color: white;
}

.back-btn, .logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  background: white;
}

.controls select {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #4b5563;
  font-size: 13px;
}

.loading, .error {
  padding: 20px;
  text-align: center;
  color: #6b7280;
}

.calendar-table-wrapper {
  padding: 0 16px 24px;
  overflow-x: auto;
}

.calendar-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: white;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
}

.calendar-table thead th {
  background: #eef2ff;
  color: #1f2937;
  font-weight: 700;
  padding: 12px 8px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 13px;
  text-align: center;
}

.calendar-table td {
  border-bottom: 1px solid #f3f4f6;
  border-right: 1px solid #f3f4f6;
  padding: 8px 6px;
  text-align: center;
  vertical-align: middle;
  font-size: 12px;
  color: #374151;
}

.calendar-table tbody tr.is-current {
  background: #eff6ff;
}

.month-col, .week-col {
  width: 80px;
}

.remark-col {
  width: 120px;
}

.month-cell {
  font-weight: 600;
  color: #1f2937;
  background: #f8fafc;
}

.week-cell {
  font-weight: 600;
  color: #2563eb;
}

.day-cell {
  min-width: 90px;
}

.day-num {
  font-weight: 600;
  color: #111827;
}

.day-remark {
  margin-top: 4px;
  font-size: 11px;
  color: #ef4444;
}

.day-remark.holiday {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 600;
}

.remark-cell {
  color: #6b7280;
  font-size: 12px;
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
</style>
