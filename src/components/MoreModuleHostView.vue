<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from './templates'
import { isLocalModuleBridgePreviewUrl, resolveModuleHostPreviewSource } from '../utils/more_modules.js'
import { isTauriRuntime } from '../platform/native'

const props = defineProps({
  session: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['back'])

const frameKey = ref(0)
const frameRef = ref(null)
const frameContentHeight = ref(0)
const loading = ref(true)
const loadError = ref('')
const loadHint = ref('')

let loadingGuardTimer = null
let frameSizeHintTimer = null

const safeText = (value) => String(value ?? '').trim()

const moduleName = computed(() => safeText(props.session?.module_name) || '远程模块')
const moduleId = computed(() => safeText(props.session?.module_id))
const moduleVersion = computed(() => safeText(props.session?.version))
const minCompatibleVersion = computed(() => safeText(props.session?.min_compatible_version))
const moduleChannel = computed(() => safeText(props.session?.channel) || 'main')
const invalidReason = computed(() => safeText(props.session?.invalid_reason || props.session?.invalidReason))
const resolvedPreviewSource = computed(() => resolveModuleHostPreviewSource(props.session || {}))
const previewMode = computed(() => {
  const resolvedKind = safeText(resolvedPreviewSource.value?.sourceKind)
  if (resolvedKind && resolvedKind !== 'invalid') {
    return resolvedKind
  }
  const fallbackMode = safeText(props.session?.preview_mode || props.session?.previewMode)
  if (!isTauriRuntime() && fallbackMode === 'tauri-local') {
    return ''
  }
  return fallbackMode
})
const previewUrl = computed(() => {
  const resolvedUrl = safeText(resolvedPreviewSource.value?.resolvedPreviewUrl)
  const raw = resolvedUrl || (isTauriRuntime() ? safeText(props.session?.preview_url) : '')
  if (isLocalModuleBridgePreviewUrl(raw) && !isTauriRuntime()) {
    return ''
  }
  return raw
})
const ready = computed(() => !!previewUrl.value)
const emptyStateMessage = computed(() => {
  if (invalidReason.value === 'local-cache-missing' || previewMode.value === 'capacitor-local') {
    return '本地模块缓存缺失或入口失效，请返回更多页重新下载模块。'
  }
  if (
    invalidReason.value === 'tauri-bridge-blocked' ||
    isLocalModuleBridgePreviewUrl(safeText(props.session?.preview_url))
  ) {
    return '当前运行时已禁止桌面本地桥地址，请返回更多页重新进入模块。'
  }
  return '模块预览地址缺失，请返回更多页重新进入。'
})

const withFrameCacheBust = (url, keyParts = []) => {
  const text = safeText(url)
  if (!text) return ''
  const [basePart, hashPart = ''] = text.split('#', 2)
  if (!basePart) return text
  const token = keyParts
    .map((item) => safeText(item))
    .filter(Boolean)
    .join('-')
  const params = new URLSearchParams()
  params.set('_host_frame_v', token || `${Date.now()}`)
  const joiner = basePart.includes('?') ? '&' : '?'
  const nextUrl = `${basePart}${joiner}${params.toString()}`
  return hashPart ? `${nextUrl}#${hashPart}` : nextUrl
}

const frameSrc = computed(() =>
  withFrameCacheBust(previewUrl.value, [
    moduleChannel.value || 'main',
    moduleVersion.value || 'unknown',
    String(frameKey.value)
  ])
)

const formatModuleChannel = (value) => {
  const channel = safeText(value).toLowerCase()
  if (channel === 'latest') return '最新包'
  if (channel === 'main') return '正式渠道'
  if (channel === 'dev') return '测试渠道'
  return channel ? `渠道 ${channel}` : ''
}

const formatModuleVersion = (value) => {
  const raw = safeText(value)
  if (!raw) return ''
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:-([a-z0-9]+))?$/i)
  if (!match) return raw.replace(/^v/i, '')
  const [, year, month, day, hour, minute, _second, hash] = match
  return hash
    ? `${year}-${month}-${day} ${hour}:${minute} · ${hash}`
    : `${year}-${month}-${day} ${hour}:${minute}`
}

const moduleRuntimeBadges = computed(() => {
  const badges = ['内嵌运行']
  if (previewMode.value === 'capacitor-local') badges.push('安卓本地包')
  if (previewMode.value === 'tauri-local') badges.push('桌面本地包')
  if (previewMode.value === 'remote-site') badges.push('远端页面')
  const channel = formatModuleChannel(moduleChannel.value)
  const version = formatModuleVersion(moduleVersion.value)
  if (channel) badges.push(channel)
  if (version) badges.push(`构建 ${version}`)
  if (minCompatibleVersion.value) {
    badges.push(`兼容 >= ${minCompatibleVersion.value}`)
  }
  return badges
})

const hasEmbeddedFrameHeight = computed(() => frameContentHeight.value > 0)
const frameShellStyle = computed(() =>
  hasEmbeddedFrameHeight.value ? { height: `${frameContentHeight.value}px` } : null
)
const frameStyle = computed(() =>
  hasEmbeddedFrameHeight.value ? { height: `${frameContentHeight.value}px` } : null
)

const clearLoadingGuardTimer = () => {
  if (loadingGuardTimer) {
    clearTimeout(loadingGuardTimer)
    loadingGuardTimer = null
  }
}

const clearFrameSizeHintTimer = () => {
  if (frameSizeHintTimer) {
    clearTimeout(frameSizeHintTimer)
    frameSizeHintTimer = null
  }
}

const scheduleFrameSizeHint = () => {
  clearFrameSizeHintTimer()
  frameSizeHintTimer = window.setTimeout(() => {
    if (frameContentHeight.value > 0 || loadError.value) return
    loadHint.value = '模块页面已加载，正在等待模块上报真实高度。'
  }, 1200)
}

const resetFrameState = () => {
  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  frameContentHeight.value = 0
  loading.value = ready.value
  loadError.value = ''
  loadHint.value = ''
  if (!ready.value) return
  // WebView 某些场景下 iframe load 事件可能延迟，超时后先给出明确状态。
  loadingGuardTimer = window.setTimeout(() => {
    if (!loading.value) return
    loading.value = false
    loadHint.value = '模块页面已开始渲染，正在等待模块上报真实高度。'
  }, 4500)
}

const handleFrameSizeMessage = (event) => {
  const frameWindow = frameRef.value?.contentWindow
  const payload = event?.data
  if (!frameWindow || event.source !== frameWindow) return
  if (!payload || payload.type !== 'mini-hbut:module-size') return

  const nextModuleId = safeText(payload.module_id || payload.moduleId)
  const nextVersion = safeText(payload.version)
  if (moduleId.value && nextModuleId && nextModuleId !== moduleId.value) return
  if (moduleVersion.value && nextVersion && nextVersion !== moduleVersion.value) return

  const nextHeight = Math.ceil(Number(payload.height) || 0)
  if (nextHeight <= 0) return

  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  frameContentHeight.value = nextHeight
  loading.value = false
  loadHint.value = ''
}

const reloadFrame = () => {
  if (!ready.value) return
  frameKey.value += 1
  resetFrameState()
}

const handleLoad = () => {
  clearLoadingGuardTimer()
  loading.value = false
  loadError.value = ''
  if (!frameContentHeight.value) {
    scheduleFrameSizeHint()
  }
}

const handleError = () => {
  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  loading.value = false
  frameContentHeight.value = 0
  loadError.value =
    previewMode.value === 'capacitor-local'
      ? '本地模块页面加载失败，请返回更多页重新下载后再试。'
      : '模块页面加载失败，请返回更多页后重试。'
  loadHint.value = ''
}

watch(
  () => previewUrl.value,
  () => {
    frameKey.value += 1
    resetFrameState()
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('message', handleFrameSizeMessage)
})

onBeforeUnmount(() => {
  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  window.removeEventListener('message', handleFrameSizeMessage)
})
</script>

<template>
  <div class="more-module-host-view">
    <TPageHeader :title="moduleName" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="!ready" @click="reloadFrame">↻</button>
      </template>
    </TPageHeader>

    <div class="more-module-host-view__body">
      <div v-if="moduleRuntimeBadges.length" class="module-runtime-strip">
        <span
          v-for="badge in moduleRuntimeBadges"
          :key="badge"
          class="module-runtime-pill"
          :title="moduleVersion || badge"
        >
          {{ badge }}
        </span>
      </div>

      <div v-if="!ready" class="module-empty-card">
        <TEmptyState type="empty" :message="emptyStateMessage" />
      </div>

      <div
        v-else
        class="module-frame-shell"
        :class="{ 'module-frame-shell--content': hasEmbeddedFrameHeight }"
        :style="frameShellStyle"
      >
        <div v-if="loading" class="module-loading-overlay">
          <TEmptyState type="loading" message="正在加载模块页面..." />
        </div>
        <div v-if="loadError" class="module-frame-error">{{ loadError }}</div>
        <div v-else-if="loadHint" class="module-frame-hint">{{ loadHint }}</div>
        <iframe
          :key="frameKey"
          ref="frameRef"
          class="module-frame"
          :class="{ 'module-frame--content': hasEmbeddedFrameHeight }"
          :style="frameStyle"
          :src="frameSrc"
          allowfullscreen
          loading="eager"
          @load="handleLoad"
          @error="handleError"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<style scoped>
.more-module-host-view {
  min-height: calc(var(--app-vh, 1vh) * 100);
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-gradient);
  overflow-y: auto;
}

.more-module-host-view__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
  padding: 14px 14px calc(28px + env(safe-area-inset-bottom));
}

.module-empty-card,
.module-frame-shell {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: calc(18px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  backdrop-filter: blur(14px);
  box-shadow: var(--ui-shadow-soft);
}

.module-runtime-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.module-runtime-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface) 84%, #fff 16%);
  box-shadow: var(--ui-shadow-soft);
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.module-empty-card {
  padding: 18px;
}

.module-frame-shell {
  position: relative;
  flex: 1;
  min-height: max(620px, calc(var(--app-vh, 1vh) * 100 - 188px));
  display: flex;
  min-width: 0;
  overflow: hidden;
  isolation: isolate;
}

.module-frame-shell--content {
  flex: 0 0 auto;
  min-height: 0;
}

.module-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.78));
  backdrop-filter: blur(6px);
}

.module-frame {
  display: block;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  background: #0b1120;
}

.module-frame--content {
  flex: 0 0 auto;
  min-height: 0;
}

.module-frame-error,
.module-frame-hint {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 2;
  padding: 10px 12px;
  border-radius: calc(12px * var(--ui-radius-scale));
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
}

.module-frame-error {
  background: rgba(239, 68, 68, 0.12);
  color: var(--ui-danger);
}

.module-frame-hint {
  background: rgba(59, 130, 246, 0.12);
  color: color-mix(in oklab, var(--ui-primary) 78%, #1d4ed8 22%);
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface) 92%, white 8%);
  color: var(--ui-text);
  cursor: pointer;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .more-module-host-view__body {
    padding: 12px 12px calc(24px + env(safe-area-inset-bottom));
  }

  .module-frame-shell {
    min-height: max(560px, calc(var(--app-vh, 1vh) * 100 - 172px));
  }
}
</style>
