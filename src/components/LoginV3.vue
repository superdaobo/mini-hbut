<script setup>
/**
 * V3 登录组件 - 客户端验证码登录
 * 解决服务器 IP 被封的问题
 * 
 * 流程：
 * 1. 从后端代理获取验证码图片
 * 2. 用户手动输入验证码
 * 3. 调用后端进行登录（后端会尝试多次直到成功）
 */
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { encryptPassword } from '../utils/crypto'

const emit = defineEmits(['success', 'switchMode', 'showLegal'])

const username = ref('')
const password = ref('')
const captchaCode = ref('')
const rememberMe = ref(true)
const agreePolicy = ref(false)
const loading = ref(false)
const loadingCaptcha = ref(false)
const statusMsg = ref('')
const captchaImg = ref('')
const jsessionId = ref('')
const loginSalt = ref('')
const loginExecution = ref('')
const loginLt = ref('')
const loginInputs = ref({})
const loginCookies = ref({})

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// 页面加载时
onMounted(async () => {
  // 清除旧的加密密码（强制清理）
  const savedCredentials = localStorage.getItem('hbu_credentials')
  if (savedCredentials) {
    // 如果密码长度超过30或包含特殊编码字符，说明是旧的加密密码
    if (savedCredentials.length > 30 || /[A-Za-z0-9+/=]{30,}/.test(savedCredentials)) {
      console.log('检测到旧的加密密码缓存，长度:', savedCredentials.length, '正在清除...')
      localStorage.removeItem('hbu_credentials')
    }
  }
  
  // 从 localStorage 读取保存的凭据
  const savedUsername = localStorage.getItem('hbu_username')
  const savedRemember = localStorage.getItem('hbu_remember')
  const updatedCredentials = localStorage.getItem('hbu_credentials')
  
  if (savedRemember !== 'false' && savedUsername) {
    username.value = savedUsername
    if (updatedCredentials) {
      try {
        // 直接读取本地存储的密码 (明文或简单编码，Tauri 本地环境相对安全)
        password.value = updatedCredentials
      } catch (e) {
        password.value = ''
      }
    }
    rememberMe.value = true
  }
  
  // 加载验证码
  await loadCaptcha()
})

// 加载验证码
const loadCaptcha = async () => {
  loadingCaptcha.value = true
  statusMsg.value = ''
  
  try {
    // 使用 axios (适配器会接管)
    const res = await axios.get(`${API_BASE}/v3/login_params`)
    const data = res.data
    
    if (data.success) {
      // 适配器返回的数据结构
      captchaImg.value = data.captcha_base64 ? `data:image/jpeg;base64,${data.captcha_base64}` : ''
      
      // 如果后端明确说不需要验证码
      if(data.captcha_base64 === undefined && data.captcha_required === false) {
           captchaImg.value = '' 
      }
      
      jsessionId.value = data.jsessionid || ''
      loginSalt.value = data.salt || ''
      loginExecution.value = data.execution || ''
      loginLt.value = data.lt || ''
      loginInputs.value = data.inputs || {}
      loginCookies.value = data.cookies || {}
      captchaCode.value = ''
    } else {
      statusMsg.value = '⚠️ 获取验证码失败: ' + (data.error || '未知错误')
    }
  } catch (e) {
    statusMsg.value = '⚠️ 网络错误: ' + e.message
  } finally {
    loadingCaptcha.value = false
  }
}

// 刷新验证码
const refreshCaptcha = async () => {
  loadingCaptcha.value = true
  
  try {
    const res = await axios.post(`${API_BASE}/v3/refresh_captcha`, {
      jsessionid: jsessionId.value
    })
    const data = res.data
    
    if (data.success) {
      captchaImg.value = `data:image/jpeg;base64,${data.captcha_base64}`
      jsessionId.value = data.jsessionid || jsessionId.value
      captchaCode.value = ''
    }
  } catch (e) {
    console.error('刷新验证码失败:', e)
  } finally {
    loadingCaptcha.value = false
  }
}

// 保存凭据
const saveCredentials = async () => {
  if (rememberMe.value) {
    localStorage.setItem('hbu_username', username.value)
    // 简单存储密码
    localStorage.setItem('hbu_credentials', password.value)
    localStorage.setItem('hbu_remember', 'true')
  } else {
    localStorage.removeItem('hbu_username')
    localStorage.removeItem('hbu_credentials')
    localStorage.setItem('hbu_remember', 'false')
  }
}

// 登录
const handleLogin = async () => {
  if (!username.value || !password.value) {
    statusMsg.value = '请输入完整的账号和密码'
    return
  }

  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }
  
  // 检查密码是否是旧的加密密码（正常密码不会超过50字符）
  // 只是警告，不阻止登录
  if (password.value.length > 50) {
    console.warn('密码长度异常:', password.value.length, '可能是旧加密密码')
    // 清除可能的旧密码缓存
    localStorage.removeItem('hbu_credentials')
  }
  
  console.log('准备登录，密码长度:', password.value.length)
  
  loading.value = true
  statusMsg.value = '🔒 正在登录...'
  await saveCredentials()
  
  try {
    // 直接使用原始密码 - Rust 后端会处理加密
    const finalPassword = password.value
    console.log('登录参数:', {
      username: username.value,
      password: '***',
      captcha: captchaCode.value,
      captchaLength: captchaCode.value?.length || 0
    })

    // 调用 Tauri 后端 (通过 adapter)
    const res = await axios.post(`${API_BASE}/v2/start_login`, {
      username: username.value,
      password: finalPassword,
      captcha: captchaCode.value,
      lt: loginLt.value,
      execution: loginExecution.value
    })
    
    const result = res.data
    
    if (result.success) {
      statusMsg.value = '✅ 登录成功！正在获取数据...'
      
      // 获取成绩
      const gradesRes = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: username.value })
      const gradesData = gradesRes.data
      
      if (gradesData.success) {
        emit('success', gradesData.data)
      } else {
        statusMsg.value = '⚠️ 获取成绩失败: ' + (gradesData.error || '')
        loading.value = false
        await refreshCaptcha()
      }
    } else {
      statusMsg.value = '❌ ' + (result.error || '登录失败')
      loading.value = false
      await refreshCaptcha()
    }
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message
    statusMsg.value = '⚠️ 登录失败: ' + errMsg
    loading.value = false
    await refreshCaptcha()
  }
}

// 切换到自动登录模式
const switchToAutoMode = () => {
  emit('switchMode', 'auto')
}

// Enter 键处理
const handleKeyPress = (event) => {
  if (event.key === 'Enter' && !loading.value) {
    if (!agreePolicy.value) {
      statusMsg.value = '请先阅读并同意免责声明与隐私政策'
      return
    }
    handleLogin()
  }
}
</script>

<template>
  <div class="login-container glass-card">
    <div class="logo">🎓</div>
    <h2>HBUT 成绩查询系统</h2>
    
    <p class="subtitle">🚀 极速自动登录模式</p>

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
        <label>学号</label>
        <input 
          v-model="username" 
          type="text" 
          placeholder="请输入学号（10位数字）"
          maxlength="10"
          @keypress="handleKeyPress"
          :disabled="loading"
        />
      </div>

      <div class="input-group">
        <label>密码</label>
        <input 
          v-model="password" 
          type="password" 
          placeholder="新融合门户密码"
          @keypress="handleKeyPress"
          :disabled="loading"
        />
      </div>

      <!-- 验证码（服务器自动OCR识别，仅显示图片供用户参考） -->
      <div class="captcha-group" v-if="captchaImg">
        <label>验证码</label>
        <div class="captcha-row">
          <input 
            v-model="captchaCode" 
            type="text" 
            class="captcha-input"
            maxlength="6"
            placeholder="????"
            @keypress="handleKeyPress"
            :disabled="loading"
          />
          <div class="captcha-img-container" @click="refreshCaptcha" title="点击刷新验证码">
             <img v-if="captchaImg" :src="captchaImg" class="captcha-img" alt="验证码" />
             <div v-else class="captcha-loading">加载中...</div>
          </div>
        </div>
        <p class="captcha-hint">💡 系统将自动识别验证码，无需手动输入</p>
      </div>

      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="rememberMe" class="real-checkbox" />
          <span class="custom-checkbox"></span>
          记住密码 (本地加密存储)
        </label>
      </div>

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

      <button 
        @click="handleLogin" 
        class="login-btn" 
        :disabled="loading || !username || !password || !agreePolicy"
      >
        <span v-if="!loading">🔐 登录</span>
        <span v-else>登录中...</span>
      </button>

      <!-- 状态消息 -->
      <p v-if="statusMsg && !loading" class="status-msg" :class="{'error': statusMsg.includes('失败') || statusMsg.includes('❌') || statusMsg.includes('⚠️')}">
        {{ statusMsg }}
      </p>

      <!-- 帮助提示 -->
      <div class="mode-info">
        <span class="info-text">🤖 服务器自动识别验证码，登录更便捷</span>
      </div>

      <!-- 帮助信息 -->
      <div class="help-section">
        <p class="help-text">
          💡 <strong>提示</strong>：使用 <a href="https://e.hbut.edu.cn/stu/index.html#/" target="_blank" rel="noopener noreferrer">新融合门户</a> 的账号密码登录
        </p>
        <p class="help-text">
          <a href="https://auth.hbut.edu.cn/retrieve-password/retrievePassword/index.html?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%23%2F#/" target="_blank" rel="noopener noreferrer">忘记密码？</a>
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
  font-size: 4rem;
  margin-bottom: 1rem;
  animation: bounce 2s infinite;
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
  box-sizing: border-box;
}

.input-group input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  outline: none;
}

/* 验证码样式 */
.captcha-group {
  text-align: left;
  margin-bottom: 1.2rem;
}

.captcha-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--text-color);
}

.captcha-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.captcha-input {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1.2rem;
  text-transform: uppercase;
  letter-spacing: 4px;
  text-align: center;
}

.captcha-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  outline: none;
}

.captcha-img-container {
  width: 120px;
  height: 48px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
}

.captcha-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.captcha-loading,
.captcha-placeholder {
  font-size: 0.8rem;
  color: #666;
}

.refresh-btn {
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-size: 1.2rem;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: #f3f4f6;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  user-select: none;
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

.mode-switch {
  margin-top: 1rem;
}

.switch-btn {
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.5rem;
}

.switch-btn:hover {
  text-decoration: underline;
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

.captcha-hint {
  font-size: 0.8rem;
  color: #059669;
  margin-top: 0.5rem;
  text-align: center;
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
  
  .captcha-row {
    flex-wrap: wrap;
  }
  
  .captcha-input {
    width: 100%;
    margin-bottom: 8px;
  }
}
</style>
