/**
 * #869 教务课程详情「移除/恢复」交互回归 + 暗色模式可读性断言。
 *
 * #869 复核结论（2026-09-26）未满足验收项：
 * 1. 「组件与交互回归测试覆盖」——仓库内没有 ScheduleCourseDetail.spec.ts，现有
 *    ScheduleEventDetail.spec.ts 只断言事件详情不引用课程详情组件；
 * 2. 「浅色/暗色模式可读」——没有针对新增 .official-remove-btn / .official-remove-hint
 *    的暗色断言。
 *
 * 测试策略（对齐 ScheduleAddCourseDialog.spec.ts 的既有模式）：
 * 1. 源码契约——移除入口（仅移除本周/移除整学期）、emit 参数、当前周禁用绑定、
 *    「不修改教务系统、可在课程管理恢复」提示与暗色配色规则；
 * 2. 行为级——用 useScheduleEditor 复刻「详情弹窗 emit → 编辑器确认 → 数据层写入」
 *    的真实数据流：二次确认参数契约、取消不动数据、确认后关闭详情并触发
 *    Widget 快照与提醒调度的主动重建（#871/#873 联动）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { useScheduleEditor } from '../composables/useScheduleEditor'
import { t } from '../../../utils/app_i18n'
import { tryWriteSnapshotFromCache } from '../../../utils/widget_bridge'
import { reconcileLocalReminders } from '../../../utils/local_reminder_scheduler'

vi.mock('../../../utils/widget_bridge', () => ({
  tryWriteSnapshotFromCache: vi.fn(async () => {})
}))

vi.mock('../../../utils/local_reminder_scheduler', () => ({
  reconcileLocalReminders: vi.fn(async () => ({ scheduled: 0, canceled: 0, kept: 0 }))
}))

const readDetailSource = () =>
  readFileSync(new URL('./ScheduleCourseDetail.vue', import.meta.url), 'utf8')

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
  length: 0
}

// 教务课程（非自定义），两个时段同一门课
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
  semester: '2024-2025-1'
}

const makeEditor = (selectedWeek = 2, selectedCourse: any = officialCourse) => {
  const options = {
    props: { studentId: '2510231106' },
    data: {
      errorMsg: ref(''),
      semesterError: ref(''),
      loadingManageCourses: ref(false),
      manageCoursesError: ref(''),
      manageExpandedSemesters: ref<Record<string, boolean>>({}),
      loadCustomCourses: vi.fn(async () => {}),
      loadAllCustomCourses: vi.fn(async () => {}),
      mergeScheduleSources: vi.fn(),
      removeOfficialCourse: vi.fn(() => true),
      restoreOfficialCourse: vi.fn(() => true)
    },
    semester: {
      semester: ref('2024-2025-1'),
      semesterDraft: ref(''),
      semesterWeekOptions: ref(Array.from({ length: 20 }, (_, i) => i + 1)),
      selectedWeek: ref(selectedWeek)
    },
    detail: {
      showDetail: ref(true),
      selectedCourse: ref(selectedCourse),
      detailActionError: ref(''),
      syncSelectedCustomCourse: vi.fn()
    },
    menu: { showMenu: ref(false) },
    confirmDialog: { askConfirm: vi.fn(async (_input?: unknown) => true) }
  }
  return { editor: useScheduleEditor(options as never), options }
}

beforeEach(() => {
  storageMap.clear()
  ;(globalThis as { localStorage?: Storage }).localStorage = stubStorage as unknown as Storage
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
  vi.clearAllMocks()
})

describe('ScheduleCourseDetail #869 源码契约：移除入口', () => {
  it('教务课程必须同时提供「仅移除本周」与「移除整学期」两个入口', () => {
    const source = readDetailSource()
    expect(source).toContain("emit('remove-official-course', selectedCourse, 'current_week')")
    expect(source).toContain("emit('remove-official-course', selectedCourse, 'all')")
    expect(source).toContain('t(\'schedule.detail.removeOfficialCurrentWeek\')')
    expect(source).toContain('t(\'schedule.detail.removeOfficialAllWeeks\')')
  })

  it('当前周不在课程周次范围内时「仅移除本周」必须禁用', () => {
    const source = readDetailSource()
    // canRemoveCurrentWeek computed：selectedWeek 必须落在 weeks 内
    expect(source).toContain(':disabled="!canRemoveCurrentWeek"')
    expect(source).toMatch(/weeks\.includes\(week\)/)
  })

  it('移除入口必须附带「不修改教务系统、可在课程管理恢复」提示', () => {
    const source = readDetailSource()
    expect(source).toContain("t('schedule.detail.removeOfficialHint')")
    expect(source).toMatch(/<p class="official-remove-hint">/)
  })

  it('自定义课程不得出现教务移除入口（仍走原编辑/删除）', () => {
    const source = readDetailSource()
    // 自定义分支与教务分支互斥：official-course-actions 仅在 v-else 分支
    expect(source).toMatch(/v-if="selectedCourse\?\.is_custom"[\s\S]*custom-course-actions/)
    expect(source).toMatch(/v-else[\s\S]*official-course-actions/)
  })
})

describe('ScheduleCourseDetail #869 暗色模式可读性', () => {
  it('移除按钮与提示文案必须自带 html.dark 配色规则（不依赖全局容器级覆盖）', () => {
    const source = readDetailSource()
    // 橙色系（仅本周）：暗色下背景半透明橙 + 浅橙文字，保持对比可读
    expect(source).toMatch(/html\.dark \.official-remove-btn\.week\s*\{[^}]*color:\s*#fdba74/)
    // 红色系（整学期）：暗色下背景半透明红 + 浅红文字
    expect(source).toMatch(/html\.dark \.official-remove-btn\.all\s*\{[^}]*color:\s*#fca5a5/)
    // 提示文字暗色下使用可读的板岩灰
    expect(source).toMatch(/html\.dark \.official-remove-hint\s*\{[^}]*color:\s*#94a3b8/)
  })
})

describe('#869 移除/恢复交互（useScheduleEditor 行为级）', () => {
  it('移除整学期：二次确认含课程名与「可恢复」提示，确认后写入数据层并关闭详情', async () => {
    const { editor, options } = makeEditor()

    const result = await editor.removeOfficialCourse(officialCourse, 'all')

    expect(result).toBe(true)
    expect(options.confirmDialog.askConfirm).toHaveBeenCalledTimes(1)
    const confirmArgs = options.confirmDialog.askConfirm.mock.calls[0]![0] as unknown as Record<string, unknown>
    expect(confirmArgs.title).toBe(t('schedule.editor.removeOfficialTitle'))
    expect(confirmArgs.danger).toBe(true)
    expect((confirmArgs.lines as string[])[0]).toContain('通信原理')
    expect(confirmArgs.lines).toContain(t('schedule.editor.removeOfficialHint'))

    expect(options.data.removeOfficialCourse).toHaveBeenCalledWith(officialCourse, 'all', 2)
    expect(options.detail.showDetail.value).toBe(false)
    expect(options.detail.selectedCourse.value).toBeNull()
    expect(options.detail.detailActionError.value).toBe('')

    // #871/#873 联动：可见性变化后主动重建 Widget 快照与提醒调度
    expect(vi.mocked(tryWriteSnapshotFromCache)).toHaveBeenCalledWith('2510231106')
    expect(vi.mocked(reconcileLocalReminders)).toHaveBeenCalledWith(expect.objectContaining({
      studentId: '2510231106',
      semesterHint: '2024-2025-1',
      reason: 'schedule-visibility-remove'
    }))
  })

  it('取消二次确认：不写数据层、不关闭详情、不触发下游重建', async () => {
    const { editor, options } = makeEditor()
    options.confirmDialog.askConfirm.mockResolvedValueOnce(false)

    const result = await editor.removeOfficialCourse(officialCourse, 'all')

    expect(result).toBe(false)
    expect(options.data.removeOfficialCourse).not.toHaveBeenCalled()
    expect(options.detail.showDetail.value).toBe(true)
    expect(tryWriteSnapshotFromCache).not.toHaveBeenCalled()
    expect(reconcileLocalReminders).not.toHaveBeenCalled()
  })

  it('仅移除本周：当前周在课程周次内时按 current_week 模式写入', async () => {
    const { editor, options } = makeEditor(2)
    await editor.removeOfficialCourse(officialCourse, 'current_week')

    const confirmArgs = options.confirmDialog.askConfirm.mock.calls[0]![0] as unknown as Record<string, unknown>
    expect(confirmArgs.title).toBe(t('schedule.editor.removeOfficialCurrentWeekTitle'))
    expect(options.data.removeOfficialCourse).toHaveBeenCalledWith(officialCourse, 'current_week', 2)
    expect(vi.mocked(reconcileLocalReminders)).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'schedule-visibility-remove-week'
    }))
  })

  it('仅移除本周：当前周不在课程周次内时直接报错，不弹确认、不写数据', async () => {
    const { editor, options } = makeEditor(9) // 第 9 周不在 weeks [1,2,3]

    const result = await editor.removeOfficialCourse(officialCourse, 'current_week')

    expect(result).toBe(false)
    expect(options.confirmDialog.askConfirm).not.toHaveBeenCalled()
    expect(options.data.removeOfficialCourse).not.toHaveBeenCalled()
    expect(options.detail.detailActionError.value).toBe(t('schedule.editor.removeOfficialWeekUnavailable'))
  })

  it('自定义课程拒绝走教务移除入口', async () => {
    const { editor, options } = makeEditor(2, { ...officialCourse, is_custom: true })

    expect(await editor.removeOfficialCourse({ ...officialCourse, is_custom: true }, 'all')).toBe(false)
    expect(options.confirmDialog.askConfirm).not.toHaveBeenCalled()
    expect(options.data.removeOfficialCourse).not.toHaveBeenCalled()
  })

  it('数据层写入失败：详情保持打开并展示失败文案', async () => {
    const { editor, options } = makeEditor()
    options.data.removeOfficialCourse.mockReturnValueOnce(false)

    const result = await editor.removeOfficialCourse(officialCourse, 'all')

    expect(result).toBe(false)
    expect(options.detail.showDetail.value).toBe(true)
    expect(options.detail.detailActionError.value).toBe(t('schedule.editor.removeOfficialFailed'))
  })

  it('管理页恢复：二次确认（非 danger）后调用数据层恢复并清空错误态', async () => {
    const { editor, options } = makeEditor()
    const record = {
      key: 'code:txyl|class:2501|name:通信原理',
      representative: { ...officialCourse }
    }

    const result = await editor.restoreOfficialCourse(record)

    expect(result).toBe(true)
    expect(options.confirmDialog.askConfirm).toHaveBeenCalledTimes(1)
    const confirmArgs = options.confirmDialog.askConfirm.mock.calls[0]![0] as unknown as Record<string, unknown>
    expect(confirmArgs.title).toBe(t('schedule.editor.restoreOfficialTitle'))
    expect(confirmArgs.danger).toBe(false)
    expect((confirmArgs.lines as string[])[0]).toContain('通信原理')

    expect(options.data.restoreOfficialCourse).toHaveBeenCalledWith(record)
    expect(options.data.manageCoursesError.value).toBe('')
    expect(vi.mocked(reconcileLocalReminders)).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'schedule-visibility-restore'
    }))
  })

  it('管理页恢复：取消确认时不写数据层', async () => {
    const { editor, options } = makeEditor()
    options.confirmDialog.askConfirm.mockResolvedValueOnce(false)

    expect(await editor.restoreOfficialCourse({ representative: officialCourse })).toBe(false)
    expect(options.data.restoreOfficialCourse).not.toHaveBeenCalled()
  })
})
