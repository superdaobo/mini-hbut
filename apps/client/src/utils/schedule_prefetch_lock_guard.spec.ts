/**
 * #750 开学日期驱动学期切换 —— schedule_prefetch 锁保护/锁定契约测试。
 *
 * 回归点（issue #750）：
 * 1. 回跳保护①：现有 auto 锁（如 term-start 的新学期）比探测 picked 更新时，
 *    warmup 不得把学期改回更旧学期（不覆盖 lock、不清 lock、不更新 meta.semester、不弹提示）；
 * 2. 回跳保护②：时间驱动应选学期（targetSemester）比探测 picked 更新（窗口内新学期课表
 *    未发布）时，不把更旧学期写入 lock，保持可重探状态等待发布；
 * 3. 探测命中时间驱动应选学期且有课表 → 以 term-start 锁定（启动路径不误清）；
 * 4. probeSemesterSchedule：无论课表是否发布，meta.start_date 都记录进「学期→开学日」映射；
 * 5. 'term-start' 必须被认定为 auto 锁 reason（isAutoScheduleLockReason）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// hoisted 容器：按 fetchWithCache key 分发响应
const responders = vi.hoisted(() => new Map<string, () => unknown>())

vi.mock('./api.js', () => ({
  fetchWithCache: vi.fn(async (key: string) => {
    const responder = responders.get(key)
    if (!responder) throw new Error(`unexpected fetchWithCache key: ${key}`)
    return { data: responder(), fromCache: false, timestamp: Date.now() }
  }),
  getCacheKey: (key: string) => `zc:${key}`,
  setCachedData: vi.fn()
}))

vi.mock('./widget_bridge', () => ({
  afterScheduleRefresh: vi.fn(async () => {})
}))

vi.mock('./debug_logger', () => ({
  pushDebugLog: vi.fn()
}))

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

// node 环境无 localStorage：内存实现
const store = new Map<string, string>()
const localStorageStub = {
  getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
  removeItem: (key: string) => {
    store.delete(key)
  },
  clear: () => store.clear()
}
vi.stubGlobal('localStorage', localStorageStub)

import {
  clearScheduleLock,
  isAutoScheduleLockReason,
  probeSemesterSchedule,
  readScheduleLock,
  readScheduleLockDetail,
  readSemesterStartDates,
  recordSemesterStartDate,
  warmupScheduleForStudent
} from './schedule_prefetch.js'

const SID = 'S1'
const OLD_SEM = '2025-2026-2'
const NEW_SEM = '2026-2027-1'
const OLD_START = '2026-03-02'
const NEW_START = '2026-08-31'
const SEMESTERS_KEY = 'semesters'
const scheduleKey = (sem: string) => `schedule:${SID}:${sem}`

const semestersPayload = () => ({
  success: true,
  current: OLD_SEM,
  semesters: [NEW_SEM, OLD_SEM]
})

/** 旧学期（已上架，3 门课） */
const oldSemesterPayload = () => ({
  success: true,
  data: [{ name: '课程A' }, { name: '课程B' }, { name: '课程C' }],
  meta: { semester: OLD_SEM, start_date: OLD_START, current_week: 20, total_weeks: 25 }
})

/** 新学期载荷（count 由 courses 参数决定） */
const newSemesterPayload = (courses: number) => ({
  success: true,
  data: Array.from({ length: courses }, (_, i) => ({ name: `新课${i + 1}` })),
  meta: { semester: NEW_SEM, start_date: NEW_START, current_week: 1, total_weeks: 20 }
})

const setLockRecord = (semester: string, reason: string) => {
  store.set('hbu_schedule_lock', JSON.stringify({ student_id: SID, semester, reason, at: Date.now() }))
}

const setStoredMeta = () => {
  store.set(
    'hbu_schedule_meta',
    JSON.stringify({ semester: OLD_SEM, start_date: OLD_START, current_week: 20, total_weeks: 25 })
  )
}

beforeEach(() => {
  store.clear()
  responders.clear()
  responders.set(SEMESTERS_KEY, semestersPayload)
  responders.set(scheduleKey(OLD_SEM), oldSemesterPayload)
  responders.set(scheduleKey(NEW_SEM), () => newSemesterPayload(0))
})

describe('#750 isAutoScheduleLockReason：term-start 语义', () => {
  it('term-start 属于 auto 锁（启动路径不误清）', () => {
    expect(isAutoScheduleLockReason('term-start')).toBe(true)
  })

  it('manual-select 不是 auto 锁', () => {
    expect(isAutoScheduleLockReason('manual-select')).toBe(false)
  })
})

describe('#750 学期开学日映射缓存', () => {
  it('记录与读取（YYYY-MM-DD 校验）', () => {
    expect(recordSemesterStartDate(NEW_SEM, NEW_START)).toBe(true)
    expect(readSemesterStartDates()[NEW_SEM]).toBe(NEW_START)
    expect(recordSemesterStartDate('bad-sem', 'not-a-date')).toBe(false)
    expect(recordSemesterStartDate('', NEW_START)).toBe(false)
  })

  it('读取时过滤非法条目', () => {
    store.set('hbu_semester_start_dates', JSON.stringify({ [NEW_SEM]: NEW_START, bad: 'xx' }))
    const map = readSemesterStartDates()
    expect(map[NEW_SEM]).toBe(NEW_START)
    expect(map.bad).toBeUndefined()
  })
})

describe('#750 warmupScheduleForStudent 回跳保护①', () => {
  it('现有 auto 锁（新学期）比探测 picked 更新 → 不改学期/不清锁/不改 meta', async () => {
    // 现有锁定：时间驱动已锁新学期；新学期课表查询返回 0 门（异常下架场景），picked 落到旧学期
    setLockRecord(NEW_SEM, 'term-start')
    setStoredMeta()

    const result = (await warmupScheduleForStudent(SID, {
      forceProbe: true,
      reason: 'first-enter'
    })) as {
      success?: boolean
      semester?: string
      source?: string
      payload?: unknown
    }

    expect(result?.success).toBe(true)
    expect(result?.semester).toBe(NEW_SEM)
    expect(result?.source).toBe('existing-lock-protected')
    expect(result?.payload).toBeNull()

    // lock 未被覆盖/清除
    expect(readScheduleLock(SID)).toBe(NEW_SEM)
    expect((readScheduleLockDetail(SID) as { reason?: string })?.reason).toBe('term-start')
    // meta.semester 未被探测结果污染
    expect(JSON.parse(store.get('hbu_schedule_meta') || '{}').semester).toBe(OLD_SEM)
    // 探测到的开学日仍入映射（供时间驱动判定）
    expect(readSemesterStartDates()[NEW_SEM]).toBe(NEW_START)
  })
})

describe('#750 warmupScheduleForStudent 回跳保护②', () => {
  it('picked 早于 targetSemester（窗口内新学期未发布）→ 不写 lock，等待发布', async () => {
    setStoredMeta() // 无 lock

    const result = (await warmupScheduleForStudent(SID, {
      forceProbe: true,
      reason: 'first-enter',
      targetSemester: NEW_SEM
    })) as { success?: boolean; semester?: string }

    // picked = 旧学期（新学期 0 门课），照常返回数据用于渲染
    expect(result?.success).toBe(true)
    expect(result?.semester).toBe(OLD_SEM)
    // 但不得把更旧学期写进 lock（保持未锁定，等待新学期发布后的 authoritative 探测）
    expect(readScheduleLock(SID)).toBe('')
    // 新学期开学日已记录（下次启动时间驱动判定可用）
    expect(readSemesterStartDates()[NEW_SEM]).toBe(NEW_START)
  })
})

describe('#750 warmupScheduleForStudent term-start 锁定', () => {
  it('探测命中 targetSemester 且有课表 → 以 term-start 锁定', async () => {
    responders.set(scheduleKey(NEW_SEM), () => newSemesterPayload(5))
    setStoredMeta() // 无 lock

    const result = (await warmupScheduleForStudent(SID, {
      forceProbe: true,
      reason: 'first-enter',
      targetSemester: NEW_SEM
    })) as { success?: boolean; semester?: string }

    expect(result?.semester).toBe(NEW_SEM)
    expect(readScheduleLock(SID)).toBe(NEW_SEM)
    expect((readScheduleLockDetail(SID) as { reason?: string })?.reason).toBe('term-start')
  })
})

describe('#750 probeSemesterSchedule 轻量探测', () => {
  it('未发布学期：记录 start_date 映射且 published=false', async () => {
    const result = (await probeSemesterSchedule(SID, NEW_SEM)) as {
      ok?: boolean
      published?: boolean
      count?: number
      startDate?: string
    }
    expect(result?.ok).toBe(true)
    expect(result?.published).toBe(false)
    expect(result?.count).toBe(0)
    expect(result?.startDate).toBe(NEW_START)
    expect(readSemesterStartDates()[NEW_SEM]).toBe(NEW_START)
  })

  it('已发布学期：published=true 且课数正确', async () => {
    responders.set(scheduleKey(NEW_SEM), () => newSemesterPayload(7))
    const result = (await probeSemesterSchedule(SID, NEW_SEM)) as {
      published?: boolean
      count?: number
    }
    expect(result?.published).toBe(true)
    expect(result?.count).toBe(7)
  })

  it('need_login 时返回 needLogin 标记', async () => {
    responders.set(scheduleKey(NEW_SEM), () => ({ success: false, need_login: true }))
    const result = (await probeSemesterSchedule(SID, NEW_SEM)) as { needLogin?: boolean }
    expect(result?.needLogin).toBe(true)
  })

  it('参数缺失直接返回不可用结果', async () => {
    const result = (await probeSemesterSchedule('', NEW_SEM)) as { ok?: boolean }
    expect(result?.ok).toBe(false)
  })
})

describe('#750 启动清理兜底', () => {
  it('clearScheduleLock 移除锁定记录', () => {
    setLockRecord(NEW_SEM, 'term-start')
    expect(clearScheduleLock(SID)).toBe(true)
    expect(readScheduleLock(SID)).toBe('')
  })
})
