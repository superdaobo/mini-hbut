import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * #1089：公告来源导航。一级列表在全屏详情背后继续挂载，
 * Back 保留列表位置，Close 结束整个通知中心交互。
 */
export function useAnnouncementModalNavigation(options: {
  showAnnouncementModal: { value: boolean }
  openAnnouncement: (notice: unknown) => void
  closeAnnouncement: () => void
}) {
  const announcementFromHomePanel = ref(false)

  const handleDashboardAnnouncementOpen = (notice: unknown, context?: { fromPanel?: boolean }) => {
    announcementFromHomePanel.value = context?.fromPanel === true
    options.openAnnouncement(notice)
  }
  const handleAnnouncementBack = () => {
    options.closeAnnouncement()
    announcementFromHomePanel.value = false
  }
  const handleAnnouncementDismiss = () => {
    const dismissHomePanel = announcementFromHomePanel.value
    options.closeAnnouncement()
    announcementFromHomePanel.value = false
    if (dismissHomePanel) window.dispatchEvent(new Event('hbu-home-notice-dismiss'))
  }
  const handleAnnouncementEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !options.showAnnouncementModal.value) return
    event.preventDefault()
    event.stopImmediatePropagation()
    handleAnnouncementDismiss()
  }
  onMounted(() => window.addEventListener('keydown', handleAnnouncementEscape, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleAnnouncementEscape, true))

  return {
    announcementFromHomePanel,
    handleDashboardAnnouncementOpen,
    handleAnnouncementBack,
    handleAnnouncementDismiss
  }
}
