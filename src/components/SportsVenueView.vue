<script setup>
/**
 * 运动场馆 — 直给入口
 */
import { ref } from 'vue'
import { prepareOneCodeAppOpen } from '../utils/one_code_open.js'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { TPageHeader } from './templates'

const emit = defineEmits(['back'])
const loading = ref(false)
const error = ref('')

const open = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await prepareOneCodeAppOpen({
      appCode: 'noQYzEiZ7L',
      appName: '运动场馆预约系统'
    })
    await openExternal(res.openUrl)
  } catch (e) {
    error.value = String(e?.message || e || '打开失败')
    showToast(error.value)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <TPageHeader title="运动场馆" icon="sports_soccer" @back="emit('back')" />
    <div class="body">
      <section class="card">
        <div v-if="error" class="err">{{ error }}</div>
        <button type="button" class="main" :disabled="loading" @click="open">
          <span class="material-symbols-outlined">stadium</span>
          {{ loading ? '打开中…' : '打开预约' }}
        </button>
        <p class="hint">校园网</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  background: #f8fafc;
  color: #0f172a;
  padding-bottom: 104px;
}
.body {
  padding: 16px;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
}
.err {
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 12px;
}
.main {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #15803d;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}
.main:disabled {
  opacity: 0.65;
}
.main:active:not(:disabled) {
  transform: scale(0.97);
}
.hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}
html.dark .page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card {
  background: var(--ui-surface, #111827);
  border-color: #334155;
}
</style>
