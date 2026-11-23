<script setup lang="ts">
// 教师端「考试事务」视图（goal-21 / T08）：缓考任务 / 剩余试卷 / 待评教。
//
// 数据源：`fetchTeacherExamAffairs` → `{ deferred, remainingPapers, evalInfo,
//   allEmpty }`（教务 jqGrid 原始记录，后端已剔除身份字段）。
// 关键约束：**allEmpty=true 时只显示「本学期暂无相关事项」一句话**，
//   绝不堆三个空列表（15-teacher-ui-spec §九 / DESIGN.md §Empty States）。
// 行字段按 recon queryFields 候选链提取，取不到的列不渲染（不臆造字段）。
import { computed, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherExamAffairs,
  type ExamAffairRow
} from '../composables/useTeacherExamAffairs'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  data,
  counts,
  deferred,
  remainingPapers,
  evalInfo,
  allEmpty,
  isLoading,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  retry
} = useTeacherExamAffairs({ accountId: () => resolveTeacherAccountId(auth.studentId) })

const hasData = computed(() => data.value !== null)
const semesterDraft = ref(semester.value)
watch(semester, (value) => { semesterDraft.value = value })
const semesters = computed(() => teacherSemesterOptions(semesterDraft.value))

/** 页头学期胶囊（<details> 原生展开/收起，不占主内容位）。 */
const semesterDetails = ref<HTMLElement | null>(null)
const semesterMenuOpen = ref(false)
const onSemesterToggle = (): void => {
  semesterMenuOpen.value = (semesterDetails.value as HTMLDetailsElement | null)?.open === true
}
const closeSemesterMenu = (): void => {
  if (semesterDetails.value) (semesterDetails.value as HTMLDetailsElement).open = false
  semesterMenuOpen.value = false
}
const applySemester = async (): Promise<void> => {
  closeSemesterMenu()
  if (semesterDraft.value === semester.value) return
  await setSemester(semesterDraft.value)
}
const reload = async (): Promise<void> => { await retry() }

/** 三宫格统计：首项高亮 primary，其余 on-surface（照抄设计包视觉层级）。 */
const stats = computed(() => [
  { key: 'deferred', label: t('teacher.examAffairs.stat.deferred'), value: counts.value.deferred, primary: true },
  { key: 'papers', label: t('teacher.examAffairs.stat.papers'), value: counts.value.papers, primary: false },
  { key: 'eval', label: t('teacher.examAffairs.stat.eval'), value: counts.value.eval, primary: false }
])

/** 三段区块；只保留有数据的段（allEmpty 时为空数组 → 整段不渲染）。 */
const visibleSections = computed(() => [
  { key: 'deferred', icon: 'event_busy', title: t('teacher.examAffairs.section.deferred'), rows: deferred.value },
  { key: 'papers', icon: 'inventory_2', title: t('teacher.examAffairs.section.papers'), rows: remainingPapers.value },
  { key: 'eval', icon: 'hotel_class', title: t('teacher.examAffairs.section.eval'), rows: evalInfo.value }
].filter((section) => section.rows.length > 0))

const rowTitle = (item: ExamAffairRow): string =>
  item.title || t('teacher.examAffairs.row.fallback')

/** 明细对标签取词（label 字段存的是 i18n key）。 */
const detailLabel = (key: string): string => t(key)

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-ea">
    <TPageHeader :title="t('teacher.examAffairs.title')" icon="task_alt" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-ea-semester" @toggle="onSemesterToggle">
          <summary class="tch-ea-semester-pill" :title="t('teacher.examAffairs.semester.label')">
            <span class="tch-ea-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-ea-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-ea-semester-option">
              <input type="radio" name="tch-exam-affairs-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.examAffairs.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.examAffairs.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.examAffairs.action.retry') }}
        </button>
      </TEmptyState>

      <template v-else-if="hasData">
        <!-- 三宫格统计（设计包 metric-hero 32px/700） -->
        <section class="grid grid-cols-3 gap-2" aria-live="polite">
          <div v-for="stat in stats" :key="stat.key" class="tch-ea-card px-3 py-3.5 text-center">
            <div class="tch-ea-metric" :class="stat.primary ? 'text-primary' : 'text-on-surface'">
              {{ stat.value }}
            </div>
            <div class="tch-ea-label-caption text-outline mt-1 truncate">{{ stat.label }}</div>
          </div>
        </section>

        <!-- allEmpty：只显示一句话，不堆三个空列表 -->
        <p v-if="allEmpty" class="text-center text-[13px] leading-5 text-on-surface-variant py-4">
          {{ t('teacher.examAffairs.allEmpty') }}
        </p>

        <!-- 非空时才渲染对应区块（空的段不展示标题） -->
        <template v-else>
          <section v-for="section in visibleSections" :key="section.key"
            class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5 px-1">
              <span class="material-symbols-outlined text-primary text-[18px]" aria-hidden="true">{{ section.icon }}</span>
              <h2 class="text-sm font-bold text-on-surface">{{ section.title }}</h2>
              <span class="px-2 py-0.5 rounded-full bg-surface-highlight text-primary tch-ea-label-micro font-bold">
                {{ section.rows.length }}
              </span>
            </div>
            <article v-for="item in section.rows" :key="item.key" class="tch-ea-card p-4">
              <div class="flex items-start justify-between gap-2">
                <h3 class="tch-ea-title min-w-0">{{ rowTitle(item) }}</h3>
                <span v-if="item.status" class="tch-ea-chip">{{ item.status }}</span>
              </div>
              <p v-if="item.subtitle" class="tch-ea-meta text-on-surface-variant mt-1 truncate">
                {{ item.subtitle }}
              </p>
              <div v-if="item.details.length > 0" class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                <div v-for="detail in item.details" :key="detail.key" class="min-w-0">
                  <span class="tch-ea-label-micro text-outline block">{{ detailLabel(detail.key) }}</span>
                  <span class="text-[12px] font-medium text-on-surface truncate block mt-0.5">{{ detail.value }}</span>
                </div>
              </div>
            </article>
          </section>
        </template>
      </template>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="isError ? errorKey : ''"
      />
    </main>
  </div>
</template>

<style src="../../../styles/views/TeacherExamAffairs.scoped.css" scoped></style>
