// @ts-expect-error Legacy notification implementation is isolated behind this typed facade.
import * as runtime from './notify_center.runtime.js'

export interface NotificationSettings extends Record<string, unknown> {
  enableBackground?: boolean
  enableClassReminder?: boolean
  enableSchoolInbox?: boolean
  intervalMinutes?: number
}

export interface NotificationSnapshot extends Record<string, unknown> {
  studentId: string
  checkedAt: string
  runtime?: string
  skipped?: boolean
  settings?: NotificationSettings
  notifications?: {
    queued: number
    sent: number
    items: unknown[]
  }
}

export interface NotificationCheckInput {
  studentId?: string | null
  launchCheck?: boolean
  reason?: string
  priority?: 'foreground' | 'background' | string
  allowPermissionPrompt?: boolean
}

export interface NotificationMonitorInput {
  studentId?: string | null
  onUpdate?: ((snapshot: NotificationSnapshot) => void) | null
}

export const NOTIFY_SNAPSHOT_EVENT: string = runtime.NOTIFY_SNAPSHOT_EVENT
export const markSchoolInboxNotified = runtime.markSchoolInboxNotified as (
  studentId: unknown,
  itemId: unknown
) => boolean
export const runNotificationCheck = runtime.runNotificationCheck as (
  input?: NotificationCheckInput
) => Promise<NotificationSnapshot | null>
export const startNotificationMonitor = runtime.startNotificationMonitor as (
  input?: NotificationMonitorInput
) => Promise<boolean>
export const stopNotificationMonitor = runtime.stopNotificationMonitor as () => Promise<void>
export const getLastNotifySnapshot = runtime.getLastNotifySnapshot as (
  studentId: unknown
) => NotificationSnapshot | null
export const getNotificationMonitorSettings = runtime.getNotificationMonitorSettings as () => NotificationSettings
