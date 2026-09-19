<script setup>
/**
 * 课表主体：日期头 + 时间轴 + 课程网格（含周切换动画）。
 * 自 ScheduleView.vue 拆分；#749 修复行距错位（容器 min-height + 行 flex 固定），
 * 划分线保持 v1.4.6 的 line-row dashed 虚线视觉（用户指定）。
 *
 * #837：在课程网格之上叠加「真实时间日程层」——
 * - 事件卡用百分比绝对定位（与课程卡的 grid-row 定位互不干扰，虚线仍在内容层之下）；
 * - 课程与日程重叠时课程收窄（lane 布局由 utils/timelineLayout 纯函数计算，复用 #834 的
 *   intervalsOverlap，不自建第二套重叠算法）；
 * - 可见区外（早于第一节 / 晚于最后一节）的日程由列顶 / 列底 indicator 承载，不静默丢失。
 */
import { computed, ref, watch } from 'vue'
import { MAX_PERIOD, timeSchedule } from '../constants'
// #788 i18n：文案经 useI18n 响应式取词
import { useI18n } from '../../../utils/app_i18n'
import ScheduleEventCard from './ScheduleEventCard.vue'
import { formatMinuteToClock } from '../utils/formatters'
import { buildScheduleTimeGeometry, getGridTotalHeight, intervalToGridRect } from '../utils/timeGeometry'
import { courseToTimelineItem, eventToTimelineItem } from '../utils/timelineAdapters'
import { gridYToMinute, layoutTimelineItems, splitOutOfRangeEvents } from '../utils/timelineLayout'
import { buildBlankTimeSelection, isSameBlankTimeSelection } from '../utils/blankSelection'

const props = defineProps({
  weekDates: { type: Array, default: () => [] },
  currentMonth: { type: Number, default: 0 },
  selectedWeek: { type: Number, default: 0 },
  // #742a：周切换过渡方向（由 useScheduleSemester 按滑动/键盘方向设置）
  weekTransitionName: { type: String, default: 'week-slide-left' },
  scheduleCourseCardStyle: { type: String, default: 'modern' },
  courseCardRefreshNonce: { type: Number, default: 0 },
  getCoursesForDay: { type: Function, default: () => () => [] },
  getCourseStyle: { type: Function, default: () => ({}) },
  isWidgetHighlighted: { type: Function, default: () => false },
  // #837：该天的事件（camelCase 领域对象）。默认返回空数组 → 未接线时零改动
  getEventsForDay: { type: Function, default: () => () => [] },
  // #856：all | courses | events。筛选发生在 lane 输入层，不做 CSS 假隐藏。
  viewMode: { type: String, default: 'all' },
  // #837：是否允许点击空白处快速创建（默认开启）
  enableBlankCreate: { type: Boolean, default: true },
  // #857：父层打开抽屉/弹窗时递增，清掉未确认的临时虚线框。
  selectionResetNonce: { type: Number, default: 0 },
})
const emit = defineEmits(['open-detail', 'open-event-detail', 'confirm-blank-selection'])

// 响应式 t：语言切换后网格文案即时生效
const { t } = useI18n()

/**
 * 时间几何以 slotHeight = 100 / MAX_PERIOD 构建：几何的 y 单位即「占网格总高的百分比」，
 * 因此事件卡可直接用 top / height 百分比定位，无需读取 --slot-height 或测量 DOM。
 * 时间表为静态常量，几何在模块加载时构建一次即可。
 */
const percentGeometry = buildScheduleTimeGeometry(timeSchedule, 100 / MAX_PERIOD)

/** tap / swipe 判定阈值（px）：位移超过即视为滑动，不触发空白创建 */
const TAP_MOVE_THRESHOLD_PX = 8
/** 空白布局结果（时间表不可用 / 当天无条目时的安全回退） */
const EMPTY_LAYOUT = { slots: [], overflowGroups: [] }

const isTodayColumn = (dayIndex) => {
  const idx = Number(dayIndex) - 1
  if (idx < 0 || idx > 6) return false
  const date = props.weekDates[idx]
  return !!date?.isToday
}

const periodRows = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1)

/** 当前周的 ISO 日期串：eventToTimelineItem 接收的是字符串数组，weekDates 元素是对象 */
const weekIsoDates = computed(() =>
  (Array.isArray(props.weekDates) ? props.weekDates : []).map((entry) => entry?.iso || '')
)

const showCourses = computed(() => props.viewMode !== 'events')
const showEvents = computed(() => props.viewMode !== 'courses')

const visibleCoursesForDay = (day) => {
  if (!showCourses.value) return []
  const courses = props.getCoursesForDay(day)
  return Array.isArray(courses) ? courses : []
}

const visibleEventsForDay = (day) => {
  if (!showEvents.value) return []
  const events = props.getEventsForDay(day)
  return Array.isArray(events) ? events : []
}

/** 课程对象 → lane 匹配键（与 courseToTimelineItem 的 id 取值口径保持一致） */
const courseKeyOf = (course) => String(course?._uid ?? course?.id ?? course?.source_id ?? '')

/** 汇总某天参与 lane 计算的条目：课程（教务 / 自定义）+ 个人日程 */
const collectTimelineItems = (day) => {
  const items = []
  const courses = visibleCoursesForDay(day)
  if (Array.isArray(courses)) {
    for (const course of courses) {
      const item = courseToTimelineItem(
        course,
        day,
        course?.is_custom ? 'custom-course' : 'official',
        timeSchedule
      )
      if (item) items.push(item)
    }
  }
  const events = visibleEventsForDay(day)
  if (Array.isArray(events)) {
    for (const event of events) {
      const item = eventToTimelineItem(event, weekIsoDates.value, day)
      if (item) items.push(item)
    }
  }
  return items
}

/** 按开始时间升序（用于可见区外 indicator 的展示顺序） */
const sortByStart = (list) =>
  [...list].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)

/**
 * 每天的「时间层」数据：
 * - layout：进入 lane 计算的条目布局（含课程，用于课程卡收窄）；
 * - before / after：早于第一节 / 晚于最后一节的日程，由 edge indicator 单独承载。
 */
const dayTimeline = computed(() => {
  const map = {}
  for (let day = 1; day <= 7; day += 1) {
    const items = collectTimelineItems(day)
    const { before, after } = splitOutOfRangeEvents(items, percentGeometry)
    map[day] = {
      layout: layoutTimelineItems(items, percentGeometry),
      before: sortByStart(before),
      after: sortByStart(after)
    }
  }
  return map
})

const dayLayout = (day) => dayTimeline.value[day]?.layout || EMPTY_LAYOUT
const eventSlots = (day) => dayLayout(day).slots.filter((slot) => slot.item.kind === 'event')
const overflowGroups = (day) => showEvents.value ? dayLayout(day).overflowGroups : []
const beforeEvents = (day) => dayTimeline.value[day]?.before || []
const afterEvents = (day) => dayTimeline.value[day]?.after || []

/** 课程 lane 映射：仅当课程与其它条目重叠（需要收窄）时才存在条目 */
const courseSlotMap = computed(() => {
  const map = new Map()
  for (let day = 1; day <= 7; day += 1) {
    const courses = visibleCoursesForDay(day)
    if (!Array.isArray(courses) || courses.length === 0) continue
    const byId = new Map()
    for (const slot of dayLayout(day).slots) {
      if (slot.item.kind === 'course') byId.set(slot.item.id, slot)
    }
    if (byId.size === 0) continue
    for (const course of courses) {
      const key = courseKeyOf(course)
      const slot = byId.get(key)
      if (slot) map.set(`${day}:${key}`, slot)
    }
  }
  return map
})

/**
 * 课程与日程重叠时收窄课程卡：保留原有 grid-row 定位，只叠加宽度与外边距
 * （左右各留 1px 缝隙，避免与侧挂的日程卡贴合）。无重叠时返回 null，DOM 与旧版一致。
 */
const courseLaneStyle = (course, day) => {
  const slot = courseSlotMap.value.get(`${day}:${courseKeyOf(course)}`)
  if (!slot || slot.widthPercent >= 100) return null
  const left = slot.leftPercent
  const width = slot.widthPercent
  return {
    width: `calc(${width}% - 2px)`,
    marginLeft: `calc(${left}% + 1px)`,
    marginRight: `calc(${100 - left - width}% + 1px)`
  }
}

/** #857：第一次点击只选中时间块；同一块第二次点击才确认进入「添加安排」。 */
const blankSelection = ref(null)

const clearBlankSelection = () => {
  blankSelection.value = null
}

watch(
  [
    () => props.selectedWeek,
    () => props.viewMode,
    () => props.selectionResetNonce,
    () => weekIsoDates.value.join('|')
  ],
  clearBlankSelection
)

const blankSelectionStyle = (day) => {
  const selection = blankSelection.value
  if (!selection || selection.dayIndex !== Number(day)) return null
  const rect = intervalToGridRect(selection.startMinute, selection.endMinute, percentGeometry)
  if (!rect) return null
  return {
    top: `${rect.top}%`,
    height: `${rect.height}%`
  }
}

const blankSelectionLabel = (day) => {
  const selection = blankSelection.value
  if (!selection || selection.dayIndex !== Number(day)) return ''
  return selection.startPeriod === selection.endPeriod
    ? String(selection.startPeriod)
    : `${selection.startPeriod}–${selection.endPeriod}`
}

/** 空白点击：记录 pointerdown 坐标，用于区分 tap 与滑动（页面根有周滑动手势） */
let pointerOrigin = null
let tapMoved = false

const handleColumnPointerDown = (event) => {
  pointerOrigin = { x: event.clientX, y: event.clientY }
  tapMoved = false
}

const handleColumnPointerUp = (event) => {
  const origin = pointerOrigin
  pointerOrigin = null
  if (!origin) return
  tapMoved =
    Math.abs(event.clientX - origin.x) > TAP_MOVE_THRESHOLD_PX ||
    Math.abs(event.clientY - origin.y) > TAP_MOVE_THRESHOLD_PX
}

/**
 * 空白点击 → 由点击高度反算课节，并吸附到常见双节块。
 * 第一次只画虚线框；再次点击同一块才 emit 确认。
 * 命中课程卡 / 日程卡 / 聚合入口 / indicator 时不参与空白选择。
 */
const handleColumnClick = (event, day) => {
  if (!props.enableBlankCreate || tapMoved) return
  const target = event.target
  if (
    target?.closest?.('.course-card, .event-card, .event-overflow-chip, .event-edge-indicator')
  ) {
    clearBlankSelection()
    return
  }
  const layer = event.currentTarget?.querySelector?.('.event-layer')
  const rect = layer?.getBoundingClientRect?.()
  if (!rect || rect.height <= 0) return
  const offsetY = event.clientY - rect.top
  if (offsetY < 0 || offsetY > rect.height) return

  // 事件层高度与几何总高严格对应，故「层内比例 × 几何总高」即几何单位下的 y
  const approximate = gridYToMinute(
    (offsetY / rect.height) * getGridTotalHeight(percentGeometry),
    percentGeometry
  )
  if (approximate === null) return

  const nextSelection = buildBlankTimeSelection(
    approximate,
    Number(day),
    props.weekDates?.[day - 1]?.iso || '',
    timeSchedule
  )
  if (!nextSelection) return

  if (isSameBlankTimeSelection(blankSelection.value, nextSelection)) {
    clearBlankSelection()
    emit('confirm-blank-selection', nextSelection)
    return
  }
  blankSelection.value = nextSelection
}

/** 可见区外日程的 indicator 文案：时间 + 标题（多条时补 `+N`），全部来自数据，无硬编码文案 */
const edgeHint = (list) => {
  const first = list[0]
  if (!first) return ''
  const clock = formatMinuteToClock(first.startMinute)
  const suffix = list.length > 1 ? ` +${list.length - 1}` : ''
  return `${clock} ${first.title || ''}${suffix}`.trim()
}

/** indicator / 聚合入口统一打开排序最靠前的那一条详情 */
const openFirstEvent = (list) => {
  const first = Array.isArray(list) ? list[0] : null
  if (first) {
    clearBlankSelection()
    emit('open-event-detail', first.raw)
  }
}

const openCourseDetail = (course) => {
  clearBlankSelection()
  emit('open-detail', course)
}

const openEventDetail = (raw) => {
  clearBlankSelection()
  emit('open-event-detail', raw)
}
</script>

<template>
  <Transition :name="weekTransitionName" mode="out-in">
    <div class="timetable-container" :key="`week-${selectedWeek}`">
      <!-- 日期头 -->
      <div class="date-header">
        <div class="month-col">
          <div class="month-num">{{ currentMonth }}<span v-if="t('schedule.grid.monthSuffix')" class="month-label">{{ t('schedule.grid.monthSuffix') }}</span></div>
        </div>
        <div class="days-row">
          <div v-for="day in 7" :key="day" class="day-col" :class="{ 'is-today': isTodayColumn(day) }">
            <div class="day-num">{{ weekDates[day - 1]?.date || day }}</div>
            <div class="day-label">{{ weekDates[day - 1]?.dayLabel || '' }}</div>
          </div>
        </div>
      </div>

      <!-- 滚动区域 -->
      <div class="grid-body">
        <!-- 左侧时间轴 -->
        <div class="time-axis">
          <div v-for="t in timeSchedule" :key="t.p" class="time-slot">
            <span class="time-start">{{ t.start }}</span>
            <span class="period-num">{{ t.p }}</span>
            <span class="time-end">{{ t.end }}</span>
          </div>
        </div>

        <!-- 课程网格 -->
        <div class="courses-grid" :key="`courses-grid-${scheduleCourseCardStyle}-${courseCardRefreshNonce}`">
          <!-- 背景划分线：虚线视觉与 v1.4.6 一致（用户指定 dashed）。
               #749 的行距对齐由「容器 min-height + 行 flex: 0 0」双保护保证，
               line-row 不再可能被 flex 压缩 -->
          <div class="grid-lines" aria-hidden="true">
            <div v-for="i in periodRows" :key="i" class="line-row"></div>
          </div>

          <!-- 每天一列 -->
          <div
            v-for="day in 7"
            :key="day"
            class="day-column"
            :class="{ 'is-today-column': isTodayColumn(day) }"
            @pointerdown="handleColumnPointerDown"
            @pointerup="handleColumnPointerUp"
            @click="handleColumnClick($event, day)"
          >
            <div
              v-for="course in visibleCoursesForDay(day)"
              :key="course._uid || course.id"
              class="course-card"
              :class="[
                `course-card--${scheduleCourseCardStyle}`,
                { conflict: course.is_conflict },
                { 'widget-highlight': isWidgetHighlighted(course, day) }
              ]"
              :style="[getCourseStyle(course), courseLaneStyle(course, day)]"
              @click="openCourseDetail(course)"
            >
              <div class="course-name">{{ course.name }}</div>
              <div class="course-room">
                {{ course.is_conflict ? t('schedule.grid.conflictHint') : (course.room_code || course.room) }}
              </div>
              <div
                v-if="scheduleCourseCardStyle === 'class' && !course.is_conflict"
                class="course-teacher"
              >
                {{ course.teacher || t('schedule.grid.noTeacher') }}
              </div>
            </div>

            <!-- #857/#860：第一次空白点击仅展示临时双节虚线框。
                 百分比 top/height 必须相对固定 11 节高度计算，不能直接相对可能被拉伸的 day-column。 -->
            <div class="blank-selection-layer" aria-hidden="true">
              <div
                v-if="blankSelectionStyle(day)"
                class="blank-time-selection"
                :style="blankSelectionStyle(day)"
              >
                <span class="blank-time-selection-label">{{ blankSelectionLabel(day) }}</span>
              </div>
            </div>

            <!-- #837 事件层：绝对定位 + 百分比坐标，与课程卡的 grid-row 定位互不干扰；
                 dashed 虚线仍在内容层之下，事件卡因此可以视觉跨过课节边界。
                 层整体 pointer-events: none，仅卡片 / 入口恢复点击，避免挡住课程卡。 -->
            <div class="event-layer">
              <!-- 早于第一节的日程：不静默丢失，汇总为列顶入口 -->
              <button
                v-if="beforeEvents(day).length"
                type="button"
                class="event-edge-indicator event-edge-indicator--before"
                @click.stop="openFirstEvent(beforeEvents(day))"
              >{{ `↑ ${edgeHint(beforeEvents(day))}` }}</button>

              <ScheduleEventCard
                v-for="slot in eventSlots(day)"
                :key="`event-${slot.item.id}`"
                :item="slot.item"
                :slot="slot"
                @open-detail="openEventDetail($event)"
              />

              <!-- 超可读阈值的聚合入口：不在该处继续压窄成细条 -->
              <button
                v-for="group in overflowGroups(day)"
                :key="`overflow-${day}-${group.topPercent}`"
                type="button"
                class="event-overflow-chip"
                :style="{ top: `${group.topPercent}%` }"
                @click.stop="openFirstEvent(group.items)"
              >{{ `+${group.hiddenCount}` }}</button>

              <!-- 晚于最后一节的日程：汇总为列底入口 -->
              <button
                v-if="afterEvents(day).length"
                type="button"
                class="event-edge-indicator event-edge-indicator--after"
                @click.stop="openFirstEvent(afterEvents(day))"
              >{{ `↓ ${edgeHint(afterEvents(day))}` }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 日期头 */
.date-header {
  height: var(--date-header-height);
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  background: #ffffff;
  flex-shrink: 0;
}

.month-col {
  width: var(--time-axis-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #111827;
  font-size: 14px;
}

.month-label {
  font-size: 10px;
  font-weight: normal;
  color: #9ca3af;
}

.days-row {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: center;
}

.day-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1px;
}

.day-col.is-today {
  background: #dbeafe;
  border-radius: 8px;
  color: #2563eb;
}

.day-col.is-today .day-num {
  color: #2563eb;
  font-weight: 800;
}

.day-num {
  font-size: 14px;
  color: #111827;
  font-weight: 600;
}

.day-label {
  font-size: 10px;
  color: #9ca3af;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

/* 课表主体 */
.timetable-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.grid-body {
  flex: 1;
  display: flex;
  align-items: stretch;
  overflow-y: auto;
  min-height: 0;
  padding-bottom: var(--schedule-bottom-gap);
  box-sizing: border-box;
  position: relative;
  background: #ffffff;
  /* 隐藏滚动条 */
  scrollbar-width: none;
}

.grid-body::-webkit-scrollbar {
  display: none;
}

.time-axis {
  width: var(--time-axis-width);
  background: #f9fafb;
  border-right: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  min-height: calc(var(--slot-height) * 11 + var(--schedule-bottom-gap));
  height: 100%;
  padding-bottom: var(--schedule-bottom-gap);
  overflow: hidden;
  position: relative;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
}

.time-slot {
  /* #749：flex 固定行高，禁止时间轴行被压缩/拉伸，行距恒等于 var(--slot-height) */
  flex: 0 0 var(--slot-height);
  height: var(--slot-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #64748b;
  box-sizing: border-box;
}

.time-start,
.time-end {
  font-size: 9px;
  line-height: 1;
}

.time-start {
  color: #94a3b8;
}

.time-end {
  color: #cbd5e1;
}

.period-num {
  font-size: 12px;
  font-weight: 800;
  color: #334155;
}

.courses-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  position: relative;
  height: 100%;
  /* #749：恢复 v1.4.6 高度保护——视口不足 11×slot 时容器不再被压缩，
     课程网格 / 时间轴 / 划分线三套行距在任意视口下保持恒等 */
  min-height: calc(var(--slot-height) * 11 + var(--schedule-bottom-gap));
  box-sizing: border-box;
}

/* 划分线：line-row 虚线（v1.4.6 视觉，用户指定 dashed）。
   #749 行距对齐的根因修复是两道保护，与线实现解耦：
   1) .courses-grid 的 min-height 保证 grid-lines 容器 ≥ 11×slot，行不再被压缩
   2) .line-row / .time-slot 的 flex: 0 0 固定行高，禁止压缩/拉伸 */
.grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.line-row {
  height: var(--slot-height);
  flex: 0 0 var(--slot-height);
  position: relative;
  box-sizing: border-box;
}

/* 稀疏虚线：::after 限定 1px 线高，水平 repeating 渐变控制疏密
   （8px 实段 / 8px 空，浏览器原生 dashed 约 3px 段太密，用户要求稀松） */
.line-row::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background-image: repeating-linear-gradient(
    to right,
    #e5e7eb 0,
    #e5e7eb 8px,
    transparent 8px,
    transparent 16px
  );
}

.day-column {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(11, var(--slot-height));
  grid-template-columns: 1fr; /* 强制单列 */
  padding: 0 1px;
  position: relative;
  min-height: calc(var(--slot-height) * 11);
}

.blank-selection-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: calc(var(--slot-height) * 11);
  pointer-events: none;
  z-index: 4;
}

.blank-time-selection {
  position: absolute;
  left: 2px;
  right: 2px;
  box-sizing: border-box;
  border: 2px dashed color-mix(in srgb, var(--ui-primary, #2563eb) 78%, #ffffff 22%);
  border-radius: 10px;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 10%, transparent 90%);
  pointer-events: none;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 3px 1px;
}

.blank-time-selection-label {
  font-size: 8px;
  line-height: 1;
  font-weight: 800;
  color: var(--ui-primary, #2563eb);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  padding: 2px 3px;
  white-space: nowrap;
}

html.dark .blank-time-selection {
  border-color: rgba(96, 165, 250, 0.88);
  background: rgba(59, 130, 246, 0.14);
}

html.dark .blank-time-selection-label {
  color: #bfdbfe;
  background: rgba(15, 23, 42, 0.92);
}

.day-column.is-today-column::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: rgba(219, 234, 254, 0.2);
  border-left: 1px solid rgba(37, 99, 235, 0.08);
  border-right: 1px solid rgba(37, 99, 235, 0.08);
}

/* #837 事件层：绝对定位在列顶的 11 行高度内。
   高度显式绑定 11×slot（而不是 inset: 0）——列被 flex/grid 拉伸得比 11 行更高时，
   百分比定位仍与 grid-template-rows 严格同源，事件卡不会纵向漂移。
   层整体 pointer-events: none，只有卡片 / 入口恢复点击。 */
.event-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: calc(var(--slot-height) * 11);
  pointer-events: none;
  z-index: 2;
}

/* 可见区外日程入口（早于第一节 / 晚于最后一节）：轻量 chip，不新增行 / 区域 */
.event-edge-indicator {
  position: absolute;
  left: 1px;
  right: 1px;
  height: 13px;
  padding: 0 3px;
  box-sizing: border-box;
  border: none;
  border-radius: 4px;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  font-size: 8px;
  line-height: 13px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  pointer-events: auto;
  z-index: 5;
}

.event-edge-indicator--before {
  top: 0;
}

.event-edge-indicator--after {
  bottom: 0;
}

/* 超可读阈值的聚合入口：贴列右侧，提示该处还有被聚合的日程 */
.event-overflow-chip {
  position: absolute;
  right: 1px;
  min-width: 18px;
  height: 14px;
  padding: 0 3px;
  box-sizing: border-box;
  border: 1px solid rgba(37, 99, 235, 0.35);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.96);
  color: #1d4ed8;
  font-size: 8px;
  font-weight: 700;
  line-height: 12px;
  cursor: pointer;
  pointer-events: auto;
  z-index: 6;
}

html.dark .event-edge-indicator {
  background: rgba(96, 165, 250, 0.18);
  color: #93c5fd;
}

html.dark .event-overflow-chip {
  background: rgba(30, 41, 59, 0.96);
  border-color: rgba(96, 165, 250, 0.4);
  color: #93c5fd;
}

.course-card {
  margin: 1px;
  padding: 4px;
  background: var(--course-bg, #ffffff) !important;
  color: var(--course-text, #0f172a) !important;
  border-color: var(--course-border, #e5e7eb) !important;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  border: var(--course-border-width, 1px) solid var(--course-border, #e5e7eb) !important;
  border-radius: var(--course-radius, 12px) !important;
  box-shadow: var(--course-shadow, 0 2px 8px rgba(0, 0, 0, 0.04)) !important;
  z-index: 1;
}

.courses-grid .day-column > .course-card {
  border: var(--course-border-width, 1px) solid var(--course-border, #e5e7eb) !important;
  border-radius: var(--course-radius, 12px) !important;
  box-shadow: var(--course-shadow, 0 2px 8px rgba(0, 0, 0, 0.04)) !important;
  background: var(--course-bg, #ffffff) !important;
  color: var(--course-text, #0f172a) !important;
}

.courses-grid .day-column > .course-card.course-card--modern {
  border-radius: var(--course-radius, 12px) !important;
  box-shadow: var(--course-shadow, 0 2px 8px rgba(0, 0, 0, 0.04)) !important;
}

.courses-grid .day-column > .course-card.course-card--traditional {
  border-radius: 12px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
  border: 1px solid var(--course-border, #e5e7eb) !important;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 2px;
}

.courses-grid .day-column > .course-card.course-card--traditional .course-name {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 2px;
}

.courses-grid .day-column > .course-card.course-card--traditional .course-room,
.courses-grid .day-column > .course-card.course-card--traditional .course-teacher {
  font-size: 10px;
  opacity: 0.8;
  line-height: 1.3;
}

.courses-grid .day-column > .course-card.course-card--class {
  border-left: 3px solid var(--course-border, #e5e7eb) !important;
  border-radius: 12px !important;
  box-shadow: var(--course-shadow, 0 2px 8px rgba(0, 0, 0, 0.04)) !important;
  padding: 4px 6px;
  gap: 2px;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
}

.course-card.conflict .course-name {
  font-weight: 700;
}

.course-card.conflict .course-room {
  font-size: 10px;
}

.course-card:active {
  transform: scale(0.98);
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.1);
}

/* Widget 深链接高亮动画 */
.course-card.widget-highlight {
  animation: widget-highlight-pulse 1.5s ease-in-out 2;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5), 0 8px 20px rgba(59, 130, 246, 0.25) !important;
  z-index: 10 !important;
}

@keyframes widget-highlight-pulse {
  0%, 100% {
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5), 0 8px 20px rgba(59, 130, 246, 0.25);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.3), 0 12px 28px rgba(59, 130, 246, 0.35);
  }
}

.course-name {
  font-weight: 700;
  font-size: 11px;
  margin-bottom: 2px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-room {
  font-size: 10px;
  opacity: 0.85;
  font-weight: 500;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.course-teacher {
  font-size: 10px;
  opacity: 0.75;
  font-weight: 500;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* 周切换过渡 */
.week-slide-left-enter-active,
.week-slide-left-leave-active,
.week-slide-right-enter-active,
.week-slide-right-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.week-slide-left-enter-from {
  transform: translateX(24px);
  opacity: 0;
}

.week-slide-left-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}

.week-slide-right-enter-from {
  transform: translateX(-24px);
  opacity: 0;
}

.week-slide-right-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

@media (max-width: 768px) {
  .month-col,
  .time-axis {
    width: var(--time-axis-width);
  }

  .time-slot {
    font-size: 9px;
  }

  .period-num {
    font-size: 12px;
  }

  .day-column {
    grid-template-rows: repeat(11, var(--slot-height));
  }

  .course-card {
    padding: 3px 2px;
    margin: 1px 0;
    font-size: 10px;
  }

  .course-name {
    font-size: 10px;
  }

  .course-room {
    font-size: 9px;
  }

  .course-teacher {
    font-size: 9px;
  }
}
</style>
