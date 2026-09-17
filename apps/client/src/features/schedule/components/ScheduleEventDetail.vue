<script setup>
/**
 * 个人日程详情 surface（#838）。
 *
 * 与 `ScheduleCourseDetail.vue`（课程详情）**刻意不复用** DOM / 类名 / 状态：
 * 课程详情表达「教务 / 自定义课程」，本组件表达「个人日程」，顶部以
 * `schedule.arrangement.tabEvent`（「日程」）显式标注业务类型，避免用户误判。
 *
 * 约定：
 * - 全部用户可见文案走 t() / tf()，不硬编码中文；
 * - 冲突列表由父组件用共享 overlap 逻辑（useScheduleEvents.conflictsOf）算好后经
 *   `conflicts` 传入，本组件不做任何时间判定；冲突只做提示，不阻断操作；
 * - `deleting` 为真时操作按钮禁用并显示进行中；`error` 非空时详情内可见，
 *   删除失败必须保留详情，不制造 UI 假成功；
 * - 移动端：内容区可滚动，操作按钮固定在滚动区之外，避免被软键盘遮挡。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../../utils/app_i18n'
import { isValidCalendarDate, REMINDER_OPTIONS } from '../utils/eventTypes'
import { formatMinuteToClock } from '../utils/formatters'
import { tf } from '../utils/i18n_text'

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 当前选中的日程（camelCase 领域对象），null 表示无选中 */
  event: { type: Object, default: null },
  /** 该日程的冲突列表（父组件用共享 overlap 逻辑算好后传入） */
  conflicts: { type: Array, default: () => [] },
  deleting: { type: Boolean, default: false },
  error: { type: String, default: '' }
})
const emit = defineEmits(['close', 'edit', 'delete'])

// 响应式 t：语言切换后详情文案即时生效
const { t } = useI18n()

/** 标题：日程标题为空时回落「未命名安排」 */
const titleText = computed(
  () => String(props.event?.title || '').trim() || t('schedule.event.untitled')
)

/** 星期序号 1..7（周日 = 7）；日期非法返回 null */
const weekdayIndex = computed(() => {
  const date = String(props.event?.date || '')
  if (!isValidCalendarDate(date)) return null
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const day = parsed.getDay()
  return day === 0 ? 7 : day
})

/** 日期文本（如「9月18日 周五」）：用 t() 拼装，非法日期原样回退展示，避免详情留白 */
const dateText = computed(() => {
  const date = String(props.event?.date || '').trim()
  const index = weekdayIndex.value
  if (index === null) return date
  return tf('schedule.event.detailDate', {
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
    weekday: t(`schedule.weekday.${index}`)
  })
})

/** 时间文本：`19:00 - 21:00`；缺失任一端不展示该行 */
const timeText = computed(() => {
  const start = String(props.event?.startTime || '').trim()
  const end = String(props.event?.endTime || '').trim()
  if (!start || !end) return ''
  return `${start} - ${end}`
})

const locationText = computed(() => String(props.event?.location || '').trim())
const noteText = computed(() => String(props.event?.note || '').trim())

/** 提醒文案：null / 未知档位一律不展示提醒行（复用 REMINDER_OPTIONS 的 labelKey） */
const reminderText = computed(() => {
  const value = props.event?.reminderMinutes
  if (value === null || value === undefined) return ''
  const option = REMINDER_OPTIONS.find((item) => item.value === Number(value))
  return option ? t(option.labelKey) : ''
})

const conflictList = computed(() => (Array.isArray(props.conflicts) ? props.conflicts : []))
const conflictCount = computed(() => conflictList.value.length)
/** 冲突展开态：默认折叠前 2 条，避免明细把详情撑得过长 */
const showAllConflicts = ref(false)
const visibleConflicts = computed(() =>
  showAllConflicts.value ? conflictList.value : conflictList.value.slice(0, 2)
)
const canExpandConflicts = computed(() => conflictCount.value > 2)

// 切换日程（或重新打开）时重置冲突展开态，避免沿用上一次的展开状态
watch(
  () => props.event,
  () => {
    showAllConflicts.value = false
  }
)
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="modal-overlay" @click="emit('close')">
      <div
        class="modal-content glass event-detail-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('schedule.event.detailTitle')"
        @click.stop
      >
        <div class="modal-header">
          <h3>{{ titleText }}</h3>
          <button class="close-btn" type="button" :aria-label="t('common.close')" @click="emit('close')">
            ×
          </button>
        </div>

        <!-- 滚动区：内容过长（或移动端软键盘顶起）时只滚动这里，操作按钮始终可见 -->
        <div class="event-detail-body">
          <!-- 业务类型显式标注为「日程」，与课程详情区分 -->
          <div class="event-detail-type">{{ t('schedule.arrangement.tabEvent') }}</div>

          <div v-if="dateText" class="event-detail-row event-detail-date">{{ dateText }}</div>
          <div v-if="timeText" class="event-detail-row event-detail-time">{{ timeText }}</div>
          <div v-if="locationText" class="event-detail-row event-detail-place">{{ locationText }}</div>
          <div v-if="reminderText" class="event-detail-row event-detail-reminder">{{ reminderText }}</div>
          <div v-if="noteText" class="event-detail-row event-detail-note">
            {{ tf('schedule.event.detailNote', { note: noteText }) }}
          </div>

          <div v-if="conflictCount > 0" class="event-detail-conflict">
            <div class="event-detail-conflict-title">⚠ {{ t('schedule.event.conflictTitle') }}</div>
            <div
              v-for="(item, index) in visibleConflicts"
              :key="`${item.label}-${index}`"
              class="event-detail-conflict-entry"
            >
              {{ tf('schedule.event.conflictItem', {
                start: formatMinuteToClock(item.startMinute),
                end: formatMinuteToClock(item.endMinute),
                label: item.label
              }) }}
            </div>
            <div v-if="conflictCount > 1" class="event-detail-conflict-summary">
              {{ tf('schedule.event.conflictSummary', { n: conflictCount }) }}
            </div>
            <button
              v-if="canExpandConflicts"
              type="button"
              class="event-detail-conflict-toggle"
              :aria-expanded="showAllConflicts"
              @click="showAllConflicts = !showAllConflicts"
            >
              {{ showAllConflicts ? t('schedule.event.conflictCollapse') : t('schedule.event.conflictExpand') }}
            </button>
          </div>
        </div>

        <!-- 错误固定在滚动区之外：删除失败时无需滚动即可看到 -->
        <div v-if="error" class="event-detail-error">{{ error }}</div>

        <div class="event-detail-actions">
          <button class="event-detail-action ghost" type="button" :disabled="deleting" @click="emit('edit')">
            {{ t('schedule.arrangement.titleEditEvent') }}
          </button>
          <button class="event-detail-action danger" type="button" :disabled="deleting" @click="emit('delete')">
            {{ deleting ? t('schedule.event.deleting') : t('schedule.event.deleteEvent') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style src="../styles/modal.css" scoped></style>
<style scoped>
.event-detail-modal {
  width: min(92vw, 400px);
  max-width: 420px;
  /* 上限留出安全区，避免小屏被软键盘完全顶出可视区 */
  max-height: min(84dvh, 680px);
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.event-detail-body {
  display: grid;
  gap: 8px;
  /* flex 子项必须允许收缩，滚动才会发生在内容区而不是把操作按钮顶出视口 */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.event-detail-type {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 700;
}

.event-detail-row {
  font-size: 13px;
  color: #374151;
  line-height: 1.45;
  word-break: break-word;
}

.event-detail-date {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.event-detail-time {
  font-variant-numeric: tabular-nums;
}

.event-detail-note {
  white-space: pre-wrap;
}

.event-detail-conflict {
  display: grid;
  gap: 4px;
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.event-detail-conflict-title {
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
}

.event-detail-conflict-entry,
.event-detail-conflict-summary {
  font-size: 12px;
  color: #92400e;
  line-height: 1.45;
  word-break: break-word;
}

.event-detail-conflict-toggle {
  justify-self: start;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #fcd34d;
  background: #ffffff;
  color: #92400e;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.event-detail-error {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.event-detail-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.event-detail-action {
  min-height: 42px;
  border: none;
  border-radius: 14px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.event-detail-action:active {
  transform: scale(0.98);
}

.event-detail-action.ghost {
  background: #111827;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.2);
}

.event-detail-action.danger {
  background: linear-gradient(135deg, #ef4444, #b91c1c);
  box-shadow: 0 8px 16px rgba(220, 38, 38, 0.24);
}

.event-detail-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .event-detail-actions {
    grid-template-columns: 1fr;
  }
}
</style>
