<script setup>
/**
 * 个人日程表单（#836）：高频字段第一屏，低频字段折叠进「更多设置」。
 *
 * 设计要点：
 * - 字段直接 v-model 到调用方传入的草稿对象（props.draft），与 ScheduleCourseForm
 *   相同的 computed 解引用规则（#760）：父组件常驻挂载、草稿对象每次打开都会被整体
 *   替换，固化 setup 引用会让输入写进被丢弃的旧对象；
 * - 日期 / 时间用原生 <input type="date|time">，移动端唤起系统选择器；
 * - 提醒用原生 <select>：IOSSelect 的 modelValue 不接受 null，且 .number 修饰会把
 *   「不提醒」错转成 0；
 * - 冲突提示只是 warning，不阻断提交。
 */
import { computed, ref, watch } from 'vue'
import CourseColorPicker from '../../../components/CourseColorPicker.vue'
import { useI18n } from '../../../utils/app_i18n'
import { REMINDER_OPTIONS } from '../utils/eventTypes'
import { tf } from '../utils/i18n_text'
import { formatMinuteToClock } from '../composables/useScheduleEvents'

const props = defineProps({
  /** 日程草稿对象（useScheduleEvents.eventDraft） */
  draft: { type: Object, default: () => ({}) },
  /** 冲突提示（useScheduleEvents.conflictsOf 的结果） */
  conflicts: { type: Array, default: () => [] },
})

// #760：始终解引用最新草稿对象
const form = computed(() => props.draft)

const { t } = useI18n()

/** 折叠区默认收起；草稿对象被整体替换（打开/回填）时重新收起 */
const showMore = ref(false)
watch(
  () => props.draft,
  () => {
    showMore.value = false
  }
)

const reminderOptions = REMINDER_OPTIONS

/** 提醒下拉的当前值：null 映射为空串（「不提醒」档） */
const reminderValue = computed(() => {
  const value = form.value?.reminderMinutes
  return value === null || value === undefined ? '' : String(value)
})

/** 原生 select 回写：空串 → null，其余 → 数字（避免 .number 修饰把 null 转成 0） */
const onReminderChange = (event) => {
  const target = event?.target
  const raw = target && target.value !== undefined ? String(target.value) : ''
  form.value.reminderMinutes = raw === '' ? null : Number(raw)
}

/** 冲突条目最多展示 3 条，其余用「与 N 项安排重叠」汇总 */
const visibleConflicts = computed(() =>
  (Array.isArray(props.conflicts) ? props.conflicts : []).slice(0, 3)
)

const conflictCount = computed(() => (Array.isArray(props.conflicts) ? props.conflicts.length : 0))
</script>

<template>
  <div class="event-form-fields">
    <label class="add-field">
      <span>{{ t('schedule.event.titleLabel') }}</span>
      <input v-model.trim="form.title" type="text" :placeholder="t('schedule.event.titlePlaceholder')" />
    </label>
    <label class="add-field">
      <span>{{ t('schedule.event.dateLabel') }}</span>
      <input v-model="form.date" type="date" />
    </label>
    <div class="add-row">
      <label class="add-field">
        <span>{{ t('schedule.event.startTimeLabel') }}</span>
        <input v-model="form.startTime" type="time" />
      </label>
      <label class="add-field">
        <span>{{ t('schedule.event.endTimeLabel') }}</span>
        <input v-model="form.endTime" type="time" />
      </label>
    </div>
    <label class="add-field">
      <span>{{ t('schedule.event.locationLabel') }}</span>
      <input v-model.trim="form.location" type="text" :placeholder="t('schedule.event.locationPlaceholder')" />
    </label>
    <div class="add-field">
      <span>{{ t('schedule.event.reminderLabel') }}</span>
      <select class="event-reminder-select" :value="reminderValue" @change="onReminderChange">
        <option
          v-for="option in reminderOptions"
          :key="String(option.value)"
          :value="option.value === null ? '' : String(option.value)"
        >
          {{ t(option.labelKey) }}
        </option>
      </select>
    </div>

    <div v-if="conflictCount > 0" class="event-conflict">
      <div class="event-conflict-title">{{ t('schedule.event.conflictTitle') }}</div>
      <div v-for="(item, index) in visibleConflicts" :key="index" class="event-conflict-item">
        {{ tf('schedule.event.conflictItem', {
          start: formatMinuteToClock(item.startMinute),
          end: formatMinuteToClock(item.endMinute),
          label: item.label
        }) }}
      </div>
      <div v-if="conflictCount > 1" class="event-conflict-summary">
        {{ tf('schedule.event.conflictSummary', { n: conflictCount }) }}
      </div>
    </div>

    <button
      type="button"
      class="event-more-toggle"
      :aria-expanded="showMore"
      @click="showMore = !showMore"
    >
      <span class="material-symbols-outlined event-more-icon">{{ showMore ? 'expand_less' : 'expand_more' }}</span>
      {{ showMore ? t('schedule.event.moreSettingsHide') : t('schedule.event.moreSettings') }}
    </button>

    <div v-if="showMore" class="event-more">
      <div class="add-field">
        <span>{{ t('schedule.event.colorLabel') }}</span>
        <CourseColorPicker v-model="form.color" />
      </div>
      <label class="add-field">
        <span>{{ t('schedule.event.noteLabel') }}</span>
        <textarea v-model.trim="form.note" rows="3" :placeholder="t('schedule.event.notePlaceholder')"></textarea>
      </label>
    </div>
  </div>
</template>

<style scoped>
.event-form-fields {
  display: grid;
  gap: 10px;
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
.add-field select,
.add-field textarea {
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

.add-field textarea {
  padding: 8px 10px;
  font-family: inherit;
  resize: vertical;
}

.add-field input:focus,
.add-field select:focus,
.add-field textarea:focus {
  outline: 2px solid rgba(37, 99, 235, 0.3);
  outline-offset: 0;
}

.event-conflict {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.event-conflict-title {
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
}

.event-conflict-item,
.event-conflict-summary {
  font-size: 12px;
  color: #92400e;
  line-height: 1.45;
  word-break: break-word;
}

.event-more-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 34px;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
  background: rgba(248, 250, 252, 0.9);
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.event-more-icon {
  font-size: 18px;
}

.event-more {
  display: grid;
  gap: 10px;
}

@media (max-width: 768px) {
  .add-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
