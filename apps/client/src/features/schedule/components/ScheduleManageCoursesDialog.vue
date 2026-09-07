<script setup>
/**
 * 自定义课程管理弹窗（按学期分组）。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 * #788 i18n：文案经 useI18n 响应式取词；星期标签改 getter 函数随渲染取词。
 */
import { computed } from 'vue'
import { getWeekDayLabels } from '../constants'
import { getCourseEndPeriod } from '../utils/layout'
import { useI18n } from '../../../utils/app_i18n'

defineProps({
  showManageCourses: { type: Boolean, default: false },
  loadingManageCourses: { type: Boolean, default: false },
  manageCoursesError: { type: String, default: '' },
  managedCourseGroups: { type: Array, default: () => [] },
  manageExpandedSemesters: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['close', 'toggle-semester', 'edit-course', 'delete-course'])

// 响应式 t：语言切换后弹窗文案即时生效
const { t } = useI18n()

// #788：星期标签随语言切换取最新词（getter 函数在渲染时调用）
const weekDayLabels = computed(() => getWeekDayLabels())
</script>

<template>
  <Transition name="fade">
    <div v-if="showManageCourses" class="modal-overlay" @click="emit('close')">
      <div class="modal-content glass manage-course-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ t('schedule.manageCourses.title') }}</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>
        <div class="modal-body manage-course-body">
          <div v-if="loadingManageCourses" class="manage-course-empty">{{ t('schedule.manageCourses.loading') }}</div>
          <div v-else-if="manageCoursesError" class="manage-course-error">{{ manageCoursesError }}</div>
          <div v-else-if="!managedCourseGroups.length" class="manage-course-empty">{{ t('schedule.manageCourses.empty') }}</div>
          <div v-else class="manage-course-groups">
            <section
              v-for="group in managedCourseGroups"
              :key="group.semester"
              class="manage-course-group"
            >
              <button class="manage-course-group-header" @click="emit('toggle-semester', group.semester)">
                <div class="manage-course-group-title">
                  <strong>{{ group.semester }}</strong>
                  <span>{{ t('schedule.manageCourses.courseCount').replace('{n}', String(group.courses.length)) }}</span>
                </div>
                <span class="manage-course-group-arrow">{{ manageExpandedSemesters[group.semester] ? t('schedule.manageCourses.collapse') : t('schedule.manageCourses.expand') }}</span>
              </button>
              <div v-if="manageExpandedSemesters[group.semester]" class="manage-course-list">
                <article
                  v-for="course in group.courses"
                  :key="`${group.semester}-${course.source_id || course.id}`"
                  class="manage-course-card"
                >
                  <div class="manage-course-card-main">
                    <div class="manage-course-card-name">{{ course.name }}</div>
                    <div class="manage-course-card-meta">
                      {{ t('schedule.manageCourses.timeMeta').replace('{day}', weekDayLabels[(course.weekday || 1) - 1]).replace('{s}', String(course.period)).replace('{e}', String(getCourseEndPeriod(course))) }}
                    </div>
                    <div class="manage-course-card-meta">{{ t('schedule.manageCourses.weeksMeta').replace('{t}', course.weeks_text) }}</div>
                    <div v-if="course.teacher || course.room" class="manage-course-card-meta">
                      {{ [course.teacher, course.room].filter(Boolean).join(' · ') }}
                    </div>
                  </div>
                  <div class="manage-course-card-actions">
                    <button class="manage-course-btn edit" @click="emit('edit-course', course)">{{ t('schedule.manageCourses.edit') }}</button>
                    <button class="manage-course-btn delete" @click="emit('delete-course', course)">{{ t('schedule.manageCourses.delete') }}</button>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style src="../styles/modal.css" scoped></style>
<style scoped>
.manage-course-modal {
  width: min(92vw, 560px);
  max-width: 560px;
}

.manage-course-body {
  max-height: min(72vh, 560px);
  overflow-y: auto;
  display: grid;
  gap: 12px;
}

.manage-course-empty,
.manage-course-error {
  border-radius: 12px;
  padding: 14px;
  font-size: 13px;
}

.manage-course-empty {
  background: #f0f9ff;
  color: #475569;
}

.manage-course-error {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #b91c1c;
}

.manage-course-groups {
  display: grid;
  gap: 12px;
}

.manage-course-group {
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  overflow: hidden;
}

.manage-course-group-header {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.manage-course-group-title {
  display: grid;
  gap: 2px;
  text-align: left;
}

.manage-course-group-title strong {
  font-size: 14px;
  color: #0f172a;
}

.manage-course-group-title span,
.manage-course-group-arrow {
  font-size: 12px;
  color: #64748b;
}

.manage-course-list {
  display: grid;
  gap: 10px;
  padding: 0 12px 12px;
}

.manage-course-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.manage-course-card-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.manage-course-card-name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.manage-course-card-meta {
  font-size: 12px;
  color: #475569;
}

.manage-course-card-actions {
  display: grid;
  gap: 8px;
}

.manage-course-btn {
  min-width: 76px;
  min-height: 34px;
  border: none;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.manage-course-btn.edit {
  background: #dbeafe;
  color: #1d4ed8;
}

.manage-course-btn.delete {
  background: #fee2e2;
  color: #b91c1c;
}
</style>
