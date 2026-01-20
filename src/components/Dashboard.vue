<script setup>
import { ref, computed } from 'vue'
import hbutLogo from '../assets/hbut-logo.png'

const props = defineProps({
  studentId: { type: String, default: '' },
  userUuid: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false }
})

const emit = defineEmits(['navigate', 'logout', 'require-login'])

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
    name: '学业完成情况', 
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

// 生成分享链接
const shareLink = computed(() => {
  if (props.userUuid) {
    return `${window.location.origin}/#/s/${props.userUuid}`
  }
  if (props.studentId) {
    return `${window.location.origin}/#/${props.studentId}`
  }
  return ''
})

const copyShareLink = async () => {
  if (shareLink.value) {
    await navigator.clipboard.writeText(shareLink.value)
    alert('链接已复制！')
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
        <div class="module-desc">{{ mod.desc }}</div>
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
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.brand .title {
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
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
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  max-width: 900px;
  margin: 0 auto;
}

.module-card {
  background: white;
  border-radius: 20px;
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
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
  transform: translateY(-8px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
}

.module-card.disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.module-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.module-name {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
}

.module-desc {
  font-size: 13px;
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
  
  .module-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .module-card {
    padding: 20px 16px;
  }
  
  .module-icon {
    font-size: 36px;
  }
}
</style>
