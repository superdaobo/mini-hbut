<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { qrToDataURL } from '../utils/qrcode.js'
import { t, tf, useI18n } from '../utils/app_i18n'
import {
  classifyCampusCodeFailure,
  createCampusCodeRefreshChain,
  createOrderStatusPoller
} from '../utils/campus_code_refresh.js'
import { TPageHeader } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const DEV_CODE_KEY = 'hbu_campus_code_devcode'
const MODE_KEY = 'hbu_campus_code_mode'
const ORDER_POLL_INTERVAL_MS = 3000

const loadingConfig = ref(false)
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

// #1114：二维码可用性状态机（由刷新链快照驱动，不再手工管理计时器/状态位）
// 取值：idle | loading | ready | failed | stopped_auth | stopped_business | stopped
const qrStatus = ref('idle')
const qrFailureKind = ref(null)
const qrRetryDelayMs = ref(null)
const lastSuccessAt = ref(null)

// #1114：组件内不再持有任何 setTimeout —— 全部计时器归注入式控制器所有；
// qrRenderSeq 仅用于使慢速的二维码图片渲染结果失效，防止旧图写回
let qrRenderSeq = 0
let chainRef = null
let orderPollerRef = null
let visibilityHandler = null

// #791：响应式 t —— 语言切换后模板即时生效
const { t: tLocale } = useI18n()

const normalizeMode = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  return raw === 'offline' ? 'offline' : 'online'
}

const currentModeLabel = computed(() =>
  tLocale(mode.value === 'offline' ? 'campuscode.mode.offline' : 'campuscode.mode.online')
)
const canOnline = computed(() => configData.value?.disableOnline !== true)
const canOffline = computed(() => configData.value?.enableOffline === true)
const refreshSecond = computed(() => {
  const raw = Number(configData.value?.refreshSecond || 60)
  if (!Number.isFinite(raw) || raw < 15) return 60
  return Math.min(raw, 180)
})
const isOfflineMode = computed(() => mode.value === 'offline')
const autoRefreshHint = computed(() =>
  isOfflineMode.value
    ? tLocale('campuscode.mode.offlineHint')
    : tf('campuscode.mode.onlineHint', { n: refreshSecond.value })
)

// #1114：失败/恢复文案（区分「将自动恢复」与「需手动重试」两类停止态）
const failureBanner = computed(() => {
  if (qrStatus.value === 'failed') {
    const delay = qrRetryDelayMs.value
    return typeof delay === 'number' && delay > 0
      ? tf('campuscode.state.recovering', { n: Math.round(delay / 1000) })
      : t('campuscode.state.recoverFailed')
  }
  if (qrStatus.value === 'stopped_auth') return t('campuscode.state.stoppedAuth')
  if (qrStatus.value === 'stopped_business') return t('campuscode.state.stoppedBusiness')
  return ''
})
const failureBannerType = computed(() =>
  qrStatus.value === 'stopped_auth' || qrStatus.value === 'stopped_business' ? 'error' : 'warn'
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

const renderQrCode = async () => {
  // #1114：记录渲染序号；若期间发生失效/新一轮渲染，慢速结果直接丢弃
  const seq = ++qrRenderSeq
  const text = qrcodeText.value
  qrImageDataUrl.value = ''
  if (!text) {
    return
  }

  try {
    const dataUrl = await qrToDataURL(text, {
      text,
      width: 248,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
    if (seq !== qrRenderSeq) return
    qrImageDataUrl.value = dataUrl
  } catch (error) {
    if (seq !== qrRenderSeq) return
    // 最后兜底：若本地编码失败，回退在线生成。
    qrImageDataUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=248x248&data=${encodeURIComponent(
      text
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
      // #1114：用分类器提取可读 message，避免把 {kind,message} 对象直接当字符串
      const failure = classifyCampusCodeFailure(data)
      // epic #1145 E6：网络层失败（transport）→ 明确的「需要网络连接」文案，
      // 不透传内部「请求发送失败」这类技术性措辞（断网时用户应知道是网络问题）
      const message = failure.kind === 'transport'
        ? t('campuscode.error.transport')
        : (failure.message || t('campuscode.error.configRequest'))
      throw new Error(message)
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
      return { type: 'success', text: t('campuscode.status.paid') }
    case '2':
      return { type: 'warn', text: t('campuscode.status.used') }
    case '4':
      return { type: 'warn', text: t('campuscode.status.illegal') }
    case '6':
      return { type: 'warn', text: t('campuscode.status.lowBalance') }
    case '7':
      return { type: 'warn', text: t('campuscode.status.payError') }
    case '5':
    default:
      return { type: 'idle', text: t('campuscode.status.waiting') }
  }
}

// —— #1114：刷新链接线（调度/退避/恢复全部在控制器内，组件只做状态映射与渲染）——

const applyChainState = (state) => {
  qrStatus.value = state.status
  qrFailureKind.value = state.kind
  qrRetryDelayMs.value = state.retryDelayMs
  if (typeof state.lastSuccessAt === 'number') lastSuccessAt.value = state.lastSuccessAt
}

const runQrRequest = async (_origin) => {
  const devCode = ensureDevCode()
  const { data } = await axios.post(`${API_BASE}/v2/campus_code/qrcode`, {
    mode: mode.value,
    qrcode_type: '',
    dev_code: devCode,
    student_id: props.studentId
  })
  if (!data?.success) {
    // #1114：失败时把完整载荷抛给控制器分类（error 可能是 {kind,message} 或字符串）
    throw data ?? new Error(t('campuscode.error.qrRequest'))
  }
  return data.resultData || {}
}

const applyQrPayload = (payload) => {
  const result = payload || {}
  const code = String(result.qrcode || '').trim()
  qrcodeText.value = code
  balance.value = String(result.balance || '--')
  idSerial.value = String(result.idSerial || '').trim()
  userName.value = String(result.userName || '').trim()
  lastRefreshAt.value = new Date().toLocaleTimeString()
  // #1114：新二维码使旧订单快照失效，避免历史快照暗示当前码已支付
  orderSnapshot.value = null
  const mapped = mapOrderStatus('5')
  statusType.value = mapped.type
  statusText.value = mapped.text

  void renderQrCode()
  startOrderPolling()
}

const applyQrFailure = () => {
  // #1114：失效二维码不得继续呈现为可安全支付的有效码：立即清空并停止订单轮询
  qrRenderSeq += 1
  qrcodeText.value = ''
  qrImageDataUrl.value = ''
  orderSnapshot.value = null
  stopOrderPolling()
}

const startChain = () => {
  stopChain()
  // 在线 = 周期自动刷新（refreshSecond）；离线（高能）= 一次性语义（周期为 null）。
  // 用 getter 而不是启动时快照，config 晚到/刷新周期变化后也能采用最新值。
  chainRef = createCampusCodeRefreshChain({
    request: runQrRequest,
    getIntervalMs: () => (isOfflineMode.value ? null : refreshSecond.value * 1000),
    onState: applyChainState,
    onSuccess: applyQrPayload,
    onFailure: applyQrFailure
  })
  chainRef.start()
}

const stopChain = () => {
  if (chainRef) {
    chainRef.stop()
    chainRef = null
  }
}

const manualRefresh = () => {
  // #1114：手动刷新可立即重试，任何失败/停止态均可发起
  if (chainRef) {
    chainRef.triggerNow()
  } else {
    startChain()
  }
}

// —— #1114：订单状态独立轮询（仅二维码有效时；失败有界退避继续；失败绝不写成功状态）——

const runOrderStatusRequest = async () => {
  const { data } = await axios.post(`${API_BASE}/v2/campus_code/order_status`, {
    qrcode: qrcodeText.value,
    offline: isOfflineMode.value,
    student_id: props.studentId
  })
  if (!data?.success) {
    throw data ?? new Error(t('campuscode.error.qrRequest'))
  }
  return data.resultData || {}
}

const applyOrderStatus = (payload) => {
  // #1114：乱序/陈旧响应守卫 —— 二维码已失效时不回写旧状态
  if (!qrcodeText.value) return
  const result = payload || {}
  orderSnapshot.value = result
  const mapped = mapOrderStatus(result.status)
  statusType.value = mapped.type
  statusText.value = mapped.text

  // 已支付 → 旧码已消费，停止旧码轮询并立即刷新出新码（避免 3s 内重复触发）
  if (String(result.status || '') === '1' && chainRef) {
    stopOrderPolling()
    chainRef.triggerNow()
  }
}

const startOrderPolling = () => {
  stopOrderPolling()
  orderPollerRef = createOrderStatusPoller({
    request: runOrderStatusRequest,
    getIntervalMs: () => ORDER_POLL_INTERVAL_MS,
    shouldContinue: () => !!qrcodeText.value,
    onResult: applyOrderStatus
  })
  orderPollerRef.start()
}

const stopOrderPolling = () => {
  if (orderPollerRef) {
    orderPollerRef.stop()
    orderPollerRef = null
  }
}

// —— 生命周期 ——

const handleSwitchMode = (nextMode) => {
  const target = normalizeMode(nextMode)
  if (target === mode.value) return
  if (target === 'online' && !canOnline.value) return
  if (target === 'offline' && !canOffline.value) return
  mode.value = target
  saveMode(target)
  // 以新模式语义重建刷新链；旧链计时器已被 stop() 全部失效
  startChain()
}

const handleBack = () => emit('back')

const onVisibilityChange = () => {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
  // #1114：回前台时，若在线且距上次成功已超过 refreshSecond，补一次刷新
  if (isOfflineMode.value || !chainRef) return
  const last = lastSuccessAt.value
  if (typeof last !== 'number') return
  if (Date.now() - last >= refreshSecond.value * 1000) {
    chainRef.triggerNow()
  }
}

onMounted(async () => {
  mode.value = loadMode()
  try {
    await fetchCampusCodeConfig()
    applyModeAvailability()
  } catch (error) {
    // #1114：config 失败只在配置错误槽展示，不阻塞二维码尝试、不吞掉二维码自身状态
    errorMsg.value = error?.message || t('campuscode.error.configFailed')
  }
  startChain()
  if (typeof document !== 'undefined') {
    visibilityHandler = onVisibilityChange
    document.addEventListener('visibilitychange', visibilityHandler)
  }
})

onBeforeUnmount(() => {
  // #1114：离开页面即停止全部计时并失效在途响应
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  stopChain()
  stopOrderPolling()
})
</script>

<template>
  <div class="campus-code-view">
    <TPageHeader icon="qr_code" :title="tLocale('campuscode.title')" @back="handleBack" />

    <section class="mode-panel">
      <button
        class="mode-chip"
        :class="{ active: mode === 'online', disabled: !canOnline }"
        :disabled="!canOnline || qrStatus === 'loading'"
        @click="handleSwitchMode('online')"
      >
        {{ tLocale('campuscode.mode.online') }}
      </button>
      <button
        class="mode-chip"
        :class="{ active: mode === 'offline', disabled: !canOffline }"
        :disabled="!canOffline || qrStatus === 'loading'"
        @click="handleSwitchMode('offline')"
      >
        {{ tLocale('campuscode.mode.offline') }}
      </button>
    </section>

    <section class="status-panel">
      <div class="line">
        <span class="label">{{ tLocale('campuscode.mode.current') }}</span>
        <span class="value">{{ currentModeLabel }}</span>
      </div>
      <div class="line">
        <span class="label">{{ tLocale('campuscode.mode.refreshPolicy') }}</span>
        <span class="value">{{ autoRefreshHint }}</span>
      </div>
      <div class="line">
        <span class="label">{{ tLocale('campuscode.mode.lastRefresh') }}</span>
        <span class="value">{{ lastRefreshAt || '--:--:--' }}</span>
      </div>
    </section>

    <section class="qr-panel">
      <div v-if="loadingConfig || qrStatus === 'loading'" class="loading-block">
        <div class="spinner"></div>
        <p>{{ loadingConfig ? tLocale('campuscode.loading.config') : tLocale('campuscode.loading.qr') }}</p>
      </div>

      <div v-else class="qr-body">
        <img v-if="qrImageDataUrl" :src="qrImageDataUrl" class="qr-fallback-image" :alt="tLocale('campuscode.qr.alt')" />
        <p v-if="!qrcodeText" class="qr-empty">{{ tLocale('campuscode.qr.empty') }}</p>
      </div>

      <div v-if="failureBanner" class="banner" :class="failureBannerType">{{ failureBanner }}</div>
      <div v-if="errorMsg" class="banner error">{{ errorMsg }}</div>
      <div v-if="statusText" class="banner" :class="statusType">{{ statusText }}</div>

      <div class="meta-grid">
        <div class="meta-item">
          <span>{{ tLocale('campuscode.meta.studentId') }}</span>
          <strong>{{ idSerial || tLocale('campuscode.meta.unknown') }}</strong>
        </div>
        <div class="meta-item">
          <span>{{ tLocale('campuscode.meta.name') }}</span>
          <strong>{{ userName || tLocale('campuscode.meta.unknown') }}</strong>
        </div>
        <div class="meta-item">
          <span>{{ tLocale('campuscode.meta.balance') }}</span>
          <strong>¥ {{ balance }}</strong>
        </div>
        <div class="meta-item">
          <span>{{ tLocale('campuscode.meta.mode') }}</span>
          <strong>{{ currentModeLabel }}</strong>
        </div>
      </div>

      <button class="refresh-btn" :disabled="qrStatus === 'loading'" @click="manualRefresh">
        {{ qrStatus === 'loading' ? tLocale('campuscode.refresh.working') : tLocale('campuscode.refresh.idle') }}
      </button>
    </section>

    <section v-if="orderSnapshot" class="order-panel">
      <h3>{{ tLocale('campuscode.order.title') }}</h3>
      <p>{{ tf('campuscode.order.statusCode', { code: orderSnapshot.status || '-' }) }}</p>
      <p>{{ tf('campuscode.order.txAmt', { amount: orderSnapshot.txAmt || '0.00' }) }}</p>
      <p>{{ tf('campuscode.order.payment', { name: orderSnapshot.paymentName || tLocale('campuscode.order.defaultPayment') }) }}</p>
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
    color-mix(in oklab, var(--ui-secondary) 86%, #0ea5e9 12%) 100%
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
