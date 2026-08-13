/**
 * 本地提醒调度领域（#610）
 *
 * 职责：把课程/考试这类"已知时间事件"登记为系统 Scheduled Local Notification。
 * 业务模块只负责触发 reconcile，不直接管理平台调度细节。
 *
 * 核心语义：
 * 1. 稳定 Reminder ID：由 student/type/semester/course identity/occurrence/lead 派生，
 *    禁止 Date.now()；相同业务输入重复计算必须得到相同 ID。
 * 2. 7~14 天有限滚动窗口：不一次登记无边界全学期提醒。
 * 3. reconcile（diff）：新计划与本地台账对比 → 补建缺失 / 取消过期、被删除、设置关闭的提醒；
 *    旧提醒只在"台账里存在且预期中消失"时取消（namespace 隔离，不误删其他用途通知）。
 * 4. 切账号：scope 切换时先取消旧账号全部提醒再登记新账号。
 *
 * 平台能力通过 LocalReminderPlatform 接口注入（默认 Tauri 实现，见
 * src/platform/adapters/tauri.ts 的 scheduled 分支）；#609 契约落地后可平滑并入
 * PlatformBridge，本模块接口保持不变。
 */
import {
  CLASS_PERIOD_TIME_MAP,
  NotifySettingsFull,
  getCourseMergeSignature,
  getCoursePeriodRange,
  getNotifySettings,
  getSchedulePayloadForReminder,
  normalizeWeeks,
  parseDay,
  readJSON,
  toDayKey,
  toMinutes,
  toPositiveInt,
  toSafeText,
  writeJSON
} from './notify_center_util.js'

/** 默认滚动窗口天数（产品验收窗口 7~14 天，取 14 天兼顾两端课程量） */
export const REMINDER_WINDOW_DAYS = 14
export const MIN_REMINDER_WINDOW_DAYS = 7
export const MAX_REMINDER_WINDOW_DAYS = 14

/** 考试提醒默认提前天数（第一版不做复杂设置） */
export const EXAM_REMINDER_LEAD_DAYS = 1

/** 单账号最多登记的 pending 提醒数（iOS 系统上限 64，留余量） */
export const MAX_PENDING_REMINDERS = 50

/** 提醒类型 */
export type ReminderType = 'class' | 'exam'

export interface ReminderSpec {
  id: number
  type: ReminderType
  studentId: string
  semester: string
  title: string
  body: string
  /** 触发时刻（epoch 毫秒，绝对时间） */
  atEpochMs: number
  /** 触发时刻（epoch 秒，传给 Rust 命令） */
  atEpochSecs: number
  /** 点击通知进入的 target view */
  targetView: string
  /** 内容指纹：时间/文案/目标页任一变化都会产生新指纹，diff 据此识别"旧取消+新创建" */
  fingerprint: string
}

/** 稳定业务键：相同业务提醒重复计算必须得到相同 ID */
export interface StableReminderKey {
  studentId: string
  type: ReminderType
  semester: string
  /** 课程/考试身份（课程 signature 或 课程名|日期|时间） */
  courseIdentity: string
  /** occurrence 日期（YYYY-MM-DD），区分同一课程不同天/不同场次 */
  occurrence: string
  /** 提前量（分钟），纳入 ID：提前量变化 → 旧提醒取消 + 新提醒创建 */
  leadMinutes: number
}

/** 平台调度能力（最小接口，便于单测注入与 #609 契约对接） */
export interface LocalReminderPlatform {
  schedule(input: { id: number; title: string; body: string; atEpochSecs: number; channelId?: string; targetView?: string }): Promise<boolean>
  pending(): Promise<Array<{ id: number; title?: string | null; body?: string | null; atEpochSecs?: number | null }>>
  cancel(ids: number[]): Promise<boolean>
  permission(): Promise<string>
}

export interface ReminderWindow {
  startEpochMs: number
  endEpochMs: number
  startKey: string
  endKey: string
}

export interface LedgerEntry {
  id: number
  fingerprint: string
  type: ReminderType
  atEpochMs: number
}

export interface LedgerState {
  scope: string
  updatedAt: string
  entries: LedgerEntry[]
}

// ============ 稳定 ID 与窗口（纯逻辑） ============

const stableHash31 = (text: string): number => {
  // 31 位正整数 hash，保证落在 i32 范围内且为正
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return (hash & 0x7fffffff) || 1
}

/** 由稳定业务键派生稳定 raw key（与 #609 ScheduledReminderInput.reminderKey 同构，可互相换算） */
export const buildReminderKey = (key: StableReminderKey): string => {
  return [
    'mini-hbut',
    'r1',
    toSafeText(key.studentId),
    key.type,
    toSafeText(key.semester),
    toSafeText(key.courseIdentity),
    toSafeText(key.occurrence),
    String(Math.max(0, Math.floor(Number(key.leadMinutes) || 0)))
  ].join('|')
}

/** 由稳定业务键派生 Reminder ID（禁止 Date.now() 参与）；id = stableHash31(reminderKey) */
export const deriveReminderId = (key: StableReminderKey): number => {
  return stableHash31(buildReminderKey(key))
}

const clampWindowDays = (days: number): number => {
  if (!Number.isFinite(days)) return REMINDER_WINDOW_DAYS
  return Math.min(MAX_REMINDER_WINDOW_DAYS, Math.max(MIN_REMINDER_WINDOW_DAYS, Math.floor(days)))
}

/** 计算滚动窗口：[now, now + windowDays]，窗口起点不含已过去时刻 */
export const computeReminderWindow = (now: Date, windowDays = REMINDER_WINDOW_DAYS): ReminderWindow => {
  const days = clampWindowDays(windowDays)
  const start = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
  return {
    startEpochMs: start.getTime(),
    endEpochMs: end.getTime(),
    startKey: toDayKey(start),
    endKey: toDayKey(end)
  }
}

/** 计算内容指纹：时间/文案/目标页变化都会改变指纹 */
export const computeFingerprint = (spec: Pick<ReminderSpec, 'title' | 'body' | 'atEpochMs' | 'targetView'>): string =>
  `${spec.title}|${spec.body}|${spec.atEpochMs}|${spec.targetView}`

// ============ 课程计划（纯逻辑） ============

export interface CoursePlanInput {
  studentId: string
  semester: string
  /** 课表课程（含 is_custom 标记的自定义课程），不传则读缓存 */
  courses?: Array<Record<string, unknown>>
  /** 学期开始日期 YYYY-MM-DD（一般落在周一），用于周次→日期推算 */
  startDate?: string
  currentWeek?: number
  leadMinutes?: number
  now?: Date
  window?: ReminderWindow
}

export interface MergedDayCourse extends Record<string, unknown> {
  startPeriod: number
  endPeriod: number
  signature: string
  name: string
  teacher: string
  room: string
  startClock: string
  startMinutes: number
}

/**
 * 按"周 + 星期"合并一天内的课程（与 getMergedTodayClasses 语义一致）：
 * 同一课程身份（多教师同课）且相邻节次 → 合并为一条提醒；普通课程保留原节次。
 */
export const mergeCoursesForDay = (
  courses: unknown,
  week: number,
  weekday: number
): MergedDayCourse[] => {
  const normalized = (Array.isArray(courses) ? courses : [])
    .filter((course) => {
      const raw = course && typeof course === 'object' ? (course as Record<string, unknown>) : {}
      return toPositiveInt(raw.weekday, 0) === weekday
    })
    .filter((course) => {
      const raw = course && typeof course === 'object' ? (course as Record<string, unknown>) : {}
      const weeks = normalizeWeeks(raw.weeks)
      return weeks.length === 0 || weeks.includes(week)
    })
    .map((course) => {
      const raw = course && typeof course === 'object' ? (course as Record<string, unknown>) : {}
      const range = getCoursePeriodRange(raw)
      if (!range) return null
      return {
        ...raw,
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
        signature: getCourseMergeSignature(raw),
        room: toSafeText(raw?.room_code || raw?.room || '待定教室'),
        teacher: toSafeText(raw?.teacher || ''),
        name: toSafeText(raw?.name || '未命名课程')
      } as MergedDayCourse
    })
    .filter((course): course is MergedDayCourse => course !== null)

  const signatureCount = new Map<string, number>()
  normalized.forEach((course) => {
    signatureCount.set(course.signature, (signatureCount.get(course.signature) || 0) + 1)
  })

  const sorted = normalized
    .map((course) => {
      const rawSpan = Math.max(1, course.endPeriod - course.startPeriod + 1)
      const duplicateCount = Number(signatureCount.get(course.signature) || 0)
      const unitSpan = course.is_custom ? rawSpan : (duplicateCount > 1 ? 1 : rawSpan)
      const endPeriod = Math.min(11, course.startPeriod + unitSpan - 1)
      return { ...course, rawSpan, unitSpan, endPeriod }
    })
    .sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod)

  const merged: MergedDayCourse[] = []
  let i = 0
  while (i < sorted.length) {
    const current = sorted[i]
    const mergedItem: MergedDayCourse = { ...current }
    let j = i + 1
    while (j < sorted.length) {
      const next = sorted[j]
      if (
        mergedItem.unitSpan === 1 &&
        next.unitSpan === 1 &&
        next.signature === mergedItem.signature &&
        next.startPeriod === mergedItem.endPeriod + 1
      ) {
        mergedItem.endPeriod = next.endPeriod
        j += 1
      } else {
        break
      }
    }
    const slot = CLASS_PERIOD_TIME_MAP[mergedItem.startPeriod]
    const startClock = slot?.start || '--:--'
    mergedItem.startClock = startClock
    mergedItem.startMinutes = Number.isFinite(toMinutes(startClock)) ? toMinutes(startClock) : 0
    merged.push(mergedItem)
    i = j
  }
  return merged
}

/** 构建窗口内课程提醒计划（仅未来 occurrence，不对已开始课程补发历史提醒） */
export const buildClassReminderPlan = (input: CoursePlanInput): ReminderSpec[] => {
  const now = input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date()
  const window = input.window || computeReminderWindow(now)
  const leadMinutes = Math.min(120, Math.max(5, Number(input.leadMinutes ?? 30) || 30))
  const courses = Array.isArray(input.courses) ? input.courses : []
  if (courses.length === 0) return []

  const currentWeek = Math.max(1, toPositiveInt(input.currentWeek, 0) || 1)
  const specs: ReminderSpec[] = []

  // 枚举窗口内每一天：(week, weekday, dateKey)
  const dayCount = Math.ceil((window.endEpochMs - window.startEpochMs) / 86400000)
  const todayWeekday = now.getDay() === 0 ? 7 : now.getDay()
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const dayStart = new Date(window.startEpochMs + dayIndex * 86400000)
    dayStart.setHours(0, 0, 0, 0)
    // 当前日期属于第几周：优先用学期开始日期推算
    let week = currentWeek
    if (input.startDate) {
      const base = parseDay(input.startDate)
      if (base) {
        const diffDays = Math.floor((dayStart.getTime() - base.getTime()) / 86400000)
        week = Math.max(1, Math.floor(diffDays / 7) + 1)
      }
    } else {
      // 回退：以当前周为锚
      const anchor = new Date(now.getTime() - (todayWeekday - 1) * 86400000)
      anchor.setHours(0, 0, 0, 0)
      week = Math.max(1, currentWeek + Math.floor((dayStart.getTime() - anchor.getTime()) / (7 * 86400000)))
    }
    const weekday = dayStart.getDay() === 0 ? 7 : dayStart.getDay()

    const merged = mergeCoursesForDay(courses, week, weekday)
    for (const course of merged) {
      const dateKey = toDayKey(dayStart)
      const at = new Date(dayStart.getTime() + course.startMinutes * 60000 - leadMinutes * 60000)
      // 只计划未来提醒；窗口边界过滤
      if (at.getTime() <= now.getTime() || at.getTime() > window.endEpochMs) continue

      const identity = `${course.signature}|${course.startPeriod}|${course.endPeriod}`
      const id = deriveReminderId({
        studentId: input.studentId,
        type: 'class',
        semester: input.semester,
        courseIdentity: identity,
        occurrence: dateKey,
        leadMinutes
      })
      const teacherText = course.teacher ? `，授课教师 ${course.teacher}` : ''
      const title = '上课提醒'
      const body = `将于 ${course.startClock} 开始：${course.name}（${course.room}${teacherText}）`
      specs.push({
        id,
        type: 'class',
        studentId: input.studentId,
        semester: input.semester,
        title,
        body,
        atEpochMs: at.getTime(),
        atEpochSecs: Math.floor(at.getTime() / 1000),
        targetView: 'schedule',
        fingerprint: computeFingerprint({ title, body, atEpochMs: at.getTime(), targetView: 'schedule' })
      })
    }
  }
  return specs.sort((a, b) => a.atEpochMs - b.atEpochMs)
}

// ============ 考试计划（纯逻辑） ============

export interface ExamPlanInput {
  studentId: string
  semester: string
  /** 考试原始记录（含 exam_date/exam_time/course_name 等） */
  exams?: Array<Record<string, unknown>>
  leadDays?: number
  now?: Date
  window?: ReminderWindow
}

/** 构建窗口内考试提醒计划：提醒时刻 = 考试开始时刻 - leadDays；无明确时间时默认 09:00 */
export const buildExamReminderPlan = (input: ExamPlanInput): ReminderSpec[] => {
  const now = input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date()
  const window = input.window || computeReminderWindow(now)
  const leadDays = Math.max(0, Math.floor(Number(input.leadDays ?? EXAM_REMINDER_LEAD_DAYS) || EXAM_REMINDER_LEAD_DAYS))
  const exams = Array.isArray(input.exams) ? input.exams : []
  if (exams.length === 0) return []

  const specs: ReminderSpec[] = []
  for (const raw of exams) {
    const exam = raw && typeof raw === 'object' ? raw : {}
    const date = parseDay(exam.exam_date || exam.date)
    if (!date) continue // 无明确日期无法生成确定性提醒
    const courseName = toSafeText(exam.course_name) || '未命名考试'
    const timeText = toSafeText(exam.exam_time || exam.start_time)
    const clock = timeText.split('-')[0].trim() || '09:00' // 无时间默认 09:00
    const [h, m] = clock.split(':').map((item) => Number(item))
    const startAt = new Date(date.getTime())
    startAt.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0)
    const at = new Date(startAt.getTime() - leadDays * 86400000)
    if (at.getTime() <= now.getTime() || at.getTime() > window.endEpochMs) continue

    const dateKey = toDayKey(date)
    const identity = `${courseName}|${dateKey}|${timeText}`
    const id = deriveReminderId({
      studentId: input.studentId,
      type: 'exam',
      semester: input.semester,
      courseIdentity: identity,
      occurrence: dateKey,
      leadMinutes: leadDays * 24 * 60
    })
    const title = '考试提醒'
    const body = leadDays > 0
      ? `${courseName} 将于 ${leadDays} 天后（${dateKey}${timeText ? ` ${timeText}` : ''}）进行，请提前做好准备。`
      : `${courseName} 将于 ${dateKey}${timeText ? ` ${timeText}` : ''} 进行，请提前做好准备。`
    specs.push({
      id,
      type: 'exam',
      studentId: input.studentId,
      semester: input.semester,
      title,
      body,
      atEpochMs: at.getTime(),
      atEpochSecs: Math.floor(at.getTime() / 1000),
      targetView: 'exams',
      fingerprint: computeFingerprint({ title, body, atEpochMs: at.getTime(), targetView: 'exams' })
    })
  }
  return specs.sort((a, b) => a.atEpochMs - b.atEpochMs)
}

// ============ 台账与 diff（纯逻辑） ============

export const ledgerKeyFor = (studentId: string): string => `hbu_local_reminder_ledger:${toSafeText(studentId)}`
const ACTIVE_SCOPE_KEY = 'hbu_local_reminder_active_scope'

export const readLedger = (studentId: string): LedgerState => {
  const sid = toSafeText(studentId)
  const state = readJSON<LedgerState>(ledgerKeyFor(sid), null)
  return {
    scope: state?.scope || sid,
    updatedAt: state?.updatedAt || '',
    entries: Array.isArray(state?.entries) ? state.entries : []
  }
}

export const writeLedger = (studentId: string, state: LedgerState): void => {
  writeJSON(ledgerKeyFor(studentId), state)
}

export const clearLedger = (studentId: string): void => {
  try {
    localStorage.removeItem(ledgerKeyFor(toSafeText(studentId)))
  } catch {
    // ignore
  }
}

export const readActiveScope = (): string => {
  try {
    return toSafeText(localStorage.getItem(ACTIVE_SCOPE_KEY))
  } catch {
    return ''
  }
}

export const writeActiveScope = (studentId: string): void => {
  try {
    localStorage.setItem(ACTIVE_SCOPE_KEY, toSafeText(studentId))
  } catch {
    // ignore
  }
}

export const clearActiveScope = (): void => {
  try {
    localStorage.removeItem(ACTIVE_SCOPE_KEY)
  } catch {
    // ignore
  }
}

export interface ReminderDiff {
  /** 需要新建/更新的提醒（稳定 id 保证系统侧幂等替换，不重复创建） */
  toSchedule: ReminderSpec[]
  /** 需要取消的 id（台账中有但预期中消失，且只限本 scope 台账） */
  toCancel: number[]
  /** 内容完全一致的提醒（无需任何系统调用） */
  toKeep: number[]
}

/** 预期 set 与台账 diff；指纹变化（时间/课程/提前量变化）识别为"旧取消 + 新创建" */
export const diffReminders = (expected: ReminderSpec[], ledger: LedgerState): ReminderDiff => {
  const ledgerById = new Map<number, LedgerEntry>()
  ledger.entries.forEach((entry) => ledgerById.set(entry.id, entry))
  const expectedIds = new Set<number>()

  const toSchedule: ReminderSpec[] = []
  const toKeep: number[] = []
  for (const spec of expected) {
    expectedIds.add(spec.id)
    const old = ledgerById.get(spec.id)
    if (!old || old.fingerprint !== spec.fingerprint) {
      toSchedule.push(spec)
    } else {
      toKeep.push(spec.id)
    }
  }
  const toCancel = ledger.entries
    .filter((entry) => !expectedIds.has(entry.id))
    .map((entry) => entry.id)
  return { toSchedule, toCancel, toKeep }
}

/** 窗口内预期提醒总数超限时按触发时间升序截断（保留最近的），返回截断结果 */
export const applyReminderCap = (specs: ReminderSpec[], cap = MAX_PENDING_REMINDERS): ReminderSpec[] => {
  if (specs.length <= cap) return specs.slice()
  return specs
    .slice()
    .sort((a, b) => a.atEpochMs - b.atEpochMs)
    .slice(0, cap)
}

// ============ 平台注入 ============

let injectedPlatform: LocalReminderPlatform | null = null

/** 测试注入专用：替换平台实现后，reconcile 走 fake 平台 */
export const setLocalReminderPlatform = (platform: LocalReminderPlatform | null): void => {
  injectedPlatform = platform
}

const getPlatform = (): LocalReminderPlatform => {
  if (injectedPlatform) return injectedPlatform
  return {
    async schedule(input) {
      const mod = await import('../platform/adapters/tauri')
      return mod.scheduleLocalNotification(input)
    },
    async pending() {
      const mod = await import('../platform/adapters/tauri')
      return mod.getPendingLocalNotifications()
    },
    async cancel(ids) {
      const mod = await import('../platform/adapters/tauri')
      return mod.cancelLocalNotifications(ids)
    },
    async permission() {
      const mod = await import('../platform')
      return mod.platformBridge.getNotificationPermission()
    }
  }
}

const isSupportedRuntime = async (): Promise<boolean> => {
  try {
    const native = await import('../platform/native')
    return native.isTauriRuntime()
  } catch {
    return false
  }
}

// ============ reconcile 编排 ============

export interface ReconcileInput {
  studentId: string
  /** 显式传入最新数据时优先使用（如 sync_schedule/fetch_exams 成功现场），否则读缓存 */
  courses?: Array<Record<string, unknown>> | null
  scheduleMeta?: Record<string, unknown> | null
  exams?: Array<Record<string, unknown>> | null
  settings?: NotifySettingsFull
  semesterHint?: string
  now?: Date
  windowDays?: number
  reason?: string
  skipPermissionCheck?: boolean
  platform?: LocalReminderPlatform
}

export interface ReconcileResult {
  success: boolean
  reason?: string
  skipped?: string
  expected: number
  scheduled: number
  canceled: number
  kept: number
  failed: number
  errors: string[]
  windowDays: number
  windowStart?: string
  windowEnd?: string
  ledgerCount: number
  pendingQueried: boolean
}

/** 模块级并发锁：同一账号的 reconcile 串行执行，避免重复系统调用 */
const inflight = new Map<string, Promise<ReconcileResult>>()

export const reconcileLocalReminders = async (input: ReconcileInput): Promise<ReconcileResult> => {
  const sid = toSafeText(input.studentId)
  if (!sid) {
    return { success: false, reason: input.reason, skipped: 'missing-student-id', expected: 0, scheduled: 0, canceled: 0, kept: 0, failed: 0, errors: [], windowDays: REMINDER_WINDOW_DAYS, ledgerCount: 0, pendingQueried: false }
  }
  const running = inflight.get(sid)
  if (running) return running

  const task = (async (): Promise<ReconcileResult> => {
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

    // 仅 Tauri 运行时支持系统预调度；Web/Capacitor 明确跳过
    if (!(await isSupportedRuntime())) {
      return fail('unsupported-runtime')
    }

    const platform = input.platform || getPlatform()

    // 权限未授权：不崩溃、不动台账，授权后可重新补建
    if (!input.skipPermissionCheck) {
      let permission = 'denied'
      try {
        permission = await platform.permission()
      } catch {
        permission = 'denied'
      }
      if (permission !== 'granted') return fail('permission-denied')
    }

    // scope 切换：先取消旧账号全部提醒并清旧台账，旧账号计划不得污染新账号
    const activeScope = readActiveScope()
    if (activeScope && activeScope !== sid) {
      const cancelResult = await cancelLocalRemindersForScope(activeScope, platform)
      if (!cancelResult.success) {
        errors.push(`取消旧账号(${activeScope})提醒失败`)
      }
    }
    writeActiveScope(sid)

    const now = input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date()
    const window = computeReminderWindow(now, input.windowDays)
    const settings = input.settings || getNotifySettings()

    // —— 数据源：显式传入优先，否则读缓存 ——
    let courses: Array<Record<string, unknown>> = []
    let semester = toSafeText(input.semesterHint)
    let startDate = ''
    let currentWeek = 1

    if (Array.isArray(input.courses)) {
      courses = input.courses
      semester = toSafeText(input.scheduleMeta?.semester || input.semesterHint || semester)
      startDate = toSafeText(input.scheduleMeta?.start_date || input.scheduleMeta?.startDate)
      currentWeek = toPositiveInt(input.scheduleMeta?.current_week, 0) || 1
    } else {
      const payload = getSchedulePayloadForReminder(sid, input.semesterHint)
      if (payload?.data && Array.isArray(payload.data)) {
        courses = payload.data as Array<Record<string, unknown>>
      }
      const meta = payload?.meta || input.scheduleMeta
      semester = toSafeText(meta?.semester || input.semesterHint || semester)
      startDate = toSafeText(meta?.start_date || meta?.startDate)
      currentWeek = toPositiveInt(meta?.current_week, 0) || 1
    }

    // 自定义课程：与正常课表同一调度规则（本地 DB 读取，失败不阻塞）
    try {
      const native = await import('../platform/native')
      if (native.isTauriRuntime()) {
        const customRes = await native.invokeNative('list_custom_schedule_courses', {
          studentId: sid,
          semester
        })
        const customData = customRes && typeof customRes === 'object'
          ? (customRes as Record<string, unknown>)
          : {}
        if (customData.success !== false && Array.isArray(customData.data)) {
          courses = [
            ...courses,
            ...(customData.data as Array<Record<string, unknown>>).map((item) => ({
              ...item,
              is_custom: true
            }))
          ]
        }
      }
    } catch {
      // 自定义课程拉取失败不阻塞主流程
    }

    // 考试：显式传入优先，否则读缓存
    let exams: Array<Record<string, unknown>> = []
    if (Array.isArray(input.exams)) {
      exams = input.exams
    } else {
      try {
        const cachedRaw = await import('./api.js').then((api) =>
          api.getCachedData(`exams:${sid}:current`, 3 * 24 * 60 * 60 * 1000)
        )
        const cached = cachedRaw as unknown as { data?: { data?: unknown } } | null
        if (cached?.data && Array.isArray(cached.data.data)) {
          exams = cached.data.data as Array<Record<string, unknown>>
        }
      } catch {
        // 读缓存失败忽略
      }
    }

    // —— 构建预期 set ——
    let expected: ReminderSpec[] = []
    if (settings.enableClassReminder) {
      expected = expected.concat(
        buildClassReminderPlan({
          studentId: sid,
          semester,
          courses,
          startDate,
          currentWeek,
          leadMinutes: settings.classLeadMinutes,
          now,
          window
        })
      )
    }
    if (settings.enableExamReminder) {
      expected = expected.concat(
        buildExamReminderPlan({
          studentId: sid,
          semester,
          exams,
          now,
          window
        })
      )
    }
    expected = applyReminderCap(expected)

    // —— diff 与执行 ——
    const ledger = readLedger(sid)
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
        if (ok) {
          scheduledIds.push(spec.id)
        } else {
          failedIds.push(spec.id)
          errors.push(`登记提醒失败 id=${spec.id}`)
        }
      } catch {
        failedIds.push(spec.id)
        errors.push(`登记提醒异常 id=${spec.id}`)
      }
    }

    let canceledIds: number[] = []
    if (diff.toCancel.length > 0) {
      try {
        const ok = await platform.cancel(diff.toCancel)
        if (ok) canceledIds = diff.toCancel
        else errors.push(`取消提醒失败 ids=${diff.toCancel.join(',')}`)
      } catch {
        errors.push(`取消提醒异常 ids=${diff.toCancel.join(',')}`)
      }
    }

    // —— 更新台账：成功登记/保持的写入，取消成功的移除 ——
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
            ? { id: spec.id, fingerprint: spec.fingerprint, type: spec.type, atEpochMs: spec.atEpochMs }
            : entry
        )
      }
    }
    // 新增成功登记的提醒
    for (const spec of expected) {
      if (scheduledIds.includes(spec.id) && !nextEntries.some((entry) => entry.id === spec.id)) {
        nextEntries.push({ id: spec.id, fingerprint: spec.fingerprint, type: spec.type, atEpochMs: spec.atEpochMs })
      }
    }
    writeLedger(sid, { scope: sid, updatedAt: new Date().toISOString(), entries: nextEntries })

    // —— 观测：查询系统 pending（失败不影响主流程） ——
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
      windowDays: Math.round((window.endEpochMs - window.startEpochMs) / 86400000),
      windowStart: new Date(window.startEpochMs).toISOString(),
      windowEnd: new Date(window.endEpochMs).toISOString(),
      ledgerCount: nextEntries.length,
      pendingQueried
    }
  })()

  inflight.set(sid, task)
  try {
    return await task
  } finally {
    inflight.delete(sid)
  }
}

// ============ 查询与 scope 清理 ============

export interface PendingReminderInfo {
  id: number
  title?: string | null
  body?: string | null
  atEpochSecs?: number | null
}

/** 查询系统当前 pending 提醒（全部应用 pending；调用方按台账筛选自己 namespace） */
export const queryPendingLocalReminders = async (platform?: LocalReminderPlatform): Promise<PendingReminderInfo[]> => {
  try {
    const active = platform || getPlatform()
    const items = await active.pending()
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export interface CancelScopeResult {
  success: boolean
  canceled: number
  studentId: string
}

/**
 * 取消某账号 scope 的全部提醒并清除台账（切账号/手动登出时调用）。
 * 只取消台账里登记过的 id，不误删应用外或其他用途的通知。
 */
export const cancelLocalRemindersForScope = async (
  studentId: string,
  platform?: LocalReminderPlatform
): Promise<CancelScopeResult> => {
  const sid = toSafeText(studentId)
  if (!sid) return { success: true, canceled: 0, studentId: '' }
  const ledger = readLedger(sid)
  const ids = ledger.entries.map((entry) => entry.id)
  if (ids.length === 0) {
    clearLedger(sid)
    return { success: true, canceled: 0, studentId: sid }
  }
  try {
    const active = platform || getPlatform()
    const ok = await active.cancel(ids)
    if (ok) {
      clearLedger(sid)
      return { success: true, canceled: ids.length, studentId: sid }
    }
    return { success: false, canceled: 0, studentId: sid }
  } catch {
    return { success: false, canceled: 0, studentId: sid }
  }
}

/** 手动登出：取消当前账号提醒并清台账与 active scope */
export const clearRemindersForLogout = async (studentId: string): Promise<CancelScopeResult> => {
  const result = await cancelLocalRemindersForScope(studentId)
  const sid = toSafeText(studentId)
  if (readActiveScope() === sid) clearActiveScope()
  return result
}
