import type { AppRuntime, RemoteConfigCoordinator } from '../contracts/runtime'
import {
  applyOcrRuntimeConfig,
  fetchRemoteConfig,
  getStoredOcrConfig,
  isRemoteConfigEnabled
} from '../../utils/remote_config.js'
import { getCurrentVersion } from '../../utils/updater.js'
import { allowsInAppGithubUpdater } from '../../config/app_store_policy'
import { invokeNative, isTauriRuntime } from '../../platform/native'
import { isWebsiteDemoBuild } from '../../utils/website_demo_boot.js'
import { openExternal, isHttpLink } from '../../utils/external_link'
import {
  ANNOUNCEMENT_CONFIRM_KEY,
  ANNOUNCEMENT_SNAPSHOT_KEY,
  REMOTE_CONFIG_REFRESH_INTERVAL
} from '../state/constants'

const normalizeAnnouncements = (payload: any) => ({
  pinned: Array.isArray(payload?.pinned) ? payload.pinned : [],
  ticker: Array.isArray(payload?.ticker) ? payload.ticker : [],
  list: Array.isArray(payload?.list) ? payload.list : [],
  confirm: Array.isArray(payload?.confirm) ? payload.confirm : []
})

const hasAnnouncementContent = (payload: ReturnType<typeof normalizeAnnouncements>) =>
  payload.pinned.length + payload.ticker.length + payload.list.length + payload.confirm.length > 0

const compareVersions = (left: string, right: string) => {
  const a = String(left || '').replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const b = String(right || '').replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1
    if ((a[index] || 0) < (b[index] || 0)) return -1
  }
  return 0
}

export const createRemoteConfigCoordinator = (runtime: AppRuntime): RemoteConfigCoordinator => {
  const { state } = runtime

  const restoreAnnouncementSnapshot = () => {
    try {
      const raw = localStorage.getItem(ANNOUNCEMENT_SNAPSHOT_KEY)
      if (!raw) return null
      const parsed = normalizeAnnouncements(JSON.parse(raw))
      return hasAnnouncementContent(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  const persistAnnouncementSnapshot = (payload: ReturnType<typeof normalizeAnnouncements>) => {
    try {
      localStorage.setItem(ANNOUNCEMENT_SNAPSHOT_KEY, JSON.stringify(payload))
    } catch {
      // ignore storage failure
    }
  }

  const getConfirmedIds = () => {
    try {
      const value = JSON.parse(localStorage.getItem(ANNOUNCEMENT_CONFIRM_KEY) || '[]')
      return new Set(Array.isArray(value) ? value.map(String) : [])
    } catch {
      return new Set<string>()
    }
  }

  const markConfirmed = (id: unknown) => {
    const text = String(id || '').trim()
    if (!text) return
    const ids = getConfirmedIds()
    ids.add(text)
    localStorage.setItem(ANNOUNCEMENT_CONFIRM_KEY, JSON.stringify([...ids]))
  }

  const renderMarkdown = async (content: unknown) => {
    const text = String(content || '')
    if (!text) return ''
    try {
      const mod = await import('../../utils/markdown.js')
      await mod.initMarkdownRuntime?.()
      return mod.renderMarkdown?.(text) || text
    } catch {
      return text.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[char] || char)).replace(/\n/g, '<br>')
    }
  }

  const openAnnouncement = (item: unknown) => {
    const announcement = item && typeof item === 'object' ? item as Record<string, any> : null
    if (!announcement) return
    state.activeAnnouncement.value = announcement
    state.showAnnouncementModal.value = true
    const token = ++state.mutable.activeAnnouncementRenderToken
    void renderMarkdown(announcement.content || announcement.body || '').then((html) => {
      if (token === state.mutable.activeAnnouncementRenderToken) state.activeAnnouncementHtml.value = html
    })
  }

  const closeAnnouncement = () => {
    state.showAnnouncementModal.value = false
    state.activeAnnouncement.value = null
    state.activeAnnouncementHtml.value = ''
  }

  const findNextBlockingAnnouncement = () => {
    const confirmed = getConfirmedIds()
    const next = state.announcementData.value.confirm.find((item: any) => {
      const id = String(item?.id || item?.title || '').trim()
      return id && !confirmed.has(id)
    }) as Record<string, any> | undefined
    state.blockingAnnouncement.value = next || null
    state.showBlockingAnnouncement.value = !!next
    if (!next) {
      state.blockingAnnouncementHtml.value = ''
      return
    }
    const token = ++state.mutable.blockingAnnouncementRenderToken
    void renderMarkdown(next.content || next.body || '').then((html) => {
      if (token === state.mutable.blockingAnnouncementRenderToken) state.blockingAnnouncementHtml.value = html
    })
  }

  const confirmBlockingAnnouncement = () => {
    const item = state.blockingAnnouncement.value
    markConfirmed(item?.id || item?.title)
    state.showBlockingAnnouncement.value = false
    state.blockingAnnouncement.value = null
    state.blockingAnnouncementHtml.value = ''
    findNextBlockingAnnouncement()
  }

  const handleExternalOpen = async (url: string, event?: unknown) => {
    ;(event as Event | undefined)?.preventDefault?.()
    const target = String(url || '').trim()
    if (!target || !isHttpLink(target)) return
    await openExternal(target)
  }

  const handleContentClick = async (event: unknown) => {
    const target = (event as MouseEvent | undefined)?.target as HTMLElement | null
    const anchor = target?.closest?.('a') as HTMLAnchorElement | null
    if (!anchor?.href) return
    await handleExternalOpen(anchor.href, event)
  }

  const primeOcrEndpointFromCache = async () => {
    if (!isTauriRuntime()) return
    const cached = getStoredOcrConfig()
    try {
      await invokeNative('set_ocr_runtime_config', {
        endpoints: cached.endpoints || [],
        localFallbackEndpoints: cached.local_fallback_endpoints || []
      })
    } catch {
      const endpoint = String(localStorage.getItem('hbu_ocr_endpoint') || '').trim()
      await invokeNative('set_ocr_endpoint', { endpoint }).catch(() => {})
    }
  }

  const applyRemoteConfig = async () => {
    if (isWebsiteDemoBuild()) return
    try {
      const config = await fetchRemoteConfig()
      state.remoteConfig.value = config
      const announcements = normalizeAnnouncements(config.announcements)
      if (hasAnnouncementContent(announcements)) {
        state.announcementData.value = announcements
        persistAnnouncementSnapshot(announcements)
      } else {
        const snapshot = restoreAnnouncementSnapshot()
        if (snapshot) state.announcementData.value = snapshot
      }
      await applyOcrRuntimeConfig(config)
      window.dispatchEvent(new CustomEvent('hbu-ocr-config-updated'))
      const uploadEndpoint = String(config?.temp_file_server?.schedule_upload_endpoint || '').trim()
      if (uploadEndpoint) localStorage.setItem('hbu_temp_upload_endpoint', uploadEndpoint)
      else localStorage.removeItem('hbu_temp_upload_endpoint')
      await invokeNative('set_temp_upload_endpoint', { endpoint: uploadEndpoint || null }).catch(() => {})

      const minVersion = String(config?.force_update?.min_version || '').trim()
      if (minVersion && compareVersions(await getCurrentVersion(), minVersion) < 0) {
        state.forceUpdateInfo.value = allowsInAppGithubUpdater()
          ? {
              min_version: minVersion,
              message: config.force_update?.message || '当前版本过低，请更新后继续使用。',
              download_url: config.force_update?.download_url || ''
            }
          : {
              min_version: minVersion,
              message: config.force_update?.message || '当前版本过低，请通过 App Store 更新后继续使用。',
              download_url: '',
              store_url: '',
              apple_app_id: ''
            }
        state.showForceUpdate.value = true
      }
      findNextBlockingAnnouncement()
    } catch (error) {
      console.warn('[Config] 远程配置加载失败:', error)
    }
  }

  const stopRemoteConfigRefresh = () => {
    if (!state.mutable.remoteConfigRefreshTimer) return
    window.clearInterval(state.mutable.remoteConfigRefreshTimer)
    state.mutable.remoteConfigRefreshTimer = null
  }

  const startRemoteConfigRefresh = () => {
    stopRemoteConfigRefresh()
    if (!isRemoteConfigEnabled()) return
    state.mutable.remoteConfigRefreshTimer = window.setInterval(() => {
      void applyRemoteConfig()
    }, REMOTE_CONFIG_REFRESH_INTERVAL)
  }

  const handleRemoteConfigModeChanged = () => {
    stopRemoteConfigRefresh()
    void applyRemoteConfig().finally(startRemoteConfigRefresh)
  }

  const handleRemoteConfigUpdated = () => {
    void applyRemoteConfig()
  }

  const cached = restoreAnnouncementSnapshot()
  if (cached) state.announcementData.value = cached

  return {
    applyRemoteConfig,
    startRemoteConfigRefresh,
    stopRemoteConfigRefresh,
    handleRemoteConfigModeChanged,
    handleRemoteConfigUpdated,
    primeOcrEndpointFromCache,
    openAnnouncement,
    closeAnnouncement,
    confirmBlockingAnnouncement,
    findNextBlockingAnnouncement,
    handleContentClick,
    handleExternalOpen
  }
}
