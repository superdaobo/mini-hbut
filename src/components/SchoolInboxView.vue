<script setup>
import { ref, computed, onMounted } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { formatRelativeTime } from '../utils/time.js'
import { TPageHeader, TEmptyState } from './templates'

const LOGIN_METHOD_KEY = 'hbu_login_method'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const items = ref([])
const fetchedAt = ref('')
const source = ref('')
const selectedItem = ref(null)

const isInitialLoading = computed(() => loading.value && items.value.length === 0)
const unreadCount = computed(() => items.value.filter((item) => !item.isRead).length)
const sourceLabel = computed(() => {
  if (source.value === 'chaoxing') return '学习通'
  if (source.value === 'portal') return '教务系统'
  return '学校消息'
})

const stripHtml = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (typeof document === 'undefined') {
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const node = document.createElement('div')
  node.innerHTML = raw
  return (node.textContent || node.innerText || '').replace(/\s+/g, ' ').trim()
}

const looksLikeHtml = (value) => /<[a-z][\s\S]*>/i.test(String(value || ''))

const resolveBodyText = (item) => {
  const raw = String(item?.body || item?.summary || '').trim()
  if (!raw) return '暂无正文内容'
  return looksLikeHtml(raw) ? stripHtml(raw) : raw
}

const selectedBody = computed(() => (selectedItem.value ? resolveBodyText(selectedItem.value) : ''))
const selectedBodyIsMultiline = computed(() => selectedBody.value.includes('\n'))

const formatItemTime = (value) => {
  const text = String(value || '').trim()
  if (!text) return '未知时间'
  const parsed = Date.parse(text.replace(/-/g, '/'))
  if (!Number.isFinite(parsed)) return text
  return formatRelativeTime(new Date(parsed).toISOString()) || text
}

const normalizeItem = (item) => ({
  id: String(item?.id || ''),
  title: String(item?.title || '无标题'),
  summary: String(item?.summary || ''),
  body: String(item?.body || item?.summary || ''),
  createdAt: String(item?.createdAt || item?.created_at || ''),
  isRead: !!(item?.isRead ?? item?.is_read),
  source: String(item?.source || '')
})

const fetchMessages = async ({ force = false } = {}) => {
  if (!isTauriRuntime()) {
    error.value = '学校消息浏览仅支持 Tauri 桌面端'
    return
  }

  const loginMode = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
  if (!loginMode) {
    error.value = '缺少登录方式，请重新登录'
    return
  }

  if (force) {
    refreshing.value = true
  } else {
    loading.value = true
  }
  error.value = ''

  try {
    const response = await invokeNative('school_inbox_fetch', { loginMode })
    const list = Array.isArray(response?.items) ? response.items : []
    items.value = list.map(normalizeItem).filter((item) => item.id)
    fetchedAt.value = String(response?.fetchedAt || response?.fetched_at || '')
    source.value = String(response?.source || list[0]?.source || '')
    if (response?.error) {
      error.value = String(response.error)
    }
  } catch (err) {
    error.value = err?.message || String(err) || '获取消息失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const openItem = (item) => {
  selectedItem.value = item
}

const closeDetail = () => {
  selectedItem.value = null
}

const handleBack = () => {
  if (selectedItem.value) {
    closeDetail()
    return
  }
  emit('back')
}

onMounted(() => {
  fetchMessages()
})
</script>

<template>
  <div class="school-inbox-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-24">
    <TPageHeader
      :title="selectedItem ? '消息详情' : '学校消息'"
      icon="mail"
      @back="handleBack"
    >
      <template v-if="!selectedItem" #actions>
        <button
          class="inbox-refresh-btn"
          type="button"
          :aria-busy="refreshing || loading"
          aria-label="刷新消息列表"
          @click="fetchMessages({ force: true })"
        >
          <span class="material-symbols-outlined" :class="{ spinning: refreshing || loading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <div v-if="!isTauriRuntime()" class="p-4">
      <TEmptyState type="empty" message="学校消息浏览仅支持 Tauri 桌面端，请在桌面应用中使用。" />
    </div>

    <template v-else-if="selectedItem">
      <main class="flex-1 flex flex-col gap-4 p-4">
        <article class="inbox-detail-card">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-lg font-bold text-on-surface leading-snug">{{ selectedItem.title }}</h2>
            <span
              v-if="!selectedItem.isRead"
              class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-container text-on-primary-container"
            >
              未读
            </span>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
            <span class="inbox-source-badge">{{ selectedItem.source === 'chaoxing' ? '学习通' : '教务系统' }}</span>
            <span>{{ selectedItem.createdAt || '未知时间' }}</span>
          </div>
          <div
            class="inbox-detail-body"
            :class="{ 'inbox-detail-body--multiline': selectedBodyIsMultiline }"
          >
            {{ selectedBody }}
          </div>
        </article>
      </main>
    </template>

    <template v-else>
      <div v-if="fetchedAt" class="mx-4 mt-2 px-3 py-2 rounded-xl bg-surface-container-low text-on-surface-variant text-xs">
        数据来源：{{ sourceLabel }} · 更新于 {{ formatRelativeTime(fetchedAt) || fetchedAt }}
      </div>

      <main class="flex-1 flex flex-col gap-3 p-4">
        <div
          v-if="!isInitialLoading && !error && items.length > 0"
          class="grid grid-cols-2 gap-3"
        >
          <div class="bg-primary-container rounded-2xl p-4 shadow-sm">
            <span class="text-xs font-medium text-on-primary-container/80">全部</span>
            <div class="text-3xl font-bold text-on-primary-container leading-tight mt-1">{{ items.length }}</div>
          </div>
          <div class="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant shadow-sm">
            <span class="text-xs font-medium text-on-surface-variant">未读</span>
            <div class="text-3xl font-bold text-on-surface leading-tight mt-1">{{ unreadCount }}</div>
          </div>
        </div>

        <TEmptyState v-if="isInitialLoading" type="loading" message="正在获取学校消息..." />
        <TEmptyState v-else-if="error && items.length === 0" type="error" :message="error">
          <button class="mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold text-sm" @click="fetchMessages({ force: true })">
            重试
          </button>
        </TEmptyState>
        <TEmptyState v-else-if="items.length === 0" type="empty" message="暂无学校消息" />

        <ul v-else class="flex flex-col gap-2">
          <li v-for="item in items" :key="item.id">
            <button
              type="button"
              class="inbox-item w-full text-left"
              :class="{ 'inbox-item--unread': !item.isRead }"
              @click="openItem(item)"
            >
              <div class="flex items-start gap-3">
                <span
                  class="inbox-item-dot"
                  :class="item.isRead ? 'inbox-item-dot--read' : 'inbox-item-dot--unread'"
                  aria-hidden="true"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <h3 class="text-sm font-semibold text-on-surface leading-snug line-clamp-2">{{ item.title }}</h3>
                    <span class="material-symbols-outlined text-base text-outline shrink-0">chevron_right</span>
                  </div>
                  <p v-if="item.summary" class="mt-1 text-xs text-on-surface-variant line-clamp-2">{{ item.summary }}</p>
                  <div class="mt-2 flex items-center gap-2 text-[11px] text-outline">
                    <span>{{ item.source === 'chaoxing' ? '学习通' : '教务' }}</span>
                    <span>·</span>
                    <span>{{ formatItemTime(item.createdAt) }}</span>
                  </div>
                </div>
              </div>
            </button>
          </li>
        </ul>

        <p v-if="error && items.length > 0" class="text-xs text-error text-center">{{ error }}</p>
      </main>
    </template>
  </div>
</template>

<style scoped>
.inbox-refresh-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: var(--color-on-surface, inherit);
  transition: background-color 0.2s ease;
}

.inbox-refresh-btn:active {
  background: color-mix(in srgb, var(--color-on-surface, #111) 8%, transparent);
}

.spinning {
  animation: inbox-spin 0.8s linear infinite;
}

@keyframes inbox-spin {
  to { transform: rotate(360deg); }
}

.inbox-item {
  border-radius: 1rem;
  padding: 0.875rem 1rem;
  background: var(--color-surface-container-lowest, rgba(255, 255, 255, 0.72));
  border: 1px solid color-mix(in srgb, var(--color-outline-variant, #cbd5e1) 65%, transparent);
  transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.inbox-item:active {
  transform: scale(0.985);
}

.inbox-item--unread {
  border-color: color-mix(in srgb, var(--color-primary, #6366f1) 35%, transparent);
  background: color-mix(in srgb, var(--color-primary-container, #e0e7ff) 28%, var(--color-surface-container-lowest, #fff));
}

.inbox-item-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  margin-top: 0.45rem;
  flex-shrink: 0;
}

.inbox-item-dot--unread {
  background: var(--color-primary, #6366f1);
}

.inbox-item-dot--read {
  background: color-mix(in srgb, var(--color-outline, #94a3b8) 70%, transparent);
}

.inbox-detail-card {
  border-radius: 1.25rem;
  padding: 1.25rem;
  background: var(--color-surface-container-lowest, rgba(255, 255, 255, 0.72));
  border: 1px solid color-mix(in srgb, var(--color-outline-variant, #cbd5e1) 65%, transparent);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-on-surface, #111) 6%, transparent);
}

.inbox-source-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-primary-container, #e0e7ff) 70%, transparent);
  color: var(--color-on-primary-container, #312e81);
  font-weight: 600;
}

.inbox-detail-body {
  margin-top: 1rem;
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--color-on-surface, #111827);
  white-space: pre-wrap;
  word-break: break-word;
}

.inbox-detail-body--multiline {
  white-space: pre-wrap;
}
</style>
