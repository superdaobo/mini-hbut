// Unit tests for widget.ts facade
// 对齐 design §6.2, §9.2 — getWidgetBridge 单例 + writeSnapshot 校验
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TodayCourseSnapshot } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'

// 用于重置模块单例状态
function resetModule() {
  vi.resetModules()
}

/** 构造一个合法的最小 snapshot */
function makeValidSnapshot(overrides?: Partial<TodayCourseSnapshot>): TodayCourseSnapshot {
  return {
    version: 1,
    generated_at: '2024-06-15T08:00:00+08:00',
    date: '2024-06-15',
    student_id: '2021114001',
    week_index: 16,
    weekday: 6,
    courses: [],
    ...overrides,
  }
}

describe('getWidgetBridge', () => {
  beforeEach(() => {
    resetModule()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // 清理 window.Capacitor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
  })

  it('returns no-op proxy and logs debug once when not in Capacitor environment', async () => {
    // 模拟非 Capacitor 环境（window 存在但无 Capacitor）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {}
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { getWidgetBridge } = await import('./widget')

    const bridge = getWidgetBridge()
    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledWith('[widget] Non-mobile environment, widget bridge is no-op')

    // 第二次调用不再 log
    const bridge2 = getWidgetBridge()
    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(bridge).toBe(bridge2) // 单例

    // no-op proxy 方法静默 resolve
    await expect(bridge.writeSnapshot({ snapshot: makeValidSnapshot() })).resolves.toBeUndefined()
    await expect(bridge.clearSnapshot()).resolves.toBeUndefined()
    await expect(bridge.requestRefresh()).resolves.toBeUndefined()
    const caps = await bridge.getCapabilities()
    expect(caps.platform).toBe('unavailable')
    expect(caps.pinned).toBe(false)
  })

  it('returns no-op proxy when window is undefined (Node/SSR)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { getWidgetBridge } = await import('./widget')
    const bridge = getWidgetBridge()

    expect(debugSpy).toHaveBeenCalledTimes(1)
    await expect(bridge.clearSnapshot()).resolves.toBeUndefined()
  })
})

describe('writeSnapshot', () => {
  beforeEach(() => {
    resetModule()
    // 模拟非 Capacitor 环境（使用 no-op proxy）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {}
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
  })

  it('succeeds for a valid snapshot within size limit', async () => {
    const { writeSnapshot } = await import('./widget')
    await expect(writeSnapshot(makeValidSnapshot())).resolves.toBeUndefined()
  })

  it('rejects with INVALID_SNAPSHOT for schema-invalid data', async () => {
    const { writeSnapshot, WidgetBridgeError } = await import('./widget')

    const invalid = { ...makeValidSnapshot(), version: 2 } as unknown as TodayCourseSnapshot
    await expect(writeSnapshot(invalid)).rejects.toThrow(WidgetBridgeError)
    await expect(writeSnapshot(invalid)).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' })
  })

  it('rejects with INVALID_SNAPSHOT when required field is missing', async () => {
    const { writeSnapshot } = await import('./widget')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noDate = { ...makeValidSnapshot() } as any
    delete noDate.date
    await expect(writeSnapshot(noDate)).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' })
  })

  it('accepts a valid semester index larger than the old 32 KB limit', async () => {
    const { writeSnapshot, WidgetBridgeError } = await import('./widget')
    void WidgetBridgeError
    const sampleCourse = {
      period_start: 1,
      period_end: 2,
      time_start: '08:20',
      time_end: '09:55',
      name: '课程'.repeat(40),
      location: '教室'.repeat(40),
      teacher: '教师'.repeat(40),
      color: '#AABBCC',
    }
    const days = Array.from({ length: 25 * 7 }, (_, index) => ({
      week_index: Math.floor(index / 7) + 1,
      weekday: (index % 7) + 1,
      courses: [sampleCourse],
    }))
    const snapshot = makeValidSnapshot({
      schedule_index: {
        version: 1,
        start_date: '2026-08-31',
        base_date: '2026-09-20',
        base_week_index: 3,
        total_weeks: 25,
        days,
      },
    })
    const json = JSON.stringify(snapshot)
    const byteLength = new TextEncoder().encode(json).length
    expect(byteLength).toBeGreaterThan(32 * 1024)
    expect(byteLength).toBeLessThan(512 * 1024)
    await expect(writeSnapshot(snapshot)).resolves.toBeUndefined()
  })

  it('rejects a pathological semester index above 512 KB', async () => {
    const { writeSnapshot, WidgetBridgeError } = await import('./widget')
    const bigCourse = {
      period_start: 1,
      period_end: 2,
      time_start: '08:20',
      time_end: '09:55',
      name: '课'.repeat(80),
      location: '室'.repeat(80),
      teacher: '师'.repeat(80),
      color: '#AABBCC',
    }
    const days = Array.from({ length: 60 * 7 }, (_, index) => ({
      week_index: Math.floor(index / 7) + 1,
      weekday: (index % 7) + 1,
      courses: Array.from({ length: 14 }, () => ({ ...bigCourse })),
    }))
    const snapshot = makeValidSnapshot({
      schedule_index: {
        version: 1,
        base_date: '2026-09-20',
        base_week_index: 3,
        total_weeks: 60,
        days,
      },
    })
    const byteLength = new TextEncoder().encode(JSON.stringify(snapshot)).length
    expect(byteLength).toBeGreaterThan(512 * 1024)
    await expect(writeSnapshot(snapshot)).rejects.toThrow(WidgetBridgeError)
    await expect(writeSnapshot(snapshot)).rejects.toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' })
  })

  it('rejects with INVALID_SNAPSHOT for invalid course fields', async () => {
    const { writeSnapshot } = await import('./widget')

    const snapshot = makeValidSnapshot({
      courses: [
        {
          period_start: 0, // invalid: minimum is 1
          period_end: 1,
          time_start: '08:00',
          time_end: '09:00',
          name: '数学',
          location: 'A101',
          teacher: '张老师',
        },
      ],
    })

    await expect(writeSnapshot(snapshot)).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' })
  })

  it('succeeds for snapshot with maximum valid courses', async () => {
    const { writeSnapshot } = await import('./widget')

    const courses = Array.from({ length: 14 }, (_, i) => ({
      period_start: (i + 1) as 1,
      period_end: (i + 1) as 1,
      time_start: `${String(8 + i).padStart(2, '0')}:00`,
      time_end: `${String(9 + i).padStart(2, '0')}:00`,
      name: `课程${i + 1}`,
      location: `教室${i + 1}`,
      teacher: `老师${i + 1}`,
    }))

    const snapshot = makeValidSnapshot({ courses })
    await expect(writeSnapshot(snapshot)).resolves.toBeUndefined()
  })
})

describe('clearSnapshot', () => {
  beforeEach(() => {
    resetModule()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {}
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
  })

  it('delegates to bridge.clearSnapshot()', async () => {
    const { clearSnapshot } = await import('./widget')
    await expect(clearSnapshot()).resolves.toBeUndefined()
  })
})

describe('requestRefresh', () => {
  beforeEach(() => {
    resetModule()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {}
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
  })

  it('delegates to bridge.requestRefresh()', async () => {
    const { requestRefresh } = await import('./widget')
    await expect(requestRefresh()).resolves.toBeUndefined()
  })
})

describe('widget data writers', () => {
  beforeEach(() => {
    resetModule()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).navigator
  })

  it('delegates electricity, exam and theme writes to the Capacitor widget plugin', async () => {
    const plugin = {
      writeSnapshot: vi.fn().mockResolvedValue(undefined),
      writeElectricity: vi.fn().mockResolvedValue(undefined),
      writeExam: vi.fn().mockResolvedValue(undefined),
      writeThemeColor: vi.fn().mockResolvedValue(undefined),
      clearSnapshot: vi.fn().mockResolvedValue(undefined),
      requestRefresh: vi.fn().mockResolvedValue(undefined),
      getCapabilities: vi.fn().mockResolvedValue({ platform: 'android-appwidget', pinned: true }),
    }

    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36' },
      configurable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { protocol: 'https:', host: 'localhost' },
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => 'android',
          Plugins: {
            MiniHbutWidget: plugin,
          },
        },
      },
      configurable: true,
    })

    const { writeElectricitySnapshot, writeExamSnapshot, writeWidgetThemeColor } = await import('./widget')

    const electricity = { quantity: 8.5, room: '南区 1栋 2层', acQuantity: 18.2, isLow: true }
    const exam = {
      exams: [
        {
          course_name: '高等数学',
          exam_date: '2026-06-01',
          exam_time: '09:00-11:00',
          location: '教一 101',
          seat_no: '12',
        },
      ],
      days_left: 3,
    }

    await writeElectricitySnapshot(electricity)
    await writeExamSnapshot(exam)
    await writeWidgetThemeColor('#2563eb')

    expect(plugin.writeElectricity).toHaveBeenCalledWith({ data: electricity })
    expect(plugin.writeExam).toHaveBeenCalledWith({ data: exam })
    expect(plugin.writeThemeColor).toHaveBeenCalledWith({ color: '#2563eb' })
  })
})
