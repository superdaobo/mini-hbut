<script setup>
import { computed, onMounted, ref } from 'vue'
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
  getModuleCdnBase,
  prepareAndOpenModule,
  resolveModuleChannel
} from '../utils/more_modules.js'
import { fetchRemoteConfig } from '../utils/remote_config.js'

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'navigate'])

const MODULE_CDN_BASE = getModuleCdnBase()
const DEFAULT_MODULES = Object.freeze([
  {
    id: 'shuake',
    name: '刷课',
    icon: '🔐',
    description: '在线学习入口、数据同步与同步记录',
    key_required: true,
    kind: 'internal',
    view: 'more_shuake',
    order: 1
  },
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

const moduleLoading = ref(true)
const refreshing = ref(false)
const moduleError = ref('')
const moduleChannel = ref('main')
const moduleCatalogMap = ref(new Map())
const moduleCardsSource = ref([])
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
const toBool = (value) => value === true || value === 1 || value === '1'
const normalizeChannel = (value, fallback = 'main') => {
  const normalized = safeText(value).toLowerCase()
  if (normalized === 'dev') return 'dev'
  if (normalized === 'main') return 'main'
  return fallback === 'dev' ? 'dev' : 'main'
}
const resolveBrushModule = (moduleItem) => {
  const id = safeText(moduleItem?.id)
  const view = safeText(moduleItem?.view)
  return id === 'shuake' || view === 'more_shuake'
}
const buildDefaultManifestUrl = (channel, moduleId) => {
  const normalizedChannel = normalizeChannel(channel)
  const id = safeText(moduleId)
  if (!id) return ''
  return `${MODULE_CDN_BASE}/${normalizedChannel}/${id}/manifest.json`
}

const normalizeConfiguredModule = (item, index = 0, channel = 'main') => {
  const raw = item && typeof item === 'object' ? item : {}
  const id = safeText(raw.id || raw.module_id)
  if (!id) return null

  const kindText = safeText(raw.kind || raw.type).toLowerCase()
  const isBrush = id === 'shuake'
  const kind = kindText === 'internal' || isBrush ? 'internal' : 'remote'
  const order = safeNumber(raw.order, index + 1)
  const view = safeText(raw.view || raw.route || (isBrush ? 'more_shuake' : ''))
  const icon = safeText(raw.icon || (isBrush ? '🔐' : kind === 'remote' ? '📦' : '🧩'))
  const manifestUrl = safeText(raw.manifest_url || raw.manifestUrl)

  return {
    id,
    name: safeText(raw.name || raw.module_name || raw.title || id),
    icon,
    description: safeText(raw.description || raw.desc || ''),
    key_required: isBrush || toBool(raw.key_required || raw.keyRequired),
    kind,
    view,
    order,
    manifest_url: kind === 'remote' ? manifestUrl || buildDefaultManifestUrl(channel, id) : ''
  }
}

const mergeWithCatalog = (item) => {
  if (!item || item.kind !== 'remote') return item
  const catalogItem = moduleCatalogMap.value.get(item.id)
  if (!catalogItem) return item
  return {
    ...catalogItem,
    ...item,
    kind: 'remote',
    manifest_url: safeText(item.manifest_url || catalogItem.manifest_url)
  }
}

const moduleCards = computed(() => {
  return [...moduleCardsSource.value]
    .filter((item) => item && safeText(item.id))
    .sort((a, b) => safeNumber(a.order, 999) - safeNumber(b.order, 999))
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

    if (resolveBrushModule(item)) {
      setModuleState(item.id, {
        status: brushUnlocked.value ? 'ready' : 'locked',
        message: brushUnlocked.value ? '今日已解锁' : '点击输入今日秘钥'
      })
      continue
    }

    if (item.kind !== 'remote') {
      setModuleState(item.id, { status: 'ready', message: '点击进入模块' })
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

const resolveModuleBadgeType = (moduleItem, state) => {
  if (resolveBrushModule(moduleItem)) return brushUnlocked.value ? 'success' : 'warning'
  const status = safeText(state?.status)
  if (status === 'ready') return 'success'
  if (status === 'checking' || status === 'downloading') return 'info'
  if (status === 'failed') return 'danger'
  if (status === 'locked') return 'warning'
  return 'muted'
}

const resolveModuleStatusText = (moduleItem, state) => {
  if (resolveBrushModule(moduleItem)) return brushUnlocked.value ? '已解锁' : '需秘钥'
  const status = safeText(state?.status)
  if (status === 'checking') return '检查更新'
  if (status === 'downloading') return '下载中'
  if (status === 'ready') return '已就绪'
  if (status === 'failed') return '打开失败'
  if (status === 'locked') return '未解锁'
  return '未下载'
}

const setBrushModulesState = (status, message) => {
  for (const item of moduleCards.value) {
    if (!resolveBrushModule(item)) continue
    setModuleState(item.id, { status, message })
  }
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
  setBrushModulesState('ready', '今日已解锁')
  closeBrushKeyDialog()
  emit('navigate', 'more_shuake')
}

const handleOpenBrushModule = (moduleItem) => {
  const moduleId = safeText(moduleItem?.id || 'shuake')
  brushUnlocked.value = hasDailyAccessGrant()
  if (!brushUnlocked.value) {
    setModuleState(moduleId, { status: 'locked', message: '点击输入今日秘钥' })
    openBrushKeyDialog()
    return
  }
  setModuleState(moduleId, { status: 'ready', message: '今日已解锁' })
  emit('navigate', 'more_shuake')
}

const handleOpenInternalModule = (moduleItem) => {
  const targetView = safeText(moduleItem?.view)
  if (!targetView) return
  emit('navigate', targetView)
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
  if (resolveBrushModule(moduleItem)) {
    handleOpenBrushModule(moduleItem)
    return
  }
  if (moduleItem.kind === 'internal') {
    handleOpenInternalModule(moduleItem)
    return
  }
  await handleOpenRemoteModule(moduleItem)
}

const loadModuleCatalog = async ({ silent = false } = {}) => {
  if (!silent) moduleLoading.value = true
  moduleError.value = ''

  const preferredChannel = normalizeChannel(await resolveModuleChannel(), 'main')
  let targetChannel = preferredChannel
  let configuredModules = []
  let catalogModules = []

  try {
    const remoteConfig = await fetchRemoteConfig({ force: false })
    const configChannel = normalizeChannel(remoteConfig?.module_center?.channel, preferredChannel)
    targetChannel = configChannel
    const rawModules = Array.isArray(remoteConfig?.module_center?.modules)
      ? remoteConfig.module_center.modules
      : []
    configuredModules = rawModules
      .map((item, index) => normalizeConfiguredModule(item, index, targetChannel))
      .filter(Boolean)
  } catch {
    // 远程配置失败时继续走 catalog 兜底
  }

  try {
    const catalogPayload = await fetchModuleCatalog(targetChannel)
    moduleChannel.value = normalizeChannel(catalogPayload?.channel, targetChannel)
    catalogModules = Array.isArray(catalogPayload?.catalog?.modules) ? catalogPayload.catalog.modules : []
  } catch (err) {
    moduleError.value = safeText(err?.message || err) || '模块清单获取失败'
    moduleChannel.value = targetChannel
    catalogModules = []
  }

  moduleCatalogMap.value = new Map(catalogModules.map((item) => [item.id, item]))

  let merged = []
  if (configuredModules.length > 0) {
    merged = configuredModules.map((item) => mergeWithCatalog(item))
  } else if (catalogModules.length > 0) {
    merged = catalogModules
      .map((item, index) => normalizeConfiguredModule(item, index, moduleChannel.value))
      .filter(Boolean)
  }

  if (merged.length === 0) {
    merged = DEFAULT_MODULES.map((item, index) =>
      normalizeConfiguredModule(item, index, moduleChannel.value)
    ).filter(Boolean)
  }

  if (!merged.some((item) => resolveBrushModule(item))) {
    const brush = normalizeConfiguredModule(DEFAULT_MODULES[0], 0, moduleChannel.value)
    if (brush) merged.unshift(brush)
  }

  moduleCardsSource.value = merged
  bootstrapModuleState()

  if (!silent) moduleLoading.value = false
}

const refreshModules = async () => {
  refreshing.value = true
  await loadModuleCatalog({ silent: true })
  refreshing.value = false
}

onMounted(async () => {
  await loadModuleCatalog()
})
</script>

<template>
  <div class="more-view">
    <TPageHeader title="更多" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="refreshing" @click="refreshModules">↻</button>
      </template>
    </TPageHeader>

    <div class="more-view__body">
      <section class="menu-section">
        <div class="section-title">
          <span class="section-icon">🧩</span>
          <span>模块中心</span>
          <span class="section-subtitle">每行 2 个</span>
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

      <TEmptyState v-if="moduleLoading" type="loading" message="正在加载模块中心..." />
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

.error-text {
  margin: 10px 0 0;
  color: var(--ui-danger);
  font-weight: 600;
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
}
</style>
