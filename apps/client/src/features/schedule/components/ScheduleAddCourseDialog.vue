<script setup>
/**
 * 添加/修改自定义课程弹窗。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 * #836：课程字段区（学期条 + 名称/教师/地点/星期/节次/节数/周次）抽为
 * ScheduleCourseForm.vue，与统一「添加安排」弹窗的课程 Tab 共用同一份字段实现；
 * 本组件保留配色、错误提示与动作区，字段/默认值/校验/提交行为完全不变。
 */
import { computed } from 'vue'
// #772：恢复组件拆分时丢失的颜色选择器（script setup 中 import 即自动注册）
import CourseColorPicker from '../../../components/CourseColorPicker.vue'
// #836：共用课程字段区
import ScheduleCourseForm from './ScheduleCourseForm.vue'
// #788 i18n：文案经 useI18n 响应式取词
import { useI18n } from '../../../utils/app_i18n'

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

// 响应式 t：语言切换后弹窗文案即时生效
const { t } = useI18n()
</script>

<template>
  <Transition name="fade">
    <div v-if="showAddCourse" class="modal-overlay" @click="emit('close')">
      <div class="modal-content glass add-course-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ courseDialogMode === 'edit' ? t('schedule.addCourse.titleEdit') : t('schedule.addCourse.titleAdd') }}</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>
        <div class="modal-body add-course-body">
          <ScheduleCourseForm
            :form="form"
            :semester="courseDialogSemester"
            :span-options="courseSpanOptions"
            :weeks-count-text="addWeeksCountText"
            @open-week-picker="emit('open-week-picker')"
          />
          <div class="add-field">
            <CourseColorPicker v-model="form.color" />
          </div>
          <div v-if="addCourseError" class="drawer-error add-course-error">{{ addCourseError }}</div>
        </div>
        <div class="add-actions">
          <button class="drawer-action ghost" :disabled="addingCourse" @click="emit('close')">{{ t('schedule.addCourse.cancel') }}</button>
          <button class="drawer-action" :disabled="addingCourse" @click="emit('submit')">
            {{ addingCourse
              ? (courseDialogMode === 'edit' ? t('schedule.addCourse.submittingEdit') : t('schedule.addCourse.submittingAdd'))
              : (courseDialogMode === 'edit' ? t('schedule.addCourse.submitEdit') : t('schedule.addCourse.submitAdd')) }}
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

/* 配色区包装（字段区样式已随 ScheduleCourseForm.vue 抽出） */
.add-field {
  display: grid;
  gap: 6px;
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

/* #772：组件拆分时 drawer-action 样式遗留在了 ScheduleDrawer.vue 的 scoped 作用域，
   弹窗内取消/确认按钮因此丢失视觉。此处按 ScheduleDrawer.vue 原规则等值复制
   （含 ghost 变体、按压反馈、disabled 态）；暗色模式由全局 dark-mode.css 的
   html.dark .schedule-view .drawer-action 规则接管，与本组件无需重复。 */
.drawer-action {
  padding: 14px 16px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease;
}

.drawer-action:active {
  transform: scale(0.98);
}

.drawer-action.ghost {
  background: #111827;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.2);
}

.drawer-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .add-actions {
    grid-template-columns: 1fr;
  }
}
</style>
