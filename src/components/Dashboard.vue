<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
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
})

onBeforeUnmount(() => {
  detachCardSpotlight()
})
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

.dashboard-footer {
  text-align: center;
  margin-top: 32px;
  color: var(--ui-muted);
  overflow: hidden;
}

@media (max-width: 640px) {
  .dashboard-header {
    flex-direction: column;
    gap: 12px;
  }
  
  .module-card {
    padding: 16px 10px;
  }
}

.notice-modal-content {
  user-select: text;
  -webkit-user-select: text;
}
</style>
