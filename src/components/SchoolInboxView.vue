<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from '../utils/external_link'
import { formatRelativeTime } from '../utils/time.js'
import { buildSchoolInboxDetailHtml } from '../utils/school_inbox_content.js'
import { TPageHeader, TEmptyState } from './templates'

const LOGIN_METHOD_KEY = 'hbu_login_method'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const refreshing = ref(false)
const detailLoading = ref(false)
const markingRead = ref(false)
const markReadHint = ref('')
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

const selectedDetailHtml = computed(() =>
  selectedItem.value ? buildSchoolInboxDetailHtml(selectedItem.value.body) : ''
)

let listScrollTop = 0

const scrollSchoolInboxToTop = () => {
  nextTick(() => {
    requestAnimationFrame(() => {
      const root = document.querySelector('.school-inbox-page')
      const shell = root?.closest?.('.app-shell')
      if (shell) {
        shell.scrollTop = 0
        return
      }
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    })
  })
}

const restoreListScroll = () => {
  nextTick(() => {
    requestAnimationFrame(() => {
      const root = document.querySelector('.school-inbox-page')
      const shell = root?.closest?.('.app-shell')
      const targetTop = Math.max(0, listScrollTop)
      if (shell) {
        shell.scrollTop = targetTop
        return
      }
      window.scrollTo(0, targetTop)
    })
  })
}

const rememberListScroll = () => {
  const root = document.querySelector('.school-inbox-page')
  const shell = root?.closest?.('.app-shell')
  listScrollTop = shell ? shell.scrollTop : window.scrollY
}

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
  source: String(item?.source || ''),
  uuid: String(item?.uuid || '')
})

const syncItemReadState = (itemId, isRead = true) => {
  items.value = items.value.map((item) =>
    item.id === itemId ? { ...item, isRead } : item
  )
  if (selectedItem.value?.id === itemId) {
    selectedItem.value = { ...selectedItem.value, isRead }
  }
}

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

const loadDetail = async (item) => {
  if (!isTauriRuntime() || !item?.id) return

  const loginMode = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
  if (!loginMode) return

  detailLoading.value = true
  markReadHint.value = ''

  try {
    const response = await invokeNative('school_inbox_detail_fetch', {
      loginMode,
      itemId: item.id,
      fallback: {
        id: item.id,
        title: item.title,
        summary: item.summary,
        body: item.body,
        createdAt: item.createdAt,
        isRead: item.isRead,
        source: item.source,
        uuid: item.uuid || undefined
      }
    })
    if (response?.body) {
      const next = {
        ...item,
        title: String(response.title || item.title),
        body: String(response.body || item.body),
        createdAt: String(response.createdAt || response.created_at || item.createdAt),
        isRead: !!(response.isRead ?? response.is_read ?? item.isRead),
        source: String(response.source || item.source)
      }
      selectedItem.value = next
      items.value = items.value.map((entry) => (entry.id === next.id ? next : entry))
    }
  } catch (err) {
    markReadHint.value = err?.message || String(err) || '详情加载失败，已显示列表摘要'
  } finally {
    detailLoading.value = false
  }
}

const openItem = async (item) => {
  rememberListScroll()
  selectedItem.value = item
  scrollSchoolInboxToTop()
  await loadDetail(item)
}

const closeDetail = () => {
  selectedItem.value = null
  detailLoading.value = false
  markingRead.value = false
  markReadHint.value = ''
  restoreListScroll()
}

const handleBack = () => {
  if (selectedItem.value) {
    closeDetail()
    return
  }
  emit('back')
}

const handleDetailClick = async (event) => {
  const target = event.target?.closest?.('a')
  if (!target?.href) return
  event.preventDefault()
  await openExternal(target.href)
}

const markSelectedAsRead = async () => {
  if (!selectedItem.value || selectedItem.value.isRead || markingRead.value) return
  if (!isTauriRuntime()) return

  const loginMode = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
  if (!loginMode) {
    markReadHint.value = '缺少登录方式，请重新登录'
    return
  }

  const itemId = selectedItem.value.id
  markingRead.value = true
  markReadHint.value = ''
  syncItemReadState(itemId, true)

  try {
    const response = await invokeNative('school_inbox_mark_read', {
      loginMode,
      itemId
    })
    if (response?.success === false) {
      markReadHint.value = String(response?.message || '服务端标记已读失败，已在本地更新')
    }
  } catch (err) {
    markReadHint.value = err?.message || String(err) || '标记已读失败，已在本地更新'
  } finally {
    markingRead.value = false
  }
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
      <template v-if="selectedItem" #actions>
        <button
          v-if="!selectedItem.isRead"
          class="inbox-mark-read-btn"
          type="button"
          :disabled="markingRead"
          :aria-busy="markingRead"
          @click="markSelectedAsRead"
        >
          <span class="material-symbols-outlined text-base">done_all</span>
          <span>{{ markingRead ? '标记中' : '标为已读' }}</span>
        </button>
        <div v-else class="w-10 h-10" aria-hidden="true" />
      </template>
      <template v-else #actions>
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
        <article class="inbox-detail-card bg-surface-container-lowest border border-outline-variant">
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

          <TEmptyState v-if="detailLoading" type="loading" message="正在加载详情..." />

          <div
            v-else
            class="inbox-detail-body inbox-detail-body--rich"
            @click="handleDetailClick"
            v-html="selectedDetailHtml"
          />

          <p v-if="markReadHint" class="mt-3 text-xs text-on-surface-variant">{{ markReadHint }}</p>
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
              class="inbox-item w-full text-left bg-surface-container-lowest border border-outline-variant"
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
.inbox-refresh-btn,
.inbox-mark-read-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: var(--md-sys-color-on-surface, var(--color-on-surface, inherit));
  transition: background-color 0.2s ease;
}

.inbox-refresh-btn {
  width: 2.5rem;
  height: 2.5rem;
}

.inbox-mark-read-btn {
  gap: 0.25rem;
  min-height: 2.5rem;
  padding: 0 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--md-sys-color-primary, var(--color-primary, #6366f1));
}

.inbox-mark-read-btn:disabled {
  opacity: 0.6;
}

.inbox-refresh-btn:active,
.inbox-mark-read-btn:active {
  background: color-mix(in srgb, var(--md-sys-color-on-surface, #111) 8%, transparent);
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
  transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.inbox-item:active {
  transform: scale(0.985);
}

.inbox-item--unread {
  border-color: color-mix(in srgb, var(--md-sys-color-primary, var(--color-primary, #6366f1)) 35%, transparent) !important;
  background: color-mix(
    in srgb,
    var(--md-sys-color-primary-container, var(--color-primary-container, #e0e7ff)) 24%,
    var(--md-sys-color-surface-container-lowest, #1e293b)
  ) !important;
}

.inbox-item-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  margin-top: 0.45rem;
  flex-shrink: 0;
}

.inbox-item-dot--unread {
  background: var(--md-sys-color-primary, var(--color-primary, #6366f1));
}

.inbox-item-dot--read {
  background: color-mix(in srgb, var(--md-sys-color-outline, var(--color-outline, #94a3b8)) 70%, transparent);
}

.inbox-detail-card {
  border-radius: 1.25rem;
  padding: 1.25rem;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--md-sys-color-on-surface, #111) 6%, transparent);
}

.inbox-source-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--md-sys-color-primary-container, var(--color-primary-container, #e0e7ff)) 70%, transparent);
  color: var(--md-sys-color-on-primary-container, var(--color-on-primary-container, #312e81));
  font-weight: 600;
}

.inbox-detail-body {
  margin-top: 1rem;
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--md-sys-color-on-surface, var(--color-on-surface, #111827));
  word-break: break-word;
}

.inbox-detail-body--rich :deep(a) {
  color: var(--md-sys-color-primary, var(--color-primary, #6366f1));
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

.inbox-detail-body--rich :deep(p),
.inbox-detail-body--rich :deep(ul),
.inbox-detail-body--rich :deep(li) {
  margin: 0.5rem 0;
}

.inbox-detail-body--rich :deep(ul) {
  padding-left: 1.25rem;
}

.inbox-detail-body--rich :deep([style*='background']) {
  background: transparent !important;
}
</style>
