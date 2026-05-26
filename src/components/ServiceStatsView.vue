<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['back'])

const HEALTH_URL = 'https://mini-hbut-ocr-service.hf.space/health'
const REFRESH_INTERVAL_MS = 60 * 1000

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
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分钟`
  return `${minutes}分钟`
}

const formatDateTime = (value) => {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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
      latest_version_user_count: toNumber(raw?.cloud_sync?.latest_version_user_count)
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
    }
  }
}

const loading = ref(false)
const error = ref('')
const lastUpdatedAt = ref('')
const health = ref(normalizeServiceHealth())
let refreshTimer = null

const statusText = computed(() => {
  if (health.value.status === 'ok') return '运行正常'
  if (health.value.status === 'degraded') return '部分异常'
  return '状态未知'
})

const statusClass = computed(() => ({
  'is-ok': health.value.status === 'ok',
  'is-warn': health.value.status && health.value.status !== 'ok'
}))

const overviewItems = computed(() => [
  {
    label: 'OCR 今日',
    value: formatNumber(health.value.daily_usage.ocr_count),
    icon: 'document_scanner'
  },
  {
    label: '课表上传',
    value: formatNumber(health.value.daily_usage.upload_count),
    icon: 'cloud_upload'
  },
  {
    label: '给分查询',
    value: formatNumber(health.value.daily_usage.grade_dist_query_count),
    icon: 'query_stats'
  },
  {
    label: '云同步记录',
    value: formatNumber(health.value.cloud_sync.total_records),
    icon: 'database'
  },
  {
    label: '最新版本人数',
    value: formatNumber(health.value.cloud_sync.latest_version_user_count),
    icon: 'groups'
  },
  {
    label: '运行时长',
    value: health.value.service.uptime,
    icon: 'schedule'
  }
])

const archiveItems = computed(() => [
  {
    label: 'HF 私有桶',
    value: health.value.hf_bucket.enabled
      ? health.value.hf_bucket.configured ? '已启用' : '待配置'
      : '未启用'
  },
  {
    label: '写入策略',
    value: health.value.archive_status.require_before_db ? '先归档再入库' : '数据库优先兼容'
  },
  {
    label: '待重放',
    value: `${formatNumber(health.value.archive_status.pending_replay_count)} 条`
  },
  {
    label: '最近归档',
    value: formatDateTime(health.value.archive_status.last_archive_at)
  }
])

const trendRows = computed(() => health.value.trend?.last_7_days || [])
const hasTrend = computed(() => trendRows.value.length > 0)

const trendMetrics = computed(() => [
  {
    key: 'ocr_count',
    label: 'OCR',
    color: '#2563eb',
    values: trendRows.value.map((row) => row.ocr_count)
  },
  {
    key: 'upload_count',
    label: '上传',
    color: '#059669',
    values: trendRows.value.map((row) => row.upload_count)
  },
  {
    key: 'grade_dist_query_count',
    label: '给分',
    color: '#d97706',
    values: trendRows.value.map((row) => row.grade_dist_query_count)
  },
  {
    key: 'cloud_sync_total',
    label: '云同步',
    color: '#7c3aed',
    values: trendRows.value.map((row) => row.cloud_sync_total)
  },
  {
    key: 'latest_version_user_count',
    label: '最新版',
    color: '#0891b2',
    values: trendRows.value.map((row) => row.latest_version_user_count)
  }
])

const buildTrendPath = (values) => {
  if (!Array.isArray(values) || values.length === 0) return ''
  const width = 180
  const height = 56
  const max = Math.max(...values, 1)
  const step = values.length > 1 ? width / (values.length - 1) : width
  return values
    .map((value, index) => {
      const x = index * step
      const y = height - (toNumber(value) / max) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${Math.max(0, y).toFixed(2)}`
    })
    .join(' ')
}

const loadHealth = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const response = await fetch(HEALTH_URL, {
      headers: { accept: 'application/json' },
      cache: 'no-store'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    health.value = normalizeServiceHealth(data)
    lastUpdatedAt.value = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    error.value = '读取服务状态失败'
    console.warn('[ServiceStatsView] health request failed', err)
  } finally {
    loading.value = false
  }
}

const refreshNow = () => {
  void loadHealth()
}

onMounted(() => {
  void loadHealth()
  refreshTimer = setInterval(() => {
    void loadHealth({ silent: true })
  }, REFRESH_INTERVAL_MS)
})

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
      <button class="back-button" type="button" @click="emit('back')" aria-label="返回">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="header-copy">
        <span class="header-kicker">我的</span>
        <h1>服务统计</h1>
      </div>
      <button class="refresh-button" type="button" :disabled="loading" @click="refreshNow">
        <span class="material-symbols-outlined" :class="{ spinning: loading }">refresh</span>
      </button>
    </header>

    <section class="status-card">
      <div>
        <span class="status-label">OCR 服务</span>
        <div class="status-row">
          <span class="status-dot" :class="statusClass"></span>
          <strong>{{ statusText }}</strong>
        </div>
      </div>
      <div class="status-meta">
        <span>版本 {{ health.service.version || '未知' }}</span>
        <span>更新 {{ lastUpdatedAt || '等待中' }}</span>
      </div>
    </section>

    <p v-if="error" class="error-banner">{{ error }}</p>

    <section class="overview-grid" aria-label="服务总览">
      <article v-for="item in overviewItems" :key="item.label" class="metric-card">
        <span class="material-symbols-outlined metric-icon">{{ item.icon }}</span>
        <span class="metric-label">{{ item.label }}</span>
        <strong class="metric-value">{{ item.value }}</strong>
      </article>
    </section>

    <section class="archive-card">
      <div class="section-title">
        <span class="material-symbols-outlined">inventory_2</span>
        <h2>归档状态</h2>
      </div>
      <div class="archive-grid">
        <div v-for="item in archiveItems" :key="item.label" class="archive-item">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>
      <p v-if="health.archive_status.last_archive_path" class="archive-path">
        {{ health.archive_status.last_archive_path }}
      </p>
      <p v-if="health.archive_status.last_error || health.hf_bucket.last_error" class="archive-error">
        {{ health.archive_status.last_error || health.hf_bucket.last_error }}
      </p>
    </section>

    <section class="trend-card">
      <div class="section-title">
        <span class="material-symbols-outlined">stacked_line_chart</span>
        <h2>近 7 天趋势</h2>
      </div>

      <div v-if="hasTrend" class="trend-list">
        <article v-for="metric in trendMetrics" :key="metric.key" class="trend-item">
          <div class="trend-head">
            <span>{{ metric.label }}</span>
            <strong>{{ formatNumber(metric.values[metric.values.length - 1] || 0) }}</strong>
          </div>
          <svg class="trend-chart" viewBox="0 0 180 56" role="img" :aria-label="`${metric.label}趋势`">
            <path
              :d="buildTrendPath(metric.values)"
              fill="none"
              :stroke="metric.color"
              stroke-width="4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </article>
      </div>

      <div v-else class="empty-state">
        <span class="material-symbols-outlined">bar_chart_off</span>
        <p>趋势数据暂不可用</p>
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
.archive-card,
.trend-card,
.metric-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
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

.archive-card,
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

.archive-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.archive-item {
  padding: 12px;
  border-radius: 16px;
  background: #f8fafc;
}

.archive-item strong {
  display: block;
  margin-top: 6px;
  color: #0f172a;
  font-size: 14px;
}

.archive-path,
.archive-error {
  margin: 12px 0 0;
  padding: 10px;
  border-radius: 12px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.archive-path {
  background: #f1f5f9;
  color: #475569;
}

.archive-error {
  background: #fef2f2;
  color: #b91c1c;
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
  height: 56px;
  display: block;
  overflow: visible;
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
