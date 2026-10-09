/**
 * Teacher Portal V2（E3 #1023）：教师提醒作用域隔离契约测试。
 *
 * 目标（Epic #1018 验收）：教师授课提醒使用 `teacher:{accountId}:{semester}`
 * 作用域，**严禁**复用学生的 studentId 去重键；教师分支不消费学生数据源。
 *
 * fixture 全部脱敏（无真实工号 / 学号 / 姓名）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildClassReminderPlan,
  buildTeacherReminderScope,
  ledgerKeyFor,
  readActiveScope,
  teacherReminderLedgerKeyFor,
  teacherReminderSnapshotKeyFor,
  type LocalReminderPlatform
} from '../../../utils/local_reminder_scheduler'
import {
  buildTeacherClassReminderPlan,
  listTeacherReminderEvents,
  reconcileTeacherLocalReminders
} from '../utils/teacher_reminders'
import type { NotifySettingsFull } from '../../../utils/notify_center_util'

const installStorage = (): Map<string, string> => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size
    }
  })
  return storage
}

/** 让 `isTauriRuntime()` 在 node 环境返回 true（不 mock 模块，避免污染依赖图）。 */
const stubTauriRuntime = (): void => {
  vi.stubGlobal('window', {
    __TAURI_INTERNALS__: { invoke: () => undefined },
    Capacitor: undefined
  })
}

const settings: NotifySettingsFull = {
  enableBackground: false,
  enableExamReminder: false,
  enableGradeNotice: false,
  enablePowerNotice: false,
  enableClassReminder: true,
  enableSchoolInbox: false,
  enableChaoxingInbox: false,
  classLeadMinutes: 30,
  intervalMinutes: 30
}

const baseCourse = {
  id: 'course-1',
  name: '建筑制图',
  teacher: '教师A',
  room_code: 'X-101',
  weekday: 1,
  period: 1,
  djs: 2,
  weeks: [1, 2, 3]
}

const SEMESTER_START = '2026-08-17'
const now = new Date(2026, 7, 17, 0, 0, 0, 0)

const createFakePlatform = (): {
  platform: LocalReminderPlatform
  scheduled: number[]
  canceled: number[]
} => {
  const scheduled: number[] = []
  const canceled: number[] = []
  const platform: LocalReminderPlatform = {
    async schedule(input) {
      scheduled.push(input.id)
      return true
    },
    async pending() {
      return []
    },
    async cancel(ids) {
      canceled.push(...ids)
      return true
    },
    async permission() {
      return 'granted'
    }
  }
  return { platform, scheduled, canceled }
}

beforeEach(() => {
  installStorage()
  stubTauriRuntime()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('E3 教师提醒作用域隔离', () => {
  it('作用域键固定为 teacher:{accountId}:{semester}，永不等于学生域', () => {
    expect(buildTeacherReminderScope('T0001', '2026-2027-1')).toBe('teacher:T0001:2026-2027-1')
    expect(buildTeacherReminderScope('T0001', '2026-2027-1').startsWith('teacher:')).toBe(true)
    // 即便 accountId 字符串与学生学号相同，前缀也保证不串号
    expect(buildTeacherReminderScope('1000000001', '2026-2027-1')).not.toBe(
      `student:1000000001:2026-2027-1`
    )
  })

  it('教师台账键与学生台账键完全不同命名空间', () => {
    const teacherKey = teacherReminderLedgerKeyFor('T0001', '2026-2027-1')
    const studentKey = ledgerKeyFor('T0001')
    expect(teacherKey).not.toBe(studentKey)
    expect(teacherKey).toContain('teacher:T0001:2026-2027-1')
    expect(studentKey).not.toContain('teacher:')
  })

  it('相同学号/工号字符串下，教师提醒 ID 与学生提醒 ID 不同（严禁复用学生去重键）', () => {
    const teacherSpecs = buildTeacherClassReminderPlan({
      accountId: 'T0001',
      semester: '2026-2027-1',
      courses: [baseCourse],
      startDate: SEMESTER_START,
      currentWeek: 1,
      settings,
      now
    })
    const studentSpecs = buildClassReminderPlan({
      studentId: 'T0001',
      semester: '2026-2027-1',
      courses: [baseCourse],
      startDate: SEMESTER_START,
      currentWeek: 1,
      leadMinutes: 30,
      now
    })

    expect(teacherSpecs.length).toBeGreaterThan(0)
    expect(studentSpecs.length).toBeGreaterThan(0)
    expect(teacherSpecs[0].studentId).toBe('teacher:T0001:2026-2027-1')
    const studentIds = new Set(studentSpecs.map((spec) => spec.id))
    for (const spec of teacherSpecs) {
      expect(studentIds.has(spec.id)).toBe(false)
    }
  })

  it('教师 reconcile 只写教师台账 / 快照，不触碰学生台账', async () => {
    const { platform, scheduled } = createFakePlatform()
    const result = await reconcileTeacherLocalReminders({
      accountId: 'T0001',
      semester: '2026-2027-1',
      courses: [baseCourse],
      startDate: SEMESTER_START,
      currentWeek: 1,
      settings,
      now,
      skipPermissionCheck: true,
      platform
    })

    expect(result.success).toBe(true)
    expect(result.scheduled).toBeGreaterThan(0)
    expect(scheduled.length).toBeGreaterThan(0)

    // 教师台账 + 快照存在
    expect(localStorage.getItem(teacherReminderLedgerKeyFor('T0001', '2026-2027-1'))).toBeTruthy()
    expect(localStorage.getItem(teacherReminderSnapshotKeyFor('T0001', '2026-2027-1'))).toBeTruthy()
    // 学生台账绝不被写入
    expect(localStorage.getItem(ledgerKeyFor('T0001'))).toBeNull()
    // active scope 是教师作用域
    expect(readActiveScope()).toBe('teacher:T0001:2026-2027-1')

    // 只读视图可读取教师提醒事件
    const events = listTeacherReminderEvents('T0001', '2026-2027-1', now)
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe('class')
  })

  it('无教师课程时不产生任何提醒，也不写学生域键', async () => {
    const { platform, scheduled } = createFakePlatform()
    const result = await reconcileTeacherLocalReminders({
      accountId: 'T0002',
      semester: '2026-2027-1',
      courses: [],
      settings,
      now,
      skipPermissionCheck: true,
      platform
    })
    expect(result.success).toBe(true)
    expect(result.expected).toBe(0)
    expect(scheduled).toHaveLength(0)
    expect(localStorage.getItem(ledgerKeyFor('T0002'))).toBeNull()
    expect(listTeacherReminderEvents('T0002', '2026-2027-1', now)).toEqual([])
  })

  it('缺失教师账号时不执行（不回落学生域）', async () => {
    const { platform } = createFakePlatform()
    const result = await reconcileTeacherLocalReminders({
      accountId: '',
      semester: '2026-2027-1',
      skipPermissionCheck: true,
      platform
    })
    expect(result.success).toBe(false)
    expect(result.skipped).toBe('missing-teacher-account')
  })
})
