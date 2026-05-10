<script setup>
import { ref, onMounted, computed } from 'vue'
import { checkForUpdates, downloadUpdate, getCurrentVersion, toGhProxyUrl } from '../utils/updater.js'
import { openExternal } from '../utils/external_link'

const emit = defineEmits(['close'])

const checking = ref(true)
const updateInfo = ref(null)
const downloading = ref(false)
const downloadProgress = ref(0)
const error = ref('')
const currentVersion = ref('')

// 下载源速度测试
const sourceSpeedResults = ref({}) // { url: { ms: number, status: 'testing'|'ok'|'fail'|'slow' } }
const showSourceTable = ref(false)

const checkUpdate = async () => {
  checking.value = true
  error.value = ''
  
  try {
    const version = currentVersion.value || await getCurrentVersion()
    currentVersion.value = version
    const result = await checkForUpdates(version)
    updateInfo.value = result
  } catch (e) {
    error.value = '检查更新失败，请稍后重试'
    console.error(e)
  } finally {
    checking.value = false
  }
}

// 构建带标签的下载源列表
const downloadSources = computed(() => {
  if (!updateInfo.value?.downloadUrls) return []
  const urls = updateInfo.value.downloadUrls
  return urls.map((url, idx) => {
    let label = ''
    let tag = ''
    if (url.includes('hbut.6661111.xyz')) {
      label = '本站下载'
      tag = 'cdn'
    } else if (url.includes('hk.gh-proxy.org')) {
      label = '代理下载 1'
      tag = 'proxy1'
    } else if (url.includes('gh-proxy.com')) {
      label = '代理下载 2'
      tag = 'proxy2'
    } else if (url.includes('ghfast.top')) {
      label = '代理下载 3'
      tag = 'proxy3'
    } else if (url.includes('mirror.ghproxy.com')) {
      label = '代理下载 4'
      tag = 'proxy4'
    } else if (url.includes('github.com')) {
      label = 'GitHub 源站'
      tag = 'github'
    } else {
      label = `线路 ${idx + 1}`
      tag = `line${idx}`
    }
    return { url, label, tag }
  })
})

// 测试单个下载源的响应速度
const testSourceSpeed = async (url) => {
  sourceSpeedResults.value[url] = { ms: 0, status: 'testing' }
  const start = performance.now()
  try {
    // 使用 HEAD 请求测试连通性（超时 8 秒）
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal
    })
    clearTimeout(timer)
    const ms = Math.round(performance.now() - start)
    sourceSpeedResults.value[url] = {
      ms,
      status: ms < 2000 ? 'ok' : ms < 5000 ? 'slow' : 'fail'
    }
  } catch {
    const ms = Math.round(performance.now() - start)
    // no-cors 模式下 opaque response 也算成功（说明服务器可达）
    if (ms < 5000) {
      sourceSpeedResults.value[url] = { ms, status: ms < 2000 ? 'ok' : 'slow' }
    } else {
      sourceSpeedResults.value[url] = { ms, status: 'fail' }
    }
  }
}

// 测试所有下载源
const testAllSources = () => {
  downloadSources.value.forEach(({ url }) => {
    testSourceSpeed(url)
  })
}

// 获取速度状态的颜色类名
const getSpeedColor = (status) => {
  switch (status) {
    case 'ok': return 'speed-ok'
    case 'slow': return 'speed-slow'
    case 'fail': return 'speed-fail'
    case 'testing': return 'speed-testing'
    default: return ''
  }
}

// 获取速度显示文本
const getSpeedText = (result) => {
  if (!result) return '—'
  if (result.status === 'testing') return '...'
  if (result.status === 'fail') return '超时'
  return `${result.ms}ms`
}

const handleDownload = () => {
  showSourceTable.value = true
  testAllSources()
}

const handleDownloadFromSource = async (url) => {
  downloading.value = true
  downloadProgress.value = 0
  error.value = ''
  
  try {
    const result = await downloadUpdate(
      [url],
      updateInfo.value.assetName,
      (progress) => {
        downloadProgress.value = progress
      }
    )
    
    if (result.success) {
      downloadProgress.value = 100
    }
  } catch (e) {
    error.value = '下载失败，请尝试其他线路'
    console.error(e)
  } finally {
    downloading.value = false
  }
}

const handleSkip = () => {
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

          <!-- 下载源选择表 -->
          <div v-if="showSourceTable && !downloading" class="source-table">
            <div class="source-table-header">
              <span>选择下载线路</span>
              <button class="retest-btn" @click="testAllSources">重新测速</button>
            </div>
            <div class="source-list">
              <div
                v-for="source in downloadSources"
                :key="source.url"
                class="source-row"
                @click="handleDownloadFromSource(source.url)"
              >
                <div class="source-label">
                  <span class="source-icon">{{ source.tag === 'cdn' ? '⚡' : source.tag === 'github' ? '🐙' : '🔗' }}</span>
                  <span>{{ source.label }}</span>
                </div>
                <div class="source-speed">
                  <span
                    :class="['speed-badge', getSpeedColor(sourceSpeedResults[source.url]?.status)]"
                  >
                    {{ getSpeedText(sourceSpeedResults[source.url]) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="platform-info">
            <span>📱 检测到平台: {{ updateInfo.platform }}</span>
            <span v-if="updateInfo.assetName">📦 {{ updateInfo.assetName }}</span>
          </div>
        </template>

        <!-- 构建中/无可用下载资产 -->
        <template v-else-if="updateInfo?.pending">
          <div class="up-to-date">
            <span class="icon">⏳</span>
            <p>新版本正在构建中，请稍后再试</p>
            <span class="version">v{{ updateInfo.latestVersion }}</span>
          </div>
        </template>

        <!-- 已是最新 -->
        <template v-else-if="updateInfo && !updateInfo.hasUpdate && !updateInfo.error">
          <div class="up-to-date">
            <span class="icon">✅</span>
            <p>已是最新版本</p>
            <span class="version">v{{ currentVersion }}</span>
          </div>
        </template>

        <!-- 错误 -->
        <div v-else-if="error || updateInfo?.error" class="error">
          <span class="icon">⚠️</span>
          <p>{{ error || updateInfo?.message || '无法获取更新信息，请检查网络连接' }}</p>
          <button class="retry-btn" @click="checkUpdate">重试</button>
        </div>
      </div>

      <div class="dialog-actions">
        <template v-if="updateInfo?.hasUpdate">
          <button class="btn-secondary" @click="handleSkip">跳过此版本</button>
          <button class="btn-primary" @click="handleDownload" :disabled="downloading || showSourceTable">
            {{ downloading ? '下载中...' : showSourceTable ? '请选择线路' : '立即更新' }}
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
  max-width: 400px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  background: var(--ui-primary, #6366f1);
  color: white;
}

.dialog-header .icon { font-size: 28px; }
.dialog-header h3 { margin: 0; font-size: 20px; font-weight: 700; }

.dialog-content {
  padding: 20px;
  min-height: 120px;
  max-height: 60vh;
  overflow-y: auto;
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
  border-top-color: var(--ui-primary, #6366f1);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.checking p { margin: 12px 0 0; color: #6b7280; }

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

.version-badge.new { background: #10b981; color: white; }
.version-badge.current { background: #f3f4f6; color: #6b7280; }
.arrow { font-size: 20px; color: #9ca3af; }

.release-notes {
  background: #f9fafb;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}

.release-notes h4 { margin: 0 0 8px; font-size: 14px; color: #374151; }

.notes-content {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
  max-height: 120px;
  overflow-y: auto;
}

.platform-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 12px;
}

/* 下载源选择表 */
.source-table {
  margin: 16px 0;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.source-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.retest-btn {
  padding: 4px 10px;
  font-size: 11px;
  color: #6366f1;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.retest-btn:hover { background: #e0e7ff; }

.source-list { display: flex; flex-direction: column; }

.source-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #f3f4f6;
}

.source-row:last-child { border-bottom: none; }
.source-row:hover { background: #f0f9ff; }
.source-row:active { background: #e0f2fe; }

.source-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #374151;
}

.source-icon { font-size: 16px; }

.source-speed { display: flex; align-items: center; }

.speed-badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.speed-ok {
  background: #d1fae5;
  color: #059669;
}

.speed-slow {
  background: #fef3c7;
  color: #d97706;
}

.speed-fail {
  background: #fee2e2;
  color: #dc2626;
}

.speed-testing {
  background: #e0e7ff;
  color: #6366f1;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.up-to-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.up-to-date .icon { font-size: 48px; margin-bottom: 12px; }
.up-to-date p { margin: 0; font-size: 18px; font-weight: 600; color: #374151; }
.up-to-date .version { margin-top: 4px; color: #9ca3af; font-size: 14px; }

.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  color: #6b7280;
}

.error .icon { font-size: 48px; margin-bottom: 12px; }
.error p { margin: 0 0 16px 0; text-align: center; }

.retry-btn {
  padding: 8px 20px;
  background: var(--ui-primary, #6366f1);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
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

.dialog-actions button:active { transform: scale(0.98); }
.dialog-actions button:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: var(--ui-primary, #6366f1); color: white; }
.btn-secondary { background: #e5e7eb; color: #374151; }

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
  background: var(--ui-primary, #6366f1);
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
