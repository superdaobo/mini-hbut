/**
 * 本地提醒调度领域（#610）单测
 *
 * 覆盖：stable ID 派生、7~14 天窗口、课程/考试计划、diff/reconcile、
 * namespace 隔离、权限关闭/课表为空/切账号/跨天等边界。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyReminderCap,
  buildClassReminderPlan,
  buildExamReminderPlan,
  buildReminderKey,
  cancelLocalRemindersForScope,
  clearRemindersForLogout,
  computeFingerprint,
  computeReminderWindow,
  deriveReminderId,
  diffReminders,
  readLedger,
  reconcileLocalReminders,
  setLocalReminderPlatform
} from './local_reminder_scheduler'

// —— mock 基础设施 ——
vi.mock('../platform/native', () => ({
  isTauriRuntime: () => true,
  isCapacitorRuntime: () => false,
  invokeNative: vi.fn(async () => ({ success: true, data: [] }))
}))

vi.mock('./api.js', () => ({
  getCachedData: vi.fn(() => null),
  LONG_TTL: 3 * 24 * 60 * 60 * 1000
}))

const installStorage = () => {
  const storage = new Map<string, string>()
  const api = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size
    }
  }
  vi.stubGlobal('localStorage', api)
  return storage
}

const newDay = (y: number, m: number, d: number, h = 0, min = 0): Date =>
  new Date(y, m - 1, d, h, min, 0, 0)

// 测试课程（对齐真实课表字段）
const baseCourse = {
  id: 'course-1',
  name: '高等数学',
  teacher: '张老师',
  room_code: 'X-101',
  weekday: 1, // 周一
  period: 1,
  djs: 2,
  weeks: [1, 2, 3]
}

// 学期开始日期 2026-08-17（周一），第 1 周
const SEMESTER_START = '2026-08-17'

beforeEach(() => {
  installStorage()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('stable Reminder ID 派生', () => {
  const baseKey = {
    studentId: '2021001',
    type: 'class' as const,
    semester: '2025-2026-2',
    courseIdentity: 'course-1|1|2',
    occurrence: '2026-08-24',
    leadMinutes: 30
  }

  it('相同业务输入重复计算得到相同 ID', () => {
    const a = deriveReminderId(baseKey)
    const b = deriveReminderId({ ...baseKey })
    expect(a).toBe(b)
  })

  it('student / type / semester / identity / occurrence / lead 变化均产生不同 ID', () => {
    type BaseKeyVariant = {
      studentId?: string
      type?: 'class' | 'exam'
      semester?: string
      courseIdentity?: string
      occurrence?: string
      leadMinutes?: number
    }
    const variants: BaseKeyVariant[] = [
      { studentId: '2021002' },
      { type: 'exam' },
      { semester: '2026-2027-1' },
      { courseIdentity: 'course-2|1|2' },
      { occurrence: '2026-08-25' },
      { leadMinutes: 45 }
    ]
    const base = deriveReminderId(baseKey)
    for (const variant of variants) {
      expect(deriveReminderId({ ...baseKey, ...variant })).not.toBe(base)
    }
  })

  it('ID 落在正 i32 范围内且不包含 Date.now() 随机性', () => {
    const id = deriveReminderId(baseKey)
    expect(Number.isInteger(id)).toBe(true)
    expect(id).toBeGreaterThan(0)
    expect(id).toBeLessThanOrEqual(0x7fffffff)
  })

  it('reminderKey 与 #609 契约同构（id = hash(key)）', () => {
    const key = buildReminderKey(baseKey)
    expect(key).toContain('mini-hbut')
    expect(key).toContain('2021001')
    expect(key).toContain('class')
    // 相同 key 必然 hash 出相同 id
    expect(deriveReminderId(baseKey)).toBe(deriveReminderId({ ...baseKey }))
  })
})

describe('滚动窗口（7~14 天）', () => {
  it('默认 14 天窗口', () => {
    const now = newDay(2026, 8, 20, 10, 0)
    const w = computeReminderWindow(now)
    expect(w.endEpochMs - w.startEpochMs).toBe(14 * 24 * 60 * 60 * 1000)
  })

  it('窗口天数被 clamp 到 [7, 14]', () => {
    const now = newDay(2026, 8, 20, 10, 0)
    expect(computeReminderWindow(now, 3).endEpochMs - now.getTime()).toBe(7 * 86400000)
    expect(computeReminderWindow(now, 30).endEpochMs - now.getTime()).toBe(14 * 86400000)
  })
})

describe('课程提醒计划', () => {
  const now = newDay(2026, 8, 20, 10, 0) // 周四，第 2 周

  it('按开始时间 - leadMinutes 生成提醒，连排节次合并为一条', () => {
    const specs = buildClassReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      courses: [{ ...baseCourse, weeks: [2] }],
      startDate: SEMESTER_START,
      currentWeek: 2,
      leadMinutes: 30,
      now
    })
    // week2 周一 = 2026-08-24，第 1 节 08:20 → 提醒 07:50
    expect(specs).toHaveLength(1)
    expect(specs[0].type).toBe('class')
    expect(specs[0].targetView).toBe('schedule')
    expect(specs[0].atEpochMs).toBe(newDay(2026, 8, 24, 7, 50).getTime())
    expect(specs[0].body).toContain('高等数学')
  })

  it('单双周：不在 weeks 内的周次不生成提醒', () => {
    const specs = buildClassReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      courses: [{ ...baseCourse, weeks: [1] }], // 仅第 1 周（已过），第 2 周无课
      startDate: SEMESTER_START,
      currentWeek: 2,
      leadMinutes: 30,
      now
    })
    expect(specs).toHaveLength(0)
  })

  it('已过时刻不补发历史提醒', () => {
    const specs = buildClassReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      courses: [{ ...baseCourse, weeks: [2] }],
      startDate: SEMESTER_START,
      currentWeek: 2,
      leadMinutes: 30,
      now: newDay(2026, 8, 24, 8, 0) // 已过 07:50 提醒时刻
    })
    expect(specs).toHaveLength(0)
  })

  it('窗口边界：超出 14 天的 occurrence 不生成', () => {
    const specs = buildClassReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      courses: [{ ...baseCourse, weeks: [5] }], // week5 周一 = 09-14，超出窗口
      startDate: SEMESTER_START,
      currentWeek: 2,
      leadMinutes: 30,
      now
    })
    expect(specs).toHaveLength(0)
  })

  it('缺失学期开始日期时以当前周为锚回退推算', () => {
    const specs = buildClassReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      courses: [baseCourse],
      currentWeek: 2,
      leadMinutes: 30,
      now
    })
    expect(specs).toHaveLength(1)
    expect(specs[0].atEpochMs).toBe(newDay(2026, 8, 24, 7, 50).getTime())
  })

  it('自定义课程与正常课表使用同一调度规则', () => {
    const custom = { ...baseCourse, id: 'custom:abc', is_custom: true, name: '自定义体育', weeks: [2] }
    const specs = buildClassReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      courses: [custom],
      startDate: SEMESTER_START,
      currentWeek: 2,
      leadMinutes: 15,
      now
    })
    expect(specs).toHaveLength(1)
    expect(specs[0].atEpochMs).toBe(newDay(2026, 8, 24, 8, 5).getTime()) // 08:20 - 15min
    expect(specs[0].body).toContain('自定义体育')
  })

  it('同一课程相邻节次（同签名）合并为一条提醒', () => {
    // 同一课程被拆成第 1、2 节两条记录（同 id/name/teacher/room）→ 合并为一条
    const a = { ...baseCourse, id: 'course-1', teacher: '张老师', period: 1, djs: 1, weeks: [2] }
    const b = { ...baseCourse, id: 'course-1', teacher: '张老师', period: 2, djs: 1, weeks: [2] }
    const specs = buildClassReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      courses: [a, b],
      startDate: SEMESTER_START,
      currentWeek: 2,
      leadMinutes: 30,
      now
    })
    expect(specs).toHaveLength(1)
    expect(specs[0].atEpochMs).toBe(newDay(2026, 8, 24, 7, 50).getTime())
  })

  it('提前量变化会派生不同 ID（旧取消+新创建语义的根基）', () => {
    const plan30 = buildClassReminderPlan({
      studentId: '2021001', semester: '2025-2026-2', courses: [baseCourse],
      startDate: SEMESTER_START, currentWeek: 2, leadMinutes: 30, now
    })
    const plan45 = buildClassReminderPlan({
      studentId: '2021001', semester: '2025-2026-2', courses: [baseCourse],
      startDate: SEMESTER_START, currentWeek: 2, leadMinutes: 45, now
    })
    expect(plan30[0].id).not.toBe(plan45[0].id)
  })
})

describe('考试提醒计划', () => {
  const now = newDay(2026, 8, 20, 10, 0)

  it('默认提前 1 天生成确定性提醒', () => {
    const specs = buildExamReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      exams: [{ course_name: '大学英语', exam_date: '2026-08-28', exam_time: '08:30-10:00' }],
      now
    })
    expect(specs).toHaveLength(1)
    expect(specs[0].type).toBe('exam')
    expect(specs[0].targetView).toBe('exams')
    expect(specs[0].atEpochMs).toBe(newDay(2026, 8, 27, 8, 30).getTime())
  })

  it('无明确时间时默认 09:00 触发', () => {
    const specs = buildExamReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      exams: [{ course_name: '数据结构', exam_date: '2026-08-28' }],
      now
    })
    expect(specs[0].atEpochMs).toBe(newDay(2026, 8, 27, 9, 0).getTime())
  })

  it('无明确日期跳过；重复同步不改变 ID', () => {
    const specs = buildExamReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      exams: [{ course_name: '无日期考试' }],
      now
    })
    expect(specs).toHaveLength(0)
    const a = buildExamReminderPlan({
      studentId: '2021001', semester: '2025-2026-2',
      exams: [{ course_name: '大学英语', exam_date: '2026-08-28', exam_time: '08:30-10:00' }], now
    })
    const b = buildExamReminderPlan({
      studentId: '2021001', semester: '2025-2026-2',
      exams: [{ course_name: '大学英语', exam_date: '2026-08-28', exam_time: '08:30-10:00' }], now
    })
    expect(a[0].id).toBe(b[0].id)
  })

  it('窗口过滤：超过 14 天的考试不生成提醒', () => {
    const specs = buildExamReminderPlan({
      studentId: '2021001',
      semester: '2025-2026-2',
      exams: [{ course_name: '线代', exam_date: '2026-09-20' }],
      now
    })
    expect(specs).toHaveLength(0)
  })
})

describe('diff / reconcile 纯逻辑', () => {
  const makeSpec = (id: number, atEpochMs: number, extra = '') => ({
    id,
    type: 'class' as const,
    studentId: '2021001',
    semester: 'S',
    title: '上课提醒',
    body: `高等数学${extra}`,
    atEpochMs,
    atEpochSecs: Math.floor(atEpochMs / 1000),
    targetView: 'schedule',
    fingerprint: computeFingerprint({ title: '上课提醒', body: `高等数学${extra}`, atEpochMs, targetView: 'schedule' })
  })

  it('新增 / 删除 / 保持', () => {
    const expected = [makeSpec(1, 1000), makeSpec(2, 2000)]
    const ledger = {
      scope: '2021001',
      updatedAt: '',
      entries: [{ id: 2, fingerprint: expected[1].fingerprint, type: 'class' as const, atEpochMs: 2000 }]
    }
    const diff = diffReminders(expected, ledger)
    expect(diff.toSchedule.map((s) => s.id)).toEqual([1])
    expect(diff.toKeep).toEqual([2])
    expect(diff.toCancel).toEqual([])
  })

  it('同 id 内容变化（如教室名变化）→ 重新 schedule（幂等替换），不 cancel', () => {
    const expected = [makeSpec(1, 3000, '（新教室）')] // 同一 id 内容指纹变化
    const ledger = {
      scope: '2021001',
      updatedAt: '',
      entries: [{ id: 1, fingerprint: makeSpec(1, 1000).fingerprint, type: 'class' as const, atEpochMs: 1000 }]
    }
    const diff = diffReminders(expected, ledger)
    expect(diff.toSchedule.map((s) => s.id)).toEqual([1])
    expect(diff.toCancel).toEqual([])
    expect(diff.toKeep).toEqual([])
  })

  it('开始时间/节次变化 → id 变化 → 旧取消 + 新创建', () => {
    const newSpec = makeSpec(77, 3000) // 节次变化后派生出的新 id
    const ledger = {
      scope: '2021001',
      updatedAt: '',
      entries: [{ id: 66, fingerprint: 'old-fingerprint', type: 'class' as const, atEpochMs: 1000 }]
    }
    const diff = diffReminders([newSpec], ledger)
    expect(diff.toSchedule.map((s) => s.id)).toEqual([77])
    expect(diff.toCancel).toEqual([66])
  })

  it('课程删除 → 旧 pending 准确取消', () => {
    const expected: Array<ReturnType<typeof makeSpec>> = []
    const old = makeSpec(9, 1000)
    const ledger = {
      scope: '2021001',
      updatedAt: '',
      entries: [{ id: 9, fingerprint: old.fingerprint, type: 'class' as const, atEpochMs: 1000 }]
    }
    const diff = diffReminders(expected, ledger)
    expect(diff.toSchedule).toEqual([])
    expect(diff.toCancel).toEqual([9])
  })

  it('namespace 隔离：只管理台账中的 id', () => {
    const ledger = {
      scope: '2021001',
      updatedAt: '',
      entries: [{ id: 5, fingerprint: 'x', type: 'exam' as const, atEpochMs: 1000 }]
    }
    const diff = diffReminders([], ledger)
    expect(diff.toCancel).toEqual([5]) // 只含台账里的 id
  })
})

describe('reconcile 集成（fake 平台）', () => {
  interface FakeRecord {
    scheduled: Array<{ id: number; atEpochSecs: number; title: string; body: string }>
    canceled: number[][]
    permission: string
    scheduleResult: boolean
  }

  let fake: FakeRecord

  beforeEach(() => {
    fake = {
      scheduled: [],
      canceled: [],
      permission: 'granted',
      scheduleResult: true
    }
    setLocalReminderPlatform({
      async schedule(input) {
        if (!fake.scheduleResult) return false
        fake.scheduled.push({ id: input.id, atEpochSecs: input.atEpochSecs, title: input.title, body: input.body })
        return true
      },
      async pending() {
        return []
      },
      async cancel(ids) {
        fake.canceled.push(ids)
        return true
      },
      async permission() {
        return fake.permission
      }
    })
  })

  afterEach(() => {
    setLocalReminderPlatform(null)
  })

  const input = {
    studentId: '2021001',
    courses: [baseCourse],
    scheduleMeta: { semester: '2025-2026-2', start_date: SEMESTER_START, current_week: 2 },
    now: newDay(2026, 8, 20, 10, 0),
    skipPermissionCheck: false
  }

  it('首次 reconcile：窗口内提醒全部登记', async () => {
    const result = await reconcileLocalReminders({
      ...input,
      exams: [{ course_name: '大学英语', exam_date: '2026-08-28', exam_time: '08:30-10:00' }]
    })
    expect(result.skipped).toBeUndefined()
    // 14 天窗口内含 2 个周一（week2/week3 课程）+ 1 场考试
    expect(result.scheduled).toBe(3)
    expect(fake.scheduled).toHaveLength(3)
    // 台账写入
    const ledger = readLedger('2021001')
    expect(ledger.entries).toHaveLength(3)
    expect(ledger.scope).toBe('2021001')
  })

  it('稳定输入重复 reconcile 不重复创建提醒', async () => {
    await reconcileLocalReminders({ ...input })
    const firstCount = fake.scheduled.length
    const result2 = await reconcileLocalReminders({ ...input })
    expect(fake.scheduled.length).toBe(firstCount)
    expect(result2.scheduled).toBe(0)
    expect(result2.kept).toBeGreaterThan(0)
  })

  it('课表为空/考试为空 → 清理全部本 scope 提醒，不误删其他类型', async () => {
    await reconcileLocalReminders({ ...input, exams: [{ course_name: '大学英语', exam_date: '2026-08-28' }] })
    expect(fake.scheduled.length).toBeGreaterThan(0)
    // 数据清空后再 reconcile → 全部 cancel
    const result = await reconcileLocalReminders({ ...input, courses: [], exams: [] })
    expect(result.canceled).toBe(fake.scheduled.length)
    expect(fake.canceled[0]).toEqual(fake.scheduled.map((s) => s.id))
    expect(readLedger('2021001').entries).toHaveLength(0)
  })

  it('通知权限关闭：不崩溃、状态可观测、授权后可补建', async () => {
    fake.permission = 'denied'
    const result = await reconcileLocalReminders({ ...input })
    expect(result.skipped).toBe('permission-denied')
    expect(fake.scheduled).toHaveLength(0)
    // 授权后重跑 → 补建
    fake.permission = 'granted'
    const result2 = await reconcileLocalReminders({ ...input })
    expect(result2.scheduled).toBe(2) // week2 + week3 两个 occurrence
  })

  it('切换账号：旧账号提醒被取消，不污染新账号', async () => {
    await reconcileLocalReminders({ ...input, studentId: '2021001' })
    const firstAccountIds = fake.scheduled.map((s) => s.id)
    expect(firstAccountIds).toHaveLength(2)
    const result = await reconcileLocalReminders({ ...input, studentId: '2021002' })
    // 旧 scope 台账 id 被 cancel
    expect(fake.canceled.length).toBeGreaterThan(0)
    expect(fake.canceled[0]).toEqual(firstAccountIds)
    // 新账号正常登记
    expect(result.scheduled).toBe(2)
    expect(readLedger('2021002').entries).toHaveLength(2)
    // 旧台账已清
    expect(readLedger('2021001').entries).toHaveLength(0)
  })

  it('登记失败：失败 id 不写入台账，下次可重试', async () => {
    fake.scheduleResult = false
    const result = await reconcileLocalReminders({ ...input })
    expect(result.failed).toBe(2)
    expect(readLedger('2021001').entries).toHaveLength(0)
  })

  it('跨天：窗口滚动后过期提醒被准确取消', async () => {
    // 第 1 天：登记 week2/week3 两个周一提醒（08-24 与 08-31，均 07:50）
    await reconcileLocalReminders({ ...input })
    expect(fake.scheduled).toHaveLength(2)
    // 第 2 天（跨天）：now 前移到 08-24 09:00（week2 提醒已过）→ 只保留 week3 → cancel 1 条
    const result = await reconcileLocalReminders({ ...input, now: newDay(2026, 8, 24, 9, 0) })
    expect(result.canceled).toBe(1)
    expect(fake.canceled).toHaveLength(1)
  })

  it('手动登出：取消 scope 全部提醒并清台账', async () => {
    await reconcileLocalReminders({ ...input })
    const cleared = await clearRemindersForLogout('2021001')
    expect(cleared.canceled).toBe(2)
    expect(fake.canceled[0]).toEqual(fake.scheduled.map((s) => s.id))
    expect(readLedger('2021001').entries).toHaveLength(0)
  })

  it('cancelLocalRemindersForScope：空台账幂等安全', async () => {
    const result = await cancelLocalRemindersForScope('nobody')
    expect(result.success).toBe(true)
    expect(result.canceled).toBe(0)
  })

  it('窗口内提醒数量超限时按触发时间保留最近的', () => {
    const specs = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      type: 'class' as const,
      studentId: 's',
      semester: 'S',
      title: 't',
      body: 'b',
      atEpochMs: 1000 + i * 1000,
      atEpochSecs: 1 + i,
      targetView: 'schedule',
      fingerprint: `f${i}`
    }))
    const capped = applyReminderCap(specs, 50)
    expect(capped).toHaveLength(50)
    expect(capped[0].atEpochMs).toBe(1000) // 最近的先保留
  })
})
