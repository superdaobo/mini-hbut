<script setup>
/**
 * 运动场馆预约 — 一码通第三方入口
 */
import { onMounted, ref } from 'vue'
import { prepareOneCodeAppOpen } from '../utils/one_code_open.js'
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
  <div class="page-shell">
    <TPageHeader title="运动场馆" icon="sports_soccer" @back="emit('back')" />
    <div class="page-body">
      <TEmptyState v-if="loading" type="loading" message="正在准备场馆入口…" />

      <section v-else-if="error" class="panel">
        <TEmptyState type="error" :message="error" />
        <button type="button" class="btn primary" @click="prepare">重试</button>
      </section>

      <section v-else-if="openUrl" class="panel">
        <h2 class="panel-title">
          <span class="material-symbols-outlined">stadium</span>
          预约系统入口
        </h2>
        <p class="muted">{{ hint }}</p>
        <p class="url">{{ openUrl }}</p>
        <div class="actions">
          <button type="button" class="btn primary" @click="open">打开预约系统</button>
          <button type="button" class="btn" :disabled="loading" @click="prepare">重新生成</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page-shell {
  min-height: 100%;
  background: #f6fafe;
  color: #1e293b;
  padding-bottom: 104px;
}
.page-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 16px;
  box-shadow: 0 4px 15px rgba(15, 23, 42, 0.04);
  padding: 16px;
}
.panel-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
}
.panel-title .material-symbols-outlined {
  color: #15803d;
  font-size: 22px;
}
.muted {
  margin: 8px 0 0;
  font-size: 13px;
  color: #64748b;
}
.url {
  font-size: 12px;
  word-break: break-all;
  margin: 10px 0 12px;
  color: #334155;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
}
.btn.primary {
  background: #15803d;
  border-color: #15803d;
  color: #fff;
}
html.dark .page-shell {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .panel {
  background: var(--ui-surface, #111827);
  border-color: #334155;
}
html.dark .btn {
  background: #1e293b;
  border-color: #334155;
  color: var(--ui-text, #e2e8f0);
}
html.dark .btn.primary {
  background: #16a34a;
  border-color: #16a34a;
  color: #fff;
}
</style>
