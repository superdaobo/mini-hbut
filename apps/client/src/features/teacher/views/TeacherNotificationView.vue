<script setup lang="ts">
// TeacherNotificationView（E3 #1023）：教师通知只读视图。
//
// 安全约束：
//   - **只读**：教务通知复用既有 `school_inbox_fetch`（portal 只读链路）；
//   - **已读仅本地**：标记已读只写教师作用域本地存储，绝不 POST updateState；
//   - **无伪数据**：数据源未具备的标签（待办 / 监考）不出现；
//     本轮仅「教务通知」+「教学提醒」；教学提醒无快照时显示空态。
//   - HTML 正文经 `buildSchoolInboxDetailHtml` 白名单清洗，无 XSS。

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TCard, TPageHeader, TEmptyState, TModal } from '../../../components/templates'
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs'
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
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

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
  lastSuccessfulSyncAt,
  syncStatus,
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

/** 同步栏错误文案 key（更新失败时展示具体错误，而非泛化「可能过期」）。 */
const syncErrorKey = computed(() =>
  error.value ? TEACHER_ERROR_I18N_KEY[error.value.kind] || 'teacher.error.unknown' : ''
)

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

/** 页面进入：缓存优先（先渲染本账号快照，再按 TTL 后台再验证）。 */
const loadInitial = async (): Promise<void> => {
  await Promise.all([loadNotices(), loadReminders()])
}

/** 手动刷新：绕过 TTL（仍走 teacherApi 层单飞去重）。 */
const refresh = async (): Promise<void> => {
  await Promise.all([loadNotices({ force: true }), loadReminders()])
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

const closeDetailOnEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && (selectedNotice.value || selectedReminder.value)) closeDetail()
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
  window.addEventListener('keydown', closeDetailOnEscape)
  void loadInitial()
})
onBeforeUnmount(() => window.removeEventListener('keydown', closeDetailOnEscape))
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface max-w-[448px] mx-auto pb-24">
    <TPageHeader :title="tLocale('teacher.notification.title')" icon="mail" @back="handleBack">
      <template #actions>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="tLocale('notify.inbox.refreshList')" :disabled="loading || remindersLoading" @click="refresh">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': loading || remindersLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="p-4 space-y-4">
      <Tabs v-model="activeTab">
        <TabsList class="w-full rounded-2xl bg-surface-container-high p-1" :aria-label="tLocale('teacher.notification.title')">
          <TabsTrigger v-for="tab in tabs" :key="tab.id" :value="tab.id" class="flex-1 rounded-xl">
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div v-if="!desktopOnly && !error && academicNotices.length" class="px-3 py-2 text-xs text-on-surface-variant rounded-xl bg-surface-container-low">
        {{ tLocale('notify.inbox.unread') }}：{{ unreadCount }} / {{ academicNotices.length }}
      </div>

      <TEmptyState v-if="desktopOnly" :message="tLocale('notify.inbox.desktopOnlyFull')" />
      <TEmptyState v-else-if="loading && !academicNotices.length" type="loading"
        :message="tLocale('notify.inbox.loadingList')" />
      <TEmptyState v-else-if="error && !academicNotices.length" type="error" :message="errorMessage">
        <button type="button" class="mt-3 text-primary font-semibold" @click="refresh">
          {{ tLocale('notify.inbox.retry') }}
        </button>
      </TEmptyState>

      <template v-else>
        <section v-if="showNotices" class="space-y-2">
          <TEmptyState v-if="!academicNotices.length && activeTab === 'academic'"
            :message="tLocale('teacher.notification.empty')" />
          <ul v-else class="space-y-2">
            <li v-for="item in academicNotices" :key="item.id">
              <TCard compact hoverable>
                <button type="button" class="w-full text-left flex items-center gap-3 min-w-0"
                  @click="openNotice(item)">
                  <span class="rounded-full w-2 h-2 shrink-0"
                    :class="item.isRead || isLocallyRead(item.id) ? 'bg-outline/40' : 'bg-primary'" aria-hidden="true" />
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-bold text-on-surface break-words">
                      {{ item.title || tLocale('notify.inbox.untitled') }}
                    </span>
                    <span v-if="item.summary" class="block text-xs mt-1 text-on-surface-variant line-clamp-2">
                      {{ item.summary }}
                    </span>
                    <span class="block text-xs mt-2 text-on-surface-variant">
                      {{ sourceLabel(item) }} · {{ formatItemTime(item.createdAt) }}
                    </span>
                  </span>
                  <span class="material-symbols-outlined text-on-surface-variant text-lg" aria-hidden="true">chevron_right</span>
                </button>
              </TCard>
            </li>
          </ul>
        </section>

        <section v-if="showReminders" class="space-y-2">
          <TEmptyState v-if="!reminders.length && !remindersLoading && activeTab === 'teaching'"
            :message="tLocale('teacher.notification.teachingReminderEmpty')" />
          <ul v-else class="space-y-2">
            <li v-for="event in reminders" :key="event.id">
              <TCard compact hoverable>
                <button type="button" class="w-full text-left flex items-center gap-3 min-w-0"
                  @click="openReminder(event)">
                  <span class="material-symbols-outlined text-primary">notifications_active</span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-bold text-on-surface">{{ event.title }}</span>
                    <span class="block mt-2 text-xs text-on-surface-variant">{{ reminderTime(event) }}</span>
                  </span>
                  <span class="material-symbols-outlined text-on-surface-variant text-lg" aria-hidden="true">chevron_right</span>
                </button>
              </TCard>
            </li>
          </ul>
        </section>
      </template>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="syncErrorKey"
      />
    </main>

    <TModal :visible="Boolean(selectedNotice || selectedReminder)" :title="detailTitle" width="480px" @close="closeDetail">
      <article v-if="selectedNotice" class="space-y-3">
        <h2 class="text-base font-bold text-on-surface break-words">
          {{ selectedNotice.title || tLocale('notify.inbox.untitled') }}
        </h2>
        <p class="text-xs text-on-surface-variant">
          {{ sourceLabel(selectedNotice) }} · {{ formatItemTime(selectedNotice.createdAt) }}
        </p>
        <div class="teacher-notice-html text-sm text-on-surface leading-relaxed break-words"
          @click="handleDetailClick" v-html="detailHtml" />
        <button v-if="!selectedIsRead" type="button"
          class="rounded-xl px-3 py-2 text-sm font-semibold bg-surface-container-low text-on-surface"
          @click="markSelectedAsRead">
          {{ tLocale('notify.inbox.markRead') }}
        </button>
        <p class="text-xs text-on-surface-variant">{{ tLocale('notify.inbox.teacherLocalOnly') }}</p>
        <p v-if="markHint" class="text-xs text-on-surface-variant">{{ markHint }}</p>
      </article>
      <article v-else-if="selectedReminder" class="space-y-3">
        <h2 class="text-base font-bold text-on-surface">{{ selectedReminder.title }}</h2>
        <p class="text-xs text-on-surface-variant">{{ reminderTime(selectedReminder) }}</p>
        <p class="text-sm text-on-surface whitespace-pre-wrap">{{ selectedReminder.body }}</p>
      </article>
    </TModal>
  </div>
</template>

<style scoped>
.teacher-notice-html :deep(img),
.teacher-notice-html :deep(table) {
  max-width: 100%;
}
.teacher-notice-html :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
</style>
