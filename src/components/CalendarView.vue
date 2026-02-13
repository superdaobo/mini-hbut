<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache, EXTRA_LONG_TTL } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const loading = ref(false)
const error = ref('')
const semesters = ref([])
const selectedSemester = ref('')
const currentSemester = ref('')
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

const normalizeDayNumber = (value) => {
  if (value === null || value === undefined) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const dayText = parts.length > 0 ? parts[parts.length - 1] : raw
  const day = Number(dayText)
  if (!Number.isFinite(day) || day <= 0) return ''
  return String(day)
}

const buildDateFromNyDay = (ny, dayValue) => {
  const day = normalizeDayNumber(dayValue)
  if (!ny || !day) return null
  const [yearText, monthText] = String(ny).split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const dayNum = Number(day)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(dayNum)) {
    return null
  }
  return new Date(year, month - 1, dayNum)
}

const chineseLunarFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return null
  }
})()

const solarFestivalMap = {
  '01-01': '元旦',
  '02-14': '情人节',
  '03-08': '妇女节',
  '05-01': '劳动节',
  '06-01': '儿童节',
  '09-10': '教师节',
  '10-01': '国庆节',
  '12-25': '圣诞节'
}

const lunarFestivalMap = {
  '正月初一': '春节',
  '正月十五': '元宵节',
  '五月初五': '端午节',
  '七月初七': '七夕',
  '八月十五': '中秋节',
  '九月初九': '重阳节',
  '腊月初八': '腊八节',
  '腊月廿九': '除夕',
  '腊月三十': '除夕'
}

const formatLunarText = (date) => {
  if (!date || !chineseLunarFormatter) return ''
  try {
    const raw = chineseLunarFormatter.format(date).replace(/\s+/g, '')
    const yearPos = raw.indexOf('年')
    return yearPos >= 0 ? raw.slice(yearPos + 1) : raw
  } catch {
    return ''
  }
}

const formatMonthDay = (value) => String(value).padStart(2, '0')

const getFestivalLabel = (date, lunarText) => {
  if (!date) return ''
  const mmdd = `${formatMonthDay(date.getMonth() + 1)}-${formatMonthDay(date.getDate())}`
  if (solarFestivalMap[mmdd]) return solarFestivalMap[mmdd]
  if (lunarFestivalMap[lunarText]) return lunarFestivalMap[lunarText]
  return ''
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

const buildDayCell = (item, dayKey) => {
  const rawDate = normalizeDayNumber(item[dayKey])
  const remark = getDayRemark(item, dayKey)
  const dateObj = buildDateFromNyDay(item.ny, item[dayKey])
  const lunar = formatLunarText(dateObj)
  const computedFestival = getFestivalLabel(dateObj, lunar)
  const holiday = isHolidayRemark(remark) ? remark : computedFestival
  return {
    date: rawDate,
    remark,
    lunar,
    holiday,
    isHoliday: !!holiday
  }
}

const calendarRows = computed(() => {
  const rows = (calendarData.value || []).map((item) => {
    const days = [
      buildDayCell(item, 'monday'),
      buildDayCell(item, 'tuesday'),
      buildDayCell(item, 'wednesday'),
      buildDayCell(item, 'thursday'),
      buildDayCell(item, 'friday'),
      buildDayCell(item, 'saturday'),
      buildDayCell(item, 'sunday')
    ]

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
      const sorted = normalizeSemesterList(data.semesters || [])
      semesters.value = sorted
      currentSemester.value = resolveCurrentSemester(sorted, data.current || '')
      if (!selectedSemester.value) {
        selectedSemester.value = currentSemester.value || sorted[0] || ''
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
      if (data.meta?.semester && !selectedSemester.value) {
        selectedSemester.value = data.meta.semester
      }
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
      <h1><span>📘</span><span>校历信息</span></h1>
      <span class="header-spacer" aria-hidden="true"></span>
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
              <div v-if="day.lunar" class="day-lunar">{{ day.lunar }}</div>
              <div v-if="day.holiday" class="day-remark holiday">{{ day.holiday }}</div>
              <div v-else-if="day.remark" class="day-remark">{{ day.remark }}</div>
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
  background: var(--ui-bg-gradient);
  color: var(--ui-text);
  padding: 16px 14px 120px;
}

.view-header {
  margin-bottom: 12px;
}

.view-header h1 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: clamp(19px, 2.2vw, 24px);
  color: var(--ui-text);
}

.back-btn, .logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  box-shadow: var(--ui-shadow-soft);
  margin-bottom: 16px;
}

.controls select {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-surface-border);
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 70%, #fff 30%);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 700;
}

.loading, .error {
  padding: 20px 12px;
  text-align: center;
  color: var(--ui-muted);
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 14px;
  box-shadow: var(--ui-shadow-soft);
  margin-bottom: 16px;
}

.calendar-table-wrapper {
  padding: 0 0 24px;
  overflow-x: auto;
}

.calendar-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: var(--ui-surface);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--ui-shadow-soft);
  border: 1px solid var(--ui-surface-border);
}

.calendar-table thead th {
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary-soft) 78%, #fff 22%),
    color-mix(in oklab, var(--ui-secondary) 12%, #fff 88%)
  );
  color: var(--ui-text);
  font-weight: 700;
  padding: 12px 8px;
  border-bottom: 1px solid var(--ui-surface-border);
  font-size: 13px;
  text-align: center;
}

.calendar-table td {
  border-bottom: 1px solid var(--ui-surface-border);
  border-right: 1px solid var(--ui-surface-border);
  padding: 8px 6px;
  text-align: center;
  vertical-align: middle;
  font-size: 12px;
  color: var(--ui-text);
}

.calendar-table tbody tr.is-current {
  background: color-mix(in oklab, var(--ui-primary-soft) 64%, #fff 36%);
}

.month-col, .week-col {
  width: 80px;
}

.remark-col {
  width: 120px;
}

.month-cell {
  font-weight: 600;
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-primary-soft) 44%, #fff 56%);
}

.week-cell {
  font-weight: 600;
  color: var(--ui-primary);
}

.day-cell {
  min-width: 90px;
}

.day-num {
  font-weight: 600;
  color: var(--ui-text);
}

.day-lunar {
  margin-top: 2px;
  font-size: 11px;
  color: var(--ui-muted);
}

.day-remark {
  margin-top: 4px;
  font-size: 11px;
  color: var(--ui-danger);
}

.day-remark.holiday {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-danger) 14%, #ffffff 86%);
  color: var(--ui-danger);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 32%, transparent);
  font-weight: 600;
}

.remark-cell {
  color: var(--ui-muted);
  font-size: 12px;
}

.offline-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: color-mix(in oklab, var(--ui-danger) 14%, #ffffff 86%);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 40%, transparent);
  color: var(--ui-danger);
  border-radius: 12px;
  font-weight: 600;
}
</style>
