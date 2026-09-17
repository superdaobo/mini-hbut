/**
 * #836 个人日程 composable 测试（useScheduleEvents）。
 *
 * 测试策略（与 ScheduleAddCourseDialog.spec.ts 一致：node 环境无 DOM / 无 @vue/test-utils）：
 * - 纯函数与响应式数据流直接单测（validate / reset / populate / conflictsOf / CRUD）；
 * - 冲突判定必须复用 #834 的 intervalsOverlap，用源码契约门闩防止自建第二套算法；
 * - 提交/删除用 axios mock 断言请求路径与 payload 字段，并验证「失败不得制造假成功」。
 */
import { computed, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScheduleEvents, formatMinuteToClock } from './useScheduleEvents'
import { useScheduleEditor } from './useScheduleEditor'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))
vi.mock('axios', () => ({ default: { post: postMock } }))

const readSource = () => readFileSync(new URL('./useScheduleEvents.ts', import.meta.url), 'utf8')

/** 构造某周的 7 天（iso + isToday），用于驱动默认日期选择 */
const buildWeek = (firstIso: string, todayIndex = -1) => {
  const start = new Date(`${firstIso}T00:00:00`)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return { iso, isToday: index === todayIndex }
  })
}

const makeEvents = (
  overrides: {
    weekDates?: Array<{ iso: string; isToday: boolean }>
    courses?: any[]
    studentId?: string
    onChanged?: () => void | Promise<void>
    confirm?: boolean
  } = {}
) => {
  const askConfirm = vi.fn(async () => overrides.confirm ?? true)
  const onChanged = overrides.onChanged ?? vi.fn()
  const options = {
    props: { studentId: overrides.studentId ?? '2510231106' },
    semester: {
      weekDates: computed(() => overrides.weekDates ?? buildWeek('2026-09-14', 4)),
      semester: ref('2026-2027-1'),
      semesterDraft: ref(''),
      semesterWeekOptions: ref(Array.from({ length: 20 }, (_, i) => i + 1)),
      selectedWeek: ref(1)
    },
    data: { scheduleData: ref(overrides.courses ?? []) },
    confirmDialog: { askConfirm },
    onChanged
  }
  return { events: useScheduleEvents(options as never), options, askConfirm, onChanged }
}

/** 固定测试日期 2026-09-18 对应的星期序号（1..7，周日 = 7） */
const TEST_DATE = '2026-09-18'
const TEST_WEEKDAY = (() => {
  const day = new Date(`${TEST_DATE}T00:00:00`).getDay()
  return day === 0 ? 7 : day
})()

beforeEach(() => {
  postMock.mockReset()
})

describe('useScheduleEvents 源码契约（冲突算法唯一真源）', () => {
  it('必须 import #834 的 intervalsOverlap / getCourseRealInterval，不得自建重叠算法', () => {
    const source = readSource()
    expect(source).toContain('intervalsOverlap')
    expect(source).toContain('getCourseRealInterval')
    expect(source).toContain("from '../utils/timeGeometry'")
    // 自建算法会写成 aStart < bEnd && bStart < aEnd 这类比较，禁止出现
    expect(source).not.toMatch(/aStart\s*<\s*bEnd/)
  })

  it('冲突只做提示：不得在提交路径上因冲突而 return false', () => {
    const source = readSource()
    expect(source).not.toMatch(/conflictsOf\([^)]*\)[\s\S]{0,120}return false/)
  })
})

describe('formatMinuteToClock', () => {
  it('分钟 → HH:mm，越界钳制，非法输入返回空串', () => {
    expect(formatMinuteToClock(870)).toBe('14:30')
    expect(formatMinuteToClock(0)).toBe('00:00')
    expect(formatMinuteToClock(1439)).toBe('23:59')
    expect(formatMinuteToClock(2000)).toBe('23:59')
    expect(formatMinuteToClock(-10)).toBe('00:00')
    expect(formatMinuteToClock(Number.NaN)).toBe('')
  })
})

describe('resetEventDraft 默认值与预填', () => {
  it('默认日期取当前选中周内的今天', () => {
    const { events } = makeEvents({ weekDates: buildWeek('2026-09-14', 4) })
    events.resetEventDraft()
    expect(events.eventDraft.value.date).toBe('2026-09-18')
  })

  it('当前周不含今天时取该周第一天', () => {
    const { events } = makeEvents({ weekDates: buildWeek('2026-09-14', -1) })
    events.resetEventDraft()
    expect(events.eventDraft.value.date).toBe('2026-09-14')
  })

  it('默认时间 09:00-10:00，且恒满足 end > start；提醒默认不提醒', () => {
    const { events } = makeEvents()
    events.resetEventDraft()
    expect(events.eventDraft.value.startTime).toBe('09:00')
    expect(events.eventDraft.value.endTime).toBe('10:00')
    expect(events.eventDraft.value.reminderMinutes).toBeNull()
    expect(events.eventDraft.value.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(events.editingEventId.value).toBe('')
  })

  it('预填 date / startTime / endTime（openAddArrangement 场景）', () => {
    const { events } = makeEvents()
    events.resetEventDraft({ date: '2026-10-01', startTime: '14:00', endTime: '15:30' })
    expect(events.eventDraft.value).toMatchObject({
      date: '2026-10-01',
      startTime: '14:00',
      endTime: '15:30'
    })
  })

  it('预填非法日期回退默认周日期，非法/倒置时间仍保证 end > start', () => {
    const { events } = makeEvents({ weekDates: buildWeek('2026-09-14', -1) })
    events.resetEventDraft({ date: '2026-02-30', startTime: '14:00', endTime: '13:00' })
    expect(events.eventDraft.value.date).toBe('2026-09-14')
    expect(events.eventDraft.value.startTime).toBe('14:00')
    expect(events.eventDraft.value.endTime).toBe('15:00')

    events.resetEventDraft({ startTime: '23:59', endTime: '23:00' })
    expect(events.eventDraft.value).toEqual(
      expect.objectContaining({ startTime: '09:00', endTime: '10:00' })
    )
  })

  it('预填非法提醒档位回落「不提醒」', () => {
    const { events } = makeEvents()
    events.resetEventDraft({ reminderMinutes: 7 })
    expect(events.eventDraft.value.reminderMinutes).toBeNull()
    events.resetEventDraft({ reminderMinutes: 30 })
    expect(events.eventDraft.value.reminderMinutes).toBe(30)
  })
})

describe('populateEventDraft 编辑回填', () => {
  it('合法日程回填并进入编辑态', () => {
    const { events } = makeEvents()
    const ok = events.populateEventDraft({
      id: 'evt-9',
      title: '小组会议',
      date: TEST_DATE,
      start_time: '14:30',
      end_time: '15:20',
      reminder_minutes: 10
    })
    expect(ok).toBe(true)
    expect(events.editingEventId.value).toBe('evt-9')
    expect(events.eventDraft.value).toMatchObject({
      title: '小组会议',
      date: TEST_DATE,
      startTime: '14:30',
      endTime: '15:20',
      reminderMinutes: 10
    })
  })

  it('非法日程（缺 id）返回 false 且不污染当前草稿', () => {
    const { events } = makeEvents()
    events.resetEventDraft({ title: '保留我' })
    const ok = events.populateEventDraft({ title: 'x', date: TEST_DATE, start_time: '14:00', end_time: '15:00' })
    expect(ok).toBe(false)
    expect(events.eventDraft.value.title).toBe('保留我')
    expect(events.editingEventId.value).toBe('')
  })
})

describe('validateEventDraft 全部拒绝分支', () => {
  const prepare = (patch: Record<string, unknown>) => {
    const { events } = makeEvents()
    events.resetEventDraft({ date: TEST_DATE, startTime: '14:30', endTime: '15:20' })
    events.eventDraft.value.title = '小组会议'
    Object.assign(events.eventDraft.value, patch)
    return events
  }

  it('通过时返回空串', () => {
    expect(prepare({}).validateEventDraft()).toBe('')
  })

  it('标题为空 → titleRequired', () => {
    expect(prepare({ title: '   ' }).validateEventDraft()).toBe('schedule.event.titleRequired')
  })

  it('日期为空 → dateRequired；日期非法 → dateInvalid', () => {
    expect(prepare({ date: '' }).validateEventDraft()).toBe('schedule.event.dateRequired')
    expect(prepare({ date: '2026-02-30' }).validateEventDraft()).toBe('schedule.event.dateInvalid')
  })

  it('时间缺失 / 非法 → timeInvalid', () => {
    expect(prepare({ startTime: '' }).validateEventDraft()).toBe('schedule.event.timeInvalid')
    expect(prepare({ endTime: '25:00' }).validateEventDraft()).toBe('schedule.event.timeInvalid')
    expect(prepare({ startTime: '8:20' }).validateEventDraft()).toBe('schedule.event.timeInvalid')
  })

  it('end <= start → endBeforeStart', () => {
    expect(prepare({ endTime: '14:30' }).validateEventDraft()).toBe('schedule.event.endBeforeStart')
    expect(prepare({ endTime: '13:00' }).validateEventDraft()).toBe('schedule.event.endBeforeStart')
  })

  it('提醒档位不在允许集合 → reminderInvalid', () => {
    expect(prepare({ reminderMinutes: 7 }).validateEventDraft()).toBe('schedule.event.reminderInvalid')
    expect(prepare({ reminderMinutes: 60 }).validateEventDraft()).toBe('')
  })
})

describe('conflictsOf 复用 #834 intervalsOverlap', () => {
  const draftOf = (startTime: string, endTime: string, date = TEST_DATE) => ({
    title: '小组会议',
    date,
    startTime,
    endTime,
    location: '',
    note: '',
    color: '#72b9ff',
    reminderMinutes: null
  })

  it('与同星期课程重叠 → 命中课程区间（第 5-6 节 = 14:00-15:35）', () => {
    const courses = [{ name: '通信原理', weekday: TEST_WEEKDAY, period: 5, djs: 2 }]
    const { events } = makeEvents({ courses })
    const conflicts = events.conflictsOf(draftOf('14:30', '15:20'))
    expect(conflicts).toEqual([
      { label: '通信原理', startMinute: 14 * 60, endMinute: 15 * 60 + 35 }
    ])
  })

  it('不同星期 / 首尾相接（半开区间）均不算冲突', () => {
    const otherDay = (TEST_WEEKDAY % 7) + 1
    const { events } = makeEvents({ courses: [{ name: '通信原理', weekday: otherDay, period: 5, djs: 2 }] })
    expect(events.conflictsOf(draftOf('14:30', '15:20'))).toEqual([])

    // 第 6 节 14:50-15:35，草稿 15:35-16:30：aEnd === bStart，不算重叠
    const adjacent = makeEvents({ courses: [{ name: '信号与系统', weekday: TEST_WEEKDAY, period: 6, djs: 1 }] })
    expect(adjacent.events.conflictsOf(draftOf('15:35', '16:30'))).toEqual([])
  })

  it('与同日期其他日程重叠 → 命中；不同日期不算', () => {
    const { events } = makeEvents()
    const others = [
      { id: 'evt-a', title: '组会', date: TEST_DATE, startTime: '14:00', endTime: '15:00', location: '', note: '', color: '', reminderMinutes: null, createdAt: '', updatedAt: '' },
      { id: 'evt-b', title: '隔天安排', date: '2026-10-01', startTime: '14:00', endTime: '15:00', location: '', note: '', color: '', reminderMinutes: null, createdAt: '', updatedAt: '' }
    ]
    expect(events.conflictsOf(draftOf('14:30', '15:20'), { events: others })).toEqual([
      { label: '组会', startMinute: 14 * 60, endMinute: 15 * 60 }
    ])
  })

  it('excludeEventId 可排除自身（编辑态不自冲突）', () => {
    const { events } = makeEvents()
    const others = [
      { id: 'evt-a', title: '组会', date: TEST_DATE, startTime: '14:00', endTime: '15:00', location: '', note: '', color: '', reminderMinutes: null, createdAt: '', updatedAt: '' }
    ]
    expect(events.conflictsOf(draftOf('14:30', '15:20'), { events: others, excludeEventId: 'evt-a' })).toEqual([])
  })

  it('课程与日程冲突按开始时间升序返回', () => {
    const courses = [{ name: '通信原理', weekday: TEST_WEEKDAY, period: 5, djs: 2 }]
    const { events } = makeEvents({ courses })
    // 组会 13:55 早于课程 14:00 开始 → 排序后应排在课程之前
    const others = [
      { id: 'evt-a', title: '组会', date: TEST_DATE, startTime: '13:55', endTime: '14:10', location: '', note: '', color: '', reminderMinutes: null, createdAt: '', updatedAt: '' }
    ]
    const conflicts = events.conflictsOf(draftOf('13:50', '16:00'), { events: others })
    expect(conflicts.map((item) => item.label)).toEqual(['组会', '通信原理'])
  })

  it('草稿日期 / 时间非法 → 空数组（安全失败）', () => {
    const { events } = makeEvents({ courses: [{ name: 'x', weekday: TEST_WEEKDAY, period: 5, djs: 2 }] })
    expect(events.conflictsOf(draftOf('14:30', '15:20', '2026-02-30'))).toEqual([])
    expect(events.conflictsOf(draftOf('15:20', '14:30'))).toEqual([])
  })
})

describe('submitEvent / deleteEvent', () => {
  it('创建成功：POST /v2/schedule/event/add，payload 为 snake_case，并回调刷新', async () => {
    const onChanged = vi.fn()
    postMock.mockResolvedValue({ data: { success: true, data: { id: 'evt-1' } } })
    const { events } = makeEvents({ onChanged })
    events.resetEventDraft({ date: TEST_DATE, startTime: '14:30', endTime: '15:20', title: '小组会议' })
    events.eventDraft.value.title = '小组会议'
    events.eventDraft.value.reminderMinutes = 10

    await expect(events.submitEvent()).resolves.toBe(true)
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, payload] = postMock.mock.calls[0]
    expect(url).toContain('/v2/schedule/event/add')
    expect(url).not.toContain('/update')
    expect(payload).toMatchObject({
      student_id: '2510231106',
      title: '小组会议',
      date: TEST_DATE,
      start_time: '14:30',
      end_time: '15:20',
      reminder_minutes: 10
    })
    expect(payload).not.toHaveProperty('event_id')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(events.eventError.value).toBe('')
    expect(events.savingEvent.value).toBe(false)
  })

  it('校验失败：不发请求、不回调，错误文案透出', async () => {
    const onChanged = vi.fn()
    const { events } = makeEvents({ onChanged })
    events.resetEventDraft({ date: TEST_DATE })
    events.eventDraft.value.title = ''

    await expect(events.submitEvent()).resolves.toBe(false)
    expect(postMock).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(events.eventError.value).toBe('日程标题不能为空')
  })

  it('缺学号：不发请求，错误文案透出', async () => {
    const { events } = makeEvents({ studentId: '' })
    events.resetEventDraft({ date: TEST_DATE, title: '小组会议' })
    await expect(events.submitEvent()).resolves.toBe(false)
    expect(postMock).not.toHaveBeenCalled()
    expect(events.eventError.value).toBe('缺少学号信息，无法保存日程')
  })

  it('后端 success=false：返回 false、透出后端 error、绝不制造假成功', async () => {
    const onChanged = vi.fn()
    postMock.mockResolvedValue({ data: { success: false, error: '日期不合法' } })
    const { events } = makeEvents({ onChanged })
    events.resetEventDraft({ date: TEST_DATE, title: '小组会议' })

    await expect(events.submitEvent()).resolves.toBe(false)
    expect(events.eventError.value).toBe('日期不合法')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('请求异常：返回 false 且 error 透出', async () => {
    postMock.mockRejectedValue(new Error('network down'))
    const { events } = makeEvents()
    events.resetEventDraft({ date: TEST_DATE, title: '小组会议' })

    await expect(events.submitEvent()).resolves.toBe(false)
    expect(events.eventError.value).toBe('network down')
  })

  it('编辑态：走 update 并带上 event_id', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: {} } })
    const { events } = makeEvents()
    events.populateEventDraft({
      id: 'evt-9',
      title: '小组会议',
      date: TEST_DATE,
      start_time: '14:30',
      end_time: '15:20'
    })

    await expect(events.submitEvent()).resolves.toBe(true)
    const [url, payload] = postMock.mock.calls[0]
    expect(url).toContain('/v2/schedule/event/update')
    expect(payload).toMatchObject({ student_id: '2510231106', event_id: 'evt-9' })
    expect(events.editingEventId.value).toBe('')
  })

  it('删除：确认后 POST /v2/schedule/event/delete 并回调刷新', async () => {
    const onChanged = vi.fn()
    postMock.mockResolvedValue({ data: { success: true, data: {} } })
    const { events, askConfirm } = makeEvents({ onChanged })

    await expect(events.deleteEvent('evt-9')).resolves.toBe(true)
    expect(askConfirm).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(expect.stringContaining('/v2/schedule/event/delete'), {
      student_id: '2510231106',
      event_id: 'evt-9'
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(events.deletingEvent.value).toBe(false)
  })

  it('删除取消：不发请求', async () => {
    const { events } = makeEvents({ confirm: false })
    await expect(events.deleteEvent('evt-9')).resolves.toBe(false)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('删除失败：返回 false 且 error 透出', async () => {
    postMock.mockResolvedValue({ data: { success: false, error: '日程不存在' } })
    const { events } = makeEvents()
    await expect(events.deleteEvent('evt-9')).resolves.toBe(false)
    expect(events.eventError.value).toBe('日程不存在')
  })
})

describe('课程草稿与日程草稿互不覆盖（统一创建器「切 Tab 不丢内容」）', () => {
  const makeEditorOptions = () => ({
    props: { studentId: '2510231106' },
    data: {
      errorMsg: ref(''),
      semesterError: ref(''),
      loadingManageCourses: ref(false),
      manageCoursesError: ref(''),
      manageExpandedSemesters: ref<Record<string, boolean>>({}),
      loadCustomCourses: vi.fn(async () => {}),
      loadAllCustomCourses: vi.fn(async () => {}),
      mergeScheduleSources: vi.fn()
    },
    semester: {
      semester: ref('2026-2027-1'),
      semesterDraft: ref(''),
      semesterWeekOptions: ref(Array.from({ length: 20 }, (_, i) => i + 1)),
      selectedWeek: ref(1)
    },
    detail: {
      showDetail: ref(false),
      selectedCourse: ref(null),
      detailActionError: ref(''),
      syncSelectedCustomCourse: vi.fn()
    },
    menu: { showMenu: ref(false) },
    confirmDialog: { askConfirm: vi.fn(async () => true) }
  })

  it('重置日程草稿不影响已填写的课程草稿，反之亦然', () => {
    const { events } = makeEvents()
    const editor = useScheduleEditor(makeEditorOptions() as never)

    // 课程 Tab 填一半
    editor.resetAddCourseForm()
    editor.addCourseForm.value.name = '高等数学'
    editor.addCourseForm.value.weekday = 2

    // 切到日程 Tab 并重置日程草稿
    events.resetEventDraft({ date: TEST_DATE, startTime: '14:00', endTime: '15:00' })
    expect(editor.addCourseForm.value.name).toBe('高等数学')
    expect(editor.addCourseForm.value.weekday).toBe(2)

    // 日程 Tab 填一半后切回课程 Tab 并重置课程草稿
    events.eventDraft.value.title = '小组会议'
    editor.resetAddCourseForm()
    expect(events.eventDraft.value.title).toBe('小组会议')
    expect(events.eventDraft.value.startTime).toBe('14:00')
    expect(editor.addCourseForm.value.name).toBe('')
  })
})
