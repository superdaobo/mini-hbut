<script setup>
/**
 * 智慧迎新只读页（#459）
 * - 布局对齐成绩查询：TPageHeader / 卡片 / Tab / token
 * - 数据：smart_orientation_* 只读 invoke；无填报提交
 */
import { ref, computed, onMounted } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { formatRelativeTime } from '../utils/time.js'
import { TPageHeader, TEmptyState } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const TABS = [
  { id: 'messages', label: '消息', icon: 'mail' },
  { id: 'mentor', label: '班导师', icon: 'person' },
  { id: 'counselor', label: '辅导员', icon: 'support_agent' },
  { id: 'dorm', label: '宿舍', icon: 'apartment' },
  { id: 'profile', label: '个人信息', icon: 'badge' }
]

const activeTab = ref('messages')
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const notice = ref('')
const source = ref('')
const demo = ref(false)
const fetchedAt = ref('')

const panels = ref([])
const messages = ref([])
const mentor = ref(null)
const counselor = ref(null)
const dorm = ref(null)
const profile = ref(null)
const selectedMessage = ref(null)

const isInitialLoading = computed(() => loading.value && !fetchedAt.value)
const unreadCount = computed(() => messages.value.filter((m) => !m.isRead).length)

const sourceLabel = computed(() => {
  if (source.value === 'live') return '在线'
  if (source.value === 'mixed') return '部分在线'
  if (source.value === 'fixture') return '协议样例'
  return source.value || '智慧迎新'
})

const personFields = (person) => {
  if (!person) return []
  return [
    { label: '姓名', value: person.name },
    { label: '工号', value: person.staffId },
    { label: '学院', value: person.college },
    { label: '手机', value: person.phone },
    { label: '邮箱', value: person.email },
    { label: '办公地点', value: person.office },
    { label: '备注', value: person.remark }
  ].filter((row) => String(row.value || '').trim())
}

const dormFields = computed(() => {
  const d = dorm.value
  if (!d) return []
  return [
    { label: '校区', value: d.campus },
    { label: '楼栋', value: d.building },
    { label: '房间', value: d.room },
    { label: '床位', value: d.bed },
    { label: '状态', value: d.status },
    { label: '备注', value: d.remark }
  ].filter((row) => String(row.value || '').trim())
})

const profileFields = computed(() => {
  const p = profile.value
  if (!p) return []
  return [
    { label: '学号', value: p.studentId },
    { label: '姓名', value: p.name },
    { label: '性别', value: p.gender },
    { label: '学院', value: p.college },
    { label: '专业', value: p.major },
    { label: '班级', value: p.className },
    { label: '年级', value: p.grade },
    { label: '培养层次', value: p.educationLevel },
    { label: '身份证号', value: p.idNumber },
    { label: '手机', value: p.phone },
    { label: '迎新状态', value: p.orientationStatus }
  ].filter((row) => String(row.value || '').trim())
})

const normalizeMessage = (item) => ({
  id: String(item?.id || ''),
  title: String(item?.title || '无标题'),
  summary: String(item?.summary || ''),
  body: String(item?.body || item?.summary || ''),
  publishedAt: String(item?.publishedAt || item?.published_at || ''),
  isRead: !!(item?.isRead ?? item?.is_read),
  category: String(item?.category || '')
})

const normalizePerson = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  return {
    name: String(raw.name || ''),
    staffId: String(raw.staffId || raw.staff_id || ''),
    college: String(raw.college || ''),
    phone: String(raw.phone || ''),
    email: String(raw.email || ''),
    office: String(raw.office || ''),
    remark: String(raw.remark || '')
  }
}

const formatTime = (value) => {
  const text = String(value || '').trim()
  if (!text) return '未知时间'
  const parsed = Date.parse(text.replace(/-/g, '/'))
  if (!Number.isFinite(parsed)) return text
  return formatRelativeTime(new Date(parsed).toISOString()) || text
}

const applyMeta = (payload) => {
  if (!payload || typeof payload !== 'object') return
  source.value = String(payload.source || source.value || '')
  demo.value = !!(payload.demo ?? demo.value)
  notice.value = String(payload.notice || notice.value || '')
  fetchedAt.value = String(payload.fetchedAt || payload.fetched_at || fetchedAt.value || '')
  if (payload.error) {
    error.value = String(payload.error)
  }
}

const fetchAll = async ({ force = false } = {}) => {
  if (!isTauriRuntime()) {
    error.value = '智慧迎新仅支持 Tauri 桌面端'
    return
  }

  if (force) {
    refreshing.value = true
  } else {
    loading.value = true
  }
  error.value = ''
  notice.value = ''

  try {
    const [panelsRes, messagesRes, blocksRes] = await Promise.all([
      invokeNative('smart_orientation_list_panels').catch((e) => ({
        panels: [],
        error: e?.message || String(e),
        source: 'fixture',
        demo: true
      })),
      invokeNative('smart_orientation_list_messages').catch((e) => ({
        items: [],
        error: e?.message || String(e),
        source: 'fixture',
        demo: true
      })),
      invokeNative('smart_orientation_profile_blocks').catch((e) => ({
        error: e?.message || String(e),
        source: 'fixture',
        demo: true
      }))
    ])

    panels.value = Array.isArray(panelsRes?.panels) ? panelsRes.panels : []
    applyMeta(panelsRes)

    const list = Array.isArray(messagesRes?.items) ? messagesRes.items : []
    messages.value = list.map(normalizeMessage).filter((m) => m.id)
    applyMeta(messagesRes)

    mentor.value = normalizePerson(blocksRes?.mentor)
    counselor.value = normalizePerson(blocksRes?.counselor)
    dorm.value = blocksRes?.dorm && typeof blocksRes.dorm === 'object' ? blocksRes.dorm : null
    profile.value =
      blocksRes?.profile && typeof blocksRes.profile === 'object' ? blocksRes.profile : null
    applyMeta(blocksRes)

    if (!fetchedAt.value) {
      fetchedAt.value = new Date().toISOString()
    }
  } catch (err) {
    error.value = err?.message || String(err) || '获取智慧迎新数据失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const openMessage = (item) => {
  selectedMessage.value = item
}

const closeMessage = () => {
  selectedMessage.value = null
}

const handleBack = () => {
  if (selectedMessage.value) {
    closeMessage()
    return
  }
  emit('back')
}

const switchTab = (id) => {
  selectedMessage.value = null
  activeTab.value = id
}

onMounted(() => {
  void fetchAll()
})
</script>

<template>
  <div class="so-page min-h-screen flex flex-col mx-auto max-w-[448px] relative pb-24">
    <TPageHeader
      :title="selectedMessage ? '消息详情' : '智慧迎新'"
      icon="waving_hand"
      @back="handleBack"
    >
      <template #actions>
        <button
          class="so-icon-btn"
          type="button"
          :aria-busy="refreshing || loading"
          aria-label="刷新"
          @click="fetchAll({ force: true })"
        >
          <span class="material-symbols-outlined" :class="{ spinning: refreshing || loading }">
            refresh
          </span>
        </button>
      </template>
    </TPageHeader>

    <div v-if="!isTauriRuntime()" class="p-4">
      <TEmptyState type="empty" message="智慧迎新仅支持 Tauri 桌面端，请在桌面应用中使用。" />
    </div>

    <template v-else-if="selectedMessage">
      <main class="flex-1 flex flex-col gap-4 p-4">
        <article class="so-card">
          <h2 class="so-card-title">{{ selectedMessage.title }}</h2>
          <div class="so-meta-row">
            <span v-if="selectedMessage.category" class="so-badge">{{ selectedMessage.category }}</span>
            <span>{{ selectedMessage.publishedAt || '未知时间' }}</span>
          </div>
          <p class="so-body whitespace-pre-wrap">{{ selectedMessage.body }}</p>
        </article>
      </main>
    </template>

    <template v-else>
      <div v-if="fetchedAt || notice || demo" class="so-banner mx-4 mt-2">
        <span>来源：{{ sourceLabel }}</span>
        <span v-if="fetchedAt"> · 更新于 {{ formatRelativeTime(fetchedAt) || fetchedAt }}</span>
        <span v-if="demo" class="so-badge so-badge--demo">样例</span>
        <p v-if="notice" class="so-banner-notice">{{ notice }}</p>
      </div>

      <nav class="so-tabs" aria-label="智慧迎新分区">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="so-tab"
          :class="{ 'so-tab--active': activeTab === tab.id }"
          @click="switchTab(tab.id)"
        >
          <span class="material-symbols-outlined text-base">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
          <span v-if="tab.id === 'messages' && unreadCount > 0" class="so-tab-dot">{{ unreadCount }}</span>
        </button>
      </nav>

      <main class="flex-1 flex flex-col gap-3 p-4">
        <TEmptyState v-if="isInitialLoading" type="loading" message="正在加载智慧迎新..." />

        <TEmptyState
          v-else-if="error && !messages.length && !mentor && !counselor && !dorm && !profile"
          type="error"
          :message="error"
        >
          <button class="so-primary-btn mt-3" type="button" @click="fetchAll({ force: true })">
            重试
          </button>
        </TEmptyState>

        <template v-else-if="activeTab === 'messages'">
          <div v-if="messages.length" class="so-stats">
            <div class="so-stat so-stat--primary">
              <span class="so-stat-label">全部</span>
              <span class="so-stat-value">{{ messages.length }}</span>
            </div>
            <div class="so-stat">
              <span class="so-stat-label">未读</span>
              <span class="so-stat-value">{{ unreadCount }}</span>
            </div>
          </div>
          <TEmptyState v-if="!messages.length" type="empty" message="暂无迎新消息" />
          <ul v-else class="flex flex-col gap-2">
            <li v-for="item in messages" :key="item.id">
              <button
                type="button"
                class="so-msg-item"
                :class="{ 'so-msg-item--unread': !item.isRead }"
                @click="openMessage(item)"
              >
                <div class="flex items-start gap-3">
                  <span
                    class="so-dot"
                    :class="item.isRead ? 'so-dot--read' : 'so-dot--unread'"
                    aria-hidden="true"
                  />
                  <div class="flex-1 min-w-0 text-left">
                    <div class="flex items-start justify-between gap-2">
                      <h3 class="so-msg-title">{{ item.title }}</h3>
                      <span class="material-symbols-outlined text-base so-chevron">chevron_right</span>
                    </div>
                    <p v-if="item.summary" class="so-msg-summary">{{ item.summary }}</p>
                    <div class="so-msg-time">{{ formatTime(item.publishedAt) }}</div>
                  </div>
                </div>
              </button>
            </li>
          </ul>
        </template>

        <template v-else-if="activeTab === 'mentor'">
          <TEmptyState v-if="!mentor?.name" type="empty" message="暂无班导师信息" />
          <article v-else class="so-card">
            <h2 class="so-card-title">班导师</h2>
            <dl class="so-field-list">
              <div v-for="row in personFields(mentor)" :key="row.label" class="so-field">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </article>
        </template>

        <template v-else-if="activeTab === 'counselor'">
          <TEmptyState v-if="!counselor?.name" type="empty" message="暂无辅导员信息" />
          <article v-else class="so-card">
            <h2 class="so-card-title">辅导员</h2>
            <dl class="so-field-list">
              <div v-for="row in personFields(counselor)" :key="row.label" class="so-field">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </article>
        </template>

        <template v-else-if="activeTab === 'dorm'">
          <TEmptyState v-if="!dormFields.length" type="empty" message="暂无宿舍信息" />
          <article v-else class="so-card">
            <h2 class="so-card-title">宿舍信息</h2>
            <dl class="so-field-list">
              <div v-for="row in dormFields" :key="row.label" class="so-field">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </article>
        </template>

        <template v-else-if="activeTab === 'profile'">
          <TEmptyState v-if="!profileFields.length" type="empty" message="暂无个人信息" />
          <article v-else class="so-card">
            <h2 class="so-card-title">个人信息</h2>
            <p class="so-readonly-hint">只读展示 · 填报请前往官方门户</p>
            <dl class="so-field-list">
              <div v-for="row in profileFields" :key="row.label" class="so-field">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </article>
        </template>

        <p v-if="error && (messages.length || mentor || counselor || dorm || profile)" class="so-soft-error">
          {{ error }}
        </p>
      </main>
    </template>
  </div>
</template>

<style scoped>
.so-page {
  background: var(--ui-bg, var(--md-sys-color-surface, #0f172a));
  color: var(--ui-text, var(--md-sys-color-on-surface, #e2e8f0));
}

.so-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  color: inherit;
  transition: background-color 0.2s ease;
}

.so-icon-btn:active {
  background: color-mix(in srgb, var(--ui-text, #111) 8%, transparent);
}

.spinning {
  animation: so-spin 0.8s linear infinite;
}

@keyframes so-spin {
  to {
    transform: rotate(360deg);
  }
}

.so-banner {
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--ui-muted, var(--md-sys-color-on-surface-variant, #94a3b8));
  background: var(--ui-surface, var(--md-sys-color-surface-container-low, #1e293b));
  border: 1px solid var(--ui-surface-border, var(--md-sys-color-outline-variant, transparent));
}

.so-banner-notice {
  margin-top: 0.25rem;
  opacity: 0.9;
}

.so-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 0.35rem;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 600;
  background: var(--ui-primary-soft, var(--md-sys-color-primary-container, #312e81));
  color: var(--ui-text, var(--md-sys-color-on-primary-container, #e0e7ff));
}

.so-badge--demo {
  background: color-mix(in srgb, #f59e0b 28%, transparent);
  color: var(--ui-text, #fde68a);
}

.so-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0.75rem 1rem 0.25rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.so-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  padding: 0.45rem 0.7rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ui-muted, var(--md-sys-color-on-surface-variant, #94a3b8));
  background: var(--ui-surface, var(--md-sys-color-surface-container-lowest, #1e293b));
  border: 1px solid var(--ui-surface-border, var(--md-sys-color-outline-variant, transparent));
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.so-tab--active {
  color: var(--ui-text, var(--md-sys-color-on-primary-container, #e0e7ff));
  background: var(--ui-primary-soft, var(--md-sys-color-primary-container, #312e81));
  border-color: color-mix(
    in srgb,
    var(--ui-primary-soft, var(--md-sys-color-primary, #6366f1)) 55%,
    transparent
  );
}

.so-tab-dot {
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.3rem;
  border-radius: 9999px;
  font-size: 0.65rem;
  line-height: 1.1rem;
  text-align: center;
  background: color-mix(in srgb, #ef4444 85%, transparent);
  color: #fff;
}

.so-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.so-stat {
  border-radius: 1rem;
  padding: 1rem;
  background: var(--ui-surface, var(--md-sys-color-surface-container-lowest, #1e293b));
  border: 1px solid var(--ui-surface-border, var(--md-sys-color-outline-variant, transparent));
  box-shadow: var(--ui-shadow-strong, none);
}

.so-stat--primary {
  background: var(--ui-primary-soft, var(--md-sys-color-primary-container, #312e81));
  border-color: transparent;
}

.so-stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--ui-muted, var(--md-sys-color-on-surface-variant, #94a3b8));
}

.so-stat-value {
  display: block;
  margin-top: 0.25rem;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--ui-text, inherit);
}

.so-card {
  border-radius: 1rem;
  padding: 1rem 1.1rem;
  background: var(--ui-surface, var(--md-sys-color-surface-container-lowest, #1e293b));
  border: 1px solid var(--ui-surface-border, var(--md-sys-color-outline-variant, transparent));
  box-shadow: var(--ui-shadow-strong, none);
}

.so-card-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--ui-text, inherit);
  line-height: 1.35;
}

.so-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--ui-muted, var(--md-sys-color-on-surface-variant, #94a3b8));
}

.so-body {
  margin-top: 0.85rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--ui-text, inherit);
}

.so-readonly-hint {
  margin-top: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.7rem;
  color: var(--ui-muted, var(--md-sys-color-on-surface-variant, #94a3b8));
}

.so-field-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-top: 0.75rem;
}

.so-field {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.so-field dt {
  color: var(--ui-muted, var(--md-sys-color-on-surface-variant, #94a3b8));
}

.so-field dd {
  color: var(--ui-text, inherit);
  word-break: break-word;
}

.so-msg-item {
  width: 100%;
  border-radius: 1rem;
  padding: 0.875rem 1rem;
  text-align: left;
  background: var(--ui-surface, var(--md-sys-color-surface-container-lowest, #1e293b));
  border: 1px solid var(--ui-surface-border, var(--md-sys-color-outline-variant, transparent));
  transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.so-msg-item:active {
  transform: scale(0.985);
}

.so-msg-item--unread {
  border-color: color-mix(
    in srgb,
    var(--ui-primary-soft, var(--md-sys-color-primary, #6366f1)) 45%,
    transparent
  );
  background: color-mix(
    in srgb,
    var(--ui-primary-soft, var(--md-sys-color-primary-container, #312e81)) 28%,
    var(--ui-surface, #1e293b)
  );
}

.so-dot {
  width: 0.5rem;
  height: 0.5rem;
  margin-top: 0.4rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.so-dot--unread {
  background: var(--md-sys-color-primary, #6366f1);
}

.so-dot--read {
  background: color-mix(in srgb, var(--ui-muted, #94a3b8) 50%, transparent);
}

.so-msg-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ui-text, inherit);
  line-height: 1.35;
}

.so-msg-summary {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--ui-muted, var(--md-sys-color-on-surface-variant, #94a3b8));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.so-msg-time {
  margin-top: 0.4rem;
  font-size: 0.7rem;
  color: var(--ui-muted, var(--md-sys-color-outline, #64748b));
}

.so-chevron {
  color: var(--ui-muted, var(--md-sys-color-outline, #64748b));
}

.so-primary-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: var(--md-sys-color-primary, #6366f1);
  color: var(--md-sys-color-on-primary, #fff);
}

.so-soft-error {
  text-align: center;
  font-size: 0.75rem;
  color: var(--md-sys-color-error, #f87171);
}
</style>
