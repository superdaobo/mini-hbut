<script setup lang="ts">
// 教师端「调停补申请」视图（goal-21 / T09）。
//
// 数据源：`fetchTeacherAdjustment` → `{ myApply[], applicable[] }`。
// 关键约束（recon 1120 实测，硬性）：
//   - **只读**：`pk/pkttbgl/*` 提交/撤回/审批类路径属写型 → 本页**不出现
//     任何「提交申请」按钮**，底部只提示「申请需在网页端提交」；
//   - applicable 每条展示 courseName（15px 600）+ className · 周学时 +
//     总学时徽标（11px 灰）；左缘 3px 主色竖条（设计包 course tile 规格）；
//   - myApply 实测 0 条且字段未实测 → 空态；有数据时按候选键原样展示，
//     未识别字段以「字段名: 值」兜底，**绝不臆造字段语义**。
import { computed, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherAdjustment,
  type TeacherAdjustmentApply,
  type TeacherAdjustmentCourse
} from '../composables/useTeacherAdjustment'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  myApply,
  applicable,
  isLoading,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  retry
} = useTeacherAdjustment({ accountId: () => resolveTeacherAccountId(auth.studentId) })

const hasData = computed(() => myApply.value.length > 0 || applicable.value.length > 0)
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

const applicableCountText = computed(() =>
  tf('teacher.adjustment.applicable.count', { n: applicable.value.length })
)
const myApplyCountText = computed(() =>
  tf('teacher.adjustment.myApply.count', { n: myApply.value.length })
)

/** 可申请课程副标题：教学班名称 · N 学时/周（取不到的不渲染）。 */
const courseMeta = (item: TeacherAdjustmentCourse): string => {
  const parts: string[] = []
  if (item.className) parts.push(item.className)
  if (item.weeklyHours !== null) {
    parts.push(tf('teacher.adjustment.course.weeklyHours', { n: item.weeklyHours }))
  }
  return parts.join(' · ')
}

/** 总学时徽标文案；null → 不渲染徽标。 */
const totalHoursText = (item: TeacherAdjustmentCourse): string =>
  item.totalHours === null ? '' : tf('teacher.adjustment.course.totalHours', { n: item.totalHours })

/** 「我的申请」主标题：字段未实测，取不到时按序号兜底（不臆造语义）。 */
const applyTitle = (item: TeacherAdjustmentApply, index: number): string =>
  item.title || tf('teacher.adjustment.apply.fallback', { n: index + 1 })

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-adj">
    <TPageHeader :title="t('teacher.adjustment.title')" icon="edit_calendar" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-adj-semester" @toggle="onSemesterToggle">
          <summary class="tch-adj-semester-pill" :title="t('teacher.adjustment.semester.label')">
            <span class="tch-adj-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-adj-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-adj-semester-option">
              <input type="radio" name="tch-adjustment-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.adjustment.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.adjustment.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.adjustment.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="!hasData" :message="t('teacher.adjustment.empty')" />

      <template v-else>
        <!-- 可申请调停补（只读课程卡；左缘 3px 主色竖条） -->
        <section v-if="applicable.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="material-symbols-outlined text-primary text-[18px]" aria-hidden="true">class</span>
              <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.adjustment.applicable.title') }}</h2>
            </div>
            <span class="tch-adj-label-caption text-on-surface-variant">{{ applicableCountText }}</span>
          </div>
          <article v-for="item in applicable" :key="item.key" class="tch-adj-card tch-adj-course p-4">
            <div class="flex items-start justify-between gap-2 min-w-0">
              <div class="min-w-0">
                <h3 class="tch-adj-title truncate">{{ item.courseName || '—' }}</h3>
                <p v-if="courseMeta(item)" class="tch-adj-meta text-on-surface-variant mt-1 truncate"
                  :title="courseMeta(item)">
                  {{ courseMeta(item) }}
                </p>
              </div>
              <span v-if="totalHoursText(item)"
                class="tch-adj-chip shrink-0">{{ totalHoursText(item) }}</span>
            </div>
          </article>
        </section>

        <!-- 我的申请（实测 0 条 → 空态；字段未实测 → 候选键原样 + extras 兜底） -->
        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="material-symbols-outlined text-primary text-[18px]" aria-hidden="true">assignment</span>
              <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.adjustment.myApply.title') }}</h2>
            </div>
            <span class="tch-adj-label-caption text-on-surface-variant">{{ myApplyCountText }}</span>
          </div>

          <div v-if="myApply.length === 0" class="tch-adj-card p-4">
            <div class="flex items-center gap-2 p-2.5 rounded-lg bg-surface-canvas tch-adj-note">
              <span class="material-symbols-outlined text-[18px] text-outline" aria-hidden="true">inbox</span>
              <span class="text-sm text-on-surface-variant">{{ t('teacher.adjustment.myApply.empty') }}</span>
            </div>
          </div>

          <article v-else v-for="(item, index) in myApply" :key="item.key" class="tch-adj-card p-4">
            <div class="flex items-start justify-between gap-2 min-w-0">
              <h3 class="tch-adj-title min-w-0 truncate">{{ applyTitle(item, index) }}</h3>
              <span v-if="item.status" class="tch-adj-chip shrink-0">{{ item.status }}</span>
            </div>
            <p v-if="item.time" class="tch-adj-meta text-on-surface-variant mt-1 truncate">{{ item.time }}</p>
            <div v-if="item.extras.length > 0" class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
              <div v-for="extra in item.extras" :key="extra.key" class="min-w-0">
                <span class="tch-adj-label-micro text-outline block truncate">{{ extra.key }}</span>
                <span class="text-[12px] font-medium text-on-surface truncate block mt-0.5">{{ extra.value }}</span>
              </div>
            </div>
          </article>
        </section>

        <!-- 只读提示：App 内不提供提交入口 -->
        <p class="tch-adj-footnote text-center pb-1">
          {{ t('teacher.adjustment.footer.readonly') }}
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

<style src="../../../styles/views/TeacherAdjustment.scoped.css" scoped></style>
