<script setup>
/**
 * 教育网网费 — 直给官方入口（每次打开重新签发未消费 tid）
 */
import { ref } from 'vue'
import { prepareOneCodeAppOpen } from '../utils/one_code_open.js'
import { qrToDataURL } from '../utils/qrcode.js'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { TPageHeader } from './templates'

const emit = defineEmits(['back'])
const loading = ref(false)
const error = ref('')
const qrDataUrl = ref('')
const showQr = ref(false)

/** 每次重新 mint：tid 一次性 */
const mintAndOpen = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await prepareOneCodeAppOpen({
      appCode: 'broadband',
      appName: '缴纳教育网网费'
    })
    await openExternal(res.openUrl)
  } catch (e) {
    error.value = String(e?.message || e || '打开失败')
    showToast(error.value)
  } finally {
    loading.value = false
  }
}

const mintQr = async () => {
  if (showQr.value) {
    showQr.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await prepareOneCodeAppOpen({
      appCode: 'broadband',
      appName: '缴纳教育网网费'
    })
    qrDataUrl.value = await qrToDataURL(res.openUrl, { width: 180 })
    showQr.value = true
  } catch (e) {
    error.value = String(e?.message || e || '生成失败')
    showToast(error.value)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <TPageHeader title="教育网网费" icon="wifi" @back="emit('back')" />
    <div class="body">
      <section class="card">
        <div v-if="error" class="err">{{ error }}</div>

        <div class="actions">
          <button type="button" class="main" :disabled="loading" @click="mintAndOpen">
            <span class="material-symbols-outlined">payments</span>
            {{ loading ? '打开中…' : '缴纳网费' }}
          </button>
          <button
            type="button"
            class="side"
            :disabled="loading"
            :aria-pressed="showQr"
            @click="mintQr"
          >
            <span class="material-symbols-outlined">qr_code_2</span>
          </button>
        </div>

        <div v-if="showQr && qrDataUrl" class="qr">
          <img :src="qrDataUrl" alt="网费缴纳" width="180" height="180" />
        </div>
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
.actions {
  display: flex;
  gap: 8px;
}
.main {
  flex: 1;
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #059669;
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
.side {
  width: 48px;
  min-height: 48px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.qr {
  margin-top: 14px;
  display: flex;
  justify-content: center;
}
.qr img {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
}
html.dark .page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card {
  background: var(--ui-surface, #111827);
  border-color: #334155;
}
html.dark .side {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}
</style>
