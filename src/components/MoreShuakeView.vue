<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { TEmptyState, TPageHeader, TStatusBadge } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'navigate'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const loading = ref(true)
const refreshing = ref(false)
const actionKey = ref('')
const error = ref('')
const overview = ref(null)
const syncRuns = ref([])

const safeText = (value) => String(value ?? '').trim()
const safeNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const unwrapPayload = (payload) => {
  if (payload && typeof payload === 'object' && payload.data && !Array.isArray(payload.data)) {
    return payload.data
  }
  return payload
}

const resolveBadgeType = (status) => {
  const text = safeText(status).toLowerCase()
  if (/(connected|ready|已连接|可用|success|ok)/.test(text)) return 'success'
  if (/(sync|同步中|running|pending|queue)/.test(text)) return 'info'
  if (/(cache|offline|缓存|离线)/.test(text)) return 'warning'
  if (/(fail|error|expired|需登录|未连接|not|empty)/.test(text)) return 'danger'
  return 'muted'
}

const normalizePlatform = (key, value = {}) => {
  const raw = value && typeof value === 'object' ? value : {}
  const courseCount = safeNumber(raw.course_count ?? raw.courses_count ?? raw.total_courses)
  const pendingCount = safeNumber(raw.pending_count ?? raw.todo_count ?? raw.remaining_count)
  return {
    key,
    title: key === 'chaoxing' ? '学习通' : '长江雨课堂',
    desc:
      key === 'chaoxing'
        ? '复用本地学习通会话，查看课程、章节与官方进度。'
        : '通过微信扫码连接雨课堂，同步课程与视频任务进度。',
    status: safeText(raw.status || raw.connection_status || raw.state || '未连接') || '未连接',
    badgeType: resolveBadgeType(raw.status || raw.connection_status || raw.state),
    courseCount,
    pendingCount,
    lastSync: safeText(raw.last_sync || raw.sync_time || raw.updated_at || raw.last_sync_time),
    cacheState: safeText(raw.cache_status || raw.cache_state || (raw.offline ? '缓存数据' : '实时数据')) || '未知',
    offline: !!raw.offline,
    message: safeText(raw.message || raw.tip || ''),
    raw
  }
}

const platforms = computed(() => {
  const source = overview.value?.platforms
  if (Array.isArray(source)) {
    const mapped = Object.fromEntries(source.map((item) => [safeText(item?.platform), item]))
    return ['chaoxing', 'yuketang'].map((key) => normalizePlatform(key, mapped[key]))
  }
  const mapped = source && typeof source === 'object' ? source : {}
  return ['chaoxing', 'yuketang'].map((key) => normalizePlatform(key, mapped[key]))
})

const summaryChips = computed(() => {
  const raw = overview.value || {}
  return [
    {
      label: '最近同步',
      value: safeText(raw.last_sync_time || raw.sync_time || '未同步')
    },
    {
      label: '运行中任务',
      value: String(safeNumber(raw.running_count ?? raw.active_runs ?? raw.running_tasks))
    },
    {
      label: '缓存状态',
      value: safeText(raw.cache_status || raw.cache_state || '正常')
    }
  ]
})

const loadOverview = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const res = await axios.post(`${API_BASE}/v2/online_learning/overview`, {
      student_id: props.studentId || ''
    })
    const payload = res?.data || {}
    if (payload?.success === false) {
      throw new Error(payload?.error || '在线学习概览获取失败')
    }
    const data = unwrapPayload(payload)
    overview.value = data && typeof data === 'object' ? data : {}
    syncRuns.value = Array.isArray(data?.sync_runs)
      ? data.sync_runs
      : Array.isArray(data?.recent_runs)
        ? data.recent_runs
        : Array.isArray(payload?.sync_runs)
          ? payload.sync_runs
          : []
  } catch (err) {
    error.value = safeText(err?.message || err) || '在线学习概览获取失败'
  } finally {
    loading.value = false
  }
}

const refreshAll = async () => {
  refreshing.value = true
  await loadOverview({ silent: true })
  refreshing.value = false
}

const handleSyncNow = async (platform = '') => {
  actionKey.value = platform ? `sync:${platform}` : 'sync:all'
  try {
    await axios.post(`${API_BASE}/v2/online_learning/sync_now`, {
      student_id: props.studentId || '',
      platform
    })
    await loadOverview({ silent: true })
  } catch (err) {
    error.value = safeText(err?.message || err) || '同步失败'
  } finally {
    actionKey.value = ''
  }
}

const handleClearCache = async () => {
  actionKey.value = 'clear'
  try {
    await axios.post(`${API_BASE}/v2/online_learning/clear_cache`, {
      student_id: props.studentId || ''
    })
    await loadOverview({ silent: true })
  } catch (err) {
    error.value = safeText(err?.message || err) || '清理缓存失败'
  } finally {
    actionKey.value = ''
  }
}

const navigateToPlatform = (platformKey) => {
  emit('navigate', platformKey === 'chaoxing' ? 'online_learning_chaoxing' : 'online_learning_yuketang')
}

onMounted(async () => {
  await loadOverview()
})
</script>

<template>
  <div class="more-shuake-view">
    <TPageHeader title="刷课中心" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="refreshing" @click="refreshAll">↻</button>
      </template>
    </TPageHeader>

    <div class="more-shuake-view__body">
      <section class="menu-section">
        <div class="section-title">
          <span class="section-icon">📚</span>
          <span>在线学习入口</span>
        </div>
        <div class="menu-group">
          <button
            v-for="platform in platforms"
            :key="platform.key"
            class="menu-item"
            @click="navigateToPlatform(platform.key)"
          >
            <span class="menu-item__icon">{{ platform.key === 'chaoxing' ? '📖' : '🌧️' }}</span>
            <div class="menu-item__body">
              <strong>{{ platform.title }}</strong>
              <p>{{ platform.courseCount }} 门课程 · {{ platform.status }}</p>
            </div>
            <div class="menu-item__trail">
              <TStatusBadge :type="platform.badgeType" :text="platform.status" />
              <span class="menu-arrow">›</span>
            </div>
          </button>
        </div>
      </section>

      <section class="menu-section">
        <div class="section-title">
          <span class="section-icon">🔄</span>
          <span>数据同步</span>
        </div>
        <div class="menu-group">
          <div class="menu-card">
            <div class="status-row">
              <div v-for="chip in summaryChips" :key="chip.label" class="status-pill">
                <span>{{ chip.label }}</span>
                <strong>{{ chip.value }}</strong>
              </div>
            </div>
            <p v-if="error" class="error-text">{{ error }}</p>
          </div>

          <button class="menu-item" :disabled="actionKey === 'sync:all'" @click="handleSyncNow('')">
            <span class="menu-item__icon">🚀</span>
            <div class="menu-item__body">
              <strong>同步全部平台</strong>
              <p>拉取学习通和雨课堂的最新课程与进度数据</p>
            </div>
            <div class="menu-item__trail">
              <span v-if="actionKey === 'sync:all'" class="action-spinner">⏳</span>
              <span class="menu-arrow">›</span>
            </div>
          </button>

          <button class="menu-item menu-item--danger" :disabled="actionKey === 'clear'" @click="handleClearCache">
            <span class="menu-item__icon">🗑️</span>
            <div class="menu-item__body">
              <strong>清理缓存</strong>
              <p>清除在线学习缓存，下次进入自动重拉数据</p>
            </div>
            <div class="menu-item__trail">
              <span v-if="actionKey === 'clear'" class="action-spinner">⏳</span>
              <span class="menu-arrow">›</span>
            </div>
          </button>
        </div>
      </section>

      <section v-if="!loading" class="menu-section">
        <div class="section-title">
          <span class="section-icon">🧾</span>
          <span>同步记录</span>
          <span class="section-badge">{{ syncRuns.length }}</span>
        </div>
        <div class="menu-group">
          <template v-if="syncRuns.length">
            <article
              v-for="(run, index) in syncRuns.slice(0, 8)"
              :key="run.id || `${run.platform}-${index}`"
              class="run-item"
            >
              <div class="run-item__main">
                <strong>{{ run.platform_name || run.platform || '在线学习' }}</strong>
                <p>{{ run.message || run.detail || '已记录最近一次同步结果' }}</p>
              </div>
              <div class="run-item__side">
                <TStatusBadge :type="resolveBadgeType(run.status)" :text="run.status || '完成'" />
                <span>{{ run.started_at || run.sync_time || run.created_at || '-' }}</span>
              </div>
            </article>
          </template>
          <div v-else class="empty-hint">暂无同步记录</div>
        </div>
      </section>

      <TEmptyState v-if="loading" type="loading" message="正在加载刷课中心..." />
    </div>
  </div>
</template>

<style scoped>
.more-shuake-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
}

.more-shuake-view__body {
  padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
}

.menu-section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 10px;
  font-weight: 700;
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-icon {
  font-size: 16px;
}

.section-badge {
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary) 14%, transparent);
  color: var(--ui-primary);
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 800;
}

.menu-group {
  border-radius: calc(20px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 70%, #fff 10%);
  border: 1px solid rgba(148, 163, 184, 0.16);
  backdrop-filter: blur(16px);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover:not(:disabled) {
  background: color-mix(in oklab, var(--ui-primary) 5%, transparent);
}

.menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-item--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--ui-danger) 5%, transparent);
}

.menu-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 20px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-primary) 8%, var(--ui-surface) 92%);
  flex-shrink: 0;
}

.menu-item--danger .menu-item__icon {
  background: color-mix(in oklab, var(--ui-danger) 8%, var(--ui-surface) 92%);
}

.menu-item__body {
  flex: 1;
  min-width: 0;
}

.menu-item__body strong {
  display: block;
  color: var(--ui-text);
  font-size: calc(15px * var(--ui-font-scale));
  font-weight: 600;
}

.menu-item__body p {
  margin: 3px 0 0;
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-item__trail {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.menu-arrow {
  font-size: 20px;
  font-weight: 300;
  color: var(--ui-muted);
  opacity: 0.5;
}

.action-spinner {
  font-size: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.menu-card {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.status-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.status-pill {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
}

.status-pill span {
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.status-pill strong {
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-text);
  font-weight: 700;
}

.error-text {
  margin: 10px 0 0;
  color: var(--ui-danger);
  font-weight: 600;
  font-size: calc(13px * var(--ui-font-scale));
}

.run-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.run-item:last-child {
  border-bottom: none;
}

.run-item__main strong {
  display: block;
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
}

.run-item__main p {
  margin: 3px 0 0;
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.4;
}

.run-item__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.run-item__side span {
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.empty-hint {
  padding: 24px 16px;
  text-align: center;
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  color: var(--ui-text);
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.18s ease;
}

.icon-btn:hover {
  transform: translateY(-1px);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

@media (max-width: 760px) {
  .status-row {
    grid-template-columns: 1fr;
  }

  .run-item {
    flex-direction: column;
  }

  .run-item__side {
    align-items: flex-start;
    flex-direction: row;
    gap: 10px;
  }
}
</style>
