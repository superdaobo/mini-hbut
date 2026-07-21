<script setup>
/**
 * 学习通收件箱 — 复用 school_inbox，仅展示 chaoxing 源；链接可跳转
 * Issue: #437
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from '../utils/external_link'
import { formatRelativeTime } from '../utils/time.js'
import { buildSchoolInboxDetailHtml } from '../utils/school_inbox_content.js'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})
const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const detailLoading = ref(false)
const error = ref('')
const items = ref([])
const selected = ref(null)
const LOGIN_METHOD_KEY = 'hbu_login_method'

const unreadCount = computed(() => items.value.filter((i) => !i.isRead).length)
const detailHtml = computed(() =>
  selected.value ? buildSchoolInboxDetailHtml(selected.value.body) : ''
)

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

const formatItemTime = (value) => {
  const text = String(value || '').trim()
  if (!text) return '未知时间'
  const parsed = Date.parse(text.replace(/-/g, '/'))
  if (!Number.isFinite(parsed)) return text
  return formatRelativeTime(new Date(parsed).toISOString()) || text
}

const readLoginMode = () => {
  try {
    return String(localStorage.getItem(LOGIN_METHOD_KEY) || 'portal').trim() || 'portal'
  } catch {
    return 'portal'
  }
}

const fetchList = async () => {
  loading.value = true
  error.value = ''
  try {
    if (!isTauriRuntime()) {
      throw new Error('请在客户端内使用学习通收件箱')
    }
    const res = await invokeNative('school_inbox_fetch', {
      login_mode: readLoginMode()
    })
    const raw = Array.isArray(res?.items) ? res.items : []
    items.value = raw
      .map(normalizeItem)
      .filter((i) => i.source === 'chaoxing' || String(i.id).startsWith('chaoxing:'))
  } catch (e) {
    error.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

const openDetail = async (item) => {
  selected.value = item
  detailLoading.value = true
  try {
    if (!isTauriRuntime()) return
    const res = await invokeNative('school_inbox_detail_fetch', {
      login_mode: readLoginMode(),
      item_id: item.id,
      fallback: item
    })
    if (res) {
      selected.value = normalizeItem({ ...item, ...res })
    }
  } catch (e) {
    showToast(String(e?.message || e || '详情加载失败'))
  } finally {
    detailLoading.value = false
    nextTick(() => bindLinkClicks())
  }
}

const closeDetail = () => {
  selected.value = null
}

const handleChaoxingLink = async (href) => {
  const url = String(href || '').trim()
  if (!url) return
  const lower = url.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    showToast('已拦截不安全链接')
    return
  }
  try {
    await openExternal(url)
  } catch (e) {
    showToast(String(e?.message || e || '无法打开链接'))
  }
}

const bindLinkClicks = () => {
  const root = document.querySelector('.cx-inbox-detail-body')
  if (!root) return
  root.querySelectorAll('a[href]').forEach((a) => {
    a.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault()
        void handleChaoxingLink(a.getAttribute('href'))
      },
      { once: false }
    )
  })
}

const markRead = async () => {
  if (!selected.value?.id || selected.value.isRead) return
  try {
    await invokeNative('school_inbox_mark_read', {
      login_mode: readLoginMode(),
      item_id: selected.value.id
    })
    selected.value = { ...selected.value, isRead: true }
    items.value = items.value.map((i) =>
      i.id === selected.value.id ? { ...i, isRead: true } : i
    )
  } catch (e) {
    showToast(String(e?.message || e || '标记已读失败'))
  }
}

onMounted(fetchList)
</script>

<template>
  <div class="cx-inbox-page">
    <TPageHeader
      title="收件箱"
      :subtitle="unreadCount ? `${unreadCount} 条未读` : '学习通通知'"
      @back="selected ? closeDetail() : emit('back')"
    />

    <div class="cx-inbox-body">
      <div class="cx-inbox-toolbar">
        <button type="button" class="cx-inbox-btn" :disabled="loading" @click="fetchList">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>

      <p v-if="error" class="cx-inbox-error">{{ error }}</p>

      <template v-if="!selected">
        <TEmptyState
          v-if="!loading && !items.length && !error"
          title="暂无学习通消息"
          description="有课程通知时会显示在这里。"
        />
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="cx-inbox-row card-surface"
          @click="openDetail(item)"
        >
          <div class="cx-inbox-row-top">
            <span class="cx-inbox-title" :class="{ unread: !item.isRead }">{{ item.title }}</span>
            <span class="cx-inbox-time">{{ formatItemTime(item.createdAt) }}</span>
          </div>
          <p class="cx-inbox-summary">{{ item.summary || '点击查看详情' }}</p>
        </button>
      </template>

      <section v-else class="card-surface cx-inbox-detail">
        <h3>{{ selected.title }}</h3>
        <p class="cx-inbox-time">{{ formatItemTime(selected.createdAt) }}</p>
        <p v-if="detailLoading" class="cx-inbox-summary">加载详情…</p>
        <div class="cx-inbox-detail-body" v-html="detailHtml" />
        <div class="cx-inbox-actions">
          <button type="button" class="cx-inbox-btn" @click="closeDetail">返回列表</button>
          <button
            v-if="!selected.isRead"
            type="button"
            class="cx-inbox-btn primary"
            @click="markRead"
          >
            标为已读
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cx-inbox-page {
  min-height: 100%;
  background: var(--ui-bg, #f5f7fb);
  color: var(--ui-text, #0f172a);
}
.cx-inbox-body {
  padding: 12px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cx-inbox-toolbar {
  display: flex;
  justify-content: flex-end;
}
.cx-inbox-btn {
  border: 1px solid var(--ui-border, #d0d7e2);
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
}
.cx-inbox-btn.primary {
  background: var(--ui-primary, #2563eb);
  border-color: transparent;
  color: #fff;
}
.cx-inbox-error {
  color: #dc2626;
  font-size: 13px;
}
.card-surface {
  background: var(--ui-surface, #fff);
  border: 1px solid var(--ui-border, #e2e8f0);
  border-radius: 14px;
  padding: 12px;
  text-align: left;
  color: inherit;
}
.cx-inbox-row {
  width: 100%;
  cursor: pointer;
}
.cx-inbox-row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.cx-inbox-title {
  font-weight: 600;
  font-size: 14px;
}
.cx-inbox-title.unread {
  color: var(--ui-primary, #2563eb);
}
.cx-inbox-time,
.cx-inbox-summary {
  font-size: 12px;
  color: var(--ui-muted, #64748b);
  margin: 4px 0 0;
}
.cx-inbox-detail h3 {
  margin: 0;
  font-size: 16px;
}
.cx-inbox-detail-body {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}
.cx-inbox-detail-body :deep(a) {
  color: var(--ui-primary, #2563eb);
}
.cx-inbox-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
html.dark .cx-inbox-page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card-surface {
  background: var(--ui-surface, #111827);
  border-color: var(--ui-border, #1f2937);
}
</style>
