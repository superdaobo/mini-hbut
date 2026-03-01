<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import axios from 'axios'
import { fetchWithCache, getCachedData } from '../utils/api'
import { showToast } from '../utils/toast'
import { openExternal } from '../utils/external_link'
import { stripMarkdown } from '../utils/markdown'
import hbutLogo from '../assets/hbut-logo.png'
import ThemeModuleIcon from './icons/ThemeModuleIcon.vue'

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

const emit = defineEmits(['navigate', 'logout', 'require-login', 'open-notice'])

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
  'training',
  'library',
  'campus_map',
  'resource_share'
])
const loginMethod = ref('')
const isChaoxingMethod = (value) => String(value || '').trim().startsWith('chaoxing')

const refreshLoginMethod = () => {
  loginMethod.value = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
}

const todayCourses = ref([])
const todayLoading = ref(false)
const todayError = ref('')
const nowTick = ref(Date.now())
let clockTimer = null

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

const currentTimeText = computed(() => {
  const now = new Date(nowTick.value)
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
})

const timelineCourses = computed(() => {
  return todayCourses.value.filter((course) => course.endMinutes >= currentMinute.value).slice(0, 4)
})

const todayBlockTitle = computed(() => {
  if (!props.isLoggedIn) return '今日课程'
  if (timelineCourses.value.length === 0) return '今日课程'
  const first = timelineCourses.value[0]
  if (first.startMinutes <= currentMinute.value && first.endMinutes >= currentMinute.value) {
    return '正在进行'
  }
  return '即将开始'
})

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
  try {
    const cachedMeta = localStorage.getItem('hbu_schedule_meta')
    if (!cachedMeta) return ''
    const parsed = JSON.parse(cachedMeta)
    return String(parsed?.semester || '').trim()
  } catch (e) {
    return ''
  }
}

const buildScheduleCacheKey = (studentId, semester) => {
  const sid = String(studentId || '').trim()
  const sem = String(semester || '').trim()
  if (!sid) return ''
  return sem ? `schedule:${sid}:${sem}` : `schedule:${sid}`
}

const normalizeWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return []
  return weeks
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

const buildTodayCourses = (courses, currentWeek) => {
  const todayWeekday = getTodayWeekday()
  const daily = (courses || [])
    .filter((course) => Number(course.weekday) === todayWeekday)
    .filter((course) => normalizeWeeks(course.weeks).includes(currentWeek))
    .sort((a, b) => Number(a.period) - Number(b.period))

  const merged = []
  let index = 0
  while (index < daily.length) {
    const current = daily[index]
    const room = current.room_code || current.room || '-'
    const teacher = current.teacher || '-'
    let startPeriod = Number(current.period)
    let endPeriod = Number(current.period)

    let nextIndex = index + 1
    while (nextIndex < daily.length) {
      const next = daily[nextIndex]
      const nextRoom = next.room_code || next.room || '-'
      if (
        next.name === current.name &&
        nextRoom === room &&
        Number(next.period) <= endPeriod + 1
      ) {
        endPeriod = Math.max(endPeriod, Number(next.period))
        nextIndex += 1
      } else {
        break
      }
    }

    const startText = periodTimeMap[startPeriod]?.start || '--:--'
    const endText = periodTimeMap[endPeriod]?.end || '--:--'
    merged.push({
      key: `${current.name}-${startPeriod}-${room}`,
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
    const preferredSemester = getPreferredScheduleSemester()
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

    if (!payload?.success) {
      todayCourses.value = []
      todayError.value = payload?.error || '今日课程加载失败'
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
    todayCourses.value = buildTodayCourses(payload?.data || [], week)
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
    available: false,
    requiresLogin: true
  }
]

const modules = computed(() => {
  if (!isChaoxingMethod(loginMethod.value)) return baseModules
  return baseModules.filter((mod) => JWXT_MODULE_ALLOWLIST.has(mod.id))
})
const isChaoxingLogin = computed(() => isChaoxingMethod(loginMethod.value))

const navigateTo = (moduleId) => {
  const module = modules.value.find((m) => m.id === moduleId)
  if (module?.requiresLogin && !props.isLoggedIn) {
    emit('require-login')
    return
  }
  emit('navigate', moduleId)
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
  tickerTranslateX.value = tickerDragStartTranslate + deltaX
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
  tickerTransitionMs.value = Math.min(460, Math.max(220, Math.round(180 + velocity * 260)))
  tickerTranslateX.value = normalizeTickerTranslate(target)
  if (Math.abs(deltaX) > 10) {
    tickerSuppressClickUntil.value = Date.now() + 240
  }
  window.setTimeout(() => {
    tickerTransitionMs.value = 0
  }, 340)
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

const updateNoticeSwipeMode = () => {
  if (typeof window === 'undefined') return
  isMobileNoticeSwipe.value = window.innerWidth <= 720
  void refreshTickerMetrics()
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
  updateNoticeSwipeMode()
  void refreshTickerMetrics()
  startTickerLoop()
  attachCardSpotlight()
  clockTimer = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 60 * 1000)
  window.addEventListener('resize', updateNoticeSwipeMode)
})

onBeforeUnmount(() => {
  detachCardSpotlight()
  stopTickerLoop()
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
  if (tickerResumeTimer) {
    window.clearTimeout(tickerResumeTimer)
    tickerResumeTimer = null
  }
  window.removeEventListener('resize', updateNoticeSwipeMode)
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
  () => [props.studentId, props.isLoggedIn],
  () => {
    refreshLoginMethod()
    nowTick.value = Date.now()
    fetchTodayCourses()
  },
  { immediate: true }
)
</script>

<template>
  <div class="dashboard">
    <!-- 头部 -->
    <header class="dashboard-header dashboard-header--home">
      <div class="home-header-top">
        <div class="brand">
          <img class="logo-img" :src="hbutLogo" alt="HBUT" />
          <span class="title">HBUT 校园助手</span>
        </div>
        <span class="page-tag">首页</span>
      </div>
      <div class="home-header-bottom">
        <button class="student-id student-entry" @click="handleProfileClick" title="进入我的页面">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.8-3.3 4.5-5 8-5s6.2 1.7 8 5" />
          </svg>
          {{ studentId || '未登录' }}
        </button>
        <button class="share-btn btn-ripple" @click="copyShareLink" v-if="shareLink" title="复制分享链接">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L9.5 6.42" />
            <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l2.62-2.62" />
          </svg>
        </button>
        <button v-if="isLoggedIn" class="logout-btn btn-ripple" @click="$emit('logout')" title="退出登录">退出</button>
      </div>
    </header>

    <section v-if="jwxtMaintenance" class="maintenance-banner">
      <div class="maintenance-title">教务系统正在维护</div>
      <div class="maintenance-text">
        {{ jwxtMaintenanceHint || '当前展示缓存数据，系统恢复后将自动同步。' }}
      </div>
      <div v-if="jwxtLastCheckTime" class="maintenance-meta">
        最近检测：{{ jwxtLastCheckTime }}
      </div>
    </section>

    <!-- 公告区（单行滚动） -->
    <section class="notice-panel" v-if="marqueeItems.length">
      <div
        class="notice-ticker"
        :class="{ 'swipe-mode': isMobileNoticeSwipe, 'is-paused': isTickerInteracting }"
        @touchstart.passive="onTickerTouchStart"
        @touchmove.passive="onTickerTouchMove"
        @touchend.passive="onTickerTouchEnd"
        @touchcancel.passive="onTickerTouchEnd"
      >
        <div class="ticker-track">
          <div class="ticker-items" ref="tickerItemsRef" :style="tickerItemsStyle">
            <div
              v-for="(notice, idx) in marqueeItems"
              :key="`${notice.id || notice.title}-${idx}`"
              class="ticker-item"
              :class="{ 'has-image': notice.image && !hasBrokenImage(notice) }"
              @click="openNotice(notice)"
            >
              <img
                v-if="notice.image && !hasBrokenImage(notice)"
                :src="notice.image"
                :alt="notice.title"
                class="ticker-img"
                @error="handleImageError(notice)"
              />
              <div v-else class="ticker-card" :style="{ background: getRandomGradient(idx) }">
                <span class="ticker-card-title">{{ notice.title }}</span>
                <span class="ticker-card-sub">查看详情</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="isChaoxingLogin" class="maintenance-banner maintenance-banner--chaoxing">
      <div class="maintenance-title">学习通登录模式</div>
      <div class="maintenance-text">当前已开放教务模块 + 图书查询 + 校园地图 + 资料分享。</div>
    </section>

    <!-- 模块卡片 -->
    <div class="module-grid">
      <div 
        v-for="mod in modules" 
        :key="mod.id"
        class="module-card"
        :class="{ disabled: !mod.available }"
        :style="{ '--accent-color': mod.color }"
        @click="mod.available && navigateTo(mod.id)"
      >
        <div class="module-icon" aria-hidden="true">
          <ThemeModuleIcon :icon-key="mod.iconKey" :badge-size="46" :icon-size="22" />
        </div>
        <div class="module-name">{{ mod.name }}</div>
        <div v-if="!mod.available" class="coming-soon">即将上线</div>
      </div>
    </div>

    <!-- 页脚 -->
    <section class="today-panel">
      <div class="today-panel-head">
        <h3 class="today-title">{{ todayBlockTitle }}</h3>
        <span class="today-time">{{ currentTimeText }}</span>
      </div>

      <div v-if="!isLoggedIn" class="today-empty">登录后可查看今日课程</div>
      <div v-else-if="todayLoading" class="today-empty">正在加载今日课程...</div>
      <div v-else-if="todayError" class="today-empty today-error">{{ todayError }}</div>
      <div v-else-if="timelineCourses.length === 0" class="today-empty">今日课程已上完</div>

      <div v-else class="today-timeline">
        <div v-for="course in timelineCourses" :key="course.key" class="today-item">
          <div class="today-item-time">{{ course.start }}</div>
          <div class="today-item-line">
            <span class="today-item-dot"></span>
          </div>
          <div class="today-item-main">
            <div class="today-item-name">{{ course.name }}</div>
            <div class="today-item-meta">上课地点：{{ course.room }}</div>
            <div class="today-item-meta">授课教师：{{ course.teacher }}</div>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
  padding: 20px;
  max-width: 1120px;
  margin: 0 auto;
}

html[data-theme='cyberpunk'] .dashboard {
  position: relative;
  background: var(--ui-bg-gradient);
}

html[data-theme='cyberpunk'] .dashboard::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(41, 200, 224, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(41, 200, 224, 0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  z-index: 0;
}

html[data-theme='cyberpunk'] .dashboard > * {
  position: relative;
  z-index: 1;
}

.dashboard-header {
  margin-bottom: 14px;
}

.maintenance-banner {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, #f97316 36%, transparent);
  background: color-mix(in srgb, #fff7ed 72%, var(--ui-surface));
  box-shadow: var(--card-shadow-soft);
}

.maintenance-banner--chaoxing {
  border: 1px solid color-mix(in srgb, #2563eb 34%, transparent);
  background: color-mix(in srgb, #eff6ff 74%, var(--ui-surface));
}

.maintenance-banner--chaoxing .maintenance-title {
  color: #1d4ed8;
}

.maintenance-banner--chaoxing .maintenance-text {
  color: color-mix(in srgb, #1e3a8a 84%, var(--ui-text));
}

.maintenance-title {
  font-size: 16px;
  font-weight: 800;
  color: #c2410c;
  margin-bottom: 4px;
}

.maintenance-text {
  font-size: 13px;
  line-height: 1.5;
  color: color-mix(in srgb, #9a3412 88%, var(--ui-text));
}

.maintenance-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ui-text-dim);
}

.dashboard-header--home {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-header-top,
.home-header-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.brand .title {
  font-size: clamp(15px, 4vw, 18px);
  font-weight: 800;
  color: var(--ui-text);
  text-shadow: none;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.student-id {
  color: var(--ui-text);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  border-radius: 999px;
  padding: 0 12px;
}

.student-id svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.student-entry {
  border: none;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.student-entry:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(59, 130, 246, 0.2);
}

.share-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.share-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.logout-btn {
  min-width: 68px;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.share-btn {
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}

.share-btn:hover {
  background: #667eea;
  color: white;
}

.logout-btn {
  background: rgba(239, 68, 68, 0.12);
  color: var(--ui-danger);
}

.logout-btn:hover {
  background: #dc2626;
  color: white;
}

/* 模块网格 */
.module-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  max-width: 980px;
  margin: 0 auto;
}

.notice-panel {
  margin: 0 auto 24px;
  max-width: 980px;
  background: var(--ui-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--ui-surface-border);
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

html[data-theme='aurora'] .notice-panel {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: 0 12px 28px rgba(79, 70, 229, 0.12);
}

.notice-ticker {
  display: flex;
  align-items: center;
  overflow: hidden;
  height: 120px;
}

.ticker-track {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.ticker-items {
  display: inline-flex;
  align-items: center;
  gap: 20px;
  white-space: nowrap;
  flex-wrap: nowrap;
  width: max-content;
  padding-right: 20px;
  transform: translate3d(0, 0, 0);
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.2, 0.9, 0.2, 1);
  transition-duration: 0ms;
  will-change: transform;
}

.notice-ticker.swipe-mode {
  touch-action: pan-y;
  user-select: none;
}

.notice-ticker.swipe-mode .ticker-track {
  overflow: hidden;
}

.notice-ticker.swipe-mode.is-paused .ticker-items {
  transition-duration: 0ms !important;
}

.ticker-item {
  display: inline-block;
  height: 120px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  flex: 0 0 auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: transform 0.2s;
  background: transparent; /* Fallback */
}

html[data-theme='aurora'] .ticker-item {
  background: transparent;
  box-shadow: 0 10px 22px rgba(79, 70, 229, 0.18);
}

.ticker-item:hover {
  transform: translateY(-2px);
}

.ticker-item.has-image {
  width: auto; /* Let image define width */
  background: transparent;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.ticker-img {
  height: 100%;
  width: auto;
  display: block;
  object-fit: cover;
  border-radius: 12px;
  max-width: 300px;
}

.ticker-card {
  height: 100%;
  min-width: 214px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 16px;
  color: white;
  text-align: center;
  backdrop-filter: blur(6px);
}

html[data-theme='aurora'] .ticker-card {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.ticker-card-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 8px;
  white-space: normal; /* Allow title wrap */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ticker-card-sub {
  font-size: 12px;
  opacity: 0.8;
  border: 1px solid rgba(255,255,255,0.4);
  padding: 2px 8px;
  border-radius: 99px;
}

.module-card {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.95), rgba(247, 250, 255, 0.86));
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  padding: 6px 9px 6px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.11);
  position: relative;
  overflow: hidden;
  min-height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}

html[data-theme='cyberpunk'] .module-card {
  background: rgba(10, 15, 28, 0.85);
  border: 1px solid rgba(41, 200, 224, 0.35);
  box-shadow: 0 0 12px rgba(41, 200, 224, 0.25);
  animation: cyber-pulse 5s ease-in-out infinite;
}

html[data-theme='cyberpunk'] .module-card::before {
  height: 3px;
  background: linear-gradient(90deg, var(--ui-neon-cyan), var(--ui-neon-pink));
  box-shadow: 0 0 12px rgba(41, 200, 224, 0.5);
}

html[data-theme='cyberpunk'] .module-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at var(--hover-x, 50%) var(--hover-y, 50%), rgba(41, 200, 224, 0.25), transparent 60%);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

html[data-theme='cyberpunk'] .module-card:hover::after {
  opacity: 1;
}

html[data-theme='cyberpunk'] .module-card:hover:not(.disabled) {
  box-shadow: 0 0 18px rgba(41, 200, 224, 0.5), 0 0 28px rgba(183, 76, 192, 0.35);
  transform: translateY(-6px);
}

html[data-theme='cyberpunk'] .module-name {
  color: var(--ui-text);
  text-shadow: 0 0 8px rgba(41, 200, 224, 0.35);
}

html[data-theme='cyberpunk'] .module-icon {
  text-shadow: 0 0 12px rgba(41, 200, 224, 0.6);
  animation: cyber-float 3.5s ease-in-out infinite;
}

html[data-theme='cyberpunk'] .share-btn,
html[data-theme='cyberpunk'] .logout-btn {
  background: transparent;
  border: 1px solid rgba(41, 200, 224, 0.4);
  color: var(--ui-neon-cyan);
  box-shadow: 0 0 10px rgba(41, 200, 224, 0.35);
}

html[data-theme='cyberpunk'] .logout-btn {
  color: var(--ui-neon-pink);
  border-color: rgba(183, 76, 192, 0.5);
  box-shadow: 0 0 12px rgba(183, 76, 192, 0.35);
}

html[data-theme='minimal'] .dashboard {
  background: #ffffff;
}

html[data-theme='minimal'] .dashboard-header {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: none;
}

html[data-theme='minimal'] .module-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: none;
}

html[data-theme='minimal'] .module-card::before {
  height: 4px;
  background: linear-gradient(90deg, #38bdf8 0%, #0ea5e9 100%);
  top: auto;
  bottom: 0;
}

html[data-theme='minimal'] .tab-bar {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: none;
}

html[data-theme='minimal'] .share-btn,
html[data-theme='minimal'] .logout-btn {
  background: rgba(14, 165, 233, 0.08);
  color: #0ea5e9;
  border: 1px solid rgba(14, 165, 233, 0.25);
}

@keyframes cyber-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

.module-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--accent-color);
}

.module-card:hover:not(.disabled) {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
}

.module-card.disabled {
  opacity: 0.65;
  cursor: not-allowed;
  filter: grayscale(1);
  background: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.6);
  box-shadow: none;
  --accent-color: #94a3b8;
}

.module-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  margin-top: -1px;
}

.module-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 2px;
  line-height: 1.32;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 100%;
}

.module-desc {
  font-size: 12px;
  color: var(--ui-muted);
}

.coming-soon {
  position: absolute;
  top: 12px;
  right: -30px;
  background: #fbbf24;
  color: #92400e;
  font-size: 10px;
  padding: 4px 32px;
  transform: rotate(45deg);
  font-weight: 600;
}

.today-panel {
  max-width: 980px;
  margin: 26px auto 0;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 22px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
  padding: 22px 20px;
}

html[data-theme='cyberpunk'] .today-panel {
  background: rgba(10, 15, 28, 0.9);
  border: 1px solid rgba(41, 200, 224, 0.35);
  box-shadow: 0 0 18px rgba(41, 200, 224, 0.25);
}

.today-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border: none !important;
}

.today-panel-head h3,
.today-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.2px;
  color: var(--ui-text);
  background: transparent !important;
  background-image: none !important;
  border: none !important;
  box-shadow: none !important;
  display: inline-flex;
  align-items: center;
}

.today-panel-head h3::before,
.today-panel-head h3::after,
.today-title::before,
.today-title::after {
  content: none !important;
}

.today-time {
  font-size: 13px;
  font-weight: 700;
  color: #4f46e5;
  background: rgba(79, 70, 229, 0.12);
  border-radius: 999px;
  padding: 6px 12px;
}

.today-empty {
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.7);
  color: #475569;
  font-weight: 600;
  padding: 14px 16px;
}

.today-error {
  color: #b91c1c;
  background: rgba(254, 242, 242, 0.9);
  border-color: rgba(252, 165, 165, 0.8);
}

.today-timeline {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.today-item {
  display: grid;
  grid-template-columns: 72px 26px 1fr;
  align-items: stretch;
}

.today-item-time {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  color: #0f172a;
  padding-top: 2px;
}

.today-item-line {
  position: relative;
}

.today-item-line::after {
  content: '';
  position: absolute;
  top: 18px;
  bottom: -10px;
  left: 12px;
  width: 2px;
  background: linear-gradient(180deg, rgba(96, 165, 250, 0.5), rgba(226, 232, 240, 0.6));
}

.today-item:last-child .today-item-line::after {
  display: none;
}

.today-item-dot {
  position: absolute;
  top: 10px;
  left: 5px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
}

.today-item-main {
  padding: 3px 0 10px;
}

.today-item-name {
  font-size: 18px;
  font-weight: 800;
  color: #111827;
  margin-bottom: 8px;
}

.today-item-meta {
  font-size: 15px;
  color: #64748b;
  line-height: 1.65;
}

html[data-theme='cyberpunk'] .today-item-time,
html[data-theme='cyberpunk'] .today-item-name {
  color: #e2f7ff;
}

html[data-theme='cyberpunk'] .today-item-meta {
  color: #94a3b8;
}

@media (max-width: 720px) {
  .dashboard-header--home {
    gap: 8px;
  }

  .home-header-top,
  .home-header-bottom {
    gap: 8px;
  }

  .brand .title {
    font-size: clamp(14px, 4vw, 17px);
  }

  .student-id {
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .module-card {
    padding: 5px 4px;
    min-height: 64px;
  }

  .today-panel {
    padding: 16px 14px;
    border-radius: 16px;
  }

  .today-panel-head h3 {
    font-size: 18px;
  }

  .today-item {
    grid-template-columns: 56px 22px 1fr;
  }

  .today-item-time {
    font-size: 18px;
  }

  .today-item-name {
    font-size: 16px;
  }

  .today-item-meta {
    font-size: 13px;
  }

  .module-name {
    font-size: clamp(12px, 3.2vw, 14px);
    line-height: 1.25;
  }

  .module-icon {
    transform: scale(0.92);
  }
}

@media (max-width: 480px) {
  .module-card {
    padding: 4px 3px;
    min-height: 60px;
  }

  .home-header-top {
    gap: 6px;
  }

  .student-id {
    max-width: 148px;
    padding: 0 10px;
  }

  .logout-btn {
    min-width: 60px;
    padding: 0 10px;
  }

  .today-panel {
    margin-top: 20px;
    padding: 14px 12px;
  }

  .today-panel-head h3 {
    font-size: 17px;
  }

  .today-time {
    font-size: 12px;
    padding: 4px 10px;
  }

  .today-item {
    grid-template-columns: 48px 20px 1fr;
  }

  .today-item-time {
    font-size: 16px;
  }

  .today-item-name {
    font-size: 15px;
    margin-bottom: 6px;
  }

  .today-item-meta {
    font-size: 12px;
    line-height: 1.5;
  }

  .module-name {
    font-size: 12px;
  }

  .module-icon {
    transform: scale(0.88);
  }
}

.notice-modal-content {
  user-select: text;
  -webkit-user-select: text;
}
</style>
