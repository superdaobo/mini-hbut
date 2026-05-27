<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import axios from 'axios'
import { fetchWithCache, LONG_TTL, SHORT_TTL, DEFAULT_TTL } from '../utils/api.js'
import { useAppSettings } from '../utils/app_settings'
import { formatRelativeTime } from '../utils/time.js'
import { TPageHeader, TEmptyState } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const appSettings = useAppSettings()
const maxRetry = computed(() => appSettings.retry.classroom)
const retryDelayMs = computed(() => appSettings.retryDelayMs)
const CLASSROOM_SNAPSHOT_SCHEMA = 1
const CLASSROOM_SNAPSHOT_PREFIX = 'hbu_classroom_snapshot_v1'
const CLASSROOM_SNAPSHOT_FRESH_MS = 60 * 1000
const CLASSROOM_AUTO_QUERY_COOLDOWN_MS = 20 * 1000
const CLASSROOM_DEFERRED_REFRESH_MS = 2500

// 状态
const loading = ref(false)
const buildings = ref([])
const classrooms = ref([])
const displayLimit = ref(50) // 初始显示 50 条，避免大量 DOM 导致卡顿
const errorMsg = ref('')
const offline = ref(false)
const syncTime = ref('')
const currentMeta = ref({
  date_str: '',
  week: '',
  weekday_name: '',
  semester: ''
})
const hasSuccessfulQuery = ref(false)

// 显示的教室列表（带分页限制，避免大量 DOM 卡顿）
const displayedClassrooms = computed(() => classrooms.value.slice(0, displayLimit.value))
const hasMoreClassrooms = computed(() => classrooms.value.length > displayLimit.value)
const showMoreClassrooms = () => { displayLimit.value += 50 }
const queryDateLabel = computed(() => String(currentMeta.value?.date_str || '').trim())
const queryCalendarLabel = computed(() => {
  const week = String(currentMeta.value?.week || '').trim()
  const weekday = String(currentMeta.value?.weekday_name || '').trim()
  const parts = []
  if (week) parts.push(week === '?' || /^第.+周$/.test(week) ? week : `第${week}周`)
  if (weekday) parts.push(weekday)
  return parts.join(' · ')
})

// 生命周期与并发保护：
// 1) 组件卸载后不再写入响应数据，避免返回首页后被旧请求回写导致白屏
// 2) 仅允许“最后一次查询”生效，旧请求结果直接丢弃
let disposed = false
let retryTimer = null
let autoRefreshTimer = null
let latestRequestId = 0
let latestBuildingRequestId = 0
let activeQueryController = null
let activeBuildingController = null
let lastAutoQueryAt = 0
let lastAutoQueryFingerprint = ''

const clearRetryTimer = () => {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

const clearAutoRefreshTimer = () => {
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer)
    autoRefreshTimer = null
  }
}

const safeArray = (value) => (Array.isArray(value) ? value : [])

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const readStoredScheduleMeta = () => {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem('hbu_schedule_meta')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const calculateWeekFromStartDate = (startDateText) => {
  const text = String(startDateText || '').trim()
  if (!text) return 0
  const start = new Date(text)
  if (Number.isNaN(start.getTime())) return 0
  const now = new Date()
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const begin = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const diffMs = current.getTime() - begin.getTime()
  if (diffMs < 0) return 1
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1
}

const getPreferredCurrentWeek = () => {
  const meta = readStoredScheduleMeta()
  const storedWeek = toPositiveInt(meta?.current_week, 0)
  if (storedWeek > 0) return storedWeek
  return toPositiveInt(calculateWeekFromStartDate(meta?.start_date), 0)
}

const resolveClassroomMeta = (meta = {}) => {
  const preferredWeek = getPreferredCurrentWeek()
  return {
    date_str: String(meta?.date_str || '').trim(),
    week: preferredWeek || String(meta?.week || '').trim(),
    weekday_name: String(meta?.weekday_name || '').trim(),
    semester: String(meta?.semester || '').trim()
  }
}

const selectCurrentWeek = () => {
  const preferredWeek = getPreferredCurrentWeek()
  if (preferredWeek > 0) {
    filters.value.week = ''
    currentMeta.value = resolveClassroomMeta(currentMeta.value)
  } else {
    filters.value.week = ''
  }
}

const createAbortSignal = (type = 'query') => {
  if (typeof AbortController === 'undefined') return null
  if (type === 'query' && activeQueryController) {
    activeQueryController.abort()
  }
  if (type === 'building' && activeBuildingController) {
    activeBuildingController.abort()
  }
  const controller = new AbortController()
  if (type === 'query') activeQueryController = controller
  if (type === 'building') activeBuildingController = controller
  return controller.signal
}

const clearAbortController = (type = 'query', signal = null) => {
  if (type === 'query' && activeQueryController?.signal === signal) {
    activeQueryController = null
  }
  if (type === 'building' && activeBuildingController?.signal === signal) {
    activeBuildingController = null
  }
}

const resolveStudentId = () => {
  const sid = String(props.studentId || '').trim()
  if (sid) return sid
  return String(localStorage.getItem('hbu_username') || '').trim()
}

const buildClassroomSnapshotKey = (studentId) => {
  const sid = String(studentId || '').trim()
  if (!sid) return ''
  return `${CLASSROOM_SNAPSHOT_PREFIX}:${sid}`
}

const readClassroomSnapshot = (studentId = '') => {
  const sid = String(studentId || resolveStudentId() || '').trim()
  const key = buildClassroomSnapshotKey(sid)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Number(parsed?.schema_version || 0) !== CLASSROOM_SNAPSHOT_SCHEMA) return null
    if (String(parsed?.student_id || '').trim() !== sid) return null
    return {
      schema_version: CLASSROOM_SNAPSHOT_SCHEMA,
      student_id: sid,
      filters: parsed?.filters && typeof parsed.filters === 'object'
        ? parsed.filters
        : {},
      current_meta: parsed?.current_meta && typeof parsed.current_meta === 'object'
        ? parsed.current_meta
        : {},
      classrooms: safeArray(parsed?.classrooms),
      sync_time: String(parsed?.sync_time || '').trim(),
      offline: !!parsed?.offline,
      updated_at: String(parsed?.updated_at || '').trim()
    }
  } catch {
    return null
  }
}

const writeClassroomSnapshot = (reason = 'unknown') => {
  const sid = resolveStudentId()
  const key = buildClassroomSnapshotKey(sid)
  if (!sid || !key || !hasSuccessfulQuery.value) return false
  try {
    localStorage.setItem(key, JSON.stringify({
      schema_version: CLASSROOM_SNAPSHOT_SCHEMA,
      student_id: sid,
      filters: { ...filters.value },
      current_meta: { ...currentMeta.value },
      classrooms: safeArray(classrooms.value),
      sync_time: String(syncTime.value || '').trim(),
      offline: !!offline.value,
      updated_at: new Date().toISOString()
    }))
    console.log('[Classroom] snapshot saved:', reason)
    return true
  } catch {
    return false
  }
}

const applyClassroomSnapshot = (snapshot, options = {}) => {
  if (!snapshot) return false
  const preferredWeek = getPreferredCurrentWeek()
  filters.value = {
    week: preferredWeek ? '' : String(snapshot.filters?.week || '').trim(),
    weekday: String(snapshot.filters?.weekday || '').trim(),
    periods: safeArray(snapshot.filters?.periods).map((item) => Number(item)).filter((item) => Number.isFinite(item)),
    building: String(snapshot.filters?.building || '').trim(),
    minSeats: String(snapshot.filters?.minSeats || '').trim(),
    maxSeats: String(snapshot.filters?.maxSeats || '').trim()
  }
  currentMeta.value = resolveClassroomMeta(snapshot.current_meta)
  classrooms.value = safeArray(snapshot.classrooms)
  syncTime.value = String(snapshot.sync_time || snapshot.updated_at || '').trim()
  offline.value = options?.markOffline !== false
  hasSuccessfulQuery.value = true
  if (options?.preserveMessage !== true) {
    errorMsg.value = ''
  }
  return true
}

const restoreClassroomSnapshot = (options = {}) => {
  const snapshot = readClassroomSnapshot()
  if (!snapshot) return false
  return applyClassroomSnapshot(snapshot, options)
}

const parseSnapshotTimestamp = (snapshot) => {
  const raw = String(snapshot?.updated_at || snapshot?.sync_time || '').trim()
  if (!raw) return 0
  const ts = Date.parse(raw)
  return Number.isFinite(ts) ? ts : 0
}

const getSnapshotAgeMs = (snapshot) => {
  const ts = parseSnapshotTimestamp(snapshot)
  if (!ts) return Number.POSITIVE_INFINITY
  return Math.max(0, Date.now() - ts)
}

const buildClassroomCacheKey = (studentId, payload) => {
  const week = payload.week ?? 'auto'
  const weekday = payload.weekday ?? 'auto'
  const periods = Array.isArray(payload.periods) && payload.periods.length
    ? payload.periods.join(',')
    : 'auto'
  const building = encodeURIComponent(String(payload.building || 'all')).slice(0, 48)
  const min = payload.min_seats ?? ''
  const max = payload.max_seats ?? ''
  return `classroom:${studentId}:w${week}:d${weekday}:p${periods}:b${building}:s${min}-${max}`
}

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
const periodGroups = [
  { key: 'morning', label: '上午', periods: periodOptions.slice(0, 4) },
  { key: 'afternoon', label: '下午', periods: periodOptions.slice(4, 8) },
  { key: 'evening', label: '晚上', periods: periodOptions.slice(8, 11) }
]

// 获取教学楼列表
const fetchBuildings = async () => {
  const requestId = ++latestBuildingRequestId
  const signal = createAbortSignal('building')
  try {
    console.log('[Classroom] Fetching buildings...')
    const { data } = await fetchWithCache('classroom:buildings', async () => {
      const res = await axios.get(`${API_BASE}/v2/classroom/buildings`, { signal })
      console.log('[Classroom] Buildings API response:', res.data)
      return res.data
    }, LONG_TTL)
    if (disposed || requestId !== latestBuildingRequestId) return
    console.log('[Classroom] Buildings data:', data)
    if (data?.success) {
      buildings.value = safeArray(data.data)
      console.log('[Classroom] Buildings loaded:', buildings.value.length)
    } else {
      console.error('[Classroom] Buildings failed:', data)
      buildings.value = []
    }
  } catch (e) {
    if (String(e?.name || '').trim() === 'CanceledError' || String(e?.message || '').includes('canceled')) {
      return
    }
    console.error('获取教学楼失败', e)
    if (!disposed && requestId === latestBuildingRequestId) {
      buildings.value = []
    }
  } finally {
    clearAbortController('building', signal)
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

const buildPeriodRange = (start, end) => {
  const items = []
  for (let i = start; i <= end; i += 1) items.push(i)
  return items
}

const buildQueryPayload = (studentId = resolveStudentId()) => {
  const sid = String(studentId || '').trim()
  const preferredWeek = getPreferredCurrentWeek()
  const selectedWeek = filters.value.week
    ? parseInt(filters.value.week, 10)
    : preferredWeek || null
  const payload = {
    student_id: sid,
    week: selectedWeek,
    weekday: filters.value.weekday ? parseInt(filters.value.weekday, 10) : null,
    periods: filters.value.periods.map((p) => parseInt(p, 10)).filter((p) => Number.isFinite(p)),
    building: filters.value.building,
    min_seats: filters.value.minSeats ? parseInt(filters.value.minSeats, 10) : null,
    max_seats: filters.value.maxSeats ? parseInt(filters.value.maxSeats, 10) : null
  }
  if (!payload.week) delete payload.week
  if (!payload.weekday) delete payload.weekday
  if (!payload.periods.length) delete payload.periods
  if (!payload.building) delete payload.building
  if (payload.min_seats == null || Number.isNaN(payload.min_seats)) delete payload.min_seats
  if (payload.max_seats == null || Number.isNaN(payload.max_seats)) delete payload.max_seats
  return payload
}

const buildCurrentQueryFingerprint = (studentId = resolveStudentId()) => {
  const sid = String(studentId || '').trim()
  if (!sid) return ''
  return buildClassroomCacheKey(sid, buildQueryPayload(sid))
}

const scheduleDeferredAutoRefresh = (reason = 'deferred', delayMs = CLASSROOM_DEFERRED_REFRESH_MS) => {
  clearAutoRefreshTimer()
  if (disposed || document.hidden) return
  const safeDelay = Math.max(400, Number(delayMs) || CLASSROOM_DEFERRED_REFRESH_MS)
  autoRefreshTimer = setTimeout(() => {
    autoRefreshTimer = null
    void triggerAutoQuery(`${reason}:delayed`, {
      preserveResults: true,
      minIntervalMs: CLASSROOM_AUTO_QUERY_COOLDOWN_MS
    })
  }, safeDelay)
}

const triggerAutoQuery = async (reason = 'auto', options = {}) => {
  if (disposed || document.hidden) return false
  if (loading.value && !options.force) {
    console.log(`[Classroom] skip auto query while loading: ${reason}`)
    return false
  }

  const sid = resolveStudentId()
  if (!sid) {
    await queryClassrooms(0, {
      preserveResults: options?.preserveResults !== false,
      reason,
      isAuto: true
    })
    return true
  }

  const fingerprint = buildCurrentQueryFingerprint(sid)
  const minIntervalMs = Number(options?.minIntervalMs) > 0
    ? Number(options.minIntervalMs)
    : CLASSROOM_AUTO_QUERY_COOLDOWN_MS
  const snapshot = readClassroomSnapshot(sid)
  const snapshotAge = getSnapshotAgeMs(snapshot)
  const hasFreshSnapshot = hasSuccessfulQuery.value && snapshotAge < CLASSROOM_SNAPSHOT_FRESH_MS

  if (!options.force && hasFreshSnapshot) {
    console.log(`[Classroom] skip auto query (${reason}) because snapshot is fresh: ${snapshotAge}ms`)
    const delay = Math.min(
      CLASSROOM_SNAPSHOT_FRESH_MS,
      Math.max(CLASSROOM_DEFERRED_REFRESH_MS, CLASSROOM_SNAPSHOT_FRESH_MS - snapshotAge)
    )
    scheduleDeferredAutoRefresh(reason, delay)
    return false
  }

  if (
    !options.force &&
    fingerprint &&
    lastAutoQueryFingerprint === fingerprint &&
    Date.now() - lastAutoQueryAt < minIntervalMs
  ) {
    console.log(`[Classroom] skip auto query cooldown: ${reason}`)
    return false
  }

  clearAutoRefreshTimer()
  lastAutoQueryFingerprint = fingerprint
  lastAutoQueryAt = Date.now()
  await queryClassrooms(0, {
    preserveResults: options?.preserveResults !== false,
    reason,
    isAuto: true
  })
  return true
}

const handleManualQuery = () => {
  clearAutoRefreshTimer()
  lastAutoQueryAt = 0
  lastAutoQueryFingerprint = ''
  return queryClassrooms(0, {
    preserveResults: true,
    reason: 'manual',
    isAuto: false
  })
}

// 根据当前时间推荐“同时间段剩余节次”
// 上午 -> 上午剩余；上午结束后切到下午；
// 下午 -> 下午剩余；下午结束后切到晚上；
// 晚上 -> 晚上剩余。
const getCurrentClassPeriods = () => {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  for (let i = 0; i < CLASS_SCHEDULE.length; i += 1) {
    const [, , eh, em] = CLASS_SCHEDULE[i]
    const period = i + 1
    const endMinutes = eh * 60 + em

    // “当前时间 <= 本节结束时间”即归入该节
    if (currentMinutes <= endMinutes) {
      if (period <= 4) return buildPeriodRange(period, 4)
      if (period <= 8) return buildPeriodRange(period, 8)
      return buildPeriodRange(period, 11)
    }
  }

  // 当天末尾默认查询晚上节次
  return [9, 10, 11]
}

// 获取本地时间作为默认值 (防止接口慢导致 UI 空白)
const initLocalMeta = () => {
  const now = new Date()
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dayIndex = now.getDay()
  const preferredWeek = getPreferredCurrentWeek()
  
  // 课表页维护的 hbu_schedule_meta 才是本机当前校历周次来源，避免空教室旧快照覆盖成历史周次。
  currentMeta.value = {
    date_str: now.toLocaleDateString(),
    week: preferredWeek || '?',
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

// 查询空教室。保留上一屏结果，避免 iOS 返回/恢复时出现白屏或黑屏。
const queryClassrooms = async (retryCount = 0, options = {}) => {
  if (disposed) return
  const sid = resolveStudentId()
  const preserveResults = options?.preserveResults !== false
  const reason = String(options?.reason || 'manual').trim() || 'manual'
  const isAuto = options?.isAuto === true

  if (isAuto && loading.value && retryCount === 0) {
    console.log(`[Classroom] ignore overlapped auto query: ${reason}`)
    return
  }

  if (!sid) {
    errorMsg.value = hasSuccessfulQuery.value
      ? '当前显示上次查询结果，请登录后刷新空教室。'
      : '未检测到登录状态，请先登录后再查询空教室'
    loading.value = false
    return
  }
  clearRetryTimer()
  const requestId = ++latestRequestId
  const signal = createAbortSignal('query')
  loading.value = true
  if (retryCount === 0) errorMsg.value = ''
  if (!preserveResults) {
    classrooms.value = []
  }
  
  try {
    const payload = buildQueryPayload(sid)
    console.log(`[Classroom] queryClassrooms reason=${reason} retry=${retryCount} payload:`, JSON.stringify(payload))
    const cacheKey = buildClassroomCacheKey(sid, payload)
    const { data } = await fetchWithCache(cacheKey, async () => {
      console.log('[Classroom] Making API call for classrooms')
      const res = await axios.post(`${API_BASE}/v2/classroom/query`, payload, { signal })
      console.log('[Classroom] API response:', res.data)
      return res.data
    }, SHORT_TTL) // 使用 SHORT_TTL 因为空教室数据变化频繁
    
    if (disposed || requestId !== latestRequestId) return

    if (data?.success) {
      classrooms.value = safeArray(data.data)
      displayLimit.value = 50 // 重置分页
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
      hasSuccessfulQuery.value = true
      // 更新元数据
      if (data.meta) {
        currentMeta.value = resolveClassroomMeta(data.meta)
        
        // 同步筛选器
        if (!filters.value.week && !getPreferredCurrentWeek()) filters.value.week = data.meta.week
        if (!filters.value.weekday) filters.value.weekday = data.meta.weekday
        if (filters.value.periods.length === 0 && data.meta.periods) {
          filters.value.periods = data.meta.periods
        }
      }
      writeClassroomSnapshot('query-success')
    } else {
      if (data?.need_login) {
        offline.value = true
        errorMsg.value = hasSuccessfulQuery.value
          ? '会话已过期，当前显示上次查询结果，请重新登录后刷新。'
          : '会话已过期，请重新登录后再查询空教室。'
        return
      }
      if (!preserveResults || !hasSuccessfulQuery.value) {
        classrooms.value = []
      }
      errorMsg.value = data?.error || '查询失败'
    }
  } catch (e) {
    if (disposed || requestId !== latestRequestId) return
    if (String(e?.name || '').trim() === 'CanceledError' || String(e?.message || '').includes('canceled')) {
      return
    }
    console.error('查询异常', e)
    
    // 自动重试逻辑
    if ((e.response && (e.response.status === 502 || e.response.status === 504)) || e.message.includes('Network Error')) {
      if (retryCount < maxRetry.value) {
        // 使用本地数据填充部分 UI，避免完全空白
        if (retryCount === 0 && !currentMeta.value.date_str) initLocalMeta()
        
        errorMsg.value = `系统预热中，自动重试 (${retryCount + 1}/${maxRetry.value})...`
        retryTimer = setTimeout(() => {
          retryTimer = null
          if (disposed) return
          queryClassrooms(retryCount + 1, {
            preserveResults: true,
            reason: `${reason}:retry`,
            isAuto
          })
        }, retryDelayMs.value)
        return
      } else {
        errorMsg.value = hasSuccessfulQuery.value
          ? '服务器响应超时，当前显示上次查询结果，请稍后重试。'
          : '服务器响应超时，请手动刷新'
      }
    } else {
      errorMsg.value = hasSuccessfulQuery.value
        ? '连接服务器失败，当前显示上次查询结果。'
        : '连接服务器失败'
    }
  } finally {
    clearAbortController('query', signal)
    if (disposed || requestId !== latestRequestId) return
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

const handleClassroomVisibilityChange = () => {
  if (document.hidden) {
    writeClassroomSnapshot('app-hidden')
    clearAutoRefreshTimer()
    return
  }
  if (restoreClassroomSnapshot({ markOffline: false })) {
    void triggerAutoQuery('visibility-resume', {
      preserveResults: true,
      minIntervalMs: CLASSROOM_AUTO_QUERY_COOLDOWN_MS
    })
  }
}

watch(
  () => props.studentId,
  (nextSid, prevSid) => {
    const next = String(nextSid || '').trim()
    const prev = String(prevSid || '').trim()
    if (!next || next === prev) return
    clearAutoRefreshTimer()
    if (!restoreClassroomSnapshot({ markOffline: false })) {
      void triggerAutoQuery('student-id-change', {
        preserveResults: true,
        force: true
      })
      return
    }
    void triggerAutoQuery('student-id-change', {
      preserveResults: true,
      force: true
    })
  }
)

onMounted(async () => {
  initLocalMeta() // 先初始化本地时间显示，包括自动选择节次
  document.addEventListener('visibilitychange', handleClassroomVisibilityChange)
  const restored = restoreClassroomSnapshot({ markOffline: false })
  const buildingsTask = fetchBuildings()
  if (restored) {
    void triggerAutoQuery('mounted-with-snapshot', {
      preserveResults: true,
      force: true
    })
  } else {
    void triggerAutoQuery('mounted-no-snapshot', {
      preserveResults: true,
      force: true
    })
  }
  await Promise.allSettled([buildingsTask])
})

onBeforeUnmount(() => {
  writeClassroomSnapshot('component-unmount')
  disposed = true
  document.removeEventListener('visibilitychange', handleClassroomVisibilityChange)
  clearRetryTimer()
  clearAutoRefreshTimer()
  activeQueryController?.abort?.()
  activeBuildingController?.abort?.()
  activeQueryController = null
  activeBuildingController = null
  // 使所有未完成请求结果失效
  latestRequestId += 1
  latestBuildingRequestId += 1
})
</script>

<template>
  <div class="classroom-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative">
    <!-- Header -->
    <TPageHeader icon="school" title="空教室" @back="$emit('back')" />

    <!-- Offline Banner -->
    <div v-if="offline" class="mx-4 mt-2 px-3 py-2 rounded-xl bg-error-container/60 text-on-error-container text-xs font-medium">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col gap-5 pb-24">
      <!-- Filter Section -->
      <section class="px-4 flex flex-col gap-3">
        <!-- Quick Time Selection -->
        <div class="grid grid-cols-3 gap-2">
          <button
            @click="selectTimeRange('morning')"
            :class="[
              'py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1',
              filters.periods.length > 0 && filters.periods.every(p => p <= 4)
                ? 'bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]'
            ]"
          >
            <span class="material-symbols-outlined text-[16px]">wb_sunny</span>
            上午
          </button>
          <button
            @click="selectTimeRange('afternoon')"
            :class="[
              'py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1',
              filters.periods.length > 0 && filters.periods.every(p => p >= 5 && p <= 8)
                ? 'bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]'
            ]"
          >
            <span class="material-symbols-outlined text-[16px]">routine</span>
            下午
          </button>
          <button
            @click="selectTimeRange('evening')"
            :class="[
              'py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1',
              filters.periods.length > 0 && filters.periods.every(p => p >= 9)
                ? 'bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]'
            ]"
          >
            <span class="material-symbols-outlined text-[16px]">bedtime</span>
            晚上
          </button>
        </div>

        <!-- Detailed Filters -->
        <div class="flex flex-col gap-3 bg-surface-container-lowest p-4 rounded-[24px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] mt-2">
          <!-- Building -->
          <div class="flex items-center">
            <span class="classroom-filter-label text-xs font-medium w-12 shrink-0">楼栋</span>
            <div class="flex overflow-x-auto no-scrollbar gap-2 pb-1">
              <button
                @click="filters.building = ''"
                :class="[
                  'px-3 py-1.5 rounded-full text-xs font-medium shrink-0',
                  !filters.building ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant'
                ]"
              >全部</button>
              <button
                v-for="b in buildings.filter(b => b.code)"
                :key="b.code"
                @click="filters.building = b.name"
                :class="[
                  'px-3 py-1.5 rounded-full text-xs font-medium shrink-0',
                  filters.building === b.name ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant'
                ]"
              >{{ b.name }}</button>
            </div>
          </div>

          <!-- Week -->
          <div class="flex items-center">
            <span class="classroom-filter-label text-xs font-medium w-12 shrink-0">周次</span>
            <div class="flex overflow-x-auto no-scrollbar gap-2 pb-1">
              <button
                @click="selectCurrentWeek"
                :class="[
                  'px-3 py-1.5 rounded-full text-xs font-medium shrink-0',
                  !filters.week ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant'
                ]"
              >本周{{ currentMeta.week ? `(第${currentMeta.week}周)` : '' }}</button>
              <button
                v-for="w in weekOptions"
                :key="w"
                @click="filters.week = w"
                :class="[
                  'px-3 py-1.5 rounded-full text-xs font-medium shrink-0',
                  Number(filters.week) === w ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant'
                ]"
              >第{{ w }}周</button>
            </div>
          </div>

          <!-- Day -->
          <div class="flex items-center">
            <span class="classroom-filter-label text-xs font-medium w-12 shrink-0">星期</span>
            <div class="flex overflow-x-auto no-scrollbar gap-2 pb-1">
              <button
                v-for="w in weekdayOptions"
                :key="w.value"
                @click="filters.weekday = w.value"
                :class="[
                  'px-3 py-1.5 rounded-full text-xs font-medium shrink-0',
                  Number(filters.weekday) === w.value ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant'
                ]"
              >{{ w.label }}</button>
            </div>
          </div>

          <!-- Periods (multi-select) -->
          <div class="flex items-start">
            <span class="classroom-filter-label text-xs font-medium w-12 shrink-0 pt-2">节次</span>
            <div class="classroom-period-groups">
              <div
                v-for="group in periodGroups"
                :key="group.key"
                class="classroom-period-row"
              >
                <span class="classroom-period-row-label">{{ group.label }}</span>
                <div class="classroom-period-row-buttons">
                  <button
                    v-for="p in group.periods"
                    :key="p.value"
                    @click="togglePeriod(p.value)"
                    :aria-label="`第${p.value}节`"
                    :title="p.label"
                    :class="[
                      'classroom-period-button px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1',
                      filters.periods.includes(p.value)
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant'
                    ]"
                  >
                    <span v-if="filters.periods.includes(p.value)" class="material-symbols-outlined text-[14px]">check</span>
                    {{ p.value }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer: count + reset + query -->
          <div class="mt-2 flex justify-between items-center pt-3 border-t border-surface-variant">
            <span class="text-on-surface-variant text-sm">
              找到 <strong>{{ classrooms.length }}</strong> 个空教室
            </span>
            <button class="text-primary text-xs font-medium flex items-center gap-1" @click="selectTimeRange('clear'); filters.building = ''; filters.week = ''">
              <span class="material-symbols-outlined text-[16px]">filter_alt_off</span>
              重置筛选
            </button>
          </div>

          <!-- Query Button -->
          <button
            class="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm active:scale-95 transition-transform disabled:opacity-60"
            @click="handleManualQuery"
            :disabled="loading"
          >
            {{ loading ? '查询中...' : '查询空教室' }}
          </button>
        </div>
      </section>

      <!-- Error Message -->
      <div v-if="errorMsg" class="mx-4 px-4 py-3 rounded-xl bg-error-container/60 text-on-error-container text-sm text-center">
        {{ errorMsg }}
      </div>

      <!-- Results List -->
      <section class="px-4 flex flex-col gap-3">
        <div v-if="hasSuccessfulQuery || classrooms.length > 0" class="classroom-result-meta">
          <span>查询日期：<strong>{{ queryDateLabel || '未知日期' }}</strong></span>
          <span v-if="queryCalendarLabel">{{ queryCalendarLabel }}</span>
        </div>

        <!-- Classroom Cards -->
        <div
          v-for="room in displayedClassrooms"
          :key="room.id"
          class="bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] border border-outline-variant/10 flex flex-col gap-3 relative overflow-hidden"
        >
          <div class="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-success-teal/10 to-transparent rounded-bl-full pointer-events-none"></div>
          <div class="flex justify-between items-start">
            <div class="flex flex-col">
              <h3 class="text-lg font-bold text-on-surface flex items-center gap-2">
                {{ room.name }}
                <span class="px-2 py-0.5 rounded-md bg-success-teal/10 text-success-teal text-[10px] font-semibold">空闲</span>
              </h3>
              <span class="text-secondary text-sm mt-1">{{ room.type || room.campus }}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-primary text-xl font-bold">{{ room.seats }}</span>
              <span class="text-on-surface-variant text-[10px] font-semibold">座位数</span>
            </div>
          </div>
          <div class="flex gap-2 mt-1">
            <span v-if="room.building" class="px-2.5 py-1 rounded bg-surface-container flex items-center gap-1 text-on-surface-variant text-[10px] font-semibold">
              <span class="material-symbols-outlined text-[14px]">apartment</span>
              {{ room.building }}
            </span>
            <span v-if="room.floor" class="px-2.5 py-1 rounded bg-surface-container flex items-center gap-1 text-on-surface-variant text-[10px] font-semibold">
              <span class="material-symbols-outlined text-[14px]">layers</span>
              {{ room.floor }}层
            </span>
          </div>
        </div>

        <!-- Load More -->
        <div v-if="hasMoreClassrooms" class="py-4 flex justify-center">
          <button
            class="px-6 py-2.5 rounded-full bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant text-xs font-medium active:scale-95 transition-transform"
            @click="showMoreClassrooms"
          >
            加载更多（还有 {{ classrooms.length - displayLimit }} 间）
          </button>
        </div>

        <!-- Loading Spinner -->
        <div v-if="loading && classrooms.length > 0" class="py-6 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
          <span class="material-symbols-outlined animate-spin">autorenew</span>
          <span class="text-xs font-medium">正在加载更多教室...</span>
        </div>

        <!-- Empty State -->
        <TEmptyState v-if="!loading && classrooms.length === 0 && !errorMsg" icon="🏢" message="当前条件下没有找到空教室" />
      </section>
    </main>
  </div>
</template>

<style scoped>
.classroom-filter-label {
  color: #334155;
}

.classroom-period-button {
  width: 42px;
  min-width: 42px;
  height: 32px;
  justify-content: center;
}

.classroom-period-groups {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.classroom-period-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.classroom-period-row-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  text-align: right;
}

.classroom-period-row-buttons {
  display: grid;
  grid-template-columns: repeat(4, 42px);
  gap: 8px;
}

.classroom-period-row:last-child .classroom-period-row-buttons {
  grid-template-columns: repeat(3, 42px);
}

.classroom-result-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.classroom-result-meta strong {
  color: #0f172a;
  font-weight: 700;
}

:global(html.dark) .classroom-filter-label {
  color: #cbd5e1;
}

:global(html.dark) .classroom-period-row-label {
  color: #94a3b8;
}

:global(html.dark) .classroom-result-meta {
  color: #94a3b8;
}

:global(html.dark) .classroom-result-meta strong {
  color: #e2e8f0;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
