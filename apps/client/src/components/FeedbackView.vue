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
const browserOpenError = ref('')
const debugLogs = ref([])

let unsubscribeDebugLogs = null

const recentErrorLogs = computed(() => {
  return debugLogs.value
    .filter((item) => item && item.level === 'error')
    .slice(-RECENT_ERROR_LIMIT)
    .reverse()
})

const formatErrorItem = (item) => {
  const scope = String(item?.scope || 'APP').trim() || 'APP'
  const level = String(item?.level || 'error').trim().toUpperCase() || 'ERROR'
  const head = `${formatDebugTime(item?.ts)} [${level}][${scope}]`
  const message = String(item?.message || '').trim()
  const details = String(item?.details || '').trim()
  return [head, message, details && details !== message ? details : '']
    .filter(Boolean)
    .join('\n')
}

const recentErrorText = computed(() => recentErrorLogs.value.map((item) => formatErrorItem(item)).join('\n\n'))

const refreshDebugLogs = () => {
  debugLogs.value = getDebugLogs(DEBUG_LOG_LIMIT)
}

const openInBrowser = async () => {
  browserOpening.value = true
  browserOpenError.value = ''
  try {
    const opened = await openExternal(feedbackUrl)
    if (!opened) {
      throw new Error('默认浏览器未成功拉起')
    }
    showToast('已在默认浏览器打开反馈页', 'success')
  } catch (error) {
    browserOpenError.value = String(error?.message || error || '浏览器打开失败')
    showToast(browserOpenError.value, 'error')
  } finally {
    browserOpening.value = false
  }
}

const copyText = async (text, successMessage, emptyMessage) => {
  const value = String(text || '').trim()
  if (!value) {
    showToast(emptyMessage, 'info')
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    showToast(successMessage, 'success')
  } catch (error) {
    console.error('[Feedback] 复制失败', error)
    showToast('复制失败', 'error')
  }
}

const copyLink = async () => {
  await copyText(feedbackUrl, '反馈链接已复制', '反馈链接为空')
}

const copyRecentErrors = async () => {
  await copyText(recentErrorText.value, '最近 error 已复制', '当前没有最近 error')
}

const copySingleError = async (item) => {
  await copyText(formatErrorItem(item), 'error 已复制', '当前 error 为空')
}

onMounted(() => {
  refreshDebugLogs()
  unsubscribeDebugLogs = subscribeDebugLogs((logs) => {
    debugLogs.value = Array.isArray(logs) ? logs.slice(-DEBUG_LOG_LIMIT) : []
  })
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
      <section class="feedback-card feedback-card--actions">
        <div class="feedback-actions">
          <button class="primary-btn" type="button" :disabled="browserOpening" @click="openInBrowser">
            {{ browserOpening ? '打开中...' : '打开反馈表单' }}
          </button>
          <button class="ghost-btn" type="button" @click="copyLink">复制反馈链接</button>
          <button class="ghost-btn" type="button" :disabled="!recentErrorLogs.length" @click="copyRecentErrors">
            复制最近 error
          </button>
        </div>
        <p v-if="browserOpenError" class="status-line status-line--error">{{ browserOpenError }}</p>
      </section>

      <section class="feedback-card">
        <div class="section-head">
          <h3>最近 error</h3>
          <span class="section-count">{{ recentErrorLogs.length }}</span>
        </div>

        <TEmptyState v-if="!recentErrorLogs.length" type="empty" message="当前没有最近 error。" />

        <div v-else class="error-list">
          <article v-for="item in recentErrorLogs" :key="item.id" class="error-item">
            <div class="error-head">
              <div class="error-meta">
                <strong>{{ item.scope || 'APP' }}</strong>
                <time>{{ formatDebugTime(item.ts) }}</time>
              </div>
              <button class="inline-copy-btn" type="button" @click="copySingleError(item)">复制</button>
            </div>
            <pre class="error-details">{{ formatErrorItem(item) }}</pre>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.feedback-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
}

.feedback-body {
  display: grid;
  gap: 16px;
  padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
}

.feedback-card {
  border: 1px solid var(--ui-surface-border);
  border-radius: 24px;
  background: var(--ui-surface);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
  padding: 18px;
}

.feedback-card--actions {
  display: grid;
  gap: 12px;
}

.feedback-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.primary-btn,
.ghost-btn,
.header-btn,
.inline-copy-btn {
  appearance: none;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 700;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}

.primary-btn,
.ghost-btn,
.header-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
}

.primary-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  box-shadow: 0 12px 24px color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.ghost-btn,
.header-btn,
.inline-copy-btn {
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-primary-soft) 56%, var(--ui-surface) 44%);
  border-color: color-mix(in oklab, var(--ui-primary) 16%, transparent);
}

.inline-copy-btn {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 0.82rem;
}

.primary-btn:hover:not(:disabled),
.ghost-btn:hover:not(:disabled),
.header-btn:hover:not(:disabled),
.inline-copy-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.status-line {
  margin: 0;
  font-size: 0.84rem;
  color: var(--ui-muted);
}

.status-line--error {
  color: #dc2626;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head h3 {
  margin: 0;
  font-size: 1.08rem;
  color: var(--ui-text);
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary-soft) 64%, var(--ui-surface) 36%);
  color: var(--ui-primary);
  font-size: 0.82rem;
  font-weight: 800;
}

.error-list {
  display: grid;
  gap: 12px;
}

.error-item {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 12%, var(--ui-surface-border));
  border-radius: 18px;
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  padding: 14px;
}

.error-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.error-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.error-meta strong {
  color: var(--ui-text);
  font-size: 0.9rem;
}

.error-meta time {
  color: var(--ui-muted);
  font-size: 0.78rem;
}

.error-details {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 10%, transparent);
  background: color-mix(in oklab, var(--ui-surface) 78%, #000 22%);
  color: color-mix(in oklab, var(--ui-text) 88%, #fff 12%);
  font-size: 0.78rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  user-select: text;
  -webkit-user-select: text;
}

@media (max-width: 640px) {
  .feedback-body {
    padding-inline: 12px;
  }

  .feedback-card {
    border-radius: 20px;
    padding: 16px;
  }

  .feedback-actions {
    flex-direction: column;
  }

  .primary-btn,
  .ghost-btn {
    width: 100%;
  }

  .error-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
