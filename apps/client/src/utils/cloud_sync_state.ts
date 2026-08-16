/**
 * cloud_sync_state：云同步的本地状态、冷却窗口与结果事件提交。
 */
import { getCloudSyncRuntimeConfig } from './cloud_sync_config.js'
import {
  clearLastSuccessTs,
  getLastSuccessTs,
  isValidStudentId,
  readCloudSyncStatusInternal,
  toSafeText,
  writeCloudSyncStatus
} from './cloud_sync_storage.js'
import { pushDebugLog } from './debug_logger'

export interface CloudSyncCooldownState {
  blocked: boolean
  remainingMs: number
  cooldownMs: number
  reason?: 'missing-student' | 'invalid-student'
}

export interface CloudSyncResult extends Record<string, unknown> {
  success: boolean
  error?: string
  reason?: string
  cooldown?: boolean
  remainingMs?: number
  uploadedAt?: number
}

export interface CloudSyncLocalStatus extends Record<string, unknown> {
  studentId: string
}

export const CLOUD_SYNC_UPDATED_EVENT = 'hbu-cloud-sync-updated'

const dispatchCloudSyncEvent = (detail: Record<string, unknown> = {}): void => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(CLOUD_SYNC_UPDATED_EVENT, { detail }))
}

export const commitCloudSyncResult = (
  studentId: unknown,
  action: string,
  detail: Record<string, unknown> = {}
): Record<string, unknown> | null => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const payload = detail && typeof detail === 'object' ? detail : {}
  const now = Date.now()
  const result = {
    action: toSafeText(action),
    reason: toSafeText(payload.reason),
    success: !!payload.success,
    cooldown: !!payload.cooldown,
    error: toSafeText(payload.error),
    source: toSafeText(payload.source || 'runtime'),
    updatedAt: now
  }
  const patch: Record<string, unknown> = {}
  if (result.action === 'upload') {
    patch.lastUploadAt = now
    patch.lastUploadOk = result.success
    patch.lastUploadReason = result.reason
    patch.lastUploadError = result.success ? '' : result.error
    if ('includeCustomCourses' in payload) {
      patch.lastUploadIncludeCustomCourses = payload.includeCustomCourses === true
    }
  } else if (result.action === 'download') {
    patch.lastDownloadAt = now
    patch.lastDownloadOk = result.success
    patch.lastDownloadReason = result.reason
    patch.lastDownloadError = result.success ? '' : result.error
    if ('applyCustomCourses' in payload) {
      patch.lastDownloadApplyCustomCourses = payload.applyCustomCourses === true
    }
  }
  patch.lastAction = result.action
  patch.lastActionOk = result.success
  patch.lastActionError = result.success ? '' : result.error
  patch.lastActionReason = result.reason
  patch.lastActionSource = result.source
  patch.lastCooldown = result.cooldown
  const saved = writeCloudSyncStatus(sid, patch)
  dispatchCloudSyncEvent({
    ...(saved || {}),
    ...result,
    studentId: sid,
    ...(payload && typeof payload === 'object' ? payload : {})
  })
  return saved
}

export const getCloudSyncLocalStatus = (studentId: unknown): CloudSyncLocalStatus | null => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  const parsed = readCloudSyncStatusInternal(sid)
  if (!parsed || typeof parsed !== 'object') return null
  return {
    ...parsed,
    studentId: sid
  }
}

export const resetCloudSyncCooldownForSession = (studentId: unknown): void => {
  const sid = toSafeText(studentId)
  if (!sid || !isValidStudentId(sid)) return
  clearLastSuccessTs(sid, 'upload')
  clearLastSuccessTs(sid, 'download')
  clearLastSuccessTs(sid, 'manual')
  pushDebugLog('CloudSync', `登录后重置冷却窗口 sid=${sid}`, 'debug')
}

export const getCloudSyncCooldownState = (
  studentId: unknown,
  action: 'upload' | 'download' | 'manual' | string = 'upload'
): CloudSyncCooldownState => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { blocked: true, remainingMs: 0, cooldownMs: 0, reason: 'missing-student' }
  }
  if (!isValidStudentId(sid)) {
    return { blocked: true, remainingMs: 0, cooldownMs: 0, reason: 'invalid-student' }
  }
  const cfg = getCloudSyncRuntimeConfig()
  const normalizedAction = toSafeText(action).toLowerCase()
  const actionCooldownSec = normalizedAction === 'download'
    ? Number(cfg.downloadCooldownSec || cfg.cooldownSec || 0)
    : Number(cfg.uploadCooldownSec || cfg.cooldownSec || 0)
  const cooldownMs = Math.max(0, actionCooldownSec * 1000)
  const lastTs = getLastSuccessTs(sid, normalizedAction)
  const remainingMs = Math.max(0, cooldownMs - (Date.now() - lastTs))
  return {
    blocked: remainingMs > 0,
    remainingMs,
    cooldownMs
  }
}
