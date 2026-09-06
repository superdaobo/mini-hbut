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
import { getCourseCardStyleOptions } from '../constants'
import { normalizeCourseCardStyle } from '../utils/weeks'

export const useScheduleMenu = () => {
  const uiSettings = useUiSettings()

  const showMenu = ref(false)
  const scheduleCourseCardStyle = ref(normalizeCourseCardStyle(uiSettings.scheduleCourseCardStyle))
  const courseCardRefreshNonce = ref(0)

  // 与外部保持一致的课程样式枚举（供模板使用）
  // #788：label 随语言变化，改为每次调用 getter 取最新词
  const styleOptions = computed(() => getCourseCardStyleOptions())

  watch(
    () => uiSettings.scheduleCourseCardStyle,
    (value) => {
      scheduleCourseCardStyle.value = normalizeCourseCardStyle(value)
      pushDebugLog('Schedule', `Schedule style state synced: ${scheduleCourseCardStyle.value}`, 'debug')
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

  /** 抽屉关闭时重置导出复制态由入口监听（依赖导出状态），此处仅暴露状态 */
  const anyOverlayOpen = computed(() => showMenu.value)

  return {
    showMenu,
    scheduleCourseCardStyle,
    courseCardRefreshNonce,
    styleOptions,
    anyOverlayOpen,
    toggleMenu,
    setScheduleCourseCardStyle
  }
}

export type ScheduleMenu = ReturnType<typeof useScheduleMenu>
