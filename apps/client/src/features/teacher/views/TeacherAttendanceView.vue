<script setup lang="ts">
// 教师端「学生考勤」视图（goal-21 / T07）。
//
// 数据源：`fetchTeacherAttendance` → 后端 attendance.rs 归一化契约
//   `{ summary, classes[] }`；`weeks[]` 非零值语义后端未验证 → 本页只呈现
//   「录入覆盖率」与「已录入周数」，**绝不臆造出勤率/缺勤判定**。
// 视觉：照抄 stitch 设计包 `_8`（Academic Minimalist Blue），token 见
//   tailwind.config.ts m3Colors 与 dark-mode.css 末段暗色覆盖。
import { computed, onMounted, ref, watch } from 'vue'
import { TCard, TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  ATTENDANCE_WEEK_COUNT,
  classCoveragePercent,
  useTeacherAttendance,
  type TeacherAttendanceClass
} from '../composables/useTeacherAttendance'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  classes,
  summary,
  totalRecordedWeeks,
  hasRecorded,
  coveragePercent,
  isLoading,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  retry
} = useTeacherAttendance({ accountId: () => resolveTeacherAccountId(auth.studentId) })

const hasData = computed(() => classes.value.length > 0)
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

/** 全局录入覆盖率文本；无录入时整段替换为空态说明。 */
const coverageText = computed(() =>
  coveragePercent.value === null ? '' : coveragePercent.value.toFixed(1)
)

/** 按覆盖率降序（未录入的排尾部，保持原序稳定）。 */
const sortedClasses = computed<TeacherAttendanceClass[]>(() =>
  [...classes.value].sort((a, b) => {
    const ca = classCoveragePercent(a)
    const cb = classCoveragePercent(b)
    if (ca === null && cb === null) return 0
    if (ca === null) return 1
    if (cb === null) return -1
    return cb - ca
  })
)

/** 录入覆盖率文本（未录入 → '—'）。 */
const classCoverageText = (item: TeacherAttendanceClass): string => {
  const percent = classCoveragePercent(item)
  return percent === null ? '—' : `${percent.toFixed(1)}%`
}

/** 覆盖率档位的进度条配色（>95 绿 / 90-95 蓝 / <90 红 / 无数据灰）。 */
const coverageBarClass = (item: TeacherAttendanceClass): string => {
  const percent = classCoveragePercent(item)
  if (percent === null) return 'bg-surface-track'
  if (percent > 95) return 'bg-success'
  if (percent >= 90) return 'bg-primary'
  return 'bg-danger'
}

const coveragePercentTextClass = (item: TeacherAttendanceClass): string => {
  const percent = classCoveragePercent(item)
  if (percent === null) return 'text-on-surface-variant'
  if (percent > 95) return 'text-success'
  if (percent >= 90) return 'text-primary'
  return 'text-danger'
}

const coverageWidth = (item: TeacherAttendanceClass): string => {
  const percent = classCoveragePercent(item)
  return `${percent === null ? 0 : Math.min(100, percent).toFixed(1)}%`
}

/** 热力矩阵行标签：优先课程名，截断到 ~5 字以内由 CSS 控制。 */
const matrixRowLabel = (item: TeacherAttendanceClass): string =>
  item.courseName || item.className || '—'

/** 热力格两态：已录入（非空且非 "0"）= 深；否则 = 浅灰。 */
const weekCellClass = (status: string): string =>
  status !== '' && status !== '0' ? 'bg-primary' : 'bg-surface-muted'

// ── 热力格点击 → 周详情 popover（只陈述「已录入/未录入」，不编到课率）──
interface WeekPopover {
  title: string
  recorded: boolean
}
const popover = ref<WeekPopover | null>(null)
const openWeekPopover = (item: TeacherAttendanceClass, weekIndex: number): void => {
  const status = item.weeks[weekIndex] ?? ''
  popover.value = {
    title: `${item.courseName || item.className} · ${tf('teacher.attendance.weekLabel', { n: weekIndex + 1 })}`,
    recorded: status !== '' && status !== '0'
  }
}
const closeWeekPopover = (): void => { popover.value = null }

// ── 「需要关注」折叠区：后端暂未返回学生级数据 → 恒为空态，不伪造 ──
const riskOpen = ref(false)
const toggleRisk = (): void => { riskOpen.value = !riskOpen.value }

const heroSubtitle = computed(() =>
  tf('teacher.attendance.hero.sub', {
    classes: summary.value?.classCount ?? 0,
    weeks: totalRecordedWeeks.value
  })
)
const classCountText = computed(() =>
  tf('teacher.attendance.chip.classes', { n: summary.value?.classCount ?? 0 })
)
const studentTotalText = computed(() =>
  tf('teacher.attendance.chip.students', { n: summary.value?.studentTotal ?? 0 })
)
const weekColumns = Array.from({ length: ATTENDANCE_WEEK_COUNT }, (_, i) => i + 1)

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-attendance">
    <TPageHeader :title="t('teacher.attendance.title')" icon="fact_check" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-semester" @toggle="onSemesterToggle">
          <summary class="tch-semester-pill" :title="t('teacher.attendance.semester.label')">
            <span class="tch-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-semester-option">
              <input type="radio" name="tch-attendance-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.attendance.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.attendance.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.attendance.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="!hasData" :message="t('teacher.attendance.empty')" />

      <template v-else>
        <!-- KPI 卡：本学期考勤录入概况 -->
        <section class="tch-a-card p-4 flex flex-col gap-3" aria-live="polite">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full" :class="hasRecorded ? 'bg-success' : 'bg-surface-track'"></span>
            <span class="text-xs font-semibold text-on-surface-variant">{{ semester }}</span>
          </div>
          <div class="flex items-end justify-between">
            <div class="min-w-0">
              <p class="tch-label-caption text-on-surface-variant">{{ t('teacher.attendance.hero.title') }}</p>
              <div class="flex items-baseline gap-1 mt-1">
                <span class="tch-kpi" :class="hasRecorded ? 'text-primary' : 'text-on-surface-variant'">
                  {{ hasRecorded ? coverageText : '—' }}
                </span>
                <span v-if="hasRecorded" class="text-base font-bold text-primary">%</span>
              </div>
              <p class="tch-label-caption text-on-surface-variant mt-1">
                {{ hasRecorded ? heroSubtitle : t('teacher.attendance.hero.empty') }}
              </p>
            </div>
            <!-- 圆环进度（覆盖率） -->
            <div class="relative w-14 h-14 shrink-0" role="img"
              :aria-label="hasRecorded ? `${coverageText}%` : t('teacher.attendance.hero.empty')">
              <svg class="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle class="tch-ring-track" cx="28" cy="28" fill="none" r="23" stroke-width="4"></circle>
                <circle v-if="hasRecorded" class="text-primary tch-ring-arc" cx="28" cy="28" fill="none" r="23"
                  stroke="currentColor" stroke-dasharray="144.5" stroke-linecap="round" stroke-width="4"
                  :stroke-dashoffset="144.5 * (1 - Math.min(100, coveragePercent ?? 0) / 100)"></circle>
              </svg>
              <span class="absolute inset-0 flex items-center justify-center material-symbols-outlined text-[18px]"
                :class="hasRecorded ? 'text-primary' : 'text-outline'" aria-hidden="true">fact_check</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center gap-2 bg-surface-canvas rounded-lg px-2.5 py-2">
              <span class="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center text-primary">
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">groups</span>
              </span>
              <div class="min-w-0">
                <span class="tch-label-micro text-outline block">{{ t('teacher.attendance.chip.classes.label') }}</span>
                <span class="text-sm font-bold text-on-surface truncate block">{{ classCountText }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 bg-surface-canvas rounded-lg px-2.5 py-2">
              <span class="w-7 h-7 rounded-full bg-success-soft flex items-center justify-center text-success">
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">groups</span>
              </span>
              <div class="min-w-0">
                <span class="tch-label-micro text-outline block">{{ t('teacher.attendance.chip.students.label') }}</span>
                <span class="text-sm font-bold text-on-surface truncate block">{{ studentTotalText }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 班级录入进度 -->
        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.attendance.classes.title') }}</h2>
            <span class="tch-label-caption text-on-surface-variant">{{ t('teacher.attendance.classes.sorted') }}</span>
          </div>
          <TCard v-for="item in sortedClasses" :key="item.key" compact>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="coverageBarClass(item)"></span>
                <span class="text-sm font-bold text-on-surface truncate">{{ item.courseName || item.className }}</span>
              </div>
              <span class="text-sm font-bold shrink-0" :class="coveragePercentTextClass(item)">
                {{ classCoverageText(item) }}
              </span>
            </div>
            <div class="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden mt-2">
              <div class="h-full rounded-full transition-all duration-700 ease-out tch-progress-fill"
                :class="coverageBarClass(item)" :style="{ width: coverageWidth(item) }"></div>
            </div>
            <div class="flex items-center justify-between tch-label-caption text-on-surface-variant pt-1.5">
              <span>{{ tf('teacher.attendance.class.students', { n: item.studentCount ?? '—' }) }}</span>
              <span>{{ tf('teacher.attendance.class.weeks', { n: item.recordedWeeks }) }}</span>
            </div>
          </TCard>
        </section>

        <!-- 点名热力矩阵：20 周 × 班级，两态渲染 -->
        <section class="tch-a-card p-4">
          <div class="flex items-center justify-between">
            <div class="min-w-0">
              <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.attendance.heatmap.title') }}</h2>
              <p class="tch-label-caption text-on-surface-variant mt-0.5">{{ t('teacher.attendance.heatmap.hint') }}</p>
            </div>
            <span class="shrink-0 px-2 py-1 rounded-full bg-surface-canvas tch-label-micro text-on-surface-variant">
              {{ tf('teacher.attendance.heatmap.range', { n: weekColumns.length }) }}
            </span>
          </div>
          <div class="tch-matrix-legend flex items-center gap-1.5 mt-2">
            <span class="w-2 h-2 rounded-sm bg-primary"></span>
            <span class="tch-label-micro text-on-surface-variant">{{ t('teacher.attendance.heatmap.recorded') }}</span>
            <span class="w-2 h-2 rounded-sm bg-surface-muted border border-surface-track"></span>
            <span class="tch-label-micro text-on-surface-variant">{{ t('teacher.attendance.heatmap.unrecorded') }}</span>
          </div>
          <div class="overflow-x-auto mt-2 -mx-4 px-4 pb-1">
            <div class="min-w-[360px] flex flex-col gap-1.5">
              <!-- 周次表头 -->
              <div class="grid tch-matrix-grid items-center">
                <div></div>
                <div v-for="week in weekColumns" :key="week"
                  class="text-center tch-label-micro text-outline">{{ week }}</div>
              </div>
              <!-- 每班一行 -->
              <div v-for="item in classes" :key="item.key" class="grid tch-matrix-grid items-center">
                <div class="tch-label-micro font-bold text-on-surface-variant truncate pr-1"
                  :title="item.courseName || item.className">{{ matrixRowLabel(item) }}</div>
                <button v-for="(status, weekIndex) in item.weeks" :key="weekIndex" type="button"
                  class="tch-heat-cell" :class="weekCellClass(status)"
                  :aria-label="`${matrixRowLabel(item)} ${tf('teacher.attendance.weekLabel', { n: weekIndex + 1 })}`"
                  @click="openWeekPopover(item, weekIndex)"></button>
              </div>
            </div>
          </div>
          <!-- 周详情 popover：只陈述录入与否 -->
          <div v-if="popover" class="tch-popover mt-2 rounded-lg p-2.5 bg-surface-canvas flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="popover.recorded ? 'bg-success' : 'bg-surface-track'"></span>
              <div class="min-w-0">
                <span class="text-sm font-bold text-on-surface block leading-tight truncate">{{ popover.title }}</span>
                <span class="tch-label-caption text-on-surface-variant block mt-0.5">
                  {{ popover.recorded ? t('teacher.attendance.heatmap.popover.recorded') : t('teacher.attendance.heatmap.popover.unrecorded') }}
                </span>
              </div>
            </div>
            <button type="button" class="w-6 h-6 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant"
              :aria-label="t('teacher.attendance.heatmap.popover.close')" @click="closeWeekPopover">
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        </section>

        <!-- 需要关注：后端无学生级数据 → 空态说明 -->
        <section class="tch-a-card overflow-hidden">
          <button type="button" class="w-full p-4 flex items-center justify-between active:bg-surface-canvas transition-colors"
            :aria-expanded="riskOpen" @click="toggleRisk">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-3 h-3 rounded-full bg-course-amber shrink-0"></span>
              <span class="text-sm font-bold text-on-surface truncate">{{ t('teacher.attendance.risk.title') }}</span>
              <span class="px-2 py-0.5 rounded-full bg-surface-muted text-on-surface-variant tch-label-caption font-bold">—</span>
            </div>
            <div class="flex items-center gap-1 text-on-surface-variant shrink-0">
              <span class="tch-label-caption">{{ riskOpen ? t('teacher.attendance.risk.collapse') : t('teacher.attendance.risk.expand') }}</span>
              <span class="material-symbols-outlined text-[18px] transition-transform duration-300"
                :class="{ 'rotate-180': riskOpen }">expand_more</span>
            </div>
          </button>
          <div class="tch-collapse" :class="{ 'tch-collapse--open': riskOpen }">
            <div class="p-4 pt-1 bg-surface-canvas">
              <p class="tch-label-caption text-outline">{{ t('teacher.attendance.risk.hint') }}</p>
              <div class="mt-2 flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-lowest tch-empty-note">
                <span class="material-symbols-outlined text-[18px] text-outline" aria-hidden="true">person_search</span>
                <span class="text-sm text-on-surface-variant">{{ t('teacher.attendance.risk.empty') }}</span>
              </div>
            </div>
          </div>
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

<style src="../../../styles/views/TeacherAttendance.scoped.css" scoped></style>
