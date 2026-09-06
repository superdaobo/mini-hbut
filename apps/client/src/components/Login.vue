<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { encryptData } from '../utils/encryption.js'
import { fetchRemoteConfig, applyOcrRuntimeConfig, getStoredOcrConfig } from '../utils/remote_config.js'
import { invokeNative as invoke } from '../platform/native'
import {
  buildHbutAccountKey,
  loadPortalRememberedPassword,
  saveRememberedCredential,
  syncPortalRememberCredential
} from '../utils/credential_storage.js'
import { saveRememberedUsername, clearRememberedUsername } from '../utils/remembered_username.js'
import { useLocale } from '../utils/app_i18n'

const { t } = useLocale()

/**
 * i18n 占位符插值：将 key 字典中的 {name} 占位替换为实际值。
 */
const tr = (key, params = {}) => {
  let text = t(key)
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value))
  }
  return text
}

const emit = defineEmits(['success', 'switchMode', 'showLegal'])

const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const agreePolicy = ref(false)
const loading = ref(false)
const statusMsg = ref('')
const userUuid = ref('') // 用户 UUID (用于分享链接)
const ocrConfigMode = ref(t('login.ocr.local'))

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// 生成分享链接
const shareLink = computed(() => {
  if (userUuid.value) {
    return `${window.location.origin}/#/${username.value}`
  }
  if (username.value) {
    return `${window.location.origin}/#/${username.value}`
  }
  return ''
})

// 页面加载时检查 URL 和 localStorage
onMounted(async () => {
  // 检查 URL hash (格式: #/学号)
  const hash = window.location.hash
  if (hash) {
    const studentMatch = hash.match(/^#\/(\d{10})$/)
    if (studentMatch) {
      username.value = studentMatch[1]
      statusMsg.value = t('login.status.checkingSession')
      loading.value = true
      await quickFetch()
      return
    }
  }
  
  // 从 localStorage 读取保存的凭据
  const savedUsername = localStorage.getItem('hbu_username')
  const savedRemember = localStorage.getItem('hbu_remember')

  if (savedRemember !== 'false' && savedUsername) {
    username.value = savedUsername
    password.value = await loadPortalRememberedPassword(savedUsername)
    rememberMe.value = true
  }

  await ensureOcrEndpointReady()
  window.addEventListener('hbu-ocr-config-updated', handleOcrConfigUpdated)
})

onBeforeUnmount(() => {
  window.removeEventListener('hbu-ocr-config-updated', handleOcrConfigUpdated)
})

const resolveOcrModeLabel = (status, endpoint) => {
  const activeSource = String(status?.active_source || '').trim()
  if (activeSource.includes('fallback') || activeSource.includes('local')) return t('login.ocr.local')
  if (activeSource && activeSource !== 'unknown') return t('login.ocr.remote')

  const configured = String(status?.configured_endpoint || '').trim()
  if (configured || endpoint) return t('login.ocr.remote')
  if (status?.fallback_used) return t('login.ocr.local')
  return t('login.ocr.local')
}

const refreshOcrMode = async (endpointHint = '') => {
  try {
    const runtime = await invoke('get_ocr_runtime_status')
    ocrConfigMode.value = resolveOcrModeLabel(runtime, endpointHint)
  } catch {
    ocrConfigMode.value = endpointHint ? t('login.ocr.remote') : t('login.ocr.local')
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

// 保存凭据到 localStorage
const saveCredentials = async () => {
  if (rememberMe.value) {
    saveRememberedUsername(username.value)
    localStorage.setItem('hbu_remember', 'true')
    await saveRememberedCredential(
      buildHbutAccountKey(username.value),
      password.value
    )
    localStorage.removeItem('hbu_credentials')
  } else {
    clearRememberedUsername()
    localStorage.removeItem('hbu_credentials')
    localStorage.setItem('hbu_remember', 'false')
    await saveRememberedCredential(buildHbutAccountKey(username.value), '')
  }
}

// 快速获取成绩（使用缓存的 Cookie）
const quickFetch = async () => {
  if (!username.value) {
    statusMsg.value = t('login.status.enterStudentId')
    loading.value = false
    return
  }
  
  try {
    const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: username.value })
    const result = res.data
    
    if (result.success) {
      statusMsg.value = t('login.status.quickFetchSuccess')
      setTimeout(() => {
        emit('success', result.data)
      }, 500)
    } else {
      // Cookie 过期或无缓存，需要重新登录
      loading.value = false
      if (!password.value) {
        statusMsg.value = t('login.status.enterPassword')
      }
    }
  } catch (e) {
    console.error('快速获取失败:', e)
    loading.value = false
  }
}

// 🚀 全自动登录（纯后端OCR识别）
const autoLogin = async () => {
  if (!username.value || !password.value) {
    statusMsg.value = t('login.error.enterCredentials')
    return
  }

  if (!agreePolicy.value) {
    statusMsg.value = t('login.error.agreePolicy')
    return
  }
  
  loading.value = true
  statusMsg.value = t('login.status.autoRecognizing')
  await ensureOcrEndpointReady()
  
  // 保存凭据
  await saveCredentials()
  
  try {
    // 加密密码
    const encryptedPassword = await encryptData({
      password: password.value,
      timestamp: Date.now()
    })
    
    // 调用 V2 API（纯自动登录）
    const res = await axios.post(`${API_BASE}/v2/start_login`, {
      username: username.value,
      password: encryptedPassword
    })
    
    const result = res.data
    if (!result.success) {
      const err = result?.error || result?.detail?.error || result?.detail || t('login.error.signinFailedRetry')
      const retry = result?.retry_after || result?.detail?.retry_after
      statusMsg.value = retry ? `${err}（${retry}s）` : err
      loading.value = false
      return
    }
    
    if (result.success && result.auto_login) {
      const sid = String(result?.data?.student_id || username.value || '').trim()
      await syncPortalRememberCredential({
        username: username.value,
        studentId: sid,
        password: password.value,
        remember: rememberMe.value
      })
      // 自动登录成功
      statusMsg.value = t('login.status.autoLoginSuccess')
      
      if (result.uuid) {
        userUuid.value = result.uuid
      }
      
      // 立即获取成绩
      await quickFetch()
    } else {
      loading.value = false
      statusMsg.value = result.error || t('login.error.signinFailedRetry')
    }
  } catch (e) {
    loading.value = false
    statusMsg.value = t('login.error.networkPrefix') + e.message
  } finally {
    await refreshOcrMode(String(getStoredOcrConfig().endpoint || '').trim())
  }
}

// Enter 键登录
const handleKeyPress = (event) => {
  if (event.key === 'Enter' && !loading.value) {
    if (!agreePolicy.value) {
      statusMsg.value = t('login.error.agreePolicy')
      return
    }
    autoLogin()
  }
}
</script>

<template>
  <div class="login-container glass-card">
    <div class="logo">
      <img class="logo-img" src="/splash/app_icon.png" alt="Mini-HBUT" />
    </div>
    <h2>{{ t('login.legacy.title') }}</h2>
    
    <p class="subtitle">{{ t('login.legacy.subtitle') }}</p>

    <!-- 进度提示 -->
    <div v-if="loading" class="progress-container">
      <div class="loading-spinner">
        <div class="spinner"></div>
      </div>
      <p class="status-msg">{{ statusMsg }}</p>
    </div>

    <!-- 登录表单 -->
    <div v-else class="form-container">
      <div class="input-group">
        <label>{{ t('login.label.studentId') }}</label>
        <input 
          v-model="username" 
          type="text" 
          :placeholder="t('login.legacy.placeholder.studentId')"
          maxlength="10"
          @keypress="handleKeyPress"
          :disabled="loading"
        />
      </div>

      <div class="input-group">
        <label>{{ t('login.label.password') }}</label>
        <input 
          v-model="password" 
          type="password" 
          :placeholder="t('login.legacy.placeholder.password')"
          @keypress="handleKeyPress"
          :disabled="loading"
        />
      </div>

      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="rememberMe" class="real-checkbox" />
          <span class="custom-checkbox"></span>
          {{ t('login.legacy.rememberPassword') }}
        </label>
      </div>

      <div class="checkbox-group agreement">
        <label class="checkbox-label">
          <input type="checkbox" v-model="agreePolicy" class="real-checkbox" />
          <span class="custom-checkbox"></span>
          {{ t('login.agreement.prefix') }}
          <button type="button" class="link-btn" @click="emit('showLegal', 'disclaimer')">{{ t('login.agreement.disclaimer') }}</button>
          {{ t('login.agreement.and') }}
          <button type="button" class="link-btn" @click="emit('showLegal', 'privacy')">{{ t('login.agreement.privacy') }}</button>
        </label>
      </div>

      <button 
        @click="autoLogin" 
        class="login-btn" 
        :disabled="loading || !username || !password || !agreePolicy"
      >
        <span v-if="!loading">{{ t('login.legacy.btn.autoSignIn') }}</span>
        <span v-else>{{ t('login.legacy.btn.signingIn') }}</span>
      </button>

      <!-- 状态消息：错误样式按状态前缀 emoji 判断（不依赖具体语言文案） -->
      <p v-if="statusMsg && !loading" class="status-msg" :class="{'error': statusMsg.includes('⚠️') || statusMsg.includes('❌') || statusMsg.includes('❗')}">
        {{ statusMsg }}
      </p>

      <!-- 帮助信息 -->
      <div class="mode-info">
        <span class="info-text">{{ t('login.legacy.ocrPrefix') }}{{ ocrConfigMode }}</span>
      </div>

      <!-- 帮助信息 -->
      <div class="help-section">
        <p class="help-text">
          <strong>{{ t('login.legacy.tipPrefix') }}</strong>：{{ t('login.legacy.tipBefore') }}<a href="https://e.hbut.edu.cn/stu/index.html#/" target="_blank" rel="noopener noreferrer">{{ t('login.legacy.tipLink') }}</a>{{ t('login.legacy.tipAfter') }}
        </p>
        <p class="help-text">
          <a href="https://auth.hbut.edu.cn/retrieve-password/retrievePassword/index.html?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%23%2F#/" target="_blank" rel="noopener noreferrer">{{ t('login.legacy.forgotPassword') }}</a>
        </p>
        <p class="help-text">
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  max-width: 450px;
  margin: 2rem auto;
  padding: 2.5rem;
  text-align: center;
}

.logo {
  margin-bottom: 1rem;
  animation: bounce 2s infinite;
  display: flex;
  justify-content: center;
}

.logo-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

h2 {
  color: var(--primary-color);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 2rem;
}

.form-container {
  margin-top: 1.5rem;
}

.input-group {
  text-align: left;
  margin-bottom: 1.2rem;
}

.input-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--text-color);
}

.input-group input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.3s;
}

.input-group input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.checkbox-group {
  display: flex;
  justify-content: center;
  margin-bottom: 2rem;
}

.checkbox-group.agreement {
  margin-top: -1rem;
  margin-bottom: 1.5rem;
  justify-content: flex-start;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.95rem;
  color: #4b5563;
  user-select: text;
  transition: all 0.2s;
}

.checkbox-label:hover {
  color: var(--primary-color);
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
  width: 20px;
  height: 20px;
  border: 2px solid #d1d5db;
  border-radius: 6px;
  margin-right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background: white;
  position: relative;
}

.real-checkbox:checked + .custom-checkbox {
  background: var(--primary-color);
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.custom-checkbox::after {
  content: "✓";
  color: white;
  font-size: 14px;
  font-weight: bold;
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.real-checkbox:checked + .custom-checkbox::after {
  opacity: 1;
  transform: scale(1);
}

.login-btn {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  color: white;
  border: none;
  border-radius: 14px;
  font-size: 1.15rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 10px 25px rgba(99, 102, 241, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.progress-container {
  padding: 2rem;
  text-align: center;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-msg {
  margin-top: 1rem;
  font-size: 0.95rem;
  color: var(--text-color);
  animation: fadeIn 0.5s;
}

.status-msg.error {
  color: #dc2626;
  font-weight: 600;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.mode-info {
  margin-top: 1rem;
  padding: 0.75rem;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 10px;
  text-align: center;
}

.info-text {
  font-size: 0.9rem;
  color: #0369a1;
}

.help-section {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.help-text {
  font-size: 0.85rem;
  color: #666;
  margin: 0.5rem 0;
}

.help-text a {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
}

.help-text a:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .login-container {
    padding: 1.5rem;
  }

  .logo {
    font-size: 3rem;
  }

  h2 {
    font-size: 1.5rem;
  }
}
</style>

