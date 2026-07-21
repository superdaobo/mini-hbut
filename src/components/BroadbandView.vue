<script setup>
/**
 * 教育网网费 — 一码通官方跳转/二维码
 */
import { onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { prepareOneCodeAppOpen } from '../utils/one_code_open.js'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState, TCard } from './templates'

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
    qrDataUrl.value = await QRCode.toDataURL(res.openUrl, { margin: 1, width: 220 })
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
  <div class="ykt-page">
    <TPageHeader title="教育网网费" icon="wifi" @back="emit('back')" />
    <div class="ykt-body">
      <TEmptyState v-if="loading" type="loading" message="正在准备网费入口…" />

      <TCard v-else-if="error" compact>
        <TEmptyState type="error" :message="error" />
        <button type="button" class="ykt-btn primary" @click="prepare">重试</button>
      </TCard>

      <TCard v-else-if="payUrl" compact>
        <template #header>
          <strong>官方缴纳入口</strong>
          <p class="ykt-muted">{{ hint }}</p>
        </template>
        <p class="ykt-url">{{ payUrl }}</p>
        <div v-if="qrDataUrl" class="ykt-qr">
          <img :src="qrDataUrl" alt="网费缴纳二维码" width="220" height="220" />
          <p class="ykt-muted">手机扫码打开官方页</p>
        </div>
        <div class="ykt-actions">
          <button type="button" class="ykt-btn primary" @click="openPay">打开缴纳页</button>
          <button type="button" class="ykt-btn" :disabled="loading" @click="prepare">重新生成</button>
        </div>
        <p class="ykt-note">App 不内嵌支付；结果以官方一码通为准。</p>
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
.ykt-muted,
.ykt-note {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ui-muted, #64748b);
}
.ykt-url {
  font-size: 12px;
  word-break: break-all;
  margin: 8px 0 12px;
  color: var(--ui-text, #0f172a);
}
.ykt-qr {
  text-align: center;
  margin: 12px 0;
}
.ykt-qr img {
  width: 220px;
  height: 220px;
  background: #fff;
  border-radius: 12px;
}
.ykt-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.ykt-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary, #0891b2) 28%, transparent);
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
}
.ykt-btn.primary {
  background: linear-gradient(135deg, var(--ui-primary, #0891b2), var(--ui-secondary, #06b6d4));
  border-color: transparent;
  color: #fff;
}
html.dark .ykt-btn {
  background: color-mix(in oklab, var(--ui-surface) 90%, #000 10%);
}
html.dark .ykt-btn.primary {
  color: #fff;
}
</style>
