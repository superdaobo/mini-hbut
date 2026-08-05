/**
 * 课表领域 - 云端同步组合式函数（上传/下载/冷却/事件监听）。
 * 原内联于 ScheduleView.vue（cloud sync 相关），拆分后行为一致。
 */
import { computed, ref } from 'vue'
import {
  CLOUD_SYNC_UPDATED_EVENT,
  getCloudSyncCooldownState,
  runCloudSyncDownload,
  runCloudSyncUpload
} from '../../../utils/cloud_sync.js'
import { showToast } from '../../../utils/toast'
import { formatCooldownText } from '../utils/formatters'
import type { ScheduleConfirmDialog } from './useConfirmDialog'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleEditor } from './useScheduleEditor'
import type { ScheduleSemester } from './useScheduleSemester'

export interface ScheduleSyncOptions {
  props: any
  data: ScheduleData
  semester: ScheduleSemester
  editor: ScheduleEditor
  confirmDialog: ScheduleConfirmDialog
}

export const useScheduleSync = (options: ScheduleSyncOptions) => {
  const { props, data, semester, editor, confirmDialog } = options
  const { askConfirm } = confirmDialog

  const syncUploading = ref(false)
  const syncDownloading = ref(false)
  const syncUploadCooldownMs = ref(0)
  const syncDownloadCooldownMs = ref(0)
  const syncStatusText = ref('')
  let syncCooldownTimer: number | null = null

  const syncUploadCooldownText = computed(() => formatCooldownText(syncUploadCooldownMs.value))
  const syncDownloadCooldownText = computed(() => formatCooldownText(syncDownloadCooldownMs.value))

  const refreshCloudSyncCooldown = () => {
    const sid = String(props.studentId || '').trim()
    if (!sid) {
      syncUploadCooldownMs.value = 0
      syncDownloadCooldownMs.value = 0
      return
    }
    const uploadState = getCloudSyncCooldownState(sid, 'upload')
    const downloadState = getCloudSyncCooldownState(sid, 'download')
    syncUploadCooldownMs.value = Math.max(0, Number(uploadState.remainingMs || 0))
    syncDownloadCooldownMs.value = Math.max(0, Number(downloadState.remainingMs || 0))
  }

  const clearCloudSyncCooldownTimer = () => {
    if (!syncCooldownTimer) return
    window.clearInterval(syncCooldownTimer)
    syncCooldownTimer = null
  }

  const ensureCloudSyncCooldownTimer = () => {
    clearCloudSyncCooldownTimer()
    syncCooldownTimer = window.setInterval(() => {
      refreshCloudSyncCooldown()
    }, 1000)
  }

  /** 云下载完成后刷新课表视图 */
  const refreshScheduleAfterCloudDownload = async (syncResult: any = {}) => {
    const sem = String(semester.semester.value || semester.semesterDraft.value || '').trim()
    if (!sem) return
    const downloadedSemesters = Array.isArray(syncResult?.academicApplied?.scheduleSemesters)
      ? syncResult.academicApplied.scheduleSemesters.map((item: any) => String(item || '').trim()).filter(Boolean)
      : []
    const shouldRefreshSchedule = downloadedSemesters.length === 0 || downloadedSemesters.includes(sem)
    const hasCached = shouldRefreshSchedule ? data.applyCachedScheduleImmediately(sem) : false
    await data.loadCustomCourses(sem)
    if (!hasCached && shouldRefreshSchedule) {
      await data.fetchSchedule(sem)
    }
  }

  const handleCloudSyncUpdated = (event: any) => {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
    const sid = String(props.studentId || '').trim()
    const targetSid = String(detail?.studentId || '').trim()
    if (!sid || !targetSid || sid !== targetSid) return
    refreshCloudSyncCooldown()
    if (detail?.action !== 'download' || !detail?.success) return
    if (syncDownloading.value) return
    void refreshScheduleAfterCloudDownload(detail).catch((error) => {
      console.warn('[Schedule] cloud sync auto refresh failed:', error)
    })
  }

  const handleScheduleVisibilityChange = () => {
    if (document.hidden) {
      data.persistScheduleRenderSnapshot('app-hidden')
    }
  }

  const handleCloudSyncUpload = async () => {
    if (!editor.hasValidLoginSession()) {
      await editor.promptLoginRequired()
      return
    }
    const sid = String(props.studentId || '').trim()
    if (!sid || syncUploading.value || syncDownloading.value) return

    refreshCloudSyncCooldown()
    if (syncUploadCooldownMs.value > 0) {
      showToast(`上传冷却中，${syncUploadCooldownText.value}`, 'info')
      return
    }

    const sem = String(semester.semester.value || semester.semesterDraft.value || '').trim()
    const confirmed = await askConfirm({
      title: '确认上传到云端',
      lines: [
        '将覆盖云端已有的自定义课程数据。',
        `当前学期：${sem || '未选择学期'}`,
        '确认后将立即执行上传。'
      ],
      confirmText: '确认上传',
      cancelText: '取消',
      danger: true
    })
    if (!confirmed) return

    syncUploading.value = true
    syncStatusText.value = '正在上传云端备份...'
    try {
      const result = await runCloudSyncUpload({
        studentId: sid,
        reason: 'schedule-manual-upload',
        force: false,
        includeCustomCourses: true,
        includeAcademic: false,
        includeSettings: false
      })
      if (!result?.success) {
        if (result?.cooldown) {
          syncUploadCooldownMs.value = Number(result.remainingMs || 0)
          showToast(`上传冷却中，${syncUploadCooldownText.value}`, 'info')
        } else {
          showToast(result?.error || '云上传失败', 'error')
        }
        return
      }
      refreshCloudSyncCooldown()
      showToast('云上传完成', 'success')
    } catch (e) {
      showToast(String((e as any)?.message || '云上传失败'), 'error')
    } finally {
      syncUploading.value = false
      syncStatusText.value = ''
    }
  }

  const handleCloudSyncDownload = async () => {
    if (!editor.hasValidLoginSession()) {
      await editor.promptLoginRequired()
      return
    }
    const sid = String(props.studentId || '').trim()
    if (!sid || syncUploading.value || syncDownloading.value) return

    refreshCloudSyncCooldown()
    if (syncDownloadCooldownMs.value > 0) {
      showToast(`下载冷却中，${syncDownloadCooldownText.value}`, 'info')
      return
    }

    syncDownloading.value = true
    syncStatusText.value = '正在下载云端备份并覆盖本地课表...'
    try {
      const result = await runCloudSyncDownload({
        studentId: sid,
        reason: 'schedule-manual-download',
        force: false,
        applySettings: false,
        applyCustomCourses: true,
        applyAcademic: false
      })
      if (!result?.success) {
        if (result?.cooldown) {
          syncDownloadCooldownMs.value = Number(result.remainingMs || 0)
          showToast(`下载冷却中，${syncDownloadCooldownText.value}`, 'info')
        } else {
          showToast(result?.error || '云下载失败', 'error')
        }
        return
      }
      await refreshScheduleAfterCloudDownload(result)
      refreshCloudSyncCooldown()
      if (result?.empty) {
        showToast('云端暂无备份，已记录本次同步', 'info')
      } else {
        showToast('云下载完成，已应用自定义课程', 'success')
      }
    } catch (e) {
      showToast(String((e as any)?.message || '云下载失败'), 'error')
    } finally {
      syncDownloading.value = false
      syncStatusText.value = ''
    }
  }

  return {
    syncUploading,
    syncDownloading,
    syncUploadCooldownMs,
    syncDownloadCooldownMs,
    syncStatusText,
    syncUploadCooldownText,
    syncDownloadCooldownText,
    refreshCloudSyncCooldown,
    clearCloudSyncCooldownTimer,
    ensureCloudSyncCooldownTimer,
    refreshScheduleAfterCloudDownload,
    handleCloudSyncUpdated,
    handleScheduleVisibilityChange,
    handleCloudSyncUpload,
    handleCloudSyncDownload
  }
}

export type ScheduleSync = ReturnType<typeof useScheduleSync>
