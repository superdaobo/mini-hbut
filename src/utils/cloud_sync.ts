/**
 * cloud_sync：云同步编排的真实 TypeScript 实现。
 * 配置在 ./cloud_sync_config.ts，状态在 ./cloud_sync_state.ts，
 * 传输在 ./cloud_sync_transport.ts，负载在 ./cloud_sync_payload.ts，
 * 云端应用在 ./cloud_sync_apply.ts，存储/工具在 ./cloud_sync_storage.ts，
 * 学业快照在 ./cloud_sync_snapshot.ts。
 */
import { applyAcademicFromCloud, applySettingsFromCloud, replaceCustomCourses } from './cloud_sync_apply.js'
import type { AcademicApplyResult } from './cloud_sync_apply.js'
import { getCloudSyncRuntimeConfig } from './cloud_sync_config.js'
import { mergeCustomCourseSemesters } from './cloud_sync_snapshot.js'
import {
  buildAutoUploadSignature,
  buildSyncPayload,
  primeAcademicCaches,
  resolveAutoUploadReason
} from './cloud_sync_payload.js'
import {
  commitCloudSyncResult,
  getCloudSyncCooldownState
} from './cloud_sync_state.js'
import type { CloudSyncResult } from './cloud_sync_state.js'
import {
  CLOUD_SYNC_BOOTSTRAP_PREFIX,
  ensureDeviceId,
  isValidStudentId,
  makeStudentKey,
  readAutoUploadMeta,
  setLastSuccessTs,
  toSafeText,
  writeAutoUploadMeta
} from './cloud_sync_storage.js'
import { asRecord, requestCloudSync } from './cloud_sync_transport.js'
import { pushDebugLog } from './debug_logger'
import { NOTIFY_SNAPSHOT_EVENT } from './notify_center'

export interface CloudSyncUploadInput {
  studentId?: string | null
  reason?: string
  force?: boolean
  latestGrades?: unknown[]
  includeCustomCourses?: boolean
  includeAcademic?: boolean
  includeSettings?: boolean
  skipCooldownRecord?: boolean
}

export interface CloudSyncDownloadInput {
  studentId?: string | null
  reason?: string
  force?: boolean
  applySettings?: boolean
  applyCustomCourses?: boolean
  applyAcademic?: boolean
  skipCooldownRecord?: boolean
}

export interface AutoCloudSyncInput {
  studentId?: string | null
  latestGrades?: unknown[]
  reason?: string
  skipDownload?: boolean
}

const extractCloudData = (response: unknown): Record<string, unknown> | null => {
  if (!response || typeof response !== 'object') return null
  const raw = response as Record<string, unknown>
  if (raw?.data && typeof raw.data === 'object') return raw.data as Record<string, unknown>
  return raw
}

export const runCloudSyncUpload = async (
  input: CloudSyncUploadInput = {}
): Promise<CloudSyncResult> => {
  const {
    studentId,
    reason = 'manual',
    force = false,
    latestGrades = [],
    includeCustomCourses = true,
    includeAcademic = true,
    includeSettings = true,
    skipCooldownRecord = false
  } = input || {}
  const sid = toSafeText(studentId)
  const safeReason = toSafeText(reason) || 'manual'
  if (!sid) {
    const output: CloudSyncResult = { success: false, error: '学号为空，无法上传云同步' }
    commitCloudSyncResult(studentId, 'upload', { ...output, reason: safeReason })
    return output
  }
  if (!isValidStudentId(sid)) {
    const output: CloudSyncResult = { success: false, error: '云同步仅支持 10 位学号账号' }
    commitCloudSyncResult(sid, 'upload', { ...output, reason: safeReason })
    return output
  }
  const cfg = getCloudSyncRuntimeConfig()
  if (!cfg.enabled) {
    const output: CloudSyncResult = { success: false, error: '云同步未启用或未配置服务地址' }
    commitCloudSyncResult(sid, 'upload', { ...output, reason: safeReason })
    return output
  }

  if (!force) {
    const cooldown = getCloudSyncCooldownState(sid, 'upload')
    if (cooldown.blocked) {
      const output: CloudSyncResult = {
        success: false,
        cooldown: true,
        remainingMs: cooldown.remainingMs,
        error: '同步冷却中'
      }
      commitCloudSyncResult(sid, 'upload', { ...output, reason: safeReason })
      return output
    }
  }

  pushDebugLog('CloudSync', `开始上传 student=${sid} reason=${safeReason}`, 'info')
  try {
    pushDebugLog(
      'CloudSync',
      `上传内容 settings=${includeSettings ? 1 : 0} academic=${includeAcademic ? 1 : 0} custom=${includeCustomCourses ? 1 : 0}`,
      'debug'
    )
    const payloadResult = await buildSyncPayload(sid, {
      latestGrades,
      includeCustomCourses,
      includeAcademic,
      includeSettings
    })
    const payload = payloadResult?.payload || {}
    const customCoursesMode =
      includeCustomCourses && payloadResult?.hasCustomCourseData ? 'replace' : 'preserve'
    pushDebugLog(
      'CloudSync',
      `上传策略 custom_mode=${customCoursesMode} has_courses=${payloadResult?.hasCustomCourseData ? 1 : 0}`,
      'debug'
    )
    const body = {
      student_id: sid,
      device_id: ensureDeviceId(),
      reason: safeReason,
      payload,
      client_version: toSafeText(asRecord(payload?.client).version),
      client_time: Date.now(),
      secret_ref: cfg.secretRef,
      sections: {
        settings: includeSettings === true,
        academic: includeAcademic === true,
        custom_courses: includeCustomCourses === true
      },
      custom_courses_mode: customCoursesMode
    }
    const response = await requestCloudSync('/upload', {
      method: 'POST',
      body,
      config: cfg
    })
    const uploadedAt = Date.now()
    if (!skipCooldownRecord) {
      setLastSuccessTs(sid, 'upload', uploadedAt)
    }
    pushDebugLog('CloudSync', `上传成功 student=${sid}`, 'info')
    const output: CloudSyncResult = {
      success: true,
      response,
      uploadedAt
    }
    commitCloudSyncResult(sid, 'upload', {
      ...output,
      reason: safeReason,
      includeCustomCourses,
      customCoursesMode
    })
    return output
  } catch (error) {
    const errorText = String((error as Error | undefined)?.message || error || '云上传失败')
    commitCloudSyncResult(sid, 'upload', {
      success: false,
      reason: safeReason,
      error: errorText,
      includeCustomCourses
    })
    pushDebugLog('CloudSync', `上传失败 student=${sid}`, 'warn', error)
    throw error
  }
}

export const runCloudSyncDownload = async (
  input: CloudSyncDownloadInput = {}
): Promise<CloudSyncResult> => {
  const {
    studentId,
    reason = 'manual',
    force = false,
    applySettings = true,
    applyCustomCourses = true,
    applyAcademic = true,
    skipCooldownRecord = false
  } = input || {}
  const sid = toSafeText(studentId)
  const safeReason = toSafeText(reason) || 'manual'
  if (!sid) {
    const output: CloudSyncResult = { success: false, error: '学号为空，无法下载云同步' }
    commitCloudSyncResult(studentId, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  }
  if (!isValidStudentId(sid)) {
    const output: CloudSyncResult = { success: false, error: '云同步仅支持 10 位学号账号' }
    commitCloudSyncResult(sid, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  }
  const cfg = getCloudSyncRuntimeConfig()
  if (!cfg.enabled) {
    const output: CloudSyncResult = { success: false, error: '云同步未启用或未配置服务地址' }
    commitCloudSyncResult(sid, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  }

  if (!force) {
    const cooldown = getCloudSyncCooldownState(sid, 'download')
    if (cooldown.blocked) {
      const output: CloudSyncResult = {
        success: false,
        cooldown: true,
        remainingMs: cooldown.remainingMs,
        error: '同步冷却中'
      }
      commitCloudSyncResult(sid, 'download', {
        ...output,
        reason: safeReason,
        applyCustomCourses
      })
      return output
    }
  }

  pushDebugLog('CloudSync', `开始下载 student=${sid} reason=${safeReason}`, 'info')
  try {
    const query = new URLSearchParams({
      student_id: sid,
      reason: safeReason,
      device_id: ensureDeviceId(),
      secret_ref: cfg.secretRef
    }).toString()
    const response = await requestCloudSync(`/download?${query}`, {
      method: 'GET',
      config: cfg
    })
    const data = extractCloudData(response)
    if (!data) {
      const now = Date.now()
      if (!skipCooldownRecord) {
        setLastSuccessTs(sid, 'download', now)
      }
      const bootstrapKey = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, sid)
      if (bootstrapKey) {
        localStorage.setItem(bootstrapKey, String(now))
      }
      pushDebugLog('CloudSync', `下载成功但云端为空 student=${sid}`, 'info')
      const output: CloudSyncResult = {
        success: true,
        empty: true,
        response
      }
      commitCloudSyncResult(sid, 'download', {
        ...output,
        reason: safeReason,
        applyCustomCourses
      })
      return output
    }

    let settingResult = { app: false, ui: false, font: false }
    let customResult = { deleted: 0, added: 0, semesters: 0 }
    let academicResult: AcademicApplyResult = {
      gradesCached: false,
      rankingCached: false,
      personalInfoCached: false,
      scheduleMetaApplied: false,
      scheduleCacheWrites: 0,
      scheduleSemesters: []
    }
    if (applySettings) {
      settingResult = await applySettingsFromCloud(data?.settings)
    }
    if (applyCustomCourses) {
      const hasCoursesSection = Object.prototype.hasOwnProperty.call(data || {}, 'courses')
      if (!hasCoursesSection) {
        pushDebugLog('CloudSync', `下载跳过自定义课表应用 student=${sid} reason=missing-courses-section`, 'info')
      } else {
        const remoteCourseMap = mergeCustomCourseSemesters(
          (data?.courses as Record<string, unknown> | undefined)?.by_semester
        )
        if (Object.keys(remoteCourseMap).length === 0) {
          pushDebugLog('CloudSync', `下载跳过自定义课表应用 student=${sid} reason=empty-courses-map`, 'info')
        } else {
          customResult = await replaceCustomCourses(sid, remoteCourseMap)
        }
      }
    }
    if (applyAcademic) {
      academicResult = applyAcademicFromCloud(sid, data?.academic)
    }

    const successAt = Date.now()
    if (!skipCooldownRecord) {
      setLastSuccessTs(sid, 'download', successAt)
    }
    const bootstrapKey = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, sid)
    if (bootstrapKey) {
      localStorage.setItem(bootstrapKey, String(successAt))
    }
    pushDebugLog(
      'CloudSync',
      `下载成功 student=${sid} add=${customResult.added} del=${customResult.deleted} schedule=${academicResult.scheduleCacheWrites}`,
      'info'
    )
    const output: CloudSyncResult = {
      success: true,
      response,
      settingsApplied: settingResult,
      customCoursesApplied: customResult,
      academicApplied: academicResult
    }
    commitCloudSyncResult(sid, 'download', {
      ...output,
      reason: safeReason,
      applyCustomCourses
    })
    return output
  } catch (error) {
    const errorText = String((error as Error | undefined)?.message || error || '云下载失败')
    commitCloudSyncResult(sid, 'download', {
      success: false,
      reason: safeReason,
      error: errorText,
      applyCustomCourses
    })
    pushDebugLog('CloudSync', `下载失败 student=${sid}`, 'warn', error)
    throw error
  }
}

const hasBootstrapDone = (studentId: unknown): boolean => {
  const key = makeStudentKey(CLOUD_SYNC_BOOTSTRAP_PREFIX, studentId)
  if (!key) return true
  return !!toSafeText(localStorage.getItem(key))
}

const autoCloudSyncInFlight: {
  studentId: string
  promise: Promise<CloudSyncResult & { download?: CloudSyncResult | null; upload?: CloudSyncResult | null }> | null
} = {
  studentId: '',
  promise: null
}

export const runAutoCloudSyncAfterLogin = async (
  input: AutoCloudSyncInput = {}
): Promise<CloudSyncResult & { download?: CloudSyncResult | null; upload?: CloudSyncResult | null }> => {
  const { studentId, latestGrades = [], reason = 'auto-login', skipDownload = false } = input || {}
  try {
    const { shouldApplyAppStoreRestrictions } = await import('../config/app_store_policy')
    const { isTestAccountSession } = await import('./test_account.js')
    // 合规 guest/demo 跳过；真实登录允许（与功能树一致）
    if (shouldApplyAppStoreRestrictions() || isTestAccountSession()) {
      pushDebugLog('CloudSync', '跳过自动云同步：合规收紧会话或演示会话', 'info')
      return { success: false, reason: 'app-store-or-demo' }
    }
  } catch {
    // ignore import errors
  }
  const sid = toSafeText(studentId)
  if (!sid) return { success: false, reason: 'missing-student' }
  if (!isValidStudentId(sid)) {
    pushDebugLog('CloudSync', `跳过自动云同步：非 10 位学号 sid=${sid}`, 'warn')
    return { success: false, reason: 'invalid-student' }
  }

  if (autoCloudSyncInFlight.promise && autoCloudSyncInFlight.studentId === sid) {
    pushDebugLog('CloudSync', `自动同步已在进行中，复用当前任务 sid=${sid}`, 'debug')
    return autoCloudSyncInFlight.promise
  }

  const task = (async (): Promise<CloudSyncResult & {
    download?: CloudSyncResult | null
    upload?: CloudSyncResult | null
  }> => {
    const summary: {
      download: CloudSyncResult | null
      upload: CloudSyncResult | null
    } = {
      download: null,
      upload: null
    }

    if (!skipDownload) {
      try {
        summary.download = await runCloudSyncDownload({
          studentId: sid,
          reason: hasBootstrapDone(sid) ? 'auto-login-settings' : 'auto-new-device-settings',
          force: true,
          applySettings: true,
          applyCustomCourses: false,
          applyAcademic: true,
          skipCooldownRecord: true
        })
      } catch (error) {
        summary.download = { success: false, error: String((error as Error | undefined)?.message || error) }
        pushDebugLog('CloudSync', `自动下载失败 student=${sid}`, 'warn', error)
      }
    }

    try {
      const syncedGrades = await primeAcademicCaches(sid, latestGrades, {
        skipSemesterRankingWarmup: true
      })
      const uploadSignature = await buildAutoUploadSignature(sid, syncedGrades)
      const uploadReason = resolveAutoUploadReason(readAutoUploadMeta(sid), uploadSignature, reason)
      writeAutoUploadMeta(sid, {
        lastAutoResyncReason: uploadReason.recentReason,
        pendingUploadVersion: uploadSignature.version,
        pendingUploadSignature: uploadSignature.signature
      })
      summary.upload = await runCloudSyncUpload({
        studentId: sid,
        reason: uploadReason.reason,
        force: true,
        latestGrades: syncedGrades,
        includeCustomCourses: false,
        includeAcademic: true,
        includeSettings: true,
        skipCooldownRecord: true
      })
      if (summary.upload?.success) {
        writeAutoUploadMeta(sid, {
          lastUploadVersion: uploadSignature.version,
          lastUploadSignature: uploadSignature.signature,
          lastAutoResyncReason: uploadReason.recentReason,
          lastAutoUploadAt: summary.upload.uploadedAt || Date.now()
        })
      }
    } catch (error) {
      summary.upload = { success: false, error: String((error as Error | undefined)?.message || error) }
      pushDebugLog('CloudSync', `自动上传失败 student=${sid}`, 'warn', error)
    }

    return {
      success: !!summary.upload?.success || !!summary.download?.success,
      ...summary
    }
  })()

  autoCloudSyncInFlight.studentId = sid
  autoCloudSyncInFlight.promise = task
  try {
    return await task
  } finally {
    if (autoCloudSyncInFlight.promise === task) {
      autoCloudSyncInFlight.promise = null
      autoCloudSyncInFlight.studentId = ''
    }
  }
}

let notifyAutoUploadListenerInstalled = false

const installNotifyAutoUploadListener = (): void => {
  if (notifyAutoUploadListenerInstalled || typeof window === 'undefined') return
  window.addEventListener(NOTIFY_SNAPSHOT_EVENT, (event) => {
    const detail = (event as CustomEvent)?.detail as Record<string, unknown> | undefined
    const sid = toSafeText(
      detail?.studentId ||
      detail?.student_id ||
      localStorage.getItem('hbu_username') ||
      localStorage.getItem('hbu_student_id')
    )
    if (!sid || !isValidStudentId(sid)) return
    runAutoCloudSyncAfterLogin({
      studentId: sid,
      reason: 'auto-signature-change',
      skipDownload: true
    }).catch((error) => {
      pushDebugLog('CloudSync', `通知快照触发自动上传失败 student=${sid}`, 'warn', error)
    })
  })
  notifyAutoUploadListenerInstalled = true
}

installNotifyAutoUploadListener()

// 供测试与辅助模块复用
export {
  REMOTE_CONFIG_SNAPSHOT_KEY,
  CLOUD_SYNC_DEVICE_ID_KEY,
  CLOUD_SYNC_LAST_SUCCESS_PREFIX,
  CLOUD_SYNC_LAST_UPLOAD_SUCCESS_PREFIX,
  CLOUD_SYNC_LAST_DOWNLOAD_SUCCESS_PREFIX,
  CLOUD_SYNC_BOOTSTRAP_PREFIX,
  CLOUD_SYNC_STATUS_PREFIX,
  CLOUD_SYNC_AUTO_UPLOAD_META_PREFIX,
  hashText
} from './cloud_sync_storage.js'

export { normalizeGradeItem, normalizeExamItem } from './cloud_sync_snapshot.js'

// 保持模块导出面兼容：类型与事件常量转发自拆分后的子模块
export type { CloudSyncRuntimeConfig } from './cloud_sync_config.js'
export { getCloudSyncRuntimeConfig } from './cloud_sync_config.js'
export type { CloudSyncCooldownState, CloudSyncLocalStatus, CloudSyncResult } from './cloud_sync_state.js'
export {
  CLOUD_SYNC_UPDATED_EVENT,
  getCloudSyncCooldownState,
  getCloudSyncLocalStatus,
  resetCloudSyncCooldownForSession
} from './cloud_sync_state.js'
