/**
 * #1089：将首页通知浮层交互从 Dashboard 大组件抽出，保持首页体积守卫与状态隔离。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildHomeNoticeEntries, type HomeNoticeEntry, type HomeAnnouncementGroups } from '../../utils/home_notice_center'

export const HOME_NOTICE_DISMISS_EVENT = 'hbu-home-notice-dismiss'

export function useHomeNoticeCenter(
  props: HomeAnnouncementGroups,
  emit: (event: string, ...args: unknown[]) => void,
  sessionStatusVisual: { value: string },
  sessionDetailOpen: { value: boolean }
) {
  const homeNoticePanelOpen = ref(false)
  const profileCardRef = ref<HTMLElement | null>(null)
  const homeNoticePanelStyle = ref<Record<string, string>>({})
  const homeNoticeEntries = computed(() => buildHomeNoticeEntries({
    confirm: props.confirm,
    pinned: props.pinned,
    list: props.list,
    ticker: props.ticker
  }))

  const positionHomeNoticePanel = () => {
    const rect = profileCardRef.value?.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(460, Math.max(240, vw - 32))
    const desiredHeight = Math.min(380, Math.max(160, vh - 80))
    const left = Math.max(16, Math.min((rect?.right ?? (vw + width) / 2) - width, vw - width - 16))
    const top = Math.max(16, Math.min((rect?.bottom ?? 95) + 12, vh - desiredHeight - 16))
    homeNoticePanelStyle.value = {
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      maxHeight: Math.max(100, vh - top - 16) + 'px'
    }
  }

  const closeHomeNoticePanel = () => {
    homeNoticePanelOpen.value = false
  }
  const onSessionStatusClick = (event?: Event) => {
    event?.stopPropagation()
    event?.preventDefault()
    if (sessionStatusVisual.value === 'green') {
      sessionDetailOpen.value = false
      if (!homeNoticePanelOpen.value) positionHomeNoticePanel()
      homeNoticePanelOpen.value = !homeNoticePanelOpen.value
      return
    }
    closeHomeNoticePanel()
    sessionDetailOpen.value = !sessionDetailOpen.value
  }
  const openHomeNotice = (entry: HomeNoticeEntry) => {
    emit('open-notice', entry.raw, { fromPanel: true })
  }
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !homeNoticePanelOpen.value) return
    if (document.querySelector('.notice-modal-overlay')) return
    event.preventDefault()
    closeHomeNoticePanel()
  }
  const handleViewportChange = () => {
    if (homeNoticePanelOpen.value) positionHomeNoticePanel()
  }

  watch(() => sessionStatusVisual.value, (tone) => {
    if (tone === 'green') sessionDetailOpen.value = false
    else closeHomeNoticePanel()
  })

  onMounted(() => {
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener(HOME_NOTICE_DISMISS_EVENT, closeHomeNoticePanel)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('keydown', handleEscape)
    window.removeEventListener(HOME_NOTICE_DISMISS_EVENT, closeHomeNoticePanel)
  })

  return {
    homeNoticePanelOpen,
    profileCardRef,
    homeNoticePanelStyle,
    homeNoticeEntries,
    onSessionStatusClick,
    openHomeNotice,
    closeHomeNoticePanel
  }
}
