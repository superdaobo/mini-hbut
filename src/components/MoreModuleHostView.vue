<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from './templates'

const props = defineProps({
  session: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['back'])

const frameKey = ref(0)
const frameRef = ref(null)
const frameShellRef = ref(null)
const frameContentHeight = ref(0)
const hostViewportHeight = ref(0)
const managedViewportSpace = ref(0)
const loading = ref(true)
const loadError = ref('')
const loadHint = ref('')

let loadingGuardTimer = null
let frameHeightRaf = 0
let frameObserver = null
let frameResizeHandler = null
let frameSyncTimers = []
let frameFallbackTimer = null
let hostResizeHandler = null

const handleFrameSizeMessage = (event) => {
  const frameWindow = frameRef.value?.contentWindow
  const payload = event?.data
  if (!frameWindow || event.source !== frameWindow) return
  if (!payload || payload.type !== 'mini-hbut:module-size') return
  const nextHeight = Math.ceil(Number(payload.height) || 0)
  if (nextHeight > 0) {
    if (frameFallbackTimer) {
      clearTimeout(frameFallbackTimer)
      frameFallbackTimer = null
    }
    frameContentHeight.value = nextHeight
    loadHint.value = ''
  }
}

const safeText = (value) => String(value ?? '').trim()

const compareModuleVersion = (left, right) => {
  const a = safeText(left)
  const b = safeText(right)
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

const moduleName = computed(() => safeText(props.session?.module_name) || '远程模块')
const moduleId = computed(() => safeText(props.session?.module_id))
const moduleVersion = computed(() => safeText(props.session?.version))
const minCompatibleVersion = computed(() => safeText(props.session?.min_compatible_version))
const moduleChannel = computed(() => safeText(props.session?.channel) || 'main')
const previewUrl = computed(() => safeText(props.session?.preview_url))
const ready = computed(() => !!previewUrl.value)
const usesManagedHechengLayout = computed(
  () => false
)

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
  const channel = formatModuleChannel(moduleChannel.value)
  const version = formatModuleVersion(moduleVersion.value)
  if (channel) badges.push(channel)
  if (version) badges.push(`构建 ${version}`)
  return badges
})

const readHostViewportHeight = () =>
  Number(window.innerHeight || 0) ||
  Number(document.documentElement?.clientHeight || 0) ||
  0

const syncManagedViewportSpace = () => {
  if (!usesManagedHechengLayout.value) {
    managedViewportSpace.value = 0
    return
  }
  const viewport = readHostViewportHeight()
  const shell = frameShellRef.value
  if (!viewport || !shell) {
    managedViewportSpace.value = 0
    return
  }
  const shellRect = shell.getBoundingClientRect()
  const shellStyle = window.getComputedStyle(shell)
  const bottomGap = readSizeNumber(shellStyle.marginBottom) + 12
  const nextHeight = Math.floor(viewport - shellRect.top - bottomGap)
  managedViewportSpace.value = nextHeight > 0 ? nextHeight : 0
}

const managedHechengFrameHeight = computed(() => {
  if (!usesManagedHechengLayout.value) return 0
  const viewport = hostViewportHeight.value || readHostViewportHeight()
  const safetyOffset = viewport <= 760 ? 132 : 148
  const maxManagedHeight = viewport <= 820 ? 460 : viewport <= 960 ? 520 : 620
  if (managedViewportSpace.value > 0) {
    return Math.max(380, Math.min(maxManagedHeight, managedViewportSpace.value - safetyOffset))
  }
  if (!viewport) return 0
  const reserved = viewport <= 760 ? 304 : 336
  const minimum = viewport <= 760 ? 380 : 420
  return Math.max(minimum, Math.min(maxManagedHeight, viewport - reserved))
})

const resolvedFrameHeight = computed(() => {
  if (usesManagedHechengLayout.value) {
    return managedHechengFrameHeight.value > 0 ? managedHechengFrameHeight.value : 0
  }
  return frameContentHeight.value > 0 ? frameContentHeight.value : 0
})

const shellUsesManagedViewport = computed(
  () => usesManagedHechengLayout.value && managedHechengFrameHeight.value > 0
)

const hasEmbeddedFrameHeight = computed(() => resolvedFrameHeight.value > 0)
const frameShellStyle = computed(() =>
  shellUsesManagedViewport.value && resolvedFrameHeight.value > 0
    ? { height: `${resolvedFrameHeight.value}px` }
    : null
)
const frameStyle = computed(() =>
  hasEmbeddedFrameHeight.value ? { height: `${resolvedFrameHeight.value}px` } : null
)

const clearFrameFallbackTimer = () => {
  if (frameFallbackTimer) {
    clearTimeout(frameFallbackTimer)
    frameFallbackTimer = null
  }
}

const readSizeNumber = (value) => {
  const next = parseFloat(String(value ?? '0'))
  return Number.isFinite(next) ? next : 0
}

const measureManagedGameFrameHeight = () => {
  try {
    const doc = frameRef.value?.contentDocument
    const view = frameRef.value?.contentWindow
    if (!doc || !view || !usesManagedHechengLayout.value) return 0
    const root = doc.querySelector('.game-container')
    const shell = doc.querySelector('.game-shell')
    if (!root || !shell) return 0

    const rootStyle = view.getComputedStyle(root)
    const rootPaddingTop = readSizeNumber(rootStyle.paddingTop)
    const rootPaddingBottom = readSizeNumber(rootStyle.paddingBottom)
    const nextHeight = rootPaddingTop + rootPaddingBottom + shell.getBoundingClientRect().height + 4
    return Math.max(1, Math.ceil(nextHeight))
  } catch {
    return 0
  }
}

const measureLegacyGameFrameHeight = () => {
  try {
    const doc = frameRef.value?.contentDocument
    const view = frameRef.value?.contentWindow
    if (!doc || !view || moduleId.value !== 'hecheng_hugongda') return 0
    const root = doc.querySelector('.game-container')
    const shell = doc.querySelector('.game-shell')
    const header = doc.querySelector('.game-header')
    const canvas = doc.querySelector('.game-canvas-wrapper')
    const legend = doc.querySelector('.legend-panel')
    if (!root || !shell || !header || !canvas || !legend) return 0

    const rootStyle = view.getComputedStyle(root)
    const shellStyle = view.getComputedStyle(shell)
    const rootPaddingTop = readSizeNumber(rootStyle.paddingTop)
    const rootPaddingBottom = readSizeNumber(rootStyle.paddingBottom)
    const shellGap = readSizeNumber(shellStyle.rowGap || shellStyle.gap)
    const nextHeight =
      rootPaddingTop +
      rootPaddingBottom +
      header.getBoundingClientRect().height +
      canvas.getBoundingClientRect().height +
      legend.getBoundingClientRect().height +
      shellGap * 2 +
      6
    return Math.max(640, Math.ceil(nextHeight))
  } catch {
    return 0
  }
}

const estimateLegacyFrameHeight = () => {
  if (usesManagedHechengLayout.value) {
    return 0
  }
  const measuredHeight = measureLegacyGameFrameHeight()
  if (measuredHeight > 0) return measuredHeight
  const viewportHeight =
    Number(window.innerHeight || 0) ||
    Number(document.documentElement?.clientHeight || 0) ||
    900
  if (moduleId.value === 'hecheng_hugongda') {
    return Math.max(640, Math.min(860, viewportHeight - 80))
  }
  if (moduleId.value === 'hugongda_escape') {
    return Math.max(820, Math.min(1160, viewportHeight + 180))
  }
  return Math.max(760, Math.min(1080, viewportHeight + 120))
}

const scheduleLegacyFrameHeightFallback = () => {
  clearFrameFallbackTimer()
  frameFallbackTimer = window.setTimeout(() => {
    if (frameContentHeight.value > 0) return
    frameContentHeight.value = estimateLegacyFrameHeight()
    if (!loadError.value) {
      loadHint.value = '当前模块未上报高度，已启用兼容高度模式。'
    }
  }, 900)
}

const clearLoadingGuardTimer = () => {
  if (loadingGuardTimer) {
    clearTimeout(loadingGuardTimer)
    loadingGuardTimer = null
  }
}

const clearFrameSyncTimers = () => {
  frameSyncTimers.forEach((timer) => clearTimeout(timer))
  frameSyncTimers = []
}

const teardownFrameAutoHeight = ({ resetHeight = true } = {}) => {
  clearFrameSyncTimers()
  clearFrameFallbackTimer()
  if (frameHeightRaf) {
    cancelAnimationFrame(frameHeightRaf)
    frameHeightRaf = 0
  }
  if (frameObserver) {
    frameObserver.disconnect()
    frameObserver = null
  }
  const win = frameRef.value?.contentWindow
  if (win && frameResizeHandler) {
    win.removeEventListener('resize', frameResizeHandler)
  }
  frameResizeHandler = null
  if (resetHeight) {
    frameContentHeight.value = 0
  }
}

const syncFrameHeight = () => {
  if (frameHeightRaf) return
  frameHeightRaf = requestAnimationFrame(() => {
    frameHeightRaf = 0
    try {
      const doc = frameRef.value?.contentDocument
      if (!doc?.body || !doc?.documentElement) return
      const root = doc.documentElement
      const body = doc.body
      const measuredManagedHeight = measureManagedGameFrameHeight()
      const measuredLegacyHeight = measureLegacyGameFrameHeight()
      const nextHeight =
        measuredManagedHeight > 0
          ? measuredManagedHeight
          : Math.max(
              640,
              measuredLegacyHeight,
              root.scrollHeight,
              body.scrollHeight,
              root.offsetHeight,
              body.offsetHeight
            )
      frameContentHeight.value = nextHeight
    } catch {
      frameContentHeight.value = 0
    }
  })
}

const setupFrameAutoHeight = () => {
  teardownFrameAutoHeight()
  try {
    const doc = frameRef.value?.contentDocument
    const win = frameRef.value?.contentWindow
    if (!doc?.body || !doc?.documentElement || !win) {
      frameContentHeight.value = 0
      return
    }
    frameResizeHandler = () => syncFrameHeight()
    win.addEventListener('resize', frameResizeHandler)
    frameObserver = new MutationObserver(() => syncFrameHeight())
    frameObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })
    syncFrameHeight()
    ;[80, 220, 600, 1200].forEach((delay) => {
      frameSyncTimers.push(window.setTimeout(() => syncFrameHeight(), delay))
    })
    if (!usesManagedHechengLayout.value) {
      scheduleLegacyFrameHeightFallback()
    }
  } catch {
    frameContentHeight.value = 0
    if (!usesManagedHechengLayout.value) {
      scheduleLegacyFrameHeightFallback()
    }
  }
}

const resetFrameState = () => {
  clearLoadingGuardTimer()
  teardownFrameAutoHeight()
  loading.value = ready.value
  loadError.value = ''
  loadHint.value = ''
  if (!ready.value) return
  // iOS / WKWebView 下 iframe 的 load 事件并不稳定，超时后先撤掉遮罩，避免一直转圈。
  loadingGuardTimer = window.setTimeout(() => {
    if (!loading.value) return
    loading.value = false
    loadHint.value = '模块已开始渲染；如果仍是空白，请点右上角刷新。'
  }, 4500)
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
  loadHint.value = ''
  syncManagedViewportSpace()
  setupFrameAutoHeight()
  requestAnimationFrame(() => syncManagedViewportSpace())
}

const handleError = () => {
  clearLoadingGuardTimer()
  teardownFrameAutoHeight()
  loading.value = false
  loadError.value = '模块页面加载失败，请返回更多页后重试。'
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
  hostViewportHeight.value = readHostViewportHeight()
  hostResizeHandler = () => {
    hostViewportHeight.value = readHostViewportHeight()
    syncManagedViewportSpace()
  }
  window.addEventListener('resize', hostResizeHandler)
  window.addEventListener('message', handleFrameSizeMessage)
  requestAnimationFrame(() => syncManagedViewportSpace())
})

onBeforeUnmount(() => {
  clearLoadingGuardTimer()
  teardownFrameAutoHeight()
  if (hostResizeHandler) {
    window.removeEventListener('resize', hostResizeHandler)
    hostResizeHandler = null
  }
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
      <div v-if="moduleRuntimeBadges.length && !usesManagedHechengLayout" class="module-runtime-strip">
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
        <TEmptyState type="empty" message="模块预览地址缺失，请返回更多页重新进入。" />
      </div>

      <div
        v-else
        ref="frameShellRef"
        class="module-frame-shell"
        :class="{
          'module-frame-shell--content': hasEmbeddedFrameHeight && !shellUsesManagedViewport,
          'module-frame-shell--managed': shellUsesManagedViewport
        }"
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
          :class="{
            'module-frame--content': hasEmbeddedFrameHeight && !shellUsesManagedViewport,
            'module-frame--managed': shellUsesManagedViewport
          }"
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
  overflow: visible;
}

.module-frame-shell--managed {
  flex: 0 0 auto;
  min-height: 0;
  overflow: hidden;
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
  height: auto;
  min-height: 640px;
}

.module-frame--managed {
  flex: 0 0 auto;
  height: 100%;
  min-height: 0;
}

.module-frame-error {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 2;
  padding: 10px 12px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: rgba(239, 68, 68, 0.12);
  color: var(--ui-danger);
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
}

.module-frame-hint {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 2;
  padding: 10px 12px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: rgba(59, 130, 246, 0.12);
  color: color-mix(in oklab, var(--ui-primary) 78%, #1d4ed8 22%);
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
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

  .module-frame {
    height: 100%;
  }
}
</style>
