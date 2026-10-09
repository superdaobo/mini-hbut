<script setup lang="ts">
// TeacherNotificationView（E3 #1023）：教师通知只读视图。
//
// 安全约束：
//   - **只读**：教务通知复用既有 `school_inbox_fetch`（portal 只读链路）；
//   - **已读仅本地**：标记已读只写教师作用域本地存储，绝不 POST updateState；
//   - **无伪数据**：数据源未具备的标签（待办 / 监考）不出现；
//     本轮仅「教务通知」+「教学提醒」；教学提醒无快照时显示空态。
//   - HTML 正文经 `buildSchoolInboxDetailHtml` 白名单清洗，无 XSS。

import { computed, onMounted, ref } from 'vue'
import { TPageHeader, TEmptyState } from '../../../components/templates'
import { useAuthStore } from '../../../stores'
import { useI18n } from '../../../utils/app_i18n'
import { buildSchoolInboxDetailHtml } from '../../../utils/school_inbox_content.js'
import { openExternal } from '../../../utils/external_link'
import { formatRelativeTime } from '../../../utils/time.js'
import type { TeacherReminderEvent } from '../utils/teacher_reminders'
import {
  TEACHER_ERROR_I18N_KEY,
  useTeacherNotifications,
  type TeacherNoticeItem
} from '../composables/useTeacherNotifications'
import { resolveTeacherAccountId } from '../utils/teacher_scope'

const emit = defineEmits<{ (event: 'back'): void }>()

const { t: tLocale } = useI18n()
const authStore = useAuthStore()

// 教师工号不走学号正则：优先取按角色分库的登录账号（`hbu_login_form_account_teacher`），
// 取不到时 `teacherNoticeReadKey` 会返回空串并跳过本地持久化（fail-closed，避免跨教师串号）。
const accountId = computed(() => resolveTeacherAccountId(authStore.studentId))
// 通知本身与学期无关；教学提醒快照按学期隔离，未就绪时退化为占位（绝不回落学生域）。
const semester = computed(() => '')

const {
  reminders,
  loading,
  remindersLoading,
  error,
  desktopOnly,
  unreadCount,
  academicNotices,
  loadNotices,
  loadReminders,
  markLocalRead,
  isLocallyRead
} = useTeacherNotifications({
  accountId: () => accountId.value,
  semester: () => semester.value
})

type TabId = 'all' | 'academic' | 'teaching'
const activeTab = ref<TabId>('all')
const selectedNotice = ref<TeacherNoticeItem | null>(null)
const selectedReminder = ref<TeacherReminderEvent | null>(null)
const markHint = ref('')

const tabs = computed<Array<{ id: TabId; label: string }>>(() => [
  { id: 'all', label: tLocale('notify.inbox.all') },
  { id: 'academic', label: tLocale('teacher.notification.tabAcademic') },
  { id: 'teaching', label: tLocale('teacher.notification.tabTeachingReminder') }
])

const showNotices = computed(() => activeTab.value !== 'teaching')
const showReminders = computed(() => activeTab.value !== 'academic')

const errorMessage = computed(() => {
  if (!error.value) return ''
  return tLocale(TEACHER_ERROR_I18N_KEY[error.value.kind] || 'teacher.error.unknown')
})

const selectedIsRead = computed(() => {
  const item = selectedNotice.value
  if (!item) return true
  return item.isRead || isLocallyRead(item.id)
})

const detailHtml = computed(() =>
  selectedNotice.value ? buildSchoolInboxDetailHtml(selectedNotice.value.body) : ''
)

const detailTitle = computed(() => {
  if (selectedNotice.value || selectedReminder.value) return tLocale('notify.inbox.detailTitle')
  return tLocale('teacher.notification.title')
})

const formatItemTime = (value: unknown): string => {
  const text = String(value || '').trim()
  if (!text) return tLocale('notify.inbox.unknownTime')
  const parsed = Date.parse(text.replace(/-/g, '/'))
  if (!Number.isFinite(parsed)) return text
  return formatRelativeTime(new Date(parsed).toISOString()) || text
}

const reminderTime = (event: TeacherReminderEvent): string => {
  const secs = Number(event?.atEpochSecs || 0)
  if (!secs) return tLocale('notify.inbox.unknownTime')
  return formatRelativeTime(new Date(secs * 1000).toISOString()) || tLocale('notify.inbox.unknownTime')
}

const sourceLabel = (item: TeacherNoticeItem): string =>
  item.source === 'portal' ? tLocale('teacher.notification.academicSource') : item.source

const refresh = async (): Promise<void> => {
  await Promise.all([loadNotices(), loadReminders()])
}

const openNotice = (item: TeacherNoticeItem): void => {
  markHint.value = ''
  selectedReminder.value = null
  selectedNotice.value = item
}

const openReminder = (event: TeacherReminderEvent): void => {
  selectedNotice.value = null
  selectedReminder.value = event
}

const closeDetail = (): void => {
  selectedNotice.value = null
  selectedReminder.value = null
  markHint.value = ''
}

const handleBack = (): void => {
  if (selectedNotice.value || selectedReminder.value) {
    closeDetail()
    return
  }
  emit('back')
}

const handleDetailClick = async (event: MouseEvent): Promise<void> => {
  const target = (event.target as HTMLElement | null)?.closest?.('a')
  const href = target?.getAttribute('href')
  if (!href) return
  event.preventDefault()
  await openExternal(href)
}

/** 标记已读：仅本地记录 + 明确提示，绝不写服务端。 */
const markSelectedAsRead = (): void => {
  const item = selectedNotice.value
  if (!item || selectedIsRead.value) return
  markLocalRead(item.id)
  markHint.value = tLocale('notify.inbox.teacherLocalOnly')
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="teacher-notification-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-24">
    <TPageHeader :title="detailTitle" icon="mail" @back="handleBack">
      <template #actions>
        <button
          class="teacher-notification-refresh"
          type="button"
          :aria-busy="loading || remindersLoading"
          :aria-label="tLocale('notify.inbox.refreshList')"
          @click="refresh"
        >
          <span class="material-symbols-outlined" :class="{ spinning: loading || remindersLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <!-- 教务通知详情 -->
    <main v-if="selectedNotice" class="flex-1 flex flex-col gap-4 p-4">
      <article class="teacher-notice-card">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-lg font-bold text-on-surface leading-snug">
            {{ selectedNotice.title || tLocale('notify.inbox.untitled') }}
          </h2>
          <span v-if="!selectedIsRead" class="teacher-notice-badge">
            {{ tLocale('notify.inbox.unread') }}
          </span>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span class="teacher-notice-source">{{ sourceLabel(selectedNotice) }}</span>
          <span>{{ formatItemTime(selectedNotice.createdAt) }}</span>
        </div>

        <div
          class="teacher-notice-body"
          @click="handleDetailClick"
          v-html="detailHtml"
        />

        <button
          v-if="!selectedIsRead"
          class="teacher-notice-mark-read"
          type="button"
          @click="markSelectedAsRead"
        >
          <span class="material-symbols-outlined text-base">done_all</span>
          <span>{{ tLocale('notify.inbox.markRead') }}</span>
        </button>
        <p class="mt-3 text-xs text-on-surface-variant">{{ tLocale('notify.inbox.teacherLocalOnly') }}</p>
        <p v-if="markHint" class="mt-1 text-xs text-on-surface-variant">{{ markHint }}</p>
      </article>
    </main>

    <!-- 教学提醒详情 -->
    <main v-else-if="selectedReminder" class="flex-1 flex flex-col gap-4 p-4">
      <article class="teacher-notice-card">
        <h2 class="text-lg font-bold text-on-surface leading-snug">{{ selectedReminder.title }}</h2>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span>{{ reminderTime(selectedReminder) }}</span>
        </div>
        <p class="teacher-notice-body">{{ selectedReminder.body }}</p>
      </article>
    </main>

    <template v-else>
      <!-- 标签：仅按实际可用范围展示（无「待办」「监考」伪标签） -->
      <nav class="teacher-notice-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="teacher-notice-tab"
          :class="{ 'teacher-notice-tab--active': activeTab === tab.id }"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div
        v-if="!desktopOnly && !error && academicNotices.length > 0"
        class="mx-4 mt-2 px-3 py-2 rounded-xl bg-surface-container-low text-on-surface-variant text-xs"
      >
        {{ tLocale('notify.inbox.unread') }}: {{ unreadCount }} / {{ academicNotices.length }}
      </div>

      <main class="flex-1 flex flex-col gap-3 p-4">
        <TEmptyState
          v-if="desktopOnly"
          type="empty"
          :message="tLocale('notify.inbox.desktopOnlyFull')"
        />
        <TEmptyState
          v-else-if="loading && academicNotices.length === 0"
          type="loading"
          :message="tLocale('notify.inbox.loadingList')"
        />
        <TEmptyState
          v-else-if="error && academicNotices.length === 0"
          type="error"
          :message="errorMessage"
        >
          <button class="teacher-notice-retry" type="button" @click="refresh">
            {{ tLocale('notify.inbox.retry') }}
          </button>
        </TEmptyState>

        <template v-else>
          <!-- 教务通知 -->
          <template v-if="showNotices">
            <ul v-if="academicNotices.length > 0" class="flex flex-col gap-2">
              <li v-for="item in academicNotices" :key="item.id">
                <button
                  type="button"
                  class="teacher-notice-item"
                  :class="{ 'teacher-notice-item--unread': !item.isRead }"
                  @click="openNotice(item)"
                >
                  <span
                    class="teacher-notice-dot"
                    :class="item.isRead ? 'teacher-notice-dot--read' : 'teacher-notice-dot--unread'"
                    aria-hidden="true"
                  />
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold text-on-surface leading-snug line-clamp-2">
                      {{ item.title || tLocale('notify.inbox.untitled') }}
                    </span>
                    <span v-if="item.summary" class="block mt-1 text-xs text-on-surface-variant line-clamp-2">
                      {{ item.summary }}
                    </span>
                    <span class="block mt-2 text-[11px] text-outline">
                      {{ sourceLabel(item) }} · {{ formatItemTime(item.createdAt) }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
            <TEmptyState
              v-else-if="activeTab !== 'teaching'"
              type="empty"
              :message="tLocale('teacher.notification.empty')"
            />
          </template>

          <!-- 教学提醒（本地教师作用域快照；无数据不伪造） -->
          <template v-if="showReminders">
            <ul v-if="reminders.length > 0" class="flex flex-col gap-2">
              <li v-for="event in reminders" :key="event.id">
                <button type="button" class="teacher-notice-item" @click="openReminder(event)">
                  <span class="material-symbols-outlined text-base text-outline">notifications_active</span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold text-on-surface leading-snug line-clamp-2">
                      {{ event.title }}
                    </span>
                    <span class="block mt-2 text-[11px] text-outline">{{ reminderTime(event) }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <TEmptyState
              v-else-if="activeTab !== 'academic' && remindersLoading === false"
              type="empty"
              :message="tLocale('teacher.notification.teachingReminderEmpty')"
            />
          </template>
        </template>
      </main>
    </template>
  </div>
</template>

<style scoped>
.teacher-notification-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  color: var(--md-sys-color-on-surface, var(--color-on-surface, inherit));
}

.teacher-notification-refresh:active {
  background: color-mix(in srgb, var(--md-sys-color-on-surface, #111) 8%, transparent);
}

.spinning {
  animation: teacher-notice-spin 0.8s linear infinite;
}

@keyframes teacher-notice-spin {
  to { transform: rotate(360deg); }
}

.teacher-notice-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem 0;
}

.teacher-notice-tab {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #6b7280);
  background: var(--md-sys-color-surface-container-low, rgba(148, 163, 184, 0.12));
}

.teacher-notice-tab--active {
  color: var(--md-sys-color-on-primary-container, #312e81);
  background: color-mix(in srgb, var(--md-sys-color-primary-container, #e0e7ff) 70%, transparent);
}

.teacher-notice-card {
  border-radius: 1.25rem;
  padding: 1.25rem;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border: 1px solid var(--md-sys-color-outline-variant, rgba(148, 163, 184, 0.3));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--md-sys-color-on-surface, #111) 6%, transparent);
}

.teacher-notice-badge {
  flex-shrink: 0;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 600;
  background: var(--md-sys-color-primary-container, #e0e7ff);
  color: var(--md-sys-color-on-primary-container, #312e81);
}

.teacher-notice-source {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-weight: 600;
  background: color-mix(in srgb, var(--md-sys-color-primary-container, #e0e7ff) 70%, transparent);
  color: var(--md-sys-color-on-primary-container, #312e81);
}

.teacher-notice-body {
  margin-top: 1rem;
  font-size: 0.95rem;
  line-height: 1.7;
  word-break: break-word;
}

.teacher-notice-body :deep(a) {
  color: var(--md-sys-color-primary, #6366f1);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

.teacher-notice-body :deep([style*='background']) {
  background: transparent !important;
}

.teacher-notice-mark-read {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 1rem;
  min-height: 2.5rem;
  padding: 0 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--md-sys-color-primary, #6366f1);
}

.teacher-notice-retry {
  margin-top: 0.75rem;
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: var(--md-sys-color-primary, #6366f1);
  color: var(--md-sys-color-on-primary, #fff);
}

.teacher-notice-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  text-align: left;
  border-radius: 1rem;
  padding: 0.875rem 1rem;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border: 1px solid var(--md-sys-color-outline-variant, rgba(148, 163, 184, 0.3));
}

.teacher-notice-item--unread {
  border-color: color-mix(in srgb, var(--md-sys-color-primary, #6366f1) 35%, transparent);
  background: color-mix(
    in srgb,
    var(--md-sys-color-primary-container, #e0e7ff) 24%,
    var(--md-sys-color-surface-container-lowest, #fff)
  );
}

.teacher-notice-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  margin-top: 0.45rem;
  flex-shrink: 0;
}

.teacher-notice-dot--unread {
  background: var(--md-sys-color-primary, #6366f1);
}

.teacher-notice-dot--read {
  background: color-mix(in srgb, var(--md-sys-color-outline, #94a3b8) 70%, transparent);
}
</style>
