/**
 * #873 合并管线行为级回归：可见性偏好与 useScheduleData 合并链路的集成。
 *
 * #873 复核结论（2026-09-26）缺口 1：「刷新教务数据不复活、离线快照不闪回、
 * 整门多时段在真实合并链路中消失/恢复」此前只有域单测（schedule_visibility.spec.ts）
 * 与源码字符串断言（schedule_offline_banner_contract.spec.ts），缺少行为级回归。
 *
 * 被测对象：
 * - mergeScheduleSources：导出的合并入口（remote + custom → buildEffectiveSchedule →
 *   processScheduleData），课表页所有数据路径（在线刷新 / 离线快照 / 学期切换）最终
 *   都收敛到它；
 * - applyScheduleRenderSnapshot 的源码契约：秒开快照必须经 mergeCurrentScheduleSources
 *   从原始教务 + 自定义课程重算，禁止直接信任 merged_schedule_data 渲染缓存（防闪回）；
 * - 云同步跨模块联动：replaceScheduleVisibilityFromCloud 应用后，重合并结果同步变化。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { mergeScheduleSources } from './useScheduleData'
import {
  removeOfficialCourseFromSchedule,
  replaceScheduleVisibilityFromCloud,
  restoreOfficialCourseToSchedule
} from '../../../utils/schedule_visibility'

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

/** 同一门「通信原理（通信2501-教学班）」的两个时段 + 同名不同教学班 + 自定义课程 */
const officialA = {
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
  semester
}
const officialB = { ...officialA, id: 'slot-b', weekday: 4, period: 3 }
const otherClass = { ...officialA, id: 'slot-c', class_name: '通信2502-教学班', weekday: 5, period: 1 }
const customCourse = {
  id: 'custom:1',
  source_id: '1',
  name: '自定义课程',
  teacher: '',
  class_name: '',
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

/** 构造合并管线 state（ref 语义只需 { value }） */
const makeState = (remote: any[], custom: any[] = []) => {
  const state = {
    remoteScheduleData: { value: remote },
    customScheduleData: { value: custom },
    scheduleData: { value: [] as any[] }
  }
  return state
}

const visibility = { studentId, semester }

const mergedNames = (state: ReturnType<typeof makeState>) =>
  state.scheduleData.value.map((course: any) => `${course.name}#${course.id || course.source_id || ''}`)

describe('#873 合并管线行为级：整门多时段移除/恢复与刷新不复活', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('整门移除后所有时段立即消失，重新合并（刷新教务数据/重载自定义）不复活', () => {
    const state = makeState([officialA, officialB, otherClass], [customCourse])
    mergeScheduleSources(state, visibility)
    expect(mergedNames(state)).toEqual([
      '通信原理#slot-a',
      '通信原理#slot-b',
      '通信原理#slot-c',
      '自定义课程#custom:1'
    ])

    const record = removeOfficialCourseFromSchedule(studentId, semester, officialA, [officialA, officialB, otherClass])
    expect(record).not.toBeNull()

    mergeScheduleSources(state, visibility)
    expect(mergedNames(state)).toEqual(['通信原理#slot-c', '自定义课程#custom:1'])

    // 模拟「重新刷新教务数据」（同一份 remote 原始数据再次进入合并管线）
    mergeScheduleSources(state, visibility)
    // 模拟「自定义课程重新加载」后再合并
    mergeScheduleSources(state, visibility)
    expect(mergedNames(state)).toEqual(['通信原理#slot-c', '自定义课程#custom:1'])
  })

  it('恢复后课程重新出现在合并结果中', () => {
    const state = makeState([officialA, otherClass], [])
    const record = removeOfficialCourseFromSchedule(studentId, semester, officialA, [officialA])
    expect(record).not.toBeNull()
    mergeScheduleSources(state, visibility)
    expect(mergedNames(state)).toEqual(['通信原理#slot-c'])

    expect(restoreOfficialCourseToSchedule(studentId, semester, record!)).toBe(true)
    mergeScheduleSources(state, visibility)
    expect(mergedNames(state)).toEqual(['通信原理#slot-a', '通信原理#slot-c'])
  })

  it('按周移除：合并结果中该课程保留但周次被裁剪', () => {
    const state = makeState([{ ...officialA, weeks: [1, 2, 3], weeks_text: '1-3周' }], [])
    const record = removeOfficialCourseFromSchedule(studentId, semester, officialA, [officialA], {
      mode: 'current_week',
      currentWeek: 2
    })
    expect(record).not.toBeNull()

    mergeScheduleSources(state, visibility)
    expect(state.scheduleData.value).toEqual([
      expect.objectContaining({ id: 'slot-a', weeks: [1, 3], weeks_text: '1,3周' })
    ])
  })

  it('学期切换：可见性按学期严格隔离，切换学期后不误隐藏', () => {
    const state = makeState([officialA], [])
    removeOfficialCourseFromSchedule(studentId, semester, officialA, [officialA])
    mergeScheduleSources(state, visibility)
    expect(state.scheduleData.value).toEqual([])

    // 切换到另一个学期：同一门课程不应被隐藏
    mergeScheduleSources(state, { studentId, semester: '2025-2026-2' })
    expect(state.scheduleData.value).toEqual([expect.objectContaining({ id: 'slot-a' })])
  })

  it('云同步跨模块联动：显式空清空后重合并复原；malformed 拒绝后重合并仍隐藏', () => {
    const state = makeState([officialA, otherClass], [])
    removeOfficialCourseFromSchedule(studentId, semester, officialA, [officialA, otherClass])
    mergeScheduleSources(state, visibility)
    expect(state.scheduleData.value).toEqual([expect.objectContaining({ id: 'slot-c' })])

    // malformed 云快照被拒绝，合并结果保持隐藏
    expect(replaceScheduleVisibilityFromCloud(studentId, { broken: true })).toBe(false)
    mergeScheduleSources(state, visibility)
    expect(state.scheduleData.value).toEqual([expect.objectContaining({ id: 'slot-c' })])

    // 新客户端显式空快照 = 完整替换，重合并后复原
    expect(replaceScheduleVisibilityFromCloud(studentId, {
      version: 2,
      updated_at: Date.now(),
      by_semester: {},
      by_semester_weeks: {}
    })).toBe(true)
    mergeScheduleSources(state, visibility)
    expect(state.scheduleData.value.map((course: any) => course.id)).toEqual(['slot-a', 'slot-c'])
  })

  it('源码契约：秒开快照必须经 mergeCurrentScheduleSources 重算（离线快照不闪回）', () => {
    // applyScheduleRenderSnapshot 的注释明确「merged_schedule_data 是渲染缓存，可能早于
    // 用户最近一次移除操作；始终从原始教务 + 自定义课程重算有效课表」。此处守护该
    // 行为不被回退为直接消费 merged_schedule_data。
    const source = readFileSync(new URL('./useScheduleData.ts', import.meta.url), 'utf8')
    const snapshotFn = source.slice(
      source.indexOf('const applyScheduleRenderSnapshot'),
      source.indexOf('/** 应用接口载荷')
    )
    expect(snapshotFn).toContain('mergeCurrentScheduleSources()')
    // merged_schedule_data 只允许出现在载荷构建（buildScheduleRenderSnapshotPayload）里，
    // 不允许在快照应用路径中被直接赋值给 scheduleData
    expect(snapshotFn).not.toMatch(/scheduleData\.value\s*=\s*.*merged_schedule_data/)
  })
})
