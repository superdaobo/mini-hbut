<script setup>
/**
 * 课程详情弹窗：单门课程信息 / 冲突详情 / 复制 / 编辑 / 删除。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 * #788 i18n：文案经 useI18n 响应式取词。
 */
import { computed, ref, watch } from 'vue'
import { getCourseEndPeriod } from '../utils/layout'
import { normalizeTeacherNames } from '../utils/teacherQuery'
import { useI18n } from '../../../utils/app_i18n'

const props = defineProps({
  showDetail: { type: Boolean, default: false },
  selectedCourse: { type: Object, default: null },
  selectedWeek: { type: Number, default: 0 },
  detailActionError: { type: String, default: '' },
})
const emit = defineEmits([
  'close',
  'open-conflict-course-detail',
  'open-edit-course',
  'delete-custom-course',
  'remove-official-course',
  'copy-detail',
  // #1321：教师快捷跳转给分记录（payload：{ teacher: 归一化后的单个教师姓名 }）
  'open-grade-distribution',
])

// 响应式 t：语言切换后详情文案即时生效
const { t } = useI18n()

const canRemoveCurrentWeek = computed(() => {
  const week = Number(props.selectedWeek || 0)
  const weeks = Array.isArray(props.selectedCourse?.weeks)
    ? props.selectedCourse.weeks.map((item) => Number(item))
    : []
  return Number.isInteger(week) && week > 0 && weeks.includes(week)
})

// ============ #1321 教师 → 给分记录快捷跳转 ============
// 归一化后的教师列表（为空视为教师无效，不渲染入口）
const teacherNames = computed(() => normalizeTeacherNames(props.selectedCourse?.teacher))
const hasTeacher = computed(() => teacherNames.value.length > 0)
// 多教师选择列表是否展开
const teacherPickerOpen = ref(false)

/** 主按钮点击：单教师 → 直接跳转；多教师 → 展开 / 收起选择列表 */
const handleTeacherGradeJump = () => {
  if (!hasTeacher.value) return
  if (teacherNames.value.length === 1) {
    emit('open-grade-distribution', { teacher: teacherNames.value[0] })
    return
  }
  teacherPickerOpen.value = !teacherPickerOpen.value
}

/** 选择列表项点击：emit 所选教师并收起列表 */
const pickTeacherForGrade = (name) => {
  teacherPickerOpen.value = false
  emit('open-grade-distribution', { teacher: name })
}

// 详情弹窗关闭时重置选择列表状态，避免残留到下一门课程
watch(() => props.showDetail, (open) => {
  if (!open) teacherPickerOpen.value = false
})

/**
 * 入口的 aria-label / title 文案：
 * 多教师时点击是「展开选择列表」，若仍念第一位姓名会误导读屏用户，因此改用选择提示。
 * 用普通函数而非 computed：与模板里其它 t() 一致，每次渲染重新取词。
 */
const teacherGradeLabel = () => {
  const names = teacherNames.value
  return names.length > 1
    ? t('schedule.detail.teacherPickerTitle')
    : t('schedule.detail.gradeDistributionTitle').replace('{name}', names[0] || '')
}
</script>

<template>
  <Transition name="fade">
    <div v-if="showDetail" class="modal-overlay" @click="emit('close')">
      <div class="modal-content glass" @click.stop>
        <div class="modal-header">
          <h3>{{ selectedCourse?.name }}</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>
        <div v-if="selectedCourse?.is_conflict" class="modal-body">
          <div class="conflict-hint">{{ t('schedule.detail.conflictBannerHint') }}</div>
          <div
            v-for="(item, idx) in selectedCourse?.conflict_courses || []"
            :key="`${item.id || item.name}-${idx}`"
            class="conflict-item"
            :class="{ clickable: item.is_custom }"
            @click="item.is_custom && emit('open-conflict-course-detail', item)"
          >
            <div class="conflict-item-title">
              {{ idx + 1 }}. {{ item.name }}
              <span v-if="item.is_custom" class="conflict-tag">{{ t('schedule.detail.tag.custom') }}</span>
            </div>
            <div class="conflict-item-row">{{ t('schedule.detail.teacher') }}：{{ item.teacher || t('schedule.detail.teacherNotFilled') }}</div>
            <div class="conflict-item-row">
              {{ t('schedule.detail.location') }}：{{ [item.building, item.room || item.room_code].filter(Boolean).join(' ') || t('schedule.detail.locationNotFilled') }}
            </div>
            <div class="conflict-item-row">
              {{ t('schedule.detail.time') }}：{{ t('schedule.detail.conflictPeriod').replace('{n}', String(item.weekday)).replace('{s}', String(item.period)).replace('{e}', String(getCourseEndPeriod(item))) }}
            </div>
          </div>
        </div>
        <div v-else class="modal-body">
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.type') }}</span>
            <span class="value">{{ selectedCourse?.is_custom ? t('schedule.detail.typeCustom') : t('schedule.detail.typeOfficial') }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.teacher') }}</span>
            <span class="value">
              {{ selectedCourse?.teacher }}
              <button
                v-if="hasTeacher"
                type="button"
                class="teacher-grade-pill"
                :aria-label="teacherGradeLabel()"
                :title="teacherGradeLabel()"
                @click="handleTeacherGradeJump"
              >
                <!-- 与首页模块图标同一套 Material Symbols（bar_chart 与首页「给分记录」模块一致） -->
                <span class="material-symbols-outlined teacher-grade-pill__icon" aria-hidden="true">bar_chart</span>
                <span class="teacher-grade-pill__label">{{ t('schedule.detail.gradeDistribution') }}</span>
              </button>
            </span>
          </div>
          <!-- #1321：多教师选择列表（信息行下方的普通块，无 portal） -->
          <div
            v-if="teacherPickerOpen && teacherNames.length > 1"
            class="teacher-picker"
            role="group"
            :aria-label="t('schedule.detail.teacherPickerTitle')"
          >
            <button
              v-for="name in teacherNames"
              :key="name"
              type="button"
              class="teacher-picker-item"
              @click="pickTeacherForGrade(name)"
            >{{ name }}</button>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.classroom') }}</span>
            <span class="value">{{ selectedCourse?.room }} ({{ selectedCourse?.building }})</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.time') }}</span>
            <span class="value">{{ t('schedule.detail.conflictPeriod').replace('{n}', String(selectedCourse?.weekday ?? '')).replace('{s}', String(selectedCourse?.period ?? '')).replace('{e}', String(getCourseEndPeriod(selectedCourse))) }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.weeks') }}</span>
            <span class="value">{{ selectedCourse?.weeks_text }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.credit') }}</span>
            <span class="value">{{ selectedCourse?.credit }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.classGroup') }}</span>
            <span class="value">{{ selectedCourse?.class_name }}</span>
          </div>
          <div v-if="selectedCourse?.class_size" class="info-row">
            <span class="label">{{ t('schedule.detail.classSize') }}</span>
            <span class="value">{{ selectedCourse?.class_size }}</span>
          </div>
          <div v-if="selectedCourse?.teach_type" class="info-row">
            <span class="label">{{ t('schedule.detail.teachType') }}</span>
            <span class="value">{{ selectedCourse?.teach_type }}</span>
          </div>
          <div v-if="selectedCourse?.is_custom" class="custom-course-actions">
            <button class="custom-delete-btn edit" @click="emit('open-edit-course', selectedCourse, { reopenDetail: true })">{{ t('schedule.detail.editCourse') }}</button>
            <button class="custom-delete-btn week" @click="emit('delete-custom-course', 'current_week')">{{ t('schedule.detail.deleteCurrentWeek') }}</button>
            <button class="custom-delete-btn all" @click="emit('delete-custom-course', 'all')">{{ t('schedule.detail.deleteAllWeeks') }}</button>
          </div>
          <div v-else class="official-course-actions">
            <div class="official-remove-grid">
              <button
                class="official-remove-btn week"
                :disabled="!canRemoveCurrentWeek"
                @click="emit('remove-official-course', selectedCourse, 'current_week')"
              >
                {{ t('schedule.detail.removeOfficialCurrentWeek') }}
              </button>
              <button
                class="official-remove-btn all"
                @click="emit('remove-official-course', selectedCourse, 'all')"
              >
                {{ t('schedule.detail.removeOfficialAllWeeks') }}
              </button>
            </div>
            <p class="official-remove-hint">{{ t('schedule.detail.removeOfficialHint') }}</p>
          </div>
        </div>
        <div class="detail-copy-actions">
          <button class="detail-copy-btn" @click="emit('copy-detail')">{{ t('schedule.detail.copyDetail') }}</button>
        </div>
        <div v-if="detailActionError" class="detail-action-error">{{ detailActionError }}</div>
      </div>
    </div>
  </Transition>
</template>

<style src="../styles/modal.css" scoped></style>
<style scoped>
.modal-body {
  display: grid;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 0;
}

.info-row .label {
  color: #9ca3af;
  font-size: 13px;
}

.info-row .value {
  color: #374151;
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  max-width: 70%;
}

.custom-course-actions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.custom-delete-btn {
  min-height: 34px;
  border-radius: 10px;
  border: none;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.custom-delete-btn.week {
  background: #fee2e2;
  color: #b91c1c;
}

.custom-delete-btn.edit {
  background: #dbeafe;
  color: #1d4ed8;
}

.custom-delete-btn.all {
  background: #dc2626;
  color: #ffffff;
}

.official-course-actions {
  margin-top: 12px;
  display: grid;
  gap: 7px;
}

.official-remove-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.official-remove-btn {
  min-height: 36px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.official-remove-btn.week {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #c2410c;
}

.official-remove-btn.all {
  background: #fff1f2;
  color: #b91c1c;
}

.official-remove-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.official-remove-hint {
  margin: 0;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.5;
}

/* #869：暗色模式下移除入口保持可读——全局 dark-mode.css 只覆盖容器级规则，
   这里在组件内补齐按钮与提示文字的暗色配色（html.dark 前缀保证优先级覆盖亮色规则）。 */
html.dark .official-remove-btn.week {
  background: rgba(251, 146, 60, 0.16);
  border-color: rgba(251, 146, 60, 0.42);
  color: #fdba74;
}

html.dark .official-remove-btn.all {
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(248, 113, 113, 0.42);
  color: #fca5a5;
}

html.dark .official-remove-hint {
  color: #94a3b8;
}

.detail-copy-actions {
  margin-top: 12px;
}

.detail-copy-btn {
  width: 100%;
  min-height: 36px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.detail-action-error {
  margin-top: 10px;
  font-size: 12px;
  color: #b91c1c;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 10px;
  padding: 8px 10px;
}

.conflict-hint {
  font-size: 12px;
  color: #475569;
  margin-bottom: 10px;
}

.conflict-item {
  border: 1px solid #fecaca;
  background: #fff7f7;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
}

.conflict-item.clickable {
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.conflict-item.clickable:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(239, 68, 68, 0.12);
}

.conflict-item:last-child {
  margin-bottom: 0;
}

.conflict-item-title {
  font-size: 13px;
  font-weight: 700;
  color: #7f1d1d;
  display: flex;
  align-items: center;
  gap: 6px;
}

.conflict-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  background: #111827;
  color: #ffffff;
}

.conflict-item-row {
  margin-top: 6px;
  font-size: 12px;
  color: #374151;
}

/* ============ #1321 教师 → 给分记录快捷入口 ============ */
.teacher-grade-pill {
  /* 图标 + 文字用 flex 对齐，避免 ligature 字形的基线把文字顶偏 */
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 8px;
  min-height: 26px;
  padding: 2px 9px 2px 7px;
  border: none;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  cursor: pointer;
  white-space: nowrap;
  vertical-align: middle;
}

/* 与首页模块图标同源：Material Symbols Outlined，实心字重与首页 ThemeModuleIcon 一致 */
.teacher-grade-pill__icon {
  font-size: 14px;
  line-height: 1;
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
}

.teacher-grade-pill:hover {
  background: rgba(37, 99, 235, 0.18);
}

/* 多教师选择列表（信息行下方普通块） */
.teacher-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  background: #eff6ff;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 10px;
}

.teacher-picker-item {
  min-height: 28px;
  padding: 2px 10px;
  border: 1px solid rgba(37, 99, 235, 0.24);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #ffffff;
  color: #1d4ed8;
  cursor: pointer;
}

.teacher-picker-item:hover {
  background: #dbeafe;
}

/* 暗色模式：与上方亮色规则同优先级，用 html.dark 前缀覆盖 */
html.dark .teacher-grade-pill {
  background: rgba(96, 165, 250, 0.16);
  color: #93c5fd;
}

html.dark .teacher-grade-pill:hover {
  background: rgba(96, 165, 250, 0.26);
}

html.dark .teacher-picker {
  background: #1e293b;
  border-color: rgba(148, 163, 184, 0.24);
}

html.dark .teacher-picker-item {
  background: rgba(30, 41, 59, 0.6);
  border-color: rgba(148, 163, 184, 0.24);
  color: #93c5fd;
}

html.dark .teacher-picker-item:hover {
  background: rgba(96, 165, 250, 0.16);
}
</style>
