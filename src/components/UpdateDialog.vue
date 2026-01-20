<script setup>
import { ref, onMounted } from 'vue'
import { checkForUpdates, downloadUpdate, getCurrentVersion } from '../utils/updater.js'

const emit = defineEmits(['close'])

const checking = ref(true)
const updateInfo = ref(null)
const downloading = ref(false)
const downloadProgress = ref(0)
const error = ref('')
const currentVersion = ref(getCurrentVersion())

const checkUpdate = async () => {
  checking.value = true
  error.value = ''
  
  try {
    const result = await checkForUpdates(currentVersion.value)
    updateInfo.value = result
  } catch (e) {
    error.value = '检查更新失败，请稍后重试'
    console.error(e)
  } finally {
    checking.value = false
  }
}

const handleDownload = async () => {
  if (!updateInfo.value?.downloadUrl) {
    // 如果没有直接下载链接，打开发布页面
    window.open(updateInfo.value.releaseUrl, '_blank')
    return
  }
  
  downloading.value = true
  downloadProgress.value = 0
  error.value = ''
  
  try {
    const result = await downloadUpdate(
      updateInfo.value.downloadUrl, 
      updateInfo.value.assetName,
      (progress) => {
        downloadProgress.value = progress
      }
    )
    
    if (result.success) {
      // 下载成功
      if (result.method === 'fetch') {
        downloadProgress.value = 100
      }
    }
  } catch (e) {
    error.value = '下载失败，请手动下载'
    console.error(e)
  } finally {
    downloading.value = false
  }
}

const handleSkip = () => {
  // 记住用户跳过了这个版本
  if (updateInfo.value?.latestVersion) {
    localStorage.setItem('hbu_skipped_version', updateInfo.value.latestVersion)
  }
  emit('close')
}

onMounted(() => {
  checkUpdate()
})
</script>

<template>
  <div class="update-dialog-overlay" @click.self="emit('close')">
    <div class="update-dialog">
      <div class="dialog-header">
        <span class="icon">🔄</span>
        <h3>版本更新</h3>
      </div>

      <div class="dialog-content">
        <!-- 检查中 -->
        <div v-if="checking" class="checking">
          <div class="spinner"></div>
          <p>正在检查更新...</p>
        </div>

        <!-- 有更新 -->
        <template v-else-if="updateInfo?.hasUpdate">
          <div class="version-info">
            <div class="version-badge new">v{{ updateInfo.latestVersion }}</div>
            <span class="arrow">→</span>
            <div class="version-badge current">当前 v{{ currentVersion }}</div>
          </div>
          
          <div class="release-notes">
            <h4>更新内容:</h4>
            <div class="notes-content" v-html="updateInfo.releaseNotes.replace(/\n/g, '<br>')"></div>
          </div>

          <!-- 下载进度条 -->
          <div v-if="downloading" class="download-progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: downloadProgress + '%' }"></div>
            </div>
            <span class="progress-text">{{ downloadProgress }}%</span>
          </div>

          <div class="platform-info">
            <span>📱 检测到平台: {{ updateInfo.platform }}</span>
            <span v-if="updateInfo.assetName">📦 {{ updateInfo.assetName }}</span>
          </div>
        </template>

        <!-- 已是最新 -->
        <template v-else-if="updateInfo && !updateInfo.hasUpdate">
          <div class="up-to-date">
            <span class="icon">✅</span>
            <p>已是最新版本</p>
            <span class="version">v{{ updateInfo.currentVersion }}</span>
          </div>
        </template>

        <!-- 错误 -->
        <div v-else-if="error" class="error">
          <span class="icon">❌</span>
          <p>{{ error }}</p>
        </div>
      </div>

      <div class="dialog-actions">
        <template v-if="updateInfo?.hasUpdate">
          <button class="btn-secondary" @click="handleSkip">跳过此版本</button>
          <button class="btn-primary" @click="handleDownload" :disabled="downloading">
            {{ downloading ? '下载中...' : '立即更新' }}
          </button>
        </template>
        <template v-else>
          <button class="btn-primary" @click="emit('close')">关闭</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.update-dialog {
  background: white;
  border-radius: 20px;
  width: 100%;
  max-width: 380px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
}

.dialog-header .icon {
  font-size: 28px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.dialog-content {
  padding: 20px;
  min-height: 120px;
}

.checking {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.checking p {
  margin: 12px 0 0;
  color: #6b7280;
}

.version-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.version-badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
}

.version-badge.new {
  background: #10b981;
  color: white;
}

.version-badge.current {
  background: #f3f4f6;
  color: #6b7280;
}

.arrow {
  font-size: 20px;
  color: #9ca3af;
}

.release-notes {
  background: #f9fafb;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}

.release-notes h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #374151;
}

.notes-content {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
  max-height: 150px;
  overflow-y: auto;
}

.platform-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #9ca3af;
}

.up-to-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.up-to-date .icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.up-to-date p {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #374151;
}

.up-to-date .version {
  margin-top: 4px;
  color: #9ca3af;
  font-size: 14px;
}

.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  color: #ef4444;
}

.error .icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}

.dialog-actions button {
  flex: 1;
  padding: 12px 16px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
}

.dialog-actions button:active {
  transform: scale(0.98);
}

.dialog-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

/* 下载进度条样式 */
.download-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #e0e7ff;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: #6366f1;
  min-width: 45px;
  text-align: right;
}
</style>
