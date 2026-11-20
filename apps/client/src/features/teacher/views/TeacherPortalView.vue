<script setup lang="ts">
// 教师端「融合门户 · 办事大厅」视图（goal-21 / T11）。
//
// 数据源：`fetchTeacherPortalCards` → `{ cards[] }`（cardWid/cardId/cardName/
//   cardType/markNumber）。
// 诚实约束：
//   - 卡片只渲染后端给的；空 cards → 空态，**不硬编码** 8 张已知卡；
//   - 门户整体失败（网关会话失效）→ 整页错误态「门户暂不可用」，不空白不崩溃；
//   - `markNumber` 为 null/0 → 不显示角标（不伪造数字）。
// 视觉：照抄 stitch 设计包 `_1`（Service Portal）：搜索胶囊 + 任务卡 + 服务宫格；
//   token 见 tailwind.config.ts m3Colors；自定义类见 TeacherPortal.scoped.css。
import { computed, onMounted, ref } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  portalBadgeText,
  portalBadgeVisible,
  useTeacherPortalCards,
  type PortalTaskKind,
  type TeacherPortalCard
} from '../composables/useTeacherPortalCards'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  taskCards,
  serviceCards,
  isLoading,
  isReady,
  isError,
  errorKind,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  retry
} = useTeacherPortalCards({
  accountId: () => resolveTeacherAccountId(auth.studentId)
})

const hasCards = computed(() => taskCards.value.length + serviceCards.value.length > 0)
const hasTaskCards = computed(() => taskCards.value.length > 0)
const hasServiceCards = computed(() => serviceCards.value.length > 0)

// ── 本地搜索（按 cardName/cardId 过滤；不发起网络请求）──────────────

const keyword = ref('')
const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())

const matchesKeyword = (card: TeacherPortalCard): boolean => {
  if (!normalizedKeyword.value) return true
  const haystack = `${card.cardName} ${card.cardId}`.toLowerCase()
  return haystack.includes(normalizedKeyword.value)
}

const filteredTaskCards = computed<TeacherPortalCard[]>(() =>
  taskCards.value.filter(matchesKeyword)
)
const filteredServiceCards = computed<TeacherPortalCard[]>(() =>
  serviceCards.value.filter(matchesKeyword)
)
const noSearchResult = computed(
  () =>
    normalizedKeyword.value !== '' &&
    filteredTaskCards.value.length === 0 &&
    filteredServiceCards.value.length === 0
)

const clearKeyword = (): void => { keyword.value = '' }

// ── 任务卡 / 服务卡展示文案与图形 ──────────────────────────────────

/** 任务卡名称兜底（cardName 缺失时按 cardId 语义命名）。 */
const taskFallbackKey = (kind: PortalTaskKind): string =>
  `teacher.portal.task.${kind}`

const taskName = (card: TeacherPortalCard): string =>
  card.cardName || (card.taskKind ? t(taskFallbackKey(card.taskKind)) : card.cardId || '—')

const TASK_ICONS: Record<PortalTaskKind, string> = {
  todo: 'pending_actions',
  done: 'task_alt',
  mine: 'schedule_send',
  copy: 'mark_email_unread'
}

const taskIcon = (card: TeacherPortalCard): string =>
  (card.taskKind && TASK_ICONS[card.taskKind]) || 'inbox'

/** 任务卡主数字：markNumber 缺失显示 `—`（角标另有徽标，不重复显示）。 */
const taskNumber = (card: TeacherPortalCard): string =>
  card.markNumber === null ? '—' : String(card.markNumber)

/** 服务块图形：按 cardId 语义映射，未知服务按索引循环课程色（确定性）。 */
const SERVICE_ICON_MAP: ReadonlyArray<{ test: RegExp; icon: string }> = [
  { test: /ALLSERVICEBUS|ALLSERVICE/i, icon: 'apps' },
  { test: /HOTAPP|RECOMMEND/i, icon: 'local_fire_department' },
  { test: /FAVORITE|FAVOURITE/i, icon: 'bookmark' },
  { test: /MYAPP/i, icon: 'widgets' },
  { test: /NOTICE|NOTIFY|NEWS/i, icon: 'campaign' },
  { test: /TASK|FLOW|APPROVE/i, icon: 'assignment' },
  { test: /OA|OFFICE/i, icon: 'corporate_fare' },
  { test: /MAIL|MSG/i, icon: 'mail' },
  { test: /CALENDAR|SCHEDULE/i, icon: 'event' },
  { test: /SEARCH|QUERY/i, icon: 'search' }
]

const SERVICE_TILE_COLORS = [
  'bg-primary',
  'bg-course-teal',
  'bg-course-lake-blue',
  'bg-course-wisteria',
  'bg-course-amber'
] as const

const serviceIcon = (card: TeacherPortalCard): string => {
  const hit = SERVICE_ICON_MAP.find((item) => item.test.test(card.cardId))
  return hit?.icon ?? 'widgets'
}

const serviceTileColor = (index: number): string =>
  SERVICE_TILE_COLORS[index % SERVICE_TILE_COLORS.length]

const serviceName = (card: TeacherPortalCard): string =>
  card.cardName || card.cardId || '—'

/** 错误副文：会话类错误给「重新登录后可查看」；其它错误给通用错误词。 */
const portalErrorDescKey = computed(() => {
  const kind = errorKind.value
  return kind === 'expired' || kind === 'unauthorized'
    ? 'teacher.portal.error.sessionHint'
    : errorKey.value
})

const reload = async (): Promise<void> => { await retry() }

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-pt">
    <TPageHeader :title="t('teacher.portal.title')" icon="dashboard" @back="emit('back')">
      <template #actions>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.portal.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasCards" type="loading" :message="t('teacher.portal.loading')" />

      <!-- 门户整体失败（网关会话可能已失效）：整页错误态，不空白不崩溃 -->
      <TEmptyState v-else-if="isError && !hasCards" type="error" :message="t('teacher.portal.error.title')">
        <p class="mt-1.5 text-xs text-on-surface-variant">{{ t(portalErrorDescKey) }}</p>
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.portal.action.retry') }}
        </button>
      </TEmptyState>

      <TEmptyState v-else-if="!hasCards" :message="t('teacher.portal.empty')" />

      <template v-else>
        <!-- 搜索服务：圆角胶囊，本地过滤卡片 -->
        <section class="tch-pt-search">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0" aria-hidden="true">search</span>
          <input v-model="keyword" type="search" class="tch-pt-search-input"
            :placeholder="t('teacher.portal.search.placeholder')"
            :aria-label="t('teacher.portal.search.placeholder')" />
          <button v-if="keyword" type="button" class="w-6 h-6 rounded-full flex items-center justify-center text-outline shrink-0"
            :aria-label="t('teacher.portal.search.clear')" @click="clearKeyword">
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
          </button>
        </section>

        <!-- 无匹配结果 -->
        <TEmptyState v-if="noSearchResult" :message="t('teacher.portal.search.empty')" />

        <!-- 任务卡：待办 / 已办 / 我的 / 抄送（按 cardId 前缀归类，只渲染后端给的） -->
        <section v-if="filteredTaskCards.length > 0" class="grid grid-cols-4 gap-2.5">
          <div v-for="card in filteredTaskCards" :key="card.key" class="tch-pt-task">
            <div v-if="portalBadgeVisible(card)" class="tch-pt-badge" aria-hidden="true">
              {{ portalBadgeText(card) }}
            </div>
            <span class="w-7 h-7 rounded-full flex items-center justify-center mb-1"
              :class="portalBadgeVisible(card) ? 'bg-surface-highlight text-primary' : 'bg-surface-muted text-on-surface-variant'">
              <span class="material-symbols-outlined text-[16px]" aria-hidden="true">{{ taskIcon(card) }}</span>
            </span>
            <span class="tch-pt-task-num" :class="portalBadgeVisible(card) ? 'text-course-amber' : 'text-on-surface'">
              {{ taskNumber(card) }}
            </span>
            <span class="tch-label-caption text-on-surface-variant mt-0.5 text-center leading-tight">
              {{ taskName(card) }}
            </span>
          </div>
        </section>

        <!-- 全部服务：48px 实色块 + 白图标宫格 -->
        <section v-if="filteredServiceCards.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center gap-1.5 px-1 pt-1">
            <span class="w-1.5 h-3.5 rounded-full bg-primary"></span>
            <h2 class="text-sm font-bold text-on-surface tracking-tight">{{ t('teacher.portal.services.title') }}</h2>
            <span class="tch-label-caption text-on-surface-variant bg-surface-muted px-2 py-0.5 rounded-full">
              {{ tf('teacher.portal.services.count', { n: filteredServiceCards.length }) }}
            </span>
          </div>
          <div class="grid grid-cols-4 gap-2.5">
            <div v-for="(card, index) in filteredServiceCards" :key="card.key" class="tch-pt-service">
              <div v-if="portalBadgeVisible(card)" class="tch-pt-badge" aria-hidden="true">
                {{ portalBadgeText(card) }}
              </div>
              <span class="w-12 h-12 rounded-2xl flex items-center justify-center text-on-primary mb-2 tch-pt-service-tile"
                :class="serviceTileColor(index)">
                <span class="material-symbols-outlined text-[24px]" aria-hidden="true">{{ serviceIcon(card) }}</span>
              </span>
              <span class="tch-label-caption text-on-surface text-center font-semibold leading-tight line-clamp-1"
                :title="serviceName(card)">{{ serviceName(card) }}</span>
            </div>
          </div>
        </section>

        <!-- 有任务卡但无服务卡时给出诚实提示（不虚构分类） -->
        <p v-if="isReady && hasTaskCards && !hasServiceCards && !normalizedKeyword"
          class="tch-label-caption text-on-surface-variant px-1">
          {{ t('teacher.portal.services.empty') }}
        </p>
      </template>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="isError ? errorKey : ''"
      />
    </main>
  </div>
</template>

<style src="../../../styles/views/TeacherPortal.scoped.css" scoped></style>
