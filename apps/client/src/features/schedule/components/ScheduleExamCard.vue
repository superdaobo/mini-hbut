<script setup>
/**
 * 课表考试块（教务考试安排的只读叠加卡片）。
 *
 * 与其它卡片的区分：
 * - 课程卡：彩色实心底 + `grid-row` 定位（按课节）；
 * - 日程卡：轻 surface + 左侧强调色竖条 + 百分比定位；
 * - 考试卡：浅红实心底 + 左上角半透明「考」角标 + 百分比定位，表达「教务事实、只读」。
 *
 * 信息优先级：名称 → 地点 → 时间。
 * 高度/宽度不足时按「名称+地点」先保、时间后省；极矮时只留角标与时间，绝不溢出裁切。
 * 定位与事件卡同源：全部来自 `slot` 的百分比，不测量 DOM、不读 CSS 变量。
 */
import { computed } from 'vue'
import { useI18n } from '../../../utils/app_i18n'
import { formatMinuteToClock } from '../utils/formatters'

const props = defineProps({
  /** 渲染输入（ScheduleTimelineItem，kind = exam） */
  item: { type: Object, required: true },
  /** lane 布局结果（ScheduleLayoutSlot） */
  slot: { type: Object, required: true }
})
const emit = defineEmits(['open-detail'])

const { t } = useI18n()

/** 原始考试领域对象（camelCase，由 useScheduleExamData 归一） */
const exam = computed(() => props.item?.raw || {})

const widthPercent = computed(() => {
  const value = Number(props.slot?.widthPercent)
  return Number.isFinite(value) && value > 0 ? value : 100
})

const heightPercent = computed(() => {
  const value = Number(props.slot?.heightPercent)
  return Number.isFinite(value) && value > 0 ? value : 0
})

/** 精简态：lane 判定过窄，或调用方明确收窄 */
const isDense = computed(() => !!props.slot?.collapsed)

/** 矮卡片：角标与标题同行，避免顶部留白把标题挤出卡片（时间待定卡常见） */
const isCompact = computed(() => heightPercent.value < 10)

/** 单行态：高度不足一行标题，只保留标题（时间在详情里看） */
const isSingleLine = computed(() => heightPercent.value < 3)

/** 标题兜底：接口偶发缺课程名时给可读占位，不留空白卡片 */
const titleText = computed(
  () => String(props.item?.title || '').trim() || t('schedule.exam.unnamedCourse')
)

const locationText = computed(() => String(exam.value?.location || '').trim())

/**
 * 时间文本：卡片只展示开始时刻。
 * 手机端单列仅约 50px，`09:00-11:00` 会被截成 `09:00-1...`；完整区间在详情里给。
 * 接口缺时间时明确标注「时间待定」，不编造具体时段。
 */
const timeText = computed(() => {
  if (exam.value?.timeTbd) return t('schedule.exam.timeTbd')
  return formatMinuteToClock(props.item?.startMinute) || t('schedule.exam.timeTbd')
})

/** 地点为次级信息：矮卡片 / 窄卡片先让位给标题与时间 */
const showPlace = computed(
  () =>
    !isSingleLine.value &&
    !isCompact.value &&
    !!locationText.value &&
    widthPercent.value >= 30
)

/** 时间次要但常看：高度够一行时展示 */
const showTime = computed(
  () => !isSingleLine.value && heightPercent.value >= 5.5 && widthPercent.value >= 30
)

const cardStyle = computed(() => {
  const slot = props.slot || {}
  const left = Number.isFinite(Number(slot.leftPercent)) ? Number(slot.leftPercent) : 0
  const top = Number.isFinite(Number(slot.topPercent)) ? Number(slot.topPercent) : 0
  return {
    top: `${top}%`,
    height: `${heightPercent.value}%`,
    left: `calc(${left}% + 1px)`,
    width: `calc(${widthPercent.value}% - 2px)`
  }
})

const openDetail = () => emit('open-detail', exam.value)

/** 键盘可访问：role=button 惯例同时响应 Enter 与 Space（Space 需阻止页面滚动） */
const onKeydown = (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.stopPropagation()
  if (event.key === ' ') event.preventDefault()
  openDetail()
}
</script>

<template>
  <div
    class="exam-card"
    :class="{
      'exam-card--dense': isDense,
      'exam-card--compact': isCompact,
      'exam-card--single-line': isSingleLine,
      'exam-card--tbd': exam?.timeTbd
    }"
    :style="cardStyle"
    role="button"
    tabindex="0"
    :aria-label="`${t('schedule.exam.badge')} ${titleText}`"
    @click.stop="openDetail"
    @keydown.stop="onKeydown"
  >
    <span class="exam-card__badge" aria-hidden="true">{{ t('schedule.exam.badge') }}</span>
    <div class="exam-card__body">
      <div v-if="!isSingleLine" class="exam-card__name">{{ titleText }}</div>
      <div v-if="showPlace" class="exam-card__place">{{ locationText }}</div>
      <div class="exam-card__time">{{ timeText }}</div>
    </div>
  </div>
</template>

<style scoped>
/* 浅红实心底 + 红色描边：与课程卡的彩色系、日程卡的浅 surface 都能一眼区分 */
.exam-card {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  /* 超短考试的视觉最小高度由 CSS 承担，布局层不抬高 heightPercent，避免污染重叠判定 */
  min-height: var(--exam-min-height, 18px);
  border: 1px solid var(--exam-border, rgba(220, 38, 38, 0.45));
  border-left: 3px solid var(--exam-accent, #dc2626);
  border-radius: 6px;
  background: var(--exam-surface, rgba(254, 226, 226, 0.92));
  box-shadow: 0 1px 3px rgba(153, 27, 27, 0.12);
  overflow: hidden;
  cursor: pointer;
  /* 事件层整体 pointer-events: none，卡片单独恢复可点击 */
  pointer-events: auto;
  z-index: 4;
  transition: transform 0.1s, box-shadow 0.1s;
}

.exam-card:active {
  transform: scale(0.99);
  box-shadow: 0 0 1px rgba(153, 27, 27, 0.2);
}

/* 「考」角标：绝对定位不占布局，半透明白底 + 红字，压住任何背景都清晰可读 */
.exam-card__badge {
  position: absolute;
  top: 2px;
  left: 2px;
  z-index: 1;
  padding: 0 3px;
  border-radius: 3px;
  border: 1px solid rgba(185, 28, 28, 0.18);
  background: rgba(255, 255, 255, 0.72);
  color: #b91c1c;
  font-size: 8px;
  font-weight: 800;
  line-height: 12px;
  letter-spacing: 0.5px;
  pointer-events: none;
}

.exam-card__body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  /* 顶部留出角标高度，标题不会被「考」压住 */
  padding: 12px 4px 3px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
}

.exam-card__name {
  flex: 0 1 auto;
  min-width: 0;
  min-height: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  color: #7f1d1d;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: normal;
}

.exam-card__place {
  flex: 0 0 auto;
  font-size: 9px;
  line-height: 1.1;
  font-weight: 500;
  color: #991b1b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exam-card__time {
  flex: 0 0 auto;
  font-size: 8px;
  line-height: 1.1;
  color: #b91c1c;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 时间待定：虚线描边 + 更低不透明度，提示「这是占位位置，不是确定时段」 */
.exam-card--tbd {
  border-style: dashed;
  border-left-width: 2px;
  background: rgba(254, 226, 226, 0.66);
}

/* 矮卡片：角标与标题同行（标题左缩进让开角标），把有限的纵向空间留给「名称 + 时间」 */
.exam-card--compact .exam-card__body {
  padding: 2px 4px 2px 15px;
}

.exam-card--compact .exam-card__name {
  -webkit-line-clamp: 1;
  font-size: 9px;
  line-height: 1.1;
}

.exam-card--compact .exam-card__time {
  font-size: 8px;
}

/* 精简态：只保留角标 + 时间，避免标题被裁成半截 */
.exam-card--dense .exam-card__body {
  padding: 2px 2px 2px 14px;
  justify-content: center;
}

.exam-card--dense .exam-card__time {
  text-align: center;
}

/* 单行态：只保留标题，角标与其同行排布，不重叠 */
.exam-card--single-line .exam-card__body {
  padding: 0 2px 0 14px;
  justify-content: center;
}

.exam-card--single-line .exam-card__name {
  font-size: 9px;
}

/* 暗色模式：浅红底改为深红半透明，保证文字对比度 */
html.dark .exam-card {
  background: rgba(127, 29, 29, 0.42);
  border-color: rgba(248, 113, 113, 0.42);
  border-left-color: #f87171;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.42);
}

html.dark .exam-card__badge {
  background: rgba(15, 23, 42, 0.62);
  border-color: rgba(248, 113, 113, 0.4);
  color: #fca5a5;
}

html.dark .exam-card__name {
  color: #fee2e2;
}

html.dark .exam-card__place {
  color: #fecaca;
}

html.dark .exam-card__time {
  color: #fca5a5;
}

@media (max-width: 768px) {
  .exam-card__name {
    font-size: 9px;
  }

  .exam-card__place,
  .exam-card__time {
    font-size: 8px;
  }

  .exam-card__badge {
    font-size: 7px;
    line-height: 11px;
  }
}
</style>
