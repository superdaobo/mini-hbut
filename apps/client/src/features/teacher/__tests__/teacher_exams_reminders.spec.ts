// Teacher Portal V2（E6 #1026）：监考 → 本地提醒事件规范化契约测试。
//
// 覆盖（对应验收硬性要求）：
//   1. **教师提醒与学生考试提醒完全隔离**（键结构不同、命名空间不同，永不相等）；
//   2. **重复拉取不重复通知**（稳定去重键 / 稳定 ID，幂等）；
//   3. 日期 / 地点 / 监考身份**不交叉错配**（逐条源记录映射）；
//   4. 未实测时钟字段不解析（提醒时刻 = 考试日期前一天 09:00）；
//   5. 脱敏 fixture 字段映射与跳过策略。
//
// fixture 全部脱敏：无真实工号、姓名、教学班名单、Cookie。

import { describe, expect, it } from 'vitest'

import type { Invigilation } from '../types'
import {
  TEACHER_INVIGILATION_DEFAULT_HOUR,
  TEACHER_INVIGILATION_LEAD_DAYS,
  buildTeacherInvigilationReminderEvents,
  buildTeacherInvigilationReminderKey,
  buildTeacherInvigilationReminderSpecs,
  deriveTeacherInvigilationReminderId,
  isTeacherReminderKey,
  toTeacherInvigilationReminderEvent
} from '../utils/teacherExamReminders'

/** 脱敏监考 fixture（字段取自 recon 05 §1.1 实测字段清单）。 */
const makeInvigilation = (overrides: Partial<Invigilation> = {}): Invigilation => ({
  id: 'inv-1',
  xnxq: '2026-2027-1',
  xqmc: '本部',
  zjk: '主监考',
  ksrq: '2026-08-30',
  kscc: '第1场',
  kcmc: '示例课程甲',
  jsmc: '2-302',
  ksrs: 23,
  kspcmc: '示例批次',
  ksfs: '闭卷',
  jkjsxm: '示例教师甲',
  kkyx: '示例学院',
  ksbj: '示例班级甲',
  ...overrides
})

const ACCOUNT = 'T0001'
const SEMESTER = '2026-2027-1'

/** 学生考试提醒键（复刻 local_reminder_scheduler.buildReminderKey 的格式，用于隔离断言）。 */
const studentExamReminderKey = (): string =>
  ['mini-hbut', 'r1', ACCOUNT, 'exam', SEMESTER, '示例课程甲|2026-08-30|第1场', '2026-08-30', '1440'].join(
    '|'
  )

describe('E6 教师提醒：与学生考试提醒隔离', () => {
  it('监考提醒键使用教师作用域，且绝不等于学生 exam 键', () => {
    const key = buildTeacherInvigilationReminderKey(ACCOUNT, SEMESTER, makeInvigilation())
    expect(key.startsWith('teacher:')).toBe(true)
    expect(key).toContain(':invigilation-reminder:')
    expect(key).not.toBe(studentExamReminderKey())
    expect(isTeacherReminderKey(key)).toBe(true)
    // 学生键不得被误判为教师提醒键
    expect(isTeacherReminderKey(studentExamReminderKey())).toBe(false)
    expect(isTeacherReminderKey('student:T0001:2026-2027-1')).toBe(false)
  })

  it('不同账号 / 不同学期产生不同提醒键（作用域隔离）', () => {
    const base = buildTeacherInvigilationReminderKey(ACCOUNT, SEMESTER, makeInvigilation())
    expect(buildTeacherInvigilationReminderKey('T0002', SEMESTER, makeInvigilation())).not.toBe(base)
    expect(buildTeacherInvigilationReminderKey(ACCOUNT, '2026-2027-2', makeInvigilation())).not.toBe(
      base
    )
  })

  it('事件 scopeKey 属于教师域且带 exams 类别', () => {
    const event = toTeacherInvigilationReminderEvent(ACCOUNT, SEMESTER, makeInvigilation())
    expect(event).not.toBeNull()
    expect(event?.scopeKey).toBe('teacher:T0001:2026-2027-1:exams')
    expect(event?.type).toBe('teacher-invigilation')
  })
})

describe('E6 教师提醒：重复拉取幂等（不重复通知）', () => {
  it('同一输入重复构建得到完全相同的 id / reminderKey', () => {
    const invigilations = [makeInvigilation({ id: 'a' }), makeInvigilation({ id: 'b', ksrq: '2026-09-01' })]
    const first = buildTeacherInvigilationReminderEvents({ accountId: ACCOUNT, semester: SEMESTER, invigilations })
    const second = buildTeacherInvigilationReminderEvents({ accountId: ACCOUNT, semester: SEMESTER, invigilations })
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id))
    expect(first.map((e) => e.reminderKey)).toEqual(second.map((e) => e.reminderKey))
    expect(first.map((e) => e.id)).toEqual(first.map((e) => deriveTeacherInvigilationReminderId(e.reminderKey)))
  })

  it('重复记录（同 id）去重为一条；不同日期为两条', () => {
    const invigilations = [
      makeInvigilation({ id: 'dup' }),
      makeInvigilation({ id: 'dup' }),
      makeInvigilation({ id: 'other', ksrq: '2026-09-01' })
    ]
    const events = buildTeacherInvigilationReminderEvents({ accountId: ACCOUNT, semester: SEMESTER, invigilations })
    expect(events.length).toBe(2)
    expect(new Set(events.map((e) => e.reminderKey)).size).toBe(2)
  })

  it('ID 为稳定正整数，且不含时间戳（跨调用恒定）', () => {
    const key = buildTeacherInvigilationReminderKey(ACCOUNT, SEMESTER, makeInvigilation())
    const id1 = deriveTeacherInvigilationReminderId(key)
    const id2 = deriveTeacherInvigilationReminderId(key)
    expect(id1).toBe(id2)
    expect(Number.isInteger(id1)).toBe(true)
    expect(id1).toBeGreaterThan(0)
  })
})

describe('E6 教师提醒：日期 / 地点 / 身份不交叉错配', () => {
  it('每条事件的课程 / 日期 / 地点 / 身份均来自同一条源记录', () => {
    const invigilations = [
      makeInvigilation({
        id: 'a',
        kcmc: '课程甲',
        ksrq: '2026-08-30',
        jsmc: '2-302',
        zjk: '主监考',
        xqmc: '本部'
      }),
      makeInvigilation({
        id: 'b',
        kcmc: '课程乙',
        ksrq: '2026-08-31',
        jsmc: '3-101',
        zjk: '副监考',
        xqmc: '东区'
      })
    ]
    const events = buildTeacherInvigilationReminderEvents({ accountId: ACCOUNT, semester: SEMESTER, invigilations })
    expect(events.length).toBe(2)

    const [a, b] = events
    expect(a).toMatchObject({ courseName: '课程甲', dateKey: '2026-08-30', room: '2-302', role: '主监考', campus: '本部' })
    expect(b).toMatchObject({ courseName: '课程乙', dateKey: '2026-08-31', room: '3-101', role: '副监考', campus: '东区' })
    // 显式断言没有跨记录串值
    expect(a.room).not.toBe(b.room)
    expect(a.role).not.toBe(b.role)
  })

  it('日期不可解析时不生成提醒（不臆造日期）', () => {
    const events = buildTeacherInvigilationReminderEvents({
      accountId: ACCOUNT,
      semester: SEMESTER,
      invigilations: [makeInvigilation({ id: 'x', ksrq: '' })]
    })
    expect(events).toEqual([])
    expect(toTeacherInvigilationReminderEvent(ACCOUNT, SEMESTER, makeInvigilation({ id: 'y', ksrq: '待定' }))).toBeNull()
  })
})

describe('E6 教师提醒：时刻与调度规格', () => {
  it('提醒时刻 = 考试日期前一天 09:00（不解析未实测的场次时钟）', () => {
    const event = toTeacherInvigilationReminderEvent(ACCOUNT, SEMESTER, makeInvigilation({ ksrq: '2026-08-30' }))
    expect(event).not.toBeNull()
    const expected = new Date(2026, 7, 29, TEACHER_INVIGILATION_DEFAULT_HOUR, 0, 0, 0).getTime()
    expect(event?.atEpochMs).toBe(expected)
    expect(event?.atEpochSecs).toBe(Math.floor(expected / 1000))
    // 场次原文仅作展示标签
    expect(event?.sessionLabel).toBe('第1场')
    expect(TEACHER_INVIGILATION_LEAD_DAYS).toBe(1)
  })

  it('调度规格绑定教师作用域、类型为 teacher-invigilation，且文案含日期', () => {
    const events = buildTeacherInvigilationReminderEvents({
      accountId: ACCOUNT,
      semester: SEMESTER,
      invigilations: [makeInvigilation()]
    })
    const specs = buildTeacherInvigilationReminderSpecs(events)
    expect(specs.length).toBe(1)
    expect(specs[0].type).toBe('teacher-invigilation')
    expect(specs[0].scopeKey).toBe('teacher:T0001:2026-2027-1:exams')
    expect(specs[0].targetView).toBe('teachexams')
    expect(specs[0].title.length).toBeGreaterThan(0)
    expect(specs[0].body).toContain('2026-08-30')
    expect(specs[0].fingerprint).toContain(String(specs[0].atEpochMs))
  })
})
