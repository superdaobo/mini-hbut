/**
 * #870 课程管理分类展示回归：三类分组、恢复入口、空态文案。
 *
 * #870 复核结论（2026-09-26）未满足验收项：
 * 1. 「组件测试覆盖分类、恢复、空态」——仓库内没有 ScheduleManageCoursesDialog.spec.ts；
 * 2. 「空态文案」仍为旧语义（“暂未添加自定义课程”），但空态现在只在三类课程
 *    （教务 / 已移除 / 我添加）全空时出现，应改为覆盖全部三类的中性表述。
 *
 * 测试策略：
 * 1. 源码契约——弹窗三类分组 section、各分组操作按钮差异（已移除仅「恢复」，
 *    自定义「编辑/删除」）、空态/加载/错误态渲染条件；
 * 2. 行为级——用 schedule_visibility 域层复刻 useScheduleData.managedCourseGroups
 *    的分组语义（整学期移除 → 教务区消失 + 已移除区出现；按周移除 → 教务区保留
 *    但周次裁剪 + 已移除区标注 removed_weeks），并断言 useScheduleData 分组源码契约；
 * 3. 空态文案——三语字典断言新文案生效且不再复现旧语义。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  filterVisibleOfficialCourses,
  listRemovedOfficialCourses,
  removeOfficialCourseFromSchedule
} from '../../../utils/schedule_visibility'
import { messages } from '../../../utils/app_i18n'

const readDialogSource = () =>
  readFileSync(new URL('./ScheduleManageCoursesDialog.vue', import.meta.url), 'utf8')

const readDataComposableSource = () =>
  readFileSync(new URL('../composables/useScheduleData.ts', import.meta.url), 'utf8')

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

const officialCourse = {
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

describe('ScheduleManageCoursesDialog #870 源码契约：三类分组与操作差异', () => {
  it('必须同时渲染教务 / 已移除 / 自定义三个分组 section', () => {
    const source = readDialogSource()
    expect(source).toMatch(/v-if="group\.officialCourses\?\.length"/)
    expect(source).toMatch(/v-if="group\.removedCourses\?\.length"[\s\S]*manage-course-category removed/)
    expect(source).toMatch(/group\.customCourses \|\| group\.courses \|\| \[\]/)
  })

  it('已移除课程只提供「恢复显示」，不得提供编辑/删除入口', () => {
    const source = readDialogSource()
    const removedSection = source.slice(
      source.indexOf('manage-course-category removed'),
      source.indexOf('v-if="group.customCourses?.length')
    )
    expect(removedSection).toContain("emit('restore-official-course', course)")
    expect(removedSection).not.toContain('edit-course')
    expect(removedSection).not.toContain('delete-course')
    // 整学期 / 按周两种移除范围都必须在管理卡片上区分标注
    expect(removedSection).toContain("t('schedule.manageCourses.removedScopeWeeks')")
    expect(removedSection).toContain("t('schedule.manageCourses.removedScopeAll')")
  })

  it('自定义课程保留编辑与删除入口', () => {
    const source = readDialogSource()
    const customSection = source.slice(source.indexOf('v-if="group.customCourses?.length'))
    expect(customSection).toContain("emit('edit-course', course)")
    expect(customSection).toContain("emit('delete-course', course)")
  })

  it('空态仅在三类课程全空（managedCourseGroups 为空）时出现，错误态优先于空态', () => {
    const source = readDialogSource()
    const loading = source.indexOf('v-if="loadingManageCourses"')
    const error = source.indexOf('v-else-if="manageCoursesError"')
    const empty = source.indexOf('v-else-if="!managedCourseGroups.length"')
    const groups = source.indexOf('v-else class="manage-course-groups"')
    expect(loading).toBeGreaterThan(-1)
    expect(error).toBeGreaterThan(loading)
    expect(empty).toBeGreaterThan(error)
    expect(groups).toBeGreaterThan(empty)
    expect(source).toContain("t('schedule.manageCourses.empty')")
  })

  it('分组数据源契约：仅整学期移除从教务分组剔除，按周移除保留（周次裁剪）', () => {
    const source = readDataComposableSource()
    // managedCourseGroups 内：isWeekScoped 时不删除 officialMap 条目
    expect(source).toMatch(/if \(!isWeekScoped\) \{\s*group\.officialMap\.delete\(key\)/)
    expect(source).toMatch(/visibility_record:\s*record/)
    expect(source).toMatch(/visibility_scope:\s*isWeekScoped \? 'weeks' : 'all'/)
  })
})

describe('#870 分组语义行为级（域层数据流复刻）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('整学期移除：渲染层（教务区数据源）不再出现，管理层（已移除区数据源）仍列出且 scope=all', () => {
    const record = removeOfficialCourseFromSchedule(studentId, semester, officialCourse, [officialCourse])
    expect(record).not.toBeNull()

    // 教务分组数据源 = buildEffectiveSchedule 的教务部分（已过滤）
    expect(filterVisibleOfficialCourses(studentId, semester, [officialCourse])).toEqual([])
    // 已移除分组数据源 = listRemovedOfficialCourses（跨学期展示，可恢复）
    const removed = listRemovedOfficialCourses(studentId, semester)
    expect(removed).toHaveLength(1)
    expect((removed[0] as any).removed_weeks).toBeUndefined()
    expect(removed[0]!.representative.name).toBe('通信原理')
  })

  it('按周移除：教务区仍出现但周次裁剪，已移除区标注 removed_weeks（scope=weeks）', () => {
    const record = removeOfficialCourseFromSchedule(studentId, semester, officialCourse, [officialCourse], {
      mode: 'current_week',
      currentWeek: 2
    })
    expect(record).not.toBeNull()

    const visible = filterVisibleOfficialCourses(studentId, semester, [officialCourse])
    expect(visible).toEqual([expect.objectContaining({ weeks: [1, 3], weeks_text: '1,3周' })])

    const removed = listRemovedOfficialCourses(studentId, semester)
    expect(removed).toHaveLength(1)
    expect((removed[0] as any).removed_weeks).toEqual([2])
  })
})

describe('#870 空态文案：三语中性表述覆盖三类分组', () => {
  const OLD_EMPTY: Record<string, string> = {
    'zh-CN': '暂未添加自定义课程',
    en: 'No custom courses yet',
    ja: 'カスタム授業はまだありません'
  }

  it('schedule.manageCourses.empty 三语均已替换为中性表述，不再复现旧语义', () => {
    for (const locale of ['zh-CN', 'en', 'ja'] as const) {
      const value = messages[locale]['schedule.manageCourses.empty'] as string | undefined
      expect(value, `${locale} 缺少 schedule.manageCourses.empty`).toBeTruthy()
      expect(value).not.toBe(OLD_EMPTY[locale])
    }
    // 中性表述应描述「课程」整体（覆盖教务/已移除/自定义），而非仅自定义课程
    expect(messages['zh-CN']['schedule.manageCourses.empty']).toContain('课程')
    expect(messages.en['schedule.manageCourses.empty']!.toLowerCase()).toContain('courses')
    expect(messages.ja['schedule.manageCourses.empty']).toContain('コース')
  })

  it('loading 文案同步去除「仅自定义课程」的旧语义', () => {
    expect(messages['zh-CN']['schedule.manageCourses.loading']).toBe('正在加载课程列表...')
    expect(messages.en['schedule.manageCourses.loading']).toBe('Loading courses...')
    expect(messages.ja['schedule.manageCourses.loading']).toBe('コース一覧を読み込んでいます...')
  })
})
