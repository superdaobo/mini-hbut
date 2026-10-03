/**
 * #871 出口收口契约 + #873 跨模块一致性回归。
 *
 * #871 复核结论（2026-09-26）列出的三个漏网入口——首页 Dashboard、导出中心
 * ExportCenterView、通知中心 notify_center_checks——已统一接入 schedule_visibility
 * 唯一入口层（Widget widget_bridge、本地提醒 local_reminder_scheduler 此前已接入）。
 * 本文件从两个层面守护：
 *
 * 1. 源码契约：每个「展示/导出/提醒用户课表」的出口都必须消费 schedule_visibility
 *    的统一入口（filterVisibleOfficialCourses / buildEffectiveSchedule），防止回退到
 *    自行拼接原始课程的写法（如 [...remoteCourses, ...customCourses]）；
 * 2. 行为一致：同一份可见性偏好下，「过滤版出口」（filterVisibleOfficialCourses，
 *    导出中心/通知中心/提醒调度）与「合并版出口」（buildEffectiveSchedule，首页/
 *    课表页/Widget）产出的有效课表必须一致——整门移除/恢复、同名不同教学班隔离、
 *    按周移除裁剪、多学期隔离、云同步往返（malformed 拒绝 / 显式空清空）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildEffectiveSchedule,
  filterVisibleOfficialCourses,
  listRemovedOfficialCourses,
  removeOfficialCourseFromSchedule,
  replaceScheduleVisibilityFromCloud,
  restoreOfficialCourseToSchedule
} from './schedule_visibility'
import { buildClassReminderPlan } from './local_reminder_scheduler'

const readSource = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')

// ─── 出口收口源码契约（#871） ────────────────────────────────────────────────

describe('#871 出口收口源码契约', () => {
  it('首页 Dashboard：今日安排与课程搜索必须经 buildEffectiveSchedule 合并', () => {
    const source = readSource('../components/Dashboard.vue')
    expect(source).toContain('buildEffectiveSchedule')
    // 复核结论点名的旧写法：直接拼接原始教务课程，绕过可见性层
    expect(source).not.toMatch(/\[\s*\.\.\.remoteCourses\s*,\s*\.\.\.customCourses\s*\]/)
    // 可见性变化（移除/恢复/云同步替换）后首页即时重算
    expect(source).toContain('SCHEDULE_VISIBILITY_CHANGED_EVENT')
    expect(source).toContain('handleScheduleVisibilityChanged')
  })

  it('导出中心：图片导出/数据导出共用的 fetchScheduleData 必须过滤已移除教务课程', () => {
    const source = readSource('../components/ExportCenterView.vue')
    expect(source).toContain('filterVisibleOfficialCourses')
  })

  it('通知中心课前提醒：checkClassReminder 必须过滤已移除教务课程', () => {
    const source = readSource('./notify_center_checks.ts')
    expect(source).toContain('filterVisibleOfficialCourses')
  })

  it('Widget 快照：afterScheduleRefresh 与 tryWriteSnapshotFromCache 均经 buildEffectiveSchedule', () => {
    const source = readSource('./widget_bridge.ts')
    // 两条写入路径（刷新后写入 / 跨天缓存重写）各消费一次
    expect(source.match(/buildEffectiveSchedule/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('本地提醒调度器：构建课程计划前必须过滤', () => {
    const source = readSource('./local_reminder_scheduler.ts')
    expect(source).toContain('filterVisibleOfficialCourses')
  })

  it('课表页：useScheduleData 合并管线必须经 buildEffectiveSchedule', () => {
    const source = readSource('../features/schedule/composables/useScheduleData.ts')
    expect(source).toContain('buildEffectiveSchedule')
  })
})

// ─── 跨模块一致性（#873：所有出口读同一份有效课表） ─────────────────────────

const studentId = '2025100001'
const semester = '2026-2027-1'

const createStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, String(value)) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }),
    clear: vi.fn(() => data.clear()),
    key: vi.fn((index: number) => [...data.keys()][index] ?? null),
    get length() { return data.size }
  }
}

/** 教务课程工厂：同名课程两个时段 + 同名不同教学班 */
const official = (overrides: Record<string, unknown> = {}) => ({
  id: 'slot-a',
  name: '通信原理',
  teacher: '张老师',
  class_name: '通信2501-教学班',
  credit: '3.0',
  weekday: 2,
  period: 1,
  djs: 2,
  weeks: [1, 2, 3],
  weeks_text: '1-3周',
  room: '一教101',
  ...overrides
})

const buildOfficialCourses = () => [
  official({ id: 'slot-a', weekday: 2, period: 1 }),
  official({ id: 'slot-b', weekday: 4, period: 3 }),
  official({ id: 'slot-c', class_name: '通信2502-教学班', weekday: 5, period: 1 })
]

const custom = {
  id: 'custom:1',
  source_id: '1',
  name: '通信原理',
  teacher: '',
  class_name: '自定义课程',
  credit: '',
  weeks_text: '1周',
  room: '',
  is_custom: true,
  semester,
  weekday: 6,
  period: 1,
  djs: 2,
  weeks: [1]
}

describe('#873 跨模块有效课表一致性（同一份可见性偏好）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('整学期移除：合并版与过滤版产出一致；恢复后一致复原', () => {
    const courses = buildOfficialCourses()
    const record = removeOfficialCourseFromSchedule(studentId, semester, courses[0], courses)
    expect(record).not.toBeNull()

    // 过滤版出口（导出中心 / 通知中心 / 提醒调度）
    expect(filterVisibleOfficialCourses(studentId, semester, courses)).toEqual([courses[2]])
    // 合并版出口（首页 / 课表页 / Widget），且自定义课程不受影响
    expect(buildEffectiveSchedule(studentId, semester, courses, [custom])).toEqual([courses[2], custom])

    expect(restoreOfficialCourseToSchedule(studentId, semester, record!)).toBe(true)
    expect(filterVisibleOfficialCourses(studentId, semester, courses)).toEqual(courses)
    expect(buildEffectiveSchedule(studentId, semester, courses, [custom])).toEqual([...courses, custom])
  })

  it('同名不同教学班隔离与多时段分组在两条出口路径上一致', () => {
    const courses = buildOfficialCourses()
    // 只移除 2501 教学班（多时段整门），2502 同名课程不得被误伤
    removeOfficialCourseFromSchedule(studentId, semester, courses[0], courses)
    const expectedVisible = [courses[2]]

    expect(filterVisibleOfficialCourses(studentId, semester, courses)).toEqual(expectedVisible)
    expect(buildEffectiveSchedule(studentId, semester, courses, [])).toEqual(expectedVisible)
  })

  it('按周移除：两条出口对 weeks 裁剪与 weeks_text 重写一致', () => {
    const course = official({ weeks: [1, 2, 3], weeks_text: '1-3周' })
    const record = removeOfficialCourseFromSchedule(studentId, semester, course, [course], {
      mode: 'current_week',
      currentWeek: 2
    })
    expect(record).not.toBeNull()

    const viaFilter = filterVisibleOfficialCourses(studentId, semester, [course])
    const viaMerge = buildEffectiveSchedule(studentId, semester, [course], [])
    expect(viaFilter).toEqual(viaMerge)
    expect(viaMerge).toEqual([
      expect.objectContaining({ weeks: [1, 3], weeks_text: '1,3周' })
    ])
  })

  it('多学期隔离：导出/首页面向不同学期时均不跨学期误隐藏', () => {
    const course = official()
    removeOfficialCourseFromSchedule(studentId, semester, course, [course])

    expect(filterVisibleOfficialCourses(studentId, '2025-2026-2', [course])).toEqual([course])
    expect(buildEffectiveSchedule(studentId, '2025-2026-2', [course], [])).toEqual([course])
    // 学期不可解析时宁可显示，也不误隐藏（两条路径同规则）
    expect(filterVisibleOfficialCourses(studentId, '', [course])).toEqual([course])
    expect(buildEffectiveSchedule(studentId, '', [course], [custom])).toEqual([course, custom])
  })

  it('云同步显式空清空后所有出口同步复原；malformed 拒绝后所有出口保持隐藏', () => {
    const courses = buildOfficialCourses()
    removeOfficialCourseFromSchedule(studentId, semester, courses[0], courses)
    expect(buildEffectiveSchedule(studentId, semester, courses, [])).toEqual([courses[2]])

    // malformed 云快照：拒绝应用，出口保持隐藏
    expect(replaceScheduleVisibilityFromCloud(studentId, { broken: true })).toBe(false)
    expect(filterVisibleOfficialCourses(studentId, semester, courses)).toEqual([courses[2]])
    expect(buildEffectiveSchedule(studentId, semester, courses, [])).toEqual([courses[2]])

    // 显式空（新客户端完整替换）：所有出口同步复原
    expect(replaceScheduleVisibilityFromCloud(studentId, {
      version: 2,
      updated_at: Date.now(),
      by_semester: {},
      by_semester_weeks: {}
    })).toBe(true)
    expect(filterVisibleOfficialCourses(studentId, semester, courses)).toEqual(courses)
    expect(buildEffectiveSchedule(studentId, semester, courses, [])).toEqual(courses)
  })

  it('移除联动：已移除课程不再进入提醒计划（导出/首页/提醒共用同一过滤结果）', () => {
    // 提醒出口的数据流：reconcile 先 filterVisibleOfficialCourses 再 buildClassReminderPlan。
    // 此处对同一数据流做数据层组合断言（reconcile 平台级行为见
    // local_reminder_scheduler.spec.ts「#871 整学期移除」用例）。
    const now = new Date(2026, 7, 20, 10, 0) // 2026-08-20 周四，第 2 周
    const semesterStart = '2026-08-17'
    const course = official({ weekday: 1, weeks: [2, 3], weeks_text: '2-3周' })

    const planBefore = buildClassReminderPlan({
      studentId,
      semester,
      courses: filterVisibleOfficialCourses(studentId, semester, [course]),
      startDate: semesterStart,
      currentWeek: 2,
      leadMinutes: 30,
      now
    })
    expect(planBefore).toHaveLength(2)

    removeOfficialCourseFromSchedule(studentId, semester, course, [course])
    const planAfter = buildClassReminderPlan({
      studentId,
      semester,
      courses: filterVisibleOfficialCourses(studentId, semester, [course]),
      startDate: semesterStart,
      currentWeek: 2,
      leadMinutes: 30,
      now
    })
    expect(planAfter).toHaveLength(0)

    // 管理层仍能列出该课程（可恢复），渲染/导出/提醒层不再出现
    expect(listRemovedOfficialCourses(studentId, semester)).toHaveLength(1)
  })
})
