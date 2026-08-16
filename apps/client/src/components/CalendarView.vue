<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache, getStaleCachedData, setCachedData, EXTRA_LONG_TTL } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import {
  getPreferredSemesterFast,
  mergeSemesterOptions,
  normalizeSemesterList,
  resolveCurrentSemester
} from '../utils/semester.js'
import { TPageHeader, TEmptyState } from './templates'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const CALENDAR_CACHE_REFRESH_RETRY_MS = 8000

const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const semesters = ref([])
const selectedSemester = ref('')
const currentSemester = ref('')
const calendarData = ref([])
const displayedCalendarCacheKey = ref('')
const offline = ref(false)
/** 会话失效（需重登/补票），与纯网络离线缓存区分 */
const sessionExpired = ref(false)
const syncTime = ref('')
const meta = ref({
  semester: '',
  start_date: '',
  current_week: '',
  current_weekday: '',
  total_weeks: '',
  today: ''
})
let calendarRequestSeq = 0
let calendarRealtimeRetryTimer = null

const resolveCalendarSyncTime = (data) => {
  const explicit = String(data?.sync_time || data?.updated_at || data?.timestamp || '').trim()
  if (explicit) return explicit
  if (data?.offline) return syncTime.value || ''
  return new Date().toISOString()
}

const isInitialLoading = computed(() => loading.value && calendarData.value.length === 0)

const applyCalendarPayload = (data, cacheKey = '') => {
  if (!data?.success) return false
  calendarData.value = Array.isArray(data.data) ? data.data : []
  meta.value = data.meta || meta.value
  if (data.meta?.semester && !selectedSemester.value) {
    selectedSemester.value = data.meta.semester
    semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value)
  }
  offline.value = !!data.offline
  sessionExpired.value = false
  syncTime.value = resolveCalendarSyncTime(data)
  displayedCalendarCacheKey.value = cacheKey || displayedCalendarCacheKey.value
  return true
}

/** 仅作首屏占位；真正状态由 forceRemote 结果覆盖，避免 SWR 永久假离线 */
const applyStaleCalendarSnapshot = (cacheKey) => {
  const stale = getStaleCachedData(cacheKey)
  const data = stale?.data
  if (!data?.success || !Array.isArray(data.data) || data.data.length === 0) {
    return false
  }
  calendarData.value = data.data
  meta.value = data.meta || meta.value
  offline.value = true
  sessionExpired.value = false
  syncTime.value = resolveCalendarSyncTime(data)
  displayedCalendarCacheKey.value = cacheKey
  return true
}

const clearCalendarRealtimeRetry = () => {
  if (calendarRealtimeRetryTimer) {
    clearTimeout(calendarRealtimeRetryTimer)
    calendarRealtimeRetryTimer = null
  }
}

const scheduleCalendarRealtimeRetry = () => {
  clearCalendarRealtimeRetry()
  // 会话失效不自动重试（需用户重登）；仅网络类离线短间隔再拉
  if (sessionExpired.value) return
  calendarRealtimeRetryTimer = setTimeout(() => {
    calendarRealtimeRetryTimer = null
    if (offline.value && !sessionExpired.value) {
      fetchCalendar({ keepOfflineBanner: true }).catch(() => {})
    }
  }, CALENDAR_CACHE_REFRESH_RETRY_MS)
}

const restoreStaleSyncTime = (cacheKey) => {
  if (syncTime.value) return
  const stale = getStaleCachedData(cacheKey)
  if (stale?.data) {
    syncTime.value = resolveCalendarSyncTime(stale.data)
  }
}

const initializeFastSemester = () => {
  const preferred = getPreferredSemesterFast()
  if (preferred && !selectedSemester.value) {
    selectedSemester.value = preferred
  }
  semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value)
}

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
  const previousSemester = selectedSemester.value
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    }, EXTRA_LONG_TTL, { staleWhileRevalidate: true, priority: 'foreground' })
    if (data?.success) {
      const sorted = normalizeSemesterList(data.semesters || [])
      semesters.value = mergeSemesterOptions(sorted, selectedSemester.value)
      currentSemester.value = resolveCurrentSemester(sorted, data.current || '')
      if (!selectedSemester.value) {
        selectedSemester.value = currentSemester.value || sorted[0] || ''
        semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value)
      }
      // 首屏用 current 占位拉过校历时，学期解析后补一次实时请求
      const shouldRefetchResolvedSemester = !previousSemester && selectedSemester.value
      if (shouldRefetchResolvedSemester) {
        fetchCalendar({ keepOfflineBanner: true }).catch(() => {})
      }
    }
  } catch (e) {
    console.error('获取学期失败', e)
  }
}

/**
 * 校历加载：缓存只做首屏占位，前台 forceRemote 负责替换为实时数据。
 * 避免 staleWhileRevalidate 立刻标 offline 后后台失败导致 sync_time 永久粘滞（#489）。
 */
const fetchCalendar = async (options = {}) => {
  const requestSeq = ++calendarRequestSeq
  const cacheKey = `calendar:${props.studentId}:${selectedSemester.value || 'current'}`
  const staleApplied = applyStaleCalendarSnapshot(cacheKey)
  if (!staleApplied && displayedCalendarCacheKey.value && displayedCalendarCacheKey.value !== cacheKey) {
    calendarData.value = []
    displayedCalendarCacheKey.value = ''
  }
  loading.value = calendarData.value.length === 0
  refreshing.value = true
  error.value = ''
  clearCalendarRealtimeRetry()
  if (!staleApplied || !options.keepOfflineBanner) {
    offline.value = false
    sessionExpired.value = false
    syncTime.value = ''
  }

  try {
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/calendar`, {
        student_id: props.studentId,
        semester: selectedSemester.value
      })
      return res.data
    }, EXTRA_LONG_TTL, { forceRemote: true, priority: 'foreground' })

    if (requestSeq !== calendarRequestSeq) return
    if (data?.success) {
      applyCalendarPayload(data, cacheKey)
      if (!data.offline) {
        setCachedData(cacheKey, data)
        clearCalendarRealtimeRetry()
      } else {
        // 后端网络兜底离线：保留缓存展示并稍后重试
        offline.value = true
        sessionExpired.value = false
        scheduleCalendarRealtimeRetry()
      }
      return
    }

    if (data?.need_login) {
      const method = String(localStorage.getItem('hbu_login_method') || '').trim()
      const isTemp = localStorage.getItem('hbu_login_temp') === '1' || method.endsWith('_temp')
      if (isTemp) {
        emit('logout')
        return
      }
      // 有缓存：继续展示，但明确「会话失效」而非「永远假离线」
      if (calendarData.value.length > 0 || staleApplied) {
        sessionExpired.value = true
        offline.value = true
        restoreStaleSyncTime(cacheKey)
        error.value = ''
      } else {
        sessionExpired.value = false
        offline.value = false
        error.value = data?.error || '会话已过期，请重新登录'
      }
      return
    }

    // 其它失败：有缓存则标网络离线，无缓存则错误态
    if (calendarData.value.length > 0 || staleApplied) {
      offline.value = true
      sessionExpired.value = false
      restoreStaleSyncTime(cacheKey)
      error.value = ''
      scheduleCalendarRealtimeRetry()
    } else {
      error.value = data?.error || '获取校历失败'
    }
  } catch (e) {
    if (requestSeq !== calendarRequestSeq) return
    if (calendarData.value.length > 0 || staleApplied) {
      offline.value = true
      sessionExpired.value = false
      restoreStaleSyncTime(cacheKey)
      error.value = ''
      scheduleCalendarRealtimeRetry()
    } else {
      error.value = e.response?.data?.error || e.message || '网络错误，请稍后重试'
    }
  } finally {
    if (requestSeq === calendarRequestSeq) {
      loading.value = false
      refreshing.value = false
    }
  }
}

const handleSemesterChange = () => {
  fetchCalendar()
}

onMounted(() => {
  initializeFastSemester()
  fetchCalendar()
  fetchSemesters()
})

onBeforeUnmount(() => {
  clearCalendarRealtimeRetry()
})
</script>

<template>
  <div class="calendar-view">
    <TPageHeader title="校历信息" icon="event_note" @back="emit('back')">
      <template #actions>
        <button
          class="calendar-refresh-btn"
          type="button"
          :aria-busy="refreshing || loading"
          aria-label="刷新校历"
          @click="fetchCalendar()"
        >
          <span
            class="material-symbols-outlined"
            :class="{ spinning: refreshing || loading || offline }"
          >refresh</span>
        </button>
      </template>
    </TPageHeader>

    <div
      v-if="offline || sessionExpired"
      class="offline-banner"
      :class="{ 'session-banner': sessionExpired }"
    >
      <template v-if="sessionExpired">
        教务会话已失效，当前显示缓存校历（更新于{{ formatRelativeTime(syncTime) || '未知' }}）。请重新登录后刷新，而非官网校历接口消失。
      </template>
      <template v-else>
        当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
      </template>
    </div>

    <div class="controls">
      <IOSSelect v-model="selectedSemester" @change="handleSemesterChange">
        <option v-for="s in semesters" :key="s" :value="s">{{ s }}</option>
      </IOSSelect>
      <div class="meta">
        <span>当前周：第{{ meta.current_week }}周</span>
        <span>学期开始：{{ meta.start_date || '-' }}</span>
        <span>总周数：{{ meta.total_weeks || '-' }}</span>
        <span v-if="syncTime" class="calendar-updated-at">最新更新：{{ formatRelativeTime(syncTime) }}</span>
      </div>
    </div>

    <TEmptyState v-if="isInitialLoading" type="loading" message="正在获取校历..." />
    <TEmptyState v-else-if="error" type="error" :message="error">
      <button class="calendar-retry-btn" type="button" @click="fetchCalendar()">重试</button>
    </TEmptyState>

    <div v-else-if="calendarData.length > 0" class="calendar-table-wrapper">
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

    <TEmptyState v-else type="empty" message="暂无校历数据" />
  </div>
</template>

<style scoped>
/* 页级背景对齐成绩查询：中性浅底，避免 --ui-bg-gradient 蓝青全页染色 */
.calendar-view {
  min-height: 100vh;
  background: #f6fafe;
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
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 16px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  margin-bottom: 16px;
  animation: calendar-fade-up 0.28s ease both;
}

.controls select {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-surface-border);
  color: var(--ui-text);
  background: #f0f4f8;
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
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, transparent);
  background: #eff6ff;
  color: var(--ui-primary);
  font-size: 12px;
  font-weight: 700;
}

.loading, .error {
  padding: 20px 12px;
  text-align: center;
  color: var(--ui-muted);
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  margin-bottom: 16px;
}

.calendar-table-wrapper {
  padding: 0 0 24px;
  overflow-x: auto;
  animation: calendar-fade-up 0.32s ease both;
  animation-delay: 0.04s;
}

.calendar-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

/* 表头用中性 surface，避免 primary-soft 蓝渐变与死白对比 */
.calendar-table thead th {
  background: #f0f4f8;
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
  background: #eff6ff;
  transition: background-color 0.2s ease;
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
  background: #f0f4f8;
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
  background: color-mix(in oklab, var(--ui-danger) 14%, var(--ui-surface, #fff) 86%);
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
  background: #fef3c7;
  border: 1px solid color-mix(in oklab, #f59e0b 40%, transparent);
  color: #b45309;
  border-radius: 12px;
  font-weight: 600;
}

.offline-banner.session-banner {
  background: #fee2e2;
  border-color: color-mix(in oklab, #ef4444 40%, transparent);
  color: #b91c1c;
}

.calendar-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--ui-primary);
  cursor: pointer;
}

.calendar-refresh-btn .spinning {
  animation: calendar-spin 0.9s linear infinite;
}

.calendar-retry-btn {
  margin-top: 12px;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  background: var(--ui-primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.calendar-updated-at {
  background: #f0f4f8 !important;
  color: var(--ui-muted) !important;
  border-color: var(--ui-surface-border) !important;
}

@keyframes calendar-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes calendar-fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .controls,
  .calendar-table-wrapper {
    animation: none;
  }

  .calendar-table tbody tr.is-current {
    transition: none;
  }
}
</style>
