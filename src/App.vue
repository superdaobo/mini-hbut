<script setup>
import { ref, onMounted, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import axios from 'axios'
import Dashboard from './components/Dashboard.vue'
import GradeView from './components/GradeView.vue'
import ElectricityView from './components/ElectricityView.vue'
import ClassroomView from './components/ClassroomView.vue'
import ScheduleView from './components/ScheduleView.vue'
import StudentInfoView from './components/StudentInfoView.vue'
import ExamView from './components/ExamView.vue'
import RankingView from './components/RankingView.vue'
import CalendarView from './components/CalendarView.vue'
import AcademicProgressView from './components/AcademicProgressView.vue'
import TrainingPlanView from './components/TrainingPlanView.vue'
import MeView from './components/MeView.vue'
import OfficialView from './components/OfficialView.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import { fetchWithCache } from './utils/api.js'
import { checkForUpdates, getCurrentVersion } from './utils/updater.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// 视图状态: home, schedule, me, grades...
const currentView = ref('home')
const activeTab = ref('home')
const gradeData = ref([])
const studentId = ref('')
const userUuid = ref('')
const currentModule = ref('')
const isLoading = ref(false)
const showLoginPrompt = ref(false)
const gradesOffline = ref(false)
const gradesSyncTime = ref('')

const SESSION_COOKIE_KEY = 'hbu_session_cookies'
const SESSION_COOKIE_TIME_KEY = 'hbu_session_cookie_time'
const SESSION_REFRESH_INTERVAL = 20 * 60 * 1000
let sessionKeepAliveTimer = null

// 版本更新相关
const showUpdateDialog = ref(false)

// 默认使用 V2 全自动识别模式
const loginMode = ref('auto')

const isLoggedIn = computed(() => !!studentId.value)

// 处理登录成功
const handleLoginSuccess = (data) => {
  gradeData.value = data
  studentId.value = localStorage.getItem('hbu_username') || ''
  // 跳转到 Dashboard 显示所有模块
  currentView.value = 'home'
  activeTab.value = 'home'
  currentModule.value = ''
  window.history.replaceState(null, '', `#/${studentId.value}`)

  // 预取课表/培养方案默认数据并落地缓存
  if (studentId.value) {
    fetchWithCache(`schedule:${studentId.value}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
        student_id: studentId.value
      })
      if (res.data?.meta) {
        localStorage.setItem('hbu_schedule_meta', JSON.stringify({
          semester: res.data.meta.semester,
          start_date: res.data.meta.start_date,
          current_week: res.data.meta.current_week
        }))
      }
      return res.data
    })

    fetchWithCache(`training:options:${studentId.value}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/training_plan/options`, {
        student_id: studentId.value
      })
      if (res.data?.success) {
        localStorage.setItem('hbu_training_options', JSON.stringify({
          options: res.data.options || {},
          defaults: res.data.defaults || {}
        }))
      }
      return res.data
    })
  }

  localStorage.removeItem('hbu_manual_logout')
  persistSessionCookies()
  startSessionKeepAlive()
}

// 处理导航
const handleNavigate = async (moduleId) => {
  currentModule.value = moduleId
  window.history.replaceState(null, '', `#/${studentId.value}/${moduleId}`)
  
  // 如果是成绩页面且数据为空，先获取数据
  if (moduleId === 'grades' && gradeData.value.length === 0) {
    const success = await fetchGradesFromAPI(studentId.value)
    if (!success) {
      // 获取失败，跳转到个人中心
      currentView.value = 'me'
      activeTab.value = 'me'
      return
    }
  }
  
  currentView.value = moduleId
}

// 处理返回仪表盘
const handleBackToDashboard = () => {
  currentView.value = 'home'
  activeTab.value = 'home'
  currentModule.value = ''
  window.history.replaceState(null, '', `#/${studentId.value}`)
}

// 处理登出
const handleLogout = () => {
  currentView.value = 'home'
  activeTab.value = 'home'
  gradeData.value = []
  studentId.value = ''
  userUuid.value = ''
  currentModule.value = ''
  window.history.replaceState(null, '', '#/')

  stopSessionKeepAlive()
  localStorage.removeItem(SESSION_COOKIE_KEY)
  localStorage.removeItem(SESSION_COOKIE_TIME_KEY)
  localStorage.setItem('hbu_manual_logout', 'true')
  invoke('logout').catch(() => {})
}

// 切换登录模式
const handleSwitchLoginMode = (mode) => {
  loginMode.value = mode
}

// 从API获取成绩数据
const fetchGradesFromAPI = async (sid) => {
  isLoading.value = true
  try {
    const { data } = await fetchWithCache(`grades:${sid}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid })
      return res.data
    })

    if (data?.success && data?.data) {
      gradeData.value = data.data
      gradesOffline.value = !!data.offline
      gradesSyncTime.value = data.sync_time || ''
      return true
    }
  } catch (e) {
    console.error('获取成绩失败:', e)
  } finally {
    isLoading.value = false
  }
  return false
}

const handleRequireLogin = () => {
  showLoginPrompt.value = true
  setTimeout(() => {
    showLoginPrompt.value = false
  }, 2200)
}

const handleTabChange = (tab) => {
  activeTab.value = tab
  currentView.value = tab
}

// 打开官方发布页
const handleOpenOfficial = () => {
  currentView.value = 'official'
}

// 检查更新
const handleCheckUpdate = () => {
  showUpdateDialog.value = true
}

// 自动检查更新
const autoCheckUpdate = async () => {
  try {
    const currentVersion = await getCurrentVersion()
    const skippedVersion = localStorage.getItem('hbu_skipped_version')
    
    const result = await checkForUpdates(currentVersion)
    if (result?.hasUpdate && result.latestVersion !== skippedVersion) {
      showUpdateDialog.value = true
    }
  } catch (e) {
    console.warn('[Update] 自动检查更新失败:', e)
  }
}

const persistSessionCookies = async () => {
  try {
    const cookies = await invoke('get_cookies')
    if (cookies) {
      localStorage.setItem(SESSION_COOKIE_KEY, cookies)
      localStorage.setItem(SESSION_COOKIE_TIME_KEY, Date.now().toString())
    }
  } catch (e) {
    console.warn('[Session] 保存 cookies 失败:', e)
  }
}

const tryRestoreSession = async () => {
  const cookies = localStorage.getItem(SESSION_COOKIE_KEY)
  if (!cookies) return false

  try {
    const userInfo = await invoke('restore_session', { cookies })
    if (userInfo?.student_id) {
      studentId.value = userInfo.student_id
      localStorage.setItem('hbu_username', userInfo.student_id)
      return true
    }
  } catch (e) {
    console.warn('[Session] 恢复会话失败，清理缓存:', e)
    localStorage.removeItem(SESSION_COOKIE_KEY)
    localStorage.removeItem(SESSION_COOKIE_TIME_KEY)
  }
  return false
}

const getStoredPassword = () => {
  const remember = localStorage.getItem('hbu_remember')
  const username = localStorage.getItem('hbu_username')
  const credential = localStorage.getItem('hbu_credentials')
  if (remember === 'false' || !username || !credential) {
    return null
  }
  if (credential.length > 50 || /[A-Za-z0-9+/=]{30,}/.test(credential)) {
    return null
  }
  return { username, password: credential }
}

const attemptAutoRelogin = async () => {
  if (localStorage.getItem('hbu_manual_logout') === 'true') {
    return false
  }
  const creds = getStoredPassword()
  if (!creds) return false
  try {
    await invoke('login', {
      username: creds.username,
      password: creds.password,
      captcha: '',
      lt: '',
      execution: ''
    })
    await persistSessionCookies()
    if (!studentId.value) {
      studentId.value = creds.username
    }
    return true
  } catch (e) {
    console.warn('[Session] 自动登录失败:', e)
    return false
  }
}

const refreshSessionSilently = async () => {
  const cookies = localStorage.getItem(SESSION_COOKIE_KEY)
  if (!cookies) return

  try {
    await invoke('refresh_session')
    await persistSessionCookies()
  } catch (e) {
    console.warn('[Session] 会话刷新失败，尝试自动登录:', e)
    const relogged = await attemptAutoRelogin()
    if (!relogged) {
      stopSessionKeepAlive()
    }
  }
}

const startSessionKeepAlive = () => {
  stopSessionKeepAlive()
  sessionKeepAliveTimer = setInterval(refreshSessionSilently, SESSION_REFRESH_INTERVAL)
}

const stopSessionKeepAlive = () => {
  if (sessionKeepAliveTimer) {
    clearInterval(sessionKeepAliveTimer)
    sessionKeepAliveTimer = null
  }
}

const showTabBar = computed(() => ['home', 'schedule', 'me'].includes(currentView.value))

// 页面加载时检查 URL
onMounted(async () => {
  const restored = await tryRestoreSession()
  let relogged = false
  if (!restored) {
    relogged = await attemptAutoRelogin()
  }

  const hash = window.location.hash
  if (hash) {
    const match = hash.match(/^#\/(\d{10})(?:\/(\w+))?$/)
    if (match) {
      studentId.value = match[1]
      localStorage.setItem('hbu_username', match[1])
      
      if (match[2]) {
        currentModule.value = match[2]
        
        // 如果是成绩页面，尝试从API获取数据
        if (match[2] === 'grades' && gradeData.value.length === 0) {
          const success = await fetchGradesFromAPI(match[1])
          if (success) {
            currentView.value = 'grades'
          } else {
            // 获取失败，跳转到个人中心
            currentView.value = 'me'
            activeTab.value = 'me'
          }
        } else {
          currentView.value = match[2]
        }
      } else {
        currentView.value = 'home'
        activeTab.value = 'home'
      }
    }
  }

  if (restored && !hash) {
    currentView.value = 'home'
    activeTab.value = 'home'
  }

  if (restored || relogged || studentId.value) {
    startSessionKeepAlive()
  }
  
  // 延迟自动检查更新，避免影响首屏加载
  setTimeout(() => {
    autoCheckUpdate()
  }, 3000)
})
</script>

<template>
  <main class="app-shell">
    <Transition name="fade" mode="out-in">
      <!-- 首页 -->
      <Dashboard 
        v-if="currentView === 'home'"
        :student-id="studentId"
        :user-uuid="userUuid"
        :is-logged-in="isLoggedIn"
        @navigate="handleNavigate"
        @logout="handleLogout"
        @require-login="handleRequireLogin"
      />

      <!-- 课表（Tab） -->
      <ScheduleView 
        v-else-if="currentView === 'schedule'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 个人中心（Tab） -->
      <MeView 
        v-else-if="currentView === 'me'"
        :student-id="studentId"
        :is-logged-in="isLoggedIn"
        :login-mode="loginMode"
        @success="handleLoginSuccess"
        @switchMode="handleSwitchLoginMode"
        @navigate="handleNavigate"
        @logout="handleLogout"
        @checkUpdate="handleCheckUpdate"
        @openOfficial="handleOpenOfficial"
      />

      <!-- 官方发布页 -->
      <OfficialView 
        v-else-if="currentView === 'official'"
        @back="currentView = 'me'; activeTab = 'me'"
      />
      
      <!-- 成绩查看 -->
      <GradeView 
        v-else-if="currentView === 'grades'"
        :grades="gradeData"
        :student-id="studentId"
        :offline="gradesOffline"
        :sync-time="gradesSyncTime"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 电费查询 -->
      <!-- 电费查询 -->
      <ElectricityView 
        v-else-if="currentView === 'electricity'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 空教室查询 -->
      <ClassroomView 
        v-else-if="currentView === 'classroom'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 个人信息 -->
      <StudentInfoView 
        v-else-if="currentView === 'studentinfo'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 考试安排 -->
      <ExamView 
        v-else-if="currentView === 'exams'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 绩点排名 -->
      <RankingView 
        v-else-if="currentView === 'ranking'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 校历 -->
      <CalendarView 
        v-else-if="currentView === 'calendar'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 学业完成情况 -->
      <AcademicProgressView 
        v-else-if="currentView === 'academic'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 培养方案 -->
      <TrainingPlanView 
        v-else-if="currentView === 'training'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />
      
      <!-- 其他模块占位 -->
      <div v-else class="coming-soon-page">
        <div class="coming-soon-content">
          <div class="emoji">🚧</div>
          <h2>{{ currentModule }} 模块开发中</h2>
          <p>敬请期待...</p>
          <button @click="handleBackToDashboard">返回仪表盘</button>
        </div>
      </div>
    </Transition>

    <nav v-if="showTabBar" class="tab-bar glass-card">
      <button class="tab-item" :class="{ active: activeTab === 'home' }" @click="handleTabChange('home')">
        <span class="tab-icon">🏠</span>
        <span class="tab-label">首页</span>
      </button>
      <button class="tab-item" :class="{ active: activeTab === 'schedule' }" @click="handleTabChange('schedule')">
        <span class="tab-icon">📅</span>
        <span class="tab-label">课表</span>
      </button>
      <button class="tab-item" :class="{ active: activeTab === 'me' }" @click="handleTabChange('me')">
        <span class="tab-icon">👤</span>
        <span class="tab-label">我的</span>
      </button>
    </nav>

    <div v-if="showLoginPrompt" class="login-mask">
      <div class="login-mask-card">请先在个人中心登录</div>
    </div>

    <!-- 版本更新对话框 -->
    <UpdateDialog 
      v-if="showUpdateDialog"
      @close="showUpdateDialog = false"
    />
  </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.coming-soon-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.coming-soon-content {
  text-align: center;
  color: white;
}

.coming-soon-content .emoji {
  font-size: 80px;
  margin-bottom: 20px;
}

.coming-soon-content h2 {
  font-size: 28px;
  margin-bottom: 12px;
}

.coming-soon-content p {
  opacity: 0.8;
  margin-bottom: 24px;
}

.coming-soon-content button {
  padding: 12px 32px;
  background: white;
  color: #667eea;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.coming-soon-content button:hover {
  transform: scale(1.05);
}

.app-shell {
  min-height: 100vh;
  position: relative;
  padding-bottom: 90px;
  height: 100vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.tab-bar {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px 16px;
  width: min(520px, calc(100% - 32px));
  border-radius: 18px;
  backdrop-filter: blur(18px);
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
  border: none;
  background: transparent;
  color: #475569;
  font-size: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-item.active {
  color: #1d4ed8;
  background: rgba(59, 130, 246, 0.12);
}

.tab-icon {
  font-size: 18px;
}

.login-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  z-index: 20;
}

.login-mask-card {
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  font-weight: 600;
  color: #0f172a;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
</style>
