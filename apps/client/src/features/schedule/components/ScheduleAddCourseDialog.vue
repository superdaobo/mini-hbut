<script setup>
/**
 * 添加/修改自定义课程弹窗。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 */
import { computed } from 'vue'
import { periodOptions, weekDayLabels } from '../constants'

const props = defineProps({
  showAddCourse: { type: Boolean, default: false },
  courseDialogMode: { type: String, default: 'add' },
  courseDialogSemester: { type: String, default: '' },
  addCourseForm: { type: Object, default: () => ({}) },
  addCourseError: { type: String, default: '' },
  addingCourse: { type: Boolean, default: false },
  courseSpanOptions: { type: Array, default: () => [] },
  addWeeksCountText: { type: String, default: '' },
})
const emit = defineEmits(['close', 'submit', 'open-week-picker'])

// #760：本弹窗被父组件（ScheduleView.vue）常驻挂载，setup 仅执行一次；而编辑器
// （useScheduleEditor）每次打开弹窗都会整体替换 addCourseForm 对象
// （resetAddCourseForm / populateCourseForm）。若在 setup 时固化 props.addCourseForm
// 引用，用户输入会写进被替换掉的旧对象，校验读到的新对象恒为空，必然误报
// 「课程名称不能为空」。改用 computed 始终解引用最新表单对象，模板中 v-model
// 的读取与写回都落在当前 props 指向的对象上。
const form = computed(() => props.addCourseForm)
</script>

<template>
  <Transition name="fade">
    <div v-if="showAddCourse" class="modal-overlay" @click="emit('close')">
      <div class="modal-content glass add-course-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ courseDialogMode === 'edit' ? '修改课程' : '添加课程' }}</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>
        <div class="modal-body add-course-body">
          <div class="add-course-semester">学期：{{ courseDialogSemester }}</div>
          <label class="add-field">
            <span>课程名称 *</span>
            <input v-model.trim="form.name" type="text" placeholder="请输入课程名称" />
          </label>
          <label class="add-field">
            <span>教师</span>
            <input v-model.trim="form.teacher" type="text" placeholder="可选" />
          </label>
          <label class="add-field">
            <span>上课地点</span>
            <input v-model.trim="form.room" type="text" placeholder="可选" />
          </label>
          <div class="add-field">
            <span>上课时间 *</span>
            <IOSSelect v-model.number="form.weekday">
              <option v-for="(label, idx) in weekDayLabels" :key="label" :value="idx + 1">{{ label }}</option>
            </IOSSelect>
          </div>
          <div class="add-row">
            <label class="add-field">
              <span>开始节次 *</span>
              <IOSSelect v-model.number="form.period">
                <option v-for="p in periodOptions" :key="p" :value="p">第{{ p }}节</option>
              </IOSSelect>
            </label>
            <label class="add-field">
              <span>上课节数 *</span>
              <IOSSelect v-model.number="form.djs">
                <option v-for="s in courseSpanOptions" :key="s" :value="s">{{ s }}节</option>
              </IOSSelect>
            </label>
          </div>
          <div class="add-field">
            <span>上课周次 *</span>
            <button class="week-picker-trigger" @click="emit('open-week-picker')">
              {{ addWeeksCountText }}
            </button>
          </div>
          <div class="add-field">
            <CourseColorPicker v-model="form.color" />
          </div>
          <div v-if="addCourseError" class="drawer-error add-course-error">{{ addCourseError }}</div>
        </div>
        <div class="add-actions">
          <button class="drawer-action ghost" :disabled="addingCourse" @click="emit('close')">取消</button>
          <button class="drawer-action" :disabled="addingCourse" @click="emit('submit')">
            {{ addingCourse ? `正在${courseDialogMode === 'edit' ? '修改' : '添加'}...` : `${courseDialogMode === 'edit' ? '修改' : '添加'}并确认` }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style src="../styles/modal.css" scoped></style>
<style scoped>
.add-course-modal {
  width: min(92vw, 400px);
  max-width: 420px;
  max-height: min(74dvh, 600px);
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.add-course-body {
  display: grid;
  gap: 10px;
  overflow-y: auto;
  max-height: calc(min(74dvh, 600px) - 148px);
  padding-right: 2px;
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

.add-actions {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.add-course-error {
  margin-top: -2px;
}

.drawer-error {
  font-size: 12px;
  color: #dc2626;
}

@media (max-width: 768px) {
  .add-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .add-actions {
    grid-template-columns: 1fr;
  }
}
</style>
