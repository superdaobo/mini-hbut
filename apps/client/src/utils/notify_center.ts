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
  checkChaoxingInbox,
  sendQueuedNotifications,
  syncWidgetData
} from './notify_center_checks.js'
import { reconcileLocalReminders } from './local_reminder_scheduler'

export interface NotificationSettings extends Record<string, unknown> {
  enableBackground?: boolean
  enableClassReminder?: boolean
  enableSchoolInbox?: boolean
  enableChaoxingInbox?: boolean
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

/** 去重快照 id 并集上限（契约 §2：2000 条、保留最新；20 次 × 50 条突发不溢出）。 */
const SCHOOL_INBOX_IDS_CAP = 2000

/** 将学校消息 id 写入通知去重快照，避免重登或后续检查重复推送。 */
export const markSchoolInboxNotified = (studentId: unknown, itemId: unknown): boolean => {
  const sid = toSafeText(studentId)
  const id = toSafeText(itemId)
  if (!sid || !id) return false

  const state = readSchoolInboxState(sid)
  if (state.ids.includes(id)) return true

  // #1102：已读标记只做 id 并集追加，不得改变「首次可信抓取是否已完成」
  // （initialized）的语义。快照缺失时按 { schema: 2, initialized: false }
  // 创建：后续第一次检查仍走基线（不推送），已读 id 留在并集里避免之后
  // 重复通知；若这里写死 initialized: true，第一次检查会把整张未读表
  // 当成"新消息"一次性全部弹出。
  const nextIds = [id, ...state.ids].slice(0, SCHOOL_INBOX_IDS_CAP)
  writeJSON(schoolInboxStateKeyFor(sid), {
    schema: 2,
    initialized: state.initialized,
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
      chaoxingInbox: {
        success: false,
        enabled: !!settings.enableChaoxingInbox,
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
  const [classReminder, schoolInbox, chaoxingInbox] = await Promise.all([
    checkClassReminder(sid, settings, queue, schedule),
    checkSchoolInbox(sid, settings, queue),
    // #715：学习通通知独立渠道，与学校消息（教务）并行检测
    checkChaoxingInbox(sid, settings, queue)
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
    chaoxingInbox,
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

// ============================================================
// 后台轮询监控
// 设计（#1104 契约 §4）：
// - 单飞锁：同一时刻至多一次检查在途，锁由检查自身的 finally 复位；
//   stop 不清除它——否则 stop 瞬间在途检查会失去互斥保护，之后新代际
//   的检查可能与仍在途的旧检查并发，把同一批数据推送 N 次；
// - 代际令牌：stop/换账号时递增，旧代际的 interval / 延迟检查回调与
//   异步挂起步骤在恢复执行后自毁（定时器句柄本身也同步清除，双保险）；
// - 启动串行链：并发 / 秒级重复的 start 依次排队，同账号已监控时幂等
//   复用，换账号先销毁旧代际再重建；任何时刻至多 1 个 interval +
//   1 个延迟检查；
// - 超时抢占：单飞锁持有超过 MONITOR_CHECK_STALE_MS 视为挂起，允许下一次
//   检查抢占，避免某次平台调用永不返回导致监控永久停摆。
// ============================================================

/** 单飞锁的超时抢占阈值：超过即视为泄漏（检查本身已有 15~60s 网络超时）。 */
const MONITOR_CHECK_STALE_MS = 5 * 60 * 1000

let monitorTimer: number | null = null
let monitorLaunchTimer: number | null = null
let monitorStudentId = ''
/** 单飞锁的持有者代际：0 表示空闲，非 0 表示该代际的一次检查仍在途。 */
let monitorCheckingGen = 0
/** 单飞锁的获取时刻（毫秒），用于超时抢占判定。 */
let monitorCheckStartedAt = 0
/** 代际令牌：stop/换账号时递增；旧代际回调与挂起步骤据此自毁。 */
let monitorGeneration = 0
/** 启动串行链：把并发 start 串成队列，杜绝交叠的 start 各自建定时器。 */
let monitorStartChain: Promise<unknown> = Promise.resolve()
let monitorResumeListener: { remove: () => Promise<void> } | null = null
let monitorOnUpdate: ((snapshot: NotificationSnapshot) => void) | null = null

const clearResumeListener = async (): Promise<void> => {
  if (!monitorResumeListener) return
  // 先取走本地引用并置空，再等 remove：避免 await 挂起期间新一代注册
  // 的监听器被旧代际的清理误清
  const listener = monitorResumeListener
  monitorResumeListener = null
  try {
    await listener.remove()
  } catch {
    // ignore
  }
}

const monitorCheck = async ({
  launchCheck = false,
  reason = 'interval',
  priority = 'background'
}: {
  launchCheck?: boolean
  reason?: string
  priority?: string
} = {}): Promise<NotificationSnapshot | null> => {
  if (!monitorStudentId) return null
  // 单飞锁：检查在途时直接忽略，避免并发检查把同一批数据推送 N 次。
  // 抢占兜底：某次检查因平台调用永久挂起时不至于让监控彻底停摆。
  const running = monitorCheckingGen !== 0
  const stale = running && Date.now() - monitorCheckStartedAt > MONITOR_CHECK_STALE_MS
  if (running && !stale) return null
  if (stale) {
    pushDebugLog('Notify', '检测到超时的在飞检查，抢占单飞锁继续检查', 'warn')
  }
  const sid = monitorStudentId
  const generation = monitorGeneration
  monitorCheckingGen = generation
  monitorCheckStartedAt = Date.now()
  try {
    const snapshot = await runNotificationCheck({
      studentId: sid,
      launchCheck,
      reason,
      priority,
      allowPermissionPrompt: false
    })
    // 代际校验：检查期间若发生 stop/换账号，旧代际结果不再交给新一代 UI 回调
    if (generation === monitorGeneration && typeof monitorOnUpdate === 'function' && snapshot) {
      monitorOnUpdate(snapshot)
    }
    return snapshot
  } finally {
    // #1104：单飞锁由检查自身复位（stop 不清除）；且只释放自己持有的那把
    if (monitorCheckingGen === generation) {
      monitorCheckingGen = 0
      monitorCheckStartedAt = 0
    }
  }
}

/** 启动核心：只在串行链内执行，保证任意时刻至多一组定时器。 */
const startMonitorCore = async (
  sid: string,
  callback: ((snapshot: NotificationSnapshot) => void) | null
): Promise<boolean> => {
  // 同账号已在监控：幂等复用现有定时器，只更新 UI 回调
  if (monitorStudentId === sid && monitorTimer !== null) {
    if (callback) monitorOnUpdate = callback
    return true
  }
  // 换账号 / 重新启用：先完整销毁旧代际（定时器、监听器），再重建
  await stopNotificationMonitor()
  const generation = monitorGeneration

  monitorStudentId = sid
  monitorOnUpdate = callback

  const settings = getNotifySettings()
  const intervalMinutes = Math.max(
    MIN_INTERVAL_MINUTES,
    Number(settings.intervalMinutes || DEFAULT_INTERVAL_MINUTES)
  )

  // 定时轮询：间隔来自通知设置页；回调先校验代际，旧代际定时器自毁
  monitorTimer = window.setInterval(() => {
    if (generation !== monitorGeneration) return
    monitorCheck({ launchCheck: false, reason: 'interval', priority: 'background' }).catch(() => {})
  }, intervalMinutes * 60 * 1000)
  pushDebugLog('Notify', `通知轮询已启动 interval=${intervalMinutes}min`, 'info', { studentId: sid })

  // 启动检查延迟 7s 执行，避免和首页首屏请求抢占
  monitorLaunchTimer = window.setTimeout(() => {
    monitorLaunchTimer = null
    if (generation !== monitorGeneration) return
    monitorCheck({ launchCheck: true, reason: 'app-launch', priority: 'background' }).catch(() => {})
  }, 7000)

  if (isCapacitorRuntime()) {
    try {
      const mod = await import('@capacitor/app')
      const listener = await mod.App.addListener('appStateChange', (state: { isActive?: boolean }) => {
        if (state?.isActive && generation === monitorGeneration) {
          monitorCheck({ launchCheck: false, reason: 'resume', priority: 'background' }).catch(() => {})
        }
      })
      // 挂起期间若发生 stop/换账号，代际已变：立即移除，不收养旧监听器
      if (generation === monitorGeneration) {
        monitorResumeListener = listener
      } else {
        await listener.remove().catch(() => undefined)
      }
    } catch {
      // ignore
    }
  }

  return true
}

export const startNotificationMonitor = async (
  input: NotificationMonitorInput = {}
): Promise<boolean> => {
  const { studentId, onUpdate } = input || {}
  const sid = toSafeText(studentId)
  const callback = typeof onUpdate === 'function' ? onUpdate : null
  if (!sid) return false

  // 串行链：并发 / 秒级重复的 start 依次执行核心逻辑（幂等复用或销毁重建），
  // 杜绝旧实现里"后到的 start 等前一个 stop 完成"造成的定时器交叠/泄漏
  const result = monitorStartChain.then(() => startMonitorCore(sid, callback))
  monitorStartChain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

export const stopNotificationMonitor = async (): Promise<void> => {
  // 代际递增：旧代际的定时器回调与异步挂起步骤从此刻起全部自毁
  monitorGeneration += 1
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
  // #1104：不清除单飞锁（monitorCheckingGen）——在途检查由检查自身的 finally 复位
  monitorOnUpdate = null
  pushDebugLog('Notify', '通知轮询已停止', 'debug')
}

export const getLastNotifySnapshot = (studentId: unknown): NotificationSnapshot | null =>
  getStoredSnapshot(studentId)

export const getNotificationMonitorSettings = (): NotificationSettings => getNotifySettings()

export { STORAGE_KEYS, isSchoolInboxItemRead, APP_BOOT_ID }
