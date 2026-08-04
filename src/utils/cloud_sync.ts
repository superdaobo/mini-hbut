// @ts-expect-error Legacy runtime is isolated behind the typed TypeScript boundary.
import * as runtime from './cloud_sync.runtime.js'

export interface CloudSyncRuntimeConfig {
  enabled: boolean
  mode: 'proxy'
  endpoint: string
  proxyEndpoint: string
  secretRef: string
  cooldownSec: number
  uploadCooldownSec: number
  downloadCooldownSec: number
  timeoutMs: number
  useRemoteConfig: boolean
}

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

export interface CloudSyncLocalStatus extends Record<string, unknown> {
  studentId: string
}

export const CLOUD_SYNC_UPDATED_EVENT: string = runtime.CLOUD_SYNC_UPDATED_EVENT
export const getCloudSyncRuntimeConfig = runtime.getCloudSyncRuntimeConfig as () => CloudSyncRuntimeConfig
export const getCloudSyncLocalStatus = runtime.getCloudSyncLocalStatus as (
  studentId: unknown
) => CloudSyncLocalStatus | null
export const resetCloudSyncCooldownForSession = runtime.resetCloudSyncCooldownForSession as (
  studentId: unknown
) => void
export const getCloudSyncCooldownState = runtime.getCloudSyncCooldownState as (
  studentId: unknown,
  action?: 'upload' | 'download' | 'manual' | string
) => CloudSyncCooldownState
export const runCloudSyncUpload = runtime.runCloudSyncUpload as (
  input?: CloudSyncUploadInput
) => Promise<CloudSyncResult>
export const runCloudSyncDownload = runtime.runCloudSyncDownload as (
  input?: CloudSyncDownloadInput
) => Promise<CloudSyncResult>
export const runAutoCloudSyncAfterLogin = runtime.runAutoCloudSyncAfterLogin as (
  input?: AutoCloudSyncInput
) => Promise<CloudSyncResult & { download?: CloudSyncResult | null; upload?: CloudSyncResult | null }>
