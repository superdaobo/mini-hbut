/**
 * 课表领域 - 学期/周次/漫游导航组合式函数。
 * 原内联于 ScheduleView.vue（学期元状态/日期头/周次滑动/键盘/回到当前周），
 * 拆分后保持行为一致。
 */
import { computed, ref, watch } from 'vue'
import { isTestAccountSession } from '../../../utils/test_account.js'
import { recordSemesterStartDate } from '../../../utils/schedule_prefetch.js'
import { SCHEDULE_META_KEY, weekDays } from '../constants'
import { readStoredSemester } from '../utils/semester'

export interface ScheduleSemesterOptions {
  /** 任一弹层打开时为 true（滑动/键盘翻周将被忽略）；惰性求值避免 composable 初始化顺序耦合 */
  isAnyOverlayOpen: () => boolean
}

export const useScheduleSemester = (options: ScheduleSemesterOptions) => {
  const { isAnyOverlayOpen } = options

  const semester = ref('')
  const semesterDraft = ref('')
  const currentWeek = ref(0)
  const selectedWeek = ref(0)
  const totalWeeks = ref(25)
  const startDateStr = ref('')
  const vacationNotice = ref('')
  const weekTransitionName = ref('week-slide-left')

  // 初始学期：本地存储优先
  const storedSemester = readStoredSemester()
  if (storedSemester) {
    semester.value = storedSemester
    semesterDraft.value = storedSemester
  }

  /** 本周日期头（7 天） */
  const weekDates = computed(() => {
    if (!startDateStr.value) return []
    const start = new Date(startDateStr.value)
    const daysToAdd = (selectedWeek.value - 1) * 7
    start.setDate(start.getDate() + daysToAdd)

    const dates: any[] = []
    const today = new Date()

    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      dates.push({
        year: yyyy,
        month: d.getMonth() + 1,
        date: d.getDate(),
        iso: `${yyyy}-${mm}-${dd}`,
        dayLabel: weekDays[i],
        isToday: d.toDateString() === today.toDateString()
      })
    }
    return dates
  })

  const currentMonth = computed(() => {
    if (weekDates.value.length > 0) return weekDates.value[0].month
    return new Date().getMonth() + 1
  })

  const isTodayColumn = (dayIndex: any): boolean => {
    const idx = Number(dayIndex) - 1
    if (idx < 0 || idx > 6) return false
    return !!weekDates.value[idx]?.isToday
  }

  const semesterWeekOptions = computed(() => {
    const count = Number(totalWeeks.value)
    const safeCount = Number.isFinite(count) && count > 0 ? count : 25
    return Array.from({ length: safeCount }, (_, i) => i + 1)
  })

  /** 应用学期元信息（学期/开学日/总周数/当前周/假期通知），并持久化到本地 */
  const applyMeta = (meta: any, requestedSemester = '') => {
    const safeMeta = meta && typeof meta === 'object' ? meta : {}
    const resolvedSemester = String(safeMeta.semester || requestedSemester || semester.value || '').trim()
    if (resolvedSemester) {
      semester.value = resolvedSemester
      semesterDraft.value = resolvedSemester
    }

    startDateStr.value = String(safeMeta.start_date || '').trim()
    vacationNotice.value = String(safeMeta.vacation_notice || '').trim()

    const parsedWeeks = Number(safeMeta.total_weeks || 0)
    totalWeeks.value = Number.isFinite(parsedWeeks) && parsedWeeks > 0 ? parsedWeeks : 25

    const parsedCurrentWeek = Number(safeMeta.current_week || 0)
    const safeWeek = Number.isFinite(parsedCurrentWeek) && parsedCurrentWeek > 0
      ? Math.min(parsedCurrentWeek, totalWeeks.value)
      : 1
    currentWeek.value = safeWeek
    selectedWeek.value = safeWeek

    if (!isTestAccountSession()) {
      localStorage.setItem(SCHEDULE_META_KEY, JSON.stringify({
        semester: resolvedSemester,
        start_date: startDateStr.value,
        current_week: currentWeek.value,
        total_weeks: totalWeeks.value,
        vacation_notice: vacationNotice.value
      }))
      // #750：同步「学期 → 开学日」映射，供时间驱动应选学期判定使用
      if (resolvedSemester && startDateStr.value) {
        recordSemesterStartDate(resolvedSemester, startDateStr.value)
      }
    }
  }

  // 周次越界钳制 + 切换动画方向
  watch(selectedWeek, (next, prev) => {
    const current = Number(next || 0)
    const previous = Number(prev || 0)
    const maxWeeks = Math.max(1, Number(totalWeeks.value || 1))
    if (!Number.isFinite(current) || current <= 0) {
      selectedWeek.value = 1
      return
    }
    if (current > maxWeeks) {
      selectedWeek.value = maxWeeks
      return
    }
    if (previous > 0 && current !== previous) {
      weekTransitionName.value = current > previous ? 'week-slide-left' : 'week-slide-right'
    }
  })

  watch(totalWeeks, (maxWeeks) => {
    if (!Number.isFinite(maxWeeks) || maxWeeks <= 0) return
    if (selectedWeek.value > maxWeeks) {
      selectedWeek.value = maxWeeks
    }
    if (currentWeek.value > maxWeeks) {
      currentWeek.value = maxWeeks
    }
  })

  // 滑动翻页（距离+速度双阈值）
  let touchStartX = 0
  let touchStartY = 0
  let touchLastX = 0
  let touchStartAt = 0
  let swipeTracking = false
  let swipeLocked = false

  const shouldIgnoreWeekSwipe = () => {
    return isAnyOverlayOpen()
  }

  const shiftWeek = (delta: number): boolean => {
    if (swipeLocked) return false
    const current = Number(selectedWeek.value || 0)
    const max = Math.max(1, Number(totalWeeks.value || 1))
    const target = Math.min(max, Math.max(1, current + delta))
    if (target === current) return false
    weekTransitionName.value = delta > 0 ? 'week-slide-left' : 'week-slide-right'
    selectedWeek.value = target
    swipeLocked = true
    window.setTimeout(() => {
      swipeLocked = false
    }, 260)
    return true
  }

  const handleTouchStart = (e: any) => {
    if (shouldIgnoreWeekSwipe()) return
    const touch = e.changedTouches?.[0]
    if (!touch) return
    swipeTracking = true
    touchStartX = touch.screenX
    touchStartY = touch.screenY
    touchLastX = touch.screenX
    touchStartAt = Date.now()
  }

  const handleTouchMove = (e: any) => {
    if (!swipeTracking) return
    const touch = e.changedTouches?.[0]
    if (!touch) return
    touchLastX = touch.screenX
    const dx = Math.abs(touch.screenX - touchStartX)
    const dy = Math.abs(touch.screenY - touchStartY)
    if (dy > dx && dy > 16) {
      swipeTracking = false
    }
  }

  const handleTouchEnd = (e: any) => {
    if (!swipeTracking) return
    swipeTracking = false
    const touch = e.changedTouches?.[0]
    const endX = touch?.screenX ?? touchLastX
    const diff = touchStartX - endX
    const durationMs = Math.max(1, Date.now() - touchStartAt)
    const velocity = Math.abs(diff) / durationMs // px/ms
    const distancePass = Math.abs(diff) >= 52
    const velocityPass = Math.abs(diff) >= 24 && velocity >= 0.52
    if (!distancePass && !velocityPass) return
    if (diff > 0) {
      shiftWeek(1)
      return
    }
    shiftWeek(-1)
  }

  const shouldIgnoreKeyboardWeekSwitch = () => {
    if (shouldIgnoreWeekSwipe()) return true
    const active = document.activeElement
    if (!active) return false
    const tag = String(active.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    return !!active.getAttribute?.('contenteditable')
  }

  const handleWeekKeydown = (event: any) => {
    if (!event) return
    if (event.defaultPrevented) return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (shouldIgnoreKeyboardWeekSwitch()) return

    if (event.key === 'ArrowLeft') {
      const changed = shiftWeek(-1)
      if (changed) event.preventDefault()
      return
    }
    if (event.key === 'ArrowRight') {
      const changed = shiftWeek(1)
      if (changed) event.preventDefault()
    }
  }

  const jumpToCurrentWeek = () => {
    if (currentWeek.value) {
      weekTransitionName.value =
        Number(currentWeek.value) >= Number(selectedWeek.value) ? 'week-slide-left' : 'week-slide-right'
      selectedWeek.value = currentWeek.value
    }
  }

  /** 滚动到 Widget 深链接指定的日/节次位置 */
  const scrollToWidgetTarget = (_day: number, period: number) => {
    try {
      const gridBody = document.querySelector('.schedule-view .grid-body')
      if (!gridBody) return

      if (period >= 1) {
        // 滚动到对应节次行（每行约 55px 高度，基于 time-slot 高度）
        const timeSlots = gridBody.querySelectorAll('.time-axis .time-slot')
        const targetSlot = timeSlots[period - 1]
        if (targetSlot) {
          const offsetTop = (targetSlot as HTMLElement).offsetTop
          gridBody.scrollTo({ top: Math.max(0, offsetTop - 20), behavior: 'smooth' })
        }
      }
    } catch {
      // ignore scroll errors
    }
  }

  return {
    semester,
    semesterDraft,
    currentWeek,
    selectedWeek,
    totalWeeks,
    startDateStr,
    vacationNotice,
    weekTransitionName,
    weekDates,
    currentMonth,
    isTodayColumn,
    semesterWeekOptions,
    applyMeta,
    shiftWeek,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWeekKeydown,
    jumpToCurrentWeek,
    scrollToWidgetTarget
  }
}

export type ScheduleSemester = ReturnType<typeof useScheduleSemester>
