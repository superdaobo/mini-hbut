<script setup>
/**
 * 自定义课程字段区（#836 自 ScheduleAddCourseDialog.vue 抽出，字段/默认值/校验/提交行为完全不变）。
 *
 * 供两个入口共用：
 * - ScheduleAddCourseDialog.vue（纯课程弹窗，编辑课程入口）；
 * - ScheduleAddArrangementDialog.vue（统一「添加安排」的课程 Tab）。
 *
 * #760 规则：调用方常驻挂载、setup 仅执行一次，而编辑器每次打开弹窗都会整体替换
 * 表单对象，因此这里必须用 computed 解引用最新 props.form，不能固化引用。
 */
import { computed } from 'vue'
import { periodOptions, getWeekDayLabels } from '../constants'
// #788 i18n：文案经 useI18n 响应式取词
import { useI18n } from '../../../utils/app_i18n'

const props = defineProps({
  /** 课程表单对象（由 useScheduleEditor.addCourseForm 提供） */
  form: { type: Object, default: () => ({}) },
  /** 当前学期（仅展示） */
  semester: { type: String, default: '' },
  /** 可选上课节数（随开始节次变化） */
  spanOptions: { type: Array, default: () => [] },
  /** 已选周次文案（由 useScheduleEditor.addWeeksCountText 计算） */
  weeksCountText: { type: String, default: '' },
})
const emit = defineEmits(['open-week-picker'])

// #760：始终解引用最新表单对象，模板 v-model 的读写都落在当前 props 指向的对象上
const form = computed(() => props.form)

// 响应式 t：语言切换后字段文案即时生效
const { t } = useI18n()

// #788：星期标签随语言切换取最新词（getter 函数在渲染时调用）
const weekDayLabels = computed(() => getWeekDayLabels())
</script>

<template>
  <div class="course-form-fields">
    <div class="add-course-semester">{{ t('schedule.addCourse.semesterLabel').replace('{t}', semester) }}</div>
    <label class="add-field">
      <span>{{ t('schedule.addCourse.nameLabel') }}</span>
      <input v-model.trim="form.name" type="text" :placeholder="t('schedule.addCourse.namePlaceholder')" />
    </label>
    <label class="add-field">
      <span>{{ t('schedule.addCourse.teacherLabel') }}</span>
      <input v-model.trim="form.teacher" type="text" :placeholder="t('schedule.addCourse.teacherPlaceholder')" />
    </label>
    <label class="add-field">
      <span>{{ t('schedule.addCourse.roomLabel') }}</span>
      <input v-model.trim="form.room" type="text" :placeholder="t('schedule.addCourse.roomPlaceholder')" />
    </label>
    <div class="add-field">
      <span>{{ t('schedule.addCourse.timeLabel') }}</span>
      <IOSSelect v-model.number="form.weekday">
        <option v-for="(label, idx) in weekDayLabels" :key="label" :value="idx + 1">{{ label }}</option>
      </IOSSelect>
    </div>
    <div class="add-row">
      <label class="add-field">
        <span>{{ t('schedule.addCourse.startPeriodLabel') }}</span>
        <IOSSelect v-model.number="form.period">
          <option v-for="p in periodOptions" :key="p" :value="p">{{ t('schedule.addCourse.periodOption').replace('{n}', String(p)) }}</option>
        </IOSSelect>
      </label>
      <label class="add-field">
        <span>{{ t('schedule.addCourse.spanLabel') }}</span>
        <IOSSelect v-model.number="form.djs">
          <option v-for="s in spanOptions" :key="s" :value="s">{{ t('schedule.addCourse.spanOption').replace('{n}', String(s)) }}</option>
        </IOSSelect>
      </label>
    </div>
    <div class="add-field">
      <span>{{ t('schedule.addCourse.weeksLabel') }}</span>
      <button class="week-picker-trigger" @click="emit('open-week-picker')">
        {{ weeksCountText }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.course-form-fields {
  display: grid;
  gap: 10px;
}

.add-course-semester {
  font-size: 12px;
  color: #475569;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(226, 232, 240, 0.55);
}

.add-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.add-field {
  display: grid;
  gap: 6px;
}

.add-field > span {
  font-size: 12px;
  color: #475569;
  font-weight: 600;
}

.add-field input,
.add-field select {
  width: 100%;
  min-height: 36px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  font-size: 13px;
  padding: 0 10px;
  box-sizing: border-box;
}

.add-field input:focus,
.add-field select:focus {
  outline: 2px solid rgba(37, 99, 235, 0.3);
  outline-offset: 0;
}

.week-picker-trigger {
  width: 100%;
  min-height: 38px;
  border-radius: 10px;
  border: 1px dashed #94a3b8;
  background: rgba(248, 250, 252, 0.95);
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 768px) {
  .add-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
