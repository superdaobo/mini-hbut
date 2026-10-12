<script setup lang="ts">
// 教师教学沿用项目公共页头、学期选择器、分段标签和详情弹窗；数据源仍为教师只读接口。
import { computed, onMounted, ref, watch } from 'vue'
import { TCard, TEmptyState, TPageHeader } from '../../../components/templates'
import IOSSelect from '../../../components/IOSSelect.vue'
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { useI18n } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import { useTeacherTeaching } from '../composables/useTeacherTeaching'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherRecordDetail, { type TeacherDetailRow } from '../components/TeacherRecordDetail.vue'
import type { TeachingClass, TeachingTask } from '../types'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()
type TeachingTab = 'tasks' | 'classes'
const activeTab = ref<TeachingTab>('tasks')
const selectedTask = ref<TeachingTask | null>(null)
const selectedClass = ref<TeachingClass | null>(null)

const { semester, tasks, classes, links, isLoading, isError, errorKey, load, setSemester, retry } =
  useTeacherTeaching({ accountId: () => resolveTeacherAccountId(auth.studentId) })
const semesterDraft = ref(semester.value)
watch(semester, (value) => { semesterDraft.value = value })
const semesters = computed(() => teacherSemesterOptions(semesterDraft.value))
const showDetail = computed(() => selectedTask.value !== null || selectedClass.value !== null)
const selectedTitle = computed(() => selectedTask.value?.kcmc || selectedClass.value?.kcmc || '')
const selectedLinkedClass = computed<TeachingClass | null>(() => {
  const task = selectedTask.value
  return task ? links.value.find((item) => item.task.id === task.id)?.linkedClass ?? null : null
})

const openTask = (item: TeachingTask): void => { selectedTask.value = item; selectedClass.value = null }
const openClass = (item: TeachingClass): void => { selectedClass.value = item; selectedTask.value = null }
const closeDetail = (): void => { selectedTask.value = null; selectedClass.value = null }
const applySemester = async (): Promise<void> => {
  if (semesterDraft.value === semester.value) return
  await setSemester(semesterDraft.value)
  closeDetail()
}
const reload = async (): Promise<void> => { await retry() }

// 详情只显示已核实的教师数据字段；无关联教学班时明确标注，不跨班拼接。
const detailRows = computed<TeacherDetailRow[]>(() => {
  const data = selectedTask.value || selectedClass.value
  if (!data) return []
  return [
    { key: 'course', label: t('teacher.teaching.field.courseName'), value: data.kcmc },
    { key: 'class', label: t('teacher.teaching.field.className'), value: data.name },
    { key: 'people', label: t('teacher.teaching.field.classSize'), value: data.bjrs },
    { key: 'credit', label: t('teacher.teaching.field.credit'), value: data.xf }
  ]
})
const additionalRows = computed<TeacherDetailRow[]>(() => {
  const data = selectedTask.value || selectedClass.value
  if (!data) return []
  const cls = selectedLinkedClass.value
  return [
    { key: 'composition', label: t('teacher.teaching.field.classComposition'), value: data.jxbzc },
    { key: 'semester', label: t('teacher.teaching.field.semester'), value: data.xnxq },
    { key: 'courseCode', label: t('teacher.teaching.field.courseCode'), value: selectedClass.value?.kcbh || cls?.kcbh },
    { key: 'hours', label: t('teacher.teaching.field.hours'), value: selectedClass.value?.xs || cls?.xs },
    { key: 'college', label: t('teacher.teaching.field.college'), value: selectedClass.value?.kkyxmc || cls?.kkyxmc },
    ...(selectedTask.value ? [{
      key: 'linked', label: t('teacher.teaching.detail.linkedClass'),
      value: cls?.name || t('teacher.teaching.detail.noLinkedClass')
    }] : [])
  ]
})

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface max-w-[448px] mx-auto pb-24">
    <TPageHeader :title="t('teacher.teaching.title')" icon="school" @back="emit('back')">
      <template #actions>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.teaching.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="p-4 space-y-4">
      <TCard compact>
        <label class="block text-xs font-semibold text-on-surface-variant mb-2">
          {{ t('teacher.teaching.semester.label') }}
        </label>
        <IOSSelect v-model="semesterDraft" :disabled="isLoading" :title="t('teacher.teaching.semester.label')"
          class="w-full text-sm text-on-surface font-medium" @change="applySemester">
          <option v-for="value in semesters" :key="value" :value="value">{{ value }}</option>
        </IOSSelect>
      </TCard>

      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="w-full rounded-2xl bg-surface-container-high p-1" :aria-label="t('teacher.teaching.title')">
          <TabsTrigger value="tasks" class="flex-1 rounded-xl">
            {{ t('teacher.teaching.tab.tasks') }} ({{ tasks.length }})
          </TabsTrigger>
          <TabsTrigger value="classes" class="flex-1 rounded-xl">
            {{ t('teacher.teaching.tab.classes') }} ({{ classes.length }})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <TEmptyState v-if="isLoading" type="loading" :message="t('teacher.teaching.loading')" />
      <TEmptyState v-else-if="isError" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.teaching.action.retry') }}
        </button>
      </TEmptyState>

      <template v-else-if="activeTab === 'tasks'">
        <TEmptyState v-if="!tasks.length" :message="t('teacher.teaching.empty.tasks')" />
        <ul v-else class="space-y-3">
          <li v-for="link in links" :key="link.task.id">
            <TCard compact hoverable>
              <button type="button" class="w-full text-left flex items-center gap-3 min-w-0"
                :aria-label="link.task.kcmc + ' ' + t('teacher.detail.view')" @click="openTask(link.task)">
                <span class="flex-1 min-w-0">
                  <span class="block font-bold text-on-surface truncate">{{ link.task.kcmc }}</span>
                  <span class="block text-sm text-on-surface-variant mt-1 break-words">{{ link.task.name }}</span>
                  <span class="block text-xs text-on-surface-variant mt-2">
                    <span v-if="link.task.bjrs !== undefined">{{ link.task.bjrs }} {{ t('teacher.teaching.unit.people') }}</span>
                    <span v-if="link.task.xf" class="ml-2">{{ link.task.xf }} {{ t('teacher.teaching.unit.credit') }}</span>
                  </span>
                </span>
                <span class="material-symbols-outlined text-on-surface-variant text-lg" aria-hidden="true">chevron_right</span>
              </button>
            </TCard>
          </li>
        </ul>
      </template>
      <template v-else>
        <TEmptyState v-if="!classes.length" :message="t('teacher.teaching.empty.classes')" />
        <ul v-else class="space-y-3">
          <li v-for="item in classes" :key="item.id">
            <TCard compact hoverable>
              <button type="button" class="w-full text-left flex items-center gap-3 min-w-0"
                :aria-label="item.kcmc + ' ' + t('teacher.detail.view')" @click="openClass(item)">
                <span class="flex-1 min-w-0">
                  <span class="block font-bold text-on-surface truncate">{{ item.kcmc }}</span>
                  <span class="block text-sm text-on-surface-variant mt-1 break-words">{{ item.name }}</span>
                  <span class="block text-xs text-on-surface-variant mt-2">
                    <span v-if="item.bjrs !== undefined">{{ item.bjrs }} {{ t('teacher.teaching.unit.people') }}</span>
                    <span v-if="item.xs" class="ml-2">{{ item.xs }} {{ t('teacher.teaching.unit.hours') }}</span>
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
      :extra="additionalRows" @close="closeDetail" />
  </div>
</template>
