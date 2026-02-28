<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import axios from 'axios'
import hbutLogo from '../assets/hbut-logo.png'
import { fetchRemoteConfig, applyOcrRuntimeConfig, getStoredOcrConfig } from '../utils/remote_config.js'
import { invokeNative as invoke, isTauriRuntime } from '../platform/native'

const props = defineProps({
  loginMode: { type: String, default: 'portal_password' }
})

const emit = defineEmits(['success', 'switchMode', 'showLegal'])

const LOGIN_METHOD_KEY = 'hbu_login_method'
const LOGIN_MODE_PREF_KEY = 'hbu_login_entry_mode'
const LOGIN_TEMP_FLAG_KEY = 'hbu_login_temporary'
const LOGOUT_REASON_KEY = 'hbu_logout_reason'
const TEMP_SESSION_EXPIRED_REASON = 'temp_session_expired'

const LOGIN_MODES = [
  {
    key: 'portal_password',
    title: '新融合门户账号密码登录',
    desc: '完整功能，支持记住密码',
    limited: false,
    temporary: false
  },
  {
    key: 'portal_qr_temp',
    title: '新融合门户扫码登录（临时登录查询）',
    desc: '扫码后临时会话，失效自动退出',
    limited: false,
    temporary: true
  },
  {
    key: 'chaoxing_password',
    title: '学习通账号密码登录（功能受限）',
    desc: '仅保留入口，功能开发中',
    limited: true,
    temporary: false
  },
  {
    key: 'chaoxing_qr_temp',
    title: '学习通扫码登录（功能受限且临时登录）',
    desc: '仅保留入口，功能开发中',
    limited: true,
    temporary: true
  }
]

const isKnownMode = (mode) => LOGIN_MODES.some((item) => item.key === mode)
const resolveInitialMode = () => {
  const fromProp = String(props.loginMode || '').trim()
  if (isKnownMode(fromProp)) return fromProp
  const fromStorage = String(localStorage.getItem(LOGIN_MODE_PREF_KEY) || '').trim()
  if (isKnownMode(fromStorage)) return fromStorage
  return 'portal_password'
}

const activeMode = ref(resolveInitialMode())
const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const agreePolicy = ref(false)
const loading = ref(false)
const statusMsg = ref('')
const ocrConfigMode = ref('本地')

const qrUuid = ref('')
const qrImageBase64 = ref('')
const qrState = ref('idle')
const qrStateMessage = ref('')
const qrSubmitting = ref(false)
const qrExpiresAt = ref(0)
const qrRemainingSeconds = ref(0)
let qrTimer = null
let qrPollingBusy = false

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const isPortalPasswordMode = computed(() => activeMode.value === 'portal_password')
const isPortalQrMode = computed(() => activeMode.value === 'portal_qr_temp')
const currentModeMeta = computed(() => LOGIN_MODES.find((item) => item.key === activeMode.value) || LOGIN_MODES[0])
const canSubmitPasswordLogin = computed(() => {
  return Boolean(username.value && password.value && agreePolicy.value && !loading.value)
})

const applyLoginMethodStorage = (mode) => {
  const isTemp = mode.endsWith('_temp')
  localStorage.setItem(LOGIN_METHOD_KEY, mode)
  localStorage.setItem(LOGIN_TEMP_FLAG_KEY, isTemp ? '1' : '0')
}

const resolveOcrModeLabel = (status, endpoint) => {
  const activeSource = String(status?.active_source || '').trim()
  if (activeSource.includes('fallback') || activeSource.includes('local')) return '本地'
  if (activeSource && activeSource !== 'unknown') return '远程'

  const configured = String(status?.configured_endpoint || '').trim()
  if (configured || endpoint) return '远程'
  if (status?.fallback_used) return '本地'
  return '本地'
}

const refreshOcrMode = async (endpointHint = '') => {
  try {
    const runtime = await invoke('get_ocr_runtime_status')
    ocrConfigMode.value = resolveOcrModeLabel(runtime, endpointHint)
  } catch {
    ocrConfigMode.value = endpointHint ? '远程' : '本地'
  }
}

const ensureOcrEndpointReady = async () => {
  let endpointHint = ''
  try {
    const cfg = await fetchRemoteConfig()
    await applyOcrRuntimeConfig(cfg)
    endpointHint = String(cfg?.ocr?.endpoint || '').trim()
  } catch (e) {
    console.warn('[OCR] 拉取远程配置失败，改用本地 OCR 配置:', e)
    const localCfg = getStoredOcrConfig()
    await applyOcrRuntimeConfig({
      ocr: {
        enabled: true,
        endpoint: localCfg.endpoint,
        endpoints: localCfg.endpoints,
        local_fallback_endpoints: localCfg.local_fallback_endpoints
      }
    })
    endpointHint = localCfg.endpoint
  }
  await refreshOcrMode(endpointHint)
}

const handleOcrConfigUpdated = () => {
  const localCfg = getStoredOcrConfig()
  refreshOcrMode(String(localCfg.endpoint || '').trim())
}

const clearQrTimer = () => {
  if (qrTimer) {
    clearTimeout(qrTimer)
    qrTimer = null
  }
}

const resetQrState = () => {
  clearQrTimer()
  qrUuid.value = ''
  qrImageBase64.value = ''
  qrState.value = 'idle'
  qrStateMessage.value = ''
  qrExpiresAt.value = 0
  qrRemainingSeconds.value = 0
  qrSubmitting.value = false
  qrPollingBusy = false
}

const updateQrCountdown = () => {
  if (!qrExpiresAt.value) {
    qrRemainingSeconds.value = 0
    return
  }
  const remain = Math.max(0, Math.ceil((qrExpiresAt.value - Date.now()) / 1000))
  qrRemainingSeconds.value = remain
  if (remain === 0 && qrState.value !== 'success') {
    qrState.value = 'expired'
    qrStateMessage.value = '二维码已失效，请点击刷新二维码。'
    clearQrTimer()
  }
}

const scheduleQrPoll = () => {
  clearQrTimer()
  qrTimer = setTimeout(() => {
    pollPortalQrStatus().catch((e) => {
      console.warn('[QR] 轮询状态失败:', e)
    })
  }, 1000)
}

const fetchGradesAfterLogin = async (sid) => {
  const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid })
  return res.data
}

const emitSuccessWithGrades = async (sid) => {
  try {
    const gradesData = await fetchGradesAfterLogin(sid)
    if (gradesData?.success) {
      emit('success', gradesData.data || [])
      return
    }
    statusMsg.value = `⚠️ 登录成功，但成绩同步失败：${gradesData?.error || '未知错误'}`
    emit('success', [])
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message || '未知错误'
    statusMsg.value = `⚠️ 登录成功，但成绩同步失败：${errMsg}`
    emit('success', [])
  }
}

const saveCredentials = () => {
  if (rememberMe.value) {
    localStorage.setItem('hbu_username', username.value)
    localStorage.setItem('hbu_credentials', password.value)
    localStorage.setItem('hbu_remember', 'true')
  } else {
    localStorage.removeItem('hbu_credentials')
    localStorage.setItem('hbu_remember', 'false')
  }
}

const handlePasswordLogin = async () => {
  if (!username.value || !password.value) {
    statusMsg.value = '请输入完整的账号和密码'
    return
  }
  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }

  loading.value = true
  statusMsg.value = '🔒 正在登录...'
  await ensureOcrEndpointReady()
  saveCredentials()

  try {
    const res = await axios.post(`${API_BASE}/v2/start_login`, {
      username: username.value,
      password: password.value,
      captcha: '',
      lt: '',
      execution: ''
    })
    const result = res.data

    if (!result?.success) {
      statusMsg.value = `❌ ${result?.error || '登录失败'}`
      return
    }

    const sid = String(result?.data?.student_id || username.value || '').trim()
    if (sid) {
      localStorage.setItem('hbu_username', sid)
    }
    applyLoginMethodStorage('portal_password')
    localStorage.removeItem(LOGOUT_REASON_KEY)
    statusMsg.value = '✅ 登录成功，正在同步数据...'
    await emitSuccessWithGrades(sid || username.value)
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message || '未知错误'
    statusMsg.value = `⚠️ 登录失败: ${errMsg}`
  } finally {
    loading.value = false
    await refreshOcrMode(String(getStoredOcrConfig().endpoint || '').trim())
  }
}

const pollPortalQrStatus = async () => {
  if (!qrUuid.value || !isPortalQrMode.value) return
  if (qrSubmitting.value || qrPollingBusy) return

  updateQrCountdown()
  if (qrState.value === 'expired') return

  qrPollingBusy = true
  try {
    const payload = await invoke('portal_qr_check_status', { uuid: qrUuid.value })
    const code = String(payload?.status_code || '').trim()

    if (code === '1') {
      qrState.value = 'confirming'
      qrStateMessage.value = '扫码确认成功，正在提交登录...'
      await confirmPortalQrLogin()
      return
    }
    if (code === '2') {
      qrState.value = 'scanned'
      qrStateMessage.value = '已扫码，请在手机端确认登录。'
    } else if (code === '3') {
      qrState.value = 'expired'
      qrStateMessage.value = '二维码已失效，请点击刷新二维码。'
      clearQrTimer()
      return
    } else {
      qrState.value = 'waiting'
      qrStateMessage.value = '等待扫码中...'
    }
  } catch (e) {
    qrState.value = 'error'
    qrStateMessage.value = `二维码状态查询失败：${e.message || e}`
  } finally {
    qrPollingBusy = false
  }

  updateQrCountdown()
  if (qrState.value !== 'expired' && qrState.value !== 'success') {
    scheduleQrPoll()
  }
}

const initPortalQrLogin = async () => {
  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }
  if (!isTauriRuntime()) {
    statusMsg.value = '当前运行时暂不支持原生扫码登录，请使用账号密码登录。'
    return
  }

  statusMsg.value = ''
  qrSubmitting.value = false
  qrState.value = 'loading'
  qrStateMessage.value = '正在生成二维码...'
  clearQrTimer()

  try {
    const payload = await invoke('portal_qr_init_login', {
      service: 'https://e.hbut.edu.cn/login#/'
    })
    const uuid = String(payload?.uuid || '').trim()
    const qrImg = String(payload?.qr_image_base64 || '').trim()

    if (!uuid || !qrImg) {
      throw new Error('二维码数据不完整，请重试')
    }

    qrUuid.value = uuid
    qrImageBase64.value = qrImg
    qrExpiresAt.value = Date.now() + 120 * 1000
    qrState.value = 'waiting'
    qrStateMessage.value = '请使用新融合门户 App 扫码登录。'
    updateQrCountdown()
    scheduleQrPoll()
  } catch (e) {
    qrState.value = 'error'
    qrStateMessage.value = `二维码生成失败：${e.message || e}`
  }
}

const confirmPortalQrLogin = async () => {
  if (!qrUuid.value || qrSubmitting.value) return
  qrSubmitting.value = true
  clearQrTimer()

  try {
    const userInfo = await invoke('portal_qr_confirm_login', {
      uuid: qrUuid.value,
      service: 'https://e.hbut.edu.cn/login#/'
    })
    const sid = String(userInfo?.student_id || '').trim()
    if (!sid) {
      throw new Error('扫码成功但未获取到学号')
    }

    username.value = sid
    localStorage.setItem('hbu_username', sid)
    localStorage.removeItem('hbu_credentials')
    localStorage.setItem('hbu_remember', 'false')
    applyLoginMethodStorage('portal_qr_temp')
    localStorage.removeItem('hbu_manual_logout')
    localStorage.removeItem(LOGOUT_REASON_KEY)

    qrState.value = 'success'
    qrStateMessage.value = '✅ 扫码登录成功，正在同步数据...'
    await emitSuccessWithGrades(sid)
  } catch (e) {
    qrState.value = 'error'
    qrStateMessage.value = `扫码登录失败：${e.message || e}`
  } finally {
    qrSubmitting.value = false
  }
}

const handleLimitedModeLogin = () => {
  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }
  statusMsg.value = '当前版本仅完成该登录方式入口，具体能力将在后续版本开放。'
}

const switchMode = (mode) => {
  if (!isKnownMode(mode) || activeMode.value === mode) return
  activeMode.value = mode
  statusMsg.value = ''
  if (mode !== 'portal_qr_temp') {
    resetQrState()
  }
}

const handleKeyPress = (event) => {
  if (event.key !== 'Enter' || loading.value) return
  if (isPortalPasswordMode.value) {
    handlePasswordLogin()
  }
}

watch(
  () => props.loginMode,
  (mode) => {
    const nextMode = String(mode || '').trim()
    if (isKnownMode(nextMode) && nextMode !== activeMode.value) {
      activeMode.value = nextMode
    }
  }
)

watch(activeMode, (mode) => {
  localStorage.setItem(LOGIN_MODE_PREF_KEY, mode)
  emit('switchMode', mode)
})

onMounted(async () => {
  const savedMode = String(localStorage.getItem(LOGIN_MODE_PREF_KEY) || '').trim()
  if (isKnownMode(savedMode) && savedMode !== activeMode.value) {
    activeMode.value = savedMode
  }

  const reason = String(localStorage.getItem(LOGOUT_REASON_KEY) || '').trim()
  if (reason === TEMP_SESSION_EXPIRED_REASON) {
    statusMsg.value = '扫码临时登录已失效，请重新登录。'
    localStorage.removeItem(LOGOUT_REASON_KEY)
  }

  const savedUsername = localStorage.getItem('hbu_username')
  const savedRemember = localStorage.getItem('hbu_remember')
  const savedCredentials = localStorage.getItem('hbu_credentials')
  if (savedRemember !== 'false' && savedUsername) {
    username.value = savedUsername
    password.value = savedCredentials || ''
    rememberMe.value = true
  }

  await ensureOcrEndpointReady()
  window.addEventListener('hbu-ocr-config-updated', handleOcrConfigUpdated)
})

onBeforeUnmount(() => {
  clearQrTimer()
  window.removeEventListener('hbu-ocr-config-updated', handleOcrConfigUpdated)
})
</script>

<template>
  <div class="login-container glass-card">
    <div class="logo">
      <img class="logo-img" :src="hbutLogo" alt="Mini-HBUT" />
    </div>
    <h2>HBUT 校园助手登录</h2>
    <p class="subtitle">选择登录方式后继续</p>

    <div class="mode-grid">
      <button
        v-for="mode in LOGIN_MODES"
        :key="mode.key"
        class="mode-btn"
        :class="{ active: activeMode === mode.key }"
        @click="switchMode(mode.key)"
      >
        <div class="mode-head">
          <span class="mode-title">{{ mode.title }}</span>
          <span v-if="mode.temporary" class="mode-tag temp">临时</span>
          <span v-else-if="mode.limited" class="mode-tag limited">受限</span>
        </div>
        <p class="mode-desc">{{ mode.desc }}</p>
      </button>
    </div>

    <div v-if="loading" class="progress-container">
      <div class="loading-spinner">
        <div class="spinner"></div>
      </div>
      <p class="status-msg">{{ statusMsg }}</p>
    </div>

    <div v-else class="form-container">
      <template v-if="isPortalPasswordMode">
        <div class="input-group">
          <label>学号</label>
          <input
            v-model="username"
            type="text"
            placeholder="请输入学号（10位数字）"
            maxlength="10"
            @keypress="handleKeyPress"
          />
        </div>

        <div class="input-group">
          <label>密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="新融合门户密码"
            @keypress="handleKeyPress"
          />
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="rememberMe" class="real-checkbox" />
            <span class="custom-checkbox"></span>
            记住密码（仅本机存储）
          </label>
        </div>

        <button
          class="login-btn"
          :disabled="!canSubmitPasswordLogin"
          @click="handlePasswordLogin"
        >
          🔐 登录
        </button>

        <div class="mode-info">
          <span class="info-text">OCR 配置：{{ ocrConfigMode }}</span>
        </div>
      </template>

      <template v-else-if="isPortalQrMode">
        <div class="qr-panel">
          <div class="qr-image-box">
            <img v-if="qrImageBase64" :src="qrImageBase64" alt="扫码登录二维码" class="qr-image" />
            <div v-else class="qr-placeholder">点击下方按钮生成二维码</div>
          </div>
          <p class="qr-status">{{ qrStateMessage || '请先生成二维码' }}</p>
          <p v-if="qrRemainingSeconds > 0" class="qr-countdown">二维码剩余 {{ qrRemainingSeconds }} 秒</p>
          <button class="login-btn" :disabled="qrSubmitting" @click="initPortalQrLogin">
            {{ qrImageBase64 ? '刷新二维码' : '生成二维码' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="limited-box">
          <p class="limited-title">{{ currentModeMeta.title }}</p>
          <p class="limited-desc">该登录方式当前仅完成切换入口，后续版本开放具体能力。</p>
          <button class="login-btn" @click="handleLimitedModeLogin">继续（入口测试）</button>
        </div>
      </template>

      <div class="checkbox-group agreement">
        <label class="checkbox-label">
          <input type="checkbox" v-model="agreePolicy" class="real-checkbox" />
          <span class="custom-checkbox"></span>
          我已阅读并同意
          <button type="button" class="link-btn" @click="emit('showLegal', 'disclaimer')">《免责声明》</button>
          与
          <button type="button" class="link-btn" @click="emit('showLegal', 'privacy')">《隐私政策》</button>
        </label>
      </div>

      <p
        v-if="statusMsg"
        class="status-msg"
        :class="{ error: statusMsg.includes('失败') || statusMsg.includes('⚠️') || statusMsg.includes('❌') }"
      >
        {{ statusMsg }}
      </p>

      <div class="help-section">
        <p class="help-text">
          当前模式：<strong>{{ currentModeMeta.title }}</strong>
        </p>
        <p class="help-text">
          <a
            href="https://auth.hbut.edu.cn/retrieve-password/retrievePassword/index.html?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%23%2F#/"
            target="_blank"
            rel="noopener noreferrer"
          >
            忘记新融合门户密码？
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  max-width: 560px;
  margin: 2rem auto;
  padding: 2rem;
  text-align: center;
}

.logo {
  margin-bottom: 1rem;
  display: flex;
  justify-content: center;
}

.logo-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}

h2 {
  color: var(--primary-color);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #64748b;
  margin-bottom: 1.25rem;
  font-size: 0.92rem;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 1rem;
}

.mode-btn {
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  background: #f8fafc;
  text-align: left;
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  border-color: var(--primary-color);
}

.mode-btn.active {
  border-color: var(--primary-color);
  background: rgba(99, 102, 241, 0.08);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
}

.mode-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mode-title {
  font-size: 0.86rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.mode-tag {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.mode-tag.temp {
  color: #0f766e;
  background: #ccfbf1;
}

.mode-tag.limited {
  color: #7c2d12;
  background: #fed7aa;
}

.mode-desc {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.35;
}

.form-container {
  margin-top: 0.75rem;
}

.input-group {
  text-align: left;
  margin-bottom: 1rem;
}

.input-group label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 600;
  color: var(--text-color);
}

.input-group input {
  width: 100%;
  padding: 0.72rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.96rem;
  box-sizing: border-box;
}

.input-group input:focus {
  border-color: var(--primary-color);
  outline: none;
}

.checkbox-group {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 0.9rem;
}

.checkbox-group.agreement {
  margin-top: 1.2rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.92rem;
  color: #475569;
  user-select: text;
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  font-weight: 600;
  padding: 0 2px;
}

.link-btn:hover {
  text-decoration: underline;
}

.real-checkbox {
  display: none;
}

.custom-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid #d1d5db;
  border-radius: 5px;
  margin-right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: white;
}

.real-checkbox:checked + .custom-checkbox {
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.custom-checkbox::after {
  content: "✓";
  color: white;
  font-size: 12px;
  font-weight: 700;
  opacity: 0;
}

.real-checkbox:checked + .custom-checkbox::after {
  opacity: 1;
}

.login-btn {
  width: 100%;
  padding: 0.9rem;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.login-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.qr-panel {
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  padding: 0.9rem;
  background: #f8fafc;
}

.qr-image-box {
  width: 220px;
  height: 220px;
  margin: 0 auto;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #dbe2ea;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.qr-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-placeholder {
  color: #94a3b8;
  font-size: 0.9rem;
  padding: 0 1rem;
}

.qr-status {
  margin: 0.8rem 0 0.35rem;
  color: #334155;
  font-size: 0.92rem;
}

.qr-countdown {
  margin: 0 0 0.8rem;
  color: #0f766e;
  font-size: 0.82rem;
  font-weight: 600;
}

.limited-box {
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 1rem;
  background: #f8fafc;
  text-align: left;
}

.limited-title {
  margin: 0 0 0.45rem;
  font-weight: 700;
  color: #0f172a;
}

.limited-desc {
  margin: 0 0 0.8rem;
  color: #64748b;
  font-size: 0.88rem;
}

.mode-info {
  margin-top: 0.8rem;
  padding: 0.65rem;
  background: #e0f2fe;
  border-radius: 10px;
}

.info-text {
  font-size: 0.86rem;
  color: #0c4a6e;
}

.progress-container {
  padding: 1.2rem 0 0.3rem;
}

.loading-spinner {
  display: flex;
  justify-content: center;
}

.spinner {
  width: 42px;
  height: 42px;
  border: 4px solid #e2e8f0;
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-msg {
  margin-top: 0.9rem;
  font-size: 0.92rem;
  color: #334155;
}

.status-msg.error {
  color: #b91c1c;
  font-weight: 600;
}

.help-section {
  margin-top: 1.1rem;
  padding-top: 0.9rem;
  border-top: 1px solid #e2e8f0;
  text-align: left;
}

.help-text {
  margin: 0.4rem 0;
  color: #64748b;
  font-size: 0.84rem;
}

.help-text a {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
}

.help-text a:hover {
  text-decoration: underline;
}

@media (max-width: 560px) {
  .login-container {
    padding: 1.2rem;
    margin: 1rem auto;
  }

  .mode-grid {
    grid-template-columns: 1fr;
  }

  .qr-image-box {
    width: 200px;
    height: 200px;
  }
}
</style>
