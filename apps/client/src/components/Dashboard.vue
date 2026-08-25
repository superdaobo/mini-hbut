<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import axios from 'axios'
import { fetchWithCache, getCachedData, setCachedData, DEFAULT_SWR_OPTIONS } from '../utils/api'
import { showToast } from '../utils/toast'
import { openExternal } from '../utils/external_link'
import { stripMarkdown } from '../utils/markdown_text.js'
import ThemeModuleIcon from './icons/ThemeModuleIcon.vue'
import LayoutCollisionFxLayer from './LayoutCollisionFxLayer.vue'
import SortableSurface from './SortableSurface.vue'
import { readScheduleLockDetail } from '../utils/schedule_prefetch.js'
import { buildDefaultWorkspaceLayout } from '../config/ui_settings'
import { cloneWorkspaceLayout, flushUiSettings, useUiSettings } from '../utils/ui_settings'
import { captureLayoutSlotAnchors, moveLayoutItemToIndex, resolveLayoutSlotTarget } from '../utils/layout_drag.js'
import {
  advanceLayoutCollisionFx,
  createLayoutCollisionBurst,
  resolveCollisionPalette,
  resolveRelativeCollisionPoint
} from '../utils/layout_collision_fx.js'
import { buildHomeSearchSections, buildWeeklyCourseSearchEntries } from '../utils/home_search.js'
import { getForecastTemperatureBounds, getTemperatureColor, getTemperatureRangeStyle, getWeatherIconTone } from '../utils/weather_visuals'
import { isTestAccountSession } from '../utils/test_account.js'
import { filterAllowedModules, isModuleAllowed } from '../config/app_store_policy'
import { decideHomeNavigate } from '../utils/moduleAccess'
import { useAuthStore } from '../stores'
import { useViewportBreakpoint } from '../composables/useViewportBreakpoint'

const props = defineProps({
  studentId: { type: String, default: '' },
  userUuid: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  jwxtMaintenance: { type: Boolean, default: false },
  jwxtMaintenanceHint: { type: String, default: '' },
  jwxtMaintenanceDetail: { type: String, default: '' },
  jwxtRecoveryPhase: { type: String, default: 'idle' },
  jwxtLastCheckTime: { type: String, default: '' },
  tickerNotices: { type: Array, default: () => [] },
  pinnedNotices: { type: Array, default: () => [] },
  noticeList: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'navigate',
  'logout',
  'require-login',
  'retry-session-recovery',
  'open-notice',
  'openSettings'
])

const maintenanceTitle = computed(() => {
  const phase = String(props.jwxtRecoveryPhase || '')
  // #659：本地身份已恢复但教务在线会话未恢复（尚未进入恢复轮询）
  if (onlineSessionState.value === 'cached_offline' && phase === 'idle') {
    return '本地身份已恢复，教务在线会话未恢复'
  }
  if (phase === 'recovering') return '正在后台恢复登录'
  if (phase === 'need_login') return '需要重新登录'
  if (phase === 'failed') return '会话恢复未成功'
  return '教务系统正在维护'
})

const maintenancePhaseLabel = computed(() => {
  const phase = String(props.jwxtRecoveryPhase || '')
  if (onlineSessionState.value === 'cached_offline' && phase === 'idle') return '展示缓存数据'
  if (phase === 'recovering') return '后台自动登录中'
  if (phase === 'need_login') return '请手动登录'
  if (phase === 'failed') return '将定时重试'
  if (phase === 'maintenance') return '教务暂不可用'
  return '状态未知'
})

const maintenanceNotices = computed(() => {
  const pick = (list) =>
    (Array.isArray(list) ? list : [])
      .map((n) => ({
        id: n?.id || n?.key || n?.title || '',
        title: String(n?.title || n?.name || stripMarkdown(n?.content || n?.body || '') || '').trim(),
        raw: n
      }))
      .filter((n) => n.title)
  const pinned = pick(props.pinnedNotices).slice(0, 3)
  if (pinned.length) return pinned
  const ticker = pick(props.tickerNotices).slice(0, 3)
  if (ticker.length) return ticker
  return pick(props.noticeList).slice(0, 3)
})

/**
 * 会话状态点（仅圆点，无文字）：
 * - red：未登录 / 失败 / 需登录 / 维护
 * - blink：后台重连中
 * - green：已连接
 * 注意：不要在 onMounted 人为先红后绿（进出模块会 remount，会闪红点）。
 * 详情仅点击非绿点时展开。
 */
const sessionDetailOpen = ref(false)

/**
 * 在线会话状态（GitHub #659）：缓存身份 ≠ 在线会话。
 * 直接读 auth store（App.vue 未透传该 prop，避免改壳层）。
 */
const authStore = useAuthStore()
const onlineSessionState = computed(() => authStore.onlineSessionState || '')

const sessionStatusVisual = computed(() => {
  if (!props.isLoggedIn) return 'red'
  // #659：优先以「在线会话状态」为准 —— 缓存身份 ≠ 在线会话
  const online = String(onlineSessionState.value || '')
  if (online === 'online') return 'green'
  if (online === 'recovering') return 'blink'
  if (online === 'cached_offline' || online === 'needs_login') return 'red'
  // 兼容旧行为（unknown 时回退到维护相位判断）
  const phase = String(props.jwxtRecoveryPhase || 'idle')
  if (phase === 'recovering') return 'blink'
  if (phase === 'failed' || phase === 'need_login' || phase === 'maintenance') {
    return 'red'
  }
  // maintenance 布尔为 true 但 phase 已 idle：视为仍异常
  if (props.jwxtMaintenance && phase !== 'idle') return 'red'
  if (props.jwxtMaintenance && phase === 'idle') return 'red'
  return 'green'
})

const sessionStatusAria = computed(() => {
  const v = sessionStatusVisual.value
  if (v === 'green') return '会话已连接'
  if (v === 'blink') return '正在重连会话，点击查看详情'
  return '会话异常或未连接，点击查看详情'
})

const onSessionStatusClick = (event) => {
  event?.stopPropagation?.()
  event?.preventDefault?.()
  if (sessionStatusVisual.value === 'green') {
    sessionDetailOpen.value = false
    return
  }
  sessionDetailOpen.value = !sessionDetailOpen.value
}

watch(
  () => [props.jwxtMaintenance, props.jwxtRecoveryPhase, props.isLoggedIn],
  () => {
    // 连上后自动收起详情，避免绿点还挂着维护卡
    if (sessionStatusVisual.value === 'green') {
      sessionDetailOpen.value = false
    }
  }
)

const uiSettings = useUiSettings()

const brokenImages = ref(new Set())
const cardListeners = []
const isMobileNoticeSwipe = ref(false)
const isTickerInteracting = ref(false)
let tickerResumeTimer = null
const tickerItemsRef = ref(null)
const tickerTranslateX = ref(0)
const tickerTransitionMs = ref(0)
const tickerStepWidth = ref(236)
const tickerLoopWidth = ref(0)
const tickerSuppressClickUntil = ref(0)
const TICKER_AUTO_SPEED = 26 // px/s
let tickerRafId = 0
let tickerLastFrameTs = 0
let tickerDragActive = false
let tickerDragStartX = 0
let tickerDragLastX = 0
let tickerDragStartTranslate = 0
let tickerDragStartAt = 0
let noticeResizeRaf = 0
let lastNoticeViewportWidth = 0
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const LOGIN_METHOD_KEY = 'hbu_login_method'
const JWXT_MODULE_ALLOWLIST = new Set([
  'grades', 'classroom', 'exams', 'ranking', 'calendar', 'school_inbox', 'academic',
  'qxzkb', 'course_selection', 'training', 'teaching_eval', 'library', 'campus_map', 'resource_share',
  'chaoxing_hub', 'chaoxing_inbox', 'chaoxing_class', 'broadband', 'sports_venue', 'towergo'
])
const loginMethod = ref('')
const isChaoxingMethod = (value) => String(value || '').trim().startsWith('chaoxing')
const HOME_LAYOUT_LONG_PRESS_MS = 380
const HOME_LAYOUT_LONG_PRESS_DISTANCE = 14

const refreshLoginMethod = () => {
  loginMethod.value = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
}

const todayCourses = ref([])
const homeSearchCourses = ref([])
const todayLoading = ref(false)
const todayError = ref('')
const nowTick = ref(Date.now())
let clockTimer = null
const CLOCK_TICK_MS = 1000

const periodTimeMap = {
  1: { start: '08:20', end: '09:05' },
  2: { start: '09:10', end: '09:55' },
  3: { start: '10:15', end: '11:00' },
  4: { start: '11:05', end: '11:50' },
  5: { start: '14:00', end: '14:45' },
  6: { start: '14:50', end: '15:35' },
  7: { start: '15:55', end: '16:40' },
  8: { start: '16:45', end: '17:30' },
  9: { start: '18:30', end: '19:15' },
  10: { start: '19:20', end: '20:05' },
  11: { start: '20:10', end: '20:55' }
}

const toMinutes = (timeText) => {
  if (!timeText || !timeText.includes(':')) return 0
  const [h, m] = timeText.split(':').map(Number)
  return h * 60 + m
}

const currentMinute = computed(() => {
  const now = new Date(nowTick.value)
  return now.getHours() * 60 + now.getMinutes()
})

// 更细致的问候语（根据时间段）
const greetingText = computed(() => {
  const hour = new Date(nowTick.value).getHours()
  if (hour >= 5 && hour < 8) return '早上好'
  if (hour >= 8 && hour < 11) return '上午好'
  if (hour >= 11 && hour < 13) return '中午好'
  if (hour >= 13 && hour < 17) return '下午好'
  if (hour >= 17 && hour < 19) return '傍晚好'
  if (hour >= 19 && hour < 22) return '晚上好'
  return '夜深了'
})

// 用户学院信息（从缓存的学生信息中读取）
const userCollegeInfo = computed(() => {
  const sid = String(props.studentId || '').trim()
  if (!sid) return '湖北工业大学'
  try {
    // fetchWithCache 存储格式: cache:studentinfo:{studentId} -> { data: { success, data: {...} }, timestamp }
    const raw = localStorage.getItem(`cache:studentinfo:${sid}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      const info = parsed?.data?.data || parsed?.data || {}
      const college = String(info.college || '').trim()
      const grade = String(info.grade || '').trim()
      if (college && grade) return `${college} • ${grade}级`
      if (college) return college
    }
  } catch (_e) { /* ignore */ }
  return '湖北工业大学'
})

const currentMinutePrecise = computed(() => {
  const now = new Date(nowTick.value)
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
})

const currentTimeText = computed(() => {
  const now = new Date(nowTick.value)
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
})

const timelineCourses = computed(() => {
  return todayCourses.value
    .filter((course) => course.endMinutes > currentMinutePrecise.value)
})

const todayBlockTitle = computed(() => {
  if (!props.isLoggedIn) return '今日课程'
  if (timelineCourses.value.length === 0) return '今日课程'
  const first = timelineCourses.value[0]
  if (first.startMinutes <= currentMinutePrecise.value && currentMinutePrecise.value < first.endMinutes) {
    return '正在进行'
  }
  return '即将开始'
})

const syncNowTick = () => { nowTick.value = Date.now() }
const handleVisibilityRefresh = () => { if (document.visibilityState === 'visible') syncNowTick() }
const getTodayWeekday = () => { const day = new Date(nowTick.value).getDay(); return day === 0 ? 7 : day }

const getCurrentWeek = (metaWeek) => {
  if (Number(metaWeek) > 0) return Number(metaWeek)
  try {
    const cachedMeta = localStorage.getItem('hbu_schedule_meta')
    if (!cachedMeta) return 1
    const parsed = JSON.parse(cachedMeta)
    const week = Number(parsed?.current_week || 1)
    return week > 0 ? week : 1
  } catch (e) { return 1 }
}

const getPreferredScheduleSemester = () => {
  const lockDetail = readScheduleLockDetail(props.studentId)
  const lockedSemester = String(lockDetail?.semester || '').trim()
  if (lockedSemester) return { semester: lockedSemester, source: 'lock', reason: String(lockDetail?.reason || '').trim() }
  try {
    const cachedMeta = localStorage.getItem('hbu_schedule_meta')
    if (!cachedMeta) return { semester: '', source: 'none', reason: '' }
    const parsed = JSON.parse(cachedMeta)
    return { semester: String(parsed?.semester || '').trim(), source: 'meta', reason: '' }
  } catch (e) { return { semester: '', source: 'none', reason: '' } }
}

const isVacationPreviousMeta = (meta = {}) => {
  const strategy = String(meta?.auto_strategy || '').trim()
  const notice = String(meta?.vacation_notice || '').trim()
  return strategy === 'vacation_previous' || notice.includes('当前为假期')
}

const buildScheduleCacheKey = (studentId, semester) => {
  const sid = String(studentId || '').trim()
  const sem = String(semester || '').trim()
  if (!sid) return ''
  return sem ? `schedule:${sid}:${sem}` : `schedule:${sid}`
}

const toPositiveInt = (value, fallback = 0) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return Math.floor(num)
}

const normalizeWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return []
  return weeks.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
}

const getCoursePeriodRange = (course) => {
  const startPeriod = toPositiveInt(course?.period ?? course?.start_period, 0)
  if (startPeriod < 1 || startPeriod > 11) return null
  const endByField = toPositiveInt(course?.end_period, 0)
  const span = Math.max(1, toPositiveInt(course?.djs ?? course?.duration, 1))
  const computedEnd = endByField > 0 ? endByField : startPeriod + span - 1
  const endPeriod = Math.min(11, Math.max(startPeriod, computedEnd))
  return { startPeriod, endPeriod }
}

const getTodayCourseSignature = (course, room, teacher) => {
  const name = String(course?.name || '').trim()
  const className = String(course?.class_name || '').trim()
  const building = String(course?.building || '').trim()
  const custom = course?.is_custom ? '1' : '0'
  return `${name}|${teacher}|${room}|${className}|${building}|${custom}`
}

const fetchCustomCoursesForToday = async (semester) => {
  const sid = String(props.studentId || '').trim()
  const sem = String(semester || '').trim()
  if (!sid || !sem) return []
  try {
    const res = await axios.post(`${API_BASE}/v2/schedule/custom/list`, { student_id: sid, semester: sem })
    if (!res.data?.success) return []
    const list = Array.isArray(res.data?.data) ? res.data.data : []
    return list.filter((course) => {
      const weekday = toPositiveInt(course?.weekday, 0)
      const hasName = !!String(course?.name || '').trim()
      const range = getCoursePeriodRange(course)
      return hasName && weekday >= 1 && weekday <= 7 && !!range
    })
  } catch (_error) { return [] }
}

const buildTodayCourses = (courses, currentWeek) => {
  const safeWeek = toPositiveInt(currentWeek, 1)
  const todayWeekday = getTodayWeekday()
  const normalized = (courses || [])
    .filter((course) => toPositiveInt(course?.weekday, 0) === todayWeekday)
    .filter((course) => {
      const weeks = normalizeWeeks(course?.weeks)
      return weeks.length === 0 || weeks.includes(safeWeek)
    })
    .map((course) => {
      const range = getCoursePeriodRange(course)
      if (!range) return null
      return { ...course, startPeriod: range.startPeriod, endPeriod: range.endPeriod, room: course?.room_code || course?.room || '-', teacher: course?.teacher || '-' }
    })
    .filter(Boolean)

  const signatureCount = new Map()
  normalized.forEach((course) => {
    const signature = getTodayCourseSignature(course, course.room, course.teacher)
    signatureCount.set(signature, (signatureCount.get(signature) || 0) + 1)
  })

  const daily = normalized
    .map((course) => {
      const signature = getTodayCourseSignature(course, course.room, course.teacher)
      const rawSpan = Math.max(1, course.endPeriod - course.startPeriod + 1)
      const duplicateCount = Number(signatureCount.get(signature) || 0)
      const unitSpan = course.is_custom ? rawSpan : (duplicateCount > 1 ? 1 : rawSpan)
      const endPeriod = Math.min(11, course.startPeriod + unitSpan - 1)
      return { ...course, signature, rawSpan, unitSpan, endPeriod }
    })
    .sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod)

  const merged = []
  let index = 0
  while (index < daily.length) {
    const current = daily[index]
    const room = current.room
    const teacher = current.teacher
    const startPeriod = current.startPeriod
    let endPeriod = current.endPeriod
    let nextIndex = index + 1
    while (nextIndex < daily.length) {
      const next = daily[nextIndex]
      if (current.unitSpan === 1 && next.unitSpan === 1 && next.signature === current.signature && next.startPeriod === endPeriod + 1) {
        endPeriod = next.endPeriod
        nextIndex += 1
      } else { break }
    }
    const startText = periodTimeMap[startPeriod]?.start || '--:--'
    const endText = periodTimeMap[endPeriod]?.end || '--:--'
    merged.push({
      key: `${current.name}-${teacher}-${startPeriod}-${endPeriod}-${room}`,
      name: current.name, teacher, room,
      start: startText, end: endText,
      startMinutes: toMinutes(startText), endMinutes: toMinutes(endText)
    })
    index = nextIndex
  }
  return merged
}

const fetchTodayCourses = async () => {
  if (!props.isLoggedIn || !props.studentId) { todayCourses.value = []; homeSearchCourses.value = []; todayError.value = ''; return }
  const preferredInfo = getPreferredScheduleSemester()
  const preferredSemester = String(preferredInfo?.semester || '').trim()
  const sid = String(props.studentId || '').trim()
  const cacheKey = buildScheduleCacheKey(props.studentId, preferredSemester)
  // 优先用缓存数据立即渲染，避免空白/loading 闪烁
  const cached = getCachedData(cacheKey)
  if (cached?.data?.success && !cached.data.offline) {
    todayLoading.value = false
  } else {
    todayLoading.value = true
  }
  todayError.value = ''
  try {
    let customCourses = []
    let payload = cached?.data
    if (!payload?.success) {
      const res = await fetchWithCache(cacheKey, async () => {
        const rsp = await axios.post(`${API_BASE}/v2/schedule/query`, { student_id: props.studentId, semester: preferredSemester || undefined })
        return rsp.data
      }, undefined, DEFAULT_SWR_OPTIONS)
      payload = res?.data
    }
    const shouldForceOnlineRetry = !!payload?.success && !!payload?.offline && isVacationPreviousMeta(payload?.meta)
    if (shouldForceOnlineRetry && sid) {
      try {
        const onlineRes = await axios.post(`${API_BASE}/v2/schedule/query`, { student_id: sid, semester: undefined })
        const onlinePayload = onlineRes?.data
        if (onlinePayload?.success && !onlinePayload?.offline) {
          payload = onlinePayload
          const onlineSemester = String(onlinePayload?.meta?.semester || '').trim()
          if (onlineSemester) setCachedData(`schedule:${sid}:${onlineSemester}`, onlinePayload)
          setCachedData(`schedule:${sid}`, onlinePayload)
        }
      } catch (_error) { /* keep stale payload */ }
    }
    const semesterForCustom = String(payload?.meta?.semester || preferredSemester || '').trim()
    customCourses = await fetchCustomCoursesForToday(semesterForCustom)
    if (!payload?.success) {
      if (customCourses.length > 0) {
        const week = getCurrentWeek()
        todayCourses.value = buildTodayCourses(customCourses, week)
        homeSearchCourses.value = buildWeeklyCourseSearchEntries({ courses: customCourses, currentWeek: week, periodTimeMap })
        todayError.value = ''
      } else {
        todayCourses.value = []
        homeSearchCourses.value = []
        todayError.value = payload?.error || '今日课程加载失败'
      }
      return
    }
    if (payload?.meta) {
      const nextWeek = Number(payload.meta.current_week || 0)
      const persistedWeek = nextWeek > 0 ? nextWeek : getCurrentWeek()
      if (!isTestAccountSession()) {
        localStorage.setItem('hbu_schedule_meta', JSON.stringify({ semester: payload.meta.semester || preferredSemester || '', start_date: payload.meta.start_date || '', current_week: persistedWeek }))
      }
    }
    const week = getCurrentWeek(payload?.meta?.current_week)
    const remoteCourses = Array.isArray(payload?.data) ? payload.data : []
    const mergedCourses = [...remoteCourses, ...customCourses]
    todayCourses.value = buildTodayCourses(mergedCourses, week)
    homeSearchCourses.value = buildWeeklyCourseSearchEntries({ courses: mergedCourses, currentWeek: week, periodTimeMap })
    todayError.value = ''
  } catch (error) { todayCourses.value = []; homeSearchCourses.value = []; todayError.value = '今日课程加载失败' }
  finally { todayLoading.value = false }
}

// 模块列表
const baseModules = [
  { id: 'grades', name: '成绩查询', iconKey: 'grades', color: '#667eea', desc: '查看所有学期成绩', available: true, requiresLogin: true },
  { id: 'classroom', name: '空教室', iconKey: 'classroom', color: '#ed8936', desc: '查询空闲教室', available: true, requiresLogin: true },
  { id: 'electricity', name: '电费查询', iconKey: 'electricity', color: '#e53e3e', desc: '宿舍电费余额', available: true, requiresLogin: true },
  { id: 'transactions', name: '交易记录', iconKey: 'transactions', color: '#F56C6C', desc: '一码通消费记录', available: true, requiresLogin: true },
  { id: 'exams', name: '考试安排', iconKey: 'exams', color: '#38b2ac', desc: '查询考试时间地点', available: true, requiresLogin: true },
  { id: 'ranking', name: '绩点排名', iconKey: 'ranking', color: '#f6ad55', desc: '专业班级排名', available: true, requiresLogin: true },
  { id: 'campus_code', name: '校园码', iconKey: 'campus_code', color: '#0f766e', desc: '在线/高能模式二维码', available: true, requiresLogin: true },
  { id: 'calendar', name: '校历', iconKey: 'calendar', color: '#3b82f6', desc: '查看学期校历', available: true, requiresLogin: true },
  { id: 'school_inbox', name: '学校消息', iconKey: 'school_inbox', color: '#6366f1', desc: '教务与学习通消息', available: true, requiresLogin: true },
  { id: 'academic', name: '学业情况', iconKey: 'academic', color: '#10b981', desc: '学业完成度与课程进度', available: true, requiresLogin: true },
  { id: 'qxzkb', name: '全校课表', iconKey: 'qxzkb', color: '#6366f1', desc: '查询全校课程与排课', available: true, requiresLogin: true },
  { id: 'course_selection', name: '选课中心', iconKey: 'course_selection', color: '#f59e0b', desc: '通识选课与退课', available: true, requiresLogin: true },
  { id: 'training', name: '培养方案', iconKey: 'training', color: '#0ea5e9', desc: '培养方案与课程设置', available: true, requiresLogin: true },
  { id: 'teaching_eval', name: '教学评教', iconKey: 'teaching_eval', color: '#a855f7', desc: '待评课程与一键满分提交', available: true, requiresLogin: true },
  { id: 'chaoxing_hub', name: '课程中心', iconKey: 'chaoxing_hub', color: '#2563eb', desc: '学习通课程、作业与进度', available: true, requiresLogin: true },
  { id: 'chaoxing_inbox', name: '收件箱', iconKey: 'chaoxing_inbox', color: '#4f46e5', desc: '学习通通知与消息', available: true, requiresLogin: true },
  { id: 'chaoxing_class', name: '资料分享', iconKey: 'chaoxing_class', color: '#3b82f6', desc: '邀请码入班与班级资料', available: true, requiresLogin: true },
  { id: 'broadband', name: '教育网网费', iconKey: 'broadband', color: '#0891b2', desc: '校园网费用查询与缴纳入口', available: true, requiresLogin: true },
  // 场馆依赖 172.16.54.20 校园网 + accessToken；外网/无校园网时 third/open 无法落地，暂禁用避免死入口
  { id: 'sports_venue', name: '运动场馆', iconKey: 'sports_venue', color: '#16a34a', desc: '场馆预约需校园网（暂不可用）', available: false, requiresLogin: true },
  { id: 'library', name: '图书查询', iconKey: 'library', color: '#0f766e', desc: '馆藏检索与定位', available: true, requiresLogin: false },
  { id: 'campus_map', name: '校园地图', iconKey: 'campus_map', color: '#14b8a6', desc: '校园地图查看', available: true, requiresLogin: false },
  { id: 'resource_share', name: '资源网盘', iconKey: 'resource_share', color: '#0ea5e9', desc: 'WebDAV 资料浏览与下载', available: true, requiresLogin: false },
  { id: 'towergo', name: '小塔出行', iconKey: 'towergo', color: '#22c55e', desc: '校园电单车与骑行服务', available: true, requiresLogin: false },
  { id: 'ai', name: '校园助手', iconKey: 'ai', color: '#94a3b8', desc: '暂不可用', available: true, requiresLogin: true }
]

const modules = computed(() => {
  // 依赖登录态：合规包真实登录后应展开全功能模块列表
  void props.isLoggedIn
  void props.studentId
  const scoped = !isChaoxingMethod(loginMethod.value)
    ? baseModules
    : baseModules.filter((mod) => JWXT_MODULE_ALLOWLIST.has(mod.id))
  // 合规包：仅 guest / 演示会话过滤高风险模块；真实登录不过滤
  return filterAllowedModules(scoped, {
    isLoggedIn: props.isLoggedIn,
    isDemoSession: isTestAccountSession()
  })
})

const homeWorkspaceRef = ref(null)
const isHomeLayoutEditing = ref(false)
const showAllModules = ref(false)
const draftHomeWidgetsOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).home.widgetsOrder])
const draftHomeModuleOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).home.moduleOrder])
const activeHomeDragSection = ref('')
const hoverLayoutKey = ref('')

const orderedModules = computed(() => {
  const currentOrder = isHomeLayoutEditing.value ? draftHomeModuleOrder.value : uiSettings.workspaceLayout.home.moduleOrder
  const moduleMap = new Map(modules.value.map((item) => [item.id, item]))
  return currentOrder.map((key) => moduleMap.get(key)).filter(Boolean)
})

const displayModules = computed(() => {
  const first7 = orderedModules.value.slice(0, 7)
  return [...first7, { id: '__more__', name: '更多', iconKey: 'more', color: '#6b7280', available: true, requiresLogin: false }]
})

const homeWidgetOrder = computed(() => isHomeLayoutEditing.value ? draftHomeWidgetsOrder.value : uiSettings.workspaceLayout.home.widgetsOrder)
const isChaoxingLogin = computed(() => isChaoxingMethod(loginMethod.value))
const homeCollisionFx = ref([])

// 合规 guest/demo 下学习通、一码通等整组会被滤空：不渲染空分组标题，避免误导审核员
const moduleCategories = computed(() => {
  const cats = [
    {
      title: '教务服务',
      modules: modules.value.filter((m) =>
        [
          'grades',
          'exams',
          'ranking',
          'academic',
          'qxzkb',
          'course_selection',
          'training',
          'teaching_eval',
          'classroom',
          'calendar',
          'school_inbox'
        ].includes(m.id)
      )
    },
    {
      title: '学习通',
      modules: modules.value.filter((m) =>
        ['chaoxing_hub', 'chaoxing_inbox', 'chaoxing_class'].includes(m.id)
      )
    },
    {
      title: '一码通',
      modules: modules.value.filter((m) =>
        ['campus_code', 'electricity', 'transactions', 'broadband', 'sports_venue'].includes(m.id)
      )
    },
    {
      title: '资源',
      modules: modules.value.filter((m) =>
        ['library', 'campus_map', 'resource_share', 'towergo', 'ai'].includes(m.id)
      )
    }
  ]
  return cats.filter((c) => Array.isArray(c.modules) && c.modules.length > 0)
})

const handleCategoryModuleClick = (moduleId) => { showAllModules.value = false; navigateTo(moduleId) }

let homeLayoutLongPressTimer = null
let homeLayoutPointerStart = { x: 0, y: 0 }
let suppressModuleClickUntil = 0
let homeDragAnchors = []
let homeDragTargetIndex = -1
let homeCollisionFxRaf = 0
let homeCollisionFxLastTs = 0

const navigateTo = (moduleId) => {
  if (
    !isModuleAllowed(moduleId, {
      isLoggedIn: props.isLoggedIn,
      isDemoSession: isTestAccountSession()
    })
  ) {
    showToast('当前版本不可用该功能')
    return
  }
  // 唯一准入：decideHomeNavigate（available:false / 硬禁用 sports_venue / 需登录）
  // 禁止只改 baseModules.available 却旁路打开模块
  const access = decideHomeNavigate(moduleId, modules.value, {
    isLoggedIn: props.isLoggedIn
  })
  if (!access.ok) {
    if (access.needLogin) {
      emit('require-login')
      return
    }
    showToast(access.reason || '暂不可用')
    return
  }
  emit('navigate', moduleId)
}

const syncHomeLayoutDraft = () => {
  const snapshot = cloneWorkspaceLayout(uiSettings.workspaceLayout)
  draftHomeWidgetsOrder.value = [...snapshot.home.widgetsOrder]
  draftHomeModuleOrder.value = [...snapshot.home.moduleOrder]
}

const getModuleCardStyle = (module) => ({ '--accent-color': module.color })

const getHomeCollisionPalette = (section, activeKey, targetKey = '') => {
  if (section === 'modules') {
    const moduleMap = new Map(modules.value.map((item) => [item.id, item]))
    return resolveCollisionPalette(moduleMap.get(activeKey)?.color, moduleMap.get(targetKey)?.color, '#8fd6ff')
  }
  const widgetPalette = { module_grid: ['#5b8cff', '#7c3aed', '#c4b5fd'], today_panel: ['#22c55e', '#38bdf8', '#bef264'] }
  return resolveCollisionPalette(widgetPalette[activeKey], widgetPalette[targetKey], '#8fd6ff')
}

const stopHomeCollisionFxLoop = () => { if (homeCollisionFxRaf) { cancelAnimationFrame(homeCollisionFxRaf); homeCollisionFxRaf = 0 }; homeCollisionFxLastTs = 0 }
const tickHomeCollisionFx = (timestamp) => {
  const previousTs = homeCollisionFxLastTs || timestamp
  homeCollisionFxLastTs = timestamp
  homeCollisionFx.value = advanceLayoutCollisionFx(homeCollisionFx.value, timestamp - previousTs)
  if (homeCollisionFx.value.length === 0) { stopHomeCollisionFxLoop(); return }
  homeCollisionFxRaf = requestAnimationFrame(tickHomeCollisionFx)
}
const ensureHomeCollisionFxLoop = () => { if (homeCollisionFxRaf) return; homeCollisionFxLastTs = performance.now(); homeCollisionFxRaf = requestAnimationFrame(tickHomeCollisionFx) }

const spawnHomeCollisionFx = (section, activeKey, target) => {
  const root = homeWorkspaceRef.value
  const rootRect = root?.getBoundingClientRect?.()
  if (!rootRect || !target?.rect) return
  const sourceRect = homeDragAnchors.find((item) => item.id === activeKey)?.rect || null
  const origin = resolveRelativeCollisionPoint({ rootRect, sourceRect, targetRect: target.rect })
  const burst = createLayoutCollisionBurst({ x: origin.x, y: origin.y, colors: getHomeCollisionPalette(section, activeKey, target.id) })
  homeCollisionFx.value = [...homeCollisionFx.value.slice(-48), ...burst]
  ensureHomeCollisionFxLoop()
}

const stopHomeLayoutDrag = () => { activeHomeDragSection.value = ''; hoverLayoutKey.value = ''; homeDragAnchors = []; homeDragTargetIndex = -1 }
const enterHomeLayoutEdit = () => { if (!isHomeLayoutEditing.value) { syncHomeLayoutDraft(); isHomeLayoutEditing.value = true; suppressModuleClickUntil = Date.now() + 180 } }
const cancelHomeLayoutEdit = () => { stopHomeLayoutDrag(); syncHomeLayoutDraft(); isHomeLayoutEditing.value = false }
const resetHomeLayoutEdit = () => { const defaults = buildDefaultWorkspaceLayout(); draftHomeWidgetsOrder.value = [...defaults.home.widgetsOrder]; draftHomeModuleOrder.value = [...defaults.home.moduleOrder]; showToast('首页布局已恢复默认。', 'success') }
const saveHomeLayoutEdit = () => {
  const nextLayout = cloneWorkspaceLayout(uiSettings.workspaceLayout)
  nextLayout.home.widgetsOrder = [...draftHomeWidgetsOrder.value]
  nextLayout.home.moduleOrder = [...draftHomeModuleOrder.value]
  uiSettings.workspaceLayout = nextLayout
  flushUiSettings()
  stopHomeLayoutDrag()
  isHomeLayoutEditing.value = false
  showToast('首页布局已保存。', 'success')
}

const handleHomeDragStart = ({ section, id }) => {
  activeHomeDragSection.value = String(section || '')
  hoverLayoutKey.value = String(id || '')
  homeDragAnchors = captureLayoutSlotAnchors(homeWorkspaceRef.value, String(section || ''))
  homeDragTargetIndex = homeDragAnchors.find((item) => item.id === String(id || ''))?.index ?? -1
}

const reorderDraftHomeLayout = (section, activeKey, targetIndex) => {
  if (!activeKey || !Number.isFinite(Number(targetIndex))) return
  if (section === 'widgets') { draftHomeWidgetsOrder.value = moveLayoutItemToIndex(draftHomeWidgetsOrder.value, activeKey, targetIndex); return }
  draftHomeModuleOrder.value = moveLayoutItemToIndex(draftHomeModuleOrder.value, activeKey, targetIndex)
}

const handleHomeDragMove = ({ id, section, point }) => {
  if (!isHomeLayoutEditing.value) return
  const activeId = String(id || '').trim()
  const activeSection = String(section || '').trim()
  if (!activeId || !point || activeSection !== activeHomeDragSection.value) return
  const target = resolveLayoutSlotTarget(homeDragAnchors, point)
  if (!target || homeDragTargetIndex === target.index) return
  spawnHomeCollisionFx(activeSection, activeId, target)
  homeDragTargetIndex = target.index
  hoverLayoutKey.value = target.id
  reorderDraftHomeLayout(activeSection, activeId, target.index)
}

const clearHomeLayoutLongPress = () => { if (homeLayoutLongPressTimer) { window.clearTimeout(homeLayoutLongPressTimer); homeLayoutLongPressTimer = null } }
const isTouchPointerEvent = (event) => String(event?.pointerType || '').toLowerCase() === 'touch'

const handleHomeLayoutPressStart = (event) => {
  if (isHomeLayoutEditing.value) return
  if (!isTouchPointerEvent(event)) return
  clearHomeLayoutLongPress()
  homeLayoutPointerStart = { x: Number(event.clientX || 0), y: Number(event.clientY || 0) }
  homeLayoutLongPressTimer = window.setTimeout(() => { suppressModuleClickUntil = Date.now() + 420; enterHomeLayoutEdit(); clearHomeLayoutLongPress() }, HOME_LAYOUT_LONG_PRESS_MS)
}

const handleHomeLayoutPressMove = (event) => {
  if (!homeLayoutLongPressTimer || !isTouchPointerEvent(event)) return
  const deltaX = Math.abs(Number(event.clientX || 0) - homeLayoutPointerStart.x)
  const deltaY = Math.abs(Number(event.clientY || 0) - homeLayoutPointerStart.y)
  if (deltaX > HOME_LAYOUT_LONG_PRESS_DISTANCE || deltaY > HOME_LAYOUT_LONG_PRESS_DISTANCE) clearHomeLayoutLongPress()
}

const handleHomeLayoutPressEnd = () => { clearHomeLayoutLongPress() }

// 计算课程倒计时文字
const getCourseCountdown = (course) => {
  const now = currentMinutePrecise.value
  if (course.startMinutes <= now && now < course.endMinutes) {
    const remaining = Math.ceil(course.endMinutes - now)
    return `剩余 ${remaining} 分钟`
  }
  const minutesUntil = Math.ceil(course.startMinutes - now)
  if (minutesUntil <= 0) return '即将开始'
  if (minutesUntil < 60) return `距开始 ${minutesUntil} 分钟`
  const hours = Math.floor(minutesUntil / 60)
  const mins = minutesUntil % 60
  return `距开始 ${hours}h${mins > 0 ? mins + 'm' : ''}`
}

const handleModuleCardClick = (moduleId) => {
  if (isHomeLayoutEditing.value) return
  if (Date.now() < suppressModuleClickUntil) return
  if (moduleId === '__more__') { showAllModules.value = true; return }
  navigateTo(moduleId)
}

const handleProfileClick = () => { emit('navigate', 'me') }

// === 天气数据 ===
const weatherData = ref({
  temp: '--',
  city: '武汉市洪山区',
  condition: '加载中',
  icon: 'fa-cloud',
  humidity: 0,
  wind: '--',
  aqi: 0,
  forecast: []
})
const showWeatherDetail = ref(false)
const forecastTemperatureBounds = computed(() => getForecastTemperatureBounds(weatherData.value.forecast))

const weatherIconColor = computed(() => getWeatherIconTone(weatherData.value.condition).color)

const getWeatherIconColor = (condition) => getWeatherIconTone(condition).color

// 天气卡片动态样式（严格按照 Stitch 设计规范）
const weatherGradientClass = computed(() => {
  const c = weatherData.value.condition
  if (c === '晴') return 'bg-gradient-to-br from-orange-50 to-amber-100'
  if (c === '多云') return 'bg-gradient-to-br from-blue-50 to-indigo-50'
  if (c === '阴') return 'bg-gradient-to-br from-slate-100 to-slate-200'
  if (c === '小雨' || c === '中雨') return 'bg-gradient-to-br from-cyan-50 to-blue-100'
  if (c === '大雨' || c === '雷阵雨') return 'bg-gradient-to-br from-gray-200 to-zinc-300'
  if (c === '雪') return 'bg-gradient-to-br from-sky-50 to-indigo-100'
  if (c === '雾') return 'bg-gradient-to-br from-stone-100 to-stone-200'
  return 'bg-gradient-to-br from-blue-50 to-indigo-50'
})

const weatherCardClass = computed(() => 'bg-white')

const weatherTextClass = computed(() => {
  const c = weatherData.value.condition
  if (c === '晴') return 'text-amber-900'
  if (c === '多云') return 'text-indigo-900'
  if (c === '阴') return 'text-slate-800'
  if (c === '小雨' || c === '中雨') return 'text-blue-900'
  if (c === '大雨' || c === '雷阵雨') return 'text-zinc-900'
  if (c === '雪') return 'text-indigo-900'
  if (c === '雾') return 'text-stone-800'
  return 'text-indigo-900'
})

const weatherGlowClass = computed(() => {
  const c = weatherData.value.condition
  if (c === '晴') return 'bg-amber-300/20'
  if (c === '多云') return 'bg-blue-300/20'
  if (c === '阴') return 'bg-slate-400/20'
  if (c === '小雨' || c === '中雨') return 'bg-blue-400/20'
  if (c === '大雨' || c === '雷阵雨') return 'bg-zinc-500/20'
  if (c === '雪') return 'bg-indigo-300/20'
  if (c === '雾') return 'bg-stone-400/20'
  return 'bg-blue-300/20'
})

// 温度显示颜色（Stitch 规范中各天气的强调色）
const weatherTempClass = computed(() => {
  const c = weatherData.value.condition
  if (c === '晴') return 'text-amber-600'
  if (c === '多云') return 'text-indigo-600'
  if (c === '阴') return 'text-slate-600'
  if (c === '小雨' || c === '中雨') return 'text-blue-600'
  if (c === '大雨' || c === '雷阵雨') return 'text-zinc-700'
  if (c === '雪') return 'text-indigo-600'
  if (c === '雾') return 'text-stone-600'
  return 'text-indigo-600'
})

// 信息胶囊文字颜色
const weatherPillTextClass = computed(() => {
  const c = weatherData.value.condition
  if (c === '晴') return 'text-amber-800'
  if (c === '多云') return 'text-indigo-800'
  if (c === '阴') return 'text-slate-700'
  if (c === '小雨' || c === '中雨') return 'text-blue-800'
  if (c === '大雨' || c === '雷阵雨') return 'text-zinc-800'
  if (c === '雪') return 'text-indigo-800'
  if (c === '雾') return 'text-stone-700'
  return 'text-indigo-800'
})

// 逐时预报（从 wttr.in hourly 数据生成，或 mock）
const hourlyForecast = computed(() => {
  if (weatherData.value.hourly && weatherData.value.hourly.length > 0) {
    return weatherData.value.hourly
  }
  // 生成 mock 逐时数据（基于当前温度上下浮动）
  const now = new Date()
  const baseTemp = Number(weatherData.value.temp) || 25
  const result = []
  for (let i = 0; i < 24; i++) {
    const h = new Date(now.getTime() + i * 3600000)
    const hour = h.getHours()
    // 模拟日间温度变化曲线（14点最高，5点最低）
    const tempOffset = Math.round(Math.sin((hour - 14) * Math.PI / 12) * 5)
    result.push({
      time: i === 0 ? '现在' : `${String(hour).padStart(2, '0')}:00`,
      temp: baseTemp + tempOffset,
      condition: weatherData.value.condition,
      icon: weatherData.value.icon
    })
  }
  return result
})

const WEATHER_CACHE_KEY = 'dashboard:weather'
const WEATHER_CACHE_TTL = 5 * 60 * 1000

const loadWeatherFromCache = () => {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - (parsed.ts || 0) > WEATHER_CACHE_TTL) return null
    return parsed.data
  } catch { return null }
}

const saveWeatherToCache = (data) => {
  try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

// 获取天气数据（调用 Rust 后端，有 localStorage 缓存）
const fetchWeather = async (force = false) => {
  const cached = !force && loadWeatherFromCache()
  if (cached) {
    weatherData.value = cached
    return
  }
  try {
    const { invokeNative } = await import('../platform/native')
    const data = await invokeNative('fetch_weather')
    if (data) {
      weatherData.value = data
      saveWeatherToCache(data)
    }
  } catch (e) {
    console.warn('[Weather] 天气获取失败:', e)
    const cachedFallback = loadWeatherFromCache()
    if (cachedFallback) { weatherData.value = cachedFallback; return }
    weatherData.value = {
      temp: 26,
      city: '武汉市洪山区',
      condition: '晴',
      icon: 'fa-sun',
      humidity: 65,
      wind: '东南风 3级',
      aqi: 72,
      forecast: [
        { day: '明天', temp_high: 28, temp_low: 18, condition: '多云', icon: 'fa-cloud' },
        { day: '后天', temp_high: 25, temp_low: 16, condition: '小雨', icon: 'fa-cloud-rain' },
      ]
    }
  }
}

// === 快捷入口（可配置） ===
const QUICK_ENTRY_KEY = 'hbu_quick_entry_modules'
const HOME_FEATURE_TAB_KEY = 'hbu_home_feature_tab'
const defaultQuickEntries = ['grades', 'exams', 'classroom', 'electricity', 'ranking']

/** 合规策略会话参数：与 modules / navigateTo 保持一致 */
const appStoreSessionOpts = () => ({
  isLoggedIn: props.isLoggedIn,
  isDemoSession: isTestAccountSession()
})

const quickEntryIds = ref([...defaultQuickEntries])
const showQuickEntryEditor = ref(false)
const draftQuickEntries = ref([...defaultQuickEntries])

const loadQuickEntries = () => {
  try {
    const stored = localStorage.getItem(QUICK_ENTRY_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length === 5) { quickEntryIds.value = parsed; return }
    }
  } catch (_e) { /* ignore */ }
  quickEntryIds.value = [...defaultQuickEntries]
}

const saveQuickEntries = () => {
  const session = appStoreSessionOpts()
  // 再次过滤：防止草稿残留被禁 id
  const next = draftQuickEntries.value.filter((id) => isModuleAllowed(id, session))
  if (next.length !== 5) {
    showToast('请选择 5 个可用模块')
    return
  }
  quickEntryIds.value = next
  localStorage.setItem(QUICK_ENTRY_KEY, JSON.stringify(quickEntryIds.value))
  showQuickEntryEditor.value = false
  showToast('快捷入口已更新', 'success')
}

const openQuickEntryEditor = () => {
  const session = appStoreSessionOpts()
  draftQuickEntries.value = quickEntryIds.value.filter((id) => isModuleAllowed(id, session))
  showQuickEntryEditor.value = true
}

const toggleDraftEntry = (id) => {
  if (!isModuleAllowed(id, appStoreSessionOpts())) return
  const idx = draftQuickEntries.value.indexOf(id)
  if (idx >= 0) { draftQuickEntries.value.splice(idx, 1) }
  else if (draftQuickEntries.value.length < 5) { draftQuickEntries.value.push(id) }
}

// 快捷入口的图标/颜色映射（含 schedule）
const quickEntryMeta = {
  grades: { name: '成绩查询', icon: 'fa-award', color: 'bg-blue-50', iconColor: 'text-blue-500' },
  schedule: { name: '课表', icon: 'fa-calendar-check', color: 'bg-orange-50', iconColor: 'text-orange-500' },
  classroom: { name: '空教室', icon: 'fa-door-open', color: 'bg-green-50', iconColor: 'text-green-500' },
  electricity: { name: '电费查询', icon: 'fa-bolt', color: 'bg-red-50', iconColor: 'text-red-500' },
  ranking: { name: '绩点排名', icon: 'fa-chart-bar', color: 'bg-yellow-50', iconColor: 'text-yellow-500' },
  exams: { name: '考试安排', icon: 'fa-file-alt', color: 'bg-teal-50', iconColor: 'text-teal-500' },
  calendar: { name: '校历', icon: 'fa-calendar-alt', color: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  school_inbox: { name: '学校消息', icon: 'fa-envelope', color: 'bg-indigo-50', iconColor: 'text-indigo-600' },
  academic: { name: '学业情况', icon: 'fa-chart-line', color: 'bg-emerald-50', iconColor: 'text-emerald-500' },
  campus_code: { name: '校园码', icon: 'fa-qrcode', color: 'bg-cyan-50', iconColor: 'text-cyan-500' },
  transactions: { name: '交易记录', icon: 'fa-wallet', color: 'bg-pink-50', iconColor: 'text-pink-500' },
  qxzkb: { name: '全校课表', icon: 'fa-table', color: 'bg-violet-50', iconColor: 'text-violet-500' },
  course_selection: { name: '选课中心', icon: 'fa-tasks', color: 'bg-amber-50', iconColor: 'text-amber-500' },
  training: { name: '培养方案', icon: 'fa-sitemap', color: 'bg-sky-50', iconColor: 'text-sky-500' },
  teaching_eval: { name: '教学评教', icon: 'fa-star', color: 'bg-purple-50', iconColor: 'text-purple-500' },
  chaoxing_hub: { name: '课程中心', icon: 'fa-graduation-cap', color: 'bg-blue-50', iconColor: 'text-blue-600' },
  chaoxing_inbox: { name: '收件箱', icon: 'fa-inbox', color: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  chaoxing_class: { name: '资料分享', icon: 'fa-folder-open', color: 'bg-sky-50', iconColor: 'text-sky-600' },
  broadband: { name: '教育网网费', icon: 'fa-wifi', color: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  sports_venue: { name: '运动场馆', icon: 'fa-futbol', color: 'bg-green-50', iconColor: 'text-green-600' },
  library: { name: '图书查询', icon: 'fa-book', color: 'bg-lime-50', iconColor: 'text-lime-600' },
  resource_share: { name: '资源网盘', icon: 'fa-cloud', color: 'bg-blue-50', iconColor: 'text-blue-500' },
  campus_map: { name: '校园地图', icon: 'fa-map-marked-alt', color: 'bg-teal-50', iconColor: 'text-teal-600' },
  resource_share: { name: '资料分享', icon: 'fa-folder-open', color: 'bg-blue-50', iconColor: 'text-blue-600' },
  towergo: { name: '小塔出行', icon: 'fa-bicycle', color: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  ai: { name: '校园助手', icon: 'fa-robot', color: 'bg-gray-50', iconColor: 'text-gray-500' }
}

// 快捷入口也走策略过滤：默认含 electricity/ranking，guest/demo 不得展示被禁模块
const quickEntryItems = computed(() => {
  return quickEntryIds.value
    .map((id) => ({ id, ...quickEntryMeta[id] }))
    .filter((item) => item.name && isModuleAllowed(item.id, appStoreSessionOpts()))
})

/** 编辑器可选模块：同样隐藏合规收紧会话下的被禁入口 */
const editableQuickEntryMeta = computed(() => {
  const session = appStoreSessionOpts()
  return Object.fromEntries(
    Object.entries(quickEntryMeta).filter(([id]) => isModuleAllowed(id, session))
  )
})

const handleQuickEntryClick = (id) => {
  persistHomeFeatureTab()
  if (id === 'schedule') { emit('navigate', 'schedule'); return }
  navigateFromHome(id)
}

// === 全部功能 Tab ===
const readStoredHomeFeatureTab = () => {
  try {
    return localStorage.getItem(HOME_FEATURE_TAB_KEY) || '教务服务'
  } catch (_e) {
    return '教务服务'
  }
}

const activeFeatureTab = ref(readStoredHomeFeatureTab())
const persistHomeFeatureTab = () => {
  try {
    localStorage.setItem(HOME_FEATURE_TAB_KEY, activeFeatureTab.value)
  } catch (_e) {
    // ignore storage failure
  }
}

// 空分组被滤掉后，若缓存 tab 指向「学习通/一码通」等，回落到首个可见分类
watch(
  moduleCategories,
  (cats) => {
    if (!cats.length) return
    if (!cats.some((c) => c.title === activeFeatureTab.value)) {
      activeFeatureTab.value = cats[0].title
      persistHomeFeatureTab()
    }
  },
  { immediate: true }
)
/** 宽屏感知（≥768px，查询串收口于 composables/useViewportBreakpoint）：驱动宫格扩列与通知交互模式 */
const isWideViewport = useViewportBreakpoint()
/** 所有功能宫格列数：窄屏 4 列（与 template grid-cols-4 一致），≥768 扩为 6 列（与 scoped css 同步） */
const FEATURE_GRID_COLS = 4
const featureGridCols = computed(() => (isWideViewport.value ? 6 : FEATURE_GRID_COLS))

/**
 * 各分类模块数不同会导致宫格高度骤变：
 * 滑到底后从「教务服务」切到「学习通」时内容变矮，滚动被夹断，页面上跳。
 * 用「最满分类」的行数锁定 min-height，切换时占位稳定。
 */
const featureGridMaxRows = computed(() => {
  const counts = moduleCategories.value.map((c) => (Array.isArray(c.modules) ? c.modules.length : 0))
  const maxCount = counts.length ? Math.max(...counts) : 1
  return Math.max(1, Math.ceil(maxCount / featureGridCols.value))
})

/** 单行约 74px（图标+间距+文案），行间距 gap-y-6=24px */
const featureGridMinHeightPx = computed(() => {
  const rows = featureGridMaxRows.value
  const rowBody = 74
  const rowGap = 24
  return rows * rowBody + Math.max(0, rows - 1) * rowGap
})

const featureGridStyle = computed(() => ({
  minHeight: `${featureGridMinHeightPx.value}px`
}))

const readHomeShellScrollTop = () => {
  try {
    const shell = typeof document !== 'undefined' ? document.querySelector('.app-shell') : null
    if (shell && typeof shell.scrollTop === 'number' && Number.isFinite(shell.scrollTop)) {
      return Math.max(0, shell.scrollTop)
    }
  } catch {
    // ignore
  }
  return null
}

const restoreHomeShellScrollTop = (top) => {
  if (top == null || !Number.isFinite(top)) return
  try {
    const shell = typeof document !== 'undefined' ? document.querySelector('.app-shell') : null
    if (!shell) return
    const maxTop = Math.max(0, (shell.scrollHeight || 0) - (shell.clientHeight || 0))
    shell.scrollTop = Math.min(Math.max(0, top), maxTop)
  } catch {
    // ignore
  }
}

const setActiveFeatureTab = (title) => {
  if (title === activeFeatureTab.value) {
    persistHomeFeatureTab()
    return
  }
  // 切换前记住滚动，避免高度变化时视口被浏览器夹断上跳
  const prevTop = readHomeShellScrollTop()
  activeFeatureTab.value = title
  persistHomeFeatureTab()
  nextTick(() => {
    restoreHomeShellScrollTop(prevTop)
    // 再等一帧，等 grid 完成布局
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => restoreHomeShellScrollTop(prevTop))
    }
  })
}
const navigateFromHome = (moduleId) => {
  persistHomeFeatureTab()
  navigateTo(moduleId)
}
const featureTabModules = computed(() => {
  const cat = moduleCategories.value.find(c => c.title === activeFeatureTab.value) || moduleCategories.value[0]
  return cat ? cat.modules : []
})

// 全部功能图标颜色映射
const featureIconColors = {
  grades: 'bg-blue-500', classroom: 'bg-orange-400', exams: 'bg-teal-500',
  ranking: 'bg-yellow-500', calendar: 'bg-blue-500', school_inbox: 'bg-indigo-500', academic: 'bg-green-500',
  qxzkb: 'bg-indigo-500', course_selection: 'bg-orange-500', training: 'bg-sky-400', teaching_eval: 'bg-purple-500',
  campus_code: 'bg-teal-600', electricity: 'bg-red-500', transactions: 'bg-pink-500',
  chaoxing_hub: 'bg-blue-600', chaoxing_inbox: 'bg-indigo-600', chaoxing_class: 'bg-sky-500',
  broadband: 'bg-cyan-600', sports_venue: 'bg-green-600',
  library: 'bg-emerald-600', campus_map: 'bg-teal-500', resource_share: 'bg-blue-500',
  towergo: 'bg-emerald-500',
  ai: 'bg-gray-400'
}

const featureIcons = {
  grades: 'fa-graduation-cap', classroom: 'fa-door-open', exams: 'fa-calendar-check',
  ranking: 'fa-chart-bar', calendar: 'fa-calendar-alt', school_inbox: 'fa-envelope', academic: 'fa-chart-line',
  qxzkb: 'fa-table', course_selection: 'fa-tasks', training: 'fa-sitemap', teaching_eval: 'fa-star',
  campus_code: 'fa-qrcode', electricity: 'fa-bolt', transactions: 'fa-wallet',
  chaoxing_hub: 'fa-graduation-cap', chaoxing_inbox: 'fa-inbox', chaoxing_class: 'fa-folder-open',
  broadband: 'fa-wifi', sports_venue: 'fa-futbol',
  library: 'fa-book', campus_map: 'fa-map-marked-alt', resource_share: 'fa-cloud',
  towergo: 'fa-bicycle',
  ai: 'fa-robot'
}

// === 通知相关（保留原有逻辑） ===
const noticeItems = computed(() => [...props.noticeList])
const allNotices = computed(() => {
  const map = new Map()
  ;[...props.tickerNotices, ...props.pinnedNotices, ...noticeItems.value].forEach((item) => {
    if (!item) return
    const key = item.id || item.title
    if (key && !map.has(key)) map.set(key, item)
  })
  return [...map.values()]
})
const marqueeItems = computed(() => {
  if (!allNotices.value.length) return []
  return allNotices.value.length > 1 ? [...allNotices.value, ...allNotices.value, ...allNotices.value] : allNotices.value
})
const tickerItemsStyle = computed(() => ({ transform: `translate3d(${tickerTranslateX.value}px, 0, 0)`, transitionDuration: `${tickerTransitionMs.value}ms` }))
const getTickerBaseCount = () => { const count = Number(allNotices.value.length || 0); return Number.isFinite(count) && count > 0 ? count : 0 }
const normalizeTickerTranslate = (value) => {
  const loopWidth = Number(tickerLoopWidth.value || 0)
  if (loopWidth <= 0) return 0
  const baseCount = getTickerBaseCount()
  if (baseCount <= 1) return 0
  const min = -loopWidth * 2
  const max = -loopWidth
  let x = Number(value || 0)
  while (x <= min) x += loopWidth
  while (x > max) x -= loopWidth
  return x
}
const refreshTickerMetrics = async () => {
  await nextTick()
  const baseCount = getTickerBaseCount()
  const el = tickerItemsRef.value
  if (!el || baseCount <= 0) { tickerLoopWidth.value = 0; tickerStepWidth.value = 236; tickerTranslateX.value = 0; return }
  const prevLoopWidth = Number(tickerLoopWidth.value || 0)
  const firstItem = el.querySelector('.ticker-item')
  const gap = Number.parseFloat(window.getComputedStyle(el).gap || '20') || 20
  const width = firstItem?.getBoundingClientRect?.().width || 216
  tickerStepWidth.value = Math.max(140, width + gap)
  tickerLoopWidth.value = baseCount > 1 ? baseCount * tickerStepWidth.value : 0
  if (baseCount <= 1) { tickerTranslateX.value = 0; return }
  if (prevLoopWidth <= 0) { tickerTranslateX.value = -tickerLoopWidth.value; return }
  tickerTranslateX.value = normalizeTickerTranslate(tickerTranslateX.value)
}
const pauseTickerForSwipe = () => { if (!isMobileNoticeSwipe.value || getTickerBaseCount() <= 1) return; if (tickerResumeTimer) { window.clearTimeout(tickerResumeTimer); tickerResumeTimer = null }; isTickerInteracting.value = true }
const resumeTickerAfterSwipe = () => { if (!isMobileNoticeSwipe.value || getTickerBaseCount() <= 1) return; if (tickerResumeTimer) window.clearTimeout(tickerResumeTimer); tickerResumeTimer = window.setTimeout(() => { isTickerInteracting.value = false; tickerResumeTimer = null }, 600) }
const onTickerTouchStart = (event) => { if (!isMobileNoticeSwipe.value || getTickerBaseCount() <= 1) return; pauseTickerForSwipe(); tickerDragActive = true; tickerTransitionMs.value = 0; tickerDragStartX = event.touches?.[0]?.clientX || 0; tickerDragLastX = tickerDragStartX; tickerDragStartTranslate = tickerTranslateX.value; tickerDragStartAt = Date.now() }
const onTickerTouchMove = (event) => { if (!tickerDragActive) return; const currentX = event.touches?.[0]?.clientX || tickerDragLastX; tickerDragLastX = currentX; const deltaX = currentX - tickerDragStartX; const raw = tickerDragStartTranslate + deltaX; const normalized = normalizeTickerTranslate(raw); const wrapDelta = normalized - raw; if (Math.abs(wrapDelta) > 1) tickerDragStartTranslate += wrapDelta; tickerTranslateX.value = normalized }
const onTickerTouchEnd = () => {
  if (!tickerDragActive) return; tickerDragActive = false
  const deltaX = tickerDragLastX - tickerDragStartX; const durationMs = Math.max(1, Date.now() - tickerDragStartAt); const distance = Math.abs(deltaX); const velocity = distance / durationMs
  let target = tickerTranslateX.value
  if (distance >= 8) { const inertiaOffset = Math.sign(deltaX || -1) * Math.min(260, distance * 0.36 + velocity * 190); target = tickerTranslateX.value + inertiaOffset }
  const loopWidth = Number(tickerLoopWidth.value || 0)
  if (loopWidth > 0) { const min = -loopWidth * 2 + 1; const max = -loopWidth; target = Math.max(min, Math.min(max, target)) }
  const transMs = Math.min(460, Math.max(220, Math.round(180 + velocity * 260)))
  tickerTransitionMs.value = transMs; tickerTranslateX.value = target
  if (Math.abs(deltaX) > 10) tickerSuppressClickUntil.value = Date.now() + 240
  window.setTimeout(() => { tickerTransitionMs.value = 0; tickerTranslateX.value = normalizeTickerTranslate(tickerTranslateX.value) }, transMs + 20)
  resumeTickerAfterSwipe()
}
const startTickerLoop = () => {
  if (tickerRafId) return; tickerLastFrameTs = 0
  const tick = (ts) => { if (!tickerLastFrameTs) tickerLastFrameTs = ts; const dt = ts - tickerLastFrameTs; tickerLastFrameTs = ts; const canAutoMove = getTickerBaseCount() > 1 && !isTickerInteracting.value && !tickerDragActive && tickerTransitionMs.value === 0; if (canAutoMove) { const next = tickerTranslateX.value - (TICKER_AUTO_SPEED * dt) / 1000; tickerTranslateX.value = normalizeTickerTranslate(next) }; tickerRafId = window.requestAnimationFrame(tick) }
  tickerRafId = window.requestAnimationFrame(tick)
}
const stopTickerLoop = () => { if (!tickerRafId) return; window.cancelAnimationFrame(tickerRafId); tickerRafId = 0; tickerLastFrameTs = 0 }
const updateNoticeSwipeMode = (force = false) => { if (typeof window === 'undefined') return; const width = Math.max(0, Number(window.innerWidth || 0)); const mobile = !isWideViewport.value; const modeChanged = isMobileNoticeSwipe.value !== mobile; const widthDelta = Math.abs(width - lastNoticeViewportWidth); isMobileNoticeSwipe.value = mobile; lastNoticeViewportWidth = width; if (force || modeChanged || widthDelta >= 24) void refreshTickerMetrics() }
const handleNoticeResize = () => { if (noticeResizeRaf) return; noticeResizeRaf = window.requestAnimationFrame(() => { noticeResizeRaf = 0; updateNoticeSwipeMode(false) }) }
const noticeSummary = (notice) => notice?.summary || stripMarkdown(notice?.content || '') || '点击查看详情'
const hasBrokenImage = (notice) => { const key = notice?.id || notice?.title; return key ? brokenImages.value.has(key) : false }
const handleImageError = (notice) => { const key = notice?.id || notice?.title; if (!key) return; const next = new Set(brokenImages.value); next.add(key); brokenImages.value = next }
const openNotice = (notice) => { if (Date.now() < tickerSuppressClickUntil.value) return; emit('open-notice', notice) }

// 首页搜索聚合服务、今日课程与公告，点击结果仍复用现有导航事件。
const showHomeSearch = ref(false)
const homeSearchQuery = ref('')
const homeSearchInputRef = ref(null)
const homeSearchHasQuery = computed(() => homeSearchQuery.value.trim().length > 0)
const homeSearchSections = computed(() =>
  buildHomeSearchSections({
    query: homeSearchQuery.value,
    modules: modules.value,
    courses: homeSearchCourses.value,
    notices: allNotices.value.map((notice) => ({
      ...notice,
      summary: noticeSummary(notice)
    }))
  })
)
const homeSearchSuggestions = computed(() =>
  quickEntryItems.value.map((item) => ({
    type: 'service',
    id: item.id,
    title: item.name,
    subtitle: item.id === 'schedule' ? '本周课表与课程安排' : '常用服务',
    target: item.id,
    iconClass: item.icon,
    colorClass: item.color,
    iconColor: item.iconColor
  }))
)

const openHomeSearch = async () => {
  showHomeSearch.value = true
  await nextTick()
  homeSearchInputRef.value?.focus?.()
}

const closeHomeSearch = () => {
  showHomeSearch.value = false
  homeSearchQuery.value = ''
}

const clearHomeSearchQuery = async () => {
  homeSearchQuery.value = ''
  await nextTick()
  homeSearchInputRef.value?.focus?.()
}

const getHomeSearchItemIcon = (item) => {
  if (item?.type === 'course') return 'fa-calendar-day'
  if (item?.type === 'notice') return 'fa-bullhorn'
  const id = item?.target || item?.id
  return item?.iconClass || featureIcons[id] || quickEntryMeta[id]?.icon || 'fa-cube'
}

const getHomeSearchIconClass = (item) => {
  if (item?.type === 'course') return 'bg-blue-50 text-blue-500'
  if (item?.type === 'notice') return 'bg-amber-50 text-amber-500'
  const id = item?.target || item?.id
  const meta = quickEntryMeta[id]
  return [item?.colorClass || meta?.color || 'bg-gray-50', item?.iconColor || meta?.iconColor || 'text-gray-500']
}

const selectHomeSearchItem = (item) => {
  if (!item) return
  const target = item.target || item.id
  closeHomeSearch()
  if (item.type === 'notice') {
    emit('open-notice', item.raw)
    return
  }
  if (target === 'schedule') {
    emit('navigate', 'schedule')
    return
  }
  navigateTo(target)
}

const selectFirstHomeSearchItem = () => {
  const firstResult = homeSearchSections.value[0]?.items?.[0]
  const firstSuggestion = homeSearchSuggestions.value[0]
  selectHomeSearchItem(firstResult || firstSuggestion)
}

const handleHomeSearchKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeHomeSearch()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    selectFirstHomeSearchItem()
  }
}

const currentAnnouncementIndex = ref(0)
let announcementTimer = null
const startAnnouncementRotation = () => { stopAnnouncementRotation(); if (marqueeItems.value.length <= 1) return; announcementTimer = setInterval(() => { currentAnnouncementIndex.value = (currentAnnouncementIndex.value + 1) % Math.min(marqueeItems.value.length, 5) }, 3000) }
const stopAnnouncementRotation = () => { if (announcementTimer) { clearInterval(announcementTimer); announcementTimer = null } }
const shareLink = computed(() => 'https://hbut.6661111.xyz')
const copyShareLink = async () => { if (shareLink.value) { await navigator.clipboard.writeText(shareLink.value); showToast('链接已复制！', 'success') } }
const getRandomGradient = (idx) => { const gradients = ['linear-gradient(135deg, #f6d365 0%, #fda085 100%)', 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)', 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)']; return gradients[idx % gradients.length] }
const handleContentClick = async (e) => { const target = e.target.closest('a'); if (target && target.href) { e.preventDefault(); await openExternal(target.href) } }
const attachCardSpotlight = () => { const cards = document.querySelectorAll('.module-card'); cards.forEach((card) => { const handleMove = (event) => { const rect = card.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; card.style.setProperty('--hover-x', `${x}px`); card.style.setProperty('--hover-y', `${y}px`) }; card.addEventListener('mousemove', handleMove); cardListeners.push({ card, handleMove }) }) }
const detachCardSpotlight = () => { cardListeners.forEach(({ card, handleMove }) => { card.removeEventListener('mousemove', handleMove) }); cardListeners.length = 0 }

onMounted(() => {
  refreshLoginMethod()
  loadQuickEntries()
  fetchWeather()
  updateNoticeSwipeMode(true)
  void refreshTickerMetrics()
  startTickerLoop()
  attachCardSpotlight()
  syncNowTick()
  clockTimer = window.setInterval(() => { syncNowTick() }, CLOCK_TICK_MS)
  window.addEventListener('resize', handleNoticeResize)
  window.addEventListener('focus', syncNowTick)
  document.addEventListener('visibilitychange', handleVisibilityRefresh)
})

onBeforeUnmount(() => {
  detachCardSpotlight()
  stopTickerLoop()
  stopAnnouncementRotation()
  clearHomeLayoutLongPress()
  stopHomeLayoutDrag()
  stopHomeCollisionFxLoop()
  if (clockTimer) { window.clearInterval(clockTimer); clockTimer = null }
  if (tickerResumeTimer) { window.clearTimeout(tickerResumeTimer); tickerResumeTimer = null }
  window.removeEventListener('resize', handleNoticeResize)
  if (noticeResizeRaf) { window.cancelAnimationFrame(noticeResizeRaf); noticeResizeRaf = 0 }
  window.removeEventListener('focus', syncNowTick)
  document.removeEventListener('visibilitychange', handleVisibilityRefresh)
})

watch(() => marqueeItems.value.length, () => { tickerTransitionMs.value = 0; tickerTranslateX.value = 0; void refreshTickerMetrics() }, { immediate: true })
watch(() => marqueeItems.value.length, (len) => { if (len > 0) startAnnouncementRotation(); else stopAnnouncementRotation() }, { immediate: true })
watch(() => [props.studentId, props.isLoggedIn], () => { refreshLoginMethod(); nowTick.value = Date.now(); fetchTodayCourses() }, { immediate: true })
watch(() => [uiSettings.workspaceLayout.home.widgetsOrder.join('|'), uiSettings.workspaceLayout.home.moduleOrder.join('|')], () => { if (!isHomeLayoutEditing.value) syncHomeLayoutDraft() }, { immediate: true })
</script>

<template src="../templates/views/Dashboard.html"></template>

<style src="../styles/views/Dashboard.scoped.css" scoped></style>
