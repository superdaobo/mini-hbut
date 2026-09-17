/**
 * 个人日程提醒计划（#839，Epic #833）
 *
 * 职责：把「个人日程」（personal_events，#835）转换成提醒规格 ReminderSpec，
 * 由 local_reminder_scheduler 的唯一调度管线（reconcileLocalReminders）统一登记。
 *
 * 关键约束：
 * 1. 单一管线：本模块只做纯计算，不调度、不落台账。日程提醒与课程/考试提醒
 *    并入同一份 expected 列表，共用同一个 diffReminders 与同一份 ledger，
 *    避免各自 cap 到 MAX_PENDING_REMINDERS 造成系统侧 pending 总量超限。
 * 2. 稳定标识：reminder id 由 event id 稳定派生（buildReminderKey + deriveReminderId），
 *    标题/开始时间变化不改变 id（指纹变化由 diff 识别为「旧取消 + 新创建」）。
 *    标题绝不能作为唯一识别——标题可改。
 * 3. 不补发历史：触发时刻 <= now 一律不产出；日程已开始（哪怕尚未结束）同样不产出。
 * 4. 隐私：note 既不参与计算也不进入通知正文/日志，本模块完全不读取 note 字段。
 *
 * 平台事实（见 src-tauri/src/transport/tauri/notification.rs）：
 * Windows 桌面端预调度被明确拒绝（不支持 Schedule::At）；iOS 端预调度因 9 位小数
 * ISO 序列化与 DateFormatter 不兼容而已知失效；Android 端依赖 Jackson 回退解析。
 * 本模块只产出计划，调度失败/权限未授权由 reconcile 与平台层降级处理，
 * 日程 CRUD 结果绝不受提醒失败影响。
 */
import {
  REMINDER_WINDOW_DAYS,
  computeFingerprint,
  deriveReminderId,
  type ReminderSpec
} from './local_reminder_scheduler'
import { toDayKey, toSafeText } from './notify_center_util.js'

/**
 * V1 允许的提醒档位（与 #836 表单一致）；null 表示不提醒。
 * 供表单侧与本模块的档位校验/测试使用。
 */
export const PERSONAL_REMINDER_LEAD_MINUTES: Array<number | null> = [null, 0, 5, 10, 30, 60]

/** 提醒点击后进入的视图（个人日程属于日程域） */
const PERSONAL_REMINDER_TARGET_VIEW = 'schedule'

/** 个人日程提醒输入：字段名对齐 #835 后端 payload；note 刻意不在此列（隐私） */
export interface PersonalReminderEvent {
  id: string
  title: string
  /** 本地日历日期 YYYY-MM-DD */
  date: string
  /** HH:mm */
  startTime: string
  /** HH:mm；V1 不允许跨日，可选（缺失时不做 end<=start 校验） */
  endTime?: string
  location?: string
  /** 提前提醒分钟数；null = 不提醒 */
  reminderMinutes: number | null
}

export interface PersonalReminderPlanOptions {
  studentId: string
  /** 当前时刻（epoch 毫秒）；由调用方注入，保证与 reconcile 共用同一个 now */
  nowMs: number
  /** 滚动窗口天数；缺省取 REMINDER_WINDOW_DAYS（7~14 天产品窗口） */
  windowDays?: number
}

/** 严格解析 HH:mm → 当日分钟数；非法（格式/范围）返回 null */
const parseClockMinutes = (value: unknown): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(toSafeText(value))
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/** 分钟数 → 补零 HH:mm（用于通知正文） */
const formatClock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/**
 * 严格解析本地日历日期 YYYY-MM-DD → 本地零点 Date；非法（含 2026-02-30 这类不存在的日期）返回 null。
 * 刻意不用 `new Date('YYYY-MM-DD')`：该写法按 UTC 午夜解析，在负时区会整体偏移一天。
 */
const parseLocalDay = (value: unknown): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toSafeText(value))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  // 回读校验：Date 会把 02-30 静默滚动成 03-02，必须与原始输入比对
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

interface ResolvedPersonalTrigger {
  /** 触发时刻（epoch 毫秒） */
  atEpochMs: number
  /** 规范化后的开始时刻 HH:mm（通知正文使用） */
  clock: string
}

/**
 * 解析单条日程的提醒触发时刻；无效 / 不提醒 / 已过期 → null。
 * 内部实现（比导出版本多返回 clock），供 buildPersonalReminderPlan 复用同一套校验。
 */
const resolvePersonalTrigger = (
  event: PersonalReminderEvent,
  nowMs: number
): ResolvedPersonalTrigger | null => {
  if (!event || typeof event !== 'object') return null
  if (!Number.isFinite(nowMs)) return null

  // 无 event id 无法派生稳定标识；无标题的提醒没有意义
  const eventId = toSafeText(event.id)
  const title = toSafeText(event.title)
  if (!eventId || !title) return null

  // null = 用户明确不提醒；档位外的非负数值仍按公式调度（后端契约只要求 >= 0，
  // 静默忽略用户显式设置的值是更糟的失败模式）。非数值一律拒绝，不做隐式强转。
  const rawLead = event.reminderMinutes
  if (typeof rawLead !== 'number' || !Number.isFinite(rawLead) || rawLead < 0) return null
  const leadMinutes = rawLead

  const day = parseLocalDay(event.date)
  if (!day) return null
  const startMinutes = parseClockMinutes(event.startTime)
  if (startMinutes === null) return null

  // V1 不允许跨日：结束时间非法或 end <= start 视为脏数据，安全跳过
  const endText = toSafeText(event.endTime)
  if (endText) {
    const endMinutes = parseClockMinutes(endText)
    if (endMinutes === null || endMinutes <= startMinutes) return null
  }

  const atEpochMs = day.getTime() + startMinutes * 60000 - Math.floor(leadMinutes) * 60000
  // 不补发：触发时刻已过去（含 lead=0 且日程已开始）一律不调度
  if (atEpochMs <= nowMs) return null
  return { atEpochMs, clock: formatClock(startMinutes) }
}

/**
 * 单条日程的提醒触发时间（本地时区）；无效 / 已过期 / 不提醒 → null。
 * 触发时间 = 日程开始时刻 − reminderMinutes。
 */
export const resolvePersonalReminderTrigger = (
  event: {
    id: string
    title: string
    date: string
    startTime: string
    reminderMinutes: number | null
    endTime?: string
  },
  nowMs: number
): { atEpochMs: number } | null => {
  const resolved = resolvePersonalTrigger(event, nowMs)
  return resolved ? { atEpochMs: resolved.atEpochMs } : null
}

/** 窗口天数归一：非法/非正 → REMINDER_WINDOW_DAYS；不做上限截断（窗口由调用方决定） */
const normalizeWindowDays = (days: unknown): number => {
  const value = Number(days)
  if (!Number.isFinite(value) || value <= 0) return REMINDER_WINDOW_DAYS
  return Math.floor(value)
}

/**
 * 把日程列表转成提醒规格（纯函数，可测）；已过期 / 窗口外 / 不提醒的日程不产出。
 * 通知内容：标题 = 日程标题；正文 = `HH:mm 标题[ · 地点]`（note 绝不进入正文）。
 */
export const buildPersonalReminderPlan = (
  events: PersonalReminderEvent[],
  options: PersonalReminderPlanOptions
): ReminderSpec[] => {
  const studentId = toSafeText(options?.studentId)
  const nowMs = Number(options?.nowMs)
  if (!studentId || !Number.isFinite(nowMs)) return []

  const windowEndMs = nowMs + normalizeWindowDays(options?.windowDays) * 86400000
  const list = Array.isArray(events) ? events : []
  const specs: ReminderSpec[] = []

  for (const event of list) {
    const resolved = resolvePersonalTrigger(event, nowMs)
    if (!resolved) continue
    // 窗口过滤：超出滚动窗口不登记，避免无边界占用系统 pending 配额
    if (resolved.atEpochMs > windowEndMs) continue

    const eventId = toSafeText(event.id)
    const title = toSafeText(event.title)
    const leadMinutes = Math.floor(Number(event.reminderMinutes))
    // event id 作为身份位、日期作为 occurrence：标题/开始时间变化不改 id，
    // 改日期视为不同 occurrence（旧提醒取消 + 新提醒创建）
    const id = deriveReminderId({
      studentId,
      type: 'personal',
      // 个人日程不属于任何学期；semester 位留空以保持 key 结构一致
      semester: '',
      courseIdentity: eventId,
      occurrence: toDayKey(parseLocalDay(event.date)),
      leadMinutes
    })

    const location = toSafeText(event.location)
    const body = `${resolved.clock} ${title}${location ? ` · ${location}` : ''}`
    specs.push({
      id,
      type: 'personal',
      studentId,
      semester: '',
      title,
      body,
      atEpochMs: resolved.atEpochMs,
      atEpochSecs: Math.floor(resolved.atEpochMs / 1000),
      targetView: PERSONAL_REMINDER_TARGET_VIEW,
      fingerprint: computeFingerprint({
        title,
        body,
        atEpochMs: resolved.atEpochMs,
        targetView: PERSONAL_REMINDER_TARGET_VIEW
      })
    })
  }
  return specs.sort((a, b) => a.atEpochMs - b.atEpochMs)
}
