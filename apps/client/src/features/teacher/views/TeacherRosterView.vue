<script setup lang="ts">
// 教师端「学生名册」视图（goal-21 / T10）。
//
// 数据源：
//   - 班级候选：`fetchTeacherScheduleLists` → `{ classes[] }`；
//   - 名册分页：`fetchTeacherRoster({ bjid, page, pageSize:20, keyword })`。
//
// 隐私硬约束（最高优先级）：
//   1. **未选班级不发名册请求**——后端缺 `bjid` 会直接拒绝（防全校 56957 条）；
//   2. 学生列表**只进内存**，不写 localStorage / sessionStorage / IndexedDB，
//      进程内也不留快照（切班/切学期/卸载即清）；
//   3. 只渲染后端契约已返回的 7 个字段（学号/姓名/班级/专业/年级），
//      绝不拼接身份证、民族、政治面貌等任何额外个人信息；
//   4. 搜索只走 `keyword`（后端映射到学号查询），前端不做全量过滤。
//
// 视觉：stitch 设计包 `_2`（Student Directory）——搜索胶囊 + 班级胶囊横滑 +
//   40px squircle 姓氏首字头像 + 底部「已加载 X / 共 Y」。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherRoster,
  type TeacherRosterClass,
  type TeacherRosterStudent
} from '../composables/useTeacherRoster'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  classes,
  classesLoading,
  classesError,
  classesErrorKey,
  classesEmpty,
  lastSuccessfulSyncAt,
  syncStatus,
  students,
  selectedClassId,
  total,
  hasMore,
  loadedCount,
  rosterLoading,
  rosterError,
  rosterReady,
  rosterErrorKey,
  hasStudents,
  load,
  selectClass,
  setKeyword,
  loadMore,
  retryRoster,
  retryClasses,
  setSemester,
  clearRoster
} = useTeacherRoster({ accountId: () => resolveTeacherAccountId(auth.studentId) })

// ── 页头学期胶囊（<details> 原生展开/收起，与 T07/T09 同款）──
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
const reload = async (): Promise<void> => { await retryClasses() }

// ── 学号搜索（300ms 防抖；后端映射到学号查询，前端不过滤）──
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

// ── 滚动到底自动加载（IntersectionObserver 哨兵）──
const sentinelRef = ref<HTMLElement | null>(null)
let sentinelObserver: IntersectionObserver | null = null

/** 班级胶囊：rosterId 为空的记录禁用（绝不裸发请求）。 */
const classEnabled = (item: TeacherRosterClass): boolean => item.rosterId.trim() !== ''
const classSelected = (item: TeacherRosterClass): boolean =>
  item.rosterId === selectedClassId.value
const onSelectClass = (item: TeacherRosterClass): void => {
  if (!classEnabled(item)) return
  void selectClass(item.rosterId)
}

/** 名册副标：`className · majorName · grade`（缺片段自动省略）。 */
const studentMeta = (item: TeacherRosterStudent): string =>
  [item.className, item.majorName, item.grade].filter(Boolean).join(' · ')

/** 头像首字：姓名第一字；无姓名用「—」。 */
const avatarText = (item: TeacherRosterStudent): string =>
  item.name ? item.name.slice(0, 1) : '—'

const totalText = computed(() => (total.value >= 0 ? total.value : null))
const loadedFooterText = computed(() =>
  totalText.value === null
    ? ''
    : tf('teacher.roster.footer.loaded', { loaded: loadedCount.value, total: totalText.value })
)

onMounted(() => {
  void load()
  sentinelObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void loadMore()
  }, { rootMargin: '160px' })
  if (sentinelRef.value) sentinelObserver.observe(sentinelRef.value)
})

watch(sentinelRef, (el, prev) => {
  if (prev) sentinelObserver?.unobserve(prev)
  if (el) sentinelObserver?.observe(el)
})

onBeforeUnmount(() => {
  sentinelObserver?.disconnect()
  sentinelObserver = null
  if (keywordTimer) clearTimeout(keywordTimer)
  clearRoster() // PII：离开页面即清内存中的学生列表
})
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-ro">
    <TPageHeader :title="t('teacher.roster.title')" icon="groups" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-ro-semester" @toggle="onSemesterToggle">
          <summary class="tch-ro-semester-pill" :title="t('teacher.roster.semester.label')">
            <span class="tch-ro-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-ro-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-ro-semester-option">
              <input type="radio" name="tch-roster-semester" :value="value" v-model="semesterDraft"
                :disabled="classesLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.roster.action.refresh')" :disabled="classesLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': classesLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <!-- 班级候选加载/错误态 -->
      <TEmptyState v-if="classesLoading && !classes.length" type="loading"
        :message="t('teacher.roster.classes.loading')" />
      <TEmptyState v-else-if="classesError && !classes.length" type="error" :message="t(classesErrorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.roster.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="classesEmpty" :message="t('teacher.roster.classes.empty')" />

      <template v-else>
        <!-- 搜索（300ms 防抖；后端学号查询） -->
        <div class="tch-ro-search">
          <span class="material-symbols-outlined text-[20px] text-outline" aria-hidden="true">search</span>
          <input v-model="keywordDraft" class="tch-ro-search-input" type="text" inputmode="numeric"
            :placeholder="t('teacher.roster.search.placeholder')" :aria-label="t('teacher.roster.search.aria')"
            @input="onKeywordInput" />
          <button v-if="keywordDraft" type="button" class="tch-ro-search-clear"
            :aria-label="t('teacher.roster.search.clear')" @click="clearKeyword">
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>

        <!-- 班级胶囊横滑（rosterId 为空的禁用） -->
        <div class="tch-ro-classes" role="listbox" :aria-label="t('teacher.roster.classes.aria')">
          <button v-for="item in classes" :key="item.key" type="button" class="tch-ro-class-pill"
            :class="{ 'tch-ro-class-pill--active': classSelected(item), 'tch-ro-class-pill--disabled': !classEnabled(item) }"
            :disabled="!classEnabled(item)" :aria-pressed="classSelected(item)"
            :title="item.className || item.classNo" @click="onSelectClass(item)">
            <span class="truncate max-w-[120px]">{{ item.className || item.classNo || '—' }}</span>
            <span v-if="item.studentCount !== null" class="tch-ro-class-count">
              {{ tf('teacher.roster.class.count', { n: item.studentCount }) }}
            </span>
          </button>
        </div>

        <!-- 🔴 未选班级：整页空态，**不发任何名册请求** -->
        <TEmptyState v-if="!selectedClassId" :message="t('teacher.roster.selectClass')" />

        <template v-else>
          <!-- 名册三态 -->
          <TEmptyState v-if="rosterLoading && !hasStudents" type="loading"
            :message="t('teacher.roster.loading')" />
          <TEmptyState v-else-if="rosterError && !hasStudents" type="error" :message="t(rosterErrorKey)">
            <button type="button" class="mt-3 text-primary font-semibold" @click="retryRoster">
              {{ t('teacher.roster.action.retry') }}
            </button>
          </TEmptyState>
          <TEmptyState v-else-if="rosterReady && !hasStudents" :message="t('teacher.roster.empty')" />

          <template v-else>
            <!-- 学生卡片流（40px squircle 姓氏首字头像） -->
            <article v-for="item in students" :key="item.key" class="tch-ro-student p-3.5">
              <div class="flex items-center gap-3 min-w-0">
                <div class="tch-ro-avatar shrink-0" aria-hidden="true">{{ avatarText(item) }}</div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="tch-ro-name truncate">{{ item.name || '—' }}</span>
                    <span v-if="item.studentId" class="tch-ro-studentid shrink-0">{{ item.studentId }}</span>
                  </div>
                  <p v-if="studentMeta(item)" class="tch-ro-meta mt-1 truncate" :title="studentMeta(item)">
                    {{ studentMeta(item) }}
                  </p>
                </div>
              </div>
            </article>

            <!-- 底部：已加载 X / 共 Y + 无限滚动哨兵 + 重试/更多按钮 -->
            <div class="flex flex-col items-center justify-center pt-1 space-y-2">
              <p v-if="loadedFooterText" class="tch-ro-footer">
                <span class="tch-ro-footer-dot" aria-hidden="true"></span>
                {{ loadedFooterText }}
                <span class="tch-ro-footer-dot" aria-hidden="true"></span>
              </p>
              <div v-if="rosterError && hasStudents" class="flex items-center gap-2">
                <span class="tch-ro-footer text-danger">{{ t(rosterErrorKey) }}</span>
                <button type="button" class="text-primary font-semibold text-[11px]" @click="retryRoster">
                  {{ t('teacher.roster.action.retry') }}
                </button>
              </div>
              <p v-else-if="rosterLoading && hasStudents" class="tch-ro-footer">
                {{ t('teacher.roster.loadingMore') }}
              </p>
              <button v-else-if="hasMore" type="button" class="tch-ro-more" @click="loadMore">
                <span class="material-symbols-outlined text-[16px]">expand_more</span>
                <span>{{ t('teacher.roster.action.loadMore') }}</span>
              </button>
              <div ref="sentinelRef" class="h-1 w-full" aria-hidden="true"></div>
            </div>
          </template>
        </template>
      </template>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="classesError ? classesErrorKey : ''"
      />
    </main>
  </div>
</template>

<style src="../../../styles/views/TeacherRoster.scoped.css" scoped></style>
