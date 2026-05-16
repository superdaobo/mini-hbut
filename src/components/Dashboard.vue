<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import axios from 'axios'
import { fetchWithCache, getCachedData, setCachedData } from '../utils/api'
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

const props = defineProps({
  studentId: { type: String, default: '' },
  userUuid: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  jwxtMaintenance: { type: Boolean, default: false },
  jwxtMaintenanceHint: { type: String, default: '' },
  jwxtLastCheckTime: { type: String, default: '' },
  tickerNotices: { type: Array, default: () => [] },
  pinnedNotices: { type: Array, default: () => [] },
  noticeList: { type: Array, default: () => [] }
})

const emit = defineEmits(['navigate', 'logout', 'require-login', 'open-notice', 'openSettings'])

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
  'grades',
  'classroom',
  'exams',
  'ranking',
  'calendar',
  'academic',
  'qxzkb',
  'course_selection',
  'training',
  'library',
  'campus_map',
  'resource_share'
])
const loginMethod = ref('')
const isChaoxingMethod = (value) => String(value || '').trim().startsWith('chaoxing')
const HOME_LAYOUT_LONG_PRESS_MS = 380
const HOME_LAYOUT_LONG_PRESS_DISTANCE = 14

const refreshLoginMethod = () => {
  loginMethod.value = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
}

const todayCourses = ref([])
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
  // 结束时间采用右开区间：到达结束时刻即视为该课程结束，自动切换下一节。
  return todayCourses.value
    .filter((course) => course.endMinutes > currentMinutePrecise.value)
})

const todayBlockTitle = computed(() => {
  if (!props.isLoggedIn) return '今日课程'
  if (timelineCourses.value.length === 0) return '今日课程'
  const first = timelineCourses.value[0]
  if (
    first.startMinutes <= currentMinutePrecise.value &&
    currentMinutePrecise.value < first.endMinutes
  ) {
    return '正在进行'
  }
  return '即将开始'
})

const syncNowTick = () => {
  nowTick.value = Date.now()
}

const handleVisibilityRefresh = () => {
  if (document.visibilityState === 'visible') {
    syncNowTick()
  }
}

const getTodayWeekday = () => {
  const day = new Date(nowTick.value).getDay()
  return day === 0 ? 7 : day
}

const getCurrentWeek = (metaWeek) => {
  if (Number(metaWeek) > 0) return Number(metaWeek)
  try {
    const cachedMeta = localStorage.getItem('hbu_schedule_meta')
    if (!cachedMeta) return 1
    const parsed = JSON.parse(cachedMeta)
    const week = Number(parsed?.current_week || 1)
    return week > 0 ? week : 1
  } catch (e) {
    return 1
  }
}

const getPreferredScheduleSemester = () => {
  const lockDetail = readScheduleLockDetail(props.studentId)
  const lockedSemester = String(lockDetail?.semester || '').trim()
  if (lockedSemester) {
    return {
      semester: lockedSemester,
      source: 'lock',
      reason: String(lockDetail?.reason || '').trim()
    }
  }
  try {
    const cachedMeta = localStorage.getItem('hbu_schedule_meta')
    if (!cachedMeta) return { semester: '', source: 'none', reason: '' }
    const parsed = JSON.parse(cachedMeta)
    return {
      semester: String(parsed?.semester || '').trim(),
      source: 'meta',
      reason: ''
    }
  } catch (e) {
    return { semester: '', source: 'none', reason: '' }
  }
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
  return weeks
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
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
    const res = await axios.post(`${API_BASE}/v2/schedule/custom/list`, {
      student_id: sid,
      semester: sem
    })
    if (!res.data?.success) return []
    const list = Array.isArray(res.data?.data) ? res.data.data : []
    return list.filter((course) => {
      const weekday = toPositiveInt(course?.weekday, 0)
      const hasName = !!String(course?.name || '').trim()
      const range = getCoursePeriodRange(course)
      return hasName && weekday >= 1 && weekday <= 7 && !!range
    })
  } catch (_error) {
    return []
  }
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
      return {
        ...course,
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
        room: course?.room_code || course?.room || '-',
        teacher: course?.teacher || '-'
      }
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
      // 与课表页一致：同签名多条（后端按节拆分）时按单节处理，避免结束时间被错误拉长。
      const unitSpan = course.is_custom ? rawSpan : (duplicateCount > 1 ? 1 : rawSpan)
      const endPeriod = Math.min(11, course.startPeriod + unitSpan - 1)
      return {
        ...course,
        signature,
        rawSpan,
        unitSpan,
        endPeriod
      }
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
      if (
        current.unitSpan === 1 &&
        next.unitSpan === 1 &&
        next.signature === current.signature &&
        next.startPeriod === endPeriod + 1
      ) {
        endPeriod = next.endPeriod
        nextIndex += 1
      } else {
        break
      }
    }

    const startText = periodTimeMap[startPeriod]?.start || '--:--'
    const endText = periodTimeMap[endPeriod]?.end || '--:--'
    merged.push({
      key: `${current.name}-${teacher}-${startPeriod}-${endPeriod}-${room}`,
      name: current.name,
      teacher,
      room,
      start: startText,
      end: endText,
      startMinutes: toMinutes(startText),
      endMinutes: toMinutes(endText)
    })
    index = nextIndex
  }
  return merged
}

const fetchTodayCourses = async () => {
  if (!props.isLoggedIn || !props.studentId) {
    todayCourses.value = []
    todayError.value = ''
    return
  }
  todayLoading.value = true
  todayError.value = ''
  try {
    const preferredInfo = getPreferredScheduleSemester()
    const preferredSemester = String(preferredInfo?.semester || '').trim()
    const sid = String(props.studentId || '').trim()
    let customCourses = []
    const cacheKey = buildScheduleCacheKey(props.studentId, preferredSemester)
    const cached = getCachedData(cacheKey)
    let payload = cached?.data
    if (!payload?.success) {
      const res = await fetchWithCache(cacheKey, async () => {
        const rsp = await axios.post(`${API_BASE}/v2/schedule/query`, {
          student_id: props.studentId,
          semester: preferredSemester || undefined
        })
        return rsp.data
      })
      payload = res?.data
    }

    const shouldForceOnlineRetry =
      !!payload?.success &&
      !!payload?.offline &&
      isVacationPreviousMeta(payload?.meta)

    if (shouldForceOnlineRetry && sid) {
      try {
        const onlineRes = await axios.post(`${API_BASE}/v2/schedule/query`, {
          student_id: sid,
          semester: undefined
        })
        const onlinePayload = onlineRes?.data
        if (onlinePayload?.success && !onlinePayload?.offline) {
          payload = onlinePayload
          const onlineSemester = String(onlinePayload?.meta?.semester || '').trim()
          if (onlineSemester) {
            setCachedData(`schedule:${sid}:${onlineSemester}`, onlinePayload)
          }
          setCachedData(`schedule:${sid}`, onlinePayload)
        }
      } catch (_error) {
        // keep stale payload as fallback
      }
    }

    const semesterForCustom = String(payload?.meta?.semester || preferredSemester || '').trim()
    customCourses = await fetchCustomCoursesForToday(semesterForCustom)

    if (!payload?.success) {
      if (customCourses.length > 0) {
        const week = getCurrentWeek()
        todayCourses.value = buildTodayCourses(customCourses, week)
        todayError.value = ''
      } else {
        todayCourses.value = []
        todayError.value = payload?.error || '今日课程加载失败'
      }
      return
    }

    if (payload?.meta) {
      const nextWeek = Number(payload.meta.current_week || 0)
      const persistedWeek = nextWeek > 0 ? nextWeek : getCurrentWeek()
      localStorage.setItem('hbu_schedule_meta', JSON.stringify({
        semester: payload.meta.semester || preferredSemester || '',
        start_date: payload.meta.start_date || '',
        current_week: persistedWeek
      }))
    }

    const week = getCurrentWeek(payload?.meta?.current_week)
    const remoteCourses = Array.isArray(payload?.data) ? payload.data : []
    todayCourses.value = buildTodayCourses([...remoteCourses, ...customCourses], week)
    todayError.value = ''
  } catch (error) {
    todayCourses.value = []
    todayError.value = '今日课程加载失败'
  } finally {
    todayLoading.value = false
  }
}

// 模块列表
const baseModules = [
  { 
    id: 'grades', 
    name: '成绩查询', 
    iconKey: 'grades',
    color: '#667eea',
    desc: '查看所有学期成绩',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'classroom', 
    name: '空教室', 
    iconKey: 'classroom',
    color: '#ed8936',
    desc: '查询空闲教室',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'electricity', 
    name: '电费查询', 
    iconKey: 'electricity',
    color: '#e53e3e',
    desc: '宿舍电费余额',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'transactions', 
    name: '交易记录', 
    iconKey: 'transactions',
    color: '#F56C6C',
    desc: '一码通消费记录',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'exams', 
    name: '考试安排', 
    iconKey: 'exams',
    color: '#38b2ac',
    desc: '查询考试时间地点',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'ranking', 
    name: '绩点排名', 
    iconKey: 'ranking',
    color: '#f6ad55',
    desc: '专业班级排名',
    available: true,
    requiresLogin: true
  },
  {
    id: 'campus_code',
    name: '校园码',
    iconKey: 'campus_code',
    color: '#0f766e',
    desc: '在线/高能模式二维码',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'calendar', 
    name: '校历', 
    iconKey: 'calendar',
    color: '#3b82f6',
    desc: '查看学期校历',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'academic', 
    name: '学业情况', 
    iconKey: 'academic',
    color: '#10b981',
    desc: '学业完成度与课程进度',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'qxzkb', 
    name: '全校课表', 
    iconKey: 'qxzkb',
    color: '#6366f1',
    desc: '查询全校课程与排课',
    available: true,
    requiresLogin: true
  },
  {
    id: 'course_selection',
    name: '选课中心',
    iconKey: 'course_selection',
    color: '#f59e0b',
    desc: '通识选课与退课',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'training', 
    name: '培养方案', 
    iconKey: 'training',
    color: '#0ea5e9',
    desc: '培养方案与课程设置',
    available: true,
    requiresLogin: true
  },
  {
    id: 'library',
    name: '图书查询',
    iconKey: 'library',
    color: '#0f766e',
    desc: '馆藏检索与定位',
    available: true,
    requiresLogin: false
  },
  {
    id: 'campus_map',
    name: '校园地图',
    iconKey: 'campus_map',
    color: '#14b8a6',
    desc: '校园地图查看',
    available: true,
    requiresLogin: false
  },
  {
    id: 'resource_share',
    name: '资料分享',
    iconKey: 'resource_share',
    color: '#0ea5e9',
    desc: 'WebDAV 资料浏览与下载',
    available: true,
    requiresLogin: false
  },
  { 
    id: 'ai', 
    name: '校园助手', 
    iconKey: 'ai',
    color: '#94a3b8',
    desc: '暂不可用',
    available: true,
    requiresLogin: true
  }
]

const modules = computed(() => {
  if (!isChaoxingMethod(loginMethod.value)) return baseModules
  return baseModules.filter((mod) => JWXT_MODULE_ALLOWLIST.has(mod.id))
})
const homeWorkspaceRef = ref(null)
const isHomeLayoutEditing = ref(false)
const showAllModules = ref(false)
const draftHomeWidgetsOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).home.widgetsOrder])
const draftHomeModuleOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).home.moduleOrder])
const activeHomeDragSection = ref('')
const hoverLayoutKey = ref('')
const orderedModules = computed(() => {
  const currentOrder = isHomeLayoutEditing.value
    ? draftHomeModuleOrder.value
    : uiSettings.workspaceLayout.home.moduleOrder
  const moduleMap = new Map(modules.value.map((item) => [item.id, item]))
  return currentOrder
    .map((key) => moduleMap.get(key))
    .filter(Boolean)
})
const displayModules = computed(() => {
  const first7 = orderedModules.value.slice(0, 7)
  return [...first7, { id: '__more__', name: '更多', iconKey: 'more', color: '#6b7280', available: true, requiresLogin: false }]
})
const homeWidgetOrder = computed(() =>
  isHomeLayoutEditing.value ? draftHomeWidgetsOrder.value : uiSettings.workspaceLayout.home.widgetsOrder
)
const isChaoxingLogin = computed(() => isChaoxingMethod(loginMethod.value))
const homeCollisionFx = ref([])

const moduleCategories = computed(() => [
  {
    title: '教务服务',
    modules: modules.value.filter(m => 
      ['grades', 'exams', 'ranking', 'academic', 'qxzkb', 'course_selection', 'training', 'classroom', 'calendar'].includes(m.id)
    )
  },
  {
    title: '一码通',
    modules: modules.value.filter(m => 
      ['campus_code', 'electricity', 'transactions'].includes(m.id)
    )
  },
  {
    title: '资源',
    modules: modules.value.filter(m => 
      ['library', 'campus_map', 'resource_share', 'ai'].includes(m.id)
    )
  }
])

const handleCategoryModuleClick = (moduleId) => {
  showAllModules.value = false
  navigateTo(moduleId)
}

let homeLayoutLongPressTimer = null
let homeLayoutPointerStart = { x: 0, y: 0 }
let suppressModuleClickUntil = 0
let homeDragAnchors = []
let homeDragTargetIndex = -1
let homeCollisionFxRaf = 0
let homeCollisionFxLastTs = 0

const navigateTo = (moduleId) => {
  const module = modules.value.find((m) => m.id === moduleId)
  if (module?.requiresLogin && !props.isLoggedIn) {
    emit('require-login')
    return
  }
  emit('navigate', moduleId)
}

const syncHomeLayoutDraft = () => {
  const snapshot = cloneWorkspaceLayout(uiSettings.workspaceLayout)
  draftHomeWidgetsOrder.value = [...snapshot.home.widgetsOrder]
  draftHomeModuleOrder.value = [...snapshot.home.moduleOrder]
}

const getModuleCardStyle = (module) => {
  return {
    '--accent-color': module.color
  }
}

const getHomeCollisionPalette = (section, activeKey, targetKey = '') => {
  if (section === 'modules') {
    const moduleMap = new Map(modules.value.map((item) => [item.id, item]))
    return resolveCollisionPalette(
      moduleMap.get(activeKey)?.color,
      moduleMap.get(targetKey)?.color,
      '#8fd6ff'
    )
  }
  const widgetPalette = {
    module_grid: ['#5b8cff', '#7c3aed', '#c4b5fd'],
    today_panel: ['#22c55e', '#38bdf8', '#bef264']
  }
  return resolveCollisionPalette(widgetPalette[activeKey], widgetPalette[targetKey], '#8fd6ff')
}

const stopHomeCollisionFxLoop = () => {
  if (homeCollisionFxRaf) {
    cancelAnimationFrame(homeCollisionFxRaf)
    homeCollisionFxRaf = 0
  }
  homeCollisionFxLastTs = 0
}

const tickHomeCollisionFx = (timestamp) => {
  const previousTs = homeCollisionFxLastTs || timestamp
  homeCollisionFxLastTs = timestamp
  homeCollisionFx.value = advanceLayoutCollisionFx(homeCollisionFx.value, timestamp - previousTs)
  if (homeCollisionFx.value.length === 0) {
    stopHomeCollisionFxLoop()
    return
  }
  homeCollisionFxRaf = requestAnimationFrame(tickHomeCollisionFx)
}

const ensureHomeCollisionFxLoop = () => {
  if (homeCollisionFxRaf) return
  homeCollisionFxLastTs = performance.now()
  homeCollisionFxRaf = requestAnimationFrame(tickHomeCollisionFx)
}

const spawnHomeCollisionFx = (section, activeKey, target) => {
  const root = homeWorkspaceRef.value
  const rootRect = root?.getBoundingClientRect?.()
  if (!rootRect || !target?.rect) return
  const sourceRect = homeDragAnchors.find((item) => item.id === activeKey)?.rect || null
  const origin = resolveRelativeCollisionPoint({
    rootRect,
    sourceRect,
    targetRect: target.rect
  })
  const burst = createLayoutCollisionBurst({
    x: origin.x,
    y: origin.y,
    colors: getHomeCollisionPalette(section, activeKey, target.id)
  })
  homeCollisionFx.value = [...homeCollisionFx.value.slice(-48), ...burst]
  ensureHomeCollisionFxLoop()
}

const stopHomeLayoutDrag = () => {
  activeHomeDragSection.value = ''
  hoverLayoutKey.value = ''
  homeDragAnchors = []
  homeDragTargetIndex = -1
}

const enterHomeLayoutEdit = () => {
  if (!isHomeLayoutEditing.value) {
    syncHomeLayoutDraft()
    isHomeLayoutEditing.value = true
    suppressModuleClickUntil = Date.now() + 180
  }
}

const cancelHomeLayoutEdit = () => {
  stopHomeLayoutDrag()
  syncHomeLayoutDraft()
  isHomeLayoutEditing.value = false
}

const resetHomeLayoutEdit = () => {
  const defaults = buildDefaultWorkspaceLayout()
  draftHomeWidgetsOrder.value = [...defaults.home.widgetsOrder]
  draftHomeModuleOrder.value = [...defaults.home.moduleOrder]
  showToast('首页布局已恢复默认。', 'success')
}

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
  const activeSection = String(section || '')
  const activeId = String(id || '')
  activeHomeDragSection.value = activeSection
  hoverLayoutKey.value = activeId
  homeDragAnchors = captureLayoutSlotAnchors(homeWorkspaceRef.value, activeSection)
  homeDragTargetIndex = homeDragAnchors.find((item) => item.id === activeId)?.index ?? -1
}

const reorderDraftHomeLayout = (section, activeKey, targetIndex) => {
  if (!activeKey || !Number.isFinite(Number(targetIndex))) return
  if (section === 'widgets') {
    draftHomeWidgetsOrder.value = moveLayoutItemToIndex(draftHomeWidgetsOrder.value, activeKey, targetIndex)
    return
  }
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

const clearHomeLayoutLongPress = () => {
  if (homeLayoutLongPressTimer) {
    window.clearTimeout(homeLayoutLongPressTimer)
    homeLayoutLongPressTimer = null
  }
}

const isTouchPointerEvent = (event) => String(event?.pointerType || '').toLowerCase() === 'touch'

const handleHomeLayoutPressStart = (event) => {
  if (isHomeLayoutEditing.value) return
  if (!isTouchPointerEvent(event)) return
  clearHomeLayoutLongPress()
  homeLayoutPointerStart = {
    x: Number(event.clientX || 0),
    y: Number(event.clientY || 0)
  }
  homeLayoutLongPressTimer = window.setTimeout(() => {
    suppressModuleClickUntil = Date.now() + 420
    enterHomeLayoutEdit()
    clearHomeLayoutLongPress()
  }, HOME_LAYOUT_LONG_PRESS_MS)
}

const handleHomeLayoutPressMove = (event) => {
  if (!homeLayoutLongPressTimer || !isTouchPointerEvent(event)) return
  const deltaX = Math.abs(Number(event.clientX || 0) - homeLayoutPointerStart.x)
  const deltaY = Math.abs(Number(event.clientY || 0) - homeLayoutPointerStart.y)
  if (deltaX > HOME_LAYOUT_LONG_PRESS_DISTANCE || deltaY > HOME_LAYOUT_LONG_PRESS_DISTANCE) {
    clearHomeLayoutLongPress()
  }
}

const handleHomeLayoutPressEnd = () => {
  clearHomeLayoutLongPress()
}

const handleModuleCardClick = (moduleId) => {
  if (isHomeLayoutEditing.value) return
  if (Date.now() < suppressModuleClickUntil) return
  if (moduleId === '__more__') {
    showAllModules.value = true
    return
  }
  navigateTo(moduleId)
}

const handleProfileClick = () => {
  emit('navigate', 'me')
}

const noticeItems = computed(() => {
  return [...props.noticeList]
})

const allNotices = computed(() => {
  const map = new Map()
  ;[...props.tickerNotices, ...props.pinnedNotices, ...noticeItems.value].forEach((item) => {
    if (!item) return
    const key = item.id || item.title
    if (key && !map.has(key)) {
      map.set(key, item)
    }
  })
  return [...map.values()]
})

const marqueeItems = computed(() => {
  if (!allNotices.value.length) return []
  return allNotices.value.length > 1
    ? [...allNotices.value, ...allNotices.value, ...allNotices.value]
    : allNotices.value
})

const tickerItemsStyle = computed(() => ({
  transform: `translate3d(${tickerTranslateX.value}px, 0, 0)`,
  transitionDuration: `${tickerTransitionMs.value}ms`
}))

const getTickerBaseCount = () => {
  const count = Number(allNotices.value.length || 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

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
  if (!el || baseCount <= 0) {
    tickerLoopWidth.value = 0
    tickerStepWidth.value = 236
    tickerTranslateX.value = 0
    return
  }

  const prevLoopWidth = Number(tickerLoopWidth.value || 0)
  const firstItem = el.querySelector('.ticker-item')
  const gap = Number.parseFloat(window.getComputedStyle(el).gap || '20') || 20
  const width = firstItem?.getBoundingClientRect?.().width || 216
  tickerStepWidth.value = Math.max(140, width + gap)
  tickerLoopWidth.value = baseCount > 1 ? baseCount * tickerStepWidth.value : 0
  if (baseCount <= 1) {
    tickerTranslateX.value = 0
    return
  }
  if (prevLoopWidth <= 0) {
    tickerTranslateX.value = -tickerLoopWidth.value
    return
  }
  tickerTranslateX.value = normalizeTickerTranslate(tickerTranslateX.value)
}

const pauseTickerForSwipe = () => {
  if (!isMobileNoticeSwipe.value || getTickerBaseCount() <= 1) return
  if (tickerResumeTimer) {
    window.clearTimeout(tickerResumeTimer)
    tickerResumeTimer = null
  }
  isTickerInteracting.value = true
}

const resumeTickerAfterSwipe = () => {
  if (!isMobileNoticeSwipe.value || getTickerBaseCount() <= 1) return
  if (tickerResumeTimer) {
    window.clearTimeout(tickerResumeTimer)
  }
  tickerResumeTimer = window.setTimeout(() => {
    isTickerInteracting.value = false
    tickerResumeTimer = null
  }, 600)
}

const onTickerTouchStart = (event) => {
  if (!isMobileNoticeSwipe.value || getTickerBaseCount() <= 1) return
  pauseTickerForSwipe()
  tickerDragActive = true
  tickerTransitionMs.value = 0
  tickerDragStartX = event.touches?.[0]?.clientX || 0
  tickerDragLastX = tickerDragStartX
  tickerDragStartTranslate = tickerTranslateX.value
  tickerDragStartAt = Date.now()
}

const onTickerTouchMove = (event) => {
  if (!tickerDragActive) return
  const currentX = event.touches?.[0]?.clientX || tickerDragLastX
  tickerDragLastX = currentX
  const deltaX = currentX - tickerDragStartX
  const raw = tickerDragStartTranslate + deltaX
  const normalized = normalizeTickerTranslate(raw)
  // 拖拽时保持在循环范围内，避免松手后 normalize 产生大跨度动画
  const wrapDelta = normalized - raw
  if (Math.abs(wrapDelta) > 1) {
    tickerDragStartTranslate += wrapDelta
  }
  tickerTranslateX.value = normalized
}

const onTickerTouchEnd = () => {
  if (!tickerDragActive) return
  tickerDragActive = false
  const deltaX = tickerDragLastX - tickerDragStartX
  const durationMs = Math.max(1, Date.now() - tickerDragStartAt)
  const distance = Math.abs(deltaX)
  const velocity = distance / durationMs // px/ms
  let target = tickerTranslateX.value
  if (distance >= 8) {
    const inertiaOffset = Math.sign(deltaX || -1) * Math.min(260, distance * 0.36 + velocity * 190)
    target = tickerTranslateX.value + inertiaOffset
  }
  // 将目标限制在循环区间内，防止跨边界时 CSS 动画反向滚动
  const loopWidth = Number(tickerLoopWidth.value || 0)
  if (loopWidth > 0) {
    const min = -loopWidth * 2 + 1
    const max = -loopWidth
    target = Math.max(min, Math.min(max, target))
  }
  const transMs = Math.min(460, Math.max(220, Math.round(180 + velocity * 260)))
  tickerTransitionMs.value = transMs
  tickerTranslateX.value = target
  if (Math.abs(deltaX) > 10) {
    tickerSuppressClickUntil.value = Date.now() + 240
  }
  window.setTimeout(() => {
    tickerTransitionMs.value = 0
    // 动画结束后静默归位到标准区间
    tickerTranslateX.value = normalizeTickerTranslate(tickerTranslateX.value)
  }, transMs + 20)
  resumeTickerAfterSwipe()
}

const startTickerLoop = () => {
  if (tickerRafId) return
  tickerLastFrameTs = 0
  const tick = (ts) => {
    if (!tickerLastFrameTs) tickerLastFrameTs = ts
    const dt = ts - tickerLastFrameTs
    tickerLastFrameTs = ts
    const canAutoMove =
      getTickerBaseCount() > 1 &&
      !isTickerInteracting.value &&
      !tickerDragActive &&
      tickerTransitionMs.value === 0
    if (canAutoMove) {
      const next = tickerTranslateX.value - (TICKER_AUTO_SPEED * dt) / 1000
      tickerTranslateX.value = normalizeTickerTranslate(next)
    }
    tickerRafId = window.requestAnimationFrame(tick)
  }
  tickerRafId = window.requestAnimationFrame(tick)
}

const stopTickerLoop = () => {
  if (!tickerRafId) return
  window.cancelAnimationFrame(tickerRafId)
  tickerRafId = 0
  tickerLastFrameTs = 0
}

const updateNoticeSwipeMode = (force = false) => {
  if (typeof window === 'undefined') return
  const width = Math.max(0, Number(window.innerWidth || 0))
  const mobile = width <= 720
  const modeChanged = isMobileNoticeSwipe.value !== mobile
  const widthDelta = Math.abs(width - lastNoticeViewportWidth)
  isMobileNoticeSwipe.value = mobile
  lastNoticeViewportWidth = width
  if (force || modeChanged || widthDelta >= 24) {
    void refreshTickerMetrics()
  }
}

const handleNoticeResize = () => {
  if (noticeResizeRaf) return
  noticeResizeRaf = window.requestAnimationFrame(() => {
    noticeResizeRaf = 0
    updateNoticeSwipeMode(false)
  })
}

const noticeSummary = (notice) => {
  return notice?.summary || stripMarkdown(notice?.content || '') || '点击查看详情'
}

const hasBrokenImage = (notice) => {
  const key = notice?.id || notice?.title
  return key ? brokenImages.value.has(key) : false
}

const handleImageError = (notice) => {
  const key = notice?.id || notice?.title
  if (!key) return
  const next = new Set(brokenImages.value)
  next.add(key)
  brokenImages.value = next
}

const openNotice = (notice) => {
  if (Date.now() < tickerSuppressClickUntil.value) return
  emit('open-notice', notice)
}

// 公告轮播
const currentAnnouncementIndex = ref(0)
let announcementTimer = null

const startAnnouncementRotation = () => {
  stopAnnouncementRotation()
  if (marqueeItems.value.length <= 1) return
  announcementTimer = setInterval(() => {
    currentAnnouncementIndex.value = (currentAnnouncementIndex.value + 1) % Math.min(marqueeItems.value.length, 5)
  }, 3000)
}

const stopAnnouncementRotation = () => {
  if (announcementTimer) {
    clearInterval(announcementTimer)
    announcementTimer = null
  }
}

// 生成分享链接
const shareLink = computed(() => {
  return 'https://hbut.6661111.xyz'
})

const copyShareLink = async () => {
  if (shareLink.value) {
    await navigator.clipboard.writeText(shareLink.value)
    showToast('链接已复制！', 'success')
  }
}

const getRandomGradient = (idx) => {
  const gradients = [
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
  ]
  return gradients[idx % gradients.length]
}

const handleContentClick = async (e) => {
  const target = e.target.closest('a')
  if (target && target.href) {
    e.preventDefault()
    await openExternal(target.href)
  }
}

const attachCardSpotlight = () => {
  const cards = document.querySelectorAll('.module-card')
  cards.forEach((card) => {
    const handleMove = (event) => {
      const rect = card.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      card.style.setProperty('--hover-x', `${x}px`)
      card.style.setProperty('--hover-y', `${y}px`)
    }
    card.addEventListener('mousemove', handleMove)
    cardListeners.push({ card, handleMove })
  })
}

const detachCardSpotlight = () => {
  cardListeners.forEach(({ card, handleMove }) => {
    card.removeEventListener('mousemove', handleMove)
  })
  cardListeners.length = 0
}

onMounted(() => {
  refreshLoginMethod()
  updateNoticeSwipeMode(true)
  void refreshTickerMetrics()
  startTickerLoop()
  attachCardSpotlight()
  syncNowTick()
  clockTimer = window.setInterval(() => {
    syncNowTick()
  }, CLOCK_TICK_MS)
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
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
  if (tickerResumeTimer) {
    window.clearTimeout(tickerResumeTimer)
    tickerResumeTimer = null
  }
  window.removeEventListener('resize', handleNoticeResize)
  if (noticeResizeRaf) {
    window.cancelAnimationFrame(noticeResizeRaf)
    noticeResizeRaf = 0
  }
  window.removeEventListener('focus', syncNowTick)
  document.removeEventListener('visibilitychange', handleVisibilityRefresh)
})

watch(
  () => marqueeItems.value.length,
  () => {
    tickerTransitionMs.value = 0
    tickerTranslateX.value = 0
    void refreshTickerMetrics()
  },
  { immediate: true }
)

watch(
  () => marqueeItems.value.length,
  (len) => {
    if (len > 0) startAnnouncementRotation()
    else stopAnnouncementRotation()
  },
  { immediate: true }
)

watch(
  () => [props.studentId, props.isLoggedIn],
  () => {
    refreshLoginMethod()
    nowTick.value = Date.now()
    fetchTodayCourses()
  },
  { immediate: true }
)

watch(
  () => [
    uiSettings.workspaceLayout.home.widgetsOrder.join('|'),
    uiSettings.workspaceLayout.home.moduleOrder.join('|')
  ],
  () => {
    if (!isHomeLayoutEditing.value) {
      syncHomeLayoutDraft()
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="dashboard">
    <!-- 头部 -->
    <header class="dashboard-header">
      <div class="header-left">
        <img class="logo-img" src="/splash/app_icon.png" alt="HBUT" />
        <span class="header-title">HBUT 校园助手</span>
      </div>
      <span class="header-pill">首页</span>
    </header>

    <!-- 用户信息卡片 -->
    <section class="user-card">
      <div class="user-card-left" @click="handleProfileClick">
        <div class="user-avatar">
          <span class="material-symbols-rounded">person</span>
        </div>
        <div class="user-info-text">
          <span class="user-info-id">{{ studentId || '未登录' }}</span>
          <span class="user-info-school">湖北工业大学</span>
        </div>
      </div>
    </section>

    <!-- 维护提示 -->
    <section v-if="jwxtMaintenance" class="maintenance-banner">
      <div class="maintenance-title">教务系统正在维护</div>
      <div class="maintenance-text">
        {{ jwxtMaintenanceHint || '当前展示缓存数据，系统恢复后将自动同步。' }}
      </div>
      <div v-if="jwxtLastCheckTime" class="maintenance-meta">
        最近检测：{{ jwxtLastCheckTime }}
      </div>
    </section>

    <section v-if="isChaoxingLogin" class="maintenance-banner maintenance-banner--chaoxing">
      <div class="maintenance-title">学习通登录模式</div>
      <div class="maintenance-text">当前已开放教务模块 + 图书查询 + 校园地图 + 资料分享。</div>
    </section>

    <!-- 今日概览卡片 -->
    <section class="today-overview-card">
      <img src="/splash/campus_illustration.webp" alt="" class="overview-decor-img" />
      <div class="overview-content">
        <div class="overview-label">今日概览</div>
        <h2 class="overview-greeting">
          {{ currentMinute < 720 ? '上午好，同学！' : currentMinute < 840 ? '中午好，同学！' : currentMinute < 1080 ? '下午好，同学！' : '晚上好，同学！' }}
        </h2>
        <p class="overview-subtitle">愿你专注当下，<br/>不负在校时光。</p>
        <div class="overview-sub-grid">
          <div class="overview-sub-card">
            <div class="sub-card-header">
              <span class="sub-card-label">今日课程</span>
              <span class="material-symbols-rounded sub-card-icon">menu_book</span>
            </div>
            <div class="sub-card-value">{{ todayCourses.length }} <span class="sub-card-unit">节</span></div>
            <div class="sub-card-hint">{{ timelineCourses.length > 0 ? `还有 ${timelineCourses.length} 节即将开始` : '今日课程已结束' }}</div>
          </div>
          <div class="overview-sub-card">
            <div class="sub-card-header">
              <span class="sub-card-label">下一节课</span>
              <span v-if="timelineCourses.length > 0 && timelineCourses[0].startMinutes <= currentMinutePrecise" class="sub-card-badge sub-card-badge--green">进行中</span>
              <span v-else-if="timelineCourses.length > 0" class="sub-card-badge sub-card-badge--blue">即将开始</span>
              <span v-else class="sub-card-badge sub-card-badge--gray">无</span>
            </div>
            <div v-if="timelineCourses.length > 0" class="sub-card-course-name">{{ timelineCourses[0].name }}</div>
            <div v-else class="sub-card-course-name sub-card-course-name--empty">暂无课程</div>
            <div v-if="timelineCourses.length > 0" class="sub-card-hint">{{ timelineCourses[0].start }} · {{ timelineCourses[0].room }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 首页布局编辑工具栏 -->
    <div v-if="isHomeLayoutEditing" class="home-layout-toolbar">
      <strong>首页布局编辑</strong>
      <div class="home-layout-toolbar__actions">
        <button type="button" class="toolbar-btn ghost" @click="cancelHomeLayoutEdit">取消</button>
        <button type="button" class="toolbar-btn ghost" @click="resetHomeLayoutEdit">恢复默认</button>
        <button type="button" class="toolbar-btn primary" @click="saveHomeLayoutEdit">完成</button>
      </div>
    </div>

    <!-- 常用工具 + 今日课程 workspace -->
    <section
      ref="homeWorkspaceRef"
      class="home-workspace"
      :class="{ 'home-workspace--editing': isHomeLayoutEditing }"
      @pointerdown.passive="handleHomeLayoutPressStart"
      @pointermove.passive="handleHomeLayoutPressMove"
      @pointerup.passive="handleHomeLayoutPressEnd"
      @pointercancel.passive="handleHomeLayoutPressEnd"
      @pointerleave.passive="handleHomeLayoutPressEnd"
    >
      <LayoutCollisionFxLayer :items="homeCollisionFx" />

      <TransitionGroup name="workspace-stack" tag="div" class="home-workspace-stack">
        <SortableSurface
          v-for="widgetKey in homeWidgetOrder"
          :key="widgetKey"
          :id="widgetKey"
          group="home-widgets"
          section="widgets"
          :tag="widgetKey === 'module_grid' ? 'div' : 'section'"
          :editing="isHomeLayoutEditing"
          :surface-class="[
            'workspace-widget',
            widgetKey === 'module_grid' ? 'workspace-widget--modules widget-card' : 'workspace-widget--today widget-card'
          ]"
          @drag-start="handleHomeDragStart"
          @drag-move="handleHomeDragMove"
          @drag-end="stopHomeLayoutDrag"
        >
          <!-- 常用工具模块网格 -->
          <template v-if="widgetKey === 'module_grid'">
            <div class="widget-card-title">常用工具</div>
            <TransitionGroup name="workspace-module" tag="div" class="module-grid">
              <SortableSurface
                v-for="mod in displayModules"
                :key="mod.id"
                :id="mod.id"
                group="home-modules"
                section="modules"
                :editing="isHomeLayoutEditing"
                :surface-class="[
                  'module-card',
                  {
                    disabled: !mod.available,
                    'module-card--over': activeHomeDragSection === 'modules' && hoverLayoutKey === mod.id
                  }
                ]"
                :surface-style="getModuleCardStyle(mod)"
                @click="mod.available && handleModuleCardClick(mod.id)"
                @drag-start="handleHomeDragStart"
                @drag-move="handleHomeDragMove"
                @drag-end="stopHomeLayoutDrag"
              >
                <div class="module-card__inner">
                  <div
                    class="module-icon-square"
                    :class="{ 'module-icon-square--more': mod.id === '__more__' }"
                    :style="mod.id !== '__more__' ? { background: mod.color } : {}"
                    aria-hidden="true"
                  >
                    <ThemeModuleIcon :icon-key="mod.iconKey" :badge-size="24" :icon-size="24" />
                  </div>
                  <div class="module-name">{{ mod.name }}</div>
                </div>
                <div v-if="!mod.available" class="coming-soon">即将上线</div>
              </SortableSurface>
            </TransitionGroup>
          </template>

          <!-- 今日课程面板 -->
          <template v-else>
            <div class="today-panel-head">
              <h3 class="today-title">今日课程</h3>
              <button class="today-panel-link" @click="$emit('navigate', 'schedule')">全部课表 ›</button>
            </div>

            <div v-if="!isLoggedIn" class="today-empty">登录后可查看今日课程</div>
            <div v-else-if="todayLoading" class="today-empty">正在加载今日课程...</div>
            <div v-else-if="todayError" class="today-empty today-error">{{ todayError }}</div>
            <div v-else-if="timelineCourses.length === 0" class="today-empty today-empty--done">
              <img src="/splash/course_done_icon.webp" alt="" class="today-done-icon" />
              <div class="today-done-text">
                <span class="today-done-title">今日课程已结束</span>
                <span class="today-done-subtitle">好好休息，明天继续加油！</span>
              </div>
            </div>

            <div v-else class="today-timeline">
              <div v-for="course in timelineCourses" :key="course.key" class="today-item">
                <div class="today-item-time">{{ course.start }}</div>
                <div class="today-item-line">
                  <span class="today-item-dot"></span>
                </div>
                <div class="today-item-main">
                  <div class="today-item-name">{{ course.name }}</div>
                  <div class="today-item-meta today-item-meta--location">
                    <span class="today-meta-label">上课地点：</span>
                    <span class="today-room-pill">{{ course.room }}</span>
                  </div>
                  <div class="today-item-meta">授课教师：{{ course.teacher }}</div>
                </div>
              </div>
            </div>
          </template>
        </SortableSurface>
      </TransitionGroup>
    </section>

    <!-- 全部模块面板 -->
    <div v-if="showAllModules" class="all-modules-overlay" @click.self="showAllModules = false">
      <div class="all-modules-panel">
        <div class="all-modules-header">
          <h3>全部功能</h3>
          <button class="all-modules-close" @click="showAllModules = false">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        
        <div class="all-modules-category" v-for="cat in moduleCategories" :key="cat.title">
          <h4 class="category-title">{{ cat.title }}</h4>
          <div class="category-grid">
            <div 
              v-for="mod in cat.modules" 
              :key="mod.id" 
              class="category-module-card"
              :class="{ disabled: !mod.available }"
              @click="mod.available && handleCategoryModuleClick(mod.id)"
            >
              <div class="category-module-icon" :style="{ background: mod.color }">
                <ThemeModuleIcon :icon-key="mod.iconKey" :badge-size="40" :icon-size="22" />
              </div>
              <span class="category-module-name">{{ mod.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部导航栏由 App.vue 全局提供，此处不再重复 -->
  </div>
</template>

<style scoped>
/* === 页面基础 === */
.dashboard {
  min-height: 100vh;
  background: #f9f9ff;
  padding: 20px 16px 80px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

/* === 头部 === */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.header-title {
  font-size: 18px;
  font-weight: 800;
  color: #1f2937;
}

.header-pill {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-primary, #2563eb);
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
  padding: 6px 16px;
  border-radius: 9999px;
}

/* === 用户信息卡片 === */
.user-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.user-card-left {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 10%, #ffffff 90%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-avatar .material-symbols-rounded {
  font-size: 28px;
  color: var(--ui-primary, #2563eb);
}

.user-info-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-info-id {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.user-info-school {
  font-size: 14px;
  color: #6b7280;
}

.user-card-actions {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.action-btn-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.action-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.action-btn--blue {
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
}

.action-btn--blue .material-symbols-rounded {
  font-size: 20px;
  color: var(--ui-primary, #2563eb);
}

.action-btn--red {
  background: #fef2f2;
}

.action-btn--red .material-symbols-rounded {
  font-size: 20px;
  color: #ef4444;
}

.action-btn-label {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.action-btn-label--red {
  color: #ef4444;
}

/* === 维护提示 === */
.maintenance-banner {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(249, 115, 22, 0.36);
  background: #fff7ed;
}

.maintenance-banner--chaoxing {
  border-color: color-mix(in srgb, var(--ui-primary, #2563eb) 34%, transparent 66%);
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 5%, #ffffff 95%);
}

.maintenance-banner--chaoxing .maintenance-title {
  color: var(--ui-primary, #1d4ed8);
}

.maintenance-banner--chaoxing .maintenance-text {
  color: #1e3a8a;
}

.maintenance-title {
  font-size: 15px;
  font-weight: 700;
  color: #c2410c;
  margin-bottom: 4px;
}

.maintenance-text {
  font-size: 13px;
  line-height: 1.5;
  color: #9a3412;
}

.maintenance-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
}

/* === 今日概览卡片 === */
.today-overview-card {
  position: relative;
  background: linear-gradient(to bottom right, color-mix(in srgb, var(--ui-primary, #2563eb) 6%, #ffffff 94%), color-mix(in srgb, var(--ui-primary, #2563eb) 10%, #f0f0ff 90%));
  border-radius: 24px;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--ui-primary, #2563eb) 15%, #e0e0e0 85%);
  margin-bottom: 14px;
  overflow: hidden;
}

.overview-decor-img {
  position: absolute;
  top: 0;
  right: 0;
  width: 66%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  opacity: 0.6;
  pointer-events: none;
  z-index: 0;
}

.overview-content {
  position: relative;
  z-index: 10;
}

.overview-label {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 4px;
}

.overview-greeting {
  font-size: 24px;
  font-weight: 800;
  color: #111827;
  margin: 0 0 4px;
  line-height: 1.3;
}

.overview-subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 16px;
  line-height: 1.6;
}

.overview-sub-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.overview-sub-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.sub-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.sub-card-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.sub-card-icon {
  font-size: 18px;
  color: var(--ui-primary, #3b82f6);
}

.sub-card-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
}

.sub-card-badge--green {
  background: #dcfce7;
  color: #16a34a;
}

.sub-card-badge--blue {
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 12%, #ffffff 88%);
  color: var(--ui-primary, #2563eb);
}

.sub-card-badge--gray {
  background: #f3f4f6;
  color: #6b7280;
}

.sub-card-value {
  font-size: 28px;
  font-weight: 800;
  color: #111827;
  line-height: 1.2;
}

.sub-card-unit {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}

.sub-card-course-name {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub-card-course-name--empty {
  color: #9ca3af;
  font-weight: 500;
}

.sub-card-hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}


/* === 首页布局编辑工具栏 === */
.home-layout-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  margin-bottom: 14px;
  position: sticky;
  top: 12px;
  z-index: 48;
}

.home-layout-toolbar strong {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
}

.home-layout-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease;
}

.toolbar-btn:hover {
  transform: translateY(-1px);
}

.toolbar-btn.ghost {
  color: #374151;
  background: #f3f4f6;
}

.toolbar-btn.primary {
  color: #ffffff;
  background: var(--ui-primary, #2563eb);
}

/* === 工作区 === */
.home-workspace {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.home-workspace :deep(*) {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.home-workspace--editing {
  gap: 14px;
}

.home-workspace-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}


/* === 卡片通用 === */
.widget-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.widget-card-title {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 16px;
}

/* === 工具模块网格 === */
.module-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px 8px;
}

.module-card {
  --drag-translate-x: 0px;
  --drag-translate-y: 0px;
  --edit-pointer-x: 50%;
  --edit-pointer-y: 50%;
  background: transparent;
  border-radius: 12px;
  border: none;
  padding: 8px 4px;
  text-align: center;
  cursor: pointer;
  transition: transform 0.18s ease, opacity 0.18s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  will-change: transform;
}

.module-card__inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.module-card:hover:not(.disabled) {
  transform: translateY(-2px);
}

.module-icon-square {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  transition: transform 0.18s ease;
}

.module-icon-square--more {
  background: #e5e7eb;
  color: #6b7280;
}

.module-icon-square :deep(svg),
.module-icon-square :deep(.theme-module-icon) {
  color: inherit !important;
}

.module-name {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.coming-soon {
  position: absolute;
  top: 8px;
  right: -24px;
  background: #fbbf24;
  color: #92400e;
  font-size: 9px;
  padding: 2px 24px;
  transform: rotate(45deg);
  font-weight: 600;
}

.module-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* === 拖拽编辑态 === */
.workspace-widget {
  --drag-translate-x: 0px;
  --drag-translate-y: 0px;
  position: relative;
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease, opacity 0.22s ease;
}

.workspace-widget.editing {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.workspace-widget.editing:not(.dragging) {
  animation: workspace-panel-float 2.8s ease-in-out infinite;
}

.workspace-widget.editing::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 28px;
  border: 2px dashed color-mix(in srgb, var(--ui-primary, #2563eb) 25%, transparent 75%);
  pointer-events: none;
}

.workspace-widget.dragging {
  z-index: 6;
  cursor: grabbing;
  pointer-events: none;
  transform: translate3d(var(--drag-translate-x), var(--drag-translate-y), 0) scale(1.02);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.workspace-widget.drop-target::before {
  border-style: solid;
  border-color: color-mix(in srgb, var(--ui-primary, #2563eb) 40%, transparent 60%);
}

.module-card.editing {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.module-card.editing:not(.dragging) .module-card__inner {
  animation: workspace-card-float 2.6s ease-in-out infinite;
}

.module-card.dragging {
  z-index: 7;
  cursor: grabbing;
  pointer-events: none;
  transform: translate3d(var(--drag-translate-x), var(--drag-translate-y), 0) scale(1.08);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.18);
}

.module-card.drop-target {
  transform: scale(1.04);
}

/* === 今日课程面板 === */
.today-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.today-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.today-panel-link {
  font-size: 13px;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.18s ease;
}

.today-panel-link:hover {
  color: var(--ui-primary, #2563eb);
}

.today-empty {
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-weight: 500;
  padding: 14px 16px;
  font-size: 14px;
}

.today-error {
  color: #b91c1c;
  background: #fef2f2;
  border-color: #fecaca;
}

.today-empty--done {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: transparent;
  border: none;
}

.today-done-icon {
  width: 96px;
  height: 96px;
  object-fit: contain;
  flex-shrink: 0;
}

.today-done-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.today-done-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.today-done-subtitle {
  font-size: 13px;
  color: #6b7280;
}

/* === 今日课程时间线 === */
.today-timeline {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  max-height: min(52vh, 420px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.today-item {
  display: grid;
  grid-template-columns: 56px 24px 1fr;
  align-items: stretch;
}

.today-item-time {
  font-size: 18px;
  font-weight: 800;
  color: #111827;
  padding-top: 2px;
}

.today-item-line {
  position: relative;
  display: flex;
  justify-content: center;
}

.today-item-line::after {
  content: '';
  position: absolute;
  top: 20px;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ui-primary, #3b82f6) 40%, #ffffff 60%), #e2e8f0);
}

.today-item:last-child .today-item-line::after {
  display: none;
}

.today-item-dot {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, color-mix(in srgb, var(--ui-primary, #3b82f6) 70%, #ffffff 30%), var(--ui-primary, #3b82f6));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-primary, #3b82f6) 18%, transparent 82%);
}

.today-item-main {
  padding: 0 0 12px;
}

.today-item-name {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 6px;
}

.today-item-meta {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
}

.today-item-meta--location {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.today-meta-label {
  color: #6b7280;
  font-weight: 500;
}

.today-room-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--ui-primary, #2563eb) 20%, #e0e0e0 80%);
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 5%, #ffffff 95%);
  color: var(--ui-primary, #1d4ed8);
  font-size: 13px;
  font-weight: 700;
}

/* === 全部模块面板 === */
.all-modules-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.all-modules-panel {
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  padding: 24px 20px;
  overflow-y: auto;
  animation: slideUp 0.3s ease;
}

.all-modules-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.all-modules-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

.all-modules-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
}

.all-modules-close .material-symbols-rounded {
  font-size: 20px;
}

.all-modules-category {
  margin-bottom: 24px;
}

.category-title {
  font-size: 13px;
  font-weight: 500;
  color: #9ca3af;
  margin: 0 0 12px 4px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.category-module-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.category-module-card:hover {
  background: #f9fafb;
}

.category-module-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.category-module-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  --module-icon-color: #ffffff;
}

.category-module-name {
  font-size: 12px;
  font-weight: 400;
  color: #374151;
  text-align: center;
  line-height: 1.3;
}

/* === 动画 === */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes workspace-panel-float {
  0%, 100% { transform: translateY(-1px); }
  50% { transform: translateY(4px); }
}

@keyframes workspace-card-float {
  0%, 100% { transform: translateY(-2px); }
  50% { transform: translateY(3px); }
}

/* === TransitionGroup 动画 === */
.workspace-stack-move,
.workspace-module-move {
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease;
}

.workspace-stack-enter-active,
.workspace-stack-leave-active,
.workspace-module-enter-active,
.workspace-module-leave-active {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease;
}

.workspace-stack-enter-from,
.workspace-stack-leave-to,
.workspace-module-enter-from,
.workspace-module-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* === 响应式 === */
@media (max-width: 480px) {
  .dashboard {
    padding: 16px 12px 80px;
  }

  .user-card {
    padding: 16px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .user-card-actions {
    gap: 12px;
  }

  .overview-greeting {
    font-size: 20px;
  }

  .module-grid {
    gap: 16px 4px;
  }

  .module-icon-square {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }

  .today-item {
    grid-template-columns: 48px 20px 1fr;
  }

  .today-item-time {
    font-size: 16px;
  }

  .today-item-name {
    font-size: 15px;
  }
}
</style>
