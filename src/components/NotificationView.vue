<script setup>
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

// State
const enableBackground = ref(false)
const enableExamReminders = ref(true)
const checkInterval = ref(30) // minutes
const showBatteryPrompt = ref(false)

const props = defineProps({
  studentId: String
})

const emit = defineEmits(['back'])

// Check permissions on mount
onMounted(async () => {
  // Load settings from localStorage
  const savedBg = localStorage.getItem('hbu_notify_bg')
  if (savedBg === 'true') enableBackground.value = true
  
  const savedExam = localStorage.getItem('hbu_notify_exam')
  if (savedExam === 'true') enableExamReminders.value = true
  
  let permissionGranted = await isPermissionGranted()
  if (!permissionGranted) {
    const permission = await requestPermission()
    permissionGranted = permission === 'granted'
  }
})

const handleBackgroundToggle = async () => {
  if (enableBackground.value) {
    // User turned ON
    showBatteryPrompt.value = true
    localStorage.setItem('hbu_notify_bg', 'true')
  } else {
    // User turned OFF
    localStorage.setItem('hbu_notify_bg', 'false')
  }
}

const confirmBatterySettings = () => {
  showBatteryPrompt.value = false
  // Here we would ideally invoke a command to open Android battery settings
  // invoke('open_battery_settings').catch(...)
}

const cancelBatterySettings = () => {
  showBatteryPrompt.value = false
  enableBackground.value = false // Revert
  localStorage.setItem('hbu_notify_bg', 'false')
}

const handleTestNotification = async () => {
  let permissionGranted = await isPermissionGranted()
  if (!permissionGranted) {
    const permission = await requestPermission()
    permissionGranted = permission === 'granted'
  }

  if (permissionGranted) {
    sendNotification({ title: 'Mini-HBUT', body: '这是一个测试通知！' })
  }
}

const saveSettings = () => {
  // Save other settings if needed
}
</script>

<template>
  <div class="notification-view fade-in">
    <div class="header">
      <button class="icon-btn" @click="$emit('back')">
        <span class="material-icons">arrow_back</span>
      </button>
      <h2>通知设置</h2>
    </div>

    <div class="content-card">
      <div class="setting-item">
        <div class="setting-label">
          <h3>后台自动检查</h3>
          <p>应用在后台时自动检查成绩更新 (Android需保活)</p>
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
          <input type="checkbox" v-model="enableExamReminders">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
           <h3>检查频率 (分钟)</h3>
        </div>
        <select v-model="checkInterval" disabled class="select-disabled">
          <option :value="30">30 分钟 (默认)</option>
        </select>
      </div>
      
      <div class="actions">
        <button class="btn-primary" @click="handleTestNotification">发送测试通知</button>
      </div>
    </div>

    <!-- Battery Optimization Prompt Modal -->
    <div v-if="showBatteryPrompt" class="modal-mask">
      <div class="modal-card">
        <h3>⚠️ 重要提示</h3>
        <p>为了确保后台检查正常工作，Android 系统需要您允许应用<b>即使划掉也能运行</b>，并<b>忽略电池优化</b>。</p>
        <p class="scary-text">如果不设置，系统会在锁屏后杀死应用，导致无法收到通知！</p>
        <div class="modal-actions">
          <button class="btn-text" @click="cancelBatterySettings">取消</button>
          <button class="btn-primary" @click="confirmBatterySettings">去设置 / 我知道了</button>
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

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.header h2 {
  margin: 0;
  font-size: 20px;
  color: #1e293b;
}

.icon-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
}

.icon-btn:hover {
  background: rgba(0,0,0,0.05);
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

/* Switch CSS */
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
  color: #94a3b8;
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

/* Modal */
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
  color: #f59e0b;
}

.scary-text {
  color: #ef4444;
  font-weight: bold;
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
</style>
