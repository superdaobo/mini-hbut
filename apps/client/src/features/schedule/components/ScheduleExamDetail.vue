<script setup>
/**
 * 课表考试详情（只读 surface）。
 *
 * 与课程详情 / 日程详情刻意分开：
 * - 课程详情表达「教务 / 自定义课程」，日程详情表达「个人日程」；
 * - 本组件表达「教务考试安排」——**只读**，不提供编辑 / 删除，避免用户误以为可改教务数据。
 *
 * 约定：
 * - 全部用户可见文案走 t() / tf()，不硬编码中文；
 * - 字段为空（无考场 / 无座位号 / 无时间）时整行不渲染，不写「未知」；
 * - 底部提供「查看全部考试」入口，跳转考试安排页（由父层 emit 给 App 处理）。
 */
import { computed } from 'vue'
import { useI18n } from '../../../utils/app_i18n'
import { tf } from '../utils/i18n_text'
import { formatMinuteToClock } from '../utils/formatters'
import { isValidCalendarDate } from '../utils/eventTypes'

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 当前选中的考试（camelCase 领域对象），null 表示无选中 */
  exam: { type: Object, default: null }
})
const emit = defineEmits(['close', 'open-all-exams'])

const { t } = useI18n()

/** 标题：课程名缺失时给可读占位，不渲染空标题 */
const titleText = computed(
  () => String(props.exam?.courseName || '').trim() || t('schedule.exam.unnamedCourse')
)

/** 日期文本（如「7月15日 周三」）：复用日程详情的日期格式键，非法日期原样回退 */
const dateText = computed(() => {
  const date = String(props.exam?.date || '').trim()
  if (!isValidCalendarDate(date)) return date
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  const weekday = parsed.getDay() === 0 ? 7 : parsed.getDay()
  return tf('schedule.event.detailDate', {
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
    weekday: t(`schedule.weekday.${weekday}`)
  })
})

/** 时间文本：缺时间时明确「时间待定」，不编造时段 */
const timeText = computed(() => {
  if (!props.exam) return ''
  if (props.exam.timeTbd) return t('schedule.exam.timeTbd')
  const start = formatMinuteToClock(props.exam.startMinute)
  const end = formatMinuteToClock(props.exam.endMinute)
  if (!start || !end) return t('schedule.exam.timeTbd')
  return `${start} - ${end}`
})

const locationText = computed(() => String(props.exam?.location || '').trim())

/** 座位号原值（缺失则整行不渲染，不用占位文案充数） */
const seatValue = computed(() => String(props.exam?.seatNo || '').trim())
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="modal-overlay" @click="emit('close')">
      <div
        class="modal-content glass exam-detail-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('schedule.exam.detailTitle')"
        @click.stop
      >
        <div class="modal-header">
          <h3>{{ titleText }}</h3>
          <button class="close-btn" type="button" :aria-label="t('common.close')" @click="emit('close')">
            ×
          </button>
        </div>

        <!-- 滚动区：内容过长时只滚动这里，操作按钮始终可见 -->
        <div class="exam-detail-body">
          <!-- 业务类型显式标注为「考」，与课程 / 日程详情区分 -->
          <div class="exam-detail-type">{{ t('schedule.exam.badge') }}</div>

          <div v-if="dateText" class="exam-detail-row">
            <span class="exam-detail-label">{{ t('schedule.exam.dateLabel') }}</span>
            <span class="exam-detail-value">{{ dateText }}</span>
          </div>
          <div v-if="timeText" class="exam-detail-row">
            <span class="exam-detail-label">{{ t('schedule.exam.timeLabel') }}</span>
            <span class="exam-detail-value">{{ timeText }}</span>
          </div>
          <div v-if="locationText" class="exam-detail-row">
            <span class="exam-detail-label">{{ t('schedule.exam.locationLabel') }}</span>
            <span class="exam-detail-value">{{ locationText }}</span>
          </div>
          <div v-if="seatValue" class="exam-detail-row exam-detail-seat">
            <span class="exam-detail-label">{{ t('schedule.exam.seatTitle') }}</span>
            <span class="exam-detail-value">{{ seatValue }}</span>
          </div>

          <!-- 只读来源说明：避免用户误以为考试信息可在 App 内修改 -->
          <p class="exam-detail-hint">{{ t('schedule.exam.readonlyHint') }}</p>
        </div>

        <div class="exam-detail-actions">
          <button class="exam-detail-action ghost" type="button" @click="emit('open-all-exams')">
            {{ t('schedule.exam.allExams') }}
          </button>
          <button class="exam-detail-action primary" type="button" @click="emit('close')">
            {{ t('common.close') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style src="../styles/modal.css" scoped></style>
<style scoped>
.exam-detail-modal {
  width: min(92vw, 400px);
  max-width: 420px;
  max-height: min(84dvh, 680px);
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.exam-detail-body {
  display: grid;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

/* 类型徽标：红系，与卡片角标同源语义 */
.exam-detail-type {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 700;
}

.exam-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.exam-detail-label {
  flex: 0 0 64px;
  color: #6b7280;
  font-weight: 500;
}

.exam-detail-value {
  flex: 1 1 auto;
  min-width: 0;
  color: #111827;
  font-weight: 600;
}

.exam-detail-seat .exam-detail-value {
  color: #b91c1c;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.exam-detail-hint {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: #9ca3af;
}

.exam-detail-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
  padding-top: 14px;
  margin-top: 2px;
}

.exam-detail-action {
  flex: 1 1 0;
  height: 40px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.exam-detail-action.ghost {
  background: #f3f4f6;
  color: #374151;
}

.exam-detail-action.primary {
  background: var(--ui-primary, #2563eb);
  color: #ffffff;
}

.exam-detail-action:active {
  transform: scale(0.98);
}

html.dark .exam-detail-type {
  background: rgba(127, 29, 29, 0.5);
  color: #fecaca;
}

html.dark .exam-detail-label {
  color: #9ca3af;
}

html.dark .exam-detail-value {
  color: #e5e7eb;
}

html.dark .exam-detail-seat .exam-detail-value {
  color: #fca5a5;
}

html.dark .exam-detail-hint {
  color: #6b7280;
}

html.dark .exam-detail-action.ghost {
  background: #374151;
  color: #e5e7eb;
}

@media (max-width: 768px) {
  .exam-detail-label {
    flex-basis: 56px;
  }
}
</style>
