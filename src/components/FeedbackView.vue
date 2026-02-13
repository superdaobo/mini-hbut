<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from '../utils/toast'
import { openExternal } from '../utils/external_link'

const emit = defineEmits(['back'])

const loading = ref(true)
const iframeRef = ref(null)
const feedbackUrl = 'https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2'

const handleLoad = () => {
  loading.value = false
}

const handleError = () => {
  loading.value = false
}

// 在外部浏览器打开链接
const openInBrowser = async (url) => {
  await openExternal(url)
}

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(feedbackUrl)
    console.log('Link copied to clipboard')
    showToast('链接已复制到剪贴板！', 'success')
  } catch (err) {
    console.error('复制失败:', err)
    showToast('复制失败，请手动复制', 'error')
  }
}

onMounted(() => {
  // 设置超时，如果5秒后还在加载就隐藏loading
  setTimeout(() => {
    loading.value = false
  }, 5000)
})
</script>

<template>
  <div class="feedback-view">
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>问题反馈</h1>
      <button class="external-btn" @click="copyLink" aria-label="复制反馈链接">↗</button>
    </header>

    <div class="iframe-container">
      <div v-if="loading" class="loading-overlay">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>
      <iframe 
        ref="iframeRef"
        :src="feedbackUrl"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        frameborder="0"
        allowfullscreen
        @load="handleLoad"
        @error="handleError"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.feedback-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  position: sticky;
  top: 0;
  z-index: 100;
}

.view-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.back-btn, .external-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.back-btn:hover, .external-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.external-btn {
  padding: 8px 12px;
}

.iframe-container {
  flex: 1;
  position: relative;
  min-height: calc(100vh - 60px);
}

.iframe-container iframe {
  width: 100%;
  height: 100%;
  min-height: calc(100vh - 60px);
  border: none;
  background: white;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  z-index: 10;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-overlay p {
  margin-top: 12px;
  color: #6b7280;
  font-size: 14px;
}
</style>
