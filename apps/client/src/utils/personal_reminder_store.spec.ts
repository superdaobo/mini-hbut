/**
 * 个人日程提醒取数与调度管线集成（#839）单测
 *
 * 覆盖：list_schedule_events_range 取数契约（驼峰参数 / 日期范围 / 失败静默）、
 * payload 归一化（note 不进入结果），以及日程提醒并入 reconcile 单一管线
 * （同一 expected / 同一台账 / 同一 diff）后的补建与取消。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invokeNative: vi.fn(),
  isTauri: { value: true }
}))

vi.mock('../platform/native', () => ({
  isTauriRuntime: () => mocks.isTauri.value,
  isCapacitorRuntime: () => false,
  invokeNative: (...args: unknown[]) => mocks.invokeNative(...args)
}))

vi.mock('./api.js', () => ({
  getCachedData: vi.fn(() => null),
  LONG_TTL: 3 * 24 * 60 * 60 * 1000
}))

import { listPersonalReminderEvents } from './personal_reminder_store'
import {
  readLedger,
  reconcileLocalReminders,
  setLocalReminderPlatform,
  type LocalReminderPlatform
} from './local_reminder_scheduler'

const STUDENT_ID = '2021001'

/** 锚点：2026-06-15 08:00（避开夏令时切换日，跨时区稳定） */
const now = new Date(2026, 5, 15, 8, 0, 0, 0)

const samplePayload = {
  id: 'ev17500000000001234',
  title: '复习高数',
  date: '2026-06-16',
  start_time: '09:30',
  end_time: '11:00',
  location: '图书馆',
  note: '隐私备注-不得外泄',
  color: '#3b82f6',
  reminder_minutes: 30,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z'
}

/** 按命令名分发 invoke 结果：默认空数据，仅 list-range 走给定响应 */
const routeInvoke = (listRangeResponse: unknown) => {
  mocks.invokeNative.mockImplementation(async (command: string) =>
    command === 'list_schedule_events_range' ? listRangeResponse : { success: true, data: [] }
  )
}

const installStorage = () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size
    }
  })
  return storage
}

const fetchEvents = (windowDays = 14) =>
  listPersonalReminderEvents({ studentId: STUDENT_ID, now, windowDays })

beforeEach(() => {
  installStorage()
  mocks.isTauri.value = true
  routeInvoke({ success: true, data: [] })
})

afterEach(() => {
  setLocalReminderPlatform(null)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('listPersonalReminderEvents 取数契约', () => {
  it('按当前学生 + 今天 ~ 今天+windowDays 闭区间查询，参数名为驼峰', async () => {
    routeInvoke({ success: true, data: [samplePayload] })
    const events = await fetchEvents(14)
    expect(mocks.invokeNative).toHaveBeenCalledWith('list_schedule_events_range', {
      studentId: STUDENT_ID,
      startDate: '2026-06-15',
      endDate: '2026-06-29'
    })
    expect(events).toEqual([
      {
        id: 'ev17500000000001234',
        title: '复习高数',
        date: '2026-06-16',
        startTime: '09:30',
        endTime: '11:00',
        location: '图书馆',
        reminderMinutes: 30
      }
    ])
    // 隐私：note 不进入归一化结果（也就不可能进入通知正文与日志）
    expect(JSON.stringify(events)).not.toContain('隐私备注')
  })

  it('reminder_minutes 为 null / 非数值 / 缺失 → 归一为「不提醒」', async () => {
    routeInvoke({
      success: true,
      data: [
        { id: 'a', reminder_minutes: null },
        { id: 'b', reminder_minutes: 'abc' },
        { id: 'c' }
      ]
    })
    const events = await fetchEvents()
    expect(events.map((event) => event.reminderMinutes)).toEqual([null, null, null])
  })

  it('非 Tauri 运行时直接返回空数组且不调用原生命令', async () => {
    mocks.isTauri.value = false
    expect(await fetchEvents()).toEqual([])
    expect(mocks.invokeNative).not.toHaveBeenCalled()
  })

  it('studentId 为空 → 空数组且不调用原生命令', async () => {
    expect(await listPersonalReminderEvents({ studentId: '  ', now, windowDays: 14 })).toEqual([])
    expect(mocks.invokeNative).not.toHaveBeenCalled()
  })

  it('命令抛错 / success=false / data 非数组 → 静默返回空数组，不抛异常', async () => {
    mocks.invokeNative.mockRejectedValue(new Error('command not found'))
    await expect(fetchEvents()).resolves.toEqual([])

    routeInvoke({ success: false, error: 'db error' })
    await expect(fetchEvents()).resolves.toEqual([])

    routeInvoke({ success: true, data: null })
    await expect(fetchEvents()).resolves.toEqual([])
  })
})

describe('日程提醒并入 reconcile 单一管线', () => {
  interface FakeRecord {
    scheduled: Array<{ id: number; title: string; body: string }>
    canceled: number[][]
  }

  let fake: FakeRecord

  const installFakePlatform = () => {
    fake = { scheduled: [], canceled: [] }
    const platform: LocalReminderPlatform = {
      async schedule(input) {
        fake.scheduled.push({ id: input.id, title: input.title, body: input.body })
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
        return 'granted'
      }
    }
    setLocalReminderPlatform(platform)
    return platform
  }

  const settings = {
    enableBackground: false,
    enableExamReminder: false,
    enableGradeNotice: false,
    enablePowerNotice: false,
    enableClassReminder: false,
    enableSchoolInbox: false,
    enableChaoxingInbox: false,
    classLeadMinutes: 30,
    intervalMinutes: 30
  }

  const reconcile = () =>
    reconcileLocalReminders({
      studentId: STUDENT_ID,
      courses: [],
      exams: [],
      settings,
      now,
      reason: 'schedule-event-crud'
    })

  it('日程提醒进入同一 expected / 台账，并携带稳定派生 id 与地点正文', async () => {
    installFakePlatform()
    routeInvoke({ success: true, data: [samplePayload] })

    const result = await reconcile()

    expect(result.skipped).toBeUndefined()
    expect(result.expected).toBe(1)
    expect(result.scheduled).toBe(1)
    expect(fake.scheduled).toHaveLength(1)
    // 09:30 开始、提前 30 分钟 → 正文含 09:30 + 标题 + 地点
    expect(fake.scheduled[0].title).toBe('复习高数')
    expect(fake.scheduled[0].body).toContain('09:30')
    expect(fake.scheduled[0].body).toContain('图书馆')
    expect(fake.scheduled[0].body).not.toContain('隐私备注')

    const ledger = readLedger(STUDENT_ID)
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0].type).toBe('personal')
    expect(ledger.entries[0].id).toBe(fake.scheduled[0].id)
  })

  it('日程删除（不再出现在 expected）→ 台账中的个人提醒自动取消', async () => {
    installFakePlatform()
    routeInvoke({ success: true, data: [samplePayload] })
    await reconcile()
    const scheduledId = fake.scheduled[0].id

    // 模拟 delete 后的第二次 reconcile：list-range 不再返回该日程
    routeInvoke({ success: true, data: [] })
    const second = await reconcile()

    expect(second.expected).toBe(0)
    expect(second.canceled).toBe(1)
    expect(fake.canceled).toEqual([[scheduledId]])
    expect(readLedger(STUDENT_ID).entries).toEqual([])
  })

  it('取数失败不影响 reconcile 结果（课程/考试提醒照常）', async () => {
    installFakePlatform()
    mocks.invokeNative.mockRejectedValue(new Error('db unavailable'))

    const result = await reconcile()

    expect(result.success).toBe(true)
    expect(result.expected).toBe(0)
    expect(result.errors).toEqual([])
  })
})
