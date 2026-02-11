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
const accessLoading = ref(false)
const error = ref('')
const infoError = ref('')
const accessError = ref('')
const activeTab = ref('basic')
const info = ref(null)
const offline = ref(false)
const syncTime = ref('')

const pageSizeOptions = [10, 20, 50]
const accessPage = ref(1)
const accessPageSize = ref(10)

const loginAccess = ref({
  current_login: {},
  current_logins: [],
  app_access_records: [],
  auth_info: {
    phone_verified: false,
    phone: '-',
    email_verified: false,
    email: '-',
    password_hint: '-'
  },
  app_access_pagination: {
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  }
})

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

const normalizeAuthResult = (value) => {
  const text = normalizeString(value, 'unknown')
  const lower = text.toLowerCase()
  if (lower.includes('success') || lower.includes('pass') || lower === 'ok' || text.includes('成功')) {
    return '成功'
  }
  if (lower.includes('fail') || lower.includes('deny') || lower.includes('reject') || text.includes('失败')) {
    return '失败'
  }
  if (lower === 'unknown') return '未知'
  return text
}

const normalizeLoginItem = (item) => ({
  client_ip: normalizeString(item.client_ip ?? item.clientIp ?? item.ip),
  ip_location: normalizeString(item.ip_location ?? item.ipLocation ?? item.location, '未知'),
  login_time: normalizeString(item.login_time ?? item.loginTime ?? item.last_login_time),
  browser: normalizeString(item.browser ?? item.browser_name ?? item.client_browser)
})

const normalizeAccessItem = (item, index) => ({
  id: `${normalizeString(item.app_name ?? item.appName ?? item.title ?? item.name, 'app')}-${index}`,
  app_name: normalizeString(item.app_name ?? item.appName ?? item.title ?? item.name),
  access_time: normalizeString(item.access_time ?? item.accessTime ?? item.time),
  auth_result: normalizeAuthResult(item.auth_result ?? item.authResult ?? item.status),
  browser: normalizeString(item.browser),
  link_url: typeof item.link_url === 'string' ? item.link_url : ''
})

const normalizeAuthInfo = (item) => ({
  phone_verified: item?.phone_verified === true || item?.phone_verified === 'true' || item?.phone_verified === 1 || item?.phone_verified === '1',
  phone: normalizeString(item?.phone, '-'),
  email_verified: item?.email_verified === true || item?.email_verified === 'true' || item?.email_verified === 1 || item?.email_verified === '1',
  email: normalizeString(item?.email, '-'),
  password_hint: normalizeString(item?.password_hint, '-')
})

const normalizePagination = (raw, fallbackTotal, fallbackPage = 1, fallbackPageSize = 10) => {
  const page = Number(raw?.page) || fallbackPage
  const pageSize = Number(raw?.page_size ?? raw?.pageSize) || fallbackPageSize
  const total = Number(raw?.total ?? raw?.totalCount) || fallbackTotal
  const totalPages = Number(raw?.total_pages ?? raw?.totalPages) || Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))

  return {
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages
  }
}

const normalizeLoginAccess = (payload, fallbackPage = 1, fallbackPageSize = 10) => {
  const data = payload && typeof payload === 'object' ? payload : {}

  const listSource = Array.isArray(data.current_logins)
    ? data.current_logins
    : Array.isArray(data.login_records)
      ? data.login_records
      : []

  const currentRaw = data.current_login && typeof data.current_login === 'object' ? data.current_login : null

  const currentLogins = listSource
    .map(normalizeLoginItem)
    .filter((item) => item.client_ip !== '-' || item.login_time !== '-' || item.browser !== '-')

  if (currentLogins.length === 0 && currentRaw) {
    currentLogins.push(normalizeLoginItem(currentRaw))
  }

  const appRecordsRaw = Array.isArray(data.app_access_records) ? data.app_access_records : []
  const appAccessRecords = appRecordsRaw.map((item, index) => normalizeAccessItem(item, index))

  const pagination = normalizePagination(
    data.app_access_pagination,
    appAccessRecords.length,
    fallbackPage,
    fallbackPageSize
  )

  return {
    current_login: currentLogins[0] || normalizeLoginItem({}),
    current_logins: currentLogins,
    app_access_records: appAccessRecords,
    auth_info: normalizeAuthInfo(data.auth_info || data.authInfo || {}),
    app_access_pagination: pagination
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

const fetchLoginAccess = async (page = accessPage.value, pageSize = accessPageSize.value, options = {}) => {
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = pageSizeOptions.includes(Number(pageSize)) ? Number(pageSize) : 10
  const showLoading = options.showLoading !== false

  if (showLoading) {
    accessLoading.value = true
  }

  try {
    const res = await axios.post(`${API_BASE}/v2/student_login_access`, {
      student_id: props.studentId,
      page: normalizedPage,
      page_size: normalizedPageSize
    })
    const data = res.data

    if (data?.success) {
      loginAccess.value = normalizeLoginAccess(data.data, normalizedPage, normalizedPageSize)
      accessError.value = ''

      const serverPage = Number(loginAccess.value.app_access_pagination?.page) || normalizedPage
      const serverPageSize = Number(loginAccess.value.app_access_pagination?.page_size) || normalizedPageSize
      accessPage.value = Math.max(1, serverPage)
      accessPageSize.value = pageSizeOptions.includes(serverPageSize) ? serverPageSize : 10
      return data
    }

    accessError.value = data?.error || '获取登录访问信息失败'
    return null
  } catch (e) {
    accessError.value = e.response?.data?.error || '获取登录访问信息失败'
    return null
  } finally {
    if (showLoading) {
      accessLoading.value = false
    }
  }
}

const refreshData = async () => {
  loading.value = true
  error.value = ''

  const [basicRes, accessRes] = await Promise.all([
    fetchStudentInfo(),
    fetchLoginAccess(1, accessPageSize.value, { showLoading: false })
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

const currentLogins = computed(() => {
  return Array.isArray(loginAccess.value?.current_logins) ? loginAccess.value.current_logins : []
})

const authInfo = computed(() => normalizeAuthInfo(loginAccess.value?.auth_info || {}))

const appAccessRecords = computed(() => {
  return Array.isArray(loginAccess.value?.app_access_records) ? loginAccess.value.app_access_records : []
})

const accessTotal = computed(() => {
  const total = Number(loginAccess.value?.app_access_pagination?.total)
  if (Number.isFinite(total) && total >= 0) {
    return total
  }
  return appAccessRecords.value.length
})

const accessTotalPages = computed(() => {
  const totalPages = Number(loginAccess.value?.app_access_pagination?.total_pages)
  if (Number.isFinite(totalPages) && totalPages > 0) {
    return Math.max(1, totalPages)
  }
  return Math.max(1, Math.ceil(accessTotal.value / Math.max(accessPageSize.value, 1)))
})

const pagedAppAccessRecords = computed(() => {
  return appAccessRecords.value
})

const visiblePageNumbers = computed(() => {
  const total = accessTotalPages.value
  const current = accessPage.value
  const windowSize = 5

  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  let start = Math.max(1, current - 2)
  let end = Math.min(total, start + windowSize - 1)
  if (end - start + 1 < windowSize) {
    start = Math.max(1, end - windowSize + 1)
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

const canShowContent = computed(() => {
  return !!info.value || currentLogins.value.length > 0 || appAccessRecords.value.length > 0
})

const authResultClass = (text) => {
  const value = String(text || '').toLowerCase()
  if (value.includes('成功') || value.includes('success') || value.includes('pass') || value === 'ok') return 'success'
  if (value.includes('失败') || value.includes('fail') || value.includes('deny') || value.includes('reject')) return 'fail'
  return 'neutral'
}

const authStatusClass = (status) => (status ? 'ok' : 'warn')

const setAccessPage = async (page) => {
  const total = accessTotalPages.value
  const nextPage = Math.min(Math.max(1, page), total)
  if (nextPage === accessPage.value || accessLoading.value) {
    return
  }
  await fetchLoginAccess(nextPage, accessPageSize.value, { showLoading: true })
}

const handlePageSizeChange = async (event) => {
  const value = Number(event.target.value) || 10
  const nextPageSize = pageSizeOptions.includes(value) ? value : 10
  if (nextPageSize === accessPageSize.value || accessLoading.value) {
    return
  }
  accessPageSize.value = nextPageSize
  await fetchLoginAccess(1, nextPageSize, { showLoading: true })
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
          <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">
            基本信息(缓存)
          </button>
          <button class="tab-btn" :class="{ active: activeTab === 'login' }" @click="activeTab = 'login'">
            当前登录
          </button>
          <button class="tab-btn" :class="{ active: activeTab === 'access' }" @click="activeTab = 'access'">
            登录信息
          </button>
        </nav>

        <section v-show="activeTab === 'basic'" class="surface-card">
          <div class="cache-tip">该分区仅读取本地缓存，避免重复请求教务系统。</div>
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

          <div class="auth-info-box">
            <div class="auth-title">认证信息</div>
            <div class="auth-grid">
              <div class="auth-item">
                <span>手机认证</span>
                <b :class="authStatusClass(authInfo.phone_verified)">{{ authInfo.phone_verified ? '已认证' : '未认证' }}</b>
              </div>
              <div class="auth-item">
                <span>手机号</span>
                <b>{{ authInfo.phone }}</b>
              </div>
              <div class="auth-item">
                <span>邮箱认证</span>
                <b :class="authStatusClass(authInfo.email_verified)">{{ authInfo.email_verified ? '已认证' : '未认证' }}</b>
              </div>
              <div class="auth-item">
                <span>邮箱</span>
                <b>{{ authInfo.email }}</b>
              </div>
              <div class="auth-item auth-item-full">
                <span>密码状态</span>
                <b>{{ authInfo.password_hint }}</b>
              </div>
            </div>
          </div>

          <div v-if="currentLogins.length === 0" class="empty-state compact">
            <div class="empty-icon">📭</div>
            <p>暂无当前登录记录</p>
          </div>

          <template v-else>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>客户端IP</th>
                    <th>IP归属地</th>
                    <th>登录时间</th>
                    <th>浏览器</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in currentLogins" :key="`${item.client_ip}-${item.login_time}-${index}`">
                    <td>{{ item.client_ip }}</td>
                    <td>{{ item.ip_location }}</td>
                    <td>{{ item.login_time }}</td>
                    <td>{{ item.browser }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mobile-list">
              <article v-for="(item, index) in currentLogins" :key="`m-${item.client_ip}-${item.login_time}-${index}`" class="record-card">
                <div class="meta-row">
                  <span class="label">客户端IP</span>
                  <span class="value">{{ item.client_ip }}</span>
                </div>
                <div class="meta-row">
                  <span class="label">IP归属地</span>
                  <span class="value">{{ item.ip_location }}</span>
                </div>
                <div class="meta-row">
                  <span class="label">登录时间</span>
                  <span class="value">{{ item.login_time }}</span>
                </div>
                <div class="meta-row">
                  <span class="label">浏览器</span>
                  <span class="value">{{ item.browser }}</span>
                </div>
              </article>
            </div>
          </template>
        </section>

        <section v-show="activeTab === 'access'" class="surface-card">
          <div v-if="accessLoading" class="inline-loading">
            <div class="mini-spinner"></div>
            <span>正在加载访问记录...</span>
          </div>

          <div v-if="!accessLoading && appAccessRecords.length === 0" class="empty-state compact">
            <div class="empty-icon">📭</div>
            <p>暂无应用访问记录</p>
          </div>

          <template v-else-if="appAccessRecords.length > 0">
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>访问时间</th>
                    <th>应用名称</th>
                    <th>认证结果</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="record in pagedAppAccessRecords" :key="record.id">
                    <td>{{ record.access_time }}</td>
                    <td>{{ record.app_name }}</td>
                    <td>
                      <span class="auth-inline" :class="authResultClass(record.auth_result)">
                        <span class="auth-dot"></span>
                        {{ record.auth_result }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mobile-list">
              <article v-for="record in pagedAppAccessRecords" :key="`m-${record.id}`" class="record-card">
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

            <div class="pagination-bar">
              <span class="total-text">共 {{ accessTotal }} 条</span>

              <div class="pager-controls">
                <button class="pager-btn" :disabled="accessPage <= 1 || accessLoading" @click="setAccessPage(accessPage - 1)">
                  上一页
                </button>
                <button
                  v-for="page in visiblePageNumbers"
                  :key="page"
                  class="pager-btn"
                  :disabled="accessLoading"
                  :class="{ active: page === accessPage }"
                  @click="setAccessPage(page)"
                >
                  {{ page }}
                </button>
                <button class="pager-btn" :disabled="accessPage >= accessTotalPages || accessLoading" @click="setAccessPage(accessPage + 1)">
                  下一页
                </button>
              </div>

              <label class="page-size">
                每页
                <select :value="accessPageSize" :disabled="accessLoading" @change="handlePageSizeChange">
                  <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
                </select>
                条
              </label>
            </div>
          </template>
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

.cache-tip {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #dbe5ff;
  background: #f3f7ff;
  color: #345178;
  font-size: 13px;
}

.auth-info-box {
  margin-bottom: 16px;
  border: 1px solid var(--ui-surface-border);
  border-radius: 12px;
  background: #f8fbff;
  padding: 12px;
}

.auth-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 10px;
}

.auth-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.auth-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e5ebf5;
}

.auth-item b {
  font-size: 13px;
  color: #1f2d3d;
}

.auth-item .ok {
  color: #137333;
}

.auth-item .warn {
  color: #b45309;
}

.auth-item-full {
  grid-column: 1 / -1;
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

.empty-state.compact {
  padding: 30px 16px;
  border-radius: 12px;
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

.inline-loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--ui-muted);
  font-size: 13px;
  font-weight: 600;
}

.mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: var(--ui-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-item {
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
  word-break: break-word;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--ui-surface-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.75);
}

.data-table {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-surface-border);
  text-align: left;
  font-size: 14px;
}

.data-table th {
  background: rgba(148, 163, 184, 0.12);
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 700;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.mobile-list {
  display: none;
}

.record-card {
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border);
  background: rgba(255, 255, 255, 0.7);
  padding: 14px;
}

.record-card + .record-card {
  margin-top: 10px;
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

.auth-badge.success,
.auth-inline.success {
  color: #047857;
}

.auth-badge.success {
  background: rgba(16, 185, 129, 0.16);
}

.auth-badge.fail,
.auth-inline.fail {
  color: #b91c1c;
}

.auth-badge.fail {
  background: rgba(239, 68, 68, 0.16);
}

.auth-badge.neutral,
.auth-inline.neutral {
  color: var(--ui-primary);
}

.auth-badge.neutral {
  background: rgba(59, 130, 246, 0.16);
}

.auth-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.auth-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.record-meta {
  display: grid;
  gap: 8px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.meta-row .value {
  text-align: right;
  font-size: 14px;
}

.pagination-bar {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.total-text {
  color: var(--ui-muted);
  font-size: 14px;
}

.pager-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pager-btn {
  min-width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--ui-surface-border);
  background: #ffffff;
  color: var(--ui-text);
  cursor: pointer;
  padding: 0 10px;
}

.pager-btn.active {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
  color: #ffffff;
}

.pager-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.page-size {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-muted);
  font-size: 14px;
}

.page-size select {
  border: 1px solid var(--ui-surface-border);
  border-radius: 8px;
  height: 34px;
  padding: 0 10px;
  background: #ffffff;
}

@media (max-width: 900px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .table-wrap {
    display: none;
  }

  .mobile-list {
    display: block;
  }

  .pagination-bar {
    flex-direction: column;
    align-items: flex-start;
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

  .meta-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .meta-row .value {
    text-align: left;
  }
}
</style>
