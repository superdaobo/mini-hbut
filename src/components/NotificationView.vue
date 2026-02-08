<script setup>
import { ref, onMounted } from 'vue'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import hbutLogo from '../assets/hbut-logo.png'
import { enableBackgroundPowerLock, disableBackgroundPowerLock } from '../utils/power_guard'

const enableBackground = ref(false)
const enableExamReminders = ref(true)
const checkInterval = ref(30)
const showBatteryPrompt = ref(false)
const permissionGranted = ref(false)
const backgroundLockEnabled = ref(false)
const backgroundLockSource = ref('')

const props = defineProps({
  studentId: String
})

const isTauri = () => typeof window !== 'undefined' && '__TAURI__' in window
const isAndroid = () => /Android/i.test(navigator.userAgent)

onMounted(async () => {
  const savedBg = localStorage.getItem('hbu_notify_bg')
  enableBackground.value = savedBg === 'true'

  const savedExam = localStorage.getItem('hbu_notify_exam')
  enableExamReminders.value = savedExam !== 'false'

  const savedInterval = Number(localStorage.getItem('hbu_notify_interval') || 30)
  if ([15, 30, 60].includes(savedInterval)) {
    checkInterval.value = savedInterval
  }

  if (!isTauri()) return

  let granted = await isPermissionGranted()
  if (!granted) {
    const permission = await requestPermission()
    granted = permission === 'granted'
  }
  permissionGranted.value = granted

  if (enableBackground.value) {
    const result = await enableBackgroundPowerLock()
    backgroundLockEnabled.value = result.enabled
    backgroundLockSource.value = result.source.join(' + ')
  }
})

const handleBackgroundToggle = async () => {
  localStorage.setItem('hbu_notify_bg', enableBackground.value ? 'true' : 'false')

  if (!isTauri()) return

  if (enableBackground.value) {
    const result = await enableBackgroundPowerLock()
    backgroundLockEnabled.value = result.enabled
    backgroundLockSource.value = result.source.join(' + ')
    if (isAndroid()) {
      showBatteryPrompt.value = true
    }
  } else {
    const result = await disableBackgroundPowerLock()
    backgroundLockEnabled.value = false
    backgroundLockSource.value = result.source.join(' + ')
  }
}

const confirmBatterySettings = () => {
  showBatteryPrompt.value = false
}

const cancelBatterySettings = () => {
  showBatteryPrompt.value = false
}

const handleTestNotification = async () => {
  if (!isTauri()) return

  let granted = await isPermissionGranted()
  if (!granted) {
    const permission = await requestPermission()
    granted = permission === 'granted'
  }
  permissionGranted.value = granted

  if (granted) {
    sendNotification({
      title: 'Mini-HBUT',
      body: '这是一个测试通知，用于验证通知权限和推送能力。'
    })
  }
}

const saveSettings = () => {
  localStorage.setItem('hbu_notify_exam', enableExamReminders.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_interval', String(checkInterval.value))
}
</script>

<template>
  <div class="notification-view fade-in">
    <header class="dashboard-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <span class="title glitch-text" data-text="HBUT 校园助手">HBUT 校园助手</span>
        <span class="page-tag">通知</span>
      </div>
      <div class="user-info">
        <span class="student-id">👤 {{ props.studentId || '未登录' }}</span>
        <button class="header-btn btn-ripple" @click="$emit('back')">返回</button>
      </div>
    </header>

    <div class="content-card">
      <div class="content-title">
        通知权限：{{ permissionGranted ? '已授权' : '未授权' }}
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>后台自动检查</h3>
          <p>启用后保持设备常亮/阻止休眠（移动端保活，尽量降低被系统挂起概率）</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableBackground" @change="handleBackgroundToggle">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>考试前一天提醒</h3>
          <p>如果明日有考试，发送通知提醒</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableExamReminders" @change="saveSettings">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>检查频率 (分钟)</h3>
        </div>
        <select v-model="checkInterval" @change="saveSettings" class="select-disabled">
          <option :value="15">15 分钟</option>
          <option :value="30">30 分钟 (默认)</option>
          <option :value="60">60 分钟</option>
        </select>
      </div>

      <div class="content-title" v-if="enableBackground">
        保活状态：{{ backgroundLockEnabled ? ('已启用 (' + (backgroundLockSource || '插件') + ')') : '未启用（当前平台不支持或插件不可用）' }}
      </div>

      <div class="actions">
        <button class="btn-primary" @click="handleTestNotification">发送测试通知</button>
      </div>
    </div>

    <div v-if="showBatteryPrompt" class="modal-mask">
      <div class="modal-card">
        <h3>电池优化提示</h3>
        <p>Android 建议将本应用加入后台白名单，避免系统回收后无法按时通知。</p>
        <div class="modal-actions">
          <button class="btn-text" @click="cancelBatterySettings">稍后</button>
          <button class="btn-primary" @click="confirmBatterySettings">我知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-view {
  padding: 20px;
  padding-bottom: 100px;
}

@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
  }

  .dashboard-header .user-info {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.content-card {
  background: rgba(255, 255, 255, 0.9);
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f1f5f9;
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #334155;
}

.setting-label p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 28px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
}

input:checked + .slider {
  background-color: #3b82f6;
}

input:checked + .slider:before {
  transform: translateX(22px);
}

.slider.round {
  border-radius: 34px;
}

.slider.round:before {
  border-radius: 50%;
}

.select-disabled {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
}

.actions {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #2563eb;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: white;
  width: 85%;
  max-width: 320px;
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-card h3 {
  margin-top: 0;
  color: #0f172a;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.btn-text {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-weight: 600;
}

.content-title {
  padding: 12px 16px;
  margin-bottom: 16px;
  font-weight: 700;
  color: var(--ui-text);
}
</style>
