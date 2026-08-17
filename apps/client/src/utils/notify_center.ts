/**
 * notify_center：通知中心编排的真实 TypeScript 实现。
 * 检查逻辑在 ./notify_center_checks.ts，常量/工具在 ./notify_center_util.ts。
 */
import { isCapacitorRuntime } from '../platform/native'
import { getRuntime } from '../platform'
import { pushDebugLog } from './debug_logger'
import {
  APP_BOOT_ID,
  DEFAULT_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  STORAGE_KEYS,
  getDormSelection,
  getNotifySettings,
  nowIso,
  readJSON,
  schoolInboxStateKeyFor,
  snapshotKeyFor,
  toSafeText,
  writeJSON
} from './notify_center_util.js'
import {
  emitSnapshotUpdate,
  isSchoolInboxItemRead,
  readSchoolInboxState,
  refreshScheduleSilently,
  checkGrades,
  checkExams,
  checkElectricity,
  checkClassReminder,
  checkSchoolInbox,
  sendQueuedNotifications,
  syncWidgetData
} from './notify_center_checks.js'
import { reconcileLocalReminders } from './local_reminder_scheduler'

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

export const NOTIFY_SNAPSHOT_EVENT = 'hbu-notify-snapshot-updated'

/** 将学校消息 id 写入通知去重快照，避免重登或后续检查重复推送。 */
export const markSchoolInboxNotified = (studentId: unknown, itemId: unknown): boolean => {
  const sid = toSafeText(studentId)
  const id = toSafeText(itemId)
  if (!sid || !id) return false

  const state = readSchoolInboxState(sid)
  if (state.ids.includes(id)) return true

  const nextIds = [id, ...state.ids].slice(0, 500)
  writeJSON(schoolInboxStateKeyFor(sid), {
    initialized: true,
    ids: nextIds,
    updated_at: nowIso()
  })
  return true
}

const getStoredSnapshot = (studentId: unknown): NotificationSnapshot | null => {
  const sid = toSafeText(studentId)
  if (!sid) return null
  return readJSON<NotificationSnapshot>(snapshotKeyFor(sid), null)
}

const setStoredSnapshot = (studentId: unknown, snapshot: NotificationSnapshot): void => {
  const sid = toSafeText(studentId)
  if (!sid || !snapshot) return
  writeJSON(snapshotKeyFor(sid), snapshot)
}

export const runNotificationCheck = async (
  input: NotificationCheckInput = {}
): Promise<NotificationSnapshot | null> => {
  const {
    studentId,
    launchCheck = false,
    reason = 'manual',
    priority = 'foreground',
    allowPermissionPrompt = false
  } = input || {}
  const sid = toSafeText(studentId)
  if (!sid) return null

  const settings = getNotifySettings()
  const dormSelection = getDormSelection()

  const shouldRun =
    launchCheck || reason === 'manual' || reason === 'resume' || settings.enableBackground
  const checkedAt = nowIso()

  if (!shouldRun) {
    const fallbackSnapshot = getStoredSnapshot(sid)
    if (fallbackSnapshot) return fallbackSnapshot
    return {
      studentId: sid,
      checkedAt,
      runtime: 'idle',
      skipped: true,
      settings,
      schedule: { success: false, error: '后台检查未启用' },
      grades: { success: false, total: 0, changed: false, latestItems: [] },
      exams: { success: false, total: 0, upcoming: [], tomorrowCount: 0 },
      classReminder: {
        success: false,
        enabled: !!settings.enableClassReminder,
        totalToday: 0,
        triggered: 0
      },
      electricity: {
        success: false,
        configured: false,
        selectedPath: dormSelection,
        error: '后台检查未启用'
      },
      schoolInbox: {
        success: false,
        enabled: !!settings.enableSchoolInbox,
        total: 0,
        triggered: 0
      },
      notifications: { queued: 0, sent: 0, items: [] }
    }
  }

  const queue: Array<{ title?: unknown; body?: unknown; targetView?: unknown }> = []
  pushDebugLog('Notify', `开始通知检查 reason=${reason} priority=${priority} launch=${launchCheck ? '1' : '0'}`, 'info', {
    studentId: sid,
    settings
  })

  // 核心检查流程：课表静默刷新 + 成绩变更 + 考试提醒 + 电费实时监控。
  const [schedule, grades, exams, electricity] = await Promise.all([
    refreshScheduleSilently(sid),
    checkGrades(sid, settings, queue),
    checkExams(sid, settings, queue),
    checkElectricity(sid, settings, queue, launchCheck)
  ])
  const [classReminder, schoolInbox] = await Promise.all([
    checkClassReminder(sid, settings, queue, schedule),
    checkSchoolInbox(sid, settings, queue)
  ])

  // #610：后台静默课表刷新成功后触发系统预调度 reconcile（幂等，diff 无变化时零系统调用）
  if (schedule?.success) {
    void reconcileLocalReminders({
      studentId: sid,
      semesterHint: String(schedule?.semester || ''),
      reason: 'notify-schedule-refresh'
    }).catch(() => {})
  }

  const sent = await sendQueuedNotifications(queue, allowPermissionPrompt, sid)
  pushDebugLog(
    'Notify',
    `通知检查完成 queue=${queue.length} sent=${sent.length}`,
    'info',
    {
      studentId: sid,
      reason,
      classTriggered: (classReminder?.triggered as number) || 0
    }
  )

  const snapshot: NotificationSnapshot = {
    studentId: sid,
    checkedAt,
    runtime: getRuntime(),
    reason,
    priority,
    launchCheck,
    settings,
    schedule,
    grades,
    exams,
    classReminder,
    schoolInbox,
    electricity,
    notifications: {
      queued: queue.length,
      sent: sent.length,
      items: sent
    }
  }

  setStoredSnapshot(sid, snapshot)
  emitSnapshotUpdate(snapshot)

  // 同步数据到 Android 小组件
  syncWidgetData(snapshot).catch(() => {})

  return snapshot
}

let monitorTimer: number | null = null
let monitorLaunchTimer: number | null = null
let monitorStudentId = ''
let monitorChecking = false
let monitorResumeListener: { remove: () => Promise<void> } | null = null
let monitorOnUpdate: ((snapshot: NotificationSnapshot) => void) | null = null

const clearResumeListener = async (): Promise<void> => {
  if (!monitorResumeListener) return
  try {
    await monitorResumeListener.remove()
  } catch {
    // ignore
  }
  monitorResumeListener = null
}

const monitorCheck = async ({
  launchCheck = false,
  reason = 'interval',
  priority = 'foreground'
}: {
  launchCheck?: boolean
  reason?: string
  priority?: string
} = {}): Promise<NotificationSnapshot | null> => {
  if (!monitorStudentId || monitorChecking) return null
  monitorChecking = true
  try {
    const snapshot = await runNotificationCheck({
      studentId: monitorStudentId,
      launchCheck,
      reason,
      priority,
      allowPermissionPrompt: false
    })
    if (typeof monitorOnUpdate === 'function' && snapshot) {
      monitorOnUpdate(snapshot)
    }
    return snapshot
  } finally {
    monitorChecking = false
  }
}

export const startNotificationMonitor = async (
  input: NotificationMonitorInput = {}
): Promise<boolean> => {
  const { studentId, onUpdate } = input || {}
  const sid = toSafeText(studentId)
  await stopNotificationMonitor()
  if (!sid) return false

  monitorStudentId = sid
  monitorOnUpdate = typeof onUpdate === 'function' ? onUpdate : null

  const settings = getNotifySettings()
  const intervalMinutes = Math.max(
    MIN_INTERVAL_MINUTES,
    Number(settings.intervalMinutes || DEFAULT_INTERVAL_MINUTES)
  )

  // 定时轮询：间隔来自通知设置页；启动检查延迟执行，避免和首页首屏请求抢占。
  monitorTimer = window.setInterval(() => {
    monitorCheck({ launchCheck: false, reason: 'interval', priority: 'background' }).catch(() => {})
  }, intervalMinutes * 60 * 1000)
  pushDebugLog('Notify', `通知轮询已启动 interval=${intervalMinutes}min`, 'info', { studentId: sid })

  monitorLaunchTimer = window.setTimeout(() => {
    monitorLaunchTimer = null
    monitorCheck({ launchCheck: true, reason: 'app-launch', priority: 'background' }).catch(() => {})
  }, 7000)

  if (isCapacitorRuntime()) {
    try {
      const mod = await import('@capacitor/app')
      monitorResumeListener = await mod.App.addListener('appStateChange', (state: { isActive?: boolean }) => {
        if (state?.isActive) {
          monitorCheck({ launchCheck: false, reason: 'resume', priority: 'background' }).catch(() => {})
        }
      })
    } catch {
      // ignore
    }
  }

  return true
}

export const stopNotificationMonitor = async (): Promise<void> => {
  if (monitorTimer) {
    window.clearInterval(monitorTimer)
    monitorTimer = null
  }
  if (monitorLaunchTimer) {
    window.clearTimeout(monitorLaunchTimer)
    monitorLaunchTimer = null
  }
  await clearResumeListener()
  monitorStudentId = ''
  monitorChecking = false
  monitorOnUpdate = null
  pushDebugLog('Notify', '通知轮询已停止', 'debug')
}

export const getLastNotifySnapshot = (studentId: unknown): NotificationSnapshot | null =>
  getStoredSnapshot(studentId)

export const getNotificationMonitorSettings = (): NotificationSettings => getNotifySettings()

export { STORAGE_KEYS, isSchoolInboxItemRead, APP_BOOT_ID }
