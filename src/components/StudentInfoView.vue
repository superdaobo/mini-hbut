<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache, EXTRA_LONG_TTL } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(true)
const error = ref('')
const infoError = ref('')
const accessError = ref('')
const activeTab = ref('basic')
const info = ref(null)
const loginAccess = ref({ current_login: {}, app_access_records: [] })
const offline = ref(false)
const syncTime = ref('')

const fieldLabels = [
  { key: 'student_id', label: '学号' },
  { key: 'name', label: '姓名' },
  { key: 'gender', label: '性别' },
  { key: 'grade', label: '年级' },
  { key: 'college', label: '学院' },
  { key: 'major', label: '专业' },
  { key: 'class_name', label: '班级' },
  { key: 'id_number', label: '身份证号' },
  { key: 'ethnicity', label: '民族' },
  { key: 'birth_date', label: '出生日期' },
  { key: 'phone', label: '手机号' },
  { key: 'email', label: '邮箱' }
]

const normalizeString = (value, fallback = '-') => {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

const normalizeLoginAccess = (payload) => {
  const data = payload && typeof payload === 'object' ? payload : {}
  const current = data.current_login && typeof data.current_login === 'object' ? data.current_login : {}
  const recordsRaw = Array.isArray(data.app_access_records) ? data.app_access_records : []

  return {
    current_login: {
      client_ip: normalizeString(current.client_ip ?? current.clientIp ?? current.ip),
      ip_location: normalizeString(current.ip_location ?? current.ipLocation ?? current.location, '未知'),
      login_time: normalizeString(current.login_time ?? current.loginTime ?? current.last_login_time),
      browser: normalizeString(current.browser ?? current.browser_name ?? current.client_browser)
    },
    app_access_records: recordsRaw.map((item, index) => ({
      id: `${normalizeString(item.app_name ?? item.appName ?? item.title ?? item.name, 'app')}-${index}`,
      app_name: normalizeString(item.app_name ?? item.appName ?? item.title ?? item.name),
      access_time: normalizeString(item.access_time ?? item.accessTime ?? item.time),
      auth_result: normalizeString(item.auth_result ?? item.authResult ?? item.status, '未知'),
      browser: normalizeString(item.browser),
      link_url: typeof item.link_url === 'string' ? item.link_url : ''
    }))
  }
}

const fetchStudentInfo = async () => {
  try {
    const { data } = await fetchWithCache(
      `studentinfo:${props.studentId}`,
      async () => {
        const res = await axios.post(`${API_BASE}/v2/student_info`, {
          student_id: props.studentId
        })
        return res.data
      },
      EXTRA_LONG_TTL
    )

    if (data?.success) {
      info.value = data.data || {}
      infoError.value = ''
      return data
    }

    infoError.value = data?.error || '获取基本信息失败'
    return null
  } catch (e) {
    infoError.value = e.response?.data?.error || '获取基本信息失败'
    return null
  }
}

const fetchLoginAccess = async () => {
  try {
    const { data } = await fetchWithCache(`student-login-access:${props.studentId}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/student_login_access`, {
        student_id: props.studentId
      })
      return res.data
    })

    if (data?.success) {
      loginAccess.value = normalizeLoginAccess(data.data)
      accessError.value = ''
      return data
    }

    accessError.value = data?.error || '获取登录记录失败'
    return null
  } catch (e) {
    accessError.value = e.response?.data?.error || '获取登录记录失败'
    return null
  }
}

const refreshData = async () => {
  loading.value = true
  error.value = ''

  const [basicRes, accessRes] = await Promise.all([
    fetchStudentInfo(),
    fetchLoginAccess()
  ])

  offline.value = !!(basicRes?.offline || accessRes?.offline)
  const timeList = [basicRes?.sync_time, accessRes?.sync_time].filter(Boolean)
  syncTime.value = timeList.length ? timeList.sort().at(-1) : ''

  if (!basicRes && !accessRes) {
    error.value = '个人信息与登录记录均获取失败'
  }

  loading.value = false
}

const basicRows = computed(() => {
  return fieldLabels.map((item) => ({
    label: item.label,
    value: normalizeString(info.value?.[item.key])
  }))
})

const currentLogin = computed(() => {
  return loginAccess.value?.current_login || {}
})

const appAccessRecords = computed(() => {
  return Array.isArray(loginAccess.value?.app_access_records)
    ? loginAccess.value.app_access_records
    : []
})

const canShowContent = computed(() => {
  return !!info.value || appAccessRecords.value.length > 0 || !!currentLogin.value?.client_ip
})

const authResultClass = (text) => {
  const value = String(text || '').toLowerCase()
  if (value.includes('成功') || value.includes('success') || value.includes('已认证')) return 'success'
  if (value.includes('失败') || value.includes('fail') || value.includes('拒绝')) return 'fail'
  return 'neutral'
}

onMounted(() => {
  refreshData()
})
</script>

<template>
  <div class="student-info-view">
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>个人信息</h1>
      <button class="logout-btn" @click="emit('logout')">退出</button>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示离线数据，更新于 {{ formatRelativeTime(syncTime) }}
    </div>

    <div class="view-content">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在加载个人信息与访问记录...</p>
      </div>

      <div v-else-if="error && !canShowContent" class="error-state">
        <div class="error-icon">✕</div>
        <p>{{ error }}</p>
        <button @click="refreshData">重试</button>
      </div>

      <div v-else class="panel-stack">
        <nav class="tab-nav">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'basic' }"
            @click="activeTab = 'basic'"
          >
            基本信息
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'login' }"
            @click="activeTab = 'login'"
          >
            当前登录
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'access' }"
            @click="activeTab = 'access'"
          >
            应用访问
          </button>
        </nav>

        <section v-show="activeTab === 'basic'" class="surface-card">
          <div v-if="info" class="profile-top">
            <div class="avatar">{{ info.name?.charAt(0) || '?' }}</div>
            <div class="profile-meta">
              <h2>{{ normalizeString(info.name) }}</h2>
              <p class="student-id">{{ normalizeString(info.student_id) }}</p>
            </div>
          </div>
          <div v-if="infoError" class="inline-error">{{ infoError }}</div>
          <div class="info-grid">
            <article v-for="row in basicRows" :key="row.label" class="info-item">
              <span class="label">{{ row.label }}</span>
              <span class="value">{{ row.value }}</span>
            </article>
          </div>
        </section>

        <section v-show="activeTab === 'login'" class="surface-card">
          <div v-if="accessError" class="inline-error">{{ accessError }}</div>
          <div class="metric-grid">
            <article class="metric-item">
              <span class="label">客户端 IP</span>
              <span class="value">{{ normalizeString(currentLogin.client_ip) }}</span>
            </article>
            <article class="metric-item">
              <span class="label">IP 归属地</span>
              <span class="value">{{ normalizeString(currentLogin.ip_location, '未知') }}</span>
            </article>
            <article class="metric-item">
              <span class="label">登录时间</span>
              <span class="value">{{ normalizeString(currentLogin.login_time) }}</span>
            </article>
            <article class="metric-item">
              <span class="label">浏览器</span>
              <span class="value">{{ normalizeString(currentLogin.browser) }}</span>
            </article>
          </div>
        </section>

        <section v-show="activeTab === 'access'" class="surface-card">
          <div v-if="appAccessRecords.length === 0" class="empty-state">
            <div class="empty-icon">🗂</div>
            <p>暂无应用访问记录</p>
          </div>

          <div v-else class="records-grid">
            <article v-for="record in appAccessRecords" :key="record.id" class="record-card">
              <div class="record-head">
                <h3>{{ record.app_name }}</h3>
                <span class="auth-badge" :class="authResultClass(record.auth_result)">
                  {{ record.auth_result }}
                </span>
              </div>
              <div class="record-meta">
                <div class="meta-row">
                  <span class="label">访问时间</span>
                  <span class="value">{{ record.access_time }}</span>
                </div>
                <div class="meta-row">
                  <span class="label">浏览器</span>
                  <span class="value">{{ record.browser }}</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.student-info-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
  padding: 20px;
  color: var(--ui-text);
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  box-shadow: var(--ui-shadow-soft);
  margin-bottom: 16px;
}

.view-header h1 {
  margin: 0;
  font-size: 20px;
  color: var(--ui-text);
}

.back-btn,
.logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.back-btn {
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}

.back-btn:hover {
  background: var(--ui-primary);
  color: #ffffff;
}

.logout-btn {
  background: #fee2e2;
  color: #dc2626;
}

.logout-btn:hover {
  background: #dc2626;
  color: #ffffff;
}

.offline-banner {
  margin: 12px auto 0;
  max-width: 1024px;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}

.view-content {
  max-width: 1024px;
  margin: 16px auto 0;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 56px 24px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  box-shadow: var(--ui-shadow-soft);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(148, 163, 184, 0.28);
  border-top-color: var(--ui-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-icon,
.empty-icon {
  font-size: 36px;
  margin-bottom: 12px;
}

.error-state button {
  margin-top: 14px;
  padding: 10px 22px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background: var(--ui-primary);
  color: #ffffff;
}

.panel-stack {
  display: grid;
  gap: 16px;
}

.tab-nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 10px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 14px;
  box-shadow: var(--ui-shadow-soft);
}

.tab-btn {
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--ui-muted);
  font-size: 14px;
  font-weight: 600;
  padding: 10px 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}

.surface-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  box-shadow: var(--ui-shadow-soft);
  padding: 22px;
}

.profile-top {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}

.avatar {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--ui-primary), #22d3ee);
}

.profile-meta h2 {
  margin: 0;
  font-size: 24px;
}

.student-id {
  margin: 6px 0 0;
  color: var(--ui-muted);
  font-size: 14px;
}

.inline-error {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-item,
.metric-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid var(--ui-surface-border);
}

.label {
  color: var(--ui-muted);
  font-size: 12px;
}

.value {
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.records-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.record-card {
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border);
  background: rgba(255, 255, 255, 0.7);
  padding: 14px;
}

.record-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.record-head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--ui-text);
}

.auth-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.auth-badge.success {
  background: rgba(16, 185, 129, 0.16);
  color: #047857;
}

.auth-badge.fail {
  background: rgba(239, 68, 68, 0.16);
  color: #b91c1c;
}

.auth-badge.neutral {
  background: rgba(99, 102, 241, 0.16);
  color: var(--ui-primary);
}

.record-meta {
  display: grid;
  gap: 8px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.meta-row .value {
  text-align: right;
  font-size: 14px;
}

@media (max-width: 900px) {
  .info-grid,
  .metric-grid,
  .records-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .student-info-view {
    padding: 14px;
  }

  .view-header {
    padding: 12px;
  }

  .view-header h1 {
    font-size: 17px;
  }

  .back-btn,
  .logout-btn {
    padding: 7px 12px;
    font-size: 13px;
  }

  .tab-nav {
    grid-template-columns: 1fr;
  }

  .surface-card {
    padding: 16px;
  }

  .profile-top {
    align-items: flex-start;
  }

  .profile-meta h2 {
    font-size: 20px;
  }
}
</style>
