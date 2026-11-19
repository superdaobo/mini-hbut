/**
 * #1322 useScheduleSemester 组合式函数回归：
 * weekOfToday 随学期 meta 计算；jumpToCurrentWeek 仅在「今天确实落在当前显示学期区间内」时生效，
 * 往期学期 / 未开学 / 已结束 / 无开学日一律不跳转。
 *
 * Node 环境无 localStorage：先 stub globalThis.localStorage
 * （composable 初始化 readStoredSemester 会读、applyMeta 会写，参考 ScheduleCourseDetail.spec.ts 的 stubStorage 写法）。
 */
import { describe, expect, it } from 'vitest'
import { useScheduleSemester } from './useScheduleSemester'

// ============ localStorage stub（必须在 composable 调用前就位） ============
const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear(),
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  get length() {
    return storageMap.size
  }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: stubStorage,
  writable: true,
  configurable: true
})

/** 本地时区日期 → ISO 日期串（YYYY-MM-DD，补零） */
const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 今天 ± n 天的本地日期 */
const shiftDays = (n: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

const makeSemester = () => useScheduleSemester({ isAnyOverlayOpen: () => false })

describe('useScheduleSemester #1322 weekOfToday 门控', () => {
  it('今天落在学期区间内 → weekOfToday > 0（动态构造：开学=今天-63 天，总 20 周）', () => {
    const s = makeSemester()
    const startDate = isoOf(shiftDays(-63))
    s.applyMeta(
      { start_date: startDate, total_weeks: 20, current_week: 5 },
      '2026-2027-1'
    )
    // 今天 = 第 64 天 → 第 10 教学周
    expect(s.weekOfToday.value).toBe(10)
  })

  it('往期学期（2019 年开学，今天必然在区间外）→ weekOfToday === 0，但 currentWeek 语义不变', () => {
    const s = makeSemester()
    s.applyMeta(
      { start_date: '2019-02-18', total_weeks: 20, current_week: 3 },
      '2018-2019-2'
    )
    expect(s.weekOfToday.value).toBe(0)
    // currentWeek 仍取后端 meta 的 current_week（首屏快照/桌面小组件依赖，语义不变）
    expect(s.currentWeek.value).toBe(3)
    expect(s.selectedWeek.value).toBe(3)
  })

  it('缺少开学日 → weekOfToday === 0', () => {
    const s = makeSemester()
    s.applyMeta(
      { start_date: '', total_weeks: 20, current_week: 4 },
      '2025-2026-1'
    )
    expect(s.weekOfToday.value).toBe(0)
  })

  it('jumpToCurrentWeek：weekOfToday === 0 时 selectedWeek 不变（往期学期）', () => {
    const s = makeSemester()
    s.applyMeta(
      { start_date: '2019-02-18', total_weeks: 20, current_week: 3 },
      '2018-2019-2'
    )
    // 模拟用户翻到第 1 周后点击「回到当前周」
    s.selectedWeek.value = 1
    s.jumpToCurrentWeek()
    expect(s.weekOfToday.value).toBe(0)
    expect(s.selectedWeek.value).toBe(1)
  })

  it('jumpToCurrentWeek：weekOfToday > 0 时 selectedWeek === currentWeek（学期内）', () => {
    const s = makeSemester()
    const startDate = isoOf(shiftDays(-63))
    s.applyMeta(
      { start_date: startDate, total_weeks: 20, current_week: 5 },
      '2026-2027-1'
    )
    expect(s.weekOfToday.value).toBe(10)
    // 模拟用户翻到第 1 周后点击「回到当前周」
    s.selectedWeek.value = 1
    s.jumpToCurrentWeek()
    expect(s.selectedWeek.value).toBe(5)
    expect(s.selectedWeek.value).toBe(s.currentWeek.value)
    // 前进方向：当前周(5) >= 选中周(1) → week-slide-left
    expect(s.weekTransitionName.value).toBe('week-slide-left')
  })
})
