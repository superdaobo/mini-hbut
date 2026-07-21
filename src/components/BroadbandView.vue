<script setup>
/**
 * 教育网网费 — 一码通官方跳转/二维码
 */
import { onMounted, ref } from 'vue'
import { prepareOneCodeAppOpen } from '../utils/one_code_open.js'
import { qrToDataURL } from '../utils/qrcode.js'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState } from './templates'

const emit = defineEmits(['back'])
const loading = ref(false)
const error = ref('')
const payUrl = ref('')
const qrDataUrl = ref('')
const hint = ref('')

const prepare = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await prepareOneCodeAppOpen({
      appCode: 'broadband',
      appName: '缴纳教育网网费'
    })
    payUrl.value = res.openUrl
    hint.value = res.hint
    qrDataUrl.value = await qrToDataURL(res.openUrl, { width: 220 })
  } catch (e) {
    error.value = String(e?.message || e || '加载失败')
    payUrl.value = ''
    qrDataUrl.value = ''
  } finally {
    loading.value = false
  }
}

const openPay = async () => {
  if (!payUrl.value) return
  try {
    await openExternal(payUrl.value)
  } catch (e) {
    showToast(String(e?.message || e || '打开失败'))
  }
}

onMounted(prepare)
</script>

<template>
  <div class="page-shell">
    <TPageHeader title="教育网网费" icon="wifi" @back="emit('back')" />
    <div class="page-body">
      <TEmptyState v-if="loading" type="loading" message="正在准备网费入口…" />

      <section v-else-if="error" class="panel">
        <TEmptyState type="error" :message="error" />
        <button type="button" class="btn primary" @click="prepare">重试</button>
      </section>

      <section v-else-if="payUrl" class="panel">
        <h2 class="panel-title">
          <span class="material-symbols-outlined">payments</span>
          官方缴纳入口
        </h2>
        <p class="muted">{{ hint }}</p>
        <p class="url">{{ payUrl }}</p>
        <div v-if="qrDataUrl" class="qr">
          <img :src="qrDataUrl" alt="网费缴纳二维码" width="220" height="220" />
          <p class="muted">手机扫码打开官方页</p>
        </div>
        <div class="actions">
          <button type="button" class="btn primary" @click="openPay">打开缴纳页</button>
          <button type="button" class="btn" :disabled="loading" @click="prepare">重新生成</button>
        </div>
        <p class="note">App 不内嵌支付；结果以官方一码通为准。</p>
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
  color: #0f766e;
  font-size: 22px;
}
.muted,
.note {
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
.qr {
  text-align: center;
  margin: 12px 0;
}
.qr img {
  width: 220px;
  height: 220px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
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
  background: #0f766e;
  border-color: #0f766e;
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
html.dark .url,
html.dark .btn {
  color: var(--ui-text, #e2e8f0);
}
html.dark .btn {
  background: #1e293b;
  border-color: #334155;
}
html.dark .btn.primary {
  background: #0d9488;
  border-color: #0d9488;
  color: #fff;
}
</style>
