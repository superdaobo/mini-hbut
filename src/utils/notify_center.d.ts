export const NOTIFY_SNAPSHOT_EVENT: string

export interface NotificationCheckOptions {
  studentId?: string
  reason?: string
  launchCheck?: boolean
  allowPermissionPrompt?: boolean
  priority?: string
}

export function markSchoolInboxNotified(studentId: string, itemId: string | number): void
export function runNotificationCheck(options?: NotificationCheckOptions): Promise<unknown>
export function startNotificationMonitor(options?: {
  studentId?: string
  onUpdate?: (snapshot: unknown) => void
}): Promise<unknown>
export function stopNotificationMonitor(): Promise<void>
export function getLastNotifySnapshot(studentId: string): unknown
export function getNotificationMonitorSettings(): unknown
