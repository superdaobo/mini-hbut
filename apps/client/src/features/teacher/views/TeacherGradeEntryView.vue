<script setup lang="ts">
// 教师端「成绩录入进度」视图（goal-21 / T10）。
//
// 数据源：`fetchTeacherGradeEntry` → `{ progress[], teachingClasses[] }`。
// 关键约束：
//   - **只读**：不接 createXscjData / submit / deleteCjxgsq（写型），页面
//     无任何「去录入/提交」入口；
//   - **关联红线**：progress（录入配置）与 teachingClasses（教学班）粒度
//     不同（实测 8 vs 4），只按 `classId` 精确匹配；匹配不到单独展示；
//   - 环形进度：`shouldEnter`/`mustEnter` 后端是字符串，已 parseInt；
//     分母为空/0 → 显示「—」不画弧；分子>分母夹到 100；
//   - 发布徽章：仅 `publishStatus === "1"` → 已发布（蓝）；其它/空 →
//     中性灰 + 原值/「未发布」，未知值绝不猜语义；
//   - 状态徽章：原样透传 `confirmStatus`（中性灰），仅 "1" 给中性蓝；
// 视觉：stitch `_7`（Grade Entry Progress）——44px 4px 环形 + 卡片列表 +
//   顶部汇总 + 底部署名「教学班」。
import { computed, onMounted, ref, watch } from 'vue'
import { TCard, TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherGradeEntry,
  entryCounts,
  entryRingPercent,
  entryProgressText,
  entryWindowText,
  publishBadgeTone,
  confirmBadgeTone,
  totalShouldEnter,
  totalMustEnter,
  completedProgressCount,
  publishedClassCount,
  latestEntryDeadline,
  type TeacherGradeEntryLink,
  type TeacherGradeTeachingClass
} from '../composables/useTeacherGradeEntry'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  progress,
  teachingClasses,
  links,
  orphanClasses,
  isLoading,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  retry
} = useTeacherGradeEntry({ accountId: () => resolveTeacherAccountId(auth.studentId) })

const hasData = computed(() => progress.value.length > 0 || teachingClasses.value.length > 0)

// ── 页头学期胶囊（与 T07/T09 同款 <details> 下拉）──
const semesterDraft = ref(semester.value)
watch(semester, (value) => { semesterDraft.value = value })
const semesters = computed(() => teacherSemesterOptions(semesterDraft.value))
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

// ── 汇总指标（后端字段级，未知不猜）──
const summary = computed(() => {
  const data = {
    progress: progress.value,
    teachingClasses: teachingClasses.value
  }
  return {
    shouldTotal: totalShouldEnter(data),
    enteredTotal: totalMustEnter(data),
    completedCount: completedProgressCount(data),
    publishedCount: publishedClassCount(data),
    deadline: latestEntryDeadline(data),
    progressTotal: data.progress.length,
    classesTotal: data.teachingClasses.length
  }
})

const RING_R = 18
const RING_C = 113.1 // 2πr = 113.10（44px 环 / 3.5px 线宽 / r=18）

/** 环形 dashoffset（percent 为 0-100）。 */
const ringOffset = (percent: number | null): number =>
  percent === null ? RING_C : RING_C * (1 - percent / 100)

/** 环色档位：100 → 湖蓝；>0 → 湖蓝；0 → 危险；null → 轨道灰。 */
const ringClass = (percent: number | null): string => {
  if (percent === null) return 'text-outline-variant'
  if (percent >= 100) return 'text-course-lake-blue'
  if (percent <= 0) return 'text-danger'
  return 'text-course-lake-blue'
}

const ringCenterClass = (percent: number | null): string => {
  if (percent === null) return 'text-outline'
  if (percent <= 0) return 'text-danger'
  return 'text-course-lake-blue'
}

/** 卡片标题：优先教学班课程名（kcmc），退到进度条 className → classNo → '—'。 */
const progressTitle = (link: TeacherGradeEntryLink): string =>
  link.linkedClass?.courseName || link.item.className || link.item.classNo || '—'

/** 卡片副标：`已录 {entered} / 应录 {total}` + 教学班名/编号（若有）。 */
const progressMeta = (link: TeacherGradeEntryLink): string => {
  const parts: string[] = []
  const counts = entryCounts(link.item)
  if (counts) {
    parts.push(
      tf('teacher.gradeEntry.progress.count', {
        entered: counts.entered,
        total: counts.total
      })
    )
  }
  if (link.item.className) parts.push(link.item.className)
  if (link.item.classNo) parts.push(link.item.classNo)
  return parts.join(' · ')
}

/** 环中心显示：可算 → `entered/total`（如 61/61）；不可算 → '—'。 */
const ringCenterText = (link: TeacherGradeEntryLink): string =>
  entryProgressText(link.item)

/** 录入窗口（start ~ end；两段都在才显示）。 */
const progressWindow = (link: TeacherGradeEntryLink): string => entryWindowText(link.item)

/** 发布徽章文案：仅 "1" → 已发布；空 → 未发布；其它原样透传。 */
const publishBadgeText = (status: string): string =>
  status.trim() === '1'
    ? t('teacher.gradeEntry.badge.published')
    : status.trim() === ''
      ? t('teacher.gradeEntry.badge.unpublished')
      : status.trim()

const publishBadgeClass = (status: string): string =>
  publishBadgeTone(status) === 'published' ? 'tch-ge-badge tch-ge-badge--blue' : 'tch-ge-badge tch-ge-badge--neutral'

/** 确认状态徽章：仅 "1" → 已确认；其它/空 → 中性灰 + 原值/「—」。 */
const confirmBadgeText = (status: string): string =>
  status.trim() === '1' ? t('teacher.gradeEntry.badge.confirmed') : (status.trim() || '—')

const confirmBadgeClass = (status: string): string =>
  confirmBadgeTone(status) === 'confirmed' ? 'tch-ge-badge tch-ge-badge--lake' : 'tch-ge-badge tch-ge-badge--neutral'

/** 教学班卡片副标：`classWeek · N人 · M学分`。 */
const teachingClassMeta = (item: TeacherGradeTeachingClass): string => {
  const parts: string[] = []
  if (item.classWeek) parts.push(item.classWeek)
  if (item.studentCount !== null) {
    parts.push(tf('teacher.gradeEntry.class.students', { n: item.studentCount }))
  }
  if (item.credits !== null) {
    parts.push(tf('teacher.gradeEntry.class.credits', { n: item.credits }))
  }
  return parts.join(' · ')
}

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-ge">
    <TPageHeader :title="t('teacher.gradeEntry.title')" icon="assignment_turned_in" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-ge-semester" @toggle="onSemesterToggle">
          <summary class="tch-ge-semester-pill" :title="t('teacher.gradeEntry.semester.label')">
            <span class="tch-ge-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-ge-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-ge-semester-option">
              <input type="radio" name="tch-grade-entry-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.gradeEntry.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.gradeEntry.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.gradeEntry.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="!hasData" :message="t('teacher.gradeEntry.empty')" />

      <template v-else>
        <!-- 顶部汇总卡：整体进度环 + 三栏指标 + 截止提示 -->
        <section class="tch-ge-card p-4" aria-live="polite">
          <div class="flex items-center gap-4">
            <!-- 44px 环形总进度（completed/progress） -->
            <div class="relative w-11 h-11 shrink-0" role="img"
              :aria-label="summary.progressTotal > 0 ? `${summary.completedCount}/${summary.progressTotal}` : t('teacher.gradeEntry.hero.empty')">
              <svg class="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                <circle class="tch-ge-ring-track" cx="22" cy="22" :r="RING_R" fill="none" stroke-width="3.5"></circle>
                <circle v-if="summary.progressTotal > 0" class="text-course-lake-blue tch-ge-ring-arc"
                  cx="22" cy="22" :r="RING_R" fill="none" stroke="currentColor"
                  :stroke-dasharray="RING_C" stroke-linecap="round" stroke-width="3.5"
                  :stroke-dashoffset="ringOffset(summary.progressTotal > 0 ? Math.round(summary.completedCount / summary.progressTotal * 100) : null)"></circle>
              </svg>
              <span class="absolute inset-0 flex items-center justify-center tch-ge-ring-center"
                :class="summary.progressTotal > 0 ? 'text-course-lake-blue' : 'text-outline'"
                aria-hidden="true">
                {{ summary.progressTotal > 0 ? `${summary.completedCount}/${summary.progressTotal}` : '—' }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                <span class="tch-ge-label-caption text-on-surface-variant">{{ semester }}</span>
              </div>
              <p class="tch-ge-title truncate mt-0.5">{{ t('teacher.gradeEntry.hero.title') }}</p>
              <p v-if="summary.deadline" class="tch-ge-meta text-on-surface-variant mt-1 truncate">
                {{ tf('teacher.gradeEntry.hero.deadline', { time: summary.deadline }) }}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 mt-3 pt-3 rounded-lg bg-surface-muted/60 p-2.5 text-center">
            <div class="min-w-0">
              <span class="tch-ge-label-micro text-outline block truncate">{{ t('teacher.gradeEntry.hero.shouldTotal') }}</span>
              <span class="tch-ge-title block mt-0.5">{{ summary.shouldTotal ?? '—' }}</span>
            </div>
            <div class="min-w-0">
              <span class="tch-ge-label-micro text-course-lake-blue block truncate">{{ t('teacher.gradeEntry.hero.enteredTotal') }}</span>
              <span class="tch-ge-title text-course-lake-blue block mt-0.5">{{ summary.enteredTotal ?? '—' }}</span>
            </div>
            <div class="min-w-0">
              <span class="tch-ge-label-micro text-outline block truncate">{{ t('teacher.gradeEntry.hero.publishedTotal') }}</span>
              <span class="tch-ge-title block mt-0.5">{{ summary.publishedCount }}/{{ summary.classesTotal }}</span>
            </div>
          </div>
        </section>

        <!-- 录入进度列表 -->
        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.gradeEntry.progress.title') }}</h2>
            <span class="tch-ge-label-caption text-on-surface-variant">
              {{ tf('teacher.gradeEntry.progress.count.label', { n: summary.progressTotal }) }}
            </span>
          </div>

          <TCard v-for="link in links" :key="link.item.key" compact>
            <div class="flex items-center justify-between gap-2">
              <!-- 44px 单班环 -->
              <div class="relative w-11 h-11 shrink-0" role="img"
                :aria-label="entryProgressText(link.item)">
                <svg class="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                  <circle class="tch-ge-ring-track" cx="22" cy="22" :r="RING_R" fill="none" stroke-width="3.5"></circle>
                  <circle v-if="entryRingPercent(link.item) !== null"
                    class="tch-ge-ring-arc" :class="ringClass(entryRingPercent(link.item))"
                    cx="22" cy="22" :r="RING_R" fill="none" stroke="currentColor"
                    :stroke-dasharray="RING_C" stroke-linecap="round" stroke-width="3.5"
                    :stroke-dashoffset="ringOffset(entryRingPercent(link.item))"></circle>
                </svg>
                <span class="absolute inset-0 flex items-center justify-center tch-ge-ring-center"
                  :class="ringCenterClass(entryRingPercent(link.item))" aria-hidden="true">
                  {{ ringCenterText(link) }}
                </span>
              </div>
              <!-- 课程信息 -->
              <div class="flex-1 min-w-0">
                <p class="tch-ge-title truncate">{{ progressTitle(link) }}</p>
                <p v-if="progressMeta(link)" class="tch-ge-meta text-on-surface-variant mt-1 truncate">
                  {{ progressMeta(link) }}
                </p>
                <p v-if="progressWindow(link)" class="tch-ge-meta text-outline mt-0.5 truncate">
                  {{ progressWindow(link) }}
                </p>
              </div>
              <!-- 右侧徽章列 -->
              <div class="shrink-0 flex flex-col items-end gap-1">
                <span :class="publishBadgeClass(link.linkedClass?.publishStatus ?? '')">
                  <span class="tch-ge-badge-dot"></span>{{ publishBadgeText(link.linkedClass?.publishStatus ?? '') }}
                </span>
                <span v-if="link.item.confirmStatus" :class="confirmBadgeClass(link.item.confirmStatus)">
                  {{ confirmBadgeText(link.item.confirmStatus) }}
                </span>
              </div>
            </div>
          </TCard>
        </section>

        <!-- 无录入配置的教学班（单独展示，不编造关联） -->
        <section v-if="orphanClasses.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.gradeEntry.classes.title') }}</h2>
            <span class="tch-ge-label-caption text-on-surface-variant">
              {{ tf('teacher.gradeEntry.classes.count', { n: orphanClasses.length }) }}
            </span>
          </div>
          <TCard v-for="item in orphanClasses" :key="item.key" compact>
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="tch-ge-title truncate">{{ item.courseName || item.classId || '—' }}</p>
                <p v-if="teachingClassMeta(item)" class="tch-ge-meta text-on-surface-variant mt-1 truncate">
                  {{ teachingClassMeta(item) }}
                </p>
              </div>
              <span :class="publishBadgeClass(item.publishStatus)">
                <span class="tch-ge-badge-dot"></span>{{ publishBadgeText(item.publishStatus) }}
              </span>
            </div>
          </TCard>
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

<style src="../../../styles/views/TeacherGradeEntry.scoped.css" scoped></style>
