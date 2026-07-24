<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache, EXTRA_LONG_TTL } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { TPageHeader, TEmptyState } from './templates'

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
const orientationError = ref('')
const orientationNotice = ref('')
const orientationLoading = ref(false)
const orientationSource = ref('')
const mentor = ref(null)
const counselor = ref(null)
const dorm = ref(null)
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

/** 班导师 / 辅导员 / 宿舍：智慧迎新只读块（#485，非阻断） */
const fetchOrientationBlocks = async () => {
  orientationLoading.value = true
  orientationError.value = ''
  orientationNotice.value = ''
  try {
    if (!isTauriRuntime()) {
      // Web/HTTP 桥可选：不阻断个人信息
      orientationNotice.value = '客户端内可同步班导师/辅导员/宿舍'
      return null
    }
    const res = await invokeNative('smart_orientation_profile_blocks', {})
    mentor.value = res?.mentor || null
    counselor.value = res?.counselor || null
    dorm.value = res?.dorm || null
    orientationSource.value = String(res?.source || '')
    orientationNotice.value = String(res?.notice || '').trim()
    if (res?.error) {
      orientationError.value = String(res.error)
    }
    return res
  } catch (e) {
    mentor.value = null
    counselor.value = null
    dorm.value = null
    orientationError.value = String(e?.message || e || '迎新附属信息暂不可用')
    return null
  } finally {
    orientationLoading.value = false
  }
}

const personKvRows = (person) => {
  if (!person) return []
  return [
    { label: '姓名', value: person.name },
    { label: '工号', value: person.staffId || person.staff_id },
    { label: '学院', value: person.college },
    { label: '电话', value: person.phone },
    { label: '邮箱', value: person.email },
    { label: '办公室', value: person.office },
    { label: '备注', value: person.remark }
  ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== '-')
}

const dormKvRows = computed(() => {
  const d = dorm.value || {}
  return [
    { label: '校区', value: d.campus },
    { label: '楼栋', value: d.building },
    { label: '房间', value: d.room },
    { label: '床位', value: d.bed },
    { label: '状态', value: d.status },
    { label: '备注', value: d.remark }
  ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== '-')
})

const hasOrientationBlocks = computed(
  () =>
    !!mentor.value ||
    !!counselor.value ||
    !!dorm.value ||
    dormKvRows.value.length > 0
)

const refreshData = async () => {
  loading.value = true
  error.value = ''

  const [basicRes, accessRes] = await Promise.all([
    fetchStudentInfo(),
    fetchLoginAccess(1, accessPageSize.value, { showLoading: false }),
    fetchOrientationBlocks()
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

const getFieldIcon = (label) => {
  const iconMap = {
    '学号': 'badge',
    '姓名': 'person',
    '性别': 'person',
    '年级': 'calendar_month',
    '学院': 'school',
    '专业': 'book',
    '班级': 'groups',
    '身份证号': 'credit_card',
    '民族': 'diversity_3',
    '出生日期': 'cake',
    '手机号': 'smartphone',
    '邮箱': 'mail'
  }
  return iconMap[label] || 'info'
}

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
    <!-- Header -->
    <header class="page-header">
      <button class="header-icon-btn" @click="emit('back')">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <h1 class="header-title">个人信息</h1>
      <div class="header-spacer"></div>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示离线数据，更新于 {{ formatRelativeTime(syncTime) }}
    </div>

    <main class="view-content">
      <TEmptyState v-if="loading" type="loading" message="正在加载个人信息与访问记录..." />

      <TEmptyState v-else-if="error && !canShowContent" type="error" :message="error">
        <button class="btn-primary" style="margin-top: 12px" @click="refreshData">重试</button>
      </TEmptyState>

      <div v-else class="panel-stack">
        <!-- Profile Card -->
        <section class="profile-card">
          <div class="profile-gradient-bg"></div>
          <div class="profile-content">
            <div class="avatar-ring">
              <div class="avatar-circle">{{ info?.name?.charAt(0) || '?' }}</div>
            </div>
            <h2 class="profile-name">{{ normalizeString(info?.name) }}</h2>
            <p class="profile-id">{{ normalizeString(info?.student_id) }}</p>
            <span class="profile-badge">本科生</span>
          </div>
        </section>

        <!-- Tabs -->
        <div class="tab-bar">
          <button class="tab-item" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基本信息</button>
          <button class="tab-item" :class="{ active: activeTab === 'login' }" @click="activeTab = 'login'">当前登录</button>
          <button class="tab-item" :class="{ active: activeTab === 'access' }" @click="activeTab = 'access'">登录信息</button>
        </div>

        <!-- Basic Info Tab -->
        <section v-show="activeTab === 'basic'" class="info-card">
          <h3 class="card-section-title">详细信息</h3>
          <div v-if="infoError" class="inline-error">{{ infoError }}</div>
          <div class="info-grid">
            <article v-for="row in basicRows" :key="row.label" class="info-field" :class="{ 'full-width': row.label === '学院' }">
              <span class="field-label">
                <span class="material-symbols-outlined field-icon">{{ getFieldIcon(row.label) }}</span>
                {{ row.label }}
              </span>
              <span class="field-value">{{ row.value }}</span>
            </article>
          </div>

          <!-- #485 班导师 / 辅导员 / 宿舍（智慧迎新只读，非阻断） -->
          <div class="orientation-blocks">
            <div class="orientation-head">
              <h3 class="card-section-title orientation-title">学工附属信息</h3>
              <span v-if="orientationSource" class="orientation-pill">{{ orientationSource }}</span>
              <span v-if="orientationLoading" class="orientation-pill muted">同步中</span>
            </div>
            <p v-if="orientationNotice" class="orientation-hint">{{ orientationNotice }}</p>
            <p v-if="orientationError && !hasOrientationBlocks" class="inline-error">{{ orientationError }}</p>

            <template v-if="mentor && personKvRows(mentor).length">
              <h4 class="orientation-sub">班导师</h4>
              <div class="info-grid">
                <article v-for="(row, i) in personKvRows(mentor)" :key="'mt-' + i" class="info-field">
                  <span class="field-label">
                    <span class="material-symbols-outlined field-icon">person</span>
                    {{ row.label }}
                  </span>
                  <span class="field-value">{{ row.value }}</span>
                </article>
              </div>
            </template>

            <template v-if="counselor && personKvRows(counselor).length">
              <h4 class="orientation-sub">辅导员</h4>
              <div class="info-grid">
                <article v-for="(row, i) in personKvRows(counselor)" :key="'cs-' + i" class="info-field">
                  <span class="field-label">
                    <span class="material-symbols-outlined field-icon">support_agent</span>
                    {{ row.label }}
                  </span>
                  <span class="field-value">{{ row.value }}</span>
                </article>
              </div>
            </template>

            <template v-if="dormKvRows.length">
              <h4 class="orientation-sub">宿舍信息</h4>
              <div class="info-grid">
                <article v-for="(row, i) in dormKvRows" :key="'dm-' + i" class="info-field">
                  <span class="field-label">
                    <span class="material-symbols-outlined field-icon">apartment</span>
                    {{ row.label }}
                  </span>
                  <span class="field-value">{{ row.value }}</span>
                </article>
              </div>
            </template>

            <p
              v-if="!orientationLoading && !hasOrientationBlocks && !orientationError"
              class="orientation-hint"
            >
              暂无班导师/辅导员/宿舍信息（可能不在迎新开放时段）
            </p>
          </div>
        </section>

        <!-- Login Tab -->
        <section v-show="activeTab === 'login'" class="info-card">
          <h3 class="card-section-title">联系方式 & 认证</h3>
          <div v-if="accessError" class="inline-error">{{ accessError }}</div>

          <div class="contact-list">
            <div class="contact-row">
              <div class="contact-info">
                <span class="field-label">
                  <span class="material-symbols-outlined field-icon">smartphone</span> 手机号码
                </span>
                <span class="field-value">{{ authInfo.phone }}</span>
              </div>
              <span class="auth-pill" :class="authInfo.phone_verified ? 'verified' : 'unverified'">
                {{ authInfo.phone_verified ? '已认证' : '未认证' }}
              </span>
            </div>
            <div class="contact-row">
              <div class="contact-info">
                <span class="field-label">
                  <span class="material-symbols-outlined field-icon">mail</span> 电子邮箱
                </span>
                <span class="field-value">{{ authInfo.email }}</span>
              </div>
              <span class="auth-pill" :class="authInfo.email_verified ? 'verified' : 'unverified'">
                {{ authInfo.email_verified ? '已认证' : '未认证' }}
              </span>
            </div>
          </div>

          <TEmptyState v-if="currentLogins.length === 0" type="empty" message="暂无当前登录记录" />

          <template v-else>
            <h3 class="card-section-title" style="margin-top: 1rem;">当前登录设备</h3>
            <div class="login-list">
              <article v-for="(item, index) in currentLogins" :key="`login-${index}`" class="login-card">
                <div class="login-row"><span class="login-label">客户端IP</span><span class="login-value">{{ item.client_ip }}</span></div>
                <div class="login-row"><span class="login-label">IP归属地</span><span class="login-value">{{ item.ip_location }}</span></div>
                <div class="login-row"><span class="login-label">登录时间</span><span class="login-value">{{ item.login_time }}</span></div>
                <div class="login-row"><span class="login-label">浏览器</span><span class="login-value">{{ item.browser }}</span></div>
              </article>
            </div>
          </template>
        </section>

        <!-- Access Tab -->
        <section v-show="activeTab === 'access'" class="info-card">
          <div v-if="accessLoading" class="inline-loading">
            <div class="mini-spinner"></div>
            <span>正在加载访问记录...</span>
          </div>

          <TEmptyState v-if="!accessLoading && appAccessRecords.length === 0" type="empty" message="暂无应用访问记录" />

          <template v-else-if="appAccessRecords.length > 0">
            <div class="access-list">
              <article v-for="record in pagedAppAccessRecords" :key="record.id" class="access-card">
                <div class="access-head">
                  <h4 class="access-app-name">{{ record.app_name }}</h4>
                  <span class="auth-badge" :class="authResultClass(record.auth_result)">{{ record.auth_result }}</span>
                </div>
                <div class="access-meta">
                  <span class="access-time">{{ record.access_time }}</span>
                </div>
              </article>
            </div>

            <div class="pagination-bar">
              <span class="total-text">共 {{ accessTotal }} 条</span>
              <div class="pager-controls">
                <button class="pager-btn" :disabled="accessPage <= 1 || accessLoading" @click="setAccessPage(accessPage - 1)">上一页</button>
                <button
                  v-for="page in visiblePageNumbers"
                  :key="page"
                  class="pager-btn"
                  :disabled="accessLoading"
                  :class="{ active: page === accessPage }"
                  @click="setAccessPage(page)"
                >{{ page }}</button>
                <button class="pager-btn" :disabled="accessPage >= accessTotalPages || accessLoading" @click="setAccessPage(accessPage + 1)">下一页</button>
              </div>
            </div>
          </template>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.student-info-view {
  min-height: 100vh;
  background: var(--md-sys-color-background, #f6fafe);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  max-width: 448px;
  margin: 0 auto;
  padding-bottom: 6rem;
}

/* Header */
.page-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
  height: 4rem;
  background: rgba(246, 250, 254, 0.8);
  backdrop-filter: blur(12px);
}

.header-icon-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant, #424754);
  cursor: pointer;
  transition: background 0.2s;
}

.header-icon-btn:hover {
  background: var(--md-sys-color-surface-container-low, #f0f4f8);
}

.header-title {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

.header-spacer {
  width: 2.5rem;
  height: 2.5rem;
}

/* Offline Banner */
.offline-banner {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
  margin: 0 1rem;
  font-size: 13px;
}

/* Content */
.view-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Profile Card */
.profile-card {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border-radius: 24px;
  padding: 1.25rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow: hidden;
}

.profile-gradient-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 6rem;
  background: linear-gradient(to right, rgba(91, 134, 229, 0.2), rgba(54, 209, 220, 0.2));
}

.profile-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 1.5rem;
}

.avatar-ring {
  width: 6rem;
  height: 6rem;
  border-radius: 9999px;
  border: 4px solid var(--md-sys-color-surface-container-lowest, #ffffff);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 0.75rem;
}

.avatar-circle {
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #5b86e5, #36d1dc);
}

.profile-name {
  font-size: 20px;
  line-height: 28px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

.profile-id {
  font-size: 14px;
  line-height: 20px;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin: 0;
}

.profile-badge {
  margin-top: 0.75rem;
  background: var(--md-sys-color-secondary-container, #dce2f3);
  color: var(--md-sys-color-on-secondary-container, #5e6572);
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  width: 100%;
  background: var(--md-sys-color-surface-container-low, #f0f4f8);
  border-radius: 0.75rem;
  padding: 0.25rem;
}

.tab-item {
  flex: 1;
  padding: 0.5rem;
  text-align: center;
  border-radius: 0.5rem;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface-variant, #424754);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-item.active {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  color: var(--md-sys-color-primary, #0058be);
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-item:hover:not(.active) {
  color: var(--md-sys-color-on-surface, #171c1f);
}

/* Info Card */
.info-card {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border-radius: 24px;
  padding: 1.25rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.card-section-title {
  font-size: 16px;
  line-height: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
}

.orientation-blocks {
  margin-top: 1.25rem;
  padding-top: 0.25rem;
  border-top: 1px dashed var(--md-sys-color-outline-variant, #c2c7ce);
}

.orientation-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
}

.orientation-title {
  margin-bottom: 0.5rem;
  border-bottom: none;
  padding-bottom: 0;
  flex: 1;
}

.orientation-pill {
  font-size: 11px;
  line-height: 1;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  background: var(--md-sys-color-secondary-container, #dce2f3);
  color: var(--md-sys-color-on-secondary-container, #5e6572);
  font-weight: 600;
}

.orientation-pill.muted {
  opacity: 0.75;
}

.orientation-sub {
  margin: 1rem 0 0.65rem;
  font-size: 14px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
}

.orientation-hint {
  margin: 0.35rem 0 0.5rem;
  font-size: 12px;
  line-height: 1.45;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.info-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-field.full-width {
  grid-column: 1 / -1;
}

.field-label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #424754);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.field-icon {
  font-size: 16px;
}

.field-value {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #171c1f);
}

/* Contact List */
.contact-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.contact-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.contact-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.auth-pill {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.auth-pill.verified {
  background: rgba(20, 184, 166, 0.1);
  color: #14b8a6;
}

.auth-pill.unverified {
  background: rgba(249, 115, 22, 0.1);
  color: #f97316;
}

/* Login List */
.login-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.login-card {
  border-radius: 12px;
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  background: var(--md-sys-color-surface, #f6fafe);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.login-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.login-label {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

.login-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #171c1f);
}

/* Access List */
.access-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.access-card {
  border-radius: 12px;
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  background: var(--md-sys-color-surface, #f6fafe);
  padding: 0.75rem;
}

.access-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.access-app-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

.auth-badge {
  display: inline-flex;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 11px;
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
  background: rgba(59, 130, 246, 0.16);
  color: var(--md-sys-color-primary, #0058be);
}

.access-meta {
  display: flex;
  gap: 0.5rem;
}

.access-time {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

/* Inline States */
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
  color: var(--md-sys-color-on-surface-variant, #424754);
  font-size: 13px;
  font-weight: 600;
}

.mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: var(--md-sys-color-primary, #0058be);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Pagination */
.pagination-bar {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.total-text {
  color: var(--md-sys-color-on-surface-variant, #424754);
  font-size: 13px;
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
  border: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  background: #ffffff;
  color: var(--md-sys-color-on-surface, #171c1f);
  cursor: pointer;
  padding: 0 10px;
  font-size: 13px;
}

.pager-btn.active {
  border-color: var(--md-sys-color-primary, #0058be);
  background: var(--md-sys-color-primary, #0058be);
  color: #ffffff;
}

.pager-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Button */
.btn-primary {
  padding: 10px 22px;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  background: var(--md-sys-color-primary, #0058be);
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
}

/* Material Symbols */
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
</style>
