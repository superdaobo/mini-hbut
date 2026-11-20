<script setup lang="ts">
// 教师端「工作量」视图（goal-21 / T07）。
//
// 数据源：`fetchTeacherWorkload` → `/twork` 微服务 `{ available, raw }`。
// 实测本学期 5 个字段全为 null（学校未生成）：
//   - `available:false` 或字段为 null → 一律显示「—」，**绝不显示 0**；
//   - `jsRzGzlList` 为 null → 周分布走空态，**绝不画假柱状图**。
import { computed, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherWorkload,
  workloadValueText,
  type WorkloadWeeklyValue
} from '../composables/useTeacherWorkload'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  fields,
  isAvailable,
  weeklyValues,
  isLoading,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  retry
} = useTeacherWorkload({ accountId: () => resolveTeacherAccountId(auth.studentId) })

/** 是否已有可展示数据（缓存或上次成功）；有数据时即使刷新失败也继续显示。 */
const hasData = computed(() => isAvailable.value || lastSuccessfulSyncAt.value !== '')
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

/** 主数字：数据不可用 → '—'（不是 0）。 */
const heroNumber = computed(() =>
  isAvailable.value ? workloadValueText(fields.value.gzlSum) : '—'
)
const heroSubtitle = computed(() =>
  isAvailable.value
    ? t('teacher.workload.hero.sub')
    : t('teacher.workload.hero.unavailable')
)

/** 明细行：四项与总计；任何 null → '—'。 */
const detailRows = computed(() => [
  { key: 'base', label: t('teacher.workload.detail.base'), value: isAvailable.value ? workloadValueText(fields.value.baseGzlSum) : '—' },
  { key: 'role', label: t('teacher.workload.detail.role'), value: isAvailable.value ? workloadValueText(fields.value.jsRzGzlSum) : '—' },
  { key: 'extra', label: t('teacher.workload.detail.extra'), value: isAvailable.value ? workloadValueText(fields.value.edGzlSum) : '—' },
  { key: 'total', label: t('teacher.workload.detail.total'), value: isAvailable.value ? workloadValueText(fields.value.gzlSum) : '—' }
])

/** 周分布柱：高度按最大值归一（最小 8%，null 为占位浅列）。 */
const weeklyMax = computed(() => {
  const list = weeklyValues.value
  if (!list) return 0
  return Math.max(0, ...list.map((value) => value ?? 0))
})
const weeklyBarHeight = (value: WorkloadWeeklyValue): string => {
  if (value === null || !Number.isFinite(value) || weeklyMax.value <= 0) return '8%'
  const percent = Math.max(8, Math.min(100, (value / weeklyMax.value) * 100))
  return `${percent.toFixed(1)}%`
}
const weeklyBarClass = (value: WorkloadWeeklyValue): string =>
  value === null ? 'bg-surface-track' : 'bg-primary'

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-workload">
    <TPageHeader :title="t('teacher.workload.title')" icon="work" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-semester" @toggle="onSemesterToggle">
          <summary class="tch-semester-pill" :title="t('teacher.workload.semester.label')">
            <span class="tch-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-semester-option">
              <input type="radio" name="tch-workload-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.workload.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.workload.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.workload.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="!hasData" :message="t('teacher.workload.empty')" />

      <template v-else>
        <!-- KPI 卡：本学期工作量 -->
        <section class="tch-w-card p-4" aria-live="polite">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full" :class="isAvailable ? 'bg-success' : 'bg-surface-track'"></span>
            <span class="text-xs font-semibold text-on-surface-variant">{{ semester }}</span>
          </div>
          <div class="mt-2">
            <p class="tch-label-caption text-on-surface-variant">{{ t('teacher.workload.hero.title') }}</p>
            <div class="flex items-baseline gap-1.5 mt-1">
              <span class="tch-kpi" :class="isAvailable ? 'text-primary' : 'text-on-surface-variant'">{{ heroNumber }}</span>
              <span v-if="isAvailable" class="text-base font-bold text-primary">
                {{ t('teacher.workload.hero.unit') }}
              </span>
            </div>
            <p class="tch-label-caption text-on-surface-variant mt-1">{{ heroSubtitle }}</p>
          </div>
          <!-- 三组构成胶囊：不可用或 null 一律 '—' -->
          <div class="grid grid-cols-3 gap-2 mt-3">
            <div class="bg-surface-canvas rounded-lg px-2 py-2 text-center">
              <span class="tch-label-micro text-outline block">{{ t('teacher.workload.detail.base') }}</span>
              <span class="text-sm font-bold block mt-0.5" :class="isAvailable && fields.baseGzlSum !== null ? 'text-on-surface' : 'text-on-surface-variant'">
                {{ isAvailable ? workloadValueText(fields.baseGzlSum) : '—' }}
              </span>
            </div>
            <div class="bg-surface-canvas rounded-lg px-2 py-2 text-center">
              <span class="tch-label-micro text-outline block">{{ t('teacher.workload.detail.role') }}</span>
              <span class="text-sm font-bold block mt-0.5" :class="isAvailable && fields.jsRzGzlSum !== null ? 'text-on-surface' : 'text-on-surface-variant'">
                {{ isAvailable ? workloadValueText(fields.jsRzGzlSum) : '—' }}
              </span>
            </div>
            <div class="bg-surface-canvas rounded-lg px-2 py-2 text-center">
              <span class="tch-label-micro text-outline block">{{ t('teacher.workload.detail.extra') }}</span>
              <span class="text-sm font-bold block mt-0.5" :class="isAvailable && fields.edGzlSum !== null ? 'text-on-surface' : 'text-on-surface-variant'">
                {{ isAvailable ? workloadValueText(fields.edGzlSum) : '—' }}
              </span>
            </div>
          </div>
        </section>

        <!-- 每周课时分布：无真实周数据 → 空态，绝不画假柱 -->
        <section class="tch-w-card p-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.workload.chart.title') }}</h2>
            <span v-if="weeklyValues" class="tch-label-micro text-on-surface-variant shrink-0">
              {{ tf('teacher.workload.chart.weeks', { n: weeklyValues.length }) }}
            </span>
          </div>
          <div v-if="weeklyValues" class="mt-3" role="img" :aria-label="t('teacher.workload.chart.title')">
            <div class="tch-bars flex items-end gap-1.5">
              <div v-for="(value, index) in weeklyValues" :key="index" class="flex-1 h-full flex items-end">
                <div class="tch-bar w-full" :class="weeklyBarClass(value)"
                  :style="{ height: weeklyBarHeight(value) }"
                  :title="value === null ? '—' : String(value)"></div>
              </div>
            </div>
            <div class="flex gap-1.5 mt-1">
              <span v-for="(_, index) in weeklyValues" :key="index"
                class="flex-1 text-center tch-label-micro text-outline">{{ index + 1 }}</span>
            </div>
          </div>
          <div v-else class="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-surface-canvas tch-empty-note">
            <span class="material-symbols-outlined text-[18px] text-outline" aria-hidden="true">bar_chart</span>
            <span class="text-sm text-on-surface-variant">{{ t('teacher.workload.chart.empty') }}</span>
          </div>
        </section>

        <!-- 明细 -->
        <section class="tch-w-card p-4">
          <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.workload.detail.title') }}</h2>
          <p class="tch-label-caption text-on-surface-variant mt-0.5">{{ t('teacher.workload.detail.source') }}</p>
          <ul class="mt-2 divide-y divide-surface-muted">
            <li v-for="row in detailRows" :key="row.key" class="flex items-center justify-between py-2.5">
              <span class="text-sm text-on-surface-variant">{{ row.label }}</span>
              <span class="text-sm font-bold" :class="row.value === '—' ? 'text-on-surface-variant' : 'text-on-surface'">{{ row.value }}</span>
            </li>
          </ul>
        </section>
      </template>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="isError ? errorKey : ''"
      />
    </main>
  </div>
</template>

<style src="../../../styles/views/TeacherWorkload.scoped.css" scoped></style>
