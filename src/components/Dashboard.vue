<script setup>
import { ref, computed } from 'vue'
import { showToast } from '../utils/toast'
import { open } from '@tauri-apps/plugin-shell'
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
  return 'https://docs.qq.com/doc/DQnVTWFFFbEhNTXhx'
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
    try {
      await open(target.href)
    } catch (e) {
      window.open(target.href, '_blank')
    }
  }
}
</script>

<template>
  <div class="dashboard">
    <!-- 头部 -->
    <header class="dashboard-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <span class="title">HBUT 校园助手</span>
      </div>
      <div class="user-info">
        <span class="student-id">👤 {{ studentId || '未登录' }}</span>
        <button class="share-btn" @click="copyShareLink" v-if="shareLink" title="复制分享链接">
          🔗
        </button>
        <button v-if="isLoggedIn" class="logout-btn" @click="handleLogout">退出</button>
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
      <p>💡 点击模块卡片进入功能</p>
    </footer>
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
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
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.student-id {
  color: #374151;
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
  background: #f0f4ff;
  color: #667eea;
}

.share-btn:hover {
  background: #667eea;
  color: white;
}

.logout-btn {
  background: #fee2e2;
  color: #dc2626;
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
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
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
  background: white; /* Fallback */
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
  opacity: 0.7;
  cursor: not-allowed;
}

.module-icon {
  font-size: 26px;
  margin-bottom: 8px;
}

.module-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.module-desc {
  font-size: 12px;
  color: #6b7280;
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
  color: rgba(255, 255, 255, 0.8);
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
