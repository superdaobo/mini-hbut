/**
 * 课表领域 - 菜单/课程样式组合式函数。
 * 原内联于 ScheduleView.vue（showMenu/样式切换）。
 * （#742：学期徽章 popover 与学期提示 popup 的 UI 早已移除，其状态机
 * 会造成 anyOverlayOpen 永久为真从而禁用滑动手势，此处一并清理。）
 */
import { computed, ref, watch } from 'vue'
import { flushUiSettings, useUiSettings } from '../../../utils/ui_settings'
import { pushDebugLog } from '../../../utils/debug_logger'
import { showToast } from '../../../utils/toast'
import { t } from '../../../utils/app_i18n'
import { getCourseCardStyleOptions, getConflictDisplayOptions, getScheduleViewModeOptions } from '../constants'
import { normalizeCourseCardStyle } from '../utils/weeks'
import type { ScheduleConflictDisplayMode, ScheduleViewMode } from '../../../config/ui_settings'

const normalizeScheduleViewMode = (value: unknown): ScheduleViewMode =>
  value === 'courses' || value === 'events' ? value : 'all'

// #1116：冲突显示方式非法/缺失一律回退 merged
const normalizeConflictDisplayMode = (value: unknown): ScheduleConflictDisplayMode =>
  value === 'side-by-side' ? 'side-by-side' : 'merged'

export const useScheduleMenu = () => {
  const uiSettings = useUiSettings()

  const showMenu = ref(false)
  const scheduleCourseCardStyle = ref(normalizeCourseCardStyle(uiSettings.scheduleCourseCardStyle))
  const scheduleViewMode = ref<ScheduleViewMode>(normalizeScheduleViewMode(uiSettings.scheduleViewMode))
  // #1116：独立的冲突显示偏好（与课程卡片外观/视图过滤互不覆盖）
  const scheduleConflictDisplayMode = ref<ScheduleConflictDisplayMode>(
    normalizeConflictDisplayMode(uiSettings.scheduleConflictDisplayMode)
  )
  const courseCardRefreshNonce = ref(0)

  // 与外部保持一致的课程样式枚举（供模板使用）
  // #788：label 随语言变化，改为每次调用 getter 取最新词
  const styleOptions = computed(() => getCourseCardStyleOptions())
  const viewModeOptions = computed(() => getScheduleViewModeOptions())
  const conflictDisplayOptions = computed(() => getConflictDisplayOptions())

  watch(
    () => uiSettings.scheduleCourseCardStyle,
    (value) => {
      scheduleCourseCardStyle.value = normalizeCourseCardStyle(value)
      pushDebugLog('Schedule', `Schedule style state synced: ${scheduleCourseCardStyle.value}`, 'debug')
    },
    { immediate: true }
  )

  watch(
    () => uiSettings.scheduleViewMode,
    (value) => {
      scheduleViewMode.value = normalizeScheduleViewMode(value)
      pushDebugLog('Schedule', `Schedule view mode synced: ${scheduleViewMode.value}`, 'debug')
    },
    { immediate: true }
  )

  watch(
    () => uiSettings.scheduleConflictDisplayMode,
    (value) => {
      scheduleConflictDisplayMode.value = normalizeConflictDisplayMode(value)
      pushDebugLog(
        'Schedule',
        `Schedule conflict display synced: ${scheduleConflictDisplayMode.value}`,
        'debug'
      )
    },
    { immediate: true }
  )

  const toggleMenu = () => {
    showMenu.value = !showMenu.value
  }

  const setScheduleCourseCardStyle = (styleKey: string) => {
    const nextStyle = normalizeCourseCardStyle(styleKey)
    if (scheduleCourseCardStyle.value === nextStyle) return
    scheduleCourseCardStyle.value = nextStyle
    courseCardRefreshNonce.value += 1
    uiSettings.scheduleCourseCardStyle = nextStyle
    flushUiSettings()
    pushDebugLog('Schedule', `Schedule style switched: ${nextStyle}`, 'info')
    try {
      const snapshot = JSON.parse(localStorage.getItem('hbu_ui_settings_v2') || '{}')
      pushDebugLog(
        'Schedule',
        `Schedule style persisted to local cache: ${String(snapshot?.scheduleCourseCardStyle || '') || 'unknown'}`,
        'debug'
      )
    } catch (error) {
      pushDebugLog('Schedule', 'Failed to read schedule style cache', 'warn', error)
    }
    // 组件卸载期 flush 会丢失样式；热刷新交给 courseCardRefreshNonce
    // #788：toast 文案经 t() 取词（事件回调内取词时机天然正确）
    const styleLabelMap: Record<string, string> = {
      modern: t('schedule.menu.styleModern'),
      traditional: t('schedule.menu.styleTraditional'),
      class: t('schedule.menu.styleClass')
    }
    showToast(t('schedule.menu.styleToast').replace('{t}', styleLabelMap[nextStyle] || t('schedule.menu.styleModern')), 'success')
  }

  const setScheduleViewMode = (value: unknown) => {
    const nextMode = normalizeScheduleViewMode(value)
    if (scheduleViewMode.value === nextMode) return
    scheduleViewMode.value = nextMode
    uiSettings.scheduleViewMode = nextMode
    flushUiSettings()
    pushDebugLog('Schedule', `Schedule view mode switched: ${nextMode}`, 'info')
  }

  /**
   * #1116：切换冲突显示方式并立即持久化。
   * 与课程卡片样式/视图过滤完全独立；下一次渲染由 useScheduleGrid 的 getter 读取。
   */
  const setScheduleConflictDisplayMode = (value: unknown) => {
    const nextMode = normalizeConflictDisplayMode(value)
    if (scheduleConflictDisplayMode.value === nextMode) return
    scheduleConflictDisplayMode.value = nextMode
    uiSettings.scheduleConflictDisplayMode = nextMode
    flushUiSettings()
    pushDebugLog('Schedule', `Schedule conflict display switched: ${nextMode}`, 'info')
    const label =
      nextMode === 'merged'
        ? t('schedule.conflictDisplay.merged')
        : t('schedule.conflictDisplay.sideBySide')
    showToast(t('schedule.conflictDisplay.toast').replace('{t}', label), 'success')
  }

  /** 抽屉关闭时重置导出复制态由入口监听（依赖导出状态），此处仅暴露状态 */
  const anyOverlayOpen = computed(() => showMenu.value)

  return {
    showMenu,
    scheduleCourseCardStyle,
    scheduleViewMode,
    scheduleConflictDisplayMode,
    courseCardRefreshNonce,
    styleOptions,
    viewModeOptions,
    conflictDisplayOptions,
    anyOverlayOpen,
    toggleMenu,
    setScheduleCourseCardStyle,
    setScheduleViewMode,
    setScheduleConflictDisplayMode
  }
}

export type ScheduleMenu = ReturnType<typeof useScheduleMenu>
