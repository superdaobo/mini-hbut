<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache, EXTRA_LONG_TTL } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { t, useLocale } from '../utils/app_i18n'
import { TPageHeader, TEmptyState } from './templates'

// i18n：响应式 locale（语言切换即时生效），t() 按当前语言取词
const { locale } = useLocale()

/** i18n 插值：把 {{n}} 占位符替换为参数 */
const tParams = (key, params) => {
  const text = t(key)
  return Object.entries(params ?? {}).reduce(
    (acc, [name, value]) => acc.replaceAll(`{{${name}}}`, String(value)),
    text
  )
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(true)
const refreshing = ref(false)
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
const accessOffline = ref(false)
const accessSyncTime = ref('')
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

/** 学籍字段标签：数据驱动枚举，label 为 i18n key，渲染时取词 */
const fieldLabels = [
  { key: 'student_id', labelKey: 'studentinfo.field.studentId' },
  { key: 'name', labelKey: 'studentinfo.field.name' },
  { key: 'gender', labelKey: 'studentinfo.field.gender' },
  { key: 'grade', labelKey: 'studentinfo.field.grade' },
  { key: 'college', labelKey: 'studentinfo.field.college' },
  { key: 'major', labelKey: 'studentinfo.field.major' },
  { key: 'class_name', labelKey: 'studentinfo.field.class' },
  { key: 'id_number', labelKey: 'studentinfo.field.idNumber' },
  { key: 'ethnicity', labelKey: 'studentinfo.field.ethnicity' },
  { key: 'birth_date', labelKey: 'studentinfo.field.birthDate' },
  { key: 'phone', labelKey: 'studentinfo.field.phone' },
  { key: 'email', labelKey: 'studentinfo.field.email' }
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
    return t('studentinfo.auth.success')
  }
  if (lower.includes('fail') || lower.includes('deny') || lower.includes('reject') || text.includes('失败')) {
    return t('studentinfo.auth.fail')
  }
  if (lower === 'unknown') return t('studentinfo.auth.unknown')
  return text
}

const normalizeLoginItem = (item) => ({
  client_ip: normalizeString(item.client_ip ?? item.clientIp ?? item.ip),
  ip_location: normalizeString(item.ip_location ?? item.ipLocation ?? item.location, t('common.unknown')),
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

const fetchStudentInfo = async (force = false) => {
  try {
    const result = await fetchWithCache(
      `studentinfo:${props.studentId}`,
      async () => {
        const res = await axios.post(`${API_BASE}/v2/student_info`, {
          student_id: props.studentId
        })
        return res.data
      },
      EXTRA_LONG_TTL,
      { cacheOfflinePayload: true, forceRemote: force }
    )
    const data = result?.data
    if (data?.success) {
      info.value = data.data || {}
      infoError.value = ''
      // 标记数据来源，供 offline 横幅判定区分"缓存回源"与"本次请求失败"
      return { ...data, _fromCache: !!result?.fromCache, _stale: !!result?.stale }
    }

    infoError.value = data?.error || t('studentinfo.error.basic')
    return null
  } catch (e) {
    infoError.value = e.response?.data?.error || t('studentinfo.error.basic')
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

    accessError.value = data?.error || t('studentinfo.error.access')
    return null
  } catch (e) {
    accessError.value =
      e?.response?.data?.error ||
      (typeof e === 'string' ? e : e?.message) ||
      t('studentinfo.error.access')
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
      orientationNotice.value = t('studentinfo.orientation.webHint')
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
    orientationError.value = String(e?.message || e || t('studentinfo.error.orientation'))
    return null
  } finally {
    orientationLoading.value = false
  }
}

/** 班导师 / 辅导员 KV 行：label 为 i18n key，渲染时取词 */
const personKvRows = (person) => {
  if (!person) return []
  return [
    { labelKey: 'studentinfo.person.name', value: person.name },
    { labelKey: 'studentinfo.person.staffId', value: person.staffId || person.staff_id },
    { labelKey: 'studentinfo.person.college', value: person.college },
    { labelKey: 'studentinfo.person.phone', value: person.phone },
    { labelKey: 'studentinfo.person.email', value: person.email },
    { labelKey: 'studentinfo.person.office', value: person.office },
    { labelKey: 'studentinfo.person.remark', value: person.remark }
  ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== '-')
}

const dormKvRows = computed(() => {
  const d = dorm.value || {}
  return [
    { labelKey: 'studentinfo.dorm.campus', value: d.campus },
    { labelKey: 'studentinfo.dorm.building', value: d.building },
    { labelKey: 'studentinfo.dorm.room', value: d.room },
    { labelKey: 'studentinfo.dorm.bed', value: d.bed },
    { labelKey: 'studentinfo.dorm.status', value: d.status },
    { labelKey: 'studentinfo.dorm.remark', value: d.remark }
  ].filter((x) => x.value && String(x.value).trim() && String(x.value).trim() !== '-')
})

const hasOrientationBlocks = computed(
  () =>
    !!mentor.value ||
    !!counselor.value ||
    !!dorm.value ||
    dormKvRows.value.length > 0
)

const refreshData = async (options = {}) => {
  const force = !!options.force
  if (force) {
    refreshing.value = true
  } else {
    loading.value = true
  }
  error.value = ''

  const [basicRes, accessRes] = await Promise.all([
    fetchStudentInfo(force),
    fetchLoginAccess(1, accessPageSize.value, { showLoading: false }),
    fetchOrientationBlocks()
  ])

  // 离线判定：仅当数据非缓存回源（本次请求确实失败且无可用缓存）时展示离线横幅，
  // 避免"每次进入都显示离线数据"的误报。
  // 整页离线状态只由学生基本信息（basic）决定；登录访问记录（login_access）由独立的
  // 融合门户会话提供，其失败不应把整页拖入"离线数据"状态（#516）。
  const basicOffline = !!basicRes?.offline && !basicRes?._fromCache && !basicRes?._stale
  const accessCached = !!accessRes?.offline
  offline.value = basicOffline
  accessOffline.value = accessCached
  accessSyncTime.value = accessRes?.sync_time || ''

  // sync_time：离线时取离线数据自身的真实更新时间，避免被其他接口的"刚刚"覆盖
  if (offline.value) {
    if (basicOffline && basicRes?.sync_time) {
      syncTime.value = basicRes.sync_time
    } else if (accessCached && accessRes?.sync_time) {
      syncTime.value = accessRes.sync_time
    } else {
      syncTime.value = ''
    }
  } else {
    const timeList = [basicRes?.sync_time, accessRes?.sync_time].filter(Boolean)
    syncTime.value = timeList.length ? timeList.sort().at(-1) : ''
  }

  if (!basicRes && !accessRes) {
    error.value = t('studentinfo.error.all')
  }

  loading.value = false
  refreshing.value = false
}

const handleManualRefresh = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await refreshData({ force: true })
  } catch {
    refreshing.value = false
  }
}

const basicRows = computed(() => {
  return fieldLabels.map((item) => ({
    labelKey: item.labelKey,
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
  if (value.includes('成功') || value.includes('success') || value.includes('pass') || value === 'ok' || value === t('studentinfo.auth.success').toLowerCase()) return 'success'
  if (value.includes('失败') || value.includes('fail') || value.includes('deny') || value.includes('reject') || value === t('studentinfo.auth.fail').toLowerCase()) return 'fail'
  return 'neutral'
}

const authStatusClass = (status) => (status ? 'ok' : 'warn')

/** 字段图标映射：与 fieldLabels 的 key 对应（icon 与语言无关） */
const fieldIconMap = {
  student_id: 'badge',
  name: 'person',
  gender: 'person',
  grade: 'calendar_month',
  college: 'school',
  major: 'book',
  class_name: 'groups',
  id_number: 'credit_card',
  ethnicity: 'diversity_3',
  birth_date: 'cake',
  phone: 'smartphone',
  email: 'mail'
}
const getFieldIcon = (key) => fieldIconMap[key] || 'info'

// 学工附属信息（班导师/辅导员）字段图标：与 personKvRows 的 labelKey 对应
const personFieldIcons = {
  studentinfo_person_name: 'person',
  studentinfo_person_staffId: 'badge',
  studentinfo_person_college: 'school',
  studentinfo_person_phone: 'call',
  studentinfo_person_email: 'mail',
  studentinfo_person_office: 'meeting_room',
  studentinfo_person_remark: 'notes'
}

// 学工附属信息（宿舍）字段图标：与 dormKvRows 的 labelKey 对应
const dormFieldIcons = {
  studentinfo_dorm_campus: 'map',
  studentinfo_dorm_building: 'apartment',
  studentinfo_dorm_room: 'door_front',
  studentinfo_dorm_bed: 'bed',
  studentinfo_dorm_status: 'verified_user',
  studentinfo_dorm_remark: 'notes'
}

const getPersonFieldIcon = (labelKey) => personFieldIcons[labelKey] || 'info'
const getDormFieldIcon = (labelKey) => dormFieldIcons[labelKey] || 'info'

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
      <h1 class="header-title">{{ t('studentinfo.title') }}</h1>
      <button class="header-icon-btn" type="button" :aria-label="t('studentinfo.refresh')" :disabled="refreshing" @click="handleManualRefresh">
        <span class="material-symbols-outlined" :class="{ spinning: refreshing }">refresh</span>
      </button>
    </header>

    <div v-if="offline" class="offline-banner">
      {{ t('common.offline.prefix') }} {{ formatRelativeTime(syncTime) }}
    </div>

    <main class="view-content">
      <TEmptyState v-if="loading" type="loading" :message="t('studentinfo.loading')" />

      <TEmptyState v-else-if="error && !canShowContent" type="error" :message="error">
        <button class="btn-primary" style="margin-top: 12px" @click="refreshData">{{ t('studentinfo.retry') }}</button>
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
            <span class="profile-badge">{{ t('studentinfo.badge.undergrad') }}</span>
          </div>
        </section>

        <!-- Tabs -->
        <div class="tab-bar">
          <button class="tab-item" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">{{ t('studentinfo.tab.basic') }}</button>
          <button class="tab-item" :class="{ active: activeTab === 'login' }" @click="activeTab = 'login'">{{ t('studentinfo.tab.login') }}</button>
          <button class="tab-item" :class="{ active: activeTab === 'access' }" @click="activeTab = 'access'">{{ t('studentinfo.tab.access') }}</button>
        </div>

        <!-- Basic Info Tab -->
        <section v-show="activeTab === 'basic'" class="info-card">
          <h3 class="card-section-title">{{ t('studentinfo.section.details') }}</h3>
          <div v-if="infoError" class="inline-error">{{ infoError }}</div>
          <div class="info-grid">
            <article v-for="row in basicRows" :key="row.labelKey" class="info-field" :class="{ 'full-width': row.labelKey === 'studentinfo.field.college' }">
              <span class="field-label">
                <span class="material-symbols-outlined field-icon">{{ getFieldIcon(row.labelKey) }}</span>
                {{ t(row.labelKey) }}
              </span>
              <span class="field-value">{{ row.value }}</span>
            </article>
          </div>

          <!-- #485 班导师 / 辅导员 / 宿舍（智慧迎新只读，非阻断） -->
          <div class="orientation-blocks">
            <div class="orientation-head">
              <h3 class="card-section-title orientation-title">{{ t('studentinfo.orientation.title') }}</h3>
              <span v-if="orientationSource" class="orientation-pill">{{ orientationSource }}</span>
              <span v-if="orientationLoading" class="orientation-pill muted">{{ t('studentinfo.orientation.syncing') }}</span>
            </div>
            <p v-if="orientationNotice" class="orientation-hint">{{ orientationNotice }}</p>
            <p v-if="orientationError && !hasOrientationBlocks" class="inline-error">{{ orientationError }}</p>

            <template v-if="mentor && personKvRows(mentor).length">
              <h4 class="orientation-sub">{{ t('studentinfo.orientation.mentor') }}</h4>
              <div class="info-grid">
                <article v-for="(row, i) in personKvRows(mentor)" :key="'mt-' + i" class="info-field">
                  <span class="field-label">
                    <span class="material-symbols-outlined field-icon">{{ getPersonFieldIcon(row.labelKey) }}</span>
                    {{ t(row.labelKey) }}
                  </span>
                  <span class="field-value">{{ row.value }}</span>
                </article>
              </div>
            </template>

            <template v-if="counselor && personKvRows(counselor).length">
              <h4 class="orientation-sub">{{ t('studentinfo.orientation.counselor') }}</h4>
              <div class="info-grid">
                <article v-for="(row, i) in personKvRows(counselor)" :key="'cs-' + i" class="info-field">
                  <span class="field-label">
                    <span class="material-symbols-outlined field-icon">{{ getPersonFieldIcon(row.labelKey) }}</span>
                    {{ t(row.labelKey) }}
                  </span>
                  <span class="field-value">{{ row.value }}</span>
                </article>
              </div>
            </template>

            <template v-if="dormKvRows.length">
              <h4 class="orientation-sub">{{ t('studentinfo.orientation.dorm') }}</h4>
              <div class="info-grid">
                <article v-for="(row, i) in dormKvRows" :key="'dm-' + i" class="info-field">
                  <span class="field-label">
                    <span class="material-symbols-outlined field-icon">{{ getDormFieldIcon(row.labelKey) }}</span>
                    {{ t(row.labelKey) }}
                  </span>
                  <span class="field-value">{{ row.value }}</span>
                </article>
              </div>
            </template>

            <p
              v-if="!orientationLoading && !hasOrientationBlocks && !orientationError"
              class="orientation-hint"
            >
              {{ t('studentinfo.orientation.empty') }}
            </p>
          </div>
        </section>

        <!-- Login Tab -->
        <section v-show="activeTab === 'login'" class="info-card">
          <h3 class="card-section-title">{{ t('studentinfo.tab.login') }} & {{ t('studentinfo.tab.access') }}</h3>
          <div v-if="accessError" class="inline-error">{{ accessError }}</div>
          <div v-if="accessOffline && !accessError" class="cache-hint">
            {{ t('studentinfo.error.cacheHintPrefix') }} {{ formatRelativeTime(accessSyncTime) }}{{ t('studentinfo.error.cacheHintSuffix') }}
          </div>

          <div class="contact-list">
            <div class="contact-row">
              <div class="contact-info">
                <span class="field-label">
                  <span class="material-symbols-outlined field-icon">smartphone</span> {{ t('studentinfo.contact.phone') }}
                </span>
                <span class="field-value">{{ authInfo.phone }}</span>
              </div>
              <span class="auth-pill" :class="authInfo.phone_verified ? 'verified' : 'unverified'">
                {{ authInfo.phone_verified ? t('studentinfo.contact.verified') : t('studentinfo.contact.unverified') }}
              </span>
            </div>
            <div class="contact-row">
              <div class="contact-info">
                <span class="field-label">
                  <span class="material-symbols-outlined field-icon">mail</span> {{ t('studentinfo.contact.email') }}
                </span>
                <span class="field-value">{{ authInfo.email }}</span>
              </div>
              <span class="auth-pill" :class="authInfo.email_verified ? 'verified' : 'unverified'">
                {{ authInfo.email_verified ? t('studentinfo.contact.verified') : t('studentinfo.contact.unverified') }}
              </span>
            </div>
          </div>

          <TEmptyState v-if="currentLogins.length === 0" type="empty" :message="t('studentinfo.login.empty')" />

          <template v-else>
            <h3 class="card-section-title" style="margin-top: 1rem;">{{ t('studentinfo.login.devices') }}</h3>
            <div class="login-list">
              <article v-for="(item, index) in currentLogins" :key="`login-${index}`" class="login-card">
                <div class="login-row"><span class="login-label">{{ t('studentinfo.login.clientIp') }}</span><span class="login-value">{{ item.client_ip }}</span></div>
                <div class="login-row"><span class="login-label">{{ t('studentinfo.login.ipLocation') }}</span><span class="login-value">{{ item.ip_location }}</span></div>
                <div class="login-row"><span class="login-label">{{ t('studentinfo.login.time') }}</span><span class="login-value">{{ item.login_time }}</span></div>
                <div class="login-row"><span class="login-label">{{ t('studentinfo.login.browser') }}</span><span class="login-value">{{ item.browser }}</span></div>
              </article>
            </div>
          </template>
        </section>

        <!-- Access Tab -->
        <section v-show="activeTab === 'access'" class="info-card">
          <div v-if="accessOffline && !accessLoading" class="cache-hint">
            {{ t('studentinfo.error.cacheHintPrefix') }} {{ formatRelativeTime(accessSyncTime) }}{{ t('studentinfo.error.cacheHintSuffix') }}
          </div>
          <div v-if="accessLoading" class="inline-loading">
            <div class="mini-spinner"></div>
            <span>{{ t('studentinfo.access.loading') }}</span>
          </div>

          <TEmptyState v-if="!accessLoading && appAccessRecords.length === 0" type="empty" :message="t('studentinfo.access.empty')" />

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
              <span class="total-text">{{ tParams('studentinfo.access.total', { n: accessTotal }) }}</span>
              <div class="pager-controls">
                <button class="pager-btn" :disabled="accessPage <= 1 || accessLoading" @click="setAccessPage(accessPage - 1)">{{ t('studentinfo.access.prev') }}</button>
                <button
                  v-for="page in visiblePageNumbers"
                  :key="page"
                  class="pager-btn"
                  :disabled="accessLoading"
                  :class="{ active: page === accessPage }"
                  @click="setAccessPage(page)"
                >{{ page }}</button>
                <button class="pager-btn" :disabled="accessPage >= accessTotalPages || accessLoading" @click="setAccessPage(accessPage + 1)">{{ t('studentinfo.access.next') }}</button>
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

.header-icon-btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

.header-icon-btn .material-symbols-outlined.spinning {
  animation: refreshSpin 0.8s linear infinite;
}

@keyframes refreshSpin {
  to { transform: rotate(360deg); }
}

.header-title {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
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

.cache-hint {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.14);
  color: #92610a;
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
