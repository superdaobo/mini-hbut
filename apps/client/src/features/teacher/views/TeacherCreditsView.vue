<script setup lang="ts">
// 教师端「学分统计」视图（goal-21 / T09）。
//
// 数据源：`fetchTeacherCredits` → `{ rows[]（学生个人明细）, failedCourses[] }`。
// 关键约束（recon 1120 实测，硬性）：
//   - rows 每行一个学生：展示学号 + 专业·班级，**后端无姓名，绝不臆造**；
//   - cells[].key 是**学分档位编号**（21 个，语义学校未给映射表）：
//     表头只显示编号本身（「档位 {k}」），**绝不给档位起名字**；
//     页面底部固定一行小字「档位编号含义以学校系统为准」；
//   - 21 个档位放不下 → 单个 overflow-x:auto 容器包住表头+数据行同步滚动；
//   - 不及格课程无数据时整段不渲染。
import { computed, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherCredits,
  type TeacherCreditRow,
  type TeacherFailedCourse
} from '../composables/useTeacherCredits'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  rows,
  failedCourses,
  isLoading,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  retry
} = useTeacherCredits({ accountId: () => resolveTeacherAccountId(auth.studentId) })

const hasData = computed(() => rows.value.length > 0 || failedCourses.value.length > 0)
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

/** 学生人数计数文案。 */
const studentCountText = computed(() =>
  tf('teacher.credits.students.count', { n: rows.value.length })
)
const failedCountText = computed(() =>
  tf('teacher.credits.failed.count', { n: failedCourses.value.length })
)

/** 档位表头文案：只展示编号本身（「档位 11」），绝不给档位起名。 */
const tierLabel = (key: string): string => tf('teacher.credits.tier', { key })

/** 学生行副标题：专业 · 班级（缺一项只显示另一项，全空显示 '—'）。 */
const rowMeta = (item: TeacherCreditRow): string => {
  const parts = [item.majorName, item.className].filter(
    (part): part is string => Boolean(part)
  )
  return parts.length > 0 ? parts.join(' · ') : '—'
}

/** 不及格课程副标题：课程代码 · N 学分（取不到的不渲染）。 */
const failedCourseMeta = (item: TeacherFailedCourse): string => {
  const parts: string[] = []
  if (item.courseCode) parts.push(item.courseCode)
  if (item.credit) parts.push(tf('teacher.credits.failed.credit', { n: item.credit }))
  return parts.join(' · ')
}

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-cr">
    <TPageHeader :title="t('teacher.credits.title')" icon="school" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-cr-semester" @toggle="onSemesterToggle">
          <summary class="tch-cr-semester-pill" :title="t('teacher.credits.semester.label')">
            <span class="tch-cr-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-cr-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-cr-semester-option">
              <input type="radio" name="tch-credits-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.credits.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.credits.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.credits.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="!hasData" :message="t('teacher.credits.empty')" />

      <template v-else>
        <!-- 学分明细（每行一个学生，档位横向滚动） -->
        <section v-if="rows.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.credits.students.title') }}</h2>
            <span class="tch-cr-label-caption text-on-surface-variant">{{ studentCountText }}</span>
          </div>
          <article v-for="item in rows" :key="item.key" class="tch-cr-card p-4">
            <!-- 学号（15px 600）+ 专业·班级（11px 灰） -->
            <div class="min-w-0">
              <h3 class="tch-cr-title truncate">{{ item.studentId || '—' }}</h3>
              <p class="tch-cr-meta text-on-surface-variant mt-0.5 truncate" :title="rowMeta(item)">
                {{ rowMeta(item) }}
              </p>
            </div>
            <!-- 档位表：单个滚动容器包住表头行+数据行，天然同步滚动 -->
            <div v-if="item.cells.length > 0" class="tch-cr-scroll mt-3">
              <div class="tch-cr-tierrow">
                <div v-for="cell in item.cells" :key="cell.key" class="tch-cr-tiercol">
                  <span class="tch-cr-tierkey text-on-surface-variant">{{ tierLabel(cell.key) }}</span>
                  <span class="tch-cr-tiervalue">{{ cell.value || '—' }}</span>
                </div>
              </div>
            </div>
            <div v-else class="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-surface-canvas tch-cr-note">
              <span class="material-symbols-outlined text-[18px] text-outline" aria-hidden="true">hourglass_empty</span>
              <span class="text-sm text-on-surface-variant">{{ t('teacher.credits.row.noCells') }}</span>
            </div>
          </article>
        </section>

        <!-- 不及格课程：无数据时整段不渲染 -->
        <section v-if="failedCourses.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="material-symbols-outlined text-danger text-[18px]" aria-hidden="true">warning</span>
              <h2 class="text-sm font-bold text-on-surface">{{ t('teacher.credits.failed.title') }}</h2>
            </div>
            <span class="tch-cr-label-caption text-on-surface-variant">{{ failedCountText }}</span>
          </div>
          <article v-for="item in failedCourses" :key="item.key" class="tch-cr-card tch-cr-failcard p-4">
            <div class="flex items-start justify-between gap-2 min-w-0">
              <div class="min-w-0">
                <h3 class="tch-cr-title truncate">{{ item.courseName || '—' }}</h3>
                <p v-if="failedCourseMeta(item)" class="tch-cr-meta text-on-surface-variant mt-0.5 truncate">
                  {{ failedCourseMeta(item) }}
                </p>
              </div>
              <span v-if="item.grade" class="tch-cr-chip tch-cr-chip--danger shrink-0">
                {{ tf('teacher.credits.failed.grade', { n: item.grade }) }}
              </span>
            </div>
          </article>
        </section>

        <!-- 档位语义免责说明（学校未给映射表 → 只展示编号） -->
        <p class="tch-cr-footnote text-center pb-1">
          {{ t('teacher.credits.tier.note') }}
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

<style src="../../../styles/views/TeacherCredits.scoped.css" scoped></style>
