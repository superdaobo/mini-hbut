<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { TEmptyState, TPageHeader, TStatusBadge } from './templates'
import {
  hasDailyAccessGrant,
  markDailyAccessGranted,
  sanitizeDailyAccessInput,
  verifyDailyAccessKey
} from '../utils/daily_access_key.js'
import {
  fetchModuleCatalog,
  fetchModuleManifest,
  getLocalModuleState,
  prepareAndOpenModule,
  resolveModuleChannel
} from '../utils/more_modules.js'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'navigate'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const MODULE_IDS = Object.freeze(['hecheng_hugongda', 'hugongda_escape'])
const LOCAL_MODULES = Object.freeze([
  {
    id: 'shuake',
    name: '刷课',
    icon: '🔐',
    description: '进入刷课中心（每日秘钥）',
    key_required: true,
    kind: 'internal',
    order: 1
  }
])

const REMOTE_MODULE_FALLBACKS = Object.freeze([
  {
    id: 'hecheng_hugongda',
    name: '合成湖工大',
    icon: '🎮',
    description: '下载最新游戏包并打开',
    key_required: false,
    kind: 'remote',
    order: 2
  },
  {
    id: 'hugongda_escape',
    name: '湖工大逃生',
    icon: '🧭',
    description: '下载最新逃生包并打开',
    key_required: false,
    kind: 'remote',
    order: 3
  }
])

const loading = ref(true)
const refreshing = ref(false)
const actionKey = ref('')
const error = ref('')
const overview = ref(null)
const syncRuns = ref([])

const moduleLoading = ref(true)
const moduleError = ref('')
const moduleChannel = ref('main')
const remoteModules = ref([])
const moduleStates = ref({})
const moduleBusyKey = ref('')

const brushUnlocked = ref(hasDailyAccessGrant())
const showBrushKeyDialog = ref(false)
const brushKeyInput = ref('')
const brushKeyError = ref('')

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

const moduleCards = computed(() => {
  const remoteMap = new Map((remoteModules.value || []).map((item) => [item.id, item]))
  const remote = REMOTE_MODULE_FALLBACKS.map((fallback) => {
    const found = remoteMap.get(fallback.id)
    return {
      ...fallback,
      ...(found || {}),
      kind: 'remote'
    }
  })
  return [...LOCAL_MODULES, ...remote].sort((a, b) => (a.order || 0) - (b.order || 0))
})

const readModuleState = (moduleId) => {
  const map = moduleStates.value || {}
  return map[moduleId] && typeof map[moduleId] === 'object'
    ? map[moduleId]
    : { status: 'not_downloaded', message: '' }
}

const setModuleState = (moduleId, patch) => {
  moduleStates.value = {
    ...moduleStates.value,
    [moduleId]: {
      ...(readModuleState(moduleId) || {}),
      ...(patch && typeof patch === 'object' ? patch : {})
    }
  }
}

const bootstrapModuleState = () => {
  for (const item of moduleCards.value) {
    const current = readModuleState(item.id)
    if (current.status && current.status !== 'not_downloaded') continue
    if (item.id === 'shuake') {
      setModuleState(item.id, {
        status: brushUnlocked.value ? 'ready' : 'locked',
        message: brushUnlocked.value ? '今日已解锁' : '点击输入今日秘钥'
      })
      continue
    }
    const local = getLocalModuleState(item.id)
    if (safeText(local?.version)) {
      setModuleState(item.id, {
        status: 'ready',
        version: safeText(local.version),
        message: '本地缓存可用'
      })
    } else {
      setModuleState(item.id, { status: 'not_downloaded', message: '首次使用需下载' })
    }
  }
}

const resolveModuleBadgeType = (module, state) => {
  if (module.id === 'shuake') return brushUnlocked.value ? 'success' : 'warning'
  const status = safeText(state?.status)
  if (status === 'ready') return 'success'
  if (status === 'checking' || status === 'downloading') return 'info'
  if (status === 'failed') return 'danger'
  if (status === 'locked') return 'warning'
  return 'muted'
}

const resolveModuleStatusText = (module, state) => {
  if (module.id === 'shuake') return brushUnlocked.value ? '已解锁' : '需秘钥'
  const status = safeText(state?.status)
  if (status === 'checking') return '检查更新'
  if (status === 'downloading') return '下载中'
  if (status === 'ready') return '已就绪'
  if (status === 'failed') return '打开失败'
  return '未下载'
}

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

const loadModuleCatalog = async ({ silent = false } = {}) => {
  if (!silent) moduleLoading.value = true
  moduleError.value = ''
  try {
    const preferredChannel = await resolveModuleChannel()
    const payload = await fetchModuleCatalog(preferredChannel)
    moduleChannel.value = payload.channel
    remoteModules.value = (payload.catalog?.modules || []).filter((item) => MODULE_IDS.includes(item.id))
  } catch (err) {
    moduleError.value = safeText(err?.message || err) || '模块清单获取失败'
    remoteModules.value = []
  } finally {
    moduleLoading.value = false
    bootstrapModuleState()
  }
}

const refreshAll = async () => {
  refreshing.value = true
  await Promise.all([loadOverview({ silent: true }), loadModuleCatalog({ silent: true })])
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

const openBrushKeyDialog = () => {
  showBrushKeyDialog.value = true
  brushKeyInput.value = ''
  brushKeyError.value = ''
}

const closeBrushKeyDialog = () => {
  showBrushKeyDialog.value = false
  brushKeyInput.value = ''
  brushKeyError.value = ''
}

const submitBrushKey = () => {
  const normalized = sanitizeDailyAccessInput(brushKeyInput.value)
  brushKeyInput.value = normalized
  if (!verifyDailyAccessKey(normalized)) {
    brushKeyError.value = '秘钥无效，请输入当天秘钥'
    return
  }
  markDailyAccessGranted()
  brushUnlocked.value = true
  setModuleState('shuake', { status: 'ready', message: '今日已解锁' })
  closeBrushKeyDialog()
  emit('navigate', 'online_learning_chaoxing')
}

const handleOpenBrushModule = () => {
  brushUnlocked.value = hasDailyAccessGrant()
  if (!brushUnlocked.value) {
    setModuleState('shuake', { status: 'locked', message: '点击输入今日秘钥' })
    openBrushKeyDialog()
    return
  }
  setModuleState('shuake', { status: 'ready', message: '今日已解锁' })
  emit('navigate', 'online_learning_chaoxing')
}

const handleOpenRemoteModule = async (moduleItem) => {
  const moduleId = safeText(moduleItem?.id)
  if (!moduleId) return

  if (!safeText(moduleItem?.manifest_url)) {
    setModuleState(moduleId, { status: 'failed', message: '模块清单未发布' })
    return
  }

  moduleBusyKey.value = moduleId
  setModuleState(moduleId, { status: 'checking', message: '检查更新中' })
  try {
    const manifest = await fetchModuleManifest(moduleItem.manifest_url)
    setModuleState(moduleId, {
      status: 'downloading',
      message: '下载并准备本地包',
      version: safeText(manifest.version)
    })
    const launched = await prepareAndOpenModule({
      channel: moduleChannel.value,
      moduleInfo: moduleItem,
      manifest
    })
    setModuleState(moduleId, {
      status: 'ready',
      message:
        launched.launch_mode === 'cache'
          ? '已从本地缓存打开'
          : launched.launch_mode === 'local'
            ? '已从本地包打开'
            : '已从官网页面打开',
      version: safeText(launched.version || manifest.version)
    })
  } catch (err) {
    setModuleState(moduleId, {
      status: 'failed',
      message: safeText(err?.message || err) || '模块打开失败'
    })
  } finally {
    moduleBusyKey.value = ''
  }
}

const handleModuleClick = async (moduleItem) => {
  if (!moduleItem) return
  if (moduleItem.id === 'shuake') {
    handleOpenBrushModule()
    return
  }
  await handleOpenRemoteModule(moduleItem)
}

onMounted(async () => {
  await Promise.all([loadOverview(), loadModuleCatalog()])
  bootstrapModuleState()
})
</script>

<template>
  <div class="more-view">
    <TPageHeader title="更多" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="refreshing" @click="refreshAll">
          ↻
        </button>
      </template>
    </TPageHeader>

    <div class="more-view__body">
      <section class="menu-section">
        <div class="section-title">
          <span class="section-icon">🧩</span>
          <span>模块中心</span>
          <span class="section-subtitle">2列布局</span>
        </div>
        <div class="module-grid">
          <button
            v-for="item in moduleCards"
            :key="item.id"
            class="module-card"
            :disabled="moduleBusyKey === item.id"
            @click="handleModuleClick(item)"
          >
            <div class="module-card__head">
              <span class="module-card__icon">{{ item.icon || '📦' }}</span>
              <TStatusBadge
                :type="resolveModuleBadgeType(item, readModuleState(item.id))"
                :text="resolveModuleStatusText(item, readModuleState(item.id))"
              />
            </div>
            <div class="module-card__body">
              <strong>{{ item.name }}</strong>
              <p>{{ item.description || '模块说明缺失' }}</p>
            </div>
            <div class="module-card__foot">
              <span v-if="readModuleState(item.id).version">v{{ readModuleState(item.id).version }}</span>
              <span v-else>渠道 {{ moduleChannel }}</span>
              <small>{{ readModuleState(item.id).message || '点击进入' }}</small>
            </div>
          </button>
        </div>
        <p v-if="moduleError" class="error-text">{{ moduleError }}</p>
      </section>

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
              v-for="(run, index) in syncRuns.slice(0, 6)"
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

      <TEmptyState v-if="loading || moduleLoading" type="loading" message="正在加载更多模块..." />
    </div>

    <div v-if="showBrushKeyDialog" class="daily-key-overlay" @click.self="closeBrushKeyDialog">
      <div class="daily-key-dialog">
        <h3>刷课模块秘钥</h3>
        <p>请输入今日秘钥后进入刷课中心。</p>
        <input
          v-model="brushKeyInput"
          type="text"
          maxlength="11"
          inputmode="latin"
          autocomplete="off"
          placeholder="例如 ABCDE-12345"
          @input="brushKeyInput = sanitizeDailyAccessInput(brushKeyInput)"
          @keyup.enter="submitBrushKey"
        />
        <p v-if="brushKeyError" class="dialog-error">{{ brushKeyError }}</p>
        <div class="dialog-actions">
          <button type="button" class="dialog-btn ghost" @click="closeBrushKeyDialog">取消</button>
          <button type="button" class="dialog-btn primary" @click="submitBrushKey">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.more-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
}

.more-view__body {
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

.section-subtitle {
  margin-left: auto;
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 700;
  color: color-mix(in oklab, var(--ui-primary) 80%, white 20%);
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

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.module-card {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: calc(18px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 74%, #fff 10%);
  backdrop-filter: blur(16px);
  padding: 12px;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.module-card:not(:disabled):hover {
  transform: translateY(-1px);
  border-color: color-mix(in oklab, var(--ui-primary) 36%, transparent);
}

.module-card:disabled {
  opacity: 0.7;
}

.module-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.module-card__icon {
  width: 34px;
  height: 34px;
  border-radius: calc(10px * var(--ui-radius-scale));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: color-mix(in oklab, var(--ui-primary) 10%, var(--ui-surface) 90%);
}

.module-card__body {
  flex: 1;
}

.module-card__body strong {
  display: block;
  color: var(--ui-text);
  font-size: calc(15px * var(--ui-font-scale));
}

.module-card__body p {
  margin: 5px 0 0;
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.35;
}

.module-card__foot {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.module-card__foot > span {
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.module-card__foot > small {
  color: var(--ui-text-secondary, var(--ui-muted));
  font-size: calc(11px * var(--ui-font-scale));
  line-height: 1.25;
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

.daily-key-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 15, 24, 0.44);
  backdrop-filter: blur(3px);
}

.daily-key-dialog {
  width: min(420px, 100%);
  background: var(--ui-surface);
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: calc(18px * var(--ui-radius-scale));
  box-shadow: 0 20px 44px rgba(0, 0, 0, 0.22);
  padding: 18px;
}

.daily-key-dialog h3 {
  margin: 0;
  font-size: calc(17px * var(--ui-font-scale));
  color: var(--ui-text);
}

.daily-key-dialog p {
  margin: 8px 0 0;
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.45;
}

.daily-key-dialog input {
  width: 100%;
  margin-top: 12px;
  height: 42px;
  border-radius: calc(12px * var(--ui-radius-scale));
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: color-mix(in oklab, var(--ui-surface) 95%, #fff 5%);
  color: var(--ui-text);
  padding: 0 12px;
  font-size: calc(14px * var(--ui-font-scale));
  letter-spacing: 1px;
}

.dialog-error {
  margin-top: 8px;
  color: var(--ui-danger);
  font-size: calc(12px * var(--ui-font-scale));
}

.dialog-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-btn {
  min-width: 88px;
  height: 36px;
  border-radius: calc(10px * var(--ui-radius-scale));
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 600;
}

.dialog-btn.ghost {
  background: transparent;
  border-color: rgba(148, 163, 184, 0.3);
  color: var(--ui-muted);
}

.dialog-btn.primary {
  background: color-mix(in oklab, var(--ui-primary) 90%, white 10%);
  color: #fff;
}

@media (max-width: 760px) {
  .module-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .module-card {
    min-height: 142px;
    padding: 10px;
  }

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
