/**
 * 课表领域 - 菜单/课程样式/学期弹窗组合式函数。
 * 原内联于 ScheduleView.vue（showMenu/样式切换/学期徽章弹窗）。
 */
import { computed, ref, watch } from 'vue'
import { flushUiSettings, useUiSettings } from '../../../utils/ui_settings'
import { pushDebugLog } from '../../../utils/debug_logger'
import { showToast } from '../../../utils/toast'
import { courseCardStyleOptions } from '../constants'
import { normalizeCourseCardStyle } from '../utils/weeks'
import { markPopupShown } from '../utils/popup'

export interface ScheduleMenuOptions {
  props: any
}

export const useScheduleMenu = (options: ScheduleMenuOptions) => {
  const { props } = options
  const uiSettings = useUiSettings()

  const showMenu = ref(false)
  const showSemesterPopup = ref(false)
  const semesterPopupText = ref('')
  const showSemesterBadgePopover = ref(false)
  const scheduleCourseCardStyle = ref(normalizeCourseCardStyle(uiSettings.scheduleCourseCardStyle))
  const courseCardRefreshNonce = ref(0)

  // 与外部保持一致的课程样式枚举（供模板使用）
  const styleOptions = courseCardStyleOptions

  watch(
    () => uiSettings.scheduleCourseCardStyle,
    (value) => {
      scheduleCourseCardStyle.value = normalizeCourseCardStyle(value)
      pushDebugLog('Schedule', `课表样式状态同步：${scheduleCourseCardStyle.value}`, 'debug')
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
    pushDebugLog('Schedule', `切换课表样式：${nextStyle}`, 'info')
    try {
      const snapshot = JSON.parse(localStorage.getItem('hbu_ui_settings_v2') || '{}')
      pushDebugLog(
        'Schedule',
        `课表样式已写入本地缓存：${String(snapshot?.scheduleCourseCardStyle || '') || 'unknown'}`,
        'debug'
      )
    } catch (error) {
      pushDebugLog('Schedule', '读取课表样式缓存失败', 'warn', error)
    }
    // 组件卸载期 flush 会丢失样式；热刷新交给 courseCardRefreshNonce
    const styleLabelMap: Record<string, string> = {
      modern: '现代',
      traditional: '传统',
      class: '标准'
    }
    showToast(`已切换为${styleLabelMap[nextStyle] || '现代'}样式`, 'success')
  }

  /** 打开学期弹窗（展示当前学期；已展示过则不弹） */
  const openSemesterPopup = (targetSemester = '') => {
    const sem = String(targetSemester || '').trim()
    if (!sem) return
    semesterPopupText.value = sem
    showSemesterPopup.value = true
    markPopupShown(props.studentId)
  }

  /** 学期徽章弹层（badge popover）开关 */
  const onSemesterBadgeClick = () => {
    showSemesterPopup.value = false
    showSemesterBadgePopover.value = !showSemesterBadgePopover.value
  }

  const closeSemesterBadgePopover = (e: any) => {
    if (showSemesterBadgePopover.value && !e.target.closest('.semester-badge-wrap')) {
      showSemesterBadgePopover.value = false
    }
  }

  /** 弹窗是否已展示过（无有效 key 视为已展示） */
  const isPopupShown = (): boolean => {
    const sid = String(props.studentId || '').trim()
    const sessionToken = String(localStorage.getItem('hbu_login_session_token') || '').trim()
    if (!sid || !sessionToken) return true
    return localStorage.getItem(`hbu_schedule_popup_shown:${sid}:${sessionToken}`) === '1'
  }

  // 抽屉关闭时重置导出复制态由入口监听（依赖导出状态），此处仅暴露状态
  const anyOverlayOpen = computed(() =>
    showMenu.value ||
    showSemesterBadgePopover.value ||
    showSemesterPopup.value
  )

  return {
    showMenu,
    showSemesterPopup,
    semesterPopupText,
    showSemesterBadgePopover,
    scheduleCourseCardStyle,
    courseCardRefreshNonce,
    styleOptions,
    anyOverlayOpen,
    toggleMenu,
    setScheduleCourseCardStyle,
    openSemesterPopup,
    onSemesterBadgeClick,
    closeSemesterBadgePopover,
    isPopupShown
  }
}

export type ScheduleMenu = ReturnType<typeof useScheduleMenu>
