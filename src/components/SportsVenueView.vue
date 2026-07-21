<script setup>
/**
 * 运动场馆预约 — 一码通第三方入口（可能需校园网）
 * Issue: #438
 */
import { onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState } from './templates'

const emit = defineEmits(['back'])
const loading = ref(false)
const error = ref('')
const openUrl = ref('')
const hint = ref('场馆系统可能仅校园网可达。')

const prepare = async () => {
  loading.value = true
  error.value = ''
  try {
    if (!isTauriRuntime()) throw new Error('请在客户端内使用本功能')
    const res = await invokeNative('one_code_app_open_prepare', {
      app_code: 'noQYzEiZ7L',
      app_name: '运动场馆预约系统'
    })
    openUrl.value = String(res?.open_url || res?.pay_url || '').trim()
    if (res?.hint) hint.value = String(res.hint)
    if (!openUrl.value) throw new Error(res?.message || '未能生成场馆入口')
  } catch (e) {
    error.value = String(e?.message || e || '加载失败')
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
  <div class="sv-page">
    <TPageHeader title="运动场馆" subtitle="预约入口" @back="emit('back')" />
    <div class="sv-body">
      <p v-if="error" class="sv-error">{{ error }}</p>
      <TEmptyState v-if="loading" title="正在准备入口…" description="经一码通会话跳转官方系统" />
      <section v-else-if="openUrl" class="card-surface">
        <p class="sv-hint">{{ hint }}</p>
        <p class="sv-url">{{ openUrl }}</p>
        <button type="button" class="sv-btn primary" @click="open">打开预约系统</button>
        <button type="button" class="sv-btn" :disabled="loading" @click="prepare">重新生成</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sv-page {
  min-height: 100%;
  background: var(--ui-bg, #f5f7fb);
  color: var(--ui-text, #0f172a);
}
.sv-body {
  padding: 12px 16px 28px;
}
.card-surface {
  background: var(--ui-surface, #fff);
  border: 1px solid var(--ui-border, #e2e8f0);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sv-error {
  color: #dc2626;
}
.sv-hint {
  color: var(--ui-muted, #64748b);
  font-size: 13px;
}
.sv-url {
  font-size: 12px;
  word-break: break-all;
}
.sv-btn {
  border: 1px solid var(--ui-border, #d0d7e2);
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 10px;
  padding: 8px 12px;
  width: fit-content;
}
.sv-btn.primary {
  background: var(--ui-primary, #16a34a);
  border-color: transparent;
  color: #fff;
}
html.dark .sv-page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card-surface {
  background: var(--ui-surface, #111827);
  border-color: var(--ui-border, #1f2937);
}
</style>
