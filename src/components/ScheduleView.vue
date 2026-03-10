<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'
import { flushUiSettings, useUiSettings } from '../utils/ui_settings'
import {
  consumeScheduleSwitchPending,
  getCachedScheduleSnapshot,
  readScheduleLock,
  SCHEDULE_POPUP_PENDING_KEY,
  warmupScheduleForStudent,
  writeScheduleLock
} from '../utils/schedule_prefetch.js'
import {
  CLOUD_SYNC_UPDATED_EVENT,
  getCloudSyncCooldownState,
  runCloudSyncDownload,
  runCloudSyncUpload
} from '../utils/cloud_sync.js'
import { pushDebugLog } from '../utils/debug_logger'
import { showToast } from '../utils/toast'

const props = defineProps({
  studentId: { type: String, default: '' },
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// 状态
const loading = ref(false)
const scheduleData = ref([])
const remoteScheduleData = ref([])
const customScheduleData = ref([])
const currentWeek = ref(0)
const selectedWeek = ref(0)
const semester = ref('')
const totalWeeks = ref(25)
const startDateStr = ref('') 
const errorMsg = ref('')
const showDetail = ref(false)
const selectedCourse = ref(null)
const offline = ref(false)
const syncTime = ref('')
const vacationNotice = ref('')
const showMenu = ref(false)
const exporting = ref(false)
const exportingMode = ref('')
const exportUrl = ref('')
const exportError = ref('')
const exportCopied = ref(false)
const semesterOptions = ref([])
const semesterLoading = ref(false)
const semesterDraft = ref('')
const semesterError = ref('')
const showSemesterPopup = ref(false)
const semesterPopupText = ref('')
const showAddCourse = ref(false)
const showWeekPicker = ref(false)
const addingCourse = ref(false)
const addCourseError = ref('')
const detailActionError = ref('')
const showConfirmDialog = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogLines = ref([])
const confirmDialogConfirmText = ref('确认')
const confirmDialogCancelText = ref('取消')
const confirmDialogDanger = ref(false)
const weekTransitionName = ref('week-slide-left')
const syncUploading = ref(false)
const syncDownloading = ref(false)
const syncUploadCooldownMs = ref(0)
const syncDownloadCooldownMs = ref(0)
const syncStatusText = ref('')
const uiSettings = useUiSettings()
const courseCardRefreshNonce = ref(0)
let confirmDialogResolver = null
let syncCooldownTimer = null
const addCourseForm = ref({
  name: '',
  teacher: '',
  room: '',
  weekday: 1,
  period: 1,
  djs: 1,
  weeks: []
})
const LOGIN_SESSION_TOKEN_KEY = 'hbu_login_session_token'

const readStoredSemester = () => {
  try {
    const raw = localStorage.getItem('hbu_schedule_meta')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return String(parsed?.semester || '').trim()
  } catch {
    return ''
  }
}

const storedSemester = readStoredSemester()
if (storedSemester) {
  semester.value = storedSemester
  semesterDraft.value = storedSemester
}

const buildPopupShownKey = () => {
  const sid = String(props.studentId || '').trim()
  const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || '').trim()
  if (!sid || !sessionToken) return ''
  return `hbu_schedule_popup_shown:${sid}:${sessionToken}`
}

const markPopupShown = () => {
  const key = buildPopupShownKey()
  if (!key) return
  localStorage.setItem(key, '1')
}

const isPopupShown = () => {
  const key = buildPopupShownKey()
  if (!key) return true
  return localStorage.getItem(key) === '1'
}

const openSemesterPopup = (targetSemester = '') => {
  const sem = String(targetSemester || semester.value || semesterDraft.value || '').trim()
  if (!sem) return
  semesterPopupText.value = sem
  showSemesterPopup.value = true
  markPopupShown()
}

const consumePendingSemesterPopup = () => {
  try {
    const raw = localStorage.getItem(SCHEDULE_POPUP_PENDING_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    const targetSid = String(parsed?.student_id || '').trim()
    const sem = String(parsed?.semester || '').trim()
    if (targetSid && targetSid !== String(props.studentId || '').trim()) {
      return ''
    }
    localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY)
    return sem
  } catch {
    localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY)
    return ''
  }
}

const weekDays = ['1 周一', '2 周二', '3 周三', '4 周四', '5 周五', '6 周六', '7 周日']
const weekDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const periodOptions = Array.from({ length: 11 }, (_, i) => i + 1)
const MAX_PERIOD = 11
const courseCardStyleOptions = [
  { key: 'modern', label: '现代' },
  { key: 'traditional', label: '传统' }
]

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

// 课表卡片配色：沿用 main 上版（v1.2.5）风格
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

const isTodayColumn = (dayIndex) => {
  const idx = Number(dayIndex) - 1
  if (idx < 0 || idx > 6) return false
  return !!weekDates.value[idx]?.isToday
}

const semesterWeekOptions = computed(() => {
  const count = Number(totalWeeks.value)
  const safeCount = Number.isFinite(count) && count > 0 ? count : 25
  return Array.from({ length: safeCount }, (_, i) => i + 1)
})

const courseSpanOptions = computed(() => {
  const start = Number(addCourseForm.value.period) || 1
  const maxSpan = Math.max(1, 12 - start)
  return Array.from({ length: maxSpan }, (_, i) => i + 1)
})

const addWeeksCountText = computed(() => {
  const weeks = Array.isArray(addCourseForm.value.weeks) ? addCourseForm.value.weeks.length : 0
  return weeks > 0 ? `已选 ${weeks} 周` : '未选择周次'
})

const scheduleCourseCardStyle = ref(
  uiSettings.scheduleCourseCardStyle === 'traditional' ? 'traditional' : 'modern'
)

const formatCooldownText = (value) => {
  const ms = Number(value || 0)
  if (ms <= 0) return '可立即同步'
  const sec = Math.ceil(ms / 1000)
  if (sec < 60) return `${sec} 秒后可再次同步`
  const min = Math.floor(sec / 60)
  const remain = sec % 60
  return remain > 0 ? `${min}分${remain}秒后可再次同步` : `${min} 分钟后可再次同步`
}

const syncUploadCooldownText = computed(() => formatCooldownText(syncUploadCooldownMs.value))
const syncDownloadCooldownText = computed(() => formatCooldownText(syncDownloadCooldownMs.value))

const openConfirmDialog = ({
  title = '请确认',
  lines = [],
  confirmText = '确认',
  cancelText = '取消',
  danger = false
} = {}) => {
  confirmDialogTitle.value = String(title || '请确认')
  confirmDialogLines.value = Array.isArray(lines)
    ? lines.map((line) => String(line || '').trim()).filter(Boolean)
    : []
  confirmDialogConfirmText.value = String(confirmText || '确认')
  confirmDialogCancelText.value = String(cancelText || '取消')
  confirmDialogDanger.value = !!danger
  showConfirmDialog.value = true
}

const closeConfirmDialog = (result = false) => {
  showConfirmDialog.value = false
  const resolver = confirmDialogResolver
  confirmDialogResolver = null
  if (resolver) {
    resolver(!!result)
  }
}

const askConfirm = (options = {}) => {
  if (confirmDialogResolver) {
    confirmDialogResolver(false)
    confirmDialogResolver = null
  }
  openConfirmDialog(options)
  return new Promise((resolve) => {
    confirmDialogResolver = resolve
  })
}

const normalizeWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return []
  const normalized = weeks
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w > 0)
  return Array.from(new Set(normalized)).sort((a, b) => a - b)
}

const formatWeeksText = (weeks) => {
  const values = normalizeWeeks(weeks)
  if (!values.length) return ''
  const ranges = []
  let start = values[0]
  let prev = values[0]
  for (let i = 1; i < values.length; i += 1) {
    const current = values[i]
    if (current === prev + 1) {
      prev = current
      continue
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = current
    prev = current
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
  return ranges.join(',')
}

const mergeScheduleSources = () => {
  const merged = [...remoteScheduleData.value, ...customScheduleData.value]
  scheduleData.value = processScheduleData(merged)
}

const normalizeCustomCourse = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const weeks = normalizeWeeks(raw.weeks)
  return {
    id: String(raw.id || raw.source_id || ''),
    name: String(raw.name || '').trim(),
    teacher: String(raw.teacher || '').trim(),
    room: String(raw.room || raw.room_code || '').trim(),
    room_code: String(raw.room_code || raw.room || '').trim(),
    building: String(raw.building || '自定义').trim(),
    weekday: Number(raw.weekday || 1),
    period: Number(raw.period || 1),
    djs: Number(raw.djs || 1),
    weeks,
    weeks_text: String(raw.weeks_text || formatWeeksText(weeks)),
    credit: String(raw.credit || ''),
    class_name: String(raw.class_name || '自定义课程'),
    semester: String(raw.semester || semester.value || semesterDraft.value || ''),
    source_id: String(raw.source_id || raw.id || ''),
    is_custom: true
  }
}

const loadCustomCourses = async (targetSemester = '') => {
  const sid = String(props.studentId || '').trim()
  const sem = String(targetSemester || semester.value || semesterDraft.value || '').trim()
  if (!sid || !sem) {
    customScheduleData.value = []
    mergeScheduleSources()
    return false
  }

  try {
    const res = await axios.post(`${API_BASE}/v2/schedule/custom/list`, {
      student_id: sid,
      semester: sem
    })
    if (!res.data?.success) {
      throw new Error(res.data?.error || '加载自定义课程失败')
    }
    const list = Array.isArray(res.data?.data) ? res.data.data : []
    customScheduleData.value = list
      .map(normalizeCustomCourse)
      .filter(Boolean)
      .filter((course) => course.name && course.weekday >= 1 && course.weekday <= 7 && course.period >= 1 && course.period <= 11)
    mergeScheduleSources()
    return true
  } catch (e) {
    console.warn('加载自定义课程失败', e)
    customScheduleData.value = []
    mergeScheduleSources()
    return false
  }
}

const applyMeta = (meta, requestedSemester = '') => {
  const safeMeta = meta && typeof meta === 'object' ? meta : {}
  const resolvedSemester = String(safeMeta.semester || requestedSemester || semester.value || '').trim()
  if (resolvedSemester) {
    semester.value = resolvedSemester
    semesterDraft.value = resolvedSemester
  }

  startDateStr.value = String(safeMeta.start_date || '').trim()
  vacationNotice.value = String(safeMeta.vacation_notice || '').trim()

  const parsedWeeks = Number(safeMeta.total_weeks || 0)
  totalWeeks.value = Number.isFinite(parsedWeeks) && parsedWeeks > 0 ? parsedWeeks : 25

  const parsedCurrentWeek = Number(safeMeta.current_week || 0)
  const safeWeek = Number.isFinite(parsedCurrentWeek) && parsedCurrentWeek > 0
    ? Math.min(parsedCurrentWeek, totalWeeks.value)
    : 1
  currentWeek.value = safeWeek
  selectedWeek.value = safeWeek

  localStorage.setItem('hbu_schedule_meta', JSON.stringify({
    semester: resolvedSemester,
    start_date: startDateStr.value,
    current_week: currentWeek.value,
    total_weeks: totalWeeks.value,
    vacation_notice: vacationNotice.value
  }))
}

const applySchedulePayload = (payload, requestedSemester = '') => {
  if (!payload?.success) return false
  const rawData = Array.isArray(payload?.data) ? payload.data : []
  offline.value = !!payload.offline
  syncTime.value = payload.sync_time || ''
  remoteScheduleData.value = processScheduleData(rawData)
  mergeScheduleSources()
  applyMeta(payload.meta, requestedSemester)
  errorMsg.value = rawData.length === 0 ? '暂无可用课表' : ''
  return true
}

const applyCachedScheduleImmediately = (targetSemester = '') => {
  const sem = String(targetSemester || semester.value || semesterDraft.value || '').trim()
  if (!props.studentId || !sem) return false
  const snapshot = getCachedScheduleSnapshot(props.studentId, sem)
  if (!snapshot?.data?.success) return false
  const applied = applySchedulePayload(snapshot.data, sem)
  if (applied && !syncTime.value && snapshot.timestamp) {
    syncTime.value = new Date(snapshot.timestamp).toISOString()
  }
  return applied
}

const fetchSchedule = async (targetSemester = '') => {
  loading.value = true
  semesterError.value = ''
  const requestedSemester = String(targetSemester || semester.value || semesterDraft.value || '').trim()
  const previousSemester = String(semester.value || '').trim()
  errorMsg.value = ''
  try {
    if (requestedSemester && requestedSemester !== previousSemester) {
      customScheduleData.value = []
      mergeScheduleSources()
    }
    if (requestedSemester) {
      semester.value = requestedSemester
    }
    if (!props.studentId) {
      errorMsg.value = '请先在个人中心登录'
      return
    }
    const cacheKey = requestedSemester
      ? `schedule:${props.studentId}:${requestedSemester}`
      : `schedule:${props.studentId}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
        student_id: props.studentId,
        semester: requestedSemester || undefined
      })
      return res.data
    })

    if (data?.success) {
      applySchedulePayload(data, requestedSemester)
      await loadCustomCourses(requestedSemester || semester.value)
      if (!remoteScheduleData.value.length && customScheduleData.value.length > 0) {
        errorMsg.value = ''
      }
      if (requestedSemester) {
        writeScheduleLock(props.studentId, requestedSemester, 'schedule-fetch')
      }
      return true
    } else {
      if (data?.need_login) {
        const method = String(localStorage.getItem('hbu_login_method') || '').trim()
        const isTemp = localStorage.getItem('hbu_login_temp') === '1' || method.endsWith('_temp')
        if (isTemp) {
          emit('logout')
          return false
        }
        errorMsg.value = data?.error || '会话已过期，请重新登录'
        return false
      }
      remoteScheduleData.value = []
      mergeScheduleSources()
      offline.value = false
      vacationNotice.value = ''
      startDateStr.value = ''
      currentWeek.value = 1
      selectedWeek.value = 1
      totalWeeks.value = 25
      await loadCustomCourses(requestedSemester || semester.value)
      const message = String(data?.error || '获取课表失败')
      errorMsg.value = /无课表|暂无/.test(message) ? '暂无可用课表' : message
      if (customScheduleData.value.length > 0) {
        errorMsg.value = ''
      }
      return false
    }
  } catch (e) {
    console.error('获取课表异常', e)
    remoteScheduleData.value = []
    mergeScheduleSources()
    offline.value = false
    vacationNotice.value = ''
    startDateStr.value = ''
    currentWeek.value = 1
    selectedWeek.value = 1
    totalWeeks.value = 25
    await loadCustomCourses(requestedSemester || semester.value)
    const message = String(e?.message || '获取课表失败')
    errorMsg.value = /无课表|暂无/.test(message) ? '暂无可用课表' : message
    if (customScheduleData.value.length > 0) {
      errorMsg.value = ''
    }
    return false
  } finally {
    loading.value = false
  }
}

const fetchSemesterOptions = async () => {
  semesterLoading.value = true
  semesterError.value = ''
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    })
    if (!data?.success) {
      throw new Error(data?.error || '获取学期列表失败')
    }
    const list = normalizeSemesterList(data?.semesters || [])
    semesterOptions.value = list
    const resolved = resolveCurrentSemester(list, semester.value || data?.current)
    if (resolved) {
      semesterDraft.value = resolved
      if (!semester.value) semester.value = resolved
    }
  } catch (e) {
    semesterError.value = e?.message || '获取学期列表失败'
  } finally {
    semesterLoading.value = false
  }
}

const applySemesterQuery = async () => {
  const selected = String(semesterDraft.value || '').trim()
  if (!selected) {
    semesterError.value = '请选择学期'
    return
  }
  currentWeek.value = 1
  selectedWeek.value = 1
  totalWeeks.value = 25
  startDateStr.value = ''
  vacationNotice.value = ''
  const ok = await fetchSchedule(selected)
  if (ok) {
    writeScheduleLock(props.studentId, selected, 'manual-select')
  }
}

const onSemesterChange = async () => {
  const selected = String(semesterDraft.value || '').trim()
  if (!selected || selected === semester.value) return
  await applySemesterQuery()
}

watch(selectedWeek, (next, prev) => {
  const current = Number(next || 0)
  const previous = Number(prev || 0)
  const maxWeeks = Math.max(1, Number(totalWeeks.value || 1))
  if (!Number.isFinite(current) || current <= 0) {
    selectedWeek.value = 1
    return
  }
  if (current > maxWeeks) {
    selectedWeek.value = maxWeeks
    return
  }
  if (previous > 0 && current !== previous) {
    weekTransitionName.value = current > previous ? 'week-slide-left' : 'week-slide-right'
  }
})

watch(totalWeeks, (maxWeeks) => {
  if (!Number.isFinite(maxWeeks) || maxWeeks <= 0) return
  if (selectedWeek.value > maxWeeks) {
    selectedWeek.value = maxWeeks
  }
  if (currentWeek.value > maxWeeks) {
    currentWeek.value = maxWeeks
  }
})

watch(
  () => props.studentId,
  () => {
    refreshCloudSyncCooldown()
  }
)

watch(
  () => uiSettings.scheduleCourseCardStyle,
  (value) => {
    scheduleCourseCardStyle.value = value === 'traditional' ? 'traditional' : 'modern'
    pushDebugLog('Schedule', `课表样式状态同步：${scheduleCourseCardStyle.value}`, 'debug')
  },
  { immediate: true }
)

watch(
  () => addCourseForm.value.period,
  (periodValue) => {
    const start = Number(periodValue) || 1
    const maxSpan = Math.max(1, 12 - start)
    if (Number(addCourseForm.value.djs) > maxSpan) {
      addCourseForm.value.djs = maxSpan
    }
    if (Number(addCourseForm.value.djs) < 1) {
      addCourseForm.value.djs = 1
    }
  }
)

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

const hexToRgb = (hex) => {
  const text = String(hex || '').trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return null
  return {
    r: Number.parseInt(text.slice(0, 2), 16),
    g: Number.parseInt(text.slice(2, 4), 16),
    b: Number.parseInt(text.slice(4, 6), 16)
  }
}

const colorDistance = (aHex, bHex) => {
  const a = hexToRgb(aHex)
  const b = hexToRgb(bHex)
  if (!a || !b) return 0
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

const getThemeContrastScore = (aIndex, bIndex) => {
  const themeA = courseThemes[aIndex] || {}
  const themeB = courseThemes[bIndex] || {}
  const borderGap = colorDistance(themeA.border, themeB.border)
  const textGap = colorDistance(themeA.text, themeB.text)
  // 颜色分配主要看边框色差，文字色作为次要补充。
  return borderGap * 0.72 + textGap * 0.28
}

const getCircularOffset = (seed, candidate) => {
  const len = courseThemes.length
  const forward = (candidate - seed + len) % len
  const backward = (seed - candidate + len) % len
  return Math.min(forward, backward)
}

const evaluateThemeCandidate = (candidate, seed, neighborColors, globalColors) => {
  const neighborMinContrast = neighborColors.length
    ? neighborColors.reduce((minGap, neighborColor) => {
      const gap = getThemeContrastScore(candidate, neighborColor)
      return gap < minGap ? gap : minGap
    }, Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY

  const globalMinContrast = globalColors.length
    ? globalColors.reduce((minGap, globalColor) => {
      const gap = getThemeContrastScore(candidate, globalColor)
      return gap < minGap ? gap : minGap
    }, Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY

  return {
    candidate,
    neighborMinContrast,
    globalMinContrast,
    offset: getCircularOffset(seed, candidate)
  }
}

const pickBestThemeCandidate = (candidates, seed, neighborColors, globalColors) => {
  let best = null
  candidates.forEach((candidate) => {
    const metrics = evaluateThemeCandidate(candidate, seed, neighborColors, globalColors)
    if (!best) {
      best = metrics
      return
    }
    if (metrics.neighborMinContrast > best.neighborMinContrast) {
      best = metrics
      return
    }
    if (
      metrics.neighborMinContrast === best.neighborMinContrast &&
      metrics.globalMinContrast > best.globalMinContrast
    ) {
      best = metrics
      return
    }
    if (
      metrics.neighborMinContrast === best.neighborMinContrast &&
      metrics.globalMinContrast === best.globalMinContrast &&
      metrics.offset < best.offset
    ) {
      best = metrics
    }
  })
  return best?.candidate ?? null
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

const getCourseMergeSignature = (course) => {
  const id = String(course?.id || course?.source_id || '').trim()
  const name = String(course?.name || '').trim()
  const teacher = String(course?.teacher || '').trim()
  const room = String(course?.room_code || course?.room || '').trim()
  const building = String(course?.building || '').trim()
  const className = String(course?.class_name || '').trim()
  const custom = course?.is_custom ? '1' : '0'
  return `${id}|${name}|${teacher}|${room}|${building}|${className}|${custom}`
}

const getCourseEndPeriod = (course) => {
  const start = Number(course?.period) || 1
  const span = Math.max(1, Number(course?.djs) || 1)
  return Math.min(MAX_PERIOD, start + span - 1)
}

const mergeDailyCourses = (dailyCourses) => {
  if (!dailyCourses.length) return []
  const signatureCount = new Map()
  dailyCourses.forEach((course) => {
    const signature = getCourseMergeSignature(course)
    signatureCount.set(signature, (signatureCount.get(signature) || 0) + 1)
  })

  const resolveRawSpan = (course) => {
    const start = Number(course?.period) || 1
    if (course?.is_custom) {
      return Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course?.djs) || 1))
    }
    const signature = getCourseMergeSignature(course)
    const count = Number(signatureCount.get(signature) || 0)
    if (count > 1) {
      return 1
    }
    const candidate = Number(course?.djs) || 1
    if (candidate >= 1 && candidate <= MAX_PERIOD && start + candidate - 1 <= MAX_PERIOD) {
      return candidate
    }
    return 1
  }

  const merged = []
  let i = 0

  while (i < dailyCourses.length) {
    const current = dailyCourses[i]
    const startPeriod = Number(current.period) || 1
    const currentSpan = resolveRawSpan(current)
    let endPeriod = Math.min(MAX_PERIOD, startPeriod + currentSpan - 1)

    let j = i + 1
    while (j < dailyCourses.length) {
      const next = dailyCourses[j]
      const nextStart = Number(next.period) || 1
      const nextSpan = resolveRawSpan(next)
      const nextEnd = Math.min(MAX_PERIOD, nextStart + nextSpan - 1)
      const sameSignature = getCourseMergeSignature(next) === getCourseMergeSignature(current)
      const canMergeSinglePeriodOnly = currentSpan === 1 && nextSpan === 1
      if (
        sameSignature &&
        canMergeSinglePeriodOnly &&
        !!next.is_custom === !!current.is_custom &&
        nextStart === endPeriod + 1
      ) {
        endPeriod = Math.max(endPeriod, nextEnd)
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

const buildConflictBlocks = (day, mergedCourses, weekNumber) => {
  if (!Array.isArray(mergedCourses) || mergedCourses.length < 2) return []
  const periodConflicts = []

  for (let period = 1; period <= 11; period += 1) {
    const activeRaw = mergedCourses.filter(course => {
      const start = Number(course._start || course.period || 1)
      const span = Math.max(1, Number(course.djs || 1))
      const end = Number(course._end || (start + span - 1))
      return period >= start && period <= end && !course.is_conflict
    })
    const active = []
    const signatureSet = new Set()
    activeRaw.forEach((course) => {
      const signature = `${getCourseMergeSignature(course)}|${course.period}|${course.djs}`
      if (signatureSet.has(signature)) return
      signatureSet.add(signature)
      active.push(course)
    })
    if (active.length > 1) {
      const ids = active
        .map(course => String(course._uid || course.id || course.name))
        .sort()
      periodConflicts.push({
        period,
        key: ids.join('|'),
        active
      })
    }
  }

  if (!periodConflicts.length) return []

  const blocks = []
  let i = 0
  while (i < periodConflicts.length) {
    const current = periodConflicts[i]
    let end = current.period
    let j = i + 1
    while (
      j < periodConflicts.length &&
      periodConflicts[j].period === end + 1 &&
      periodConflicts[j].key === current.key
    ) {
      end = periodConflicts[j].period
      j += 1
    }
    const conflictCourses = current.active
    const title = `课程冲突（${conflictCourses.length}门）`
    blocks.push({
      id: `conflict:${day}:${current.period}:${end}:${current.key}`,
      name: title,
      teacher: '',
      room: '点击查看冲突详情',
      room_code: `${conflictCourses.length}门冲突`,
      building: '冲突提示',
      weekday: day,
      period: current.period,
      djs: end - current.period + 1,
      weeks: [weekNumber],
      weeks_text: String(weekNumber),
      credit: '',
      class_name: '冲突课程',
      is_conflict: true,
      conflict_courses: conflictCourses.map(course => ({
        id: course.id,
        name: course.name,
        teacher: course.teacher,
        room: course.room,
        room_code: course.room_code,
        building: course.building,
        weekday: course.weekday,
        period: course.period,
        djs: course.djs,
        weeks_text: course.weeks_text,
        is_custom: !!course.is_custom
      }))
    })
    i = j
  }

  return blocks
}

const buildWeekCoursesWithColors = (weekNumber) => {
  const byDay = {}
  const nodes = []
  const nameBuckets = new Map()

  for (let day = 1; day <= 7; day += 1) {
    const dailyCourses = scheduleData.value
      .filter(course => course.weekday === day && course.weeks.includes(weekNumber))
      .sort((a, b) => a.period - b.period)

    const merged = mergeDailyCourses(dailyCourses).map((course, index) => {
      const span = Math.max(1, Number(course.djs) || 1)
      const start = Number(course.period)
      const end = Math.min(MAX_PERIOD, start + span - 1)
      return {
        ...course,
        _day: day,
        _start: start,
        _end: end,
        _uid: `${day}-${start}-${end}-${course.name}-${index}`
      }
    })

    const conflicts = buildConflictBlocks(day, merged, weekNumber)
    byDay[day] = [...merged, ...conflicts]
    merged.forEach((node) => {
      nodes.push(node)
      const nameKey = String(node.name || '')
      if (!nameBuckets.has(nameKey)) {
        nameBuckets.set(nameKey, [])
      }
      nameBuckets.get(nameKey).push(node)
    })
  }

  if (!nodes.length) return byDay

  // 颜色规则：
  // 1) 同名课程在整周内使用同一配色。
  // 2) 仅当课程名称不同且在时间/空间上相邻时，配色必须不同。
  const nameNeighbors = new Map([...nameBuckets.keys()].map((name) => [name, new Set()]))
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      const nameA = String(a.name || '')
      const nameB = String(b.name || '')
      if (nameA !== nameB && areAdjacentCourses(a, b)) {
        nameNeighbors.get(nameA)?.add(nameB)
        nameNeighbors.get(nameB)?.add(nameA)
      }
    }
  }

  const orderedNames = [...nameBuckets.keys()].sort((a, b) => {
    const degreeDiff = (nameNeighbors.get(b)?.size || 0) - (nameNeighbors.get(a)?.size || 0)
    if (degreeDiff !== 0) return degreeDiff
    return hashText(a) - hashText(b)
  })

  const colorByName = new Map()
  const globallyUsedColors = new Set()
  const allCandidates = Array.from({ length: courseThemes.length }, (_, i) => i)
  orderedNames.forEach((name) => {
    const neighborColorSet = new Set()
    nameNeighbors.get(name)?.forEach((neighborName) => {
      if (!colorByName.has(neighborName)) return
      const neighborColor = colorByName.get(neighborName)
      neighborColorSet.add(neighborColor)
    })
    const neighborColors = [...neighborColorSet]
    const globalColors = [...globallyUsedColors]

    const seed = hashText(name) % courseThemes.length
    // 规则优先级：
    // 1) 优先全局唯一（不同课程尽量不重复颜色）。
    // 2) 其次保证邻接课程颜色不重复。
    // 3) 在候选内选择与邻接/全局已有颜色对比度更高的颜色。
    const uniqueCandidates = allCandidates.filter(
      (candidate) => !globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    )
    const reusableCandidates = allCandidates.filter(
      (candidate) => globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    )
    const noNeighborConflictCandidates = allCandidates.filter(
      (candidate) => !neighborColorSet.has(candidate)
    )

    let chosen = pickBestThemeCandidate(uniqueCandidates, seed, neighborColors, globalColors)
    if (chosen === null) {
      chosen = pickBestThemeCandidate(reusableCandidates, seed, neighborColors, globalColors)
    }
    if (chosen === null) {
      chosen = pickBestThemeCandidate(noNeighborConflictCandidates, seed, neighborColors, globalColors)
    }
    if (chosen === null) {
      // 极端兜底：即使邻接冲突也保证有稳定结果
      chosen = pickBestThemeCandidate(allCandidates, seed, neighborColors, globalColors)
    }
    if (chosen === null) chosen = seed
    colorByName.set(name, chosen)
    globallyUsedColors.add(chosen)
  })

  for (let day = 1; day <= 7; day += 1) {
    byDay[day] = (byDay[day] || []).map(course => ({
      ...course,
      colorIndex: course.is_conflict
        ? 0
        : (colorByName.get(String(course.name || '')) ?? 0)
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
  const start = Number(course.period) || 1
  const span = Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course.djs) || 1))
  const isTraditionalCard = scheduleCourseCardStyle.value === 'traditional'
  // 现代样式使用连续圆角，避免竖向出现“尖顶”视觉。
  const modernRadius = '14px'
  const traditionalRadius = '8px'
  if (course.is_conflict) {
    return {
      '--course-bg': isTraditionalCard
        ? '#dc2626'
        : 'repeating-linear-gradient(135deg, #fff1f2 0, #fff1f2 8px, #ffe4e6 8px, #ffe4e6 16px)',
      '--course-text': isTraditionalCard ? '#ffffff' : '#b91c1c',
      '--course-border': '#dc2626',
      '--course-shadow': isTraditionalCard
        ? '0 4px 10px rgba(220, 38, 38, 0.18)'
        : '0 8px 18px rgba(220, 38, 38, 0.2)',
      '--course-span': String(span),
      '--course-radius': isTraditionalCard ? traditionalRadius : modernRadius,
      '--course-border-width': '2px',
      gridRow: `${start} / span ${span}`,
      gridColumn: '1',
      zIndex: 4
    }
  }
  
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
  const isCustom = !!course.is_custom
  const borderColor = isCustom ? '#111111' : (theme.border || '#cbd5e1')
  const traditionalBackground = isCustom ? '#111111' : borderColor
  const traditionalText = '#ffffff'
  const modernBackground = 'rgba(255, 255, 255, 0.92)'
  const normalShadow = isCustom
    ? '0 7px 16px rgba(15, 23, 42, 0.24)'
    : '0 6px 14px rgba(71, 85, 105, 0.16)'
  const traditionalShadow = '0 4px 10px rgba(15, 23, 42, 0.14)'
  
  return {
    '--course-bg': isTraditionalCard ? traditionalBackground : modernBackground,
    '--course-text': isTraditionalCard ? traditionalText : theme.text,
    '--course-border': borderColor,
    '--course-shadow': isTraditionalCard ? traditionalShadow : normalShadow,
    '--course-span': String(span),
    '--course-radius': isTraditionalCard ? traditionalRadius : modernRadius,
    '--course-border-width': isCustom ? '2px' : '1px',
    gridRow: `${start} / span ${span}`,
    gridColumn: '1',
    zIndex: 1,
    // 增加间隔 (或者通过 margin 在 css 控制)
  }
}

const openDetail = (course) => {
  detailActionError.value = ''
  selectedCourse.value = course
  showDetail.value = true
}

const resetAddCourseForm = () => {
  addCourseForm.value = {
    name: '',
    teacher: '',
    room: '',
    weekday: 1,
    period: 1,
    djs: 1,
    weeks: semesterWeekOptions.value.slice()
  }
  addCourseError.value = ''
  showWeekPicker.value = false
}

const hasValidLoginSession = () => {
  const sid = String(props.studentId || '').trim()
  const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || '').trim()
  return !!sid && !!sessionToken
}

const promptLoginRequired = async () => {
  errorMsg.value = '请先登录后再添加课程'
  showMenu.value = false
  await askConfirm({
    title: '需要登录',
    lines: ['请先登录后再添加课程。'],
    confirmText: '我知道了',
    cancelText: '关闭',
    danger: false
  })
}

const openAddCourseDialog = () => {
  if (!hasValidLoginSession()) {
    void promptLoginRequired()
    return
  }
  const sem = String(semester.value || semesterDraft.value || '').trim()
  if (!sem) {
    semesterError.value = '请先选择学期后再添加课程'
    return
  }
  resetAddCourseForm()
  showAddCourse.value = true
}

const closeAddCourseDialog = () => {
  showAddCourse.value = false
  showWeekPicker.value = false
  addCourseError.value = ''
}

const toggleAddCourseWeek = (week) => {
  const current = normalizeWeeks(addCourseForm.value.weeks)
  if (current.includes(week)) {
    addCourseForm.value.weeks = current.filter((w) => w !== week)
    return
  }
  addCourseForm.value.weeks = normalizeWeeks([...current, week])
}

const selectAllAddCourseWeeks = () => {
  addCourseForm.value.weeks = semesterWeekOptions.value.slice()
}

const clearAddCourseWeeks = () => {
  addCourseForm.value.weeks = []
}

const validateAddCourse = () => {
  const name = String(addCourseForm.value.name || '').trim()
  if (!name) return '课程名称不能为空'
  const weeks = normalizeWeeks(addCourseForm.value.weeks)
  if (!weeks.length) return '请至少选择一个周次'
  const weekday = Number(addCourseForm.value.weekday)
  if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) return '请选择上课时间'
  const period = Number(addCourseForm.value.period)
  if (!Number.isFinite(period) || period < 1 || period > 11) return '开始节次必须在 1-11 节'
  const span = Number(addCourseForm.value.djs)
  const maxSpan = Math.max(1, 12 - period)
  if (!Number.isFinite(span) || span < 1 || span > maxSpan) return `上课节数必须在 1-${maxSpan} 节`
  return ''
}

const submitAddCourse = async () => {
  if (!hasValidLoginSession()) {
    await promptLoginRequired()
    return
  }
  const sem = String(semester.value || semesterDraft.value || '').trim()
  if (!sem) {
    addCourseError.value = '学期无效，请重新选择'
    return
  }
  const sid = String(props.studentId || '').trim()
  if (!sid) {
    addCourseError.value = '请先登录后再添加课程'
    return
  }
  const validationError = validateAddCourse()
  if (validationError) {
    addCourseError.value = validationError
    return
  }

  const weeks = normalizeWeeks(addCourseForm.value.weeks)
  const payload = {
    student_id: sid,
    semester: sem,
    name: String(addCourseForm.value.name || '').trim(),
    teacher: String(addCourseForm.value.teacher || '').trim(),
    room: String(addCourseForm.value.room || '').trim(),
    weekday: Number(addCourseForm.value.weekday),
    period: Number(addCourseForm.value.period),
    djs: Number(addCourseForm.value.djs),
    weeks
  }

  const confirmText = [
    `确认添加到学期：${sem}`,
    `课程：${payload.name}`,
    `时间：${weekDayLabels[payload.weekday - 1]} 第${payload.period}-${payload.period + payload.djs - 1}节`,
    `周次：${formatWeeksText(weeks)}`
  ]
  const confirmed = await askConfirm({
    title: '确认添加课程',
    lines: confirmText,
    confirmText: '确认添加',
    cancelText: '取消',
    danger: false
  })
  if (!confirmed) {
    return
  }

  addingCourse.value = true
  addCourseError.value = ''
  try {
    const res = await axios.post(`${API_BASE}/v2/schedule/custom/add`, payload)
    if (!res.data?.success) {
      throw new Error(res.data?.error || '添加课程失败')
    }
    await loadCustomCourses(sem)
    showAddCourse.value = false
    showWeekPicker.value = false
  } catch (e) {
    addCourseError.value = String(e?.response?.data?.error || e?.message || '添加课程失败')
  } finally {
    addingCourse.value = false
  }
}

const deleteCustomCourse = async (mode) => {
  const course = selectedCourse.value
  if (!course?.is_custom) return
  const sem = String(semester.value || semesterDraft.value || '').trim()
  const sid = String(props.studentId || '').trim()
  if (!sem || !sid) return
  const courseId = String(course.source_id || course.id || '').trim()
  if (!courseId) return

  const isCurrentWeek = mode === 'current_week'
  const week = Number(selectedWeek.value || 0)
  const message = isCurrentWeek
    ? `确认删除“${course.name}”在第${week}周的课程吗？`
    : `确认删除“${course.name}”的全部已选周次吗？`
  const confirmed = await askConfirm({
    title: '确认删除课程',
    lines: [message],
    confirmText: '确认删除',
    cancelText: '取消',
    danger: true
  })
  if (!confirmed) return

  try {
    const payload = {
      student_id: sid,
      semester: sem,
      course_id: courseId,
      mode: isCurrentWeek ? 'current_week' : 'all',
      current_week: isCurrentWeek ? week : undefined
    }
    const res = await axios.post(`${API_BASE}/v2/schedule/custom/delete`, payload)
    if (!res.data?.success) {
      throw new Error(res.data?.error || '删除课程失败')
    }
    await loadCustomCourses(sem)
    showDetail.value = false
    detailActionError.value = ''
  } catch (e) {
    detailActionError.value = String(e?.response?.data?.error || e?.message || '删除课程失败')
  }
}

// 滑动翻页（距离+速度双阈值）
let touchStartX = 0
let touchStartY = 0
let touchLastX = 0
let touchStartAt = 0
let swipeTracking = false
let swipeLocked = false

const shouldIgnoreWeekSwipe = () => {
  return (
    showMenu.value ||
    showAddCourse.value ||
    showWeekPicker.value ||
    showDetail.value ||
    showConfirmDialog.value ||
    showSemesterPopup.value
  )
}

const shiftWeek = (delta) => {
  if (swipeLocked) return false
  const current = Number(selectedWeek.value || 0)
  const max = Math.max(1, Number(totalWeeks.value || 1))
  const target = Math.min(max, Math.max(1, current + delta))
  if (target === current) return false
  weekTransitionName.value = delta > 0 ? 'week-slide-left' : 'week-slide-right'
  selectedWeek.value = target
  swipeLocked = true
  window.setTimeout(() => {
    swipeLocked = false
  }, 260)
  return true
}

const handleTouchStart = (e) => {
  if (shouldIgnoreWeekSwipe()) return
  const touch = e.changedTouches?.[0]
  if (!touch) return
  swipeTracking = true
  touchStartX = touch.screenX
  touchStartY = touch.screenY
  touchLastX = touch.screenX
  touchStartAt = Date.now()
}

const handleTouchMove = (e) => {
  if (!swipeTracking) return
  const touch = e.changedTouches?.[0]
  if (!touch) return
  touchLastX = touch.screenX
  const dx = Math.abs(touch.screenX - touchStartX)
  const dy = Math.abs(touch.screenY - touchStartY)
  if (dy > dx && dy > 16) {
    swipeTracking = false
  }
}

const handleTouchEnd = (e) => {
  if (!swipeTracking) return
  swipeTracking = false
  const touch = e.changedTouches?.[0]
  const endX = touch?.screenX ?? touchLastX
  const diff = touchStartX - endX
  const durationMs = Math.max(1, Date.now() - touchStartAt)
  const velocity = Math.abs(diff) / durationMs // px/ms
  const distancePass = Math.abs(diff) >= 52
  const velocityPass = Math.abs(diff) >= 24 && velocity >= 0.52
  if (!distancePass && !velocityPass) return
  if (diff > 0) {
    shiftWeek(1)
    return
  }
  shiftWeek(-1)
}

const shouldIgnoreKeyboardWeekSwitch = () => {
  if (shouldIgnoreWeekSwipe()) return true
  const active = document.activeElement
  if (!active) return false
  const tag = String(active.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return !!active.getAttribute?.('contenteditable')
}

const handleWeekKeydown = (event) => {
  if (!event) return
  if (event.defaultPrevented) return
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (shouldIgnoreKeyboardWeekSwitch()) return

  if (event.key === 'ArrowLeft') {
    const changed = shiftWeek(-1)
    if (changed) event.preventDefault()
    return
  }
  if (event.key === 'ArrowRight') {
    const changed = shiftWeek(1)
    if (changed) event.preventDefault()
  }
}

const handleBack = () => emit('back')
const jumpToCurrentWeek = () => {
  if (currentWeek.value) {
    weekTransitionName.value =
      Number(currentWeek.value) >= Number(selectedWeek.value) ? 'week-slide-left' : 'week-slide-right'
    selectedWeek.value = currentWeek.value
  }
}

const toggleMenu = () => {
  showMenu.value = !showMenu.value
  if (!showMenu.value) {
    exportCopied.value = false
  }
}

const setScheduleCourseCardStyle = (styleKey) => {
  const nextStyle = styleKey === 'traditional' ? 'traditional' : 'modern'
  if (scheduleCourseCardStyle.value === nextStyle) return
  scheduleCourseCardStyle.value = nextStyle
  courseCardRefreshNonce.value += 1
  uiSettings.scheduleCourseCardStyle = nextStyle
  flushUiSettings()
  pushDebugLog('Schedule', `切换课表样式：${nextStyle}`, 'info')
  try {
    const snapshot = JSON.parse(localStorage.getItem('hbu_ui_settings_v2') || '{}')
    pushDebugLog(
      'Schedule',
      `课表样式已写入本地缓存：${String(snapshot?.scheduleCourseCardStyle || '') || 'unknown'}`,
      'debug'
    )
  } catch (error) {
    pushDebugLog('Schedule', '读取课表样式缓存失败', 'warn', error)
  }
  nextTick(() => {
    courseCardRefreshNonce.value += 1
    pushDebugLog(
      'Schedule',
      `课表样式热刷新完成：${nextStyle}，nonce=${courseCardRefreshNonce.value}`,
      'debug'
    )
  })
  showToast(`已切换为${nextStyle === 'traditional' ? '传统' : '现代'}样式`, 'success')
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
      const endPeriod = getCourseEndPeriod(course)
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
    const maxCourseWeek = Array.isArray(course.weeks) && course.weeks.length
      ? Math.max(...course.weeks)
      : 0
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
        const endPeriod = getCourseEndPeriod(course)
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
    const uploadEndpoint = String(localStorage.getItem('hbu_temp_upload_endpoint') || '').trim()
    const payload = {
      student_id: props.studentId,
      semester: semester.value,
      week: selectedWeek.value,
      events
    }
    if (uploadEndpoint) {
      payload.upload_endpoint = uploadEndpoint
    }
    const res = await axios.post(`${API_BASE}/v2/schedule/export_calendar`, payload)
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

const refreshCloudSyncCooldown = () => {
  const sid = String(props.studentId || '').trim()
  if (!sid) {
    syncUploadCooldownMs.value = 0
    syncDownloadCooldownMs.value = 0
    return
  }
  const uploadState = getCloudSyncCooldownState(sid, 'upload')
  const downloadState = getCloudSyncCooldownState(sid, 'download')
  syncUploadCooldownMs.value = Math.max(0, Number(uploadState.remainingMs || 0))
  syncDownloadCooldownMs.value = Math.max(0, Number(downloadState.remainingMs || 0))
}

const clearCloudSyncCooldownTimer = () => {
  if (!syncCooldownTimer) return
  window.clearInterval(syncCooldownTimer)
  syncCooldownTimer = null
}

const ensureCloudSyncCooldownTimer = () => {
  clearCloudSyncCooldownTimer()
  syncCooldownTimer = window.setInterval(() => {
    refreshCloudSyncCooldown()
  }, 1000)
}

const refreshScheduleAfterCloudDownload = async (syncResult = {}) => {
  const sem = String(semester.value || semesterDraft.value || '').trim()
  if (!sem) return
  const downloadedSemesters = Array.isArray(syncResult?.academicApplied?.scheduleSemesters)
    ? syncResult.academicApplied.scheduleSemesters.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const shouldRefreshSchedule = downloadedSemesters.length === 0 || downloadedSemesters.includes(sem)
  const hasCached = shouldRefreshSchedule ? applyCachedScheduleImmediately(sem) : false
  await loadCustomCourses(sem)
  if (!hasCached && shouldRefreshSchedule) {
    await fetchSchedule(sem)
  }
}

const handleCloudSyncUpdated = (event) => {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  const sid = String(props.studentId || '').trim()
  const targetSid = String(detail?.studentId || '').trim()
  if (!sid || !targetSid || sid !== targetSid) return
  refreshCloudSyncCooldown()
  if (detail?.action !== 'download' || !detail?.success) return
  if (syncDownloading.value) return
  void refreshScheduleAfterCloudDownload(detail).catch((error) => {
    console.warn('[Schedule] cloud sync auto refresh failed:', error)
  })
}

const handleCloudSyncUpload = async () => {
  if (!hasValidLoginSession()) {
    await promptLoginRequired()
    return
  }
  const sid = String(props.studentId || '').trim()
  if (!sid || syncUploading.value || syncDownloading.value) return

  refreshCloudSyncCooldown()
  if (syncUploadCooldownMs.value > 0) {
    showToast(`上传冷却中，${syncUploadCooldownText.value}`, 'info')
    return
  }

  const sem = String(semester.value || semesterDraft.value || '').trim()
  const confirmed = await askConfirm({
    title: '确认上传到云端',
    lines: [
      '将覆盖云端已有的自定义课程数据。',
      `当前学期：${sem || '未选择学期'}`,
      '确认后将立即执行上传。'
    ],
    confirmText: '确认上传',
    cancelText: '取消',
    danger: true
  })
  if (!confirmed) return

  syncUploading.value = true
  syncStatusText.value = '正在上传云端备份...'
  try {
    const result = await runCloudSyncUpload({
      studentId: sid,
      reason: 'schedule-manual-upload',
      force: false,
      includeCustomCourses: true,
      includeAcademic: true,
      includeSettings: true
    })
    if (!result?.success) {
      if (result?.cooldown) {
        syncUploadCooldownMs.value = Number(result.remainingMs || 0)
        showToast(`上传冷却中，${syncUploadCooldownText.value}`, 'info')
      } else {
        showToast(result?.error || '云上传失败', 'error')
      }
      return
    }
    refreshCloudSyncCooldown()
    showToast('云上传完成', 'success')
  } catch (e) {
    showToast(String(e?.message || '云上传失败'), 'error')
  } finally {
    syncUploading.value = false
    syncStatusText.value = ''
  }
}

const handleCloudSyncDownload = async () => {
  if (!hasValidLoginSession()) {
    await promptLoginRequired()
    return
  }
  const sid = String(props.studentId || '').trim()
  if (!sid || syncUploading.value || syncDownloading.value) return

  refreshCloudSyncCooldown()
  if (syncDownloadCooldownMs.value > 0) {
    showToast(`下载冷却中，${syncDownloadCooldownText.value}`, 'info')
    return
  }

  syncDownloading.value = true
  syncStatusText.value = '正在下载云端备份并覆盖本地课表...'
  try {
    const result = await runCloudSyncDownload({
      studentId: sid,
      reason: 'schedule-manual-download',
      force: false,
      applySettings: true,
      applyCustomCourses: true
    })
    if (!result?.success) {
      if (result?.cooldown) {
        syncDownloadCooldownMs.value = Number(result.remainingMs || 0)
        showToast(`下载冷却中，${syncDownloadCooldownText.value}`, 'info')
      } else {
        showToast(result?.error || '云下载失败', 'error')
      }
      return
    }
    await refreshScheduleAfterCloudDownload(result)
    refreshCloudSyncCooldown()
    if (result?.empty) {
      showToast('云端暂无备份，已记录本次同步', 'info')
    } else {
      showToast('云下载完成，已应用本地设置与自定义课程', 'success')
    }
  } catch (e) {
    showToast(String(e?.message || '云下载失败'), 'error')
  } finally {
    syncDownloading.value = false
    syncStatusText.value = ''
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleWeekKeydown)
  window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, handleCloudSyncUpdated)
  refreshCloudSyncCooldown()
  ensureCloudSyncCooldownTimer()
  void fetchSemesterOptions()

  // 下次进入自动切换：后台检测到新学期并已确认有课表数据时生效。
  const switchSemester = consumeScheduleSwitchPending(props.studentId)
  if (switchSemester) {
    writeScheduleLock(props.studentId, switchSemester, 'pending-switch')
    semester.value = switchSemester
    semesterDraft.value = switchSemester
  }

  // 仅当存在“显式锁定学期”时才走秒开锁定路径；
  // 旧版本可能只留下了 hbu_schedule_meta，不能把它当作锁定依据。
  const lockedSemester = String(readScheduleLock(props.studentId) || '').trim()
  if (lockedSemester) {
    semester.value = lockedSemester
    semesterDraft.value = lockedSemester

    const hasInstantCache = applyCachedScheduleImmediately(lockedSemester)
    if (hasInstantCache) {
      void loadCustomCourses(lockedSemester)
      // 有缓存时先秒开，再后台刷新，避免每次进入“空白等待”。
      void fetchSchedule(lockedSemester)
    } else {
      await fetchSchedule(lockedSemester)
    }
  } else if (props.studentId) {
    // 首次进入且无锁定学期：允许一次性等待，探测最近有课表的学期并锁定。
    const warmed = await warmupScheduleForStudent(props.studentId, {
      forceProbe: true,
      reason: 'first-enter'
    })
    if (warmed?.success && warmed?.semester) {
      semester.value = warmed.semester
      semesterDraft.value = warmed.semester
      if (!applySchedulePayload(warmed.payload, warmed.semester)) {
        await fetchSchedule(warmed.semester)
      } else {
        await loadCustomCourses(warmed.semester)
      }
    } else {
      await fetchSchedule()
    }
  } else {
    await fetchSchedule()
  }

  const pendingSemester = consumePendingSemesterPopup()
  if (pendingSemester) {
    openSemesterPopup(pendingSemester)
    return
  }
  if (!isPopupShown()) {
    openSemesterPopup()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWeekKeydown)
  window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, handleCloudSyncUpdated)
  clearCloudSyncCooldownTimer()
})
</script>

<template>
  <div
    class="schedule-view"
    @touchstart.passive="handleTouchStart"
    @touchmove.passive="handleTouchMove"
    @touchend.passive="handleTouchEnd"
    @touchcancel.passive="handleTouchEnd"
  >
    <!-- 头部导航 -->
    <div class="schedule-topbar">
      <button class="menu-btn btn-ripple" @click="toggleMenu" aria-label="打开课表菜单">
        <span class="menu-bar"></span>
        <span class="menu-bar"></span>
        <span class="menu-bar"></span>
      </button>
      <div class="week-selector">
        <select v-model.number="selectedWeek">
          <option disabled value="0">请选择周次</option>
          <option v-for="w in totalWeeks" :key="w" :value="w">第{{ w }}周</option>
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
        <div class="drawer-section">
          <div class="drawer-subtitle">选择学期</div>
          <div class="drawer-semester-row">
            <select class="drawer-select" v-model="semesterDraft" :disabled="semesterLoading || loading" @change="onSemesterChange">
              <option disabled value="">请选择学期</option>
              <option v-for="sem in semesterOptions" :key="sem" :value="sem">{{ sem }}</option>
            </select>
          </div>
          <div v-if="semesterError" class="drawer-error">{{ semesterError }}</div>
        </div>

        <div class="drawer-section">
          <div class="drawer-subtitle">课程样式</div>
          <div class="drawer-style-switch" role="tablist" aria-label="课程样式切换">
            <button
              v-for="item in courseCardStyleOptions"
              :key="item.key"
              type="button"
              class="drawer-style-chip"
              :class="{ active: scheduleCourseCardStyle === item.key }"
              role="tab"
              :aria-pressed="scheduleCourseCardStyle === item.key"
              :aria-selected="scheduleCourseCardStyle === item.key"
              @click.stop="setScheduleCourseCardStyle(item.key)"
            >
              <strong>{{ item.label }}</strong>
            </button>
          </div>
        </div>

        <div class="drawer-actions">
          <button class="drawer-action add-course" :disabled="addingCourse" @click="openAddCourseDialog">
            添加课程
          </button>
          <div class="drawer-sync-group">
            <div class="drawer-subtitle">自定义课程同步</div>
            <div class="drawer-sync-actions">
              <button
                class="drawer-action sync-upload"
                :disabled="syncUploading || syncDownloading"
                @click="handleCloudSyncUpload"
              >
                {{ syncUploading ? '云上传中...' : '云上传' }}
              </button>
              <button
                class="drawer-action sync-download"
                :disabled="syncUploading || syncDownloading"
                @click="handleCloudSyncDownload"
              >
                {{ syncDownloading ? '云下载中...' : '云下载' }}
              </button>
            </div>
            <div class="drawer-sync-status">
              <span class="drawer-sync-cooldown">上传：{{ syncUploadCooldownText }}</span>
              <span class="drawer-sync-cooldown">下载：{{ syncDownloadCooldownText }}</span>
              <span v-if="syncStatusText" class="drawer-sync-running">{{ syncStatusText }}</span>
            </div>
          </div>
          <button
            class="drawer-action"
            :disabled="exporting"
            @click="exportCalendar('week')"
          >
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

    <div v-if="vacationNotice" class="vacation-banner">
      {{ vacationNotice }}
    </div>

    <div v-if="errorMsg" class="error-banner">
      {{ errorMsg }}
    </div>

    <Transition name="fade">
      <div v-if="showAddCourse" class="modal-overlay" @click="closeAddCourseDialog">
        <div class="modal-content glass add-course-modal" @click.stop>
          <div class="modal-header">
            <h3>添加课程</h3>
            <button class="close-btn" @click="closeAddCourseDialog">×</button>
          </div>
          <div class="modal-body add-course-body">
            <div class="add-course-semester">学期：{{ semester || semesterDraft }}</div>
            <label class="add-field">
              <span>课程名称 *</span>
              <input v-model.trim="addCourseForm.name" type="text" placeholder="请输入课程名称" />
            </label>
            <label class="add-field">
              <span>教师</span>
              <input v-model.trim="addCourseForm.teacher" type="text" placeholder="可选" />
            </label>
            <label class="add-field">
              <span>上课地点</span>
              <input v-model.trim="addCourseForm.room" type="text" placeholder="可选" />
            </label>
            <div class="add-field">
              <span>上课时间 *</span>
              <select v-model.number="addCourseForm.weekday">
                <option v-for="(label, idx) in weekDayLabels" :key="label" :value="idx + 1">{{ label }}</option>
              </select>
            </div>
            <div class="add-row">
              <label class="add-field">
                <span>开始节次 *</span>
                <select v-model.number="addCourseForm.period">
                  <option v-for="p in periodOptions" :key="p" :value="p">第{{ p }}节</option>
                </select>
              </label>
              <label class="add-field">
                <span>上课节数 *</span>
                <select v-model.number="addCourseForm.djs">
                  <option v-for="s in courseSpanOptions" :key="s" :value="s">{{ s }}节</option>
                </select>
              </label>
            </div>
            <div class="add-field">
              <span>上课周次 *</span>
              <button class="week-picker-trigger" @click="showWeekPicker = true">
                {{ addWeeksCountText }}
              </button>
            </div>
            <div v-if="addCourseError" class="drawer-error add-course-error">{{ addCourseError }}</div>
          </div>
          <div class="add-actions">
            <button class="drawer-action ghost" :disabled="addingCourse" @click="closeAddCourseDialog">取消</button>
            <button class="drawer-action" :disabled="addingCourse" @click="submitAddCourse">
              {{ addingCourse ? '正在添加...' : '添加并确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <Transition name="sheet-up">
        <div v-if="showWeekPicker" class="week-picker-mask" @click.self="showWeekPicker = false">
          <div class="week-picker-sheet">
            <div class="week-picker-header">
              <div class="week-picker-title">选择周次</div>
              <div class="week-picker-ops">
                <button @click="selectAllAddCourseWeeks">全选</button>
                <button @click="clearAddCourseWeeks">清空</button>
              </div>
            </div>
            <div class="week-picker-grid">
              <button
                v-for="week in semesterWeekOptions"
                :key="week"
                class="week-cell"
                :class="{ active: addCourseForm.weeks.includes(week) }"
                @click="toggleAddCourseWeek(week)"
              >
                第{{ week }}周
              </button>
            </div>
            <button class="week-picker-confirm" @click="showWeekPicker = false">完成</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div v-if="showSemesterPopup" class="semester-popup-mask" @click.self="showSemesterPopup = false">
      <div class="semester-popup-card">
        <div class="semester-popup-title">当前显示学期</div>
        <div class="semester-popup-value">{{ semesterPopupText }}</div>
        <div class="semester-popup-desc">已自动定位到最近有课表数据的学期</div>
        <button class="semester-popup-btn" @click="showSemesterPopup = false">我知道了</button>
      </div>
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
    <Transition :name="weekTransitionName" mode="out-in">
      <div class="timetable-container" :key="`week-${selectedWeek}`">
      
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
        <div class="courses-grid" :key="`courses-grid-${scheduleCourseCardStyle}-${courseCardRefreshNonce}`">
           <!-- 背景线 -->
           <div class="grid-lines">
               <div v-for="i in 11" :key="i" class="line-row"></div>
           </div>
           
           <!-- 每天一列 -->
           <div v-for="day in 7" :key="day" class="day-column" :class="{ 'is-today-column': isTodayColumn(day) }">
               <div 
                  v-for="course in getCoursesForDay(day)" 
                  :key="course._uid || course.id"
                  class="course-card"
                  :class="[
                    `course-card--${scheduleCourseCardStyle}`,
                    { conflict: course.is_conflict }
                  ]"
                  :style="getCourseStyle(course)"
                  @click="openDetail(course)"
               >
                  <div class="course-name">{{ course.name }}</div>
                  <div class="course-room">
                    {{ course.is_conflict ? '点击查看冲突课程详情' : (course.room_code || course.room) }}
                  </div>
               </div>
           </div>
        </div>
      </div>
      
      </div>
    </Transition>

    <!-- 详情弹窗 -->
    <Transition name="fade">
      <div v-if="showDetail" class="modal-overlay" @click="showDetail = false">
        <div class="modal-content glass" @click.stop>
          <div class="modal-header">
            <h3>{{ selectedCourse?.name }}</h3>
            <button class="close-btn" @click="showDetail = false">×</button>
          </div>
          <div v-if="selectedCourse?.is_conflict" class="modal-body">
            <div class="conflict-hint">当前时段存在多个课程重叠，请按下列信息核对。</div>
            <div
              v-for="(item, idx) in selectedCourse?.conflict_courses || []"
              :key="`${item.id || item.name}-${idx}`"
              class="conflict-item"
            >
              <div class="conflict-item-title">
                {{ idx + 1 }}. {{ item.name }}
                <span v-if="item.is_custom" class="conflict-tag">自定义</span>
              </div>
              <div class="conflict-item-row">教师：{{ item.teacher || '未填写' }}</div>
              <div class="conflict-item-row">
                地点：{{ [item.building, item.room || item.room_code].filter(Boolean).join(' ') || '未填写' }}
              </div>
              <div class="conflict-item-row">
                时间：周{{ item.weekday }} 第{{ item.period }}-{{ getCourseEndPeriod(item) }}节
              </div>
            </div>
          </div>
          <div v-else class="modal-body">
            <div v-if="selectedCourse?.is_custom" class="info-row">
              <span class="label">类型</span>
              <span class="value">自定义课程</span>
            </div>
            <div class="info-row">
              <span class="label">教师</span>
              <span class="value">{{ selectedCourse?.teacher }}</span>
            </div>
            <div class="info-row">
              <span class="label">教室</span>
              <span class="value">{{ selectedCourse?.room }} ({{ selectedCourse?.building }})</span>
            </div>
            <div class="info-row">
              <span class="label">时间</span>
              <span class="value">周{{ selectedCourse?.weekday }} 第{{ selectedCourse?.period }}-{{ getCourseEndPeriod(selectedCourse) }}节</span>
            </div>
            <div class="info-row">
              <span class="label">周次</span>
              <span class="value">{{ selectedCourse?.weeks_text }}周</span>
            </div>
            <div class="info-row">
              <span class="label">学分</span>
              <span class="value">{{ selectedCourse?.credit }}</span>
            </div>
             <div class="info-row">
              <span class="label">教学班</span>
              <span class="value">{{ selectedCourse?.class_name }}</span>
            </div>
            <div v-if="selectedCourse?.is_custom" class="custom-course-actions">
              <button class="custom-delete-btn week" @click="deleteCustomCourse('current_week')">删除这一周</button>
              <button class="custom-delete-btn all" @click="deleteCustomCourse('all')">删除全部周次</button>
            </div>
          </div>
          <div v-if="detailActionError" class="detail-action-error">{{ detailActionError }}</div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="showConfirmDialog" class="modal-overlay confirm-overlay" @click="closeConfirmDialog(false)">
        <div class="modal-content confirm-modal" @click.stop>
          <div class="confirm-title">{{ confirmDialogTitle }}</div>
          <div class="confirm-lines">
            <p v-for="(line, idx) in confirmDialogLines" :key="`confirm-${idx}`">{{ line }}</p>
          </div>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" @click="closeConfirmDialog(false)">{{ confirmDialogCancelText }}</button>
            <button
              class="confirm-btn"
              :class="{ danger: confirmDialogDanger }"
              @click="closeConfirmDialog(true)"
            >
              {{ confirmDialogConfirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.schedule-view {
  --time-axis-width: 40px;
  --topbar-height: 52px;
  --date-header-height: 50px;
  --schedule-bottom-gap: calc(108px + env(safe-area-inset-bottom));
  --schedule-safe-top: 0px;
  --slot-height: clamp(
    46px,
    calc(
      (
          var(--app-vh, 1vh) * 100
          - var(--topbar-height)
          - var(--date-header-height)
          - var(--schedule-bottom-gap)
        ) / 11
    ),
    70px
  );
  width: 100%;
  height: calc(var(--app-vh, 1vh) * 100);
  min-height: calc(var(--app-vh, 1vh) * 100);
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-gradient);
  font-family: var(--ui-font-family);
  overflow: hidden;
  box-sizing: border-box;
  padding-top: 8px;
}

.schedule-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  min-height: var(--topbar-height);
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-surface-border);
  box-sizing: border-box;
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
  background: transparent !important;
  padding: 0;
  min-height: 32px;
  border-radius: 0;
  border: none !important;
  box-shadow: none !important;
  display: flex;
  align-items: center;
}

.week-selector select {
  all: unset !important;
  appearance: none !important;
  display: block !important;
  width: 100% !important;
  min-height: 32px !important;
  height: 32px;
  line-height: 32px;
  font-size: 13px;
  font-weight: 800;
  color: var(--ui-text);
  padding: 0 28px 0 11px !important;
  outline: none;
  cursor: pointer;
  border-radius: 14px !important;
  background: var(--ui-surface) !important;
  box-shadow: none !important;
  border: 1px solid var(--ui-surface-border) !important;
}

.week-selector select:focus {
  border: none !important;
  box-shadow: none !important;
}

.week-selector select option {
  color: #111827;
  background: #ffffff;
}

.week-selector .arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 9px;
  font-weight: 700;
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
  top: calc(env(safe-area-inset-top, 0px) + 18px);
  left: 0;
  width: min(78vw, 320px);
  height: calc(100dvh - env(safe-area-inset-top, 0px) - 18px);
  background: var(--ui-surface);
  border-right: 1px solid var(--ui-surface-border);
  border-top-right-radius: 16px;
  border-bottom-right-radius: 16px;
  padding: 18px 16px calc(28px + env(safe-area-inset-bottom, 0px));
  box-shadow: 12px 0 24px rgba(15, 23, 42, 0.16);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
}

.drawer-panel::-webkit-scrollbar {
  display: none;
}

.drawer-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
}

.drawer-section {
  display: grid;
  gap: 8px;
}

.drawer-subtitle {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
}

.drawer-semester-row {
  display: grid;
  gap: 8px;
}

.drawer-select {
  width: 100%;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 600;
  padding: 0 10px;
}

.drawer-select:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-primary) 30%, transparent);
  outline-offset: 1px;
}

.drawer-error {
  font-size: 12px;
  color: #dc2626;
}

.drawer-style-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, rgba(148, 163, 184, 0.34));
  background: color-mix(in oklab, var(--ui-primary-soft) 18%, var(--ui-surface) 82%);
}

.drawer-style-chip {
  border: none;
  background: transparent;
  color: var(--ui-muted);
  border-radius: 999px;
  min-height: 34px;
  padding: 0 12px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.drawer-style-chip strong {
  font-size: 13px;
  font-weight: 800;
}

.drawer-style-chip.active {
  color: #ffffff;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  box-shadow: 0 8px 18px color-mix(in oklab, var(--ui-primary) 24%, transparent);
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

.drawer-sync-group {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, var(--ui-surface-border));
  background: color-mix(in oklab, var(--ui-primary-soft) 28%, var(--ui-surface) 72%);
}

.drawer-sync-actions {
  display: grid;
  gap: 8px;
}

.drawer-action.ghost {
  background: #111827;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.2);
}

.drawer-action.add-course {
  background: linear-gradient(135deg, #f97316, #ec4899);
  box-shadow: 0 10px 18px rgba(236, 72, 153, 0.26);
}

.drawer-action.sync-upload {
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.24);
}

.drawer-action.sync-download {
  background: linear-gradient(135deg, #10b981, #0f766e);
  box-shadow: 0 10px 18px rgba(15, 118, 110, 0.24);
}

.drawer-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.drawer-sync-status {
  display: grid;
  gap: 4px;
}

.drawer-sync-cooldown,
.drawer-sync-running {
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.4;
}

.drawer-sync-running {
  color: #0f766e;
  font-weight: 600;
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
  height: var(--date-header-height);
  display: flex;
  border-bottom: 1px solid color-mix(in oklab, var(--ui-primary) 18%, var(--ui-surface-border));
  background: var(--ui-surface);
  flex-shrink: 0;
}

.month-col {
  width: var(--time-axis-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--ui-text);
  font-size: 14px;
}
.month-label {
  font-size: 10px;
  font-weight: normal;
  color: var(--ui-muted);
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
  background: color-mix(in oklab, var(--ui-primary-soft) 82%, #fff 18%);
  border-radius: 0 0 12px 12px;
}

.day-col.is-today .day-num {
  color: color-mix(in oklab, var(--ui-primary) 78%, #0f172a 22%);
  font-weight: 800;
  text-shadow: 0 1px 0 color-mix(in oklab, #ffffff 70%, transparent);
}

.day-num {
  font-size: 14px;
  color: var(--ui-text);
  font-weight: 600;
}

.day-label {
  font-size: 10px;
  color: var(--ui-muted);
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
  align-items: stretch;
  overflow-y: auto;
  min-height: 0;
  padding-bottom: var(--schedule-bottom-gap);
  box-sizing: border-box;
  position: relative;
  background:
    linear-gradient(
      90deg,
      color-mix(in oklab, var(--ui-surface) 96%, #ffffff 4%) 0,
      color-mix(in oklab, var(--ui-surface) 96%, #ffffff 4%) var(--time-axis-width),
      transparent var(--time-axis-width)
    );
  /* 隐藏滚动条 */
  scrollbar-width: none; 
}
.grid-body::-webkit-scrollbar {
  display: none;
}

.time-axis {
  width: var(--time-axis-width);
  background: color-mix(in oklab, var(--ui-surface) 96%, #ffffff 4%);
  border-right: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.35));
  display: flex;
  flex-direction: column;
  min-height: calc(var(--slot-height) * 11 + var(--schedule-bottom-gap));
  height: 100%;
  padding-bottom: var(--schedule-bottom-gap);
  overflow: hidden;
  position: relative;
  align-self: stretch;
  box-sizing: border-box;
}

.time-slot {
  flex: 0 0 var(--slot-height);
  height: var(--slot-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: color-mix(in oklab, var(--ui-muted) 82%, #64748b 18%);
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}

.period-num {
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 2px 0;
}

.courses-grid {
  flex: 1;
  display: flex;
  position: relative;
  min-height: calc(var(--slot-height) * 11 + var(--schedule-bottom-gap));
  padding-bottom: var(--schedule-bottom-gap);
  height: 100%;
  box-sizing: border-box;
}

.grid-lines {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.line-row {
  height: var(--slot-height);
  border-bottom: 1px dashed color-mix(in oklab, var(--ui-primary) 16%, rgba(226, 232, 240, 0.78));
  box-sizing: border-box;
}

.day-column {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(11, var(--slot-height));
  grid-template-columns: 1fr; /* 强制单列 */
  padding: 0 2px;
  position: relative;
  min-height: calc(var(--slot-height) * 11);
}

.day-column.is-today-column::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--ui-primary-soft) 56%, transparent) 0%,
    color-mix(in oklab, var(--ui-primary-soft) 36%, transparent) 100%
  );
  border-left: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  border-right: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.course-card {
  margin: 2px;
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
  border: var(--course-border-width, 1px) solid var(--course-border, rgba(148, 163, 184, 0.55)) !important;
  border-radius: var(--course-radius, 14px) !important;
  box-shadow: var(--course-shadow, 0 6px 14px rgba(71, 85, 105, 0.16)) !important;
  z-index: 1;
}

.schedule-view .courses-grid .day-column > .course-card {
  border: var(--course-border-width, 1px) solid var(--course-border, rgba(148, 163, 184, 0.55)) !important;
  border-radius: var(--course-radius, 14px) !important;
  box-shadow: var(--course-shadow, 0 6px 14px rgba(71, 85, 105, 0.16)) !important;
  background: var(--course-bg, rgba(255, 255, 255, 0.92)) !important;
  color: var(--course-text, #0f172a) !important;
}

.schedule-view .courses-grid .day-column > .course-card.course-card--modern {
  border-radius: var(--course-radius, 14px) !important;
  box-shadow: var(--course-shadow, 0 6px 14px rgba(71, 85, 105, 0.16)) !important;
}

.schedule-view .courses-grid .day-column > .course-card.course-card--traditional {
  border-radius: 8px !important;
  box-shadow: var(--course-shadow, 0 4px 10px rgba(15, 23, 42, 0.14)) !important;
}

.course-card.conflict .course-name {
  font-weight: 700;
}

.course-card.conflict .course-room {
  font-size: 10px;
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
  z-index: 320;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  padding: calc(env(safe-area-inset-top) + 10px) 12px calc(env(safe-area-inset-bottom) + 20px);
  box-sizing: border-box;
}

.modal-content {
  background: white;
  width: 80%;
  max-width: 320px;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.add-course-modal {
  width: min(92vw, 400px);
  max-width: 420px;
  max-height: min(74dvh, 600px);
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.add-course-body {
  display: grid;
  gap: 10px;
  overflow-y: auto;
  max-height: calc(min(74dvh, 600px) - 148px);
  padding-right: 2px;
}

.add-course-semester {
  font-size: 12px;
  color: #475569;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(226, 232, 240, 0.55);
}

.add-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.add-field {
  display: grid;
  gap: 6px;
}

.add-field > span {
  font-size: 12px;
  color: #475569;
  font-weight: 600;
}

.add-field input,
.add-field select {
  width: 100%;
  min-height: 36px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  font-size: 13px;
  padding: 0 10px;
  box-sizing: border-box;
}

.add-field input:focus,
.add-field select:focus {
  outline: 2px solid rgba(37, 99, 235, 0.3);
  outline-offset: 0;
}

.week-picker-trigger {
  width: 100%;
  min-height: 38px;
  border-radius: 10px;
  border: 1px dashed #94a3b8;
  background: rgba(248, 250, 252, 0.95);
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.add-actions {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.add-course-error {
  margin-top: -2px;
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

.custom-course-actions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.custom-delete-btn {
  min-height: 34px;
  border-radius: 10px;
  border: none;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.custom-delete-btn.week {
  background: #fee2e2;
  color: #b91c1c;
}

.custom-delete-btn.all {
  background: #dc2626;
  color: #ffffff;
}

.detail-action-error {
  margin-top: 10px;
  font-size: 12px;
  color: #b91c1c;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 10px;
  padding: 8px 10px;
}

.conflict-hint {
  font-size: 12px;
  color: #475569;
  margin-bottom: 10px;
}

.conflict-item {
  border: 1px solid #fecaca;
  background: #fff7f7;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
}

.conflict-item:last-child {
  margin-bottom: 0;
}

.conflict-item-title {
  font-size: 13px;
  font-weight: 700;
  color: #7f1d1d;
  display: flex;
  align-items: center;
  gap: 6px;
}

.conflict-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  background: #111827;
  color: #ffffff;
}

.conflict-item-row {
  margin-top: 6px;
  font-size: 12px;
  color: #374151;
}

.confirm-overlay {
  z-index: 360;
}

.confirm-modal {
  width: min(90vw, 360px);
  max-width: 360px;
  border-radius: 16px;
  padding: 16px;
}

.confirm-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.confirm-lines {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}

.confirm-lines p {
  margin: 0;
  font-size: 13px;
  color: #334155;
  line-height: 1.4;
}

.confirm-actions {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.confirm-btn {
  min-height: 36px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}

.confirm-btn.cancel {
  background: #e2e8f0;
  color: #334155;
}

.confirm-btn.danger {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.week-slide-left-enter-active,
.week-slide-left-leave-active,
.week-slide-right-enter-active,
.week-slide-right-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.24s ease;
}

.week-slide-left-enter-from {
  transform: translateX(24px);
  opacity: 0;
}

.week-slide-left-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}

.week-slide-right-enter-from {
  transform: translateX(-24px);
  opacity: 0;
}

.week-slide-right-leave-to {
  transform: translateX(24px);
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

.vacation-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(217, 119, 6, 0.35);
  color: #92400e;
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

.semester-popup-mask {
  position: fixed;
  inset: 0;
  z-index: 24;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.52);
  backdrop-filter: blur(2px);
}

.semester-popup-card {
  width: min(90vw, 360px);
  border-radius: 16px;
  padding: 18px 16px 16px;
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
  text-align: center;
}

.semester-popup-title {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
  letter-spacing: 0.02em;
}

.semester-popup-value {
  margin-top: 8px;
  font-size: 24px;
  line-height: 1.25;
  font-weight: 800;
  color: #0f172a;
}

.semester-popup-desc {
  margin-top: 8px;
  font-size: 13px;
  color: #475569;
}

.semester-popup-btn {
  margin-top: 14px;
  width: 100%;
  min-height: 40px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  cursor: pointer;
}

.week-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 520;
  background: rgba(15, 23, 42, 0.48);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.week-picker-sheet {
  width: min(100vw, 520px);
  max-height: min(78dvh, 620px);
  background: #ffffff;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
  box-shadow: 0 -20px 44px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.week-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.week-picker-title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.week-picker-ops {
  display: flex;
  gap: 8px;
}

.week-picker-ops button {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.week-picker-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
  padding-right: 2px;
}

.week-cell {
  min-height: 34px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  cursor: pointer;
}

.week-cell.active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 700;
}

.week-picker-confirm {
  min-height: 40px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.sheet-up-enter-active,
.sheet-up-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-up-enter-active .week-picker-sheet,
.sheet-up-leave-active .week-picker-sheet {
  transition: transform 0.24s ease;
}

.sheet-up-enter-from,
.sheet-up-leave-to {
  opacity: 0;
}

.sheet-up-enter-from .week-picker-sheet,
.sheet-up-leave-to .week-picker-sheet {
  transform: translateY(100%);
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
  .drawer-panel {
    top: calc(env(safe-area-inset-top, 0px) + 10px);
    bottom: calc(112px + env(safe-area-inset-bottom, 0px));
    height: auto;
    max-height: calc(
      100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 124px
    );
    padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  }

  .schedule-topbar {
    padding: 10px 12px;
  }

  .schedule-view {
    --time-axis-width: 32px;
    --topbar-height: 50px;
    --date-header-height: 44px;
  }

  .week-selector {
    padding: 0;
  }

  .week-selector select {
    min-height: 30px !important;
    height: 30px;
    line-height: 30px;
    font-size: 12px;
    font-weight: 800;
    border-radius: 13px !important;
  }

  .month-col,
  .time-axis {
    width: var(--time-axis-width);
  }

  .time-slot {
    font-size: 9px;
  }

  .period-num {
    font-size: 12px;
  }

  .day-column {
    grid-template-rows: repeat(11, var(--slot-height));
  }

  .line-row {
    height: var(--slot-height);
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

  .add-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .add-actions {
    grid-template-columns: 1fr;
  }

  .week-picker-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
}
</style>





