<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { encryptData, decryptData } from '../utils/encryption.js'

const emit = defineEmits(['success', 'switchMode', 'showLegal'])

const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const agreePolicy = ref(false)
const loading = ref(false)
const statusMsg = ref('')
const userUuid = ref('') // 用户 UUID (用于分享链接)

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
      statusMsg.value = '正在检查登录状态...'
      loading.value = true
      await quickFetch()
      return
    }
  }
  
  // 从 localStorage 读取保存的凭据
  const savedUsername = localStorage.getItem('hbu_username')
  const savedRemember = localStorage.getItem('hbu_remember')
  const savedCredentials = localStorage.getItem('hbu_credentials')
  
  if (savedRemember !== 'false' && savedUsername) {
    username.value = savedUsername
    if (savedCredentials) {
      try {
        const decrypted = await decryptData(savedCredentials)
        password.value = decrypted?.password || ''
      } catch (e) {
        password.value = ''
      }
    }
    rememberMe.value = true
  }
})

// 保存凭据到 localStorage
const saveCredentials = async () => {
  if (rememberMe.value) {
    localStorage.setItem('hbu_username', username.value)
    const encrypted = await encryptData({
      username: username.value,
      password: password.value
    })
    localStorage.setItem('hbu_credentials', encrypted)
    localStorage.setItem('hbu_remember', 'true')
  } else {
    localStorage.removeItem('hbu_username')
    localStorage.removeItem('hbu_credentials')
    localStorage.setItem('hbu_remember', 'false')
  }
}

// 快速获取成绩（使用缓存的 Cookie）
const quickFetch = async () => {
  if (!username.value) {
    statusMsg.value = '请输入学号'
    loading.value = false
    return
  }
  
  try {
    const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: username.value })
    const result = res.data
    
    if (result.success) {
      statusMsg.value = '✅ 快速获取成功'
      setTimeout(() => {
        emit('success', result.data)
      }, 500)
    } else {
      // Cookie 过期或无缓存，需要重新登录
      loading.value = false
      if (!password.value) {
        statusMsg.value = '请输入密码'
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
    statusMsg.value = '请输入完整的账号和密码'
    return
  }

  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }
  
  loading.value = true
  statusMsg.value = '🤖 正在自动识别验证码...'
  
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
      const err = result?.error || result?.detail?.error || result?.detail || '登录失败，请稍后重试'
      const retry = result?.retry_after || result?.detail?.retry_after
      statusMsg.value = retry ? `${err}（${retry}s）` : err
      loading.value = false
      return
    }
    
    if (result.success && result.auto_login) {
      // 自动登录成功
      statusMsg.value = '✅ 登录成功！正在获取数据...'
      
      if (result.uuid) {
        userUuid.value = result.uuid
      }
      
      // 立即获取成绩
      await quickFetch()
    } else {
      loading.value = false
      statusMsg.value = result.error || '登录失败，请稍后重试'
    }
  } catch (e) {
    loading.value = false
    statusMsg.value = '网络错误: ' + e.message
  }
}

// Enter 键登录
const handleKeyPress = (event) => {
  if (event.key === 'Enter' && !loading.value) {
    if (!agreePolicy.value) {
      statusMsg.value = '请先阅读并同意免责声明与隐私政策'
      return
    }
    autoLogin()
  }
}
</script>

<template>
  <div class="login-container glass-card">
    <div class="logo">🎓</div>
    <h2>HBUT 成绩查询系统</h2>
    
    <p class="subtitle">⚡ 全自动登录 - 无需手动输入验证码</p>

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
        @click="autoLogin" 
        class="login-btn" 
        :disabled="loading || !username || !password || !agreePolicy"
      >
        <span v-if="!loading">🔐 自动登录</span>
        <span v-else>登录中...</span>
      </button>

      <!-- 状态消息 -->
      <p v-if="statusMsg && !loading" class="status-msg" :class="{'error': statusMsg.includes('失败') || statusMsg.includes('错误')}">
        {{ statusMsg }}
      </p>

      <!-- 帮助信息 -->
      <div class="help-section">
        <p class="help-text">
          💡 <strong>提示</strong>：使用 <a href="https://e.hbut.edu.cn/stu/index.html#/" target="_blank" rel="noopener noreferrer">新融合门户</a> 的账号密码登录
        </p>
        <p class="help-text">
          🔐 系统采用 OCR 自动识别验证码，无需手动输入
        </p>
        <p class="help-text">
          <a href="https://auth.hbut.edu.cn/retrieve-password/retrievePassword/index.html?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%23%2F#/" target="_blank" rel="noopener noreferrer">忘记密码？</a>
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
