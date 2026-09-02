<script setup>
/**
 * 课表主体：日期头 + 时间轴 + 课程网格（含周切换动画）。
 * 自 ScheduleView.vue 拆分；#749 修复行距错位（容器 min-height + 行 flex 固定），
 * 划分线保持 v1.4.6 的 line-row dashed 虚线视觉（用户指定）。
 */
import { MAX_PERIOD, timeSchedule } from '../constants'

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
})
const emit = defineEmits(['open-detail'])

const isTodayColumn = (dayIndex) => {
  const idx = Number(dayIndex) - 1
  if (idx < 0 || idx > 6) return false
  const date = props.weekDates[idx]
  return !!date?.isToday
}

const periodRows = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1)
</script>

<template>
  <Transition :name="weekTransitionName" mode="out-in">
    <div class="timetable-container" :key="`week-${selectedWeek}`">
      <!-- 日期头 -->
      <div class="date-header">
        <div class="month-col">
          <div class="month-num">{{ currentMonth }}<span class="month-label">月</span></div>
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
          <div v-for="day in 7" :key="day" class="day-column" :class="{ 'is-today-column': isTodayColumn(day) }">
            <div
              v-for="course in getCoursesForDay(day)"
              :key="course._uid || course.id"
              class="course-card"
              :class="[
                `course-card--${scheduleCourseCardStyle}`,
                { conflict: course.is_conflict },
                { 'widget-highlight': isWidgetHighlighted(course, day) }
              ]"
              :style="getCourseStyle(course)"
              @click="emit('open-detail', course)"
            >
              <div class="course-name">{{ course.name }}</div>
              <div class="course-room">
                {{ course.is_conflict ? '点击查看冲突课程详情' : (course.room_code || course.room) }}
              </div>
              <div
                v-if="scheduleCourseCardStyle === 'class' && !course.is_conflict"
                class="course-teacher"
              >
                {{ course.teacher || '未标注教师' }}
              </div>
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
