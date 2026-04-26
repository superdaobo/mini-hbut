<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { formatDebugTime, getDebugLogs, subscribeDebugLogs } from '../utils/debug_logger'
import { TEmptyState, TPageHeader } from './templates'

const emit = defineEmits(['back'])

const feedbackUrl = 'https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2'
const DEBUG_LOG_LIMIT = 200
const RECENT_ERROR_LIMIT = 8

const browserOpening = ref(false)
const browserOpened = ref(false)
const browserOpenError = ref('')
const debugLogs = ref([])

let unsubscribeDebugLogs = null

const recentErrorLogs = computed(() => {
  return debugLogs.value
    .filter((item) => item && (item.level === 'error' || item.level === 'warn'))
    .slice(-RECENT_ERROR_LIMIT)
    .reverse()
})

const recentErrorText = computed(() => {
  return recentErrorLogs.value
    .map((item) => {
      const head = `${formatDebugTime(item.ts)} [${String(item.level || 'log').toUpperCase()}][${item.scope || 'APP'}]`
      const details = String(item.details || item.message || '').trim()
      return `${head}\n${details}`
    })
    .join('\n\n')
})

const refreshDebugLogs = () => {
  debugLogs.value = getDebugLogs(DEBUG_LOG_LIMIT)
}

const openInBrowser = async ({ silent = false } = {}) => {
  browserOpening.value = true
  browserOpenError.value = ''
  try {
    const opened = await openExternal(feedbackUrl)
    if (!opened) {
      throw new Error('默认浏览器未成功拉起')
    }
    browserOpened.value = true
    if (!silent) {
      showToast('已在默认浏览器打开反馈页', 'success')
    }
  } catch (error) {
    browserOpened.value = false
    browserOpenError.value = String(error?.message || error || '浏览器打开失败')
    if (!silent) {
      showToast(browserOpenError.value, 'error')
    }
  } finally {
    browserOpening.value = false
  }
}

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(feedbackUrl)
    showToast('反馈链接已复制', 'success')
  } catch (error) {
    console.error('[Feedback] 复制反馈链接失败', error)
    showToast('复制失败，请手动复制链接', 'error')
  }
}

const copyRecentErrors = async () => {
  if (!recentErrorText.value) {
    showToast('当前没有最近报错可复制', 'info')
    return
  }
  try {
    await navigator.clipboard.writeText(recentErrorText.value)
    showToast('最近报错已复制', 'success')
  } catch (error) {
    console.error('[Feedback] 复制最近报错失败', error)
    showToast('复制最近报错失败', 'error')
  }
}

onMounted(() => {
  refreshDebugLogs()
  unsubscribeDebugLogs = subscribeDebugLogs((logs) => {
    debugLogs.value = Array.isArray(logs) ? logs.slice(-DEBUG_LOG_LIMIT) : []
  })
  void openInBrowser({ silent: true })
})

onBeforeUnmount(() => {
  if (typeof unsubscribeDebugLogs === 'function') {
    unsubscribeDebugLogs()
    unsubscribeDebugLogs = null
  }
})
</script>

<template>
  <div class="feedback-view">
    <TPageHeader title="问题反馈" @back="emit('back')">
      <template #actions>
        <button class="header-btn" type="button" @click="copyLink">复制链接</button>
      </template>
    </TPageHeader>

    <div class="feedback-body">
      <section class="feedback-card feedback-card--hero">
        <div class="hero-copy">
          <p class="hero-eyebrow">反馈入口</p>
          <h2>问题反馈已改为浏览器提交</h2>
          <p class="hero-desc">
            进入此页后会优先拉起系统默认浏览器，避免腾讯文档在内嵌 WebView 中出现兼容性问题。
          </p>
          <p v-if="browserOpened" class="hero-state hero-state--success">默认浏览器已成功拉起，可直接填写反馈。</p>
          <p v-else-if="browserOpenError" class="hero-state hero-state--error">{{ browserOpenError }}</p>
          <div class="hero-actions">
            <button class="primary-btn" type="button" :disabled="browserOpening" @click="openInBrowser()">
              {{ browserOpening ? '正在打开...' : '打开反馈表单' }}
            </button>
            <button class="ghost-btn" type="button" @click="copyLink">复制表单链接</button>
            <button class="ghost-btn" type="button" :disabled="!recentErrorLogs.length" @click="copyRecentErrors">
              复制最近报错
            </button>
          </div>
        </div>
      </section>

      <section class="feedback-card">
        <div class="section-head">
          <div>
            <p class="section-eyebrow">调试信息</p>
            <h3>最近报错</h3>
          </div>
          <span class="section-count">{{ recentErrorLogs.length }} 条</span>
        </div>

        <TEmptyState
          v-if="!recentErrorLogs.length"
          type="empty"
          message="当前没有最近报错记录，可直接在浏览器描述问题现象和复现步骤。"
        />

        <ul v-else class="error-list">
          <li v-for="item in recentErrorLogs" :key="item.id" class="error-item">
            <div class="error-head">
              <strong>{{ item.scope || 'APP' }}</strong>
              <span class="error-level" :class="`lvl-${item.level || 'log'}`">
                {{ String(item.level || 'log').toUpperCase() }}
              </span>
              <time>{{ formatDebugTime(item.ts) }}</time>
            </div>
            <p class="error-message">{{ item.message }}</p>
            <pre v-if="item.details && item.details !== item.message" class="error-details">{{ item.details }}</pre>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.feedback-view {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(252, 211, 77, 0.24), transparent 28%),
    linear-gradient(180deg, #fff8ed 0%, #fffdf8 34%, #f7f7f5 100%);
}

.feedback-body {
  display: grid;
  gap: 16px;
  padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
}

.feedback-card {
  border: 1px solid rgba(217, 119, 6, 0.12);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 36px rgba(120, 53, 15, 0.08);
  backdrop-filter: blur(12px);
  padding: 18px;
}

.feedback-card--hero {
  overflow: hidden;
}

.hero-copy h2 {
  margin: 6px 0 10px;
  font-size: 1.36rem;
  line-height: 1.3;
  color: #7c2d12;
}

.hero-eyebrow,
.section-eyebrow {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #c2410c;
}

.hero-desc {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.7;
  color: #57534e;
}

.hero-state {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 0.84rem;
  font-weight: 600;
}

.hero-state--success {
  background: rgba(220, 252, 231, 0.95);
  color: #166534;
}

.hero-state--error {
  background: rgba(254, 226, 226, 0.95);
  color: #b91c1c;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.primary-btn,
.ghost-btn,
.header-btn {
  appearance: none;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.primary-btn {
  padding: 11px 18px;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: #fff;
  box-shadow: 0 12px 24px rgba(234, 88, 12, 0.22);
}

.ghost-btn,
.header-btn {
  padding: 10px 16px;
  background: rgba(255, 247, 237, 0.96);
  color: #9a3412;
  border: 1px solid rgba(251, 146, 60, 0.25);
}

.primary-btn:hover:not(:disabled),
.ghost-btn:hover:not(:disabled),
.header-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head h3 {
  margin: 4px 0 0;
  font-size: 1.08rem;
  color: #292524;
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(251, 146, 60, 0.12);
  color: #c2410c;
  font-size: 0.8rem;
  font-weight: 700;
}

.error-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}

.error-item {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  padding: 14px;
}

.error-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.78rem;
  color: #78716c;
}

.error-head strong {
  font-size: 0.86rem;
  color: #1f2937;
}

.error-level {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
}

.error-level.lvl-error {
  background: rgba(254, 226, 226, 0.95);
  color: #b91c1c;
}

.error-level.lvl-warn {
  background: rgba(254, 243, 199, 0.95);
  color: #b45309;
}

.error-message {
  margin: 0;
  color: #292524;
  line-height: 1.6;
  word-break: break-word;
}

.error-details {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #111827;
  color: #e5e7eb;
  font-size: 0.76rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

@media (max-width: 640px) {
  .feedback-body {
    padding-inline: 12px;
  }

  .feedback-card {
    border-radius: 20px;
    padding: 16px;
  }

  .hero-copy h2 {
    font-size: 1.22rem;
  }

  .hero-actions {
    flex-direction: column;
  }

  .primary-btn,
  .ghost-btn {
    width: 100%;
  }
}
</style>
