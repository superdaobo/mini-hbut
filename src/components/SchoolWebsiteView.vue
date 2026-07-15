<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { openExternal } from '../utils/external_link'
import {
  SCHOOL_WEBSITE_URL,
  forceCloseSchoolWebsiteEmbed,
  mountSchoolWebsiteEmbed,
  resolveSchoolWebsiteEmbedMode,
  resolveSchoolWebsiteIframeUrl
} from '../utils/school_website_embed'

const emit = defineEmits(['back'])
const leaving = ref(false)

const frameShellRef = ref(null)
const embedMode = ref('direct-iframe')
const loading = ref(true)
const loadError = ref('')
const loadHint = ref('')
const useNativeEmbed = computed(() => embedMode.value === 'tauri-webview')
const useExternalOnly = computed(() => embedMode.value === 'external-open')
const iframeSrc = computed(() => {
  if (useNativeEmbed.value || useExternalOnly.value) return ''
  const mode = embedMode.value === 'proxy-iframe' ? 'proxy-iframe' : 'direct-iframe'
  return resolveSchoolWebsiteIframeUrl(mode)
})

let loadingGuardTimer = null
let embedCleanup = null
/** 首页已成功渲染后，忽略 iOS iframe 偶发的 error（子资源/站内跳转误报） */
const hasIframeLoadedOnce = ref(false)

const clearLoadingGuardTimer = () => {
  if (loadingGuardTimer) {
    clearTimeout(loadingGuardTimer)
    loadingGuardTimer = null
  }
}

const showBridgeUnavailable = () => {
  clearLoadingGuardTimer()
  loading.value = false
  loadHint.value = ''
  loadError.value = '本地桥接服务不可用，无法在应用内加载学校官网，请点击下方按钮在浏览器中打开。'
}

const resetIframeState = () => {
  clearLoadingGuardTimer()
  hasIframeLoadedOnce.value = false
  loading.value = true
  loadError.value = ''
  loadHint.value = ''

  loadingGuardTimer = window.setTimeout(() => {
    if (!loading.value || useNativeEmbed.value || useExternalOnly.value) return
    loading.value = false
    loadHint.value = '页面加载较慢，若长时间空白可尝试在浏览器中打开。'
  }, 4500)
}

const handleLoad = () => {
  if (useNativeEmbed.value || useExternalOnly.value) return
  clearLoadingGuardTimer()
  hasIframeLoadedOnce.value = true
  loading.value = false
  loadError.value = ''
  loadHint.value = ''
}

const handleError = () => {
  if (useNativeEmbed.value || useExternalOnly.value) return
  // iOS WKWebView 在页面已展示后仍可能误报 error；桥接可用性已在进入页面前探测过。
  if (embedMode.value === 'proxy-iframe' && hasIframeLoadedOnce.value) return
  if (embedMode.value === 'proxy-iframe') {
    showBridgeUnavailable()
    return
  }
  clearLoadingGuardTimer()
  loading.value = false
  loadError.value = '官网页面无法在应用内嵌入显示，请点击下方按钮在浏览器中打开。'
  loadHint.value = ''
}

const handleOpenExternal = async () => {
  await openExternal(SCHOOL_WEBSITE_URL)
}

const cleanupEmbed = async () => {
  clearLoadingGuardTimer()
  hasIframeLoadedOnce.value = false
  if (embedCleanup) {
    const cleanup = embedCleanup
    embedCleanup = null
    await cleanup()
  }
}

const mountEmbed = async () => {
  const container = frameShellRef.value
  if (!container) return

  await cleanupEmbed()
  embedMode.value = await resolveSchoolWebsiteEmbedMode()

  if (embedMode.value === 'external-open') {
    showBridgeUnavailable()
    return
  }

  if (embedMode.value === 'tauri-webview') {
    try {
      const mounted = await mountSchoolWebsiteEmbed({
        container,
        onReady: () => {
          loading.value = false
          loadError.value = ''
          loadHint.value = ''
        },
        onError: (message) => {
          loadError.value = message
        }
      })
      embedCleanup = mounted.cleanup
      return
    } catch {
      loading.value = false
      loadError.value = '创建学校官网内嵌视图失败，请点击下方按钮在浏览器中打开。'
      return
    }
  }

  resetIframeState()
}

/** 后台恢复：重新探测 bridge 并 remount iframe / native embed */
const remountAfterResume = async () => {
  loading.value = true
  loadError.value = ''
  loadHint.value = ''
  await cleanupEmbed()
  await nextTick()
  await mountEmbed()
}

const handleRetryEmbed = () => {
  void remountAfterResume()
}

/** #373：先关子 WebView 再返回，避免卸载竞态把内嵌撑成无返回全屏 */
const handleBack = async () => {
  if (leaving.value) return
  leaving.value = true
  try {
    await cleanupEmbed()
    await forceCloseSchoolWebsiteEmbed()
  } catch {
    // ignore
  }
  emit('back')
}

const handleVisibilityForEmbed = () => {
  if (document.hidden) return
  // 仅在已有错误或 proxy 模式时自动恢复，避免无意义重载
  if (loadError.value || embedMode.value === 'proxy-iframe') {
    void remountAfterResume()
  }
}

const handleAppEmbedResumeEvent = (event) => {
  const view = String(event?.detail?.view || '')
  if (view && view !== 'school_website') return
  void remountAfterResume()
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityForEmbed)
  window.addEventListener('hbu-embed-resume', handleAppEmbedResumeEvent)
  void nextTick().then(() => mountEmbed())
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityForEmbed)
  window.removeEventListener('hbu-embed-resume', handleAppEmbedResumeEvent)
  void cleanupEmbed().finally(() => {
    void forceCloseSchoolWebsiteEmbed()
  })
})

defineExpose({ remountAfterResume })
</script>

<template>
  <div class="school-website-view">
    <header class="subpage-header">
      <button class="back-button" type="button" @click="handleBack" aria-label="返回">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="header-copy">
        <span class="header-kicker">我的</span>
        <h1>学校官网</h1>
      </div>
      <button class="external-button" type="button" @click="handleOpenExternal" aria-label="在浏览器中打开">
        <span class="material-symbols-outlined">open_in_new</span>
      </button>
    </header>

    <div ref="frameShellRef" class="frame-shell">
      <div v-if="loading" class="frame-overlay">
        <span class="material-symbols-outlined spinning">progress_activity</span>
        <p>正在加载学校官网…</p>
      </div>

      <div v-if="loadError" class="frame-message frame-message--error">
        <p>{{ loadError }}</p>
        <div class="frame-message-actions">
          <button class="external-open-btn" type="button" @click="handleRetryEmbed">重试加载</button>
          <button class="external-open-btn" type="button" @click="handleOpenExternal">在浏览器中打开</button>
        </div>
      </div>

      <div v-else-if="loadHint" class="frame-message frame-message--hint">
        <p>{{ loadHint }}</p>
        <button class="external-open-btn" type="button" @click="handleOpenExternal">在浏览器中打开</button>
      </div>

      <iframe
        v-if="!useNativeEmbed && !useExternalOnly && iframeSrc"
        class="website-frame"
        :src="iframeSrc"
        title="湖北工业大学官网"
        allowfullscreen
        referrerpolicy="no-referrer-when-downgrade"
        loading="eager"
        @load="handleLoad"
        @error="handleError"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.school-website-view {
  height: calc(var(--app-vh, 1vh) * 100);
  height: 100dvh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-gradient, #f9f9ff);
  overflow: hidden;
}

.subpage-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 12px;
  flex: 0 0 auto;
}

.back-button,
.external-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
  color: var(--ui-primary, #2563eb);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
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

.frame-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 0 12px 12px;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
}

.website-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: #ffffff;
}

.frame-overlay,
.frame-message {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.frame-overlay {
  background: color-mix(in srgb, #ffffff 88%, transparent);
  color: #475569;
}

.frame-overlay p,
.frame-message p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.frame-message--error {
  background: color-mix(in srgb, #ffffff 94%, #fee2e2 6%);
  color: #7f1d1d;
}

.frame-message--hint {
  top: auto;
  bottom: 0;
  height: auto;
  background: color-mix(in srgb, #ffffff 90%, var(--ui-primary, #2563eb) 10%);
  color: #334155;
  border-top: 1px solid rgba(148, 163, 184, 0.24);
}

.external-open-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 18px;
  background: var(--ui-primary, #2563eb);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.spinning {
  font-size: 28px;
  color: var(--ui-primary, #2563eb);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
