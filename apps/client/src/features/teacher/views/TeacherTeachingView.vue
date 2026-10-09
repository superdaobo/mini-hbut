<script setup lang="ts">
// TeacherTeachingView（E5 #1025）：教师「我的教学」——教学任务 / 我的教学班（只读）。
//
// 设计约束：
//   - 两个标签数据粒度不同（实测 6 条任务 / 4 个教学班），**只按 `jxbid` 关联**，
//     视图不做任何数组索引拼接；
//   - 只展示教务真实返回的字段（实测字段），编码型字段（`ksxs` / `cjfbzt` / `bkbj`）
//     含义未经确认，**不展示**，避免臆造；
//   - 错误按 kind 映射 i18n 文案，不直接展示后端 message；
//   - 复用课表域课程卡片的视觉语言（卡片 / 网格 / 只读详情），不复制 ScheduleView。
import { computed, onMounted, ref } from 'vue'

import { useI18n } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import { useTeacherTeaching } from '../composables/useTeacherTeaching'
import type { TeachingClass, TeachingTask } from '../types'

const emit = defineEmits<{ (e: 'back'): void }>()

const { t } = useI18n()
const auth = useAuthStore()

type TeachingTab = 'tasks' | 'classes'
const activeTab = ref<TeachingTab>('tasks')
const selectedTask = ref<TeachingTask | null>(null)
const selectedClass = ref<TeachingClass | null>(null)

const {
  semester,
  tasks,
  classes,
  links,
  isLoading,
  isError,
  errorKey,
  load,
  setSemester,
  retry
} = useTeacherTeaching({ accountId: () => auth.studentId })

const semesterDraft = ref(semester.value)

const openTask = (task: TeachingTask): void => {
  selectedTask.value = task
}
const openClass = (cls: TeachingClass): void => {
  selectedClass.value = cls
}
const closeDetail = (): void => {
  selectedTask.value = null
  selectedClass.value = null
}

/** 任务详情中按 `jxbid` 关联到的教学班（无匹配为 null，不猜别的班）。 */
const selectedLinkedClass = computed<TeachingClass | null>(() => {
  const task = selectedTask.value
  if (!task) return null
  return links.value.find((link) => link.task.id === task.id)?.linkedClass ?? null
})

const showDetail = computed(() => selectedTask.value !== null || selectedClass.value !== null)

const applySemester = async (): Promise<void> => {
  await setSemester(semesterDraft.value)
  semesterDraft.value = semester.value
  closeDetail()
}

const reload = async (): Promise<void> => {
  closeDetail()
  await retry()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="teacher-teaching" role="region" aria-labelledby="teacher-teaching-title">
    <header class="teacher-teaching__header">
      <button class="teacher-teaching__back" type="button" @click="emit('back')">
        {{ t('teacher.teaching.action.back') }}
      </button>
      <h2 id="teacher-teaching-title" class="teacher-teaching__title">
        {{ t('teacher.teaching.title') }}
      </h2>
      <div class="teacher-teaching__semester">
        <label class="teacher-teaching__semester-label" for="teacher-teaching-semester">
          {{ t('teacher.teaching.semester.label') }}
        </label>
        <input
          id="teacher-teaching-semester"
          v-model="semesterDraft"
          class="teacher-teaching__semester-input"
          type="text"
          inputmode="numeric"
          :placeholder="t('teacher.teaching.semester.placeholder')"
          @keyup.enter="applySemester"
        />
        <button class="teacher-teaching__btn" type="button" @click="applySemester">
          {{ t('teacher.teaching.semester.apply') }}
        </button>
        <button
          class="teacher-teaching__btn teacher-teaching__btn--ghost"
          type="button"
          :disabled="isLoading"
          @click="reload"
        >
          {{ t('teacher.teaching.action.refresh') }}
        </button>
      </div>
    </header>

    <div v-if="!showDetail" class="teacher-teaching__tabs" role="tablist" aria-label="teaching tabs">
      <button
        class="teacher-teaching__tab"
        :class="{ 'is-active': activeTab === 'tasks' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'tasks'"
        @click="activeTab = 'tasks'"
      >
        {{ t('teacher.teaching.tab.tasks') }}
        <span class="teacher-teaching__tab-count">{{ tasks.length }}</span>
      </button>
      <button
        class="teacher-teaching__tab"
        :class="{ 'is-active': activeTab === 'classes' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'classes'"
        @click="activeTab = 'classes'"
      >
        {{ t('teacher.teaching.tab.classes') }}
        <span class="teacher-teaching__tab-count">{{ classes.length }}</span>
      </button>
    </div>

    <p v-if="isLoading" class="teacher-teaching__state" role="status" aria-live="polite">
      {{ t('teacher.teaching.loading') }}
    </p>

    <div v-else-if="isError" class="teacher-teaching__state teacher-teaching__state--error" role="alert">
      <p>{{ t(errorKey) }}</p>
      <button class="teacher-teaching__btn" type="button" @click="reload">
        {{ t('teacher.teaching.action.retry') }}
      </button>
    </div>

    <!-- 详情（只读）：清晰展示真实字段，并可返回列表 -->
    <div v-else-if="showDetail" class="teacher-teaching__detail" role="region">
      <div class="teacher-teaching__detail-head">
        <h3 class="teacher-teaching__detail-title">
          {{ selectedTask ? selectedTask.kcmc : selectedClass?.kcmc }}
        </h3>
        <button class="teacher-teaching__btn teacher-teaching__btn--ghost" type="button" @click="closeDetail">
          {{ t('teacher.teaching.action.backToList') }}
        </button>
      </div>

      <dl v-if="selectedTask" class="teacher-teaching__fields">
        <div class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.courseName') }}</dt>
          <dd>{{ selectedTask.kcmc }}</dd>
        </div>
        <div class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.className') }}</dt>
          <dd>{{ selectedTask.name }}</dd>
        </div>
        <div v-if="selectedTask.jxbzc" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.classComposition') }}</dt>
          <dd>{{ selectedTask.jxbzc }}</dd>
        </div>
        <div v-if="selectedTask.bjrs !== undefined" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.classSize') }}</dt>
          <dd>{{ selectedTask.bjrs }}</dd>
        </div>
        <div v-if="selectedTask.xf" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.credit') }}</dt>
          <dd>{{ selectedTask.xf }}</dd>
        </div>
        <div v-if="selectedTask.xnxq" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.semester') }}</dt>
          <dd>{{ selectedTask.xnxq }}</dd>
        </div>
      </dl>

      <dl v-else-if="selectedClass" class="teacher-teaching__fields">
        <div class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.courseName') }}</dt>
          <dd>{{ selectedClass.kcmc }}</dd>
        </div>
        <div class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.className') }}</dt>
          <dd>{{ selectedClass.name }}</dd>
        </div>
        <div v-if="selectedClass.kcbh" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.courseCode') }}</dt>
          <dd>{{ selectedClass.kcbh }}</dd>
        </div>
        <div v-if="selectedClass.jxbzc" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.classComposition') }}</dt>
          <dd>{{ selectedClass.jxbzc }}</dd>
        </div>
        <div v-if="selectedClass.bjrs !== undefined" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.classSize') }}</dt>
          <dd>{{ selectedClass.bjrs }}</dd>
        </div>
        <div v-if="selectedClass.xs" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.hours') }}</dt>
          <dd>{{ selectedClass.xs }}</dd>
        </div>
        <div v-if="selectedClass.xf" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.credit') }}</dt>
          <dd>{{ selectedClass.xf }}</dd>
        </div>
        <div v-if="selectedClass.kkyxmc" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.college') }}</dt>
          <dd>{{ selectedClass.kkyxmc }}</dd>
        </div>
        <div v-if="selectedClass.xnxq" class="teacher-teaching__row">
          <dt>{{ t('teacher.teaching.field.semester') }}</dt>
          <dd>{{ selectedClass.xnxq }}</dd>
        </div>
      </dl>

      <!-- 教学任务详情：展示按 jxbid 关联到的教学班补充信息（无匹配时明确说明） -->
      <section v-if="selectedTask" class="teacher-teaching__linked">
        <h4 class="teacher-teaching__linked-title">{{ t('teacher.teaching.detail.linkedClass') }}</h4>
        <p v-if="!selectedLinkedClass" class="teacher-teaching__linked-empty">
          {{ t('teacher.teaching.detail.noLinkedClass') }}
        </p>
        <dl v-else class="teacher-teaching__fields">
          <div class="teacher-teaching__row">
            <dt>{{ t('teacher.teaching.field.className') }}</dt>
            <dd>{{ selectedLinkedClass.name }}</dd>
          </div>
          <div v-if="selectedLinkedClass.kcbh" class="teacher-teaching__row">
            <dt>{{ t('teacher.teaching.field.courseCode') }}</dt>
            <dd>{{ selectedLinkedClass.kcbh }}</dd>
          </div>
          <div v-if="selectedLinkedClass.xs" class="teacher-teaching__row">
            <dt>{{ t('teacher.teaching.field.hours') }}</dt>
            <dd>{{ selectedLinkedClass.xs }}</dd>
          </div>
          <div v-if="selectedLinkedClass.kkyxmc" class="teacher-teaching__row">
            <dt>{{ t('teacher.teaching.field.college') }}</dt>
            <dd>{{ selectedLinkedClass.kkyxmc }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <!-- 列表：教学任务 -->
    <div v-else-if="activeTab === 'tasks'" class="teacher-teaching__panel" role="tabpanel">
      <p v-if="tasks.length === 0" class="teacher-teaching__state">
        {{ t('teacher.teaching.empty.tasks') }}
      </p>
      <ul v-else class="teacher-teaching__grid">
        <li v-for="link in links" :key="link.task.id" class="teacher-teaching__card">
          <button class="teacher-teaching__card-btn" type="button" @click="openTask(link.task)">
            <span class="teacher-teaching__card-course">{{ link.task.kcmc }}</span>
            <span class="teacher-teaching__card-class">{{ link.task.name }}</span>
            <span class="teacher-teaching__card-meta">
              <span v-if="link.task.bjrs !== undefined">
                {{ link.task.bjrs }} {{ t('teacher.teaching.unit.people') }}
              </span>
              <span v-if="link.task.xf">{{ link.task.xf }} {{ t('teacher.teaching.unit.credit') }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <!-- 列表：我的教学班 -->
    <div v-else class="teacher-teaching__panel" role="tabpanel">
      <p v-if="classes.length === 0" class="teacher-teaching__state">
        {{ t('teacher.teaching.empty.classes') }}
      </p>
      <ul v-else class="teacher-teaching__grid">
        <li v-for="cls in classes" :key="cls.id" class="teacher-teaching__card">
          <button class="teacher-teaching__card-btn" type="button" @click="openClass(cls)">
            <span class="teacher-teaching__card-course">{{ cls.kcmc }}</span>
            <span class="teacher-teaching__card-class">{{ cls.name }}</span>
            <span class="teacher-teaching__card-meta">
              <span v-if="cls.bjrs !== undefined">
                {{ cls.bjrs }} {{ t('teacher.teaching.unit.people') }}
              </span>
              <span v-if="cls.xs">{{ cls.xs }} {{ t('teacher.teaching.unit.hours') }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.teacher-teaching {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.teacher-teaching__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.teacher-teaching__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  flex: 1 1 auto;
}

.teacher-teaching__semester {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.teacher-teaching__semester-label {
  font-size: 12px;
  color: #9ca3af;
}

.teacher-teaching__semester-input {
  width: 130px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  font-size: 13px;
  background: var(--surface, #fff);
  color: var(--text-primary, #111827);
}

.teacher-teaching__btn {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.teacher-teaching__btn--ghost {
  background: transparent;
  border: 1px solid #d1d5db;
  color: var(--text-secondary, #4b5563);
}

.teacher-teaching__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.teacher-teaching__back {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, #4b5563);
  font-size: 13px;
  cursor: pointer;
}

.teacher-teaching__tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.teacher-teaching__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
}

.teacher-teaching__tab.is-active {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
}

.teacher-teaching__tab-count {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  font-size: 11px;
  padding: 0 6px;
}

.teacher-teaching__state {
  margin: 0;
  padding: 24px 8px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}

.teacher-teaching__state--error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #b91c1c;
}

.teacher-teaching__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.teacher-teaching__card {
  display: flex;
}

.teacher-teaching__card-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: var(--surface, #fff);
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.teacher-teaching__card-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}

.teacher-teaching__card-course {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.teacher-teaching__card-class {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.teacher-teaching__card-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #1d4ed8;
  font-weight: 600;
}

.teacher-teaching__detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.teacher-teaching__detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.teacher-teaching__detail-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.teacher-teaching__fields {
  margin: 0;
  display: grid;
  gap: 8px;
}

.teacher-teaching__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px dashed #eef2f7;
  padding-bottom: 6px;
}

.teacher-teaching__row dt {
  color: #9ca3af;
  font-size: 13px;
}

.teacher-teaching__row dd {
  margin: 0;
  color: #374151;
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  max-width: 70%;
  word-break: break-word;
}

.teacher-teaching__linked {
  margin-top: 4px;
  padding: 12px;
  border: 1px solid #e0e7ff;
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.04);
}

.teacher-teaching__linked-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #1d4ed8;
}

.teacher-teaching__linked-empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}
</style>
