<script setup lang="ts">
// 教师端「班级课表」查询入口视图（goal-21 / T12）。
//
// ⚠️ 本页**不渲染课表网格**——教务课表 ckbjkb 是服务端渲染 HTML（无 JSON 接口），
//   App 也没有通用 WebView 命令。页面定位是「查询入口」：
//     班级列表（服务端 keyword 搜索 + 最近查看胶囊）→
//     点击卡片在**页内**用 ScheduleGrid 渲染该班级课表（goal-22：不再跳系统浏览器）。
//   encodeId 为空（后端未返回）的班级不可点，
//   显示「该班级缺少课表参数」。
// 视觉：stitch 设计包 `_11`（Schedule）的列表/筛选器部分，token 见
//   tailwind.config.ts m3Colors；自定义类 .tch-cs-*，暗色覆盖在配套 CSS 末尾。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherScheduleLists,
  type TeacherScheduleClass
} from '../composables/useTeacherScheduleLists'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'
import ScheduleGrid from '../../../features/schedule/components/ScheduleGrid.vue'
import {
  buildWeekDates,
  useTeacherScheduleGrid
} from '../composables/useTeacherScheduleGrid'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  classes,
  classTotal,
  isLoading,
  isEmpty,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  setKeyword,
  retry,
  loadRecentClasses,
  recordRecentClass,
  recentClasses
} = useTeacherScheduleLists({ accountId: () => resolveTeacherAccountId(auth.studentId) })

const hasData = computed(() => classes.value.length > 0)

// ── 页头学期胶囊（<details> 原生展开/收起，与 T07/T10 同款）──
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

// ── 班级搜索（300ms 防抖 → 接口 keyword 参数，服务端过滤）──
const keywordDraft = ref('')
let keywordTimer: ReturnType<typeof setTimeout> | null = null
const onKeywordInput = (): void => {
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    keywordTimer = null
    void setKeyword(keywordDraft.value)
  }, 300)
}
const clearKeyword = (): void => {
  keywordDraft.value = ''
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = null
  void setKeyword('')
}
/** 点「最近查看」胶囊 → 回填搜索词并重新拉取。 */
const onRecentPill = (item: TeacherScheduleClass): void => {
  const label = item.className || item.classNo
  if (!label) return
  keywordDraft.value = label
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = null
  void setKeyword(label)
}

// ── 课表网格（goal-22：完全在应用内渲染，不再 openExternal 跳浏览器）──
const scheduleGrid = useTeacherScheduleGrid()
const activeClass = ref<TeacherScheduleClass | null>(null)
const weekDates = buildWeekDates()
const activeTitle = computed(() => activeClass.value?.className || activeClass.value?.classNo || '')
const activeCourseCount = computed(() => scheduleGrid.courses.value.length)
const activeIsEmpty = computed(
  () => !scheduleGrid.loading.value && !scheduleGrid.error.value && activeCourseCount.value === 0
)

const viewClassSchedule = async (item: TeacherScheduleClass): Promise<void> => {
  if (!item.encodeId) return
  activeClass.value = item
  recordRecentClass(item)
  await scheduleGrid.load({
    kind: 'class',
    encodeId: item.encodeId,
    semester: item.semester || semester.value,
    campusId: item.campusId || undefined,
    displayName: item.className || item.classNo || ''
  })
}

const closeSchedule = (): void => {
  activeClass.value = null
  scheduleGrid.reset()
}

const reloadSchedule = async (): Promise<void> => {
  if (!activeClass.value) return
  await viewClassSchedule(activeClass.value)
}

// ── 卡片文案 ──
const classTitle = (item: TeacherScheduleClass): string =>
  item.className || item.classNo || '—'
const classMeta = (item: TeacherScheduleClass): string =>
  [item.majorName, item.departmentName].filter(Boolean).join(' · ')
const classMetaLine2 = (item: TeacherScheduleClass): string =>
  [
    item.enrollYear ? tf('teacher.schedule.class.grade', { year: item.enrollYear }) : '',
    item.classNo
  ]
    .filter(Boolean)
    .join(' · ')
const footerText = computed(() =>
  tf('teacher.schedule.footer.loaded', { loaded: classes.value.length, total: classTotal.value })
)

onMounted(() => {
  loadRecentClasses()
  void load()
})
onBeforeUnmount(() => {
  if (keywordTimer) clearTimeout(keywordTimer)
})
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-cs">
    <TPageHeader :title="t('teacher.schedule.class.title')" icon="calendar_month" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-cs-semester" @toggle="onSemesterToggle">
          <summary class="tch-cs-semester-pill" :title="t('teacher.schedule.semester.label')">
            <span class="tch-cs-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-cs-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-cs-semester-option">
              <input type="radio" name="tch-class-schedule-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.schedule.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <!-- 课表打开方式说明：服务端渲染 HTML，无 JSON，只能浏览器看 -->
      <div class="tch-cs-note flex items-start gap-2 px-3.5 py-2.5">
        <span class="material-symbols-outlined text-[16px] text-primary mt-px" aria-hidden="true">grid_view</span>
        <p class="tch-cs-note-text">{{ t('teacher.schedule.class.gridHint') }}</p>
      </div>

      <!-- 课表网格（goal-22：选中班级后页内渲染，零浏览器外跳） -->
      <section v-if="activeClass" class="tch-cs-grid-wrap">
        <div class="flex items-center justify-between px-1 pb-2">
          <div class="min-w-0">
            <p class="text-[15px] font-semibold truncate">{{ activeTitle }}</p>
            <p class="tch-cs-label-micro text-outline">
              {{ tf('teacher.schedule.class.courseCount', { n: activeCourseCount }) }}
            </p>
          </div>
          <button type="button" class="text-[13px] font-semibold text-primary shrink-0"
            :disabled="scheduleGrid.loading.value" @click="reloadSchedule">
            {{ t('teacher.schedule.action.refresh') }}
          </button>
        </div>

        <div v-if="scheduleGrid.loading.value" class="tch-cs-grid-empty">
          <span class="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
          <p class="tch-cs-label-micro">{{ t('teacher.schedule.loading') }}</p>
        </div>
        <div v-else-if="scheduleGrid.error.value" class="tch-cs-grid-empty">
          <span class="material-symbols-outlined text-danger" aria-hidden="true">error</span>
          <p class="tch-cs-label-micro">{{ scheduleGrid.error.value }}</p>
          <button type="button" class="text-[13px] font-semibold text-primary mt-1" @click="reloadSchedule">
            {{ t('teacher.schedule.action.retry') }}
          </button>
        </div>
        <div v-else-if="activeIsEmpty" class="tch-cs-grid-empty">
          <span class="material-symbols-outlined text-outline" aria-hidden="true">event_busy</span>
          <p class="tch-cs-label-micro">{{ t('teacher.schedule.class.noCourses') }}</p>
        </div>
        <ScheduleGrid v-else
          :week-dates="weekDates"
          :current-month="weekDates[0]?.month || 1"
          :selected-week="0"
          :get-courses-for-day="scheduleGrid.getCoursesForDay"
          :get-course-style="scheduleGrid.getCourseStyleFor"
          :enable-blank-create="false"
          view-mode="courses"
        />

        <button type="button" class="tch-cs-back-list" @click="closeSchedule">
          {{ t('teacher.schedule.class.backToList') }}
        </button>
      </section>

      <!-- 三态 -->
      <TEmptyState v-if="!activeClass && isLoading && !hasData" type="loading" :message="t('teacher.schedule.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.schedule.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="!activeClass && (isEmpty || !hasData)" :message="t('teacher.schedule.class.empty')" />

      <template v-else>
        <!-- 搜索胶囊（300ms 防抖 → 服务端 keyword） -->
        <div class="tch-cs-search">
          <span class="material-symbols-outlined text-[20px] text-outline" aria-hidden="true">search</span>
          <input v-model="keywordDraft" class="tch-cs-search-input" type="search"
            :placeholder="t('teacher.schedule.class.search.placeholder')"
            :aria-label="t('teacher.schedule.class.search.aria')" @input="onKeywordInput" />
          <button v-if="keywordDraft" type="button" class="tch-cs-search-clear"
            :aria-label="t('teacher.schedule.search.clear')" @click="clearKeyword">
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>

        <!-- 最近查看（最多 3 个，点击回填搜索词） -->
        <div v-if="recentClasses.length" class="tch-cs-recents" :aria-label="t('teacher.schedule.class.recent.aria')">
          <button v-for="item in recentClasses" :key="item.key" type="button" class="tch-cs-recent-pill"
            :title="classTitle(item)" @click="onRecentPill(item)">
            <span class="material-symbols-outlined text-[13px]" aria-hidden="true">history</span>
            <span class="truncate max-w-[140px]">{{ classTitle(item) }}</span>
          </button>
        </div>

        <!-- 班级卡片流：scheduleUrl 非空 → 可点打开浏览器；为空 → 不可点 + 缺参说明 -->
        <section class="flex flex-col gap-2.5">
          <template v-for="item in classes" :key="item.key">
            <button v-if="item.scheduleUrl" type="button"
              class="tch-cs-card tch-cs-card--clickable p-3.5 text-left w-full"
              :disabled="scheduleGrid.loading.value" @click="viewClassSchedule(item)">
              <div class="flex items-center justify-between gap-2 min-w-0">
                <span class="tch-cs-card-title truncate">{{ classTitle(item) }}</span>
                <span v-if="item.studentCount !== null" class="tch-cs-card-count shrink-0">
                  {{ tf('teacher.schedule.class.count', { n: item.studentCount }) }}
                </span>
              </div>
              <p v-if="classMeta(item)" class="tch-cs-card-meta mt-1 truncate" :title="classMeta(item)">
                {{ classMeta(item) }}
              </p>
              <div class="flex items-end justify-between gap-2 mt-1">
                <span class="tch-cs-card-meta truncate" :title="classMetaLine2(item)">{{ classMetaLine2(item) }}</span>
                <span class="tch-cs-open shrink-0 inline-flex items-center gap-0.5">
                  <template v-if="scheduleGrid.loading.value">{{ t('teacher.schedule.class.opening') }}</template>
                  <template v-else>{{ t('teacher.schedule.class.open') }}</template>
                  <span class="material-symbols-outlined text-[13px]" aria-hidden="true">chevron_right</span>
                </span>
              </div>
            </button>
            <article v-else class="tch-cs-card tch-cs-card--disabled p-3.5">
              <div class="flex items-center justify-between gap-2 min-w-0">
                <span class="tch-cs-card-title truncate">{{ classTitle(item) }}</span>
                <span v-if="item.studentCount !== null" class="tch-cs-card-count shrink-0">
                  {{ tf('teacher.schedule.class.count', { n: item.studentCount }) }}
                </span>
              </div>
              <p v-if="classMeta(item)" class="tch-cs-card-meta mt-1 truncate" :title="classMeta(item)">
                {{ classMeta(item) }}
              </p>
              <div class="flex items-end justify-between gap-2 mt-1">
                <span class="tch-cs-card-meta truncate" :title="classMetaLine2(item)">{{ classMetaLine2(item) }}</span>
                <span class="tch-cs-missing shrink-0">{{ t('teacher.schedule.class.noParams') }}</span>
              </div>
            </article>
          </template>
        </section>

        <!-- 底部：已加载 N / 共 total（接口只回第一页，不做无限滚动） -->
        <div class="flex items-center justify-center pt-1">
          <p class="tch-cs-footer">
            <span class="tch-cs-footer-dot" aria-hidden="true"></span>
            {{ footerText }}
            <span class="tch-cs-footer-dot" aria-hidden="true"></span>
          </p>
        </div>
      </template>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="isError ? errorKey : ''"
      />
    </main>
  </div>
</template>

<style src="../../../styles/views/TeacherClassSchedule.scoped.css" scoped></style>
