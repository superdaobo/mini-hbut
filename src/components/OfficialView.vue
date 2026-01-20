<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['back'])

const loading = ref(true)
const iframeRef = ref(null)
const officialUrl = 'https://docs.qq.com/doc/DQnVTWFFFbEhNTXhx'

const handleLoad = () => {
  loading.value = false
  // 在 iframe 加载完成后，尝试拦截链接点击
  interceptIframeLinks()
}

const handleError = () => {
  loading.value = false
}

// 拦截 iframe 内的链接点击，在外部浏览器打开
const interceptIframeLinks = () => {
  try {
    const iframe = iframeRef.value
    if (!iframe || !iframe.contentWindow || !iframe.contentDocument) {
      console.log('[OfficialView] 无法访问 iframe 内容（跨域限制）')
      return
    }
    
    // 给 iframe 内的所有链接添加点击事件
    const doc = iframe.contentDocument
    doc.addEventListener('click', async (e) => {
      const link = e.target.closest('a')
      if (link && link.href) {
        e.preventDefault()
        e.stopPropagation()
        console.log('[OfficialView] 拦截链接点击:', link.href)
        await openInBrowser(link.href)
      }
    }, true)
  } catch (e) {
    console.log('[OfficialView] iframe 链接拦截失败（可能是跨域）:', e.message)
  }
}

// 在外部浏览器打开链接
const openInBrowser = async (url) => {
  try {
    // 优先使用 Tauri shell 打开外部链接
    const shell = await import('@tauri-apps/plugin-shell')
    await shell.open(url)
    console.log('[OfficialView] 已用系统浏览器打开:', url)
  } catch (e) {
    // 如果 shell 插件不可用，尝试用 window.open
    console.log('[OfficialView] 使用 window.open 打开:', url)
    window.open(url, '_blank')
  }
}

const openExternal = async () => {
  await openInBrowser(officialUrl)
}

onMounted(() => {
  // 设置超时，如果5秒后还在加载就隐藏loading
  setTimeout(() => {
    loading.value = false
  }, 5000)
})
</script>

<template>
  <div class="official-view">
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>📢 官方发布</h1>
      <button class="external-btn" @click="openExternal">🔗</button>
    </header>

    <div class="iframe-container">
      <div v-if="loading" class="loading-overlay">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>
      <iframe 
        ref="iframeRef"
        :src="officialUrl"
        frameborder="0"
        allowfullscreen
        @load="handleLoad"
        @error="handleError"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.official-view {
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
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
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
  border-top-color: #6366f1;
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
