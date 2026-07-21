<script setup>
/**
 * 教育网网费 — 一码通 broadband 官方跳转/二维码
 * Issue: #438
 */
import { onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { invokeNative, isTauriRuntime } from '../platform/native'
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
    if (!isTauriRuntime()) throw new Error('请在客户端内使用本功能')
    const res = await invokeNative('one_code_app_open_prepare', {
      app_code: 'broadband',
      app_name: '缴纳教育网网费'
    })
    payUrl.value = String(res?.open_url || res?.pay_url || '').trim()
    hint.value = String(res?.hint || '打开官方页面完成查询与缴纳')
    if (payUrl.value) {
      qrDataUrl.value = await QRCode.toDataURL(payUrl.value, { margin: 1, width: 220 })
    } else {
      throw new Error(res?.message || '未能生成网费入口')
    }
  } catch (e) {
    error.value = String(e?.message || e || '加载失败')
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
  <div class="bb-page">
    <TPageHeader title="教育网网费" subtitle="一码通官方缴纳入口" @back="emit('back')" />
    <div class="bb-body">
      <p v-if="error" class="bb-error">{{ error }}</p>
      <TEmptyState v-if="loading" title="正在准备入口…" description="使用一码通会话生成跳转链接" />
      <section v-else-if="payUrl" class="card-surface">
        <p class="bb-hint">{{ hint }}</p>
        <p class="bb-url">{{ payUrl }}</p>
        <div v-if="qrDataUrl" class="bb-qr">
          <img :src="qrDataUrl" alt="网费缴纳二维码" />
          <p>可用手机扫码打开官方缴纳页</p>
        </div>
        <div class="bb-actions">
          <button type="button" class="bb-btn primary" @click="openPay">打开缴纳页</button>
          <button type="button" class="bb-btn" :disabled="loading" @click="prepare">重新生成</button>
        </div>
        <p class="bb-note">App 不内嵌支付；费用与结果以官方一码通为准。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.bb-page {
  min-height: 100%;
  background: var(--ui-bg, #f5f7fb);
  color: var(--ui-text, #0f172a);
}
.bb-body {
  padding: 12px 16px 28px;
}
.card-surface {
  background: var(--ui-surface, #fff);
  border: 1px solid var(--ui-border, #e2e8f0);
  border-radius: 14px;
  padding: 16px;
}
.bb-error {
  color: #dc2626;
  font-size: 13px;
}
.bb-hint,
.bb-note {
  font-size: 13px;
  color: var(--ui-muted, #64748b);
}
.bb-url {
  font-size: 12px;
  word-break: break-all;
  margin: 8px 0 12px;
}
.bb-qr {
  text-align: center;
  margin: 12px 0;
}
.bb-qr img {
  width: 220px;
  height: 220px;
  background: #fff;
  border-radius: 12px;
}
.bb-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.bb-btn {
  border: 1px solid var(--ui-border, #d0d7e2);
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 10px;
  padding: 8px 12px;
}
.bb-btn.primary {
  background: var(--ui-primary, #0891b2);
  border-color: transparent;
  color: #fff;
}
html.dark .bb-page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card-surface {
  background: var(--ui-surface, #111827);
  border-color: var(--ui-border, #1f2937);
}
</style>
