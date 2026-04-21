<script setup>
import { computed, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from './templates'

const props = defineProps({
  session: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['back'])

const frameKey = ref(0)
const loading = ref(true)
const loadError = ref('')

const safeText = (value) => String(value ?? '').trim()

const moduleName = computed(() => safeText(props.session?.module_name) || '远程模块')
const moduleVersion = computed(() => safeText(props.session?.version))
const moduleChannel = computed(() => safeText(props.session?.channel) || 'main')
const previewUrl = computed(() => safeText(props.session?.preview_url))
const ready = computed(() => !!previewUrl.value)

const resetFrameState = () => {
  loading.value = ready.value
  loadError.value = ''
}

const reloadFrame = () => {
  if (!ready.value) return
  frameKey.value += 1
  resetFrameState()
}

const handleLoad = () => {
  loading.value = false
  loadError.value = ''
}

const handleError = () => {
  loading.value = false
  loadError.value = '模块页面加载失败，请返回更多页后重试。'
}

watch(
  () => previewUrl.value,
  () => {
    frameKey.value += 1
    resetFrameState()
  },
  { immediate: true }
)
</script>

<template>
  <div class="more-module-host-view">
    <TPageHeader :title="moduleName" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="!ready" @click="reloadFrame">↻</button>
      </template>
    </TPageHeader>

    <div class="more-module-host-view__body">
      <div class="module-meta-card">
        <div class="module-meta-card__title">模块已在当前页面内嵌运行</div>
        <div class="module-meta-card__meta">
          <span>渠道 {{ moduleChannel }}</span>
          <span v-if="moduleVersion">版本 v{{ moduleVersion }}</span>
          <span v-if="props.session?.source">来源 {{ props.session.source }}</span>
        </div>
      </div>

      <div v-if="!ready" class="module-empty-card">
        <TEmptyState type="empty" message="模块预览地址缺失，请返回更多页重新进入。" />
      </div>

      <div v-else class="module-frame-shell">
        <TEmptyState v-if="loading" type="loading" message="正在加载模块页面..." />
        <div v-if="loadError" class="module-frame-error">{{ loadError }}</div>
        <iframe
          :key="frameKey"
          class="module-frame"
          :src="previewUrl"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-pointer-lock"
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
  min-height: 100vh;
  background: var(--ui-bg-gradient);
}

.more-module-host-view__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px calc(90px + env(safe-area-inset-bottom));
}

.module-meta-card,
.module-empty-card,
.module-frame-shell {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: calc(18px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  backdrop-filter: blur(14px);
  box-shadow: var(--ui-shadow-soft);
}

.module-meta-card {
  padding: 14px 16px;
}

.module-meta-card__title {
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
}

.module-meta-card__meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.module-empty-card {
  padding: 18px;
}

.module-frame-shell {
  position: relative;
  min-height: calc(var(--app-vh, 1vh) * 100 - 170px);
  overflow: hidden;
}

.module-frame {
  width: 100%;
  height: calc(var(--app-vh, 1vh) * 100 - 170px);
  min-height: 620px;
  border: 0;
  background: #0b1120;
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
    padding: 12px 12px calc(84px + env(safe-area-inset-bottom));
  }

  .module-frame-shell {
    min-height: calc(var(--app-vh, 1vh) * 100 - 156px);
  }

  .module-frame {
    height: calc(var(--app-vh, 1vh) * 100 - 156px);
    min-height: 560px;
  }
}
</style>
