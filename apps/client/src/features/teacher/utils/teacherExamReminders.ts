// src/features/teacher/utils/teacherExamReminders.ts
//
// Teacher Portal V2（E6 #1026）：监考安排 → 本地提醒事件规范化。
//
// 职责（只读、纯逻辑）：
//   1. 把「我的监考安排」中**经实测的日期字段**（`ksrq`）规范化为可调度的本地提醒事件；
//   2. 用**教师作用域**（`teacher_scope.ts` 的 `teacher:{accountId}:{semester}`）构造去重键，
//      **严禁复用学生 exam 去重键**，**严禁 `Date.now()` 参与**；
//   3. 提供稳定数字 ID 与调度规格构建器，供 E3（#1023）接入本地提醒调度管线。
//
// 边界（不可违反）：
//   - 本文件**不**修改 `utils/local_reminder_scheduler.ts`（学生提醒管线保持零改动）；
//   - 教师提醒事件**不写回教务**，也不进入学生台账命名空间；
//   - 未实测字段（场次是否含时钟等）**不解析**：提醒时刻固定为「考试日期前一天 09:00」，
//     场次原文仅作为展示标签，绝不臆造时钟。

import { t, tf } from '../../../utils/app_i18n'
import type { Invigilation } from '../types'
import {
  dedupeByStableKey,
  invigilationKey,
  normalizeDate,
  normalizeSemester,
  normalizeTeacherText
} from './normalizeTeacherData'
import { buildTeacherScopedKey, normalizeScopeAccountId } from './teacher_scope'

/** 作用域内业务类别：监考提醒（与学生 `reminders` 命名空间不同域）。 */
export const TEACHER_INVIGILATION_REMINDER_KIND = 'invigilation-reminder'

/** 监考提醒提前天数（默认提前 1 天）。 */
export const TEACHER_INVIGILATION_LEAD_DAYS = 1

/**
 * 默认提醒时刻（当地 09:00）。
 *
 * 教务监考记录实测字段只有 `ksrq`（考试日期）与 `kscc`（考试场次）；
 * `kscc` 的取值域未实测，**不能**当作时钟解析，因此固定用 09:00，避免臆造时间。
 */
export const TEACHER_INVIGILATION_DEFAULT_HOUR = 9

/** 教师提醒类型标记（与学生 `ReminderType` 的 `exam` 明确区分）。 */
export type TeacherReminderType = 'teacher-invigilation'

/**
 * 监考提醒事件（教师域）。
 *
 * 与学生提醒的 `ReminderSpec` 结构刻意不同：用 `scopeKey` 而非 `studentId`，
 * 用 `type: 'teacher-invigilation'` 而非 `exam`，确保两者永不混入同一台账。
 */
export interface TeacherInvigilationReminderEvent {
  /** 教师作用域键 `teacher:{accountId}:{semester}`（与学生域前缀 `student:` 永不相等）。 */
  scopeKey: string
  /** 稳定去重键（教师域，不含 `Date.now()`）。 */
  reminderKey: string
  /** 稳定数字 ID（E3 调度器可直接消费；同一业务输入恒得同一 ID）。 */
  id: number
  /** 类型标记。 */
  type: TeacherReminderType
  /** 教师账号（工号）。 */
  accountId: string
  /** 学期。 */
  semester: string
  /** 监考记录 ID（或稳定退化键）。 */
  invigilationId: string
  /** 课程名称（实测字段 `kcmc`）。 */
  courseName: string
  /** 考试日期 `YYYY-MM-DD`（实测字段 `ksrq`）。 */
  dateKey: string
  /** 场次原文标签（实测字段 `kscc`；仅展示，不解析为时钟）。 */
  sessionLabel: string
  /** 教室名称（实测字段 `jsmc`）。 */
  room: string
  /** 校区名称（实测字段 `xqmc`）。 */
  campus: string
  /** 监考角色（实测字段 `zjk`）。 */
  role: string
  /** 提醒触发时刻（epoch 毫秒）。 */
  atEpochMs: number
  /** 提醒触发时刻（epoch 秒，传给原生调度命令）。 */
  atEpochSecs: number
  /** 点击通知进入的 target view（教师考试与监考）。 */
  targetView: 'teachexams'
}

/** 教师域提醒去重键前缀（用于断言绝不落入学生命名空间）。 */
export const TEACHER_REMINDER_KEY_PREFIX = 'teacher:'

/** 学生提醒键前缀（`local_reminder_scheduler.buildReminderKey` 的固定开头）。 */
const STUDENT_REMINDER_KEY_PREFIX = 'mini-hbut|r1|'

/** 31 位正整数 hash：与 `local_reminder_scheduler.stableHash31` **同算法**，便于 E3 直接消费。 */
const stableHash31 = (text: string): number => {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return (hash & 0x7fffffff) || 1
}

/** 判断键是否属于教师提醒域（教师域前缀且绝不以学生键前缀开头）。 */
export const isTeacherReminderKey = (key: unknown): boolean =>
  typeof key === 'string' &&
  key.startsWith('teacher:') &&
  !key.startsWith(STUDENT_REMINDER_KEY_PREFIX)

/**
 * 构造监考提醒的**稳定去重键**（教师域）。
 *
 * 形如：`teacher:{accountId}:{semester}:invigilation-reminder:{监考稳定键}`。
 * - 前缀来自 `teacher_scope.ts` 的教师作用域，**与学生 exam 键结构不同、永不相等**；
 * - 监考稳定键复用 E0 的 `invigilationKey`（`id` 优先，退化到业务字段组合）；
 * - **不含** `Date.now()` / 随机数，重复拉取恒得同一键。
 */
export const buildTeacherInvigilationReminderKey = (
  accountId: unknown,
  semester: unknown,
  invigilation: Invigilation
): string =>
  `${buildTeacherScopedKey(
    TEACHER_INVIGILATION_REMINDER_KIND,
    accountId,
    semester
  )}:${invigilationKey(invigilation)}`

/** 由稳定去重键派生稳定数字 ID（同一键恒得同一 ID）。 */
export const deriveTeacherInvigilationReminderId = (reminderKey: string): number =>
  stableHash31(reminderKey)

/** 把 `YYYY-MM-DD` 解析为「当地时区当日 hour:00」的 Date；非法返回 null。 */
export const localDateAtHour = (dateKey: string, hour: number): Date | null => {
  const match = String(dateKey || '')
    .trim()
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day, hour, 0, 0, 0)
  // 防御 2026-02-31 这类溢出日期（构造后回滚到 3 月）
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/**
 * 单条监考记录 → 提醒事件。
 *
 * - 日期（`ksrq`）不可解析时返回 `null`（**不生成不确定提醒**，不臆造日期）；
 * - 提醒时刻 = 考试日期前一天 09:00（场次 `kscc` 仅作展示标签，不解析为时钟）；
 * - 地点 / 角色 / 校区 / 课程全部取自**同一条源记录**，绝不跨记录拼接。
 */
export const toTeacherInvigilationReminderEvent = (
  accountId: unknown,
  semester: unknown,
  invigilation: Invigilation
): TeacherInvigilationReminderEvent | null => {
  const dateKey = normalizeDate(invigilation.ksrq)
  if (!dateKey) return null

  const account = normalizeScopeAccountId(accountId)
  const term = normalizeSemester(semester)
  const startAt = localDateAtHour(dateKey, TEACHER_INVIGILATION_DEFAULT_HOUR)
  if (!startAt) return null

  const atEpochMs =
    startAt.getTime() - TEACHER_INVIGILATION_LEAD_DAYS * 24 * 60 * 60 * 1000
  const reminderKey = buildTeacherInvigilationReminderKey(account, term, invigilation)

  return {
    scopeKey: buildTeacherScopedKey('exams', account, term),
    reminderKey,
    id: deriveTeacherInvigilationReminderId(reminderKey),
    type: 'teacher-invigilation',
    accountId: account,
    semester: term,
    invigilationId: invigilationKey(invigilation),
    courseName: normalizeTeacherText(invigilation.kcmc),
    dateKey,
    sessionLabel: normalizeTeacherText(invigilation.kscc),
    room: normalizeTeacherText(invigilation.jsmc),
    campus: normalizeTeacherText(invigilation.xqmc),
    role: normalizeTeacherText(invigilation.zjk),
    atEpochMs,
    atEpochSecs: Math.floor(atEpochMs / 1000),
    targetView: 'teachexams'
  }
}

/** 按稳定去重键去重（保留首次出现顺序）。 */
export const dedupeTeacherInvigilationReminderEvents = (
  events: readonly TeacherInvigilationReminderEvent[]
): TeacherInvigilationReminderEvent[] =>
  dedupeByStableKey(events, (event) => event.reminderKey)

/**
 * 批量构建监考提醒事件（已去重、按触发时刻升序）。
 *
 * **重复拉取幂等**：同一输入恒得同一组 `id` / `reminderKey`，E3 的 diff 不会重复登记。
 */
export const buildTeacherInvigilationReminderEvents = (input: {
  accountId: unknown
  semester: unknown
  invigilations: readonly Invigilation[]
}): TeacherInvigilationReminderEvent[] => {
  const events = (Array.isArray(input.invigilations) ? input.invigilations : [])
    .map((item) => toTeacherInvigilationReminderEvent(input.accountId, input.semester, item))
    .filter((event): event is TeacherInvigilationReminderEvent => event !== null)
  return dedupeTeacherInvigilationReminderEvents(events).sort(
    (a, b) => a.atEpochMs - b.atEpochMs
  )
}

/**
 * 教师提醒调度规格（E3 接线用）。
 *
 * 刻意**不复用**学生 `ReminderSpec`（其 `studentId` 会把教师提醒写进学生台账）：
 * 这里用 `scopeKey` 显式绑定教师作用域，E3 只需按教师域台账 diff 后调用
 * `LocalReminderPlatform.schedule({ id, title, body, atEpochSecs, targetView })`。
 */
export interface TeacherReminderSpec {
  id: number
  scopeKey: string
  type: TeacherReminderType
  title: string
  body: string
  atEpochMs: number
  atEpochSecs: number
  targetView: string
  /** 内容指纹：文案 / 时刻 / 目标页变化都会改变指纹（与学生管线同构，便于 diff）。 */
  fingerprint: string
}

/** 单条事件 → 调度规格（文案走 `teacher.exams.reminder.*` i18n key）。 */
export const toTeacherInvigilationReminderSpec = (
  event: TeacherInvigilationReminderEvent
): TeacherReminderSpec => {
  const title = t('teacher.exams.reminder.title')
  const body = tf('teacher.exams.reminder.body', {
    date: event.dateKey,
    course: event.courseName || t('teacher.exams.reminder.courseFallback'),
    role: event.role || t('teacher.exams.reminder.roleFallback'),
    room: event.room || t('teacher.exams.reminder.roomFallback')
  })
  return {
    id: event.id,
    scopeKey: event.scopeKey,
    type: event.type,
    title,
    body,
    atEpochMs: event.atEpochMs,
    atEpochSecs: event.atEpochSecs,
    targetView: event.targetView,
    fingerprint: `${title}|${body}|${event.atEpochMs}|${event.targetView}`
  }
}

/** 批量构建调度规格（E3 接线入口）。 */
export const buildTeacherInvigilationReminderSpecs = (
  events: readonly TeacherInvigilationReminderEvent[]
): TeacherReminderSpec[] => events.map(toTeacherInvigilationReminderSpec)
