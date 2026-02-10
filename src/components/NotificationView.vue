<script setup>
import { computed, onMounted, ref } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  createChannel,
  Importance,
  Visibility
} from '@tauri-apps/plugin-notification'
import hbutLogo from '../assets/hbut-logo.png'
import { enableBackgroundPowerLock, disableBackgroundPowerLock } from '../utils/power_guard'

const props = defineProps({
  studentId: String
})

const enableBackground = ref(false)
const enableExamReminders = ref(true)
const checkInterval = ref(30)
const showBatteryPrompt = ref(false)
const backgroundLockEnabled = ref(false)
const backgroundLockSource = ref('')

const permissionState = ref('unknown')
const statusMessage = ref('')
const lastError = ref('')
const sending = ref(false)

const isAclDeniedError = (err) => {
  const text = String(err || '')
  return text.includes('not allowed by ACL') || text.includes('plugin:notification')
}

const getNativePermissionState = async (requestNow = false) => {
  try {
    if (requestNow) {
      const state = await invoke('request_notification_permission_native')
      return String(state || 'default')
    }
    const state = await invoke('get_notification_permission_native')
    return String(state || 'default')
  } catch (error) {
    throw new Error(String(error))
  }
}

const isAndroid = () => /Android/i.test(navigator.userAgent)
const isTauriRuntime = () => {
  try {
    return isTauri()
  } catch {
    return false
  }
}

const permissionLabel = computed(() => {
  if (permissionState.value === 'granted') return '已授权'
  if (permissionState.value === 'denied') return '已拒绝'
  if (permissionState.value === 'default') return '未授权'
  if (permissionState.value === 'unsupported') return '当前环境不支持'
  return '未知'
})

const updatePermissionState = async (requestNow = false) => {
  if (!isTauriRuntime()) {
    permissionState.value = 'unsupported'
    statusMessage.value = '仅在 Tauri 应用内支持系统通知。'
    return false
  }

  try {
    let granted = await isPermissionGranted()
    if (granted) {
      permissionState.value = 'granted'
      return true
    }

    if (requestNow) {
      const result = await requestPermission()
      permissionState.value = result
      granted = result === 'granted'
      statusMessage.value = granted ? '通知权限已授权。' : '通知权限未授权，请在系统设置中允许通知。'
      return granted
    }

    permissionState.value = 'default'
    return false
  } catch (error) {
    if (isAclDeniedError(error)) {
      try {
        const nativeState = await getNativePermissionState(requestNow)
        permissionState.value = nativeState
        const granted = nativeState === 'granted'
        if (requestNow) {
          statusMessage.value = granted ? '通知权限已授权。' : '通知权限未授权，请在系统设置中允许通知。'
        }
        return granted
      } catch (nativeErr) {
        permissionState.value = 'denied'
        lastError.value = String(nativeErr)
        statusMessage.value = `查询通知权限失败：${lastError.value}`
        return false
      }
    }

    permissionState.value = 'denied'
    lastError.value = String(error)
    statusMessage.value = `查询通知权限失败：${lastError.value}`
    return false
  }
}

const ensureAndroidChannel = async () => {
  if (!isTauriRuntime() || !isAndroid()) return

  try {
    await createChannel({
      id: 'hbut-default',
      name: 'Mini-HBUT 通知',
      description: '课程、考试与系统提醒',
      importance: Importance.High,
      visibility: Visibility.Private
    })
  } catch (error) {
    const message = String(error || '')
    // 频道已存在或 ACL 限制时不向用户抛错，通知发送仍可走默认通道或 Rust 兜底。
    if (
      message.includes('already exists') ||
      message.includes('ChannelAlreadyExists') ||
      message.includes('not allowed by ACL') ||
      message.includes('listChannels')
    ) {
      return
    }
    lastError.value = message
  }
}

const handleRequestPermission = async () => {
  statusMessage.value = ''
  await updatePermissionState(true)
}

onMounted(async () => {
  const savedBg = localStorage.getItem('hbu_notify_bg')
  enableBackground.value = savedBg === 'true'

  const savedExam = localStorage.getItem('hbu_notify_exam')
  enableExamReminders.value = savedExam !== 'false'

  const savedInterval = Number(localStorage.getItem('hbu_notify_interval') || 30)
  if ([15, 30, 60].includes(savedInterval)) {
    checkInterval.value = savedInterval
  }

  await updatePermissionState(true)
  await ensureAndroidChannel()

  if (enableBackground.value && isTauriRuntime()) {
    const result = await enableBackgroundPowerLock()
    backgroundLockEnabled.value = result.enabled
    backgroundLockSource.value = result.source.join(' + ')
  }
})

const handleBackgroundToggle = async () => {
  localStorage.setItem('hbu_notify_bg', enableBackground.value ? 'true' : 'false')
  if (!isTauriRuntime()) return

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
  if (!isTauriRuntime()) {
    statusMessage.value = '当前不是 Tauri 运行环境，无法发送系统通知。'
    return
  }

  sending.value = true
  statusMessage.value = ''
  lastError.value = ''

  try {
    const granted = await updatePermissionState(true)
    if (!granted) {
      statusMessage.value = '通知权限未授权，测试通知未发送。'
      return
    }

    await ensureAndroidChannel()

    try {
      await sendNotification({
        channelId: 'hbut-default',
        title: 'Mini-HBUT',
        body: '这是一个测试通知，用于验证通知权限和推送能力。'
      })
    } catch (notifyError) {
      if (!isAclDeniedError(notifyError)) {
        throw notifyError
      }
    }

    // Rust 侧兜底：确保桌面端和部分移动环境都能触发系统通知。
    await invoke('send_test_notification_native', {
      title: 'Mini-HBUT',
      body: '这是一个测试通知（Rust 兜底通道）。'
    })

    statusMessage.value = '测试通知已发送，请查看系统通知栏。'
  } catch (error) {
    lastError.value = String(error)
    statusMessage.value = `发送测试通知失败：${lastError.value}`
  } finally {
    sending.value = false
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
        <span class="student-id">👁 {{ props.studentId || '未登录' }}</span>
        <button class="header-btn btn-ripple" @click="$emit('back')">返回</button>
      </div>
    </header>

    <div class="content-card">
      <div class="content-title">通知权限：{{ permissionLabel }}</div>

      <div class="actions actions-left" style="margin-top: 0;">
        <button class="btn-primary" @click="handleRequestPermission">请求通知权限</button>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>后台自动检查</h3>
          <p>开启后尽量保持设备活跃，降低移动端被系统回收导致通知丢失的概率。</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableBackground" @change="handleBackgroundToggle">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>考试前一天提醒</h3>
          <p>如果明日有考试，发送系统通知提醒。</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableExamReminders" @change="saveSettings">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>检查频率（分钟）</h3>
        </div>
        <select v-model="checkInterval" @change="saveSettings" class="select-disabled">
          <option :value="15">15 分钟</option>
          <option :value="30">30 分钟（默认）</option>
          <option :value="60">60 分钟</option>
        </select>
      </div>

      <div class="content-title" v-if="enableBackground">
        保活状态：{{ backgroundLockEnabled ? ('已启用（' + (backgroundLockSource || '插件') + '）') : '未启用（当前平台不支持或插件不可用）' }}
      </div>

      <div class="actions">
        <button class="btn-primary" :disabled="sending" @click="handleTestNotification">
          {{ sending ? '发送中...' : '发送测试通知' }}
        </button>
      </div>

      <p v-if="statusMessage" class="status-msg">{{ statusMessage }}</p>
      <p v-if="lastError" class="status-err">错误详情：{{ lastError }}</p>
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

.actions-left {
  justify-content: flex-start;
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

.btn-primary:disabled {
  background: #94a3b8;
  cursor: not-allowed;
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

.status-msg {
  margin: 14px 0 0;
  color: #1e40af;
  font-size: 14px;
}

.status-err {
  margin: 8px 0 0;
  color: #dc2626;
  font-size: 12px;
  word-break: break-all;
}
</style>
