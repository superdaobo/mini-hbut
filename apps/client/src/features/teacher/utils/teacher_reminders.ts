// src/features/teacher/utils/teacher_reminders.ts
//
// Teacher Portal V2（E3 #1023）：教师授课提醒 reconcile 编排。
//
// 与学生的 `reconcileLocalReminders` **完全隔离**：
//   - 作用域固定 `teacher:{accountId}:{semester}`（`local_reminder_scheduler` 的教师分支提供）；
//   - 提醒 ID 由教师作用域字符串派生，**严禁复用学生 studentId 去重键**；
//   - 台账 / 快照 / active scope 均为教师专属键，与学生域互不串扰；
//   - 只消费**显式传入的教师课程**，不读学生课表缓存 / 学生考试缓存 / 自定义课程 / 个人日程，
//     绝不触发学生成绩、学生考试、宿舍电费检测。

import {
  applyReminderCap,
  buildClassReminderPlan,
  buildTeacherReminderScope,
  cancelLocalRemindersForScope,
  computeReminderWindow,
  diffReminders,
  isLocalReminderRuntimeSupported,
  readActiveScope,
  REMINDER_WINDOW_DAYS,
  resolveLocalReminderPlatform,
  teacherReminderLedgerKeyFor,
  teacherReminderSnapshotKeyFor,
  writeActiveScope,
  type LedgerEntry,
  type LedgerState,
  type LocalReminderPlatform,
  type ReconcileResult,
  type ReminderSpec,
  type ReminderType,
  type ReminderWindow,
  type TeacherReminderEvent
} from '../../../utils/local_reminder_scheduler'
import {
  getNotifySettings,
  readJSON,
  toSafeText,
  writeJSON,
  type NotifySettingsFull
} from '../../../utils/notify_center_util'

export type { TeacherReminderEvent }

/** 教师提醒 reconcile 输入。 */
export interface TeacherReminderInput {
  /** 教师工号。 */
  accountId: string
  /** 学期（缺失时作用域退化为占位）。 */
  semester: string
  /** 教师课程（显式传入；本分支不读学生课表缓存）。 */
  courses?: Array<Record<string, unknown>>
  /** 学期开始日期（YYYY-MM-DD，用于周次→日期推算）。 */
  startDate?: string
  currentWeek?: number
  settings?: NotifySettingsFull
  now?: Date
  windowDays?: number
  skipPermissionCheck?: boolean
  platform?: LocalReminderPlatform
  /** 触发原因（仅用于结果回传，便于观测）。 */
  reason?: string
}

const readTeacherLedger = (accountId: unknown, semester: unknown): LedgerState => {
  const scope = buildTeacherReminderScope(accountId, semester)
  const state = readJSON<LedgerState>(teacherReminderLedgerKeyFor(accountId, semester), null)
  return {
    scope: state?.scope || scope,
    updatedAt: state?.updatedAt || '',
    entries: Array.isArray(state?.entries) ? state.entries : []
  }
}

const writeTeacherLedger = (accountId: unknown, semester: unknown, state: LedgerState): void => {
  writeJSON(teacherReminderLedgerKeyFor(accountId, semester), state)
}

/**
 * 构建教师授课提醒计划。
 *
 * 关键：把教师作用域字符串作为 `studentId` 传入底层计划器，
 * 使 `deriveReminderId` 的输入含 `teacher:{accountId}:{semester}`，
 * 从而与学生提醒 ID 空间完全分离。
 */
export const buildTeacherClassReminderPlan = (input: {
  accountId: string
  semester: string
  courses?: Array<Record<string, unknown>>
  startDate?: string
  currentWeek?: number
  settings?: NotifySettingsFull
  now?: Date
  window?: ReminderWindow
}): ReminderSpec[] =>
  buildClassReminderPlan({
    studentId: buildTeacherReminderScope(input.accountId, input.semester),
    semester: input.semester,
    courses: input.courses,
    startDate: input.startDate,
    currentWeek: input.currentWeek,
    leadMinutes: (input.settings || getNotifySettings()).classLeadMinutes,
    now: input.now,
    window: input.window
  })

/** 写入教师提醒快照（供只读视图展示，绝不进入学生域键）。 */
export const writeTeacherReminderSnapshot = (
  accountId: unknown,
  semester: unknown,
  specs: ReminderSpec[]
): void => {
  writeJSON(teacherReminderSnapshotKeyFor(accountId, semester), {
    scope: buildTeacherReminderScope(accountId, semester),
    updatedAt: new Date().toISOString(),
    entries: specs.map((spec) => ({
      id: spec.id,
      type: spec.type,
      title: spec.title,
      body: spec.body,
      atEpochSecs: spec.atEpochSecs,
      targetView: spec.targetView
    }))
  })
}

/** 读取教师提醒事件（窗口内的未来事件；无快照时返回空数组，绝不伪造数据）。 */
export const listTeacherReminderEvents = (
  accountId: unknown,
  semester: unknown,
  now: Date = new Date()
): TeacherReminderEvent[] => {
  const state = readJSON<{ entries?: unknown }>(
    teacherReminderSnapshotKeyFor(accountId, semester),
    null
  )
  const entries = Array.isArray(state?.entries) ? state.entries : []
  const nowSecs = Math.floor((now instanceof Date ? now.getTime() : Date.now()) / 1000)
  return entries
    .map((raw): TeacherReminderEvent | null => {
      const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      const atEpochSecs = Number(record.atEpochSecs)
      if (!Number.isFinite(atEpochSecs)) return null
      const type: ReminderType =
        record.type === 'exam' || record.type === 'personal' ? record.type : 'class'
      return {
        id: Number(record.id) || 0,
        type,
        title: toSafeText(record.title),
        body: toSafeText(record.body),
        atEpochSecs,
        targetView: toSafeText(record.targetView) || 'schedule'
      }
    })
    .filter((event): event is TeacherReminderEvent => event !== null && event.atEpochSecs >= nowSecs)
    .sort((a, b) => a.atEpochSecs - b.atEpochSecs)
}

/** 教师 reconcile 并发锁（与学生 `inflight` 分离，避免相互影响）。 */
const teacherInflight = new Map<string, Promise<ReconcileResult>>()

/**
 * 教师提醒 reconcile：仅登记教师授课提醒，作用域 `teacher:{accountId}:{semester}`。
 */
export const reconcileTeacherLocalReminders = async (
  input: TeacherReminderInput
): Promise<ReconcileResult> => {
  const accountId = toSafeText(input.accountId)
  const semester = toSafeText(input.semester)
  const scope = buildTeacherReminderScope(accountId, semester)
  const errors: string[] = []
  const fail = (skipped: string): ReconcileResult => ({
    success: false,
    reason: input.reason,
    skipped,
    expected: 0,
    scheduled: 0,
    canceled: 0,
    kept: 0,
    failed: 0,
    errors,
    windowDays: REMINDER_WINDOW_DAYS,
    ledgerCount: 0,
    pendingQueried: false
  })

  if (!accountId) return fail('missing-teacher-account')

  const running = teacherInflight.get(scope)
  if (running) return running

  const task = (async (): Promise<ReconcileResult> => {
    if (!(await isLocalReminderRuntimeSupported())) return fail('unsupported-runtime')

    const platform = resolveLocalReminderPlatform(input.platform)

    if (!input.skipPermissionCheck) {
      let permission = 'denied'
      try {
        permission = await platform.permission()
      } catch {
        permission = 'denied'
      }
      if (permission !== 'granted') return fail('permission-denied')
    }

    // scope 切换：先取消旧 active scope 的提醒（学生或教师），旧账号计划不得污染新账号。
    const activeScope = readActiveScope()
    if (activeScope && activeScope !== scope) {
      const cancelResult = await cancelLocalRemindersForScope(activeScope, platform)
      if (!cancelResult.success) {
        errors.push(`cancel old scope(${activeScope}) reminders failed`)
      }
    }
    writeActiveScope(scope)

    const now =
      input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date()
    const window = computeReminderWindow(now, input.windowDays)
    const windowDays = Math.round((window.endEpochMs - window.startEpochMs) / 86400000)
    const settings = input.settings || getNotifySettings()

    // 仅教师课程（显式传入），绝不读学生数据源。
    const courses = Array.isArray(input.courses) ? input.courses : []
    let expected: ReminderSpec[] = []
    if (settings.enableClassReminder) {
      expected = buildTeacherClassReminderPlan({
        accountId,
        semester,
        courses,
        startDate: input.startDate,
        currentWeek: input.currentWeek,
        settings,
        now,
        window
      })
    }
    expected = applyReminderCap(expected)

    const ledger = readTeacherLedger(accountId, semester)
    const diff = diffReminders(expected, ledger)

    const scheduledIds: number[] = []
    const failedIds: number[] = []
    for (const spec of diff.toSchedule) {
      try {
        const ok = await platform.schedule({
          id: spec.id,
          title: spec.title,
          body: spec.body,
          atEpochSecs: spec.atEpochSecs,
          channelId: 'hbut-default',
          targetView: spec.targetView
        })
        if (ok) scheduledIds.push(spec.id)
        else {
          failedIds.push(spec.id)
          errors.push(`schedule teacher reminder failed id=${spec.id}`)
        }
      } catch {
        failedIds.push(spec.id)
        errors.push(`schedule teacher reminder error id=${spec.id}`)
      }
    }

    let canceledIds: number[] = []
    if (diff.toCancel.length > 0) {
      try {
        const ok = await platform.cancel(diff.toCancel)
        if (ok) canceledIds = diff.toCancel
        else errors.push(`cancel teacher reminders failed ids=${diff.toCancel.join(',')}`)
      } catch {
        errors.push(`cancel teacher reminders error ids=${diff.toCancel.join(',')}`)
      }
    }

    const expectedById = new Map<number, ReminderSpec>()
    expected.forEach((spec) => expectedById.set(spec.id, spec))
    const cancelSet = new Set(canceledIds)
    const keptSet = new Set(diff.toKeep)
    const failedSet = new Set(failedIds)

    const nextEntries: LedgerEntry[] = []
    for (const entry of ledger.entries) {
      if (cancelSet.has(entry.id)) continue
      if (keptSet.has(entry.id) || scheduledIds.includes(entry.id) || failedSet.has(entry.id)) {
        const spec = expectedById.get(entry.id)
        nextEntries.push(
          spec
            ? {
                id: spec.id,
                fingerprint: spec.fingerprint,
                type: spec.type,
                atEpochMs: spec.atEpochMs
              }
            : entry
        )
      }
    }
    for (const spec of expected) {
      if (scheduledIds.includes(spec.id) && !nextEntries.some((entry) => entry.id === spec.id)) {
        nextEntries.push({
          id: spec.id,
          fingerprint: spec.fingerprint,
          type: spec.type,
          atEpochMs: spec.atEpochMs
        })
      }
    }
    writeTeacherLedger(accountId, semester, {
      scope,
      updatedAt: new Date().toISOString(),
      entries: nextEntries
    })
    writeTeacherReminderSnapshot(accountId, semester, expected)

    let pendingQueried = false
    try {
      await platform.pending()
      pendingQueried = true
    } catch {
      // pending 查询失败不阻塞
    }

    return {
      success: errors.length === 0,
      reason: input.reason,
      expected: expected.length,
      scheduled: scheduledIds.length,
      canceled: canceledIds.length,
      kept: diff.toKeep.length,
      failed: failedIds.length,
      errors,
      windowDays,
      windowStart: new Date(window.startEpochMs).toISOString(),
      windowEnd: new Date(window.endEpochMs).toISOString(),
      ledgerCount: nextEntries.length,
      pendingQueried
    }
  })()

  teacherInflight.set(scope, task)
  try {
    return await task
  } finally {
    teacherInflight.delete(scope)
  }
}
