<script setup>
/**
 * 统一「添加安排」创建器（#836）：把原「添加课程」升级为课程 / 日程二选一。
 *
 * 关键约束：
 * - **仅创建态**显示顶部 segmented control（真实 button，非纯手势），编辑态类型锁定、
 *   不支持课程↔日程互转；
 * - 课程 Tab 复用 ScheduleCourseForm.vue（字段/默认值/校验/提交行为与原弹窗完全一致），
 *   日程 Tab 渲染 ScheduleEventForm.vue；
 * - 两份草稿（courseDraft / eventDraft）由父组件分别持有，本组件只读不写，
 *   因此「课程填一半 → 切日程 → 切回课程」内容不丢；
 * - #760 规则：父组件常驻挂载、setup 仅执行一次，两份草稿都必须用 computed 解引用；
 * - 弹窗内容区可滚动、动作按钮固定在滚动区之外，避免移动端软键盘遮挡确认按钮。
 */
import { computed, ref, watch } from 'vue'
import CourseColorPicker from '../../../components/CourseColorPicker.vue'
import ScheduleCourseForm from './ScheduleCourseForm.vue'
import ScheduleEventForm from './ScheduleEventForm.vue'
import { useI18n } from '../../../utils/app_i18n'

const props = defineProps({
  show: { type: Boolean, default: false },
  /** add | editCourse | editEvent */
  mode: { type: String, default: 'add' },
  /** 创建态默认选中的 Tab：course | event */
  initialTab: { type: String, default: 'course' },
  // —— 课程 Tab ——
  courseSemester: { type: String, default: '' },
  courseDraft: { type: Object, default: () => ({}) },
  courseError: { type: String, default: '' },
  savingCourse: { type: Boolean, default: false },
  courseSpanOptions: { type: Array, default: () => [] },
  addWeeksCountText: { type: String, default: '' },
  // —— 日程 Tab ——
  eventDraft: { type: Object, default: () => ({}) },
  eventError: { type: String, default: '' },
  savingEvent: { type: Boolean, default: false },
  deletingEvent: { type: Boolean, default: false },
  eventConflicts: { type: Array, default: () => [] },
})
const emit = defineEmits([
  'close',
  'submit-course',
  'submit-event',
  'delete-event',
  'open-week-picker',
])

// #760：两份草稿都必须解引用最新对象（父组件每次打开都会整体替换）
const courseForm = computed(() => props.courseDraft)

const { t } = useI18n()

const activeTab = ref('course')
const isCreateMode = computed(() => props.mode === 'add')
const isEditEventMode = computed(() => props.mode === 'editEvent')
const busy = computed(() => props.savingCourse || props.savingEvent || props.deletingEvent)

/** 按当前模式确定 Tab：编辑态锁定类型，创建态用 initialTab */
const applyModeTab = () => {
  if (props.mode === 'editEvent') {
    activeTab.value = 'event'
    return
  }
  if (props.mode === 'editCourse') {
    activeTab.value = 'course'
    return
  }
  activeTab.value = props.initialTab === 'event' ? 'event' : 'course'
}

// 每次打开（或模式/初始 Tab 变化）都重新对齐 Tab，避免沿用上一次的残留选择
watch(
  () => [props.show, props.mode, props.initialTab],
  () => {
    if (props.show) applyModeTab()
  },
  { immediate: true }
)

const title = computed(() => {
  if (props.mode === 'editEvent') return t('schedule.arrangement.titleEditEvent')
  if (props.mode === 'editCourse') return t('schedule.arrangement.titleEditCourse')
  return t('schedule.arrangement.titleAdd')
})

const submitText = computed(() => {
  const editing = props.mode !== 'add'
  if (activeTab.value === 'event') {
    if (props.savingEvent) {
      return editing ? t('schedule.event.submittingEdit') : t('schedule.event.submittingAdd')
    }
    return editing ? t('schedule.event.submitEdit') : t('schedule.event.submitAdd')
  }
  if (props.savingCourse) {
    return editing ? t('schedule.addCourse.submittingEdit') : t('schedule.addCourse.submittingAdd')
  }
  return editing ? t('schedule.addCourse.submitEdit') : t('schedule.addCourse.submitAdd')
})

/** 提交按当前 Tab 分发（课程与日程的提交逻辑分别归属各自 composable） */
const onSubmit = () => {
  if (busy.value) return
  if (activeTab.value === 'event') {
    emit('submit-event')
    return
  }
  emit('submit-course')
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="modal-overlay" @click="emit('close')">
      <div class="modal-content glass arrangement-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ title }}</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>

        <!-- 仅创建态可切换类型；编辑态类型锁定，不支持课程↔日程互转 -->
        <div
          v-if="isCreateMode"
          class="arrangement-tabs"
          role="tablist"
          :aria-label="t('schedule.arrangement.tabAria')"
        >
          <button
            type="button"
            class="arrangement-tab"
            :class="{ active: activeTab === 'course' }"
            role="tab"
            :aria-selected="activeTab === 'course'"
            @click="activeTab = 'course'"
          >
            <span class="material-symbols-outlined">menu_book</span>
            {{ t('schedule.arrangement.tabCourse') }}
          </button>
          <button
            type="button"
            class="arrangement-tab"
            :class="{ active: activeTab === 'event' }"
            role="tab"
            :aria-selected="activeTab === 'event'"
            @click="activeTab = 'event'"
          >
            <span class="material-symbols-outlined">event</span>
            {{ t('schedule.arrangement.tabEvent') }}
          </button>
        </div>

        <!-- 滚动区：内容过长（或移动端软键盘顶起）时只滚动这里，动作按钮始终可见 -->
        <div class="arrangement-body">
          <template v-if="activeTab === 'course'">
            <ScheduleCourseForm
              :form="courseForm"
              :semester="courseSemester"
              :span-options="courseSpanOptions"
              :weeks-count-text="addWeeksCountText"
              @open-week-picker="emit('open-week-picker')"
            />
            <div class="add-field">
              <CourseColorPicker v-model="courseForm.color" />
            </div>
            <div v-if="courseError" class="drawer-error">{{ courseError }}</div>
          </template>

          <template v-else>
            <ScheduleEventForm :draft="eventDraft" :conflicts="eventConflicts" />
            <div v-if="eventError" class="drawer-error">{{ eventError }}</div>
          </template>
        </div>

        <div class="arrangement-actions">
          <button
            v-if="isEditEventMode"
            class="drawer-action danger"
            :disabled="busy"
            @click="emit('delete-event')"
          >
            <span class="material-symbols-outlined">delete</span>
            {{ deletingEvent ? t('schedule.event.deleting') : t('schedule.event.deleteEvent') }}
          </button>
          <div class="arrangement-actions-row">
            <button class="drawer-action ghost" :disabled="busy" @click="emit('close')">
              {{ t('schedule.addCourse.cancel') }}
            </button>
            <button class="drawer-action" :disabled="busy" @click="onSubmit">
              {{ submitText }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style src="../styles/modal.css" scoped></style>
<style scoped>
.arrangement-modal {
  width: min(92vw, 400px);
  max-width: 420px;
  /* 上限留出安全区，避免小屏被软键盘完全顶出可视区 */
  max-height: min(84dvh, 680px);
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.arrangement-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  padding: 4px;
  margin-bottom: 10px;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  background: #f9fafb;
}

.arrangement-tab {
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 12px;
  min-height: 36px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.arrangement-tab .material-symbols-outlined {
  font-size: 18px;
}

.arrangement-tab.active {
  color: #ffffff;
  background: var(--ui-primary, #2563eb);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ui-primary, #2563eb) 30%, transparent 70%);
}

.arrangement-body {
  display: grid;
  gap: 10px;
  /* flex 子项必须允许收缩，滚动才会发生在内容区而不是把动作按钮顶出视口 */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.arrangement-actions {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.arrangement-actions-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

/* 配色区包装（字段区样式在 ScheduleCourseForm.vue） */
.add-field {
  display: grid;
  gap: 6px;
}

.drawer-error {
  font-size: 12px;
  color: #dc2626;
}

/* 与 ScheduleAddCourseDialog.vue 保持同一视觉基线（scoped 样式跨组件不生效） */
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

.drawer-action.danger {
  background: linear-gradient(135deg, #ef4444, #b91c1c);
  box-shadow: 0 8px 16px rgba(220, 38, 38, 0.24);
}

.drawer-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .arrangement-actions-row {
    grid-template-columns: 1fr;
  }
}
</style>
