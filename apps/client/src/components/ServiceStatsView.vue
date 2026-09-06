<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchPersonalUsageSummary } from '../utils/usage_tracker.js'
import { fetchRemotePersonalUsageSummary } from '../utils/usage_uploader.js'
import { useI18n, tf } from '../utils/app_i18n'

const props = defineProps({
  studentId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['back'])

// i18n（#794 批次 I）
const { t } = useI18n()

const HEALTH_URL = 'https://mini-hbut-ocr-service.hf.space/health'
const HEALTH_CACHE_KEY = 'hbu_service_health_cache_v1'
const HEALTH_TIMEOUT_MS = 10000
const REFRESH_INTERVAL_MS = 60 * 1000
const HEALTH_MAX_RETRIES = 2
const HEALTH_RETRY_DELAYS = [800, 1500]

const toNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const formatNumber = (value) => toNumber(value).toLocaleString('zh-CN')

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(toNumber(seconds)))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (days > 0) return tf('stats.duration.daysHours', { d: days, h: hours })
  if (hours > 0) return tf('stats.duration.hoursMinutes', { h: hours, m: minutes })
  return tf('stats.duration.minutes', { m: minutes })
}

const formatDurationMs = (ms) => formatDuration(Math.floor(toNumber(ms) / 1000))

const normalizeClientUsage = (raw = {}) => ({
  today_active_users: toNumber(raw?.today_active_users),
  today_total_events: toNumber(raw?.today_total_events),
  today_duration_hours: toNumber(raw?.today_duration_hours),
  today_app_opens: toNumber(raw?.today_app_opens),
  top_modules_today: Array.isArray(raw?.top_modules_today)
    ? raw.top_modules_today.map((item) => ({
        module_id: String(item?.module_id || '').trim(),
        open_count: toNumber(item?.open_count),
        duration_ms_total: toNumber(item?.duration_ms_total),
        remote_count: toNumber(item?.remote_count),
        local_count: toNumber(item?.local_count)
      })).filter((item) => item.module_id)
    : [],
  load_mode_split_today: raw?.load_mode_split_today && typeof raw.load_mode_split_today === 'object'
    ? raw.load_mode_split_today
    : {},
  trend_last_7_days: Array.isArray(raw?.trend_last_7_days)
    ? raw.trend_last_7_days.map((row) => ({
        date: row?.date || '',
        active_users: toNumber(row?.active_users),
        total_events: toNumber(row?.total_events),
        total_duration_ms: toNumber(row?.total_duration_ms),
        app_opens: toNumber(row?.app_opens)
      }))
    : []
})

const normalizePersonalUsage = (raw = null) => {
  if (!raw || typeof raw !== 'object') return null
  const today = raw?.today || {}
  return {
    today: {
      stat_date: today?.stat_date || '',
      open_count: toNumber(today?.open_count),
      duration_ms: toNumber(today?.duration_ms),
      module_open_count: toNumber(today?.module_open_count),
      view_open_count: toNumber(today?.view_open_count)
    },
    top_modules: Array.isArray(raw?.top_modules)
      ? raw.top_modules.map((item) => ({
          target_id: String(item?.target_id || '').trim(),
          open_count: toNumber(item?.open_count),
          duration_ms_total: toNumber(item?.duration_ms_total)
        })).filter((item) => item.target_id)
      : [],
    load_mode_split: Array.isArray(raw?.load_mode_split)
      ? raw.load_mode_split.map((item) => ({
          load_mode: String(item?.load_mode || 'native').trim() || 'native',
          open_count: toNumber(item?.open_count)
        }))
      : [],
    daily_trend: Array.isArray(raw?.daily_trend)
      ? raw.daily_trend.map((row) => ({
          stat_date: row?.stat_date || '',
          open_count: toNumber(row?.open_count),
          duration_ms: toNumber(row?.duration_ms)
        }))
      : []
  }
}

const mergePersonalUsage = (localRaw, remoteRaw) => {
  const local = normalizePersonalUsage(localRaw)
  const remote = normalizePersonalUsage(remoteRaw?.success === false ? null : remoteRaw)
  if (!local && !remote) return null
  if (!remote) return local
  if (!local) return remote
  const pickMax = (a, b) => Math.max(toNumber(a), toNumber(b))
  return {
    today: {
      stat_date: remote.today.stat_date || local.today.stat_date,
      open_count: pickMax(local.today.open_count, remote.today.open_count),
      duration_ms: pickMax(local.today.duration_ms, remote.today.duration_ms),
      module_open_count: pickMax(local.today.module_open_count, remote.today.module_open_count),
      view_open_count: pickMax(local.today.view_open_count, remote.today.view_open_count)
    },
    top_modules: remote.top_modules.length ? remote.top_modules : local.top_modules,
    load_mode_split: remote.load_mode_split.length ? remote.load_mode_split : local.load_mode_split,
    daily_trend: remote.daily_trend.length ? remote.daily_trend : local.daily_trend
  }
}

const normalizeTrendRows = (rows) => {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
    date: row?.date || '',
    ocr_count: toNumber(row?.ocr_count),
    upload_count: toNumber(row?.upload_count),
    grade_dist_query_count: toNumber(row?.grade_dist_query_count),
    cloud_sync_total: toNumber(row?.cloud_sync_total),
    latest_version_user_count: toNumber(row?.latest_version_user_count),
    latest_version: row?.latest_version || ''
  }))
}

const normalizeServiceHealth = (raw = {}) => {
  const trendRows = normalizeTrendRows(raw?.trend?.last_7_days)
  const uptimeSeconds = toNumber(raw?.service?.uptime_seconds)
  const archiveStatus = raw?.archive_status || {}
  const hfBucket = raw?.hf_bucket || {}

  return {
    status: raw?.status || 'unknown',
    service: {
      started_at: raw?.service?.started_at || '',
      uptime_seconds: uptimeSeconds,
      uptime: raw?.service?.uptime || formatDuration(uptimeSeconds),
      version: raw?.service?.version || ''
    },
    daily_usage: {
      date: raw?.daily_usage?.date || '',
      ocr_count: toNumber(raw?.daily_usage?.ocr_count),
      upload_count: toNumber(raw?.daily_usage?.upload_count),
      grade_dist_query_count: toNumber(raw?.daily_usage?.grade_dist_query_count)
    },
    cloud_sync: {
      total_records: toNumber(raw?.cloud_sync?.total_records),
      latest_version: raw?.cloud_sync?.latest_version || '',
      latest_version_user_count: toNumber(raw?.cloud_sync?.latest_version_user_count),
      version_user_counts: Array.isArray(raw?.cloud_sync?.version_user_counts)
        ? raw.cloud_sync.version_user_counts.map((item) => ({
            version: String(item?.version || '').trim(),
            user_count: toNumber(item?.user_count)
          })).filter((item) => item.version)
        : []
    },
    trend: {
      last_7_days: trendRows
    },
    hf_bucket: {
      enabled: Boolean(hfBucket.enabled),
      configured: Boolean(hfBucket.configured),
      bucket_id: hfBucket.bucket_id || '',
      last_error: hfBucket.last_error || ''
    },
    archive_status: {
      enabled: Boolean(archiveStatus.enabled),
      require_before_db: Boolean(archiveStatus.require_before_db),
      pending_replay_count: toNumber(archiveStatus.pending_replay_count),
      last_archive_at: archiveStatus.last_archive_at || '',
      last_archive_path: archiveStatus.last_archive_path || '',
      last_error: archiveStatus.last_error || ''
    },
    client_usage: normalizeClientUsage(raw?.client_usage || {})
  }
}

const loading = ref(false)
const error = ref('')
const lastUpdatedAt = ref('')
const health = ref(normalizeServiceHealth())
const personalUsage = ref(null)
const personalLoading = ref(false)
let refreshTimer = null
let healthRequestSeq = 0

const loadPersonalUsage = async () => {
  const sid = String(props.studentId || '').trim()
  if (!sid) {
    personalUsage.value = null
    return
  }
  personalLoading.value = true
  try {
    const [localSummary, remoteSummary] = await Promise.all([
      fetchPersonalUsageSummary(sid),
      fetchRemotePersonalUsageSummary(sid)
    ])
    personalUsage.value = mergePersonalUsage(localSummary, remoteSummary)
  } catch {
    personalUsage.value = null
  } finally {
    personalLoading.value = false
  }
}

const readCachedHealth = () => {
  try {
    const raw = localStorage.getItem(HEALTH_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.data) return null
    return parsed
  } catch {
    return null
  }
}

const writeCachedHealth = (data) => {
  try {
    localStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify({
      data,
      cachedAt: Date.now()
    }))
  } catch {
    // ignore
  }
}

const buildHealthSignal = () => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(HEALTH_TIMEOUT_MS)
  }
  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  return controller.signal
}

const applyHealthData = (data, updatedAt = Date.now()) => {
  health.value = normalizeServiceHealth(data)
  lastUpdatedAt.value = new Date(updatedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const statusText = computed(() => {
  if (health.value.status === 'ok') return t('stats.status.ok')
  if (health.value.status === 'degraded') return t('stats.status.degraded')
  return t('stats.status.unknown')
})

const statusClass = computed(() => ({
  'is-ok': health.value.status === 'ok',
  'is-warn': health.value.status && health.value.status !== 'ok'
}))

const displayClientVersion = computed(() => health.value.cloud_sync.latest_version || '')

const clientUsage = computed(() => health.value.client_usage || normalizeClientUsage())

const hasClientUsage = computed(() => (
  clientUsage.value.today_total_events > 0
  || clientUsage.value.today_active_users > 0
  || clientUsage.value.top_modules_today.length > 0
))

const loadModeLabel = (mode) => {
  const key = String(mode || '').trim()
  if (key === 'remote-site') return t('stats.loadMode.remoteSite')
  if (key === 'tauri-local' || key === 'capacitor-local') return t('stats.loadMode.local')
  if (key === 'native') return t('stats.loadMode.native')
  return key || t('common.unknown')
}

const personalOverviewItems = computed(() => {
  const today = personalUsage.value?.today
  if (!today) return []
  return [
    { label: t('stats.metric.todayOpens'), value: formatNumber(today.open_count), icon: 'touch_app' },
    { label: t('stats.metric.todayDurationMs'), value: formatDurationMs(today.duration_ms), icon: 'schedule' },
    { label: t('stats.metric.moduleOpens'), value: formatNumber(today.module_open_count), icon: 'extension' },
    { label: t('stats.metric.viewOpens'), value: formatNumber(today.view_open_count), icon: 'web' }
  ]
})

const globalUsageOverviewItems = computed(() => [
  { label: t('stats.metric.todayActive'), value: formatNumber(clientUsage.value.today_active_users), icon: 'groups' },
  { label: t('stats.metric.todayEvents'), value: formatNumber(clientUsage.value.today_total_events), icon: 'analytics' },
  { label: t('stats.metric.todayDuration'), value: tf('stats.hoursSuffix', { n: clientUsage.value.today_duration_hours.toFixed(1) }), icon: 'timer' },
  { label: t('stats.metric.appOpens'), value: formatNumber(clientUsage.value.today_app_opens), icon: 'smartphone' }
])

const loadModeSplitRows = computed(() => {
  const split = clientUsage.value.load_mode_split_today || {}
  return Object.entries(split)
    .map(([mode, count]) => ({
      mode,
      label: loadModeLabel(mode),
      open_count: toNumber(count)
    }))
    .filter((item) => item.open_count > 0)
    .sort((a, b) => b.open_count - a.open_count)
})

const personalLoadModeRows = computed(() => personalUsage.value?.load_mode_split || [])

const hasPersonalUsage = computed(() => Boolean(personalUsage.value?.today))

const overviewItems = computed(() => [
  {
    label: t('stats.metric.ocrToday'),
    value: formatNumber(health.value.daily_usage.ocr_count),
    icon: 'document_scanner'
  },
  {
    label: t('stats.metric.uploadToday'),
    value: formatNumber(health.value.daily_usage.upload_count),
    icon: 'cloud_upload'
  },
  {
    label: t('stats.metric.gradeQueryToday'),
    value: formatNumber(health.value.daily_usage.grade_dist_query_count),
    icon: 'query_stats'
  },
  {
    label: t('stats.metric.cloudSyncRecords'),
    value: formatNumber(health.value.cloud_sync.total_records),
    icon: 'database'
  },
  {
    label: t('stats.metric.latestVersionUsers'),
    value: formatNumber(health.value.cloud_sync.latest_version_user_count),
    icon: 'groups'
  },
  {
    label: t('stats.metric.uptime'),
    value: health.value.service.uptime,
    icon: 'schedule'
  }
])

const trendRows = computed(() => health.value.trend?.last_7_days || [])
const hasTrend = computed(() => trendRows.value.length > 0)

const versionUserCounts = computed(() => health.value.cloud_sync.version_user_counts || [])
const hasVersionUserCounts = computed(() => versionUserCounts.value.length > 0)

const trendMetrics = computed(() => [
  {
    key: 'ocr_count',
    label: 'OCR',
    color: '#2563eb',
    values: trendRows.value.map((row) => row.ocr_count)
  },
  {
    key: 'upload_count',
    label: t('stats.trend.upload'),
    color: '#059669',
    values: trendRows.value.map((row) => row.upload_count)
  },
  {
    key: 'grade_dist_query_count',
    label: t('stats.trend.gradeDist'),
    color: '#d97706',
    values: trendRows.value.map((row) => row.grade_dist_query_count)
  },
  {
    key: 'cloud_sync_total',
    label: t('stats.trend.cloudSync'),
    color: '#7c3aed',
    values: trendRows.value.map((row) => row.cloud_sync_total)
  },
  {
    key: 'latest_version_user_count',
    label: t('stats.metric.latestVersionUsers'),
    color: '#0891b2',
    values: trendRows.value.map((row) => row.latest_version_user_count),
    axisLabelKey: 'latest_version'
  }
])

const CHART_WIDTH = 220
const CHART_HEIGHT = 92
const CHART_PADDING = {
  top: 10,
  right: 10,
  bottom: 20,
  left: 38
}

const formatAxisValue = (value) => {
  const number = toNumber(value)
  if (Math.abs(number) >= 10000) return tf('stats.axis.tenThousand', { n: (number / 10000).toFixed(1).replace(/\.0$/, '') })
  return formatNumber(Math.round(number))
}

const formatAxisDate = (value) => {
  const text = String(value || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(5).replace('-', '/')
  return text || '-'
}

const formatAxisVersion = (value) => {
  const text = String(value || '').trim()
  return text || '-'
}

const buildTrendChart = (values, axisLabelKey = 'date') => {
  const safeValues = Array.isArray(values) ? values.map((value) => toNumber(value)) : []
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  if (!safeValues.length) {
    return {
      path: '',
      points: [],
      axisTicks: [],
      dateTicks: [],
      min: 0,
      max: 0
    }
  }

  const rawMin = Math.min(...safeValues)
  const rawMax = Math.max(...safeValues)
  const range = rawMax - rawMin
  const padding = range > 0 ? range * 0.12 : Math.max(rawMax * 0.18, 1)
  const min = Math.max(0, rawMin - padding)
  const max = rawMax + padding
  const span = Math.max(max - min, 1)
  const step = safeValues.length > 1 ? plotWidth / (safeValues.length - 1) : plotWidth
  const points = safeValues.map((value, index) => {
    const x = CHART_PADDING.left + (safeValues.length > 1 ? index * step : plotWidth / 2)
    const y = CHART_PADDING.top + ((max - value) / span) * plotHeight
    return { x, y, value }
  })
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const axisTicks = [max, min + span / 2, min].map((value) => ({
    value,
    label: formatAxisValue(value),
    y: CHART_PADDING.top + ((max - value) / span) * plotHeight
  }))
  const dateSource = trendRows.value
  const formatAxisLabel = axisLabelKey === 'latest_version' ? formatAxisVersion : formatAxisDate
  const labelField = axisLabelKey === 'latest_version' ? 'latest_version' : 'date'
  const dateTicks = points
    .map((point, index) => ({
      x: point.x,
      label: formatAxisLabel(dateSource[index]?.[labelField])
    }))
    .filter((_, index) => index === 0 || index === points.length - 1)

  return {
    path,
    points,
    axisTicks,
    dateTicks,
    min,
    max
  }
}

const loadHealth = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  error.value = ''
  // 竞态保护：只接受最新一次请求的结果
  const seq = ++healthRequestSeq
  let lastErr = null
  for (let attempt = 0; attempt <= HEALTH_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(HEALTH_URL, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: buildHealthSignal()
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      // 竞态保护：过期请求的结果丢弃
      if (seq !== healthRequestSeq) return
      writeCachedHealth(data)
      applyHealthData(data)
      if (!silent) loading.value = false
      return
    } catch (err) {
      lastErr = err
      // 最后一次尝试不再等待
      if (attempt < HEALTH_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_DELAYS[attempt] || 1500))
        // 等待期间若已有更新请求发起，则放弃当前重试
        if (seq !== healthRequestSeq) return
      }
    }
  }
  // 全部重试失败
  if (seq !== healthRequestSeq) return
  const cached = readCachedHealth()
  if (cached?.data) {
    applyHealthData(cached.data, cached.cachedAt)
    error.value = t('stats.error.showingCached')
  } else {
    error.value = t('stats.error.readFailed')
  }
  console.warn('[ServiceStatsView] health request failed after retries', lastErr)
  if (!silent) loading.value = false
}

const refreshNow = () => {
  void loadHealth()
  void loadPersonalUsage()
}

onMounted(() => {
  void loadHealth()
  void loadPersonalUsage()
  refreshTimer = setInterval(() => {
    void loadHealth({ silent: true })
  }, REFRESH_INTERVAL_MS)
})

watch(
  () => props.studentId,
  () => {
    void loadPersonalUsage()
  }
)

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <div class="service-stats-view">
    <header class="stats-header">
      <button class="back-button" type="button" @click="emit('back')" :aria-label="t('stats.back')">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="header-copy">
        <span class="header-kicker">{{ t('stats.kicker') }}</span>
        <h1>{{ t('stats.title') }}</h1>
      </div>
      <button class="refresh-button" type="button" :disabled="loading" @click="refreshNow">
        <span class="material-symbols-outlined" :class="{ spinning: loading }">refresh</span>
      </button>
    </header>

    <section class="status-card">
      <div>
        <span class="status-label">{{ t('stats.ocrService') }}</span>
        <div class="status-row">
          <span class="status-dot" :class="statusClass"></span>
          <strong>{{ statusText }}</strong>
        </div>
      </div>
      <div class="status-meta">
        <span>{{ tf('stats.version', { version: displayClientVersion || t('common.unknown') }) }}</span>
        <span>{{ tf('stats.updatedAt', { time: lastUpdatedAt || t('stats.waiting') }) }}</span>
      </div>
    </section>

    <p v-if="error" class="error-banner">{{ error }}</p>

    <section class="overview-grid" :aria-label="t('stats.title')">
      <article v-for="item in overviewItems" :key="item.label" class="metric-card">
        <span class="material-symbols-outlined metric-icon">{{ item.icon }}</span>
        <span class="metric-label">{{ item.label }}</span>
        <strong class="metric-value">{{ item.value }}</strong>
      </article>
    </section>

    <section v-if="hasPersonalUsage" class="usage-card" :aria-label="t('stats.section.mine')">
      <div class="section-title">
        <span class="material-symbols-outlined">person</span>
        <h2>{{ t('stats.section.mine') }}</h2>
      </div>
      <div class="overview-grid personal-grid">
        <article v-for="item in personalOverviewItems" :key="item.label" class="metric-card">
          <span class="material-symbols-outlined metric-icon">{{ item.icon }}</span>
          <span class="metric-label">{{ item.label }}</span>
          <strong class="metric-value">{{ item.value }}</strong>
        </article>
      </div>
      <ul v-if="personalUsage?.top_modules?.length" class="version-list">
        <li v-for="item in personalUsage.top_modules" :key="item.target_id" class="version-row">
          <span class="version-name">{{ item.target_id }}</span>
          <strong class="version-count">{{ tf('stats.countSuffix', { n: formatNumber(item.open_count) }) }}</strong>
        </li>
      </ul>
      <ul v-if="personalLoadModeRows.length" class="version-list">
        <li v-for="item in personalLoadModeRows" :key="item.load_mode" class="version-row">
          <span class="version-name">{{ loadModeLabel(item.load_mode) }}</span>
          <strong class="version-count">{{ formatNumber(item.open_count) }}</strong>
        </li>
      </ul>
      <p v-else-if="personalLoading" class="empty-hint">{{ t('common.empty.loading') }}</p>
    </section>

    <section v-if="hasClientUsage" class="usage-card" :aria-label="t('stats.section.global')">
      <div class="section-title">
        <span class="material-symbols-outlined">public</span>
        <h2>{{ t('stats.section.global') }}</h2>
      </div>
      <div class="overview-grid personal-grid">
        <article v-for="item in globalUsageOverviewItems" :key="item.label" class="metric-card">
          <span class="material-symbols-outlined metric-icon">{{ item.icon }}</span>
          <span class="metric-label">{{ item.label }}</span>
          <strong class="metric-value">{{ item.value }}</strong>
        </article>
      </div>
      <ul v-if="clientUsage.top_modules_today.length" class="version-list">
        <li v-for="item in clientUsage.top_modules_today" :key="item.module_id" class="version-row">
          <span class="version-name">{{ item.module_id }}</span>
          <strong class="version-count">{{ tf('stats.countSuffix', { n: formatNumber(item.open_count) }) }}</strong>
        </li>
      </ul>
      <ul v-if="loadModeSplitRows.length" class="version-list">
        <li v-for="item in loadModeSplitRows" :key="item.mode" class="version-row">
          <span class="version-name">{{ item.label }}</span>
          <strong class="version-count">{{ formatNumber(item.open_count) }}</strong>
        </li>
      </ul>
    </section>

    <section v-if="hasVersionUserCounts" class="version-card" :aria-label="t('stats.section.versionUsers')">
      <div class="section-title">
        <span class="material-symbols-outlined">devices</span>
        <h2>{{ t('stats.section.versionUsers') }}</h2>
      </div>
      <ul class="version-list">
        <li v-for="item in versionUserCounts" :key="item.version" class="version-row">
          <span class="version-name">{{ item.version }}</span>
          <strong class="version-count">{{ formatNumber(item.user_count) }}</strong>
        </li>
      </ul>
    </section>

    <section class="trend-card">
      <div class="section-title">
        <span class="material-symbols-outlined">stacked_line_chart</span>
        <h2>{{ t('stats.section.trend') }}</h2>
      </div>

      <div v-if="hasTrend" class="trend-list">
        <article v-for="metric in trendMetrics" :key="metric.key" class="trend-item">
          <div class="trend-head">
            <span>{{ metric.label }}</span>
            <strong>{{ formatNumber(metric.values[metric.values.length - 1] || 0) }}</strong>
          </div>
          <svg
            class="trend-chart"
            :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
            role="img"
            :aria-label="tf('stats.trend.ariaLabel', { label: metric.label })"
          >
            <template v-for="tick in buildTrendChart(metric.values, metric.axisLabelKey).axisTicks" :key="`${metric.key}-${tick.label}`">
              <line
                class="trend-grid-line"
                :x1="CHART_PADDING.left"
                :x2="CHART_WIDTH - CHART_PADDING.right"
                :y1="tick.y"
                :y2="tick.y"
              />
              <text class="trend-axis-label" x="4" :y="tick.y + 4">{{ tick.label }}</text>
            </template>
            <text
              v-for="tick in buildTrendChart(metric.values, metric.axisLabelKey).dateTicks"
              :key="`${metric.key}-${tick.label}`"
              class="trend-date-label"
              :x="tick.x"
              :y="CHART_HEIGHT - 4"
              text-anchor="middle"
            >
              {{ tick.label }}
            </text>
            <path
              :d="buildTrendChart(metric.values, metric.axisLabelKey).path"
              class="trend-line drawTrendLine"
              fill="none"
              :stroke="metric.color"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              pathLength="1"
              stroke-dasharray="1"
              stroke-dashoffset="1"
            />
            <circle
              v-for="point in buildTrendChart(metric.values, metric.axisLabelKey).points"
              :key="`${metric.key}-${point.x}`"
              class="trend-point"
              :cx="point.x"
              :cy="point.y"
              r="2.8"
              :fill="metric.color"
            />
          </svg>
        </article>
      </div>

      <div v-else class="empty-state">
        <span class="material-symbols-outlined">bar_chart_off</span>
        <p>{{ t('stats.trend.empty') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.service-stats-view {
  min-height: 100vh;
  padding: 16px 16px calc(110px + env(safe-area-inset-bottom));
  background: #f6f8fb;
  color: #172033;
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.back-button,
.refresh-button {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 14px;
  background: #ffffff;
  color: #1f2937;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.refresh-button:disabled {
  opacity: 0.6;
}

.header-copy {
  flex: 1;
  min-width: 0;
}

.header-kicker {
  display: block;
  margin-bottom: 2px;
  color: #64748b;
  font-size: 12px;
}

.header-copy h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  color: #0f172a;
}

.status-card,
.version-card,
.usage-card,
.trend-card,
.metric-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
}

.version-card {
  padding: 16px;
  border-radius: 22px;
  margin-bottom: 12px;
}

.usage-card {
  padding: 16px;
  border-radius: 22px;
  margin-bottom: 12px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
}

.personal-grid {
  margin-bottom: 8px;
}

.empty-hint {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fafc;
}

.version-name {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.version-count {
  font-size: 15px;
  color: #0f172a;
}

.status-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 22px;
  margin-bottom: 12px;
}

.status-label,
.metric-label,
.archive-item span {
  color: #64748b;
  font-size: 12px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 18px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #94a3b8;
}

.status-dot.is-ok {
  background: #16a34a;
}

.status-dot.is-warn {
  background: #f59e0b;
}

.status-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.error-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.metric-card {
  min-height: 112px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px;
  border-radius: 20px;
}

.metric-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #eef6ff;
  color: #2563eb;
}

.metric-value {
  margin-top: 8px;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.trend-card {
  padding: 16px;
  border-radius: 22px;
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #0f172a;
}

.section-title h2 {
  margin: 0;
  font-size: 16px;
}

.trend-list {
  display: grid;
  gap: 10px;
}

.trend-item {
  padding: 12px;
  border-radius: 16px;
  background: #f8fafc;
}

.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: #475569;
}

.trend-head strong {
  color: #0f172a;
}

.trend-chart {
  width: 100%;
  height: 92px;
  display: block;
  overflow: visible;
}

.trend-grid-line {
  stroke: rgba(148, 163, 184, 0.32);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.trend-axis-label,
.trend-date-label {
  fill: #94a3b8;
  font-size: 10px;
}

.trend-line {
  animation: drawTrendLine 0.9s ease-out forwards;
}

.trend-point {
  opacity: 0;
  animation: fadeTrendPoint 0.35s ease-out forwards;
  animation-delay: 0.65s;
}

@keyframes drawTrendLine {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes fadeTrendPoint {
  to {
    opacity: 1;
  }
}

.empty-state {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 18px;
  background: #f8fafc;
  color: #64748b;
}

.empty-state p {
  margin: 0;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 720px) {
  .service-stats-view {
    max-width: 760px;
    margin: 0 auto;
  }

  .overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .trend-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
