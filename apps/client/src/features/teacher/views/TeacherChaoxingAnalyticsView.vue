<script setup lang="ts">
// 教师端「学习通学情」视图（goal-21 / T11）。
//
// 数据源：`fetchTeacherChaoxingCourses` → `{ courses, channels }`；
//   选中课程后 `fetchTeacherChaoxingAnalytics`（6 维度）+ `fetchTeacherChaoxingMonitor`
//   （studyList 人数）。
// 诚实约束：
//   - 维度字段只实测到 worknum → 全部指标防御式取值，取不到显示 `—`；
//   - **不渲染学生明细/名单**（scoreList 含 userid 等个人标识，本页只消费聚合）；
//   - 学习监控只显示人数，不显示名单。
// 视觉：照抄 stitch 设计包 `_6`（Learning Analytics）+ `_1` 宫格语言，
//   token 见 tailwind.config.ts m3Colors；自定义类见 TeacherChaoxingAnalytics.scoped.css。
import { computed, onMounted, ref } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  chaoxingCourseQueryable,
  chaoxingExamAvgScore,
  chaoxingExamCount,
  chaoxingPvTotal,
  chaoxingScoreAvg,
  chaoxingSignRate,
  chaoxingWeekActive,
  chaoxingWorkPending,
  chaoxingWorkRate,
  chaoxingWorkSubmit,
  chaoxingWorkTotal,
  useTeacherChaoxingAnalytics,
  type TeacherChaoxingCourse
} from '../composables/useTeacherChaoxingAnalytics'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  courses,
  channels,
  selectedCourse,
  selectedCourseKey,
  dimensions,
  monitorCount,
  isCoursesLoading,
  isCoursesError,
  coursesErrorKey,
  isAnalyticsLoading,
  isAnalyticsError,
  analyticsErrorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  selectCourse,
  retry,
  retryAnalytics
} = useTeacherChaoxingAnalytics({
  accountId: () => resolveTeacherAccountId(auth.studentId)
})

const hasCourses = computed(() => courses.value.length > 0)
const hasChannels = computed(() => channels.value.length > 0)
const hasData = computed(() => hasCourses.value || hasChannels.value)

/** 监控折叠区开关（只展示人数与隐私说明，绝不渲染名单）。 */
const monitorOpen = ref(false)
const toggleMonitor = (): void => { monitorOpen.value = !monitorOpen.value }

const onSelectCourse = async (course: TeacherChaoxingCourse): Promise<void> => {
  if (course.key === selectedCourseKey.value) return
  await selectCourse(course)
}

/** 课程角色文案：'1' 主讲 / '2' 协作 / 其他返回空串不显示。 */
const roleLabel = (course: TeacherChaoxingCourse): string => {
  if (course.role === '1') return t('teacher.chaoxing.role.primary')
  if (course.role === '2') return t('teacher.chaoxing.role.assist')
  return ''
}

/** 课程胶囊文案（班级名 + 人数）。 */
const courseMetaText = (course: TeacherChaoxingCourse): string => {
  const parts: string[] = []
  if (course.className) parts.push(course.className)
  if (course.studentCount !== null) {
    parts.push(tf('teacher.chaoxing.students', { n: course.studentCount }))
  }
  return parts.join(' · ')
}

// ── 指标（全部为聚合值；取不到 → null → 视图 `—`）────────────────

const signRate = computed(() => chaoxingSignRate(dimensions.value?.sign ?? null))
const workRate = computed(() => chaoxingWorkRate(dimensions.value?.worknum ?? null))
const workSubmit = computed(() => chaoxingWorkSubmit(dimensions.value?.worknum ?? null))
const workTotal = computed(() => chaoxingWorkTotal(dimensions.value?.worknum ?? null))
const workPending = computed(() => chaoxingWorkPending(dimensions.value?.worknum ?? null))
const examCount = computed(() => chaoxingExamCount(dimensions.value?.examnum ?? null))
const examAvg = computed(() => chaoxingExamAvgScore(dimensions.value?.examnum ?? null))
const scoreAvg = computed(() => chaoxingScoreAvg(dimensions.value?.score ?? null))
const pvTotal = computed(() => chaoxingPvTotal(dimensions.value?.pv ?? null))
const weekActive = computed(() => chaoxingWeekActive(dimensions.value?.monitor ?? null))

/** 百分比文本（null → `—`）。 */
const percentText = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value)}%`

/** 作业 KPI 主数字：3/4 形态；单侧缺失 → `—`。 */
const workKpiText = computed(() => {
  if (workSubmit.value === null || workTotal.value === null) return '—'
  return `${workSubmit.value}/${workTotal.value}`
})
const workKpiHint = computed(() =>
  workRate.value === null ? '' : tf('teacher.chaoxing.kpi.work.done', { v: Math.round(workRate.value) })
)

const examKpiHint = computed(() =>
  examAvg.value === null ? '' : tf('teacher.chaoxing.kpi.exam.avg', { v: examAvg.value })
)

const pendingText = computed(() =>
  workPending.value === null ? '—' : String(workPending.value)
)

const examCountText = computed(() =>
  examCount.value === null ? '—' : String(examCount.value)
)

/** 维度行进度条宽（null → 0）。 */
const barWidth = (percent: number | null): string =>
  `${(percent === null ? 0 : Math.min(100, percent)).toFixed(1)}%`

/** 补充摘要行（综合均分 / 访问量 / 本周活跃；全部缺失 → 不渲染该行）。 */
const extraSummary = computed(() => {
  const parts: string[] = []
  if (scoreAvg.value !== null) {
    parts.push(tf('teacher.chaoxing.dim.score.avg', { v: scoreAvg.value }))
  }
  if (pvTotal.value !== null) {
    parts.push(tf('teacher.chaoxing.dim.pv.total', { n: pvTotal.value }))
  }
  if (weekActive.value !== null) {
    parts.push(tf('teacher.chaoxing.dim.monitor.week', { n: weekActive.value }))
  }
  return parts.join(' · ')
})

/** 监控人数徽标文案（null → `—`）。 */
const monitorBadgeText = computed(() => {
  if (monitorCount.value === null) return '—'
  return tf('teacher.chaoxing.monitor.badge', { n: monitorCount.value })
})
const monitorHasFlagged = computed(
  () => monitorCount.value !== null && monitorCount.value > 0
)

const reload = async (): Promise<void> => { await retry() }

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-cx">
    <TPageHeader :title="t('teacher.chaoxing.title')" icon="monitoring" @back="emit('back')">
      <template #actions>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.chaoxing.action.refresh')" :disabled="isCoursesLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isCoursesLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isCoursesLoading && !hasData" type="loading" :message="t('teacher.chaoxing.loading')" />
      <TEmptyState v-else-if="isCoursesError && !hasData" type="error" :message="t(coursesErrorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.chaoxing.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="!hasData" :message="t('teacher.chaoxing.empty')" />

      <template v-else>
        <!-- 课程选择器：顶部横滑课程胶囊 -->
        <section class="tch-cx-courses -mx-4 px-4" aria-label="课程选择">
          <div class="flex gap-2 overflow-x-auto pb-1 tch-cx-scroll">
            <button v-for="course in courses" :key="course.key" type="button"
              class="tch-cx-course-pill shrink-0 text-left"
              :class="{ 'tch-cx-course-pill--active': course.key === selectedCourseKey }"
              :aria-pressed="course.key === selectedCourseKey"
              :title="course.courseName || t('teacher.chaoxing.course.untitled')"
              @click="onSelectCourse(course)">
              <span class="flex items-center gap-1.5 min-w-0">
                <span class="w-1.5 h-1.5 rounded-full shrink-0"
                  :class="course.key === selectedCourseKey ? 'bg-on-primary' : 'bg-primary'"></span>
                <span class="text-xs font-bold truncate max-w-[10rem]">{{ course.courseName || '—' }}</span>
                <span v-if="roleLabel(course)" class="tch-cx-role"
                  :class="course.key === selectedCourseKey ? 'tch-cx-role--active' : ''">
                  {{ roleLabel(course) }}
                </span>
              </span>
              <span class="tch-label-micro block mt-0.5 truncate"
                :class="course.key === selectedCourseKey ? 'text-on-primary' : 'text-on-surface-variant'">
                {{ courseMetaText(course) || '—' }}
              </span>
            </button>
          </div>
          <p v-if="hasChannels" class="tch-label-caption text-on-surface-variant mt-1 px-1">
            {{ tf('teacher.chaoxing.channels', { n: channels.length }) }}
          </p>
        </section>

        <!-- 学情主体（选中课程存在才渲染；学情整体失败 → 内联错误） -->
        <template v-if="selectedCourse">
          <!-- 当前课程提示：参数缺失时说明无法查询 -->
          <p v-if="!chaoxingCourseQueryable(selectedCourse)"
            class="tch-label-caption text-on-surface-variant px-1">
            {{ t('teacher.chaoxing.course.notQueryable') }}
          </p>

          <!-- 四宫格 KPI：签到 / 作业 / 待批 / 考试 -->
          <section class="grid grid-cols-4 gap-2">
            <div class="tch-cx-kpi">
              <span class="tch-label-micro text-on-surface-variant">{{ t('teacher.chaoxing.kpi.sign') }}</span>
              <span class="tch-cx-kpi-num" :class="signRate === null ? 'text-on-surface-variant' : 'text-success'">
                {{ percentText(signRate) }}
              </span>
            </div>
            <div class="tch-cx-kpi">
              <span class="tch-label-micro text-on-surface-variant">{{ t('teacher.chaoxing.kpi.work') }}</span>
              <span class="tch-cx-kpi-num" :class="workKpiText === '—' ? 'text-on-surface-variant' : 'text-primary'">
                {{ workKpiText }}
              </span>
              <span v-if="workKpiHint" class="tch-cx-kpi-hint">{{ workKpiHint }}</span>
            </div>
            <div class="tch-cx-kpi">
              <span class="tch-label-micro text-on-surface-variant">{{ t('teacher.chaoxing.kpi.pending') }}</span>
              <span class="tch-cx-kpi-num" :class="workPending === null ? 'text-on-surface-variant' : 'text-course-amber'">
                {{ pendingText }}
              </span>
            </div>
            <div class="tch-cx-kpi">
              <span class="tch-label-micro text-on-surface-variant">{{ t('teacher.chaoxing.kpi.exam') }}</span>
              <span class="tch-cx-kpi-num" :class="examCount === null ? 'text-on-surface-variant' : 'text-course-lake-blue'">
                {{ examCountText }}
              </span>
              <span v-if="examKpiHint" class="tch-cx-kpi-hint">{{ examKpiHint }}</span>
            </div>
          </section>

          <!-- 学情维度：只渲染能从数据算出的指标，算不出 → — -->
          <section class="tch-cx-card p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-surface-highlight flex items-center justify-center text-primary">
                  <span class="material-symbols-outlined text-[18px]" aria-hidden="true">monitoring</span>
                </div>
                <div>
                  <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.chaoxing.dim.title') }}</h2>
                  <p class="tch-label-caption text-on-surface-variant mt-0.5">{{ t('teacher.chaoxing.dim.hint') }}</p>
                </div>
              </div>
              <span v-if="isAnalyticsLoading"
                class="material-symbols-outlined text-[18px] text-primary animate-spin" aria-hidden="true">progress_activity</span>
            </div>

            <!-- 作业完成率 -->
            <div class="flex items-center gap-2 py-2">
              <span class="w-14 shrink-0 text-xs font-semibold text-on-surface">{{ t('teacher.chaoxing.dim.work') }}</span>
              <div class="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar"
                :aria-valuenow="workRate ?? 0" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  :style="{ width: barWidth(workRate) }"></div>
              </div>
              <span class="w-14 shrink-0 text-right text-xs font-bold"
                :class="workRate === null ? 'text-on-surface-variant' : 'text-primary'">
                {{ workRate === null ? '—' : percentText(workRate) }}
              </span>
            </div>
            <!-- 签到率 -->
            <div class="flex items-center gap-2 py-2">
              <span class="w-14 shrink-0 text-xs font-semibold text-on-surface">{{ t('teacher.chaoxing.dim.sign') }}</span>
              <div class="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar"
                :aria-valuenow="signRate ?? 0" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full rounded-full bg-success transition-all duration-700 ease-out"
                  :style="{ width: barWidth(signRate) }"></div>
              </div>
              <span class="w-14 shrink-0 text-right text-xs font-bold"
                :class="signRate === null ? 'text-on-surface-variant' : 'text-success'">
                {{ signRate === null ? '—' : percentText(signRate) }}
              </span>
            </div>
            <!-- 考试平均分（非百分比：展示分数，条按 /100 归一） -->
            <div class="flex items-center gap-2 py-2">
              <span class="w-14 shrink-0 text-xs font-semibold text-on-surface">{{ t('teacher.chaoxing.dim.exam') }}</span>
              <div class="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar"
                :aria-valuenow="examAvg ?? 0" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full rounded-full bg-course-lake-blue transition-all duration-700 ease-out"
                  :style="{ width: barWidth(examAvg) }"></div>
              </div>
              <span class="w-14 shrink-0 text-right text-xs font-bold"
                :class="examAvg === null ? 'text-on-surface-variant' : 'text-course-lake-blue'">
                {{ examAvg === null ? '—' : tf('teacher.chaoxing.dim.exam.avg', { v: examAvg }) }}
              </span>
            </div>

            <p v-if="extraSummary" class="tch-label-caption text-on-surface-variant mt-2 pt-2 border-t border-surface-muted">
              {{ extraSummary }}
            </p>

            <!-- 学情整体失败：保留课程信息，维度区显示内联错误 + 重试 -->
            <div v-if="isAnalyticsError" class="mt-2 flex items-center justify-between gap-2 p-2.5 rounded-lg bg-danger-soft">
              <span class="text-xs text-danger font-semibold">{{ t(analyticsErrorKey) }}</span>
              <button type="button" class="text-xs font-bold text-danger shrink-0" @click="retryAnalytics">
                {{ t('teacher.chaoxing.action.retry') }}
              </button>
            </div>
          </section>

          <!-- 学习监控：只显示人数，名单不在 App 内展示 -->
          <section class="tch-cx-card overflow-hidden">
            <button type="button" class="w-full p-4 flex items-center justify-between active:bg-surface-canvas transition-colors"
              :aria-expanded="monitorOpen" @click="toggleMonitor">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
                  :class="monitorHasFlagged ? 'bg-danger-soft text-danger' : 'bg-surface-highlight text-primary'">
                  <span class="material-symbols-outlined text-[18px]" aria-hidden="true">emergency</span>
                </div>
                <span class="text-sm font-bold text-on-surface truncate">{{ t('teacher.chaoxing.monitor.title') }}</span>
                <span class="px-2 py-0.5 rounded-full tch-label-caption font-bold shrink-0"
                  :class="monitorHasFlagged ? 'bg-danger-soft text-danger' : 'bg-surface-muted text-on-surface-variant'">
                  {{ monitorBadgeText }}
                </span>
              </div>
              <div class="flex items-center gap-1 text-on-surface-variant shrink-0">
                <span class="tch-label-caption">
                  {{ monitorOpen ? t('teacher.chaoxing.monitor.collapse') : t('teacher.chaoxing.monitor.expand') }}
                </span>
                <span class="material-symbols-outlined text-[18px] transition-transform duration-300"
                  :class="{ 'rotate-180': monitorOpen }" aria-hidden="true">expand_more</span>
              </div>
            </button>
            <div class="tch-cx-collapse" :class="{ 'tch-cx-collapse--open': monitorOpen }">
              <div class="p-4 pt-1 bg-surface-canvas">
                <div class="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-lowest tch-cx-empty-note">
                  <span class="material-symbols-outlined text-[18px] text-outline" aria-hidden="true">
                    {{ monitorHasFlagged ? 'person_search' : 'verified_user' }}
                  </span>
                  <span class="text-sm text-on-surface-variant">
                    {{ monitorHasFlagged ? t('teacher.chaoxing.monitor.privacy') : t('teacher.chaoxing.monitor.empty') }}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </template>
      </template>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="isCoursesError ? coursesErrorKey : ''"
      />
    </main>
  </div>
</template>

<style src="../../../styles/views/TeacherChaoxingAnalytics.scoped.css" scoped></style>
