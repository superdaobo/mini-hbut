<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import axios from 'axios'
import { fetchWithCache, getCachedData } from '../utils/api'
import { showToast } from '../utils/toast'
import { openExternal } from '../utils/external_link'
import { stripMarkdown } from '../utils/markdown'
import hbutLogo from '../assets/hbut-logo.png'

const props = defineProps({
  studentId: { type: String, default: '' },
  userUuid: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  tickerNotices: { type: Array, default: () => [] },
  pinnedNotices: { type: Array, default: () => [] },
  noticeList: { type: Array, default: () => [] }
})

const emit = defineEmits(['navigate', 'logout', 'require-login', 'open-notice'])

const brokenImages = ref(new Set())
const cardListeners = []
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

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
    const cacheKey = `schedule:${props.studentId}`
    const cached = getCachedData(cacheKey)
    let payload = cached?.data
    if (!payload?.success) {
      const res = await fetchWithCache(cacheKey, async () => {
        const rsp = await axios.post(`${API_BASE}/v2/schedule/query`, {
          student_id: props.studentId
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

    if (payload?.meta?.current_week) {
      localStorage.setItem('hbu_schedule_meta', JSON.stringify({
        semester: payload.meta.semester || '',
        start_date: payload.meta.start_date || '',
        current_week: payload.meta.current_week || 1
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
const modules = [
  { 
    id: 'grades', 
    name: '成绩查询', 
    icon: '📊', 
    color: '#667eea',
    desc: '查看所有学期成绩',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'classroom', 
    name: '空教室', 
    icon: '🏫', 
    color: '#ed8936',
    desc: '查询空闲教室',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'electricity', 
    name: '电费查询', 
    icon: '⚡', 
    color: '#e53e3e',
    desc: '宿舍电费余额',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'exams', 
    name: '考试安排', 
    icon: '📝', 
    color: '#38b2ac',
    desc: '查询考试时间地点',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'qxzkb', 
    name: '全校课表', 
    icon: '🏫', 
    color: '#6366f1',
    desc: '查询全校课程与排课',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'ranking', 
    name: '绩点排名', 
    icon: '🏆', 
    color: '#f6ad55',
    desc: '专业班级排名',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'calendar', 
    name: '校历', 
    icon: '📘', 
    color: '#3b82f6',
    desc: '查看学期校历',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'academic', 
    name: '学业情况', 
    icon: '🎓', 
    color: '#10b981',
    desc: '学业完成度与课程进度',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'training', 
    name: '培养方案', 
    icon: '📚', 
    color: '#0ea5e9',
    desc: '培养方案与课程设置',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'transactions', 
    name: '交易记录', 
    icon: '💰', 
    color: '#F56C6C',
    desc: '一码通消费记录',
    available: true,
    requiresLogin: true
  },
  {
    id: 'campus_map',
    name: '校园地图',
    icon: '🗺️',
    color: '#14b8a6',
    desc: '校园地图查看',
    available: true,
    requiresLogin: true
  },
  { 
    id: 'ai', 
    name: '校园助手', 
    icon: '🤖', 
    color: '#94a3b8',
    desc: '暂不可用',
    available: false,
    requiresLogin: true
  }
]

const navigateTo = (moduleId) => {
  const module = modules.find((m) => m.id === moduleId)
  if (module?.requiresLogin && !props.isLoggedIn) {
    emit('require-login')
    return
  }
  emit('navigate', moduleId)
}

const handleLogout = () => {
  emit('logout')
}

const tickerItems = computed(() => {
  if (!props.tickerNotices.length) {
    return [{ id: 'ticker-empty', title: '暂无通知' }]
  }
  return props.tickerNotices
})

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
    ? [...allNotices.value, ...allNotices.value]
    : allNotices.value
})

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
  attachCardSpotlight()
  clockTimer = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 60 * 1000)
})

onBeforeUnmount(() => {
  detachCardSpotlight()
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
})

watch(
  () => [props.studentId, props.isLoggedIn],
  () => {
    nowTick.value = Date.now()
    fetchTodayCourses()
  },
  { immediate: true }
)
</script>

<template>
  <div class="dashboard">
    <!-- 头部 -->
    <header class="dashboard-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <span class="title glitch-text" data-text="HBUT 校园助手">HBUT 校园助手</span>
        <span class="page-tag">首页</span>
      </div>
      <div class="user-info">
        <span class="student-id">👤 {{ studentId || '未登录' }}</span>
        <button class="share-btn btn-ripple" @click="copyShareLink" v-if="shareLink" title="复制分享链接">
          🔗
        </button>
        <button v-if="isLoggedIn" class="logout-btn btn-ripple" @click="handleLogout">退出</button>
      </div>
    </header>

    <!-- 公告区（单行滚动） -->
    <section class="notice-panel" v-if="marqueeItems.length">
      <div class="notice-ticker">
        <div class="ticker-track">
          <div class="ticker-items">
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
        <div class="module-icon">{{ mod.icon }}</div>
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

    <footer class="dashboard-footer">
      <p class="neon-marquee">💡 点击模块卡片进入功能</p>
    </footer>
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
  padding: 20px;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
}

html[data-theme='cyberpunk'] .dashboard-header {
  background: rgba(10, 15, 28, 0.82);
  border: 1px solid rgba(41, 200, 224, 0.35);
  box-shadow: 0 0 18px rgba(41, 200, 224, 0.25);
}

html[data-theme='aurora'] .dashboard-header {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.brand .title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ui-text);
  text-shadow: 0 2px 8px rgba(15, 23, 42, 0.16);
}

html[data-theme='aurora'] .brand .title {
  color: var(--ui-text);
  text-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
}

html[data-theme='cyberpunk'] .brand .title {
  background: linear-gradient(135deg, var(--ui-neon-cyan), var(--ui-neon-pink), var(--ui-neon-purple));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 10px rgba(41, 200, 224, 0.6);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.student-id {
  color: var(--ui-text);
  font-weight: 500;
}

.share-btn, .logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
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
  gap: 14px;
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
  height: 140px; /* Taller height for cards/images */
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
  animation: ticker-scroll 25s linear infinite; /* Slower scroll for larger items */
  padding-right: 20px;
}

/* Pause on hover */
.ticker-items:hover {
  animation-play-state: paused;
}

.ticker-item {
  display: inline-block;
  height: 140px;
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
  max-width: 320px; /* Limit max width */
}

.ticker-card {
  height: 100%;
  min-width: 240px;
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

@keyframes ticker-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.module-card {
  background: white;
  border-radius: 16px;
  padding: 18px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  position: relative;
  overflow: hidden;
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
  font-size: 26px;
  margin-bottom: 8px;
}

.module-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 0.5px;
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
  font-size: 30px;
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
  font-size: 22px;
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

.dashboard-footer {
  text-align: center;
  margin-top: 32px;
  color: var(--ui-muted);
  overflow: hidden;
}

@media (max-width: 720px) {
  .dashboard-header {
    flex-direction: column;
    gap: 12px;
  }

  .module-card {
    padding: 12px 6px;
  }

  .today-panel {
    padding: 16px 14px;
    border-radius: 16px;
  }

  .today-panel-head h3 {
    font-size: 26px;
  }

  .today-item {
    grid-template-columns: 56px 22px 1fr;
  }

  .today-item-time {
    font-size: 24px;
  }

  .today-item-name {
    font-size: 18px;
  }

  .today-item-meta {
    font-size: 13px;
  }

  .module-name {
    font-size: clamp(12px, 3.2vw, 13.5px);
    line-height: 1.2;
  }

  .module-icon {
    font-size: 22px;
    margin-bottom: 6px;
  }
}

@media (max-width: 480px) {
  .module-card {
    padding: 10px 4px;
  }

  .today-panel {
    margin-top: 20px;
    padding: 14px 12px;
  }

  .today-panel-head h3 {
    font-size: 22px;
  }

  .today-time {
    font-size: 12px;
    padding: 4px 10px;
  }

  .today-item {
    grid-template-columns: 48px 20px 1fr;
  }

  .today-item-time {
    font-size: 20px;
  }

  .today-item-name {
    font-size: 16px;
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
    font-size: 20px;
    margin-bottom: 6px;
  }
}

.notice-modal-content {
  user-select: text;
  -webkit-user-select: text;
}
</style>
