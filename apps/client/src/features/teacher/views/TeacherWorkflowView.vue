<script setup lang="ts">
// 教师端「只读工作流」视图（goal-21 / T08）。
//
// 数据源：`fetchTeacherWorkflow` → `{ myApply, myHandled, myTodo }` 三组 jqGrid
//   记录（后端已剔除框架注入的身份字段）。实测：申请 2 / 经办 2 / 待办 0。
// ⚠️ 后端**没有步骤节点明细**（status/checkstatus/shzt 语义未验证）：
//   本页只渲染状态徽章 + 时间跨度 + 可选处理意见，**绝不画步骤条**；
//   App 内无流程详情页 → 卡片只提示「流程详情需在网页端查看」，不给跳转。
import { computed, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  useTeacherWorkflow,
  type WorkflowStatusTone,
  type WorkflowTab
} from '../composables/useTeacherWorkflow'
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
  rows,
  todoCount,
  isLoading,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  retry
} = useTeacherWorkflow({ accountId: () => resolveTeacherAccountId(auth.studentId) })

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

// ── 三分段胶囊 ──────────────────────────────────────────────────
const activeTab = ref<WorkflowTab>('apply')
const tabs: WorkflowTab[] = ['apply', 'todo', 'handled']
const tabLabel = (tab: WorkflowTab): string => t(`teacher.workflow.tab.${tab}`)
const activeRows = computed(() => rows.value[activeTab.value])

const tabButtonClass = (tab: WorkflowTab): string =>
  activeTab.value === tab ? 'tch-wf-seg-btn tch-wf-seg-btn--active' : 'tch-wf-seg-btn'

/** 状态徽章样式类（未知 tone → neutral 灰底）。 */
const badgeClass = (tone: WorkflowStatusTone): string => `tch-wf-badge tch-wf-badge--${tone}`

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-wf">
    <TPageHeader :title="t('teacher.workflow.title')" icon="account_tree" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-wf-semester" @toggle="onSemesterToggle">
          <summary class="tch-wf-semester-pill" :title="t('teacher.workflow.semester.label')">
            <span class="tch-wf-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-wf-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-wf-semester-option">
              <input type="radio" name="tch-workflow-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.workflow.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.workflow.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.workflow.action.retry') }}
        </button>
      </TEmptyState>

      <template v-else-if="hasData">
        <!-- 三分段胶囊：申请 / 待办 / 经办（待办 >0 时带橙色角标） -->
        <nav class="tch-wf-seg" role="tablist" :aria-label="t('teacher.workflow.title')">
          <button v-for="tab in tabs" :key="tab" type="button" role="tab"
            :class="tabButtonClass(tab)" :aria-selected="activeTab === tab"
            @click="activeTab = tab">
            <span>{{ tabLabel(tab) }}</span>
            <span class="tch-wf-seg-count">{{ counts[tab] }}</span>
            <span v-if="tab === 'todo' && todoCount > 0" class="tch-wf-seg-badge" aria-hidden="true"></span>
          </button>
        </nav>

        <!-- 当前标签页空态：待办为空 → 暂无待办 -->
        <TEmptyState v-if="activeRows.length === 0"
          :message="t(`teacher.workflow.empty.${activeTab}`)" />

        <!-- 流程卡片列表 -->
        <section v-else class="flex flex-col gap-2.5" aria-live="polite">
          <article v-for="item in activeRows" :key="item.key" class="tch-wf-card p-4">
            <div class="flex items-start justify-between gap-2">
              <h3 class="tch-wf-title min-w-0">
                {{ item.title || t('teacher.workflow.fallback.title') }}
              </h3>
              <span v-if="item.status" :class="badgeClass(item.tone)">{{ item.status }}</span>
            </div>
            <p class="tch-wf-meta text-on-surface-variant mt-1">
              {{ tf('teacher.workflow.item.meta', { from: item.createTime || '—', to: item.endTime || '—' }) }}
            </p>
            <details v-if="item.opinion" class="tch-wf-opinion mt-2">
              <summary class="tch-wf-opinion-summary">
                <span>{{ t('teacher.workflow.item.opinion') }}</span>
                <span class="material-symbols-outlined text-[14px] tch-wf-opinion-icon" aria-hidden="true">expand_more</span>
              </summary>
              <p class="tch-wf-opinion-body">{{ item.opinion }}</p>
            </details>
            <p class="tch-wf-footnote">{{ t('teacher.workflow.item.webOnly') }}</p>
          </article>
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

<style src="../../../styles/views/TeacherWorkflow.scoped.css" scoped></style>
