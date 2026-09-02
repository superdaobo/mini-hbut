// src/utils/widget_bridge.spec.ts
// #759：Widget 快照周次重算与「真实周优先」单测
//
// 覆盖：
// 1. tryWriteSnapshotFromCache：跨天触发时用开学锚点重算周次（不再信任前一天缓存的 current_week）
// 2. tryWriteSnapshotFromCache：无锚点时回退 meta.current_week；均缺失时回退 1
// 3. tryWriteSnapshotFromCache：snapshot.date/weekday 始终按当下时间重算
// 4. afterScheduleRefresh：meta.current_week 可用 → 用真实周；缺失 → 退回 selectedWeek

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/platform/capacitor/widget', () => ({
  writeSnapshotWithRetry: vi.fn(async () => {}),
  clearSnapshot: vi.fn(async () => {}),
  writeElectricitySnapshot: vi.fn(async () => {}),
  writeExamSnapshot: vi.fn(async () => {}),
  writeWidgetThemeColor: vi.fn(async () => {}),
  writeThemeMode: vi.fn(async () => {}),
  requestRefresh: vi.fn(async () => {})
}))

vi.mock('@/platform/native', () => ({
  isTauriRuntime: vi.fn(() => false),
  invokeNative: vi.fn(async () => ({}))
}))

vi.mock('./api.js', () => ({
  getCacheKey: (key: string) => `ck:${key}`
}))

vi.mock('./debug_logger', () => ({
  pushDebugLog: vi.fn()
}))

import { afterScheduleRefresh, tryWriteSnapshotFromCache, writeWidgetThemeMode } from './widget_bridge'
import { writeSnapshotWithRetry, writeThemeMode } from '@/platform/capacitor/widget'
import { getCacheKey } from './api.js'

const mockWrite = vi.mocked(writeSnapshotWithRetry)
const mockWriteThemeMode = vi.mocked(writeThemeMode)

// ─── localStorage stub（node 环境无全局 localStorage） ──────────────────────

const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear()
}
vi.stubGlobal('localStorage', stubStorage)

const SID = '2510231106'

/** 写入课表缓存（结构与 schedule_prefetch 写入一致：{ data: { data: [...] } }） */
const seedScheduleCache = (courses: unknown[]) => {
  storageMap.set(getCacheKey(`schedule:${SID}`), JSON.stringify({ data: { data: courses } }))
}

/** 写入课表 meta */
const seedMeta = (meta: Record<string, unknown>) => {
  storageMap.set('hbu_schedule_meta', JSON.stringify(meta))
}

const lastSnapshot = () => {
  const calls = mockWrite.mock.calls
  expect(calls.length, 'writeSnapshotWithRetry 应被调用').toBeGreaterThan(0)
  return calls[calls.length - 1]![0] as { date: string; weekday: number; week_index: number; courses: unknown[] }
}

beforeEach(() => {
  storageMap.clear()
  mockWrite.mockClear()
  mockWriteThemeMode.mockClear()
})

describe('#758 writeWidgetThemeMode 主题模式通路', () => {
  it('通路就绪时把模式透传给 platform 层', async () => {
    await expect(writeWidgetThemeMode('dark')).resolves.toBeUndefined()
    expect(mockWriteThemeMode).toHaveBeenCalledWith('dark')
  })

  it('通路未就绪（原生命令/插件未实现 reject）时静默吞错，不抛出', async () => {
    mockWriteThemeMode.mockRejectedValueOnce(new Error('unimplemented'))
    await expect(writeWidgetThemeMode('light')).resolves.toBeUndefined()
    await expect(writeWidgetThemeMode('system')).resolves.toBeUndefined()
  })
})

describe('#759 tryWriteSnapshotFromCache 周次重算', () => {
  it('有 start_date 锚点：周一凌晨跨天触发时用推算周次（而非前一天缓存的 current_week）', async () => {
    // 开学 2026-03-02，meta 缓存的 current_week=5（上周日写入），
    // 现在（真实时钟）推算结果由 mock 时钟决定 → 用真实当前时间即可：
    // 锚点推算只依赖 meta.start_date 与当下，此处断言「结果与锚点推算一致」
    seedMeta({ semester: '2025-2026-2', start_date: '2026-03-02', current_week: 5, total_weeks: 25 })
    seedScheduleCache([])
    await tryWriteSnapshotFromCache(SID)

    const snapshot = lastSnapshot()
    // 锚点推算语义：floor((今天 - 开学日) / 7) + 1（Asia/Shanghai）
    const todayCst = snapshot.date
    const days = Math.floor(
      (Date.parse(`${todayCst}T00:00:00Z`) - Date.parse('2026-03-02T00:00:00Z')) / 86_400_000
    )
    const expected = Math.min(Math.floor(Math.max(days, 0) / 7) + 1, 25)
    expect(snapshot.week_index).toBe(Math.max(expected, 1))
  })

  it('无 start_date：回退 meta.current_week 缓存值', async () => {
    seedMeta({ semester: '2025-2026-2', current_week: 7, total_weeks: 25 })
    seedScheduleCache([])
    await tryWriteSnapshotFromCache(SID)
    expect(lastSnapshot().week_index).toBe(7)
  })

  it('meta 完全缺失：回退第 1 周', async () => {
    seedScheduleCache([])
    await tryWriteSnapshotFromCache(SID)
    expect(lastSnapshot().week_index).toBe(1)
  })

  it('date/weekday 始终按当下时间重算（跨天后不残留昨日日期）', async () => {
    seedMeta({ start_date: '2026-03-02', current_week: 3, total_weeks: 25 })
    seedScheduleCache([])
    await tryWriteSnapshotFromCache(SID)

    const snapshot = lastSnapshot()
    const now = new Date()
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = fmt.formatToParts(now)
    const y = parts.find((p) => p.type === 'year')?.value ?? ''
    const m = parts.find((p) => p.type === 'month')?.value ?? ''
    const d = parts.find((p) => p.type === 'day')?.value ?? ''
    expect(snapshot.date).toBe(`${y}-${m}-${d}`)
    expect(snapshot.weekday).toBeGreaterThanOrEqual(1)
    expect(snapshot.weekday).toBeLessThanOrEqual(7)
  })

  it('无课表缓存时静默返回（不写入、不抛错）', async () => {
    seedMeta({ start_date: '2026-03-02', current_week: 3 })
    await expect(tryWriteSnapshotFromCache(SID)).resolves.toBeUndefined()
    expect(mockWrite).not.toHaveBeenCalled()
  })
})

describe('#759 afterScheduleRefresh 真实周优先', () => {
  it('meta.current_week 可用 → 使用真实周（忽略界面手动选中的 selectedWeek）', async () => {
    seedMeta({ semester: '2025-2026-2', start_date: '2026-03-02', current_week: 3, total_weeks: 25 })
    await afterScheduleRefresh(SID, { data: [] }, { selectedWeek: 7 })
    expect(lastSnapshot().week_index).toBe(3)
  })

  it('meta 缺失 current_week → 退回 selectedWeek', async () => {
    seedMeta({ semester: '2025-2026-2' })
    await afterScheduleRefresh(SID, { data: [] }, { selectedWeek: 7 })
    expect(lastSnapshot().week_index).toBe(7)
  })

  it('payload 缺少 data 数组时不写快照', async () => {
    await afterScheduleRefresh(SID, { foo: 'bar' }, { selectedWeek: 2 })
    expect(mockWrite).not.toHaveBeenCalled()
  })
})
