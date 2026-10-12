<script setup lang="ts">
// 考试与监考仅取教师只读接口，复用学生考试页的标题/筛选/卡片和统一详情弹窗。
import { computed, onMounted, ref, watch } from 'vue'
import { TCard, TEmptyState, TPageHeader } from '../../../components/templates'
import IOSSelect from '../../../components/IOSSelect.vue'
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import { filterByTimeline, isExamPast, useTeacherExams, type TeacherExamFilter } from '../composables/useTeacherExams'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherRecordDetail, { type TeacherDetailRow } from '../components/TeacherRecordDetail.vue'
import type { Invigilation, TeacherExam } from '../types'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()
type ExamsTab = 'invigilations' | 'exams'
const activeTab = ref<ExamsTab>('invigilations')
const timelineFilter = ref<TeacherExamFilter>('all')
const selectedInvigilation = ref<Invigilation | null>(null)
const selectedExam = ref<TeacherExam | null>(null)
const { semester, invigilations, exams, reminderEvents, isLoading, isError, errorKey, load, setSemester, retry } =
  useTeacherExams({ accountId: () => resolveTeacherAccountId(auth.studentId) })
const semesterDraft = ref(semester.value)
watch(semester, (value) => { semesterDraft.value = value })
const semesters = computed(() => teacherSemesterOptions(semesterDraft.value))
const visibleInvigilations = computed(() =>
  filterByTimeline(invigilations.value, timelineFilter.value, (item) => item.ksrq ?? '')
)
const visibleExams = computed(() =>
  filterByTimeline(exams.value, timelineFilter.value, (item) => item.ksrq ?? '')
)
const isPastInvigilation = (item: Invigilation): boolean => isExamPast(item.ksrq ?? '')
const isPastExam = (item: TeacherExam): boolean => isExamPast(item.ksrq ?? '')
const openInvigilation = (item: Invigilation): void => {
  selectedInvigilation.value = item
  selectedExam.value = null
}
const openExam = (item: TeacherExam): void => {
  selectedExam.value = item
  selectedInvigilation.value = null
}
const closeDetail = (): void => { selectedInvigilation.value = null; selectedExam.value = null }
const showDetail = computed(() => selectedInvigilation.value !== null || selectedExam.value !== null)
const selectedTitle = computed(() => selectedInvigilation.value?.kcmc || selectedExam.value?.kcmc || '')
const detailRows = computed<TeacherDetailRow[]>(() => {
  const inv = selectedInvigilation.value
  const exam = selectedExam.value
  if (inv) return [
    { key: 'course', label: t('teacher.exams.field.courseName'), value: inv.kcmc },
    { key: 'date', label: t('teacher.exams.field.date'), value: inv.ksrq },
    { key: 'session', label: t('teacher.exams.field.session'), value: inv.kscc },
    { key: 'room', label: t('teacher.exams.field.room'), value: inv.jsmc },
    { key: 'role', label: t('teacher.exams.field.role'), value: inv.zjk },
    { key: 'count', label: t('teacher.exams.field.examCount'), value: inv.ksrs }
  ]
  if (exam) return [
    { key: 'course', label: t('teacher.exams.field.courseName'), value: exam.kcmc },
    { key: 'date', label: t('teacher.exams.field.date'), value: exam.ksrq },
    { key: 'time', label: t('teacher.exams.field.time'), value: exam.kssj },
    { key: 'room', label: t('teacher.exams.field.room'), value: exam.jsmc },
    { key: 'class', label: t('teacher.exams.field.teachingClass'), value: exam.jxbmc },
    { key: 'count', label: t('teacher.exams.field.examCount'), value: exam.ksrs }
  ]
  return []
})
const extraRows = computed<TeacherDetailRow[]>(() => {
  const inv = selectedInvigilation.value
  const exam = selectedExam.value
  if (inv) return [
    { key: 'campus', label: t('teacher.exams.field.campus'), value: inv.xqmc },
    { key: 'batch', label: t('teacher.exams.field.batch'), value: inv.kspcmc },
    { key: 'examClass', label: t('teacher.exams.field.examClass'), value: inv.ksbj },
    { key: 'type', label: t('teacher.exams.field.examMethod'), value: inv.ksfs },
    { key: 'staff', label: t('teacher.exams.field.invigilators'), value: inv.jkjsxm },
    { key: 'college', label: t('teacher.exams.field.college'), value: inv.kkyx }
  ]
  if (exam) return [
    { key: 'className', label: t('teacher.exams.field.className'), value: exam.bjmc },
    { key: 'teacher', label: t('teacher.exams.field.teacher'), value: exam.jsname },
    { key: 'staff', label: t('teacher.exams.field.invigilators'), value: exam.jkjs },
    { key: 'batch', label: t('teacher.exams.field.batch'), value: exam.kspcmc },
    { key: 'college', label: t('teacher.exams.field.college'), value: exam.kkyx },
    { key: 'code', label: t('teacher.exams.field.courseCode'), value: exam.kcbh }
  ]
  return []
})
const applySemester = async (): Promise<void> => {
  if (semesterDraft.value === semester.value) return
  await setSemester(semesterDraft.value)
  closeDetail()
}
const reload = async (): Promise<void> => { await retry() }
onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface max-w-[448px] mx-auto pb-24">
    <TPageHeader :title="t('teacher.exams.title')" icon="edit_calendar" @back="emit('back')">
      <template #actions>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.exams.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="p-4 space-y-4">
      <TCard compact>
        <label class="block text-xs font-semibold text-on-surface-variant mb-2">
          {{ t('teacher.exams.semester.label') }}
        </label>
        <IOSSelect v-model="semesterDraft" :disabled="isLoading" :title="t('teacher.exams.semester.label')"
          class="w-full text-sm text-on-surface font-medium" @change="applySemester">
          <option v-for="value in semesters" :key="value" :value="value">{{ value }}</option>
        </IOSSelect>
      </TCard>

      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="w-full rounded-2xl bg-surface-container-high p-1" :aria-label="t('teacher.exams.title')">
          <TabsTrigger value="invigilations" class="flex-1 rounded-xl">
            {{ t('teacher.exams.tab.invigilations') }} ({{ invigilations.length }})
          </TabsTrigger>
          <TabsTrigger value="exams" class="flex-1 rounded-xl">
            {{ t('teacher.exams.tab.exams') }} ({{ exams.length }})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('teacher.exams.filter.label')">
        <button v-for="value in (['all', 'upcoming', 'past'] as TeacherExamFilter[])" :key="value"
          type="button" :aria-pressed="timelineFilter === value" @click="timelineFilter = value"
          class="px-3 py-1.5 rounded-full text-xs font-semibold border border-outline-variant/40 transition-colors"
          :class="timelineFilter === value ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'">
          {{ t('teacher.exams.filter.' + value) }}
        </button>
      </div>

      <TEmptyState v-if="isLoading" type="loading" :message="t('teacher.exams.loading')" />
      <TEmptyState v-else-if="isError" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.exams.action.retry') }}
        </button>
      </TEmptyState>

      <template v-else-if="activeTab === 'invigilations'">
        <p v-if="reminderEvents.length" class="text-xs text-on-surface-variant">
          {{ tf('teacher.exams.reminder.ready', { n: reminderEvents.length }) }}
        </p>
        <TEmptyState v-if="!visibleInvigilations.length" :message="t('teacher.exams.empty.invigilations')" />
        <ul v-else class="space-y-3">
          <li v-for="item in visibleInvigilations" :key="item.id">
            <TCard compact hoverable>
              <button type="button" class="w-full text-left flex items-center gap-3 min-w-0"
                :aria-label="item.kcmc + ' ' + t('teacher.detail.view')" @click="openInvigilation(item)">
                <span class="min-w-0 flex-1">
                  <span class="block font-bold text-on-surface truncate">{{ item.kcmc }}</span>
                  <span class="block text-sm text-on-surface-variant mt-1">
                    {{ [item.ksrq, item.kscc, item.jsmc].filter(Boolean).join(' · ') }}
                  </span>
                  <span class="block text-xs text-on-surface-variant mt-2">
                    {{ item.zjk || t('teacher.exams.tab.invigilations') }}
                    <span v-if="isPastInvigilation(item)" class="ml-2">{{ t('teacher.exams.status.past') }}</span>
                  </span>
                </span>
                <span class="material-symbols-outlined text-on-surface-variant text-lg" aria-hidden="true">chevron_right</span>
              </button>
            </TCard>
          </li>
        </ul>
      </template>
      <template v-else>
        <TEmptyState v-if="!visibleExams.length" :message="t('teacher.exams.empty.exams')" />
        <ul v-else class="space-y-3">
          <li v-for="item in visibleExams" :key="item.id">
            <TCard compact hoverable>
              <button type="button" class="w-full text-left flex items-center gap-3 min-w-0"
                :aria-label="item.kcmc + ' ' + t('teacher.detail.view')" @click="openExam(item)">
                <span class="min-w-0 flex-1">
                  <span class="block font-bold text-on-surface truncate">{{ item.kcmc }}</span>
                  <span class="block text-sm text-on-surface-variant mt-1">
                    {{ [item.ksrq, item.kssj, item.jsmc].filter(Boolean).join(' · ') }}
                  </span>
                  <span class="block text-xs text-on-surface-variant mt-2">
                    {{ item.jxbmc || item.bjmc }}
                    <span v-if="isPastExam(item)" class="ml-2">{{ t('teacher.exams.status.past') }}</span>
                  </span>
                </span>
                <span class="material-symbols-outlined text-on-surface-variant text-lg" aria-hidden="true">chevron_right</span>
              </button>
            </TCard>
          </li>
        </ul>
      </template>
    </main>

    <TeacherRecordDetail :visible="showDetail" :title="selectedTitle" :primary="detailRows"
      :extra="extraRows" @close="closeDetail" />
  </div>
</template>
