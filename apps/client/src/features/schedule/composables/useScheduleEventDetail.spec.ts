/**
 * #838 个人日程详情 composable 测试（useScheduleEventDetail）。
 *
 * 测试策略（node 环境无 DOM / 无 @vue/test-utils）：
 * - 删除链路用**真实** useScheduleEvents + mock axios 跑通，验证「确认框只弹一次、
 *   只删明确 event id、失败不关闭详情」等端到端行为；
 * - 冲突链路用 spy 断言 `events.conflictsOf` 的调用参数（含 excludeEventId），
 *   并用源码契约门闩防止自建第二套重叠算法；
 * - 切周 stale 清理用响应式复刻验证。
 */
import { computed, nextTick, reactive, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScheduleEventDetail } from './useScheduleEventDetail'
import { useScheduleEvents } from './useScheduleEvents'
import { useConfirmDialog } from './useConfirmDialog'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))
vi.mock('axios', () => ({ default: { post: postMock } }))

const readSource = () => readFileSync(new URL('./useScheduleEventDetail.ts', import.meta.url), 'utf8')

const STUDENT_ID = '2510231106'
const TEST_DATE = '2026-09-18'

/** 构造某周的 7 天（iso + isToday），供 useScheduleEvents 的默认日期逻辑使用 */
const buildWeek = (firstIso: string) => {
  const start = new Date(`${firstIso}T00:00:00`)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return { iso, isToday: false }
  })
}

/** 日程领域对象（camelCase）夹具 */
const eventFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  title: '蓝电技术部开会',
  date: TEST_DATE,
  startTime: '19:00',
  endTime: '21:00',
  location: '电气楼 402',
  note: '带电脑',
  color: '#72b9ff',
  reminderMinutes: 30,
  createdAt: '',
  updatedAt: '',
  ...overrides
})

const makeHarness = (
  options: {
    confirm?: boolean
    weekEvents?: any[]
    courses?: any[]
    eventsPatch?: (events: any) => any
  } = {}
) => {
  const props = reactive({ studentId: STUDENT_ID })
  // 真实确认弹窗实例：askConfirm 换成可控 mock，其余状态与生产一致
  const confirmDialog = useConfirmDialog()
  const askConfirm = vi.fn(async () => options.confirm ?? true)
  confirmDialog.askConfirm = askConfirm

  // 真实 useScheduleEvents（与主 Agent 接线一致：共享同一 confirmDialog 实例）
  const events = useScheduleEvents({
    props,
    semester: { weekDates: computed(() => buildWeek('2026-09-14')) },
    data: { scheduleData: ref(options.courses ?? []) },
    confirmDialog
  } as never)

  const weekEvents = ref<any[]>(options.weekEvents ?? [eventFixture()])
  const weekIsoDates = computed(() => buildWeek('2026-09-14').map((day) => day.iso))
  const refreshWeekEvents = vi.fn(async () => {})
  const eventData = {
    weekEvents,
    weekIsoDates,
    loadingWeekEvents: ref(false),
    getEventsForDay: () => [],
    findEventById: (id: string) => weekEvents.value.find((item) => item.id === id) ?? null,
    refreshWeekEvents
  }

  const onEdit = vi.fn()
  const detail = useScheduleEventDetail({
    props,
    eventData: eventData as never,
    events: (options.eventsPatch ? options.eventsPatch(events) : events) as never,
    confirmDialog,
    getWeekCourses: () => options.courses ?? [],
    onEdit
  })

  return { detail, events, eventData, weekEvents, props, askConfirm, onEdit, refreshWeekEvents }
}

beforeEach(() => {
  postMock.mockReset()
})

describe('useScheduleEventDetail 源码契约', () => {
  it('冲突必须复用 events.conflictsOf，不得自建第二套重叠算法', () => {
    const source = readSource()
    expect(source).toContain('events.conflictsOf(')
    expect(source).toContain('excludeEventId: event.id')
    // 自建算法会写成 aStart < bEnd && bStart < aEnd 这类比较，禁止出现
    expect(source).not.toMatch(/aStart\s*<\s*bEnd/)
    // 也不得绕开 conflictsOf 直接引几何层自行判定
    expect(source).not.toContain("from '../utils/timeGeometry'")
  })

  it('删除只作用于个人日程 id：调用 events.deleteEvent，且不触碰课程删除接口', () => {
    const source = readSource()
    expect(source).toContain('events.deleteEvent(event.id)')
    expect(source).not.toContain('/v2/schedule/custom/')
    expect(source).not.toContain('deleteCustomCourseRecord')
  })
})

describe('openEventDetail 归一与拒绝', () => {
  it('snake_case payload 归一后打开，并把 camelCase 领域对象落到 selectedEvent', () => {
    const { detail } = makeHarness()
    const ok = detail.openEventDetail({
      id: 'evt-9',
      title: '组会',
      date: TEST_DATE,
      start_time: '19:00',
      end_time: '21:00',
      reminder_minutes: 30
    })

    expect(ok).toBe(true)
    expect(detail.showEventDetail.value).toBe(true)
    expect(detail.selectedEvent.value).toMatchObject({
      id: 'evt-9',
      title: '组会',
      date: TEST_DATE,
      startTime: '19:00',
      endTime: '21:00',
      reminderMinutes: 30
    })
    expect(detail.detailError.value).toBe('')
  })

  it('camelCase 领域对象同样可打开（Grid 可能直接传领域对象）', () => {
    const { detail } = makeHarness()
    expect(detail.openEventDetail(eventFixture())).toBe(true)
    expect(detail.selectedEvent.value?.id).toBe('evt-1')
  })

  it('非法原始对象（缺 id / 非法日期 / 时间倒置 / 非对象）一律不打开', () => {
    const { detail } = makeHarness()

    expect(detail.openEventDetail(null)).toBe(false)
    expect(detail.openEventDetail('nope')).toBe(false)
    expect(detail.openEventDetail({ title: 'x', date: TEST_DATE, start_time: '19:00', end_time: '21:00' })).toBe(false)
    expect(
      detail.openEventDetail({ id: 'e', date: '2026-02-30', start_time: '19:00', end_time: '21:00' })
    ).toBe(false)
    expect(
      detail.openEventDetail({ id: 'e', date: TEST_DATE, start_time: '21:00', end_time: '19:00' })
    ).toBe(false)

    expect(detail.showEventDetail.value).toBe(false)
    expect(detail.selectedEvent.value).toBeNull()
  })

  it('重新打开会清掉上一次残留的错误', () => {
    const { detail } = makeHarness()
    detail.openEventDetail(eventFixture())
    detail.detailError.value = '上次的失败原因'
    detail.openEventDetail(eventFixture({ id: 'evt-2' }))
    expect(detail.detailError.value).toBe('')
  })
})

describe('detailConflicts 复用 events.conflictsOf', () => {
  it('无选中日程 → 空数组，且不调用冲突计算', () => {
    const spy = vi.fn((_draft?: any, _context?: any) => [])
    const { detail } = makeHarness({ eventsPatch: (events) => ({ ...events, conflictsOf: spy }) })
    expect(detail.detailConflicts.value).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('调用参数含 excludeEventId（自己不算自己的冲突）与当前周课程 / 日程', () => {
    const spy = vi.fn((_draft?: any, _context?: any) => [
      { label: '组会', startMinute: 1140, endMinute: 1260 }
    ])
    const courses = [{ name: '通信原理', weekday: 5, period: 11, djs: 2 }]
    const others = [eventFixture({ id: 'evt-other', title: '组会' })]
    const { detail } = makeHarness({
      courses,
      weekEvents: [eventFixture(), ...others],
      eventsPatch: (events) => ({ ...events, conflictsOf: spy })
    })

    detail.openEventDetail(eventFixture())
    expect(detail.detailConflicts.value).toEqual([{ label: '组会', startMinute: 1140, endMinute: 1260 }])

    expect(spy).toHaveBeenCalled()
    const [draft, context] = spy.mock.calls[0] ?? []
    expect(draft).toMatchObject({
      title: '蓝电技术部开会',
      date: TEST_DATE,
      startTime: '19:00',
      endTime: '21:00'
    })
    expect(context?.excludeEventId).toBe('evt-1')
    expect(context?.courses).toEqual(courses)
    expect(context?.events).toEqual([eventFixture(), ...others])
  })

  it('真实 conflictsOf：同日期重叠日程算冲突，自身被排除', () => {
    const { detail } = makeHarness({
      weekEvents: [eventFixture(), eventFixture({ id: 'evt-2', title: '组会', startTime: '20:00', endTime: '21:30' })]
    })

    detail.openEventDetail(eventFixture())
    // 自身（19:00-21:00）不得出现在自己的冲突里
    expect(detail.detailConflicts.value).toEqual([
      { label: '组会', startMinute: 20 * 60, endMinute: 21 * 60 + 30 }
    ])
  })
})

describe('requestEditEvent 编辑交接', () => {
  it('回填草稿 + 进入编辑态 + 关闭详情 + 触发 onEdit 回调', () => {
    const { detail, events, onEdit } = makeHarness()
    detail.openEventDetail(eventFixture())

    expect(detail.requestEditEvent()).toBe(true)
    expect(events.editingEventId.value).toBe('evt-1')
    expect(events.eventDraft.value).toMatchObject({
      title: '蓝电技术部开会',
      date: TEST_DATE,
      startTime: '19:00',
      endTime: '21:00',
      location: '电气楼 402',
      note: '带电脑',
      reminderMinutes: 30
    })
    expect(detail.showEventDetail.value).toBe(false)
    expect(detail.selectedEvent.value).toBeNull()
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0][0]).toMatchObject({ id: 'evt-1' })
  })

  it('无选中日程 → 返回 false，不触发回调', () => {
    const { detail, onEdit } = makeHarness()
    expect(detail.requestEditEvent()).toBe(false)
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('requestDeleteEvent 删除编排', () => {
  it('确认框取消 → 不删除、详情保留、不报错', async () => {
    const { detail, askConfirm, refreshWeekEvents } = makeHarness({ confirm: false })
    detail.openEventDetail(eventFixture())

    await expect(detail.requestDeleteEvent()).resolves.toBe(false)
    expect(askConfirm).toHaveBeenCalledTimes(1)
    expect(postMock).not.toHaveBeenCalled()
    expect(detail.showEventDetail.value).toBe(true)
    expect(detail.selectedEvent.value?.id).toBe('evt-1')
    expect(detail.detailError.value).toBe('')
    expect(refreshWeekEvents).not.toHaveBeenCalled()
  })

  it('确认 → 只删该 event id，成功才关闭详情并刷新当前周', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: {} } })
    const { detail, refreshWeekEvents } = makeHarness()
    detail.openEventDetail(eventFixture())

    await expect(detail.requestDeleteEvent()).resolves.toBe(true)
    expect(postMock).toHaveBeenCalledWith(expect.stringContaining('/v2/schedule/event/delete'), {
      student_id: STUDENT_ID,
      event_id: 'evt-1'
    })
    expect(detail.showEventDetail.value).toBe(false)
    expect(detail.selectedEvent.value).toBeNull()
    expect(detail.detailError.value).toBe('')
    expect(refreshWeekEvents).toHaveBeenCalledTimes(1)
  })

  it('确认框只弹一次（不得与 events.deleteEvent 的确认重复）', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: {} } })
    const { detail, askConfirm } = makeHarness()
    detail.openEventDetail(eventFixture())

    await detail.requestDeleteEvent()
    expect(askConfirm).toHaveBeenCalledTimes(1)
  })

  it('删除失败（后端 success=false）→ 详情保留 + detailError 有值 + 不关闭、不刷新', async () => {
    postMock.mockResolvedValue({ data: { success: false, error: '日程不存在' } })
    const { detail, refreshWeekEvents } = makeHarness()
    detail.openEventDetail(eventFixture())

    await expect(detail.requestDeleteEvent()).resolves.toBe(false)
    expect(detail.showEventDetail.value).toBe(true)
    expect(detail.selectedEvent.value?.id).toBe('evt-1')
    expect(detail.detailError.value).toBe('日程不存在')
    expect(refreshWeekEvents).not.toHaveBeenCalled()
  })

  it('删除失败（网络异常）→ 详情保留 + detailError 有值', async () => {
    postMock.mockRejectedValue(new Error('network down'))
    const { detail } = makeHarness()
    detail.openEventDetail(eventFixture())

    await expect(detail.requestDeleteEvent()).resolves.toBe(false)
    expect(detail.showEventDetail.value).toBe(true)
    expect(detail.detailError.value).toBe('network down')
  })

  it('无选中日程 → 返回 false 且不发请求', async () => {
    const { detail } = makeHarness()
    await expect(detail.requestDeleteEvent()).resolves.toBe(false)
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe('切周 / 切学期 stale 清理', () => {
  it('选中日程不在新周 weekEvents 中 → 自动关闭详情', async () => {
    const { detail, weekEvents } = makeHarness({ weekEvents: [eventFixture()] })
    detail.openEventDetail(eventFixture())
    expect(detail.showEventDetail.value).toBe(true)

    // 模拟切周：新周数据里没有该日程
    weekEvents.value = [eventFixture({ id: 'evt-other', date: '2026-09-25' })]
    await nextTick()

    expect(detail.showEventDetail.value).toBe(false)
    expect(detail.selectedEvent.value).toBeNull()
    expect(detail.detailError.value).toBe('')
  })

  it('选中日程仍在新周 weekEvents 中 → 详情保持打开', async () => {
    const { detail, weekEvents } = makeHarness({ weekEvents: [eventFixture()] })
    detail.openEventDetail(eventFixture())

    weekEvents.value = [eventFixture({ title: '蓝电技术部开会（已更新）' })]
    await nextTick()

    expect(detail.showEventDetail.value).toBe(true)
    expect(detail.selectedEvent.value?.id).toBe('evt-1')
  })

  it('切换学生 → 选中日程不在该学生周数据中时关闭详情', async () => {
    const { detail, props, weekEvents } = makeHarness({ weekEvents: [eventFixture()] })
    detail.openEventDetail(eventFixture())

    weekEvents.value = []
    props.studentId = '2510231199'
    await nextTick()

    expect(detail.showEventDetail.value).toBe(false)
    expect(detail.selectedEvent.value).toBeNull()
  })

  it('无选中日程时周数据变化不会误触发（保持关闭）', async () => {
    const { detail, weekEvents } = makeHarness({ weekEvents: [eventFixture()] })
    weekEvents.value = []
    await nextTick()
    expect(detail.showEventDetail.value).toBe(false)
  })
})

describe('closeEventDetail', () => {
  it('关闭并清空选中与错误', () => {
    const { detail } = makeHarness()
    detail.openEventDetail(eventFixture())
    detail.detailError.value = '残留错误'

    detail.closeEventDetail()
    expect(detail.showEventDetail.value).toBe(false)
    expect(detail.selectedEvent.value).toBeNull()
    expect(detail.detailError.value).toBe('')
  })
})
