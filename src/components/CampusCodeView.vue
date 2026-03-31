<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import axios from 'axios'
import QRCode from 'qrcode'
import { TPageHeader } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const DEV_CODE_KEY = 'hbu_campus_code_devcode'
const MODE_KEY = 'hbu_campus_code_mode'
const loadingConfig = ref(false)
const loadingCode = ref(false)
const mode = ref('online')
const configData = ref({})
const qrcodeText = ref('')
const qrImageDataUrl = ref('')
const balance = ref('--')
const idSerial = ref('')
const userName = ref('')
const errorMsg = ref('')
const statusText = ref('')
const statusType = ref('idle')
const lastRefreshAt = ref('')
const orderSnapshot = ref(null)

let refreshTimer = null
let orderTimer = null
let orderPolling = false

const normalizeMode = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  return raw === 'offline' ? 'offline' : 'online'
}

const currentModeLabel = computed(() => (mode.value === 'offline' ? '高能模式' : '在线模式'))
const canOnline = computed(() => configData.value?.disableOnline !== true)
const canOffline = computed(() => configData.value?.enableOffline === true)
const refreshSecond = computed(() => {
  const raw = Number(configData.value?.refreshSecond || 60)
  if (!Number.isFinite(raw) || raw < 15) return 60
  return Math.min(raw, 180)
})
const isOfflineMode = computed(() => mode.value === 'offline')
const autoRefreshHint = computed(() =>
  isOfflineMode.value ? '高能模式下为手动刷新' : `在线模式每 ${refreshSecond.value} 秒自动刷新`
)

const ensureDevCode = () => {
  try {
    const saved = String(localStorage.getItem(DEV_CODE_KEY) || '').trim()
    if (/^\d{12,22}$/.test(saved)) return saved
    const next = `${Date.now()}${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    localStorage.setItem(DEV_CODE_KEY, next)
    return next
  } catch {
    return '17724566707419069471'
  }
}

const saveMode = (value) => {
  try {
    localStorage.setItem(MODE_KEY, value)
  } catch {
    // ignore
  }
}

const loadMode = () => {
  try {
    return normalizeMode(localStorage.getItem(MODE_KEY))
  } catch {
    return 'online'
  }
}

const clearTimers = () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (orderTimer) {
    clearTimeout(orderTimer)
    orderTimer = null
  }
}

const renderQrCode = async () => {
  qrImageDataUrl.value = ''
  if (!qrcodeText.value) {
    return
  }

  try {
    qrImageDataUrl.value = await QRCode.toDataURL(qrcodeText.value, {
      text: qrcodeText.value,
      width: 248,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
  } catch (error) {
    // 最后兜底：若本地编码失败，回退在线生成。
    qrImageDataUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=248x248&data=${encodeURIComponent(
      qrcodeText.value
    )}`
  }
}

const fetchCampusCodeConfig = async () => {
  loadingConfig.value = true
  try {
    const devCode = ensureDevCode()
    const { data } = await axios.post(`${API_BASE}/v2/campus_code/config`, {
      dev_code: devCode,
      student_id: props.studentId
    })
    if (!data?.success) {
      throw new Error(data?.message || data?.error || '校园码配置请求失败')
    }
    configData.value = data.resultData || {}
  } finally {
    loadingConfig.value = false
  }
}

const applyModeAvailability = () => {
  if (mode.value === 'offline' && !canOffline.value) {
    mode.value = canOnline.value ? 'online' : 'offline'
  }
  if (mode.value === 'online' && !canOnline.value && canOffline.value) {
    mode.value = 'offline'
  }
  saveMode(mode.value)
}

const mapOrderStatus = (code) => {
  const statusCode = String(code || '')
  switch (statusCode) {
    case '1':
      return { type: 'success', text: '检测到支付成功，已自动刷新新二维码。' }
    case '2':
      return { type: 'warn', text: '当前二维码已被使用，请刷新后继续。' }
    case '4':
      return { type: 'warn', text: '二维码状态异常（非法码），请刷新。' }
    case '6':
      return { type: 'warn', text: '校园卡余额不足，请充值后重试。' }
    case '7':
      return { type: 'warn', text: '支付异常，请稍后重试或联系管理员。' }
    case '5':
    default:
      return { type: 'idle', text: '等待扫码中…' }
  }
}

const scheduleAutoRefresh = () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (isOfflineMode.value) return
  refreshTimer = setTimeout(() => {
    refreshCampusCode({ silent: true }).catch(() => {})
  }, refreshSecond.value * 1000)
}

const scheduleOrderPolling = () => {
  if (orderTimer) {
    clearTimeout(orderTimer)
    orderTimer = null
  }
  if (!qrcodeText.value) return
  orderTimer = setTimeout(() => {
    queryOrderStatus().catch(() => {})
  }, 3000)
}

const queryOrderStatus = async () => {
  if (orderPolling || !qrcodeText.value) {
    scheduleOrderPolling()
    return
  }
  orderPolling = true
  try {
    const { data } = await axios.post(`${API_BASE}/v2/campus_code/order_status`, {
      qrcode: qrcodeText.value,
      offline: isOfflineMode.value,
      student_id: props.studentId
    })
    if (!data?.success) {
      scheduleOrderPolling()
      return
    }
    const result = data.resultData || {}
    orderSnapshot.value = result
    const mapped = mapOrderStatus(result.status)
    statusType.value = mapped.type
    statusText.value = mapped.text

    if (String(result.status || '') === '1') {
      await refreshCampusCode({ silent: true })
      return
    }
  } catch {
    // ignore order status failure
  } finally {
    orderPolling = false
  }
  scheduleOrderPolling()
}

const refreshCampusCode = async ({ silent = false } = {}) => {
  if (loadingCode.value) return
  loadingCode.value = true
  if (!silent) {
    errorMsg.value = ''
  }
  clearTimers()

  try {
    const devCode = ensureDevCode()
    const { data } = await axios.post(`${API_BASE}/v2/campus_code/qrcode`, {
      mode: mode.value,
      qrcode_type: '',
      dev_code: devCode,
      student_id: props.studentId
    })
    if (!data?.success) {
      throw new Error(data?.message || data?.error || '校园码请求失败')
    }
    const result = data.resultData || {}
    qrcodeText.value = String(result.qrcode || '').trim()
    balance.value = String(result.balance || '--')
    idSerial.value = String(result.idSerial || '').trim()
    userName.value = String(result.userName || '').trim()
    lastRefreshAt.value = new Date().toLocaleTimeString()
    const mapped = mapOrderStatus('5')
    statusType.value = mapped.type
    statusText.value = mapped.text

    await nextTick()
    await renderQrCode()
    scheduleAutoRefresh()
    scheduleOrderPolling()
  } catch (error) {
    qrcodeText.value = ''
    qrImageDataUrl.value = ''
    if (!silent) {
      errorMsg.value = error?.message || '校园码加载失败'
    }
  } finally {
    loadingCode.value = false
  }
}

const handleSwitchMode = async (nextMode) => {
  const target = normalizeMode(nextMode)
  if (target === mode.value) return
  if (target === 'online' && !canOnline.value) return
  if (target === 'offline' && !canOffline.value) return
  mode.value = target
  saveMode(target)
  await refreshCampusCode()
}

const handleBack = () => emit('back')

onMounted(async () => {
  mode.value = loadMode()
  try {
    await fetchCampusCodeConfig()
    applyModeAvailability()
  } catch (error) {
    errorMsg.value = error?.message || '校园码配置加载失败'
  }
  await refreshCampusCode({ silent: false })
})

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <div class="campus-code-view">
    <TPageHeader icon="🎫" title="校园码" @back="handleBack" />

    <section class="mode-panel">
      <button
        class="mode-chip"
        :class="{ active: mode === 'online', disabled: !canOnline }"
        :disabled="!canOnline || loadingCode"
        @click="handleSwitchMode('online')"
      >
        在线模式
      </button>
      <button
        class="mode-chip"
        :class="{ active: mode === 'offline', disabled: !canOffline }"
        :disabled="!canOffline || loadingCode"
        @click="handleSwitchMode('offline')"
      >
        高能模式
      </button>
    </section>

    <section class="status-panel">
      <div class="line">
        <span class="label">当前模式</span>
        <span class="value">{{ currentModeLabel }}</span>
      </div>
      <div class="line">
        <span class="label">刷新策略</span>
        <span class="value">{{ autoRefreshHint }}</span>
      </div>
      <div class="line">
        <span class="label">最后刷新</span>
        <span class="value">{{ lastRefreshAt || '--:--:--' }}</span>
      </div>
    </section>

    <section class="qr-panel">
      <div v-if="loadingConfig || loadingCode" class="loading-block">
        <div class="spinner"></div>
        <p>{{ loadingConfig ? '加载校园码配置中...' : '正在生成校园码...' }}</p>
      </div>

      <div v-else class="qr-body">
        <img v-if="qrImageDataUrl" :src="qrImageDataUrl" class="qr-fallback-image" alt="校园码二维码" />
        <p v-if="!qrcodeText" class="qr-empty">暂无可用二维码，请点击刷新</p>
      </div>

      <div v-if="errorMsg" class="banner error">{{ errorMsg }}</div>
      <div v-if="statusText" class="banner" :class="statusType">{{ statusText }}</div>

      <div class="meta-grid">
        <div class="meta-item">
          <span>学号</span>
          <strong>{{ idSerial || '未知' }}</strong>
        </div>
        <div class="meta-item">
          <span>姓名</span>
          <strong>{{ userName || '未知' }}</strong>
        </div>
        <div class="meta-item">
          <span>余额</span>
          <strong>¥ {{ balance }}</strong>
        </div>
        <div class="meta-item">
          <span>模式</span>
          <strong>{{ currentModeLabel }}</strong>
        </div>
      </div>

      <button class="refresh-btn" :disabled="loadingCode" @click="refreshCampusCode()">
        {{ loadingCode ? '刷新中...' : '手动刷新二维码' }}
      </button>
    </section>

    <section v-if="orderSnapshot" class="order-panel">
      <h3>最近状态</h3>
      <p>状态码：{{ orderSnapshot.status || '-' }}</p>
      <p>交易金额：{{ orderSnapshot.txAmt || '0.00' }}</p>
      <p>支付方式：{{ orderSnapshot.paymentName || '虚拟卡被扫支付' }}</p>
    </section>
  </div>
</template>

<style scoped>
.campus-code-view {
  min-height: 100vh;
  background:
    radial-gradient(120% 120% at 5% 0%, color-mix(in oklab, var(--ui-primary) 18%, #f8fbff 82%), #f7f9fc 45%),
    linear-gradient(180deg, #f7f9fc 0%, #eef3f9 100%);
  padding: 0 0 24px;
  color: #0f172a;
}

.code-header {
  position: sticky;
  top: 0;
  z-index: 12;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: color-mix(in oklab, var(--ui-primary) 18%, rgba(255, 255, 255, 0.94));
  border-bottom: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.26));
  backdrop-filter: blur(12px);
}

.title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.title-text {
  font-size: 17px;
  letter-spacing: 0.4px;
}

.header-placeholder {
  width: 72px;
  height: 1px;
  display: inline-block;
}

.header-btn {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  background: color-mix(in oklab, var(--ui-primary) 12%, rgba(255, 255, 255, 0.9));
}

.mode-panel {
  margin: 14px 16px 0;
  padding: 8px;
  border-radius: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.22);
}

.mode-chip {
  border: none;
  border-radius: 12px;
  padding: 10px 8px;
  font-weight: 700;
  font-size: 14px;
  color: #334155;
  background: rgba(248, 250, 252, 0.92);
}

.mode-chip.active {
  color: #fff;
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 84%, #1e3a8a 16%) 0%,
    color-mix(in oklab, var(--ui-secondary) 84%, #2563eb 16%) 100%
  );
  box-shadow: 0 10px 24px color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.mode-chip.disabled {
  opacity: 0.42;
}

.status-panel,
.qr-panel,
.order-panel {
  margin: 12px 16px 0;
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.05);
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 2px;
}

.line .label {
  color: #64748b;
  font-size: 13px;
}

.line .value {
  font-weight: 700;
  font-size: 14px;
}

.loading-block {
  padding: 20px 8px 8px;
  text-align: center;
  color: #475569;
}

.spinner {
  margin: 0 auto 10px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid #e2e8f0;
  border-top-color: color-mix(in oklab, var(--ui-primary) 82%, #2563eb 18%);
  animation: spin 0.75s linear infinite;
}

.qr-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-fallback-image {
  width: 248px;
  height: 248px;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  margin-bottom: 10px;
  background: #fff;
}

.qr-empty {
  margin-top: 10px;
  color: #64748b;
  font-size: 13px;
}

.banner {
  margin-top: 10px;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
}

.banner.error {
  color: #b91c1c;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(254, 226, 226, 0.72);
}

.banner.idle {
  color: #334155;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(241, 245, 249, 0.84);
}

.banner.warn {
  color: #9a3412;
  border: 1px solid rgba(251, 191, 36, 0.45);
  background: rgba(254, 243, 199, 0.78);
}

.banner.success {
  color: #166534;
  border: 1px solid rgba(74, 222, 128, 0.4);
  background: rgba(220, 252, 231, 0.8);
}

.meta-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.meta-item {
  border-radius: 12px;
  padding: 10px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.meta-item span {
  display: block;
  color: #64748b;
  font-size: 12px;
}

.meta-item strong {
  display: block;
  margin-top: 4px;
  font-size: 14px;
}

.refresh-btn {
  width: 100%;
  margin-top: 14px;
  border: none;
  border-radius: 12px;
  padding: 11px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 86%, #0f172a 14%) 0%,
    color-mix(in oklab, var(--ui-secondary) 88%, #1d4ed8 12%) 100%
  );
}

.refresh-btn:disabled {
  opacity: 0.6;
}

.order-panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.order-panel p {
  margin: 4px 0;
  color: #475569;
  font-size: 13px;
}

:global(html[data-theme='graphite_night']) .campus-code-view {
  background:
    radial-gradient(130% 120% at 8% 0%, rgba(37, 99, 235, 0.16), transparent 42%),
    linear-gradient(180deg, #07111f 0%, #0d1726 52%, #132132 100%);
  color: #e2e8f0;
}

:global(html[data-theme='graphite_night']) .campus-code-view .code-header,
:global(html[data-theme='graphite_night']) .campus-code-view .mode-panel,
:global(html[data-theme='graphite_night']) .campus-code-view .status-panel,
:global(html[data-theme='graphite_night']) .campus-code-view .qr-panel,
:global(html[data-theme='graphite_night']) .campus-code-view .order-panel {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.84)) !important;
  border-color: color-mix(in oklab, var(--ui-primary) 28%, rgba(148, 163, 184, 0.28)) !important;
  box-shadow:
    0 16px 34px rgba(2, 6, 23, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

:global(html[data-theme='graphite_night']) .campus-code-view .title-text,
:global(html[data-theme='graphite_night']) .campus-code-view .line .value,
:global(html[data-theme='graphite_night']) .campus-code-view .order-panel h3,
:global(html[data-theme='graphite_night']) .campus-code-view .meta-item strong {
  color: #f8fbff !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .header-btn,
:global(html[data-theme='graphite_night']) .campus-code-view .mode-chip {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.76), rgba(30, 41, 59, 0.72)) !important;
  color: #dbe6f7 !important;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.24)) !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .mode-chip.active {
  color: #ffffff !important;
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 86%, #1e3a8a 14%) 0%,
    color-mix(in oklab, var(--ui-secondary) 88%, #0ea5e9 12%) 100%
  ) !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .line .label,
:global(html[data-theme='graphite_night']) .campus-code-view .loading-block,
:global(html[data-theme='graphite_night']) .campus-code-view .qr-empty,
:global(html[data-theme='graphite_night']) .campus-code-view .order-panel p,
:global(html[data-theme='graphite_night']) .campus-code-view .meta-item span {
  color: #9fb0cb !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .meta-item {
  background: linear-gradient(160deg, rgba(8, 15, 28, 0.6), rgba(15, 23, 42, 0.52)) !important;
  border-color: color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.18)) !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .banner.idle {
  color: #dbe6f7 !important;
  border-color: rgba(148, 163, 184, 0.32) !important;
  background: rgba(15, 23, 42, 0.82) !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .banner.warn {
  color: #fde68a !important;
  border-color: rgba(251, 191, 36, 0.34) !important;
  background: rgba(120, 53, 15, 0.3) !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .banner.error {
  color: #fecaca !important;
  border-color: rgba(248, 113, 113, 0.34) !important;
  background: rgba(127, 29, 29, 0.34) !important;
}

:global(html[data-theme='graphite_night']) .campus-code-view .banner.success {
  color: #bbf7d0 !important;
  border-color: rgba(74, 222, 128, 0.34) !important;
  background: rgba(20, 83, 45, 0.34) !important;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
