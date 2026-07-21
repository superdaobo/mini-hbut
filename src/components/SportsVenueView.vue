<script setup>
/**
 * 运动场馆预约 — 一码通第三方入口
 */
import { onMounted, ref } from 'vue'
import { prepareOneCodeAppOpen } from '../utils/one_code_open.js'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState, TCard } from './templates'

const emit = defineEmits(['back'])
const loading = ref(false)
const error = ref('')
const openUrl = ref('')
const hint = ref('场馆系统可能仅校园网可达。')

const prepare = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await prepareOneCodeAppOpen({
      appCode: 'noQYzEiZ7L',
      appName: '运动场馆预约系统'
    })
    openUrl.value = res.openUrl
    if (res.hint) hint.value = res.hint
  } catch (e) {
    error.value = String(e?.message || e || '加载失败')
    openUrl.value = ''
  } finally {
    loading.value = false
  }
}

const open = async () => {
  if (!openUrl.value) return
  try {
    await openExternal(openUrl.value)
  } catch (e) {
    showToast(String(e?.message || e || '打开失败，请确认已连校园网'))
  }
}

onMounted(prepare)
</script>

<template>
  <div class="ykt-page">
    <TPageHeader title="运动场馆" icon="sports_soccer" @back="emit('back')" />
    <div class="ykt-body">
      <TEmptyState v-if="loading" type="loading" message="正在准备场馆入口…" />

      <TCard v-else-if="error" compact>
        <TEmptyState type="error" :message="error" />
        <button type="button" class="ykt-btn primary" @click="prepare">重试</button>
      </TCard>

      <TCard v-else-if="openUrl" compact>
        <template #header>
          <strong>预约系统入口</strong>
          <p class="ykt-muted">{{ hint }}</p>
        </template>
        <p class="ykt-url">{{ openUrl }}</p>
        <div class="ykt-actions">
          <button type="button" class="ykt-btn primary" @click="open">打开预约系统</button>
          <button type="button" class="ykt-btn" :disabled="loading" @click="prepare">重新生成</button>
        </div>
      </TCard>
    </div>
  </div>
</template>

<style scoped>
.ykt-page {
  min-height: 100vh;
  background: var(--ui-bg-gradient, var(--ui-bg, #f5f7fb));
  color: var(--ui-text, #0f172a);
}
.ykt-body {
  padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ykt-muted {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ui-muted, #64748b);
}
.ykt-url {
  font-size: 12px;
  word-break: break-all;
  margin: 8px 0 12px;
}
.ykt-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ykt-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary, #16a34a) 28%, transparent);
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
}
.ykt-btn.primary {
  background: linear-gradient(135deg, var(--ui-primary, #16a34a), var(--ui-secondary, #22c55e));
  border-color: transparent;
  color: #fff;
}
</style>
