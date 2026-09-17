<script setup>
/**
 * #837 个人日程卡片（时间画布上的事件块）。
 *
 * 与课程卡的区分（刻意不复用课程卡样式）：
 * - 课程卡 = 实心主题底 + 居中文字 + 网格行定位（grid-row: period / span djs）；
 * - 日程卡 = 轻 surface（半透明浅底）+ 左侧强调色竖条 + 左对齐时间文字 + 百分比定位。
 *
 * 定位完全来自 `slot` 的百分比（top / height / left / width），不读取任何 CSS 变量、
 * 不做 DOM 测量，因此与课程卡的行定位互不干扰，也便于在无 JS 测量环境下渲染。
 */
import { computed } from 'vue'
import { formatMinuteToClock } from '../utils/formatters'

const props = defineProps({
  /** 渲染输入（ScheduleTimelineItem） */
  item: { type: Object, required: true },
  /** lane 布局结果（ScheduleLayoutSlot） */
  slot: { type: Object, required: true },
  /** 强制精简态（调用方按上下文收窄时使用） */
  compact: { type: Boolean, default: false }
})
const emit = defineEmits(['open-detail'])

const widthPercent = computed(() => {
  const value = Number(props.slot?.widthPercent)
  return Number.isFinite(value) && value > 0 ? value : 100
})

const heightPercent = computed(() => {
  const value = Number(props.slot?.heightPercent)
  return Number.isFinite(value) && value > 0 ? value : 0
})

/** 精简态：调用方指定，或 lane 布局判定宽度过窄（collapsed） */
const isDense = computed(() => props.compact || !!props.slot?.collapsed)

/** 单行态：极窄或极矮（不足一行文字）时只展示时间，避免标题被裁成半截 */
const isSingleLine = computed(() => isDense.value || heightPercent.value < 4)

/** 空间足够才展示完整时间区间，否则只展示开始时间 */
const showTimeRange = computed(() => !isSingleLine.value && widthPercent.value >= 48)

/** 地点为次级信息：窄/矮时隐藏 */
const showPlace = computed(
  () =>
    !isSingleLine.value &&
    !!props.item?.subtitle &&
    widthPercent.value >= 52 &&
    heightPercent.value >= 8
)

/** 同簇被聚合隐藏的条目数（> 0 时在卡片内提示 `+N`） */
const hiddenCount = computed(() => {
  const value = Number(props.slot?.hiddenCount)
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
})

const startText = computed(() => formatMinuteToClock(props.item?.startMinute))
const endText = computed(() => formatMinuteToClock(props.item?.endMinute))

const cardStyle = computed(() => {
  const slot = props.slot || {}
  const left = Number.isFinite(Number(slot.leftPercent)) ? Number(slot.leftPercent) : 0
  const top = Number.isFinite(Number(slot.topPercent)) ? Number(slot.topPercent) : 0
  return {
    top: `${top}%`,
    height: `${heightPercent.value}%`,
    // 左右各留 1px 缝隙，与相邻 lane / 课程卡保持可辨识的间隔
    left: `calc(${left}% + 1px)`,
    width: `calc(${widthPercent.value}% - 2px)`,
    '--event-accent': props.item?.color || 'var(--event-accent-default, #2563eb)'
  }
})

const openDetail = () => emit('open-detail', props.item?.raw)
</script>

<template>
  <div
    class="event-card"
    :class="{ 'event-card--dense': isDense, 'event-card--single-line': isSingleLine }"
    :style="cardStyle"
    role="button"
    tabindex="0"
    @click.stop="openDetail"
    @keydown.enter.stop="openDetail"
  >
    <span class="event-card__bar" aria-hidden="true"></span>
    <div class="event-card__body">
      <div v-if="!isSingleLine" class="event-card__name">{{ item?.title }}</div>
      <div class="event-card__time">
        <span class="event-card__clock">{{ showTimeRange ? `${startText} - ${endText}` : startText }}</span>
        <span v-if="hiddenCount > 0" class="event-card__more">{{ `+${hiddenCount}` }}</span>
      </div>
      <div v-if="showPlace" class="event-card__place">{{ item?.subtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
/* 轻 surface + 左侧强调色竖条：与实心课程卡形成一眼可辨的差异 */
.event-card {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  /* 超短事件的视觉最小高度由 CSS 承担（布局层不抬高 heightPercent，避免污染重叠判定） */
  min-height: var(--event-min-height, 16px);
  border: 1px solid var(--event-border, rgba(37, 99, 235, 0.32));
  border-radius: 6px;
  background: var(--event-surface, rgba(255, 255, 255, 0.94));
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  overflow: hidden;
  cursor: pointer;
  /* 事件层整体 pointer-events: none，卡片单独恢复可点击，避免挡住课程卡 */
  pointer-events: auto;
  z-index: 3;
  transition: transform 0.1s, box-shadow 0.1s;
}

.event-card:active {
  transform: scale(0.99);
  box-shadow: 0 0 1px rgba(15, 23, 42, 0.12);
}

.event-card__bar {
  flex: 0 0 3px;
  background: var(--event-accent, #2563eb);
}

.event-card__body {
  flex: 1 1 auto;
  min-width: 0;
  padding: 2px 3px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
}

.event-card__name {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.15;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-card__time {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  font-size: 9px;
  line-height: 1.1;
  color: #475569;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
}

.event-card__clock {
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card__more {
  flex: 0 0 auto;
  font-weight: 700;
  color: var(--event-accent, #2563eb);
}

.event-card__place {
  font-size: 9px;
  line-height: 1.1;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 精简态：只保留色条 + 时间 */
.event-card--dense .event-card__body {
  padding: 0 2px;
}

.event-card--single-line .event-card__time {
  justify-content: center;
}

/* 暗色模式：仓库的 html.dark 通配规则不覆盖本组件类名（已避开 title / time-slot 等通配片段），
   因此在此显式给出可读配色 */
html.dark .event-card {
  background: rgba(30, 41, 59, 0.94);
  border-color: rgba(148, 163, 184, 0.32);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

html.dark .event-card__name {
  color: #e2e8f0;
}

html.dark .event-card__time {
  color: #cbd5e1;
}

html.dark .event-card__place {
  color: #94a3b8;
}

@media (max-width: 768px) {
  .event-card__name {
    font-size: 9px;
  }

  .event-card__time,
  .event-card__place {
    font-size: 8px;
  }
}
</style>
