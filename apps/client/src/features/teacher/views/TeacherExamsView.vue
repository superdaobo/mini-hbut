<script setup lang="ts">
// TeacherExamsView（E6 #1026）：教师「考试与监考」——监考安排 / 教学班考试（只读）。
//
// 设计约束：
//   - 双标签数据来自两个实测只读接口（监考 1 条 / 任课班考试 1 条）；
//   - **只展示 recon 05 已实测字段**；未实测字段（`ypjks`/`txbz`/`gld`/`syrl`/`skyx`/`sjbh`
//     及 `qssj`/`jssj`）**一律不展示**，避免臆造；
//   - 日期 / 地点 / 监考身份 / 教学班信息按**逐条源记录**渲染，绝不跨记录拼接；
//   - 错误按 kind 映射 i18n 文案，不直接展示后端 message；
//   - 复用考试卡片与时间筛选的通用展示语言，不复制学生 ExamView 的请求 / 状态机。
import { computed, onMounted, ref } from 'vue'

import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import {
  filterByTimeline,
  isExamPast,
  useTeacherExams,
  type TeacherExamFilter
} from '../composables/useTeacherExams'
import type { Invigilation, TeacherExam } from '../types'

const emit = defineEmits<{ (e: 'back'): void }>()

const { t } = useI18n()
const auth = useAuthStore()

type ExamsTab = 'invigilations' | 'exams'
const activeTab = ref<ExamsTab>('invigilations')
const timelineFilter = ref<TeacherExamFilter>('all')

const {
  semester,
  invigilations,
  exams,
  reminderEvents,
  isLoading,
  isError,
  errorKey,
  load,
  setSemester,
  retry
} = useTeacherExams({ accountId: () => auth.studentId })

const semesterDraft = ref(semester.value)

const visibleInvigilations = computed<Invigilation[]>(() =>
  filterByTimeline(invigilations.value, timelineFilter.value, (item) => item.ksrq ?? '')
)
const visibleExams = computed<TeacherExam[]>(() =>
  filterByTimeline(exams.value, timelineFilter.value, (item) => item.ksrq ?? '')
)

const isPastInvigilation = (item: Invigilation): boolean => isExamPast(item.ksrq ?? '')
const isPastExam = (exam: TeacherExam): boolean => isExamPast(exam.ksrq ?? '')

const applySemester = async (): Promise<void> => {
  await setSemester(semesterDraft.value)
  semesterDraft.value = semester.value
}

const reload = async (): Promise<void> => {
  await retry()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="teacher-exams" role="region" aria-labelledby="teacher-exams-title">
    <header class="teacher-exams__header">
      <button class="teacher-exams__back" type="button" @click="emit('back')">
        {{ t('teacher.exams.action.back') }}
      </button>
      <h2 id="teacher-exams-title" class="teacher-exams__title">
        {{ t('teacher.exams.title') }}
      </h2>
      <div class="teacher-exams__semester">
        <label class="teacher-exams__semester-label" for="teacher-exams-semester">
          {{ t('teacher.exams.semester.label') }}
        </label>
        <input
          id="teacher-exams-semester"
          v-model="semesterDraft"
          class="teacher-exams__semester-input"
          type="text"
          inputmode="numeric"
          :placeholder="t('teacher.exams.semester.placeholder')"
          @keyup.enter="applySemester"
        />
        <button class="teacher-exams__btn" type="button" @click="applySemester">
          {{ t('teacher.exams.semester.apply') }}
        </button>
        <button
          class="teacher-exams__btn teacher-exams__btn--ghost"
          type="button"
          :disabled="isLoading"
          @click="reload"
        >
          {{ t('teacher.exams.action.refresh') }}
        </button>
      </div>
    </header>

    <div class="teacher-exams__tabs" role="tablist" aria-label="exams tabs">
      <button
        class="teacher-exams__tab"
        :class="{ 'is-active': activeTab === 'invigilations' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'invigilations'"
        @click="activeTab = 'invigilations'"
      >
        {{ t('teacher.exams.tab.invigilations') }}
        <span class="teacher-exams__tab-count">{{ invigilations.length }}</span>
      </button>
      <button
        class="teacher-exams__tab"
        :class="{ 'is-active': activeTab === 'exams' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'exams'"
        @click="activeTab = 'exams'"
      >
        {{ t('teacher.exams.tab.exams') }}
        <span class="teacher-exams__tab-count">{{ exams.length }}</span>
      </button>
    </div>

    <!-- 时间筛选（复用考试通用展示语义：全部 / 未开始 / 已结束） -->
    <div v-if="!isLoading && !isError" class="teacher-exams__filters" role="group">
      <span class="teacher-exams__filters-label">{{ t('teacher.exams.filter.label') }}</span>
      <button
        v-for="option in (['all', 'upcoming', 'past'] as TeacherExamFilter[])"
        :key="option"
        class="teacher-exams__chip"
        :class="{ 'is-active': timelineFilter === option }"
        type="button"
        @click="timelineFilter = option"
      >
        {{ t(`teacher.exams.filter.${option}`) }}
      </button>
    </div>

    <p v-if="isLoading" class="teacher-exams__state" role="status" aria-live="polite">
      {{ t('teacher.exams.loading') }}
    </p>

    <div v-else-if="isError" class="teacher-exams__state teacher-exams__state--error" role="alert">
      <p>{{ t(errorKey) }}</p>
      <button class="teacher-exams__btn" type="button" @click="reload">
        {{ t('teacher.exams.action.retry') }}
      </button>
    </div>

    <!-- 监考安排 -->
    <div v-else-if="activeTab === 'invigilations'" class="teacher-exams__panel" role="tabpanel">
      <p v-if="reminderEvents.length > 0" class="teacher-exams__hint">
        {{ tf('teacher.exams.reminder.ready', { n: reminderEvents.length }) }}
      </p>
      <p v-if="visibleInvigilations.length === 0" class="teacher-exams__state">
        {{ t('teacher.exams.empty.invigilations') }}
      </p>
      <ul v-else class="teacher-exams__grid">
        <li v-for="item in visibleInvigilations" :key="item.id" class="teacher-exams__card">
          <article class="teacher-exams__card-inner" :class="{ 'is-past': isPastInvigilation(item) }">
            <div class="teacher-exams__card-head">
              <h3 class="teacher-exams__card-course">{{ item.kcmc }}</h3>
              <span v-if="isPastInvigilation(item)" class="teacher-exams__badge">
                {{ t('teacher.exams.status.past') }}
              </span>
              <span v-else-if="item.zjk" class="teacher-exams__badge teacher-exams__badge--role">
                {{ item.zjk }}
              </span>
            </div>
            <dl class="teacher-exams__fields">
              <div v-if="item.ksrq" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.date') }}</dt>
                <dd>{{ item.ksrq }}</dd>
              </div>
              <div v-if="item.kscc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.session') }}</dt>
                <dd>{{ item.kscc }}</dd>
              </div>
              <div v-if="item.jsmc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.room') }}</dt>
                <dd>{{ item.jsmc }}</dd>
              </div>
              <div v-if="item.xqmc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.campus') }}</dt>
                <dd>{{ item.xqmc }}</dd>
              </div>
              <div v-if="item.zjk" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.role') }}</dt>
                <dd>{{ item.zjk }}</dd>
              </div>
              <div v-if="item.ksrs !== undefined" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.examCount') }}</dt>
                <dd>{{ item.ksrs }} {{ t('teacher.exams.unit.people') }}</dd>
              </div>
              <div v-if="item.ksbj" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.examClass') }}</dt>
                <dd>{{ item.ksbj }}</dd>
              </div>
              <div v-if="item.kspcmc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.batch') }}</dt>
                <dd>{{ item.kspcmc }}</dd>
              </div>
              <div v-if="item.ksfs" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.examMethod') }}</dt>
                <dd>{{ item.ksfs }}</dd>
              </div>
              <div v-if="item.kkyx" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.college') }}</dt>
                <dd>{{ item.kkyx }}</dd>
              </div>
              <div v-if="item.jkjsxm" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.invigilators') }}</dt>
                <dd>{{ item.jkjsxm }}</dd>
              </div>
            </dl>
          </article>
        </li>
      </ul>
    </div>

    <!-- 教学班考试 -->
    <div v-else class="teacher-exams__panel" role="tabpanel">
      <p v-if="visibleExams.length === 0" class="teacher-exams__state">
        {{ t('teacher.exams.empty.exams') }}
      </p>
      <ul v-else class="teacher-exams__grid">
        <li v-for="exam in visibleExams" :key="exam.id" class="teacher-exams__card">
          <article class="teacher-exams__card-inner" :class="{ 'is-past': isPastExam(exam) }">
            <div class="teacher-exams__card-head">
              <h3 class="teacher-exams__card-course">{{ exam.kcmc }}</h3>
              <span v-if="isPastExam(exam)" class="teacher-exams__badge">
                {{ t('teacher.exams.status.past') }}
              </span>
            </div>
            <dl class="teacher-exams__fields">
              <div v-if="exam.ksrq" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.date') }}</dt>
                <dd>{{ exam.ksrq }}</dd>
              </div>
              <div v-if="exam.kssj" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.time') }}</dt>
                <dd>{{ exam.kssj }}</dd>
              </div>
              <div v-if="exam.jsmc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.room') }}</dt>
                <dd>{{ exam.jsmc }}</dd>
              </div>
              <div v-if="exam.jxbmc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.teachingClass') }}</dt>
                <dd>{{ exam.jxbmc }}</dd>
              </div>
              <div v-if="exam.bjmc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.className') }}</dt>
                <dd>{{ exam.bjmc }}</dd>
              </div>
              <div v-if="exam.jsname" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.teacher') }}</dt>
                <dd>{{ exam.jsname }}</dd>
              </div>
              <div v-if="exam.jkjs" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.invigilators') }}</dt>
                <dd>{{ exam.jkjs }}</dd>
              </div>
              <div v-if="exam.ksrs !== undefined" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.examCount') }}</dt>
                <dd>{{ exam.ksrs }} {{ t('teacher.exams.unit.people') }}</dd>
              </div>
              <div v-if="exam.kspcmc" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.batch') }}</dt>
                <dd>{{ exam.kspcmc }}</dd>
              </div>
              <div v-if="exam.kkyx" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.college') }}</dt>
                <dd>{{ exam.kkyx }}</dd>
              </div>
              <div v-if="exam.kcbh" class="teacher-exams__row">
                <dt>{{ t('teacher.exams.field.courseCode') }}</dt>
                <dd>{{ exam.kcbh }}</dd>
              </div>
            </dl>
          </article>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.teacher-exams {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.teacher-exams__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.teacher-exams__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  flex: 1 1 auto;
}

.teacher-exams__semester {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.teacher-exams__semester-label {
  font-size: 12px;
  color: #9ca3af;
}

.teacher-exams__semester-input {
  width: 130px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  font-size: 13px;
  background: var(--surface, #fff);
  color: var(--text-primary, #111827);
}

.teacher-exams__btn {
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

.teacher-exams__btn--ghost {
  background: transparent;
  border: 1px solid #d1d5db;
  color: var(--text-secondary, #4b5563);
}

.teacher-exams__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.teacher-exams__back {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, #4b5563);
  font-size: 13px;
  cursor: pointer;
}

.teacher-exams__tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.teacher-exams__tab {
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

.teacher-exams__tab.is-active {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
}

.teacher-exams__tab-count {
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

.teacher-exams__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.teacher-exams__filters-label {
  font-size: 12px;
  color: #9ca3af;
}

.teacher-exams__chip {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: transparent;
  color: var(--text-secondary, #4b5563);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.teacher-exams__chip.is-active {
  background: rgba(37, 99, 235, 0.12);
  border-color: #1d4ed8;
  color: #1d4ed8;
}

.teacher-exams__state {
  margin: 0;
  padding: 24px 8px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}

.teacher-exams__hint {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.06);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 500;
}

.teacher-exams__state--error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #b91c1c;
}

.teacher-exams__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.teacher-exams__card {
  display: flex;
}

.teacher-exams__card-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: var(--surface, #fff);
}

.teacher-exams__card-inner.is-past {
  opacity: 0.7;
}

.teacher-exams__card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.teacher-exams__card-course {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  word-break: break-word;
}

.teacher-exams__badge {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6b7280;
}

.teacher-exams__badge--role {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.teacher-exams__fields {
  margin: 0;
  display: grid;
  gap: 6px;
}

.teacher-exams__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px dashed #eef2f7;
  padding-bottom: 5px;
}

.teacher-exams__row dt {
  color: #9ca3af;
  font-size: 12px;
}

.teacher-exams__row dd {
  margin: 0;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  max-width: 68%;
  word-break: break-word;
}
</style>
